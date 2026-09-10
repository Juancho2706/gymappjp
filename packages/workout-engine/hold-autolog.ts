/**
 * Auto-registro del HOLD en pantalla (specs/cuenta-atras-en-pantalla, W1.1/W1.2) — decisión PURA
 * compartida web ↔ RN.
 *
 * Regla del owner (V2 + V3 + V4): cuando la cuenta atrás llega a 0 el tiempo se ANOTA y se ENVÍA
 * solo, sin que el alumno toque nada; en pantalla SOLA el ejecutor NO se pasa al descanso ni a la
 * siguiente serie (eso lo decide el alumno con «Descansar N s» / «Siguiente serie»), pero DENTRO de
 * una superserie SÍ se pasa al siguiente miembro de la ronda… salvo que esa serie CIERRE la ronda
 * (D2: ahí espera el toque en «Ronda lista · Descansar N s»).
 *
 * **Este módulo NUNCA arranca descansos.** Devuelve una decisión; la UI aplica la preferencia D5
 * (ON ⇒ `startRest`, OFF ⇒ CTA). Cero React / RN: solo TypeScript.
 *
 * Hermano de `cardio-autolog.ts`, del que **reusa** el acumulador de reloj de pared (re-exportado
 * acá con alias neutro, sin duplicar una línea), el tope `min(elapsed, prescribed)` y el
 * `elapsed <= 0 ⇒ NO_OP`. **No toca cardio.**
 */
import type { HoldSource } from './session-logs.reconcile'

// ── Acumulador de reloj de pared (background-safe) ───────────────────────────────────────────────
//
// Es EXACTAMENTE el de cardio (`cardio-autolog.ts:84-116`): tipo-agnóstico, cuenta por reloj de
// pared y por eso sobrevive a la app en background / la pestaña oculta. Se re-exporta con nombres
// neutros para que el módulo de hold no tenga que hablar de «cardio», pero es la MISMA función:
// duplicarla habría creado dos acumuladores con dos bugs distintos.
export {
    createCardioElapsed as createHoldElapsed,
    startCardioElapsed as startHoldElapsed,
    pauseCardioElapsed as pauseHoldElapsed,
    readCardioElapsed as readHoldElapsed,
    resetCardioElapsed as resetHoldElapsed,
} from './cardio-autolog'
export type { CardioElapsedState as HoldElapsedState } from './cardio-autolog'

/** Por qué terminó el hold en curso. Nombres canónicos del tren (OUTLINE §10): no se renombran. */
export type HoldEndReason =
    /** La cuenta atrás llegó a 0 sola (V2: se anota y se envía sin que el alumno toque nada). */
    | 'expired'
    /** «Listo» antes de 0 (A2/R22): se guarda lo transcurrido, con la fuente `'manual'`. */
    | 'done-early'
    /** Pausa explícita: se rellena la caja y nada más (el alumno decide). */
    | 'paused'
    /**
     * «Re-medir»: el reloj vuelve al objetivo y la caja NO se reescribe. El ESTADO homónimo del
     * módulo de hold se rotula «re-medir» para no colisionar con `CountdownApi.restart` (W1.1),
     * pero el miembro de este enum sigue llamándose `'restart'`.
     */
    | 'restart'

/**
 * Lado del hold que se está cerrando. Lo produce `holdSidesFor(sideMode)` — nadie lo arma a mano.
 * `per_side` recorre `left` → `right` y **una sola fila** se guarda al cerrar el derecho.
 */
export type HoldSide = 'single' | 'left' | 'right'

/** Dónde vive el hold: pantalla sola o miembro de una superserie (V3 vs V4). */
export type HoldContext = 'solo' | 'superset'

/** Qué hace el ejecutor después: pasar al siguiente miembro de la ronda (V4) o quedarse (V3/D2). */
export type HoldAdvance = 'next-member' | 'stay'

export interface HoldAutologDecision {
    /** Segundos que deben caer en la caja de captura. `null` ⇒ no tocar la caja. */
    fillSeconds: number | null
    /** Enviar la serie (auto-envío de V2). Falso en `left`, `paused`, `restart` y con 0 s. */
    submit: boolean
    /** Marca de fuente que viaja en `metadata.hold_source`. `null` ⇒ no se escribe nada. */
    holdSource: HoldSource | null
    /** El lado izquierdo terminó ⇒ la UI pasa el foco al derecho. */
    advanceSide: boolean
    /** …y además lo ARRANCA sola. Falso si el hold venció con la app fuera (R6/R27). */
    autoStartNextSide: boolean
    /** Avance del ejecutor. `'next-member'` SOLO en superserie que no cierra la ronda (V4). */
    advance: HoldAdvance
}

const NO_OP: HoldAutologDecision = {
    fillSeconds: null,
    submit: false,
    holdSource: null,
    advanceSide: false,
    autoStartNextSide: false,
    advance: 'stay',
}

