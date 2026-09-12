/**
 * Contrato del auto-registro del HOLD (specs/cuenta-atras-en-pantalla, W1.1/W1.2).
 *
 * Congela la tabla canónica del OUTLINE §4 fila por fila —es la que decide si una serie se guarda
 * sola (V2), si el ejecutor pasa al siguiente miembro de la superserie (V4) o se queda quieto
 * (V3/D2)— más las tres piezas que la acompañan:
 *  - `expiredWhileAwayFrom` (R27): la señal se deriva de EVIDENCIA, así que los DOS caminos de
 *    disparo (tick del intervalo / evento de visibilidad) tienen que dar el mismo resultado;
 *  - `holdSidesFor` (R34): una sola regla de lados para el eje TIEMPO;
 *  - `mergeHoldCaptureValues`: la semilla de la fila y el payload del auto-envío son la MISMA mezcla.
 */
import { describe, it, expect, afterEach, vi } from 'vitest'

import {
    HOLD_EXPIRED_AWAY_GRACE_MS,
    captureGapsFor,
    createHoldElapsed,
    decideHoldAutolog,
    expiredWhileAwayFrom,
    holdSidesFor,
    holdValueKeyFor,
    mergeHoldCaptureValues,
    pauseHoldElapsed,
    readHoldElapsed,
    startHoldElapsed,
    type HoldEndReason,
} from './hold-autolog'
import { buildStrengthTimePayload } from './set-log-payload'

const T0 = 1_800_000_000_000

