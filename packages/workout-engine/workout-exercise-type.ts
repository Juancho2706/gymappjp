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

import type { IntervalConfig } from './workout-interval'

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

/**
 * Opciones del selector "Tipo de ejercicio" del formulario del coach (web + mobile).
 * Label descriptiva de los ejes que activa cada tipo en el builder / la app del alumno.
 * Fuente ÚNICA — antes vivía inline en el `ExerciseFormModal` web (E5-08).
 */
export const EXERCISE_TYPE_OPTIONS: readonly { value: ExerciseType; label: string }[] = [
    { value: 'strength', label: 'Fuerza (series × reps)' },
    { value: 'cardio', label: 'Cardio (duración / distancia / zona FC)' },
    { value: 'mobility', label: 'Movilidad (holds por lado)' },
    { value: 'roller', label: 'Foam roller (duración o pasadas)' },
]

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

function sideSuffix(sideMode: string | null | undefined): string {
    return sideMode === 'per_side' || sideMode === 'alternating' ? '/lado' : ''
}

function truncate20(text: string): string {
    return text.length <= 20 ? text : `${text.slice(0, 19)}…`
}

/**
 * Resumen legacy corto (≤20 chars, es-neutro) para persistir en `reps` cuando el coach
 * prescribe con campos tipados (decisión #3, expand-contract). Espejo EXACTO de
 * `apps/web/src/lib/workout-exercise-type.ts` → fuente compartida web+mobile (E5-06/E5-07).
 * NO se usa para bloques strength con reps manual (ahí el texto del coach manda — "8-10").
 */
export function legacyRepsSummaryFor(block: TypedBlockFields, type: ExerciseType): string {
    const side = sideSuffix(block.side_mode)
    const interval = block.interval_config as IntervalConfig | null | undefined

    if (type === 'cardio') {
        if (interval) {
            const work = interval.work.distance_m != null
                ? compactDistance(interval.work.distance_m, 'm')
                : interval.work.duration_sec != null
                    ? compactDuration(interval.work.duration_sec)
                    : ''
            const zone = block.hr_zone != null ? ` @ Z${block.hr_zone}` : ''
            if (work) return truncate20(`${interval.repeats}×${work}${zone}`)
        }
        const zone = block.hr_zone != null ? ` Z${block.hr_zone}` : ''
        if (block.duration_sec != null && block.duration_sec > 0) {
            return truncate20(`${compactDuration(block.duration_sec)}${zone}`)
        }
        if (block.distance_value != null && block.distance_value > 0) {
            return truncate20(`${compactDistance(block.distance_value, block.distance_unit)}${zone}`)
        }
        if (zone) return truncate20(zone.trim())
        return 'cardio'
    }

    if (type === 'mobility') {
        if (block.duration_sec != null && block.duration_sec > 0) {
            return truncate20(`${compactDuration(block.duration_sec)}${side}`)
        }
        if (block.reps_value != null && block.reps_value > 0) {
            const unit = block.reps_unit === 'breaths' ? ' resp' : ''
            return truncate20(`${block.reps_value}${unit}${side}`)
        }
        return block.reps?.trim() || 'movilidad'
    }

    if (type === 'roller') {
        if (block.reps_value != null && block.reps_value > 0 && block.reps_unit === 'passes') {
            return truncate20(`${block.reps_value} pasadas${side}`)
        }
        if (block.duration_sec != null && block.duration_sec > 0) {
            return truncate20(`${compactDuration(block.duration_sec)}${side}`)
        }
        return block.reps?.trim() || 'roller'
    }

    // strength: el texto manual del coach manda; el resumen solo cubre distancia (farmer carry)
    if (block.reps?.trim()) return block.reps.trim()
    if (block.distance_value != null && block.distance_value > 0) {
        return truncate20(`${compactDistance(block.distance_value, block.distance_unit)}${side}`)
    }
    return '—'
}

/**
 * Resumen visible por tipo para chips del builder/preview ("4×400m @ Z4", "30s ×3 por lado").
 * Devuelve null para bloques sin prescripción tipada — el caller renderiza el legacy
 * "sets × reps" EXACTAMENTE como hoy (anti-regresión AC3). Espejo de la web (E5-06).
 */
export function typedBlockSummary(block: TypedBlockFields, type: ExerciseType): string | null {
    if (type === 'strength' && !hasTypedPrescription(block)) return null
    if (type === 'strength') {
        // Fuerza con eje extra (ej. farmer carry): sets × reps + distancia
        const parts: string[] = []
        if (block.sets && block.reps) parts.push(`${block.sets}×${block.reps}`)
        if (block.distance_value != null && block.distance_value > 0) {
            parts.push(compactDistance(block.distance_value, block.distance_unit) + sideSuffix(block.side_mode))
        }
        return parts.length ? parts.join(' · ') : null
    }

    const base = legacyRepsSummaryFor(block, type)
    if (type === 'mobility' && block.sets && block.sets > 1) {
        return `${base} ×${block.sets}`
    }
    if (type === 'cardio' && !block.interval_config && block.sets && block.sets > 1) {
        return `${block.sets}× ${base}`
    }
    return base
}
