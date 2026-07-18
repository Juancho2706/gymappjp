import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Decisión CEO (2026-07-17, definitiva): los 4 módulos quedan INCLUIDOS en todo plan pago y YA NO
 * se compran/activan por separado. El endpoint de ALTA (`POST /api/payments/addons`) queda
 * deshabilitado de forma PERMANENTE: responde 403 `MODULES_INCLUDED` justo tras el check de auth,
 * ANTES de tocar rate-limit/workspace/billing. El riel de subs y las filas `coach_addons` no se
 * tocan (la entrega de los módulos la hace la derivación en lectura de entitlements.service).
 */

const getUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn(async () => ({ auth: { getUser } })),
}))

import { POST } from './route'

function req(body: unknown = { moduleKey: 'cardio', acceptedTermsVersion: 'v1' }): Request {
    return new Request('http://localhost/api/payments/addons', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
    })
}

describe('POST /api/payments/addons — retirado (MODULES_INCLUDED)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('coach autenticado ⇒ 403 MODULES_INCLUDED (sin iniciar cobro)', async () => {
        getUser.mockResolvedValue({ data: { user: { id: 'coach-1', email: 'c@e.cl' } } })
        const res = await POST(req())
        expect(res.status).toBe(403)
        const json = await res.json()
        expect(json.code).toBe('MODULES_INCLUDED')
    })

    it('sin sesión ⇒ 401 Unauthorized (el gate de auth va primero)', async () => {
        getUser.mockResolvedValue({ data: { user: null } })
        const res = await POST(req())
        expect(res.status).toBe(401)
    })
})
