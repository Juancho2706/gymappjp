import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
    BILLING_CYCLE_CONFIG,
    getTierMaxClients,
    getTierPriceClp,
    isBillingCycleAllowedForTier,
    TIER_CONFIG,
    type BillingCycle,
    type SubscriptionTier,
} from '@/lib/constants'
import { getPaymentsProvider } from '@/lib/payments/provider'

const schema = z.object({
    tier: z.enum(['starter', 'pro', 'elite', 'scale']),
    billingCycle: z.enum(['monthly', 'quarterly', 'annual']),
})

export async function POST(request: Request) {
    try {
        const supabase = await createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()

        if (!user?.id || !user.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const parsed = schema.safeParse(await request.json())
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message ?? 'Invalid payload' },
                { status: 400 }
            )
        }

        const tier = parsed.data.tier as SubscriptionTier
        const billingCycle = parsed.data.billingCycle as BillingCycle
        if (!isBillingCycleAllowedForTier(tier, billingCycle)) {
            return NextResponse.json(
                { error: 'La frecuencia de pago no está disponible para ese plan.' },
                { status: 400 }
            )
        }
        // Check if this is a mid-cycle upgrade (coach already active)
        const { data: currentCoach } = await supabase
            .from('coaches')
            .select('subscription_status, current_period_end, subscription_mp_id')
            .eq('id', user.id)
            .maybeSingle()

        const isActiveUpgrade =
            currentCoach?.subscription_status === 'active' &&
            currentCoach.current_period_end != null &&
            new Date(currentCoach.current_period_end).getTime() > Date.now()

        // For mid-cycle upgrades, schedule the new plan to start at the end of the current period
        const upgradeStartDate = isActiveUpgrade ? currentCoach!.current_period_end! : undefined

        // P2.6: canceled (or expired) reactivation must not inherit a prior MP start_date
        const mustUseFreshStart =
            currentCoach?.subscription_status === 'canceled' ||
            currentCoach?.subscription_status === 'expired'
        const reactivationStartDate = mustUseFreshStart
            ? new Date(Date.now() + 60_000).toISOString()
            : undefined

        const previousMpId = currentCoach?.subscription_mp_id?.trim() || null

        const amountClp = getTierPriceClp(tier, billingCycle)
        const cycle = BILLING_CYCLE_CONFIG[billingCycle]
        const provider = getPaymentsProvider()
        const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
        const webhookToken = process.env.MERCADOPAGO_WEBHOOK_TOKEN
        const webhookUrl = webhookToken
            ? `${appUrl}/api/payments/webhook?token=${encodeURIComponent(webhookToken)}`
            : `${appUrl}/api/payments/webhook`
        const retryQuery = `tier=${encodeURIComponent(tier)}&cycle=${encodeURIComponent(billingCycle)}`

        const checkout = await provider.createCheckout({
            coachId: user.id,
            coachEmail: user.email,
            tier,
            billingCycle,
            amountClp,
            title: `Suscripción ${TIER_CONFIG[tier].label} ${cycle.label} (${cycle.months} mes/es)`,
            successUrl: `${appUrl}/coach/subscription/processing`,
            failureUrl: `${appUrl}/coach/reactivate?payment=failure&${retryQuery}`,
            pendingUrl: `${appUrl}/coach/reactivate?payment=pending&${retryQuery}`,
            webhookUrl,
            startDate: upgradeStartDate ?? reactivationStartDate,
        })

        const newMpId = checkout.checkoutId.trim()
        const supersededMpPreapprovalId =
            previousMpId && previousMpId !== newMpId ? previousMpId : null

        // For active-coach upgrades: keep status = 'active' so they don't lose access.
        // The webhook will update status + current_period_end when the new plan activates.
        // For new / reactivating coaches: set 'pending_payment' as usual.
        const newStatus = isActiveUpgrade ? 'active' : 'pending_payment'

        const { error: updateError } = await supabase
            .from('coaches')
            .update({
                subscription_tier: tier,
                subscription_status: newStatus,
                billing_cycle: billingCycle,
                max_clients: getTierMaxClients(tier),
                payment_provider: provider.name,
                subscription_mp_id: checkout.checkoutId,
                superseded_mp_preapproval_id: supersededMpPreapprovalId,
            })
            .eq('id', user.id)

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 })
        }

        return NextResponse.json({
            provider: provider.name,
            tier,
            billingCycle,
            amountClp,
            subscriptionId: checkout.checkoutId,
            checkoutUrl: checkout.checkoutUrl,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo iniciar el flujo de suscripción.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
