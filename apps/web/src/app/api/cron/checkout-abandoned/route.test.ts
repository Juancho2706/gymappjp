import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Cron `checkout-abandoned` — el último hueco del embudo: el coach llegó a la pasarela y no pagó.
 *
 * Lo que se pinnea acá:
 *  · el predicado de candidatos (`pending` con más de 2 h, dentro del lookback);
 *  · el descarte por COBRO REAL posterior (`authorized`/`approved`) y —crítico— que un evento
 *    `active` posterior (el `activate-free` del coach que se pasó a Free) NO apague el caso;
 *  · el guard de «hoy está pagando» y el de organización;
 *  · la exclusión de cuentas de prueba;
 *  · que la fila del ledger sea el ÚNICO token de dedupe: deduplicado ⇒ ni correo repetido ni
 *    evento repetido en PostHog;
 *  · la honestidad del copy: un coach bloqueado en `pending_payment` NO lee «tu cuenta ya está activa»;
 *  · el dry-run y que el resumen `cron.checkout_abandoned_ran` se escriba SIEMPRE.
 */

type EventRow = {
    coach_id: string
    created_at: string
    provider: string
    provider_status: string
}

type CoachRow = {
    id: string
    slug: string
    full_name: string | null
    subscription_tier: string | null
    subscription_status: string | null
    active_org_id: string | null
}

let events: EventRow[] = []
let coaches: CoachRow[] = []
let emailByCoachId: Record<string, string | null> = {}
const auditInserts: Array<Record<string, unknown>> = []
/** Secuencia de métodos del builder de `subscription_events`: `.order` DEBE ir antes del `.range`. */
const eventOps: string[] = []

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
            if (table === 'subscription_events') {
                return {
                    select: () => {
                        const f: {
                            statusEq?: string
                            statusIn?: string[]
                            coachIn?: string[]
                            since?: string
                            before?: string
                        } = {}
                        const chain: Record<string, unknown> = {}
                        Object.assign(chain, {
                            eq: (col: string, value: string) => {
                                eventOps.push('eq')
                                if (col === 'provider_status') f.statusEq = value
                                return chain
                            },
                            in: (col: string, value: string[]) => {
                                eventOps.push('in')
                                if (col === 'provider_status') f.statusIn = value
                                if (col === 'coach_id') f.coachIn = value
                                return chain
                            },
                            gte: (col: string, value: string) => {
                                eventOps.push('gte')
                                if (col === 'created_at') f.since = value
                                return chain
                            },
                            lt: (col: string, value: string) => {
                                eventOps.push('lt')
                                if (col === 'created_at') f.before = value
                                return chain
                            },
                            order: () => {
                                eventOps.push('order')
                                return chain
                            },
                            range: async (from: number) => {
                                eventOps.push('range')
                                const rows = events
                                    .filter((e) => !f.statusEq || e.provider_status === f.statusEq)
                                    .filter((e) => !f.statusIn || f.statusIn.includes(e.provider_status))
                                    .filter((e) => !f.coachIn || f.coachIn.includes(e.coach_id))
                                    .filter((e) => !f.since || e.created_at >= f.since)
                                    .filter((e) => !f.before || e.created_at < f.before)
                                    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
                                return { data: from === 0 ? rows : [], error: null }
                            },
                        })
                        return chain
                    },
                }
            }
            if (table === 'coaches') {
                return {
                    select: () => {
                        let ids: string[] = []
                        const chain: Record<string, unknown> = {}
                        Object.assign(chain, {
                            in: (col: string, value: string[]) => {
                                if (col === 'id') ids = value
                                return chain
                            },
                            order: () => chain,
                            range: async (from: number) => ({
                                data: from === 0 ? coaches.filter((c) => ids.includes(c.id)) : [],
                                error: null,
                            }),
                        })
                        return chain
                    },
                }
            }
            if (table === 'admin_audit_logs') {
                return {
                    insert: async (row: Record<string, unknown>) => {
                        auditInserts.push(row)
                        return { error: null }
                    },
                }
            }
            return {}
        },
    }
}

let fakeAdmin = makeAdmin()
vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: () => fakeAdmin }))

// Ledger de correos (dedupe + Resend). Controlado: es el token de dedupe de TODO el tratamiento.
type ScheduleInput = {
    coachId: string
    templateKey: string
    trigger: string
    to: string
    subject: string
    html: string
    payload?: Record<string, unknown>
}
type ScheduleOutcome =
    | { ok: true; deduped: false; ledgerId: string | null; providerMessageId: string | null }
    | { ok: true; deduped: true; ledgerId: string | null; providerMessageId: null }
    | { ok: false; reason: 'send_failed'; error: string }