export interface HoldAutologInput {
    reason: HoldEndReason
    /** Segundos REALES sostenidos (reloj de pared, `readHoldElapsed`). */
    elapsedSec: number
    /** Objetivo prescrito del hold (`duration_sec`). `null` ⇒ sin tope (no debería pasar en V2). */
    prescribedSec?: number | null
    /** Lado que se cierra (`holdSidesFor`). Ausente ⇒ `'single'`. */
    side?: HoldSide
    /** Pantalla sola o superserie. Ausente ⇒ `'solo'`. */
    context?: HoldContext
    /** Esta serie CIERRA la ronda de la superserie (D2). */
    closesRound?: boolean
    /**
     * El hold venció con la app/pestaña FUERA (R6/R27). Se **deriva de evidencia**
     * (`expiredWhileAwayFrom`), nunca de quién disparó el fin: los dos caminos a `triggerDone`
     * (tick del intervalo y evento de visibilidad) compiten y gana el primero.
     */
    expiredWhileAway?: boolean
}

/** Redondeo defensivo a entero ≥ 0; `null` si no es un número usable. */
function positiveInt(v: number | null | undefined): number | null {
    if (v == null || !Number.isFinite(v)) return null
    const n = Math.round(v)
    return n > 0 ? n : null
}

/**
 * Decisión única del auto-registro del hold (tabla canónica del OUTLINE §4):
 *
 * · `restart` ⇒ `fillSeconds: null`, no envía (el alumno re-mide desde el objetivo).
 * · `elapsed <= 0` ⇒ NO-OP: jamás se pisa la caja con «0» ni se manda una serie de 0 segundos.
 * · `expired` ⇒ se anota el **objetivo** (`prescribedSec`), nunca el reloj de pared: volver de
 *   background con 300 s en un hold de 30 debe guardar **30** (R6 + s2 §2.4).
 * · `done-early` ⇒ lo transcurrido, con tope: `min(elapsed, prescribed)` (A2/R22).
 * · `paused` ⇒ rellena y nada más.
 * · `submit` solo con fin natural y lado `single` | `right`: en `per_side` el izquierdo **siembra**
 *   y el derecho **envía la única fila** de la serie (`actual_hold_sec = L + R`).
 * · `autoStartNextSide = advanceSide && !expiredWhileAway` (R6/R27): si venció con la app fuera, el
 *   lado 2 queda ARMADO en `idle` (`prime`) esperando el toque, no corriendo con datos falsos.
 * · `advance = 'next-member'` **solo** en superserie que envía y NO cierra ronda (V4); el cierre de
 *   ronda se queda quieto (D2) igual que la pantalla sola (V3).
 */
export function decideHoldAutolog(input: HoldAutologInput): HoldAutologDecision {
    const { reason, elapsedSec, prescribedSec, closesRound } = input
    const side: HoldSide = input.side ?? 'single'
    const context: HoldContext = input.context ?? 'solo'
    if (reason === 'restart') return NO_OP
    if (!Number.isFinite(elapsedSec) || elapsedSec <= 0) return NO_OP
    const cap = positiveInt(prescribedSec)
    const measured = cap == null ? Math.round(elapsedSec) : Math.min(Math.round(elapsedSec), cap)
    if (reason === 'paused') {
        // Se rellena lo transcurrido y nada más. El tope va igual que en `done-early`: una pausa que
        // llega DESPUÉS del vencimiento (app en background) mediría el reloj de pared y escribiría
        // una plancha de 5 minutos donde el objetivo eran 30 s.
        return { ...NO_OP, fillSeconds: measured }
    }
    // Fin natural: `expired` (el reloj llegó a 0) o `done-early` («Listo» antes de 0).
    const isExpired = reason === 'expired'
    // El vencimiento anota el OBJETIVO; sin objetivo prescrito cae a lo medido (que ya viene sin tope).
    const fillSeconds = isExpired ? (cap ?? measured) : measured
    const submit = side !== 'left'
    const advanceSide = side === 'left'
    return {
        fillSeconds,
        submit,
        holdSource: isExpired ? 'timer' : 'manual',
        advanceSide,
        autoStartNextSide: advanceSide && input.expiredWhileAway !== true,
        advance: context === 'superset' && submit && closesRound !== true ? 'next-member' : 'stay',
    }
}

// ── `expiredWhileAway`: se deriva de EVIDENCIA, nunca del emisor (R27) ───────────────────────────

/**
 * Margen de gracia del fin «en pantalla». Un tick largo del intervalo puede llegar unas décimas
 * tarde; más de esto atrás significa que el reloj siguió corriendo mientras nadie miraba.
 */
export const HOLD_EXPIRED_AWAY_GRACE_MS = 1500

