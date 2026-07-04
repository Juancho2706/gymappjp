import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mocks hoisted so vi.mock factories can reference them.
const { createServiceRoleClientMock, resolveInviteMock, createClientIdentityMock, rateLimitMock } =
    vi.hoisted(() => ({
        createServiceRoleClientMock: vi.fn(),
        resolveInviteMock: vi.fn(),
        createClientIdentityMock: vi.fn(),
        rateLimitMock: vi.fn(),
    }))

vi.mock('next/headers', () => ({
    headers: vi.fn(async () => new Headers({ 'x-forwarded-for': '203.0.113.7' })),
}))

vi.mock('@/lib/rate-limit', () => ({
    rateLimitInviteAccept: rateLimitMock,
}))

vi.mock('@/lib/supabase/admin-client', () => ({
    createServiceRoleClient: createServiceRoleClientMock,
}))

// Mock the resolver (its internals are unit-tested elsewhere). We drive the ACTION's
// three scope branches from here. Provide the real disabled-message export too.
vi.mock('../_lib/resolve-invite', () => ({
    resolveInvite: resolveInviteMock,
    STANDALONE_REGISTRATION_DISABLED_MESSAGE:
        'El registro directo está desactivado — pedile a tu coach que te agregue desde su panel.',
}))

vi.mock('@/infrastructure/db/client-membership.repository', () => ({
    createClientIdentity: createClientIdentityMock,
}))

import { joinViaInviteAction } from './join.actions'

function buildFormData() {
    const fd = new FormData()
    fd.set('full_name', 'Alumna Test')
    fd.set('email', 'alumna@example.com')
    fd.set('phone', '+56 9 1234 5678')
    fd.set('password', 'super-secret-123')
    return fd
}

/** Admin double: `clients` supports select-chain + insert; `coach_client_assignments` supports insert. */
function buildAdmin({ existingClient = null }: { existingClient?: { id: string } | null } = {}) {
    const clientsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: existingClient }),
        insert: vi.fn().mockResolvedValue({ error: null }),
    }
    const assignmentsQuery = {
        insert: vi.fn().mockResolvedValue({ error: null }),
    }
    const admin = {
        from: vi.fn((table: string) => {
            if (table === 'clients') return clientsQuery
            if (table === 'coach_client_assignments') return assignmentsQuery
            throw new Error(`Unexpected table: ${table}`)
        }),
        auth: {
            admin: {
                createUser: vi
                    .fn()
                    .mockResolvedValue({ data: { user: { id: 'new-user-1' } }, error: null }),
                deleteUser: vi.fn().mockResolvedValue({ error: null }),
            },
        },
    }
    return { admin, clientsQuery, assignmentsQuery }
}

describe('joinViaInviteAction', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        rateLimitMock.mockResolvedValue({ ok: true })
        createClientIdentityMock.mockResolvedValue({ ok: true })
    })

    it('standalone → disabled state, NO auth.user and NO clients row (C-KILL)', async () => {
        const { admin, clientsQuery } = buildAdmin()
        createServiceRoleClientMock.mockReturnValue(admin)
        resolveInviteMock.mockResolvedValue({
            scope: 'standalone',
            coachId: 'coach-1',
            orgId: null,
            teamId: null,
            brandName: 'Coach Marca',
            primaryColor: '#10B981',
            logoUrl: null,
            welcomeMessage: null,
            loginHref: '/c/coach-marca/login',
        })

        const result = await joinViaInviteAction('CODE-STANDALONE', null, buildFormData())

        expect(result).toMatchObject({ disabled: true })
        expect((result as { error?: string }).error).toMatch(/desactivado/i)
        // Zero side effects: no user creation, no clients insert, no identity materialization.
        expect(admin.auth.admin.createUser).not.toHaveBeenCalled()
        expect(clientsQuery.insert).not.toHaveBeenCalled()
        expect(createClientIdentityMock).not.toHaveBeenCalled()
    })

    it('team → creates the auth.user + clients row (flow intact)', async () => {
        const { admin, clientsQuery, assignmentsQuery } = buildAdmin()
        createServiceRoleClientMock.mockReturnValue(admin)
        resolveInviteMock.mockResolvedValue({
            scope: 'team',
            coachId: 'owner-1',
            orgId: null,
            teamId: 'team-1',
            brandName: 'Equipo',
            primaryColor: null,
            logoUrl: null,
            welcomeMessage: null,
            loginHref: '/t/equipo/login',
        })

        const result = await joinViaInviteAction('CODE-TEAM', null, buildFormData())

        expect(result).toEqual({ success: true, loginHref: '/t/equipo/login' })
        expect(admin.auth.admin.createUser).toHaveBeenCalledTimes(1)
        expect(clientsQuery.insert).toHaveBeenCalledTimes(1)
        expect(clientsQuery.insert).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'new-user-1', coach_id: 'owner-1', team_id: 'team-1', org_id: null })
        )
        // team is NOT enterprise → no org assignment row.
        expect(assignmentsQuery.insert).not.toHaveBeenCalled()
    })

    it('enterprise → creates the auth.user + clients row + org assignment (flow intact)', async () => {
        const { admin, clientsQuery, assignmentsQuery } = buildAdmin()
        createServiceRoleClientMock.mockReturnValue(admin)
        resolveInviteMock.mockResolvedValue({
            scope: 'enterprise',
            coachId: 'coach-9',
            orgId: 'org-9',
            teamId: null,
            brandName: 'Org',
            primaryColor: null,
            logoUrl: null,
            welcomeMessage: null,
            loginHref: '/c/coach-9/login',
        })

        const result = await joinViaInviteAction('CODE-ORG', null, buildFormData())

        expect(result).toEqual({ success: true, loginHref: '/c/coach-9/login' })
        expect(admin.auth.admin.createUser).toHaveBeenCalledTimes(1)
        expect(clientsQuery.insert).toHaveBeenCalledWith(
            expect.objectContaining({ id: 'new-user-1', coach_id: 'coach-9', org_id: 'org-9', team_id: null })
        )
        expect(assignmentsQuery.insert).toHaveBeenCalledWith(
            expect.objectContaining({ org_id: 'org-9', client_id: 'new-user-1', coach_id: 'coach-9' })
        )
    })
})
