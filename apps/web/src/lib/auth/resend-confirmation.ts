import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'

/**
 * Guards COMPARTIDOS del reenvío del correo de confirmación del coach.
 *
 * Los escribió primero el Server Action de la web (`(auth)/verify-email/_actions/resend.actions.ts`,
 * QA pre-campaña 17-08). W4 del embudo Free→Pro los necesita también en el endpoint móvil
 * (`api/mobile/auth/resend-confirmation`), así que viven acá y los dos los importan: si mañana se
 * endurece un guard, se endurece en las dos superficies a la vez.
 *
 * INVARIANTE DE SEGURIDAD (la razón de existir de este archivo):
 * `generateLink({ type: 'magiclink' })` CREA el usuario si el email no existe y manda un link de
 * acceso a la dirección que reciba (documentado en `GoTrueAdminApi.d.ts`: "handles the creation of
 * the user for signup, invite and magiclink"). Aceptar un email tipeado convertiría el reenvío en
 * (a) una fábrica de `auth.users` huérfanos y (b) un emisor de magic-links contra cuentas ajenas ya
 * activas, alumnos incluidos. Por eso la identidad SIEMPRE entra como `uid` y el email destino sale
 * de `auth.users` — nunca del body ni del formulario.
 */

type Db = SupabaseClient<Database>

/** Acción de `admin_audit_logs` que hace de ledger del reenvío (y de traza operativa). */
export const CONFIRMATION_RESEND_AUDIT_ACTION = 'coach.confirmation_resent'

/** Silencio mínimo entre dos reenvíos del MISMO uid. */
export const CONFIRMATION_RESEND_COOLDOWN_SECONDS = 60

/** Tope de reenvíos por uid en la ventana de 24 h. */
export const CONFIRMATION_RESEND_DAILY_LIMIT = 5

/** Ventana del tope diario (y lookback de la lectura del ledger). */
export const CONFIRMATION_RESEND_WINDOW_HOURS = 24

const SECOND_MS = 1000
const COOLDOWN_MS = CONFIRMATION_RESEND_COOLDOWN_SECONDS * SECOND_MS
const WINDOW_MS = CONFIRMATION_RESEND_WINDOW_HOURS * 60 * 60 * SECOND_MS

/**
 * Techo de filas leídas. El ledger es append-only y compartido con la auditoría del admin: se leen
 * las últimas `DAILY_LIMIT + 1` del uid, que es todo lo que la decisión necesita.
 */
const LEDGER_SCAN_LIMIT = CONFIRMATION_RESEND_DAILY_LIMIT + 1

export type CoachConfirmationTarget =
    | { status: 'ok'; email: string; coachName: string }
    /** El uid no resuelve a un coach (o el usuario de auth no tiene email). */
    | { status: 'not_found' }
    /** El coach existe pero ya salió de `pending_email`: no hay nada que reenviar. */
    | { status: 'already_confirmed' }

/**
 * Guards 1-3: el uid existe en `coaches`, está en `pending_email`, y el email destino es el de
 * `auth.users` de ESE uid. Sin uid resoluble no se genera ningún link.
 *
 * Defensa en profundidad sobre el guard 2: si `auth.users.email_confirmed_at` ya está seteado, la
 * confirmación ocurrió pase lo que pase en `coaches`. La fila del coach puede quedar regresada a
 * `pending_email` (un rollback a medias, un backfill torcido, una edición manual en el panel) y en
 * ese estado el reenvío mandaría un magic-link válido a una cuenta ya activa. GoTrue es la fuente
 * de verdad de la confirmación; `coaches.subscription_status` solo la refleja.
 */
export async function resolveCoachConfirmationTarget(
    admin: Db,
    userId: string
): Promise<CoachConfirmationTarget> {
    const { data: authUser } = await admin.auth.admin.getUserById(userId)
    const email = authUser?.user?.email
    if (!email) return { status: 'not_found' }
    if (authUser?.user?.email_confirmed_at) return { status: 'already_confirmed' }

    const { data: coach } = await admin
        .from('coaches')
        .select('full_name, subscription_status')
        .eq('id', userId)
        .maybeSingle()

    if (!coach) return { status: 'not_found' }
    if (coach.subscription_status !== 'pending_email') return { status: 'already_confirmed' }

    return { status: 'ok', email, coachName: coach.full_name ?? '' }
}

export type ResendThrottleDecision =
    | { allowed: true }
    | { allowed: false; reason: 'cooldown' | 'daily_cap'; retryAfterSeconds: number }

