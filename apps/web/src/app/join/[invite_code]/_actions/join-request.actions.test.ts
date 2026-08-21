import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
    createServiceRoleClientMock,
    resolveInviteMock,
    rateLimitMock,
    captureServerEventMock,
    notifyCoachOfLeadMock,
} = vi.hoisted(() => ({
    createServiceRoleClientMock: vi.fn(),
    resolveInviteMock: vi.fn(),
    rateLimitMock: vi.fn(),
    captureServerEventMock: vi.fn(),
    notifyCoachOfLeadMock: vi.fn(),
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

vi.mock('../_lib/resolve-invite', () => ({
    resolveInvite: resolveInviteMock,
}))

// Importa CUÁNDO se manda el correo, no el HTML (el helper tiene su propio fail-open y no debe
// pegarle a Resend en tests).
vi.mock('@/lib/email/coach-lead-notification', () => ({
    notifyCoachOfLead: notifyCoachOfLeadMock,
}))

vi.mock('@/lib/posthog/server-capture', () => ({
    capturePostHogServerEvent: captureServerEventMock,
}))

// `resolveJoinReferral` va REAL a propósito: la pertenencia del `ref` al espacio del código es
// justo lo que este action no puede delegar en el cliente.

import { requestJoinAction } from './join-request.actions'

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

function buildFormData(
    overrides: Partial<Record<'full_name' | 'phone' | 'email' | 'message' | 'consent' | 'ref' | 'src' | 'k', string>> = {},
    { omitConsent = false }: { omitConsent?: boolean } = {}
) {
    const fd = new FormData()
    fd.set('cf-turnstile-response', 'token-ok')
    fd.set('full_name', 'Alumna Test')
    fd.set('phone', '+56 9 1234 5678')
    if (!omitConsent) fd.set('consent', 'on')
    for (const [key, value] of Object.entries(overrides)) fd.set(key, value as string)
    return fd
}

function buildAdmin({
    duplicate = null,
    referrerRow = null,
    referrerName = 'Alumna Referente',
    insertError = null,
}: {
    duplicate?: { id: string } | null
    referrerRow?: { id: string; coach_id: string | null; org_id: string | null; team_id: string | null } | null
    referrerName?: string | null
    insertError?: { message: string } | null
} = {}) {
    const leadsQuery = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data: duplicate, error: null })),
        insert: vi.fn(async () => ({ error: insertError })),
    }

    // Dos lecturas distintas pegan a `clients`: la del referente (columnas con `coach_id`, dentro
    // de resolveJoinReferral) y la del nombre para el correo (`full_name`).
    let lastSelect = ''
    const clientsQuery = {
        select: vi.fn((columns?: string) => {
            lastSelect = columns ?? ''
            return clientsQuery
        }),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () =>
            lastSelect.includes('coach_id')
                ? { data: referrerRow, error: null }
                : { data: referrerName ? { full_name: referrerName } : null, error: null }
        ),
    }

    const admin = {
        from: vi.fn((table: string) => {
            if (table === 'coach_leads') return leadsQuery
            if (table === 'clients') return clientsQuery
            throw new Error(`Unexpected table: ${table}`)
        }),
    }
    return { admin, leadsQuery, clientsQuery }
}

