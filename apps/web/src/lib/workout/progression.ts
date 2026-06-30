import { programWeekIndex1Based } from './programWeekVariant'

/**
 * Sobrecarga progresiva — motor de target efectivo del alumno.
 *
 * El coach setea en cada bloque `progression_type` ('weight'|'reps') + `progression_value`
 * (incremento) + `progression_mode` (algoritmo). Hoy el alumno veía el peso BASE fijo y un
 * cartel informativo; este motor calcula el peso OBJETIVO real del día según el modo.
 *
 * Modos (columna `workout_blocks.progression_mode`, elección POR-EJERCICIO del coach):
 *  - `weekly_linear` (default): base + (semana-1) × incremento. Predecible, fiel al plan.
 *  - `double` (doble progresión): mantené el peso hasta completar el TOPE del rango de reps en
 *    todas las series; ahí subís el incremento. Adaptativo, ancla en la última sesión real.
 *  - `session_linear` / `adaptive`: reservados (sin motor → no-op seguro, el builder los oculta).
 *
 * Conservador por diseño: ante cualquier dato faltante/raro devuelve el peso base (nunca rompe
 * el plan). `double` es opt-in por-ejercicio → su blast radius se limita a lo que el coach eligió.
 */

export const PROGRESSION_MODES = ['weekly_linear', 'double', 'session_linear', 'adaptive'] as const
export type ProgressionMode = (typeof PROGRESSION_MODES)[number]

export const DEFAULT_PROGRESSION_MODE: ProgressionMode = 'weekly_linear'

/** Modos con motor implementado HOY. El builder ofrece solo estos; el resto queda "Próximamente". */
export const IMPLEMENTED_PROGRESSION_MODES: ReadonlySet<ProgressionMode> = new Set<ProgressionMode>([
    'weekly_linear',
    'double',
])

export function isProgressionMode(v: unknown): v is ProgressionMode {
    return typeof v === 'string' && (PROGRESSION_MODES as readonly string[]).includes(v)
}

/** Normaliza el valor crudo de DB a un modo válido (default si null/desconocido). */
export function normalizeProgressionMode(v: unknown): ProgressionMode {
    return isProgressionMode(v) ? v : DEFAULT_PROGRESSION_MODE
}

/**
 * Tope del rango de reps (para doble progresión). "8-12" → 12, "12" → 12, "10-12/lado" → 12.
 * Sin número (AMRAP, "máx", "al fallo") → null (no se puede doble-progresar por reps).
 */
export function parseRepsTop(reps: string | null | undefined): number | null {
    if (!reps) return null
    const nums = String(reps).match(/\d+/g)
    if (!nums || nums.length === 0) return null
    const top = Math.max(...nums.map(Number).filter(Number.isFinite))
    return Number.isFinite(top) && top > 0 ? top : null
}

export interface ProgressionBlockInput {
    target_weight_kg: number | null
    progression_type: 'weight' | 'reps' | null
    progression_value: number | null
    progression_mode?: ProgressionMode | string | null
    /** Rango de reps prescrito (para doble progresión). */
    reps?: string | null
    /** Series prescritas (doble progresión exige completar TODAS). */
    sets?: number | null
}

export interface LastSessionForBlock {
    /** Peso usado en la última sesión registrada del bloque (kg). */
    weightKg: number | null
    /** reps_done por serie de esa última sesión (en orden). */
    repsDone: Array<number | null>
}

export interface ProgressionContext {
    /** Semana 1-based del programa (de `programWeekIndex1Based`). null si no se puede calcular. */
    currentWeek: number | null
    /** Tope de semanas del programa (`weeks_to_repeat`); la progresión no escala más allá. */
    weeksToRepeat?: number | null
    /** Última sesión registrada del bloque (doble progresión). null = primera vez. */
    lastSession?: LastSessionForBlock | null
}

export type ProgressionStatus = 'flat' | 'progressed' | 'holding'

