import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import type { DripTemplate } from './drip-templates'

type BuildDripTemplates = typeof import('./drip-templates').buildDripTemplates
type DripContext = Parameters<BuildDripTemplates>[0]

const { scheduleCoachEmailMock, cancelCoachEmailsMock, addResendAudienceContactMock, buildDripTemplatesMock, real } =
    vi.hoisted(() => ({
        scheduleCoachEmailMock: vi.fn(),
        cancelCoachEmailsMock: vi.fn(),
        addResendAudienceContactMock: vi.fn(),
        buildDripTemplatesMock: vi.fn(),
        // Holder del módulo REAL: el mock delega en él salvo cuando el test quiere una lista incompleta.
        real: { build: null as null | ((ctx: unknown) => DripTemplate[]) },
    }))

vi.mock('@/services/email/coach-email-ledger.service', () => ({
    scheduleCoachEmail: scheduleCoachEmailMock,
    cancelCoachEmails: cancelCoachEmailsMock,
}))

vi.mock('./send-email', () => ({
    addResendAudienceContact: addResendAudienceContactMock,
}))

vi.mock('./drip-templates', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./drip-templates')>()
    real.build = actual.buildDripTemplates as (ctx: unknown) => DripTemplate[]
    return { ...actual, buildDripTemplates: buildDripTemplatesMock }
})

import {
    cancelDripForUnverifiedCoach,
    scheduleFreeCoachDripSequence,
    sweepUnverifiedCoachDrips,
    DRIP_SCHEDULE,
    DRIP_TEMPLATE_KEYS,
} from './send-drip-sequence'

const admin = {} as SupabaseClient<Database>

const INPUT = {
    admin,
    coachId: '11111111-1111-4111-8111-111111111111',
    email: 'coach@example.com',
    coachName: 'Josefa Díaz',
    brandName: 'Studio Fuerza',
    inviteCode: 'X5UD9X44',
}

