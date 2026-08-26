import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * `POST /volver-al-panel` — el camino de vuelta del coach desde su app de alumno
 * (docs/specs/vive-tu-app-directo §3, D1 = A).
 *
 * Lo que pinnea este test:
 *  - las tres ramas del contrato y su ORDEN: solo la (c) consume el magic link del coach;
 *  - el `verifyOtp` va PRIMERO en la rama (c): si el token ya no sirve, la sesión del demo no se
 *    toca y el coach queda donde estaba, con la explicación honesta;
 *  - las tres cookies se borran en TODAS las ramas repitiendo su `path` (sin el path se borra otra
 *    cookie y la credencial del coach sigue viva hasta una hora);
 *  - un `GET` no consume nada (un prefetch quemaría el token).
 */

const getUser = vi.fn()
const verifyOtp = vi.fn()
const clientMaybeSingle = vi.fn()
const coachMaybeSingle = vi.fn()
const capture = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn(async () => ({ auth: { getUser, verifyOtp } })),
}))

vi.mock('@/lib/supabase/admin-client', () => ({
    createServiceRoleClient: vi.fn(() => ({
        from: (table: string) => {
            if (table === 'clients') return { select: () => ({ eq: () => ({ maybeSingle: clientMaybeSingle }) }) }
            if (table === 'coaches') return { select: () => ({ eq: () => ({ maybeSingle: coachMaybeSingle }) }) }
            throw new Error(`Unexpected table: ${table}`)
        },
    })),
}))

vi.mock('@/lib/posthog/server-capture', () => ({
    capturePostHogServerEvent: (...args: unknown[]) => capture(...args),
}))

import { GET, POST } from './route'

const RETURN_COOKIE = JSON.stringify({ t: 'TOKEN_DEL_COACH', c: 'coach-1' })

function post(cookie: string | null = `eva_vta_return=${encodeURIComponent(RETURN_COOKIE)}`) {
    return new NextRequest('https://www.eva-app.cl/volver-al-panel', {
        method: 'POST',
        headers: cookie ? { cookie } : undefined,
    })
}

function cookieOf(res: Response, name: string) {
    return (res as unknown as { cookies: { get: (n: string) => undefined | Record<string, unknown> } }).cookies.get(name)
}

/** Las tres cookies del viaje se borran SIEMPRE, y cada una con el `path` con el que nació. */
function expectCookiesCleared(res: Response) {
    const ret = cookieOf(res, 'eva_vta_return')
    expect(ret?.value).toBe('')
    expect(ret?.maxAge).toBe(0)
    expect(ret?.path).toBe('/volver-al-panel')
    for (const name of ['eva_vta_mode', 'eva_vta_from']) {
        const c = cookieOf(res, name)
        expect(c?.value).toBe('')
        expect(c?.maxAge).toBe(0)
        expect(c?.path).toBe('/')
    }
}

