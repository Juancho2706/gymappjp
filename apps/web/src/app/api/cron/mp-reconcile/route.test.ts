import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

// ── FIX-6: mp-reconcile's `isAuthorized` swaps `auth === \`Bearer ${expected}\`` for a
// length-safe constant-time compare (node:crypto timingSafeEqual). `isAuthorized` is private,
// so we drive it through the route GET — the auth gate is the FIRST thing GET runs:
//   - wrong / missing / empty Bearer  → 401 (rejected before any side effect)
//   - exact Bearer ${CRON_SECRET}     → passes auth; with MERCADOPAGO_ACCESS_TOKEN unset the
//                                       route then returns 500 ("...not set") — which PROVES the
//                                       auth gate let it through (a 401 would have short-circuited).
// These assert the CONTRACT (right token in, wrong token out) independent of the timing impl.
//
// The module imports service-role + email helpers at top level; stub them so importing the
// route never touches a real Supabase/Resend client. The 401 paths never reach them anyway,
// and the one 500 path returns before `createServiceRoleClient()` is used.
//
// D4 (05-09): el fake de Supabase pasó de un stub mínimo a una cadena real porque el dedupe del
// digest necesita LEER `admin_audit_logs` (lo que ya insertó la corrida anterior). Los tests de auth
// no lo tocan — siguen cortando antes de `createServiceRoleClient()`.

const auditInserts: Array<Record<string, unknown>> = []
let coaches: Array<Record<string, unknown>> = []
let overdueInvoices: Array<Record<string, unknown>> = []
// Cuando está en true el SELECT del ledger devuelve error → el dedupe cae FAIL-OPEN y manda igual.
let auditReadBroken = false

