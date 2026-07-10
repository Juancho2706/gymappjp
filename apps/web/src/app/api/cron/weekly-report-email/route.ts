/**
 * POST /api/cron/weekly-report-email
 * Sends a weekly operational summary email to each org owner.
 * Run weekly (e.g. Mondays 08:00 local time) via Vercel Cron.
 * Uses sendTransactionalEmail (Resend) — free tier: 3000 emails/month.
 *
 * Protected by CRON_SECRET. Manual trigger: pnpm run cron:weekly-email
 */
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { sendTransactionalEmail } from '@/lib/email/send-email'

function isAuthorized(req: Request) {
    const expected = process.env.CRON_SECRET
    if (!expected) return false
    return req.headers.get('authorization') === `Bearer ${expected}`
}

function healthTier(score: number | null) {
    if (!score) return { label: 'Sin calcular', color: '#6b7280' }
    if (score >= 70) return { label: 'Verde', color: '#10b981' }
    if (score >= 50) return { label: 'Ámbar', color: '#f59e0b' }
    return { label: 'Rojo', color: '#ef4444' }
}

function pct(value: number, total: number) {
    return total > 0 ? Math.round((value / total) * 100) : 0
}

export async function GET(req: Request) { return POST(req) }

export async function POST(req: Request) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createServiceRoleClient()
    const orgSlug = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eva-app.cl'
    const dateStr = new Date().toLocaleDateString('es-CL', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)

    // Fetch all active orgs with their owner's email
    const { data: orgs } = await admin
        .from('organizations')
        .select('id, name, slug, last_health_score, seats_included, owner_user_id')
        .eq('status', 'active')
    if (!orgs || orgs.length === 0) return NextResponse.json({ ok: true, sent: 0 })

    let sent = 0
    const errors: string[] = []

    for (const org of orgs) {
        try {
            // Get owner email
            const { data: ownerUser } = await admin.auth.admin.getUserById(org.owner_user_id)
            const ownerEmail = ownerUser?.user?.email
            if (!ownerEmail) continue

            // Fetch metrics in parallel
            const [clientsRes, membersRes, checkInsRes, announcementsRes] = await Promise.all([
                admin.from('clients').select('id, coach_id, is_active').eq('org_id', org.id),
                admin.from('organization_members').select('role, status').eq('org_id', org.id).is('deleted_at', null),
                admin.from('check_ins').select('client_id').gte('date', sevenDaysAgo),
                admin.from('org_announcements').select('id').eq('org_id', org.id).eq('is_active', true),
            ])

            const clients = clientsRes.data ?? []
            const members = membersRes.data ?? []
            const activeClients = clients.filter(c => c.is_active !== false).length
            const assignedClients = clients.filter(c => c.is_active !== false && c.coach_id).length
            const unassignedClients = activeClients - assignedClients
            const activeCoaches = members.filter(m => m.role === 'coach' && m.status === 'active').length
            const orgClientIds = new Set(clients.map(c => c.id))
            const checkIns7d = (checkInsRes.data ?? []).filter(ci => orgClientIds.has(ci.client_id)).length
            const assignRate = pct(assignedClients, activeClients)
            const tier = healthTier(org.last_health_score)
            const liveAnnouncements = announcementsRes.data?.length ?? 0

            const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eva-app.cl'
            const dashboardUrl = `${siteUrl}/org/${org.slug}`

            const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">

  <!-- Header -->
  <tr><td style="background:#09090b;padding:28px 32px;">
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        <td style="border-left:4px solid #f59e0b;padding-left:16px;">
          <p style="margin:0;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#a1a1aa;">EVA Enterprise</p>
          <h1 style="margin:4px 0 0;font-size:22px;font-weight:900;color:#fff;">${org.name}</h1>
        </td>
        <td align="right" style="padding-left:16px;">
          <div style="display:inline-block;background:${tier.color}22;border:1px solid ${tier.color}44;border-radius:999px;padding:4px 12px;">
            <span style="font-size:12px;font-weight:700;color:${tier.color};">${tier.label} · ${org.last_health_score ?? 'N/D'}/100</span>
          </div>
          <p style="margin:6px 0 0;font-size:11px;color:#71717a;">Weekly Brief · ${dateStr}</p>
        </td>
      </tr>
    </table>
  </td></tr>

  <!-- Metrics -->
  <tr><td style="padding:24px 32px 0;">
    <p style="margin:0 0 16px;font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#6b7280;">Métricas operacionales</p>
    <table width="100%" cellpadding="0" cellspacing="0">
      <tr>
        ${[
          { label: 'Alumnos activos', value: activeClients },
          { label: 'Coaches activos', value: activeCoaches },
          { label: 'Check-ins 7d', value: checkIns7d },
          { label: 'Asignación', value: `${assignRate}%` },
        ].map(m => `
        <td width="25%" align="center" style="padding:0 4px;">
          <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:12px 8px;">
            <p style="margin:0;font-size:22px;font-weight:900;color:#111827;">${m.value}</p>
            <p style="margin:4px 0 0;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;">${m.label}</p>
          </div>
        </td>`).join('')}
      </tr>
    </table>
  </td></tr>

  <!-- Alerts -->
  ${unassignedClients > 0 ? `
  <tr><td style="padding:16px 32px 0;">
    <div style="background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:12px 16px;">
      <p style="margin:0;font-size:13px;font-weight:700;color:#92400e;">⚠ ${unassignedClients} alumno${unassignedClients !== 1 ? 's' : ''} sin coach asignado</p>
      <p style="margin:4px 0 0;font-size:12px;color:#78350f;">Revisa las asignaciones para mantener la adherencia.</p>
    </div>
  </td></tr>` : `
  <tr><td style="padding:16px 32px 0;">
    <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px 16px;">
      <p style="margin:0;font-size:13px;font-weight:700;color:#14532d;">✓ Todos los alumnos tienen coach asignado</p>
    </div>
  </td></tr>`}

  <!-- CTA -->
  <tr><td style="padding:24px 32px 32px;">
    <a href="${dashboardUrl}" style="display:inline-block;background:#f59e0b;color:#09090b;font-weight:900;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none;">
      Ver dashboard completo →
    </a>
    <p style="margin:16px 0 0;font-size:11px;color:#9ca3af;">
      ${liveAnnouncements} anuncio${liveAnnouncements !== 1 ? 's' : ''} activo${liveAnnouncements !== 1 ? 's' : ''} · Seats: ${activeCoaches + members.filter(m => m.role !== 'coach' && m.status === 'active').length}/${org.seats_included}
    </p>
  </td></tr>

  <!-- Footer -->
  <tr><td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;">
    <p style="margin:0;font-size:11px;color:#9ca3af;">
      EVA Enterprise · Weekly Brief automático · <a href="${siteUrl}/org/login" style="color:#6b7280;">Ingresar</a>
    </p>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`

            const result = await sendTransactionalEmail({
                to: ownerEmail,
                subject: `📊 Weekly Brief — ${org.name} · ${new Date().toLocaleDateString('es-CL', { month: 'short', day: 'numeric' })}`,
                html,
            })

            if (result.ok) sent++
            else errors.push(`${org.slug}: ${result.error}`)
        } catch (err) {
            errors.push(`${org.slug}: ${String(err)}`)
        }
    }

    console.info(`[cron/weekly-report-email] done — sent=${sent} errors=${errors.length}`)
    return NextResponse.json({ ok: true, sent, errors })
}
