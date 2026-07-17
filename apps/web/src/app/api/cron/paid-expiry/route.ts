import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import { wrapEmailLayout } from '@/lib/email/base-layout'
import { getPaymentsProviderForCoach } from '@/lib/payments/provider'
import { mapProviderStatus } from '@/lib/payments/subscription-state'
import { ProviderRequestError } from '@/lib/payments/provider-error'
import { resolvePaidExpiryDecision, type RemoteVerification } from '@/lib/payments/paid-expiry'
import { cancelAllForCoach } from '@/infrastructure/db/coach-addons.repository'
import { revertActiveCouponForCoach } from '@/services/billing/coupons.service'
import type { TablesInsert } from '@/lib/database.types'

/**
 * Cron BACKSTOP `paid-expiry` — expira suscripciones PAGAS con período vencido cuyo evento terminal
 * del gateway EVA nunca recibió por webhook ("webhook terminal perdido"). Caso real: la migración de
 * cuenta MercadoPago del 2026-07-05 canceló preapprovals POR API en la cuenta vieja = cancelación
 * out-of-band SIN notificación → el coach quedó con `subscription_status='active'` congelado y
 * `current_period_end` vencido → `hasEffectiveAccess` con 'active' nunca mira la fecha → Pro gratis
 * indefinido (fuga de revenue silenciosa; caso joaquinamr7 16-jul). Ni trial-expiry (solo 'trialing'),
 * ni mp/flow-reconcile (alert-only) lo bajan.
 *
 * DISEÑO PROVIDER-VERIFIED (no negociable): NUNCA se expira solo por la fecha — eso cortaría a un coach
 * que el gateway AÚN puede cobrar (dunning). Antes de expirar se verifica el estado REAL en el gateway
 * (preapproval MP / suscripción Flow) y se decide con la función pura `resolvePaidExpiryDecision`:
 *   1. Remota MUERTA (cancelled/rejected, o 404) → EXPIRE.
 *   2. DB 'canceled' sin id de suscripción → EXPIRE.
 *   3. Remota VIVA (authorized/active/pending/paused) → ALERT-ONLY (nulear el id rompería el matching
 *      del webhook de recuperación del dunning = cobro real perdido).
 *   4. Error transitorio / 'active' sin id verificable → ALERT-ONLY (fail-safe).
 *
 * Excluye a propósito: `payment_provider` admin/beta/internal (comps y cortesías manuales) y statuses
 * org_managed/team_managed/expired/pending_payment. Gracia de 24h aplicada en la query.
 *
 * Fail-closed por `CRON_SECRET` (un endpoint que muta estado de cobro no puede quedar expuesto).
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

type CandidateCoach = {
    id: string
    slug: string
    subscription_status: string
    subscription_provider: string | null
    subscription_mp_id: string | null
    subscription_provider_external_id: string | null
}

/**
 * Verifica el estado REAL de la suscripción en el gateway. Reusa `fetchCheckoutSnapshot` del puerto
 * (MP: GET /preapproval; Flow: subscription/get) y clasifica el error tipado `ProviderRequestError`:
 * 404 → suscripción muerta (`not_found`); cualquier otro fallo → transitorio (`error`, fail-safe).
 */
async function verifyRemote(coach: CandidateCoach): Promise<RemoteVerification> {
    const provider = getPaymentsProviderForCoach(coach)
    const subId =
        provider.name === 'flow'
            ? coach.subscription_provider_external_id
            : coach.subscription_mp_id
    if (!subId) return { kind: 'no_sub_id' }

    try {
        const snap = await provider.fetchCheckoutSnapshot(subId)
        return { kind: 'status', mappedStatus: mapProviderStatus(snap.status) }
    } catch (err) {
        if (err instanceof ProviderRequestError && err.isNotFound) {
            return { kind: 'not_found' }
        }
        throw err
    }
}

/** Nombre de la columna del id de suscripción a nulear según el gateway del coach. */
function providerIdColumn(coach: CandidateCoach): 'subscription_mp_id' | 'subscription_provider_external_id' {
    return coach.subscription_provider === 'flow'
        ? 'subscription_provider_external_id'
        : 'subscription_mp_id'
}

/**
 * Acción EXPIRE — espejo del terminal del webhook (`webhook-pipeline.ts` §terminal). Bloquea al coach
 * (status='expired', current_period_end=null) y nulea SOLO el id del provider correspondiente;
 * PRESERVA subscription_tier / max_clients / billing_cycle (la página de reactivación pre-selecciona
 * el plan). Cancela los add-ons vivos (trigger D1 apaga los módulos) y revierte el cupón vivo. Reusa
 * los MISMOS helpers que el webhook — no duplica lógica de add-ons/cupón.
 */
