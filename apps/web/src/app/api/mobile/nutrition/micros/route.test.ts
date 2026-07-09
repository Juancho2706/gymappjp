import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ── Mocks ────────────────────────────────────────────────────────────────────────
const verifyMobileBearer = vi.fn()
vi.mock('@/lib/mobile-auth', () => ({
    verifyMobileBearer: (...a: unknown[]) => verifyMobileBearer(...a),
}))

// Fake admin: enruta por tabla para `resolveClientNutritionContext`.
let planRow: { id: string; coach_id: string | null } | null = { id: 'plan-1', coach_id: 'coach-1' }
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

const resolveNutritionDomainEnabled = vi.fn()
const resolveFeaturePrefs = vi.fn()
vi.mock('@/services/feature-prefs.service', () => ({
    resolveNutritionDomainEnabled: (...a: unknown[]) => resolveNutritionDomainEnabled(...a),
    resolveFeaturePrefs: (...a: unknown[]) => resolveFeaturePrefs(...a),
}))

const getPlanDayMicros = vi.fn()
const getMicroTargetsForClient = vi.fn()
vi.mock('@/app/c/[coach_slug]/nutrition/_data/sections.queries', () => ({
    getPlanDayMicros: (...a: unknown[]) => getPlanDayMicros(...a),
    getMicroTargetsForClient: (...a: unknown[]) => getMicroTargetsForClient(...a),
}))

vi.mock('@/lib/date-utils', () => ({
    getTodayInSantiago: () => ({ iso: '2026-07-08' }),
}))

import { GET } from './route'

function req(url = 'http://localhost/api/mobile/nutrition/micros', withAuth = true) {
    return new NextRequest(url, {
        headers: withAuth ? { authorization: 'Bearer tok' } : {},
    })
}

const MICROS = { sodiumMg: 1200, fiberG: 22, sugarG: 30, saturatedFatG: 5, unsaturatedFatG: 12 }
const TARGETS = { sodium: { ceiling: 2000 }, fiber: { floor: 25 }, sugar: { ceiling: 40 } }

beforeEach(() => {
    vi.clearAllMocks()
    planRow = { id: 'plan-1', coach_id: 'coach-1' }
    clientRow = { team_id: null, org_id: null }
    verifyMobileBearer.mockResolvedValue({ ok: true, userId: 'client-1', via: 'jose' })
    resolveNutritionDomainEnabled.mockResolvedValue(true)
    getPlanDayMicros.mockResolvedValue(MICROS)
    getMicroTargetsForClient.mockResolvedValue(TARGETS)
})

describe('GET /api/mobile/nutrition/micros', () => {
    it('401 sin token', async () => {
        const res = await GET(req(undefined, false))
        expect(res.status).toBe(401)
    })

    it('401 token invalido', async () => {
        verifyMobileBearer.mockResolvedValue({ ok: false, status: 401 })
        const res = await GET(req())
        expect(res.status).toBe(401)
    })

    it('400 date con formato invalido', async () => {
        const res = await GET(req('http://localhost/api/mobile/nutrition/micros?date=07-2026'))
        expect(res.status).toBe(400)
    })

    it('hasPlan:false cuando el alumno no tiene plan activo', async () => {
        planRow = null
        const res = await GET(req())
        const body = await res.json()
        expect(body.hasPlan).toBe(false)
        expect(getPlanDayMicros).not.toHaveBeenCalled()
    })

    it('domainEnabled:false cuando el coach apago el dominio', async () => {
        resolveNutritionDomainEnabled.mockResolvedValue(false)
        const res = await GET(req())
        const body = await res.json()
        expect(body.domainEnabled).toBe(false)
        expect(resolveFeaturePrefs).not.toHaveBeenCalled()
    })

    it('MONEY-SAFETY: advanced=null cuando micros_advanced OFF (sin fuga de dato pago)', async () => {
        resolveFeaturePrefs.mockResolvedValue({ micros_base: true, micros_advanced: false })
        const res = await GET(req())
        const body = await res.json()
        expect(body.sections).toEqual({ microsBase: true, microsAdvanced: false })
        expect(body.base.sodiumMg).toBe(1200)
        expect(body.base.fiberG).toBe(22)
        expect(body.advanced).toBeNull()
        // El JSON serializado no contiene ningun numero avanzado.
        expect(JSON.stringify(body)).not.toContain('saturatedFat')
    })

    it('advanced poblado cuando micros_advanced ON (Pro entitled)', async () => {
        resolveFeaturePrefs.mockResolvedValue({ micros_base: true, micros_advanced: true })
        const res = await GET(req())
        const body = await res.json()
        expect(body.sections.microsAdvanced).toBe(true)
        expect(body.advanced.sugarG).toBe(30)
        expect(body.advanced.saturatedFatG).toBe(5)
        expect(body.advanced.sugarTarget).toEqual({ ceiling: 40 })
    })

    it('usa el date default (hoy Santiago) sin query param', async () => {
        resolveFeaturePrefs.mockResolvedValue({ micros_base: true, micros_advanced: false })
        await GET(req())
        expect(getPlanDayMicros).toHaveBeenCalledWith('client-1', 'plan-1', '2026-07-08', fakeAdmin)
    })
})
