import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import type { Json, TablesInsert } from '@/lib/database.types'
import { getPaymentsProviderForCoach } from '@/lib/payments/provider'
import { getTierMaxClients, SUBSCRIPTION_BLOCKED_STATUSES } from '@/lib/constants'
import type { SubscriptionTier } from '@/lib/constants'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { canViewBilling } from '@/services/auth/workspace-permissions.service'

function isAlreadyCanceledError(message: string) {
    return /already|cancelled|canceled|cancelado|invalid status|not authorized|cannot be modified/i.test(
        message
    )
}

export async function POST() {
    try {
        const supabase = await createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
        }

        const workspace = await resolvePreferredWorkspace(supabase, user.id)
        if (!canViewBilling(workspace)) {
            return NextResponse.json({ error: 'Billing disponible solo para coach independiente.' }, { status: 403 })
        }

        const admin = createServiceRoleClient()
        const { data: coach } = await admin
            .from('coaches')
            .select(
                'id, subscription_status, subscription_mp_id, subscription_provider, subscription_provider_external_id'
            )
            .eq('id', user.id)
            .maybeSingle()

        if (!coach) {
            return NextResponse.json({ error: 'Coach no encontrado' }, { status: 404 })
        }

        // Cualquier estado bloqueado que canda el panel (expired/pending_payment/past_due/paused
        // pasada la gracia): el coach ya cayó en /coach/reactivate y su única salida sin pagar es
        // volver a Free. El límite ≤3 lo revalida el count de abajo (money-safety real).
        if (!(SUBSCRIPTION_BLOCKED_STATUSES as readonly string[]).includes(coach.subscription_status ?? '')) {
            return NextResponse.json(
                { error: 'Esta acción solo está disponible para suscripciones bloqueadas.' },
                { status: 403 }
            )
        }

        const { count } = await admin
            .from('clients')
            .select('id', { count: 'exact', head: true })
            .eq('coach_id', user.id)
            .is('org_id', null)
            .eq('is_archived', false)

        const activeCount = count ?? 0
        const freeLimit = getTierMaxClients('free' as SubscriptionTier)

        if (activeCount > freeLimit) {
            return NextResponse.json(
                {
                    error: `Tienes ${activeCount} alumnos activos. Para continuar con el plan gratuito necesitas archivar ${activeCount - freeLimit} alumno${activeCount - freeLimit > 1 ? 's' : ''}.`,
                    activeCount,
                    freeLimit,
                },
                { status: 400 }
            )
        }

        // Best-effort cancel at provider — POR EL GATEWAY PERSISTIDO del coach (U3, money-safety).
        // Antes usaba SIEMPRE MP + un gate `providerMatches` por `payment_provider`: para un coach Flow
        // eso NO cancelaba nada y dejaba la sub Flow VIVA cobrando a un coach que pasó a plan gratis.
        // Ahora se resuelve el provider por `subscription_provider` (fuente de verdad) y el id a cancelar
        // según el gateway — Flow → `subscription_provider_external_id`; MP → `subscription_mp_id`.
        const provider = getPaymentsProviderForCoach(coach)
        const checkoutId = (coach.subscription_provider === 'flow'
            ? coach.subscription_provider_external_id
            : coach.subscription_mp_id
        )?.trim()

        if (checkoutId) {
            try {
                await provider.cancelCheckoutAtProvider(checkoutId)
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                if (!isAlreadyCanceledError(msg)) {
                    console.warn('[activate-free] provider cancel failed (non-critical):', msg)
                }
            }
        }

        const { error: updateError } = await admin
            .from('coaches')
            .update({
                subscription_status: 'active',
                subscription_tier: 'free',
                billing_cycle: 'monthly',
                max_clients: freeLimit,
                subscription_mp_id: null,
                current_period_end: null,
                // Limpiar los refs de la sub Flow que se acaba de cancelar y volver el gateway al
                // default neutro (MP). `provider_customer_id` se CONSERVA (tarjeta reutilizable si el
                // coach vuelve a un plan pago). Sin esto, un ex-Flow reactivado quedaría con refs muertos.
                subscription_provider: 'mercadopago',
                subscription_provider_external_id: null,
                provider_plan_id: null,
            })
            .eq('id', user.id)

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 })
        }

        const eventRow: TablesInsert<'subscription_events'> = {
            coach_id: user.id,
            provider: provider.name,
            provider_event_id: `activate-free:${user.id}:${Date.now()}`,
            provider_status: 'active',
            payload: { activated_free: true, previous_status: coach.subscription_status } as Json,
        }
        await admin.from('subscription_events').insert(eventRow)

        const auditRow: TablesInsert<'admin_audit_logs'> = {
            admin_email: 'coach-self-action',
            action: 'coach.activate_free',
            target_table: 'coaches',
            target_id: user.id,
            payload: { previous_status: coach.subscription_status } as Json,
        }
        await admin.from('admin_audit_logs').insert(auditRow)

        return NextResponse.json({ ok: true })
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Error inesperado' },
            { status: 500 }
        )
    }
}
