import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import { wrapEmailLayout } from '@/lib/email/base-layout'
import { isModuleKilledByOperator, type ModuleKey } from '@/services/entitlements.service'
import { applyExpiry, listLive } from '@/infrastructure/db/coach-addons.repository'
import {
    getCompositeAmountClp,
    toBillableAddons,
} from '@/services/billing/addons.service'
import { resolveDiscountSpecByRedemptionId } from '@/services/billing/discount.service'
import type { BillingCycle, SubscriptionTier } from '@/lib/constants'

// IMPORTANTE (plan 01 F7): el guard de este cron quedó FAIL-CLOSED — sin CRON_SECRET devuelve
// 401. NO relajar: un endpoint de reconciliación expuesto deja leer/disparar estado de cobro.
function isAuthorized(req: Request) {
    const expected = process.env.CRON_SECRET
    if (!expected) return false
    const auth = req.headers.get('authorization') ?? ''
    // Constant-time compare to avoid leaking the secret via early-exit timing (FIX-6).
    // timingSafeEqual throws on unequal-length buffers, so guard length first.
    const expectedHeader = `Bearer ${expected}`
    const authBuf = Buffer.from(auth, 'utf8')
    const expectedBuf = Buffer.from(expectedHeader, 'utf8')
    if (authBuf.length !== expectedBuf.length) return false
    return timingSafeEqual(authBuf, expectedBuf)
}

// Días por defecto de las alertas semiautomáticas (mejora F3.5). Fijados en RUNBOOK.
const KILL_SWITCH_ALERT_DAYS = 3
const PAUSED_ALERT_DAYS = 14

type MpPreapproval = {
    status?: string
    id?: string
    date_created?: string
    auto_recurring?: { transaction_amount?: number | null }
}

async function fetchMpPreapproval(preapprovalId: string, accessToken: string) {
    // P1-5: con token TEST- hay que mandar `X-scope: stage` (igual que buildMpHeaders del provider),
    // si no el GET en Preview vuelve null/stale → el reconcile cuenta errors y queda CIEGO en test (es
    // la única red de seguridad cuando MP no entrega webhooks en modo test).
    const headers: Record<string, string> = { Authorization: `Bearer ${accessToken}` }
    if (accessToken.startsWith('TEST-')) headers['X-scope'] = 'stage'
    const res = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, { headers })
    if (!res.ok) return null
    return res.json() as Promise<MpPreapproval>
}

type AdminClient = ReturnType<typeof createServiceRoleClient>

/**
 * Días desde la PRIMERA detección de kill-switch facturado para (coach, módulo). Lee el primer
 * `coach.addon_killswitch_billed` previo en admin_audit_logs (el reconcile inserta uno cada pasada);
 * si no hay, es la primera detección → 0 días. Mide el lapso para no avisar el día 1 (umbral N días).
 */
async function daysSinceFirstKillSwitchDetection(
    admin: AdminClient,
    coachId: string,
    moduleKey: ModuleKey,
    now: Date
): Promise<number> {
    const { data } = await admin
        .from('admin_audit_logs')
        .select('created_at, payload')
        .eq('action', 'coach.addon_killswitch_billed')
        .eq('target_id', coachId)
        .order('created_at', { ascending: true })
        .limit(50)
    const first = (data ?? []).find(
        (r) => (r.payload as { module_key?: string } | null)?.module_key === moduleKey
    )
    if (!first?.created_at) return 0
    return Math.floor((now.getTime() - new Date(first.created_at).getTime()) / (24 * 60 * 60 * 1000))
}

/** Días desde la primera detección de preapproval `paused` con add-ons (mismo patrón que el kill-switch). */
async function daysSinceFirstPausedDetection(
    admin: AdminClient,
    coachId: string,
    now: Date
): Promise<number> {
    const { data } = await admin
        .from('admin_audit_logs')
        .select('created_at')
        .eq('action', 'coach.preapproval_paused_with_addons')
        .eq('target_id', coachId)
        .order('created_at', { ascending: true })
        .limit(1)
    const first = (data ?? [])[0]
    if (!first?.created_at) return 0
    return Math.floor((now.getTime() - new Date(first.created_at).getTime()) / (24 * 60 * 60 * 1000))
}

