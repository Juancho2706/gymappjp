import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * `GET /vive-tu-app` — la entrada del coach a SU app de alumno.
 *
 * Lo que pinnea este test, además del cinturón de siempre:
 *  - el evento `vive_tu_app_entered` se escribe DESPUÉS del cinturón `is_demo` y con el `coach_id`
 *    que sale de la fila del demo, nunca de la URL (docs/specs/vive-tu-app-directo §2). Es la
 *    única señal honesta del paso 2: hasta el 23-08 el paso se tildaba al PEDIR el link y el
 *    funnel reportaba 100 % de algo que convertía 33 %.
 *  - el `device` sale del `user-agent` (medición, jamás autorización).
 *  - ni el token ni el correo del demo entran en el metadata.
 *  - W2: el `c=` de la URL tiene que ser la marca del MISMO coach dueño del demo (V1.28), el
 *    `signOut` del cinturón es LOCAL (V1.27) y las cookies del viaje de vuelta salen con la
 *    precedencia `rn` > `return` > `remote` (V2.7).
 */

const verifyOtp = vi.fn()
const signOut = vi.fn()
const getUser = vi.fn()
const maybeSingle = vi.fn()
const coachMaybeSingle = vi.fn()
const generateLink = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn(async () => ({ auth: { verifyOtp, signOut, getUser } })),
}))

/**
 * Mock POR TABLA con `throw new Error('Unexpected table')` (molde
 * `api/coach/onboarding-events/route.test.ts:38-57`): el mock anterior devolvía la misma cadena
 * para cualquier tabla, así que un insert en la tabla equivocada —o el evento escrito antes del
 * cinturón— habría pasado desapercibido.
 */
const eventInserts: Array<Record<string, unknown>> = []
vi.mock('@/lib/supabase/admin-client', () => ({
    createServiceRoleClient: vi.fn(() => ({
        auth: { admin: { generateLink } },
        from: (table: string) => {
            if (table === 'clients') {
                return { select: () => ({ eq: () => ({ maybeSingle }) }) }
            }
            if (table === 'coaches') {
                return { select: () => ({ eq: () => ({ maybeSingle: coachMaybeSingle }) }) }
            }
            if (table === 'coach_onboarding_events') {
                return {
                    insert: async (row: Record<string, unknown>) => {
                        eventInserts.push(row)
                        return { error: null }
                    },
                }
            }
            throw new Error(`Unexpected table: ${table}`)
        },
    })),
}))

import { GET } from './route'

function req(qs: string, userAgent?: string) {
    return new NextRequest(`https://www.eva-app.cl/vive-tu-app${qs}`, {
        headers: userAgent ? { 'user-agent': userAgent } : undefined,
    })
}

const ANDROID_UA =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Mobile Safari/537.36'
const MAC_UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36'

/** Demo válido de `coach-1`, que es el dueño de la marca `X5UD9X44` / `studio-fuerza-qa`. */
function demoOk(id = 'demo-1', fullName = 'Matías Soto') {
    verifyOtp.mockResolvedValue({ data: { user: { id } }, error: null })
    maybeSingle.mockResolvedValue({ data: { id, is_demo: true, coach_id: 'coach-1', full_name: fullName } })
}

/** Lee una cookie del response con sus atributos (`ResponseCookies` los conserva). */
function cookieOf(res: Response, name: string) {
    return (res as unknown as { cookies: { get: (n: string) => undefined | Record<string, unknown> } }).cookies.get(name)
}

