import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/headers', () => ({
    cookies: vi.fn(async () => ({ get: () => undefined })),
    headers: vi.fn(async () => new Headers()),
}))

import { META_CAPI_TIMEOUT_MS, sendMetaCapiEvent, type MetaCapiEventInput } from './capi'

/**
 * Plan C (píxel de compra): el helper corta a los 3 s, acepta el código de «Eventos de prueba» solo
 * cuando el caller lo pasa, y devuelve si Meta aceptó el evento. Nunca lanza.
 */

const CONTEXT = { fbp: 'fb.1.1.1', fbc: null, clientIpAddress: null, clientUserAgent: 'UA', origin: null }
const INPUT: MetaCapiEventInput = {
    eventName: 'Purchase',
    eventId: 'purchase:flow:invoice:1',
    eventSourceUrl: 'https://www.eva-app.cl/coach/subscription',
    customData: { value: 29990, currency: 'CLP' },
    context: CONTEXT,
}

const fetchMock = vi.fn()

beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_FB_PIXEL_ID', '123456')
    vi.stubEnv('META_CAPI_TOKEN', 'tok')
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockReset()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

function sentBody(): Record<string, unknown> {
    return JSON.parse(String(fetchMock.mock.calls[0][1].body))
}

describe('sendMetaCapiEvent', () => {
    it('manda el evento con corte de 3 s y sin test_event_code por defecto', async () => {
        fetchMock.mockResolvedValue({ ok: true, status: 200 })
        const timeoutSpy = vi.spyOn(AbortSignal, 'timeout')

        await expect(sendMetaCapiEvent(INPUT)).resolves.toEqual({ ok: true })

        expect(timeoutSpy).toHaveBeenCalledWith(META_CAPI_TIMEOUT_MS)
        expect(META_CAPI_TIMEOUT_MS).toBe(3000)
        expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
        const body = sentBody()
        expect(body).not.toHaveProperty('test_event_code')
        const [event] = body.data as Array<Record<string, unknown>>
        expect(event).toMatchObject({ event_name: 'Purchase', event_id: 'purchase:flow:invoice:1' })
        // Sin IP en el contexto ⇒ sin IP en el evento; fbp viaja en claro.
        expect(event.user_data).toEqual({ fbp: 'fb.1.1.1', client_user_agent: 'UA' })
    })

    it('el código de prueba viaja solo cuando el caller lo pasa', async () => {
        fetchMock.mockResolvedValue({ ok: true, status: 200 })
        await sendMetaCapiEvent({ ...INPUT, testEventCode: 'TEST123' })
        expect(sentBody()).toMatchObject({ test_event_code: 'TEST123' })
    })

    it('rechazo de Meta ⇒ { ok: false, reason: rejected, status }', async () => {
        fetchMock.mockResolvedValue({ ok: false, status: 400 })
        await expect(sendMetaCapiEvent(INPUT)).resolves.toEqual({ ok: false, reason: 'rejected', status: 400 })
    })

    it('timeout o red caída ⇒ { ok: false, reason: network }, sin lanzar', async () => {
        fetchMock.mockRejectedValue(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
        await expect(sendMetaCapiEvent(INPUT)).resolves.toEqual({ ok: false, reason: 'network' })
    })

    it('sin token ⇒ not_configured y no llama a Meta', async () => {
        vi.stubEnv('META_CAPI_TOKEN', '')
        await expect(sendMetaCapiEvent(INPUT)).resolves.toEqual({ ok: false, reason: 'not_configured' })
        expect(fetchMock).not.toHaveBeenCalled()
    })
})
