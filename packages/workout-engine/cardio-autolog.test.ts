import { describe, expect, it } from 'vitest'

import {
    cardioMinSeedValue,
    cardioMinutesFromSeconds,
    createCardioElapsed,
    decideCardioAutolog,
    intervalPhaseClosesRound,
    intervalRoundOfPhase,
    intervalRoundPrescribedSec,
    mergeCardioCaptureValues,
    pauseCardioElapsed,
    readCardioElapsed,
    resetCardioElapsed,
    startCardioElapsed,
    type CardioSegmentReason,
} from './cardio-autolog'
import { buildIntervalSequence } from './workout-interval'

const T0 = 1_800_000_000_000

describe('decideCardioAutolog — fin natural del tramo', () => {
    it('el timer llega a 0 y cierra la ronda ⇒ rellena, envía y resetea el acumulador', () => {
        expect(decideCardioAutolog({ reason: 'expired', elapsedSec: 1800, closesRound: true })).toEqual({
            fillSeconds: 1800,
            submit: true,
            resetElapsed: true,
        })
    })

    it('«Fase siguiente» que cierra la ronda ⇒ mismo trato que el vencimiento', () => {
        expect(decideCardioAutolog({ reason: 'manual-next', elapsedSec: 240, closesRound: true })).toEqual({
            fillSeconds: 240,
            submit: true,
            resetElapsed: true,
        })
    })

    it('fase intermedia (no cierra ronda) ⇒ no toca la caja ni envía', () => {
        for (const reason of ['expired', 'manual-next'] as const) {
            expect(decideCardioAutolog({ reason, elapsedSec: 60, closesRound: false })).toEqual({
                fillSeconds: null,
                submit: false,
                resetElapsed: false,
            })
        }
    })
})

describe('decideCardioAutolog — el alumno detiene (caso b del owner)', () => {
    it('pausa ⇒ rellena lo transcurrido, NO envía y no resetea', () => {
        expect(decideCardioAutolog({ reason: 'paused', elapsedSec: 42, closesRound: false })).toEqual({
            fillSeconds: 42,
            submit: false,
            resetElapsed: false,
        })
    })

    it('«Saltar fase» ⇒ rellena y nada más, aunque cierre la ronda', () => {
        expect(decideCardioAutolog({ reason: 'skipped', elapsedSec: 90, closesRound: true })).toEqual({
            fillSeconds: 90,
            submit: false,
            resetElapsed: false,
        })
    })
})

describe('decideCardioAutolog — guardas transversales', () => {
    it('«Reiniciar» limpia el acumulador y jamás reescribe la caja', () => {
        for (const closesRound of [true, false]) {
            expect(decideCardioAutolog({ reason: 'restart', elapsedSec: 900, closesRound })).toEqual({
                fillSeconds: null,
                submit: false,
                resetElapsed: true,
            })
        }
    })

    it('elapsed 0 o negativo ⇒ nunca se escribe MIN ni se manda una serie vacía', () => {
        const reasons: CardioSegmentReason[] = ['expired', 'manual-next', 'paused', 'skipped']
        for (const reason of reasons) {
            for (const elapsedSec of [0, -5, Number.NaN]) {
                expect(decideCardioAutolog({ reason, elapsedSec, closesRound: true })).toEqual({
                    fillSeconds: null,
                    submit: false,
                    resetElapsed: false,
                })
            }
        }
    })

    it('las 5 razones × cierra/no cierra devuelven una decisión coherente (tabla completa)', () => {
        const reasons: CardioSegmentReason[] = ['expired', 'manual-next', 'paused', 'skipped', 'restart']
        const submits: string[] = []
        for (const reason of reasons) {
            for (const closesRound of [true, false]) {
                const d = decideCardioAutolog({ reason, elapsedSec: 120, closesRound })
                if (d.submit) submits.push(`${reason}:${closesRound}`)
                // Un envío SIEMPRE trae minutos y cierra el tramo.
                if (d.submit) expect(d.fillSeconds).toBe(120)
                if (d.submit) expect(d.resetElapsed).toBe(true)
            }
        }
        expect(submits).toEqual(['expired:true', 'manual-next:true'])
    })
})

