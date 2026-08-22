import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Alta de coach free DESDE LA APP.
 *
 * W4.1 del embudo Free→Pro: la respuesta tiene que devolver el `uid` del usuario recién creado. Es
 * la ÚNICA llave que la app tiene para pedir el reenvío del correo de confirmación
 * (`api/mobile/auth/resend-confirmation`): hasta que el coach confirma no hay sesión, así que sin
 * ese id un correo caído en spam dejaba la cuenta muerta sin salida.
 */

const USER_ID = '11111111-1111-4111-8111-111111111111'

type CaptureInput = {
    coachId: string
    tier: string
    method: string
    platform: string
    billingCycle?: string | null
}

const harness = vi.hoisted(() => {
    const state = {
        signupAllowed: true,
        ipCoachCount: 0,
        existingSlug: null as { id: string } | null,
        emailAvailable: true,
        createUserError: null as { message: string } | null,
        coachInsertError: null as { message: string } | null,
        emailSent: true,
    }
    const createUserMock = vi.fn(async () => ({
        data: state.createUserError ? { user: null } : { user: { id: '11111111-1111-4111-8111-111111111111' } },
        error: state.createUserError,
    }))
    const deleteUserMock = vi.fn(async () => ({ error: null }))
    const coachDeleteEq = vi.fn(async () => ({ error: null }))
    const sendSignupMock = vi.fn(async () =>
        state.emailSent ? { ok: true } : { ok: false, error: 'resend 500' }
    )
    const coachInserts: Record<string, unknown>[] = []

    const adminStub = {
        auth: { admin: { createUser: createUserMock, deleteUser: deleteUserMock } },
        from: () => ({
            select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
                if (opts?.head) {
                    // Conteo de altas free por IP en los últimos 7 días.
                    const q = {
                        eq: () => q,
                        gte: async () => ({ count: state.ipCoachCount }),
                    }
                    return q
                }
                return { eq: () => ({ maybeSingle: async () => ({ data: state.existingSlug }) }) }
            },
            insert: async (row: Record<string, unknown>) => {
                coachInserts.push(row)
                return { error: state.coachInsertError }
            },
            delete: () => ({ eq: coachDeleteEq }),
        }),
    }

    return { state, adminStub, createUserMock, deleteUserMock, coachDeleteEq, sendSignupMock, coachInserts }
})

const { state, createUserMock, deleteUserMock, coachDeleteEq, sendSignupMock, coachInserts } = harness

vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: () => harness.adminStub }))

vi.mock('@/lib/rate-limit', () => ({
    clientIpFromRequest: () => '203.0.113.7',
    rateLimitSignup: async () =>
        harness.state.signupAllowed ? { ok: true } : { ok: false, retryAfter: 60 },
    jsonRateLimited: () => new Response(null, { status: 429 }),
}))

vi.mock('@/lib/auth/platform-email', () => ({
    assertPlatformEmailAvailable: async () =>
        harness.state.emailAvailable ? { ok: true } : { ok: false, error: 'tomado' },
    isAuthDuplicateEmailMessage: () => false,
    normalizePlatformEmail: (e: string) => e.trim().toLowerCase(),
    sanitizePlatformEmail: (e: string) => e.trim().toLowerCase(),
}))

vi.mock('@/lib/coach/invite-code.server', () => ({ generateUniqueInviteCode: async () => 'X5UD9X44' }))

vi.mock('@/lib/auth/send-coach-email-confirmation', () => ({
    sendCoachSignupConfirmationEmail: harness.sendSignupMock,
}))

// W7.1: el alta desde la app no tiene navegador, así que `coach_registered` sale del servidor.
const captureRegisteredMock = vi.hoisted(() => vi.fn<(input: CaptureInput) => Promise<void>>(async () => {}))
vi.mock('@/lib/posthog/registration-events', () => ({
    captureCoachRegisteredServer: captureRegisteredMock,
}))

import { POST } from './route'

const BODY = {
    fullName: 'Josefa Díaz',
    brandName: 'Studio Fuerza',
    email: 'Josefa@Example.com',
    password: 'una-clave-larga',
    acceptLegal: true,
    acceptHealthData: true,
}

