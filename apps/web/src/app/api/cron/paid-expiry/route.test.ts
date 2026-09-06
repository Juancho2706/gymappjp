import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProviderRequestError } from '@/lib/payments/provider-error'

// Cron backstop paid-expiry: expira suscripciones PAGAS con período vencido cuyo evento terminal se
// perdió (webhook out-of-band). PROVIDER-VERIFIED: verifica el gateway antes de cortar; en la duda,
// alert-only. Este test controla el snapshot del gateway + captura los updates a coaches y los audit.

const auditInserts: Array<Record<string, unknown>> = []
const coachUpdates: Array<{ id: string; update: Record<string, unknown> }> = []
let candidates: Array<Record<string, unknown>> = []
// D4: cuando está en true, el SELECT sobre admin_audit_logs devuelve error → el dedupe del digest
// tiene que caer FAIL-OPEN y mandar el correo igual.
let auditReadBroken = false

function makeAdmin() {
    return {
        from: (table: string) => {
            if (table === 'coaches') {
                return {
                    // SELECT chain (cadena encadenable que resuelve a {data: candidates}).
                    select: () => {
                        const chain: Record<string, unknown> = {}
                        const ret = () => chain
                        Object.assign(chain, {
                            in: ret,
                            not: ret,
                            lt: ret,
                            then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
                                resolve({ data: candidates, error: null }),
                        })
                        return chain
                    },
                    // UPDATE (expireCoach) — captura el patch + el id del .eq().
                    update: (patch: Record<string, unknown>) => ({
                        eq: async (_col: string, id: string) => {
                            coachUpdates.push({ id, update: patch })
                            return { error: null }
                        },
                    }),
                }
            }
            if (table === 'admin_audit_logs') {
                return {
                    insert: async (row: Record<string, unknown>) => {
                        auditInserts.push(row)
                        return { error: null }
                    },
                    // SELECT del ledger (dedupe del digest, D4): filtra por el .eq('action', …) y
                    // devuelve lo ya insertado en ESTA corrida, más reciente primero (la query pide
                    // order desc + limit 1). El fake ignora la dirección del order a propósito.
                    select: () => {
                        const eqCalls: Array<[string, unknown]> = []
                        const chain: Record<string, unknown> = {}
                        const ret = () => chain
                        Object.assign(chain, {
                            eq: (col: string, val: unknown) => {
                                eqCalls.push([col, val])
                                return chain
                            },
                            gte: ret,
                            order: ret,
                            limit: ret,
                            then: (resolve: (v: { data: unknown; error: unknown }) => unknown) => {
                                if (auditReadBroken) {
                                    return resolve({ data: null, error: { message: 'ledger caído' } })
                                }
                                const action = eqCalls.find(([col]) => col === 'action')?.[1]
                                return resolve({
                                    data: auditInserts.filter((r) => r.action === action).reverse(),
                                    error: null,
                                })
                            },
                        })
                        return chain
                    },
                }
            }
            return {}
        },
    }
}
let fakeAdmin = makeAdmin()
vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: () => fakeAdmin }))

// Provider por coach: name = subscription_provider; fetchCheckoutSnapshot controlado por subId.
type SnapEntry = { status?: string } | { throw: Error }
const snapshots = new Map<string, SnapEntry>()
const fetchCheckoutSnapshot = vi.fn(async (subId: string) => {
    const entry = snapshots.get(subId)
    if (!entry) throw new Error(`no snapshot for ${subId}`)
    if ('throw' in entry) throw entry.throw
    return { id: subId, external_reference: null, status: entry.status ?? null, next_payment_date: null }
})
vi.mock('@/lib/payments/provider', () => ({
    getPaymentsProviderForCoach: (coach: { subscription_provider?: string | null }) => ({
        name: coach.subscription_provider === 'flow' ? 'flow' : 'mercadopago',
        fetchCheckoutSnapshot: (...a: unknown[]) => fetchCheckoutSnapshot(...(a as [string])),
    }),
}))

// Helpers del terminal del webhook (reusados por expireCoach).
const cancelAllForCoach = vi.fn(async () => 0)
vi.mock('@/infrastructure/db/coach-addons.repository', () => ({
    cancelAllForCoach: (...a: unknown[]) => cancelAllForCoach(...(a as [])),
}))
const revertActiveCouponForCoach = vi.fn(async () => ({ reverted: false }))
vi.mock('@/services/billing/coupons.service', () => ({
    revertActiveCouponForCoach: (...a: unknown[]) => revertActiveCouponForCoach(...(a as [])),
}))

