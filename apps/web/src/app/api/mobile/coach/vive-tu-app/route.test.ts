import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * `POST /api/mobile/coach/vive-tu-app` — el mismo link que la web, pedido desde la app.
 *
 * V1.29: hasta hoy este endpoint no tenía NINGÚN rate limit en sus 62 líneas, y cada POST emite un
 * magic link real de GoTrue (que además comparte el slot de recovery). Desde la app «atrás + volver
 * a tocar» es tan barato como en la web.
 */

const resolveCtx = vi.fn()
const createViveTuAppLink = vi.fn()
const rateLimit = vi.fn()

vi.mock('@/app/api/mobile/coach/clients/_mutation-auth', () => ({
    resolveMobileClientMutationContext: (...args: unknown[]) => resolveCtx(...args),
}))

vi.mock('@/services/onboarding/vive-tu-app.service', () => ({
    createViveTuAppLink: (...args: unknown[]) => createViveTuAppLink(...args),
}))

vi.mock('@/lib/rate-limit', () => ({
    rateLimitViveTuAppMobile: (...args: unknown[]) => rateLimit(...args),
}))

import { POST } from './route'

function req(body?: unknown) {
    return new NextRequest('https://www.eva-app.cl/api/mobile/coach/vive-tu-app', {
        method: 'POST',
        headers: { authorization: 'Bearer token', 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    })
}

describe('POST /api/mobile/coach/vive-tu-app', () => {
    beforeEach(() => {
        resolveCtx.mockReset()
        createViveTuAppLink.mockReset()
        rateLimit.mockReset()
        rateLimit.mockResolvedValue({ ok: true })
        resolveCtx.mockResolvedValue({ admin: {}, userDb: {}, userId: 'coach-1', scope: { type: 'standalone' } })
        createViveTuAppLink.mockResolvedValue({ ok: true, url: 'https://www.eva-app.cl/vive-tu-app?t=x&c=y&src=rn&from=guia', demoName: 'Matías' })
    })

    it('devuelve el link del coach autenticado', async () => {
        const res = await POST(req({ from: 'builder' }))
        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toMatchObject({ ok: true, demoName: 'Matías' })
        expect(createViveTuAppLink).toHaveBeenCalledWith({}, {}, expect.objectContaining({ from: 'builder' }))
    })

    it('throttleado → 429 con el shape JSON del endpoint y sin emitir link', async () => {
        rateLimit.mockResolvedValue({ ok: false, retryAfter: 42 })

        const res = await POST(req())

        expect(res.status).toBe(429)
        expect(res.headers.get('retry-after')).toBe('42')
        await expect(res.json()).resolves.toMatchObject({ code: 'RATE_LIMIT' })
        expect(createViveTuAppLink).not.toHaveBeenCalled()
        expect(rateLimit).toHaveBeenCalledWith('coach-1')
    })

    it('el techo corre DESPUÉS de la autorización: un bearer inválido no gasta cuota', async () => {
        resolveCtx.mockResolvedValue({ error: new Response('{}', { status: 401 }) })

        const res = await POST(req())

        expect(res.status).toBe(401)
        expect(rateLimit).not.toHaveBeenCalled()
    })
})
