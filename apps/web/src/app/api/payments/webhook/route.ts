import { NextResponse } from 'next/server'
import { getPaymentsProvider } from '@/lib/payments/provider'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import type { Json, TablesInsert } from '@/lib/database.types'
import { mapProviderStatus, resolveCurrentPeriodEnd, resolveTerminalEvent } from '@/lib/payments/subscription-state'
import {
    ADDON_CONFIG,
    BILLING_CYCLE_CONFIG,
    getTierMaxClients,
    getTierRank,
    isBillingCycleAllowedForTier,
    type BillingCycle,
    type SubscriptionTier,
} from '@/lib/constants'
import {
    extractMercadoPagoNotificationId,
    isPaymentsWebhookTokenValid,
    verifyMercadoPagoSignatureIfConfigured,
} from '@/lib/payments/webhook-authorization'
import { cancelAllForCoach, listLive } from '@/infrastructure/db/coach-addons.repository'
import { buildCheckoutExternalReference } from '@/lib/payments/providers/mercadopago'
import { clearUpgradeInFlight } from '@/services/billing/plan-change-lock'
import {
    getAddonProrationClp,
    getCompositeAmountClp,
    materializeAddonFromOneShot,
    toBillableAddons,
    type AddonPaymentsPort,
} from '@/services/billing/addons.service'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import { buildAddonActivationReceiptEmail } from '@/lib/email/addon-receipt-templates'
import {
    applyFirstChargeToAddons,
    buildAcceptedRulesPayload,
    buildAddonBreakdown,
    insertBillingSnapshot,
    materializeAddonsFromPreapproval,
    reconcilePreapprovalAmount,
    tierBaseClp,
} from '@/services/billing/addon-webhook.service'

function buildPayload(request: Request, body: unknown) {
    if (body && typeof body === 'object') return body
    const url = new URL(request.url)
    const topic = url.searchParams.get('topic')
    const id = url.searchParams.get('id')
    if (!topic && !id) return {}
    return { type: topic ?? undefined, data: { id: id ?? undefined } }
}

function toJsonPayload(value: unknown): Json | null {
    if (value == null) return null
    try {
        return JSON.parse(JSON.stringify(value)) as Json
    } catch {
        return null
    }
}