// Email de resumen — mockeado (sin red).
const sendTransactionalEmail = vi.fn(async (..._a: unknown[]) => ({ ok: true, providerMessageId: null }))
vi.mock('@/lib/email/send-email', () => ({
    sendTransactionalEmail: (...a: unknown[]) => sendTransactionalEmail(...a),
}))

import { GET } from './route'

const SECRET = 'cron-sekret'
const authedReq = () =>
    new Request('https://eva/api/cron/paid-expiry', { headers: { authorization: `Bearer ${SECRET}` } })

beforeEach(() => {
    vi.clearAllMocks()
    auditInserts.length = 0
    coachUpdates.length = 0
    candidates = []
    snapshots.clear()
    auditReadBroken = false
    fakeAdmin = makeAdmin()
    vi.stubEnv('CRON_SECRET', SECRET)
    vi.stubEnv('ADMIN_EMAILS', 'ceo@eva-app.cl')
})
afterEach(() => vi.unstubAllEnvs())

describe('GET /api/cron/paid-expiry — auth', () => {
    it('sin CRON_SECRET en el env → 401', async () => {
        vi.stubEnv('CRON_SECRET', '')
        expect((await GET(authedReq())).status).toBe(401)
    })
    it('Authorization incorrecto → 401', async () => {
        const res = await GET(
            new Request('https://eva/api/cron/paid-expiry', { headers: { authorization: 'Bearer malo' } })
        )
        expect(res.status).toBe(401)
    })
})

describe('GET /api/cron/paid-expiry — EXPIRE (remota muerta)', () => {
    it("MP preapproval 'cancelled' + período vencido → expira (caso joaquinamr7)", async () => {
        candidates = [
            {
                id: 'c1',
                slug: 'joaquinamr7',
                subscription_status: 'active',
                subscription_provider: 'mercadopago',
                subscription_mp_id: 'pre_1',
                subscription_provider_external_id: null,
            },
        ]
        snapshots.set('pre_1', { status: 'cancelled' })
        const json = await (await GET(authedReq())).json()
        expect(json).toMatchObject({ ok: true, candidates: 1, expired: 1, alerts: 0, errors: 0 })
        // Update: status expired, period null, subscription_mp_id null; NO toca tier/max_clients/cycle.
        const upd = coachUpdates.find((u) => u.id === 'c1')!.update
        expect(upd.subscription_status).toBe('expired')
        expect(upd.current_period_end).toBeNull()
        expect(upd.subscription_mp_id).toBeNull()
        expect(upd).not.toHaveProperty('subscription_tier')
        expect(upd).not.toHaveProperty('max_clients')
        expect(upd).not.toHaveProperty('billing_cycle')
        // Reusa los helpers del webhook.
        expect(cancelAllForCoach).toHaveBeenCalledWith(expect.anything(), 'c1', expect.any(String))
        expect(revertActiveCouponForCoach).toHaveBeenCalledWith(expect.anything(), 'c1')
        expect(auditInserts.some((a) => a.action === 'coach.paid_expired_auto')).toBe(true)
    })

    it('404 del gateway (preapproval borrado) → expira', async () => {
        candidates = [
            {
                id: 'c2',
                slug: 'gone',
                subscription_status: 'active',
                subscription_provider: 'mercadopago',
                subscription_mp_id: 'pre_gone',
                subscription_provider_external_id: null,
            },
        ]
        snapshots.set('pre_gone', { throw: new ProviderRequestError('mercadopago', 404, 'not found') })
        const json = await (await GET(authedReq())).json()
        expect(json).toMatchObject({ expired: 1, errors: 0 })
    })

    it('MP 400 "not valid for callerId" (preapproval de cuenta vieja) → expira (caso movida-la2yw4)', async () => {
        candidates = [
            {
                id: 'c10',
                slug: 'movida-la2yw4',
                subscription_status: 'active',
                subscription_provider: 'mercadopago',
                subscription_mp_id: 'pre_old_account',
                subscription_provider_external_id: null,
            },
        ]
        snapshots.set('pre_old_account', {
            throw: new ProviderRequestError(
                'mercadopago',
                400,
                'MercadoPago request failed (400): {"message":"the preapprovalId is not valid for callerId","status":400}'
            ),
        })
        const json = await (await GET(authedReq())).json()
        expect(json).toMatchObject({ expired: 1, errors: 0 })
        const upd = coachUpdates.find((u) => u.id === 'c10')!.update
        expect(upd.subscription_status).toBe('expired')
        expect(upd.subscription_mp_id).toBeNull()
    })

    it('Flow suscripción cancelada (status mapeado canceled) → nulea subscription_provider_external_id', async () => {
        candidates = [
            {
                id: 'c3',
                slug: 'flow-dead',
                subscription_status: 'past_due',
                subscription_provider: 'flow',
                subscription_mp_id: null,
                subscription_provider_external_id: 'sus_1',
            },
        ]
        snapshots.set('sus_1', { status: 'cancelled' })
        await GET(authedReq())
        const upd = coachUpdates.find((u) => u.id === 'c3')!.update
        expect(upd.subscription_provider_external_id).toBeNull()
        expect(upd).not.toHaveProperty('subscription_mp_id')
    })

    it("db 'canceled' sin id de suscripción → expira sin llamar al gateway", async () => {
        candidates = [
            {
                id: 'c4',
                slug: 'canceled-noid',
                subscription_status: 'canceled',
                subscription_provider: 'mercadopago',
                subscription_mp_id: null,
                subscription_provider_external_id: null,
            },
        ]
        const json = await (await GET(authedReq())).json()
        expect(json).toMatchObject({ expired: 1 })
        expect(fetchCheckoutSnapshot).not.toHaveBeenCalled()
    })
})

