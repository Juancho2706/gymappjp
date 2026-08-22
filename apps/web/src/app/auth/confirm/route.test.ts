import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Confirmación de email del coach Free. Es el camino de alta con más historia de correos perdidos:
 * el 19-08, con el helper en fire-and-forget, 2 de 5 coaches que confirmaron se quedaron sin
 * bienvenida y sin drip — Vercel congela la invocación al devolver el redirect y se lleva puesto
 * todo POST a Resend pendiente.
 *
 * Por eso lo que se pinnea acá NO es «se llama al helper» sino TRES bordes:
 *   1. se llama con el service-role client, el `coachId` y el `invite_code` (el D+1 lo necesita);
 *   2. se ESPERA de verdad antes del redirect (el test lo observa con una promesa diferida);
 *   3. la puerta: solo en la transición `pending_email → active` de un coach free.
 */

const harness = vi.hoisted(() => {
    const USER_ID = '11111111-1111-4111-8111-111111111111'
    const state = {
        verified: { user: { id: USER_ID, email: 'coach@example.com' } } as
            | { user: { id: string; email: string } }
            | { user: null },
        verifyError: null as { message: string } | null,
        coach: null as Record<string, unknown> | null,
    }
    const updates: Array<Record<string, unknown>> = []
    const sendFreeCoachOnboardingEmailsMock = vi.fn(async () => undefined)

    // Cliente de sesión: solo se usa para `verifyOtp`.
    const serverStub = {
        auth: { verifyOtp: async () => ({ data: state.verified, error: state.verifyError }) },
    }

    // Service-role: lee la fila del coach y escribe el `active`.
    const adminStub = {
        __marker: 'admin',
        from: () => ({
            select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.coach }) }) }),
            // UPDATE condicional (`eq('id').eq('subscription_status','pending_email').select('id')`):
            // el helper necesita las filas tocadas para saber si ganó la carrera.
            update: (patch: Record<string, unknown>) => {
                updates.push(patch)
                const chain = {
                    eq: () => chain,
                    select: async () => ({ data: [{ id: USER_ID }], error: null }),
                }
                return chain
            },
        }),
    }

    return { USER_ID, state, updates, adminStub, serverStub, sendFreeCoachOnboardingEmailsMock }
})

const { USER_ID, state, updates, adminStub, sendFreeCoachOnboardingEmailsMock } = harness

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => harness.serverStub }))
vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: () => harness.adminStub }))
vi.mock('@/lib/email/free-coach-onboarding', () => ({
    sendFreeCoachOnboardingEmails: harness.sendFreeCoachOnboardingEmailsMock,
}))

import { GET } from './route'

const PENDING_FREE_COACH = {
    id: USER_ID,
    subscription_status: 'pending_email',
    subscription_tier: 'free',
    full_name: 'Josefa Díaz',
    brand_name: 'Studio Fuerza',
    invite_code: 'X5UD9X44',
}

function req(type = 'email', token = 'tok', extra: { src?: string; ua?: string } = {}) {
    const src = extra.src ? `&src=${extra.src}` : ''
    return new NextRequest(`https://www.eva-app.cl/auth/confirm?token_hash=${token}&type=${type}${src}`, {
        headers: extra.ua ? { 'user-agent': extra.ua } : undefined,
    })
}

const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/128 Mobile Safari/537.36'
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'

/** Promesa que resuelve cuando el test lo decide: así se observa si la ruta espera de verdad. */
function deferred() {
    let resolve!: () => void
    const promise = new Promise<undefined>((res) => {
        resolve = () => res(undefined)
    })
    return { promise, resolve }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
    vi.clearAllMocks()
    updates.length = 0
    state.verified = { user: { id: USER_ID, email: 'coach@example.com' } }
    state.verifyError = null
    state.coach = { ...PENDING_FREE_COACH }
    sendFreeCoachOnboardingEmailsMock.mockResolvedValue(undefined)
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.eva-app.cl')
})