let nextScheduleOutcome: ScheduleOutcome = {
    ok: true,
    deduped: false,
    ledgerId: 'led-1',
    providerMessageId: 'msg-1',
}
const scheduleCoachEmail = vi.fn(async (admin: unknown, input: ScheduleInput) => {
    void admin
    void input
    return nextScheduleOutcome
})
vi.mock('@/services/email/coach-email-ledger.service', () => ({
    scheduleCoachEmail: (...a: unknown[]) => scheduleCoachEmail(a[0], a[1] as ScheduleInput),
}))

// PostHog server-side — sin red.
const capturePostHogServerEvent = vi.fn(async (input: unknown) => {
    void input
})
vi.mock('@/lib/posthog/server-capture', () => ({
    capturePostHogServerEvent: (...a: unknown[]) => capturePostHogServerEvent(a[0]),
}))

import { GET } from './route'

const SECRET = 'cron-sekret'
const authedReq = (query = '') =>
    new Request(`https://eva/api/cron/checkout-abandoned${query}`, {
        headers: { authorization: `Bearer ${SECRET}` },
    })

const HOUR = 60 * 60 * 1000
const hoursAgo = (h: number) => new Date(Date.now() - h * HOUR).toISOString()

function coach(overrides: Partial<CoachRow> & { id: string }): CoachRow {
    return {
        slug: overrides.id,
        full_name: 'Ana Coach',
        subscription_tier: 'free',
        subscription_status: 'active',
        active_org_id: null,
        ...overrides,
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    events = []
    coaches = []
    emailByCoachId = {}
    auditInserts.length = 0
    eventOps.length = 0
    nextScheduleOutcome = { ok: true, deduped: false, ledgerId: 'led-1', providerMessageId: 'msg-1' }
    fakeAdmin = makeAdmin()
    vi.stubEnv('CRON_SECRET', SECRET)
    vi.stubEnv('CHECKOUT_ABANDONED_SEND_SPACING_MS', '0')
})
afterEach(() => vi.unstubAllEnvs())

describe('GET /api/cron/checkout-abandoned — auth', () => {
    it('sin CRON_SECRET en el env → 401', async () => {
        vi.stubEnv('CRON_SECRET', '')
        expect((await GET(authedReq())).status).toBe(401)
    })

    it('Authorization incorrecto → 401', async () => {
        const res = await GET(
            new Request('https://eva/api/cron/checkout-abandoned', {
                headers: { authorization: 'Bearer malo' },
            })
        )
        expect(res.status).toBe(401)
    })
})

describe('GET /api/cron/checkout-abandoned — detección', () => {
    it('pending de hace 3 h sin cobro posterior → correo + evento server-side (caso ljfitness)', async () => {
        events = [
            { coach_id: 'c1', created_at: hoursAgo(3), provider: 'mercadopago', provider_status: 'pending' },
        ]
        coaches = [coach({ id: 'c1', slug: 'ljfitness', subscription_status: 'pending_payment', subscription_tier: 'pro' })]
        emailByCoachId = { c1: 'lj@gimnasio.cl' }

        const json = await (await GET(authedReq())).json()
        expect(json).toMatchObject({ ok: true, candidates: 1, notified: 1, errors: 0 })

        expect(scheduleCoachEmail).toHaveBeenCalledTimes(1)
        const input = scheduleCoachEmail.mock.calls[0][1]
        expect(input).toMatchObject({
            coachId: 'c1',
            templateKey: 'checkout_abandoned',
            trigger: 'behavior',
            to: 'lj@gimnasio.cl',
            subject: 'Tu plan Pro quedó a un paso',
        })

        expect(capturePostHogServerEvent).toHaveBeenCalledTimes(1)
        expect(capturePostHogServerEvent).toHaveBeenCalledWith({
            event: 'checkout_abandoned_at_gateway',
            distinctId: 'c1',
            properties: expect.objectContaining({
                gateway: 'mercadopago',
                tier: 'pro',
                coach_status: 'pending_payment',
                hours_since_checkout: 3,
                source: 'cron',
            }),
        })
    })

    it('pending de hace 1 h → todavía puede estar pagando: ni correo ni evento', async () => {
        events = [
            { coach_id: 'c1', created_at: hoursAgo(1), provider: 'mercadopago', provider_status: 'pending' },
        ]
        coaches = [coach({ id: 'c1' })]
        emailByCoachId = { c1: 'a@b.cl' }

        const json = await (await GET(authedReq())).json()
        expect(json).toMatchObject({ candidates: 0, notified: 0 })
        expect(scheduleCoachEmail).not.toHaveBeenCalled()
        expect(capturePostHogServerEvent).not.toHaveBeenCalled()
    })

    it('pending fuera del lookback (10 días) → no se recupera un checkout viejo', async () => {
        events = [
            { coach_id: 'c1', created_at: hoursAgo(24 * 10), provider: 'mercadopago', provider_status: 'pending' },
        ]
        coaches = [coach({ id: 'c1' })]
        emailByCoachId = { c1: 'a@b.cl' }

        const json = await (await GET(authedReq())).json()
        expect(json).toMatchObject({ candidates: 0, notified: 0 })
    })

    it('el `.order` va ANTES del `.range` en la query paginada', async () => {
        events = [
            { coach_id: 'c1', created_at: hoursAgo(3), provider: 'mercadopago', provider_status: 'pending' },
        ]
        coaches = [coach({ id: 'c1' })]
        emailByCoachId = { c1: 'a@b.cl' }

        await GET(authedReq())
        expect(eventOps.indexOf('order')).toBeLessThan(eventOps.indexOf('range'))
    })
})