function makeAdmin() {
    return {
        from: (table: string) => {
            if (table === 'admin_audit_logs') {
                return {
                    insert: async (row: Record<string, unknown>) => {
                        auditInserts.push(row)
                        return { error: null }
                    },
                    // Lectura del ledger: filtra por el `.eq('action', …)` y devuelve lo insertado en
                    // esta corrida, más reciente primero (la query pide order desc + limit 1). El fake
                    // ignora la dirección del order a propósito.
                    select: () => {
                        const eqCalls: Array<[string, unknown]> = []
                        const chain: Record<string, unknown> = {}
                        const ret = () => chain
                        Object.assign(chain, {
                            eq: (col: string, val: unknown) => {
                                eqCalls.push([col, val])
                                return chain
                            },
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
            // `coaches` (loop MP + pasada de expiry) y `org_invoices`: cadena de filtros encadenable
            // que resuelve a la lista configurada por el test.
            const rows = table === 'coaches' ? coaches : overdueInvoices
            const chain: Record<string, unknown> = {}
            const ret = () => chain
            Object.assign(chain, {
                select: ret,
                eq: ret,
                in: ret,
                is: ret,
                not: ret,
                lt: ret,
                gt: ret,
                lte: ret,
                order: ret,
                limit: ret,
                then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
                    resolve({ data: rows, error: null }),
            })
            return chain
        },
    }
}
let fakeAdmin = makeAdmin()
vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: () => fakeAdmin }))

// Firma con rest a propósito: el mock de abajo reenvía `...a` y `tsc` exige un parámetro rest del
// otro lado (TS2556); el nombre con guion bajo evita el `no-unused-vars`.
const sendTransactionalEmail = vi.fn(async (..._a: unknown[]) => ({ ok: true, providerMessageId: null }))
vi.mock('@/lib/email/send-email', () => ({
    sendTransactionalEmail: (...a: unknown[]) => sendTransactionalEmail(...a),
}))

// Add-ons / cupones / descuentos fuera de foco para el dedupe: sin add-ons vivos ni cupón, el loop
// solo produce (o no) divergencias de estado, que es lo que hashea el digest.
vi.mock('@/infrastructure/db/coach-addons.repository', () => ({
    listLive: async () => [],
    applyExpiry: async () => false,
}))
vi.mock('@/services/billing/discount.service', () => ({
    resolveDiscountSpecByRedemptionId: async () => null,
}))
vi.mock('@/services/billing/coupons.service', () => ({
    sweepAbandonedSignupCoupons: async () => ({ signupAbandoned: 0 }),
}))

import { GET } from './route'

function makeRequest(headers: Record<string, string> = {}): Request {
    return new Request('http://localhost/api/cron/mp-reconcile', { method: 'GET', headers })
}

const CRON_SECRET = 'super-secret-cron-value'

beforeEach(() => {
    vi.clearAllMocks()
    auditInserts.length = 0
    coaches = []
    overdueInvoices = []
    auditReadBroken = false
    fakeAdmin = makeAdmin()
    vi.stubEnv('CRON_SECRET', CRON_SECRET)
    // Unset so a request that PASSES auth returns 500 ("not set"), letting us prove the gate opened
    // without exercising the full reconcile (which would call out to MP).
    vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', '')
})

afterEach(() => {
    vi.unstubAllEnvs()
})

describe('GET /api/cron/mp-reconcile — auth gate (FIX-6 constant-time Bearer compare)', () => {
    it('401 with NO Authorization header', async () => {
        const res = await GET(makeRequest())
        expect(res.status).toBe(401)
    })

    it('401 with a WRONG Bearer token of the SAME length (constant-time compare still discriminates)', async () => {
        // `Bearer ${CRON_SECRET}` byte-length but different content.
        const wrong = `Bearer ${'x'.repeat(CRON_SECRET.length)}`
        const res = await GET(makeRequest({ authorization: wrong }))
        expect(res.status).toBe(401)
    })

    it('401 with a Bearer token of a DIFFERENT length (length guard before timingSafeEqual)', async () => {
        const res = await GET(makeRequest({ authorization: `Bearer ${CRON_SECRET}-extra` }))
        expect(res.status).toBe(401)
    })

    it('401 with the raw secret but MISSING the "Bearer " prefix', async () => {
        const res = await GET(makeRequest({ authorization: CRON_SECRET }))
        expect(res.status).toBe(401)
    })

    it('passes auth with the EXACT "Bearer ${CRON_SECRET}" (NOT 401 — proves the right token authorizes)', async () => {
        const res = await GET(makeRequest({ authorization: `Bearer ${CRON_SECRET}` }))
        // Auth opened the gate; with MERCADOPAGO_ACCESS_TOKEN unset the route returns 500.
        expect(res.status).not.toBe(401)
        expect(res.status).toBe(500)
        const json = await res.json()
        expect(json.error).toMatch(/MERCADOPAGO_ACCESS_TOKEN/)
    })

    it('401 (fail-closed) when CRON_SECRET itself is unset, even with a Bearer header', async () => {
        vi.stubEnv('CRON_SECRET', '')
        const res = await GET(makeRequest({ authorization: 'Bearer anything' }))
        expect(res.status).toBe(401)
    })
})

// D4 (owner, 05-09): el digest salía TODOS los días aunque el contenido fuera idéntico — la misma
// divergencia (coach ljfitness activo en DB / pending en MP) llegó igual del 29-08 al 05-09. Ahora se
// hashea el contenido y, si repite el último enviado, se suprime dejando la traza
// `cron.mp_reconcile_digest` con `sent:false`. Para forzar un reenvío el contenido tiene que cambiar.
describe('GET /api/cron/mp-reconcile — dedupe del digest (D4)', () => {
    const ljfitness = {
        id: 'coach-lj',
        slug: 'ljfitness',
        subscription_status: 'active',
        subscription_tier: 'pro',
        billing_cycle: 'monthly',
        current_period_end: null,
        subscription_mp_id: 'pre_lj',
        active_coupon_redemption_id: null,
        subscription_provider: 'mercadopago',
        subscription_provider_external_id: null,
        provider_plan_id: null,
    }
    // MP responde `pending` mientras la DB dice `active` ⇒ divergencia (el caso real de ljfitness).
    const mpStatuses = new Map<string, string>()

    const authed = () => GET(makeRequest({ authorization: `Bearer ${CRON_SECRET}` }))
    const digestRows = () => auditInserts.filter((a) => a.action === 'cron.mp_reconcile_digest')

    beforeEach(() => {
        vi.stubEnv('MERCADOPAGO_ACCESS_TOKEN', 'APP_USR-token')
        vi.stubEnv('ADMIN_EMAILS', 'ceo@eva-app.cl')
        mpStatuses.clear()
        mpStatuses.set('pre_lj', 'pending')
        vi.stubGlobal(
            'fetch',
            vi.fn(async (url: string) => {
                const id = String(url).split('/').pop() ?? ''
                const status = mpStatuses.get(id)
                if (!status) return { ok: false, json: async () => ({}) }
                return { ok: true, json: async () => ({ id, status }) }
            })
        )
    })
    afterEach(() => vi.unstubAllGlobals())

    it('primer digest ⇒ manda y registra el hash con sent:true', async () => {
        coaches = [ljfitness]
        const json = await (await authed()).json()
        expect(json).toMatchObject({ ok: true, divergences: 1 })
        expect(sendTransactionalEmail).toHaveBeenCalledTimes(1)
        expect(sendTransactionalEmail).toHaveBeenCalledWith(expect.objectContaining({ to: 'ceo@eva-app.cl' }))
        expect(digestRows()).toHaveLength(1)
        const payload = digestRows()[0].payload as { digest_hash: string; sent: boolean }
        expect(payload.sent).toBe(true)
        expect(payload.digest_hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it('mismo contenido en la corrida siguiente ⇒ NO manda y registra la supresión (sent:false)', async () => {
        coaches = [ljfitness]
        await authed()
        await authed() // "día siguiente": misma divergencia, mismo detalle
        expect(sendTransactionalEmail).toHaveBeenCalledTimes(1)
        const rows = digestRows()
        expect(rows).toHaveLength(2)
        expect((rows[0].payload as { sent: boolean }).sent).toBe(true)
        expect((rows[1].payload as { sent: boolean }).sent).toBe(false)
        expect((rows[1].payload as { digest_hash: string }).digest_hash).toBe(
            (rows[0].payload as { digest_hash: string }).digest_hash
        )
    })

    it('contenido distinto (otra divergencia) ⇒ vuelve a mandar', async () => {
        coaches = [ljfitness]
        await authed()
        coaches = [ljfitness, { ...ljfitness, id: 'coach-2', slug: 'otro', subscription_mp_id: 'pre_2' }]
        mpStatuses.set('pre_2', 'cancelled')
        await authed()
        expect(sendTransactionalEmail).toHaveBeenCalledTimes(2)
        const rows = digestRows()
        expect((rows[1].payload as { sent: boolean }).sent).toBe(true)
        expect((rows[1].payload as { digest_hash: string }).digest_hash).not.toBe(
            (rows[0].payload as { digest_hash: string }).digest_hash
        )
    })

    it('ledger ilegible ⇒ fail-open: manda igual aunque el contenido repita', async () => {
        auditReadBroken = true
        coaches = [ljfitness]
        await authed()
        await authed()
        expect(sendTransactionalEmail).toHaveBeenCalledTimes(2)
        expect(digestRows().every((r) => (r.payload as { sent: boolean }).sent)).toBe(true)
    })

    it('sin divergencias ni alertas ⇒ no manda NI registra digest (igual que antes de D4)', async () => {
        coaches = [{ ...ljfitness, subscription_status: 'active' }]
        mpStatuses.set('pre_lj', 'authorized') // DB y MP coinciden
        const json = await (await authed()).json()
        expect(json).toMatchObject({ divergences: 0, addonAlerts: 0 })
        expect(sendTransactionalEmail).not.toHaveBeenCalled()
        expect(digestRows()).toHaveLength(0)
    })
})
