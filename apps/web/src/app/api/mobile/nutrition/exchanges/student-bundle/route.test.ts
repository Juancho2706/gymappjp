import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import type { ExchangeGroup } from '@/domain/nutrition/exchange.types'
import type { StudentExchangeBundle } from '@/services/nutrition-exchanges/nutrition-exchanges.service'

// ── Mocks ────────────────────────────────────────────────────────────────────────
const verifyMobileBearer = vi.fn()
vi.mock('@/lib/mobile-auth', () => ({
    verifyMobileBearer: (...a: unknown[]) => verifyMobileBearer(...a),
}))

// Fake admin: enruta por tabla. `nutrition_plans` sirve tanto a resolveClientNutritionContext
// (id, coach_id) como a la lectura de plan_mode del route (fila mergeada).
let planRow: { id: string; coach_id: string | null; plan_mode: string | null } | null = {
    id: 'plan-1',
    coach_id: 'coach-1',
    plan_mode: 'exchanges',
}
let clientRow: { team_id: string | null; org_id: string | null } | null = { team_id: null, org_id: null }
const fakeAdmin = {
    from: vi.fn((table: string) => {
        const maybeSingle = vi.fn(async () => ({
            data: table === 'nutrition_plans' ? planRow : clientRow,
            error: null,
        }))
        const chain = {
            select: vi.fn(() => chain),
            eq: vi.fn(() => chain),
            maybeSingle,
        }
        return chain
    }),
}
vi.mock('@/lib/supabase/admin-client', () => ({
    createServiceRoleClient: vi.fn(() => fakeAdmin),
}))

// El servicio de bundle es la unidad gateada (fail-closed); se mockea igual que micros mockea
// getPlanDayMicros. El motor puro exchange-calc corre REAL para verificar el view-model.
const getStudentExchangeBundle = vi.fn()
vi.mock('@/services/nutrition-exchanges/nutrition-exchanges.service', () => ({
    getStudentExchangeBundle: (...a: unknown[]) => getStudentExchangeBundle(...a),
}))

import { GET } from './route'

function req(withAuth = true) {
    return new NextRequest('http://localhost/api/mobile/nutrition/exchanges/student-bundle', {
        headers: withAuth ? { authorization: 'Bearer tok' } : {},
    })
}

const G_C: ExchangeGroup = {
    id: 'g-c', slug: 'c', code: 'C', name: 'Carbohidratos', coachId: null, teamId: null, isSystem: true,
    refCalories: 70, refProteinG: 2, refCarbsG: 15, refFatsG: 0, color: null, sortOrder: 0, composedOf: null, macrosConfirmed: true,
}
const G_P: ExchangeGroup = {
    id: 'g-p', slug: 'p', code: 'P', name: 'Proteinas', coachId: 'coach-1', teamId: null, isSystem: false,
    refCalories: 75, refProteinG: 7, refCarbsG: 0, refFatsG: 5, color: '#EF4444', sortOrder: 1, composedOf: null, macrosConfirmed: false,
}

const ACTIVE_BUNDLE: StudentExchangeBundle = {
    enabled: true,
    planMode: 'exchanges',
    groups: [G_C, G_P],
    targetsByMealId: {
        m1: [
            { mealId: 'm1', exchangeGroupId: 'g-p', portions: 1 },
            { mealId: 'm1', exchangeGroupId: 'g-c', portions: 2 },
        ],
    },
    variants: [{ id: 'v1', planId: 'plan-1', name: 'Entreno AM', sortOrder: 0 }],
    variantByMealId: { m1: 'v1' },
    equivalences: [
        { foodId: 'f1', name: 'Arroz', exchangeGroupId: 'g-c', portionGrams: 30, portionLabel: '3/4 taza' },
    ],
}

const EMPTY_BUNDLE: StudentExchangeBundle = {
    enabled: false,
    planMode: 'grams',
    groups: [],
    targetsByMealId: {},
    variants: [],
    variantByMealId: {},
    equivalences: [],
}

