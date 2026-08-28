import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Alta de coach por Google DESDE LA WEB (`completeOAuthOnboarding`). El coach nace `active` y jamás
 * pasa por `/auth/confirm`, así que hasta `56159d64` (17-08) éste era un camino de alta SIN
 * bienvenida ni serie de correos — y es el de menor fricción, el que más elige el tráfico frío.
 *
 * Se pinnea el mismo borde que en los otros dos call sites del helper: los argumentos exactos, que
 * se ESPERE antes del `redirect()` (Vercel congela la invocación al redirigir y mata los POST a
 * Resend pendientes) y que un fallo de correo no convierta un alta exitosa en «Error al crear tu
 * perfil». Lo demás (slug, cupón, ciclo) tiene su propia cobertura y no se toca acá.
 */

type CaptureInput = {
    coachId: string
    tier: string
    method: string
    platform: string
    billingCycle?: string | null
}

const harness = vi.hoisted(() => {
    const USER_ID = '11111111-1111-4111-8111-111111111111'
    const INVITE_CODE = 'X5UD9X44'
    const state = {
        user: { id: USER_ID, email: 'coach@example.com' } as { id: string; email: string } | null,
        existingTrial: null as { id: string } | null,
        existingSlug: null as { id: string } | null,
        insertError: null as { message: string } | null,
        /**
         * Identidades de GoTrue del usuario que entra. El alta por Google normal trae SOLO
         * `google`; el caso del pre-account takeover (W3.13) es el que además trae `email`, o sea
         * alguien que ya había creado ese usuario con contraseña.
         */
        identities: ['google'] as string[],
    }
    const inserts: Array<Record<string, unknown>> = []
    /** Filas escritas en tablas que NO son `coaches` (hoy: el rastro de auditoría de W3.13). */
    const events: Array<{ table: string; row: Record<string, unknown> }> = []
    /** Contraseñas rotadas por `auth.admin.updateUserById` (W3.13). */
    const rotations: Array<{ id: string; password?: string }> = []
    /** Orden real de los efectos: es lo que prueba que el correo se espera ANTES del redirect. */
    const order: string[] = []

    const sendFreeCoachOnboardingEmailsMock = vi.fn(async () => {
        order.push('emails')
    })
    const captureRegisteredMock = vi.fn<(input: CaptureInput) => Promise<void>>(async () => {
        order.push('posthog')
    })
    const generateUniqueInviteCodeMock = vi.fn(async () => INVITE_CODE)
    const queueMetaCapiEventMock = vi.fn(async () => undefined)
    const redirectMock = vi.fn((path: string) => {
        order.push('redirect')
        // Espejo de `next/navigation`: `redirect()` corta el flujo lanzando.
        throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;${path}` })
    })

    const adminStub = {
        __marker: 'admin',
        from: (table: string) => ({
            select: () => ({
                eq: (col: string) => ({
                    maybeSingle: async () =>
                        col === 'trial_used_email'
                            ? { data: state.existingTrial }
                            : { data: state.existingSlug },
                }),
            }),
            insert: async (row: Record<string, unknown>) => {
                if (table !== 'coaches') {
                    events.push({ table, row })
                    return { error: null }
                }
                inserts.push(row)
                return { error: state.insertError }
            },
            // W3.13 sella `email_verified_at` tras rotar; el `.is(null)` mantiene el primer sello.
            update: (patch: Record<string, unknown>) => ({
                eq: () => ({ is: async () => ({ error: null, patch }) }),
            }),
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

    const capturePostHogServerEventMock = vi.fn(async () => undefined)

    return {
        USER_ID,
        INVITE_CODE,
        state,
        inserts,
        events,
        rotations,
        order,
        adminStub,
        serverStub,
        redirectMock,
        queueMetaCapiEventMock,
        generateUniqueInviteCodeMock,
        sendFreeCoachOnboardingEmailsMock,
        captureRegisteredMock,
        capturePostHogServerEventMock,
    }
})

const {
    USER_ID,
    INVITE_CODE,
    state,
    inserts,
    events,
    rotations,
    order,
    adminStub,
    sendFreeCoachOnboardingEmailsMock,
    captureRegisteredMock,
    capturePostHogServerEventMock,
} = harness

// W3.9b: `completeOAuthOnboarding` lee `(await cookies()).get(UTM_COOKIE_NAME)` como fallback de
// atribución (la cookie first-touch `eva_utm` que deja el proxy sobrevive al ida y vuelta de
// Google). Sin este mock `cookies()` es el real de Next y explota fuera de request scope
// ("cookies was called outside a request scope") — por eso los 17 tests de este archivo estaban
// rojos. `get()` devuelve `undefined` por defecto, como el store real sin esa cookie.
const cookiesStoreMock = vi.hoisted(() => ({
    get: vi.fn(() => undefined as { value: string } | undefined),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => harness.serverStub }))
vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: () => harness.adminStub }))
vi.mock('next/navigation', () => ({ redirect: (p: string) => harness.redirectMock(p) }))
vi.mock('next/headers', () => ({ cookies: vi.fn(async () => cookiesStoreMock) }))
vi.mock('@/lib/coach/invite-code.server', () => ({
    generateUniqueInviteCode: harness.generateUniqueInviteCodeMock,
}))
vi.mock('@/lib/meta/capi', () => ({
    newMetaEventId: () => 'evt-1',
    queueMetaCapiEvent: harness.queueMetaCapiEventMock,
}))
vi.mock('@/lib/email/free-coach-onboarding', () => ({
    sendFreeCoachOnboardingEmails: harness.sendFreeCoachOnboardingEmailsMock,
}))
vi.mock('@/lib/posthog/registration-events', () => ({
    captureCoachRegisteredServer: harness.captureRegisteredMock,
}))
// W3.13: la rotación NO se mockea (es lo que se está probando); lo que se mockea es su salida a
// PostHog, que es red.
vi.mock('@/lib/posthog/server-capture', () => ({
    capturePostHogServerEvent: harness.capturePostHogServerEventMock,
}))

import { completeOAuthOnboarding } from './complete.actions'

function form(overrides: Record<string, string> = {}) {
    const fd = new FormData()
    fd.set('brand_name', 'Studio Fuerza')
    fd.set('full_name', 'Josefa Díaz')
    fd.set('subscription_tier', 'free')
    fd.set('billing_cycle', 'monthly')
    fd.set('accept_legal', 'on')
    fd.set('accept_health_data', 'on')
    for (const [k, v] of Object.entries(overrides)) fd.set(k, v)
    return fd
}

/** El action termina lanzando NEXT_REDIRECT; acá se absorbe y se devuelve el destino. */
async function run(fd = form()): Promise<{ redirectedTo: string | null; state: unknown }> {
    try {
        const result = await completeOAuthOnboarding({}, fd)
        return { redirectedTo: null, state: result }
    } catch (err) {
        const digest = (err as { digest?: string }).digest ?? ''
        if (!digest.startsWith('NEXT_REDIRECT')) throw err
        return { redirectedTo: digest.replace('NEXT_REDIRECT;', ''), state: null }
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    inserts.length = 0
    events.length = 0
    rotations.length = 0
    order.length = 0
    state.user = { id: USER_ID, email: 'coach@example.com' }
    state.existingTrial = null
    state.existingSlug = null
    state.insertError = null
    state.identities = ['google']
    cookiesStoreMock.get.mockReturnValue(undefined)
    sendFreeCoachOnboardingEmailsMock.mockImplementation(async () => {
        order.push('emails')
    })
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.eva-app.cl')
})

describe('completeOAuthOnboarding — alta free por Google (web)', () => {
    it('crea el coach y dispara bienvenida + drip con admin, coachId e invite_code', async () => {
        const { redirectedTo } = await run()

        expect(redirectedTo).toBe('/coach/onboarding/persona?welcome=free&eid=evt-1&ph=srv')
        expect(inserts[0]).toMatchObject({
            id: USER_ID,
            subscription_status: 'active',
            invite_code: INVITE_CODE,
            // W3.3 (flujo-coach-nuevo): la marca nace PRENDIDA en las tres altas. Se pinnea el
            // valor escrito, no el DEFAULT de la columna (que sigue en `false` a propósito).
            use_brand_colors_coach: true,
        })
        expect(sendFreeCoachOnboardingEmailsMock).toHaveBeenCalledWith({
            // Service-role: el ledger de correos no se escribe con la sesión del coach.
            admin: adminStub,
            coachId: USER_ID,
            email: 'coach@example.com',
            coachName: 'Josefa Díaz',
            brandName: 'Studio Fuerza',
            // El D+1 del drip necesita el código recién generado.
            inviteCode: INVITE_CODE,
            appUrl: 'https://www.eva-app.cl',
        })
    })

    // Un action que redirige no garantiza trabajo pendiente: si el correo no se espera, el POST a
    // Resend muere con la invocación (misma trampa que ya se había comido el CAPI, 531cf7b6).
    it('los correos se esperan ANTES del redirect', async () => {
        await run()
        expect(order).toEqual(['emails', 'posthog', 'redirect'])
    })

    it('si el helper RECHAZA igual redirige (el alta ya está escrita)', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        sendFreeCoachOnboardingEmailsMock.mockRejectedValue(new Error('resend caído'))

        const { redirectedTo, state: result } = await run()

        expect(redirectedTo).toBe('/coach/onboarding/persona?welcome=free&eid=evt-1&ph=srv')
        expect(result).toBeNull()
        expect(warn).toHaveBeenCalledWith('[register] onboarding email failed')
        expect(JSON.stringify(warn.mock.calls)).not.toContain('coach@example.com')
    })
})

/**
 * W3.0(c) + W3.9 — lo que el alta por Google escribe además del perfil.
 */
describe('completeOAuthOnboarding — señal de correo y atribución', () => {
    it('W3.0(c): nace con `email_verified_at` sellado (el correo lo probó Google)', async () => {
        await run()

        // Único de los tres caminos de alta que nace verificado: el free por correo y el pago
        // nacen NULL y ven el banner de W3.11 hasta que confirmen.
        expect(typeof inserts[0].email_verified_at).toBe('string')
        expect(inserts[0].email_verified_at).toBe(inserts[0].health_data_consent_at)
    })

    it('W3.9: los UTM del formulario llegan saneados a la fila (y el vacío queda NULL)', async () => {
        await run(form({ utm_source: '  meta \n ads  ', utm_campaign: '' }))

        expect(inserts[0]).toMatchObject({ utm_source: 'meta ads', utm_campaign: null })
    })

    it('W3.9: sin UTM en el formulario, ambas columnas quedan en NULL explícito', async () => {
        await run()

        expect(inserts[0]).toMatchObject({ utm_source: null, utm_campaign: null })
    })

    // W3.9b: el formulario de Google nunca planta los hidden inputs (los pierde el ida y vuelta
    // de OAuth) — el fallback es la cookie first-touch `eva_utm` del proxy, formato
    // `source|campaign` URL-encoded por parte (mismo contrato que `parseUtmCookie`).
    it('W3.9b: sin UTM en el formulario, toma utm_source/utm_campaign de la cookie eva_utm', async () => {
        cookiesStoreMock.get.mockReturnValue({ value: 'meta|coaches-ago' })

        await run()

        expect(inserts[0]).toMatchObject({ utm_source: 'meta', utm_campaign: 'coaches-ago' })
    })
})

/**
 * W3.13 — pre-account takeover. Primer call site: el auth user YA EXISTÍA (alguien lo creó con
 * correo + contraseña) y la fila `coaches` no. Con W3.1 esa identidad `email` nace confirmada y
 * Supabase ya no la borra al enlazar Google, así que sin esto el intruso conservaría su contraseña
 * sobre la cuenta ajena.
 */
describe('completeOAuthOnboarding — rotación anti-takeover (W3.13)', () => {
    it('con identidad `email` previa: rota la contraseña, sella el correo y deja rastro', async () => {
        state.identities = ['email', 'google']

        await run()

        expect(rotations).toHaveLength(1)
        expect(rotations[0].id).toBe(USER_ID)
        // 32 bytes en hex. No más: GoTrue hashea con bcrypt y rechaza > 72 caracteres.
        expect(rotations[0].password).toMatch(/^[0-9a-f]{64}$/)
        expect(capturePostHogServerEventMock).toHaveBeenCalledWith({
            event: 'google_link_rotated_password',
            distinctId: USER_ID,
            properties: { context: 'oauth_onboarding' },
        })
        // El rastro va DESPUÉS del insert de `coaches`: la tabla tiene FK a `coaches.id`.
        expect(events).toEqual([
            {
                table: 'coach_onboarding_events',
                row: {
                    coach_id: USER_ID,
                    step_key: 'security',
                    event_type: 'google_link_rotated_password',
                    metadata: { context: 'oauth_onboarding' },
                },
            },
        ])
    })

    it('alta por Google normal (sin identidad `email`): NO rota nada', async () => {
        // El 99 % de los casos. Rotar acá le rompería la contraseña a nadie —no hay— pero sí
        // ensuciaría la auditoría y dispararía una escritura de más en el camino crítico del alta.
        await run()

        expect(rotations).toHaveLength(0)
        expect(events).toHaveLength(0)
        expect(capturePostHogServerEventMock).not.toHaveBeenCalled()
    })

    it('el insert del coach falla: no se rota (no hay cuenta que proteger)', async () => {
        state.identities = ['email', 'google']
        state.insertError = { message: 'duplicate key' }

        await run()

        expect(rotations).toHaveLength(0)
    })
})

describe('completeOAuthOnboarding — cuándo NO se manda nada', () => {
    it('plan PAGO → va al checkout sin bienvenida (esa serie es solo del Free)', async () => {
        const { redirectedTo } = await run(form({ subscription_tier: 'pro' }))
        expect(redirectedTo).toContain('/coach/subscription/processing')
        expect(sendFreeCoachOnboardingEmailsMock).not.toHaveBeenCalled()
    })

    it('el insert del coach falla → error al usuario y CERO correos', async () => {
        state.insertError = { message: 'duplicate key' }
        const { state: result } = await run()
        expect(result).toMatchObject({ code: 'oauth_coach_insert_failed' })
        expect(sendFreeCoachOnboardingEmailsMock).not.toHaveBeenCalled()
    })

    it('validación rechazada (sin marca) → cero correos y cero escrituras', async () => {
        const fd = form()
        fd.set('brand_name', '')
        const { state: result } = await run(fd)
        expect(result).toMatchObject({ code: 'oauth_brand_missing' })
        expect(inserts).toHaveLength(0)
        expect(sendFreeCoachOnboardingEmailsMock).not.toHaveBeenCalled()
    })
})

/**
 * W7.1 — el alta por Google en la web se contaba SOLO desde el aterrizaje, o sea detrás del banner
 * de cookies: quien no aceptaba se daba de alta sin dejar rastro. Ahora la emite el servidor, y el
 * flag `ph=srv` del destino apaga al tracker del navegador para que no se cuente dos veces.
 */
describe('completeOAuthOnboarding — analítica del alta', () => {
    it('emite `coach_registered` con method google y platform web', async () => {
        await run()

        expect(captureRegisteredMock).toHaveBeenCalledWith({
            coachId: USER_ID,
            tier: 'free',
            method: 'google',
            platform: 'web',
        })
    })

    // Un action que redirige no garantiza trabajo pendiente: sin `await`, el POST a PostHog muere
    // con la invocación (misma trampa que ya se comió el CAPI en 531cf7b6).
    it('el evento se espera ANTES del redirect', async () => {
        await run()
        expect(order.indexOf('posthog')).toBeLessThan(order.indexOf('redirect'))
    })

    it('el destino lleva el flag que apaga a CoachRegisteredTracker', async () => {
        const { redirectedTo } = await run()
        expect(redirectedTo).toContain('&ph=srv')
    })

    it('plan PAGO: no se emite acá (ese camino lo cubre checkout_started)', async () => {
        await run(form({ subscription_tier: 'pro' }))
        expect(captureRegisteredMock).not.toHaveBeenCalled()
    })

    it('insert fallido: cero eventos', async () => {
        state.insertError = { message: 'duplicate key' }
        await run()
        expect(captureRegisteredMock).not.toHaveBeenCalled()
    })
})
