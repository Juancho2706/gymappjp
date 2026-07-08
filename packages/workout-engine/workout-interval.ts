/**
 * Máquina de fases del timer de intervalos (pura, testeable) + plantillas system v1.
 *
 * Decisión #6 del PLAN (specs/movida-entrenamiento): las plantillas system viven en código
 * (sin tabla nueva); las plantillas curadas del coach son los programas template existentes.
 * El timer solo soporta pasos CON duración: un work por distancia (sin duración) no genera
 * fase cronometrable — la UI muestra la distancia objetivo y deshabilita el timer.
 */

/**
 * Shape de workout_blocks.interval_config (jsonb) — espejo del IntervalConfigSchema de @eva/schemas
 * y de `@/domain/workout/types` (web). Re-declarado acá para que el motor quede self-contained.
 */
export interface IntervalConfig {
    warmup_sec?: number
    cooldown_sec?: number
    /** N repeticiones del paso work/recovery (M externo = block.sets). */
    repeats: number
    work: {
        duration_sec?: number
        distance_m?: number
        target?: {
            kind: 'hr_zone' | 'pace' | 'rpe' | 'none'
            hr_zone?: 1 | 2 | 3 | 4 | 5
            pace_sec_per_km?: number
            rpe?: number
        }
    }
    recovery?: {
        duration_sec?: number
        distance_m?: number
        mode?: 'rest' | 'jog' | 'walk'
    }
}

export type IntervalPhaseKind = 'warmup' | 'work' | 'recovery' | 'cooldown'

export interface IntervalPhase {
    kind: IntervalPhaseKind
    durationSec: number
    /** Número de intervalo (1-based) para "intervalo N de M"; solo en work/recovery. */
    repeat?: number
    /** M total de intervalos (repeats × sets). */
    totalRepeats?: number
}

/**
 * Secuencia de fases: warmup → (work → recovery)×(repeats×sets) → cooldown.
 * La última recovery se omite (no tiene sentido descansar después del último intervalo).
 * Fases sin duración (> 0) se omiten. Devuelve [] si el work no es cronometrable.
 */
export function buildIntervalPhases(config: IntervalConfig, sets: number = 1): IntervalPhase[] {
    const safeSets = Number.isFinite(sets) && sets >= 1 ? Math.round(sets) : 1
    const repeats = Number.isFinite(config.repeats) && config.repeats >= 1 ? Math.round(config.repeats) : 1
    const total = repeats * safeSets

    const workSec = config.work?.duration_sec ?? 0
    if (!Number.isFinite(workSec) || workSec <= 0) return []

    const phases: IntervalPhase[] = []
    if (config.warmup_sec && config.warmup_sec > 0) {
        phases.push({ kind: 'warmup', durationSec: Math.round(config.warmup_sec) })
    }
    const recoverySec = config.recovery?.duration_sec ?? 0
    for (let i = 1; i <= total; i += 1) {
        phases.push({ kind: 'work', durationSec: Math.round(workSec), repeat: i, totalRepeats: total })
        if (recoverySec > 0 && i < total) {
            phases.push({ kind: 'recovery', durationSec: Math.round(recoverySec), repeat: i, totalRepeats: total })
        }
    }
    if (config.cooldown_sec && config.cooldown_sec > 0) {
        phases.push({ kind: 'cooldown', durationSec: Math.round(config.cooldown_sec) })
    }
    return phases
}

/** Duración total (s) de la secuencia de fases cronometrables. */
export function intervalTotalDurationSec(config: IntervalConfig, sets: number = 1): number {
    return buildIntervalPhases(config, sets).reduce((acc, p) => acc + p.durationSec, 0)
}

/** ¿El interval_config es cronometrable (work por tiempo)? */
export function isTimeableInterval(config: IntervalConfig | null | undefined): boolean {
    return !!config && (config.work?.duration_sec ?? 0) > 0
}

/** Etiquetas es-neutro de las fases (UI alumno). */
export const INTERVAL_PHASE_LABEL: Record<IntervalPhaseKind, string> = {
    warmup: 'Calentamiento',
    work: 'Trabajo',
    recovery: 'Recuperación',
    cooldown: 'Vuelta a la calma',
}

// ─── Plantillas system v1 (decisión #6) ──────────────────────────────────────

export interface IntervalTemplate {
    id: string
    /** Nombre es-neutro corto (la galería del coach lo muestra tal cual). */
    name: string
    description: string
    config: IntervalConfig
    /** Zona FC sugerida para el bloque (se copia a hr_zone al aplicar). */
    suggestedHrZone?: 1 | 2 | 3 | 4 | 5
}

export const INTERVAL_TEMPLATES: readonly IntervalTemplate[] = [
    {
        id: 'track-8x400',
        name: '8×400m @ Z4',
        description: 'Series de pista: 8 repeticiones de 400 m con 90 s de recuperación.',
        suggestedHrZone: 4,
        config: {
            warmup_sec: 600,
            repeats: 8,
            work: { distance_m: 400, target: { kind: 'hr_zone', hr_zone: 4 } },
            recovery: { duration_sec: 90, mode: 'rest' },
            cooldown_sec: 300,
        },
    },
    {
        id: 'vo2-6x1min',
        name: '6×1min @ Z5',
        description: 'VO2max: 6 repeticiones de 1 minuto fuerte con 2 minutos suaves.',
        suggestedHrZone: 5,
        config: {
            warmup_sec: 600,
            repeats: 6,
            work: { duration_sec: 60, target: { kind: 'hr_zone', hr_zone: 5 } },
            recovery: { duration_sec: 120, mode: 'jog' },
            cooldown_sec: 300,
        },
    },
    {
        id: 'continuo-20min-z2',
        name: '20min Z2 continuo',
        description: 'Base aeróbica: 20 minutos continuos en zona 2.',
        suggestedHrZone: 2,
        config: {
            repeats: 1,
            work: { duration_sec: 1200, target: { kind: 'hr_zone', hr_zone: 2 } },
        },
    },
    {
        id: 'fartlek-10x30-30',
        name: 'Fartlek 10×30/30',
        description: 'Fartlek: 10 repeticiones de 30 s fuerte / 30 s suave.',
        suggestedHrZone: 4,
        config: {
            warmup_sec: 300,
            repeats: 10,
            work: { duration_sec: 30, target: { kind: 'hr_zone', hr_zone: 4 } },
            recovery: { duration_sec: 30, mode: 'jog' },
            cooldown_sec: 300,
        },
    },
    {
        id: 'hyrox-compromised-run',
        name: 'HYROX run + estación',
        description: 'Carrera comprometida: 4×(1 km de carrera + 90 s de estación funcional).',
        suggestedHrZone: 4,
        config: {
            warmup_sec: 600,
            repeats: 4,
            work: { distance_m: 1000, target: { kind: 'hr_zone', hr_zone: 4 } },
            recovery: { duration_sec: 90, mode: 'rest' },
        },
    },
]
