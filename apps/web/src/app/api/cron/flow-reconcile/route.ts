import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { getPaymentsProvider } from '@/lib/payments/provider'
import { mapProviderStatus } from '@/lib/payments/subscription-state'
import { listLive } from '@/infrastructure/db/coach-addons.repository'
import { getCompositeAmountClp, toBillableAddons } from '@/services/billing/addons.service'
import { resolveDiscountSpecByRedemptionId, isChargeableNetClp } from '@/services/billing/discount.service'
import type { BillingCycle, SubscriptionTier } from '@/lib/constants'

/**
 * Monto horneado en el planId de Flow (`eva_<tier>_<cycle>_<amount>` → trailing = monto CLP), i.e. lo
 * que Flow AUN cobra. Null si no hay planId o no parsea. Usado en el chequeo de drift (B4).
 */
function parseFlowPlanAmount(planId: string | null | undefined): number | null {
    if (!planId) return null
    const m = /_(\d+)$/.exec(planId)
    return m ? Number(m[1]) : null
}

/**
 * Cron reconcile de Flow (plan pagos-multigateway-flow, Ola 3, T3.5) — BACKSTOP diario, espejo de
 * `mp-reconcile`. Es ALERT-ONLY (nunca auto-fix, igual que MP): la DB manda; Flow solo se compara y
 * se ALERTA vía admin_audit_logs (+ email a ADMIN_EMAILS). Detecta dos divergencias money-relevantes:
 *
 *   (1) ESTADO: `mapProviderStatus(sub.status de Flow)` ≠ `coach.subscription_status` (ej. Flow cancelo
 *       la sub por dunning agotado y EVA no se entero).
 *   (2) PERIODO NO AVANZADO (webhook perdido): la sub Flow esta activa y su `period_end` (fin del periodo
 *       vigente en Flow) es POSTERIOR a `coach.current_period_end` → Flow cobro y avanzo el periodo pero
 *       el webhook no llego → el coach pago y su acceso quedaria corto. Se ALERTA para revisar/reprocesar.
 *
 * Fail-closed por `CRON_SECRET` (un reconcile expuesto deja leer/disparar estado de cobro).
 */
function isAuthorized(req: Request): boolean {
    const expected = process.env.CRON_SECRET
    if (!expected) return false
    const auth = req.headers.get('authorization') ?? ''
    const expectedHeader = `Bearer ${expected}`
    const authBuf = Buffer.from(auth, 'utf8')
    const expectedBuf = Buffer.from(expectedHeader, 'utf8')
    if (authBuf.length !== expectedBuf.length) return false
    return timingSafeEqual(authBuf, expectedBuf)
}

/** ¿La fecha `a` (ISO/parseable) es estrictamente posterior a `b`? Fechas invalidas → false (no alerta). */
function isLater(a?: string | null, b?: string | null): boolean {
    if (!a || !b) return false
    const ta = Date.parse(a)
    const tb = Date.parse(b)
    if (Number.isNaN(ta) || Number.isNaN(tb)) return false
    return ta > tb
}

