/**
 * Auto-registro del CARDIO cronometrado (hallazgo E) — decisión PURA compartida web ↔ RN.
 *
 * Regla del owner: si el timer/intervalo TERMINA SOLO se rellenan los minutos, se ENVÍA la serie y el
 * ejecutor avanza con el auto-avance que ya existe; si el alumno PAUSA o SALTA antes, solo se rellenan
 * los minutos y él decide. Metros y FC nunca se tocan acá (siguen siendo opcionales y del alumno).
 *
 * Este módulo es la ÚNICA fuente de la decisión y de la aritmética del tramo: los hooks de cada
 * plataforma quedan finos (avisan el evento, aplican el resultado) y no pueden driftear entre sí.
 * Cero React / RN: solo TypeScript.
 */
import { isManualPhase, type IntervalPhase } from './workout-interval'

/** Por qué terminó el tramo de cardio en curso (un tramo = una fila de captura = una ronda). */
export type CardioSegmentReason =
    /** El timer llegó a 0 solo (nadie lo detuvo). */
    | 'expired'
    /** El alumno confirmó una fase por DISTANCIA con "Fase siguiente". */
    | 'manual-next'
    /** Pausa explícita: botón, anillo, o botón de la notificación (RN). */
    | 'paused'
    /** "Saltar fase": decisión del alumno, no un fin natural. */
    | 'skipped'
    /** "Reiniciar": el acumulador vuelve a 0 y la caja NO se reescribe. */
    | 'restart'

export interface CardioAutologDecision {
    /** Segundos que deben caer en la caja MIN. `null` ⇒ no tocar la caja. */
    fillSeconds: number | null
    /** Enviar la serie (y dejar que el auto-avance existente haga el resto). */
    submit: boolean
    /** Poner el acumulador del tramo a 0 (cierre de ronda o reinicio). */
    resetElapsed: boolean
}

const NO_OP: CardioAutologDecision = { fillSeconds: null, submit: false, resetElapsed: false }

/**
 * Decisión única del auto-registro. `closesRound` = el tramo que terminó corresponde a la fila activa
 * COMPLETA (en continuo siempre; en intervalos, solo la última fase de la ronda).
 *
 * · `restart` ⇒ limpia el acumulador y no escribe nada (el alumno corrige a mano si quiere).
 * · `elapsed <= 0` ⇒ nada: jamás se pisa la caja con "0" ni se manda una serie de 0 minutos.
 * · fin natural (`expired` / `manual-next`) que CIERRA ronda ⇒ rellena + envía + resetea.
 * · fin natural que NO cierra ronda ⇒ nada (no se ensucia la caja a mitad de ronda).
 * · `paused` / `skipped` ⇒ rellena y nada más (caso (b) del owner).
 *
 * TOPE del reloj de pared (`prescribedSec`): el acumulador mide tiempo REAL, así que volver de
 * background / de la pestaña oculta con el timer ya vencido daría 45 min para un bloque de 20. Lo que
 * se registra es el tiempo PRESCRITO del tramo, nunca más: `min(elapsed, prescribedSec)`. Un tramo sin
 * duración prescrita (fase por DISTANCIA, cronómetro) pasa `null` y no tiene tope — ahí el reloj de
 * pared ES la verdad.
 */
export function decideCardioAutolog(input: {
    reason: CardioSegmentReason
    elapsedSec: number
    closesRound: boolean
    /** Segundos prescritos del tramo/ronda. `null`/ausente ⇒ sin tope (el tramo no se cronometra). */
    prescribedSec?: number | null
}): CardioAutologDecision {
    const { reason, elapsedSec, closesRound, prescribedSec } = input
    if (reason === 'restart') return { fillSeconds: null, submit: false, resetElapsed: true }
    if (!Number.isFinite(elapsedSec) || elapsedSec <= 0) return NO_OP
    const cap =
        prescribedSec != null && Number.isFinite(prescribedSec) && prescribedSec > 0
            ? Math.round(prescribedSec)
            : null
    const measured = cap == null ? Math.round(elapsedSec) : Math.min(Math.round(elapsedSec), cap)
    if (reason === 'expired' || reason === 'manual-next') {
        if (!closesRound) return NO_OP
        return { fillSeconds: measured, submit: true, resetElapsed: true }
    }
    // paused | skipped: se rellena lo transcurrido pero NO se envía ni se avanza.
    return { fillSeconds: measured, submit: false, resetElapsed: false }
}

