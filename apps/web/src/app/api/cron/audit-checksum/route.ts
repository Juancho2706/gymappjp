import { NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import { wrapEmailLayout } from '@/lib/email/base-layout'

function isAuthorized(req: Request) {
    const expected = process.env.CRON_SECRET
    if (!expected) return true
    const auth = req.headers.get('authorization') ?? ''
    return auth === `Bearer ${expected}`
}

export async function GET(req: Request) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createServiceRoleClient()
    const now = new Date()
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    // Fetch last 7 days of audit logs, ordered deterministically
    const { data: logs, error } = await admin
        .from('org_audit_logs')
        .select('id, org_id, actor_id, action, target_type, target_id, created_at')
        .gte('created_at', weekStart.toISOString())
        .order('id', { ascending: true })

    if (error) {
        console.error('[cron/audit-checksum] query failed:', error)
        return NextResponse.json({ ok: false, error: 'DB query failed' }, { status: 500 })
    }

    const rows = logs ?? []
    const rowCount = rows.length
    const payload = JSON.stringify(rows)
    const checksum = createHash('sha256').update(payload).digest('hex')

    // Insert checksum record
    const { error: insertErr } = await admin
        .from('audit_log_checksums')
        .insert({
            week_start: weekStart.toISOString(),
            checksum,
            row_count: rowCount,
            generated_at: now.toISOString(),
        })

    if (insertErr) {
        console.error('[cron/audit-checksum] insert failed:', insertErr)
    }

    // Email to ADMIN_EMAILS
    const adminEmails = (process.env.ADMIN_EMAILS ?? '').split(',').map(e => e.trim()).filter(Boolean)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eva-app.cl'

    const subject = `[EVA] Checksum auditoría semanal — ${now.toISOString().slice(0, 10)}`
    const body = `
<h1 style="margin:0 0 8px;font-size:20px;font-weight:800;color:#111827;">Checksum de Auditoría Semanal</h1>
<p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.6;">
    Se generó el checksum SHA-256 del log de auditoría de los últimos 7 días.
</p>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-bottom:20px;background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;">
    <tr>
        <td>
            <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:#6b7280;letter-spacing:0.8px;text-transform:uppercase;">Detalle</p>
            <p style="margin:0 0 4px;font-size:13px;color:#374151;"><strong>Período:</strong> ${weekStart.toISOString().slice(0, 10)} → ${now.toISOString().slice(0, 10)}</p>
            <p style="margin:0 0 4px;font-size:13px;color:#374151;"><strong>Registros:</strong> ${rowCount}</p>
            <p style="margin:0;font-size:12px;font-family:monospace;color:#111827;word-break:break-all;padding:8px;background:#f3f4f6;border-radius:6px;margin-top:8px;">${checksum}</p>
        </td>
    </tr>
</table>
<p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">
    Guarda este checksum para verificación externa. Si el checksum de la base de datos no coincide con este valor, puede indicar manipulación.
</p>
`
    const html = wrapEmailLayout(body, {
        headerTitle: 'EVA Auditoría',
        previewText: `Checksum SHA-256 — ${rowCount} registros — ${now.toISOString().slice(0, 10)}`,
    })

    for (const email of adminEmails) {
        await sendTransactionalEmail({ to: email, subject, html }).catch(err =>
            console.error(`[cron/audit-checksum] email failed for ${email}:`, err)
        )
    }

    console.info(`[cron/audit-checksum] done — rows=${rowCount} checksum=${checksum.slice(0, 12)}...`)
    return NextResponse.json({ ok: true, rowCount, checksum, emailed: adminEmails.length })
}
