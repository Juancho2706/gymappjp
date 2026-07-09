/**
 * Resolución del tipo efectivo de un bloque + formateo compacto de la prescripción tipada.
 *
 * Motor PURO compartido web/mobile (sin React/Next/RN). Espejo de la lógica pura de
 * `apps/web/src/lib/workout-exercise-type.ts` — acá viven SOLO las funciones sin UI (el mapa
 * `EXERCISE_TYPE_META` con iconos lucide queda en web/mobile por ser presentación). Extraído para
 * que la ejecución polimórfica del alumno (cardio/movilidad/roller) comparta la resolución de tipo y
 * el formateo de objetivos sin drift (E2-10).
 *
 * Decisión #2 del PLAN (specs/movida-entrenamiento):
 *   effectiveExerciseType(block, exercise) =
 *     block.exercise_type_override ?? exercise.exercise_type ?? 'strength'.
 */

export type ExerciseType = 'strength' | 'cardio' | 'mobility' | 'roller'

export const EXERCISE_TYPES: readonly ExerciseType[] = ['strength', 'cardio', 'mobility', 'roller']

/** Etiquetas es-neutro de los tipos. */
export const EXERCISE_TYPE_LABEL: Record<ExerciseType, string> = {
    strength: 'Fuerza',
    cardio: 'Cardio',
    mobility: 'Movilidad',
    roller: 'Foam roller',
}

/** Etiquetas es-neutro del modo de lado (per_side/alternating). */
export const SIDE_LABEL: Record<string, string> = {
    per_side: 'Por lado',
    alternating: 'Alternado',
}

function asExerciseType(raw: string | null | undefined): ExerciseType | null {
    return raw && (EXERCISE_TYPES as readonly string[]).includes(raw) ? (raw as ExerciseType) : null
}

/** Subconjunto de un bloque necesario para detectar prescripción tipada. */
export interface TypedBlockFields {
    exercise_type_override?: string | null
    side_mode?: string | null
    reps_value?: number | null
    reps_unit?: string | null
    load_value?: number | null
    load_unit?: string | null
    distance_value?: number | null
    distance_unit?: string | null
    duration_sec?: number | null
    target_pace_sec_per_km?: number | null
    hr_zone?: number | null
    interval_config?: unknown
    sets?: number | null
    reps?: string | null
}

/**
 * Tipo efectivo del bloque: override del bloque > tipo del ejercicio > 'strength'.
 * Un bloque legacy (sin override, ejercicio sin tipo) SIEMPRE resuelve 'strength'.
 */
export function effectiveExerciseType(
    block: { exercise_type_override?: string | null } | null | undefined,
    exercise: { exercise_type?: string | null } | null | undefined,
): ExerciseType {
    return (
        asExerciseType(block?.exercise_type_override) ??
        asExerciseType(exercise?.exercise_type) ??
        'strength'
    )
}

/** ¿El bloque tiene prescripción tipada (más allá de sets×reps legacy)? */
export function hasTypedPrescription(block: TypedBlockFields): boolean {
    return (
        (block.duration_sec != null && block.duration_sec > 0) ||
        (block.distance_value != null && block.distance_value > 0) ||
        block.hr_zone != null ||
        block.target_pace_sec_per_km != null ||
        block.interval_config != null ||
        (block.reps_value != null && block.reps_unit != null && block.reps_unit !== 'reps')
    )
}

/** "90" → "90s" · "300" → "5min" · "75" → "1m15s". Compacto para chips/cards. */
export function compactDuration(totalSec: number): string {
    const sec = Math.max(0, Math.round(totalSec))
    if (sec < 60 || sec % 60 !== 0) {
        if (sec >= 60) {
            const m = Math.floor(sec / 60)
            const s = sec % 60
            return `${m}m${String(s).padStart(2, '0')}s`
        }
        return `${sec}s`
    }
    return `${sec / 60}min`
}

/** "5000 m" → "5km" · "400 m" → "400m" · "7.5 m" → "7.5m". */
export function compactDistance(value: number, unit: string | null | undefined): string {
    if (unit === 'km') return `${value}km`
    if (value >= 1000 && value % 100 === 0) return `${value / 1000}km`
    return `${value}m`
}
