import { programWeekIndex1Based } from './programWeekVariant'

/**
 * Sobrecarga progresiva — motor de target efectivo del alumno.
 *
 * El coach setea en cada bloque `progression_type` ('weight'|'reps') + `progression_value`
 * (incremento). Hoy el alumno veía el peso BASE fijo y un cartel informativo; este motor
 * calcula el peso OBJETIVO real del día según el modo de progresión.
 *
 * `progression_mode` (futuro, columna `workout_blocks.progression_mode`) elige el algoritmo.
 * v1: solo `weekly_linear` tiene motor; el resto cae a no-op (muestra base) y el selector del
 * builder los deshabilita ("Próximamente"). Agregar un modo = sumar un `case` acá + su dato en
 * el contexto, sin re-migrar.
 */

export const PROGRESSION_MODES = ['weekly_linear', 'double', 'session_linear', 'adaptive'] as const
export type ProgressionMode = (typeof PROGRESSION_MODES)[number]

export const DEFAULT_PROGRESSION_MODE: ProgressionMode = 'weekly_linear'

/** Modos con motor implementado HOY. El builder deshabilita el resto. */
export const IMPLEMENTED_PROGRESSION_MODES: ReadonlySet<ProgressionMode> = new Set<ProgressionMode>([
    'weekly_linear',
])

export function isProgressionMode(v: unknown): v is ProgressionMode {
    return typeof v === 'string' && (PROGRESSION_MODES as readonly string[]).includes(v)
}

/** Normaliza el valor crudo de DB a un modo válido (default si null/desconocido). */
export function normalizeProgressionMode(v: unknown): ProgressionMode {
    return isProgressionMode(v) ? v : DEFAULT_PROGRESSION_MODE
}

export interface ProgressionBlockInput {
    target_weight_kg: number | null
    progression_type: 'weight' | 'reps' | null
    progression_value: number | null
    progression_mode?: ProgressionMode | string | null
}

export interface ProgressionContext {
    /** Semana 1-based del programa (de `programWeekIndex1Based`). null si no se puede calcular. */
    currentWeek: number | null
    /** Tope de semanas del programa (`weeks_to_repeat`); la progresión no escala más allá. */
    weeksToRepeat?: number | null
}

export interface EffectiveTarget {
    /** Peso objetivo efectivo para HOY (kg). Igual a base cuando no aplica progresión. */
    weightKg: number | null
    /** Peso base que puso el coach (referencia para mostrar "base → hoy"). */
    baseWeightKg: number | null
    /** Cuánto se sumó al base (kg, ya redondeado). 0 = semana 1 o sin progresión. */
    addedKg: number
    /** Semanas transcurridas aplicadas (0-based, ya capadas al largo del programa). */
    weeksApplied: number
    /** El bloque progresa el peso Y el cálculo movió el número (addedKg > 0). */
    isProgressed: boolean
    /** El modo del bloque ya tiene motor (false ⇒ no-op seguro, muestra base). */
    modeImplemented: boolean
    /** Modo efectivo usado. */
    mode: ProgressionMode
}

/** Incremento mínimo de plato razonable: redondeo a 0.5 kg para no mostrar 51.25. */
export const KG_STEP = 0.5

function roundToStep(n: number, step = KG_STEP): number {
    return Math.round(n / step) * step
}

/**
 * Target de peso efectivo para el bloque HOY. PURO y determinista (testeable).
 * Conservador: ante cualquier dato faltante/raro devuelve el peso base (nunca rompe el plan).
 */
export function computeEffectiveTarget(
    block: ProgressionBlockInput,
    ctx: ProgressionContext
): EffectiveTarget {
    const mode = normalizeProgressionMode(block.progression_mode)
    const base = block.target_weight_kg
    const modeImplemented = IMPLEMENTED_PROGRESSION_MODES.has(mode)

    const noop: EffectiveTarget = {
        weightKg: base,
        baseWeightKg: base,
        addedKg: 0,
        weeksApplied: 0,
        isProgressed: false,
        modeImplemented,
        mode,
    }

    // v1: solo progresión de PESO tiene motor. reps → no-op (sigue como cartel informativo).
    if (block.progression_type !== 'weight') return noop
    const value = block.progression_value
    if (value == null || !Number.isFinite(value) || value <= 0) return noop
    if (base == null || !Number.isFinite(base)) return noop
    // Modo sin motor → no-op (muestra base). Evita "auto-progresar" algo que el coach eligió para C/D.
    if (!modeImplemented) return noop

    switch (mode) {
        case 'weekly_linear': {
            const week = ctx.currentWeek
            if (week == null || week < 1) return noop
            // Cap al largo del programa: la progresión no escala infinito si el alumno sigue post-fin.
            const cap = Math.max(1, Number(ctx.weeksToRepeat) || week)
            const cappedWeek = Math.min(week, cap)
            const weeksApplied = Math.max(0, cappedWeek - 1)
            if (weeksApplied === 0) return { ...noop, modeImplemented: true }
            const weightKg = roundToStep(base + weeksApplied * value)
            const addedKg = weightKg - base
            return {
                weightKg,
                baseWeightKg: base,
                addedKg,
                weeksApplied,
                isProgressed: addedKg > 0,
                modeImplemented: true,
                mode,
            }
        }
        default:
            return noop
    }
}
