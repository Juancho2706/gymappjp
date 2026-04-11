import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import type { Json, TablesInsert } from '@/lib/database.types'
import { getPaymentsProvider } from '@/lib/payments/provider'

function isAlreadyCanceledError(message: string) {
    return /already|cancelled|canceled|cancelado|invalid status|not authorized|cannot be modified/i.test(message)
}

export async function POST(request: Request) {
    try {
        const supabase = await createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
        }

        let reason = ''
        try {
            const body = await request.json()
            reason = String(body?.reason ?? '').trim()
        } catch {
            reason = ''
        }

        const admin = createServiceRoleClient()
        const { data: coach } = await admin
            .from('coaches')
            .select('id, subscription_mp_id, payment_provider')
            .eq('id', user.id)
            .maybeSingle()

        if (!coach) {
            return NextResponse.json({ error: 'Coach no encontrado' }, { status: 404 })
        }

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
                    return NextResponse.json(
                        { error: msg || 'No se pudo cancelar la suscripción en el proveedor de pagos.' },
                        { status: 502 }
                    )
                }
            }
        }

        const { error: updateError } = await admin
            .from('coaches')
            .update({
                subscription_status: 'canceled',
                current_period_end: null,
            })
            .eq('id', user.id)

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 })
        }

        const payload: Json | null = reason ? ({ cancel_reason: reason } as Json) : null

        const eventRow: TablesInsert<'subscription_events'> = {
            coach_id: user.id,
            provider: provider.name,
            provider_event_id: `manual-cancel:${user.id}:${Date.now()}`,
            provider_status: 'canceled',
            payload,
        }

        await admin.from('subscription_events').insert(eventRow)

        return NextResponse.json({ ok: true })
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Error inesperado' },
            { status: 500 }
        )
    }
}
