import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import { buildClientLimitReachedEmail } from '@/lib/email/sales-templates'
import { buildSubscriptionUrl } from '@/lib/email/subscription-url'
import { getTierRank, TIER_LABELS, type SubscriptionTier } from '@/lib/constants'

/**
 * Envío de los correos de VENTA por evento (límite de alumnos, vence pronto, venció).
 *
 * Contexto: los CTA de pago se purgaron de la app móvil por compliance de tiendas
 * (`docs/research/cta-pagos-externos-stores-2026-07-31.md` §6). La app muestra un muro NEUTRO y el
 * mismo evento dispara el correo, que es donde vive el CTA de pago. Este módulo es la capa de
 * ENVÍO; las plantillas son puras y viven en `@/lib/email/sales-templates`.
 *
 * Tres invariantes:
 *
 * 1. KILL-SWITCH sin deploy — `EVA_SALES_EMAILS_DISABLED` (espejo exacto de `EVA_PUSH_DISABLED_EVENTS`
 *    de push W1, `lib/push.ts:38`): CSV de eventos a apagar, `*` o `1` apaga todos. Es lista de
 *    APAGADO (no allowlist) para que el default preserve lo que ya está vivo.
 *
 * 2. DEDUPE SIN DDL — cero migraciones (regla dura del lote). El ledger de idempotencia es
 *    `admin_audit_logs`, tabla que estos mismos flujos YA escriben (el cron `paid-expiry` inserta
 *    `cron.paid_expiry_ran`, `coach.paid_expired_auto`, etc.). Dos modos:
 *      - `dedupeKey`: un ancla del evento (p.ej. el `current_period_end` que está por vencer). Se
 *        manda UNA vez por ancla; cuando el coach renueva, el ancla se mueve y el aviso se re-arma
 *        solo. Idempotencia exacta aunque el cron corra varias veces al día o se salte un día.
 *      - `cooldownDays`: sin ancla persistida (caso límite de alumnos, que es un rechazo repetible
 *        a voluntad del coach) se aplica una ventana de silencio por coach.
 *
 * 3. FALLO DE EMAIL NUNCA ROMPE EL FLUJO — todo va dentro de try/catch y se loggea. Un 500 de Resend
 *    no puede tumbar el alta de un alumno ni abortar la corrida del cron de expiración.
 */

type Db = SupabaseClient<Database>

export type SalesEmailEvent = 'client_limit_reached' | 'plan_expiring_soon' | 'plan_expired'

/** Acción de `admin_audit_logs` que sirve de ledger por evento (también es la traza operativa). */
export const SALES_EMAIL_AUDIT_ACTIONS: Record<SalesEmailEvent, string> = {
    client_limit_reached: 'coach.sales_email_client_limit_reached',
    plan_expiring_soon: 'coach.sales_email_plan_expiring_soon',
    plan_expired: 'coach.sales_email_plan_expired',
}

/**
 * `EVA_SALES_EMAILS_DISABLED=plan_expiring_soon,plan_expired` apaga esos eventos; `*` (o `1`) apaga
 * todos. Espejo de `isPushEventEnabled` — misma semántica de lista de apagado.
 */
export function isSalesEmailEnabled(event: SalesEmailEvent): boolean {
    const raw = process.env.EVA_SALES_EMAILS_DISABLED?.trim()
    if (!raw) return true
    const disabled = raw.split(',').map((s) => s.trim()).filter(Boolean)
    return !disabled.includes('*') && !disabled.includes('1') && !disabled.includes(event)
}

/** Días de aviso previo al fin del período pagado (correo "tu plan vence pronto"). */
export const RENEWAL_REMINDER_THRESHOLD_DAYS = 3

/**
 * ¿El fin de período cae dentro de la ventana de aviso? PURA (sin red, sin DB) — el reloj entra por
 * parámetro para que el cron sea testeable.
 *
 * Ventana `0 < faltan <= threshold` (no "exactamente el día 3"): si una corrida del cron se pierde,
 * el coach igual recibe el aviso al día siguiente en vez de nunca. El disparo único lo garantiza el
 * ledger por ancla (`dedupeKey = current_period_end`), no la estrechez de la ventana.
 */