export interface EffectiveTarget {
    /** Peso objetivo efectivo para HOY (kg). Igual a base cuando no aplica progresión. */
    weightKg: number | null
    /** Peso base que puso el coach (referencia para mostrar "base → hoy"). */
    baseWeightKg: number | null
    /** Cuánto se sumó al base (kg, ya redondeado). Puede ser 0. */
    addedKg: number
    /** Semanas transcurridas aplicadas (weekly_linear; 0-based, capadas al programa). */
    weeksApplied: number
    /** El número objetivo subió respecto a la base. */
    isProgressed: boolean
    /** Doble progresión: se mantiene el peso esperando completar el rango de reps. */
    holding: boolean
    /** Doble progresión: reps por serie a alcanzar para desbloquear el próximo incremento. */
    repsTopToUnlock: number | null
    /** flat = sin progresión / semana 1 · progressed = subió · holding = manteniendo (modo C). */
    status: ProgressionStatus
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
        holding: false,
        repsTopToUnlock: null,
        status: 'flat',
        modeImplemented,
        mode,
    }

    // v1: solo progresión de PESO tiene motor. reps → no-op (sigue como cartel informativo).
    if (block.progression_type !== 'weight') return noop
    const value = block.progression_value
    if (value == null || !Number.isFinite(value) || value <= 0) return noop
    if (base == null || !Number.isFinite(base)) return noop
    // Modo sin motor → no-op (muestra base). El selector del builder ya los oculta.
    if (!modeImplemented) return noop

    switch (mode) {
        case 'weekly_linear':
            return weeklyLinear(base, value, ctx, mode)
        case 'double':
            return doubleProgression(block, base, value, ctx, mode)
        default:
            return noop
    }
}

function weeklyLinear(
    base: number,
    value: number,
    ctx: ProgressionContext,
    mode: ProgressionMode
): EffectiveTarget {
    const flat: EffectiveTarget = {
        weightKg: base, baseWeightKg: base, addedKg: 0, weeksApplied: 0,
        isProgressed: false, holding: false, repsTopToUnlock: null,
        status: 'flat', modeImplemented: true, mode,
    }
    const week = ctx.currentWeek
    if (week == null || week < 1) return flat
    // Cap al largo del programa: la progresión no escala infinito si el alumno sigue post-fin.
    const cap = Math.max(1, Number(ctx.weeksToRepeat) || week)
    const cappedWeek = Math.min(week, cap)
    const weeksApplied = Math.max(0, cappedWeek - 1)
    if (weeksApplied === 0) return flat
    const weightKg = roundToStep(base + weeksApplied * value)
    const addedKg = weightKg - base
    return {
        weightKg, baseWeightKg: base, addedKg, weeksApplied,
        isProgressed: addedKg > 0, holding: false, repsTopToUnlock: null,
        status: addedKg > 0 ? 'progressed' : 'flat', modeImplemented: true, mode,
    }
}

/**
 * Doble progresión: mantené el peso hasta completar el TOPE del rango de reps en TODAS las series;
 * ahí subís `value` kg. Stateless: solo mira la última sesión registrada del bloque.
 *  - sin rango parseable → cae a weekly_linear (progresión sensata igual).
 *  - sin última sesión (primera vez) → base.
 *  - última sesión completó el tope en todas las series → sube desde el peso de esa sesión.
 *  - si no → mantiene el peso de la última sesión (seguir puliendo el rango).
 */
function doubleProgression(
    block: ProgressionBlockInput,
    base: number,
    value: number,
    ctx: ProgressionContext,
    mode: ProgressionMode
): EffectiveTarget {
    const top = parseRepsTop(block.reps)
    // Sin rango de reps → no se puede doble-progresar por reps; cae a la progresión por semana.
    if (top == null) return weeklyLinear(base, value, ctx, 'weekly_linear')

    const last = ctx.lastSession
    const flatBase: EffectiveTarget = {
        weightKg: base, baseWeightKg: base, addedKg: 0, weeksApplied: 0,
        isProgressed: false, holding: false, repsTopToUnlock: top,
        status: 'flat', modeImplemented: true, mode,
    }
    if (!last || last.weightKg == null || !Number.isFinite(last.weightKg)) return flatBase

    const lastW = last.weightKg
    const expectedSets = Math.max(1, Number(block.sets) || 1)
    const repsArr = last.repsDone.filter((r): r is number => r != null && Number.isFinite(r))
    // Completó: registró al menos `sets` series Y todas llegaron al tope del rango.
    const completed = repsArr.length >= expectedSets && repsArr.every((r) => r >= top)

    if (completed) {
        const weightKg = roundToStep(lastW + value)
        const addedKg = roundToStep(weightKg - base)
        return {
            weightKg, baseWeightKg: base, addedKg, weeksApplied: 0,
            isProgressed: weightKg > base, holding: false, repsTopToUnlock: top,
            status: 'progressed', modeImplemented: true, mode,
        }
    }

    // Mantener el peso de la última sesión (seguir completando el rango).
    const weightKg = roundToStep(lastW)
    return {
        weightKg, baseWeightKg: base, addedKg: roundToStep(weightKg - base), weeksApplied: 0,
        isProgressed: false, holding: true, repsTopToUnlock: top,
        status: 'holding', modeImplemented: true, mode,
    }
}