async function expireCoach(
    admin: ReturnType<typeof createServiceRoleClient>,
    coach: CandidateCoach,
    reason: string,
    nowIso: string
): Promise<{ addonsCancelled: number; couponReverted: boolean }> {
    const idCol = providerIdColumn(coach)
    const update: Record<string, unknown> = {
        subscription_status: 'expired',
        current_period_end: null,
        [idCol]: null,
    }
    const { error: updateErr } = await admin.from('coaches').update(update).eq('id', coach.id)
    if (updateErr) throw new Error(`expireCoach update failed: ${updateErr.message}`)

    // Reusa los helpers del terminal del webhook (cancelAllForCoach + revertActiveCouponForCoach).
    const addonsCancelled = await cancelAllForCoach(admin, coach.id, nowIso)
    const { reverted: couponReverted } = await revertActiveCouponForCoach(admin, coach.id)

    const auditRow: TablesInsert<'admin_audit_logs'> = {
        admin_email: 'cron',
        action: 'coach.paid_expired_auto',
        target_table: 'coaches',
        target_id: coach.id,
        payload: {
            coach_slug: coach.slug,
            previous_status: coach.subscription_status,
            payment_provider: coach.subscription_provider,
            reason,
            addons_cancelled: addonsCancelled,
            coupon_reverted: couponReverted,
            triggered_by: 'cron/paid-expiry',
        },
    }
    await admin.from('admin_audit_logs').insert(auditRow)

    return { addonsCancelled, couponReverted }
}