export function isWithinRenewalReminderWindow(input: {
    periodEndIso: string | null
    now: Date
    thresholdDays?: number
}): boolean {
    const { periodEndIso, now } = input
    const thresholdDays = input.thresholdDays ?? RENEWAL_REMINDER_THRESHOLD_DAYS
    if (!periodEndIso) return false
    const endMs = new Date(periodEndIso).getTime()
    if (!Number.isFinite(endMs)) return false
    const deltaMs = endMs - now.getTime()
    if (deltaMs <= 0) return false // ya venció: ese es el correo 3, no este
    return deltaMs <= thresholdDays * 24 * 60 * 60 * 1000
}

/** Días enteros que faltan hasta `periodEndIso` (redondeo hacia arriba: "quedan 3 días", no 2,4). */
export function daysUntil(periodEndIso: string, now: Date): number {
    const deltaMs = new Date(periodEndIso).getTime() - now.getTime()
    return Math.max(1, Math.ceil(deltaMs / (24 * 60 * 60 * 1000)))
}

export type SalesEmailOutcome =
    | 'sent'
    | 'skipped_disabled'
    | 'skipped_duplicate'
    | 'skipped_no_recipient'
    | 'failed'

type SendSalesEmailInput = {
    event: SalesEmailEvent
    coachId: string
    /** Correo del coach. Si es null/vacío → `skipped_no_recipient` (nunca revienta). */
    to: string | null | undefined
    subject: string
    html: string
    /** Ancla de idempotencia (p.ej. `current_period_end`). Prevalece sobre `cooldownDays`. */
    dedupeKey?: string | null
    /** Ventana de silencio por coach cuando no hay ancla. */
    cooldownDays?: number
    /** Contexto extra para la auditoría (nunca datos sensibles). */
    payload?: Record<string, Json>
}

const DAY_MS = 24 * 60 * 60 * 1000
/** Lookback del ledger en modo ancla — generoso: las anclas avanzan con cada renovación. */
const DEDUPE_KEY_LOOKBACK_DAYS = 400
/**
 * Tolerancia del modo cooldown (espejo de `LADDER_TOLERANCE_MS` del cron `cap-nudge`): un cron diario
 * corre a la misma hora cada día y el ledger se escribe segundos después ⇒ sin tolerancia, un cooldown
 * de 7 días bloquea la corrida del día 7 y el correo sale el día 8.
 */
export const COOLDOWN_TOLERANCE_MS = 12 * 60 * 60 * 1000
/** Techo de filas leídas del ledger por consulta (el ledger es append-only y compartido). */
const LEDGER_SCAN_LIMIT = 25

/**
 * ¿Ya se mandó este correo? Lee `admin_audit_logs` (ledger) en vez de una columna nueva — cero DDL.
 * Ante error de lectura devuelve `false` (fail-open): preferimos un correo repetido a perder el
 * aviso de venta por un hipo de la DB.
 */
async function wasAlreadySent(
    admin: Db,
    event: SalesEmailEvent,
    coachId: string,
    dedupeKey: string | null,
    cooldownDays: number | null,
    now: Date
): Promise<boolean> {
    if (!dedupeKey && !cooldownDays) return false
    // Modo cooldown: la ventana se acorta 12 h a propósito. La fila del ledger se escribe segundos
    // DESPUÉS del `now` de la corrida de un cron diario, así que una ventana exacta de N días vetaba
    // el toque del día N (caía al N+1). Con la tolerancia, «7 días» significa «la corrida del día 7».
    const lookbackMs = dedupeKey
        ? DEDUPE_KEY_LOOKBACK_DAYS * DAY_MS
        : Math.max(0, (cooldownDays ?? 0) * DAY_MS - COOLDOWN_TOLERANCE_MS)
    const sinceIso = new Date(now.getTime() - lookbackMs).toISOString()

    const { data, error } = await admin
        .from('admin_audit_logs')
        .select('payload, created_at')
        .eq('action', SALES_EMAIL_AUDIT_ACTIONS[event])
        .eq('target_id', coachId)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(LEDGER_SCAN_LIMIT)

    if (error) {
        console.error(`[sales-email:${event}] ledger read failed for coach ${coachId}:`, error.message)
        return false
    }
    if (!data?.length) return false
    if (!dedupeKey) return true // modo cooldown: cualquier envío dentro de la ventana bloquea

    return data.some((row) => {
        const p = row.payload as { dedupe_key?: unknown } | null
        return typeof p?.dedupe_key === 'string' && p.dedupe_key === dedupeKey
    })
}

