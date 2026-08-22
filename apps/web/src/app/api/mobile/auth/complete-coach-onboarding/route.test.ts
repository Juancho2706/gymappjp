import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Alta de coach por Google DESDE LA APP. El coach nace `active` y jamás pasa por `/auth/confirm`,
 * así que hasta W2.5 del embudo Free→Pro éste era el ÚNICO camino de alta que no mandaba ni
 * bienvenida ni serie de correos (diagnóstico W2.8, causa (4)).
 *
 * Lo que se pinnea acá es ese borde: el correo se dispara con los datos correctos y, si falla,
 * NUNCA convierte un alta exitosa en un error para la app.
 */

const harness = vi.hoisted(() => {
    const USER_ID = '11111111-1111-4111-8111-111111111111'
    const INVITE_CODE = 'X5UD9X44'
    const state = {
        tokenUser: { id: USER_ID, email: 'coach@example.com' } as { id: string; email: string } | null,
        tokenError: null as unknown,
        existingCoach: null as { id: string; slug: string } | null,
        existingTrial: null as { id: string } | null,
        existingSlug: null as { id: string } | null,
        insertError: null as { message: string } | null,
    }

    const sendFreeCoachOnboardingEmailsMock = vi.fn(async () => undefined)
    const generateUniqueInviteCodeMock = vi.fn(async () => INVITE_CODE)

    // Query builder mínimo: las tres lecturas del endpoint son `select().eq(col).maybeSingle()`.
    const adminStub = {
        auth: { getUser: async () => ({ data: { user: state.tokenUser }, error: state.tokenError }) },
        from: () => ({
            select: () => ({
                eq: (col: string) => ({
                    maybeSingle: async () => {
                        if (col === 'id') return { data: state.existingCoach }
                        if (col === 'trial_used_email') return { data: state.existingTrial }
                        return { data: state.existingSlug }
                    },
                }),
            }),
            insert: async () => ({ error: state.insertError }),
        }),
    }

    return { USER_ID, INVITE_CODE, adminStub, state, sendFreeCoachOnboardingEmailsMock, generateUniqueInviteCodeMock }
})

const { USER_ID, INVITE_CODE, adminStub, state, sendFreeCoachOnboardingEmailsMock, generateUniqueInviteCodeMock } =
    harness

// Las factories de `vi.mock` se izan por encima del destructuring: leen `harness.*` directo.
vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: () => harness.adminStub }))

vi.mock('@/lib/rate-limit', () => ({
    clientIpFromRequest: () => '127.0.0.1',
    rateLimitSignup: async () => ({ ok: true }),
    jsonRateLimited: () => new Response(null, { status: 429 }),
}))

vi.mock('@/lib/coach/invite-code.server', () => ({ generateUniqueInviteCode: harness.generateUniqueInviteCodeMock }))

vi.mock('@/lib/email/free-coach-onboarding', () => ({
    sendFreeCoachOnboardingEmails: harness.sendFreeCoachOnboardingEmailsMock,
}))

// W7.1: sin navegador no hay `coach_registered` posible desde el cliente — lo emite el endpoint.
type CaptureInput = {
    coachId: string
    tier: string
    method: string
    platform: string
    billingCycle?: string | null
}
const captureRegisteredMock = vi.hoisted(() => vi.fn<(input: CaptureInput) => Promise<void>>(async () => {}))
vi.mock('@/lib/posthog/registration-events', () => ({
    captureCoachRegisteredServer: captureRegisteredMock,
}))

import { POST } from './route'

function req(body: unknown, auth: string | null = 'Bearer ok', extraHeaders: Record<string, string> = {}) {
    return new NextRequest('http://localhost/api/mobile/auth/complete-coach-onboarding', {
        method: 'POST',
        headers: auth
            ? { authorization: auth, 'content-type': 'application/json', ...extraHeaders }
            : { ...extraHeaders },
        body: JSON.stringify(body),
    })
}

const BODY = {
    fullName: 'Josefa Díaz',
    brandName: 'Studio Fuerza',
    acceptLegal: true,
    acceptHealthData: true,
}

beforeEach(() => {
    vi.clearAllMocks()
    state.tokenUser = { id: USER_ID, email: 'coach@example.com' }
    state.tokenError = null
    state.existingCoach = null
    state.existingTrial = null
    state.existingSlug = null
    state.insertError = null
    sendFreeCoachOnboardingEmailsMock.mockResolvedValue(undefined)
    generateUniqueInviteCodeMock.mockResolvedValue(INVITE_CODE)
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.eva-app.cl')
})

