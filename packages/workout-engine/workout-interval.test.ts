import { describe, expect, it } from 'vitest'
import {
    INTERVAL_TEMPLATES,
    buildIntervalPhases,
    buildIntervalSequence,
    formatIntervalPhaseDistance,
    intervalPhaseTargetLabel,
    intervalTimerKind,
    intervalTotalDurationSec,
    isManualPhase,
    isTimeableInterval,
    type IntervalConfig,
} from './workout-interval'

/**
 * Fase D (G2/RF7) — intervalos por DISTANCIA con avance manual.
 *
 * Invariante de retrocompatibilidad: `buildIntervalPhases` (que alimenta los timers globales
 * flotantes de web y RN) mantiene su contrato exacto — solo fases cronometrables y `[]` si el work
 * es por distancia. La secuencia completa (mixta) la entrega `buildIntervalSequence`.
 */

const timedConfig: IntervalConfig = {
    warmup_sec: 300,
    repeats: 3,
    work: { duration_sec: 60 },
    recovery: { duration_sec: 30 },
    cooldown_sec: 120,
}

describe('intervalTimerKind (clasificador Fase D)', () => {
    it('work por tiempo ⇒ timeable; por distancia ⇒ manual; vacío ⇒ none', () => {
        expect(intervalTimerKind(timedConfig)).toBe('timeable')
        expect(intervalTimerKind({ repeats: 8, work: { distance_m: 400 } })).toBe('manual')
        expect(intervalTimerKind({ repeats: 4, work: {} })).toBe('none')
        expect(intervalTimerKind(null)).toBe('none')
        expect(intervalTimerKind(undefined)).toBe('none')
    })

    it('isTimeableInterval sigue siendo el wrapper exacto de "timeable"', () => {
        expect(isTimeableInterval(timedConfig)).toBe(true)
        expect(isTimeableInterval({ repeats: 8, work: { distance_m: 400 } })).toBe(false)
        expect(isTimeableInterval(null)).toBe(false)
    })

    it('duración manda sobre distancia cuando el coach prescribió las dos', () => {
        expect(intervalTimerKind({ repeats: 2, work: { duration_sec: 45, distance_m: 200 } })).toBe('timeable')
    })
})

describe('buildIntervalPhases (retrocompat: solo cronometrables)', () => {
    it('config por tiempo genera EXACTAMENTE lo mismo que la secuencia completa', () => {
        expect(buildIntervalPhases(timedConfig, 1)).toEqual(buildIntervalSequence(timedConfig, 1))
        expect(buildIntervalPhases(timedConfig, 1).every((p) => p.mode === 'timed')).toBe(true)
    })

    it('work por distancia sigue devolviendo [] (los timers globales no saben avanzar a mano)', () => {
        expect(buildIntervalPhases({ repeats: 8, work: { distance_m: 400 }, recovery: { duration_sec: 90 } })).toEqual([])
        expect(intervalTotalDurationSec({ repeats: 8, work: { distance_m: 400 } })).toBe(0)
    })

    it('recuperación por distancia con work por tiempo: se descarta (como hoy), sin romper la secuencia', () => {
        const config: IntervalConfig = { repeats: 3, work: { duration_sec: 60 }, recovery: { distance_m: 200 } }
        expect(buildIntervalPhases(config, 1).map((p) => p.kind)).toEqual(['work', 'work', 'work'])
        expect(buildIntervalSequence(config, 1).map((p) => p.kind)).toEqual([
            'work', 'recovery', 'work', 'recovery', 'work',
        ])
    })
})

