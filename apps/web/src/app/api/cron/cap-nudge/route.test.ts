import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Cron cap-nudge: barrido diario de coaches free que YA están en su cupo. El correo de venta por
// cupo existía y se había enviado 0 veces (solo disparaba en el rechazo 402). Acá se pinnea: el
// predicado de candidatos, el conteo con el MISMO filtro que el gate 402, la escalera anti-spam,
// la exclusión de cuentas de prueba, el dry-run, el fail-open POR COACH (Resend caído no tumba la
// corrida), el fail-CLOSED del ledger (sin escalera no se manda nada) y que el resumen
// `cron.cap_nudge_ran` se escriba SIEMPRE, incluso cuando la corrida aborta.

type LedgerRow = { action: string; target_id: string; created_at: string; payload: Record<string, unknown> }

let coaches: Array<Record<string, unknown>> = []
let coachesError: { message: string } | null = null
let clientRows: Array<{ coach_id: string }> = []
let ledgerRows: LedgerRow[] = []
let ledgerError: { message: string } | null = null
let summaryInsertThrows = false
let getUserByIdThrowsFor: string | null = null
const throwOnSendFor = new Set<string>()
const auditInserts: Array<Record<string, unknown>> = []
const coachFilters: Array<{ method: string; column: string; value: unknown }> = []
const clientFilters: Array<{ method: string; column: string; value: unknown }> = []
/** Secuencia de llamadas del builder de `clients`: pinnea que el `.order` va ANTES del `.range`. */
const clientOps: string[] = []
let emailByCoachId: Record<string, string | null> = {}

const CLIENT_LIMIT_ACTION = 'coach.sales_email_client_limit_reached'
const SUMMARY_ACTION = 'cron.cap_nudge_ran'

