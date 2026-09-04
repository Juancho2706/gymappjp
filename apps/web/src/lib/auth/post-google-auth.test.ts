import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `resolvePostGoogleAuthUrl` es el único punto de código de las dos puertas web post-Google. Acá se
 * pinnea lo que agregó el caso Leonardo/Movens (2026-09-04): un login con Google SIN fila `coaches`
 * avisa al servidor (`/api/auth/google-orphan-cleanup`, con la cookie todavía viva) y cierra la
 * sesión en scope local ANTES de rebotar a `/login?error=no_google_account`. Ni el registro con
 * Google (el usuario se queda para el onboarding) ni el coach real pasan por ahí.
 */

const state = vi.hoisted(() => ({
    coach: null as { id: string; active_org_id: string | null } | null,
}))

const signOutMock = vi.fn(async () => ({ error: null }))
const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))

const supabaseStub = {
    from: () => ({
        select: () => ({
            eq: () => ({
                maybeSingle: async () => ({ data: state.coach }),
                eq: () => ({ eq: () => ({ is: () => ({ maybeSingle: async () => ({ data: null }) }) }) }),
            }),
        }),
    }),
    auth: { signOut: signOutMock },
}

import { resolvePostGoogleAuthUrl } from './post-google-auth'

const supabase = supabaseStub as never
const USER_ID = '99999999-9999-4999-8999-999999999999'

beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
    state.coach = null
})

describe('resolvePostGoogleAuthUrl — login con Google sin cuenta de coach', () => {
    it('avisa al servidor (cookie viva) y cierra la sesión local ANTES de rebotar al login', async () => {
        const order: string[] = []
        fetchMock.mockImplementationOnce(async () => {
            order.push('cleanup')
            return new Response(JSON.stringify({ ok: true }), { status: 200 })
        })
        signOutMock.mockImplementationOnce(async () => {
            order.push('signOut')
            return { error: null }
        })

        const url = await resolvePostGoogleAuthUrl({ supabase, userId: USER_ID, intent: 'login', next: '/coach/dashboard' })

        expect(url).toBe('/login?error=no_google_account')
        expect(fetchMock).toHaveBeenCalledWith('/api/auth/google-orphan-cleanup', { method: 'POST' })
        expect(signOutMock).toHaveBeenCalledWith({ scope: 'local' })
        expect(order).toEqual(['cleanup', 'signOut'])
    })

    it('conserva el destino explícito del correo de cupo aunque limpie', async () => {
        const url = await resolvePostGoogleAuthUrl({
            supabase,
            userId: USER_ID,
            intent: 'login',
            next: '/coach/subscription?utm_source=email',
        })

        expect(url).toBe(`/login?error=no_google_account&next=${encodeURIComponent('/coach/subscription?utm_source=email')}`)
        expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('si el aviso o el signOut fallan, el rebote sale igual', async () => {
        fetchMock.mockRejectedValueOnce(new Error('red caída'))
        signOutMock.mockRejectedValueOnce(new Error('sin sesión'))

        await expect(
            resolvePostGoogleAuthUrl({ supabase, userId: USER_ID, intent: 'login', next: '/coach/dashboard' })
        ).resolves.toBe('/login?error=no_google_account')
    })

    it('`/reset-password` se respeta de una: ni lookup, ni aviso, ni signOut (lo usan los alumnos)', async () => {
        const url = await resolvePostGoogleAuthUrl({ supabase, userId: USER_ID, intent: 'login', next: '/reset-password' })

        expect(url).toBe('/reset-password')
        expect(fetchMock).not.toHaveBeenCalled()
        expect(signOutMock).not.toHaveBeenCalled()
    })

    it('registro con Google sin fila coaches: el usuario se QUEDA para el onboarding (ni aviso ni signOut)', async () => {
        const url = await resolvePostGoogleAuthUrl({ supabase, userId: USER_ID, intent: 'register', next: null })

        expect(url).toBe('/register?from=google')
        expect(fetchMock).not.toHaveBeenCalled()
        expect(signOutMock).not.toHaveBeenCalled()
    })

    it('coach real: entra a su panel sin tocar nada', async () => {
        state.coach = { id: USER_ID, active_org_id: null }

        const url = await resolvePostGoogleAuthUrl({ supabase, userId: USER_ID, intent: 'login', next: '/coach/dashboard' })

        expect(url).toBe('/coach/dashboard')
        expect(fetchMock).not.toHaveBeenCalled()
        expect(signOutMock).not.toHaveBeenCalled()
    })
})