// ── Acumulador de tiempo del tramo (reloj de pared, background-safe) ─────────────────────────────

/**
 * Tiempo del tramo por RELOJ DE PARED: `accumulatedSec` son los tramos ya cerrados y `startedAtMs` es
 * el instante en que arrancó el tramo en curso (`null` ⇒ detenido). Leerlo con el `now` real es lo que
 * lo hace correcto con la app en background / la pestaña oculta: no depende de que hayan corrido ticks.
 */
export interface CardioElapsedState {
    accumulatedSec: number
    startedAtMs: number | null
}

/** Acumulador nuevo, en 0 y detenido. */
export function createCardioElapsed(): CardioElapsedState {
    return { accumulatedSec: 0, startedAtMs: null }
}

/** Arranca (o reanuda) el conteo. Idempotente: si ya corría, no re-ancla el inicio. */
export function startCardioElapsed(state: CardioElapsedState, nowMs: number): CardioElapsedState {
    if (state.startedAtMs != null) return state
    return { accumulatedSec: state.accumulatedSec, startedAtMs: nowMs }
}

/** Congela el tramo en curso dentro del acumulador. Idempotente si ya estaba detenido. */
export function pauseCardioElapsed(state: CardioElapsedState, nowMs: number): CardioElapsedState {
    if (state.startedAtMs == null) return state
    return { accumulatedSec: readCardioElapsed(state, nowMs), startedAtMs: null }
}

/** Segundos transcurridos del tramo (enteros, ≥ 0), corra o no el reloj. */
export function readCardioElapsed(state: CardioElapsedState, nowMs: number): number {
    const base = Number.isFinite(state.accumulatedSec) ? state.accumulatedSec : 0
    const live = state.startedAtMs == null ? 0 : Math.floor((nowMs - state.startedAtMs) / 1000)
    return Math.max(0, Math.round(base + Math.max(0, live)))
}

/** Acumulador a 0 y detenido (cierre de ronda o "Reiniciar"). */
export function resetCardioElapsed(): CardioElapsedState {
    return createCardioElapsed()
}

// ── Rondas de intervalos ─────────────────────────────────────────────────────────────────────────

/**
 * Ronda de captura (1-based) a la que pertenece una fase. `buildIntervalSequence` numera las fases
 * work/recovery con `repeat` 1..(repeats × sets), mientras que las filas de captura son `block.sets`:
 * la ronda es `ceil(repeat / repeats)`. El warmup entra a la ronda 1 y el cooldown a la última.
 */
export function intervalRoundOfPhase(
    phase: IntervalPhase | null | undefined,
    repeatsPerRound: number,
    totalRounds: number,
): number | null {
    if (phase == null) return null
    const rounds = Number.isFinite(totalRounds) && totalRounds >= 1 ? Math.round(totalRounds) : 1
    if (phase.kind === 'warmup') return 1
    if (phase.kind === 'cooldown') return rounds
    const per = Number.isFinite(repeatsPerRound) && repeatsPerRound >= 1 ? Math.round(repeatsPerRound) : 1
    const repeat = Number.isFinite(phase.repeat) && (phase.repeat as number) >= 1 ? Math.round(phase.repeat as number) : 1
    return Math.min(rounds, Math.max(1, Math.ceil(repeat / per)))
}

/**
 * ¿La fase `phaseIndex` CIERRA su ronda de captura? Verdadero si es la última de la secuencia o si la
 * fase siguiente ya pertenece a otra ronda. Es el boundary que dispara el auto-registro de la fila.
 */
export function intervalPhaseClosesRound(
    phases: IntervalPhase[],
    phaseIndex: number,
    repeatsPerRound: number,
    totalRounds: number,
): boolean {
    if (!Array.isArray(phases) || phaseIndex < 0 || phaseIndex >= phases.length) return false
    if (phaseIndex === phases.length - 1) return true
    const current = intervalRoundOfPhase(phases[phaseIndex], repeatsPerRound, totalRounds)
    const next = intervalRoundOfPhase(phases[phaseIndex + 1], repeatsPerRound, totalRounds)
    return current !== next
}

