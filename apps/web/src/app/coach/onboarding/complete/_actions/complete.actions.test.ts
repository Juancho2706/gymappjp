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

const harness = vi.hoisted(() => {
    const USER_ID = '11111111-1111-4111-8111-111111111111'
    const INVITE_CODE = 'X5UD9X44'
    const state = {
        user: { id: USER_ID, email: 'coach@example.com' } as { id: string; email: string } | null,
        existingTrial: null as { id: string } | null,
        existingSlug: null as { id: string } | null,
        insertError: null as { message: string } | null,
    }
    const inserts: Array<Record<string, unknown>> = []
    /** Orden real de los efectos: es lo que prueba que el correo se espera ANTES del redirect. */
    const order: string[] = []

    const sendFreeCoachOnboardingEmailsMock = vi.fn(async () => {
        order.push('emails')
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
        from: () => ({
            select: () => ({
                eq: (col: string) => ({
                    maybeSingle: async () =>
                        col === 'trial_used_email'
                            ? { data: state.existingTrial }
                            : { data: state.existingSlug },
                }),
            }),
            insert: async (row: Record<string, unknown>) => {
                inserts.push(row)
                return { error: state.insertError }
            },
        }),
    }

    const serverStub = { auth: { getUser: async () => ({ data: { user: state.user } }) } }

    return {
        USER_ID,
        INVITE_CODE,
        state,
        inserts,
        order,
        adminStub,
        serverStub,
        redirectMock,
        queueMetaCapiEventMock,
        generateUniqueInviteCodeMock,
        sendFreeCoachOnboardingEmailsMock,
    }
})

const { USER_ID, INVITE_CODE, state, inserts, order, adminStub, sendFreeCoachOnboardingEmailsMock } = harness

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => harness.serverStub }))
vi.mock('@/lib/supabase/admin-client', () => ({ createServiceRoleClient: () => harness.adminStub }))
vi.mock('next/navigation', () => ({ redirect: (p: string) => harness.redirectMock(p) }))
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
    order.length = 0
    state.user = { id: USER_ID, email: 'coach@example.com' }
    state.existingTrial = null
    state.existingSlug = null
    state.insertError = null
    sendFreeCoachOnboardingEmailsMock.mockImplementation(async () => {
        order.push('emails')
    })
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.eva-app.cl')
})

describe('completeOAuthOnboarding — alta free por Google (web)', () => {
    it('crea el coach y dispara bienvenida + drip con admin, coachId e invite_code', async () => {
        const { redirectedTo } = await run()

        expect(redirectedTo).toBe('/coach/dashboard?welcome=free&eid=evt-1')
        expect(inserts[0]).toMatchObject({ id: USER_ID, subscription_status: 'active', invite_code: INVITE_CODE })
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
        expect(order).toEqual(['emails', 'redirect'])
    })

    it('si el helper RECHAZA igual redirige (el alta ya está escrita)', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        sendFreeCoachOnboardingEmailsMock.mockRejectedValue(new Error('resend caído'))

        const { redirectedTo, state: result } = await run()

        expect(redirectedTo).toBe('/coach/dashboard?welcome=free&eid=evt-1')
        expect(result).toBeNull()
        expect(warn).toHaveBeenCalledWith('[register] onboarding email failed')
        expect(JSON.stringify(warn.mock.calls)).not.toContain('coach@example.com')
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
