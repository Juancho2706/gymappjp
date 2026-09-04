/**
 * Etiqueta ÚNICA del día de un programa — "Lun" en `weekly`, "Día 1 de 3" en `cycle` (spec
 * `docs/specs/ciclo-real-y-por-lado`, R8/R31).
 *
 * Qué resuelve: `workout_plans.day_of_week` guarda ISODOW en `weekly` e ÍNDICE del ciclo en `cycle`,
 * y las 7 implementaciones ad-hoc que la pintaban (`WorkoutPlanCard.tsx:20`,
 * `profileProgramUtils.ts:81`, `program-model.ts:93`…) leían siempre el número como día de la semana:
 * el alumno de un ciclo de 3 días veía "Lun / Mar / Mié" y el de un ciclo de 14 veía los días 8..14
 * colapsados sobre los 7 primeros. Acá se resuelven las dos semánticas en un solo lugar.
 *
 * FORMAS:
 *   · `short` — `Lun` / `Día 1`. Texto corto de listas y cards.
 *   · `long`  — `Lunes` / `Día 1 de 3`. Títulos y encabezados.
 *   · `chip`  — `Lun` / `D1`. **En weekly devuelve las MISMAS 3 letras que hoy** (R31): el chip de
 *     34 px de la biblioteca no cambia para los 276 programas weekly. Una inicial suelta ("L") sería
 *     una regresión visual sin aceptación que la atrape. Sólo `cycle` estrena forma corta (`D1`).
 *
 * TILDES: `Mié` y `Sáb` las llevan en las tres formas (hoy `program-model.ts:93` pinta "Mie"/"Sab":
 * esa deuda muere acá), y `Día` la lleva en `short`/`long` de ciclo.
 *
 * FUERA DE RANGO: devuelve cadena VACÍA — nunca lanza ni interpola `undefined` en la UI.
 */

export type ProgramDayLabelForm = 'short' | 'long' | 'chip'

/** Estructura del programa. `null`/ausente = weekly (espejo del default de `WorkoutProgramSchema`). */
export type ProgramDayLabelStructure = 'weekly' | 'cycle' | null

const WEEKDAY_SHORT = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const
const WEEKDAY_LONG = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] as const

/** Tope duro de días de un ciclo (R8): 1..14. */
const MAX_CYCLE_INDEX = 14

/** Largo legacy de los ciclos sin `cycle_length` (espejo del fallback del schema). */
const LEGACY_CYCLE_LENGTH = 7

function isIndexInRange(value: number | null, max: number): boolean {
    return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= max
}

/**
 * Etiqueta del día `dayOfWeek` según la estructura del programa.
 *
 * @param dayOfWeek ISODOW 1..7 en `weekly`; índice del ciclo 1..14 en `cycle`.
 * @param structure `weekly` | `cycle` | `null` (= weekly).
 * @param cycleLength Largo del ciclo 1..14; `null` ⇒ fallback legacy de 7 en la forma `long`.
 * @param opts.form `short` | `long` | `chip`.
 * @returns La etiqueta, o cadena vacía si el día está fuera de rango.
 */
export function programDayLabel(
    dayOfWeek: number | null,
    structure: ProgramDayLabelStructure,
    cycleLength: number | null,
    opts: { form: ProgramDayLabelForm }
): string {
    const form = opts.form

    if (structure !== 'cycle') {
        if (!isIndexInRange(dayOfWeek, 7)) return ''
        const index = (dayOfWeek as number) - 1
        // `chip` weekly = `short` weekly (R31): el chip de 34 px conserva las 3 letras de hoy.
        return form === 'long' ? WEEKDAY_LONG[index] : WEEKDAY_SHORT[index]
    }

    if (!isIndexInRange(dayOfWeek, MAX_CYCLE_INDEX)) return ''
    const index = dayOfWeek as number
    if (form === 'chip') return `D${index}`
    if (form === 'short') return `Día ${index}`

    const total = isIndexInRange(cycleLength, MAX_CYCLE_INDEX) ? (cycleLength as number) : LEGACY_CYCLE_LENGTH
    // Un índice mayor que el largo del ciclo (dato inconsistente: el coach lo acortó después) se
    // muestra sin el "de N" — decir "Día 8 de 7" sería mentir sobre el programa.
    return index > total ? `Día ${index}` : `Día ${index} de ${total}`
}