describe('decideHoldAutolog — tabla canónica (OUTLINE §4)', () => {
    it('1) `expired` en pantalla sola ⇒ anota el objetivo, envía y NO avanza (V2 + V3)', () => {
        expect(
            decideHoldAutolog({ reason: 'expired', elapsedSec: 30, prescribedSec: 30, side: 'single', context: 'solo' }),
        ).toEqual({
            fillSeconds: 30,
            submit: true,
            holdSource: 'timer',
            advanceSide: false,
            autoStartNextSide: false,
            advance: 'stay',
        })
    })

    it('2) `expired` en superserie sin cerrar ronda ⇒ pasa al siguiente miembro (V4)', () => {
        const d = decideHoldAutolog({
            reason: 'expired',
            elapsedSec: 30,
            prescribedSec: 30,
            context: 'superset',
            closesRound: false,
        })
        expect(d.submit).toBe(true)
        expect(d.advance).toBe('next-member')
    })

    it('3) `expired` en superserie que CIERRA la ronda ⇒ se queda quieto (D2: espera el toque)', () => {
        const d = decideHoldAutolog({
            reason: 'expired',
            elapsedSec: 30,
            prescribedSec: 30,
            context: 'superset',
            closesRound: true,
        })
        expect(d.submit).toBe(true)
        expect(d.advance).toBe('stay')
    })

    it('4) `expired` en el lado IZQUIERDO ⇒ no envía, pasa de lado y lo arranca solo', () => {
        expect(
            decideHoldAutolog({ reason: 'expired', elapsedSec: 30, prescribedSec: 30, side: 'left' }),
        ).toMatchObject({
            submit: false,
            advanceSide: true,
            autoStartNextSide: true,
        })
    })

    it('5) `expired` en el izquierdo con `expiredWhileAway` ⇒ el lado 2 NO arranca solo (R6/R27)', () => {
        expect(
            decideHoldAutolog({
                reason: 'expired',
                elapsedSec: 30,
                prescribedSec: 30,
                side: 'left',
                expiredWhileAway: true,
            }),
        ).toMatchObject({ advanceSide: true, autoStartNextSide: false })
    })

    it('6) vuelta de background: 300 s de reloj de pared en un hold de 30 ⇒ se anota 30, no 300', () => {
        const d = decideHoldAutolog({
            reason: 'expired',
            elapsedSec: 300,
            prescribedSec: 30,
            side: 'single',
            expiredWhileAway: true,
        })
        expect(d.fillSeconds).toBe(30)
        expect(d.submit).toBe(true)
        expect(d.holdSource).toBe('timer')
    })

    it('7) `done-early` con 18 de 30 ⇒ guarda lo transcurrido con fuente `manual` (A2/R22)', () => {
        expect(
            decideHoldAutolog({ reason: 'done-early', elapsedSec: 18, prescribedSec: 30, side: 'single' }),
        ).toEqual({
            fillSeconds: 18,
            submit: true,
            holdSource: 'manual',
            advanceSide: false,
            autoStartNextSide: false,
            advance: 'stay',
        })
    })

    it('8) `done-early` con 0 s ⇒ no envía nada (R22: jamás una serie de 0)', () => {
        expect(decideHoldAutolog({ reason: 'done-early', elapsedSec: 0, prescribedSec: 30 })).toEqual({
            fillSeconds: null,
            submit: false,
            holdSource: null,
            advanceSide: false,
            autoStartNextSide: false,
            advance: 'stay',
        })
    })

    it('9) `paused` ⇒ rellena lo transcurrido, no envía y no avanza (A1)', () => {
        expect(decideHoldAutolog({ reason: 'paused', elapsedSec: 12, prescribedSec: 30 })).toEqual({
            fillSeconds: 12,
            submit: false,
            holdSource: null,
            advanceSide: false,
            autoStartNextSide: false,
            advance: 'stay',
        })
    })

    it('9b) `paused` DESPUÉS del vencimiento (app en background) ⇒ tope en el objetivo, nunca el reloj de pared', () => {
        expect(decideHoldAutolog({ reason: 'paused', elapsedSec: 300, prescribedSec: 30 }).fillSeconds).toBe(30)
    })

    it('10) `restart` («re-medir») ⇒ no toca la caja ni envía', () => {
        expect(decideHoldAutolog({ reason: 'restart', elapsedSec: 25, prescribedSec: 30 })).toEqual({
            fillSeconds: null,
            submit: false,
            holdSource: null,
            advanceSide: false,
            autoStartNextSide: false,
            advance: 'stay',
        })
    })

    it('11) `done-early` en el izquierdo ⇒ guarda el lado y pasa al derecho, sin enviar la fila', () => {
        expect(
            decideHoldAutolog({ reason: 'done-early', elapsedSec: 22, prescribedSec: 30, side: 'left' }),
        ).toMatchObject({ fillSeconds: 22, submit: false, advanceSide: true, holdSource: 'manual' })
    })

    it('12) cualquier motivo con `elapsedSec <= 0` ⇒ no-op (jamás una serie de 0 segundos)', () => {
        const reasons: HoldEndReason[] = ['expired', 'done-early', 'paused', 'restart']
        for (const reason of reasons) {
            for (const elapsedSec of [0, -5, Number.NaN]) {
                expect(decideHoldAutolog({ reason, elapsedSec, prescribedSec: 30 })).toEqual({
                    fillSeconds: null,
                    submit: false,
                    holdSource: null,
                    advanceSide: false,
                    autoStartNextSide: false,
                    advance: 'stay',
                })
            }
        }
    })

    it('el lado DERECHO cierra la serie: envía y, en superserie sin cierre de ronda, avanza (V4)', () => {
        const d = decideHoldAutolog({
            reason: 'expired',
            elapsedSec: 28,
            prescribedSec: 30,
            side: 'right',
            context: 'superset',
            closesRound: false,
        })
        expect(d).toMatchObject({ submit: true, advanceSide: false, advance: 'next-member' })
    })

    it('el motor NUNCA arranca descansos: la decisión no tiene ninguna clave de descanso', () => {
        const d = decideHoldAutolog({ reason: 'expired', elapsedSec: 30, prescribedSec: 30, closesRound: true })
        expect(Object.keys(d).sort()).toEqual([
            'advance',
            'advanceSide',
            'autoStartNextSide',
            'fillSeconds',
            'holdSource',
            'submit',
        ])
    })

    it('sin `prescribedSec` el vencimiento cae a lo medido (no inventa un objetivo)', () => {
        expect(decideHoldAutolog({ reason: 'expired', elapsedSec: 42 }).fillSeconds).toBe(42)
    })

    it('el lado izquierdo nunca avanza de miembro, aunque el hold viva en una superserie', () => {
        expect(
            decideHoldAutolog({
                reason: 'expired',
                elapsedSec: 30,
                prescribedSec: 30,
                side: 'left',
                context: 'superset',
                closesRound: false,
            }).advance,
        ).toBe('stay')
    })
})

