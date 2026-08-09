import { describe, it, expect } from 'vitest'
import {
    ACTION_REDIRECT_HEADER,
    isServerActionRequest,
    SERVER_ACTION_HEADER,
    toServerActionRedirect,
} from './server-action-redirect'

function h(init: Record<string, string>): Headers {
    return new Headers(init)
}

function redirect(location: string, status = 307, extra: Record<string, string> = {}): Response {
    return new Response(null, { status, headers: { location, ...extra } })
}

describe('isServerActionRequest', () => {
    it('POST con next-action → true', () => {
        expect(isServerActionRequest(h({ [SERVER_ACTION_HEADER]: '7f3a9c1d2e' }))).toBe(true)
    })

    it('header vacío igual cuenta (Next lo manda siempre en la acción)', () => {
        expect(isServerActionRequest(h({ [SERVER_ACTION_HEADER]: '' }))).toBe(true)
    })

    it('navegación RSC normal → false', () => {
        expect(isServerActionRequest(h({ rsc: '1' }))).toBe(false)
    })

    it('request sin headers relevantes → false', () => {
        expect(isServerActionRequest(h({}))).toBe(false)
    })
})

describe('toServerActionRedirect — el 307 del proxy que rompía la acción del alumno', () => {
    it('307 a login → 200 text/plain con x-action-redirect', () => {
        const out = toServerActionRedirect(redirect('https://www.eva-app.cl/c/jotap-coach/login'))

        expect(out).not.toBeNull()
        expect(out!.status).toBe(200)
        expect(out!.headers.get(ACTION_REDIRECT_HEADER)).toBe(
            'https://www.eva-app.cl/c/jotap-coach/login;replace',
        )
        expect(out!.headers.get('content-type')).toBe('text/plain;charset=utf-8')
    })

    it('preserva las cookies del redirect original (sesión limpiada)', () => {
        const original = new Response(null, { status: 307, headers: { location: '/c/x/login' } })
        original.headers.append('set-cookie', 'sb-access-token=; Max-Age=0; Path=/')
        original.headers.append('set-cookie', 'sb-refresh-token=; Max-Age=0; Path=/')

        const out = toServerActionRedirect(original)

        const cookies = out!.headers.getSetCookie()
        expect(cookies).toHaveLength(2)
        expect(cookies[0]).toContain('sb-access-token=')
        expect(cookies[1]).toContain('sb-refresh-token=')
    })

    it('cubre 302 y 303 además del 307 del proxy', () => {
        expect(toServerActionRedirect(redirect('/a', 302))).not.toBeNull()
        expect(toServerActionRedirect(redirect('/a', 303))).not.toBeNull()
    })

    it('respuesta normal (200) → null, el caller la deja pasar', () => {
        expect(toServerActionRedirect(new Response('ok', { status: 200 }))).toBeNull()
    })

    it('429 del rate limit → null (no es un redirect)', () => {
        expect(toServerActionRedirect(new Response('{}', { status: 429 }))).toBeNull()
    })

    it('3xx sin location → null (no hay a dónde mandar al cliente)', () => {
        expect(toServerActionRedirect(new Response(null, { status: 304 }))).toBeNull()
    })
})
