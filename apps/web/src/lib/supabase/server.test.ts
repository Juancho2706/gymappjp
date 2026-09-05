import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Fuga de sesión en los runtime logs (incidente 04-09, `/api/auth/google-link` 21:43Z y 21:52Z).
 *
 * Una cookie `sb-*-auth-token` con un chunk perdido deja un JSON TRUNCADO. `@supabase/auth-js`
 * devuelve entonces el string crudo (`helpers.js:128-139`) y acto seguido le asigna `.user`
 * (`GoTrueClient.js:3803`), lo que lanza `TypeError: Cannot create property 'user' on string
 * '{"access_token":"eyJ…"}'` — con la sesión ENTERA dentro del mensaje— y lo imprime su propio
 * `catch` con `console.error(err)` (`GoTrueClient.js:3855-3858`). Ningún try/catch de una route
 * puede evitarlo: la librería no relanza, ya logueó.
 *
 * Lo que se pinnea acá es el corte: la cookie ilegible NO llega al storage de supabase-js. Y el
 * contrapeso, que es lo que hace seguro el arreglo: una sesión USABLE nunca se descarta.
 */

const captured: { cookies?: { getAll: () => { name: string; value: string }[] } } = {}
const cookieStore = { all: [] as { name: string; value: string }[] }

vi.mock('next/headers', () => ({
    cookies: async () => ({ getAll: () => cookieStore.all, set: () => {} }),
}))

vi.mock('@supabase/ssr', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@supabase/ssr')>()
    return {
        ...actual,
        createServerClient: (_url: string, _key: string, options: { cookies: never }) => {
            captured.cookies = options.cookies
            return {}
        },
    }
})

import { stringToBase64URL } from '@supabase/ssr'
import { createClient } from './server'

const KEY = 'sb-abcdefghijklmnop-auth-token'
const SESSION = JSON.stringify({
    access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.CARGA',
    refresh_token: 'r3fr3sh-t0k3n',
    expires_at: 4102444800,
    user: { id: '22222222-2222-4222-8222-222222222222', email: 'coach@eva-app.cl' },
})

/** Lo que auth-js llega a ver después del saneamiento. */
async function visibleCookies() {
    await createClient()
    return captured.cookies!.getAll()
}

beforeEach(() => {
    vi.clearAllMocks()
    cookieStore.all = []
})

describe('createClient — cookies de sesión ilegibles', () => {
    it('deja pasar la sesión válida en una sola cookie', async () => {
        cookieStore.all = [{ name: KEY, value: SESSION }]

        expect(await visibleCookies()).toEqual([{ name: KEY, value: SESSION }])
    })

    it('deja pasar la sesión válida chunkeada y en base64url (el encoding por defecto de ssr)', async () => {
        const encoded = 'base64-' + stringToBase64URL(SESSION)
        const half = Math.ceil(encoded.length / 2)
        cookieStore.all = [
            { name: `${KEY}.0`, value: encoded.slice(0, half) },
            { name: `${KEY}.1`, value: encoded.slice(half) },
        ]

        expect(await visibleCookies()).toHaveLength(2)
    })

    it('descarta el JSON truncado por el chunk perdido — el caso exacto del 04-09', async () => {
        // Solo el `.0`: el `.1` se perdió, así que lo combinado no cierra como JSON.
        cookieStore.all = [
            { name: `${KEY}.0`, value: SESSION.slice(0, 40) },
            { name: 'otra-cookie', value: 'intacta' },
        ]

        const visible = await visibleCookies()

        expect(visible).toEqual([{ name: 'otra-cookie', value: 'intacta' }])
        // Sin la cookie, auth-js ve "no hay sesión" ⇒ 401 limpio, que es el contrato de antes.
        expect(visible.some((c) => c.value.includes('access_token'))).toBe(false)
    })

    it('el log del descarte no lleva el valor ni el nombre de la cookie', async () => {
        cookieStore.all = [{ name: KEY, value: SESSION.slice(0, 40) }]
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        try {
            await visibleCookies()

            const emitted = warn.mock.calls
                .flat()
                .map((arg) => (typeof arg === 'string' ? arg : JSON.stringify(arg)))
                .join(' ')
            expect(emitted).not.toContain('access_token')
            expect(emitted).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')
            expect(emitted).not.toContain(KEY)
        } finally {
            warn.mockRestore()
        }
    })

    it('NO toca el `-code-verifier` de PKCE, que a propósito no es JSON', async () => {
        const verifier = { name: `${KEY}-code-verifier`, value: 'JVi7c0nVerIfIer' }
        cookieStore.all = [verifier]

        expect(await visibleCookies()).toEqual([verifier])
    })
})
