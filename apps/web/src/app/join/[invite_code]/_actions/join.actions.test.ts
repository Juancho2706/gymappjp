import { beforeEach, describe, expect, it, vi } from 'vitest'

// Mocks hoisted so vi.mock factories can reference them.
const {
    createServiceRoleClientMock,
    resolveInviteMock,
    createClientIdentityMock,
    rateLimitMock,
    captureServerEventMock,
} = vi.hoisted(() => ({
    createServiceRoleClientMock: vi.fn(),
    resolveInviteMock: vi.fn(),
    createClientIdentityMock: vi.fn(),
    rateLimitMock: vi.fn(),
    captureServerEventMock: vi.fn(),
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
// three scope branches from here.
vi.mock('../_lib/resolve-invite', () => ({
    resolveInvite: resolveInviteMock,
}))

vi.mock('@/infrastructure/db/client-membership.repository', () => ({
    createClientIdentity: createClientIdentityMock,
}))

// F6: el POST a PostHog no se hace en tests; lo que importa es CUÁNDO se emite y con qué props.
vi.mock('@/lib/posthog/server-capture', () => ({
    capturePostHogServerEvent: captureServerEventMock,
}))

import { joinViaInviteAction } from './join.actions'

/** `referral` simula el link de una tarjeta compartida (`?ref&src&k` → inputs ocultos). */
function buildFormData(referral?: { ref?: string; src?: string; k?: string }) {
    const fd = new FormData()
    fd.set('full_name', 'Alumna Test')
    fd.set('email', 'alumna@example.com')
    fd.set('phone', '+56 9 1234 5678')
    fd.set('password', 'super-secret-123')
    if (referral?.ref) fd.set('ref', referral.ref)
    if (referral?.src) fd.set('src', referral.src)
    if (referral?.k) fd.set('k', referral.k)
    return fd
}

/**
 * Admin double: `clients` soporta select-chain + insert + conteo (await directo del builder,
 * para el cerco P7); `organizations` soporta el select de `client_limit`; `coaches` el del cupo
 * standalone; `coach_client_assignments` soporta insert.
 */
function buildAdmin({
    existingClient = null,
    orgRow = { client_limit: 100 },
    coachRow = { max_clients: 25, subscription_tier: 'pro', created_at: '2026-08-19T00:00:00.000Z' },
    activeCount = 0,
    countError = null,
    referrerRow = null,
}: {
    existingClient?: { id: string } | null
    orgRow?: { client_limit: number } | null
    /** Cupo del coach para el scope standalone (`max_clients` gana sobre el tier). */
    coachRow?: { max_clients: number | null; subscription_tier: string; created_at: string } | null
    activeCount?: number
    countError?: { message: string } | null
    /** F6: fila que devuelve la búsqueda del alumno que refirió (`null` = no existe). */
    referrerRow?: { id: string; coach_id: string | null; org_id: string | null; team_id: string | null } | null
} = {}) {
    // Dos lecturas distintas pegan a `clients` con .maybeSingle(): el chequeo de email duplicado
    // (select 'id') y la búsqueda del referente (select con coach_id/org_id/team_id). Se
    // distinguen por las columnas pedidas.
    let lastSelect = ''
    const clientsQuery = {
        select: vi.fn((columns?: string) => {
            lastSelect = columns ?? ''
            return clientsQuery
        }),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () =>
            lastSelect.includes('coach_id')
                ? { data: referrerRow, error: null }
                : { data: existingClient, error: null }
        ),
        insert: vi.fn().mockResolvedValue({ error: null }),
        // El conteo de activos del cerco P7 hace `await` del builder directo (head:true).
        then: (onFulfilled: (v: unknown) => unknown) =>
            Promise.resolve({ count: countError ? null : activeCount, error: countError }).then(onFulfilled),
    }
    const organizationsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: orgRow }),
    }
    const coachesQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: coachRow, error: null }),
    }
    const assignmentsQuery = {
        insert: vi.fn().mockResolvedValue({ error: null }),
    }
    const admin = {
        from: vi.fn((table: string) => {
            if (table === 'clients') return clientsQuery
            if (table === 'organizations') return organizationsQuery
            if (table === 'coaches') return coachesQuery
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
    return { admin, clientsQuery, organizationsQuery, coachesQuery, assignmentsQuery }
}

const STANDALONE_INVITE = {
    scope: 'standalone' as const,
    coachId: 'coach-1',
    orgId: null,
    teamId: null,
    brandName: 'Coach Marca',
    primaryColor: '#10B981',
    logoUrl: null,
    welcomeMessage: null,
    loginHref: '/c/coach-marca/login',
}

const ENTERPRISE_INVITE = {
    scope: 'enterprise' as const,
    coachId: 'coach-9',
    orgId: 'org-9',
    teamId: null,
    brandName: 'Org',
    primaryColor: null,
    logoUrl: null,
    welcomeMessage: null,
    loginHref: '/c/coach-9/login',
}

describe('joinViaInviteAction', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        rateLimitMock.mockResolvedValue({ ok: true })
        createClientIdentityMock.mockResolvedValue({ ok: true })
    })

    // Decisión del owner (2026-08-21): standalone dejó de dar de alta — ahora deja una SOLICITUD
    // (`requestJoinAction` → `coach_leads`). Este action conserva el corte como defensa en
    // profundidad: aunque alguien lo invoque a mano con un código standalone, no crea NADA.
    it('standalone → rechaza y manda a enviar solicitud, sin crear auth.user ni fila', async () => {
        const { admin, clientsQuery, assignmentsQuery } = buildAdmin()
        createServiceRoleClientMock.mockReturnValue(admin)
        resolveInviteMock.mockResolvedValue(STANDALONE_INVITE)

        const result = await joinViaInviteAction('CODE-STANDALONE', null, buildFormData())

        expect(result).toEqual({ error: 'Para entrenar con este coach envía una solicitud.' })
        expect(admin.auth.admin.createUser).not.toHaveBeenCalled()
        expect(clientsQuery.insert).not.toHaveBeenCalled()
        expect(createClientIdentityMock).not.toHaveBeenCalled()
        expect(assignmentsQuery.insert).not.toHaveBeenCalled()
        expect(captureServerEventMock).not.toHaveBeenCalled()
    })

    it('standalone con ref de tarjeta compartida → tampoco crea nada (el corte es antes)', async () => {
        const { admin, clientsQuery } = buildAdmin({
            referrerRow: { id: REFERRER_ID, coach_id: 'coach-1', org_id: null, team_id: null },
        })
        createServiceRoleClientMock.mockReturnValue(admin)
        resolveInviteMock.mockResolvedValue(STANDALONE_INVITE)

        const result = await joinViaInviteAction(
            'CODE-STANDALONE',
            null,
            buildFormData({ ref: REFERRER_ID, src: 'share_card', k: 'placa' })
        )

        expect(result).toEqual({ error: 'Para entrenar con este coach envía una solicitud.' })
        expect(clientsQuery.insert).not.toHaveBeenCalled()
        expect(captureServerEventMock).not.toHaveBeenCalled()
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

    // ── P7 (pricing v2): cerco de verdad — el join cuenta activos vs el cupo ANTES del insert ──

    it('enterprise → cupo lleno (client_limit alcanzado): rechaza SIN crear auth.user ni fila', async () => {
        const { admin, clientsQuery } = buildAdmin({ orgRow: { client_limit: 2 }, activeCount: 2 })
        createServiceRoleClientMock.mockReturnValue(admin)
        resolveInviteMock.mockResolvedValue(ENTERPRISE_INVITE)

        const result = await joinViaInviteAction('CODE-ORG', null, buildFormData())

        expect((result as { error?: string }).error).toMatch(/límite de alumnos/i)
        expect((result as { success?: boolean }).success).toBeUndefined()
        // Cero efectos: el hueco era exactamente este insert sin conteo.
        expect(admin.auth.admin.createUser).not.toHaveBeenCalled()
        expect(clientsQuery.insert).not.toHaveBeenCalled()
        expect(createClientIdentityMock).not.toHaveBeenCalled()
    })

    it('enterprise → un cupo libre (used < limit): el alta procede', async () => {
        const { admin, clientsQuery } = buildAdmin({ orgRow: { client_limit: 3 }, activeCount: 2 })
        createServiceRoleClientMock.mockReturnValue(admin)
        resolveInviteMock.mockResolvedValue(ENTERPRISE_INVITE)

        const result = await joinViaInviteAction('CODE-ORG', null, buildFormData())

        expect(result).toEqual({ success: true, loginHref: '/c/coach-9/login' })
        expect(clientsQuery.insert).toHaveBeenCalledTimes(1)
    })

    it('enterprise → organización sin fila/limite inválido: fail-closed, no crea nada', async () => {
        const { admin, clientsQuery } = buildAdmin({ orgRow: null })
        createServiceRoleClientMock.mockReturnValue(admin)
        resolveInviteMock.mockResolvedValue(ENTERPRISE_INVITE)

        const result = await joinViaInviteAction('CODE-ORG', null, buildFormData())

        expect((result as { error?: string }).error).toMatch(/no pudimos validar el cupo/i)
        expect(admin.auth.admin.createUser).not.toHaveBeenCalled()
        expect(clientsQuery.insert).not.toHaveBeenCalled()
    })

    it('enterprise → error contando activos: fail-closed, no crea nada', async () => {
        const { admin, clientsQuery } = buildAdmin({ countError: { message: 'boom' } })
        createServiceRoleClientMock.mockReturnValue(admin)
        resolveInviteMock.mockResolvedValue(ENTERPRISE_INVITE)

        const result = await joinViaInviteAction('CODE-ORG', null, buildFormData())

        expect((result as { error?: string }).error).toMatch(/no pudimos validar el cupo/i)
        expect(admin.auth.admin.createUser).not.toHaveBeenCalled()
        expect(clientsQuery.insert).not.toHaveBeenCalled()
    })

    it('team → pool sin cuota de alumnos: el alta procede sin consultar organizaciones ni coaches', async () => {
        // teams.seat_limit limita COACHES (team_members_seat_guard), no el pool de alumnos:
        // el mock lanza ante cualquier tabla inesperada, así que este test también prueba
        // que el camino team no consulta organizations/coaches.
        const { admin } = buildAdmin()
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
    })

    // ── F6 (workout-share): atribución del alta que llega por una tarjeta compartida ──

    const TEAM_INVITE = {
        scope: 'team' as const,
        coachId: 'owner-1',
        orgId: null,
        teamId: 'team-1',
        brandName: 'Equipo',
        primaryColor: null,
        logoUrl: null,
        welcomeMessage: null,
        loginHref: '/t/equipo/login',
    }
    const REFERRER_ID = '11111111-1111-1111-1111-111111111111'

    it('ref válido del mismo equipo → persiste la atribución y emite coach_client_referred', async () => {
        const { admin, clientsQuery } = buildAdmin({
            referrerRow: { id: REFERRER_ID, coach_id: 'owner-1', org_id: null, team_id: 'team-1' },
        })
        createServiceRoleClientMock.mockReturnValue(admin)
        resolveInviteMock.mockResolvedValue(TEAM_INVITE)

        const result = await joinViaInviteAction(
            'CODE-TEAM',
            null,
            buildFormData({ ref: REFERRER_ID, src: 'share_card', k: 'placa' })
        )

        expect(result).toEqual({ success: true, loginHref: '/t/equipo/login' })
        expect(clientsQuery.insert).toHaveBeenCalledWith(
            expect.objectContaining({
                referred_by_client_id: REFERRER_ID,
                referral_source: 'share_card',
                referral_card_kind: 'placa',
            })
        )
        // Evento del coach, sin un solo dato del alumno nuevo ni de salud (Ley 21.719).
        expect(captureServerEventMock).toHaveBeenCalledWith({
            event: 'coach_client_referred',
            distinctId: 'owner-1',
            properties: { referred_by_client_id: REFERRER_ID, card_kind: 'placa' },
        })
    })

    it('ref de OTRO espacio → el alta procede sin atribución y sin evento (anti cross-tenant)', async () => {
        const { admin, clientsQuery } = buildAdmin({
            referrerRow: { id: REFERRER_ID, coach_id: 'otro-coach', org_id: null, team_id: 'team-ajeno' },
        })
        createServiceRoleClientMock.mockReturnValue(admin)
        resolveInviteMock.mockResolvedValue(TEAM_INVITE)

        const result = await joinViaInviteAction(
            'CODE-TEAM',
            null,
            buildFormData({ ref: REFERRER_ID, src: 'share_card', k: 'placa' })
        )

        expect(result).toEqual({ success: true, loginHref: '/t/equipo/login' })
        const inserted = clientsQuery.insert.mock.calls[0]?.[0] as Record<string, unknown>
        expect(inserted.referred_by_client_id).toBeUndefined()
        expect(inserted.referral_source).toBeUndefined()
        expect(captureServerEventMock).not.toHaveBeenCalled()
    })

    it('ref inexistente o parámetros fuera de la lista blanca → alta normal sin atribución', async () => {
        const { admin, clientsQuery } = buildAdmin({ referrerRow: null })
        createServiceRoleClientMock.mockReturnValue(admin)
        resolveInviteMock.mockResolvedValue(TEAM_INVITE)

        // uuid inválido + fuente desconocida: ni siquiera llega a consultar la DB.
        const bad = await joinViaInviteAction(
            'CODE-TEAM',
            null,
            buildFormData({ ref: 'no-es-uuid', src: 'email_blast', k: 'placa' })
        )
        expect(bad).toEqual({ success: true, loginHref: '/t/equipo/login' })
        expect(
            (clientsQuery.insert.mock.calls[0]?.[0] as Record<string, unknown>).referred_by_client_id
        ).toBeUndefined()

        // uuid bien formado pero el alumno no existe.
        const missing = await joinViaInviteAction(
            'CODE-TEAM',
            null,
            buildFormData({ ref: REFERRER_ID, src: 'share_card', k: 'placa' })
        )
        expect(missing).toEqual({ success: true, loginHref: '/t/equipo/login' })
        expect(
            (clientsQuery.insert.mock.calls[1]?.[0] as Record<string, unknown>).referred_by_client_id
        ).toBeUndefined()
        expect(captureServerEventMock).not.toHaveBeenCalled()
    })

    it('preset `k` inventado → descarta la atribución entera (señal de link manipulado)', async () => {
        const { admin, clientsQuery } = buildAdmin({
            referrerRow: { id: REFERRER_ID, coach_id: 'owner-1', org_id: null, team_id: 'team-1' },
        })
        createServiceRoleClientMock.mockReturnValue(admin)
        resolveInviteMock.mockResolvedValue(TEAM_INVITE)

        const result = await joinViaInviteAction(
            'CODE-TEAM',
            null,
            buildFormData({ ref: REFERRER_ID, src: 'share_card', k: 'preset-pirata' })
        )

        expect(result).toEqual({ success: true, loginHref: '/t/equipo/login' })
        expect(
            (clientsQuery.insert.mock.calls[0]?.[0] as Record<string, unknown>).referred_by_client_id
        ).toBeUndefined()
        expect(captureServerEventMock).not.toHaveBeenCalled()
    })
})