// ── R27: `expiredWhileAway` se DERIVA de evidencia, no de quién disparó el fin ───────────────────

describe('expiredWhileAwayFrom — los dos caminos de disparo dan el MISMO resultado (R27)', () => {
    afterEach(() => {
        vi.useRealTimers()
    })

    /**
     * Simula el hook: `triggerDone` es de disparo único y lo llaman DOS caminos que compiten —el tick
     * del intervalo y el evento de visibilidad (`AppState` en RN, `visibilitychange` en web)—. La
     * señal se calcula DENTRO de `triggerDone` con el fin absoluto (`endAtMs`) y el estado de
     * visibilidad, así que el resultado no puede depender de quién ganó la carrera.
     */
    function runTriggerRace(order: 'tick-first' | 'event-first', endAtMs: number, visible: boolean) {
        let fired: boolean | null = null
        const triggerDone = () => {
            if (fired !== null) return // disparo único
            fired = expiredWhileAwayFrom({ nowMs: Date.now(), endAtMs, visible })
        }
        const tick = () => triggerDone()
        const visibilityEvent = () => triggerDone()
        if (order === 'tick-first') {
            tick()
            visibilityEvent()
        } else {
            visibilityEvent()
            tick()
        }
        return fired
    }

    it('hold vencido con la app FUERA ⇒ true por los dos caminos, y el lado 2 no arranca solo', () => {
        vi.useFakeTimers()
        const endAtMs = T0 + 30_000
        // El alumno vuelve 5 minutos después: el fin quedó muy atrás y la app no estaba activa.
        vi.setSystemTime(new Date(endAtMs + 300_000))
        const tickFirst = runTriggerRace('tick-first', endAtMs, false)
        const eventFirst = runTriggerRace('event-first', endAtMs, false)
        expect(tickFirst).toBe(true)
        expect(eventFirst).toBe(tickFirst)
        const d = decideHoldAutolog({
            reason: 'expired',
            elapsedSec: 330,
            prescribedSec: 30,
            side: 'left',
            expiredWhileAway: tickFirst ?? false,
        })
        expect(d).toMatchObject({ fillSeconds: 30, advanceSide: true, autoStartNextSide: false })
    })

    it('la pantalla ya volvió a estar visible pero el fin quedó atrás ⇒ igual es «away» (el tick ganó)', () => {
        vi.useFakeTimers()
        const endAtMs = T0 + 30_000
        vi.setSystemTime(new Date(endAtMs + 300_000))
        expect(runTriggerRace('tick-first', endAtMs, true)).toBe(true)
        expect(runTriggerRace('event-first', endAtMs, true)).toBe(true)
    })

    it('control: fin EN pantalla (dentro de la gracia y app activa) ⇒ false y el lado 2 arranca solo', () => {
        vi.useFakeTimers()
        const endAtMs = T0 + 30_000
        vi.setSystemTime(new Date(endAtMs + (HOLD_EXPIRED_AWAY_GRACE_MS - 500)))
        const tickFirst = runTriggerRace('tick-first', endAtMs, true)
        const eventFirst = runTriggerRace('event-first', endAtMs, true)
        expect(tickFirst).toBe(false)
        expect(eventFirst).toBe(false)
        expect(
            decideHoldAutolog({
                reason: 'expired',
                elapsedSec: 30,
                prescribedSec: 30,
                side: 'left',
                expiredWhileAway: tickFirst ?? false,
            }).autoStartNextSide,
        ).toBe(true)
    })

    it('sin `endAtMs` manda la visibilidad (y nunca revienta)', () => {
        expect(expiredWhileAwayFrom({ nowMs: T0, endAtMs: null, visible: true })).toBe(false)
        expect(expiredWhileAwayFrom({ nowMs: T0, endAtMs: null, visible: false })).toBe(true)
    })
})

