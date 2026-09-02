import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const resolveCtx = vi.fn()
const listCoachLeads = vi.fn()

vi.mock('./_auth', () => ({
    resolveMobileLeadsContext: (...args: unknown[]) => resolveCtx(...args),
}))

vi.mock('@/services/coach/leads.service', () => ({
    listCoachLeads: (...args: unknown[]) => listCoachLeads(...args),
}))

import { GET } from './route'

const LEAD = {
    id: 'lead-1',
    fullName: 'Ana Pérez',
    phone: '912345678',
    email: null,
    message: null,
    status: 'new' as const,
    createdAt: '2026-08-21T02:00:00.000Z',
    referrerName: null,
    referralCardKind: null,
    referralSource: null,
}

function req(query = '') {
    return new NextRequest(`https://www.eva-app.cl/api/mobile/coach/leads${query}`, {
        headers: { authorization: 'Bearer token' },
    })
}

describe('GET /api/mobile/coach/leads', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        resolveCtx.mockResolvedValue({ userId: 'coach-1', userDb: { user: true }, admin: {} })
        listCoachLeads.mockResolvedValue({ ok: true, leads: [LEAD] })
    })

    it('devuelve la bandeja abierta del coach autenticado leída con el cliente del USUARIO (RLS)', async () => {
        const res = await GET(req())

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({ leads: [LEAD] })
        // Sin `?status=` no se fuerza filtro: el servicio aplica `new`+`contacted`.
        expect(listCoachLeads).toHaveBeenCalledWith({ user: true }, 'coach-1', { statuses: undefined })
        expect(resolveCtx).toHaveBeenCalledWith(expect.anything(), 'read')
    })

    it('`?status=dismissed` filtra por ese estado', async () => {
        await GET(req('?status=dismissed'))

        expect(listCoachLeads).toHaveBeenCalledWith(expect.anything(), 'coach-1', {
            statuses: ['dismissed'],
        })
    })

    it('un `?status=` fuera del CHECK responde 400 y no consulta nada', async () => {
        const res = await GET(req('?status=borrado'))

        expect(res.status).toBe(400)
        await expect(res.json()).resolves.toMatchObject({ code: 'INVALID_STATUS' })
        expect(listCoachLeads).not.toHaveBeenCalled()
    })

    it('sin bearer válido corta antes de leer', async () => {
        const { NextResponse } = await import('next/server')
        resolveCtx.mockResolvedValue({
            error: NextResponse.json({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, { status: 401 }),
        })

        const res = await GET(req())

        expect(res.status).toBe(401)
        expect(listCoachLeads).not.toHaveBeenCalled()
    })

    it('un fallo de lectura es 500 con copy humano, nunca el error crudo de PostgREST', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        listCoachLeads.mockResolvedValue({ ok: false, error: 'permission denied for table coach_leads' })

        const res = await GET(req())

        expect(res.status).toBe(500)
        await expect(res.json()).resolves.toEqual({
            error: 'No pudimos cargar las solicitudes.',
            code: 'LEADS_LOAD_FAILED',
        })
        consoleError.mockRestore()
    })
})
