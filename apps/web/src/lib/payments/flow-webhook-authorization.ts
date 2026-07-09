import { timingSafeEqual } from 'node:crypto'

/**
 * Autorizacion del webhook de Flow (plan pagos-multigateway-flow, Ola 3, T3.1).
 *
 * Flow tiene DOS tokens distintos y NO hay que confundirlos:
 *   1. `?token=<FLOW_WEBHOOK_TOKEN>` en la URL — NUESTRO secreto compartido (igual patron que MP): el
 *      unico gate de admision del POST. `isFlowWebhookTokenValid` lo verifica (fail-closed en prod).
 *   2. `token` en el BODY urlencoded — el token de Flow para RE-CONSULTAR (payment/getStatus /
 *      invoice/get firmado). `extractFlowToken` lo saca. Es el mecanismo de confianza real: el POST de
 *      Flow solo trae ese token, NUNCA el estado → se re-consulta firmado con nuestro secretKey.
 *
 * O sea: confianza = (gate del token propio) + (re-fetch firmado), NO el body crudo del POST.
 */

/** Compare en tiempo constante, length-safe (timingSafeEqual tira con largos distintos). */
function constantTimeEquals(a: string, b: string): boolean {
    const aBuf = Buffer.from(a, 'utf8')
    const bBuf = Buffer.from(b, 'utf8')
    if (aBuf.length !== bBuf.length) return false
    return timingSafeEqual(aBuf, bBuf)
}

/**
 * Gate de admision: `?token=` (o header `x-webhook-token`) contra `FLOW_WEBHOOK_TOKEN`. En produccion
 * el token es OBLIGATORIO (fail-closed: sin el, rechaza). En dev/preview sin token seteado, permite
 * (para testeo local), igual que `isPaymentsWebhookTokenValid` de MP.
 */
export function isFlowWebhookTokenValid(request: Request): boolean {
    const expectedToken = process.env.FLOW_WEBHOOK_TOKEN?.trim()
    const isProd = process.env.NODE_ENV === 'production'
    if (isProd && !expectedToken) {
        console.error('[payments.flow.webhook] FLOW_WEBHOOK_TOKEN is required in production')
        return false
    }
    if (!expectedToken) return true

    const url = new URL(request.url)
    const candidate = url.searchParams.get('token') ?? request.headers.get('x-webhook-token')
    if (!candidate) return false
    return constantTimeEquals(candidate, expectedToken)
}

/**
 * Extrae el `token` de Flow del body parseado del POST (el que se usa para re-consultar getStatus /
 * invoice/get firmado). Flow lo manda urlencoded como `token=...`. Null si no viene.
 */
export function extractFlowToken(parsedBody: unknown): string | null {
    if (parsedBody && typeof parsedBody === 'object' && 'token' in parsedBody) {
        const t = (parsedBody as { token?: unknown }).token
        if (t != null && t !== '') return String(t)
    }
    return null
}
