import { beforeEach, describe, expect, it, vi } from 'vitest'

// U4: expireCoachAction (admin force-expire) provider-aware. Antes cancelaba SIEMPRE el preapproval MP →
// para un coach FLOW la sub Flow quedaba VIVA cobrando pese al expire. Ahora resuelve el provider por
// `subscription_provider` y cancela el id del gateway (Flow → external_id; MP → mp_id).

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

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

let coachRow: Record<string, unknown> | null = null
const coachUpdates: Array<Record<string, unknown>> = []
const fakeAdmin = {
    auth: { getUser: async () => ({ data: { user: null } }) },
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
        return { insert: async () => ({ error: null }) }
    },
}
vi.mock('@/lib/admin/admin-action-wrapper', () => ({
    assertAdmin: async () => ({ user: { email: 'admin@eva.cl' }, adminClient: fakeAdmin }),
    logAdminAction: vi.fn(async () => {}),
}))

import { expireCoachAction } from './coach-actions'

beforeEach(() => {
    vi.clearAllMocks()
    coachUpdates.length = 0
    providerByCoachArg.length = 0
    providerName = 'flow'
    coachRow = null
})

describe('expireCoachAction — provider-aware (U4)', () => {
    it('coach FLOW → expira en DB y cancela el external_id vía provider flow', async () => {
        coachRow = { subscription_mp_id: null, subscription_provider: 'flow', subscription_provider_external_id: 'sus_flow_9' }
        const res = await expireCoachAction('coach-9')
        expect(res).toEqual({ success: true })
        expect(coachUpdates[0]).toMatchObject({ subscription_status: 'expired' })
        expect(providerByCoachArg[0]).toMatchObject({ subscription_provider: 'flow' })
        expect(cancelCheckoutAtProvider).toHaveBeenCalledWith('sus_flow_9')
    })

    it('coach MP → cancela el subscription_mp_id (no external_id)', async () => {
        providerName = 'mercadopago'
        coachRow = { subscription_mp_id: 'mp_pre_9', subscription_provider: 'mercadopago', subscription_provider_external_id: null }
        const res = await expireCoachAction('coach-9')
        expect(res).toEqual({ success: true })
        expect(cancelCheckoutAtProvider).toHaveBeenCalledWith('mp_pre_9')
    })

    it('coach sin sub (ambos refs null) → expira sin llamar al provider', async () => {
        coachRow = { subscription_mp_id: null, subscription_provider: 'mercadopago', subscription_provider_external_id: null }
        await expireCoachAction('coach-9')
        expect(cancelCheckoutAtProvider).not.toHaveBeenCalled()
    })
})
