/**
 * target-date — validación pura de la fecha objetivo para la edición de un día PASADO (Ola 1,
 * decisión CEO 10). Compartida por web (la query `workout-execution.queries.ts` que arma la ventana
 * de logs de esa fecha y la action `workout-log.actions.ts` en modo solo-UPDATE) y por RN (la ruta
 * `app/alumno/workout/[planId].tsx` + el motor `lib/workout-session.ts`). Sin acceso a red ni fecha
 * del sistema: el "hoy Santiago" se INYECTA (`todayIso`) para que sea determinista y testeable.
 *
 * Vivía en `apps/web/src/app/c/[coach_slug]/workout/[planId]/_data/target-date.ts` y bajó al paquete
 * SIN cambios de comportamiento cuando el editor de día pasado se portó a RN: mobile tenía una copia
 * parcial (`validateRepeatDate` en la ruta) que ya empezaba a driftear.
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
 * Copy ÚNICA del rechazo del modo solo-UPDATE: la serie que se intenta corregir no existe en esa
 * fecha, así que jamás se inserta (imposible farmear adherencia retroactiva). La devuelve la action
 * web (`code: 'past_set_not_found'`) y el motor RN (`logSet`), y la UI la muestra SIN "Reintentar":
 * no hay nada que reintentar, el registro no existe. Vive acá para que las dos plataformas no
 * driftéen el texto.
 */
export const PAST_SET_NOT_FOUND_ERROR = 'No existe un registro de esa serie para editar en esa fecha.'

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