beforeEach(() => {
    vi.clearAllMocks()
    planRow = { id: 'plan-1', coach_id: 'coach-1', plan_mode: 'exchanges' }
    clientRow = { team_id: null, org_id: null }
    verifyMobileBearer.mockResolvedValue({ ok: true, userId: 'client-1', via: 'jose' })
    getStudentExchangeBundle.mockResolvedValue(ACTIVE_BUNDLE)
})

describe('GET /api/mobile/nutrition/exchanges/student-bundle', () => {
    it('401 sin token', async () => {
        const res = await GET(req(false))
        expect(res.status).toBe(401)
        expect(getStudentExchangeBundle).not.toHaveBeenCalled()
    })

    it('401 token invalido', async () => {
        verifyMobileBearer.mockResolvedValue({ ok: false, status: 401 })
        const res = await GET(req())
        expect(res.status).toBe(401)
    })

    it('hasPlan:false cuando el alumno no tiene plan activo', async () => {
        planRow = null
        const res = await GET(req())
        const body = await res.json()
        expect(body.hasPlan).toBe(false)
        expect(body.enabled).toBe(false)
        expect(getStudentExchangeBundle).not.toHaveBeenCalled()
    })

    it('MONEY-SAFETY: enabled:false y CERO dato de intercambios cuando el modulo esta OFF (fail-closed)', async () => {
        getStudentExchangeBundle.mockResolvedValue(EMPTY_BUNDLE)
        const res = await GET(req())
        const body = await res.json()
        expect(body.hasPlan).toBe(true)
        expect(body.enabled).toBe(false)
        expect(body.meals).toEqual([])
        expect(body.groups).toEqual([])
        expect(body.equivalences).toEqual([])
        // Ni un codigo de grupo ni una equivalencia se serializan sin derecho.
        expect(JSON.stringify(body)).not.toContain('Carbohidratos')
        expect(JSON.stringify(body)).not.toContain('Arroz')
    })

    it('devuelve chips ordenados, macros derivados, variante y equivalencias cuando esta habilitado', async () => {
        const res = await GET(req())
        const body = await res.json()
        expect(body.enabled).toBe(true)
        expect(body.planMode).toBe('exchanges')
        expect(body.meals).toHaveLength(1)

        const meal = body.meals[0]
        expect(meal.mealId).toBe('m1')
        expect(meal.variantName).toBe('Entreno AM')
        // Orden por sortOrder: C (0) antes de P (1), pese a venir invertido en los targets.
        expect(meal.chips.map((c: { code: string }) => c.code)).toEqual(['C', 'P'])
        expect(meal.chips[0]).toMatchObject({ code: 'C', portions: 2, portionsLabel: '2' })
        // C usa color fallback (sortOrder 0 → amber); P respeta su hex.
        expect(meal.chips[1].color).toBe('#EF4444')
        // 2C + 1P = 2*(70,2,15,0) + 1*(75,7,0,5) = (215,11,30,5).
        expect(meal.derived).toEqual({ calories: 215, proteinG: 11, carbsG: 30, fatsG: 5 })
        // G_P tiene macrosConfirmed:false ⇒ badge "referencial".
        expect(meal.hasUnconfirmed).toBe(true)

        expect(body.groups).toHaveLength(2)
        expect(body.equivalences).toEqual([
            { foodId: 'f1', name: 'Arroz', exchangeGroupId: 'g-c', portionGrams: 30, portionLabel: '3/4 taza' },
        ])
    })

    it('pasa el planMode autoritativo (server-side) al servicio de bundle', async () => {
        await GET(req())
        expect(getStudentExchangeBundle).toHaveBeenCalledWith(
            fakeAdmin,
            fakeAdmin,
            expect.objectContaining({ planId: 'plan-1', planCoachId: 'coach-1', planMode: 'exchanges', clientId: 'client-1' }),
        )
    })
})
