/**
 * target-date — validación pura de la fecha objetivo para la edición de un día PASADO (Ola 1,
 * decisión CEO 10). Compartida entre la query (`workout-execution.queries.ts`, ventana de logs de
 * esa fecha) y la action (`workout-log.actions.ts`, modo solo-UPDATE). Sin acceso a red ni fecha
 * del sistema: el "hoy Santiago" se INYECTA (`todayIso`) para que sea determinista y testeable.
 *
 * Regla: `yyyy-mm-dd` estricto y calendario real (rechaza `2026-13-40`), fecha PASADA u HOY; el
 * FUTURO se rechaza (imposible pre-cargar adherencia). La comparación con `todayIso` es lexicográfica
 * — segura para el formato `yyyy-mm-dd` zero-padded (mismo orden que el cronológico).
 */

export type TargetDateValidation =
    | { ok: true; iso: string }
    | { ok: false; reason: 'format' | 'future' }

const ISO_YMD = /^\d{4}-\d{2}-\d{2}$/

/**
 * Valida una fecha objetivo ISO `yyyy-mm-dd` contra `todayIso` (día ya resuelto en Santiago).
 * `format` = patrón inválido o fecha de calendario inexistente; `future` = posterior a hoy.
 */
export function validateTargetDate(input: string, todayIso: string): TargetDateValidation {
    if (!ISO_YMD.test(input)) return { ok: false, reason: 'format' }

    // Calendario real: `new Date(Date.UTC(...))` normaliza desbordes (mes 13 → año+1), así que
    // re-verificamos que los componentes sobrevivan intactos → descarta 2026-02-30, 2026-13-01, etc.
    const [y, m, d] = input.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d))
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
        return { ok: false, reason: 'format' }
    }

    if (input > todayIso) return { ok: false, reason: 'future' }
    return { ok: true, iso: input }
}

/**
 * Resuelve el parámetro `repetir` (repetir HOY un día hecho en OTRA fecha, con las series
 * precargadas). Devuelve la fecha PASADA válida o `null` cuando no debe sembrarse nada.
 *
 * Descartes: entrada ausente/no string, formato o calendario inválidos, futuro, y HOY MISMO — el
 * índice único de logs es por día, así que repetir hoy sobre hoy pisaría la misma fila (decisión
 * CEO). La exclusión contra el modo edición (`fecha`) se resuelve en la página, no acá.
 */
export function resolveRepeatDate(input: string | undefined | null, todayIso: string): string | null {
    if (typeof input !== 'string') return null
    const check = validateTargetDate(input, todayIso)
    if (!check.ok) return null
    if (check.iso === todayIso) return null
    return check.iso
}
