import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// U3: activate-free provider-aware. Antes cancelaba SIEMPRE en MP + gate `providerMatches` por
// payment_provider → un coach FLOW pasaba a plan gratis con la sub Flow VIVA cobrando. Ahora resuelve
// el provider por `subscription_provider` (Flow → external_id) y limpia los refs Flow en el UPDATE.

const USER_ID = 'coach-uuid-1'

// Supabase server client (auth.getUser).
vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: USER_ID } } }) } }),
}))

// Workspace gates → billing permitido.
vi.mock('@/services/auth/workspace.service', () => ({ resolvePreferredWorkspace: async () => ({ kind: 'coach' }) }))
vi.mock('@/services/auth/workspace-permissions.service', () => ({ canViewBilling: () => true }))

// Provider por coach: capturamos con qué coach lo llaman + spy del cancel.
const cancelCheckoutAtProvider = vi.fn(async (..._a: unknown[]) => {})
const providerByCoachArg: Array<Record<string, unknown>> = []
let providerName = 'flow'
const getPaymentsProviderForCoach = vi.fn((coach: Record<string, unknown>) => {
    providerByCoachArg.push(coach)
    return { name: providerName, cancelCheckoutAtProvider: (...a: unknown[]) => cancelCheckoutAtProvider(...a) }
})
vi.mock('@/lib/payments/provider', () => ({
    getPaymentsProviderForCoach: (c: Record<string, unknown>) => getPaymentsProviderForCoach(c),
}))

// Admin service-role client: chainable. coachRow controla el SELECT; capturamos los UPDATE.
let coachRow: Record<string, unknown> | null = null
let clientsCount = 0
const coachUpdates: Array<Record<string, unknown>> = []
function makeAdmin() {
    return {
        from: (table: string) => {
            if (table === 'coaches') {
                return {
                    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: coachRow, error: null }) }) }),
                    update: (row: Record<string, unknown>) => {
                        coachUpdates.push(row)
                        return { eq: async () => ({ error: null }) }
                    },
                }
            }
            if (table === 'clients') {
                const c: Record<string, unknown> = {}
                c.select = () => c
                c.eq = () => c
                c.is = () => c
                ;(c as { then: unknown }).then = (resolve: (v: { count: number; error: null }) => unknown) =>
                    resolve({ count: clientsCount, error: null })
                return c
            }
            // subscription_events / admin_audit_logs
            return { insert: async () => ({ error: null }) }
        },
    }
}
let fakeAdmin = makeAdmin()
vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: () => fakeAdmin }))

import { POST } from './route'

beforeEach(() => {
    vi.clearAllMocks()
    coachUpdates.length = 0
    providerByCoachArg.length = 0
    clientsCount = 0
    providerName = 'flow'
    coachRow = null
    fakeAdmin = makeAdmin()
})
afterEach(() => vi.unstubAllEnvs())

describe('POST /api/payments/activate-free — provider-aware (U3)', () => {
    it('coach FLOW pending_payment → cancela el external_id vía provider flow + limpia refs Flow', async () => {
        coachRow = {
            id: USER_ID,
            subscription_status: 'pending_payment',
            subscription_mp_id: null,
            subscription_provider: 'flow',
            subscription_provider_external_id: 'sus_flow_1',
        }
        const res = await POST()
        expect(res.status).toBe(200)
        // Provider resuelto POR COACH (no MP hardcodeado); cancel con el external_id de la sub Flow.
        expect(getPaymentsProviderForCoach).toHaveBeenCalled()
        expect(providerByCoachArg[0]).toMatchObject({ subscription_provider: 'flow' })
        expect(cancelCheckoutAtProvider).toHaveBeenCalledWith('sus_flow_1')
        // UPDATE final limpia refs Flow y vuelve el gateway a MP neutro.
        const upd = coachUpdates.at(-1)!
        expect(upd.subscription_status).toBe('active')
        expect(upd.subscription_tier).toBe('free')
        expect(upd.subscription_mp_id).toBeNull()
        expect(upd.subscription_provider).toBe('mercadopago')
        expect(upd.subscription_provider_external_id).toBeNull()
        expect(upd.provider_plan_id).toBeNull()
        // provider_customer_id NO se toca (tarjeta reutilizable).
        expect('provider_customer_id' in upd).toBe(false)
    })

    it('coach MP expired → cancela el subscription_mp_id (no external_id)', async () => {
        providerName = 'mercadopago'
        coachRow = {
            id: USER_ID,
            subscription_status: 'expired',
            subscription_mp_id: 'mp_pre_1',
            subscription_provider: 'mercadopago',
            subscription_provider_external_id: null,
        }
        const res = await POST()
        expect(res.status).toBe(200)
        expect(cancelCheckoutAtProvider).toHaveBeenCalledWith('mp_pre_1')
    })
})