/**
 * Manda un correo de venta UNA sola vez por evento. Nunca lanza: cualquier fallo (kill-switch,
 * ledger, Resend) se resuelve como un outcome y se loggea. El caller sigue su flujo intacto.
 */
export async function sendSalesEmailOnce(admin: Db, input: SendSalesEmailInput): Promise<SalesEmailOutcome> {
    const { event, coachId } = input
    try {
        if (!isSalesEmailEnabled(event)) return 'skipped_disabled'

        const to = input.to?.trim()
        if (!to) return 'skipped_no_recipient'

        const dedupeKey = input.dedupeKey ?? null
        const cooldownDays = input.cooldownDays ?? null
        const now = new Date()

        if (await wasAlreadySent(admin, event, coachId, dedupeKey, cooldownDays, now)) {
            return 'skipped_duplicate'
        }

        const result = await sendTransactionalEmail({ to, subject: input.subject, html: input.html })
        if (!result.ok) {
            console.error(`[sales-email:${event}] send failed for coach ${coachId}:`, result.error)
            return 'failed'
        }

        // El ledger se escribe SOLO tras un envío exitoso: si Resend falló, el próximo evento
        // reintenta en vez de quedar silenciado para siempre.
        const auditPayload: Record<string, Json> = {
            ...(input.payload ?? {}),
            event,
            dedupe_key: dedupeKey,
            provider_message_id: result.providerMessageId,
        }
        const { error: auditError } = await admin.from('admin_audit_logs').insert({
            admin_email: 'system',
            action: SALES_EMAIL_AUDIT_ACTIONS[event],
            target_table: 'coaches',
            target_id: coachId,
            payload: auditPayload as Json,
        })
        if (auditError) {
            console.error(`[sales-email:${event}] ledger write failed for coach ${coachId}:`, auditError.message)
        }

        return 'sent'
    } catch (err) {
        console.error(`[sales-email:${event}] unexpected failure for coach ${coachId}:`, err)
        return 'failed'
    }
}

/**
 * Ventana de silencio del correo de límite de alumnos. NO hay ancla persistida que distinga "la
 * primera vez que choca el tope" de "el quinto reintento del mismo día" (el rechazo se computa al
 * vuelo contra `count(clients) >= max_clients` y no deja rastro en la fila del coach; añadir una
 * columna exigiría migración, prohibida en este lote). Con 7 días el coach recibe el aviso en la
 * fricción real y no vuelve a recibirlo por insistir. LIMITACIÓN CONOCIDA: si el coach sube de plan
 * y vuelve a chocar el tope nuevo dentro de la semana, ese segundo aviso se pierde.
 */
export const CLIENT_LIMIT_EMAIL_COOLDOWN_DAYS = 7

type ClientLimitEmailInput = {
    coachId: string
    coachEmail: string | null | undefined
    coachName: string | null | undefined
    /** Tier vigente del coach (`subscription_tier`). */
    tier: string | null | undefined
    currentLimit: number
    /**
     * Origen del envío, solo para la traza: 'web_create' | 'web_import' | 'mobile_create' |
     * 'cron_cap_nudge' | …
     */
    source: string
    /**
     * Gatillo del correo (SPEC embudo-free-pro §Reglas de producto 4). `attempt` (default) = hubo un
     * rechazo real; `sweep` = barrido del cron `cap-nudge` sobre quien ya está en cupo sin haber
     * intentado nada. Cambia el copy y viaja al ledger para poder medir la escalera.
     */
    trigger?: 'attempt' | 'sweep'
}

