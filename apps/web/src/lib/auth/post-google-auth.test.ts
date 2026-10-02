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
    /** 02-10, caso Carolina/Movens: fila `clients` del alumno con el slug de su coach embebido. */
    client: null as { id: string; coaches: { slug: string | null } | null } | null,
    clientReadThrows: false,
    signedOut: false,
}))

const signOutMock = vi.fn(async () => {
    state.signedOut = true
    return { error: null }
})
const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))

const supabaseStub = {
    from: (table: string) => ({
        select: () => ({
            eq: () => ({
                maybeSingle: async () => {
                    if (table !== 'clients') return { data: state.coach }
                    if (state.clientReadThrows) throw new Error('red caída')
                    // RLS real: sin sesión el alumno no puede leer su fila. Si alguien moviera la
                    // lectura DESPUÉS del signOut, este stub lo delata devolviendo vacío.
                    return { data: state.signedOut ? null : state.client }
                },
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
    state.client = null
    state.clientReadThrows = false
    state.signedOut = false
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

    it('ALUMNO con coach: rebota al login de SU coach con el aviso, tras limpiar y cerrar la sesión', async () => {
        state.client = { id: USER_ID, coaches: { slug: 'movens' } }

        const url = await resolvePostGoogleAuthUrl({ supabase, userId: USER_ID, intent: 'login', next: '/coach/dashboard' })

        expect(url).toBe('/c/movens/login?error=google_solo_coach')
        // Google para alumnos sigue diferido: la sesión se cierra igual que la de cualquier rechazo.
        expect(fetchMock).toHaveBeenCalledWith('/api/auth/google-orphan-cleanup', { method: 'POST' })
        expect(signOutMock).toHaveBeenCalledWith({ scope: 'local' })
    })

    it('ALUMNO que venía con un destino de coach explícito: igual va a la puerta de su coach', async () => {
        state.client = { id: USER_ID, coaches: { slug: 'movens' } }

        const url = await resolvePostGoogleAuthUrl({
            supabase,
            userId: USER_ID,
            intent: 'login',
            next: '/coach/subscription?utm_source=email',
        })

        expect(url).toBe('/c/movens/login?error=google_solo_coach')
    })

    it('fila `clients` sin slug de coach, o lectura caída: rebote de siempre a `/login`', async () => {
        state.client = { id: USER_ID, coaches: { slug: null } }
        await expect(
            resolvePostGoogleAuthUrl({ supabase, userId: USER_ID, intent: 'login', next: '/coach/dashboard' })
        ).resolves.toBe('/login?error=no_google_account')

        state.signedOut = false
        state.client = null
        state.clientReadThrows = true
        await expect(
            resolvePostGoogleAuthUrl({ supabase, userId: USER_ID, intent: 'login', next: '/coach/dashboard' })
        ).resolves.toBe('/login?error=no_google_account')
    })

    it('ALUMNO pero el signOut falla dos veces: NO va al login del coach (rebotaría a su app con Google adentro)', async () => {
        state.client = { id: USER_ID, coaches: { slug: 'movens' } }
        signOutMock.mockResolvedValueOnce({ error: { message: '503' } } as never)
        signOutMock.mockResolvedValueOnce({ error: { message: '503' } } as never)

        const url = await resolvePostGoogleAuthUrl({ supabase, userId: USER_ID, intent: 'login', next: '/coach/dashboard' })

        expect(url).toBe('/login?error=no_google_account')
        expect(signOutMock).toHaveBeenCalledTimes(2)
    })

    it('ALUMNO con un signOut que falla una vez: el reintento lo cierra y va a su puerta', async () => {
        state.client = { id: USER_ID, coaches: { slug: 'movens' } }
        signOutMock.mockResolvedValueOnce({ error: { message: 'red' } } as never)

        const url = await resolvePostGoogleAuthUrl({ supabase, userId: USER_ID, intent: 'login', next: null })

        expect(url).toBe('/c/movens/login?error=google_solo_coach')
        expect(signOutMock).toHaveBeenCalledTimes(2)
    })

    it('ALUMNO que toca «Registrarse con Google»: también va a su puerta, con la sesión cerrada', async () => {
        // El alta de coach lo rechaza igual en el servidor (`oauth_session_is_client`).
        state.client = { id: USER_ID, coaches: { slug: 'movens' } }

        const url = await resolvePostGoogleAuthUrl({ supabase, userId: USER_ID, intent: 'register', next: null })

        expect(url).toBe('/c/movens/login?error=google_solo_coach')
        expect(signOutMock).toHaveBeenCalledWith({ scope: 'local' })
    })

    it('el slug va codificado en la URL (un slug raro no rompe la ruta)', async () => {
        state.client = { id: USER_ID, coaches: { slug: 'a b/c' } }

        const url = await resolvePostGoogleAuthUrl({ supabase, userId: USER_ID, intent: 'login', next: null })

        expect(url).toBe('/c/a%20b%2Fc/login?error=google_solo_coach')
    })

    it('coach real: entra a su panel sin tocar nada', async () => {
        state.coach = { id: USER_ID, active_org_id: null }

        const url = await resolvePostGoogleAuthUrl({ supabase, userId: USER_ID, intent: 'login', next: '/coach/dashboard' })

        expect(url).toBe('/coach/dashboard')
        expect(fetchMock).not.toHaveBeenCalled()
        expect(signOutMock).not.toHaveBeenCalled()
    })
})
