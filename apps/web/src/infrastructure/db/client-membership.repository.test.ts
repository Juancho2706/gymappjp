import { describe, it, expect, vi, beforeEach } from 'vitest'

// Capture every insert + drive per-table errors.
const inserts: Array<{ table: string; payload: Record<string, unknown> }> = []
let accountError: { code?: string; message: string } | null = null
let membershipError: { code?: string; message: string } | null = null

vi.mock('@/lib/supabase/admin-client', () => ({
    createServiceRoleClient: () => ({
        from: (table: string) => ({
            insert: (payload: Record<string, unknown>) => {
                inserts.push({ table, payload })
                if (table === 'client_accounts') return Promise.resolve({ error: accountError })
                if (table === 'client_memberships') return Promise.resolve({ error: membershipError })
                return Promise.resolve({ error: null })
            },
        }),
    }),
}))

import { createClientIdentity } from './client-membership.repository'

beforeEach(() => {
    inserts.length = 0
    accountError = null
    membershipError = null
})

describe('createClientIdentity', () => {
    it('standalone: derives scope=standalone with null org_id', async () => {
        const res = await createClientIdentity({ accountId: 'u1', clientId: 'u1', coachId: 'coach1', orgId: null })
        expect(res.ok).toBe(true)
        const membership = inserts.find(i => i.table === 'client_memberships')!.payload
        expect(membership).toMatchObject({ account_id: 'u1', client_id: 'u1', scope: 'standalone', coach_id: 'coach1', org_id: null, status: 'active' })
        expect(inserts.find(i => i.table === 'client_accounts')!.payload).toEqual({ id: 'u1' })
    })

    it('enterprise: derives scope=enterprise from org_id', async () => {
        const res = await createClientIdentity({ accountId: 'u2', clientId: 'u2', coachId: 'coach2', orgId: 'org2' })
        expect(res.ok).toBe(true)
        const membership = inserts.find(i => i.table === 'client_memberships')!.payload
        expect(membership).toMatchObject({ scope: 'enterprise', org_id: 'org2', coach_id: 'coach2' })
    })

    it('enterprise pool: coach_id null is allowed', async () => {
        const res = await createClientIdentity({ accountId: 'u3', clientId: 'u3', coachId: null, orgId: 'org3' })
        expect(res.ok).toBe(true)
        expect(inserts.find(i => i.table === 'client_memberships')!.payload).toMatchObject({ scope: 'enterprise', coach_id: null, org_id: 'org3' })
    })

    it('idempotent: account unique-violation (23505) is treated as success', async () => {
        accountError = { code: '23505', message: 'duplicate key' }
        const res = await createClientIdentity({ accountId: 'u4', clientId: 'u4', coachId: 'c', orgId: null })
        expect(res.ok).toBe(true)
        // still attempts the membership insert
        expect(inserts.some(i => i.table === 'client_memberships')).toBe(true)
    })

    it('idempotent: membership unique-violation (23505) is treated as success', async () => {
        membershipError = { code: '23505', message: 'duplicate key' }
        const res = await createClientIdentity({ accountId: 'u5', clientId: 'u5', coachId: 'c', orgId: 'o' })
        expect(res.ok).toBe(true)
    })

    it('non-idempotent failure: account error surfaces and skips membership', async () => {
        accountError = { code: '42501', message: 'permission denied' }
        const res = await createClientIdentity({ accountId: 'u6', clientId: 'u6', coachId: 'c', orgId: null })
        expect(res.ok).toBe(false)
        expect(res.error).toContain('client_accounts')
        expect(inserts.some(i => i.table === 'client_memberships')).toBe(false)
    })

    it('non-idempotent failure: membership error surfaces', async () => {
        membershipError = { code: '23514', message: 'check constraint violation' }
        const res = await createClientIdentity({ accountId: 'u7', clientId: 'u7', coachId: 'c', orgId: 'o' })
        expect(res.ok).toBe(false)
        expect(res.error).toContain('client_memberships')
    })
})