describe('acumulador de tiempo del tramo (reloj de pared)', () => {
    it('nace en 0 y detenido; leerlo sin arrancar da 0', () => {
        const s = createCardioElapsed()
        expect(s).toEqual({ accumulatedSec: 0, startedAtMs: null })
        expect(readCardioElapsed(s, T0 + 999_000)).toBe(0)
    })

    it('start → read a los 90 s da 90', () => {
        const s = startCardioElapsed(createCardioElapsed(), T0)
        expect(readCardioElapsed(s, T0 + 90_000)).toBe(90)
    })

    it('pausar congela: leerlo mucho después sigue dando lo transcurrido', () => {
        const running = startCardioElapsed(createCardioElapsed(), T0)
        const paused = pauseCardioElapsed(running, T0 + 90_000)
        expect(readCardioElapsed(paused, T0 + 300_000)).toBe(90)
    })

    it('start → pause → start suma los tramos y no el rato detenido', () => {
        let s = startCardioElapsed(createCardioElapsed(), T0)
        s = pauseCardioElapsed(s, T0 + 40_000)
        s = startCardioElapsed(s, T0 + 200_000)
        expect(readCardioElapsed(s, T0 + 260_000)).toBe(100)
    })

    it('start es idempotente (no re-ancla el inicio) y pause también', () => {
        const s = startCardioElapsed(createCardioElapsed(), T0)
        expect(startCardioElapsed(s, T0 + 30_000)).toBe(s)
        const paused = pauseCardioElapsed(s, T0 + 30_000)
        expect(pauseCardioElapsed(paused, T0 + 90_000)).toBe(paused)
        expect(readCardioElapsed(paused, T0 + 90_000)).toBe(30)
    })

    it('reset vuelve a 0 y detenido', () => {
        expect(resetCardioElapsed()).toEqual({ accumulatedSec: 0, startedAtMs: null })
    })

    it('un `now` anterior al inicio nunca da negativo', () => {
        const s = startCardioElapsed(createCardioElapsed(), T0)
        expect(readCardioElapsed(s, T0 - 5_000)).toBe(0)
    })
})

describe('rondas de intervalos sobre secuencias reales', () => {
    it('repeats 1 × sets 3 ⇒ 3 rondas y boundary en cada work/recovery de cierre', () => {
        const phases = buildIntervalSequence({ repeats: 1, work: { duration_sec: 60 }, recovery: { duration_sec: 30 } }, 3)
        // work1, rec1, work2, rec2, work3
        expect(phases.map((p) => p.kind)).toEqual(['work', 'recovery', 'work', 'recovery', 'work'])
        expect(phases.map((p) => intervalRoundOfPhase(p, 1, 3))).toEqual([1, 1, 2, 2, 3])
        expect(phases.map((_, i) => intervalPhaseClosesRound(phases, i, 1, 3))).toEqual([false, true, false, true, true])
    })

    it('repeats 4 × sets 2 ⇒ 8 works y solo 2 boundaries de captura', () => {
        const phases = buildIntervalSequence({ repeats: 4, work: { duration_sec: 60 }, recovery: { duration_sec: 30 } }, 2)
        expect(phases.filter((p) => p.kind === 'work')).toHaveLength(8)
        const closing = phases.map((_, i) => i).filter((i) => intervalPhaseClosesRound(phases, i, 4, 2))
        expect(closing).toHaveLength(2)
        // El primer boundary es la recuperación que sigue al 4º work; el segundo, la última fase.
        expect(intervalRoundOfPhase(phases[closing[0]], 4, 2)).toBe(1)
        expect(closing[1]).toBe(phases.length - 1)
    })

    it('warmup entra a la ronda 1 y cooldown a la última', () => {
        const phases = buildIntervalSequence(
            { repeats: 2, warmup_sec: 300, cooldown_sec: 180, work: { duration_sec: 60 }, recovery: { duration_sec: 30 } },
            2,
        )
        expect(phases[0].kind).toBe('warmup')
        expect(phases[phases.length - 1].kind).toBe('cooldown')
        expect(intervalRoundOfPhase(phases[0], 2, 2)).toBe(1)
        expect(intervalRoundOfPhase(phases[phases.length - 1], 2, 2)).toBe(2)
        // El warmup jamás cierra ronda; el cooldown, al ser la última fase, sí.
        expect(intervalPhaseClosesRound(phases, 0, 2, 2)).toBe(false)
        expect(intervalPhaseClosesRound(phases, phases.length - 1, 2, 2)).toBe(true)
    })

    it('work por DISTANCIA (fase manual, durationSec 0) se rondea igual', () => {
        const phases = buildIntervalSequence({ repeats: 2, work: { distance_m: 400 }, recovery: { duration_sec: 90 } }, 2)
        const works = phases.filter((p) => p.kind === 'work')
        expect(works.every((p) => p.mode === 'manual' && p.durationSec === 0)).toBe(true)
        expect(phases.map((p) => intervalRoundOfPhase(p, 2, 2))).toEqual([1, 1, 1, 1, 2, 2, 2])
        expect(intervalPhaseClosesRound(phases, 3, 2, 2)).toBe(true)
        expect(intervalPhaseClosesRound(phases, 2, 2, 2)).toBe(false)
    })

    it('fase nula, índice fuera de rango y repeats basura no rompen', () => {
        expect(intervalRoundOfPhase(null, 2, 3)).toBeNull()
        expect(intervalRoundOfPhase({ kind: 'work', durationSec: 60, repeat: 5 }, 0, 2)).toBe(2)
        expect(intervalPhaseClosesRound([], 0, 1, 1)).toBe(false)
        expect(intervalPhaseClosesRound([{ kind: 'work', durationSec: 60 }], -1, 1, 1)).toBe(false)
    })
})

