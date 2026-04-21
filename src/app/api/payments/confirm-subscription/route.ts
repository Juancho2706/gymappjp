import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import type { Json, TablesInsert } from '@/lib/database.types'
import { mapProviderStatus, resolveCurrentPeriodEnd } from '@/lib/payments/subscription-state'
import { getPaymentsProvider } from '@/lib/payments/provider'
import {
    getDefaultBillingCycleForTier,
    getTierMaxClients,
    isBillingCycleAllowedForTier,
    type BillingCycle,
    type SubscriptionTier,
} from '@/lib/constants'
import { parseCheckoutExternalReference } from '@/lib/payments/checkout-external-reference'

const schema = z.object({
    preapprovalId: z.string().min(1).optional(),
})

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
            .select('id, subscription_tier, billing_cycle, subscription_mp_id, current_period_end')
            .eq('id', user.id)
            .maybeSingle()

        if (!coach) {
            return NextResponse.json({ error: 'Coach not found' }, { status: 404 })
        }

        const preapprovalId = parsed.data.preapprovalId ?? coach.subscription_mp_id ?? undefined
        if (!preapprovalId) {
            return NextResponse.json({ error: 'No subscription id to confirm.' }, { status: 400 })
        }

        const provider = getPaymentsProvider()
        let snapshot
        try {
            snapshot = await provider.fetchCheckoutSnapshot(preapprovalId)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Provider fetch failed'
            return NextResponse.json({ error: message }, { status: 502 })
        }

        const parsedRef = parseCheckoutExternalReference(snapshot.external_reference ?? null)
        if (parsedRef?.coachId && parsedRef.coachId !== user.id) {
            return NextResponse.json({ error: 'Subscription does not belong to current user.' }, { status: 403 })
        }

        let tier = (coach.subscription_tier ?? 'starter') as SubscriptionTier
        let billingCycle = (coach.billing_cycle ?? 'monthly') as BillingCycle
        if (parsedRef?.tier && parsedRef.billingCycle) {
            tier = parsedRef.tier
            billingCycle = parsedRef.billingCycle
        }
        if (!isBillingCycleAllowedForTier(tier, billingCycle)) {
            return NextResponse.json(
                {
                    error: `El ciclo ${billingCycle} no está permitido para el plan ${tier}. Selecciona una combinación válida antes de confirmar.`,
                    suggestedBillingCycle: getDefaultBillingCycleForTier(tier),
                },
                { status: 409 }
            )
        }

        const status = mapProviderStatus(snapshot.status ?? null)
        const nextPeriodEnd = resolveCurrentPeriodEnd({
            status,
            billingCycle,
            currentPeriodEnd: coach.current_period_end,
            providerCurrentPeriodEnd: snapshot.next_payment_date ?? snapshot.auto_recurring?.end_date ?? null,
        })

        const { error: updateError } = await admin
            .from('coaches')
            .update({
                subscription_status: status,
                current_period_end: nextPeriodEnd,
                payment_provider: provider.name,
                subscription_tier: tier,
                billing_cycle: billingCycle,
                max_clients: getTierMaxClients(tier),
                subscription_mp_id: preapprovalId,
            })
            .eq('id', user.id)

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 })
        }

        const payload: Json | null = (() => {
            try {
                return JSON.parse(JSON.stringify(snapshot)) as Json
            } catch {
                return null
            }
        })()

        const eventRow: TablesInsert<'subscription_events'> = {
            coach_id: user.id,
            provider: provider.name,
            provider_event_id: `manual-confirm:${preapprovalId}:${String(snapshot.status ?? 'unknown')}`,
            provider_checkout_id: preapprovalId,
            provider_status: snapshot.status ?? null,
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
            providerStatus: snapshot.status ?? null,
            internalStatus: status,
            currentPeriodEnd: nextPeriodEnd,
        })

        return NextResponse.json({
            ok: true,
            subscriptionStatus: status,
            providerStatus: snapshot.status ?? null,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo confirmar la suscripción.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
