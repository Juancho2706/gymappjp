import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Cron `north-star-weekly` — guard y forma de la corrida.
 *
 * Lo que se pinnea acá:
 *  · fail-closed de la auth: sin `CRON_SECRET` en el env NADIE entra, ni siquiera con el header
 *    correcto (un secreto vacío no puede volverse una puerta abierta);
 *  · `?dry=1` calcula la fila y NO manda correo;
 *  · sin `NORTH_STAR_REPORT_TO` la corrida es un 200 con `skipped`, no un 500: la env la setea el
 *    owner después del deploy y un cron en rojo por eso solo genera alertas inaccionables.
 */

vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: () => ({}) }))

const ROW = {
    semana: '2026-08-17',
    desde: '2026-08-17T00:00:00.000Z',
    hasta: '2026-08-24T00:00:00.000Z',
    corte: '2026-08-24T13:00:00.000Z',
    n: 29,
    invitaron_ns: 7,
    invitaron_cruda: 8,
    activados: 5,
    maduras_72h: 8,
    activados_72h: 2,
    north_star_pct: 25,
    pct_marca_color: 17.2,
    pct_marca_logo: 13.8,
    pct_persona: 27.6,
    altas_sobre_tope_ip: 0,
    pct_active_sin_verificar_7d: null,
    n_active_7d: 0,
    logins_bajo_120s: 1,
    mismo_fono: 0,
}

const computeNorthStarWeeklyRow = vi.fn(async () => ROW)
vi.mock('@/services/metrics/north-star-weekly.service', () => ({
    computeNorthStarWeeklyRow: () => computeNorthStarWeeklyRow(),
    buildNorthStarEmail: () => ({ subject: 'North Star semanal', html: '<p>fila</p>' }),
}))

const sendTransactionalEmail = vi.fn(async (input: unknown) => {
    void input
    return { ok: true as const, providerMessageId: 'msg-1' }
})
vi.mock('@/lib/email/send-email', () => ({
    sendTransactionalEmail: (...a: unknown[]) => sendTransactionalEmail(a[0]),
}))

import { GET } from './route'

const SECRET = 'cron-sekret'
const authedReq = (query = '') =>
    new Request(`https://eva/api/cron/north-star-weekly${query}`, {
        headers: { authorization: `Bearer ${SECRET}` },
    })

beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('CRON_SECRET', SECRET)
    vi.stubEnv('NORTH_STAR_REPORT_TO', 'owner@eva-app.cl')
})
afterEach(() => vi.unstubAllEnvs())

describe('GET /api/cron/north-star-weekly — auth', () => {
    it('sin CRON_SECRET en el env → 401 y no calcula nada', async () => {
        vi.stubEnv('CRON_SECRET', '')
        const res = await GET(authedReq())
        expect(res.status).toBe(401)
        expect(computeNorthStarWeeklyRow).not.toHaveBeenCalled()
        expect(sendTransactionalEmail).not.toHaveBeenCalled()
    })

    it('Authorization incorrecto → 401', async () => {
        const res = await GET(
            new Request('https://eva/api/cron/north-star-weekly', {
                headers: { authorization: 'Bearer malo' },
            })
        )
        expect(res.status).toBe(401)
        expect(sendTransactionalEmail).not.toHaveBeenCalled()
    })

    it('sin header Authorization → 401', async () => {
        const res = await GET(new Request('https://eva/api/cron/north-star-weekly'))
        expect(res.status).toBe(401)
    })
})

describe('GET /api/cron/north-star-weekly — corrida', () => {
    it('?dry=1 devuelve la fila y NO manda correo', async () => {
        const res = await GET(authedReq('?dry=1'))
        const json = await res.json()
        expect(res.status).toBe(200)
        expect(json).toMatchObject({ ok: true, dry: true, sent: false })
        expect(json.row).toMatchObject({ n: 29, invitaron_ns: 7, north_star_pct: 25 })
        expect(computeNorthStarWeeklyRow).toHaveBeenCalledTimes(1)
        expect(sendTransactionalEmail).not.toHaveBeenCalled()
    })

    it('corrida real: manda la fila al destinatario del env', async () => {
        const res = await GET(authedReq())
        const json = await res.json()
        expect(json).toMatchObject({ ok: true, sent: true })
        expect(sendTransactionalEmail).toHaveBeenCalledTimes(1)
        expect(sendTransactionalEmail.mock.calls[0][0]).toMatchObject({
            to: 'owner@eva-app.cl',
            subject: 'North Star semanal',
            html: '<p>fila</p>',
        })
    })

    it('sin NORTH_STAR_REPORT_TO no envía y responde 200 con la fila (fail-silent deliberado)', async () => {
        vi.stubEnv('NORTH_STAR_REPORT_TO', '')
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const res = await GET(authedReq())
        const json = await res.json()
        expect(res.status).toBe(200)
        expect(json).toMatchObject({ ok: true, skipped: 'no_recipient_env' })
        expect(json.row).toMatchObject({ n: 29 })
        expect(sendTransactionalEmail).not.toHaveBeenCalled()
        expect(warn).toHaveBeenCalled()
        warn.mockRestore()
    })
})