describe('buildIntervalSequence — 8×400m (plantilla del sistema)', () => {
    const tpl = INTERVAL_TEMPLATES.find((t) => t.id === 'track-8x400')!
    const phases = buildIntervalSequence(tpl.config, 1)

    it('genera 8 fases de 400 m intercaladas con recuperaciones por tiempo', () => {
        const works = phases.filter((p) => p.kind === 'work')
        expect(works).toHaveLength(8)
        expect(works.every((p) => p.mode === 'manual' && p.distanceM === 400 && p.durationSec === 0)).toBe(true)

        const recoveries = phases.filter((p) => p.kind === 'recovery')
        expect(recoveries).toHaveLength(7) // la última se omite
        expect(recoveries.every((p) => p.mode === 'timed' && p.durationSec === 90)).toBe(true)
    })

    it('warmup y cooldown se cronometran y enmarcan la secuencia', () => {
        expect(phases[0]).toMatchObject({ kind: 'warmup', durationSec: 600, mode: 'timed' })
        expect(phases[phases.length - 1]).toMatchObject({ kind: 'cooldown', durationSec: 300, mode: 'timed' })
        expect(phases.map((p) => p.kind)).toEqual([
            'warmup',
            'work', 'recovery', 'work', 'recovery', 'work', 'recovery', 'work', 'recovery',
            'work', 'recovery', 'work', 'recovery', 'work', 'recovery', 'work',
            'cooldown',
        ])
    })

    it('numera los intervalos N de M en works y recoveries', () => {
        const works = phases.filter((p) => p.kind === 'work')
        expect(works[0]).toMatchObject({ repeat: 1, totalRepeats: 8 })
        expect(works[7]).toMatchObject({ repeat: 8, totalRepeats: 8 })
    })
})

describe('buildIntervalSequence — HYROX y mixtos', () => {
    it('HYROX: 4 carreras de 1 km manuales + 3 estaciones de 90 s cronometradas', () => {
        const tpl = INTERVAL_TEMPLATES.find((t) => t.id === 'hyrox-compromised-run')!
        const phases = buildIntervalSequence(tpl.config, 1)
        expect(phases.map((p) => p.kind)).toEqual([
            'warmup', 'work', 'recovery', 'work', 'recovery', 'work', 'recovery', 'work',
        ])
        expect(phases.filter((p) => isManualPhase(p))).toHaveLength(4)
        expect(intervalPhaseTargetLabel(phases[1])).toBe('1 km')
        expect(intervalPhaseTargetLabel(phases[2])).toBe('') // la recuperación se cronometra
    })

    it('sets multiplica los intervalos también en distancia', () => {
        const phases = buildIntervalSequence({ repeats: 2, work: { distance_m: 800 }, recovery: { duration_sec: 60 } }, 3)
        const works = phases.filter((p) => p.kind === 'work')
        expect(works).toHaveLength(6)
        expect(works[5]).toMatchObject({ repeat: 6, totalRepeats: 6, distanceM: 800, mode: 'manual' })
    })

    it('mixto: work por distancia + recovery por distancia ⇒ todo manual salvo warmup/cooldown', () => {
        const phases = buildIntervalSequence(
            { warmup_sec: 120, repeats: 2, work: { distance_m: 400 }, recovery: { distance_m: 200 }, cooldown_sec: 60 },
            1,
        )
        expect(phases.map((p) => p.mode)).toEqual(['timed', 'manual', 'manual', 'manual', 'timed'])
    })

    it('work sin tiempo ni distancia ⇒ secuencia vacía', () => {
        expect(buildIntervalSequence({ repeats: 4, work: {}, recovery: { duration_sec: 30 } })).toEqual([])
    })
})

describe('formatIntervalPhaseDistance', () => {
    it('metros bajo el kilómetro, km enteros y decimales con coma', () => {
        expect(formatIntervalPhaseDistance(400)).toBe('400 m')
        expect(formatIntervalPhaseDistance(999)).toBe('999 m')
        expect(formatIntervalPhaseDistance(1000)).toBe('1 km')
        expect(formatIntervalPhaseDistance(1500)).toBe('1,5 km')
        expect(formatIntervalPhaseDistance(0)).toBe('')
        expect(formatIntervalPhaseDistance(null)).toBe('')
    })
})
