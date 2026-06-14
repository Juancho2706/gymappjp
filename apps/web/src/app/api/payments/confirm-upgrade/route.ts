import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { canViewBilling } from '@/services/auth/workspace-permissions.service'
import { rateLimitPayment, jsonRateLimited } from '@/lib/rate-limit'
import { mapProviderStatus } from '@/lib/payments/subscription-state'
import { getPaymentsProvider } from '@/lib/payments/provider'
import {
    buildCheckoutExternalReference,
    parseTierUpgradeReference,
} from '@/lib/payments/providers/mercadopago'
import { getCompositeAmountClp, toBillableAddons } from '@/services/billing/addons.service'
import { listLive } from '@/infrastructure/db/coach-addons.repository'
import { clearUpgradeInFlight } from '@/services/billing/plan-change-lock'
import { fetchCoachBillingRow } from '../addons/_lib/coach-context'
import { getTierMaxClients, getTierRank, type SubscriptionTier } from '@/lib/constants'

/**
 * POST /api/payments/confirm-upgrade — camino SÍNCRONO de confirmación del one-shot de UPGRADE
 * de tier (plan estrategia 06, C2). Espejo de confirm-addon: al volver del Checkout Pro, la
 * pantalla `upgrade-processing` llama acá con el `payment_id` que MP agregó al back_url, ACTIVA
 * el nuevo tier en el acto y NO depende del webhook (que sigue como backstop idempotente).
 *
 * Activación idempotente (rank-guard): solo escribe tier/max_clients/billing_cycle si el tier
 * vigente es de rango MENOR al nuevo — si ya activó (este camino o el webhook), es no-op. El
 * PUT del preapproval lleva al nuevo compuesto (tier nuevo + add-ons vivos) DESDE la renovación
 * (sin cobro inmediato del valor completo — el one-shot ya cobró la diferencia prorrateada).
 *
 * El `billing_snapshot` lo escribe SOLO el webhook (kind='tier_upgrade_proration', dedup por
 * provider_payment_id): acá NO se escribe para no competir. NO es self-service gated: el upgrade
 * de tier es billing core, no depende del flag SELF_SERVICE_ADDONS_ENABLED.
 *
 * Guards en orden: auth → canViewBilling (excluye team/org) → rate-limit → paymentId (zod).
 * El monto/estado SIEMPRE los resuelve el server contra MP; el cliente solo manda el id.
 */

const schema = z.object({
    paymentId: z.string().min(1),
})