describe('formato de la caja MIN', () => {
    it('segundos → minutos con un decimal', () => {
        expect(cardioMinutesFromSeconds(1800)).toBe(30)
        expect(cardioMinutesFromSeconds(1830)).toBe(30.5)
        expect(cardioMinutesFromSeconds(45)).toBe(0.8)
        expect(cardioMinutesFromSeconds(0)).toBe(0)
        expect(cardioMinutesFromSeconds(-10)).toBe(0)
    })

    it('semilla con coma es-CL (keypad) y con punto (input nativo)', () => {
        expect(cardioMinSeedValue(1830, { decimalComma: true })).toBe('30,5')
        expect(cardioMinSeedValue(1830)).toBe('30.5')
        expect(cardioMinSeedValue(1800, { decimalComma: true })).toBe('30')
        expect(cardioMinSeedValue(45, { decimalComma: true })).toBe('0,8')
    })
})

describe('tope del reloj de pared (`prescribedSec`) — volver de background', () => {
    it('bloque de 20 min con 45 min de reloj de pared ⇒ se registran los 20 PRESCRITOS', () => {
        expect(decideCardioAutolog({ reason: 'expired', elapsedSec: 2700, closesRound: true, prescribedSec: 1200 })).toEqual({
            fillSeconds: 1200,
            submit: true,
            resetElapsed: true,
        })
    })

    it('el tope no infla nada: si el tramo duró menos, se registra lo transcurrido', () => {
        expect(decideCardioAutolog({ reason: 'paused', elapsedSec: 300, closesRound: false, prescribedSec: 1200 })).toEqual({
            fillSeconds: 300,
            submit: false,
            resetElapsed: false,
        })
    })

    it('la pausa al volver de background también queda topeada (no hay reloj de pared sin tope)', () => {
        expect(decideCardioAutolog({ reason: 'paused', elapsedSec: 5400, closesRound: false, prescribedSec: 600 })).toEqual({
            fillSeconds: 600,
            submit: false,
            resetElapsed: false,
        })
    })

    it('sin prescripción (distancia / cronómetro) el reloj de pared es la verdad', () => {
        for (const prescribedSec of [null, undefined, 0, Number.NaN]) {
            expect(decideCardioAutolog({ reason: 'expired', elapsedSec: 900, closesRound: true, prescribedSec })).toEqual({
                fillSeconds: 900,
                submit: true,
                resetElapsed: true,
            })
        }
    })
})