describe('scheduleFreeCoachDripSequence', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        buildDripTemplatesMock.mockImplementation((ctx: DripContext) => real.build!(ctx))
        scheduleCoachEmailMock.mockResolvedValue({ ok: true, ledgerId: 'led', providerMessageId: 'msg', deduped: false })
        addResendAudienceContactMock.mockResolvedValue(undefined)
        vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.eva-app.cl')
        vi.stubEnv('RESEND_FREE_COACH_AUDIENCE_ID', '')
        // D11 = A: la serie por calendario nace APAGADA. Estos casos describen la serie
        // cuando el owner la resucita a mano; el default (apagada) se pinnea abajo.
        vi.stubEnv('FREE_COACH_DRIP_ENABLED', 'true')
    })

    afterEach(() => {
        vi.unstubAllEnvs()
        vi.restoreAllMocks()
    })

    it('agenda las 4 con trigger drip, keys nuevas y subject/html no vacíos', async () => {
        await scheduleFreeCoachDripSequence(INPUT)

        expect(scheduleCoachEmailMock).toHaveBeenCalledTimes(4)
        const keys = scheduleCoachEmailMock.mock.calls.map(([, arg]) => arg.templateKey)
        expect(keys).toEqual(['day1_value', 'day2_pro', 'day7_nutrition', 'day14_last_call'])

        for (const [client, arg] of scheduleCoachEmailMock.mock.calls) {
            expect(client).toBe(admin)
            expect(arg.coachId).toBe(INPUT.coachId)
            expect(arg.to).toBe(INPUT.email)
            expect(arg.trigger).toBe('drip')
            expect(arg.subject.length).toBeGreaterThan(0)
            expect(arg.html.length).toBeGreaterThan(0)
        }
    })

    it('los scheduledAt son +1 / +2 / +7 / +14 días y el payload lleva el día', async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date('2026-08-21T12:00:00.000Z'))
        try {
            await scheduleFreeCoachDripSequence(INPUT)
        } finally {
            vi.useRealTimers()
        }

        const scheduled = scheduleCoachEmailMock.mock.calls.map(([, arg]) => [arg.payload.day, arg.scheduledAt])
        expect(scheduled).toEqual([
            [1, '2026-08-22T12:00:00.000Z'],
            [2, '2026-08-23T12:00:00.000Z'],
            [7, '2026-08-28T12:00:00.000Z'],
            [14, '2026-09-04T12:00:00.000Z'],
        ])
        expect(DRIP_SCHEDULE.map((s) => s.day)).toEqual([1, 2, 7, 14])
    })

    // FCN W2.5: el D+1 dejó de repartir `/join/{código}` —la puerta de SOLICITUDES— y su único link
    // pasó al alta directa. El `inviteCode` se sigue threadeando (el contexto lo conserva), pero lo
    // que este test protege ahora es el DESTINO del correo, no el código.
    it('threadea el contexto a las plantillas y el D+1 sale con el link del alta directa', async () => {
        await scheduleFreeCoachDripSequence(INPUT)

        expect(buildDripTemplatesMock).toHaveBeenCalledWith({
            coachName: 'Josefa Díaz',
            brandName: 'Studio Fuerza',
            baseUrl: 'https://www.eva-app.cl',
            inviteCode: 'X5UD9X44',
        })
        const day1 = scheduleCoachEmailMock.mock.calls.find(([, arg]) => arg.templateKey === 'day1_value')![1]
        expect(day1.html).toContain('https://www.eva-app.cl/coach/clients?invite=1')
        expect(day1.html).not.toContain('/join/')
    })

    // Colisión C3 del SPEC: `templateByKey` devolvía `{ subject: '', html: '' }` en silencio, así que
    // un typo en la key mandaba un correo VACÍO a todos los coaches nuevos sin que nada fallara.
    it('LANZA «drip template missing: <key>» si buildDripTemplates deja de devolver una key', async () => {
        buildDripTemplatesMock.mockImplementation((ctx: DripContext) =>
            real.build!(ctx).filter((t) => t.key !== 'day2_pro')
        )

        await expect(scheduleFreeCoachDripSequence(INPUT)).rejects.toThrow('drip template missing: day2_pro')
        expect(scheduleCoachEmailMock).not.toHaveBeenCalled()
    })

    it('sin RESEND_FREE_COACH_AUDIENCE_ID no toca la audiencia; con id la agrega', async () => {
        await scheduleFreeCoachDripSequence(INPUT)
        expect(addResendAudienceContactMock).not.toHaveBeenCalled()

        vi.stubEnv('RESEND_FREE_COACH_AUDIENCE_ID', 'aud_123')
        await scheduleFreeCoachDripSequence(INPUT)
        expect(addResendAudienceContactMock).toHaveBeenCalledWith(
            expect.objectContaining({ audienceId: 'aud_123', email: INPUT.email, firstName: 'Josefa', lastName: 'Díaz' })
        )
    })

    // El ledger es fail-open por contrato: nunca lanza. Igual blindamos que un rechazo suelto de la
    // audiencia no tumbe el alta.
    it('un rechazo de la audiencia no rompe la función ni ensucia el resumen', async () => {
        vi.stubEnv('RESEND_FREE_COACH_AUDIENCE_ID', 'aud_123')
        addResendAudienceContactMock.mockRejectedValue(new Error('resend 500'))
        vi.spyOn(console, 'warn').mockImplementation(() => {})

        // La audiencia NO es un correo de la serie: se loguea aparte y no suma a `failed`.
        await expect(scheduleFreeCoachDripSequence(INPUT)).resolves.toEqual({
            scheduled: 4,
            deduped: 0,
            failed: 0,
            failures: [],
        })
        expect(scheduleCoachEmailMock).toHaveBeenCalledTimes(4)
    })

    // M-5: el fallback viejo era `http://localhost:3000`. Un D+14 agendado con links a localhost es
    // un correo perdido, y salía exactamente así si la env no llegaba al runtime.
    it('sin NEXT_PUBLIC_SITE_URL los links caen a PRODUCCIÓN, nunca a localhost', async () => {
        vi.stubEnv('NEXT_PUBLIC_SITE_URL', undefined)
        await scheduleFreeCoachDripSequence(INPUT)

        expect(buildDripTemplatesMock).toHaveBeenCalledWith(
            expect.objectContaining({ baseUrl: 'https://www.eva-app.cl' })
        )
        for (const [, arg] of scheduleCoachEmailMock.mock.calls) {
            expect(arg.html).not.toContain('localhost')
        }
    })
})