// ── R34: una sola regla de lados para el eje TIEMPO ──────────────────────────────────────────────

describe('holdSidesFor (R34)', () => {
    it('`per_side` ⇒ izquierdo y derecho, en ese orden', () => {
        expect(holdSidesFor('per_side')).toEqual(['left', 'right'])
    })

    it('`alternating` ⇒ UN solo lado (H7: para el eje tiempo no es por lado)', () => {
        expect(holdSidesFor('alternating')).toEqual(['single'])
    })

    it('`null`, `undefined` y `bilateral` ⇒ un solo lado, como movilidad hoy', () => {
        expect(holdSidesFor(null)).toEqual(['single'])
        expect(holdSidesFor(undefined)).toEqual(['single'])
        expect(holdSidesFor('bilateral')).toEqual(['single'])
    })

    it('las keys de captura son las MISMAS de movilidad', () => {
        expect(holdSidesFor('per_side').map(holdValueKeyFor)).toEqual(['hold_left_sec', 'hold_right_sec'])
        expect(holdSidesFor('bilateral').map(holdValueKeyFor)).toEqual(['actual_hold_sec'])
    })
})

// ── La semilla de la fila y el payload del auto-envío son la MISMA mezcla ────────────────────────

describe('mergeHoldCaptureValues', () => {
    it('precedencia draft → tipeado → reloj (el reloj pisa la caja del lado que se cerró)', () => {
        expect(
            mergeHoldCaptureValues({
                restored: { weight: '8', actual_hold_sec: '5' },
                typed: { weight: '10' },
                holdSec: 30,
            }),
        ).toEqual({ weight: '10', actual_hold_sec: '30' })
    })

    it('`holdSec` nulo o 0 ⇒ no toca ninguna caja', () => {
        const base = { weight: '10', actual_hold_sec: '12' }
        expect(mergeHoldCaptureValues({ typed: base, holdSec: null })).toEqual(base)
        expect(mergeHoldCaptureValues({ typed: base, holdSec: 0 })).toEqual(base)
    })

    it('bilateral: semilla y payload salen de la misma mezcla', () => {
        const values = mergeHoldCaptureValues({ typed: { weight: '10', rir: '2' }, holdSec: 30 })
        expect(values).toEqual({ weight: '10', rir: '2', actual_hold_sec: '30' })
        expect(buildStrengthTimePayload(values, 'blk-plancha', 2, { holdSource: 'timer' })).toMatchObject({
            weightKg: 10,
            repsDone: null,
            actualHoldSec: 30,
            rir: 2,
            metadata: { hold_source: 'timer' },
        })
    })

    it('`per_side`: el lado izquierdo sembrado sobrevive hasta el envío del derecho (una sola fila)', () => {
        const afterLeft = mergeHoldCaptureValues({ typed: { weight: '10' }, holdSec: 30, side: 'left' })
        expect(afterLeft).toEqual({ weight: '10', hold_left_sec: '30' })
        const afterRight = mergeHoldCaptureValues({ restored: afterLeft, holdSec: 28, side: 'right' })
        expect(afterRight).toEqual({ weight: '10', hold_left_sec: '30', hold_right_sec: '28' })
        expect(
            buildStrengthTimePayload(afterRight, 'blk-plancha', 2, { sideMode: 'per_side', holdSource: 'timer' }),
        ).toMatchObject({
            actualHoldSec: 58,
            metadata: { left_sec: 30, right_sec: 28, hold_source: 'timer' },
        })
    })

    it('los segundos se guardan enteros (el keypad de hold no admite decimales)', () => {
        expect(mergeHoldCaptureValues({ holdSec: 29.6 })).toEqual({ actual_hold_sec: '30' })
    })
})

