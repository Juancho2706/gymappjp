import { NextResponse } from 'next/server'
import { getPaymentsProvider } from '@/lib/payments/provider'
import {
    extractMercadoPagoNotificationId,
    isPaymentsWebhookTokenValid,
    verifyMercadoPagoSignatureIfConfigured,
} from '@/lib/payments/webhook-authorization'
import { runWebhookPipeline } from '@/lib/payments/webhook-pipeline'

/**
 * Normalizacion del payload ENTRANTE de Mercado Pago (especifica del gateway): el body JSON si viene,
 * si no el par `?topic=&id=` que MP manda por query en algunos webhooks (GET). El pipeline agnostico
 * recibe este payload ya construido. Otros gateways (Flow) construyen el suyo (re-fetch firmado).
 */
function buildPayload(request: Request, body: unknown) {
    if (body && typeof body === 'object') return body
    const url = new URL(request.url)
    const topic = url.searchParams.get('topic')
    const id = url.searchParams.get('id')
    if (!topic && !id) return {}
    return { type: topic ?? undefined, data: { id: id ?? undefined } }
}

/**
 * Handler del webhook de Mercado Pago. Responsabilidad de esta ruta = SOLO la auth + normalizacion
 * especifica de MP (token compartido + firma HMAC x-signature + `extractMercadoPagoNotificationId`);
 * toda la logica money-safety aguas abajo vive en `runWebhookPipeline` (agnostica del gateway, plan
 * pagos-multigateway-flow Ola 1). Comportamiento MP IDENTICO al historico: es una extraccion.
 */
async function handleWebhook(request: Request, rawBody: string) {
    let parsed: unknown = {}
    try {
        parsed = rawBody ? JSON.parse(rawBody) : {}
    } catch {
        parsed = {}
    }

    const notificationId = extractMercadoPagoNotificationId(request, parsed)

    if (!isPaymentsWebhookTokenValid(request)) {
        return NextResponse.json({ ok: false, error: 'Unauthorized webhook' }, { status: 401 })
    }

    if (!verifyMercadoPagoSignatureIfConfigured(request, notificationId)) {
        return NextResponse.json({ ok: false, error: 'Invalid webhook signature' }, { status: 401 })
    }

    // Esta ruta SIEMPRE es Mercado Pago (el default de la factory igual seria MP; lo pedimos explicito
    // por claridad y para blindar el rail MP de cualquier cambio futuro del default).
    const provider = getPaymentsProvider('mercadopago')
    const payload = buildPayload(request, parsed)

    return runWebhookPipeline(request, { provider, payload, notificationId })
}

export async function POST(request: Request) {
    const rawBody = await request.text()
    return handleWebhook(request, rawBody)
}

export async function GET(request: Request) {
    return handleWebhook(request, '')
}
