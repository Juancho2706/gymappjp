import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * W3.13b — TERCERA puerta de la rotación anti-takeover (`docs/specs/flujo-coach-nuevo`).
 *
 * El gemelo `api/auth/google-link` autentica por cookie y solo lo llama el navegador; el binario RN
 * entra con Google por `signInWithIdToken` y nunca pasa por ahí. Acá se pinnea que la MISMA regla
 * vale por Bearer: SE ROTA con `coaches.email_verified_at IS NULL`, NO SE ROTA cuando ya está
 * sellado (condición del owner del 26-08: a quien ya está registrado no se lo toca), y la identidad
 * sale del token — nunca del cuerpo.
 *
 * Se mockea el CLIENTE (no el helper) para ejercitar la rotación de verdad: lo que hay que proteger
 * es el efecto sobre GoTrue, no que la ruta invoque una función.
 */

const harness = vi.hoisted(() => {
    const USER_ID = '33333333-3333-4333-8333-333333333333'
    const state = {
        /** `null` = `getUser(token)` rebota (token vencido/revocado/basura). */
        user: { id: USER_ID } as { id: string } | null,
        identities: ['email', 'google'] as string[],
        emailVerifiedAt: null as string | null,
    }
    const tokensSeen: string[] = []
    const rotations: Array<{ id: string; password?: string }> = []
    const stamps: Array<Record<string, unknown>> = []
    const events: Array<Record<string, unknown>> = []
    const capturePostHogServerEventMock = vi.fn(async () => undefined)

    const adminStub = {
        from: (table: string) => ({
            select: () => ({
                eq: () => ({
                    maybeSingle: async () => ({ data: { email_verified_at: state.emailVerifiedAt } }),
                }),
            }),
            update: (patch: Record<string, unknown>) => ({
                eq: () => ({
                    is: async () => {
                        stamps.push(patch)
                        return { error: null }
                    },
                }),
            }),
            insert: async (row: Record<string, unknown>) => {
                events.push({ table, ...row })
                return { error: null }
            },
        }),
        auth: {
            // Molde de `/api/mobile` que muta: `getUser(token)` autoritativo, no `jose`.
            getUser: async (token: string) => {
                tokensSeen.push(token)
                return state.user
                    ? { data: { user: state.user }, error: null }
                    : { data: { user: null }, error: { message: 'invalid token' } }
            },
            admin: {
                getUserById: async (id: string) => ({
                    data: { user: { id, identities: state.identities.map((provider) => ({ provider })) } },
                    error: null,
                }),
                updateUserById: async (id: string, attrs: { password?: string }) => {
                    rotations.push({ id, password: attrs.password })
                    return { data: { user: { id } }, error: null }
                },
            },
        },
    }

    return { USER_ID, state, tokensSeen, rotations, stamps, events, adminStub, capturePostHogServerEventMock }
})

const { USER_ID, state, tokensSeen, rotations, stamps, events, capturePostHogServerEventMock } = harness

vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: () => harness.adminStub }))
vi.mock('@/lib/posthog/server-capture', () => ({
    capturePostHogServerEvent: harness.capturePostHogServerEventMock,
}))

import { POST } from './route'

const URL = 'http://localhost/api/mobile/auth/google-link'

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
    rotations.length = 0
    stamps.length = 0
    events.length = 0
    state.user = { id: USER_ID }
    state.identities = ['email', 'google']
    state.emailVerifiedAt = null
})

describe('POST /api/mobile/auth/google-link', () => {
    it('rota la contraseña cuando el coach entra con Google DESDE LA APP y su correo nunca se probó', async () => {
        const res = await POST(request())

        expect(res.status).toBe(200)
        expect(tokensSeen).toEqual(['valid-token'])
        expect(rotations).toHaveLength(1)
        expect(rotations[0].id).toBe(USER_ID)
        // 32 bytes en hex: entropía de sobra y por debajo del tope de 72 caracteres de bcrypt.
        expect(rotations[0].password).toMatch(/^[0-9a-f]{64}$/)
        // Google probó la casilla ⇒ el correo queda verificado y el coach legítimo puede resetear.
        expect(stamps).toHaveLength(1)
        expect(typeof stamps[0].email_verified_at).toBe('string')
        expect(events[0]).toMatchObject({
            table: 'coach_onboarding_events',
            coach_id: USER_ID,
            event_type: 'google_link_rotated_password',
        })
    })

    it('la telemetría distingue la puerta mobile de la del navegador', async () => {
        await POST(request())

        expect(capturePostHogServerEventMock).toHaveBeenCalledWith({
            event: 'google_link_rotated_password',
            distinctId: USER_ID,
            properties: { context: 'mobile_post_google_auth' },
        })
        expect(events[0]).toMatchObject({ metadata: { context: 'mobile_post_google_auth' } })
    })

    it('NO rota cuando `email_verified_at` ya está sellado (a los que ya están, ni tocarlos)', async () => {
        state.emailVerifiedAt = '2026-08-20T10:00:00.000Z'

        const res = await POST(request())

        expect(res.status).toBe(200)
        expect(rotations).toHaveLength(0)
        expect(stamps).toHaveLength(0)
        expect(capturePostHogServerEventMock).not.toHaveBeenCalled()
    })

    it('NO rota al coach que entra con Google y nunca tuvo contraseña', async () => {
        state.identities = ['google']

        await POST(request())

        expect(rotations).toHaveLength(0)
    })

    it('NO rota sin identidad de Google: es el guardián del ENLACE, no un rotador suelto', async () => {
        // Una sesión de la app creada con contraseña que hiciera POST acá no puede autorrotarse.
        state.identities = ['email']

        await POST(request())

        expect(rotations).toHaveLength(0)
    })

    it('la respuesta no le cuenta al cliente si hubo rotación', async () => {
        const rotated = await (await POST(request())).json()
        state.emailVerifiedAt = '2026-08-20T10:00:00.000Z'
        const notRotated = await (await POST(request())).json()

        // Si el cuerpo distinguiera los casos, cualquiera con sesión podría preguntarle al servidor
        // si un correo ajeno tenía contraseña previa.
        expect(rotated).toEqual({ ok: true })
        expect(notRotated).toEqual({ ok: true })
    })

    it('sin bearer: 401 y cero escrituras', async () => {
        const res = await POST(request(null))

        expect(res.status).toBe(401)
        expect(await res.json()).toEqual({ error: 'Unauthorized', code: 'MISSING_TOKEN' })
        expect(rotations).toHaveLength(0)
    })

    it('token que `getUser` rechaza (vencido/revocado): 401 y cero escrituras', async () => {
        state.user = null

        const res = await POST(request('token-muerto'))

        expect(res.status).toBe(401)
        expect(await res.json()).toEqual({ error: 'Unauthorized', code: 'INVALID_TOKEN' })
        expect(rotations).toHaveLength(0)
    })

    it('el usuario sale del TOKEN, nunca del cuerpo', async () => {
        const AJENO = '44444444-4444-4444-8444-444444444444'

        await POST(request('valid-token', { userId: AJENO }))

        expect(rotations).toHaveLength(1)
        expect(rotations[0].id).toBe(USER_ID)
    })

    it('idempotente: la segunda llamada ya encuentra el correo sellado y no rota de nuevo', async () => {
        await POST(request())
        // En LIVE lo sella la propia rotación; acá se refleja ese efecto en el stub.
        state.emailVerifiedAt = String(stamps[0].email_verified_at)

        await POST(request())

        expect(rotations).toHaveLength(1)
    })
})
