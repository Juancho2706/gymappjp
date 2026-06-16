import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json, TablesInsert } from '@/lib/database.types'
import type { PaymentsProvider } from '@/lib/payments/types'
import { isUpgradeInFlight } from '@/services/billing/plan-change-lock'

type DB = SupabaseClient<Database>

/**
 * services/billing/change-card — orquesta el cambio de tarjeta IN-PLACE de un coach standalone
 * (Modalidad A, feat/coach-change-card). La ruta /api/payments/change-card es el shell HTTP
 * (auth/flag/rate-limit/workspace/zod/consent); ACÁ viven los guards de negocio + el PUT del
 * provider + el guard Q1 (el swap NO debe mover el ciclo) + la auditoría.
 *
 * `db` SIEMPRE service-role: escribe `coaches.card_*` (columnas service-role-write-only) y
 * `subscription_events` (write revocado a authenticated por la migración 20260612150000).
 *
 * NUNCA loggea el `cardToken` ni el PAN (P0-10): el token solo aparece como hash en la idempotency
 * key; los logs llevan coachId + fechas, jamás datos de tarjeta.
 */

export type ChangeCardInput = {
    coachId: string
    /** card_token de Secure Fields (single-use, 7 días). NUNCA se persiste ni se loggea. */
    cardToken: string
    /** last4/brand/pmid: DISPLAY-ONLY (no gatean nada). Cosméticos validados por Zod en la ruta. */
    last4: string | null
    brand: string | null
    paymentMethodId: string | null
    acceptedTermsVersion: string
    /** Texto íntegro del consentimiento aceptado (evidencia SERNAC) — se persiste en el audit. */
    acceptedTermsText: string
    reactivateUrl: string
}

export type ChangeCardResult =
    | { ok: true; last4: string | null; brand: string | null }
    | { ok: false; code: 'PREAPPROVAL_TERMINAL'; status: number; message: string; reactivateUrl: string }
    | {
          ok: false
          code:
              | 'COACH_NOT_FOUND'
              | 'WRONG_PROVIDER'
              | 'NO_ACTIVE_SUBSCRIPTION'
              | 'UPGRADE_IN_FLIGHT'
              | 'INVALID_STATUS'
              | 'TOKEN_INVALID'
              | 'GATEWAY_ERROR'
              | 'CYCLE_DRIFT'
          status: number
          message: string
          retryable?: boolean
      }

/** Estados terminales: no se puede PUTear un preapproval cancelado/vencido → ruta a reactivate. */
const TERMINAL_STATUSES = new Set(['canceled', 'cancelled', 'expired'])
/**
 * Estados donde el swap in-place aplica en v1. `paused`/`pending_payment`/`past_due` (dunning) son
 * recuperación de pago fallido = FASE 2 (Q10 sin validar si MP acepta el PUT en paused) → INVALID_STATUS.
 */
const PUT_ALLOWED_STATUSES = new Set(['active', 'trialing'])

/**
 * Idempotency key del PUT (header X-Idempotency-Key): determinística y SIN timestamp para que un
 * doble-submit del MISMO token deduplique en MP (el token single-use ya es la unidad natural). El
 * token va HASHEADO (nunca en claro en la key ni en logs).
 */
function idempotencyKey(coachId: string, cardToken: string): string {
    const tokenHash = createHash('sha256').update(cardToken).digest('hex').slice(0, 32)
    return `card_change:${coachId}:${tokenHash}`
}

/** Extrae el HTTP status del mensaje de error del provider (`... failed (400) ...`). */
function parseMpStatus(message: string): number | null {
    const m = message.match(/\((\d{3})\)/)
    return m ? Number(m[1]) : null
}

