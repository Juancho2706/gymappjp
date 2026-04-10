import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import type { Json, TablesInsert } from '@/lib/database.types'
import { mapProviderStatus, resolveCurrentPeriodEnd } from '@/lib/payments/subscription-state'

const schema = z.object({
    preapprovalId: z.string().min(1).optional(),
})

function buildMpHeaders(accessToken: string) {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
    }
    if (accessToken.startsWith('TEST-')) headers['X-scope'] = 'stage'
    return headers
}

export async function POST(request: Request) {
    try {
        const traceId = request.headers.get('x-request-id') ?? crypto.randomUUID()
        const supabase = await createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()

        if (!user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        let body: unknown = {}
        try {
            body = await request.json()
        } catch {
            // Empty body is acceptable
        }

        const parsed = schema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message ?? 'Invalid payload' },
                { status: 400 }
            )
        }

        const admin = createServiceRoleClient()
        const { data: coach } = await admin
            .from('coaches')
            .select('id, billing_cycle, subscription_mp_id, current_period_end')
            .eq('id', user.id)
            .maybeSingle()

        if (!coach) {
            return NextResponse.json({ error: 'Coach not found' }, { status: 404 })
        }

        const preapprovalId = parsed.data.preapprovalId ?? coach.subscription_mp_id ?? undefined
        if (!preapprovalId) {
            return NextResponse.json({ error: 'No subscription id to confirm.' }, { status: 400 })
        }

        const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
        if (!accessToken) {
            return NextResponse.json({ error: 'Missing MERCADOPAGO_ACCESS_TOKEN' }, { status: 500 })
        }

        const mpRes = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
            headers: buildMpHeaders(accessToken),
        })

        if (!mpRes.ok) {
            const text = await mpRes.text()
            const requestId = mpRes.headers.get('x-request-id')
            return NextResponse.json(
                {
                    error: `MercadoPago confirm failed (${mpRes.status})${requestId ? ` [x-request-id: ${requestId}]` : ''}: ${text}`,
                },
                { status: 502 }
            )
        }

        const preapproval = await mpRes.json()
        const externalReference = String(preapproval.external_reference ?? '')
        const [coachIdFromRef] = externalReference.split('|')

        if (coachIdFromRef && coachIdFromRef !== user.id) {
            return NextResponse.json({ error: 'Subscription does not belong to current user.' }, { status: 403 })
        }

        const status = mapProviderStatus(preapproval.status ?? null)
        const nextPeriodEnd = resolveCurrentPeriodEnd({
            status,
            billingCycle: coach.billing_cycle,
            currentPeriodEnd: coach.current_period_end,
            providerCurrentPeriodEnd: preapproval.next_payment_date ?? preapproval.auto_recurring?.end_date ?? null,
        })

        const { error: updateError } = await admin
            .from('coaches')
            .update({
                subscription_status: status,
                current_period_end: nextPeriodEnd,
                payment_provider: 'mercadopago',
            })
            .eq('id', user.id)

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 })
        }

        const payload: Json | null = (() => {
            try {
                return JSON.parse(JSON.stringify(preapproval)) as Json
            } catch {
                return null
            }
        })()

        const eventRow: TablesInsert<'subscription_events'> = {
            coach_id: user.id,
            provider: 'mercadopago',
            provider_event_id: `manual-confirm:${preapprovalId}:${String(preapproval.status ?? 'unknown')}`,
            provider_checkout_id: preapprovalId,
            provider_status: preapproval.status ?? null,
            payload,
        }

        const { error: eventError } = await admin
            .from('subscription_events')
            .upsert(eventRow, { onConflict: 'provider_event_id' })

        if (eventError) {
            console.error('[payments.confirm-subscription] event upsert failed', {
                traceId,
                coachId: user.id,
                preapprovalId,
                message: eventError.message,
            })
        }

        console.info('[payments.confirm-subscription] processed', {
            traceId,
            coachId: user.id,
            preapprovalId,
            providerStatus: preapproval.status ?? null,
            internalStatus: status,
            currentPeriodEnd: nextPeriodEnd,
        })

        return NextResponse.json({
            ok: true,
            subscriptionStatus: status,
            providerStatus: preapproval.status ?? null,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo confirmar la suscripción.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
