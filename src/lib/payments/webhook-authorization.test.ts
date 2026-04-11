import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    extractMercadoPagoNotificationId,
    isPaymentsWebhookTokenValid,
    verifyMercadoPagoSignatureIfConfigured,
} from '@/lib/payments/webhook-authorization'

describe('extractMercadoPagoNotificationId', () => {
    it('reads id from query string', () => {
        const r = new Request('https://example.com/webhook?topic=payment&id=123')
        expect(extractMercadoPagoNotificationId(r, {})).toBe('123')
    })

    it('reads data.id from JSON body', () => {
        const r = new Request('https://example.com/webhook')
        expect(extractMercadoPagoNotificationId(r, { data: { id: 999 } })).toBe('999')
    })

    it('returns null when missing', () => {
        const r = new Request('https://example.com/webhook')
        expect(extractMercadoPagoNotificationId(r, {})).toBeNull()
    })
})

describe('isPaymentsWebhookTokenValid', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('rejects when production and token unset', () => {
        vi.stubEnv('NODE_ENV', 'production')
        vi.stubEnv('MERCADOPAGO_WEBHOOK_TOKEN', '')
        const r = new Request('https://example.com/webhook')
        expect(isPaymentsWebhookTokenValid(r)).toBe(false)
    })

    it('accepts when production and query token matches', () => {
        vi.stubEnv('NODE_ENV', 'production')
        vi.stubEnv('MERCADOPAGO_WEBHOOK_TOKEN', 'mytoken')
        const r = new Request('https://example.com/webhook?token=mytoken')
        expect(isPaymentsWebhookTokenValid(r)).toBe(true)
    })

    it('accepts x-webhook-token header', () => {
        vi.stubEnv('NODE_ENV', 'production')
        vi.stubEnv('MERCADOPAGO_WEBHOOK_TOKEN', 'mytoken')
        const r = new Request('https://example.com/webhook', {
            headers: { 'x-webhook-token': 'mytoken' },
        })
        expect(isPaymentsWebhookTokenValid(r)).toBe(true)
    })

    it('allows dev without token configured', () => {
        vi.stubEnv('NODE_ENV', 'development')
        vi.stubEnv('MERCADOPAGO_WEBHOOK_TOKEN', '')
        const r = new Request('https://example.com/webhook')
        expect(isPaymentsWebhookTokenValid(r)).toBe(true)
    })
})

describe('verifyMercadoPagoSignatureIfConfigured', () => {
    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it('skips when signing secret unset', () => {
        vi.stubEnv('MERCADOPAGO_WEBHOOK_SIGNING_SECRET', '')
        const r = new Request('https://example.com/webhook')
        expect(verifyMercadoPagoSignatureIfConfigured(r, null)).toBe(true)
    })

    it('fails when secret set but data id missing', () => {
        vi.stubEnv('MERCADOPAGO_WEBHOOK_SIGNING_SECRET', 'abc')
        const r = new Request('https://example.com/webhook')
        expect(verifyMercadoPagoSignatureIfConfigured(r, null)).toBe(false)
    })

    it('validates x-signature v1', () => {
        vi.stubEnv('MERCADOPAGO_WEBHOOK_SIGNING_SECRET', 'shh')
        const dataId = '100'
        const ts = '1700000000'
        const requestId = 'req-xyz'
        const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
        const v1 = createHmac('sha256', 'shh').update(manifest).digest('hex')
        const r = new Request('https://example.com/webhook', {
            headers: {
                'x-signature': `ts=${ts},v1=${v1}`,
                'x-request-id': requestId,
            },
        })
        expect(verifyMercadoPagoSignatureIfConfigured(r, dataId)).toBe(true)
    })

    it('rejects bad signature', () => {
        vi.stubEnv('MERCADOPAGO_WEBHOOK_SIGNING_SECRET', 'shh')
        const r = new Request('https://example.com/webhook', {
            headers: {
                'x-signature': 'ts=1700000000,v1=deadbeef',
                'x-request-id': 'req-xyz',
            },
        })
        expect(verifyMercadoPagoSignatureIfConfigured(r, '100')).toBe(false)
    })
})
