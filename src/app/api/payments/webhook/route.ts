import { NextResponse } from 'next/server'
import { getPaymentsProvider } from '@/lib/payments/provider'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import type { Json, TablesInsert } from '@/lib/database.types'
import { mapProviderStatus, resolveCurrentPeriodEnd } from '@/lib/payments/subscription-state'
import {
    extractMercadoPagoNotificationId,
    isPaymentsWebhookTokenValid,
    verifyMercadoPagoSignatureIfConfigured,
} from '@/lib/payments/webhook-authorization'

function buildPayload(request: Request, body: unknown) {
    if (body && typeof body === 'object') return body
    const url = new URL(request.url)
    const topic = url.searchParams.get('topic')
    const id = url.searchParams.get('id')
    if (!topic && !id) return {}
    return { type: topic ?? undefined, data: { id: id ?? undefined } }
}

function toJsonPayload(value: unknown): Json | null {
    if (value == null) return null
    try {
        return JSON.parse(JSON.stringify(value)) as Json
    } catch {
        return null
    }
}

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

    const provider = getPaymentsProvider()
    const admin = createServiceRoleClient()
    const traceId = request.headers.get('x-request-id') ?? crypto.randomUUID()

    const payload = buildPayload(request, parsed)
    console.info('[payments.webhook] received', { traceId, provider: provider.name, payload })

    let result
    try {
        result = await provider.processWebhook(payload)
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Webhook processing failed'
        console.error('[payments.webhook] provider.processWebhook failed', { traceId, message })
        return NextResponse.json({ ok: false, error: message }, { status: 502 })
    }

    if (!result.accepted) {
        console.warn('[payments.webhook] rejected by provider handler', { traceId })
        return NextResponse.json({ ok: false }, { status: 400 })
    }

    if (!result.coachId) {
        console.info('[payments.webhook] accepted without coachId', {
            traceId,
            eventId: result.eventId ?? null,
            providerStatus: result.providerStatus ?? null,
        })
        return NextResponse.json({ ok: true })
    }

    const { data: coach } = await admin
        .from('coaches')
        .select('id, billing_cycle, current_period_end')
        .eq('id', result.coachId)
        .maybeSingle()

    if (!coach) {
        console.warn('[payments.webhook] coach not found', { traceId, coachId: result.coachId })
        return NextResponse.json({ ok: true })
    }

    const status = mapProviderStatus(result.providerStatus)
    const nextPeriodEnd = resolveCurrentPeriodEnd({
        status,
        billingCycle: coach.billing_cycle,
        currentPeriodEnd: coach.current_period_end,
        providerCurrentPeriodEnd: result.currentPeriodEnd,
    })

    const { error: coachUpdateError } = await admin
        .from('coaches')
        .update({
            subscription_status: status,
            current_period_end: nextPeriodEnd,
            payment_provider: provider.name,
        })
        .eq('id', coach.id)

    if (coachUpdateError) {
        console.error('[payments.webhook] failed to update coach', {
            traceId,
            coachId: coach.id,
            message: coachUpdateError.message,
        })
        return NextResponse.json({ ok: false }, { status: 500 })
    }

    const stableEventId =
        result.eventId ??
        (result.providerCheckoutId
            ? `${provider.name}:checkout:${result.providerCheckoutId}:${result.providerStatus ?? 'unknown'}`
            : `${provider.name}:coach:${coach.id}:${result.providerStatus ?? 'unknown'}`)

    const eventRow: TablesInsert<'subscription_events'> = {
        coach_id: coach.id,
        provider: provider.name,
        provider_event_id: stableEventId,
        provider_checkout_id: result.providerCheckoutId ?? null,
        provider_status: result.providerStatus ?? null,
        payload: toJsonPayload(payload),
    }

    const { error: eventError } = await admin
        .from('subscription_events')
        .upsert(eventRow, { onConflict: 'provider_event_id' })

    if (eventError) {
        console.error('[payments.webhook] failed to write event', {
            traceId,
            coachId: coach.id,
            providerEventId: stableEventId,
            message: eventError.message,
        })
        return NextResponse.json({ ok: false }, { status: 500 })
    }

    console.info('[payments.webhook] processed', {
        traceId,
        coachId: coach.id,
        providerEventId: stableEventId,
        providerStatus: result.providerStatus ?? null,
        internalStatus: status,
        currentPeriodEnd: nextPeriodEnd,
    })

    return NextResponse.json({ ok: true })
}

export async function POST(request: Request) {
    const rawBody = await request.text()
    return handleWebhook(request, rawBody)
}

export async function GET(request: Request) {
    return handleWebhook(request, '')
}