/**
 * ¿El hold venció con el alumno FUERA? Se calcula **al disparar el fin**, con el fin absoluto que los
 * dos hooks ya guardan (RN `timing.ts` `endRef`; web `useExecCountdown` `endTimeRef`).
 *
 * Leer «quién disparó el fin» MIENTE: hay dos caminos a `triggerDone` —el tick del intervalo y el
 * evento de visibilidad (`AppState` en RN, `visibilitychange` en web)— y **gana el primero**; al
 * desbloquear la pantalla el intervalo pendiente puede correr antes del evento, con lo que un hold
 * vencido en background reportaría `false` y el lado 2 arrancaría solo con datos falsos (§9 T2).
 * Por eso la señal sale de la evidencia y **el resultado no depende del orden de los disparos**.
 *
 * `visible` = `AppState.currentState === 'active'` (RN) / `document.visibilityState === 'visible'` (web).
 */
export function expiredWhileAwayFrom(input: {
    nowMs: number
    endAtMs?: number | null
    visible: boolean
}): boolean {
    if (!input.visible) return true
    const { endAtMs, nowMs } = input
    if (endAtMs == null || !Number.isFinite(endAtMs) || !Number.isFinite(nowMs)) return false
    return nowMs - endAtMs > HOLD_EXPIRED_AWAY_GRACE_MS
}

// ── Lados del hold: UNA sola regla (R34) ─────────────────────────────────────────────────────────

/**
 * Lados que captura un HOLD (movilidad **y** fuerza por tiempo) — nombre canónico del tren (R34).
 * `per_side` ⇒ `['left','right']` (dos cajas, desglose en `metadata`, **una sola fila** por serie con
 * `actual_hold_sec = L + R`); `alternating`, `bilateral` y `null` ⇒ `['single']` (una sola caja
 * `actual_hold_sec`).
 *
 * H7: `alternating` **no** es por lado para el eje TIEMPO —es exactamente lo que hace movilidad hoy
 * (`typed-screen-model.ts:146-148`, `typed-keypad.ts:100-105`, `set-log-payload.ts:121`)— aunque SÍ
 * lo sea para el eje REPS de fuerza (`buildStrengthPayload`, congelado: no cambia).
 *
 * Fuente única: `typedLogValues`, `buildStrengthTimePayload`, `keypadStepsForTarget`,
 * `use-hold-module`, `mobilitySides` y las dos UIs la consumen; nadie compara `sideMode` a mano.
 */
export function holdSidesFor(sideMode: string | null | undefined): HoldSide[] {
    return sideMode === 'per_side' ? ['left', 'right'] : ['single']
}

/**
 * Key de captura del lado (las MISMAS de movilidad, `typed-keypad.ts:101-105`, para que el motor las
 * lea con una sola rama): `single` ⇒ `actual_hold_sec`, `left`/`right` ⇒ `hold_left_sec`/`hold_right_sec`.
 */
export function holdValueKeyFor(side: HoldSide): string {
    if (side === 'left') return 'hold_left_sec'
    if (side === 'right') return 'hold_right_sec'
    return 'actual_hold_sec'
}

// ── Mezcla de captura de la fila del hold ────────────────────────────────────────────────────────

/**
 * Valores de la fila de captura de un hold, con UNA sola regla de precedencia: draft restaurado
 * (base) → lo que el alumno tiene tipeado ahora → los segundos del reloj (que son del reloj y pisan).
 *
 * Espejo de `mergeCardioCaptureValues` (`cardio-autolog.ts:212-232`) y existe por el MISMO motivo:
 * que la **semilla de la fila** y el **payload del auto-envío** sean la misma mezcla. Armarlas por
 * separado fue el drift ya vivido en cardio (el auto-registro mandaba la serie sin los metros ya
 * tipeados). Acá sería peor: en `per_side` el envío ocurre al cerrar el lado DERECHO y tiene que
 * llevar el izquierdo que se sembró un minuto antes.
 *
 * `holdSec` cae en la caja del lado que se cerró (`holdValueKeyFor`); `null`/0 ⇒ no se toca ninguna
 * caja. Los segundos son enteros: el keypad de hold no admite decimales.
 */
export function mergeHoldCaptureValues(input: {
    /** Draft restaurado de la fila (resiliencia): la base. */
    restored?: Record<string, string> | null
    /** Lo que el alumno tiene tipeado AHORA en la fila (pisa al draft). */
    typed?: Record<string, string> | null
    /** Segundos medidos por el reloj para el lado que se cierra. `null` ⇒ no se toca la caja. */
    holdSec?: number | null
    /** Lado que se cierra (`holdSidesFor`). Ausente ⇒ `'single'`. */
    side?: HoldSide
}): Record<string, string> {
    const merged: Record<string, string> = { ...(input.restored ?? {}), ...(input.typed ?? {}) }
    const seconds = positiveInt(input.holdSec)
    if (seconds != null) merged[holdValueKeyFor(input.side ?? 'single')] = String(seconds)
    return merged
}
