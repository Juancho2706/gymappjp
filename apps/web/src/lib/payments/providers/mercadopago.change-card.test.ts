import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MercadoPagoProvider } from './mercadopago'

// ── P0-1 / condición de firma de Security ─────────────────────────────────────────────────────
// El PUT de cambio de tarjeta debe llevar EXACTAMENTE { card_token_id } y NADA más: `status`,
// `next_payment_date` y `auto_recurring` son campos mutables del MISMO PUT /preapproval, así que un
// body con cualquier extra podría mover el ciclo de cobro = re-facturación silenciosa (SERNAC). Este
// test captura el body saliente (mock de fetch) y asevera la shape exacta — convierte el chequeo
// manual de sandbox en un guard durable de CI.

const ORIGINAL_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN

beforeEach(() => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-test-token'
})

afterEach(() => {
    vi.restoreAllMocks()
    if (ORIGINAL_TOKEN === undefined) delete process.env.MERCADOPAGO_ACCESS_TOKEN
    else process.env.MERCADOPAGO_ACCESS_TOKEN = ORIGINAL_TOKEN
})

type Captured = { url: string; init: RequestInit }

function captureFetch(): () => Captured | null {
    let captured: Captured | null = null
    vi.spyOn(globalThis, 'fetch').mockImplementation(
        async (input: RequestInfo | URL, init?: RequestInit) => {
            captured = { url: String(input), init: init ?? {} }
            return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
        }
    )
    return () => captured
}

describe('MercadoPagoProvider.updateCardAtProvider — body EXACTO { card_token_id } (P0-1)', () => {
    it('PUTea SOLO card_token_id + header X-Idempotency-Key, a /preapproval/{id}', async () => {
        const get = captureFetch()
        const provider = new MercadoPagoProvider()
        await provider.updateCardAtProvider('preapproval-123', 'card-token-abc', 'card_change:coach-1:deadbeef')

        const cap = get()
        expect(cap).not.toBeNull()
        expect(cap!.url).toBe('https://api.mercadopago.com/preapproval/preapproval-123')
        expect(cap!.init.method).toBe('PUT')

        const body = JSON.parse(String(cap!.init.body)) as Record<string, unknown>
        // EXACTAMENTE una key: card_token_id. status/next_payment_date/auto_recurring NUNCA viajan.
        expect(Object.keys(body)).toEqual(['card_token_id'])
        expect(body.card_token_id).toBe('card-token-abc')

        const headers = cap!.init.headers as Record<string, string>
        expect(headers['X-Idempotency-Key']).toBe('card_change:coach-1:deadbeef')
    })

    it('los callers existentes NO mandan idempotency header (updateCheckoutAmount intacto)', async () => {
        const get = captureFetch()
        const provider = new MercadoPagoProvider()
        await provider.updateCheckoutAmount('preapproval-9', 12345)

        const cap = get()
        expect(cap).not.toBeNull()
        const headers = cap!.init.headers as Record<string, string>
        expect(headers['X-Idempotency-Key']).toBeUndefined()
    })
})