export async function POST(request: Request) {
    try {
        const traceId = request.headers.get('x-request-id') ?? crypto.randomUUID()
        const supabase = await createClient()
        const {
            data: { user },
        } = await supabase.auth.getUser()

        if (!user?.id || !user.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const workspace = await resolvePreferredWorkspace(supabase, user.id)
        if (!canViewBilling(workspace)) {
            return NextResponse.json(
                { error: 'Billing disponible solo para coach independiente.' },
                { status: 403 }
            )
        }

        const rl = await rateLimitPayment(user.id)
        if (!rl.ok) return jsonRateLimited(rl.retryAfter)

        const parsed = schema.safeParse(await request.json().catch(() => null))
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message ?? 'Invalid payload' },
                { status: 400 }
            )
        }
        const { paymentId } = parsed.data

        const provider = getPaymentsProvider()
        let payment
        try {
            payment = await provider.fetchPaymentSnapshot(paymentId)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Provider fetch failed'
            return NextResponse.json({ error: message }, { status: 502 })
        }

        const status = mapProviderStatus(payment.status ?? null)
        // Pendiente/rechazado: NO se activa nada (abandono = tier intacto). La pantalla sigue
        // polleando hasta que el estado pase a activo o venza el timeout.
        if (status !== 'active') {
            return NextResponse.json({ ok: true, status })
        }

        const ref = parseTierUpgradeReference(payment.external_reference ?? null)
        if (!ref) {
            return NextResponse.json(
                { error: 'El pago no corresponde a un upgrade de plan.' },
                { status: 400 }
            )
        }
        // No-privilege-escalation: el reference debe pertenecer al coach de la sesión.
        if (ref.coachId !== user.id) {
            return NextResponse.json(
                { error: 'Este pago no pertenece al usuario actual.' },
                { status: 403 }
            )
        }

        const admin = createServiceRoleClient()
        const coach = await fetchCoachBillingRow(admin, user.id)
        if (!coach) {
            return NextResponse.json({ error: 'Coach no encontrado' }, { status: 404 })
        }
        if (!coach.subscription_mp_id) {
            // Sin preapproval no hay dónde aplicar el PUT del compuesto desde la renovación.
            return NextResponse.json(
                { error: 'No hay una suscripción activa donde aplicar el upgrade.' },
                { status: 409 }
            )
        }

        // P1 REPLAY GUARD: si el evento de dedup `tier_upgrade:${paymentId}` YA existe, este
        // paymentId aprobado ya activó su upgrade (este camino o el webhook). Re-activar acá
        // permitiría re-jugar un paymentId viejo para re-otorgar un tier GRATIS después de un
        // downgrade posterior. Salimos sin re-activar ni re-PUTear el preapproval.
        const { data: alreadyUpgraded } = await admin
            .from('subscription_events')
            .select('id')
            .eq('provider_event_id', `tier_upgrade:${paymentId}`)
            .maybeSingle()
        if (alreadyUpgraded) {
            console.info('[payments.confirm-upgrade] replay, already processed', {
                traceId,
                coachId: user.id,
                paymentId,
            })
            return NextResponse.json({
                ok: true,
                status: 'active',
                tier: coach.subscription_tier,
                alreadyProcessed: true,
            })
        }

        const currentTier = (coach.subscription_tier ?? 'starter') as SubscriptionTier

        // Activación idempotente con RANK-GUARD: solo subimos tier/max_clients/cycle si el tier
        // vigente es de rango MENOR al nuevo (si ya activó —este camino o el webhook—, no-op).
        if (getTierRank(currentTier) < getTierRank(ref.newTier)) {
            const { error: updateError } = await admin
                .from('coaches')
                .update({
                    subscription_tier: ref.newTier,
                    max_clients: getTierMaxClients(ref.newTier),
                    billing_cycle: ref.cycle,
                    // status se mantiene 'active' (no se toca): el upgrade no cambia el estado.
                })
                .eq('id', user.id)
            if (updateError) {
                return NextResponse.json({ error: updateError.message }, { status: 500 })
            }
        }

        // PUT del preapproval al nuevo compuesto (tier nuevo + add-ons vivos facturables) DESDE la
        // renovación — sin cargo inmediato (MP solo cambia el próximo cobro). Idempotente: el monto
        // es determinístico, correrlo dos veces (este camino + el webhook) deja el mismo valor.
        //
        // P0-1 STALE-REF REVERT: además del monto, reescribimos el `external_reference` del
        // preapproval al NUEVO tier|cycle (más los add-ons vivos). Sin esto, el siguiente evento
        // `preapproval` re-derivaría el tier VIEJO del reference y revertiría el upgrade.
        const live = await listLive(admin, user.id)
        const liveAddonKeys = live.map((a) => a.moduleKey)
        const newComposite = getCompositeAmountClp(ref.newTier, ref.cycle, toBillableAddons(live))
        await provider.updateCheckoutAmountAndRef(
            coach.subscription_mp_id,
            newComposite,
            buildCheckoutExternalReference(user.id, ref.newTier, ref.cycle, liveAddonKeys)
        )

        // Evento de historial deduplicado por `tier_upgrade:${paymentId}` (idempotente con el
        // webhook, que escribe el snapshot pero esta key garantiza que la activación quede trazada).
        await admin.from('subscription_events').upsert(
            {
                coach_id: user.id,
                provider: provider.name,
                provider_event_id: `tier_upgrade:${paymentId}`,
                provider_checkout_id: coach.subscription_mp_id,
                provider_status: payment.status ?? 'approved',
                payload: {
                    action: 'tier_upgrade_confirmed',
                    new_tier: ref.newTier,
                    billing_cycle: ref.cycle,
                    payment_id: paymentId,
                    new_composite_clp: newComposite,
                },
            },
            { onConflict: 'provider_event_id' }
        )

        // P0-4: el upgrade quedó activado → limpiamos el candado in-flight (idempotente: si el
        // webhook ya lo limpió, no-op). Libera al coach para iniciar un nuevo cambio de plan.
        await clearUpgradeInFlight(admin, user.id)

        console.info('[payments.confirm-upgrade] activated', {
            traceId,
            coachId: user.id,
            newTier: ref.newTier,
            cycle: ref.cycle,
            paymentId,
        })

        return NextResponse.json({ ok: true, status: 'active', tier: ref.newTier })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo confirmar el upgrade.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
