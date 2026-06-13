import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import {
    ADDON_MONTHLY_PRICE_CLP,
    BILLING_CYCLE_CONFIG,
    getTierCapabilities,
    getTierMaxClients,
    isBillingCycleAllowedForTier,
    TIER_CONFIG,
    type BillingCycle,
    type SubscriptionTier,
} from '@/lib/constants'
import { getPaymentsProvider } from '@/lib/payments/provider'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { canViewBilling } from '@/services/auth/workspace-permissions.service'
import { MODULE_KEYS, type ModuleKey } from '@/services/entitlements.service'
import { listLive } from '@/infrastructure/db/coach-addons.repository'
import {
    getCompositeAmountClp,
    toBillableAddons,
} from '@/services/billing/addons.service'
import type { BillableAddon } from '@/domain/billing/types'

// El checkout solo acepta los tiers EN VENTA (SALE_TIERS sin free): starter/pro/elite.
// growth/scale quedan fuera de venta (LEGACY). Consecuencia D4: un coach grandfathered
// en growth/scale NO puede re-checkout en su tier por esta puerta (el enum lo rechaza con 400);
// su continuidad/cambio se gestiona vía admin o conversación EVA Teams (elite). NO reintroducir
// growth/scale aquí. El guard de ciclo (isBillingCycleAllowedForTier) y el monto
// (getTierPriceClp) mantienen su firma — el plan 05 sumará add-ons sobre esa misma base.
const schema = z.object({
    tier: z.enum(['starter', 'pro', 'elite']),
    billingCycle: z.enum(['monthly', 'quarterly', 'annual']),
    // Add-ons opcionales del signup (plan 05 F3.3). Solo MODULE_KEYS; del body JAMÁS se acepta
    // monto ni precio — el cálculo compuesto lo hace el server (getCompositeAmountClp).
    addons: z.array(z.enum(MODULE_KEYS)).optional(),
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

        const workspace = await resolvePreferredWorkspace(supabase, user.id)
        if (!canViewBilling(workspace)) {
            return NextResponse.json({ error: 'Billing disponible solo para coach independiente.' }, { status: 403 })
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

        // Add-ons solicitados (signup/supersede). Dedup + filtro contra MODULE_KEYS (defensa extra
        // sobre el Zod). D8: coherencia contra el tier SOLICITADO del body — NO confiar en que la UI
        // del registro lo filtró. starter + nutrition_exchanges → 400 (cobrar algo inusable).
        const requestedAddons = [
            ...new Set((parsed.data.addons ?? []).filter((k): k is ModuleKey => MODULE_KEYS.includes(k))),
        ]
        if (
            requestedAddons.includes('nutrition_exchanges') &&
            !getTierCapabilities(tier).canUseNutrition
        ) {
            return NextResponse.json(
                { error: 'El módulo de nutrición por intercambios requiere un plan Pro o superior.' },
                { status: 400 }
            )
        }
        // Check if this is a mid-cycle upgrade (coach already active)
        const { data: currentCoach } = await supabase
            .from('coaches')
            .select('subscription_status, subscription_tier, current_period_end, subscription_mp_id')
            .eq('id', user.id)
            .maybeSingle()

        // Free coaches must NOT be set to pending_payment — they would lose access if they
        // abandon the checkout. The webhook will upgrade them when payment is confirmed.
        const isFreeTierCoach = currentCoach?.subscription_tier === 'free'

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

        // El UPDATE de columnas de billing + la lectura de add-ons facturables van por service-role.
        const admin = createServiceRoleClient()

        // Monto COMPUESTO (plan 05 F3.3): base del tier + Σ add-ons facturables. La fuente son las
        // filas vivas de coach_addons (service-role) UNIDAS a los add-ons solicitados en el signup
        // (estos últimos aún no tienen fila — la materializa el webhook al confirmar el pago). El
        // cliente jamás manda montos: el server lee/calcula todo. Con esto upgrade/downgrade y cambio
        // de ciclo arrastran los add-ons automáticamente (el preapproval nuevo nace con el compuesto).
        const liveAddons = await listLive(admin, user.id)
        const liveBillable = toBillableAddons(liveAddons)
        const billableByKey = new Map<ModuleKey, BillableAddon>(
            liveBillable.map((a) => [a.moduleKey, a])
        )
        for (const key of requestedAddons) {
            if (!billableByKey.has(key)) {
                billableByKey.set(key, { moduleKey: key, priceClpMensual: ADDON_MONTHLY_PRICE_CLP })
            }
        }
        const billableAddons = [...billableByKey.values()]
        const checkoutAddons = [...billableByKey.keys()]

        const amountClp = getCompositeAmountClp(tier, billingCycle, billableAddons)
        const cycle = BILLING_CYCLE_CONFIG[billingCycle]
        const addonSuffix = checkoutAddons.length > 0 ? ` + ${checkoutAddons.length} add-on(s)` : ''
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
            title: `Suscripción ${TIER_CONFIG[tier].label} ${cycle.label} (${cycle.months} mes/es)${addonSuffix}`,
            successUrl: `${appUrl}/coach/subscription/processing`,
            failureUrl: `${appUrl}/coach/reactivate?payment=failure&${retryQuery}`,
            pendingUrl: `${appUrl}/coach/reactivate?payment=pending&${retryQuery}`,
            webhookUrl,
            startDate: upgradeStartDate ?? reactivationStartDate,
            // 4ª parte del external_reference: el webhook materializa estas filas al confirmar el pago.
            addons: checkoutAddons,
        })

        const newMpId = checkout.checkoutId.trim()
        const supersededMpPreapprovalId =
            previousMpId && previousMpId !== newMpId ? previousMpId : null

        // Free coaches: only store the MP subscription ID and provider.
        // Status/tier/max_clients stay as free+active so the coach can keep using the app
        // if they abandon the checkout. The webhook upgrades them when payment is confirmed.
        //
        // Active paid upgrades: keep status='active' during transition.
        // New/reactivating paid coaches: set 'pending_payment' as usual.
        const newStatus = isActiveUpgrade ? 'active' : 'pending_payment'

        const updatePayload = isFreeTierCoach
            ? {
                payment_provider: provider.name,
                subscription_mp_id: checkout.checkoutId,
            }
            : {
                subscription_tier: tier,
                subscription_status: newStatus,
                billing_cycle: billingCycle,
                max_clients: getTierMaxClients(tier),
                payment_provider: provider.name,
                subscription_mp_id: checkout.checkoutId,
                superseded_mp_preapproval_id: supersededMpPreapprovalId,
            }

        // El UPDATE de columnas de billing va por service-role (patrón de
        // cancel-subscription/route.ts:37,70): la migración hermana F2 revoca el UPDATE de
        // subscription_tier/subscription_status/billing_cycle/max_clients/payment_provider/
        // subscription_mp_id/superseded_mp_preapproval_id al rol `authenticated`, dejando esas
        // columnas en manos exclusivas de service-role (checkout + webhook MP). La autenticación
        // sigue user-scoped (supabase.auth.getUser arriba) y conservamos eq('id', user.id) — el id
        // viene siempre de la sesión, jamás del body — para que el alcance no se ensanche.
        const { error: updateError } = await admin
            .from('coaches')
            .update(updatePayload)
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
