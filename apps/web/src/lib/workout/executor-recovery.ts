/**
 * executor-recovery — helpers PUROS de descubribilidad del ejecutor (Ola 1, decisión CEO 9-10):
 * construcción de URLs de la "doble intención" (día ya hecho) y de la recuperación de un día
 * pendiente, más el nombre del día de la semana a partir de una fecha ISO. Sin acceso a red ni a la
 * fecha del sistema → deterministas y testeables. Compartidos por el dashboard alumno (day-cards +
 * sheet doble intención) y por el ejecutor (banners "Editando" / "Recuperando").
 *
 * Convención de la query del ejecutor `/workout/[planId]`:
 *   - `?fecha=YYYY-MM-DD`     → editar los registros de un día PASADO (modo solo-UPDATE; ver
 *                               `workout-execution.queries.ts` + `workout-log.actions.ts`).
 *   - `?recuperar=YYYY-MM-DD` → SOLO visual: banner ámbar "Recuperando" (el guardado sigue siendo el
 *                               flujo normal de HOY; la atribución la resuelve `deriveWeekWorkoutStatus`).
 *   - `?desde=hecho`          → tap en un día hecho HOY: el ejecutor lo IGNORA por ahora (queda para
 *                               anteponer el resumen en una ola posterior).
 */

const WEEKDAYS_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const

const ISO_YMD = /^\d{4}-\d{2}-\d{2}$/

/**
 * Nombre completo del día de la semana (capitalizado, es-CL) de una fecha ISO `YYYY-MM-DD`. Usa
 * mediodía UTC para evitar cualquier corrimiento de zona horaria en el `getUTCDay`. Devuelve `''`
 * si el formato no es válido (el caller decide el fallback).
 */
export function weekdayNameFromIso(iso: string): string {
    if (!ISO_YMD.test(iso)) return ''
    const [y, m, d] = iso.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
    return WEEKDAYS_FULL[dt.getUTCDay()] ?? ''
}

/** "Hecho el jueves" — copy de atribución para la day-card recuperada (label ya en su forma completa). */
export function doneAttributionLabel(weekdayFull: string): string {
    return `Hecho el ${weekdayFull.toLowerCase()}`
}

/** `${base}/workout/${planId}?fecha=YYYY-MM-DD` — abrir el ejecutor para editar un día pasado. */
export function buildWorkoutEditHref(base: string, planId: string, fecha: string): string {
    return `${base}/workout/${planId}?fecha=${fecha}`
}

/** `${base}/workout/${planId}` — repetir hoy (instancia nueva; sin query). */
export function buildWorkoutRepeatHref(base: string, planId: string): string {
    return `${base}/workout/${planId}`
}

/** `${base}/workout/${planId}?desde=hecho` — tap en un día hecho HOY (el ejecutor lo ignora por ahora). */
export function buildWorkoutFromDoneHref(base: string, planId: string): string {
    return `${base}/workout/${planId}?desde=hecho`
}

/** `${base}/workout/${planId}?recuperar=YYYY-MM-DD` — abrir un pendiente de la semana con banner. */
export function buildWorkoutRecoverHref(base: string, planId: string, fecha: string): string {
    return `${base}/workout/${planId}?recuperar=${fecha}`
}