async function handleWebhook(request: Request, rawBody: string) {
    let parsed: unknown = {}
    try {
        parsed = rawBody ? JSON.parse(rawBody) : {}
    } catch {
        parsed = {}
    }

    const notificationId = extractMercadoPagoNotificationId(request, parsed)

    if (!isPaymentsWebhookTokenValid(request)) {
        return NextResponse.json({ ok: false, error: 'Unauthorized webhook' }, { status: 401 })
    }

    if (!verifyMercadoPagoSignatureIfConfigured(request, notificationId)) {
        return NextResponse.json({ ok: false, error: 'Invalid webhook signature' }, { status: 401 })
    }

    const provider = getPaymentsProvider()
    const admin = createServiceRoleClient()
    const traceId = request.headers.get('x-request-id') ?? crypto.randomUUID()

    // Idempotency: skip if we already processed this exact notification
    if (notificationId) {
        const { data: alreadyProcessed } = await admin
            .from('subscription_events')
            .select('id')
            .eq('provider_event_id', notificationId)
            .maybeSingle()
        if (alreadyProcessed) {
            console.info('[payments.webhook] duplicate notification, skipping', { traceId, notificationId })
            return NextResponse.json({ ok: true })
        }
    }

    const payload = buildPayload(request, parsed)
    console.info('[payments.webhook] received', { traceId, provider: provider.name, payload })

    let result
    try {
        result = await provider.processWebhook(payload)
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Webhook processing failed'
        console.error('[payments.webhook] provider.processWebhook failed', { traceId, message })
        return NextResponse.json({ ok: false, error: message }, { status: 502 })
    }

    if (!result.accepted) {
        console.warn('[payments.webhook] rejected by provider handler', { traceId })
        return NextResponse.json({ ok: false }, { status: 400 })
    }

    if (!result.coachId) {
        // P1-1 fallback (money-safety): una notificación de REFUND/CHARGEBACK de MP a veces OMITE el
        // external_reference → no hay coachId y este early-return descartaría el refund en silencio
        // (el coach queda activo, sin fila de auditoría). Recuperamos al coach por el preapproval id
        // expuesto en el pago (metadata.preapproval_id) matcheando subscription_mp_id, y si existe lo
        // tratamos como coachId efectivo para CONTINUAR el flujo normal (FIX-7 corre el refund). Si no
        // hay match, seguimos al early-return de siempre. FIX-7 es inalterado e idempotente.
        if (
            result.eventKind === 'payment' &&
            (result.providerStatus === 'refunded' || result.providerStatus === 'charged_back') &&
            result.preapprovalId
        ) {
            const { data: byPreapproval } = await admin
                .from('coaches')
                .select('id')
                .eq('subscription_mp_id', result.preapprovalId)
                .maybeSingle()
            if (byPreapproval) {
                console.info('[payments.webhook] refund recovered coach by preapproval id', {
                    traceId,
                    coachId: byPreapproval.id,
                    preapprovalId: result.preapprovalId,
                    providerStatus: result.providerStatus,
                })
                result.coachId = byPreapproval.id
            }
        }
    }

    if (!result.coachId) {
        console.info('[payments.webhook] accepted without coachId', {
            traceId,
            eventId: result.eventId ?? null,
            providerStatus: result.providerStatus ?? null,
        })
        return NextResponse.json({ ok: true })
    }

    const { data: coach } = await admin
        .from('coaches')
        .select(
            'id, subscription_status, subscription_tier, billing_cycle, current_period_end, subscription_mp_id, superseded_mp_preapproval_id'
        )
        .eq('id', result.coachId)
        .maybeSingle()

    if (!coach) {
        console.warn('[payments.webhook] coach not found', { traceId, coachId: result.coachId })
        return NextResponse.json({ ok: true })
    }

    // Cuentas gestionadas (org/team pagan centralizado, sin billing individual): el webhook
    // jamás debe mutar su suscripción, aunque alguien les setee un mp_id por error.
    if (coach.subscription_status === 'org_managed' || coach.subscription_status === 'team_managed') {
        console.warn('[payments.webhook] skipping managed coach', { traceId, coachId: coach.id, status: coach.subscription_status })
        return NextResponse.json({ ok: true })
    }

    // Adapter del provider al puerto estrecho que usan los hooks de add-ons. El webhook SOLO
    // necesita el PUT de monto (materializeAddonFromOneShot / PUT diferido del compromiso mínimo);
    // createOneShotPayment lo usa el endpoint de alta, NUNCA el webhook (lanza si se invoca acá).
    const addonPayments: AddonPaymentsPort = {
        updateCheckoutAmount: (checkoutId, amountClp) => provider.updateCheckoutAmount(checkoutId, amountClp),
        createOneShotPayment: () => {
            throw new Error('createOneShotPayment no se usa en el webhook')
        },
    }

    // ── P0-1: COBRO RECURRENTE de suscripción (`subscription_authorized_payment`) ──────────────────
    // Rama AUTOCONTENIDA e IDEMPOTENTE (no toca las ramas de payment/preapproval de abajo). El coach ya
    // quedó resuelto (por external_reference o por preapproval_id). Aprobado → snapshot recurrente
    // (dedup por payment id) + first-charge de add-ons (set-once) + avanzar período al next_payment_date
    // fresco + reconfirmar active. Rechazado/pendiente → log (el dunning completo —email + estado— es
    // P0-2); NO bloqueamos acá porque MP reintenta. Re-entrega = no duplica (snapshot/first-charge/upsert).
    if (result.isRecurringAuthorizedPayment) {
        const recurringStatus = mapProviderStatus(result.providerStatus)
        if (recurringStatus === 'active') {
            try {
                const tierForCharge = (coach.subscription_tier ?? 'starter') as SubscriptionTier
                const cycleForCharge = (coach.billing_cycle ?? 'monthly') as BillingCycle
                const paidAt = result.paidAt ?? new Date().toISOString()
                const mpId = coach.subscription_mp_id?.trim() ?? null
                if (mpId) {
                    await applyFirstChargeToAddons(
                        admin,
                        addonPayments,
                        {
                            coachId: coach.id,
                            tier: tierForCharge,
                            cycle: cycleForCharge,
                            subscriptionMpId: mpId,
                            currentPeriodEnd: coach.current_period_end,
                        },
                        paidAt
                    )
                }
                if (result.providerPaymentId) {
                    const liveForSnap = await listLive(admin, coach.id)
                    const breakdown = buildAddonBreakdown(liveForSnap, cycleForCharge)
                    const baseClp = tierBaseClp(tierForCharge, cycleForCharge)
                    await insertBillingSnapshot(admin, {
                        coachId: coach.id,
                        providerPaymentId: result.providerPaymentId,
                        chargedAt: paidAt,
                        tier: tierForCharge,
                        billingCycle: cycleForCharge,
                        kind: 'recurring',
                        baseClp,
                        addons: breakdown,
                        totalClp: baseClp + breakdown.reduce((s, l) => s + l.cycle_amount_clp, 0),
                    })
                }
                const recurringUpdate: Record<string, unknown> = {
                    subscription_status: 'active',
                    payment_provider: provider.name,
                }
                if (result.currentPeriodEnd) recurringUpdate.current_period_end = result.currentPeriodEnd
                const { error: recErr } = await admin.from('coaches').update(recurringUpdate).eq('id', coach.id)
                if (recErr) {
                    console.error('[payments.webhook] recurring charge: coach update failed', {
                        traceId,
                        coachId: coach.id,
                        message: recErr.message,
                    })
                }
            } catch (chargeErr) {
                console.error('[payments.webhook] recurring authorized_payment (approved) hooks failed', {
                    traceId,
                    coachId: coach.id,
                    message: chargeErr instanceof Error ? chargeErr.message : String(chargeErr),
                })
            }
        } else {
            // Rechazado/pendiente (dunning). MP reintenta; el bloqueo lo decide el flujo de pausa/terminal.
            // Dunning completo (email pago-fallido + estado) = P0-2 (siguiente). Acá solo dejamos rastro.
            console.warn('[payments.webhook] recurring authorized_payment NOT approved (dunning) — P0-2 pendiente', {
                traceId,
                coachId: coach.id,
                status: result.providerStatus,
            })
        }
        const recurringEventRow: TablesInsert<'subscription_events'> = {
            coach_id: coach.id,
            provider: provider.name,
            provider_event_id:
                result.eventId ?? `${provider.name}:authpay:${result.providerPaymentId ?? 'unknown'}`,
            provider_checkout_id: coach.subscription_mp_id ?? null,
            provider_status: result.providerStatus ?? null,
            payload: toJsonPayload(payload),
        }
        await admin.from('subscription_events').upsert(recurringEventRow, { onConflict: 'provider_event_id' })
        return NextResponse.json({ ok: true })
    }

    // ── Pago ONE-SHOT de add-on (alta in-app trim/anual, D4/F3.2) ─────────────────────
    // Llega como PAYMENT con external_reference dedicado `addon_oneshot|...`. NO toca el estado de
    // la suscripción (es un pago único, no el preapproval): se procesa aparte y se retorna. NO pasa
    // por appliesToTrackedSubscription (su providerCheckoutId es la order del pago, no el preapproval).
    if (result.eventKind === 'payment' && result.oneShotAddon) {
        const isApproved = mapProviderStatus(result.providerStatus) === 'active'
        if (!isApproved) {
            // Pendiente/rechazado: nada que materializar (abandono = cero filas, cero módulos).
            console.info('[payments.webhook] one-shot addon payment not approved, skipping', {
                traceId,
                coachId: coach.id,
                status: result.providerStatus,
            })
            return NextResponse.json({ ok: true })
        }
        const mpId = coach.subscription_mp_id?.trim()
        if (!mpId) {
            console.warn('[payments.webhook] one-shot addon but coach has no preapproval — cannot PUT', {
                traceId,
                coachId: coach.id,
            })
            return NextResponse.json({ ok: true })
        }
        // FIX-5: the top-level replay guard dedups by provider_event_id === notificationId, but the
        // one-shot history row below is keyed `addon:<id>:oneshot` (never the notificationId), so a
        // REDELIVERED one-shot payment notification would reprocess and re-send the activation receipt
        // every time. Short-circuit here if we already wrote a notificationId-keyed marker for this
        // exact notification: materialization is idempotent (unique partial index), but the receipt
        // email + side-effects are NOT, so skip the whole branch on redelivery.
        if (notificationId) {
            const { data: oneShotAlready } = await admin
                .from('subscription_events')
                .select('id')
                .eq('provider_event_id', notificationId)
                .maybeSingle()
            if (oneShotAlready) {
                console.info('[payments.webhook] duplicate one-shot notification, skipping receipt', {
                    traceId,
                    coachId: coach.id,
                    notificationId,
                })
                return NextResponse.json({ ok: true })
            }
        }
        const tierForAddon = (coach.subscription_tier ?? 'starter') as SubscriptionTier
        const cycleForAddon = (coach.billing_cycle ?? 'monthly') as BillingCycle
        const paidAt = result.paidAt ?? new Date().toISOString()
        const moduleKey = result.oneShotAddon.moduleKey
        try {
            const { addon } = await materializeAddonFromOneShot(
                admin,
                addonPayments,
                {
                    coachId: coach.id,
                    tier: tierForAddon,
                    cycle: cycleForAddon,
                    subscriptionMpId: mpId,
                },
                moduleKey,
                result.oneShotAddon.termsVersion,
                paidAt
            )
            // Snapshot del cobro one-shot (kind='addon_proration') — idempotente por provider_payment_id.
            if (result.providerPaymentId) {
                const breakdown = buildAddonBreakdown([addon], cycleForAddon)
                await insertBillingSnapshot(admin, {
                    coachId: coach.id,
                    providerPaymentId: result.providerPaymentId,
                    chargedAt: paidAt,
                    tier: tierForAddon,
                    billingCycle: cycleForAddon,
                    kind: 'addon_proration',
                    baseClp: 0, // el one-shot es SOLO la fracción del add-on, no la base del tier
                    addons: breakdown,
                    totalClp: breakdown.reduce((s, l) => s + l.cycle_amount_clp, 0),
                })
            }
            // Evento de historial del alta trim/anual: lleva el TEXTO íntegro de las 5 reglas aceptadas.
            const altaEvent: TablesInsert<'subscription_events'> = {
                coach_id: coach.id,
                provider: provider.name,
                provider_event_id: `addon:${addon.id}:oneshot`,
                provider_checkout_id: result.providerPaymentId ?? null,
                provider_status: result.providerStatus ?? 'approved',
                payload: toJsonPayload({
                    action: 'addon_oneshot_materialized',
                    module_key: moduleKey,
                    billing_cycle: cycleForAddon,
                    first_charged_at: paidAt,
                    accepted_rules: buildAcceptedRulesPayload(cycleForAddon),
                }),
            }
            await admin
                .from('subscription_events')
                .upsert(altaEvent, { onConflict: 'provider_event_id' })

            // FIX-5: also write a notificationId-keyed marker so a redelivery of THIS notification
            // short-circuits at the dedup check above (the history row above is keyed by addon id,
            // not the notificationId, so it would not catch the replay). Idempotent on conflict.
            if (notificationId) {
                const dedupEvent: TablesInsert<'subscription_events'> = {
                    coach_id: coach.id,
                    provider: provider.name,
                    provider_event_id: notificationId,
                    provider_checkout_id: result.providerPaymentId ?? null,
                    provider_status: result.providerStatus ?? 'approved',
                    payload: toJsonPayload({
                        action: 'addon_oneshot_notification_dedup',
                        addon_id: addon.id,
                        module_key: moduleKey,
                    }),
                }
                await admin
                    .from('subscription_events')
                    .upsert(dedupEvent, { onConflict: 'provider_event_id' })
            }

            // Recibo de alta — fire-and-forget. TODOS los one-shots (mensual/trim/anual desde la
            // convergencia D4) emiten recibo; un fallo de Resend se LOGUEA pero NUNCA tumba el
            // webhook (la materialización y el cobro ya quedaron consistentes). Evidencia SERNAC.
            try {
                // El email no está en `coaches` (vive en auth.users); coach.id === auth uid.
                const { data: authUser } = await admin.auth.admin.getUserById(coach.id)
                const to = authUser?.user?.email ?? null
                if (to) {
                    const breakdown = buildAddonBreakdown([addon], cycleForAddon)
                    const baseClp = tierBaseClp(tierForAddon, cycleForAddon)
                    const addonsClp = breakdown.reduce((s, l) => s + l.cycle_amount_clp, 0)
                    // oneShotClp = la fracción REALMENTE cobrada hoy (re-computada del corte vigente);
                    // el monto MP es opaco, así que se deriva igual que en el alta (server-computed).
                    const periodEnd = coach.current_period_end
                    const oneShotClp = periodEnd
                        ? getAddonProrationClp(
                              addon.priceClpMensual,
                              cycleForAddon,
                              new Date(paidAt),
                              new Date(periodEnd)
                          )
                        : addonsClp
                    const acceptedRules = buildAcceptedRulesPayload(cycleForAddon)
                    const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'
                    const { subject, html } = buildAddonActivationReceiptEmail({
                        coachName: to.split('@')[0] ?? 'coach',
                        addonLabel: ADDON_CONFIG[moduleKey].label,
                        cycleLabel: BILLING_CYCLE_CONFIG[cycleForAddon].label,
                        baseClp,
                        addonLines: breakdown.map((l) => ({
                            label: ADDON_CONFIG[l.module_key].label,
                            cycleAmountClp: l.cycle_amount_clp,
                        })),
                        totalClp: baseClp + addonsClp,
                        oneShotClp,
                        nextChargeDate: periodEnd
                            ? new Date(periodEnd).toLocaleDateString('es-CL', {
                                  day: 'numeric',
                                  month: 'long',
                                  year: 'numeric',
                              })
                            : null,
                        acceptedRules: acceptedRules.rules,
                        termsVersion: acceptedRules.version,
                        subscriptionUrl: `${appUrl}/coach/subscription`,
                    })
                    const res = await sendTransactionalEmail({ to, subject, html })
                    if (!res.ok) {
                        console.error('[payments.webhook] one-shot addon receipt email failed', {
                            traceId,
                            coachId: coach.id,
                            moduleKey,
                            error: res.error,
                        })
                    }
                }
            } catch (receiptErr) {
                console.error('[payments.webhook] one-shot addon receipt email threw', {
                    traceId,
                    coachId: coach.id,
                    moduleKey,
                    message:
                        receiptErr instanceof Error ? receiptErr.message : String(receiptErr),
                })
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            console.error('[payments.webhook] one-shot addon materialization failed', {
                traceId,
                coachId: coach.id,
                moduleKey,
                message,
            })
            // El PUT diferido o un error transitorio se reintenta vía reconcile diario (drift).
            return NextResponse.json({ ok: false, error: message }, { status: 500 })
        }
        console.info('[payments.webhook] one-shot addon materialized', {
            traceId,
            coachId: coach.id,
            moduleKey,
        })
        return NextResponse.json({ ok: true })
    }

    // ── Pago ONE-SHOT de UPGRADE de tier (plan estrategia 06, C4) ─────────────────────
    // Llega como PAYMENT con external_reference dedicado `tier_upgrade|...`. Backstop idempotente
    // de confirm-upgrade: corre la MISMA activación rank-guarded (tier+max_clients+cycle) + PUT al
    // nuevo compuesto y escribe el snapshot kind='tier_upgrade_proration' (dedup por
    // provider_payment_id). NO toca el preapproval como un cobro recurrente: es un pago único, se
    // procesa aparte y retorna. Seguro en cualquier orden respecto a confirm-upgrade.
    if (result.eventKind === 'payment' && result.tierUpgrade) {
        const isApproved = mapProviderStatus(result.providerStatus) === 'active'
        if (!isApproved) {
            // Pendiente/rechazado: nada que activar (abandono = tier intacto).
            console.info('[payments.webhook] tier-upgrade payment not approved, skipping', {
                traceId,
                coachId: coach.id,
                status: result.providerStatus,
            })
            return NextResponse.json({ ok: true })
        }
        const mpId = coach.subscription_mp_id?.trim()
        if (!mpId) {
            console.warn('[payments.webhook] tier-upgrade but coach has no preapproval — cannot PUT', {
                traceId,
                coachId: coach.id,
            })
            return NextResponse.json({ ok: true })
        }
        const newTier = result.tierUpgrade.newTier
        const cycle = result.tierUpgrade.cycle
        const currentTier = (coach.subscription_tier ?? 'starter') as SubscriptionTier
        const paidAt = result.paidAt ?? new Date().toISOString()
        try {
            // Activación idempotente con RANK-GUARD: solo subimos tier/max_clients/cycle si el tier
            // vigente es de rango MENOR (si ya activó —confirm-upgrade o un reintento—, no-op).
            if (getTierRank(currentTier) < getTierRank(newTier)) {
                const { error: activateErr } = await admin
                    .from('coaches')
                    .update({
                        subscription_tier: newTier,
                        max_clients: getTierMaxClients(newTier),
                        billing_cycle: cycle,
                        // status se mantiene (el upgrade no cambia el estado de la suscripción).
                    })
                    .eq('id', coach.id)
                if (activateErr) {
                    throw new Error(activateErr.message)
                }
            }

            // PUT del preapproval al nuevo compuesto (tier nuevo + add-ons vivos) DESDE la renovación
            // — sin cargo inmediato. Determinístico: correrlo dos veces deja el mismo valor.
            //
            // P0-1 STALE-REF REVERT: además del monto, reescribimos el `external_reference` del
            // preapproval al NUEVO tier|cycle (+ add-ons vivos) para que el siguiente evento
            // `preapproval` no re-derive el tier VIEJO y revierta el upgrade. NO agregamos un guard
            // de "nunca bajar tier" acá: el downgrade-al-corte legítimo crea un preapproval nuevo
            // cuyo reference (menor) SÍ es autoritativo y debe poder aplicar.
            const live = await listLive(admin, coach.id)
            const liveAddonKeys = live.map((a) => a.moduleKey)
            const newComposite = getCompositeAmountClp(newTier, cycle, toBillableAddons(live))
            await provider.updateCheckoutAmountAndRef(
                mpId,
                newComposite,
                buildCheckoutExternalReference(coach.id, newTier, cycle, liveAddonKeys)
            )

            // Snapshot del cobro one-shot del upgrade (kind='tier_upgrade_proration') — idempotente
            // por provider_payment_id. base_clp=0: el one-shot es SOLO la diferencia prorrateada de
            // tier, no la base; el desglose de add-ons no entra en este cobro.
            if (result.providerPaymentId) {
                const snapshotRow: TablesInsert<'billing_snapshots'> = {
                    coach_id: coach.id,
                    provider_payment_id: result.providerPaymentId,
                    charged_at: paidAt,
                    tier: newTier,
                    billing_cycle: cycle,
                    kind: 'tier_upgrade_proration',
                    base_clp: 0,
                    addons: [],
                    total_clp: 0,
                }
                const { error: snapErr } = await admin
                    .from('billing_snapshots')
                    .upsert(snapshotRow, { onConflict: 'provider_payment_id', ignoreDuplicates: true })
                if (snapErr) throw new Error(snapErr.message)
            }

            // Evento de historial deduplicado por `tier_upgrade:${paymentId}` (misma key que
            // confirm-upgrade → seguro en cualquier orden, no duplica).
            if (result.providerPaymentId) {
                const upgradeEvent: TablesInsert<'subscription_events'> = {
                    coach_id: coach.id,
                    provider: provider.name,
                    provider_event_id: `tier_upgrade:${result.providerPaymentId}`,
                    provider_checkout_id: mpId,
                    provider_status: result.providerStatus ?? 'approved',
                    payload: toJsonPayload({
                        action: 'tier_upgrade_confirmed',
                        new_tier: newTier,
                        billing_cycle: cycle,
                        first_charged_at: paidAt,
                    }),
                }
                await admin
                    .from('subscription_events')
                    .upsert(upgradeEvent, { onConflict: 'provider_event_id' })
            }

            // Marker keyed por notificationId para que una reentrega de ESTA notificación corte en
            // el guard de dedup superior (el evento de arriba va keyed por payment id, no por la
            // notificationId, así que no atraparía el replay). Idempotente on conflict.
            if (notificationId) {
                const dedupEvent: TablesInsert<'subscription_events'> = {
                    coach_id: coach.id,
                    provider: provider.name,
                    provider_event_id: notificationId,
                    provider_checkout_id: mpId,
                    provider_status: result.providerStatus ?? 'approved',
                    payload: toJsonPayload({
                        action: 'tier_upgrade_notification_dedup',
                        new_tier: newTier,
                    }),
                }
                await admin
                    .from('subscription_events')
                    .upsert(dedupEvent, { onConflict: 'provider_event_id' })
            }

            // P0-4: el upgrade quedó activado (este backstop o confirm-upgrade) → limpiamos el
            // candado in-flight. Idempotente: si confirm-upgrade ya lo limpió, no-op.
            await clearUpgradeInFlight(admin, coach.id)
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            console.error('[payments.webhook] tier-upgrade activation failed', {
                traceId,
                coachId: coach.id,
                newTier,
                message,
            })
            return NextResponse.json({ ok: false, error: message }, { status: 500 })
        }
        console.info('[payments.webhook] tier-upgrade activated', {
            traceId,
            coachId: coach.id,
            newTier,
            cycle,
        })
        return NextResponse.json({ ok: true })
    }

    const checkoutId = result.providerCheckoutId?.trim() ?? null
    const coachMpId = coach.subscription_mp_id?.trim() ?? null
    const appliesToTrackedSubscription =
        !checkoutId || !coachMpId || checkoutId === coachMpId

    if (!appliesToTrackedSubscription) {
        console.info('[payments.webhook] skipping coach row update for non-current checkout', {
            traceId,
            coachId: coach.id,
            checkoutId,
            coachMpId,
        })
        // ⚠️ Riesgo 2 / sandbox item 2: un COBRO RECURRENTE aprobado trae providerCheckoutId =
        // payment.order.id (≠ preapproval id) → cae acá como "no-current checkout". El match robusto
        // del cobro recurrente contra el coach es por coachId (del external_reference de suscripción),
        // NO por el order id. Por eso la materialización del primer cobro / snapshot del add-on se
        // aplica IGUAL en esta rama si el evento es un pago aprobado del coach. validar en sandbox
        // (item 2): capturar el payload real y, si trae metadata.preapproval_id, preferir ese match.
        if (
            result.eventKind === 'payment' &&
            !result.oneShotAddon &&
            mapProviderStatus(result.providerStatus) === 'active'
        ) {
            try {
                const tierForCharge = (coach.subscription_tier ?? 'starter') as SubscriptionTier
                const cycleForCharge = (coach.billing_cycle ?? 'monthly') as BillingCycle
                const mpId = coach.subscription_mp_id?.trim() ?? null
                const paidAt = result.paidAt ?? new Date().toISOString()
                if (mpId) {
                    await applyFirstChargeToAddons(
                        admin,
                        addonPayments,
                        {
                            coachId: coach.id,
                            tier: tierForCharge,
                            cycle: cycleForCharge,
                            subscriptionMpId: mpId,
                            currentPeriodEnd: coach.current_period_end,
                        },
                        paidAt
                    )
                }
                if (result.providerPaymentId) {
                    const liveForSnap = await listLive(admin, coach.id)
                    const breakdown = buildAddonBreakdown(liveForSnap, cycleForCharge)
                    const baseClp = tierBaseClp(tierForCharge, cycleForCharge)
                    await insertBillingSnapshot(admin, {
                        coachId: coach.id,
                        providerPaymentId: result.providerPaymentId,
                        chargedAt: paidAt,
                        tier: tierForCharge,
                        billingCycle: cycleForCharge,
                        kind: 'recurring',
                        baseClp,
                        addons: breakdown,
                        totalClp: baseClp + breakdown.reduce((s, l) => s + l.cycle_amount_clp, 0),
                    })
                }
            } catch (chargeErr) {
                console.error('[payments.webhook] recurring-charge addon hooks failed (stale branch)', {
                    traceId,
                    coachId: coach.id,
                    message: chargeErr instanceof Error ? chargeErr.message : String(chargeErr),
                })
            }
        }

        // FIX-7: REFUND / CHARGEBACK (first-pass, money-safety). A payment event with RAW status
        // refunded/charged_back lands here on the recurring/stale-checkout branch where today NOTHING
        // runs — the coach stays active and the billing_snapshot is never reversed. Minimal handler:
        // cancel all add-ons (trigger D1 turns off the modules), block the coach
        // (subscription_status='expired'), and annotate an audit row. We do NOT physically reverse the
        // billing_snapshot — just record it via the audit log for SERNAC evidence. Idempotent:
        // cancelAllForCoach is a no-op once cancelled, and the coach update is repeated-safe.
        //
        // ⚠️ Trigger es el ESTADO CRUDO refunded/charged_back, NO mapProviderStatus==='expired':
        // mapProviderStatus colapsa rejected/refunded/charged_back a 'expired', y un cobro recurrente
        // 'rejected' (decline transitorio / reintento de dunning de MP) NO debe expirar+bloquear a un
        // coach con período pagado vigente (eso lo maneja la rama terminal con resolveTerminalEvent).
        // LIMITACIÓN conocida (follow-up): si la notificación de refund NO trae external_reference, no
        // hay coachId y el webhook retorna antes (accepted-without-coachId) → ese refund se pierde;
        // el fallback (match por metadata.preapproval_id) queda pendiente.
        if (
            result.eventKind === 'payment' &&
            !result.oneShotAddon &&
            (result.providerStatus === 'refunded' || result.providerStatus === 'charged_back')
        ) {
            try {
                const cancelled = await cancelAllForCoach(admin, coach.id, new Date().toISOString())
                const { error: blockErr } = await admin
                    .from('coaches')
                    .update({ subscription_status: 'expired', current_period_end: null, subscription_mp_id: null })
                    .eq('id', coach.id)
                if (blockErr) {
                    console.error('[payments.webhook] failed to block coach on refund/chargeback', {
                        traceId,
                        coachId: coach.id,
                        message: blockErr.message,
                    })
                }
                await admin.from('admin_audit_logs').insert({
                    admin_email: 'webhook',
                    action: 'coach.payment_refunded_or_chargeback',
                    target_table: 'coaches',
                    target_id: coach.id,
                    payload: {
                        provider_payment_id: result.providerPaymentId ?? null,
                        provider_status: result.providerStatus ?? null,
                        addons_cancelled: cancelled,
                        triggered_by: 'payments/webhook',
                    },
                })
                console.warn('[payments.webhook] coach blocked on refund/chargeback', {
                    traceId,
                    coachId: coach.id,
                    providerPaymentId: result.providerPaymentId ?? null,
                    addonsCancelled: cancelled,
                })
            } catch (refundErr) {
                console.error('[payments.webhook] refund/chargeback handler failed (stale branch)', {
                    traceId,
                    coachId: coach.id,
                    message: refundErr instanceof Error ? refundErr.message : String(refundErr),
                })
            }
        }

        const staleEventRow: TablesInsert<'subscription_events'> = {
            coach_id: coach.id,
            provider: provider.name,
            provider_event_id:
                result.eventId ??
                `${provider.name}:stale:${checkoutId}:${result.providerStatus ?? 'unknown'}`,
            provider_checkout_id: checkoutId,
            provider_status: result.providerStatus ?? null,
            payload: toJsonPayload(payload),
        }
        await admin.from('subscription_events').upsert(staleEventRow, { onConflict: 'provider_event_id' })
        return NextResponse.json({ ok: true })
    }

    const status = mapProviderStatus(result.providerStatus)
    let tier = (coach.subscription_tier ?? 'starter') as SubscriptionTier
    let billingCycle = (coach.billing_cycle ?? 'monthly') as BillingCycle

    if (result.subscriptionTier && result.billingCycle) {
        tier = result.subscriptionTier
        billingCycle = result.billingCycle
    }

    const statusForUpdate =
        status === 'active' && !isBillingCycleAllowedForTier(tier, billingCycle)
            ? 'pending_payment'
            : status
    const nextPeriodEnd = resolveCurrentPeriodEnd({
        status: statusForUpdate,
        billingCycle,
        currentPeriodEnd: coach.current_period_end,
        providerCurrentPeriodEnd: result.currentPeriodEnd,
    })

    const coachUpdate: Record<string, unknown> = {
        subscription_status: statusForUpdate,
        current_period_end: nextPeriodEnd,
        payment_provider: provider.name,
    }

    const isPaidLike = statusForUpdate === 'active' || statusForUpdate === 'trialing'
    if (isPaidLike && checkoutId) {
        coachUpdate.subscription_tier = tier
        coachUpdate.billing_cycle = billingCycle
        coachUpdate.max_clients = getTierMaxClients(tier)
        coachUpdate.subscription_mp_id = checkoutId

        const superseded = coach.superseded_mp_preapproval_id?.trim()
        if (superseded && superseded !== checkoutId) {
            try {
                await provider.cancelCheckoutAtProvider(superseded)
                console.info('[payments.webhook] cancelled superseded preapproval', {
                    traceId,
                    coachId: coach.id,
                    superseded,
                })
            } catch (cancelErr) {
                const msg = cancelErr instanceof Error ? cancelErr.message : String(cancelErr)
                console.warn('[payments.webhook] failed to cancel superseded preapproval', {
                    traceId,
                    coachId: coach.id,
                    superseded,
                    message: msg,
                })
            }
            coachUpdate.superseded_mp_preapproval_id = null
        }
    }

    // Ola 6: when subscription terminates, block the coach (expired) so they must
    // explicitly reactivate. Tier and max_clients are preserved so the reactivate page
    // can pre-select their previous plan. Admin-forced expiry bypasses this (direct DB write).
    const periodExpiredOrNull =
        !coach.current_period_end ||
        new Date(coach.current_period_end).getTime() <= Date.now()
    const terminalDecision = resolveTerminalEvent({
        statusForUpdate,
        periodExpiredOrNull,
        subscriptionTier: coach.subscription_tier,
    })

    if (terminalDecision === 'expire') {
        coachUpdate.subscription_status = 'expired'
        // Intentionally NOT setting subscription_tier, billing_cycle, or max_clients —
        // the reactivate page uses the preserved tier to anchor the coach to their old plan.
        coachUpdate.current_period_end = null
        coachUpdate.subscription_mp_id = null
    } else if (terminalDecision === 'ignore-free') {
        // Free-tier coach has no paid subscription to terminate. A stale cancellation
        // (e.g. activate-free cancelling an abandoned checkout) must not re-lock a
        // just-activated free coach as 'expired'. Leave subscription fields untouched.
        console.info('[payments.webhook] ignoring terminal event for free-tier coach', {
            traceId,
            coachId: coach.id,
            providerStatus: result.providerStatus,
        })
        delete coachUpdate.subscription_status
        delete coachUpdate.current_period_end
    }

    const { error: coachUpdateError } = await admin.from('coaches').update(coachUpdate).eq('id', coach.id)

    if (coachUpdateError) {
        console.error('[payments.webhook] failed to update coach', {
            traceId,
            coachId: coach.id,
            message: coachUpdateError.message,
        })
        return NextResponse.json({ ok: false }, { status: 500 })
    }

    // ── Hooks de add-ons (plan 05 F3.4) — la DB manda, el monto MP es opaco ───────────
    // Estos hooks corren tras actualizar el coach. Cualquier fallo se LOGUEA pero NO tumba el
    // webhook (el reconcile diario detecta el drift): el estado base de la suscripción ya quedó
    // consistente y es lo crítico. Idempotentes (set-once / unique / índice parcial).
    const finalTier = (coachUpdate.subscription_tier as SubscriptionTier | undefined) ?? tier
    const finalCycle = (coachUpdate.billing_cycle as BillingCycle | undefined) ?? billingCycle
    const finalPeriodEnd = (coachUpdate.current_period_end as string | null | undefined) ?? nextPeriodEnd
    const finalMpId = (coachUpdate.subscription_mp_id as string | undefined) ?? checkoutId ?? coachMpId

    try {
        // (a) TERMINAL expire → cancelar DURO todos los add-ons (trigger D1 apaga módulos).
        if (terminalDecision === 'expire') {
            const cancelled = await cancelAllForCoach(admin, coach.id, new Date().toISOString())
            if (cancelled > 0) {
                console.info('[payments.webhook] cancelled all addons on terminal expire', {
                    traceId,
                    coachId: coach.id,
                    cancelled,
                })
            }
        } else if (result.eventKind === 'preapproval') {
            // (b) Evento `updated` (o `authorized`): confirmar el PUT comparando el monto vigente del
            // preapproval contra el compuesto esperado; drift → alerta. validar en sandbox (item 8).
            const live = await listLive(admin, coach.id)
            const expectedClp = getCompositeAmountClp(finalTier, finalCycle, toBillableAddons(live))
            const reconciled = reconcilePreapprovalAmount({
                providerAmountClp: result.providerAmountClp,
                expectedClp,
            })
            if (reconciled.drift) {
                console.warn('[payments.webhook] preapproval amount DRIFT vs expected composite', {
                    traceId,
                    coachId: coach.id,
                    providerAmountClp: reconciled.providerAmountClp,
                    expectedClp: reconciled.expectedClp,
                })
                await admin.from('admin_audit_logs').insert({
                    admin_email: 'webhook',
                    action: 'coach.addon_amount_drift',
                    target_table: 'coaches',
                    target_id: coach.id,
                    payload: {
                        provider_amount_clp: reconciled.providerAmountClp,
                        expected_clp: reconciled.expectedClp,
                        triggered_by: 'payments/webhook',
                    },
                })
            }

            // (c) preapproval `authorized` con add-ons en el external_reference → materializar filas
            // (signup / supersede con add-ons, D4). Idempotente por el índice único parcial.
            if (mapProviderStatus(result.providerStatus) === 'active' && (result.addons?.length ?? 0) > 0) {
                const created = await materializeAddonsFromPreapproval(
                    admin,
                    coach.id,
                    result.addons!,
                    // terms_version vigente: el alta en signup acepta las reglas en el paso de add-ons.
                    buildAcceptedRulesPayload(finalCycle).version
                )
                if (created.length > 0) {
                    console.info('[payments.webhook] materialized addons from preapproval', {
                        traceId,
                        coachId: coach.id,
                        created: created.map((a) => a.moduleKey),
                    })
                }
            }
        } else if (result.eventKind === 'payment' && mapProviderStatus(result.providerStatus) === 'active') {
            // (d) Primer cobro recurrente (regla 2/3, mensual): set-once de first_charged_at +
            // PUT diferido del compromiso mínimo. Idempotente (markFirstCharged solo afecta IS NULL).
            const paidAt = result.paidAt ?? new Date().toISOString()
            if (finalMpId) {
                const { markedIds, putApplied } = await applyFirstChargeToAddons(
                    admin,
                    addonPayments,
                    {
                        coachId: coach.id,
                        tier: finalTier,
                        cycle: finalCycle,
                        subscriptionMpId: finalMpId,
                        currentPeriodEnd: finalPeriodEnd,
                    },
                    paidAt
                )
                if (markedIds.length > 0) {
                    console.info('[payments.webhook] first charge applied to addons', {
                        traceId,
                        coachId: coach.id,
                        markedIds,
                        putApplied,
                    })
                }
            }

            // (e) Snapshot del cobro recurrente (kind='recurring') — idempotente por provider_payment_id.
            if (result.providerPaymentId) {
                const liveForSnap = await listLive(admin, coach.id)
                const breakdown = buildAddonBreakdown(liveForSnap, finalCycle)
                const baseClp = tierBaseClp(finalTier, finalCycle)
                await insertBillingSnapshot(admin, {
                    coachId: coach.id,
                    providerPaymentId: result.providerPaymentId,
                    chargedAt: paidAt,
                    tier: finalTier,
                    billingCycle: finalCycle,
                    kind: 'recurring',
                    baseClp,
                    addons: breakdown,
                    totalClp: baseClp + breakdown.reduce((s, l) => s + l.cycle_amount_clp, 0),
                })
            }
        }
    } catch (addonErr) {
        const message = addonErr instanceof Error ? addonErr.message : String(addonErr)
        console.error('[payments.webhook] addon hooks failed (base subscription already updated)', {
            traceId,
            coachId: coach.id,
            message,
        })
        // NO se tumba el webhook: el reconcile diario detecta y alerta el drift.
    }

    const stableEventId =
        result.eventId ??
        (result.providerCheckoutId
            ? `${provider.name}:checkout:${result.providerCheckoutId}:${result.providerStatus ?? 'unknown'}`
            : `${provider.name}:coach:${coach.id}:${result.providerStatus ?? 'unknown'}`)

    const eventRow: TablesInsert<'subscription_events'> = {
        coach_id: coach.id,
        provider: provider.name,
        provider_event_id: stableEventId,
        provider_checkout_id: result.providerCheckoutId ?? null,
        provider_status: result.providerStatus ?? null,
        payload: toJsonPayload(payload),
    }

    const { error: eventError } = await admin
        .from('subscription_events')
        .upsert(eventRow, { onConflict: 'provider_event_id' })

    if (eventError) {
        console.error('[payments.webhook] failed to write event', {
            traceId,
            coachId: coach.id,
            providerEventId: stableEventId,
            message: eventError.message,
        })
        return NextResponse.json({ ok: false }, { status: 500 })
    }

    console.info('[payments.webhook] processed', {
        traceId,
        coachId: coach.id,
        providerEventId: stableEventId,
        providerStatus: result.providerStatus ?? null,
        internalStatus: statusForUpdate,
        currentPeriodEnd: nextPeriodEnd,
    })

    return NextResponse.json({ ok: true })
}

export async function POST(request: Request) {
    const rawBody = await request.text()
    return handleWebhook(request, rawBody)
}

export async function GET(request: Request) {
    return handleWebhook(request, '')
}
