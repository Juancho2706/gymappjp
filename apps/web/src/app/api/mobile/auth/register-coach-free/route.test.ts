import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Alta de coach free DESDE LA APP.
 *
 * W4.1 del embudo Free→Pro: la respuesta tiene que devolver el `uid` del usuario recién creado. Es
 * la ÚNICA llave que la app tiene para pedir el reenvío del correo de confirmación
 * (`api/mobile/auth/resend-confirmation`): hasta que el coach confirma no hay sesión, así que sin
 * ese id un correo caído en spam dejaba la cuenta muerta sin salida.
 *
 * W3.2 de `docs/specs/flujo-coach-nuevo` (D1 = A, espejo RN de W3.1): el alta free ya no tiene muro
 * de correo. Nace `active` con `email_confirm: true`, la respuesta declara el estado en `status`, y
 * el correo pasa a recordatorio NO bloqueante — lo que obliga a las dos cosas que este archivo
 * pinnea abajo: `magiclink` (GoTrue rechaza `signup` para un usuario que ya existe) y CERO rollback
 * cuando el correo no sale.
 */

const USER_ID = '11111111-1111-4111-8111-111111111111'

type CaptureInput = {
    coachId: string
    tier: string
    method: string
    platform: string
    billingCycle?: string | null
    utmSource?: string | null
    utmCampaign?: string | null
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
    // W3.2: el recordatorio sale por `resendCoachSignupConfirmationEmail` (linkType `magiclink`).
    // `sendCoachSignupConfirmationEmail` firma `signup`, que GoTrue rechaza para un usuario que ya
    // existe — y con `email_confirm: true` el usuario existe confirmado desde la creación.
    const sendReminderMock = vi.fn(async () =>
        state.emailSent ? { ok: true } : { ok: false, error: 'resend 500' }
    )
    const sendSignupMock = vi.fn(async () => ({ ok: true }))
    const onboardingEmailsMock = vi.fn(async () => {})
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

    return {
        state,
        adminStub,
        createUserMock,
        deleteUserMock,
        coachDeleteEq,
        sendSignupMock,
        sendReminderMock,
        onboardingEmailsMock,
        coachInserts,
    }
})

const {
    state,
    createUserMock,
    deleteUserMock,
    coachDeleteEq,
    sendSignupMock,
    sendReminderMock,
    onboardingEmailsMock,
    coachInserts,
} = harness

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
    resendCoachSignupConfirmationEmail: harness.sendReminderMock,
}))

