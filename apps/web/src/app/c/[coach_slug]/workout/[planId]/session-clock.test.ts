import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
    sessionClockKey,
    readSessionStart,
    persistSessionStart,
    clearSessionStart,
    sweepOtherDaySessionStarts,
    elapsedSecondsSince,
} from './session-clock'

const PLAN = 'plan-abc'
const DAY = '2026-07-07'
const OTHER_DAY = '2026-07-06'

beforeEach(() => {
    localStorage.clear()
})

afterEach(() => {
    vi.restoreAllMocks()
})

describe('sessionClockKey', () => {
    it('compone la clave con prefijo, plan y día', () => {
        expect(sessionClockKey(PLAN, DAY)).toBe('eva:workout-session-start:plan-abc:2026-07-07')
    })
})

describe('persistSessionStart / readSessionStart', () => {
    it('round-trip: persiste un ancla y la lee de vuelta', () => {
        const now = 1_700_000_000_000
        expect(persistSessionStart(PLAN, DAY, now)).toBe(true)
        expect(readSessionStart(PLAN, DAY, now + 5000)).toBe(now)
    })

    it('devuelve null si no hay ancla', () => {
        expect(readSessionStart(PLAN, DAY)).toBeNull()
    })

    it('devuelve null ante basura (no-entero, cero, negativo)', () => {
        localStorage.setItem(sessionClockKey(PLAN, DAY), 'no-soy-un-numero')
        expect(readSessionStart(PLAN, DAY)).toBeNull()
        localStorage.setItem(sessionClockKey(PLAN, DAY), '0')
        expect(readSessionStart(PLAN, DAY)).toBeNull()
        localStorage.setItem(sessionClockKey(PLAN, DAY), '-5')
        expect(readSessionStart(PLAN, DAY)).toBeNull()
        localStorage.setItem(sessionClockKey(PLAN, DAY), '123.5')
        expect(readSessionStart(PLAN, DAY)).toBeNull()
    })

    it('descarta un ancla FUTURA (reloj adelantado/corrupción) → null para re-anclar', () => {
        const now = 1_700_000_000_000
        persistSessionStart(PLAN, DAY, now + 60_000)
        expect(readSessionStart(PLAN, DAY, now)).toBeNull()
    })

    it('persistSessionStart no propaga si setItem lanza (best-effort → false)', () => {
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('QuotaExceeded')
        })
        expect(persistSessionStart(PLAN, DAY, 123)).toBe(false)
    })

    it('readSessionStart no propaga si getItem lanza (best-effort → null)', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('SecurityError')
        })
        expect(readSessionStart(PLAN, DAY)).toBeNull()
    })
})

describe('clearSessionStart', () => {
    it('borra el ancla del plan/día', () => {
        const now = 1_700_000_000_000
        persistSessionStart(PLAN, DAY, now)
        clearSessionStart(PLAN, DAY)
        expect(readSessionStart(PLAN, DAY, now + 1000)).toBeNull()
    })

    it('no propaga si removeItem lanza', () => {
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
            throw new Error('boom')
        })
        expect(() => clearSessionStart(PLAN, DAY)).not.toThrow()
    })
})

describe('sweepOtherDaySessionStarts', () => {
    it('borra anclas de otros días y CONSERVA la del día actual', () => {
        persistSessionStart(PLAN, DAY, 1000)
        persistSessionStart(PLAN, OTHER_DAY, 2000)
        persistSessionStart('otro-plan', OTHER_DAY, 3000)
        // Clave ajena (no del cronómetro) → intacta.
        localStorage.setItem('eva:workout-touched:plan-abc', '1')

        sweepOtherDaySessionStarts(DAY)

        expect(readSessionStart(PLAN, DAY, 5000)).toBe(1000)
        expect(readSessionStart(PLAN, OTHER_DAY, 5000)).toBeNull()
        expect(readSessionStart('otro-plan', OTHER_DAY, 5000)).toBeNull()
        expect(localStorage.getItem('eva:workout-touched:plan-abc')).toBe('1')
    })

    it('conserva múltiples planes del MISMO día', () => {
        persistSessionStart('p1', DAY, 1000)
        persistSessionStart('p2', DAY, 2000)
        sweepOtherDaySessionStarts(DAY)
        expect(readSessionStart('p1', DAY, 5000)).toBe(1000)
        expect(readSessionStart('p2', DAY, 5000)).toBe(2000)
    })

    it('no propaga si localStorage lanza', () => {
        vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
            throw new Error('boom')
        })
        persistSessionStart(PLAN, OTHER_DAY, 2000)
        expect(() => sweepOtherDaySessionStarts(DAY)).not.toThrow()
    })
})

describe('elapsedSecondsSince', () => {
    it('calcula segundos transcurridos (floor)', () => {
        expect(elapsedSecondsSince(1000, 1000 + 40_500)).toBe(40)
    })

    it('clampa a 0 si el reloj retrocede (elapsed negativo)', () => {
        expect(elapsedSecondsSince(10_000, 5_000)).toBe(0)
    })

    it('0 en el instante del ancla', () => {
        expect(elapsedSecondsSince(1000, 1000)).toBe(0)
    })
})
