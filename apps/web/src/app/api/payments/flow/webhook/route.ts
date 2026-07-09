import { NextResponse } from 'next/server'
import { getPaymentsProvider } from '@/lib/payments/provider'
import { isFlowWebhookTokenValid, extractFlowToken } from '@/lib/payments/flow-webhook-authorization'
import { runWebhookPipeline } from '@/lib/payments/webhook-pipeline'

/**
 * Webhook de Flow.cl (plan pagos-multigateway-flow, Ola 3, T3.4). Ruta SEPARADA de la de MP
 * (`/api/payments/webhook`) → aislamiento total entre gateways.
 *
 * Responsabilidad de ESTA ruta = auth especifica de Flow + normalizacion del body:
 *   - Flow postea `application/x-www-form-urlencoded` con UN solo parametro `token` (nunca el estado).
 *   - Gate de admision: `?token=<FLOW_WEBHOOK_TOKEN>` propio (fail-closed en prod) — mismo patron que MP.
 *   - La confianza real es el RE-FETCH FIRMADO: `FlowProvider.processWebhook({ token })` re-consulta
 *     payment/getStatus / invoice/get con nuestro secretKey y arma el `WebhookProcessResult`.
 * Toda la logica money-safety aguas abajo vive en `runWebhookPipeline` (agnostica del gateway); las
 * ramas que ya existen para MP se reusan tal cual (idempotencia por `provider_event_id` +
 * `billing_snapshots(provider,provider_payment_id)`).
 */
async function parseFlowBody(request: Request, rawBody: string): Promise<Record<string, unknown>> {
    // Flow manda urlencoded (POST). Defensivo: si por algun motivo llega el token por query (GET manual
    // de prueba), tambien lo tomamos.
    const params = new URLSearchParams(rawBody)
    const fromBody = params.get('token')
    if (fromBody) return { token: fromBody }
    const fromQuery = new URL(request.url).searchParams.get('token_flow') // distinto del ?token= de auth
    return fromQuery ? { token: fromQuery } : {}
}

async function handleFlowWebhook(request: Request, rawBody: string) {
    // Gate de admision (token propio). Fail-closed en prod.
    if (!isFlowWebhookTokenValid(request)) {
        return NextResponse.json({ ok: false, error: 'Unauthorized webhook' }, { status: 401 })
    }

    const payload = await parseFlowBody(request, rawBody)
    const flowToken = extractFlowToken(payload)
    if (!flowToken) {
        // Sin token de Flow no hay nada que re-consultar. 200 para que Flow no reintente en loop una
        // notificacion vacia/malformada (no es un error de nuestro lado).
        console.warn('[payments.flow.webhook] POST sin token de Flow en el body')
        return NextResponse.json({ ok: true })
    }

    // `notificationId` = token de Flow (guard de dedup top-level). La idempotencia money-critical NO
    // depende de esto: aguas abajo va por `billing_snapshots(provider, provider_payment_id)` +
    // `subscription_events.provider_event_id` (stableEventId derivado del providerPaymentId estable
    // `invoice:<id>` / flowOrder). PIN sandbox (Ola 6): confirmar si Flow REUSA el mismo token al
    // reintentar la notificacion — si genera uno nuevo por reintento, el guard FIX-5 de recibo one-shot
    // (keyed por notificationId) no atraparia la reentrega → posible email de recibo duplicado (NO doble
    // cobro; el snapshot dedup lo impide). Si Flow rota el token, migrar este guard al providerPaymentId.
    const provider = getPaymentsProvider('flow')
    return runWebhookPipeline(request, { provider, payload, notificationId: flowToken })
}

export async function POST(request: Request) {
    const rawBody = await request.text()
    return handleFlowWebhook(request, rawBody)
}

export async function GET(request: Request) {
    // Flow usa POST para las confirmaciones; GET queda para health/ping manual.
    return handleFlowWebhook(request, '')
}