// Bienvenida + drip: con el alta naciendo `active` ya no hay transición `pending_email → active`,
// así que este camino es el ÚNICO que los dispara para el coach que se da de alta desde la app.
vi.mock('@/lib/email/free-coach-onboarding', () => ({
    sendFreeCoachOnboardingEmails: harness.onboardingEmailsMock,
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
    it('alta OK: la respuesta lleva el `uid` del usuario creado (llave del reenvío) y el `status`', async () => {
        const res = await POST(req(BODY))

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({
            ok: true,
            uid: USER_ID,
            // W3.2: EXPLÍCITO. `apps/mobile/lib/register-flow.ts` salta la pantalla de
            // verificación solo con este `active`; ausente o cualquier otra cosa ⇒ pantalla.
            status: 'active',
            email: 'josefa@example.com',
            slug: 'studio-fuerza',
            message: 'Tu cuenta ya está lista.',
        })
        expect(createUserMock).toHaveBeenCalledTimes(1)
        expect(coachInserts[0]).toMatchObject({ id: USER_ID, subscription_status: 'active' })
        expect(sendReminderMock).toHaveBeenCalledTimes(1)
    })

    // W3.2 — sin esto la wave nace muerta: con `email_confirm: false` el coach seguiría chocando
    // con «Email not confirmed» en el login inmediato del cliente.
    it('W3.2: el usuario nace confirmado (`email_confirm: true`)', async () => {
        await POST(req(BODY))

        expect(createUserMock).toHaveBeenCalledWith(
            expect.objectContaining({ email_confirm: true })
        )
    })

    // W3.2(a): con el usuario ya confirmado, GoTrue rechaza `signup` e `invite`. El recordatorio
    // TIENE que salir por el camino `magiclink`, o no sale nunca.
    it('W3.2: el correo sale por `magiclink` (resend…), nunca por el `signup` del alta vieja', async () => {
        await POST(req(BODY))

        expect(sendReminderMock).toHaveBeenCalledWith({
            email: 'josefa@example.com',
            coachName: 'Josefa Díaz',
            source: 'app',
        })
        expect(sendSignupMock).not.toHaveBeenCalled()
    })

    // W3.2(b) — el renglón que, si se olvida, BORRA todas las altas free desde la app: combinado
    // con `email_confirm: true` el correo viejo fallaba siempre y este rollback se llevaba la
    // cuenta entera. Ahora la cuenta ya nació `active`: no hay nada que revertir.
    it('W3.2: si el correo no sale, el alta SOBREVIVE (cero rollback) y devuelve `status: active`', async () => {
        state.emailSent = false

        const res = await POST(req(BODY))

        expect(res.status).toBe(200)
        expect(await res.json()).toMatchObject({ ok: true, uid: USER_ID, status: 'active' })
        expect(coachDeleteEq).not.toHaveBeenCalled()
        expect(deleteUserMock).not.toHaveBeenCalled()
    })

    // El alta nace `active`, así que `/auth/confirm` nunca hará la transición `pending_email →
    // active` (`activateConfirmedFreeCoach` corta con `not_pending`). Si la bienvenida y el drip no
    // salen de acá, el coach que se da de alta desde la app no los recibe nunca.
    it('W3.2: bienvenida + drip se disparan en el alta, con el service-role y el invite_code', async () => {
        await POST(req(BODY))

        expect(onboardingEmailsMock).toHaveBeenCalledWith(
            expect.objectContaining({
                coachId: USER_ID,
                email: 'josefa@example.com',
                coachName: 'Josefa Díaz',
                brandName: 'Studio Fuerza',
                inviteCode: 'X5UD9X44',
            })
        )
    })

    it('W3.3: la marca nace prendida (`use_brand_colors_coach: true`)', async () => {
        await POST(req(BODY))

        expect(coachInserts[0]).toMatchObject({ use_brand_colors_coach: true })
    })

    it('payload inválido ⇒ 400 sin crear nada', async () => {
        const res = await POST(req({ ...BODY, acceptLegal: false }))

        expect(res.status).toBe(400)
        expect(createUserMock).not.toHaveBeenCalled()
        expect(sendReminderMock).not.toHaveBeenCalled()
    })

    it('insert de `coaches` fallido ⇒ 500, rollback del usuario y ningún correo', async () => {
        state.coachInsertError = { message: 'boom' }

        const res = await POST(req(BODY))

        expect(res.status).toBe(500)
        expect(deleteUserMock).toHaveBeenCalledWith(USER_ID)
        expect(sendReminderMock).not.toHaveBeenCalled()
        expect(onboardingEmailsMock).not.toHaveBeenCalled()
    })
})

/**
 * W3.9 — atribución del alta. Las columnas no tienen grant a `authenticated`/`anon`: solo el
 * servidor las escribe, y acá se pinnea que lo que llega del cliente pasa por el saneo.
 */
describe('POST /api/mobile/auth/register-coach-free — atribución (W3.9)', () => {
    it('escribe utm_source/utm_campaign en la fila y los manda en `coach_registered`', async () => {
        await POST(req({ ...BODY, utmSource: 'meta', utmCampaign: 'coaches-ago' }))

        expect(coachInserts[0]).toMatchObject({ utm_source: 'meta', utm_campaign: 'coaches-ago' })
        expect(captureRegisteredMock).toHaveBeenCalledWith(
            expect.objectContaining({ utmSource: 'meta', utmCampaign: 'coaches-ago' })
        )
    })

    it('sin atribución la fila queda con NULL explícito (nunca cadena vacía)', async () => {
        await POST(req(BODY))

        expect(coachInserts[0]).toMatchObject({ utm_source: null, utm_campaign: null })
    })

    it('el valor se sanea: espacios colapsados y tope de largo', async () => {
        await POST(req({ ...BODY, utmSource: '  meta \n ads ', utmCampaign: 'x'.repeat(200) }))

        expect(coachInserts[0]).toMatchObject({ utm_source: 'meta ads' })
        expect((coachInserts[0] as { utm_campaign: string }).utm_campaign).toHaveLength(120)
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
            // W3.9: viajan SIEMPRE (null explícito cuando el alta no trajo campaña); el emisor es
            // el que decide no ensuciar el evento con propiedades nulas.
            utmSource: null,
            utmCampaign: null,
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

    // W3.2 dio vuelta este caso: el correo caído YA NO revierte el alta, así que esa cuenta existe
    // y el embudo tiene que contarla. Lo que sigue sin contarse es el alta que no llegó a escribirse.
    it('el correo caído NO borra el alta ⇒ el evento SÍ se emite (la cuenta existe)', async () => {
        state.emailSent = false

        await POST(req(BODY, { 'user-agent': 'okhttp/4.9.2' }))

        expect(captureRegisteredMock).toHaveBeenCalledTimes(1)
    })

    it('si el `insert` del coach falla NO se emite nada (esa alta no existe)', async () => {
        state.coachInsertError = { message: 'boom' }

        await POST(req(BODY, { 'user-agent': 'okhttp/4.9.2' }))

        expect(captureRegisteredMock).not.toHaveBeenCalled()
    })
})
