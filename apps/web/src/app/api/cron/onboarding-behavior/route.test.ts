import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Cron `onboarding-behavior` (W6 / F6.1). Lo que se pinnea acá:
 *  · la auth fail-closed por `CRON_SECRET` (molde de `cap-nudge` y `drip-hygiene`);
 *  · **el flag apagado**: `200 {skipped:'disabled'}` y NI UNA lectura — ni siquiera se crea el
 *    cliente de service role. Es la garantía que le permite al owner revisar el copy con el
 *    endpoint ya desplegado;
 *  · **el dry-run**: barre, decide y devuelve `wouldSend`, sin tocar Resend ni el ledger;
 *  · la corrida real: un coach del día 1 sin alumnos recibe UN correo con `trigger: 'behavior'`, la
 *    key `behavior_no_client_2h`, el alta directa (nunca `/join`) y la respuesta a contacto@;
 *  · el corte por env (`ONBOARDING_BEHAVIOR_EMAILS_SINCE`): sin él no entra nadie; `?since=` solo en
 *    ensayo;
 *  · el horario de Chile y el historial compartido (ilegible ⇒ nadie recibe nada);
 *  · la exclusión de cuentas de prueba con el bypass de `qa-free-v3@evatest.cl`;
 *  · el LOG del ensayo: `wouldSendByKey` y `beforeLaunch` en la línea final, que es como el owner
 *    audita el reparto desde Vercel sin llamar al endpoint.
 *
 * ⏱️ RELOJ CONGELADO: el 20-09 a las 12:00 de Chile (dentro de la ventana de 09–20 h), dos semanas
 * después del corte que fija la env en el `beforeEach`.
 */

type CoachRow = {
    id: string
    slug: string
    full_name: string | null
    brand_name: string | null
    persona: string | null
    invite_code: string | null
    created_at: string | null
    active_org_id: string | null
    primary_color: string | null
    subscription_tier: string | null
}

type ClientRow = { created_at: string | null; first_login_at: string | null }

let coaches: CoachRow[] = []
let clientsByCoach: Record<string, ClientRow[]> = {}
let emailByCoachId: Record<string, string | null> = {}

const {
    scheduleCoachEmailMock,
    findActiveByCoachAndKeysMock,
    loadAutomatedEmailHistoryMock,
    resolveFirstArtifactMock,
    serviceClient,
} = vi.hoisted(() => ({
    scheduleCoachEmailMock: vi.fn(),
    findActiveByCoachAndKeysMock: vi.fn(),
    loadAutomatedEmailHistoryMock: vi.fn(),
    resolveFirstArtifactMock: vi.fn(),
    /** Cuántas veces el endpoint pidió un cliente de service role (0 = no leyó nada). */
    serviceClient: { calls: 0 },
}))

vi.mock('@/services/email/coach-email-ledger.service', () => ({
    scheduleCoachEmail: scheduleCoachEmailMock,
}))

vi.mock('@/infrastructure/db/coach-email-ledger.repository', () => ({
    findActiveByCoachAndKeys: findActiveByCoachAndKeysMock,
}))

vi.mock('@/services/email/automated-email-history.service', () => ({
    loadAutomatedEmailHistory: loadAutomatedEmailHistoryMock,
}))

vi.mock('@/services/onboarding/onboarding-v2.queries', () => ({
    resolveFirstArtifact: resolveFirstArtifactMock,
}))

/** Historial vacío para cada coach pedido (nadie recibió nada, nadie pidió la baja). */
function emptyHistories(ids: string[]) {
    return new Map(ids.map((id) => [id, { sentAts: [] as string[], ahaAt: null, optedOut: false }]))
}

/**
 * Chain de PostgREST: cualquier filtro devuelve la misma cadena, los `eq` se capturan y el `await`
 * resuelve el result que arme `resolve` con esos filtros.
 */
function chain(resolve: (filters: Record<string, unknown>) => { data: unknown; error: { message: string } | null }) {
    const filters: Record<string, unknown> = {}
    const self: Record<string, unknown> = {}
    for (const m of ['select', 'is', 'in', 'gte', 'lt', 'order', 'limit', 'range', 'maybeSingle']) {
        self[m] = vi.fn(() => self)
    }
    self.eq = vi.fn((col: string, value: unknown) => {
        filters[col] = value
        return self
    })
    self.then = (ok: (v: unknown) => unknown, fail: (e: unknown) => unknown) =>
        Promise.resolve(resolve(filters)).then(ok, fail)
    return self
}

