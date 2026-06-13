import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import { wrapEmailLayout, ctaButton } from '@/lib/email/base-layout'

// ARCHIVADO 2026-06: sin cron en vercel.json — ver docs/plans/estrategia/01-PLAN-archivado-enterprise.md
function isAuthorized(req: Request) {
    const expected = process.env.CRON_SECRET
    if (!expected) return false
    const auth = req.headers.get('authorization') ?? ''
    return auth === `Bearer ${expected}`
}

function buildPaymentReminderEmail({
    orgName,
    adminName,
    amount,
    dayOfMonth,
    orgUrl,
}: {
    orgName: string
    adminName: string
    amount: number
    dayOfMonth: number
    orgUrl: string
}) {
    const isFinal = dayOfMonth >= 11
    const subject = isFinal
        ? `[Urgente] Pago pendiente — ${orgName}`
        : `Recordatorio de pago — ${orgName}`

    const urgencyNote = isFinal
        ? `<p style="margin:0 0 16px;padding:12px 16px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:14px;color:#991b1b;font-weight:600;">
             ⚠️ Tu plan podría ser suspendido si el pago no se recibe antes del día 15.
           </p>`
        : ''

    const body = `
<h1 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#111827;">
    Hola ${adminName},
</h1>
<p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.6;">
    Tienes un pago pendiente para el plan enterprise de <strong>${orgName}</strong>.
</p>
${urgencyNote}
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:24px;background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;">
    <tr>
        <td>
            <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#6b7280;letter-spacing:0.8px;text-transform:uppercase;">Detalle del pago</p>
            <p style="margin:0;font-size:24px;font-weight:900;color:#111827;">$${amount.toLocaleString('es-CL')} CLP</p>
            <p style="margin:4px 0 0;font-size:12px;color:#6b7280;">Transferencia o link de pago</p>
        </td>
    </tr>
</table>
<p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">
    Para pagar, usa el link que te enviamos al contratar el plan, o responde a este correo para coordinar.
</p>
${ctaButton('Ver mi panel →', orgUrl)}
`

    const html = wrapEmailLayout(body, {
        headerTitle: 'EVA Enterprise',
        previewText: `Pago pendiente — ${orgName}`,
    })

    return { subject, html }
}

export async function GET(req: Request) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createServiceRoleClient()
    const now = new Date()
    const dayOfMonth = now.getDate()
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eva-app.cl'

    // Find orgs with pending invoices for current month
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()

    const { data: pendingInvoices, error } = await admin
        .from('org_invoices')
        .select('id, org_id, amount_clp, period_start, period_end, status')
        .is('paid_at', null)
        .not('status', 'eq', 'cancelled')
        .gte('period_start', monthStart)
        .lte('period_start', monthEnd)

    if (error) {
        console.error('[cron/payment-reminder] query failed:', error)
        return NextResponse.json({ ok: false, error: 'DB query failed' }, { status: 500 })
    }

    let sent = 0
    let errors = 0

    for (const invoice of pendingInvoices ?? []) {
        try {
            // Get org info
            const { data: org } = await admin
                .from('organizations')
                .select('id, name, slug')
                .eq('id', invoice.org_id)
                .maybeSingle()
            if (!org) continue

            // Get org owners/admins
            const { data: admins } = await admin
                .from('organization_members')
                .select('user_id')
                .eq('org_id', org.id)
                .in('role', ['org_owner', 'org_admin'])
                .eq('status', 'active')
                .is('deleted_at', null)

            for (const member of admins ?? []) {
                const { data: authUser } = await admin.auth.admin.getUserById(member.user_id)
                const email = authUser.user?.email
                if (!email) continue

                const adminName = authUser.user?.user_metadata?.full_name ?? 'Administrador'
                const { subject, html } = buildPaymentReminderEmail({
                    orgName: org.name,
                    adminName,
                    amount: invoice.amount_clp,
                    dayOfMonth,
                    orgUrl: `${siteUrl}/org/${org.slug}`,
                })

                await sendTransactionalEmail({ to: email, subject, html })
            }

            // Log reminder sent
            await admin.from('admin_audit_logs').insert({
                admin_email: 'cron',
                action: 'org.payment_reminder_sent',
                target_table: 'org_invoices',
                target_id: invoice.id,
                payload: { org_id: org.id, day_of_month: dayOfMonth, triggered_by: 'cron/payment-reminder' },
            })

            sent++
        } catch (err) {
            console.error(`[cron/payment-reminder] failed for invoice ${invoice.id}:`, err)
            errors++
        }
    }

    console.info(`[cron/payment-reminder] done — sent=${sent} errors=${errors}`)
    return NextResponse.json({ ok: true, sent, errors })
}