describe('GET /auth/confirm — activación del coach Free', () => {
    it('activa la cuenta y dispara bienvenida + drip con admin, coachId e invite_code', async () => {
        const res = await GET(req())

        expect(res.status).toBe(307)
        expect(res.headers.get('location')).toBe('https://www.eva-app.cl/coach/dashboard?welcome=free')
        expect(updates).toEqual([{ subscription_status: 'active' }])
        expect(sendFreeCoachOnboardingEmailsMock).toHaveBeenCalledWith({
            // Service-role: el ledger de correos NO se puede escribir con la sesión del coach.
            admin: adminStub,
            coachId: USER_ID,
            email: 'coach@example.com',
            coachName: 'Josefa Díaz',
            brandName: 'Studio Fuerza',
            // Sin el código, el D+1 pierde su único link y cae al fallback «ve a Alumnos».
            inviteCode: 'X5UD9X44',
            appUrl: 'https://www.eva-app.cl',
        })
    })

    /**
     * EL bug del 19-08. Sin `await`, la ruta devuelve el redirect, Vercel congela la invocación y
     * los POST a Resend mueren en el aire. El mock resuelve TARDE a propósito: si la ruta dejara de
     * esperar, `settled` sería true antes de que el helper termine y el test falla.
     */
    it('AWAITEA el helper: no responde hasta que los correos se asientan', async () => {
        const pendingEmails = deferred()
        sendFreeCoachOnboardingEmailsMock.mockReturnValue(pendingEmails.promise)

        let settled = false
        const inFlight = GET(req()).then((res) => {
            settled = true
            return res
        })

        await flush()
        expect(settled).toBe(false)
        expect(sendFreeCoachOnboardingEmailsMock).toHaveBeenCalledTimes(1)

        pendingEmails.resolve()
        const res = await inFlight
        expect(settled).toBe(true)
        expect(res.headers.get('location')).toContain('welcome=free')
    })

    // El helper no lanza por contrato, pero la cuenta YA quedó activa: si algún día lanza, el coach
    // no puede comerse un 500 en la pantalla de confirmación por un correo que falló.
    it('si el helper RECHAZA igual activa y redirige (el correo nunca rompe la confirmación)', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        sendFreeCoachOnboardingEmailsMock.mockRejectedValue(new Error('resend caído'))

        const res = await GET(req())

        expect(res.headers.get('location')).toBe('https://www.eva-app.cl/coach/dashboard?welcome=free')
        expect(updates).toEqual([{ subscription_status: 'active' }])
        expect(warn).toHaveBeenCalledWith('[activate-confirmed-coach] onboarding email failed')
        // Sin PII en el log.
        expect(JSON.stringify(warn.mock.calls)).not.toContain('coach@example.com')
    })
})

describe('GET /auth/confirm — la puerta (cuándo NO se manda nada)', () => {
    it('coach YA activo → cero correos y redirect normal al dashboard', async () => {
        state.coach = { ...PENDING_FREE_COACH, subscription_status: 'active' }
        const res = await GET(req())

        expect(res.headers.get('location')).toBe('https://www.eva-app.cl/coach/dashboard')
        expect(sendFreeCoachOnboardingEmailsMock).not.toHaveBeenCalled()
        expect(updates).toEqual([])
    })

    it('coach de plan PAGO en pending_email → cero correos (esa serie es solo del Free)', async () => {
        state.coach = { ...PENDING_FREE_COACH, subscription_tier: 'pro' }
        await GET(req())
        expect(sendFreeCoachOnboardingEmailsMock).not.toHaveBeenCalled()
    })

    it('sin fila `coaches` (usuario que no es coach) → cero correos', async () => {
        state.coach = null
        await GET(req())
        expect(sendFreeCoachOnboardingEmailsMock).not.toHaveBeenCalled()
    })

    it('type=recovery con coach pending → ACTIVA (GoTrue confirma el email al verificar la recuperación) y va al reset', async () => {
        // 22-08: un coach que abrió «olvidé mi contraseña» en vez del link de confirmación quedó
        // con auth confirmado y `coaches` en `pending_email`, sin bienvenida ni drip.
        const res = await GET(req('recovery'))
        expect(res.headers.get('location')).toBe('https://www.eva-app.cl/reset-password')
        expect(updates).toEqual([{ subscription_status: 'active' }])
        expect(sendFreeCoachOnboardingEmailsMock).toHaveBeenCalledTimes(1)
    })

    it('type=recovery con coach ya activo → va al reset y cero correos', async () => {
        state.coach = { ...PENDING_FREE_COACH, subscription_status: 'active' }
        const res = await GET(req('recovery'))
        expect(res.headers.get('location')).toBe('https://www.eva-app.cl/reset-password')
        expect(updates).toEqual([])
        expect(sendFreeCoachOnboardingEmailsMock).not.toHaveBeenCalled()
    })

    it('token inválido → login con error y cero correos', async () => {
        state.verifyError = { message: 'expired' }
        state.verified = { user: null }
        const res = await GET(req())
        expect(res.headers.get('location')).toContain('/login?error=confirmation_expired')
        expect(sendFreeCoachOnboardingEmailsMock).not.toHaveBeenCalled()
    })

    it('link sin token_hash/type → login con error y cero correos', async () => {
        const res = await GET(new NextRequest('https://www.eva-app.cl/auth/confirm'))
        expect(res.headers.get('location')).toContain('/login?error=invalid_confirmation_link')
        expect(sendFreeCoachOnboardingEmailsMock).not.toHaveBeenCalled()
    })
})

