/**
 * student-access-copy — espejo RN 1:1 de los copys y el mapper de errores del gate de acceso de
 * ALUMNOS por suscripcion del coach (fuente de verdad: apps/web/src/lib/student-access.ts — NO
 * driftar). Modulo PURO: cero imports de react-native/expo/supabase => testeable con vitest.
 *
 * Politica CEO 2026-07-18: gracia de 7 dias desde el fin del periodo pagado; durante la gracia el
 * alumno es 100% funcional + banner discreto; post-gracia SOLO-LECTURA (ve plan/historial/rachas,
 * no registra) — la UI explica con estos copys, el guard duro vive en DB (COACH_ACCOUNT_PAUSED).
 */

/** Codigo que emiten los guards (RPC/RLS/API) cuando el coach no tiene acceso efectivo. */
export const COACH_ACCOUNT_PAUSED_CODE = 'COACH_ACCOUNT_PAUSED'

/** Copys canonicos (espejo del STUDENT_ACCESS_COPY web). */
export const STUDENT_ACCESS_COPY = {
    /** Banner discreto del alumno durante la gracia (home). Sin countdown por decision CEO. */
    graceBanner: 'Tu coach está poniendo al día su cuenta. Tu acceso sigue funcionando con normalidad.',
    /** Estado post-gracia (solo-lectura): titulo + cuerpo honestos, sin culpar al alumno. */
    pausedTitle: 'La cuenta de tu coach está en pausa',
    pausedBody: 'Tu progreso está guardado y podrás retomarlo apenas se reactive.',
    pausedHint: 'Mientras tanto puedes revisar tu plan y tu historial de entrenamientos.',
    /** Error humano cuando un guardado rebota por COACH_ACCOUNT_PAUSED. */
    pausedWriteError:
        'La cuenta de tu coach está en pausa, así que por ahora no se pueden guardar registros nuevos. Tu plan y tu historial siguen disponibles.',
} as const

/** ¿Este error (string / Error / envelope) es el rebote COACH_ACCOUNT_PAUSED? */
export function isCoachAccountPausedError(raw: unknown): boolean {
    if (raw == null) return false
    const msg =
        typeof raw === 'string'
            ? raw
            : raw instanceof Error
              ? raw.message
              : typeof (raw as { error?: unknown }).error === 'string'
                ? (raw as { error: string }).error
                : typeof (raw as { code?: unknown }).code === 'string'
                  ? (raw as { code: string }).code
                  : ''
    return msg.includes(COACH_ACCOUNT_PAUSED_CODE)
}

/**
 * Mapea un error de escritura del alumno a copy humano: COACH_ACCOUNT_PAUSED => mensaje honesto de
 * pausa; si no, `fallback` (o el string original). La UI nunca muestra el codigo tecnico crudo.
 */
export function humanizeStudentWriteError(raw: unknown, fallback?: string): string {
    if (isCoachAccountPausedError(raw)) return STUDENT_ACCESS_COPY.pausedWriteError
    if (typeof raw === 'string' && raw.length > 0) return raw
    return fallback ?? 'No se pudo completar la acción. Intenta nuevamente.'
}