export async function changeCardForCoach(
    db: DB,
    provider: PaymentsProvider,
    input: ChangeCardInput
): Promise<ChangeCardResult> {
    const { coachId, cardToken } = input

    const { data: coach } = await db
        .from('coaches')
        .select('id, subscription_mp_id, subscription_status, superseded_mp_preapproval_id, payment_provider')
        .eq('id', coachId)
        .maybeSingle()

    if (!coach) {
        return { ok: false, code: 'COACH_NOT_FOUND', status: 404, message: 'Coach no encontrado.' }
    }

    // Solo MercadoPago soporta el swap in-place hoy (el StripeProvider lanza NotImplemented).
    if (coach.payment_provider && coach.payment_provider !== provider.name) {
        return {
            ok: false,
            code: 'WRONG_PROVIDER',
            status: 409,
            message: 'Tu suscripción no admite cambio de tarjeta en línea.',
        }
    }

    const mpId = coach.subscription_mp_id?.trim()
    if (!mpId) {
        // Sin preapproval recurrente no hay nada que PUTear (cuentas free/manual/test).
        return {
            ok: false,
            code: 'NO_ACTIVE_SUBSCRIPTION',
            status: 409,
            message: 'Necesitás una suscripción recurrente activa para cambiar la tarjeta.',
        }
    }

    // Cambio de plan en vuelo: un PUT de token sobre un preapproval por reemplazar/cancelar (el webhook
    // del upgrade lo supersede) corrompe el estado → bloquear hasta que se resuelva. Dos señales: el
    // marcador superseded_* y el candado in-flight de plan-change-lock.
    if (coach.superseded_mp_preapproval_id) {
        return {
            ok: false,
            code: 'UPGRADE_IN_FLIGHT',
            status: 409,
            message: 'Tu plan está en proceso de cambio. Completá ese cambio antes de actualizar tu tarjeta.',
        }
    }
    if (await isUpgradeInFlight(db, coachId)) {
        return {
            ok: false,
            code: 'UPGRADE_IN_FLIGHT',
            status: 409,
            message: 'Tu plan está en proceso de cambio. Completá ese cambio antes de actualizar tu tarjeta.',
        }
    }

    const status = coach.subscription_status ?? ''
    if (TERMINAL_STATUSES.has(status)) {
        return {
            ok: false,
            code: 'PREAPPROVAL_TERMINAL',
            status: 409,
            message: 'Tu suscripción está cancelada o vencida. Reactivala para registrar una tarjeta nueva.',
            reactivateUrl: input.reactivateUrl,
        }
    }
    if (!PUT_ALLOWED_STATUSES.has(status)) {
        // paused / pending_payment / past_due: recuperación de pago fallido = FASE 2.
        return {
            ok: false,
            code: 'INVALID_STATUS',
            status: 409,
            message: 'No podés cambiar la tarjeta mientras tu suscripción está en este estado. Contactá a soporte.',
        }
    }

    // ── Snapshot PRE-PUT para el guard Q1 (el swap NO debe mover el ciclo/monto) ──────────────
    let beforeNextPaymentDate: string | null = null
    let beforeAmount: number | null = null
    try {
        const before = await provider.fetchCheckoutSnapshot(mpId)
        beforeNextPaymentDate = before.next_payment_date ?? null
        beforeAmount = before.auto_recurring?.transaction_amount ?? null
    } catch {
        return {
            ok: false,
            code: 'GATEWAY_ERROR',
            status: 502,
            message: 'No pudimos leer tu suscripción en Mercado Pago. Intentá de nuevo.',
            retryable: true,
        }
    }

    // ── A6: last4 AUTORITATIVO server-side (GET /v1/card_tokens) — no confiar en el body ──────────
    // Best-effort: si el GET falla, cae al last4 del cliente (display-only, no gatea nada). El GET NO
    // consume el token (lo consume el PUT). brand/pmid siguen del cliente (cosméticos). P0-10.
    let last4 = input.last4
    try {
        const summary = await provider.fetchCardTokenSummary(cardToken)
        if (summary.last4) last4 = summary.last4
    } catch {
        console.warn('[billing.change-card] no se pudo leer el card-token summary; uso last4 del cliente', { coachId })
    }

    // ── Marcador para el webhook (P0-7) ──────────────────────────────────────────────────────
    // Si MP emite un `preapproval updated` tras el PUT, el webhook lo reconoce como card-only swap y
    // NO recomputa el período (preserva current_period_end). delete→insert para refrescar created_at
    // (el guard del webhook filtra por ventana de 15 min). Escrito ANTES del PUT para no perder un
    // webhook que llegue rápido. service-role.
    await db.from('subscription_events').delete().eq('provider_event_id', `card_change_pending:${coachId}`)
    const { error: markerErr } = await db.from('subscription_events').insert({
        coach_id: coachId,
        provider: provider.name,
        provider_event_id: `card_change_pending:${coachId}`,
        provider_status: 'card_change_pending',
        payload: { mp_id: mpId } as Json,
    })
    // A2: el marcador es TODA la red P0-7. Si no se puede persistir, ABORTAMOS antes del PUT — no
    // cambiamos una tarjeta que después un `preapproval updated` podría re-fechar/expirar sin protección.
    if (markerErr) {
        console.error('[billing.change-card] no se pudo escribir el marcador P0-7; abortando antes del PUT', {
            coachId,
            message: markerErr.message,
        })
        return {
            ok: false,
            code: 'GATEWAY_ERROR',
            status: 502,
            message: 'No pudimos preparar el cambio de tarjeta. Intentá de nuevo.',
            retryable: true,
        }
    }

    // ── PUT { card_token_id } + idempotencia ──────────────────────────────────────────────────
    try {
        await provider.updateCardAtProvider(mpId, cardToken, idempotencyKey(coachId, cardToken))
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        const httpStatus = parseMpStatus(msg)
        // Redactamos: solo status + x-request-id (el message del provider ya excluye el PAN; nunca el token).
        console.error('[billing.change-card] PUT falló', { coachId, httpStatus })
        if (httpStatus === 400) {
            return {
                ok: false,
                code: 'TOKEN_INVALID',
                status: 400,
                message: 'No pudimos validar la tarjeta. Revisá los datos e intentá de nuevo.',
                retryable: true,
            }
        }
        return {
            ok: false,
            code: 'GATEWAY_ERROR',
            status: 502,
            message: 'Mercado Pago no pudo procesar el cambio. Intentá en unos minutos.',
            retryable: true,
        }
    }

    // ── Guard Q1 EN RUNTIME: el swap NO debe mover next_payment_date ni el monto del próximo cobro ──
    // Si MP movió el ciclo, NO confirmamos éxito (sería re-facturación silenciosa = incidente SERNAC):
    // dejamos rastro y devolvemos error pidiendo soporte (no hubo cobro).
    let q1Verified = false
    try {
        const after = await provider.fetchCheckoutSnapshot(mpId)
        const afterNextPaymentDate = after.next_payment_date ?? null
        const afterAmount = after.auto_recurring?.transaction_amount ?? null
        if (beforeNextPaymentDate !== afterNextPaymentDate || beforeAmount !== afterAmount) {
            const drift: TablesInsert<'subscription_events'> = {
                coach_id: coachId,
                provider: provider.name,
                provider_event_id: `card_change_cycle_drift:${coachId}:${Date.now()}`,
                provider_status: 'card_change_cycle_drift',
                payload: {
                    before_next_payment_date: beforeNextPaymentDate,
                    after_next_payment_date: afterNextPaymentDate,
                    before_amount: beforeAmount,
                    after_amount: afterAmount,
                } as Json,
            }
            await db.from('subscription_events').insert(drift)
            console.error('[billing.change-card] CYCLE DRIFT tras swap', {
                coachId,
                beforeNextPaymentDate,
                afterNextPaymentDate,
                beforeAmount,
                afterAmount,
            })
            // A5: NO decimos "revertido" (no hay PUT compensatorio; la tarjeta YA cambió en MP). Solo
            // que no se pudo verificar y que no hubo cobro (un swap de tarjeta nunca cobra).
            return {
                ok: false,
                code: 'CYCLE_DRIFT',
                status: 409,
                message:
                    'El cambio de tarjeta no se pudo verificar de forma segura. No se realizó ningún cobro; contactá a soporte.',
            }
        }
        q1Verified = true
    } catch {
        // El GET post-PUT falló: no pudimos verificar Q1. La tarjeta YA cambió en MP; seguimos, pero
        // A4: dejamos un rastro AUDITABLE (distinto de un éxito verificado) para que un reconcile lo vea.
        console.warn('[billing.change-card] no se pudo verificar el ciclo post-swap', { coachId })
        await db.from('subscription_events').insert({
            coach_id: coachId,
            provider: provider.name,
            provider_event_id: `card_change_unverified:${coachId}:${Date.now()}`,
            provider_status: 'card_change_unverified',
            payload: { reason: 'post_put_get_failed' } as Json,
        })
    }

    // A3: swap verificado → borrar el marcador YA (achica la ventana de no-op del webhook de 15 min a la
    // duración del swap). Si NO se verificó (GET falló), lo dejamos: el swap ocurrió y queremos que un
    // `preapproval updated` tardío siga siendo no-op (preservar el período).
    if (q1Verified) {
        await db.from('subscription_events').delete().eq('provider_event_id', `card_change_pending:${coachId}`)
    }

    // ── last4 ya resuelto AUTORITATIVO arriba (GET /v1/card_tokens). brand/pmid son del cliente
    // (cosméticos, no gatean nada; Zod ya los validó). Service-role write. ────────────────────────
    const brand = input.brand
    const { error: updErr } = await db
        .from('coaches')
        .update({ card_last4: last4, card_brand: brand, card_payment_method_id: input.paymentMethodId })
        .eq('id', coachId)
    if (updErr) {
        console.warn('[billing.change-card] swap OK pero no se pudo guardar el last4 (display)', {
            coachId,
            message: updErr.message,
        })
    }

    // ── Auditoría (evidencia SERNAC): una fila por cambio, con versión + TEXTO del consentimiento ──
    const audit: TablesInsert<'subscription_events'> = {
        coach_id: coachId,
        provider: provider.name,
        provider_event_id: `card_change:${coachId}:${Date.now()}`,
        provider_status: 'card_changed',
        payload: {
            card_change_terms_version: input.acceptedTermsVersion,
            card_change_terms_text: input.acceptedTermsText,
            old_status: status,
            card_last4: last4,
            card_brand: brand,
        } as Json,
    }
    await db.from('subscription_events').insert(audit)

    return { ok: true, last4, brand }
}
