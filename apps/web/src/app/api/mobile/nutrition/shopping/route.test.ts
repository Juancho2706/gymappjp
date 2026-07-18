import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const gateAlumno = vi.fn()
vi.mock('../_shared', () => ({ gateAlumno: (...a: unknown[]) => gateAlumno(...a) }))

const getShoppingListView = vi.fn()
const toggleShoppingItem = vi.fn()
const addManualItem = vi.fn()
const removeManualItem = vi.fn()
vi.mock('@/services/nutrition-shopping.service', () => ({
    getShoppingListView: (...a: unknown[]) => getShoppingListView(...a),
    toggleShoppingItem: (...a: unknown[]) => toggleShoppingItem(...a),
    addManualItem: (...a: unknown[]) => addManualItem(...a),
    removeManualItem: (...a: unknown[]) => removeManualItem(...a),
}))

import { GET, PATCH, POST, DELETE } from './route'

const userClient = { __tag: 'userClient' }
const okGate = () => ({ ok: true, clientId: 'client-1', userClient, admin: {} })
const errGate = (status: number) => ({ ok: false, response: NextResponse.json({ error: 'x' }, { status }) })

const PLAN = '11111111-1111-4111-8111-111111111111'
const ITEM = '22222222-2222-4222-8222-222222222222'

function jsonReq(method: string, body: unknown) {
    return new NextRequest('http://localhost/api/mobile/nutrition/shopping', {
        method,
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    gateAlumno.mockResolvedValue(okGate())
    getShoppingListView.mockResolvedValue({ planId: PLAN, aisles: [] })
    toggleShoppingItem.mockResolvedValue({ success: true })
    addManualItem.mockResolvedValue({ success: true, id: ITEM })
    removeManualItem.mockResolvedValue({ success: true })
})

describe('GET /api/mobile/nutrition/shopping', () => {
    it('401 se propaga desde el gate', async () => {
        gateAlumno.mockResolvedValue(errGate(401))
        expect((await GET(new NextRequest('http://localhost/api/mobile/nutrition/shopping'))).status).toBe(401)
        expect(getShoppingListView).not.toHaveBeenCalled()
    })

    it('200 → vista fusionada por el clientId del bearer', async () => {
        const res = await GET(new NextRequest('http://localhost/api/mobile/nutrition/shopping'))
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ planId: PLAN, aisles: [] })
        expect(getShoppingListView).toHaveBeenCalledWith(userClient, 'client-1')
    })
})

describe('PATCH /api/mobile/nutrition/shopping (toggle)', () => {
    it('400 datos invalidos', async () => {
        expect((await PATCH(jsonReq('PATCH', { planId: PLAN, label: 'Pollo' }))).status).toBe(400)
    })

    it('200 → toggle con clientId del bearer', async () => {
        const res = await PATCH(jsonReq('PATCH', { planId: PLAN, label: 'Pollo', isChecked: true, category: 'Carnes' }))
        expect(res.status).toBe(200)
        expect(toggleShoppingItem).toHaveBeenCalledWith(userClient, {
            clientId: 'client-1',
            planId: PLAN,
            label: 'Pollo',
            category: 'Carnes',
            isChecked: true,
        })
    })

    it('400 si el servicio falla', async () => {
        toggleShoppingItem.mockResolvedValue({ success: false, error: 'nope' })
        expect((await PATCH(jsonReq('PATCH', { planId: PLAN, label: 'x', isChecked: false }))).status).toBe(400)
    })
})

describe('POST /api/mobile/nutrition/shopping (add manual)', () => {
    it('200 → agrega manual con clientId del bearer, devuelve id', async () => {
        const res = await POST(jsonReq('POST', { planId: null, label: 'Servilletas' }))
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true, id: ITEM })
        expect(addManualItem).toHaveBeenCalledWith(userClient, {
            clientId: 'client-1',
            planId: null,
            label: 'Servilletas',
            category: null,
        })
    })

    it('400 label vacío', async () => {
        expect((await POST(jsonReq('POST', { planId: null, label: '' }))).status).toBe(400)
    })
})

describe('DELETE /api/mobile/nutrition/shopping (remove manual)', () => {
    it('400 itemId invalido', async () => {
        expect((await DELETE(new NextRequest('http://localhost/api/mobile/nutrition/shopping?itemId=nope'))).status).toBe(400)
    })

    it('200 → borra manual con clientId del bearer', async () => {
        const res = await DELETE(new NextRequest(`http://localhost/api/mobile/nutrition/shopping?itemId=${ITEM}`))
        expect(res.status).toBe(200)
        expect(removeManualItem).toHaveBeenCalledWith(userClient, 'client-1', ITEM)
    })
})
