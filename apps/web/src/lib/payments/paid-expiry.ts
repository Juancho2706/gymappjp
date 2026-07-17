/**
 * paid-expiry — decisión PURA (sin red, sin DB, sin reloj) del cron backstop `paid-expiry`.
 *
 * PROBLEMA (real, prod): un evento terminal del gateway que EVA nunca recibió por webhook
 * (ej. la migración de cuenta MP del 2026-07-05 canceló preapprovals POR API en la cuenta vieja
 * = cancelación out-of-band sin notificación) deja al coach con `subscription_status='active'`
 * congelado y `current_period_end` vencido. El gate `hasEffectiveAccess` con status 'active'
 * NUNCA mira la fecha → Pro gratis indefinido (fuga de revenue silenciosa; caso joaquinamr7).
 *
 * Esta función NO decide sola por la fecha: eso cortaría a coaches que el gateway AÚN puede
 * cobrar (dunning). Decide a partir del estado REAL verificado en el gateway (`RemoteVerification`,
 * que el route computa consultando el preapproval/suscripción) más el estado en DB. El cron solo
 * EXPIRA cuando la suscripción remota está inequívocamente MUERTA; ante cualquier duda (error
 * transitorio, sin id verificable, remota viva) es ALERT-ONLY (fail-safe).
 */

/**
 * Resultado de verificar la suscripción en el gateway:
 *  - `status`: el snapshot se leyó bien; `mappedStatus` = `mapProviderStatus(snap.status)`
 *    (vocabulario EVA: 'active' | 'trialing' | 'paused' | 'pending_payment' | 'canceled' | 'expired').
 *  - `not_found`: el gateway respondió 404 / no existe la suscripción → MUERTA.
 *  - `error`: fallo transitorio (5xx, red, timeout) → indeterminado.
 *  - `no_sub_id`: el coach no tiene id de suscripción del gateway para verificar.
 */
export type RemoteVerification =
    | { kind: 'status'; mappedStatus: string }
    | { kind: 'not_found' }
    | { kind: 'error' }
    | { kind: 'no_sub_id' }

export type PaidExpiryDecision = {
    action: 'expire' | 'alert'
    reason: string
}

/** Estados mapeados que consideramos "la suscripción sigue VIVA en el gateway" (no cortar). */
const REMOTE_ALIVE_STATUSES = new Set<string>([
    'active',
    'trialing',
    'paused',
    'pending_payment',
])

/** Estados mapeados que consideramos "la suscripción está MUERTA en el gateway" (expirar). */
const REMOTE_DEAD_STATUSES = new Set<string>(['canceled', 'expired'])

/**
 * Decide si un coach pago con período vencido debe EXPIRAR o solo ALERTARSE.
 *
 * Reglas (money-safety — en la duda, alert-only):
 *   1. Remota MUERTA (mappedStatus canceled/expired, o 404/not_found) → EXPIRE.
 *   2. DB 'canceled' Y sin id de suscripción → EXPIRE (cancelación ya procesada, nada que verificar).
 *   3. Remota VIVA (active/trialing/pending/paused) → ALERT-ONLY (el gateway aún puede cobrar;
 *      nulear el id rompería el matching del webhook de recuperación del dunning = cobro perdido).
 *   4. Error transitorio, o 'active' sin id verificable → ALERT-ONLY (fail-safe).
 */
export function resolvePaidExpiryDecision(input: {
    dbStatus: string
    remote: RemoteVerification
}): PaidExpiryDecision {
    const { dbStatus, remote } = input

    switch (remote.kind) {
        case 'not_found':
            // Regla 1: la suscripción ya no existe en el gateway → MUERTA.
            return { action: 'expire', reason: 'remote_not_found' }

        case 'status': {
            const mapped = remote.mappedStatus
            if (REMOTE_DEAD_STATUSES.has(mapped)) {
                // Regla 1: cancelada/rechazada en el gateway → MUERTA.
                return { action: 'expire', reason: `remote_dead:${mapped}` }
            }
            if (REMOTE_ALIVE_STATUSES.has(mapped)) {
                // Regla 3: el gateway aún la considera viva → nunca cortar.
                return { action: 'alert', reason: `remote_alive:${mapped}` }
            }
            // Estado mapeado desconocido → fail-safe (no debería ocurrir; mapProviderStatus
            // colapsa lo no modelado a 'pending_payment', que ya cae en ALIVE).
            return { action: 'alert', reason: `remote_unknown:${mapped}` }
        }

        case 'no_sub_id':
            // Regla 2: cancelación ya procesada sin nada que verificar → EXPIRE.
            if (dbStatus === 'canceled') {
                return { action: 'expire', reason: 'canceled_no_sub_id' }
            }
            // Regla 4: 'active' (u otro) sin id verificable → fail-safe alert-only.
            return { action: 'alert', reason: `no_verifiable_id:${dbStatus}` }

        case 'error':
        default:
            // Regla 4: fallo transitorio de verificación → nunca cortar a ciegas.
            return { action: 'alert', reason: 'transient_error' }
    }
}
