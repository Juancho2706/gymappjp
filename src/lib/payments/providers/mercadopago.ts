import { BILLING_CYCLE_CONFIG } from '@/lib/constants'
import type {
    CreateCheckoutInput,
    CreateCheckoutResult,
    PaymentsProvider,
    WebhookProcessResult,
} from '@/lib/payments/types'

type WebhookShape = {
    type?: string
    action?: string
    topic?: string
    data?: { id?: string | number }
}

function getMpAccessToken() {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
    if (!accessToken) throw new Error('Missing MERCADOPAGO_ACCESS_TOKEN')
    return accessToken
}

function resolvePayerEmail(accessToken: string, coachEmail: string) {
    const isSandbox = accessToken.startsWith('TEST-')
    const configured = process.env.MERCADOPAGO_TEST_PAYER_EMAIL?.trim()
    const normalizedConfigured = configured
        ? (configured.includes('@') ? configured : `${configured.toLowerCase()}@testuser.com`)
        : ''
    const payerEmail = isSandbox && normalizedConfigured ? normalizedConfigured : coachEmail

    if (isSandbox && !payerEmail.toLowerCase().endsWith('@testuser.com')) {
        throw new Error(
            'MercadoPago sandbox requiere payer_email @testuser.com. Configura MERCADOPAGO_TEST_PAYER_EMAIL con un test user de MP.'
        )
    }

    return payerEmail
}

function buildExternalReference(input: CreateCheckoutInput) {
    return `${input.coachId}|${input.tier}|${input.billingCycle}`
}

function parseExternalReference(reference?: string | null) {
    if (!reference) return null
    const [coachId] = reference.split('|')
    if (!coachId) return null
    return { coachId }
}

async function mpRequest(path: string) {
    const accessToken = getMpAccessToken()
    const response = await fetch(`https://api.mercadopago.com${path}`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
        },
    })
    if (!response.ok) {
        const text = await response.text()
        throw new Error(`MercadoPago request failed (${response.status}): ${text}`)
    }
    return response.json()
}

export class MercadoPagoProvider implements PaymentsProvider {
    name = 'mercadopago' as const

    async createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
        const accessToken = getMpAccessToken()
        const payerEmail = resolvePayerEmail(accessToken, input.coachEmail)
        const externalReference = buildExternalReference(input)
        const cycle = BILLING_CYCLE_CONFIG[input.billingCycle]
        const startDate = new Date(Date.now() + 60_000).toISOString()
        const endDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365 * 5).toISOString()

        const response = await fetch('https://api.mercadopago.com/preapproval', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                reason: input.title,
                external_reference: externalReference,
                payer_email: payerEmail,
                back_url: input.successUrl,
                notification_url: input.webhookUrl,
                // "authorized" requires card_token_id. For checkout link flow we create it as pending.
                status: 'pending',
                auto_recurring: {
                    frequency: cycle.months,
                    frequency_type: 'months',
                    transaction_amount: input.amountClp,
                    currency_id: 'CLP',
                    start_date: startDate,
                    end_date: endDate,
                },
            }),
        })
        if (!response.ok) {
            const text = await response.text()
            throw new Error(`MercadoPago subscription creation failed (${response.status}): ${text}`)
        }
        const payload = await response.json()

        return {
            checkoutId: String(payload.id),
            checkoutUrl: payload.init_point ?? payload.sandbox_init_point ?? '',
        }
    }

    async processWebhook(payload: unknown): Promise<WebhookProcessResult> {
        const body = (payload ?? {}) as WebhookShape
        const maybeId = body.data?.id
        const eventId = maybeId ? String(maybeId) : undefined

        if (!eventId) return { accepted: true }

        const eventType = body.type ?? body.topic ?? body.action ?? ''
        const isPreapprovalEvent = eventType.includes('preapproval') || eventType.includes('subscription')
        if (isPreapprovalEvent) {
            const preapproval = await mpRequest(`/preapproval/${eventId}`)
            const coach = parseExternalReference(preapproval.external_reference)
            return {
                accepted: true,
                eventId,
                providerStatus: preapproval.status ?? undefined,
                coachId: coach?.coachId,
            }
        }

        if (!eventType.includes('payment')) {
            return { accepted: true, eventId }
        }

        const payment = await mpRequest(`/v1/payments/${eventId}`)
        const coach = parseExternalReference(payment.external_reference)

        return {
            accepted: true,
            eventId,
            providerStatus: payment.status ?? undefined,
            coachId: coach?.coachId,
        }
    }
}
