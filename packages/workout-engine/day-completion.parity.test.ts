/**
 * Contrato de paridad de la completitud del día (spec `workout-day-in-progress`, F1).
 *
 * Estos asserts congelan el comportamiento EXACTO de `deriveDayCompletion` sobre los fixtures
 * compartidos. Web (F2, `weekPendingWorkouts`) y RN (F3, `weekly-streak`) corren los MISMOS fixtures
 * contra sus adaptadores: si un lado pierde `sets` o `set_number` por el camino, el caso falla ahí y
 * no en producción. No cambiar un `expected` sin cambiar la regla del SPEC (y las tres suites).
 */
import { describe, expect, it } from 'vitest'

import { deriveDayCompletion } from './day-completion'
import { DAY_COMPLETION_FIXTURES } from './day-completion.fixtures'

describe('deriveDayCompletion — fixtures de paridad web/RN', () => {
    it('los fixtures cubren los tres estados', () => {
        const states = new Set(DAY_COMPLETION_FIXTURES.map((f) => f.expected.state))
        expect([...states].sort()).toEqual(['done', 'in_progress', 'none'])
    })

    it.each(DAY_COMPLETION_FIXTURES.map((f) => [f.name, f] as const))('%s', (_name, fixture) => {
        expect(deriveDayCompletion(fixture.input)).toEqual(fixture.expected)
    })

    it('todo fixture mantiene la invariante pct = logged / expected (y pct ≤ 1)', () => {
        for (const { name, expected } of DAY_COMPLETION_FIXTURES) {
            const pct = expected.expected > 0 ? expected.logged / expected.expected : 0
            expect(expected.pct, name).toBeCloseTo(pct, 12)
            expect(expected.pct, name).toBeLessThanOrEqual(1)
        }
    })
})
