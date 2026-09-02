import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * `POST /api/mobile/coach/clients` — alta de alumno desde la app del coach.
 *
 * Este archivo cubre UNA cosa del contrato, la que otra superficie consume: la respuesta trae el
 * `clientId` de la fila recién creada. Sin él, el PATCH `converted` de `coach_leads` no tiene a
 * quién copiarle la atribución de la tarjeta compartida ni sobre quién emitir
 * `coach_client_referred` (deuda declarada de coach-leads W3).
 *
 * El resto del alta (muro de cupo, correos, workspaces) tiene su propia cobertura y no se re-prueba
 * acá: lo que se mockea es todo lo que sale del proceso.
 */
const {
    createServiceRoleClientMock,
    sendTransactionalEmailMock,
    sendClientLimitReachedEmailMock,
    assertPlatformEmailAvailableMock,
    resolvePreferredWorkspaceMock,
    createClientIdentityMock,
    captureAddStudentEmailTakenMock,
} = vi.hoisted(() => ({
    createServiceRoleClientMock: vi.fn(),
    sendTransactionalEmailMock: vi.fn(),
    sendClientLimitReachedEmailMock: vi.fn(),
    assertPlatformEmailAvailableMock: vi.fn(),
    resolvePreferredWorkspaceMock: vi.fn(),
    createClientIdentityMock: vi.fn(),
    captureAddStudentEmailTakenMock: vi.fn(),
}))

vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: createServiceRoleClientMock }))
vi.mock('@/lib/email/send-email', () => ({ sendTransactionalEmail: sendTransactionalEmailMock }))
vi.mock('@/services/billing/sales-emails.service', () => ({
    sendClientLimitReachedEmail: sendClientLimitReachedEmailMock,
}))
vi.mock('@/services/auth/workspace.service', () => ({
    resolvePreferredWorkspace: resolvePreferredWorkspaceMock,
}))
vi.mock('@/infrastructure/db/client-membership.repository', () => ({
    createClientIdentity: createClientIdentityMock,
}))
vi.mock('@/lib/posthog/add-student-events', () => ({
    captureAddStudentEmailTaken: captureAddStudentEmailTakenMock,
}))
// Solo la verificación de disponibilidad se finge: el resto del módulo (sanitizado, copys) es puro
// y participa del comportamiento que se está probando.
vi.mock('@/lib/auth/platform-email', async (importOriginal) => ({
    ...(await importOriginal<Record<string, unknown>>()),
    assertPlatformEmailAvailable: assertPlatformEmailAvailableMock,
}))

import { POST } from './route'

const NEW_CLIENT_ID = '2f1c4e3a-9d5b-4a7c-8e21-6b0d3f5a1c94'

const COACH = {
    id: 'coach-1',
    created_at: '2026-01-01T00:00:00.000Z',
    slug: 'coach-uno',
    invite_code: 'EVA123',
    full_name: 'Coach Uno',
    brand_name: 'Coach Uno',
    welcome_message: null,
    subscription_tier: 'pro',
    subscription_status: 'active',
    max_clients: 50,
    active_org_id: null,
    primary_color: null,
    logo_url: null,
}

/** `clients` se usa dos veces: el conteo de cupo (cadena awaiteada) y el insert. */
function clientsTable(activeCount: number) {
    const obj: Record<string, unknown> = {}
    Object.assign(obj, {
        select: vi.fn(() => obj),
        eq: vi.fn(() => obj),
        is: vi.fn(() => obj),
        insert: vi.fn(async () => ({ error: null })),
        then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
            Promise.resolve({ count: activeCount, error: null }).then(res, rej),
    })
    return obj as { insert: ReturnType<typeof vi.fn> } & Record<string, unknown>
}

function makeAdmin() {
    const clients = clientsTable(3)
    const createUser = vi.fn(async () => ({ data: { user: { id: NEW_CLIENT_ID } }, error: null }))
    const admin = {
        auth: {
            getUser: vi.fn(async () => ({
                data: { user: { id: 'coach-1', email: 'coach@eva-app.cl' } },
                error: null,
            })),
            admin: { createUser, deleteUser: vi.fn(async () => ({ error: null })) },
        },
        from: vi.fn((table: string) => {
            if (table === 'coaches') {
                return {
                    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: COACH, error: null }) }) }),
                }
            }
            return clients
        }),
    }
    return { admin, clients, createUser }
}

function req(body: Record<string, unknown>) {
    return new NextRequest('https://www.eva-app.cl/api/mobile/coach/clients', {
        method: 'POST',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: JSON.stringify(body),
    })
}

const VALID_BODY = {
    fullName: 'Ana Pérez',
    email: 'Ana@Example.com',
    phone: '912345678',
    tempPassword: 'Eva123456!',
    ageConfirmed: true,
    workspace: { kind: 'standalone', teamId: null, orgId: null },
}

describe('POST /api/mobile/coach/clients', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        assertPlatformEmailAvailableMock.mockResolvedValue({ ok: true })
        resolvePreferredWorkspaceMock.mockResolvedValue({ type: 'coach_standalone' })
        createClientIdentityMock.mockResolvedValue({ ok: true })
        sendTransactionalEmailMock.mockResolvedValue({ ok: true })
    })

    it('devuelve el `clientId` de la fila creada, además de lo que ya devolvía', async () => {
        const { admin, clients, createUser } = makeAdmin()
        createServiceRoleClientMock.mockReturnValue(admin)

        const res = await POST(req(VALID_BODY))

        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json).toMatchObject({
            ok: true,
            clientId: NEW_CLIENT_ID,
            clientName: 'Ana Pérez',
            newClientPhone: '912345678',
        })
        expect(typeof json.loginUrl).toBe('string')
        // El id devuelto es EL de la fila insertada, no otro: la conversión de solicitudes copia
        // la atribución sobre este uuid.
        expect(createUser).toHaveBeenCalled()
        expect(clients.insert).toHaveBeenCalledWith(expect.objectContaining({ id: NEW_CLIENT_ID }))
    })

    it('sin alumno creado no hay `clientId`: un bearer inválido corta antes', async () => {
        const { admin } = makeAdmin()
        admin.auth.getUser = vi.fn(async () => ({ data: { user: null }, error: { message: 'bad jwt' } })) as never
        createServiceRoleClientMock.mockReturnValue(admin)

        const res = await POST(req(VALID_BODY))

        expect(res.status).toBe(401)
        await expect(res.json()).resolves.toMatchObject({ code: 'INVALID_TOKEN' })
    })
})
