/**
 * student-access — copys + helpers PUROS del gate de acceso de ALUMNOS por suscripcion del coach
 * (politica CEO 2026-07-18). Client-safe: cero imports de server/DB, usable en client components.
 *
 * Politica:
 *  - Un alumno accede normal si su coach tiene acceso efectivo (hasEffectiveAccess) O esta dentro
 *    de la GRACIA: STUDENT_ACCESS_GRACE_DAYS dias desde que TERMINO el periodo pagado
 *    (coalesce(paid_access_ended_at, current_period_end)), NO desde el deploy.
 *  - Durante la gracia: alumno 100% funcional + banner discreto (sin countdown agresivo).
 *  - Post-gracia: SOLO-LECTURA (ve plan/historial/rachas; no registra). NUNCA 404, NUNCA borrar datos.
 *
 * Contrato de headers (los setea el branch `/c` del proxy — capa B1; esta capa solo CONSUME):
 *  - `x-student-access-state`: 'grace' cuando el alumno esta en la ventana de gracia; 'readonly'
 *    cuando post-gracia el proxy sirve una superficie de LECTURA permitida (dashboard / detalle del
 *    plan / historial / perfil — el resto redirige a /suspended?reason=coach). Ausente u otro
 *    valor => sin banner (fail-quiet: la UI nunca inventa un estado que el proxy no afirmo).
 *  - `x-student-access-grace-until`: ISO del fin de la gracia (informativo; el banner del alumno NO
 *    muestra countdown por decision CEO — la presion vive en el dashboard del COACH).
 * Kill-switch STUDENT_ACCESS_GATE (Edge Config): lo evalua el proxy/actions; apagado => no llegan
 * headers ni redirects y esta UI queda inerte. La RLS no lee Edge Config (guard duro DB aparte).
 */

// Import + re-export: un solo modulo de entrada para el gate de alumnos (el resolver de acceso
// efectivo del coach vive en coach-subscription-gate y es la misma verdad que usa el proxy).
// `resolveStudentAccessState` lo consume como binding local, ademas de re-exportarlo.
import { hasEffectiveAccess } from '@/lib/coach-subscription-gate'
export { hasEffectiveAccess }

/** Dias de gracia post fin del periodo pagado (espejo del anchor de la migracion B-datos). */
export const STUDENT_ACCESS_GRACE_DAYS = 7

/** Codigo que emiten los guards (actions/RPC/RLS) cuando el coach no tiene acceso efectivo. */
export const COACH_ACCOUNT_PAUSED_CODE = 'COACH_ACCOUNT_PAUSED'

/** Headers del contrato proxy → layout/pages del arbol `/c`. */
export const STUDENT_ACCESS_STATE_HEADER = 'x-student-access-state'
export const STUDENT_ACCESS_GRACE_UNTIL_HEADER = 'x-student-access-grace-until'

/** Copys canonicos (espejados 1:1 en RN: apps/mobile/lib/student-access-copy.ts — NO driftar). */
export const STUDENT_ACCESS_COPY = {
    /** Banner discreto del alumno durante la gracia (layout /c). */
    graceBanner: 'Tu coach está poniendo al día su cuenta. Tu acceso sigue funcionando con normalidad.',
    /** Pantalla /suspended?reason=coach — honesta y calmada, sin culpar al alumno. */
    pausedTitle: 'La cuenta de tu coach está en pausa',
    pausedBody: 'Tu progreso está guardado y podrás retomarlo apenas se reactive.',
    pausedHint: 'Mientras tanto puedes revisar tu plan y tu historial de entrenamientos.',
    /** Error humano cuando un guardado rebota por COACH_ACCOUNT_PAUSED. */
    pausedWriteError:
        'La cuenta de tu coach está en pausa, así que por ahora no se pueden guardar registros nuevos. Tu plan y tu historial siguen disponibles.',
} as const

/**
 * Fin de la gracia de los ALUMNOS: coalesce(paid_access_ended_at, current_period_end) + 7 dias.
 * `null` si no hay ancla (p.ej. period_end NULLeado sin backfill) — la UI degrada a copy sin fecha.
 */