/**
 * Segundos PRESCRITOS de la ronda de captura a la que pertenece `phaseIndex` — el tope del reloj de
 * pared de esa fila (ver `decideCardioAutolog`). Suma las duraciones de TODAS las fases de esa ronda
 * (el warmup entra a la ronda 1 y el cooldown a la última, igual que `intervalRoundOfPhase`, así que
 * la suma de las rondas es exactamente la secuencia prescrita).
 *
 * Devuelve `null` si la ronda incluye alguna fase por DISTANCIA: esa dura lo que el alumno tarde, así
 * que la ronda no tiene tope de reloj y el acumulador manda.
 */
export function intervalRoundPrescribedSec(
    phases: IntervalPhase[],
    phaseIndex: number,
    repeatsPerRound: number,
    totalRounds: number,
): number | null {
    if (!Array.isArray(phases) || phaseIndex < 0 || phaseIndex >= phases.length) return null
    const round = intervalRoundOfPhase(phases[phaseIndex], repeatsPerRound, totalRounds)
    if (round == null) return null
    let total = 0
    for (const phase of phases) {
        if (intervalRoundOfPhase(phase, repeatsPerRound, totalRounds) !== round) continue
        if (isManualPhase(phase)) return null
        total += Number.isFinite(phase.durationSec) ? Math.max(0, phase.durationSec) : 0
    }
    return total > 0 ? Math.round(total) : null
}

// ── Formato de la caja MIN ───────────────────────────────────────────────────────────────────────

/** Segundos → minutos con 1 decimal (1830 → 30,5; 1800 → 30). Misma regla que la caja de cardio. */
export function cardioMinutesFromSeconds(sec: number): number {
    if (!Number.isFinite(sec) || sec <= 0) return 0
    return Math.round((sec / 60) * 10) / 10
}

/** Valor de la caja/semilla. `decimalComma` (keypad es-CL / RN) ⇒ "30,5"; si no, "30.5". */
export function cardioMinSeedValue(sec: number, opts?: { decimalComma?: boolean }): string {
    const minutes = cardioMinutesFromSeconds(sec)
    const raw = String(minutes)
    return opts?.decimalComma ? raw.replace('.', ',') : raw
}

// ── Mezcla de captura de la fila de cardio ───────────────────────────────────────────────────────

/**
 * Valores de la fila de captura de cardio, con UNA sola regla de precedencia: draft restaurado (base)
 * → lo que el alumno tiene tipeado ahora → la caja MIN del timer (que es del reloj y pisa) → la FC del
 * sensor, que SOLO entra si la caja está vacía (jamás pisa lo del alumno).
 *
 * Existe para que la SEMILLA de la fila y el PAYLOAD del auto-envío sean la misma mezcla: armarlas por
 * separado fue justo el drift que hacía que el auto-registro mandara la serie sin los metros ya
 * tipeados (o sin la FC sembrada) cuando el alumno no había vuelto a escribir en esa ronda.
 *
 * `decimalComma` (default `true`) porque el consumidor es el keypad es-CL de RN; la web escribe la
 * caja por el DOM y no pasa por acá.
 */
export function mergeCardioCaptureValues(input: {
    /** Draft restaurado de la fila (resiliencia): la base. */
    restored?: Record<string, string> | null
    /** Lo que el alumno tiene tipeado AHORA en la fila (pisa al draft). */
    typed?: Record<string, string> | null
    /** Minutos medidos por el timer, en SEGUNDOS. `null` ⇒ no se toca la caja MIN. */
    minSec?: number | null
    /** Promedio del sensor FC. Solo entra si `actual_avg_hr` está vacío. */
    seededAvgHr?: number | null
    decimalComma?: boolean
}): Record<string, string> {
    const merged: Record<string, string> = { ...(input.restored ?? {}), ...(input.typed ?? {}) }
    const { minSec, seededAvgHr } = input
    if (minSec != null && Number.isFinite(minSec) && minSec > 0) {
        merged.cardio_min = cardioMinSeedValue(minSec, { decimalComma: input.decimalComma !== false })
    }
    if (seededAvgHr != null && Number.isFinite(seededAvgHr) && (merged.actual_avg_hr ?? '').trim() === '') {
        merged.actual_avg_hr = String(Math.round(seededAvgHr))
    }
    return merged
}