describe('GET /api/cron/paid-expiry — ALERT-ONLY (no cortar)', () => {
    it("MP preapproval 'authorized' (aún viva) → alerta, NO expira", async () => {
        candidates = [
            {
                id: 'c5',
                slug: 'still-alive',
                subscription_status: 'active',
                subscription_provider: 'mercadopago',
                subscription_mp_id: 'pre_5',
                subscription_provider_external_id: null,
            },
        ]
        snapshots.set('pre_5', { status: 'authorized' })
        const json = await (await GET(authedReq())).json()
        expect(json).toMatchObject({ expired: 0, alerts: 1 })
        expect(coachUpdates).toHaveLength(0)
        expect(auditInserts.some((a) => a.action === 'coach.paid_expiry_alert')).toBe(true)
    })

    it("db 'active' sin id verificable → alerta (fail-safe, no cortar a ciegas)", async () => {
        candidates = [
            {
                id: 'c6',
                slug: 'active-noid',
                subscription_status: 'active',
                subscription_provider: 'mercadopago',
                subscription_mp_id: null,
                subscription_provider_external_id: null,
            },
        ]
        const json = await (await GET(authedReq())).json()
        expect(json).toMatchObject({ expired: 0, alerts: 1 })
    })

    it('error transitorio del gateway (no-404) → cuenta como error, NO expira, sigue', async () => {
        candidates = [
            {
                id: 'c7',
                slug: 'rompe',
                subscription_status: 'active',
                subscription_provider: 'mercadopago',
                subscription_mp_id: 'pre_502',
                subscription_provider_external_id: null,
            },
            {
                id: 'c8',
                slug: 'sano-muerto',
                subscription_status: 'active',
                subscription_provider: 'mercadopago',
                subscription_mp_id: 'pre_8',
                subscription_provider_external_id: null,
            },
        ]
        snapshots.set('pre_502', { throw: new ProviderRequestError('mercadopago', 502, 'bad gateway') })
        snapshots.set('pre_8', { status: 'cancelled' })
        const json = await (await GET(authedReq())).json()
        // El error no tumba el cron: el segundo coach igual se procesa y expira.
        expect(json).toMatchObject({ ok: true, candidates: 2, expired: 1, errors: 1 })
    })

    it('MP 400 GENÉRICO (sin "not valid for callerId") → error fail-safe, NO expira', async () => {
        candidates = [
            {
                id: 'c11',
                slug: 'bad-request',
                subscription_status: 'active',
                subscription_provider: 'mercadopago',
                subscription_mp_id: 'pre_400',
                subscription_provider_external_id: null,
            },
        ]
        snapshots.set('pre_400', {
            throw: new ProviderRequestError('mercadopago', 400, 'MercadoPago request failed (400): invalid parameters'),
        })
        const json = await (await GET(authedReq())).json()
        expect(json).toMatchObject({ expired: 0, errors: 1 })
        expect(coachUpdates).toHaveLength(0)
    })
})

