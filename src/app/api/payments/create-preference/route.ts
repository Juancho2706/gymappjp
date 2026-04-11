import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import {
    BILLING_CYCLE_CONFIG,
    getTierMaxClients,
    getTierPriceClp,
    TIER_CONFIG,
    type BillingCycle,
    type SubscriptionTier,
} from '@/lib/constants'
import { getPaymentsProvider } from '@/lib/payments/provider'

const schema = z.object({
    tier: z.enum(['starter_lite', 'starter', 'pro', 'elite', 'scale']),
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
        })

        const { error: updateError } = await supabase
            .from('coaches')
            .update({
                subscription_tier: tier,
                subscription_status: 'pending_payment',
                billing_cycle: billingCycle,
                max_clients: getTierMaxClients(tier),
                payment_provider: provider.name,
                subscription_mp_id: checkout.checkoutId,
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