/**
 * D11 = A (owner 22-08, W6 de coach-onboarding-v2): el drip por CALENDARIO muere y lo reemplazan
 * los correos por comportamiento. Lo que estos tests pinnean es el DEFAULT: sin la env explícita no
 * se encola nada. Sin esto, un despliegue con el flag mal escrito sigue mandando el D+1 y el
 * gatillo «+2 h sin alumno» en paralelo — que son el mismo correo con dos keys distintas.
 */
describe('scheduleFreeCoachDripSequence — D11: apagada por defecto', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        buildDripTemplatesMock.mockImplementation((ctx: DripContext) => real.build!(ctx))
        scheduleCoachEmailMock.mockResolvedValue({ ok: true, ledgerId: 'led', providerMessageId: 'msg', deduped: false })
        addResendAudienceContactMock.mockResolvedValue(undefined)
        vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.eva-app.cl')
        vi.stubEnv('RESEND_FREE_COACH_AUDIENCE_ID', '')
        vi.stubEnv('FREE_COACH_DRIP_ENABLED', undefined)
    })

    afterEach(() => {
        vi.unstubAllEnvs()
        vi.restoreAllMocks()
    })

    it('sin FREE_COACH_DRIP_ENABLED no agenda NINGUNO de los 4 y devuelve el resumen en cero', async () => {
        await expect(scheduleFreeCoachDripSequence(INPUT)).resolves.toEqual({
            scheduled: 0,
            deduped: 0,
            failed: 0,
            failures: [],
        })
        expect(scheduleCoachEmailMock).not.toHaveBeenCalled()
    })

    // La audiencia NO es un correo: apagar el drip no puede dejar al padrón nuevo fuera de la lista
    // con la que el owner manda un aviso a mano.
    it('apagada, el alta a la audiencia de Resend SIGUE', async () => {
        vi.stubEnv('RESEND_FREE_COACH_AUDIENCE_ID', 'aud_123')
        await scheduleFreeCoachDripSequence(INPUT)

        expect(addResendAudienceContactMock).toHaveBeenCalledWith(
            expect.objectContaining({ audienceId: 'aud_123', email: INPUT.email })
        )
        expect(scheduleCoachEmailMock).not.toHaveBeenCalled()
    })

    it('un valor distinto de «true» sigue siendo apagado (fail-closed)', async () => {
        vi.stubEnv('FREE_COACH_DRIP_ENABLED', '1')
        await scheduleFreeCoachDripSequence(INPUT)
        expect(scheduleCoachEmailMock).not.toHaveBeenCalled()
    })
})

/**
 * I-4 — la función devolvía `void`: las cuatro podían fallar (el ledger no lanza, devuelve
 * `{ ok: false }`) y el caller no tenía forma de enterarse ni de loguearlo. El resumen es lo que
 * hace visible ese modo de fallo, y va SIN PII: solo la key y el motivo.
 */
