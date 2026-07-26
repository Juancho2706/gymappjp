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
 *   - `?repetir=YYYY-MM-DD`  → repetir HOY un día ya hecho en OTRA fecha: el ejecutor abre precargado
 *                               con los valores registrados ese día (editables) y guarda como una
 *                               instancia NUEVA de hoy — los registros del día original no se tocan.
 *                               Si la fecha es inválida, futura o igual a hoy se ignora (abre normal).
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

/**
 * `${base}/workout/${planId}?repetir=YYYY-MM-DD` — repetir HOY un día hecho en OTRA fecha, con las
 * series precargadas con lo registrado ese día (instancia nueva; el día original queda intacto).
 * Sin `fecha` devuelve la URL desnuda (arrancar de cero), que es el comportamiento previo.
 */
export function buildWorkoutRepeatHref(base: string, planId: string, fecha?: string): string {
    return fecha ? `${base}/workout/${planId}?repetir=${fecha}` : `${base}/workout/${planId}`
}

/** `${base}/workout/${planId}?desde=hecho` — tap en un día hecho HOY (el ejecutor lo ignora por ahora). */
export function buildWorkoutFromDoneHref(base: string, planId: string): string {
    return `${base}/workout/${planId}?desde=hecho`
}

/**
 * Href del botón "Revisar y editar" del sheet de doble intención (día ya hecho).
 *
 * Incidente 2026-07-26 (alumno perdió las series de su entreno): un día recuperado HOY —celda de
 * otro día de la semana, `doneOnDate` = hoy— abría `?fecha=<hoy>`, es decir el modo solo-UPDATE del
 * día pasado, que JAMÁS inserta: cada serie nueva moría con `past_set_not_found` y la cola offline
 * la descartaba como fallo permanente. Por eso `?fecha=` queda reservado a sesiones REALMENTE
 * pasadas (anti-farmeo de adherencia retroactiva, decisión de diseño intacta); si la sesión es de
 * HOY el upsert normal es seguro e idéntico a entrar sin query.
 *
 * @param sessionDate  Fecha REAL de la sesión: `doneOnDate` si el día se recuperó en otra fecha, si
 *                     no la fecha de la celda.
 * @param todayIso     Hoy en Santiago (`getTodayInSantiago().iso`).
 * @param isTodayCell  La celda es la de HOY (ya hecha) → flujo normal de hoy aunque `sessionDate`
 *                     venga atribuida a otra fecha.
 */
export function buildWorkoutDoneEditHref(
    base: string,
    planId: string,
    sessionDate: string,
    todayIso: string,
    isTodayCell = false
): string {
    return isTodayCell || sessionDate === todayIso
        ? buildWorkoutFromDoneHref(base, planId)
        : buildWorkoutEditHref(base, planId, sessionDate)
}

/** `${base}/workout/${planId}?recuperar=YYYY-MM-DD` — abrir un pendiente de la semana con banner. */
export function buildWorkoutRecoverHref(base: string, planId: string, fecha: string): string {
    return `${base}/workout/${planId}?recuperar=${fecha}`
}