function req(body: unknown, extraHeaders: Record<string, string> = {}) {
    return new NextRequest('http://localhost/api/mobile/auth/register-coach-free', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...extraHeaders },
        body: JSON.stringify(body),
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    coachInserts.length = 0
    state.signupAllowed = true
    state.ipCoachCount = 0
    state.existingSlug = null
    state.emailAvailable = true
    state.createUserError = null
    state.coachInsertError = null
    state.emailSent = true
})

describe('POST /api/mobile/auth/register-coach-free', () => {
    it('alta OK: la respuesta lleva el `uid` del usuario creado (llave del reenvío)', async () => {
        const res = await POST(req(BODY))

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({
            ok: true,
            uid: USER_ID,
            email: 'josefa@example.com',
            slug: 'studio-fuerza',
            message: 'Revisa tu correo para confirmar tu cuenta.',
        })
        expect(createUserMock).toHaveBeenCalledTimes(1)
        expect(coachInserts[0]).toMatchObject({ id: USER_ID, subscription_status: 'pending_email' })
        expect(sendSignupMock).toHaveBeenCalledTimes(1)
    })

    it('si el correo de confirmación no sale, se hace rollback y NO se devuelve uid', async () => {
        state.emailSent = false

        const res = await POST(req(BODY))

        expect(res.status).toBe(502)
        expect(await res.json()).toMatchObject({ code: 'CONFIRMATION_EMAIL_FAILED' })
        expect(coachDeleteEq).toHaveBeenCalledWith('id', USER_ID)
        expect(deleteUserMock).toHaveBeenCalledWith(USER_ID)
    })

    it('payload inválido ⇒ 400 sin crear nada', async () => {
        const res = await POST(req({ ...BODY, acceptLegal: false }))

        expect(res.status).toBe(400)
        expect(createUserMock).not.toHaveBeenCalled()
        expect(sendSignupMock).not.toHaveBeenCalled()
    })

    it('insert de `coaches` fallido ⇒ 500, rollback del usuario y ningún correo', async () => {
        state.coachInsertError = { message: 'boom' }

        const res = await POST(req(BODY))

        expect(res.status).toBe(500)
        expect(deleteUserMock).toHaveBeenCalledWith(USER_ID)
        expect(sendSignupMock).not.toHaveBeenCalled()
    })
})

/**
 * W7.1 — `platform` en el alta. La app NO manda header de plataforma hoy (`apps/mobile/lib/api.ts`
 * solo setea `Content-Type` y `Authorization`): el User-Agent es la fuente real.
 */
describe('POST /api/mobile/auth/register-coach-free — analítica del alta', () => {
    it('Android (okhttp): emite `coach_registered` con la plataforma inferida', async () => {
        await POST(req(BODY, { 'user-agent': 'okhttp/4.9.2' }))

        expect(captureRegisteredMock).toHaveBeenCalledWith({
            coachId: USER_ID,
            tier: 'free',
            method: 'email',
            platform: 'android',
        })
    })

    it('iOS (CFNetwork/Darwin): misma emisión con `platform: ios`', async () => {
        await POST(req(BODY, { 'user-agent': 'EVA/85 CFNetwork/1568.100.1 Darwin/24.0.0' }))

        expect(captureRegisteredMock).toHaveBeenCalledWith(expect.objectContaining({ platform: 'ios' }))
    })

    it('el header explícito gana cuando la app empiece a mandarlo', async () => {
        await POST(req(BODY, { 'user-agent': 'okhttp/4.9.2', 'x-eva-platform': 'ios' }))

        expect(captureRegisteredMock).toHaveBeenCalledWith(expect.objectContaining({ platform: 'ios' }))
    })

    // El alta se revierte entera si el correo de confirmación no sale: contar ese intento como
    // alta dejaría el embudo mintiendo justo en el paso final.
    it('si el alta hace rollback NO se emite nada', async () => {
        state.emailSent = false

        await POST(req(BODY, { 'user-agent': 'okhttp/4.9.2' }))

        expect(captureRegisteredMock).not.toHaveBeenCalled()
    })
})
