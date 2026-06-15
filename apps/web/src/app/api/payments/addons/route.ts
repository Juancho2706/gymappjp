import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { canViewBilling } from '@/services/auth/workspace-permissions.service'
import { rateLimitPayment, jsonRateLimited } from '@/lib/rate-limit'
import { MODULE_KEYS } from '@/services/entitlements.service'
import { ADDON_PAYMENT_RULES, SELF_SERVICE_ADDONS_ENABLED } from '@/lib/constants'
import { activateAddonForCoach, canPurchaseAddon } from '@/services/billing/addons.service'
import { isUpgradeInFlight } from '@/services/billing/plan-change-lock'
import { listLive } from '@/infrastructure/db/coach-addons.repository'
import { getPaymentsProvider } from '@/lib/payments/provider'
import { parseCheckoutExternalReference } from '@/lib/payments/checkout-external-reference'
import { buildAddonPaymentsPort } from './_lib/payments-port'
import { buildActivateContext, fetchCoachBillingRow } from './_lib/coach-context'

/**
 * POST /api/payments/addons — ALTA de un add-on self-service (plan 05 F4.1).
 *
 * Guards en orden (doc fuente §2.3 + D8):
 *   auth → canViewBilling (excluye team/org) → canPurchaseAddon → checkbox obligatorio
 *   (acceptedTermsVersion === ADDON_PAYMENT_RULES.version) → activateAddonForCoach.
 *
 * Respuesta ÚNICA para TODOS los ciclos (D4): { checkoutUrl } del one-shot prorrateado.
 * La fila, el PUT diferido, el evento de historial, el snapshot y el recibo llegan vía
 * webhook al aprobarse el pago (F3) — incluido el ciclo mensual, que antes activaba en el acto.
 *
 * El monto SIEMPRE lo calcula el server. La feature está detrás de SELF_SERVICE_ADDONS_ENABLED.
 */

const schema = z.object({
    moduleKey: z.enum(MODULE_KEYS),
    acceptedTermsVersion: z.string().min(1),
})

const DENIAL_STATUS: Record<string, number> = {
    no_paid_plan: 403,
    requires_nutrition_tier: 403,
    managed_by_team_or_org: 403,
}

const DENIAL_MESSAGE: Record<string, string> = {
    no_paid_plan: 'Necesitas un plan pago activo para agregar un módulo.',
    requires_nutrition_tier: 'Este módulo requiere un plan con nutrición (Pro o superior).',
    managed_by_team_or_org: 'Los módulos de un equipo se gestionan por contrato.',
}

/** El índice único parcial mapea "fila viva ya existe" → módulo ya activo (409 amable). */
function isAlreadyActiveError(message: string): boolean {
    return /one_live_per_module|duplicate key|unique constraint/i.test(message)
}

