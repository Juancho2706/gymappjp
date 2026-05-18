import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Mercado Pago notification id from JSON body or query string (MP sends both shapes).
 */
export function extractMercadoPagoNotificationId(request: Request, parsedBody: unknown): string | null {
    const url = new URL(request.url)
    const fromQuery = url.searchParams.get('id') ?? url.searchParams.get('data.id')
    if (fromQuery) return String(fromQuery)

    if (parsedBody && typeof parsedBody === 'object' && 'data' in parsedBody) {
        const data = (parsedBody as { data?: { id?: unknown } }).data
        const id = data?.id
        if (id != null && id !== '') return String(id)
    }
    return null
}

/**
 * In production, MERCADOPAGO_WEBHOOK_TOKEN is required. In development, missing token allows local testing.
 */
export function isPaymentsWebhookTokenValid(request: Request): boolean {
    const expectedToken = process.env.MERCADOPAGO_WEBHOOK_TOKEN?.trim()
    const isProd = process.env.NODE_ENV === 'production'
    if (isProd && !expectedToken) {
        console.error('[payments.webhook] MERCADOPAGO_WEBHOOK_TOKEN is required in production')
        return false
    }
    if (!expectedToken) return true

    const url = new URL(request.url)
    const candidate = url.searchParams.get('token') ?? request.headers.get('x-webhook-token')
    return candidate === expectedToken
}

/**
 * Optional HMAC verification per Mercado Pago (x-signature header).
 * Set MERCADOPAGO_WEBHOOK_SIGNING_SECRET to enable. When unset, only the shared token is used.
 *
 * @see https://www.mercadopago.com/developers/en/docs/your-integrations/notifications/webhooks
 */
export function verifyMercadoPagoSignatureIfConfigured(request: Request, dataId: string | null): boolean {
    const secret = process.env.MERCADOPAGO_WEBHOOK_SIGNING_SECRET?.trim()
    if (!secret) return true
    if (!dataId) return false

    const xSig = request.headers.get('x-signature')
    const requestId = request.headers.get('x-request-id') ?? ''
    if (!xSig) return false

    const tsMatch = xSig.match(/ts=(\d+)/)
    const v1Match = xSig.match(/v1=([a-f0-9]+)/i)
    if (!tsMatch || !v1Match) return false

    const ts = tsMatch[1]
    const v1 = v1Match[1]
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`
    const hmac = createHmac('sha256', secret).update(manifest).digest('hex')

    try {
        const a = Buffer.from(hmac, 'hex')
        const b = Buffer.from(v1, 'hex')
        if (a.length !== b.length) return false
        return timingSafeEqual(a, b)
    } catch {
        return false
    }
}
