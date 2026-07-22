/**
 * Progreso de un bloque cardio contra su objetivo — cálculo PURO (sin React ni Next).
 *
 * El coach prescribe cardio por TIEMPO (`duration_sec`) o por DISTANCIA (`distance_m`) — mismo eje
 * que `IntervalConfig.work` (workout-interval) y que el objetivo del teclado tipado
 * (`formatTypedObjective`). El ejecutor v3 (E3.4) usa esto para el countdown / la barra de avance:
 * dado el objetivo y el avance del alumno devuelve el % [0-1], lo que falta y si ya terminó.
 *
 * Precedencia cuando el bloque trae ambos ejes: TIEMPO manda (es el eje cronometrable; la distancia
 * queda como dato informativo). Sin objetivo válido (ambos <= 0 / no finitos) devuelve `null` — la
 * UI cae a un stopwatch abierto sin barra (mismo criterio que `isTimeableInterval`).
 */

export type CardioProgressKind = 'time' | 'distance'

/** Objetivo prescrito del bloque cardio (espejo de `IntervalConfig.work`: tiempo XOR distancia). */
export interface CardioObjective {
    duration_sec?: number | null
    distance_m?: number | null
}

/** Avance registrado por el alumno (cronómetro y/o distancia acumulada). */
export interface CardioAdvance {
    elapsed_sec?: number | null
    distance_m?: number | null
}

export interface CardioProgress {
    /** Eje contra el que se mide (tiempo manda si el objetivo trae ambos). */
    kind: CardioProgressKind
    /** Fracción completada, clampeada a [0, 1]. */
    pct: number
    /** Lo que falta para el objetivo (segundos o metros), nunca negativo. */
    remaining: number
    /** true cuando el avance alcanzó o superó el objetivo. */
    done: boolean
}

function isPositiveFinite(value: number | null | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
}

/** Avance no negativo y finito; cualquier basura (NaN/negativo/null) cuenta como 0. */
function safeAdvance(value: number | null | undefined): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

/**
 * Progreso de un bloque cardio. Devuelve `null` si el objetivo no es medible (ni tiempo ni distancia
 * válidos). El `pct` se clampa a [0, 1] aunque el alumno se pase del objetivo.
 */
export function computeCardioProgress(
    objetivo: CardioObjective,
    avance: CardioAdvance,
): CardioProgress | null {
    if (isPositiveFinite(objetivo.duration_sec)) {
        const target = objetivo.duration_sec
        const current = safeAdvance(avance.elapsed_sec)
        const pct = Math.min(current / target, 1)
        return {
            kind: 'time',
            pct,
            remaining: Math.max(target - current, 0),
            done: current >= target,
        }
    }
    if (isPositiveFinite(objetivo.distance_m)) {
        const target = objetivo.distance_m
        const current = safeAdvance(avance.distance_m)
        const pct = Math.min(current / target, 1)
        return {
            kind: 'distance',
            pct,
            remaining: Math.max(target - current, 0),
            done: current >= target,
        }
    }
    return null
}