describe('GET /vive-tu-app', () => {
    beforeEach(() => {
        verifyOtp.mockReset()
        signOut.mockReset()
        getUser.mockReset()
        maybeSingle.mockReset()
        coachMaybeSingle.mockReset()
        generateLink.mockReset()
        eventInserts.length = 0
        // Sin sesión de coach en el navegador y con el `c=` correcto: el caso base.
        getUser.mockResolvedValue({ data: { user: null } })
        coachMaybeSingle.mockResolvedValue({ data: { id: 'coach-1' } })
    })

    it('sin identificador válido → /login, sin verificar nada', async () => {
        const res = await GET(req('?t=abc&c=../x'))
        expect(res.headers.get('location')).toBe('https://www.eva-app.cl/login')
        expect(verifyOtp).not.toHaveBeenCalled()
    })

    it('sin token → login del alumno con error', async () => {
        const res = await GET(req('?c=studio-fuerza-qa'))
        expect(res.headers.get('location')).toBe(
            'https://www.eva-app.cl/c/studio-fuerza-qa/login?error=vive_tu_app_expirado'
        )
        expect(verifyOtp).not.toHaveBeenCalled()
    })

    it('token vencido → login del alumno con error', async () => {
        verifyOtp.mockResolvedValue({ data: { user: null }, error: { message: 'expired' } })
        const res = await GET(req('?t=tok&c=studio-fuerza-qa'))
        expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'tok', type: 'magiclink' })
        expect(res.headers.get('location')).toContain('/c/studio-fuerza-qa/login?error=vive_tu_app_expirado')
        expect(eventInserts).toHaveLength(0)
    })

    it('token válido de un alumno DEMO → dashboard del alumno con la marca del coach', async () => {
        demoOk('u1')
        const res = await GET(req('?t=tok&c=X5UD9X44'))
        expect(res.headers.get('location')).toBe('https://www.eva-app.cl/c/X5UD9X44/dashboard')
        expect(signOut).not.toHaveBeenCalled()
    })

    it('token válido → escribe `vive_tu_app_entered` con el coach_id del demo y el device', async () => {
        demoOk()

        await GET(req('?t=HASH_SECRETO&c=X5UD9X44', ANDROID_UA))

        expect(eventInserts).toHaveLength(1)
        expect(eventInserts[0]).toMatchObject({
            // El coach sale de la FILA del demo, nunca del identificador de la URL.
            coach_id: 'coach-1',
            step_key: 'vive_tu_app',
            event_type: 'vive_tu_app_entered',
            metadata: { surface: 'web', device: 'mobile', mode: 'remote', identifier_kind: 'code' },
        })
        // Ni el token ni el correo del demo salen del servidor.
        expect(JSON.stringify(eventInserts)).not.toContain('HASH_SECRETO')
        expect(JSON.stringify(eventInserts)).not.toContain('@')
    })

    it('desde escritorio el device es `desktop` y el slug se etiqueta como slug', async () => {
        demoOk('demo-1', 'Ana Riquelme')

        await GET(req('?t=tok&c=studio-fuerza-qa', MAC_UA))

        expect(eventInserts[0]?.metadata).toMatchObject({ device: 'desktop', identifier_kind: 'slug' })
    })

    it('token válido de un usuario que NO es demo → cierra la sesión LOCAL, vuelve al login y NO mide nada', async () => {
        verifyOtp.mockResolvedValue({ data: { user: { id: 'coach-1' } }, error: null })
        maybeSingle.mockResolvedValue({ data: null })
        const res = await GET(req('?t=tok&c=studio-fuerza-qa'))
        // V1.27: el alcance global mataba la sesión de ese usuario en TODOS sus dispositivos.
        expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
        expect(res.headers.get('location')).toContain('/c/studio-fuerza-qa/login?error=vive_tu_app_expirado')
        expect(eventInserts).toHaveLength(0)
    })

    it('V1.28 — token válido con `c=` de OTRO coach → rechazado, sin entrar y sin medir', async () => {
        demoOk()
        // La marca de la URL pertenece a otro coach: el demo es de `coach-1`.
        coachMaybeSingle.mockResolvedValue({ data: { id: 'coach-2' } })

        const res = await GET(req('?t=tok&c=otro-coach'))

        expect(res.headers.get('location')).toBe(
            'https://www.eva-app.cl/c/otro-coach/login?error=vive_tu_app_expirado'
        )
        expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
        expect(eventInserts).toHaveLength(0)
    })

    it('V1.28 — marca inexistente en la URL → mismo rechazo neutro', async () => {
        demoOk()
        coachMaybeSingle.mockResolvedValue({ data: null })

        const res = await GET(req('?t=tok&c=no-existe'))

        expect(res.headers.get('location')).toContain('/c/no-existe/login?error=vive_tu_app_expirado')
        expect(eventInserts).toHaveLength(0)
    })

    describe('V2.7 — camino de vuelta', () => {
        it('con la sesión del coach DUEÑO setea la cookie de retorno (httpOnly, path /volver-al-panel, 3600) y modo `return`', async () => {
            demoOk()
            getUser.mockResolvedValue({ data: { user: { id: 'coach-1', email: 'coach@evatest.cl' } } })
            generateLink.mockResolvedValue({ data: { properties: { hashed_token: 'RETORNO_SECRETO' } }, error: null })

            const res = await GET(req('?t=tok&c=X5UD9X44', ANDROID_UA))

            const cookie = cookieOf(res, 'eva_vta_return')
            expect(cookie).toBeDefined()
            expect(cookie?.httpOnly).toBe(true)
            expect(cookie?.path).toBe('/volver-al-panel')
            expect(cookie?.maxAge).toBe(3600)
            expect(cookie?.sameSite).toBe('lax')
            expect(JSON.parse(String(cookie?.value))).toEqual({ t: 'RETORNO_SECRETO', c: 'coach-1' })
            expect(cookieOf(res, 'eva_vta_mode')?.value).toBe('return')
            expect(eventInserts[0]?.metadata).toMatchObject({ mode: 'return' })
        })

        it('con la sesión de OTRO coach NO setea la cookie: el modo es `remote`', async () => {
            demoOk()
            getUser.mockResolvedValue({ data: { user: { id: 'coach-9', email: 'otro@evatest.cl' } } })

            const res = await GET(req('?t=tok&c=X5UD9X44'))

            expect(cookieOf(res, 'eva_vta_return')).toBeUndefined()
            expect(generateLink).not.toHaveBeenCalled()
            expect(cookieOf(res, 'eva_vta_mode')?.value).toBe('remote')
            expect(eventInserts[0]?.metadata).toMatchObject({ mode: 'remote' })
        })

        it('`src=rn` gana aunque haya sesión del coach dueño, y guarda `from`', async () => {
            demoOk()
            getUser.mockResolvedValue({ data: { user: { id: 'coach-1', email: 'coach@evatest.cl' } } })

            const res = await GET(req('?t=tok&c=X5UD9X44&src=rn&from=builder', ANDROID_UA))

            expect(cookieOf(res, 'eva_vta_mode')?.value).toBe('rn')
            expect(cookieOf(res, 'eva_vta_from')?.value).toBe('builder')
            // La vuelta la resuelve el deep link: no se gasta un magic link del coach.
            expect(generateLink).not.toHaveBeenCalled()
            expect(cookieOf(res, 'eva_vta_return')).toBeUndefined()
            expect(eventInserts[0]?.metadata).toMatchObject({ mode: 'rn', surface: 'rn' })
        })

        it('sin sesión de coach en el navegador ⇒ `remote`', async () => {
            demoOk()

            const res = await GET(req('?t=tok&c=X5UD9X44'))

            expect(cookieOf(res, 'eva_vta_mode')?.value).toBe('remote')
            expect(cookieOf(res, 'eva_vta_return')).toBeUndefined()
        })

        it('`generateLink` falla ⇒ `remote` y el redirect al dashboard igual', async () => {
            demoOk()
            getUser.mockResolvedValue({ data: { user: { id: 'coach-1', email: 'coach@evatest.cl' } } })
            generateLink.mockRejectedValue(new Error('gotrue caído'))

            const res = await GET(req('?t=tok&c=X5UD9X44'))

            expect(res.headers.get('location')).toBe('https://www.eva-app.cl/c/X5UD9X44/dashboard')
            expect(cookieOf(res, 'eva_vta_mode')?.value).toBe('remote')
            expect(cookieOf(res, 'eva_vta_return')).toBeUndefined()
        })
    })

    describe('el token del coach no se filtra', () => {
        const spies: Array<{ mockRestore: () => void }> = []
        afterEach(() => {
            spies.forEach((s) => s.mockRestore())
            spies.length = 0
        })

        it('no aparece ni en los logs ni en el metadata del evento', async () => {
            demoOk()
            getUser.mockResolvedValue({ data: { user: { id: 'coach-1', email: 'coach@evatest.cl' } } })
            generateLink.mockResolvedValue({ data: { properties: { hashed_token: 'RETORNO_SECRETO' } }, error: null })

            const log = vi.spyOn(console, 'log').mockImplementation(() => {})
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
            const error = vi.spyOn(console, 'error').mockImplementation(() => {})
            spies.push(log, warn, error)

            await GET(req('?t=TOKEN_DEL_DEMO&c=X5UD9X44'))

            const logged = JSON.stringify([log.mock.calls, warn.mock.calls, error.mock.calls])
            expect(logged).not.toContain('RETORNO_SECRETO')
            expect(logged).not.toContain('TOKEN_DEL_DEMO')
            expect(JSON.stringify(eventInserts)).not.toContain('RETORNO_SECRETO')
            expect(JSON.stringify(eventInserts)).not.toContain('TOKEN_DEL_DEMO')
        })
    })
})
