import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import type { ExchangeGroup } from '@/domain/nutrition/exchange.types'

/**
 * `/api/mobile/nutrition/exchanges/groups` — UNICO camino de escritura de RN sobre
 * `exchange_groups` (leccion NUT-005). Se verifica que el gate corra ANTES de validar y de
 * escribir, que el contrato compartido rechace lo mismo que en web (codigo invalido,
 * is_system, composed_of) y que el servicio reciba el cliente TOKEN-SCOPED (nunca el admin
 * service-role, que solo resuelve el coach del Bearer).
 */

const mocks = vi.hoisted(() => ({
    gateExchanges: vi.fn(),
    createCoachExchangeGroup: vi.fn(),
    updateCoachExchangeGroup: vi.fn(),
    deleteCoachExchangeGroup: vi.fn(),
}))

vi.mock('../_shared', () => ({ gateExchanges: mocks.gateExchanges }))

vi.mock('@/services/nutrition-exchanges/nutrition-exchanges.service', () => ({
    createCoachExchangeGroup: mocks.createCoachExchangeGroup,
    updateCoachExchangeGroup: mocks.updateCoachExchangeGroup,
    deleteCoachExchangeGroup: mocks.deleteCoachExchangeGroup,
}))

import { DELETE, PATCH, POST } from './route'

const GROUP_ID = '44444444-4444-4444-8444-444444444444'

const GROUP: ExchangeGroup = {
    id: GROUP_ID,
    slug: 'batido',
    code: 'SHK',
    name: 'Batido',
    coachId: 'coach-1',
    teamId: null,
    isSystem: false,
    refCalories: 180,
    refProteinG: 25,
    refCarbsG: 10,
    refFatsG: 3,
    color: '#3B82F6',
    sortOrder: 100,
    composedOf: null,
    macrosConfirmed: false,
}

const BODY = {
    name: 'Batido',
    code: 'SHK',
    refCalories: 180,
    refProteinG: 25,
    refCarbsG: 10,
    refFatsG: 3,
    color: '#3B82F6',
}

const userClient = { tag: 'token-scoped' } as never
const admin = { tag: 'service-role' } as never

function req(body: unknown) {
    return new NextRequest('http://localhost/api/mobile/nutrition/exchanges/groups', {
        method: 'POST',
        headers: { authorization: 'Bearer tok', 'content-type': 'application/json' },
        body: JSON.stringify(body),
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    mocks.gateExchanges.mockResolvedValue({ ok: true, coachId: 'coach-1', admin, userClient })
    mocks.createCoachExchangeGroup.mockResolvedValue({ success: true, group: GROUP })
    mocks.updateCoachExchangeGroup.mockResolvedValue({ success: true, group: GROUP })
    mocks.deleteCoachExchangeGroup.mockResolvedValue({ success: true })
})

describe('POST (crear)', () => {
    it('crea con el cliente token-scoped y scope standalone', async () => {
        const res = await POST(req(BODY))
        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({ ok: true, group: GROUP })
        const [db, input] = mocks.createCoachExchangeGroup.mock.calls[0]
        expect(db).toBe(userClient)
        expect(db).not.toBe(admin)
        expect(input.actorCoachId).toBe('coach-1')
        expect(input.scope).toEqual({ orgId: null, activeTeamId: null })
    })

    it('el gate corre ANTES de validar/escribir (MODULE_OFF se propaga tal cual)', async () => {
        mocks.gateExchanges.mockResolvedValue({
            ok: false,
            response: NextResponse.json({ error: 'off', code: 'MODULE_OFF' }, { status: 403 }),
        })
        const res = await POST(req(BODY))
        expect(res.status).toBe(403)
        expect(mocks.createCoachExchangeGroup).not.toHaveBeenCalled()
    })

    it('rechaza payload invalido con 400 y sin escribir', async () => {
        const res = await POST(req({ ...BODY, code: 'ABCD' }))
        expect(res.status).toBe(400)
        expect(mocks.createCoachExchangeGroup).not.toHaveBeenCalled()
    })

    it('rechaza is_system y composed_of (paridad con web)', async () => {
        expect((await POST(req({ ...BODY, is_system: true }))).status).toBe(400)
        expect((await POST(req({ ...BODY, composed_of: [{ code: 'P', portions: 1 }] }))).status).toBe(400)
        expect(mocks.createCoachExchangeGroup).not.toHaveBeenCalled()
    })

    it('body no-JSON ⇒ 400, jamas 500', async () => {
        const bad = new NextRequest('http://localhost/api/mobile/nutrition/exchanges/groups', {
            method: 'POST',
            headers: { authorization: 'Bearer tok' },
            body: 'no-json',
        })
        expect((await POST(bad)).status).toBe(400)
    })

    it('error del servicio (codigo duplicado) ⇒ 400 con el mensaje del dominio', async () => {
        mocks.createCoachExchangeGroup.mockResolvedValue({
            success: false,
            error: 'Ya existe un grupo con el código «C». Elige otro.',
        })
        const res = await POST(req(BODY))
        expect(res.status).toBe(400)
        await expect(res.json()).resolves.toMatchObject({ code: 'GROUP_WRITE_FAILED' })
    })
})

describe('PATCH (editar)', () => {
    it('exige groupId valido', async () => {
        expect((await PATCH(req(BODY))).status).toBe(400)
        expect(mocks.updateCoachExchangeGroup).not.toHaveBeenCalled()
    })
    it('edita y devuelve el grupo actualizado', async () => {
        const res = await PATCH(req({ ...BODY, groupId: GROUP_ID }))
        expect(res.status).toBe(200)
        expect(mocks.updateCoachExchangeGroup.mock.calls[0][1].groupId).toBe(GROUP_ID)
    })
})

describe('DELETE (soft-delete)', () => {
    it('borra y devuelve el id', async () => {
        const res = await DELETE(req({ groupId: GROUP_ID }))
        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({ ok: true, groupId: GROUP_ID })
    })
    it('respeta el gate', async () => {
        mocks.gateExchanges.mockResolvedValue({
            ok: false,
            response: NextResponse.json({ error: 'no token', code: 'MISSING_TOKEN' }, { status: 401 }),
        })
        expect((await DELETE(req({ groupId: GROUP_ID }))).status).toBe(401)
        expect(mocks.deleteCoachExchangeGroup).not.toHaveBeenCalled()
    })
    it('grupo del sistema ⇒ 400 del servicio', async () => {
        mocks.deleteCoachExchangeGroup.mockResolvedValue({
            success: false,
            error: 'Los grupos del sistema no se pueden eliminar.',
        })
        expect((await DELETE(req({ groupId: GROUP_ID }))).status).toBe(400)
    })
})