function makeAdmin() {
    return {
        auth: {
            admin: {
                getUserById: async (id: string) => ({
                    data: { user: { id, email: emailByCoachId[id] ?? null } },
                    error: null,
                }),
            },
        },
        from: (table: string) => {
            if (table === 'coaches') return chain(() => ({ data: coaches, error: null }))
            if (table === 'clients') {
                // El roster se pide por coach: sale del `eq('coach_id', …)` de esa misma llamada.
                return chain((f) => ({
                    data: clientsByCoach[String(f.coach_id)] ?? [],
                    error: null,
                }))
            }
            // `workout_logs` / `nutrition_intake_entries`: sin actividad de alumno real.
            return chain(() => ({ data: [], error: null }))
        },
    }
}

let fakeAdmin = makeAdmin()
vi.mock('@/lib/supabase/admin-client', () => ({
    createServiceRoleClient: () => {
        serviceClient.calls += 1
        return fakeAdmin
    },
}))

import { GET } from './route'

const SECRET = 'cron-sekret'
const HOUR = 60 * 60 * 1000
/** 20-09 a las 12:00 de Chile (UTC−3): dentro del horario y dos semanas después del corte. */
const NOW = new Date('2026-09-20T15:00:00.000Z')
const LAUNCH = '2026-09-06T00:00:00Z'
const hoursAgo = (h: number) => new Date(Date.now() - h * HOUR).toISOString()

const req = (query = '') =>
    new Request(`https://eva/api/cron/onboarding-behavior${query}`, {
        headers: { authorization: `Bearer ${SECRET}` },
    })

function coach(overrides: Partial<CoachRow> & { id: string }): CoachRow {
    return {
        slug: overrides.id,
        full_name: 'Ana Coach',
        brand_name: 'Studio Ana',
        persona: 'strength',
        invite_code: 'X5UD9X44',
        created_at: hoursAgo(21),
        active_org_id: null,
        primary_color: '#7C3AED',
        subscription_tier: 'free',
        ...overrides,
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    // Solo `Date`: el barrido no usa timers (el espaciado de Resend va en 0 por env) y fingir
    // `setTimeout` acá solo agregaría formas de colgar el test.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
    coaches = []
    clientsByCoach = {}
    emailByCoachId = {}
    serviceClient.calls = 0
    fakeAdmin = makeAdmin()
    findActiveByCoachAndKeysMock.mockResolvedValue([])
    loadAutomatedEmailHistoryMock.mockImplementation(async (_admin: unknown, ids: string[]) => emptyHistories(ids))
    resolveFirstArtifactMock.mockResolvedValue(false)
    scheduleCoachEmailMock.mockResolvedValue({
        ok: true,
        deduped: false,
        ledgerId: 'led-1',
        providerMessageId: 'msg-1',
    })
    vi.stubEnv('CRON_SECRET', SECRET)
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.eva-app.cl')
    vi.stubEnv('ONBOARDING_BEHAVIOR_SEND_SPACING_MS', '0')
    vi.stubEnv('ONBOARDING_BEHAVIOR_EMAILS_ENABLED', 'true')
    vi.stubEnv('ONBOARDING_BEHAVIOR_EMAILS_DRY_RUN', '')
    vi.stubEnv('ONBOARDING_BEHAVIOR_EMAILS_SINCE', LAUNCH)
    vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
})

describe('auth', () => {
    it('sin CRON_SECRET en el env → 401', async () => {
        vi.stubEnv('CRON_SECRET', '')
        expect((await GET(req())).status).toBe(401)
    })

    it('Authorization incorrecto → 401', async () => {
        const res = await GET(
            new Request('https://eva/api/cron/onboarding-behavior', {
                headers: { authorization: 'Bearer malo' },
            })
        )
        expect(res.status).toBe(401)
    })
})

describe('flag apagado', () => {
    // El owner revisa el copy antes de encender: apagado tiene que significar apagado de verdad,
    // no «corre y no manda».
    it('sin ONBOARDING_BEHAVIOR_EMAILS_ENABLED → 200 {skipped:"disabled"} y CERO trabajo', async () => {
        vi.stubEnv('ONBOARDING_BEHAVIOR_EMAILS_ENABLED', '')
        coaches = [coach({ id: 'c1' })]
        emailByCoachId = { c1: 'ana@gym.cl' }

        const res = await GET(req())
        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true, skipped: 'disabled' })
        // Ni el cliente de service role se crea: no hay ninguna lectura de la base.
        expect(serviceClient.calls).toBe(0)
        expect(scheduleCoachEmailMock).not.toHaveBeenCalled()
    })

    it('un valor distinto de «true» sigue apagado (fail-closed)', async () => {
        vi.stubEnv('ONBOARDING_BEHAVIOR_EMAILS_ENABLED', '1')
        const json = await (await GET(req())).json()
        expect(json).toEqual({ ok: true, skipped: 'disabled' })
    })
})

