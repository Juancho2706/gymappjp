import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// gateAlumno controlado por test: por defecto autoriza al alumno 'client-1'.
const gateAlumno = vi.fn()
vi.mock('../_shared', () => ({ gateAlumno: (...a: unknown[]) => gateAlumno(...a) }))

const listMealComments = vi.fn()
const addMealComment = vi.fn()
vi.mock('@/services/nutrition-notes.service', () => ({
    NutritionNotesService: class {
        listMealComments = (...a: unknown[]) => listMealComments(...a)
        addMealComment = (...a: unknown[]) => addMealComment(...a)
    },
}))

import { GET, POST } from './route'

const userClient = { __tag: 'userClient' }
function okGate() {
    return { ok: true, clientId: 'client-1', userClient, admin: {} }
}
function errGate(status: number) {
    return { ok: false, response: NextResponse.json({ error: 'x' }, { status }) }
}

function getReq(date?: string) {
    const url = date ? `http://localhost/api/mobile/nutrition/notes?date=${date}` : 'http://localhost/api/mobile/nutrition/notes'
    return new NextRequest(url)
}
function postReq(body: unknown) {
    return new NextRequest('http://localhost/api/mobile/nutrition/notes', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    gateAlumno.mockResolvedValue(okGate())
    listMealComments.mockResolvedValue([{ id: 'c1', body: 'hola' }])
    addMealComment.mockResolvedValue({ id: 'c2', body: 'nuevo' })
})

describe('GET /api/mobile/nutrition/notes', () => {
    it('401 si el gate rechaza el token', async () => {
        gateAlumno.mockResolvedValue(errGate(401))
        const res = await GET(getReq('2026-07-08'))
        expect(res.status).toBe(401)
        expect(listMealComments).not.toHaveBeenCalled()
    })

    it('400 si falta/invalido el date', async () => {
        expect((await GET(getReq())).status).toBe(400)
        expect((await GET(getReq('07-2026'))).status).toBe(400)
        expect(listMealComments).not.toHaveBeenCalled()
    })

    it('200 → lista el hilo del día por el clientId del bearer', async () => {
        const res = await GET(getReq('2026-07-08'))
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ comments: [{ id: 'c1', body: 'hola' }] })
        expect(listMealComments).toHaveBeenCalledWith('client-1', '2026-07-08')
    })
})

describe('POST /api/mobile/nutrition/notes', () => {
    it('403 NOT_A_CLIENT se propaga desde el gate', async () => {
        gateAlumno.mockResolvedValue(errGate(403))
        const res = await POST(postReq({ logDate: '2026-07-08', body: 'hey' }))
        expect(res.status).toBe(403)
        expect(addMealComment).not.toHaveBeenCalled()
    })

    it('400 body vacío', async () => {
        expect((await POST(postReq({ logDate: '2026-07-08', body: '   ' }))).status).toBe(400)
    })

    it('400 sin ancla (ni logDate ni mealLogId)', async () => {
        expect((await POST(postReq({ body: 'hey' }))).status).toBe(400)
        expect(addMealComment).not.toHaveBeenCalled()
    })

    it('200 → inserta con author_id/clientId del bearer y authorRole=client (no del body)', async () => {
        const res = await POST(postReq({ logDate: '2026-07-08', body: 'hey', clientId: 'ATTACKER' }))
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ comment: { id: 'c2', body: 'nuevo' } })
        expect(addMealComment).toHaveBeenCalledWith({
            clientId: 'client-1',
            authorId: 'client-1',
            mealLogId: null,
            logDate: '2026-07-08',
            body: 'hey',
            authorRole: 'client',
        })
    })
})
