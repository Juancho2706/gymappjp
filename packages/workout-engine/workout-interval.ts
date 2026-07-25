/**
 * Máquina de fases del timer de intervalos (pura, testeable) + plantillas system v1.
 *
 * Decisión #6 del PLAN (specs/movida-entrenamiento): las plantillas system viven en código
 * (sin tabla nueva); las plantillas curadas del coach son los programas template existentes.
 *
 * Fase D (G2/RF7): un paso de trabajo por DISTANCIA (8×400m, HYROX) ya no queda sin guía. La
 * secuencia completa la arma `buildIntervalSequence`, donde cada fase declara su `mode`:
 *  · `timed`  — tiene duración ⇒ se cronometra (warmup, cooldown, recuperaciones y works por tiempo).
 *  · `manual` — se prescribió por distancia ⇒ NO se cronometra, avanza con "Fase siguiente".
 * `buildIntervalPhases` se mantiene EXACTAMENTE con su contrato histórico (solo fases
 * cronometrables; `[]` si el work es por distancia) porque los timers globales flotantes
 * (`WorkoutTimerProvider` web / `TimerProvider` RN) solo saben contar hacia atrás.
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

/**
 * Cómo avanza una fase: `timed` = cuenta regresiva (contrato histórico, es el default cuando el campo
 * viene ausente); `manual` = la fase se prescribió por DISTANCIA y espera que el alumno confirme
 * ("Fase siguiente"). Aditivo: ningún consumidor previo necesita mirarlo.
 */
export type IntervalPhaseMode = 'timed' | 'manual'

export interface IntervalPhase {
    kind: IntervalPhaseKind
    /** Segundos de la fase. En fases `manual` es 0 (no se cronometra). */
    durationSec: number
    /** Número de intervalo (1-based) para "intervalo N de M"; solo en work/recovery. */
    repeat?: number
    /** M total de intervalos (repeats × sets). */
    totalRepeats?: number
    /** Ausente ⇒ `timed` (retrocompat). `buildIntervalSequence` siempre lo declara. */
    mode?: IntervalPhaseMode
    /** Metros prescritos de la fase; solo viaja en fases `manual`. */
    distanceM?: number
}

/** ¿La fase avanza a mano (prescrita por distancia) en vez de cronometrarse? */
export function isManualPhase(phase: IntervalPhase | null | undefined): boolean {
    return phase?.mode === 'manual'
}

function positive(value: number | null | undefined): number {
    return value != null && Number.isFinite(value) && value > 0 ? value : 0
}

/** Arma una fase de un paso (work/recovery): por tiempo ⇒ `timed`; por distancia ⇒ `manual`. */
function stepPhase(
    kind: IntervalPhaseKind,
    step: { duration_sec?: number; distance_m?: number } | undefined,
    marks?: { repeat: number; totalRepeats: number },
): IntervalPhase | null {
    const sec = positive(step?.duration_sec)
    if (sec > 0) {
        return { kind, durationSec: Math.round(sec), mode: 'timed', ...marks }
    }
    const meters = positive(step?.distance_m)
    if (meters > 0) {
        return { kind, durationSec: 0, mode: 'manual', distanceM: Math.round(meters), ...marks }
    }
    return null
}

/**
 * Secuencia COMPLETA de fases: warmup → (work → recovery)×(repeats×sets) → cooldown.
 * La última recovery se omite (no tiene sentido descansar después del último intervalo).
 * Un paso sin duración NI distancia se omite; si el work no tiene ninguna de las dos, devuelve [].
 *
 * Fase D: los pasos por DISTANCIA entran a la secuencia como fases `manual` (8×400m genera 8 fases de
 * 400 m intercaladas con las recuperaciones por tiempo, que sí se cronometran).
 */
