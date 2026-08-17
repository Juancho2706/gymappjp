import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

/**
 * `/api/mobile/nutrition/exchanges/group-foods` — lectura de la lista de equivalencias de un
 * grupo (GET) desde RN.
 *
 * REGRESION QA T3.v: el `groupId` se validaba con una regex RFC 4122 propia y los grupos del
 * SISTEMA estan sembrados con ids no-RFC (`0000e8c0-0000-0000-0000-00000000000N`), asi que la
 * pantalla Porciones del telefono siempre mostraba "No pudimos cargar la lista". El contrato
 * compartido usa `z.guid()` justamente por esos seeds; este test fija esa paridad.
 */

const mocks = vi.hoisted(() => ({
    gateExchanges: vi.fn(),
    getExchangeListForGroup: vi.fn(),
    searchExchangeListCandidates: vi.fn(),
    getExchangeGroupsForCoach: vi.fn(),
}))

vi.mock('../_shared', () => ({ gateExchanges: mocks.gateExchanges }))

vi.mock('@/services/nutrition-exchanges/nutrition-exchanges.service', () => ({
    getExchangeGroupsForCoach: mocks.getExchangeGroupsForCoach,
}))

vi.mock('@/services/nutrition-exchanges/exchange-lists.service', () => ({
    getExchangeListForGroup: mocks.getExchangeListForGroup,
    searchExchangeListCandidates: mocks.searchExchangeListCandidates,
    excludeExchangeListEntry: vi.fn(),
    restoreExchangeListEntry: vi.fn(),
    saveExchangeListEntry: vi.fn(),
}))

import { GET } from './route'

/** Grupo del SISTEMA tal como quedo sembrado en produccion: version y variante `0` (no-RFC). */
const SEEDED_SYSTEM_GROUP_ID = '0000e8c0-0000-0000-0000-000000000001'

const userClient = { tag: 'token-scoped' } as never
const admin = { tag: 'service-role' } as never

function get(query: string) {
    return new NextRequest(`http://localhost/api/mobile/nutrition/exchanges/group-foods${query}`, {
        headers: { authorization: 'Bearer tok' },
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    mocks.gateExchanges.mockResolvedValue({ ok: true, coachId: 'coach-1', admin, userClient })
    mocks.getExchangeListForGroup.mockResolvedValue({ success: true, rows: [], total: 0 })
    mocks.getExchangeGroupsForCoach.mockResolvedValue([
        {
            id: SEEDED_SYSTEM_GROUP_ID,
            refProteinG: 2,
            refCarbsG: 15,
            refFatsG: 0,
            refCalories: 70,
        },
    ])
    mocks.searchExchangeListCandidates.mockResolvedValue([])
})

describe('GET (lista del grupo)', () => {
    it('acepta el id no-RFC de un grupo del sistema y consulta el servicio', async () => {
        const res = await GET(get(`?groupId=${SEEDED_SYSTEM_GROUP_ID}`))
        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toMatchObject({ ok: true, rows: [], total: 0 })
        const [db, input] = mocks.getExchangeListForGroup.mock.calls[0]
        expect(db).toBe(userClient)
        expect(db).not.toBe(admin)
        expect(input.groupId).toBe(SEEDED_SYSTEM_GROUP_ID)
        expect(input.actorCoachId).toBe('coach-1')
    })

    it('acepta el mismo id para los candidatos (`candidates=1`)', async () => {
        const res = await GET(get(`?groupId=${SEEDED_SYSTEM_GROUP_ID}&candidates=1`))
        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toMatchObject({ ok: true, candidates: [] })
        expect(mocks.searchExchangeListCandidates).toHaveBeenCalled()
    })

    it('sigue rechazando un groupId que no es UUID, sin tocar el servicio', async () => {
        expect((await GET(get('?groupId=no-es-uuid'))).status).toBe(400)
        expect((await GET(get(''))).status).toBe(400)
        expect(mocks.getExchangeListForGroup).not.toHaveBeenCalled()
    })

    it('el gate corre ANTES de leer (MODULE_OFF se propaga tal cual)', async () => {
        mocks.gateExchanges.mockResolvedValue({
            ok: false,
            response: NextResponse.json({ error: 'off', code: 'MODULE_OFF' }, { status: 403 }),
        })
        const res = await GET(get(`?groupId=${SEEDED_SYSTEM_GROUP_ID}`))
        expect(res.status).toBe(403)
        expect(mocks.getExchangeListForGroup).not.toHaveBeenCalled()
    })

    it('grupo invisible ⇒ 404 con el mensaje del dominio', async () => {
        mocks.getExchangeListForGroup.mockResolvedValue({
            success: false,
            error: 'Ese grupo de porciones ya no está disponible.',
        })
        const res = await GET(get(`?groupId=${SEEDED_SYSTEM_GROUP_ID}`))
        expect(res.status).toBe(404)
        await expect(res.json()).resolves.toMatchObject({ code: 'GROUP_NOT_FOUND' })
    })
})