describe('POST /volver-al-panel', () => {
    beforeEach(() => {
        getUser.mockReset()
        verifyOtp.mockReset()
        clientMaybeSingle.mockReset()
        coachMaybeSingle.mockReset()
        capture.mockReset()
        getUser.mockResolvedValue({ data: { user: null } })
        coachMaybeSingle.mockResolvedValue({ data: { id: 'coach-1', slug: 'studio-fuerza-qa', invite_code: 'X5UD9' } })
        clientMaybeSingle.mockResolvedValue({ data: null })
        verifyOtp.mockResolvedValue({ data: { user: { id: 'coach-1' } }, error: null })
    })

    it('GET → 405 y no consume nada', async () => {
        const res = await GET()
        expect(res.status).toBe(405)
        expect(res.headers.get('allow')).toBe('POST')
        expect(verifyOtp).not.toHaveBeenCalled()
    })

    it('sin cookie de retorno → login del coach con el aviso, cookies limpias', async () => {
        const res = await POST(post(null))
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toBe('https://www.eva-app.cl/login?error=vive_tu_app_volver')
        expect(verifyOtp).not.toHaveBeenCalled()
        expectCookiesCleared(res)
    })

    it('cookie ilegible → se trata como ausente (nunca un error en la cara del coach)', async () => {
        const res = await POST(post('eva_vta_return=no-es-json'))
        expect(res.headers.get('location')).toContain('/login?error=vive_tu_app_volver')
        expect(verifyOtp).not.toHaveBeenCalled()
    })

    it('(a) el coach ya volvió por otra pestaña → /coach/guia SIN consumir el token', async () => {
        getUser.mockResolvedValue({ data: { user: { id: 'coach-1' } } })

        const res = await POST(post())

        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toBe('https://www.eva-app.cl/coach/guia')
        expect(verifyOtp).not.toHaveBeenCalled()
        expectCookiesCleared(res)
    })

    it('(b) un alumno REAL en el mismo navegador → login del alumno, sin consumir el token', async () => {
        getUser.mockResolvedValue({ data: { user: { id: 'alumna-real' } } })
        clientMaybeSingle.mockResolvedValue({ data: { id: 'alumna-real', coach_id: 'coach-1', is_demo: false } })

        const res = await POST(post())

        expect(res.headers.get('location')).toBe('https://www.eva-app.cl/c/X5UD9/login')
        expect(verifyOtp).not.toHaveBeenCalled()
        expectCookiesCleared(res)
    })

    it('(b) el demo de OTRO coach tampoco gasta el token', async () => {
        getUser.mockResolvedValue({ data: { user: { id: 'demo-ajeno' } } })
        clientMaybeSingle.mockResolvedValue({ data: { id: 'demo-ajeno', coach_id: 'coach-9', is_demo: true } })

        const res = await POST(post())

        expect(res.headers.get('location')).toContain('/c/X5UD9/login')
        expect(verifyOtp).not.toHaveBeenCalled()
    })

    it('(c) con la sesión del demo del coach → verifica y devuelve a la guía', async () => {
        getUser.mockResolvedValue({ data: { user: { id: 'demo-1' } } })
        clientMaybeSingle.mockResolvedValue({ data: { id: 'demo-1', coach_id: 'coach-1', is_demo: true } })

        const res = await POST(post())

        expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'TOKEN_DEL_COACH', type: 'magiclink' })
        expect(res.status).toBe(303)
        expect(res.headers.get('location')).toBe('https://www.eva-app.cl/coach/guia?desde=vive-tu-app')
        expect(capture).toHaveBeenCalledWith(
            expect.objectContaining({ event: 'vive_tu_app_returned', distinctId: 'coach-1' }),
        )
        expectCookiesCleared(res)
    })

    it('(c) sin sesión (tocó «Cerrar sesión») también verifica y vuelve', async () => {
        const res = await POST(post())
        expect(verifyOtp).toHaveBeenCalledTimes(1)
        expect(res.headers.get('location')).toContain('/coach/guia?desde=vive-tu-app')
    })

    it('(c) token vencido o ya usado → sigue en el demo con `?volver=vencido`, sin tocar su sesión', async () => {
        getUser.mockResolvedValue({ data: { user: { id: 'demo-1' } } })
        clientMaybeSingle.mockResolvedValue({ data: { id: 'demo-1', coach_id: 'coach-1', is_demo: true } })
        verifyOtp.mockResolvedValue({ data: { user: null }, error: { message: 'Token has expired' } })

        const res = await POST(post())

        expect(res.headers.get('location')).toBe('https://www.eva-app.cl/c/X5UD9/dashboard?volver=vencido')
        expect(capture).not.toHaveBeenCalled()
        expectCookiesCleared(res)
    })

    it('el token del coach nunca viaja a analítica', async () => {
        await POST(post())
        expect(JSON.stringify(capture.mock.calls)).not.toContain('TOKEN_DEL_COACH')
    })
})
