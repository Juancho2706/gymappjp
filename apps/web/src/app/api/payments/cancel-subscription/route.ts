import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import type { Json, TablesInsert } from '@/lib/database.types'
import { getPaymentsProvider } from '@/lib/payments/provider'
import { rateLimitPayment, jsonRateLimited } from '@/lib/rate-limit'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { canViewBilling } from '@/services/auth/workspace-permissions.service'

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

        const rl = await rateLimitPayment(user.id)
        if (!rl.ok) {
            return jsonRateLimited(rl.retryAfter)
        }

        const workspace = await resolvePreferredWorkspace(supabase, user.id)
        if (!canViewBilling(workspace)) {
            return NextResponse.json({ error: 'Billing disponible solo para coach independiente.' }, { status: 403 })
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
            .select('id, subscription_mp_id, payment_provider, current_period_end')
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

        // Preserve current_period_end so the coach keeps access until the end
        // of the period they already paid for. The gate logic checks this date.
        const { error: updateError } = await admin
            .from('coaches')
            .update({
                subscription_status: 'canceled',
            })
            .eq('id', user.id)

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 })
        }

        // Add-ons (plan 05 F3.4): el coach conserva acceso al plan base hasta current_period_end (la
        // ruta lo preserva a propósito). Los add-ons YA cobrados NO se apagan al instante — eso
        // violaría la regla 4 (acceso hasta el fin del ciclo ya pagado). Pasan a cancel_pending con
        // expires_at = current_period_end SIN PUT (el preapproval entero ya quedó cancelado en MP, no
        // hay nada que cobrar) y el cron de expiry los pasa a cancelled al corte. Best-effort: un fallo
        // acá no debe tumbar la cancelación de la suscripción base (ya hecha arriba).
        try {
            const periodEnd = coach.current_period_end ?? null
            const { data: liveAddons } = await admin
                .from('coach_addons')
                .select('id')
                .eq('coach_id', user.id)
                .eq('status', 'active')
            if (liveAddons && liveAddons.length > 0) {
                await admin
                    .from('coach_addons')
                    .update({
                        status: 'cancel_pending',
                        cancel_requested_at: new Date().toISOString(),
                        expires_at: periodEnd,
                    })
                    .eq('coach_id', user.id)
                    .eq('status', 'active')
            }
        } catch (addonErr) {
            console.error('[payments.cancel-subscription] failed to schedule addon cancellation', {
                coachId: user.id,
                message: addonErr instanceof Error ? addonErr.message : String(addonErr),
            })
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