describe('corrida real', () => {
    it('coach del día 1 sin alumnos → UN correo `behavior_no_client_2h` con trigger behavior', async () => {
        coaches = [coach({ id: 'c1', slug: 'ana-fit' })]
        emailByCoachId = { c1: 'ana@gym.cl' }

        const json = await (await GET(req())).json()

        expect(json).toMatchObject({ ok: true, dry: false, candidates: 1, sent: 1, errors: 0 })
        expect(scheduleCoachEmailMock).toHaveBeenCalledTimes(1)
        const [, arg] = scheduleCoachEmailMock.mock.calls[0]
        expect(arg.templateKey).toBe('behavior_no_client_2h')
        expect(arg.trigger).toBe('behavior')
        expect(arg.to).toBe('ana@gym.cl')
        expect(arg.subject.length).toBeGreaterThan(0)
        // Alta directa, nunca `/join` (desde el 21-08 deja una solicitud, no un alumno).
        expect(arg.html).toContain('/coach/clients?invite=1')
        expect(arg.html).not.toContain('/join/')
        expect(arg.text).toContain('El equipo de EVA')
        expect(arg.replyTo).toBe('contacto@eva-app.cl')
        expect(arg.payload).toMatchObject({ reason: 'no_real_client_day1', persona: 'strength' })
    })

    it('el día 3 sin rutina lee «armó su primera rutina» y manda el correo de la guía', async () => {
        coaches = [coach({ id: 'c1', created_at: hoursAgo(73) })]
        clientsByCoach = { c1: [{ created_at: hoursAgo(70), first_login_at: hoursAgo(60) }] }
        emailByCoachId = { c1: 'ana@gym.cl' }

        const json = await (await GET(req())).json()
        expect(json.sent).toBe(1)
        expect(resolveFirstArtifactMock).toHaveBeenCalledTimes(1)
        expect(scheduleCoachEmailMock.mock.calls[0][1].templateKey).toBe('behavior_no_return_24h')
    })

    it('antes del día 3 ni siquiera lee «armó su primera rutina» (es caro y no cambia nada)', async () => {
        coaches = [coach({ id: 'c1' })]
        emailByCoachId = { c1: 'ana@gym.cl' }
        await GET(req())
        expect(resolveFirstArtifactMock).not.toHaveBeenCalled()
    })

    it('fuera del horario de Chile no sale nada y se cuenta', async () => {
        vi.setSystemTime(new Date('2026-09-21T02:00:00.000Z')) // 23:00 del 20-09 en Chile
        coaches = [coach({ id: 'c1' })]
        emailByCoachId = { c1: 'ana@gym.cl' }

        const json = await (await GET(req())).json()
        expect(json.sent).toBe(0)
        expect(json.skipped.outside_hours).toBe(1)
        expect(scheduleCoachEmailMock).not.toHaveBeenCalled()
    })

    it('historial de correos ilegible → nadie recibe nada (fail-closed)', async () => {
        loadAutomatedEmailHistoryMock.mockRejectedValue(new Error('db caída'))
        vi.spyOn(console, 'error').mockImplementation(() => {})
        coaches = [coach({ id: 'c1' })]
        emailByCoachId = { c1: 'ana@gym.cl' }

        const json = await (await GET(req())).json()
        expect(json.sent).toBe(0)
        expect(json.skipped.history_unreadable).toBe(1)
    })

    it('con la marca de baja no recibe nada', async () => {
        loadAutomatedEmailHistoryMock.mockImplementation(
            async (_admin: unknown, ids: string[]) =>
                new Map(ids.map((id) => [id, { sentAts: [], ahaAt: null, optedOut: true }]))
        )
        coaches = [coach({ id: 'c1' })]
        emailByCoachId = { c1: 'ana@gym.cl' }

        const json = await (await GET(req())).json()
        expect(json.sent).toBe(0)
        expect(json.skipped.opted_out).toBe(1)
    })

    it('el dedupe del ledger deja al coach sin correo', async () => {
        coaches = [coach({ id: 'c1' })]
        emailByCoachId = { c1: 'ana@gym.cl' }
        findActiveByCoachAndKeysMock.mockResolvedValue([{ template_key: 'behavior_no_client_2h' }])

        const json = await (await GET(req())).json()
        expect(json).toMatchObject({ sent: 0 })
        expect(json.skipped.no_trigger).toBe(1)
        expect(scheduleCoachEmailMock).not.toHaveBeenCalled()
    })

    it('cuenta de prueba fuera; `qa-free-v3@evatest.cl` adentro (bypass de QA)', async () => {
        coaches = [coach({ id: 'test1' }), coach({ id: 'qa1' })]
        emailByCoachId = { test1: 'otro@evatest.cl', qa1: 'qa-free-v3@evatest.cl' }

        const json = await (await GET(req())).json()
        expect(json.skipped.test_account).toBe(1)
        expect(json.sent).toBe(1)
        expect(scheduleCoachEmailMock.mock.calls[0][1].to).toBe('qa-free-v3@evatest.cl')
    })
})

