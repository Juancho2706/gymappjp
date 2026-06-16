import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import type { Json, TablesInsert } from '@/lib/database.types'
import { getPaymentsProvider } from '@/lib/payments/provider'
import { rateLimitPayment, jsonRateLimited } from '@/lib/rate-limit'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { canViewBilling } from '@/services/auth/workspace-permissions.service'
import { clearUpgradeInFlight } from '@/services/billing/plan-change-lock'

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
            .select(
                'id, subscription_mp_id, payment_provider, current_period_end, superseded_mp_preapproval_id'
            )
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

        // P0-3 — cancelar TAMBIÉN el preapproval SUPERSEDED en vuelo. Si el coach cancela mientras un
        // cambio de plan está pendiente (un nuevo preapproval reemplazó al viejo pero el viejo quedó
        // como backstop en superseded_mp_preapproval_id), cancelar solo subscription_mp_id dejaría al
        // VIEJO cobrando. Lo cancelamos en MP (best-effort: un "already cancelled" no es error) y
        // limpiamos el marcador para que no quede colgando. service-role.
        const superseded = coach.superseded_mp_preapproval_id?.trim()
        if (superseded && superseded !== checkoutId && providerMatches) {
            try {
                await provider.cancelCheckoutAtProvider(superseded)
                console.info('[payments.cancel-subscription] cancelled superseded preapproval', {
                    coachId: user.id,
                    superseded,
                })
            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err)
                if (!isAlreadyCanceledError(msg)) {
                    console.warn('[payments.cancel-subscription] failed to cancel superseded preapproval', {
                        coachId: user.id,
                        superseded,
                        message: msg,
                    })
                }
            }
            const { error: clearError } = await admin
                .from('coaches')
                .update({ superseded_mp_preapproval_id: null })
                .eq('id', user.id)
            if (clearError) {
                console.error('[payments.cancel-subscription] failed to clear superseded marker', {
                    coachId: user.id,
                    superseded,
                    message: clearError.message,
                })
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

        // P0-4: limpiar el candado de upgrade in-flight. Si el coach cancela mientras un upgrade está en
        // vuelo (one-shot creado, sin confirmar), el marker `tier_upgrade_pending` quedaba hasta el TTL
        // (30 min) bloqueando altas de add-on / cambios de plan con 409. Idempotente: no-op si no hay
        // marker. (El guard canceled/expired de confirm-upgrade y del webhook evita re-activar el tier.)
        try {
            await clearUpgradeInFlight(admin, user.id)
        } catch (lockErr) {
            console.error('[payments.cancel-subscription] failed to clear upgrade lock', {
                coachId: user.id,
                message: lockErr instanceof Error ? lockErr.message : String(lockErr),
            })
        }

        // Add-ons (plan 05 F3.4): el coach conserva acceso al plan base hasta current_period_end (la
        // ruta lo preserva a propósito). Los add-ons YA cobrados NO se apagan al instante — eso
        // violaría la regla 4 (acceso hasta el fin del ciclo ya pagado). Pasan a cancel_pending con
        // expires_at = current_period_end SIN PUT (el preapproval entero ya quedó cancelado en MP, no
        // hay nada que cobrar) y el cron de expiry los pasa a cancelled al corte. Best-effort: un fallo
        // acá no debe tumbar la cancelación de la suscripción base (ya hecha arriba).
        try {
            const periodEnd = coach.current_period_end ?? null
            // (1) add-ons ACTIVOS de pago propio (source='self_service') → cancel_pending con
            // expires_at = corte. NO barremos los admin_grant (cortesía del CEO, price 0): cancelar la
            // suscripción de pago del coach no debe apagar una cortesía que el CEO otorgó aparte.
            const { data: liveAddons } = await admin
                .from('coach_addons')
                .select('id')
                .eq('coach_id', user.id)
                .eq('status', 'active')
                .eq('source', 'self_service')
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
                    .eq('source', 'self_service')
            }
            // (2) P2 — add-ons YA en cancel_pending pero con expires_at NULL (cancelados antes de tener
            // un corte resuelto): fijarles expires_at = corte ahora que el preapproval base se va. Sin
            // esto quedarían ON para siempre porque el cron de expiry filtra por expires_at no-null.
            // También solo self_service.
            await admin
                .from('coach_addons')
                .update({ expires_at: periodEnd })
                .eq('coach_id', user.id)
                .eq('status', 'cancel_pending')
                .eq('source', 'self_service')
                .is('expires_at', null)
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
