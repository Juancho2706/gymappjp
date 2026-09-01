import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Cron `coach-kpi-snapshot` — guard y forma de la corrida.
 *
 * Lo que se pinnea acá:
 *  · fail-closed de la auth: sin `CRON_SECRET` en el env NADIE entra, ni siquiera con el header
 *    correcto (un secreto vacío no puede volverse una puerta abierta);
 *  · sin query, la corrida es la cohorte completa;
 *  · `?coach_id=` válido siembra UN coach — es la forma de arreglar una fila puntual sin reescribir
 *    las demás;
 *  · un `coach_id` basura muere en 400 ANTES de tocar la DB.
 */

vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: () => ({}) }))

const snapshotAllCoachKpis = vi.fn(async () => ({ day: '2026-09-01', snapshotted: 68, errors: [] as string[] }))
const snapshotCoachKpis = vi.fn(async (_db: unknown, _ids: string[]) => ({
    day: '2026-09-01',
    snapshotted: 1,
    errors: [] as string[],
}))
vi.mock('@/app/coach/dashboard/_data/kpi-snapshot.queries', () => ({
    snapshotAllCoachKpis: (...a: unknown[]) => snapshotAllCoachKpis(...(a as [])),
    snapshotCoachKpis: (...a: unknown[]) => snapshotCoachKpis(a[0], a[1] as string[]),
}))

import { GET } from './route'

const SECRET = 'cron-sekret'
const COACH_ID = '3f9a1b2c-4d5e-4f60-8123-9abcdef01234'
const authedReq = (query = '') =>
    new Request(`https://eva/api/cron/coach-kpi-snapshot${query}`, {
        headers: { authorization: `Bearer ${SECRET}` },
    })

beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('CRON_SECRET', SECRET)
})
afterEach(() => vi.unstubAllEnvs())

describe('GET /api/cron/coach-kpi-snapshot — auth', () => {
    it('sin CRON_SECRET en el env → 401 y no snapshotea nada', async () => {
        vi.stubEnv('CRON_SECRET', '')
        const res = await GET(authedReq())
        expect(res.status).toBe(401)
        expect(snapshotAllCoachKpis).not.toHaveBeenCalled()
        expect(snapshotCoachKpis).not.toHaveBeenCalled()
    })

    it('Authorization incorrecto → 401', async () => {
        const res = await GET(
            new Request('https://eva/api/cron/coach-kpi-snapshot', { headers: { authorization: 'Bearer malo' } })
        )
        expect(res.status).toBe(401)
        expect(snapshotAllCoachKpis).not.toHaveBeenCalled()
    })

    it('sin header Authorization → 401', async () => {
        const res = await GET(new Request('https://eva/api/cron/coach-kpi-snapshot'))
        expect(res.status).toBe(401)
    })
})

describe('GET /api/cron/coach-kpi-snapshot — corrida', () => {
    it('sin query: cohorte completa', async () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => {})
        const res = await GET(authedReq())
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json).toMatchObject({ ok: true, day: '2026-09-01', snapshotted: 68, errors: [] })
        expect(snapshotAllCoachKpis).toHaveBeenCalledTimes(1)
        expect(snapshotCoachKpis).not.toHaveBeenCalled()
        info.mockRestore()
    })

    it('?coach_id= valido: siembra solo ese coach', async () => {
        const info = vi.spyOn(console, 'info').mockImplementation(() => {})
        const res = await GET(authedReq(`?coach_id=${COACH_ID}`))
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json).toMatchObject({ ok: true, snapshotted: 1 })
        expect(snapshotCoachKpis).toHaveBeenCalledTimes(1)
        expect(snapshotCoachKpis.mock.calls[0][1]).toEqual([COACH_ID])
        expect(snapshotAllCoachKpis).not.toHaveBeenCalled()
        info.mockRestore()
    })

    it('?coach_id= basura: 400 sin tocar la DB', async () => {
        const res = await GET(authedReq('?coach_id=basura'))
        expect(res.status).toBe(400)
        expect(snapshotCoachKpis).not.toHaveBeenCalled()
        expect(snapshotAllCoachKpis).not.toHaveBeenCalled()
    })

    it('errores parciales siguen siendo 200 con la lista (no esconden las filas guardadas)', async () => {
        snapshotAllCoachKpis.mockResolvedValueOnce({ day: '2026-09-01', snapshotted: 66, errors: ['coach x: pulse caido'] })
        const info = vi.spyOn(console, 'info').mockImplementation(() => {})
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

        const res = await GET(authedReq())
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json).toMatchObject({ ok: true, snapshotted: 66 })
        expect(json.errors).toHaveLength(1)
        info.mockRestore()
        warn.mockRestore()
    })

    it('corrida entera caida: 500', async () => {
        snapshotAllCoachKpis.mockRejectedValueOnce(new Error('no se pudo listar coaches'))
        const error = vi.spyOn(console, 'error').mockImplementation(() => {})

        const res = await GET(authedReq())
        expect(res.status).toBe(500)
        error.mockRestore()
    })
})