// ── Huecos de la captura al cerrar el hold (R2/R3, «Reps tras el reloj») ─────────────────────────

describe('captureGapsFor', () => {
    it('mobility ⇒ [] siempre, aunque falte todo', () => {
        expect(captureGapsFor({}, 'mobility')).toEqual([])
        expect(captureGapsFor({ reps: '', weight: '' }, 'mobility')).toEqual([])
    })

    it('reps vacío ⇒ [\'reps\']', () => {
        expect(captureGapsFor({ reps: '', weight: '10' }, 'strength_time')).toEqual(['reps'])
    })

    it('reps \'0\' ⇒ [\'reps\'] (nunca cuenta como anotado, F1)', () => {
        expect(captureGapsFor({ reps: '0', weight: '10' }, 'strength_time')).toEqual(['reps'])
    })

    it('reps \'8\' ⇒ [] (con peso presente, ningún hueco)', () => {
        expect(captureGapsFor({ reps: '8', weight: '10' }, 'strength_time')).toEqual([])
    })

    it('peso presente no aparece en los huecos aunque sea 0 (peso corporal es un dato real)', () => {
        expect(captureGapsFor({ reps: '8', weight: '0' }, 'strength_time')).toEqual([])
    })

    it('sin peso ni reps ⇒ [\'reps\',\'weight\'] con el orden estable (reps antes que peso)', () => {
        expect(captureGapsFor({}, 'strength_time')).toEqual(['reps', 'weight'])
        expect(captureGapsFor({ reps: '', weight: '' }, 'strength_time')).toEqual(['reps', 'weight'])
    })

    it('peso vacío con reps anotadas ⇒ solo [\'weight\']', () => {
        expect(captureGapsFor({ reps: '8', weight: '' }, 'strength_time')).toEqual(['weight'])
    })

    // Tabla de parseo (congela las DOS formas: reps vía optionalReps —redondeo `int()` incluido—, peso
    // vía num — set-log-payload.ts `:334-337` y `:29`) para que `captureGapsFor` nunca diverja de la
    // regla que ya guarda la serie: `'0,5'` redondea a 1 (`optionalReps` GUARDA `reps_done = 1`) ⇒ NO
    // es hueco; `'0,4'` redondea a 0 (`optionalReps` guarda `null`) ⇒ SÍ es hueco.
    it.each([
        ['', true, true],
        ['0', true, false],
        ['0,5', false, false],
        ['0,4', true, false],
        ['-3', true, false],
        ['8', false, false],
        [' 8 ', false, false],
        ['60', false, false],
        ['60,5', false, false],
        ['abc', true, true],
    ])('valor %j ⇒ reps-hueco=%s, peso-hueco=%s', (value, repsGap, weightGap) => {
        expect(captureGapsFor({ reps: value, weight: '999' }, 'strength_time').includes('reps')).toBe(repsGap)
        expect(captureGapsFor({ reps: '8', weight: value }, 'strength_time').includes('weight')).toBe(weightGap)
    })
})

// ── Acumulador de reloj de pared: es el de cardio, con alias neutro (no se duplicó) ──────────────

describe('acumulador de reloj de pared del hold', () => {
    it('cuenta por reloj de pared (sobrevive a que no corran ticks) y se congela al pausar', () => {
        let state = startHoldElapsed(createHoldElapsed(), T0)
        expect(readHoldElapsed(state, T0 + 30_000)).toBe(30)
        state = pauseHoldElapsed(state, T0 + 30_000)
        expect(readHoldElapsed(state, T0 + 300_000)).toBe(30)
    })
})