/**
 * Guard 4 (parte pura): decide si este uid puede pedir otro reenvío.
 *
 * Dos frenos, en orden: cooldown de 60 s contra el último envío y tope de 5 en 24 h. El
 * `retryAfterSeconds` del tope es el tiempo hasta que el envío más viejo de los 5 salga de la
 * ventana — así el coach recibe un número honesto y no un "intenta más tarde" opaco.
 */
export function evaluateResendThrottle(input: {
    /** Timestamps ISO de los reenvíos previos del uid (orden indistinto). */
    sentAtIso: readonly string[]
    now: Date
}): ResendThrottleDecision {
    const nowMs = input.now.getTime()
    const stamps = input.sentAtIso
        .map((iso) => new Date(iso).getTime())
        .filter((ms) => Number.isFinite(ms) && ms <= nowMs && nowMs - ms < WINDOW_MS)
        .sort((a, b) => b - a)

    const last = stamps[0]
    if (last !== undefined && nowMs - last < COOLDOWN_MS) {
        return {
            allowed: false,
            reason: 'cooldown',
            retryAfterSeconds: Math.max(1, Math.ceil((COOLDOWN_MS - (nowMs - last)) / SECOND_MS)),
        }
    }

    if (stamps.length >= CONFIRMATION_RESEND_DAILY_LIMIT) {
        const oldestCounted = stamps[CONFIRMATION_RESEND_DAILY_LIMIT - 1]!
        return {
            allowed: false,
            reason: 'daily_cap',
            retryAfterSeconds: Math.max(1, Math.ceil((oldestCounted + WINDOW_MS - nowMs) / SECOND_MS)),
        }
    }

    return { allowed: true }
}

export type ConfirmationResendLedgerRead =
    | { ok: true; sentAtIso: string[] }
    | { ok: false; error: string }

/**
 * Guard 4 (parte de I/O): últimos reenvíos del uid dentro de la ventana.
 *
 * FAIL-CLOSED en el caller (a diferencia del ledger de correos de W2.9, que es fail-open): acá el
 * ledger no es un dedupe de conveniencia, es el limitador. Y el costo de cerrar es casi nulo — si
 * la DB no responde, `resolveCoachConfirmationTarget` tampoco iba a resolver el destino, así que la
 * alternativa "fail-open" no habría mandado ningún correo igual, solo habría gastado un
 * `generateLink` por request.
 */
export async function readConfirmationResendTimestamps(
    admin: Db,
    userId: string,
    now: Date
): Promise<ConfirmationResendLedgerRead> {
    const sinceIso = new Date(now.getTime() - WINDOW_MS).toISOString()
    const { data, error } = await admin
        .from('admin_audit_logs')
        .select('created_at')
        .eq('action', CONFIRMATION_RESEND_AUDIT_ACTION)
        .eq('target_id', userId)
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(LEDGER_SCAN_LIMIT)

    if (error) return { ok: false, error: error.message }
    return { ok: true, sentAtIso: (data ?? []).map((row) => row.created_at) }
}

/**
 * RESERVA del cupo: se escribe ANTES de enviar, no después. El ledger cuenta INTENTOS, no éxitos.
 *
 * Es lo contrario de `sendSalesEmailOnce` a propósito. Allá el ledger es un dedupe (que un correo
 * fallido no quede marcado como enviado); acá es el LIMITADOR, y un limitador que solo cuenta
 * éxitos no limita nada: cada intento que revienta después de este punto —`generateLink`, la red de
 * Resend, un timeout— dejaría la ventana intacta y el botón podría volver a disparar `generateLink`
 * sin techo. `generateLink` es la operación cara y la que emite el token, así que el cupo se cobra
 * al reservarlo. El precio es el caso simétrico: si el envío falla, la fila queda y el coach espera
 * su cooldown por un correo que nunca salió. Se paga: son 60 s contra una vía libre.
 *
 * `surface` distingue web/móvil en la traza pero NO particiona el cupo: es la misma persona y la
 * misma casilla, así que las dos superficies comparten los 5 de la ventana. Nunca lanza — un fallo
 * de auditoría no puede convertir un correo entregado en un error para el coach (y el fail-open de
 * este caso es deliberado: sin fila, el peor escenario es un reenvío de más, no una cuenta muerta).
 */
export async function recordConfirmationResend(
    admin: Db,
    userId: string,
    surface: 'web' | 'mobile'
): Promise<void> {
    const payload: Record<string, Json> = { surface }
    const { error } = await admin.from('admin_audit_logs').insert({
        admin_email: 'system',
        action: CONFIRMATION_RESEND_AUDIT_ACTION,
        target_table: 'coaches',
        target_id: userId,
        payload: payload as Json,
    })
    if (error) {
        // Sin PII: ni email ni uid (el uid es la única credencial que acepta el reenvío móvil).
        console.error('[resend-confirmation] ledger write failed:', error.message)
    }
}