describe('GET /api/cron/checkout-abandoned — descartes', () => {
    it("evento `authorized` POSTERIOR al pending → pagó: no se le escribe", async () => {
        events = [
            { coach_id: 'c1', created_at: hoursAgo(5), provider: 'mercadopago', provider_status: 'pending' },
            { coach_id: 'c1', created_at: hoursAgo(4), provider: 'mercadopago', provider_status: 'authorized' },
        ]
        coaches = [coach({ id: 'c1', subscription_tier: 'pro' })]
        emailByCoachId = { c1: 'a@b.cl' }

        const json = await (await GET(authedReq())).json()
        expect(json).toMatchObject({ candidates: 0, notified: 0 })
        expect(scheduleCoachEmail).not.toHaveBeenCalled()
    })

    it("evento `active` posterior (activate-free) NO apaga el caso: abandonó igual (caso nexo-performance)", async () => {
        events = [
            { coach_id: 'c2', created_at: hoursAgo(6), provider: 'mercadopago', provider_status: 'pending' },
            { coach_id: 'c2', created_at: hoursAgo(6), provider: 'mercadopago', provider_status: 'active' },
        ]
        coaches = [coach({ id: 'c2', slug: 'nexo-performance', subscription_tier: 'free', subscription_status: 'active' })]
        emailByCoachId = { c2: 'nexo@perf.cl' }

        const json = await (await GET(authedReq())).json()
        expect(json).toMatchObject({ candidates: 1, notified: 1 })
        expect(capturePostHogServerEvent).toHaveBeenCalledTimes(1)
    })

    it('coach que HOY está en un tier pago activo → skip `paying_now`', async () => {
        events = [
            { coach_id: 'c3', created_at: hoursAgo(4), provider: 'mercadopago', provider_status: 'pending' },
        ]
        coaches = [coach({ id: 'c3', subscription_tier: 'pro', subscription_status: 'active' })]
        emailByCoachId = { c3: 'a@b.cl' }

        const json = await (await GET(authedReq())).json()
        expect(json).toMatchObject({ candidates: 1, notified: 0 })
        expect(json.skipped.payingNow).toBe(1)
        expect(scheduleCoachEmail).not.toHaveBeenCalled()
    })

    it('coach dentro de una organización → skip `org_managed`', async () => {
        events = [
            { coach_id: 'c4', created_at: hoursAgo(4), provider: 'mercadopago', provider_status: 'pending' },
        ]
        coaches = [coach({ id: 'c4', active_org_id: 'org-1' })]
        emailByCoachId = { c4: 'a@b.cl' }

        const json = await (await GET(authedReq())).json()
        expect(json.skipped.orgManaged).toBe(1)
        expect(scheduleCoachEmail).not.toHaveBeenCalled()
    })

    it('cuenta de prueba → ni correo ni evento', async () => {
        events = [
            { coach_id: 'c5', created_at: hoursAgo(4), provider: 'mercadopago', provider_status: 'pending' },
        ]
        coaches = [coach({ id: 'c5' })]
        emailByCoachId = { c5: 'qa@evatest.cl' }

        const json = await (await GET(authedReq())).json()
        expect(json.skipped.testAccount).toBe(1)
        expect(scheduleCoachEmail).not.toHaveBeenCalled()
        expect(capturePostHogServerEvent).not.toHaveBeenCalled()
    })

    it('sin correo resoluble → skip, sin evento', async () => {
        events = [
            { coach_id: 'c6', created_at: hoursAgo(4), provider: 'mercadopago', provider_status: 'pending' },
        ]
        coaches = [coach({ id: 'c6' })]
        emailByCoachId = { c6: null }

        const json = await (await GET(authedReq())).json()
        expect(json.skipped.noRecipient).toBe(1)
        expect(capturePostHogServerEvent).not.toHaveBeenCalled()
    })
})