describe('intervalRoundPrescribedSec — tope por RONDA de captura', () => {
    // 4×(1:00/0:30) con `sets: 2`, warmup 5:00 y cooldown 3:00. `buildIntervalSequence` no emite
    // recuperación después del ÚLTIMO work de la secuencia.
    const phases = buildIntervalSequence(
        { repeats: 4, warmup_sec: 300, cooldown_sec: 180, work: { duration_sec: 60 }, recovery: { duration_sec: 30 } },
        2,
    )

    it('la ronda 1 incluye el warmup y la ronda 2 el cooldown (suma = secuencia completa)', () => {
        const closing = phases.map((_, i) => i).filter((i) => intervalPhaseClosesRound(phases, i, 4, 2))
        expect(closing).toHaveLength(2)
        // Ronda 1: warmup 300 + 4×(60+30) = 660. Ronda 2: 4×60 + 3×30 + cooldown 180 = 510.
        expect(intervalRoundPrescribedSec(phases, closing[0], 4, 2)).toBe(660)
        expect(intervalRoundPrescribedSec(phases, closing[1], 4, 2)).toBe(510)
        const total = phases.reduce((acc, p) => acc + p.durationSec, 0)
        expect(660 + 510).toBe(total)
    })

    it('una ronda con fase por DISTANCIA no tiene tope (dura lo que el alumno tarde)', () => {
        const manual = buildIntervalSequence({ repeats: 2, work: { distance_m: 400 }, recovery: { duration_sec: 90 } }, 2)
        expect(intervalRoundPrescribedSec(manual, 0, 2, 2)).toBeNull()
        expect(intervalRoundPrescribedSec(manual, manual.length - 1, 2, 2)).toBeNull()
    })

    it('índice fuera de rango o secuencia vacía ⇒ null (sin tope, nunca una excepción)', () => {
        expect(intervalRoundPrescribedSec([], 0, 1, 1)).toBeNull()
        expect(intervalRoundPrescribedSec(phases, -1, 4, 2)).toBeNull()
        expect(intervalRoundPrescribedSec(phases, phases.length, 4, 2)).toBeNull()
    })
})

describe('mergeCardioCaptureValues — misma mezcla en la semilla y en el auto-envío', () => {
    it('lo tipeado pisa al draft restaurado y la caja MIN es del timer', () => {
        expect(
            mergeCardioCaptureValues({
                restored: { actual_distance_m: '4000', cardio_min: '12' },
                typed: { actual_distance_m: '5200' },
                minSec: 1830,
            }),
        ).toEqual({ actual_distance_m: '5200', cardio_min: '30,5' })
    })

    it('sin nada tipeado conserva el draft restaurado (el auto-envío no pierde los metros)', () => {
        expect(mergeCardioCaptureValues({ restored: { actual_distance_m: '5200' }, typed: {}, minSec: 600 })).toEqual({
            actual_distance_m: '5200',
            cardio_min: '10',
        })
    })

    it('la FC del sensor entra solo si la caja está vacía; jamás pisa al alumno', () => {
        expect(mergeCardioCaptureValues({ typed: { actual_avg_hr: '150' }, seededAvgHr: 132 }).actual_avg_hr).toBe('150')
        expect(mergeCardioCaptureValues({ typed: { actual_avg_hr: '  ' }, seededAvgHr: 132 }).actual_avg_hr).toBe('132')
        expect(mergeCardioCaptureValues({ seededAvgHr: 132.4 }).actual_avg_hr).toBe('132')
    })

    it('minutos en 0/negativos o FC nula no ensucian la mezcla', () => {
        expect(mergeCardioCaptureValues({ minSec: 0, seededAvgHr: null })).toEqual({})
        expect(mergeCardioCaptureValues({ minSec: -30 })).toEqual({})
        expect(mergeCardioCaptureValues({ restored: null, typed: null })).toEqual({})
    })

    it('punto decimal cuando el consumidor no es el keypad es-CL', () => {
        expect(mergeCardioCaptureValues({ minSec: 1830, decimalComma: false }).cardio_min).toBe('30.5')
    })
})
