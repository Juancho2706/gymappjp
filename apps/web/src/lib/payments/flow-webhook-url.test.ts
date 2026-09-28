import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildFlowWebhookUrl, compareFlowCallbackUrl, siteBaseUrlNoTrailingSlash } from './flow-webhook-url'

// Incidente 2026-09-28: con NEXT_PUBLIC_SITE_URL terminado en «/», el urlCallback del plan Flow quedó
// `https://www.eva-app.cl//api/...` ⇒ 308 en el borde de Vercel ⇒ Flow no sigue ⇒ renovaciones perdidas.

afterEach(() => vi.unstubAllEnvs())

describe('buildFlowWebhookUrl', () => {
    it('base con slash final (o varios) ⇒ nunca «//api»', () => {
        vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.eva-app.cl//')
        vi.stubEnv('FLOW_WEBHOOK_TOKEN', 'tok')
        expect(buildFlowWebhookUrl()).toBe('https://www.eva-app.cl/api/payments/flow/webhook?token=tok')
        expect(siteBaseUrlNoTrailingSlash()).toBe('https://www.eva-app.cl')
    })

    it('token con caracteres especiales ⇒ va codificado', () => {
        vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.eva-app.cl')
        vi.stubEnv('FLOW_WEBHOOK_TOKEN', 'a b&c')
        expect(buildFlowWebhookUrl()).toBe('https://www.eva-app.cl/api/payments/flow/webhook?token=a%20b%26c')
    })

    it('sin token ⇒ URL sin query', () => {
        vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://www.eva-app.cl')
        vi.stubEnv('FLOW_WEBHOOK_TOKEN', '')
        expect(buildFlowWebhookUrl()).toBe('https://www.eva-app.cl/api/payments/flow/webhook')
    })
})

describe('compareFlowCallbackUrl', () => {
    const expected = 'https://www.eva-app.cl/api/payments/flow/webhook?token=tok'

    it('idéntica ⇒ ok', () => {
        expect(compareFlowCallbackUrl(expected, expected)).toEqual({ ok: true })
    })

    it('«//api» (el plan viejo, reescrito por la regla de Cloudflare) ⇒ ok', () => {
        expect(compareFlowCallbackUrl('https://www.eva-app.cl//api/payments/flow/webhook?token=tok', expected)).toEqual({ ok: true })
    })

    it('otro host (apex, que redirige 308) ⇒ host', () => {
        expect(compareFlowCallbackUrl('https://eva-app.cl/api/payments/flow/webhook?token=tok', expected)).toEqual({ ok: false, reason: 'host' })
    })

    it('token distinto ⇒ token (sin exponerlo)', () => {
        expect(compareFlowCallbackUrl('https://www.eva-app.cl/api/payments/flow/webhook?token=viejo', expected)).toEqual({ ok: false, reason: 'token' })
    })

    it('otra ruta ⇒ path; vacío ⇒ missing; basura ⇒ unparseable', () => {
        expect(compareFlowCallbackUrl('https://www.eva-app.cl/api/payments/webhook?token=tok', expected)).toEqual({ ok: false, reason: 'path' })
        expect(compareFlowCallbackUrl(null, expected)).toEqual({ ok: false, reason: 'missing' })
        expect(compareFlowCallbackUrl('no es url', expected)).toEqual({ ok: false, reason: 'unparseable' })
    })
})
