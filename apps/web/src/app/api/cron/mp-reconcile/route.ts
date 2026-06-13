import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import { wrapEmailLayout } from '@/lib/email/base-layout'

function isAuthorized(req: Request) {
    const expected = process.env.CRON_SECRET
    if (!expected) return false
    const auth = req.headers.get('authorization') ?? ''
    return auth === `Bearer ${expected}`
}

async function fetchMpPreapproval(preapprovalId: string, accessToken: string) {
    const res = await fetch(`https://api.mercadopago.com/preapproval/${preapprovalId}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return null
    return res.json() as Promise<{ status?: string; id?: string }>
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
        .select('id, slug, subscription_status, subscription_mp_id')
        .not('subscription_mp_id', 'is', null)
        .not('subscription_status', 'eq', 'free')
        .not('subscription_status', 'eq', 'org_managed')
        .not('subscription_status', 'eq', 'team_managed')

    if (error) {
        console.error('[cron/mp-reconcile] query failed:', error)
        return NextResponse.json({ ok: false, error: 'DB query failed' }, { status: 500 })
    }

    const divergences: { coachId: string; slug: string; dbStatus: string; mpStatus: string }[] = []
    let checked = 0
    let errors = 0

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

    // Email to ADMIN_EMAILS if divergences found
    if (divergences.length > 0) {
        const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim()).filter(Boolean)
        const rows = divergences
            .map(d => `<tr>
                <td style="padding:6px 8px;font-size:13px;color:#374151;">${d.slug}</td>
                <td style="padding:6px 8px;font-size:13px;color:#374151;">${d.dbStatus}</td>
                <td style="padding:6px 8px;font-size:13px;color:#dc2626;font-weight:600;">${d.mpStatus}</td>
            </tr>`)
            .join('')

        const body = `
<h1 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#111827;">⚠️ Divergencias MP Detectadas</h1>
<p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">
    El cron de reconciliación encontró <strong>${divergences.length}</strong> divergencia(s) entre el estado en DB y en MercadoPago.
    <strong>No se realizó ninguna acción automática</strong> — requiere revisión manual.
</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin-bottom:24px;">
    <tr style="background-color:#f9fafb;">
        <th style="padding:8px;font-size:12px;font-weight:700;color:#6b7280;text-align:left;text-transform:uppercase;letter-spacing:0.8px;">Coach</th>
        <th style="padding:8px;font-size:12px;font-weight:700;color:#6b7280;text-align:left;text-transform:uppercase;letter-spacing:0.8px;">Estado DB</th>
        <th style="padding:8px;font-size:12px;font-weight:700;color:#6b7280;text-align:left;text-transform:uppercase;letter-spacing:0.8px;">Estado MP</th>
    </tr>
    ${rows}
</table>
<p style="margin:0;font-size:13px;color:#6b7280;">También hay <strong>${overdueInvoices?.length ?? 0}</strong> factura(s) enterprise vencida(s) de más de 10 días. Ver admin panel.</p>
`
        const html = wrapEmailLayout(body, {
            headerTitle: 'EVA Reconciliación',
            previewText: `${divergences.length} divergencia(s) MP — ${now.toISOString().slice(0, 10)}`,
        })
        const subject = `[EVA] ${divergences.length} divergencia(s) MercadoPago — ${now.toISOString().slice(0, 10)}`

        for (const email of adminEmails) {
            await sendTransactionalEmail({ to: email, subject, html }).catch(e =>
                console.error(`[cron/mp-reconcile] email to ${email} failed:`, e)
            )
        }
    }

    console.info(`[cron/mp-reconcile] done — checked=${checked} divergences=${divergences.length} errors=${errors}`)
    return NextResponse.json({ ok: true, checked, divergences: divergences.length, overdue: overdueInvoices?.length ?? 0, errors })
}