describe('requestJoinAction', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        rateLimitMock.mockResolvedValue({ ok: true })
        resolveInviteMock.mockResolvedValue(STANDALONE_INVITE)
        process.env.TURNSTILE_SECRET_KEY = 'test-secret'
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({ json: async () => ({ success: true }) }) as unknown as Response)
        )
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        delete process.env.TURNSTILE_SECRET_KEY
    })

    it('crea el lead, le avisa al coach y emite coach_lead_received', async () => {
        const { admin, leadsQuery } = buildAdmin({
            referrerRow: { id: REFERRER_ID, coach_id: 'coach-1', org_id: null, team_id: null },
        })
        createServiceRoleClientMock.mockReturnValue(admin)

        const result = await requestJoinAction(
            'CODE-STANDALONE',
            null,
            buildFormData({
                email: 'alumna@example.com',
                message: 'Quiero empezar en marzo',
                ref: REFERRER_ID,
                src: 'share_card',
                k: 'placa',
            })
        )

        expect(result).toEqual({ success: true })

        // NO se toca auth ni clients: el mock lanza ante cualquier tabla inesperada, así que este
        // test también prueba que la solicitud no crea alumno.
        expect(leadsQuery.insert).toHaveBeenCalledWith(
            expect.objectContaining({
                coach_id: 'coach-1',
                full_name: 'Alumna Test',
                phone: '+56 9 1234 5678',
                email: 'alumna@example.com',
                message: 'Quiero empezar en marzo',
                referred_by_client_id: REFERRER_ID,
                referral_source: 'share_card',
                referral_card_kind: 'placa',
            })
        )

        expect(notifyCoachOfLeadMock).toHaveBeenCalledWith(
            admin,
            expect.objectContaining({
                coachId: 'coach-1',
                brandName: 'Coach Marca',
                fullName: 'Alumna Test',
                phone: '+56 9 1234 5678',
                email: 'alumna@example.com',
                referrerName: 'Alumna Referente',
            })
        )

        // Evento del coach: ni nombre, ni teléfono, ni correo del solicitante (Ley 21.719).
        expect(captureServerEventMock).toHaveBeenCalledWith({
            event: 'coach_lead_received',
            distinctId: 'coach-1',
            properties: { referred: true, card_kind: 'placa', source: 'share_card' },
        })
    })

    it('dedup 7 días: un segundo envío idéntico no inserta y devuelve el MISMO éxito', async () => {
        const { admin, leadsQuery } = buildAdmin({ duplicate: { id: 'lead-existente' } })
        createServiceRoleClientMock.mockReturnValue(admin)

        const result = await requestJoinAction('CODE-STANDALONE', null, buildFormData({ email: 'a@example.com' }))

        // Mismo éxito: el form no puede volverse un oráculo de quién ya escribió.
        expect(result).toEqual({ success: true })
        expect(leadsQuery.insert).not.toHaveBeenCalled()
        expect(notifyCoachOfLeadMock).not.toHaveBeenCalled()
        expect(captureServerEventMock).not.toHaveBeenCalled()

        // La ventana y el filtro de contacto son el corazón del dedup.
        expect(leadsQuery.in).toHaveBeenCalledWith('status', ['new', 'contacted'])
        const since = leadsQuery.gte.mock.calls[0]?.[1] as string
        const elapsedDays = (Date.now() - new Date(since).getTime()) / 86_400_000
        expect(elapsedDays).toBeGreaterThan(6.9)
        expect(elapsedDays).toBeLessThan(7.1)
        expect(leadsQuery.or).toHaveBeenCalledWith('phone.eq."+56 9 1234 5678",email.eq."a@example.com"')
    })

    it('sin consentimiento no guarda NADA (Ley 21.719)', async () => {
        const { admin, leadsQuery } = buildAdmin()
        createServiceRoleClientMock.mockReturnValue(admin)

        const result = await requestJoinAction('CODE-STANDALONE', null, buildFormData({}, { omitConsent: true }))

        expect(result.error).toMatch(/acept/i)
        expect(result.success).toBeUndefined()
        expect(leadsQuery.insert).not.toHaveBeenCalled()
        expect(notifyCoachOfLeadMock).not.toHaveBeenCalled()
    })

    it('Turnstile fallido → rechaza antes de tocar la DB', async () => {
        const { admin, leadsQuery } = buildAdmin()
        createServiceRoleClientMock.mockReturnValue(admin)
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => ({ json: async () => ({ success: false }) }) as unknown as Response)
        )

        const result = await requestJoinAction('CODE-STANDALONE', null, buildFormData())

        expect(result.error).toMatch(/verificación de seguridad/i)
        expect(leadsQuery.insert).not.toHaveBeenCalled()
        expect(createServiceRoleClientMock).not.toHaveBeenCalled()
    })

    it('sin token de Turnstile (con secret configurada) → rechaza', async () => {
        const { admin } = buildAdmin()
        createServiceRoleClientMock.mockReturnValue(admin)
        const fd = buildFormData()
        fd.delete('cf-turnstile-response')

        const result = await requestJoinAction('CODE-STANDALONE', null, fd)

        expect(result.error).toMatch(/verificación de seguridad requerida/i)
    })

    it('ref de OTRO coach → la solicitud entra SIN atribución (anti cross-tenant)', async () => {
        const { admin, leadsQuery } = buildAdmin({
            referrerRow: { id: REFERRER_ID, coach_id: 'otro-coach', org_id: null, team_id: null },
        })
        createServiceRoleClientMock.mockReturnValue(admin)

        const result = await requestJoinAction(
            'CODE-STANDALONE',
            null,
            buildFormData({ ref: REFERRER_ID, src: 'share_card', k: 'placa' })
        )

        expect(result).toEqual({ success: true })
        expect(leadsQuery.insert).toHaveBeenCalledWith(
            expect.objectContaining({
                referred_by_client_id: null,
                referral_source: null,
                referral_card_kind: null,
            })
        )
        expect(notifyCoachOfLeadMock).toHaveBeenCalledWith(admin, expect.objectContaining({ referrerName: null }))
        expect(captureServerEventMock).toHaveBeenCalledWith({
            event: 'coach_lead_received',
            distinctId: 'coach-1',
            properties: { referred: false, card_kind: null, source: null },
        })
    })

    it('WhatsApp faltante o muy corto → error claro y sin escritura', async () => {
        const { admin, leadsQuery } = buildAdmin()
        createServiceRoleClientMock.mockReturnValue(admin)

        const result = await requestJoinAction('CODE-STANDALONE', null, buildFormData({ phone: '123' }))

        expect(result.error).toMatch(/whatsapp/i)
        expect(leadsQuery.insert).not.toHaveBeenCalled()
    })

    it('código de team/org → no acepta solicitudes (ese camino conserva su autoalta)', async () => {
        const { admin, leadsQuery } = buildAdmin()
        createServiceRoleClientMock.mockReturnValue(admin)
        resolveInviteMock.mockResolvedValue(TEAM_INVITE)

        const result = await requestJoinAction('CODE-TEAM', null, buildFormData())

        expect(result.error).toMatch(/no admite solicitudes/i)
        expect(leadsQuery.insert).not.toHaveBeenCalled()
    })

    it('rate limit agotado → corta antes de todo', async () => {
        rateLimitMock.mockResolvedValue({ ok: false })

        const result = await requestJoinAction('CODE-STANDALONE', null, buildFormData())

        expect(result.error).toMatch(/demasiados intentos/i)
        expect(createServiceRoleClientMock).not.toHaveBeenCalled()
    })

    it('si el insert falla, el error es genérico y no se manda correo ni evento', async () => {
        const { admin } = buildAdmin({ insertError: { message: 'boom' } })
        createServiceRoleClientMock.mockReturnValue(admin)

        const result = await requestJoinAction('CODE-STANDALONE', null, buildFormData())

        expect(result.error).toMatch(/no pudimos enviar tu solicitud/i)
        expect(notifyCoachOfLeadMock).not.toHaveBeenCalled()
        expect(captureServerEventMock).not.toHaveBeenCalled()
    })
})