export async function GET(req: Request) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN
    if (!mpToken) {
        return NextResponse.json({ ok: false, error: 'MERCADOPAGO_ACCESS_TOKEN not set' }, { status: 500 })
    }

    const admin = createServiceRoleClient()
    const now = new Date()

    // Get coaches with MP subscription IDs
    const { data: coaches, error } = await admin
        .from('coaches')
        .select('id, slug, subscription_status, subscription_tier, billing_cycle, current_period_end, subscription_mp_id, active_coupon_redemption_id')
        .not('subscription_mp_id', 'is', null)
        .not('subscription_status', 'eq', 'free')
        .not('subscription_status', 'eq', 'org_managed')
        .not('subscription_status', 'eq', 'team_managed')

    if (error) {
        console.error('[cron/mp-reconcile] query failed:', error)
        return NextResponse.json({ ok: false, error: 'DB query failed' }, { status: 500 })
    }

    const divergences: { coachId: string; slug: string; dbStatus: string; mpStatus: string }[] = []
    // Alertas de la pasada de add-ons (mejora F3.5) — se reportan en el mismo email.
    const addonAlerts: { coachId: string; slug: string; kind: string; detail: string }[] = []
    let checked = 0
    let errors = 0
    let addonsExpired = 0

    // NOTA DE ESCALABILIDAD (mejora F3.5): la pasada es SECUENCIAL por coach mientras sean decenas.
    // Cuando duela (cientos de coaches pagos), batchear las llamadas MP con Promise.allSettled en
    // lotes de 10. Sin colas ni servicios nuevos — solo el cambio de bucle.
    for (const coach of coaches ?? []) {
        if (!coach.subscription_mp_id) continue
        try {
            const mpData = await fetchMpPreapproval(coach.subscription_mp_id, mpToken)
            if (!mpData) {
                console.warn(`[cron/mp-reconcile] MP returned null for coach ${coach.slug}`)
                errors++
                continue
            }

            const mpStatus = mpData.status ?? 'unknown'
            const dbStatus = coach.subscription_status

            // Map MP status to our status for comparison
            const mpIsActive = mpStatus === 'authorized'
            const dbIsActive = dbStatus === 'active'

            if (mpIsActive !== dbIsActive) {
                divergences.push({ coachId: coach.id, slug: coach.slug, dbStatus, mpStatus })

                await admin.from('admin_audit_logs').insert({
                    admin_email: 'cron',
                    action: 'coach.mp_status_divergence',
                    target_table: 'coaches',
                    target_id: coach.id,
                    payload: {
                        coach_slug: coach.slug,
                        db_status: dbStatus,
                        mp_status: mpStatus,
                        mp_preapproval_id: coach.subscription_mp_id,
                        triggered_by: 'cron/mp-reconcile',
                    },
                })
            }

            // ── Pasada de ADD-ONS (plan 05 F3.5) — la DB manda, MP solo se ALERTA (nunca auto-fix) ──
            const tier = (coach.subscription_tier ?? 'starter') as SubscriptionTier
            const cycle = (coach.billing_cycle ?? 'monthly') as BillingCycle
            const live = await listLive(admin, coach.id)

            // (a) cancel_pending con expires_at <= now → applyExpiry (cancelled; trigger D1 apaga).
            for (const addon of live) {
                if (
                    addon.status === 'cancel_pending' &&
                    addon.expiresAt &&
                    new Date(addon.expiresAt).getTime() <= now.getTime()
                ) {
                    const expired = await applyExpiry(admin, addon.id, now.toISOString())
                    if (expired) {
                        addonsExpired++
                        await admin.from('admin_audit_logs').insert({
                            admin_email: 'cron',
                            action: 'coach.addon_expired',
                            target_table: 'coach_addons',
                            target_id: addon.id,
                            payload: {
                                coach_slug: coach.slug,
                                module_key: addon.moduleKey,
                                expires_at: addon.expiresAt,
                                triggered_by: 'cron/mp-reconcile',
                            },
                        })
                    }
                }
            }

            // (b) cancel_pending YA cobrado sin PUT aplicado (reintento del caso webhook caído): si la
            // baja regla 4 quedó facturable en MP (drift detecta el monto), se reporta como drift (c).

            // (c) Drift de monto: comparar el monto vigente del preapproval contra el compuesto esperado.
            // F2a.2b: el esperado incluye el descuento vivo (resuelto desde active_coupon_redemption_id
            // del SELECT) → el preapproval con cupón NO se reporta como drift falso.
            const couponSpec = await resolveDiscountSpecByRedemptionId(admin, coach.active_coupon_redemption_id)
            const expectedClp = getCompositeAmountClp(tier, cycle, toBillableAddons(live), couponSpec).totalClp
            const mpAmount = mpData.auto_recurring?.transaction_amount
            if (mpIsActive && typeof mpAmount === 'number' && mpAmount !== expectedClp) {
                addonAlerts.push({
                    coachId: coach.id,
                    slug: coach.slug,
                    kind: 'amount_drift',
                    detail: `MP=$${mpAmount} esperado=$${expectedClp}`,
                })
                await admin.from('admin_audit_logs').insert({
                    admin_email: 'cron',
                    action: 'coach.addon_amount_drift',
                    target_table: 'coaches',
                    target_id: coach.id,
                    payload: {
                        coach_slug: coach.slug,
                        mp_amount_clp: mpAmount,
                        expected_clp: expectedClp,
                        mp_preapproval_id: coach.subscription_mp_id,
                        triggered_by: 'cron/mp-reconcile',
                    },
                })
            }

            // (d) Kill-switch prolongado: add-on FACTURABLE cuyo módulo está en EVA_DISABLED_MODULES.
            // Cobrar un módulo apagado por el operador es exposición SERNAC directa (Riesgo 4). La
            // primera detección se persiste en admin_audit_logs; el reaviso mide el lapso desde la 1ª.
            const billableKilled = toBillableAddons(live)
                .map((a) => a.moduleKey)
                .filter((k: ModuleKey) => isModuleKilledByOperator(k))
            for (const moduleKey of billableKilled) {
                const sinceDays = await daysSinceFirstKillSwitchDetection(admin, coach.id, moduleKey, now)
                if (sinceDays >= KILL_SWITCH_ALERT_DAYS) {
                    addonAlerts.push({
                        coachId: coach.id,
                        slug: coach.slug,
                        kind: 'kill_switch_billed',
                        detail: `módulo ${moduleKey} apagado por operador hace ${sinceDays}d pero se sigue facturando`,
                    })
                }
                await admin.from('admin_audit_logs').insert({
                    admin_email: 'cron',
                    action: 'coach.addon_killswitch_billed',
                    target_table: 'coach_addons',
                    target_id: coach.id,
                    payload: {
                        coach_slug: coach.slug,
                        module_key: moduleKey,
                        days_since_first: sinceDays,
                        triggered_by: 'cron/mp-reconcile',
                    },
                })
            }

            // (e) paused prolongado (dunning de MP): preapproval en paused por más de N días → alerta
            // para aplicar la política de F3.6 (cancel_pending de los add-ons). Detección automática;
            // ejecución documentada/semiautomática en el RUNBOOK.
            if (mpStatus === 'paused' && live.length > 0) {
                const sinceDays = await daysSinceFirstPausedDetection(admin, coach.id, now)
                if (sinceDays >= PAUSED_ALERT_DAYS) {
                    addonAlerts.push({
                        coachId: coach.id,
                        slug: coach.slug,
                        kind: 'paused_prolonged',
                        detail: `preapproval paused hace ${sinceDays}d con ${live.length} add-on(s) vivos`,
                    })
                }
                await admin.from('admin_audit_logs').insert({
                    admin_email: 'cron',
                    action: 'coach.preapproval_paused_with_addons',
                    target_table: 'coaches',
                    target_id: coach.id,
                    payload: {
                        coach_slug: coach.slug,
                        days_since_first: sinceDays,
                        live_addons: live.length,
                        triggered_by: 'cron/mp-reconcile',
                    },
                })
            }

            checked++
        } catch (err) {
            console.error(`[cron/mp-reconcile] failed for coach ${coach.slug}:`, err)
            errors++
        }
    }

    // Also flag org_invoices pending > 10 days
    const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString()
    const { data: overdueInvoices } = await admin
        .from('org_invoices')
        .select('id, org_id, amount_clp, period_start')
        .is('paid_at', null)
        .not('status', 'eq', 'cancelled')
        .not('status', 'eq', 'paid')
        .lt('period_start', tenDaysAgo)

    for (const invoice of overdueInvoices ?? []) {
        await admin.from('admin_audit_logs').insert({
            admin_email: 'cron',
            action: 'org.invoice_overdue_verified',
            target_table: 'org_invoices',
            target_id: invoice.id,
            payload: {
                org_id: invoice.org_id,
                amount_clp: invoice.amount_clp,
                period_start: invoice.period_start,
                triggered_by: 'cron/mp-reconcile',
            },
        }).then(({ error: logErr }) => {
            if (logErr) console.error('[cron/mp-reconcile] overdue log failed:', logErr)
        })
    }

    // Email to ADMIN_EMAILS if divergences OR add-on alerts found (mejora F3.5: el mismo email).
    if (divergences.length > 0 || addonAlerts.length > 0) {
        const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim()).filter(Boolean)
        const rows = divergences
            .map(d => `<tr>
                <td style="padding:6px 8px;font-size:13px;color:#374151;">${d.slug}</td>
                <td style="padding:6px 8px;font-size:13px;color:#374151;">${d.dbStatus}</td>
                <td style="padding:6px 8px;font-size:13px;color:#dc2626;font-weight:600;">${d.mpStatus}</td>
            </tr>`)
            .join('')

        const divergenceBlock = divergences.length > 0 ? `
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin-bottom:24px;">
    <tr style="background-color:#f9fafb;">
        <th style="padding:8px;font-size:12px;font-weight:700;color:#6b7280;text-align:left;text-transform:uppercase;letter-spacing:0.8px;">Coach</th>
        <th style="padding:8px;font-size:12px;font-weight:700;color:#6b7280;text-align:left;text-transform:uppercase;letter-spacing:0.8px;">Estado DB</th>
        <th style="padding:8px;font-size:12px;font-weight:700;color:#6b7280;text-align:left;text-transform:uppercase;letter-spacing:0.8px;">Estado MP</th>
    </tr>
    ${rows}
</table>` : ''

        const addonRows = addonAlerts
            .map(a => `<tr>
                <td style="padding:6px 8px;font-size:13px;color:#374151;">${a.slug}</td>
                <td style="padding:6px 8px;font-size:13px;color:#b45309;font-weight:600;">${a.kind}</td>
                <td style="padding:6px 8px;font-size:13px;color:#374151;">${a.detail}</td>
            </tr>`)
            .join('')

        const addonBlock = addonAlerts.length > 0 ? `
<h2 style="margin:0 0 8px;font-size:16px;font-weight:700;color:#111827;">Alertas de add-ons (${addonAlerts.length})</h2>
<p style="margin:0 0 12px;font-size:13px;color:#6b7280;">Drift de monto, kill-switch facturado o preapproval pausado prolongado. Sin auto-fix — revisar según RUNBOOK.</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin-bottom:24px;">
    <tr style="background-color:#f9fafb;">
        <th style="padding:8px;font-size:12px;font-weight:700;color:#6b7280;text-align:left;text-transform:uppercase;letter-spacing:0.8px;">Coach</th>
        <th style="padding:8px;font-size:12px;font-weight:700;color:#6b7280;text-align:left;text-transform:uppercase;letter-spacing:0.8px;">Tipo</th>
        <th style="padding:8px;font-size:12px;font-weight:700;color:#6b7280;text-align:left;text-transform:uppercase;letter-spacing:0.8px;">Detalle</th>
    </tr>
    ${addonRows}
</table>` : ''

        const body = `
<h1 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#111827;">⚠️ Reconciliación MP</h1>
<p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">
    El cron de reconciliación encontró <strong>${divergences.length}</strong> divergencia(s) de estado y <strong>${addonAlerts.length}</strong> alerta(s) de add-ons.
    <strong>No se realizó ninguna acción automática</strong> — requiere revisión manual.
</p>
${divergenceBlock}
${addonBlock}
<p style="margin:0;font-size:13px;color:#6b7280;">También hay <strong>${overdueInvoices?.length ?? 0}</strong> factura(s) enterprise vencida(s) de más de 10 días. Ver admin panel.</p>
`
        const html = wrapEmailLayout(body, {
            headerTitle: 'EVA Reconciliación',
            previewText: `${divergences.length} divergencia(s) MP, ${addonAlerts.length} alerta(s) add-ons — ${now.toISOString().slice(0, 10)}`,
        })
        const subject = `[EVA] ${divergences.length} divergencia(s) + ${addonAlerts.length} alerta(s) add-ons — ${now.toISOString().slice(0, 10)}`

        for (const email of adminEmails) {
            await sendTransactionalEmail({ to: email, subject, html }).catch(e =>
                console.error(`[cron/mp-reconcile] email to ${email} failed:`, e)
            )
        }
    }

    console.info(
        `[cron/mp-reconcile] done — checked=${checked} divergences=${divergences.length} addonAlerts=${addonAlerts.length} addonsExpired=${addonsExpired} errors=${errors}`
    )
    return NextResponse.json({
        ok: true,
        checked,
        divergences: divergences.length,
        addonAlerts: addonAlerts.length,
        addonsExpired,
        overdue: overdueInvoices?.length ?? 0,
        errors,
    })
}
