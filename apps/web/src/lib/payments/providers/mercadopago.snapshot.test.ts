import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Cobertura del ROUND-TRIP del start_date (SLASH-EARLY) ─────────────────────────────
// El early-slash guard de confirm-subscription depende de que el provider PRESERVE el
// `start_date` que MP devuelve bajo `auto_recurring.start_date` (la fuente load-bearing — la
// misma ruta donde `createCheckout` lo envía). El `toSnapshot` viejo lo DROPEABA, así que
// `startSignal` era SIEMPRE null en producción → el guard nunca disparaba → un downgrade-al-corte
// degradaba tier/max_clients ANTES del corte. Este test ejercita el `fetchCheckoutSnapshot` REAL
// (no un snapshot fabricado) con un payload representativo de preapproval de MP y asevera que el
// snapshot conserva start_date. FALLA contra el toSnapshot viejo, PASA contra el nuevo.

import { MercadoPagoProvider } from './mercadopago'

const ORIGINAL_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN

beforeEach(() => {
    process.env.MERCADOPAGO_ACCESS_TOKEN = 'APP_USR-test-token'
})

afterEach(() => {
    vi.restoreAllMocks()
    if (ORIGINAL_TOKEN === undefined) {
        delete process.env.MERCADOPAGO_ACCESS_TOKEN
    } else {
        process.env.MERCADOPAGO_ACCESS_TOKEN = ORIGINAL_TOKEN
    }
})

function mockMpResponse(body: unknown) {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        })
    )
}

describe('MercadoPagoProvider.fetchCheckoutSnapshot — preserva start_date (round-trip SLASH-EARLY)', () => {
    it('conserva auto_recurring.start_date (la fuente load-bearing que MP devuelve)', async () => {
        const FUTURE = '2999-01-01T00:00:00.000Z'
        // Payload representativo de un preapproval AGENDADO al corte (downgrade/cambio de ciclo):
        // MP echo del start_date que createCheckout puso en auto_recurring.start_date.
        mockMpResponse({
            id: 'preapproval-scheduled',
            status: 'authorized',
            external_reference: 'coach-1|starter|monthly',
            next_payment_date: FUTURE,
            auto_recurring: {
                frequency: 1,
                frequency_type: 'months',
                transaction_amount: 9990,
                currency_id: 'CLP',
                start_date: FUTURE,
                end_date: '3000-01-01T00:00:00.000Z',
            },
        })

        const provider = new MercadoPagoProvider()
        const snapshot = await provider.fetchCheckoutSnapshot('preapproval-scheduled')

        // El guard lee snapshot.start_date ?? snapshot.auto_recurring?.start_date.
        expect(snapshot.auto_recurring?.start_date).toBe(FUTURE)
        expect(snapshot.start_date ?? snapshot.auto_recurring?.start_date ?? null).toBe(FUTURE)
    })

    it('conserva el start_date top-level cuando MP lo expone ahí (defensivo)', async () => {
        const FUTURE = '2999-06-01T00:00:00.000Z'
        mockMpResponse({
            id: 'preapproval-top',
            status: 'authorized',
            external_reference: 'coach-1|pro|annual',
            start_date: FUTURE,
            next_payment_date: FUTURE,
            auto_recurring: {
                transaction_amount: 89900,
                currency_id: 'CLP',
                end_date: null,
            },
        })

        const provider = new MercadoPagoProvider()
        const snapshot = await provider.fetchCheckoutSnapshot('preapproval-top')

        expect(snapshot.start_date).toBe(FUTURE)
        expect(snapshot.start_date ?? snapshot.auto_recurring?.start_date ?? null).toBe(FUTURE)
    })

    it('alta fresca: start_date pasado en auto_recurring se preserva (no se inventa una señal)', async () => {
        const PAST = '2020-01-01T00:00:00.000Z'
        const FUTURE = '2999-01-01T00:00:00.000Z'
        mockMpResponse({
            id: 'preapproval-fresh',
            status: 'authorized',
            external_reference: 'coach-1|pro|monthly',
            next_payment_date: FUTURE,
            auto_recurring: {
                transaction_amount: 29900,
                currency_id: 'CLP',
                start_date: PAST,
                end_date: null,
            },
        })

        const provider = new MercadoPagoProvider()
        const snapshot = await provider.fetchCheckoutSnapshot('preapproval-fresh')

        // El snapshot preserva el start_date pasado tal cual — el guard decide con > Date.now().
        expect(snapshot.auto_recurring?.start_date).toBe(PAST)
        expect(snapshot.next_payment_date).toBe(FUTURE)
    })
})
