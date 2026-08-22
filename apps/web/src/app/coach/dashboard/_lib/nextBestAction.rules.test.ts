import { describe, expect, it } from 'vitest'
import { personaFirstStep, resolveNextBestAction, WORKOUT_PROGRAMS_HREF } from './nextBestAction.rules'
import type { DashboardV2Data } from '../_data/types'

/** Dashboard mínimo: solo lo que leen las reglas. */
function makeData(over: Partial<DashboardV2Data> = {}): DashboardV2Data {
    return {
        kpi: {
            mrrCurrentMonth: 0,
            mrrPreviousMonth: 0,
            mrrDeltaPct: 0,
            totalClients: 8,
            riskCount: 0,
            avgAdherence: 80,
            avgNutrition: 80,
        },
        activePlans: 3,
        hasStudentSignal30d: true,
        clientList: [],
        clientPaymentSummary: [],
        adherenceStats: [],
        nutritionStats: [],
        recentActivities: [],
        pendingCheckinsCount: 0,
        expiringPrograms: [],
        topRiskClients: [],
        areaData: [],
        barData: [],
        agenda: [],
        pulse: [],
        subscriptionStatus: 'active',
        currentPeriodEnd: null,
        trialEndsAt: null,
        ...over,
    } as DashboardV2Data
}

describe('personaFirstStep — el primer paso habla del mundo del coach', () => {
    it('nutrición manda a la pauta, no al builder de rutinas', () => {
        const step = personaFirstStep('nutrition')
        expect(step.ctaHref).toBe('/coach/nutrition-v2')
        expect(step.title).toContain('pauta')
    })

    it('rehabilitación arranca por el screening', () => {
        expect(personaFirstStep('rehab').title).toContain('screening')
    })

    it('resistencia arranca por las zonas', () => {
        expect(personaFirstStep('endurance').title).toContain('zonas')
    })

    it('fuerza y `other` van al builder de rutinas', () => {
        expect(personaFirstStep('strength').ctaHref).toBe(WORKOUT_PROGRAMS_HREF)
        expect(personaFirstStep('other').ctaHref).toBe(WORKOUT_PROGRAMS_HREF)
    })

    it('persona sin elegir cae en `other`, nunca en un destino de otra rama', () => {
        expect(personaFirstStep(null)).toEqual(personaFirstStep('other'))
    })
})

describe('resolveNextBestAction', () => {
    it('panel vacío: no felicita, propone el primer paso de la persona', () => {
        const data = makeData({
            kpi: { ...makeData().kpi, totalClients: 0 },
            activePlans: 0,
        })
        const action = resolveNextBestAction(data, { persona: 'nutrition' })
        expect(action.id).toBe('primera-pauta')
        expect(action.title).not.toContain('Todo bajo control')
    })

    it('con plan pero sin alumnos, el siguiente paso es invitar', () => {
        const data = makeData({ kpi: { ...makeData().kpi, totalClients: 0 }, activePlans: 1 })
        expect(resolveNextBestAction(data).id).toBe('primer-alumno')
    })

    it('programas vencidos apuntan a /coach/workout-programs (antes era un 404)', () => {
        const data = makeData({
            expiringPrograms: [
                {
                    id: 'p1',
                    name: 'Fuerza base',
                    endDate: '2026-08-01',
                    clientId: 'c1',
                    clientName: 'Ana',
                    daysLeft: -3,
                },
            ],
        })
        const action = resolveNextBestAction(data)
        expect(action.id).toBe('programas-vencidos')
        expect(action.ctaHref).toBe('/coach/workout-programs')
        expect(action.ctaHref).not.toBe('/coach/programs')
    })

    it('un panel sano sigue cayendo en «Todo bajo control»', () => {
        expect(resolveNextBestAction(makeData()).id).toBe('todo-ok')
    })
})