export function resolveStudentGraceEndsAt(
    paidAccessEndedAt: string | null | undefined,
    currentPeriodEnd: string | null | undefined
): Date | null {
    const anchor = paidAccessEndedAt ?? currentPeriodEnd
    if (!anchor) return null
    const t = new Date(anchor).getTime()
    if (Number.isNaN(t)) return null
    return new Date(t + STUDENT_ACCESS_GRACE_DAYS * 86_400_000)
}

/** Fecha corta legible es-CL para banners ("25 de julio"). */
export function formatStudentAccessDate(d: Date): string {
    return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })
}

// ── Resolver PURO de estado (B1) ──────────────────────────────────────────────
// Client-safe: reusa `hasEffectiveAccess` (funcion pura) + `resolveStudentGraceEndsAt`. Sin red/DB.

export type StudentAccessState = 'ok' | 'grace' | 'readonly'

export interface StudentAccessResult {
    state: StudentAccessState
    /** Fin de la ventana de gracia (ISO); null si `ok` o si no hay ancla. */
    graceEndsAt: string | null
}

/** Columnas de suscripcion del coach que alimentan el gate. Contrato B2: `paid_access_ended_at`. */
export interface CoachAccessColumns {
    subscription_status: string | null | undefined
    current_period_end: string | null | undefined
    paid_access_ended_at: string | null | undefined
}

/**
 * Funcion PURA (sin red, sin DB, sin Edge Config; `now` inyectable). Decide el estado del alumno a
 * partir de la suscripcion del coach:
 *  - `ok`      → coach con acceso efectivo (managed org/team/enterprise, free vigente, activo, o la
 *               gracia de dunning PROPIA del coach vigente por `current_period_end`).
 *  - `grace`   → coach sin acceso efectivo pero dentro de los 7 dias desde el fin del periodo pagado.
 *  - `readonly`→ post-gracia, o sin ancla conocida → solo lectura (jamas 404).
 */
export function resolveStudentAccessState(
    coach: CoachAccessColumns,
    now: number = Date.now(),
): StudentAccessResult {
    if (hasEffectiveAccess(coach.subscription_status, coach.current_period_end)) {
        return { state: 'ok', graceEndsAt: null }
    }
    const end = resolveStudentGraceEndsAt(coach.paid_access_ended_at, coach.current_period_end)
    if (!end) return { state: 'readonly', graceEndsAt: null }
    const graceEndsAt = end.toISOString()
    return now < end.getTime()
        ? { state: 'grace', graceEndsAt }
        : { state: 'readonly', graceEndsAt }
}

/** ¿Este error (string / Error / envelope de action) es el rebote COACH_ACCOUNT_PAUSED? */
export function isCoachAccountPausedError(raw: unknown): boolean {
    if (raw == null) return false
    const msg =
        typeof raw === 'string'
            ? raw
            : raw instanceof Error
              ? raw.message
              : typeof (raw as { error?: unknown }).error === 'string'
                ? ((raw as { error: string }).error)
                : typeof (raw as { code?: unknown }).code === 'string'
                  ? ((raw as { code: string }).code)
                  : ''
    return msg.includes(COACH_ACCOUNT_PAUSED_CODE)
}

/**
 * Mapea un error de escritura del alumno a copy humano: si es COACH_ACCOUNT_PAUSED devuelve el
 * mensaje honesto de pausa; si no, devuelve `fallback` (o el string original). Punto unico de
 * humanizacion — los guards de DB/actions emiten el codigo tecnico, la UI nunca lo muestra crudo.
 */
export function humanizeStudentWriteError(raw: unknown, fallback?: string): string {
    if (isCoachAccountPausedError(raw)) return STUDENT_ACCESS_COPY.pausedWriteError
    if (typeof raw === 'string' && raw.length > 0) return raw
    return fallback ?? 'No se pudo completar la acción. Intenta nuevamente.'
}