export async function POST(request: Request) {
    try {
        const supabase = await createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()

        if (!user?.id || !user.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // El switch de lanzamiento gatea la RUTA, no solo la UI: sin esto el endpoint de compra era
        // alcanzable por API aun con el flag off (modulo "tomable" sin pasar por el lanzamiento).
        if (!SELF_SERVICE_ADDONS_ENABLED) {
            return NextResponse.json({ error: 'Función no disponible.', code: 'FEATURE_DISABLED' }, { status: 403 })
        }

        const rl = await rateLimitPayment(user.id)
        if (!rl.ok) return jsonRateLimited(rl.retryAfter)

        const workspace = await resolvePreferredWorkspace(supabase, user.id)
        if (!canViewBilling(workspace)) {
            return NextResponse.json(
                { error: 'Billing disponible solo para coach independiente.' },
                { status: 403 }
            )
        }

        const parsed = schema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message ?? 'Invalid payload' },
                { status: 400 }
            )
        }
        const { moduleKey, acceptedTermsVersion } = parsed.data

        // Checkbox obligatorio: la versión aceptada debe ser la vigente (evidencia SERNAC).
        if (acceptedTermsVersion !== ADDON_PAYMENT_RULES.version) {
            return NextResponse.json(
                { error: 'Debes aceptar las condiciones de pago vigentes.', code: 'TERMS_OUTDATED' },
                { status: 400 }
            )
        }

        const admin = createServiceRoleClient()
        const coach = await fetchCoachBillingRow(admin, user.id)
        if (!coach) {
            return NextResponse.json({ error: 'Coach no encontrado' }, { status: 404 })
        }

        const gate = canPurchaseAddon(
            {
                subscriptionTier: coach.subscription_tier as never,
                subscriptionStatus: coach.subscription_status,
                isManagedByTeamOrOrg: false, // canViewBilling ya excluyó team/org
                currentPeriodEnd: coach.current_period_end,
            },
            moduleKey
        )
        if (!gate.allowed) {
            return NextResponse.json(
                { error: DENIAL_MESSAGE[gate.reason], code: gate.reason },
                { status: DENIAL_STATUS[gate.reason] ?? 403 }
            )
        }

        // ── Guard P0-A (i): el coach YA tiene una fila viva de este módulo ──────────────────
        // El one-shot NO inserta fila en el alta (la crean el webhook/confirm al aprobarse), así que
        // el índice único parcial no dispara hasta entonces; sin este check, re-comprar un módulo ya
        // activo cobraría una 2ª proración. Cubre cualquier source (self_service o admin_grant).
        const liveAddons = await listLive(admin, user.id)
        if (liveAddons.some((a) => a.moduleKey === moduleKey)) {
            return NextResponse.json(
                { error: 'Ya tienes este módulo activo.', code: 'ALREADY_ACTIVE' },
                { status: 409 }
            )
        }

        // ── Guard P0-A: doble cobro entre las dos superficies de add-on ─────────────────────
        // El one-shot prorrateado de ESTE endpoint y el combo de create-preference (que embebe el
        // módulo en un preapproval compuesto nuevo) no se reconcilian: comprar el mismo módulo por
        // ambos lo cobra DOS veces. El índice único parcial bloquea filas duplicadas, no plata
        // duplicada. Bloqueo:
        //   (i)  fila viva ya existe → lo cubre isAlreadyActiveError/409 (más abajo).
        //   (ii) el módulo YA viaja en el preapproval recurrente vigente del coach (combo ya pagado),
        //        o hay un cambio de plan en vuelo (superseded_*) que puede embeberlo → 409 ALREADY_BILLED.
        // Fail-open SOLO si el fetch del snapshot lanza (no bloqueamos por error del provider); pero
        // SÍ bloqueamos ante un embed confirmado.
        const { data: scopeRow } = await admin
            .from('coaches')
            .select('superseded_mp_preapproval_id')
            .eq('id', user.id)
            .maybeSingle()
        if (scopeRow?.superseded_mp_preapproval_id) {
            return NextResponse.json(
                {
                    error: 'Ese modulo ya esta incluido en tu plan o en un cambio en curso.',
                    code: 'ALREADY_BILLED',
                },
                { status: 409 }
            )
        }
        if (coach.subscription_mp_id) {
            try {
                const provider = getPaymentsProvider()
                const snapshot = await provider.fetchCheckoutSnapshot(coach.subscription_mp_id)
                const embedded = parseCheckoutExternalReference(snapshot.external_reference ?? null)
                if (embedded?.addons.includes(moduleKey)) {
                    return NextResponse.json(
                        {
                            error: 'Ese modulo ya esta incluido en tu plan o en un cambio en curso.',
                            code: 'ALREADY_BILLED',
                        },
                        { status: 409 }
                    )
                }
            } catch (snapshotErr) {
                // Error del provider: fail-open (no bloqueamos la compra por un fallo de red/MP).
                const msg = snapshotErr instanceof Error ? snapshotErr.message : String(snapshotErr)
                console.warn('[payments.addons] no se pudo leer el preapproval para el guard P0-A', {
                    coachId: user.id,
                    moduleKey,
                    message: msg,
                })
            }
        }

        // ── Guard P0-4b: alta de add-on mientras un UPGRADE de plan está en vuelo ─────────────
        // El upgrade es un one-shot prorrateado que se confirma async (confirm-upgrade/webhook) y, al
        // activarse, recomputa el compuesto desde listLive → plegaría ESTE add-on nuevo dos veces
        // (una en el compuesto del upgrade, otra en su propio one-shot). Bloqueamos hasta que el
        // upgrade en vuelo se resuelva (o el TTL del candado lo libere). db service-role.
        if (await isUpgradeInFlight(admin, user.id)) {
            return NextResponse.json(
                {
                    error: 'No puedes agregar un modulo mientras un cambio de plan esta en proceso.',
                    code: 'UPGRADE_IN_FLIGHT',
                },
                { status: 409 }
            )
        }

        // ── Guard money-safety: NO cobrar si no hay suscripción recurrente donde sumar el módulo ──
        // Un add-on self-service viaja sobre el preapproval recurrente vigente (la renovación aplica
        // el valor completo vía PUT). Sin `subscription_mp_id` no hay dónde anclarlo: si dejáramos
        // pasar el one-shot, MP cobraría la proración y luego confirm-addon rechazaría la activación
        // (charged-and-fail → plata tomada, módulo no entregado). Lo bloqueamos ACÁ, antes de crear
        // el checkout, para no tomar dinero que no podemos cumplir. (confirm-addon mantiene el mismo
        // 409 como backstop defensivo, ya rara vez alcanzable.) Coaches reales de lanzamiento siempre
        // tienen preapproval; esto solo blinda cuentas sin recurrente/manuales/de test.
        if (!coach.subscription_mp_id) {
            return NextResponse.json(
                {
                    error: 'Necesitás una suscripción recurrente activa para sumar módulos.',
                    code: 'NO_ACTIVE_SUBSCRIPTION',
                },
                { status: 409 }
            )
        }

        // URLs del one-shot (back_urls + webhook) desde NEXT_PUBLIC_SITE_URL — mismo patrón que
        // create-preference. MP exige back_urls.success cuando se manda auto_return.
        const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
        const webhookToken = process.env.MERCADOPAGO_WEBHOOK_TOKEN
        const webhookUrl = webhookToken
            ? `${appUrl}/api/payments/webhook?token=${encodeURIComponent(webhookToken)}`
            : `${appUrl}/api/payments/webhook`
        // buildActivateContext normaliza el ciclo y deriva el corte para el prorrateo del service.
        // success → pantalla de procesamiento síncrono (confirm-addon): MP auto-agrega
        // payment_id/collection_id/status al volver. Ya no es un landing no-op: la pantalla
        // confirma el pago sin esperar el webhook (que sigue como backstop idempotente).
        const ctx = buildActivateContext(coach, user.email, {
            successUrl: `${appUrl}/coach/subscription/addon-processing`,
            failureUrl: `${appUrl}/coach/subscription?addon=failure`,
            pendingUrl: `${appUrl}/coach/subscription?addon=pending`,
            webhookUrl,
        })
        const payments = buildAddonPaymentsPort()

        let result
        try {
            result = await activateAddonForCoach(
                admin,
                payments,
                ctx,
                moduleKey,
                acceptedTermsVersion
            )
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            if (isAlreadyActiveError(msg)) {
                return NextResponse.json(
                    { error: 'Ya tienes este módulo activo.', code: 'ALREADY_ACTIVE' },
                    { status: 409 }
                )
            }
            throw err
        }

        // TODOS los ciclos: one-shot prorrateado. La fila + PUT diferido + evento + snapshot +
        // recibo llegan por webhook al aprobarse el pago (F3); acá solo se redirige al checkout.
        if (result.kind !== 'one_shot_checkout') {
            // Inalcanzable: el service converge a one-shot en todos los ciclos (D4).
            return NextResponse.json(
                { error: 'No se pudo iniciar el cobro del módulo.' },
                { status: 500 }
            )
        }
        return NextResponse.json({
            kind: 'one_shot_checkout',
            checkoutUrl: result.checkoutUrl,
            prorationClp: result.prorationClp,
            cycleAmountClp: result.cycleAmountClp,
        })
    } catch (error) {
        const message =
            error instanceof Error ? error.message : 'No se pudo agregar el módulo.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
