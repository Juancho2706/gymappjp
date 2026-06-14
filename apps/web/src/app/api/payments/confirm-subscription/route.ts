import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import type { Json, TablesInsert } from '@/lib/database.types'
import { mapProviderStatus, resolveCurrentPeriodEnd } from '@/lib/payments/subscription-state'
import { getPaymentsProvider } from '@/lib/payments/provider'
import {
    getDefaultBillingCycleForTier,
    getTierMaxClients,
    isBillingCycleAllowedForTier,
    type BillingCycle,
    type SubscriptionTier,
} from '@/lib/constants'
import { parseCheckoutExternalReference } from '@/lib/payments/checkout-external-reference'
import { resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { canViewBilling } from '@/services/auth/workspace-permissions.service'
import {
    buildAcceptedRulesPayload,
    materializeAddonsFromPreapproval,
} from '@/services/billing/addon-webhook.service'

const schema = z.object({
    preapprovalId: z.string().min(1).optional(),
})

export async function POST(request: Request) {
    try {
        const traceId = request.headers.get('x-request-id') ?? crypto.randomUUID()
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

        let body: unknown = {}
        try {
            body = await request.json()
        } catch {
            // Empty body is acceptable
        }

        const parsed = schema.safeParse(body)
        if (!parsed.success) {
            return NextResponse.json(
                { error: parsed.error.issues[0]?.message ?? 'Invalid payload' },
                { status: 400 }
            )
        }

        const admin = createServiceRoleClient()
        const { data: coach } = await admin
            .from('coaches')
            .select(
                'id, subscription_tier, billing_cycle, subscription_mp_id, current_period_end, subscription_status, superseded_mp_preapproval_id'
            )
            .eq('id', user.id)
            .maybeSingle()

        if (!coach) {
            return NextResponse.json({ error: 'Coach not found' }, { status: 404 })
        }

        const explicitPreapprovalId = parsed.data.preapprovalId
        const preapprovalId = explicitPreapprovalId ?? coach.subscription_mp_id ?? undefined
        if (!preapprovalId) {
            return NextResponse.json({ error: 'No subscription id to confirm.' }, { status: 400 })
        }

        // Guard: if coach is admin-blocked (expired/paused) and no explicit preapproval ID came
        // from a fresh MP redirect, reject — prevents "Ya pagué" reactivating with a stale stored ID.
        const adminBlockedStatuses = new Set(['expired', 'paused'])
        if (!explicitPreapprovalId && adminBlockedStatuses.has(coach.subscription_status ?? '')) {
            return NextResponse.json(
                { error: 'Tu cuenta tiene acceso restringido. Para reactivar, iniciá un nuevo proceso de pago.' },
                { status: 403 }
            )
        }

        const provider = getPaymentsProvider()
        let snapshot
        try {
            snapshot = await provider.fetchCheckoutSnapshot(preapprovalId)
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Provider fetch failed'
            return NextResponse.json({ error: message }, { status: 502 })
        }

        const parsedRef = parseCheckoutExternalReference(snapshot.external_reference ?? null)
        if (parsedRef?.coachId && parsedRef.coachId !== user.id) {
            return NextResponse.json({ error: 'Subscription does not belong to current user.' }, { status: 403 })
        }
        // Fail-CLOSED para un id EXPLÍCITO del body, PERO sin 403 espurio a un preapproval legacy
        // cuyo external_reference es null/no-parseable (P1 fail-closed-403 regression). Dos casos:
        //   - parsedRef TIENE coachId → debe coincidir con user.id (ya cubierto arriba; si no coincide
        //     ya retornó 403). Si coincide, OK.
        //   - parsedRef es null o sin coachId → no podemos atar el preapproval al coach por el ref, así
        //     que caemos al ownership por id: el preapprovalId explícito DEBE ser el subscription_mp_id
        //     ya guardado del coach. Si coincide, es suyo → proceder; si no, rechazar.
        if (explicitPreapprovalId && !parsedRef?.coachId) {
            if (explicitPreapprovalId !== coach.subscription_mp_id) {
                return NextResponse.json(
                    { error: 'Subscription does not belong to current user.' },
                    { status: 403 }
                )
            }
        }

        let tier = (coach.subscription_tier ?? 'starter') as SubscriptionTier
        let billingCycle = (coach.billing_cycle ?? 'monthly') as BillingCycle
        if (parsedRef?.tier && parsedRef.billingCycle) {
            tier = parsedRef.tier
            billingCycle = parsedRef.billingCycle
        }
        if (!isBillingCycleAllowedForTier(tier, billingCycle)) {
            return NextResponse.json(
                {
                    error: `El ciclo ${billingCycle} no está permitido para el plan ${tier}. Selecciona una combinación válida antes de confirmar.`,
                    suggestedBillingCycle: getDefaultBillingCycleForTier(tier),
                },
                { status: 409 }
            )
        }

        const status = mapProviderStatus(snapshot.status ?? null)

        // ── Paid-like gate (FIX-1 / audit P1) ───────────────────────────────────────────
        // Only mutate the coach when the resolved status is paid-like ('active'|'trialing').
        // The MP test sandbox (and late prod webhooks) leave the preapproval 'pending' at redirect:
        // writing subscription_status='pending_payment' + current_period_end=null here would BLOCK the
        // coach AND overwrite an active in-flight upgrade (P1). So when NON-active we mutate nothing and
        // return the status — the processing page keeps polling (re-calling this endpoint) without
        // blocking, and converges once MP authorizes the preapproval (or the webhook backstop lands).
        const isPaidLike = status === 'active' || status === 'trialing'
        if (!isPaidLike) {
            console.info('[payments.confirm-subscription] non-active — no coach mutation', {
                traceId,
                coachId: user.id,
                preapprovalId,
                providerStatus: snapshot.status ?? null,
                internalStatus: status,
            })
            return NextResponse.json({
                ok: true,
                subscriptionStatus: status,
                providerStatus: snapshot.status ?? null,
            })
        }

        // ── Early-slash guard (P1) — NO mutar tier/entitlements de un cambio AGENDADO al corte ──────
        // Un downgrade activo o cambio de ciclo crea un NUEVO preapproval con `start_date` futuro
        // (toma efecto recién al corte). MP deja ese preapproval ya `authorized` (paid-like) pero su
        // inicio efectivo es a futuro. Si bajamos tier/max_clients/cycle/current_period_end AHORA, el
        // coach perdería entitlements ANTES de que el cambio deba aplicar (y antes del fin del ciclo
        // que ya pagó). Detectamos la fecha de INICIO futura y, si es > ahora, NO tocamos al coach: el
        // webhook aplica el cambio al corte. Solo mutamos cuando el preapproval está activo Y su inicio
        // es ahora/pasado.
        //
        // CRÍTICO — usamos SOLO `start_date` / `auto_recurring.start_date` como señal de "agendado". NO
        // usamos `next_payment_date`: en un alta/renovación normal el próximo cobro SIEMPRE es futuro
        // (el ciclo siguiente), así que tomarlo como señal bloquearía la primera activación legítima y
        // regresaría el plain-renewal path (invariante). Un alta fresca trae `start_date` ~ahora/pasado
        // (creado now+60s, ya vencido al confirmar); un cambio-al-corte trae `start_date` = corte (futuro).
        const startSignal = snapshot.start_date ?? snapshot.auto_recurring?.start_date ?? null
        if (startSignal) {
            const startMs = new Date(startSignal).getTime()
            if (Number.isFinite(startMs) && startMs > Date.now()) {
                console.info('[payments.confirm-subscription] scheduled-at-cut — no entitlement mutation', {
                    traceId,
                    coachId: user.id,
                    preapprovalId,
                    startDate: startSignal,
                    providerStatus: snapshot.status ?? null,
                })
                return NextResponse.json({
                    ok: true,
                    scheduled: true,
                    subscriptionStatus: coach.subscription_status,
                })
            }
        }

        const nextPeriodEnd = resolveCurrentPeriodEnd({
            status,
            billingCycle,
            currentPeriodEnd: coach.current_period_end,
            providerCurrentPeriodEnd: snapshot.next_payment_date ?? snapshot.auto_recurring?.end_date ?? null,
        })

        const { error: updateError } = await admin
            .from('coaches')
            .update({
                subscription_status: status,
                current_period_end: nextPeriodEnd,
                payment_provider: provider.name,
                subscription_tier: tier,
                billing_cycle: billingCycle,
                max_clients: getTierMaxClients(tier),
                subscription_mp_id: preapprovalId,
            })
            .eq('id', user.id)

        if (updateError) {
            return NextResponse.json({ error: updateError.message }, { status: 500 })
        }

        // ── Sync-path mirror of the webhook hooks (idempotent backstop convergence) ──────
        // The webhook (payments/webhook/route.ts) is the canonical async path, but the MP test
        // sandbox does NOT auto-deliver webhooks and prod webhooks can arrive late/missing. So we
        // re-run the two state-critical hooks here, synchronously, now that the confirmed preapproval
        // is active/paid-like. Both are idempotent with the webhook (no double cancel, no double
        // materialize): the supersede id is cleared once, and coach_addons rows dedup via the partial
        // unique index. Failures are logged but do NOT fail the confirm (the coach row already updated).
        {
            // (a) SUPERSEDE CANCEL (P0-B): cancel the old preapproval an in-flight upgrade replaced,
            //     then clear the marker (service-role). Mirrors webhook/route.ts ~421-440.
            const superseded = coach.superseded_mp_preapproval_id?.trim()
            if (superseded && superseded !== preapprovalId) {
                try {
                    await provider.cancelCheckoutAtProvider(superseded)
                    console.info('[payments.confirm-subscription] cancelled superseded preapproval', {
                        traceId,
                        coachId: user.id,
                        superseded,
                    })
                } catch (cancelErr) {
                    const msg = cancelErr instanceof Error ? cancelErr.message : String(cancelErr)
                    console.warn('[payments.confirm-subscription] failed to cancel superseded preapproval', {
                        traceId,
                        coachId: user.id,
                        superseded,
                        message: msg,
                    })
                }
                const { error: clearError } = await admin
                    .from('coaches')
                    .update({ superseded_mp_preapproval_id: null })
                    .eq('id', user.id)
                if (clearError) {
                    console.error('[payments.confirm-subscription] failed to clear superseded marker', {
                        traceId,
                        coachId: user.id,
                        superseded,
                        message: clearError.message,
                    })
                }
            }

            // (b) ADDON MATERIALIZE (P0-C): if the confirmed preapproval embeds add-ons in its
            //     external_reference (composite upgrade), materialize the coach_addons rows now so a
            //     synchronous upgrade never leaves the coach paying-composite with enabled_modules={}.
            //     Idempotent via the partial unique index. Mirrors webhook/route.ts ~536-543.
            const embeddedAddons = parsedRef?.addons ?? []
            if (embeddedAddons.length > 0) {
                try {
                    const created = await materializeAddonsFromPreapproval(
                        admin,
                        user.id,
                        embeddedAddons,
                        buildAcceptedRulesPayload(billingCycle).version
                    )
                    if (created.length > 0) {
                        console.info('[payments.confirm-subscription] materialized addons from preapproval', {
                            traceId,
                            coachId: user.id,
                            created: created.map((a) => a.moduleKey),
                        })
                    }
                } catch (addonErr) {
                    const message = addonErr instanceof Error ? addonErr.message : String(addonErr)
                    console.error('[payments.confirm-subscription] addon materialize failed (coach already updated)', {
                        traceId,
                        coachId: user.id,
                        message,
                    })
                    // Backstop: the webhook re-runs this idempotently; the daily reconcile detects drift.
                }
            }
        }

        const payload: Json | null = (() => {
            try {
                return JSON.parse(JSON.stringify(snapshot)) as Json
            } catch {
                return null
            }
        })()

        const eventRow: TablesInsert<'subscription_events'> = {
            coach_id: user.id,
            provider: provider.name,
            provider_event_id: `manual-confirm:${preapprovalId}:${String(snapshot.status ?? 'unknown')}`,
            provider_checkout_id: preapprovalId,
            provider_status: snapshot.status ?? null,
            payload,
        }

        const { error: eventError } = await admin
            .from('subscription_events')
            .upsert(eventRow, { onConflict: 'provider_event_id' })

        if (eventError) {
            console.error('[payments.confirm-subscription] event upsert failed', {
                traceId,
                coachId: user.id,
                preapprovalId,
                message: eventError.message,
            })
        }

        console.info('[payments.confirm-subscription] processed', {
            traceId,
            coachId: user.id,
            preapprovalId,
            providerStatus: snapshot.status ?? null,
            internalStatus: status,
            currentPeriodEnd: nextPeriodEnd,
        })

        return NextResponse.json({
            ok: true,
            subscriptionStatus: status,
            providerStatus: snapshot.status ?? null,
        })
    } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo confirmar la suscripción.'
        return NextResponse.json({ error: message }, { status: 500 })
    }
}
