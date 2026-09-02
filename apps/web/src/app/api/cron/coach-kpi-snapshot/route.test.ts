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
 *  · un `coach_id` basura muere en 400 ANTES de tocar la DB;
 *  · la poda de retención corre DESPUÉS del upsert, con el cutoff en día calendario Santiago, y
 *    fallar no le cambia el 200 a una corrida que sí guardó sus filas.
 */

vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: () => ({}) }))

const pruneCoachKpiSnapshots = vi.fn(async (_db: unknown, _cutoff: string) => ({
    deleted: 0,
    error: null as string | null,
}))
vi.mock('@/infrastructure/db', () => ({
    pruneCoachKpiSnapshots: (...a: unknown[]) => pruneCoachKpiSnapshots(a[0], a[1] as string),
}))

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
    pruneCoachKpiSnapshots.mockResolvedValue({ deleted: 0, error: null })
})
afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
})

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

describe('GET /api/cron/coach-kpi-snapshot — poda de retención', () => {
    /** Congela el reloj: el cutoff sale de `new Date()` dentro del handler. */
    const at = (iso: string) => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date(iso))
    }

    it('el cutoff son 90 dias antes del dia SANTIAGO, no del dia UTC', async () => {
        // 02:00 UTC del 1 de diciembre = 23:00 del 30 de noviembre en Chile. El corte tiene que
        // colgar del 30-11 (⇒ 2026-09-01) y no del 01-12 (⇒ 2026-09-02).
        at('2026-12-01T02:00:00.000Z')
        const info = vi.spyOn(console, 'info').mockImplementation(() => {})

        const res = await GET(authedReq())

        expect(res.status).toBe(200)
        expect(pruneCoachKpiSnapshots).toHaveBeenCalledTimes(1)
        expect(pruneCoachKpiSnapshots.mock.calls[0][1]).toBe('2026-09-01')
        info.mockRestore()
    })

    it('en enero el cutoff cruza el año sin off-by-one', async () => {
        // 02:00 UTC del 15-01-2027 = 14-01 en Chile ⇒ 14-01-2027 − 90 d = 16-10-2026.
        at('2027-01-15T02:00:00.000Z')
        const info = vi.spyOn(console, 'info').mockImplementation(() => {})

        await GET(authedReq())

        expect(pruneCoachKpiSnapshots.mock.calls[0][1]).toBe('2026-10-16')
        info.mockRestore()
    })

    it('poda despues del upsert y su total viaja en la respuesta', async () => {
        pruneCoachKpiSnapshots.mockResolvedValue({ deleted: 12, error: null })
        const info = vi.spyOn(console, 'info').mockImplementation(() => {})
        const order: string[] = []
        snapshotAllCoachKpis.mockImplementationOnce(async () => {
            order.push('snapshot')
            return { day: '2026-09-01', snapshotted: 68, errors: [] }
        })
        pruneCoachKpiSnapshots.mockImplementationOnce(async () => {
            order.push('prune')
            return { deleted: 12, error: null }
        })

        const res = await GET(authedReq())
        const json = await res.json()

        expect(order).toEqual(['snapshot', 'prune'])
        expect(json).toMatchObject({ ok: true, snapshotted: 68, deleted: 12 })
        info.mockRestore()
    })

    it('poda fallida: warn, pero el 200 y el snapshotted no se mueven', async () => {
        pruneCoachKpiSnapshots.mockResolvedValue({ deleted: 0, error: 'permission denied' })
        const info = vi.spyOn(console, 'info').mockImplementation(() => {})
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

        const res = await GET(authedReq())
        const json = await res.json()

        expect(res.status).toBe(200)
        expect(json).toMatchObject({ ok: true, snapshotted: 68, deleted: 0 })
        expect(warn.mock.calls.flat().join(' ')).toContain('poda fallida')
        info.mockRestore()
        warn.mockRestore()
    })
})