describe('GET /api/cron/checkout-abandoned — dedupe y contrato del evento', () => {
    it('ledger deduplicado → NO se emite el evento otra vez (el abandono se cuenta una sola vez)', async () => {
        nextScheduleOutcome = { ok: true, deduped: true, ledgerId: 'led-viejo', providerMessageId: null }
        events = [
            { coach_id: 'c7', created_at: hoursAgo(4), provider: 'mercadopago', provider_status: 'pending' },
        ]
        coaches = [coach({ id: 'c7' })]
        emailByCoachId = { c7: 'a@b.cl' }

        const json = await (await GET(authedReq())).json()
        expect(json).toMatchObject({ candidates: 1, notified: 0 })
        expect(json.skipped.deduped).toBe(1)
        expect(capturePostHogServerEvent).not.toHaveBeenCalled()
    })

    it('Resend falló → se cuenta y NO se emite el evento (se reintenta la próxima corrida)', async () => {
        nextScheduleOutcome = { ok: false, reason: 'send_failed', error: 'resend 500' }
        events = [
            { coach_id: 'c8', created_at: hoursAgo(4), provider: 'mercadopago', provider_status: 'pending' },
        ]
        coaches = [coach({ id: 'c8' })]
        emailByCoachId = { c8: 'a@b.cl' }

        const json = await (await GET(authedReq())).json()
        expect(json.skipped.sendFailed).toBe(1)
        expect(capturePostHogServerEvent).not.toHaveBeenCalled()
    })
})

describe('GET /api/cron/checkout-abandoned — honestidad del copy', () => {
    it('coach BLOQUEADO en pending_payment: el correo no le dice que su cuenta está activa', async () => {
        events = [
            { coach_id: 'c9', created_at: hoursAgo(4), provider: 'mercadopago', provider_status: 'pending' },
        ]
        coaches = [coach({ id: 'c9', subscription_tier: 'pro', subscription_status: 'pending_payment' })]
        emailByCoachId = { c9: 'a@b.cl' }

        await GET(authedReq())
        const html = scheduleCoachEmail.mock.calls[0][1].html
        expect(html).not.toContain('ya está activa')
        expect(html).toContain('ya está creada')
    })

    it('coach con acceso vivo: sí le dice que su cuenta está activa', async () => {
        events = [
            { coach_id: 'c10', created_at: hoursAgo(4), provider: 'mercadopago', provider_status: 'pending' },
        ]
        coaches = [coach({ id: 'c10', subscription_tier: 'free', subscription_status: 'active' })]
        emailByCoachId = { c10: 'a@b.cl' }

        await GET(authedReq())
        const html = scheduleCoachEmail.mock.calls[0][1].html
        expect(html).toContain('ya está activa')
    })
})

describe('GET /api/cron/checkout-abandoned — dry-run y resumen', () => {
    it('?dry=1 audita sin mandar ni emitir nada', async () => {
        events = [
            { coach_id: 'c11', created_at: hoursAgo(4), provider: 'mercadopago', provider_status: 'pending' },
        ]
        coaches = [coach({ id: 'c11', slug: 'dudoso' })]
        emailByCoachId = { c11: 'a@b.cl' }

        const json = await (await GET(authedReq('?dry=1'))).json()
        expect(json).toMatchObject({ dry: true, candidates: 1, notified: 0 })
        expect(json.wouldNotify).toEqual([{ slug: 'dudoso', hours: 4 }])
        expect(scheduleCoachEmail).not.toHaveBeenCalled()
        expect(capturePostHogServerEvent).not.toHaveBeenCalled()
    })

    it('siempre escribe el resumen de la corrida, aunque no haya candidatos', async () => {
        const json = await (await GET(authedReq())).json()
        expect(json).toMatchObject({ candidates: 0, notified: 0, errors: 0 })
        const summary = auditInserts.find((a) => a.action === 'cron.checkout_abandoned_ran')
        expect(summary).toBeTruthy()
        expect((summary!.payload as Record<string, unknown>).outcome).toBe('ok')
    })
})
