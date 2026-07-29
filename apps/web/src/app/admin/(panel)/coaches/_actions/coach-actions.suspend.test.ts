import { beforeEach, describe, expect, it, vi } from 'vitest'

// NUT-033: `suspendCoachAction` escribía solo `subscription_status: 'paused'`. Si el coach no
// tenía `current_period_end` (free / legacy / nunca pagó), el gate de DB
// `private.student_write_allowed` se quedaba sin ancla de billing y —hasta el fix fail-closed—
// dejaba escribir a sus alumnos, mientras el resolver TS ya devolvía `readonly`. Ahora la acción
// ancla `paid_access_ended_at` igual que `expireCoachAction`.

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))

vi.mock('@/lib/payments/provider', () => ({
    getPaymentsProviderForCoach: () => ({ name: 'mercadopago', cancelCheckoutAtProvider: async () => {} }),
}))

let coachRow: Record<string, unknown> | null = null
const coachUpdates: Array<Record<string, unknown>> = []
const auditCalls: Array<unknown[]> = []
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
    logAdminAction: vi.fn(async (...args: unknown[]) => {
        auditCalls.push(args)
    }),
}))

import { suspendCoachAction } from './coach-actions'

beforeEach(() => {
    vi.clearAllMocks()
    coachUpdates.length = 0
    auditCalls.length = 0
    coachRow = null
})

describe('suspendCoachAction — ancla de gracia de alumnos (NUT-033)', () => {
    it('coach con current_period_end → ancla en ese period_end', async () => {
        coachRow = { current_period_end: '2026-08-01T00:00:00.000Z' }

        const res = await suspendCoachAction('coach-1', 'impago')

        expect(res).toEqual({ success: true })
        expect(coachUpdates).toHaveLength(1)
        expect(coachUpdates[0]).toEqual({
            subscription_status: 'paused',
            paid_access_ended_at: '2026-08-01T00:00:00.000Z',
        })
    })

    it('coach SIN current_period_end → ancla en el momento del corte (nunca null)', async () => {
        coachRow = { current_period_end: null }

        const res = await suspendCoachAction('coach-2')

        expect(res).toEqual({ success: true })
        const update = coachUpdates[0]
        expect(update.subscription_status).toBe('paused')
        expect(typeof update.paid_access_ended_at).toBe('string')
        expect(Number.isNaN(Date.parse(update.paid_access_ended_at as string))).toBe(false)
    })

    it('coach inexistente (fila null) → igual escribe un ancla, no deja NULL', async () => {
        coachRow = null

        await suspendCoachAction('coach-3')

        expect(coachUpdates[0].paid_access_ended_at).toEqual(expect.any(String))
    })

    it('sigue auditando la suspensión con el motivo', async () => {
        coachRow = { current_period_end: null }

        await suspendCoachAction('coach-4', 'fraude')

        expect(auditCalls).toHaveLength(1)
        expect(auditCalls[0][1]).toBe('coach.suspend')
        expect(auditCalls[0][4]).toEqual({ reason: 'fraude' })
    })
})
