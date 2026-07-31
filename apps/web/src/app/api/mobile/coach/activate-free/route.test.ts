import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Bridge bearer de "volver a Free" para RN. No es un cobro: es la SALIDA sin pagar. Lo que se
// verifica aca es el borde de autenticacion/autorizacion propio del bridge — la logica de dinero
// (estado bloqueado, cupo, cancelacion en el gateway) vive en el service compartido y ya la cubre
// `api/payments/activate-free/route.test.ts`.

const USER_ID = 'coach-uuid-mobile'

let tokenUser: { id: string } | null = { id: USER_ID }
let tokenError: unknown = null
vi.mock('@/lib/supabase/admin-client', () => ({
    createServiceRoleClient: () => ({
        auth: { getUser: async () => ({ data: { user: tokenUser }, error: tokenError }) },
    }),
}))

let workspaceType = 'coach_standalone'
vi.mock('@/services/auth/workspace.service', () => ({
    resolvePreferredWorkspace: async () => ({ type: workspaceType }),
}))
vi.mock('@/services/auth/workspace-permissions.service', () => ({
    canViewBilling: (w: { type?: string } | null) => w?.type === 'coach_standalone',
}))

const activateFreePlanForCoach = vi.fn(async (..._a: unknown[]) => ({ ok: true }) as unknown)
vi.mock('@/services/billing/activate-free.service', () => ({
    activateFreePlanForCoach: (...a: unknown[]) => activateFreePlanForCoach(...a),
}))

import { POST } from './route'

function req(auth?: string) {
    return new NextRequest('http://localhost/api/mobile/coach/activate-free', {
        method: 'POST',
        headers: auth ? { authorization: auth } : {},
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    tokenUser = { id: USER_ID }
    tokenError = null
    workspaceType = 'coach_standalone'
    activateFreePlanForCoach.mockResolvedValue({ ok: true })
})

describe('POST /api/mobile/coach/activate-free', () => {
    it('401 sin Authorization: Bearer', async () => {
        const res = await POST(req())
        expect(res.status).toBe(401)
        expect((await res.json()).code).toBe('MISSING_TOKEN')
        expect(activateFreePlanForCoach).not.toHaveBeenCalled()
    })

    it('401 con token invalido', async () => {
        tokenUser = null
        tokenError = { message: 'bad jwt' }
        const res = await POST(req('Bearer nope'))
        expect(res.status).toBe(401)
        expect((await res.json()).code).toBe('INVALID_TOKEN')
        expect(activateFreePlanForCoach).not.toHaveBeenCalled()
    })

    it('403 para un coach gestionado por org/team (el plan lo paga la organizacion)', async () => {
        workspaceType = 'enterprise_coach'
        const res = await POST(req('Bearer ok'))
        expect(res.status).toBe(403)
        expect(activateFreePlanForCoach).not.toHaveBeenCalled()
    })

    it('delega en el service compartido con el userId del TOKEN y origen mobile', async () => {
        const res = await POST(req('Bearer ok'))
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true })
        expect(activateFreePlanForCoach).toHaveBeenCalledWith(expect.anything(), USER_ID, 'mobile')
    })

    it('propaga el rechazo por cupo del service tal cual (sin filtrar el detalle)', async () => {
        activateFreePlanForCoach.mockResolvedValue({
            ok: false,
            status: 400,
            error: 'Tienes 6 alumnos activos. Para continuar con el plan gratuito necesitas archivar 3 alumnos.',
            activeCount: 6,
            freeLimit: 3,
        })
        const res = await POST(req('Bearer ok'))
        expect(res.status).toBe(400)
        const body = await res.json()
        expect(body.activeCount).toBe(6)
        expect(body.freeLimit).toBe(3)
        // `ok` no viaja en la respuesta: el contrato es { error, activeCount?, freeLimit?, code }.
        expect('ok' in body).toBe(false)
    })
})