function makeAdmin() {
    return {
        auth: {
            admin: {
                getUserById: async (id: string) => {
                    if (getUserByIdThrowsFor === id) throw new Error('gotrue 503')
                    return {
                        data: { user: { id, email: emailByCoachId[id] ?? null } },
                        error: null,
                    }
                },
            },
        },
        from: (table: string) => {
            if (table === 'coaches') {
                return {
                    select: () => {
                        const chain: Record<string, unknown> = {}
                        const record = (method: string) => (column: string, value: unknown) => {
                            coachFilters.push({ method, column, value })
                            return chain
                        }
                        Object.assign(chain, {
                            in: record('in'),
                            eq: record('eq'),
                            is: record('is'),
                            order: record('order'),
                            // PostgREST pagina: solo la primera página trae filas en el fake.
                            range: async (from: number) => ({
                                data: from === 0 ? coaches : [],
                                error: coachesError,
                            }),
                        })
                        return chain
                    },
                }
            }
            if (table === 'clients') {
                return {
                    select: () => {
                        const chain: Record<string, unknown> = {}
                        const record = (method: string) => (column: string, value: unknown) => {
                            clientFilters.push({ method, column, value })
                            clientOps.push(method)
                            return chain
                        }
                        Object.assign(chain, {
                            in: record('in'),
                            eq: record('eq'),
                            is: record('is'),
                            order: record('order'),
                            range: async (from: number) => {
                                clientOps.push('range')
                                return { data: from === 0 ? clientRows : [], error: null }
                            },
                        })
                        return chain
                    },
                }
            }
            if (table === 'admin_audit_logs') {
                return {
                    // Lectura del ledger: la usan TANTO el cron (in target_id + range) como el
                    // cooldown del service (eq target_id + limit, awaiteando la cadena), así que el
                    // fake filtra de verdad y soporta las dos formas de terminar la query.
                    select: () => {
                        const filters: {
                            action?: string
                            targetEq?: string
                            targetIn?: string[]
                            since?: string
                        } = {}
                        const chain: Record<string, unknown> = {}
                        const matching = () =>
                            ledgerRows
                                .filter((r) => !filters.action || r.action === filters.action)
                                .filter((r) => !filters.targetEq || r.target_id === filters.targetEq)
                                .filter((r) => !filters.targetIn || filters.targetIn.includes(r.target_id))
                                .filter((r) => !filters.since || r.created_at >= filters.since)
                                .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
                                .map((r) => ({
                                    target_id: r.target_id,
                                    created_at: r.created_at,
                                    payload: r.payload,
                                }))
                        Object.assign(chain, {
                            eq: (column: string, value: string) => {
                                if (column === 'action') filters.action = value
                                if (column === 'target_id') filters.targetEq = value
                                return chain
                            },
                            in: (column: string, value: string[]) => {
                                if (column === 'target_id') filters.targetIn = value
                                return chain
                            },
                            gte: (column: string, value: string) => {
                                if (column === 'created_at') filters.since = value
                                return chain
                            },
                            order: () => chain,
                            limit: () => chain,
                            range: async (from: number) => ({
                                data: ledgerError ? null : from === 0 ? matching() : [],
                                error: ledgerError,
                            }),
                            then: (resolve: (v: { data: unknown; error: unknown }) => unknown) =>
                                resolve({ data: ledgerError ? null : matching(), error: ledgerError }),
                        })
                        return chain
                    },
                    insert: async (row: Record<string, unknown>) => {
                        if (summaryInsertThrows && row.action === SUMMARY_ACTION) {
                            throw new Error('audit insert boom')
                        }
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

const sendTransactionalEmail = vi.fn(async (..._a: unknown[]) => ({
    ok: true,
    providerMessageId: 'msg_1',
}) as { ok: boolean; providerMessageId?: string | null; error?: string })
vi.mock('@/lib/email/send-email', () => ({
    sendTransactionalEmail: (...a: unknown[]) => sendTransactionalEmail(...a),
}))

// El service real se usa tal cual (copy, ledger y outcomes son parte de lo que se pinnea acá); solo
// se envuelve `sendClientLimitReachedEmail` para poder hacerlo LANZAR en un coach concreto. Es la
// única forma de ejercitar el `catch` por coach de la ruta: ni `resolveCoachEmail` ni
// `sendSalesEmailOnce` lanzan jamás (ambos documentan «nunca lanza» y devuelven null/outcome).
vi.mock('@/services/billing/sales-emails.service', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/services/billing/sales-emails.service')>()
    type Args = Parameters<typeof actual.sendClientLimitReachedEmail>
    return {
        ...actual,
        sendClientLimitReachedEmail: (admin: Args[0], input: Args[1]) => {
            if (throwOnSendFor.has(input.coachId)) return Promise.reject(new Error('resend timeout'))
            return actual.sendClientLimitReachedEmail(admin, input)
        },
    }
})

import { GET } from './route'

const SECRET = 'cron-sekret'
const url = (qs = '') => `https://eva/api/cron/cap-nudge${qs}`
const authedReq = (qs = '') =>
    new Request(url(qs), { headers: { authorization: `Bearer ${SECRET}` } })

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString()
const summaryPayload = () =>
    auditInserts.find((a) => a.action === SUMMARY_ACTION)?.payload as Record<string, unknown> | undefined

/** Coach free activo, creado post-v3 (cupo de catálogo = 1) salvo que se pise `created_at`. */
function freeCoach(over: Record<string, unknown> = {}) {
    return {
        id: 'c1',
        slug: 'coach-lleno',
        full_name: 'Coach Lleno',
        created_at: '2026-08-21T10:00:00Z',
        subscription_tier: 'free',
        subscription_status: 'active',
        max_clients: 1,
        ...over,
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    auditInserts.length = 0
    coachFilters.length = 0
    clientFilters.length = 0
    clientOps.length = 0
    coaches = []
    coachesError = null
    clientRows = []
    ledgerRows = []
    ledgerError = null
    summaryInsertThrows = false
    getUserByIdThrowsFor = null
    throwOnSendFor.clear()
    emailByCoachId = { c1: 'coach@gmail.com' }
    fakeAdmin = makeAdmin()
    vi.stubEnv('CRON_SECRET', SECRET)
    vi.stubEnv('EVA_SALES_EMAILS_DISABLED', '')
    // El throttle real (600 ms entre envíos) no aporta nada en test y alargaría la suite.
    vi.stubEnv('CAP_NUDGE_SEND_SPACING_MS', '0')
})
afterEach(() => vi.unstubAllEnvs())

describe('GET /api/cron/cap-nudge — auth', () => {
    it('sin CRON_SECRET en el env → 401 (fail-closed)', async () => {
        vi.stubEnv('CRON_SECRET', '')
        expect((await GET(authedReq())).status).toBe(401)
    })
    it('Authorization incorrecto → 401', async () => {
        const res = await GET(new Request(url(), { headers: { authorization: 'Bearer malo' } }))
        expect(res.status).toBe(401)
    })
})

describe('GET /api/cron/cap-nudge — barrido', () => {
    it('coach free 1/1 → manda el correo, escribe el ledger y el resumen', async () => {
        coaches = [freeCoach()]
        clientRows = [{ coach_id: 'c1' }]

        const json = await (await GET(authedReq())).json()
        expect(json).toMatchObject({ ok: true, dry: false, candidates: 1, atCap: 1, sent: 1, errors: 0 })
        expect(json.sentTo).toEqual([{ slug: 'coach-lleno', touch: 1 }])
        expect(sendTransactionalEmail).toHaveBeenCalledTimes(1)
        expect(sendTransactionalEmail).toHaveBeenCalledWith(
            expect.objectContaining({ to: 'coach@gmail.com' })
        )

        const ledger = auditInserts.find((a) => a.action === CLIENT_LIMIT_ACTION)
        expect(ledger).toBeDefined()
        expect(ledger!.target_id).toBe('c1')
        expect(ledger!.payload).toMatchObject({ source: 'cron_cap_nudge', current_limit: 1, tier: 'free' })

        expect(summaryPayload()).toMatchObject({
            dry: false,
            outcome: 'ok',
            candidates: 1,
            at_cap: 1,
            sent: 1,
            errors: 0,
        })
    })

    it('copy `sweep` — depende de W1.1/W1.2 (worker A): sin «intentaste» y con utm_source=cap_email', async () => {
        coaches = [freeCoach()]
        clientRows = [{ coach_id: 'c1' }]
        await GET(authedReq())
        const html = (sendTransactionalEmail.mock.calls[0][0] as { html: string }).html
        expect(html).not.toContain('intentaste')
        expect(html).toContain('utm_source=cap_email')
    })

    it('coach free 0/1 → no está en cupo, no manda nada', async () => {
        coaches = [freeCoach()]
        clientRows = []
        const json = await (await GET(authedReq())).json()
        expect(json).toMatchObject({ candidates: 1, atCap: 0, sent: 0 })
        expect(sendTransactionalEmail).not.toHaveBeenCalled()
    })

    it('?dry=1 → cero envíos, lista `wouldSend` y resumen con dry=true', async () => {
        coaches = [freeCoach()]
        clientRows = [{ coach_id: 'c1' }]
        const json = await (await GET(authedReq('?dry=1'))).json()
        expect(json).toMatchObject({ ok: true, dry: true, atCap: 1, sent: 0 })
        expect(json.wouldSend).toEqual([{ slug: 'coach-lleno', touch: 1 }])
        expect(sendTransactionalEmail).not.toHaveBeenCalled()
        expect(auditInserts.some((a) => a.action === CLIENT_LIMIT_ACTION)).toBe(false)
        expect(summaryPayload()).toMatchObject({ dry: true, would_send: 1, outcome: 'ok' })
    })

    it('cuenta de prueba (@evatest.cl) → se excluye del barrido', async () => {
        coaches = [freeCoach()]
        clientRows = [{ coach_id: 'c1' }]
        emailByCoachId = { c1: 'qa-1@evatest.cl' }
        const json = await (await GET(authedReq())).json()
        expect(json).toMatchObject({ atCap: 1, sent: 0 })
        expect(json.skipped).toMatchObject({ testAccount: 1 })
        expect(sendTransactionalEmail).not.toHaveBeenCalled()
    })

    it('coach sin email en GoTrue → skipped.noRecipient y ningún envío', async () => {
        coaches = [freeCoach()]
        clientRows = [{ coach_id: 'c1' }]
        emailByCoachId = { c1: null }
        const json = await (await GET(authedReq())).json()
        expect(json).toMatchObject({ ok: true, atCap: 1, sent: 0, errors: 0 })
        expect(json.skipped).toMatchObject({ noRecipient: 1 })
        expect(sendTransactionalEmail).not.toHaveBeenCalled()
    })

    it('3 envíos previos del MISMO cupo → tope de la escalera, silencio', async () => {
        coaches = [freeCoach()]
        clientRows = [{ coach_id: 'c1' }]
        ledgerRows = [60, 40, 30].map((d) => ({
            action: CLIENT_LIMIT_ACTION,
            target_id: 'c1',
            created_at: daysAgo(d),
            payload: { current_limit: 1, source: 'cron_cap_nudge' },
        }))
        const json = await (await GET(authedReq())).json()
        expect(json).toMatchObject({ atCap: 1, sent: 0 })
        expect(json.skipped).toMatchObject({ maxTouches: 1 })
        expect(sendTransactionalEmail).not.toHaveBeenCalled()
    })

    it('1 envío previo hace 2 días → ladderNotDue (el peldaño 2 recién a los 7 días)', async () => {
        coaches = [freeCoach()]
        clientRows = [{ coach_id: 'c1' }]
        ledgerRows = [
            {
                action: CLIENT_LIMIT_ACTION,
                target_id: 'c1',
                created_at: daysAgo(2),
                payload: { current_limit: 1, source: 'cron_cap_nudge' },
            },
        ]
        const json = await (await GET(authedReq())).json()
        expect(json).toMatchObject({ ok: true, atCap: 1, sent: 0 })
        expect(json.skipped).toMatchObject({ ladderNotDue: 1 })
        expect(sendTransactionalEmail).not.toHaveBeenCalled()
        expect(summaryPayload()).toMatchObject({ skipped: expect.objectContaining({ ladder_not_due: 1 }) })
    })

    it('Resend devuelve ok:false → cuenta como failed y la corrida sigue en 200', async () => {
        coaches = [freeCoach(), freeCoach({ id: 'c2', slug: 'coach-dos' })]
        clientRows = [{ coach_id: 'c1' }, { coach_id: 'c2' }]
        emailByCoachId = { c1: 'coach@gmail.com', c2: 'dos@gmail.com' }
        sendTransactionalEmail.mockImplementationOnce(async () => ({ ok: false, error: 'resend 500' }))

        const res = await GET(authedReq())
        const json = await res.json()
        expect(res.status).toBe(200)
        expect(json).toMatchObject({ ok: true, atCap: 2, sent: 1, errors: 0 })
        expect(json.skipped).toMatchObject({ failed: 1 })
    })

    it('una excepción en el envío de un coach → errors:1, el resto igual recibe y el resumen lo refleja', async () => {
        coaches = [freeCoach(), freeCoach({ id: 'c2', slug: 'coach-dos' })]
        clientRows = [{ coach_id: 'c1' }, { coach_id: 'c2' }]
        emailByCoachId = { c1: 'coach@gmail.com', c2: 'dos@gmail.com' }
        throwOnSendFor.add('c1')

        const res = await GET(authedReq())
        const json = await res.json()
        expect(res.status).toBe(200)
        expect(json).toMatchObject({ ok: true, atCap: 2, sent: 1, errors: 1 })
        expect(json.sentTo).toEqual([{ slug: 'coach-dos', touch: 1 }])
        expect(summaryPayload()).toMatchObject({ outcome: 'ok', sent: 1, errors: 1 })
    })

    it('getUserById revienta para un coach → ese cae en noRecipient (resolveCoachEmail nunca lanza) y el resto sigue', async () => {
        coaches = [freeCoach(), freeCoach({ id: 'c2', slug: 'coach-dos' })]
        clientRows = [{ coach_id: 'c1' }, { coach_id: 'c2' }]
        emailByCoachId = { c1: 'coach@gmail.com', c2: 'dos@gmail.com' }
        getUserByIdThrowsFor = 'c1'

        const res = await GET(authedReq())
        const json = await res.json()
        expect(res.status).toBe(200)
        expect(json).toMatchObject({ ok: true, atCap: 2, sent: 1, errors: 0 })
        expect(json.skipped).toMatchObject({ noRecipient: 1 })
        expect(json.sentTo).toEqual([{ slug: 'coach-dos', touch: 1 }])
    })

    it('query de coaches rota → 500, sin enviar nada, y el resumen queda escrito con outcome aborted', async () => {
        coachesError = { message: 'boom' }
        const res = await GET(authedReq())
        expect(res.status).toBe(500)
        expect(await res.json()).toMatchObject({ ok: false })
        expect(sendTransactionalEmail).not.toHaveBeenCalled()

        const payload = summaryPayload()
        expect(payload).toBeDefined()
        expect(payload).toMatchObject({ outcome: 'aborted' })
        expect(String(payload!.error)).toContain('boom')
    })

    it('ledger ilegible → FAIL-CLOSED: cero envíos, 500 y resumen con ledger_unreadable', async () => {
        coaches = [freeCoach()]
        clientRows = [{ coach_id: 'c1' }]
        ledgerError = { message: 'ledger down' }

        const res = await GET(authedReq())
        expect(res.status).toBe(500)
        expect(await res.json()).toMatchObject({ ok: false, error: 'ledger unreadable' })
        expect(sendTransactionalEmail).not.toHaveBeenCalled()
        expect(summaryPayload()).toMatchObject({ outcome: 'aborted', ledger_unreadable: true })
    })

    it('el insert del resumen revienta → la respuesta sigue siendo 200 con los conteos (el correo ya salió)', async () => {
        coaches = [freeCoach()]
        clientRows = [{ coach_id: 'c1' }]
        summaryInsertThrows = true

        const res = await GET(authedReq())
        const json = await res.json()
        expect(res.status).toBe(200)
        expect(json).toMatchObject({ ok: true, atCap: 1, sent: 1, errors: 0 })
        expect(auditInserts.some((a) => a.action === CLIENT_LIMIT_ACTION)).toBe(true)
        expect(auditInserts.some((a) => a.action === SUMMARY_ACTION)).toBe(false)
    })

    it('max_clients null + coach de 2025 → cupo 3 por grandfather (tierMaxClientsFor pre-v2)', async () => {
        coaches = [freeCoach({ max_clients: null, created_at: '2025-11-01T00:00:00Z' })]
        clientRows = [{ coach_id: 'c1' }, { coach_id: 'c1' }]
        const dosDeTres = await (await GET(authedReq())).json()
        expect(dosDeTres).toMatchObject({ atCap: 0, sent: 0 })

        vi.clearAllMocks()
        auditInserts.length = 0
        clientRows = [{ coach_id: 'c1' }, { coach_id: 'c1' }, { coach_id: 'c1' }]
        const tresDeTres = await (await GET(authedReq())).json()
        expect(tresDeTres).toMatchObject({ atCap: 1, sent: 1 })
        const ledger = auditInserts.find((a) => a.action === CLIENT_LIMIT_ACTION)
        expect(ledger!.payload).toMatchObject({ current_limit: 3 })
    })
})

describe('GET /api/cron/cap-nudge — predicados de la query', () => {
    it('candidatos: tier free, status active y active_org_id IS NULL', async () => {
        coaches = [freeCoach()]
        clientRows = []
        await GET(authedReq())
        expect(coachFilters).toContainEqual({ method: 'in', column: 'subscription_tier', value: ['free'] })
        expect(coachFilters).toContainEqual({
            method: 'eq',
            column: 'subscription_status',
            value: 'active',
        })
        expect(coachFilters).toContainEqual({ method: 'is', column: 'active_org_id', value: null })
        expect(coachFilters).toContainEqual({
            method: 'order',
            column: 'id',
            value: { ascending: true },
        })
    })

    it('conteo de alumnos: mismo predicado que el gate 402 (no archivados, sin org ni team)', async () => {
        coaches = [freeCoach()]
        clientRows = [{ coach_id: 'c1' }]
        await GET(authedReq())
        expect(clientFilters).toContainEqual({ method: 'eq', column: 'is_archived', value: false })
        expect(clientFilters).toContainEqual({ method: 'is', column: 'org_id', value: null })
        expect(clientFilters).toContainEqual({ method: 'is', column: 'team_id', value: null })
        expect(clientFilters).toContainEqual({ method: 'in', column: 'coach_id', value: ['c1'] })
    })

    it('paginado estable: el `.order(id)` va ANTES del `.range` (sin orden, PostgREST puede omitir filas)', async () => {
        coaches = [freeCoach()]
        clientRows = [{ coach_id: 'c1' }]
        await GET(authedReq())
        expect(clientFilters).toContainEqual({
            method: 'order',
            column: 'id',
            value: { ascending: true },
        })
        expect(clientOps).toContain('range')
        expect(clientOps.indexOf('order')).toBeGreaterThan(-1)
        expect(clientOps.indexOf('order')).toBeLessThan(clientOps.indexOf('range'))
    })
})
