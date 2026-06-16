import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { canViewBilling } from '@/services/auth/workspace-permissions.service'
import { listLive } from '@/infrastructure/db/coach-addons.repository'
import {
    getCompositeAmountClp,
    getAddonCycleAmountClp,
    toBillableAddons,
} from '@/services/billing/addons.service'
import { countActiveStandaloneClients } from '@/services/billing/capacity.service'
import { CHANGE_CARD_ENABLED, getTierPriceClp, type BillingCycle, type SubscriptionTier } from '@/lib/constants'

function normalizeCycle(raw: string | null): BillingCycle {
    if (raw === 'monthly' || raw === 'quarterly' || raw === 'annual') return raw
    return 'monthly'
}

export async function GET() {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const workspace = await resolvePreferredWorkspace(supabase, user.id)
    if (!canViewBilling(workspace)) {
        return NextResponse.json({ error: 'Billing disponible solo para coach independiente.' }, { status: 403 })
    }

    const { data: coach, error } = await supabase
        .from('coaches')
        .select(
            'id, subscription_tier, subscription_status, max_clients, billing_cycle, current_period_end, payment_provider, subscription_mp_id, superseded_mp_preapproval_id, card_last4, card_brand'
        )
        .eq('id', user.id)
        .maybeSingle()

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (!coach) {
        return NextResponse.json({ error: 'Coach not found' }, { status: 404 })
    }

    const { data: events } = await supabase
        .from('subscription_events')
        .select('id, provider_status, provider, created_at, provider_checkout_id, payload')
        .eq('coach_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50)

    // Add-ons del coach (RLS SELECT propio: el client user-scoped solo ve sus filas) +
    // billing compuesto. EL ÚNICO origen de montos para la UI — la página nunca calcula precios.
    // tolerante a fallos: si la lectura de add-ons falla, el resto de la respuesta sigue viva.
    const tier = coach.subscription_tier as SubscriptionTier
    const cycle = normalizeCycle(coach.billing_cycle)
    let addons: Awaited<ReturnType<typeof listLive>> = []
    try {
        addons = await listLive(supabase, user.id)
    } catch {
        addons = []
    }
    const billable = toBillableAddons(addons)
    const baseClp = getTierPriceClp(tier, cycle)
    const addonsClp = billable.reduce(
        (sum, a) => sum + getAddonCycleAmountClp(a.priceClpMensual, cycle),
        0
    )
    const totalClp = getCompositeAmountClp(tier, cycle, billable)

    // Alumnos activos standalone (mismo filtro canónico que el cap gate de alta de alumno).
    // La UI lo usa para bloquear downgrades a un tier cuyo max_clients < alumnos activos.
    // Tolerante a fallos: si el count falla, 0 (no rompe el resto de la respuesta).
    let activeClientCount = 0
    try {
        activeClientCount = await countActiveStandaloneClients(supabase, user.id)
    } catch {
        activeClientCount = 0
    }

    return NextResponse.json({
        coach,
        events: events ?? [],
        addons,
        billing: { baseClp, addonsClp, totalClp },
        activeClientCount,
        // Flag server-only del cambio de tarjeta (la página es client → no puede leer process.env).
        // P1-8: gateamos TAMBIÉN en que exista NEXT_PUBLIC_MP_PUBLIC_KEY — sin la public key el tokenizer
        // (Secure Fields) no monta y el botón llevaría a un formulario muerto (gotcha NEXT_PUBLIC+Sensitive).
        changeCardEnabled: CHANGE_CARD_ENABLED && (process.env.NEXT_PUBLIC_MP_PUBLIC_KEY ?? '').trim().length > 0,
    })
}