/**
 * Correo 1 — el coach está en el tope de alumnos de su plan. Dos gatillos:
 *
 * - `attempt` (default): el server rechazó un alta/importación por cupo. Se llama desde TODOS los
 *   caminos que devuelven `UPGRADE_REQUIRED` por límite de alumnos (acción web, endpoint móvil,
 *   importación en ambos) para que el correo llegue en el mismo instante que el muro neutro.
 * - `sweep`: el cron `cap-nudge` (`source: 'cron_cap_nudge'`, `trigger: 'sweep'`) barre a los coaches
 *   que YA están en cupo y nunca intentaron agregar — con Free = 1 alumno son mayoría y el gatillo
 *   por evento jamás los alcanza.
 *
 * El CTA sale con UTM (`utm_source=cap_email`, `utm_campaign=<trigger>`) para separar en PostHog el
 * checkout que nace del rechazo del que nace del barrido.
 */
export async function sendClientLimitReachedEmail(
    admin: Db,
    input: ClientLimitEmailInput
): Promise<SalesEmailOutcome> {
    const tier = (input.tier ?? 'free') as SubscriptionTier
    const trigger = input.trigger ?? 'attempt'
    // Pricing v2 (D3): el upsell apunta a Pro (starter salió de la venta) — free/starter reciben
    // «Pasar a Pro», un pro recibe «Pasar a Elite», elite+/legacy mantienen el copy genérico
    // (su siguiente paso es Teams, no un tier de venta). Solo la ETIQUETA, sin números: el cupo
    // exacto depende del grandfather de cada coach y se ve en /coach/subscription.
    const recommendedTier: SubscriptionTier | null =
        getTierRank(tier) < getTierRank('pro') ? 'pro' : tier === 'pro' ? 'elite' : null
    const { subject, html } = buildClientLimitReachedEmail({
        coachName: input.coachName?.trim() || 'Coach',
        tierLabel: TIER_LABELS[tier] ?? TIER_LABELS.free,
        currentLimit: input.currentLimit,
        subscriptionUrl: buildSubscriptionUrl({ utmSource: 'cap_email', utmCampaign: trigger }),
        recommendedTierLabel: recommendedTier ? TIER_LABELS[recommendedTier] : null,
        trigger,
    })
    return sendSalesEmailOnce(admin, {
        event: 'client_limit_reached',
        coachId: input.coachId,
        to: input.coachEmail,
        subject,
        html,
        cooldownDays: CLIENT_LIMIT_EMAIL_COOLDOWN_DAYS,
        payload: { current_limit: input.currentLimit, tier, source: input.source, trigger },
    })
}

/**
 * CTA de los correos de venta. Vive en `lib/email/subscription-url.ts` desde W2.12: el drip lo
 * necesita y una plantilla pura de correo no puede importar este service (arrastra `send-email`, el
 * ledger de `admin_audit_logs` y medio módulo de pagos a cada test de render).
 *
 * Se re-exporta desde acá a propósito: `api/cron/paid-expiry/route.ts` y esta misma suite lo
 * importan por esta ruta desde antes, y moverlos no aporta nada.
 */
export { buildSubscriptionUrl }

/** Correo del coach desde GoTrue (la tabla `coaches` no tiene columna email). Nunca lanza. */
export async function resolveCoachEmail(admin: Db, coachId: string): Promise<string | null> {
    try {
        const { data } = await admin.auth.admin.getUserById(coachId)
        return data?.user?.email ?? null
    } catch (err) {
        console.error(`[sales-email] getUserById failed for coach ${coachId}:`, err)
        return null
    }
}