describe('scheduleFreeCoachDripSequence — resumen', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        buildDripTemplatesMock.mockImplementation((ctx: DripContext) => real.build!(ctx))
        addResendAudienceContactMock.mockResolvedValue(undefined)
        vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.eva-app.cl')
        vi.stubEnv('RESEND_FREE_COACH_AUDIENCE_ID', '')
        // D11 = A: la serie por calendario nace APAGADA. Estos casos describen la serie
        // cuando el owner la resucita a mano; el default (apagada) se pinnea abajo.
        vi.stubEnv('FREE_COACH_DRIP_ENABLED', 'true')
    })

    afterEach(() => {
        vi.unstubAllEnvs()
        vi.restoreAllMocks()
    })

    it('las 4 agendadas → scheduled: 4 y ninguna falla', async () => {
        scheduleCoachEmailMock.mockResolvedValue({ ok: true, deduped: false, ledgerId: 'led', providerMessageId: 'msg' })
        await expect(scheduleFreeCoachDripSequence(INPUT)).resolves.toEqual({
            scheduled: 4,
            deduped: 0,
            failed: 0,
            failures: [],
        })
    })

    // M-11: el modo de fallo REAL (Resend 4xx/5xx, sin API key) no rechaza — resuelve `ok: false`.
    it('las 4 rechazadas por Resend → failed: 4 con la key de cada una y sin PII', async () => {
        scheduleCoachEmailMock.mockResolvedValue({ ok: false, reason: 'send_failed' })
        const summary = await scheduleFreeCoachDripSequence(INPUT)

        expect(summary).toEqual({
            scheduled: 0,
            deduped: 0,
            failed: 4,
            failures: [
                { key: 'day1_value', error: 'send_failed' },
                { key: 'day2_pro', error: 'send_failed' },
                { key: 'day7_nutrition', error: 'send_failed' },
                { key: 'day14_last_call', error: 'send_failed' },
            ],
        })
        const serialized = JSON.stringify(summary)
        expect(serialized).not.toContain(INPUT.email)
        expect(serialized).not.toContain(INPUT.coachName)
    })

    it('una deduplicada y el resto agendadas → cada una a su contador', async () => {
        scheduleCoachEmailMock
            .mockResolvedValueOnce({ ok: true, deduped: true, ledgerId: 'previa', providerMessageId: null })
            .mockResolvedValue({ ok: true, deduped: false, ledgerId: 'led', providerMessageId: 'msg' })

        await expect(scheduleFreeCoachDripSequence(INPUT)).resolves.toMatchObject({
            scheduled: 3,
            deduped: 1,
            failed: 0,
        })
    })

    it('si `scheduleCoachEmail` LANZA (no debería: no lanza por contrato) cuenta como fallo', async () => {
        scheduleCoachEmailMock.mockRejectedValue(new Error('boom'))
        await expect(scheduleFreeCoachDripSequence(INPUT)).resolves.toMatchObject({
            failed: 4,
            failures: expect.arrayContaining([{ key: 'day1_value', error: 'boom' }]),
        })
    })
})

/**
 * FCN W3.8 — la higiene que introduce D1 = A. El coach free entra sin abrir el correo, así que una
 * dirección mal tipeada queda viva recibiendo cuatro correos: cuatro rebotes duros contra la
 * reputación del dominio.
 *
 * LO QUE ESTOS TESTS PROTEGEN es DE DÓNDE sale la señal. Si alguien la vuelve a leer de
 * `auth.users.email_confirmed_at`, bajo D1 = A nace seteada para TODOS y esta higiene no saltaría
 * jamás a nadie: quedaría escrita y muerta (regla 11 del SPEC). La prueba de la casilla es
 * `coaches.email_verified_at`, y acá se pinnea contra esa columna.
 */
describe('cancelDripForUnverifiedCoach (W3.8)', () => {
    const COACH_ID = '11111111-1111-4111-8111-111111111111'
    const NOW = new Date('2026-08-26T12:00:00.000Z')
    const HACE_2_DIAS = '2026-08-24T12:00:00.000Z'
    const HACE_2_HORAS = '2026-08-26T10:00:00.000Z'

    /** Cliente mínimo: `from('coaches').select().eq().maybeSingle()`. */
    function adminWith(result: { data?: unknown; error?: { message: string } }) {
        const maybeSingle = vi.fn(async () => ({ data: result.data ?? null, error: result.error ?? null }))
        const select = vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle })) }))
        return { from: vi.fn(() => ({ select })) } as unknown as SupabaseClient<Database>
    }

    beforeEach(() => {
        vi.clearAllMocks()
        cancelCoachEmailsMock.mockResolvedValue({ cancelled: 3, alreadySent: 1, failed: 0 })
    })

    it('sin `email_verified_at` y pasadas 24 h CANCELA las 4 keys de la serie (y solo esas)', async () => {
        const admin = adminWith({ data: { email_verified_at: null, created_at: HACE_2_DIAS } })

        await expect(cancelDripForUnverifiedCoach(admin, COACH_ID, NOW)).resolves.toEqual({
            cancelled: 3,
            alreadySent: 1,
            failed: 0,
        })
        expect(cancelCoachEmailsMock).toHaveBeenCalledWith(admin, COACH_ID, DRIP_TEMPLATE_KEYS)
        // NUNCA `'*'`: eso se llevaría puesto cualquier otro correo agendado del coach.
        expect(cancelCoachEmailsMock).not.toHaveBeenCalledWith(admin, COACH_ID, '*')
        expect(DRIP_TEMPLATE_KEYS).toEqual(['day1_value', 'day2_pro', 'day7_nutrition', 'day14_last_call'])
    })

    // El salto se decide contra la COLUMNA. Con GoTrue nadie tendría `email_verified_at` en null.
    it('con `email_verified_at` seteado NO cancela nada', async () => {
        const admin = adminWith({
            data: { email_verified_at: '2026-08-25T09:00:00.000Z', created_at: HACE_2_DIAS },
        })

        await expect(cancelDripForUnverifiedCoach(admin, COACH_ID, NOW)).resolves.toEqual({ skipped: 'verified' })
        expect(cancelCoachEmailsMock).not.toHaveBeenCalled()
    })

    it('sin verificar pero dentro de las 24 h todavía no se toca la serie', async () => {
        const admin = adminWith({ data: { email_verified_at: null, created_at: HACE_2_HORAS } })

        await expect(cancelDripForUnverifiedCoach(admin, COACH_ID, NOW)).resolves.toEqual({ skipped: 'too_soon' })
        expect(cancelCoachEmailsMock).not.toHaveBeenCalled()
    })

    // Fail-CLOSED: el error barato es un correo de más; el caro es dejar sin drip a un coach
    // legítimo porque la DB tosió.
    it('si la fila no se puede leer NO cancela (fail-closed) y loguea sin PII', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const admin = adminWith({ error: { message: 'connection reset' } })

        await expect(cancelDripForUnverifiedCoach(admin, COACH_ID, NOW)).resolves.toEqual({ skipped: 'unreadable' })
        expect(cancelCoachEmailsMock).not.toHaveBeenCalled()
        expect(JSON.stringify(warn.mock.calls)).not.toContain('@')
    })

    it('coach inexistente: nada que cancelar', async () => {
        const admin = adminWith({ data: null })

        await expect(cancelDripForUnverifiedCoach(admin, COACH_ID, NOW)).resolves.toEqual({ skipped: 'not_found' })
        expect(cancelCoachEmailsMock).not.toHaveBeenCalled()
    })
})

