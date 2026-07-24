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
    pausedTitle: 'Tu cuenta está en pausa',
    pausedBody: 'El plan de tu coach está inactivo. Escríbele para reactivar tu acceso.',
    pausedHint: 'Tu progreso está guardado y te espera cuando tu coach reactive su cuenta.',
    /** Error humano cuando un guardado rebota por COACH_ACCOUNT_PAUSED. */
    pausedWriteError:
        'La cuenta de tu coach está en pausa, así que por ahora no se pueden guardar registros nuevos. Tu plan y tu historial siguen disponibles.',
    /**
     * Bloqueo TOTAL post-gracia (executor-v3 decision 9, mockup "Bloqueo total" v3.3): pantalla
     * fullscreen calma al login pasados los 7 dias — ni dashboard ni plan ni historial. Un solo
     * camino: escribirle al coach para reactivar. Tono cuidado (esta en pausa, no bloqueada; nunca
     * culpa al alumno). Espejo del contrato web (apps/web/src/lib/student-access.ts / /suspended).
     */
    blockScreen: {
        /** Standalone (coach): titulo + cuerpo del mockup, framing "en pausa". */
        title: 'Tu cuenta está en pausa',
        body: 'El plan de tu coach está inactivo. Escríbele para reactivar tu acceso.',
        /** Contexto pool/team: la pausa la gestiona el dueño del equipo (sin WhatsApp personal). */
        bodyTeam: 'El acceso de tu equipo está en pausa. Contacta a tu equipo para reactivar tu acceso.',
        /** CTA unico hacia el coach (solo standalone con WhatsApp cargado). */
        contactCta: 'Escribir a mi coach',
        /** Salida secundaria calma (link, no boton principal). */
        logout: 'Cerrar sesión',
    },
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
