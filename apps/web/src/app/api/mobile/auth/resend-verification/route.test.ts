import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * FCN W3.11 (puerta RN) — el botón «Reenviar correo» del banner de verificación desde la APP.
 *
 * Lo que se pinnea acá es lo que de verdad puede romperse: que la identidad salga del TOKEN y nunca
 * del cuerpo (si no, el endpoint sería un emisor de magic-links contra cuentas ajenas), que la
 * puerta sea `coaches.email_verified_at IS NULL` —y NO `pending_email`, que bajo D1 = A dejaría
 * afuera justo a quien el banner rescata—, que el ledger se RESERVE antes de enviar, y que el
 * fail-CLOSED de la lectura del ledger no mande el correo.
 *
 * Se mockea el CLIENTE (no el helper) para ejercitar el núcleo compartido de verdad: lo que hay que
 * proteger es el efecto —¿salió el correo?, ¿se gastó cupo?—, no que la ruta invoque una función.
 * De `lib/auth/resend-confirmation` solo se mockean las DOS funciones de I/O del ledger; la decisión
 * (`evaluateResendThrottle`) corre real.
 */

const harness = vi.hoisted(() => {
    const USER_ID = '55555555-5555-4555-8555-555555555555'
    const state = {
        /** `null` = `getUser(token)` rebota (token vencido/revocado/basura). */
        user: { id: USER_ID, email: 'coach@eva-app.cl' } as { id: string; email: string | null } | null,
        coach: { full_name: 'Ana Coach', email_verified_at: null } as
            | { full_name: string | null; email_verified_at: string | null }
            | null,
        coachError: null as { message: string } | null,
        ledger: { ok: true, sentAtIso: [] as string[] } as
            | { ok: true; sentAtIso: string[] }
            | { ok: false; error: string },
        rateLimit: { ok: true } as { ok: true } | { ok: false; retryAfter: number },
        sendOk: true,
    }
    const tokensSeen: string[] = []
    const coachIdsRead: string[] = []
    const reservations: Array<{ userId: string; surface: string }> = []
    const sent: Array<{ email: string; coachName: string }> = []

    const adminStub = {
        from: () => ({
            select: () => ({
                eq: (_col: string, value: string) => {
                    coachIdsRead.push(value)
                    return {
                        maybeSingle: async () => ({ data: state.coach, error: state.coachError }),
                    }
                },
            }),
        }),
        auth: {
            // Molde de `/api/mobile` que muta: `getUser(token)` autoritativo, no `jose`.
            getUser: async (token: string) => {
                tokensSeen.push(token)
                return state.user
                    ? { data: { user: state.user }, error: null }
                    : { data: { user: null }, error: { message: 'invalid token' } }
            },
        },
    }

    return { USER_ID, state, tokensSeen, coachIdsRead, reservations, sent, adminStub }
})

const { USER_ID, state, tokensSeen, coachIdsRead, reservations, sent } = harness

vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: () => harness.adminStub }))
vi.mock('@/lib/rate-limit', () => ({ rateLimitAuth: async () => harness.state.rateLimit }))
vi.mock('@/lib/auth/send-coach-email-confirmation', () => ({
    resendCoachSignupConfirmationEmail: async (input: { email: string; coachName: string }) => {
        harness.sent.push(input)
        return harness.state.sendOk ? { ok: true } : { ok: false, error: 'Resend 422' }
    },
}))
vi.mock('@/lib/auth/resend-confirmation', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/auth/resend-confirmation')>()
    return {
        ...actual,
        readConfirmationResendTimestamps: async () => harness.state.ledger,
        recordConfirmationResend: async (_admin: unknown, userId: string, surface: string) => {
            harness.reservations.push({ userId, surface })
        },
    }
})

import { POST } from './route'

const URL = 'http://localhost/api/mobile/auth/resend-verification'

function request(token: string | null = 'valid-token', body?: unknown) {
    return new NextRequest(URL, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    tokensSeen.length = 0
    coachIdsRead.length = 0
    reservations.length = 0
    sent.length = 0
    state.user = { id: USER_ID, email: 'coach@eva-app.cl' }
    state.coach = { full_name: 'Ana Coach', email_verified_at: null }
    state.coachError = null
    state.ledger = { ok: true, sentAtIso: [] }
    state.rateLimit = { ok: true }
    state.sendOk = true
})

