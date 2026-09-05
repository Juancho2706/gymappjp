import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * W3.13 — SEGUNDO call site de la rotación anti-takeover (`docs/specs/flujo-coach-nuevo`).
 *
 * Por qué existe este endpoint y no alcanza `complete.actions.ts`: en el escenario del ataque la
 * fila `coaches` YA EXISTE (el intruso pasó por `/register`), así que `completeOAuthOnboarding` no
 * corre y el único camino post-Google que queda es de cliente. Acá se pinnea el par que pide el
 * contrato: SE ROTA con `coaches.email_verified_at IS NULL` y NO SE ROTA cuando ya está sellado
 * —condición del owner del 26-08: a quien ya está registrado no se lo toca—.
 */

const harness = vi.hoisted(() => {
    const USER_ID = '22222222-2222-4222-8222-222222222222'
    const state = {
        user: { id: USER_ID } as { id: string } | null,
        identities: ['email', 'google'] as string[],
        emailVerifiedAt: null as string | null,
        /** Incidente 04-09: `createClient()` explota con la sesión metida en el `message`. */
        createClientError: null as Error | null,
    }
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

    const serverStub = { auth: { getUser: async () => ({ data: { user: state.user } }) } }

    return { USER_ID, state, rotations, stamps, events, adminStub, serverStub, capturePostHogServerEventMock }
})

const { USER_ID, state, rotations, stamps, events, capturePostHogServerEventMock } = harness

vi.mock('@/lib/supabase/server', () => ({
    createClient: async () => {
        if (harness.state.createClientError) throw harness.state.createClientError
        return harness.serverStub
    },
}))
vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: () => harness.adminStub }))
vi.mock('@/lib/posthog/server-capture', () => ({
    capturePostHogServerEvent: harness.capturePostHogServerEventMock,
}))

import { POST } from './route'

beforeEach(() => {
    vi.clearAllMocks()
    rotations.length = 0
    stamps.length = 0
    events.length = 0
    state.user = { id: USER_ID }
    state.identities = ['email', 'google']
    state.emailVerifiedAt = null
    state.createClientError = null
})

describe('POST /api/auth/google-link', () => {
    it('rota la contraseña cuando el usuario ya tenía identidad `email` y el correo NUNCA se probó', async () => {
        const res = await POST()

        expect(res.status).toBe(200)
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
        expect(capturePostHogServerEventMock).toHaveBeenCalledWith({
            event: 'google_link_rotated_password',
            distinctId: USER_ID,
            properties: { context: 'post_google_auth' },
        })
    })

    it('NO rota cuando `email_verified_at` ya está sellado (a los que ya están, ni tocarlos)', async () => {
        state.emailVerifiedAt = '2026-08-20T10:00:00.000Z'

        const res = await POST()

        expect(res.status).toBe(200)
        expect(rotations).toHaveLength(0)
        expect(stamps).toHaveLength(0)
        expect(capturePostHogServerEventMock).not.toHaveBeenCalled()
    })

    it('NO rota al coach que entra con Google y nunca tuvo contraseña', async () => {
        state.identities = ['google']

        await POST()

        expect(rotations).toHaveLength(0)
    })

    it('NO rota sin identidad de Google: el endpoint es el guardián del ENLACE, no un rotador suelto', async () => {
        // Una sesión creada con contraseña que hiciera POST acá no puede autorrotarse la clave.
        state.identities = ['email']

        await POST()

        expect(rotations).toHaveLength(0)
    })

    it('la respuesta no le cuenta al cliente si hubo rotación', async () => {
        const rotated = await (await POST()).json()
        state.emailVerifiedAt = '2026-08-20T10:00:00.000Z'
        const notRotated = await (await POST()).json()

        // Si el cuerpo distinguiera los casos, cualquiera con sesión podría preguntarle al servidor
        // si un correo ajeno tenía contraseña previa.
        expect(rotated).toEqual({ ok: true })
        expect(notRotated).toEqual({ ok: true })
    })

    it('sin sesión: 401 y cero escrituras', async () => {
        state.user = null

        const res = await POST()

        expect(res.status).toBe(401)
        expect(rotations).toHaveLength(0)
    })

    /**
     * INCIDENTE 04-09 (21:43Z y 21:52Z): este endpoint respondió 401 y dejó en los runtime logs de
     * Vercel el `TypeError: Cannot create property 'user' on string '{"access_token":"eyJ…"}'` —o
     * sea el access_token, el refresh_token y el email del usuario, en texto plano—. El throw sale
     * de supabase-js al leer una cookie de sesión corrupta (ver `lib/supabase/server.ts`).
     *
     * Lo que se pinnea acá NO es que el 401 exista (ya existía), sino que ninguna consola vea el
     * payload: el `catch` solo puede loguear el NOMBRE de la clase del error.
     */
    it('cookie de sesión corrupta: 401 sin filtrar la sesión a ninguna consola', async () => {
        const LEAK =
            '{"access_token":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.CARGA","refresh_token":"r3fr3sh-t0k3n","user":{"email":"coach@eva-app.cl"}}'
        state.createClientError = new TypeError(`Cannot create property 'user' on string '${LEAK}'`)

        const methods = ['log', 'info', 'warn', 'error', 'debug'] as const
        const spies = methods.map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
        try {
            const res = await POST()

            expect(res.status).toBe(401)
            await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
            expect(rotations).toHaveLength(0)

            // `JSON.stringify` no alcanza: un `Error` serializa a `{}` y así se colaría justo el
            // caso real (la librería loguea el objeto Error, no un string).
            const emitted = spies
                .flatMap((spy) => spy.mock.calls)
                .flat()
                .map((arg) =>
                    arg instanceof Error
                        ? `${arg.name}: ${arg.message} ${arg.stack ?? ''}`
                        : typeof arg === 'string'
                          ? arg
                          : JSON.stringify(arg)
                )
                .join(' ')

            expect(emitted).not.toContain('access_token')
            expect(emitted).not.toContain('refresh_token')
            expect(emitted).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')
            expect(emitted).not.toContain('coach@eva-app.cl')
            // Se sigue viendo QUE pasó, con el nombre de la clase y nada más.
            expect(emitted).toContain('TypeError')
        } finally {
            spies.forEach((spy) => spy.mockRestore())
        }
    })

    it('idempotente: la segunda llamada ya encuentra el correo sellado y no rota de nuevo', async () => {
        await POST()
        // En LIVE lo sella la propia rotación; acá se refleja ese efecto en el stub.
        state.emailVerifiedAt = String(stamps[0].email_verified_at)

        await POST()

        expect(rotations).toHaveLength(1)
    })
})
