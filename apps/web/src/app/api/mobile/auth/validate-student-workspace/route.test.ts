import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
    getUser: vi.fn(),
    validateWorkspace: vi.fn(),
    recordFirstLogin: vi.fn(),
}))

const admin = {
    auth: {
        getUser: (...args: unknown[]) => mocks.getUser(...args),
    },
}

vi.mock('@/lib/supabase/admin-client', () => ({
    createServiceRoleClient: () => admin,
}))

vi.mock('@/services/auth/mobile-student-workspace.service', () => ({
    validateMobileStudentWorkspace: (...args: unknown[]) => mocks.validateWorkspace(...args),
}))

vi.mock('@/services/client/student-login-signal.service', () => ({
    recordStudentFirstLogin: (...args: unknown[]) => mocks.recordFirstLogin(...args),
}))

import { POST } from './route'

const USER_ID = '11111111-1111-4111-8111-111111111111'
const COACH_ID = '22222222-2222-4222-8222-222222222222'
const CLIENT_ID = '99999999-9999-4999-8999-999999999999'

function request(body: unknown, token = 'valid-token') {
    return new NextRequest('http://localhost/api/mobile/auth/validate-student-workspace', {
        method: 'POST',
        headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
        },
        body: typeof body === 'string' ? body : JSON.stringify(body),
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    mocks.getUser.mockResolvedValue({
        data: { user: { id: USER_ID } },
        error: null,
    })
    mocks.validateWorkspace.mockResolvedValue({
        ok: true,
        forcePasswordChange: false,
        clientId: CLIENT_ID,
    })
    mocks.recordFirstLogin.mockResolvedValue(true)
})

describe('POST /api/mobile/auth/validate-student-workspace', () => {
    it('exige bearer', async () => {
        const response = await POST(new NextRequest(
            'http://localhost/api/mobile/auth/validate-student-workspace',
            { method: 'POST' },
        ))

        expect(response.status).toBe(401)
        expect(await response.json()).toEqual({
            ok: false,
            code: 'MISSING_TOKEN',
            error: 'Unauthorized',
        })
        expect(mocks.getUser).not.toHaveBeenCalled()
    })

    it('rechaza bearer inválido con getUser autoritativo', async () => {
        mocks.getUser.mockResolvedValue({
            data: { user: null },
            error: { message: 'invalid token' },
        })

        const response = await POST(request({ coachId: COACH_ID }, 'invalid-token'))

        expect(response.status).toBe(401)
        expect(mocks.getUser).toHaveBeenCalledWith('invalid-token')
        expect(mocks.validateWorkspace).not.toHaveBeenCalled()
    })

    it.each([
        ['JSON inválido', '{'],
        ['coachId inválido', { coachId: 'coach-jp' }],
        ['identidad inyectada en body', { coachId: COACH_ID, userId: COACH_ID }],
    ])('rechaza %s', async (_label, body) => {
        const response = await POST(request(body))

        expect(response.status).toBe(400)
        expect(await response.json()).toEqual({
            ok: false,
            code: 'VALIDATION_ERROR',
            error: 'Datos de acceso inválidos.',
        })
        expect(mocks.validateWorkspace).not.toHaveBeenCalled()
    })

    it('deriva identidad del bearer y devuelve el contrato mínimo', async () => {
        mocks.validateWorkspace.mockResolvedValue({
            ok: true,
            forcePasswordChange: true,
            clientId: CLIENT_ID,
        })

        const response = await POST(request({ coachId: COACH_ID }))

        expect(response.status).toBe(200)
        expect(await response.json()).toEqual({
            ok: true,
            forcePasswordChange: true,
        })
        expect(mocks.validateWorkspace).toHaveBeenCalledWith(admin, USER_ID, COACH_ID)
    })

    it('login valido registra el primer login una vez', async () => {
        const response = await POST(request({ coachId: COACH_ID }))

        expect(response.status).toBe(200)
        // El clientId sale de la fila YA validada por el servicio, nunca del body.
        expect(mocks.recordFirstLogin).toHaveBeenCalledTimes(1)
        expect(mocks.recordFirstLogin).toHaveBeenCalledWith(admin, CLIENT_ID)
        // La respuesta no cambia de forma: la señal no se filtra al cliente.
        expect(await response.json()).toEqual({ ok: true, forcePasswordChange: false })
    })

    it('no registra primer login cuando el acceso se rechaza', async () => {
        mocks.validateWorkspace.mockResolvedValue({ ok: false, reason: 'access_denied' })

        const response = await POST(request({ coachId: COACH_ID }))

        expect(response.status).toBe(403)
        expect(mocks.recordFirstLogin).not.toHaveBeenCalled()
    })

    it.each([
        ['access_denied', 403, 'ACCESS_DENIED'],
        ['account_paused', 403, 'ACCOUNT_PAUSED'],
        ['dependency_error', 503, 'VALIDATION_UNAVAILABLE'],
    ])('mapea %s a un error seguro', async (reason, status, code) => {
        mocks.validateWorkspace.mockResolvedValue({ ok: false, reason })

        const response = await POST(request({ coachId: COACH_ID }))
        const body = await response.json()

        expect(response.status).toBe(status)
        expect(body).toMatchObject({ ok: false, code })
        expect(body).not.toHaveProperty('details')
    })

    it('no filtra excepciones internas', async () => {
        mocks.validateWorkspace.mockRejectedValue(new Error('secret db detail'))

        const response = await POST(request({ coachId: COACH_ID }))

        expect(response.status).toBe(503)
        expect(JSON.stringify(await response.json())).not.toContain('secret db detail')
    })
})