describe('POST /api/mobile/auth/resend-verification', () => {
    it('reenvía al coach con el correo sin verificar y RESERVA el cupo del ledger', async () => {
        const res = await POST(request())

        expect(res.status).toBe(200)
        expect(await res.json()).toEqual({ ok: true })
        expect(tokensSeen).toEqual(['valid-token'])
        expect(sent).toEqual([{ email: 'coach@eva-app.cl', coachName: 'Ana Coach' }])
        // La traza distingue la superficie, pero el cupo es el MISMO que el de la web.
        expect(reservations).toEqual([{ userId: USER_ID, surface: 'mobile' }])
    })

    it('el destino sale de `auth.users` del TOKEN, nunca del cuerpo', async () => {
        const AJENO = '66666666-6666-4666-8666-666666666666'

        await POST(request('valid-token', { userId: AJENO, email: 'victima@ajeno.cl' }))

        expect(coachIdsRead).toEqual([USER_ID])
        expect(sent).toEqual([{ email: 'coach@eva-app.cl', coachName: 'Ana Coach' }])
    })

    it('la puerta es `email_verified_at`: con el correo ya sellado contesta 409 y no manda nada', async () => {
        state.coach = { full_name: 'Ana Coach', email_verified_at: '2026-08-20T10:00:00.000Z' }

        const res = await POST(request())

        expect(res.status).toBe(409)
        expect(await res.json()).toEqual({
            // Copy del móvil: «Recarga la página» es de la web.
            error: 'Tu correo ya está verificado.',
            code: 'ALREADY_VERIFIED',
        })
        expect(sent).toHaveLength(0)
        expect(reservations).toHaveLength(0)
    })

    it('ledger ILEGIBLE: fail-CLOSED — 429 y cero correos', async () => {
        state.ledger = { ok: false, error: 'timeout' }

        const res = await POST(request())

        expect(res.status).toBe(429)
        expect(await res.json()).toMatchObject({ code: 'RATE_LIMIT' })
        expect(sent).toHaveLength(0)
    })

    it('cooldown de 60 s del ledger: 429 con `retryAfter` honesto y `Retry-After`', async () => {
        state.ledger = { ok: true, sentAtIso: [new Date(Date.now() - 10_000).toISOString()] }

        const res = await POST(request())
        const body = await res.json()

        expect(res.status).toBe(429)
        expect(body.code).toBe('RATE_LIMIT')
        expect(body.retryAfter).toBeGreaterThan(0)
        expect(body.retryAfter).toBeLessThanOrEqual(60)
        expect(res.headers.get('Retry-After')).toBe(String(body.retryAfter))
        expect(sent).toHaveLength(0)
    })

    it('tope diario (5 en 24 h): 429 con la espera en horas, no en segundos inventados', async () => {
        const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
        state.ledger = { ok: true, sentAtIso: [hoursAgo(2), hoursAgo(4), hoursAgo(6), hoursAgo(8), hoursAgo(10)] }

        const res = await POST(request())
        const body = await res.json()

        expect(res.status).toBe(429)
        // Faltan ~14 h para que el más viejo de los 5 salga de la ventana.
        expect(body.retryAfter).toBeGreaterThan(3600)
        expect(sent).toHaveLength(0)
    })

    it('limitador por usuario (Upstash): 429 sin tocar la base', async () => {
        state.rateLimit = { ok: false, retryAfter: 42 }

        const res = await POST(request())

        expect(res.status).toBe(429)
        expect(await res.json()).toMatchObject({ retryAfter: 42 })
        expect(coachIdsRead).toHaveLength(0)
        expect(sent).toHaveLength(0)
    })

    it('sin fila de coach: error genérico, sin delatar nada', async () => {
        state.coach = null

        const res = await POST(request())

        expect(res.status).toBe(500)
        expect(await res.json()).toMatchObject({ code: 'LOOKUP_FAILED' })
        expect(sent).toHaveLength(0)
    })

    it('si el envío falla, el cupo YA está gastado: el ledger cuenta intentos, no éxitos', async () => {
        state.sendOk = false

        const res = await POST(request())

        expect(res.status).toBe(502)
        expect(await res.json()).toMatchObject({ code: 'SEND_FAILED' })
        expect(reservations).toHaveLength(1)
    })

    it('sin bearer: 401 y cero escrituras', async () => {
        const res = await POST(request(null))

        expect(res.status).toBe(401)
        expect(await res.json()).toEqual({ error: 'Unauthorized', code: 'MISSING_TOKEN' })
        expect(sent).toHaveLength(0)
    })

    it('token que `getUser` rechaza (vencido/revocado): 401 y cero escrituras', async () => {
        state.user = null

        const res = await POST(request('token-muerto'))

        expect(res.status).toBe(401)
        expect(await res.json()).toEqual({ error: 'Unauthorized', code: 'INVALID_TOKEN' })
        expect(sent).toHaveLength(0)
    })

    it('usuario de auth sin correo: 409, no un 500 que la app reintente', async () => {
        state.user = { id: USER_ID, email: null }

        const res = await POST(request())

        expect(res.status).toBe(409)
        expect(await res.json()).toMatchObject({ code: 'MISSING_EMAIL' })
        expect(sent).toHaveLength(0)
    })
})
