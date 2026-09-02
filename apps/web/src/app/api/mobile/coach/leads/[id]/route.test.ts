import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const resolveCtx = vi.fn()
const updateCoachLeadStatus = vi.fn()
const capture = vi.fn()

vi.mock('../_auth', () => ({
    resolveMobileLeadsContext: (...args: unknown[]) => resolveCtx(...args),
}))

vi.mock('@/services/coach/leads.service', () => ({
    updateCoachLeadStatus: (...args: unknown[]) => updateCoachLeadStatus(...args),
}))

/**
 * Los eventos del cierre (`coach_lead_converted` / `coach_client_referred`) los emite el SERVICIO,
 * no este route: acá se mockea solo para probar que el handler no volvió a emitirlos por su cuenta
 * (dos emisiones por conversión inflarían el embudo).
 */
vi.mock('@/lib/posthog/server-capture', () => ({
    capturePostHogServerEvent: (...args: unknown[]) => capture(...args),
}))

import { PATCH } from './route'

const LEAD = {
    id: 'lead-1',
    fullName: 'Ana Pérez',
    phone: '912345678',
    email: null,
    message: null,
    status: 'contacted' as const,
    createdAt: '2026-08-21T02:00:00.000Z',
    referrerName: null,
    referralCardKind: null,
    referralSource: null,
}

function req(body?: unknown) {
    return new NextRequest('https://www.eva-app.cl/api/mobile/coach/leads/lead-1', {
        method: 'PATCH',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    })
}

const params = { params: Promise.resolve({ id: 'lead-1' }) }

describe('PATCH /api/mobile/coach/leads/[id]', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        resolveCtx.mockResolvedValue({ userId: 'coach-1', userDb: { user: true }, admin: { admin: true } })
        updateCoachLeadStatus.mockResolvedValue({ ok: true, lead: LEAD })
        capture.mockResolvedValue(undefined)
    })

    it('mueve la solicitud y devuelve el item releído', async () => {
        const res = await PATCH(req({ status: 'contacted' }), params)

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({ ok: true, lead: LEAD })
        expect(updateCoachLeadStatus).toHaveBeenCalledWith(
            { userDb: { user: true }, admin: { admin: true } },
            'coach-1',
            'lead-1',
            'contacted',
            { clientId: null, surface: 'mobile' },
        )
        // El route NO emite eventos: los emite el servicio, que es el que sabe si hubo atribución.
        expect(capture).not.toHaveBeenCalled()
    })

    it('mutación ⇒ verificación AUTORITATIVA del bearer (getUser), nunca la local', async () => {
        await PATCH(req({ status: 'dismissed' }), params)

        expect(resolveCtx).toHaveBeenCalledWith(expect.anything(), 'mutation')
    })

    it('`converted` con `clientId` baja el alumno al servicio (ahí se copia la atribución)', async () => {
        updateCoachLeadStatus.mockResolvedValue({
            ok: true,
            lead: { ...LEAD, status: 'converted', referralSource: 'share_card' },
        })

        const res = await PATCH(
            req({ status: 'converted', clientId: '2f1c4e3a-9d5b-4a7c-8e21-6b0d3f5a1c94' }),
            params,
        )

        expect(res.status).toBe(200)
        expect(updateCoachLeadStatus).toHaveBeenCalledWith(
            { userDb: { user: true }, admin: { admin: true } },
            'coach-1',
            'lead-1',
            'converted',
            { clientId: '2f1c4e3a-9d5b-4a7c-8e21-6b0d3f5a1c94', surface: 'mobile' },
        )
        // Una sola emisión por conversión: la del servicio. El route ya no duplica el evento.
        expect(capture).not.toHaveBeenCalled()
    })

    it('compatibilidad OTA: `converted` sin `clientId` sigue moviendo el estado', async () => {
        updateCoachLeadStatus.mockResolvedValue({ ok: true, lead: { ...LEAD, status: 'converted' } })

        const res = await PATCH(req({ status: 'converted' }), params)

        expect(res.status).toBe(200)
        expect(updateCoachLeadStatus).toHaveBeenCalledWith(
            expect.anything(),
            'coach-1',
            'lead-1',
            'converted',
            { clientId: null, surface: 'mobile' },
        )
    })

    it('`clientId` que no es un uuid, o pegado a un estado que no convierte, es 400 sin tocar la DB', async () => {
        for (const body of [
            { status: 'converted', clientId: 'no-es-uuid' },
            { status: 'dismissed', clientId: '2f1c4e3a-9d5b-4a7c-8e21-6b0d3f5a1c94' },
        ]) {
            const res = await PATCH(req(body), params)
            expect(res.status).toBe(400)
        }
        expect(updateCoachLeadStatus).not.toHaveBeenCalled()
    })

    it('el alumno no es del coach → 404 y la solicitud NO se cierra', async () => {
        updateCoachLeadStatus.mockResolvedValue({
            ok: false,
            code: 'CLIENT_NOT_FOUND',
            error: 'Alumno no encontrado.',
        })

        const res = await PATCH(
            req({ status: 'converted', clientId: '2f1c4e3a-9d5b-4a7c-8e21-6b0d3f5a1c94' }),
            params,
        )

        expect(res.status).toBe(404)
        await expect(res.json()).resolves.toEqual({
            error: 'Alumno no encontrado.',
            code: 'CLIENT_NOT_FOUND',
        })
    })

    it('un estado fuera del contrato (o `new`) es 400 y no toca la DB', async () => {
        for (const body of [{ status: 'new' }, { status: 'borrado' }, { status: 'dismissed', coach_id: 'otro' }, null]) {
            const res = await PATCH(req(body ?? undefined), params)
            expect(res.status).toBe(400)
            await expect(res.json()).resolves.toMatchObject({ code: 'VALIDATION_ERROR' })
        }
        expect(updateCoachLeadStatus).not.toHaveBeenCalled()
    })

    it('lead ajeno → 404 con el mismo texto que uno inexistente', async () => {
        updateCoachLeadStatus.mockResolvedValue({
            ok: false,
            code: 'NOT_FOUND',
            error: 'Solicitud no encontrada.',
        })

        const res = await PATCH(req({ status: 'dismissed' }), params)

        expect(res.status).toBe(404)
        await expect(res.json()).resolves.toEqual({
            error: 'Solicitud no encontrada.',
            code: 'NOT_FOUND',
        })
    })

    it('bearer inválido corta antes de validar el body', async () => {
        const { NextResponse } = await import('next/server')
        resolveCtx.mockResolvedValue({
            error: NextResponse.json({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, { status: 401 }),
        })

        const res = await PATCH(req({ status: 'dismissed' }), params)

        expect(res.status).toBe(401)
        expect(updateCoachLeadStatus).not.toHaveBeenCalled()
    })
})