export async function GET(req: Request) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createServiceRoleClient()
    const provider = getPaymentsProvider('flow')

    // Coaches con suscripcion Flow viva (subscription_provider_external_id = el subscriptionId de Flow).
    const { data: coaches, error } = await admin
        .from('coaches')
        .select('id, slug, subscription_status, subscription_tier, billing_cycle, current_period_end, subscription_provider, subscription_provider_external_id, provider_plan_id, active_coupon_redemption_id')
        .eq('subscription_provider', 'flow')
        .not('subscription_provider_external_id', 'is', null)
        .not('subscription_status', 'eq', 'free')
        .not('subscription_status', 'eq', 'org_managed')
        .not('subscription_status', 'eq', 'team_managed')

    if (error) {
        console.error('[cron/flow-reconcile] query failed:', error)
        return NextResponse.json({ ok: false, error: 'DB query failed' }, { status: 500 })
    }

    const divergences: { coachId: string; slug: string; kind: string; detail: string }[] = []
    let checked = 0
    let errors = 0

    for (const coach of coaches ?? []) {
        const subId = coach.subscription_provider_external_id
        if (!subId) continue
        try {
            const snap = await provider.fetchCheckoutSnapshot(subId)
            const flowMappedStatus = mapProviderStatus(snap.status) // 'active'|'canceled'|'expired'|...
            const dbStatus = coach.subscription_status ?? 'unknown'

            // (1) Divergencia de ESTADO (active-vs-no-active, mismo criterio que mp-reconcile).
            const flowIsActive = flowMappedStatus === 'active' || flowMappedStatus === 'trialing'
            const dbIsActive = dbStatus === 'active' || dbStatus === 'trialing'
            if (flowIsActive !== dbIsActive) {
                divergences.push({ coachId: coach.id, slug: coach.slug, kind: 'status_divergence', detail: `flow=${snap.status} db=${dbStatus}` })
                await admin.from('admin_audit_logs').insert({
                    admin_email: 'cron',
                    action: 'coach.flow_status_divergence',
                    target_table: 'coaches',
                    target_id: coach.id,
                    payload: { coach_slug: coach.slug, flow_status: snap.status, db_status: dbStatus, flow_subscription_id: subId, triggered_by: 'cron/flow-reconcile' },
                })
            }

            // (2) PERIODO no avanzado: Flow activo + period_end de Flow POSTERIOR al de EVA = cobro no
            // notificado (webhook perdido). ALERTA (no auto-fix): el coach pago y su acceso quedaria corto.
            const flowPeriodEnd = snap.auto_recurring?.end_date ?? null
            if (flowIsActive && isLater(flowPeriodEnd, coach.current_period_end)) {
                divergences.push({ coachId: coach.id, slug: coach.slug, kind: 'period_not_advanced', detail: `flow_period_end=${flowPeriodEnd} db_period_end=${coach.current_period_end}` })
                await admin.from('admin_audit_logs').insert({
                    admin_email: 'cron',
                    action: 'coach.flow_period_not_advanced',
                    target_table: 'coaches',
                    target_id: coach.id,
                    payload: { coach_slug: coach.slug, flow_period_end: flowPeriodEnd, db_period_end: coach.current_period_end, flow_subscription_id: subId, triggered_by: 'cron/flow-reconcile' },
                })
            }

            // (3) DRIFT de monto (B4, ALERT-ONLY, barato): Flow hornea el monto en el planId
            // (`eva_<tier>_<cycle>_<amount>`). Comparamos ese monto contra el compuesto ESPERADO de la DB
            // (base + add-ons vivos − cupon). Si difieren → ALERTA (sin auto-fix): puede ser el window de un
            // downgrade DIFERIDO (regla 4 Flow: la baja del monto se aplica al corte via cron mp-reconcile),
            // un webhook perdido, o drift real. La correccion la hace el expiry pass de mp-reconcile / soporte.
            const planAmount = parseFlowPlanAmount(coach.provider_plan_id)
            if (flowIsActive && planAmount != null) {
                const tier = (coach.subscription_tier ?? 'starter') as SubscriptionTier
                const cycle = (coach.billing_cycle ?? 'monthly') as BillingCycle
                const live = await listLive(admin, coach.id)
                const couponSpec = await resolveDiscountSpecByRedemptionId(admin, coach.active_coupon_redemption_id)
                const expectedClp = getCompositeAmountClp(tier, cycle, toBillableAddons(live), couponSpec).totalClp
                if (planAmount !== expectedClp) {
                    // U6/U7 — ESCRITOR ÚNICO del compuesto Flow: el drift pasa de ALERT-ONLY a SYNC ACOTADO.
                    // El webhook ya NO hace el changePlan-UP inmediato del cupón-expira y redeem-coupon Flow
                    // DIFIERE el descuento aquí → el cron es quien MATERIALIZA el ajuste de monto por cupón
                    // (aplicar/expirar) antes de la próxima renovación. `updateCheckoutAmount` = ensure-plan
                    // + changePlan al compuesto esperado. Acotado (money-safety, "sin overcharge/crédito
                    // indebido"):
                    //   (1) `expected` COBRABLE (Flow rechaza <= 0; un 100%-off va por admin_grant, no acá);
                    //   (2) NO estar en la ventana de un downgrade DIFERIDO (add-on cancel_pending por vencer):
                    //       esa baja la aplica mp-reconcile AL CORTE — sincronizarla antes bajaría el plan y
                    //       Flow ACREDITARÍA el ciclo ya cobrado (crédito indebido). En ese caso se deja ALERTA.
                    const nowMs = Date.now()
                    const hasDeferredDowngrade = live.some(
                        (a) => a.status === 'cancel_pending' && a.expiresAt && new Date(a.expiresAt).getTime() > nowMs
                    )
                    const canSync = isChargeableNetClp(expectedClp) && !hasDeferredDowngrade
                    if (canSync) {
                        try {
                            await provider.updateCheckoutAmount(subId, expectedClp)
                            // U17: FlowProvider.changeSubscriptionPlan ya refresca coaches.provider_plan_id al
                            // planId nuevo → la próxima corrida no vuelve a ver este drift (sin alerta en falso).
                            await admin.from('admin_audit_logs').insert({
                                admin_email: 'cron',
                                action: 'coach.flow_composite_synced',
                                target_table: 'coaches',
                                target_id: coach.id,
                                payload: { coach_slug: coach.slug, old_amount_clp: planAmount, new_amount_clp: expectedClp, reason: 'coupon/addon drift', provider_plan_id: coach.provider_plan_id, flow_subscription_id: subId, triggered_by: 'cron/flow-reconcile' },
                            })
                        } catch (syncErr) {
                            // El SYNC falló → mantener la ALERTA (comportamiento anterior) para revisión manual.
                            console.error(`[cron/flow-reconcile] composite sync failed for coach ${coach.slug}:`, syncErr)
                            divergences.push({ coachId: coach.id, slug: coach.slug, kind: 'amount_drift', detail: `plan=${planAmount} esperado=${expectedClp}` })
                            await admin.from('admin_audit_logs').insert({
                                admin_email: 'cron',
                                action: 'coach.flow_amount_drift',
                                target_table: 'coaches',
                                target_id: coach.id,
                                payload: { coach_slug: coach.slug, plan_amount_clp: planAmount, expected_clp: expectedClp, provider_plan_id: coach.provider_plan_id, flow_subscription_id: subId, triggered_by: 'cron/flow-reconcile', sync_error: true },
                            })
                        }
                    } else {
                        // No sincronizable (expected no cobrable, o downgrade diferido en curso) → ALERTA como antes.
                        divergences.push({ coachId: coach.id, slug: coach.slug, kind: 'amount_drift', detail: `plan=${planAmount} esperado=${expectedClp}` })
                        await admin.from('admin_audit_logs').insert({
                            admin_email: 'cron',
                            action: 'coach.flow_amount_drift',
                            target_table: 'coaches',
                            target_id: coach.id,
                            payload: { coach_slug: coach.slug, plan_amount_clp: planAmount, expected_clp: expectedClp, provider_plan_id: coach.provider_plan_id, flow_subscription_id: subId, triggered_by: 'cron/flow-reconcile' },
                        })
                    }
                }
            }

            checked++
        } catch (err) {
            console.error(`[cron/flow-reconcile] failed for coach ${coach.slug}:`, err)
            errors++
        }
    }

    console.info(`[cron/flow-reconcile] done — checked=${checked} divergences=${divergences.length} errors=${errors}`)
    return NextResponse.json({ ok: true, checked, divergences: divergences.length, errors })
}
