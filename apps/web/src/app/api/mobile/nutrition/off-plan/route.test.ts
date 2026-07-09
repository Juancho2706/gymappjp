import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const gateAlumno = vi.fn()
vi.mock('../_shared', () => ({ gateAlumno: (...a: unknown[]) => gateAlumno(...a) }))

const listIntakeEntriesForDate = vi.fn()
const listRecentIntakeFoods = vi.fn()
const insertIntakeEntry = vi.fn()
const deleteIntakeEntry = vi.fn()
vi.mock('@/services/nutrition-intake.service', () => ({
    INTAKE_SOURCES: ['offplan', 'quickadd', 'recent', 'copy'],
    NutritionIntakeService: class {
        listIntakeEntriesForDate = (...a: unknown[]) => listIntakeEntriesForDate(...a)
        listRecentIntakeFoods = (...a: unknown[]) => listRecentIntakeFoods(...a)
        insertIntakeEntry = (...a: unknown[]) => insertIntakeEntry(...a)
        deleteIntakeEntry = (...a: unknown[]) => deleteIntakeEntry(...a)
    },
}))

import { GET, POST, DELETE } from './route'

const FOOD = '33333333-3333-4333-8333-333333333333'
const ENTRY = '44444444-4444-4444-8444-444444444444'

// userClient con un query-builder mínimo para la validación de `foods` del POST.
const foodMaybeSingle = vi.fn()
const userClient = {
    from: vi.fn(() => ({ select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: foodMaybeSingle })) })) })),
}
const okGate = () => ({ ok: true, clientId: 'client-1', userClient, admin: {} })
const errGate = (status: number) => ({ ok: false, response: NextResponse.json({ error: 'x' }, { status }) })

function getReq(date?: string) {
    const url = date
        ? `http://localhost/api/mobile/nutrition/off-plan?date=${date}`
        : 'http://localhost/api/mobile/nutrition/off-plan'
    return new NextRequest(url)
}
function postReq(body: unknown) {
    return new NextRequest('http://localhost/api/mobile/nutrition/off-plan', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    gateAlumno.mockResolvedValue(okGate())
    listIntakeEntriesForDate.mockResolvedValue([{ id: 'e1' }])
    listRecentIntakeFoods.mockResolvedValue([{ id: FOOD, name: 'Pollo' }])
    insertIntakeEntry.mockResolvedValue({ id: ENTRY, custom_name: 'Empanada' })
    deleteIntakeEntry.mockResolvedValue(true)
    foodMaybeSingle.mockResolvedValue({ data: { id: FOOD } })
})

describe('GET /api/mobile/nutrition/off-plan', () => {
    it('401 se propaga desde el gate', async () => {
        gateAlumno.mockResolvedValue(errGate(401))
        expect((await GET(getReq('2026-07-08'))).status).toBe(401)
    })

    it('400 sin/invalido date', async () => {
        expect((await GET(getReq())).status).toBe(400)
        expect((await GET(getReq('nope'))).status).toBe(400)
    })

    it('200 → entries del día + recentFoods por el clientId del bearer', async () => {
        const res = await GET(getReq('2026-07-08'))
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ entries: [{ id: 'e1' }], recentFoods: [{ id: FOOD, name: 'Pollo' }] })
        expect(listIntakeEntriesForDate).toHaveBeenCalledWith('client-1', '2026-07-08')
        expect(listRecentIntakeFoods).toHaveBeenCalledWith('client-1', 10)
    })
})

describe('POST /api/mobile/nutrition/off-plan', () => {
    it('400 sin foodId ni customName', async () => {
        expect((await POST(postReq({ logDate: '2026-07-08', quantity: 100, unit: 'g' }))).status).toBe(400)
        expect(insertIntakeEntry).not.toHaveBeenCalled()
    })

    it('400 unit fuera de enum', async () => {
        expect((await POST(postReq({ logDate: '2026-07-08', customName: 'x', quantity: 1, unit: 'kg' }))).status).toBe(400)
    })

    it('400 si el foodId no es visible (RLS de foods)', async () => {
        foodMaybeSingle.mockResolvedValue({ data: null })
        const res = await POST(postReq({ logDate: '2026-07-08', foodId: FOOD, quantity: 100, unit: 'g' }))
        expect(res.status).toBe(400)
        expect(insertIntakeEntry).not.toHaveBeenCalled()
    })

    it('200 → inserta con clientId del bearer (custom name)', async () => {
        const res = await POST(postReq({ logDate: '2026-07-08', customName: 'Empanada', quantity: 1, unit: 'un' }))
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ entry: { id: ENTRY, custom_name: 'Empanada' } })
        expect(insertIntakeEntry).toHaveBeenCalledWith({
            clientId: 'client-1',
            logDate: '2026-07-08',
            foodId: null,
            customName: 'Empanada',
            quantity: 1,
            unit: 'un',
            source: 'offplan',
        })
    })
})

describe('DELETE /api/mobile/nutrition/off-plan', () => {
    it('400 entryId invalido', async () => {
        expect((await DELETE(new NextRequest('http://localhost/api/mobile/nutrition/off-plan?entryId=nope'))).status).toBe(400)
    })

    it('200 → borra la entrada del alumno', async () => {
        const res = await DELETE(new NextRequest(`http://localhost/api/mobile/nutrition/off-plan?entryId=${ENTRY}`))
        expect(res.status).toBe(200)
        expect(deleteIntakeEntry).toHaveBeenCalledWith('client-1', ENTRY)
    })
})