export async function GET(req: Request) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createServiceRoleClient()
    const now = new Date()
    const nowIso = now.toISOString()
    // Gracia de 24h: solo candidatos cuyo período venció hace MÁS de un día (evita cortar en el borde
    // de una renovación cuyo webhook está en vuelo).
    const graceCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

    // Candidatos: coaches PAGOS (payment_provider mp/flow — excluye comps admin/beta/internal) con un
    // estado que conserva acceso por gracia (active/canceled/past_due/paused) y período YA vencido.
    const { data: candidates, error } = await admin
        .from('coaches')
        .select(
            'id, slug, subscription_status, subscription_provider, subscription_mp_id, subscription_provider_external_id'
        )
        .in('payment_provider', ['mercadopago', 'flow'])
        .in('subscription_status', ['active', 'canceled', 'past_due', 'paused'])
        .not('current_period_end', 'is', null)
        .lt('current_period_end', graceCutoff)

    if (error) {
        console.error('[cron/paid-expiry] candidate query failed:', error)
        return NextResponse.json({ ok: false, error: 'DB query failed' }, { status: 500 })
    }

    let expired = 0
    let errors = 0
    const alerts: { slug: string; dbStatus: string; reason: string }[] = []
    const expiredList: { slug: string; reason: string }[] = []
    const errorList: { slug: string; message: string }[] = []

    for (const coach of (candidates ?? []) as CandidateCoach[]) {
        try {
            const remote = await verifyRemote(coach)
            const decision = resolvePaidExpiryDecision({
                dbStatus: coach.subscription_status,
                remote,
            })

            if (decision.action === 'expire') {
                await expireCoach(admin, coach, decision.reason, nowIso)
                expired++
                expiredList.push({ slug: coach.slug, reason: decision.reason })
            } else {
                alerts.push({ slug: coach.slug, dbStatus: coach.subscription_status, reason: decision.reason })
                await admin.from('admin_audit_logs').insert({
                    admin_email: 'cron',
                    action: 'coach.paid_expiry_alert',
                    target_table: 'coaches',
                    target_id: coach.id,
                    payload: {
                        coach_slug: coach.slug,
                        db_status: coach.subscription_status,
                        reason: decision.reason,
                        triggered_by: 'cron/paid-expiry',
                    },
                })
            }
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            console.error(`[cron/paid-expiry] failed for coach ${coach.slug}:`, message)
            errors++
            errorList.push({ slug: coach.slug, message })
        }
    }

    // Resumen de la corrida en auditoría (siempre, aunque no haya nada — traza de que corrió).
    await admin.from('admin_audit_logs').insert({
        admin_email: 'cron',
        action: 'cron.paid_expiry_ran',
        target_table: 'coaches',
        target_id: null,
        payload: { candidates: candidates?.length ?? 0, expired, alerts: alerts.length, errors },
    })

    // Email a ADMIN_EMAILS si hubo expirados, alertas o errores (evidencia + revisión manual).
    if (expired > 0 || alerts.length > 0 || errors > 0) {
        const adminEmails = (process.env.ADMIN_EMAILS ?? '')
            .split(',')
            .map((e) => e.trim())
            .filter(Boolean)

        if (adminEmails.length > 0) {
            const expiredRows = expiredList
                .map(
                    (e) => `<tr>
                <td style="padding:6px 8px;font-size:13px;color:#374151;">${e.slug}</td>
                <td style="padding:6px 8px;font-size:13px;color:#dc2626;font-weight:600;">${e.reason}</td>
            </tr>`
                )
                .join('')
            const expiredBlock =
                expiredList.length > 0
                    ? `
<h2 style="margin:0 0 8px;font-size:16px;font-weight:700;color:#111827;">Expirados (${expiredList.length})</h2>
<p style="margin:0 0 12px;font-size:13px;color:#6b7280;">Suscripción muerta en el gateway y período vencido → status 'expired'.</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin-bottom:24px;">
    <tr style="background-color:#f9fafb;">
        <th style="padding:8px;font-size:12px;font-weight:700;color:#6b7280;text-align:left;text-transform:uppercase;letter-spacing:0.8px;">Coach</th>
        <th style="padding:8px;font-size:12px;font-weight:700;color:#6b7280;text-align:left;text-transform:uppercase;letter-spacing:0.8px;">Razón</th>
    </tr>
    ${expiredRows}
</table>`
                    : ''

            const alertRows = alerts
                .map(
                    (a) => `<tr>
                <td style="padding:6px 8px;font-size:13px;color:#374151;">${a.slug}</td>
                <td style="padding:6px 8px;font-size:13px;color:#374151;">${a.dbStatus}</td>
                <td style="padding:6px 8px;font-size:13px;color:#b45309;font-weight:600;">${a.reason}</td>
            </tr>`
                )
                .join('')
            const alertBlock =
                alerts.length > 0
                    ? `
<h2 style="margin:0 0 8px;font-size:16px;font-weight:700;color:#111827;">Alertas — sin acción (${alerts.length})</h2>
<p style="margin:0 0 12px;font-size:13px;color:#6b7280;">Período vencido pero NO se expiró (gateway aún puede cobrar, o verificación indeterminada). Revisar manualmente.</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin-bottom:24px;">
    <tr style="background-color:#f9fafb;">
        <th style="padding:8px;font-size:12px;font-weight:700;color:#6b7280;text-align:left;text-transform:uppercase;letter-spacing:0.8px;">Coach</th>
        <th style="padding:8px;font-size:12px;font-weight:700;color:#6b7280;text-align:left;text-transform:uppercase;letter-spacing:0.8px;">Estado DB</th>
        <th style="padding:8px;font-size:12px;font-weight:700;color:#6b7280;text-align:left;text-transform:uppercase;letter-spacing:0.8px;">Razón</th>
    </tr>
    ${alertRows}
</table>`
                    : ''

            const errorBlock =
                errorList.length > 0
                    ? `<p style="margin:0 0 16px;font-size:13px;color:#dc2626;"><strong>${errorList.length}</strong> coach(es) con error de verificación (ver logs): ${errorList
                          .map((e) => e.slug)
                          .join(', ')}.</p>`
                    : ''

            const body = `
<h1 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#111827;">⚠️ Backstop de suscripciones pagas</h1>
<p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">
    El cron <strong>paid-expiry</strong> revisó ${candidates?.length ?? 0} candidato(s) con período vencido:
    <strong>${expired}</strong> expirado(s), <strong>${alerts.length}</strong> alertado(s), <strong>${errors}</strong> error(es).
</p>
${expiredBlock}
${alertBlock}
${errorBlock}`
            const html = wrapEmailLayout(body, {
                headerTitle: 'EVA Backstop pagos',
                previewText: `${expired} expirado(s), ${alerts.length} alerta(s) — ${nowIso.slice(0, 10)}`,
            })
            const subject = `[EVA] paid-expiry: ${expired} expirado(s), ${alerts.length} alerta(s) — ${nowIso.slice(0, 10)}`

            for (const email of adminEmails) {
                await sendTransactionalEmail({ to: email, subject, html }).catch((e) =>
                    console.error(`[cron/paid-expiry] email to ${email} failed:`, e)
                )
            }
        }
    }

    console.info(
        `[cron/paid-expiry] done — candidates=${candidates?.length ?? 0} expired=${expired} alerts=${alerts.length} errors=${errors}`
    )
    return NextResponse.json({
        ok: true,
        candidates: candidates?.length ?? 0,
        expired,
        alerts: alerts.length,
        errors,
    })
}