describe('corte de lanzamiento por env', () => {
    it('sin ONBOARDING_BEHAVIOR_EMAILS_SINCE no entra nadie (fail-closed)', async () => {
        vi.stubEnv('ONBOARDING_BEHAVIOR_EMAILS_SINCE', '')
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        coaches = [coach({ id: 'c1' })]
        emailByCoachId = { c1: 'ana@gym.cl' }

        const json = await (await GET(req())).json()
        expect(json).toMatchObject({ candidates: 0, sent: 0, since: null })
        expect(scheduleCoachEmailMock).not.toHaveBeenCalled()
    })

    it('`?since=` solo vale en ensayo: audita otra cohorte sin mandar', async () => {
        vi.stubEnv('ONBOARDING_BEHAVIOR_EMAILS_SINCE', '')
        vi.spyOn(console, 'warn').mockImplementation(() => {})
        coaches = [coach({ id: 'c1' })]
        emailByCoachId = { c1: 'ana@gym.cl' }

        const dry = await (await GET(req('?dry=1&since=2026-09-06T00:00:00Z'))).json()
        expect(dry).toMatchObject({ dry: true, since: '2026-09-06T00:00:00Z' })
        expect(dry.wouldSend).toHaveLength(1)

        // Sin `dry`, el `since` de la URL se ignora: un envío real nunca se salta la env.
        const real = await (await GET(req('?since=2026-09-06T00:00:00Z'))).json()
        expect(real).toMatchObject({ dry: false, since: null, sent: 0 })
        expect(scheduleCoachEmailMock).not.toHaveBeenCalled()
    })
})

describe('dry run', () => {
    it('con ONBOARDING_BEHAVIOR_EMAILS_DRY_RUN=true calcula y NO envía', async () => {
        vi.stubEnv('ONBOARDING_BEHAVIOR_EMAILS_DRY_RUN', 'true')
        coaches = [coach({ id: 'c1', slug: 'ana-fit' })]
        emailByCoachId = { c1: 'ana@gym.cl' }

        const json = await (await GET(req())).json()

        expect(json).toMatchObject({ ok: true, dry: true, candidates: 1, sent: 0 })
        expect(json.wouldSend).toEqual([
            { slug: 'ana-fit', key: 'behavior_no_client_2h', reason: 'no_real_client_day1' },
        ])
        expect(scheduleCoachEmailMock).not.toHaveBeenCalled()
    })

    it('`?dry=1` hace lo mismo sin tocar el env', async () => {
        coaches = [coach({ id: 'c1' })]
        emailByCoachId = { c1: 'ana@gym.cl' }

        const json = await (await GET(req('?dry=1'))).json()
        expect(json).toMatchObject({ dry: true, sent: 0 })
        expect(json.wouldSend).toHaveLength(1)
        expect(scheduleCoachEmailMock).not.toHaveBeenCalled()
    })

    // El ensayo del 06-09 se auditó leyendo el log del cron en Vercel. Sin el reparto por key en esa
    // línea hay que llamar al endpoint a mano para saber QUÉ correo saldría y cuántas veces.
    it('el resumen y el log traen `wouldSendByKey` y los frenados por el corte de lanzamiento', async () => {
        coaches = [
            coach({ id: 'c1', slug: 'ana-fit' }),
            coach({ id: 'c2', slug: 'beto-fit' }),
            // Coach de agosto, anterior al corte de la env. En producción el barrido ni lo
            // lee (el `since` de `listBehaviorCandidates` ya lo filtra); el contador existe por el
            // disparo EN LÍNEA, que carga al coach por id y no pasa por esa ventana.
            coach({ id: 'c3', slug: 'viejo-fit', created_at: '2026-08-20T10:00:00.000Z' }),
        ]
        emailByCoachId = { c1: 'ana@gym.cl', c2: 'beto@gym.cl', c3: 'viejo@gym.cl' }

        const json = await (await GET(req('?dry=1'))).json()

        expect(json.wouldSendByKey).toEqual({ behavior_no_client_2h: 2 })
        expect(json.skipped.before_launch).toBe(1)

        // `spyOn` sobre un método ya espiado devuelve el MISMO spy que armó el `beforeEach`, así que
        // esto lee sus llamadas sin tocar `console.info` de frente (que la regla `no-console` marca).
        const line = vi
            .spyOn(console, 'info')
            .mock.calls.map((args) => String(args[0]))
            .find((msg) => msg.includes('[cron/onboarding-behavior] done'))
        expect(line).toContain('wouldSendByKey={"behavior_no_client_2h":2}')
        expect(line).toContain('beforeLaunch=1')
    })
})
