import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const verifyMobileBearer = vi.fn()
vi.mock('@/lib/mobile-auth', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/lib/mobile-auth')>()),
    verifyMobileBearer: (...a: unknown[]) => verifyMobileBearer(...a),
}))

// El gate de bloqueo lee `clients.is_archived/is_active` con este admin; por default = no bloqueado.
let clientRow: { is_archived: boolean | null; is_active: boolean | null } | null = {
    is_archived: false,
    is_active: true,
}
const fakeAdmin = {
    __tag: 'admin',
    from: vi.fn(() => {
        const chain = {
            select: vi.fn(() => chain),
            eq: vi.fn(() => chain),
            maybeSingle: vi.fn(async () => ({ data: clientRow, error: null })),
        }
        return chain
    }),
}
vi.mock('@/lib/supabase/admin-client', () => ({
    createServiceRoleClient: vi.fn(() => fakeAdmin),
}))

const getNutritionWeeklyRecap = vi.fn()
vi.mock('@/app/c/[coach_slug]/nutrition/_data/recap.queries', () => ({
    getNutritionWeeklyRecap: (...a: unknown[]) => getNutritionWeeklyRecap(...a),
}))

import { GET } from './route'

function req(withAuth = true) {
    return new NextRequest('http://localhost/api/mobile/nutrition/recap', {
        headers: withAuth ? { authorization: 'Bearer tok' } : {},
    })
}

const RECAP = { thisWeekPct: 82, lastWeekPct: 70, deltaPct: 12, daysLoggedThisWeek: 6, tone: 'good' }

beforeEach(() => {
    vi.clearAllMocks()
    clientRow = { is_archived: false, is_active: true }
    verifyMobileBearer.mockResolvedValue({ ok: true, userId: 'client-1', via: 'jose' })
    getNutritionWeeklyRecap.mockResolvedValue(RECAP)
})

describe('GET /api/mobile/nutrition/recap', () => {
    it('401 sin token', async () => {
        const res = await GET(req(false))
        expect(res.status).toBe(401)
    })

    it('401 token invalido', async () => {
        verifyMobileBearer.mockResolvedValue({ ok: false, status: 401 })
        const res = await GET(req())
        expect(res.status).toBe(401)
    })

    it('403 CLIENT_BLOCKED cuando el alumno esta pausado (is_active:false)', async () => {
        clientRow = { is_archived: false, is_active: false }
        const res = await GET(req())
        expect(res.status).toBe(403)
        expect((await res.json()).code).toBe('CLIENT_BLOCKED')
        expect(getNutritionWeeklyRecap).not.toHaveBeenCalled()
    })

    it('devuelve el recap del motor, scoped al clientId verificado', async () => {
        const res = await GET(req())
        const body = await res.json()
        expect(body.recap).toEqual(RECAP)
        expect(getNutritionWeeklyRecap).toHaveBeenCalledWith('client-1', fakeAdmin)
    })

    it('recap:null cuando el alumno no tiene plan activo', async () => {
        getNutritionWeeklyRecap.mockResolvedValue(null)
        const res = await GET(req())
        const body = await res.json()
        expect(body.recap).toBeNull()
    })
})
