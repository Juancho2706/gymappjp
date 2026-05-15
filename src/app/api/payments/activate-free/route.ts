import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import type { Json, TablesInsert } from '@/lib/database.types'
import { getPaymentsProvider } from '@/lib/payments/provider'
import { getTierMaxClients } from '@/lib/constants'
import type { SubscriptionTier } from '@/lib/constants'

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

        const admin = createServiceRoleClient()
        const { data: coach } = await admin
            .from('coaches')
            .select('id, subscription_status, subscription_mp_id, payment_provider')
            .eq('id', user.id)
            .maybeSingle()

        if (!coach) {
            return NextResponse.json({ error: 'Coach no encontrado' }, { status: 404 })
        }

        const allowedStatuses = ['pending_payment', 'expired']
        if (!allowedStatuses.includes(coach.subscription_status ?? '')) {
            return NextResponse.json(
                { error: 'Esta acción solo está disponible para planes pendientes o expirados.' },
                { status: 403 }
            )
        }

        const { count } = await admin
            .from('clients')
            .select('id', { count: 'exact', head: true })
            .eq('coach_id', user.id)
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

        // Best-effort cancel at provider
        const provider = getPaymentsProvider()
        const checkoutId = coach.subscription_mp_id?.trim()
        const providerMatches =
            !coach.payment_provider || coach.payment_provider === provider.name

        if (checkoutId && providerMatches) {
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
