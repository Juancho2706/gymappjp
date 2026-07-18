import { describe, expect, it, vi, beforeEach } from 'vitest'

/**
 * Decisión CEO (2026-07-17, definitiva): los módulos quedan INCLUIDOS en el plan y YA NO se
 * desactivan por separado. La BAJA (`POST /api/payments/addons/cancel`) queda deshabilitada de
 * forma PERMANENTE: responde 403 `MODULES_INCLUDED` tras el check de auth, sin tocar el riel de
 * subs ni las filas `coach_addons` vivas (cortesías/self_service se conservan).
 */

const getUser = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn(async () => ({ auth: { getUser } })),
}))

import { POST } from './route'

function req(body: unknown = { moduleKey: 'cardio' }): Request {
    return new Request('http://localhost/api/payments/addons/cancel', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
    })
}

describe('POST /api/payments/addons/cancel — retirado (MODULES_INCLUDED)', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('coach autenticado ⇒ 403 MODULES_INCLUDED (sin tocar coach_addons)', async () => {
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