describe('GET /api/cron/paid-expiry — resumen', () => {
    it('siempre escribe el audit de corrida y no manda email si no hubo nada', async () => {
        candidates = []
        const json = await (await GET(authedReq())).json()
        expect(json).toMatchObject({ candidates: 0, expired: 0, alerts: 0, errors: 0 })
        expect(auditInserts.some((a) => a.action === 'cron.paid_expiry_ran')).toBe(true)
        expect(sendTransactionalEmail).not.toHaveBeenCalled()
    })

    it('manda email de resumen a ADMIN_EMAILS cuando hubo expirados', async () => {
        candidates = [
            {
                id: 'c9',
                slug: 'dead',
                subscription_status: 'active',
                subscription_provider: 'mercadopago',
                subscription_mp_id: 'pre_9',
                subscription_provider_external_id: null,
            },
        ]
        snapshots.set('pre_9', { status: 'cancelled' })
        await GET(authedReq())
        expect(sendTransactionalEmail).toHaveBeenCalledTimes(1)
        expect(sendTransactionalEmail).toHaveBeenCalledWith(
            expect.objectContaining({ to: 'ceo@eva-app.cl' })
        )
    })
})

// D4 (owner, 05-09): el digest se mandaba TODOS los días aunque el contenido fuera idéntico (la misma
// divergencia llegó del 29-08 al 05-09). Ahora se hashea el contenido y, si repite el último enviado,
// se suprime dejando la traza `cron.paid_expiry_digest` con `sent:false`.
describe('GET /api/cron/paid-expiry — dedupe del digest (D4)', () => {
    const alertCandidate = {
        id: 'c20',
        slug: 'ljfitness',
        subscription_status: 'active',
        subscription_provider: 'mercadopago',
        subscription_mp_id: 'pre_20',
        subscription_provider_external_id: null,
    }
    const digestRows = () => auditInserts.filter((a) => a.action === 'cron.paid_expiry_digest')

    it('primer digest ⇒ manda y registra el hash con sent:true', async () => {
        candidates = [alertCandidate]
        snapshots.set('pre_20', { status: 'authorized' }) // viva → alerta, no expira
        await GET(authedReq())
        expect(sendTransactionalEmail).toHaveBeenCalledTimes(1)
        expect(digestRows()).toHaveLength(1)
        const payload = digestRows()[0].payload as { digest_hash: string; sent: boolean }
        expect(payload.sent).toBe(true)
        expect(payload.digest_hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('mismo contenido en la corrida siguiente ⇒ NO manda y registra la supresión (sent:false)', async () => {
        candidates = [alertCandidate]
        snapshots.set('pre_20', { status: 'authorized' })
        await GET(authedReq())
        await GET(authedReq()) // "día siguiente": mismo coach, misma razón
        expect(sendTransactionalEmail).toHaveBeenCalledTimes(1)
        const rows = digestRows()
        expect(rows).toHaveLength(2)
        expect((rows[0].payload as { sent: boolean }).sent).toBe(true)
        expect((rows[1].payload as { sent: boolean }).sent).toBe(false)
        // Mismo contenido ⇒ mismo hash: eso es lo que dispara la supresión.
        expect((rows[1].payload as { digest_hash: string }).digest_hash).toBe(
            (rows[0].payload as { digest_hash: string }).digest_hash
        )
    })

    it('contenido distinto (aparece otro coach) ⇒ vuelve a mandar', async () => {
        candidates = [alertCandidate]
        snapshots.set('pre_20', { status: 'authorized' })
        await GET(authedReq())
        candidates = [
            alertCandidate,
            {
                id: 'c21',
                slug: 'nuevo-caso',
                subscription_status: 'active',
                subscription_provider: 'mercadopago',
                subscription_mp_id: 'pre_21',
                subscription_provider_external_id: null,
            },
        ]
        snapshots.set('pre_21', { status: 'cancelled' })
        await GET(authedReq())
        expect(sendTransactionalEmail).toHaveBeenCalledTimes(2)
        const rows = digestRows()
        expect((rows[1].payload as { sent: boolean }).sent).toBe(true)
        expect((rows[1].payload as { digest_hash: string }).digest_hash).not.toBe(
            (rows[0].payload as { digest_hash: string }).digest_hash
        )
    })

    it('ledger ilegible ⇒ fail-open: manda igual aunque el contenido repita', async () => {
        auditReadBroken = true
        candidates = [alertCandidate]
        snapshots.set('pre_20', { status: 'authorized' })
        await GET(authedReq())
        await GET(authedReq())
        expect(sendTransactionalEmail).toHaveBeenCalledTimes(2)
        expect(digestRows().every((r) => (r.payload as { sent: boolean }).sent)).toBe(true)
    })
})
