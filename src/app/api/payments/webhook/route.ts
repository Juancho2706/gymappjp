import { NextResponse } from 'next/server'
import { addMonths } from 'date-fns'
import { getPaymentsProvider } from '@/lib/payments/provider'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { BILLING_CYCLE_CONFIG } from '@/lib/constants'
import type { Json, TablesInsert } from '@/lib/database.types'

function mapProviderStatus(status?: string | null) {
    if (!status) return 'pending_payment'
    if (['approved', 'authorized'].includes(status)) return 'active'
    if (['pending', 'in_process', 'in_mediation'].includes(status)) return 'pending_payment'
    if (status === 'paused') return 'paused'
    if (['cancelled', 'canceled'].includes(status)) return 'canceled'
    if (['rejected', 'refunded', 'charged_back'].includes(status)) return 'expired'
    return 'pending_payment'
}

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

export async function POST(request: Request) {
    const provider = getPaymentsProvider()
    const admin = createServiceRoleClient()

    let body: unknown = {}
    try {
        body = await request.json()
    } catch {
        // MercadoPago may send query params only.
    }

    const result = await provider.processWebhook(buildPayload(request, body))
    if (!result.accepted) {
        return NextResponse.json({ ok: false }, { status: 400 })
    }

    if (!result.coachId) {
        return NextResponse.json({ ok: true })
    }

    const { data: coach } = await admin
        .from('coaches')
        .select('id, billing_cycle')
        .eq('id', result.coachId)
        .maybeSingle()

    if (!coach) {
        return NextResponse.json({ ok: true })
    }

    const billingCycle = (coach.billing_cycle || 'monthly') as keyof typeof BILLING_CYCLE_CONFIG
    const months = BILLING_CYCLE_CONFIG[billingCycle]?.months ?? 1
    const status = mapProviderStatus(result.providerStatus)
    const nextPeriodEnd = status === 'active' ? addMonths(new Date(), months).toISOString() : null

    await admin.from('coaches').update({
        subscription_status: status,
        current_period_end: nextPeriodEnd,
        payment_provider: provider.name,
    }).eq('id', coach.id)

    const eventRow: TablesInsert<'subscription_events'> = {
        coach_id: coach.id,
        provider: provider.name,
        provider_event_id: result.eventId ?? null,
        provider_status: result.providerStatus ?? null,
        payload: toJsonPayload(body),
    }

    await admin.from('subscription_events').upsert(eventRow, { onConflict: 'provider_event_id' })

    return NextResponse.json({ ok: true })
}

export async function GET() {
    return NextResponse.json({ ok: true })
}