describe('sweepUnverifiedCoachDrips (W3.8)', () => {
    const NOW = new Date('2026-08-26T12:00:00.000Z')

    /** Cliente mínimo del barrido: `select().is().gte().lt()` resuelve la lista. */
    function adminWithCandidates(result: { data?: Array<{ id: string }>; error?: { message: string } }) {
        const filters = { is: '', gte: '', lt: '' }
        const thenable = {
            data: result.data ?? null,
            error: result.error ?? null,
        }
        const chain = {
            is: vi.fn((col: string) => {
                filters.is = col
                return chain
            }),
            gte: vi.fn((_col: string, value: string) => {
                filters.gte = value
                return chain
            }),
            lt: vi.fn((_col: string, value: string) => {
                filters.lt = value
                return Promise.resolve(thenable)
            }),
        }
        const admin = {
            from: vi.fn(() => ({ select: vi.fn(() => chain) })),
        } as unknown as SupabaseClient<Database>
        return { admin, filters }
    }

    beforeEach(() => {
        vi.clearAllMocks()
        cancelCoachEmailsMock.mockResolvedValue({ cancelled: 2, alreadySent: 0, failed: 0 })
    })

    it('barre a los candidatos y suma el resultado de cada cancelación', async () => {
        const { admin, filters } = adminWithCandidates({ data: [{ id: 'a' }, { id: 'b' }] })

        await expect(sweepUnverifiedCoachDrips(admin, NOW)).resolves.toEqual({
            candidates: 2,
            cancelled: 4,
            alreadySent: 0,
            failed: 0,
        })
        // El candidato es «sin la columna probada» y con el alta fuera de la gracia de 24 h.
        expect(filters.is).toBe('email_verified_at')
        expect(filters.lt).toBe('2026-08-25T12:00:00.000Z')
        expect(filters.gte).toBe('2026-07-27T12:00:00.000Z')
        expect(cancelCoachEmailsMock).toHaveBeenCalledTimes(2)
    })

    it('si la lista falla el barrido no cancela nada y devuelve ceros', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        const { admin } = adminWithCandidates({ error: { message: 'timeout' } })

        await expect(sweepUnverifiedCoachDrips(admin, NOW)).resolves.toEqual({
            candidates: 0,
            cancelled: 0,
            alreadySent: 0,
            failed: 0,
        })
        expect(cancelCoachEmailsMock).not.toHaveBeenCalled()
    })
})