describe('GET /auth/confirm — vuelta a la app tras confirmar (alta desde la app)', () => {
    it('src=app + Android → intent:// a la app con el panel web como fallback, y la cuenta igual se activa', async () => {
        const res = await GET(req('email', 'tok', { src: 'app', ua: ANDROID_UA }))

        const location = res.headers.get('location') ?? ''
        expect(location.startsWith('intent://auth/confirmed?email=coach%40example.com#Intent;scheme=eva;package=cl.evaapp.eva;')).toBe(true)
        expect(location).toContain(`S.browser_fallback_url=${encodeURIComponent('https://www.eva-app.cl/coach/dashboard?welcome=free')};end`)
        expect(updates).toEqual([{ subscription_status: 'active' }])
        expect(sendFreeCoachOnboardingEmailsMock).toHaveBeenCalledTimes(1)
    })

    /**
     * iOS (22-08). Antes de esto el coach de iPhone aterrizaba en el panel web responsive teniendo
     * la app instalada: Safari ignora los universal links disparados desde un `Location:`, así que
     * el redirect no puede abrir la app. La escala `/auth/abrir-app` sí puede (salto `eva://` desde
     * el documento + botón con gesto), y se lleva el panel como `next` para la segunda salida.
     */
    it('src=app + iOS → /auth/abrir-app con el email y el panel como `next`, y la cuenta igual se activa', async () => {
        const res = await GET(req('email', 'tok', { src: 'app', ua: IOS_UA }))

        expect([302, 307]).toContain(res.status)
        const location = new URL(res.headers.get('location') ?? '')
        expect(location.origin + location.pathname).toBe('https://www.eva-app.cl/auth/abrir-app')
        expect(location.searchParams.get('email')).toBe('coach@example.com')
        expect(location.searchParams.get('next')).toBe('/coach/dashboard?welcome=free')
        // Nada del panel se cuela sin codificar: `?welcome=free` no puede partir el query de la escala.
        expect(res.headers.get('location')).toContain('next=%2Fcoach%2Fdashboard%3Fwelcome%3Dfree')
        expect(updates).toEqual([{ subscription_status: 'active' }])
        expect(sendFreeCoachOnboardingEmailsMock).toHaveBeenCalledTimes(1)
    })

    it('src=app + iOS con coach ya activo → la escala con el panel SIN `welcome`', async () => {
        state.coach = { ...PENDING_FREE_COACH, subscription_status: 'active' }
        const res = await GET(req('email', 'tok', { src: 'app', ua: IOS_UA }))

        const location = new URL(res.headers.get('location') ?? '')
        expect(location.pathname).toBe('/auth/abrir-app')
        expect(location.searchParams.get('next')).toBe('/coach/dashboard')
        expect(res.headers.get('location')).not.toContain('welcome')
    })

    it('src=app + iOS sin email en la sesión → la escala sin `email=` (la app cae al login vacío)', async () => {
        state.verified = { user: { id: USER_ID, email: '' } }
        const res = await GET(req('email', 'tok', { src: 'app', ua: IOS_UA }))

        const location = res.headers.get('location') ?? ''
        expect(location).toContain('/auth/abrir-app?')
        expect(location).not.toContain('email=')
    })

    it('iOS SIN src=app (alta web) → panel web, nunca la escala', async () => {
        const res = await GET(req('email', 'tok', { ua: IOS_UA }))
        expect(res.headers.get('location')).toBe('https://www.eva-app.cl/coach/dashboard?welcome=free')
    })

    it('recovery con src=app en iOS → al reset, nunca a la escala', async () => {
        const res = await GET(req('recovery', 'tok', { src: 'app', ua: IOS_UA }))
        expect(res.headers.get('location')).toBe('https://www.eva-app.cl/reset-password')
    })

    it('Android SIN src=app (alta web) → panel web', async () => {
        const res = await GET(req('email', 'tok', { ua: ANDROID_UA }))
        expect(res.headers.get('location')).toBe('https://www.eva-app.cl/coach/dashboard?welcome=free')
    })

    it('src=app + Android con coach ya activo → intent:// con el panel sin `welcome`', async () => {
        state.coach = { ...PENDING_FREE_COACH, subscription_status: 'active' }
        const res = await GET(req('email', 'tok', { src: 'app', ua: ANDROID_UA }))
        expect(res.headers.get('location')).toContain(encodeURIComponent('https://www.eva-app.cl/coach/dashboard'))
        expect(res.headers.get('location')).not.toContain('welcome')
    })

    it('recovery con src=app → al reset, nunca a la app', async () => {
        const res = await GET(req('recovery', 'tok', { src: 'app', ua: ANDROID_UA }))
        expect(res.headers.get('location')).toBe('https://www.eva-app.cl/reset-password')
    })
})