describe('POST /api/mobile/auth/complete-coach-onboarding', () => {
    it('401 sin Authorization: Bearer y sin tocar el correo', async () => {
        const res = await POST(req(BODY, null))
        expect(res.status).toBe(401)
        expect(sendFreeCoachOnboardingEmailsMock).not.toHaveBeenCalled()
    })

    it('alta OK: manda bienvenida + drip con el email, el coachId y el invite_code recién creados', async () => {
        const res = await POST(req(BODY))

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true, slug: 'studio-fuerza' })
        expect(sendFreeCoachOnboardingEmailsMock).toHaveBeenCalledTimes(1)
        expect(sendFreeCoachOnboardingEmailsMock).toHaveBeenCalledWith({
            admin: adminStub,
            coachId: USER_ID,
            email: 'coach@example.com',
            coachName: 'Josefa Díaz',
            brandName: 'Studio Fuerza',
            inviteCode: INVITE_CODE,
            appUrl: 'https://www.eva-app.cl',
        })
    })

    it('un fallo del correo NO rompe la respuesta del alta', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        sendFreeCoachOnboardingEmailsMock.mockRejectedValue(new Error('resend caído'))

        const res = await POST(req(BODY))

        expect(res.status).toBe(200)
        expect((await res.json()).ok).toBe(true)
        expect(warn).toHaveBeenCalledWith('[complete-coach-onboarding] onboarding email failed')
        // El log no puede llevar PII: vive en Vercel sin retención acotada.
        expect(warn.mock.calls.flat().join(' ')).not.toContain('coach@example.com')
    })

    it('re-entrada (coach ya onboardeado): responde alreadyOnboarded y NO reenvía la serie', async () => {
        state.existingCoach = { id: USER_ID, slug: 'studio-fuerza' }

        const res = await POST(req(BODY))

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true, slug: 'studio-fuerza', alreadyOnboarded: true })
        expect(sendFreeCoachOnboardingEmailsMock).not.toHaveBeenCalled()
    })

    it('si el insert de coaches falla: 500 y ningún correo', async () => {
        state.insertError = { message: 'duplicate key' }

        const res = await POST(req(BODY))

        expect(res.status).toBe(500)
        expect(sendFreeCoachOnboardingEmailsMock).not.toHaveBeenCalled()
    })

    it('payload inválido: 400 y ningún correo', async () => {
        const res = await POST(req({ fullName: 'x', brandName: 'Studio', acceptLegal: true, acceptHealthData: true }))

        expect(res.status).toBe(400)
        expect(sendFreeCoachOnboardingEmailsMock).not.toHaveBeenCalled()
    })
})

/**
 * W7.1 — este es el camino de alta más invisible que existe: Google, desde la app, sin navegador
 * que pueda emitir nada. Es el corazón del hueco del 29 % de altas sin evento (21-08).
 */
describe('POST /api/mobile/auth/complete-coach-onboarding — analítica del alta', () => {
    it('emite `coach_registered` con method google y la plataforma del User-Agent', async () => {
        await POST(req(BODY, 'Bearer ok', { 'user-agent': 'EVA/85 CFNetwork/1568.100.1 Darwin/24.0.0' }))

        expect(captureRegisteredMock).toHaveBeenCalledWith({
            coachId: USER_ID,
            tier: 'free',
            method: 'google',
            platform: 'ios',
        })
    })

    it('sin header ni User-Agent reconocible: `unknown`, nunca un `web` inventado', async () => {
        await POST(req(BODY))

        expect(captureRegisteredMock).toHaveBeenCalledWith(expect.objectContaining({ platform: 'unknown' }))
    })

    it('re-entrada (coach ya onboardeado): no vuelve a contar el alta', async () => {
        state.existingCoach = { id: USER_ID, slug: 'studio-fuerza' }

        await POST(req(BODY, 'Bearer ok', { 'user-agent': 'okhttp/4.9.2' }))

        expect(captureRegisteredMock).not.toHaveBeenCalled()
    })

    it('insert fallido: cero eventos', async () => {
        state.insertError = { message: 'duplicate key' }

        await POST(req(BODY, 'Bearer ok', { 'user-agent': 'okhttp/4.9.2' }))

        expect(captureRegisteredMock).not.toHaveBeenCalled()
    })
})