export function buildIntervalSequence(config: IntervalConfig, sets: number = 1): IntervalPhase[] {
    const safeSets = Number.isFinite(sets) && sets >= 1 ? Math.round(sets) : 1
    const repeats = Number.isFinite(config?.repeats) && config.repeats >= 1 ? Math.round(config.repeats) : 1
    const total = repeats * safeSets

    // Sin trabajo prescrito (ni tiempo ni distancia) no hay secuencia que correr.
    if (stepPhase('work', config?.work) == null) return []

    const phases: IntervalPhase[] = []
    const warmupSec = positive(config?.warmup_sec)
    if (warmupSec > 0) phases.push({ kind: 'warmup', durationSec: Math.round(warmupSec), mode: 'timed' })

    for (let i = 1; i <= total; i += 1) {
        const marks = { repeat: i, totalRepeats: total }
        const work = stepPhase('work', config.work, marks)
        if (work) phases.push(work)
        if (i < total) {
            const recovery = stepPhase('recovery', config.recovery, marks)
            if (recovery) phases.push(recovery)
        }
    }

    const cooldownSec = positive(config?.cooldown_sec)
    if (cooldownSec > 0) phases.push({ kind: 'cooldown', durationSec: Math.round(cooldownSec), mode: 'timed' })
    return phases
}

/**
 * Fases CRONOMETRABLES (contrato histórico intacto): warmup → (work → recovery)×N → cooldown, solo con
 * pasos por tiempo. Devuelve [] si el work es por distancia — los timers globales flotantes solo saben
 * contar hacia atrás, así que jamás deben recibir una fase manual. Para la secuencia completa (con las
 * fases por distancia) usar `buildIntervalSequence`.
 */
export function buildIntervalPhases(config: IntervalConfig, sets: number = 1): IntervalPhase[] {
    if (!isTimeableInterval(config)) return []
    return buildIntervalSequence(config, sets).filter((p) => p.mode !== 'manual')
}

/** Duración total (s) de la secuencia de fases cronometrables. */
export function intervalTotalDurationSec(config: IntervalConfig, sets: number = 1): number {
    return buildIntervalPhases(config, sets).reduce((acc, p) => acc + p.durationSec, 0)
}

/**
 * Clasificador del timer de un `interval_config` (Fase D):
 *  · `timeable` — el work tiene duración ⇒ secuencia 100% cronometrable (comportamiento de siempre).
 *  · `manual`   — el work se prescribió por distancia ⇒ secuencia con fases de avance manual.
 *  · `none`     — no hay config o el work no prescribe ni tiempo ni distancia ⇒ no hay intervalos.
 */
export type IntervalTimerKind = 'timeable' | 'manual' | 'none'

export function intervalTimerKind(config: IntervalConfig | null | undefined): IntervalTimerKind {
    if (!config) return 'none'
    if (positive(config.work?.duration_sec) > 0) return 'timeable'
    if (positive(config.work?.distance_m) > 0) return 'manual'
    return 'none'
}

/** ¿El interval_config es cronometrable (work por tiempo)? Wrapper retrocompatible. */
export function isTimeableInterval(config: IntervalConfig | null | undefined): boolean {
    return intervalTimerKind(config) === 'timeable'
}

/** Distancia de una fase manual en texto corto es-neutro ("400 m", "1 km", "1,5 km"). */
export function formatIntervalPhaseDistance(meters: number | null | undefined): string {
    const m = positive(meters)
    if (m <= 0) return ''
    if (m < 1000) return `${Math.round(m)} m`
    const km = m / 1000
    if (Number.isInteger(km)) return `${km} km`
    return `${km.toFixed(1).replace('.', ',')} km`
}

/** Objetivo visible de una fase: distancia si es manual, vacío si se cronometra (lo pinta el reloj). */
export function intervalPhaseTargetLabel(phase: IntervalPhase | null | undefined): string {
    if (!phase || !isManualPhase(phase)) return ''
    return formatIntervalPhaseDistance(phase.distanceM)
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
