/**
 * POST /api/cron/weekly-snapshot
 * Saves a weekly metrics snapshot for each active org to org_weekly_snapshots.
 * Called weekly (e.g., every Monday at 00:00 UTC via Vercel Cron).
 * Also callable manually via: pnpm run cron:weekly-snapshot
 *
 * Protected by CRON_SECRET header: Authorization: Bearer <secret>
 */
import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

function isAuthorized(req: Request) {
    const expected = process.env.CRON_SECRET
    if (!expected) return false
    const auth = req.headers.get('authorization') ?? ''
    return auth === `Bearer ${expected}`
}

function getMondayDate(date: Date): string {
    const d = new Date(date)
    const day = d.getUTCDay()
    const diff = day === 0 ? -6 : 1 - day  // adjust to Monday
    d.setUTCDate(d.getUTCDate() + diff)
    return d.toISOString().slice(0, 10)
}

export async function GET(req: Request) {
    return POST(req)
}

export async function POST(req: Request) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createServiceRoleClient()
    const now = new Date()
    const weekStart = getMondayDate(now)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000).toISOString().slice(0, 10)

    // Fetch all active orgs
    const { data: orgs } = await admin
        .from('organizations')
        .select('id')
        .eq('status', 'active')
    if (!orgs || orgs.length === 0) {
        return NextResponse.json({ ok: true, snapshotted: 0 })
    }

    let snapshotted = 0
    const errors: string[] = []

    for (const org of orgs) {
        try {
            const [clientsRes, membersRes, checkInsRes, orgRes] = await Promise.all([
                admin.from('clients').select('id, coach_id, is_active').eq('org_id', org.id),
                admin.from('organization_members').select('id, role, status').eq('org_id', org.id).is('deleted_at', null),
                admin.from('check_ins')
                    .select('client_id')
                    .gte('date', sevenDaysAgo),
                admin.from('organizations').select('last_health_score').eq('id', org.id).single(),
            ])

            const clients = clientsRes.data ?? []
            const members = membersRes.data ?? []
            const activeClients = clients.filter(c => c.is_active !== false).length
            const assignedClients = clients.filter(c => c.is_active !== false && c.coach_id).length
            const totalCoaches = members.filter(m => m.role === 'coach' && m.status === 'active').length
            const assignmentRate = activeClients > 0 ? Math.round((assignedClients / activeClients) * 100) : 0

            // check-ins only for this org's clients
            const orgClientIds = new Set(clients.map(c => c.id))
            const checkIns7d = (checkInsRes.data ?? []).filter(ci => orgClientIds.has(ci.client_id)).length

            await admin.from('org_weekly_snapshots').upsert({
                org_id: org.id,
                week_start: weekStart,
                health_score: orgRes.data?.last_health_score ?? null,
                active_clients: activeClients,
                assigned_clients: assignedClients,
                total_coaches: totalCoaches,
                check_ins_7d: checkIns7d,
                assignment_rate: assignmentRate,
            }, { onConflict: 'org_id,week_start' })

            snapshotted++
        } catch (err) {
            errors.push(`org ${org.id}: ${String(err)}`)
        }
    }

    console.info(`[cron/weekly-snapshot] done — orgs=${snapshotted} errors=${errors.length} week=${weekStart}`)
    return NextResponse.json({ ok: true, snapshotted, errors, week_start: weekStart })
}
