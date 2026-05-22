import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import { buildOrgInactiveClientsEmail } from '@/lib/email/transactional-templates'

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
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const in3Days = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString()

    let alerted = 0
    let suspended = 0
    let errors = 0

    // ── Block 1: suspend orgs whose trial expired ─────────────────────────────
    const { data: expiredOrgs, error: expiredErr } = await admin
        .from('organizations')
        .select('id, name, slug')
        .eq('status', 'trial')
        .lt('trial_ends_at', now.toISOString())
        .is('deleted_at', null)

    if (expiredErr) {
        console.error('[cron/org-health-alert] expired query failed:', expiredErr)
        return NextResponse.json({ ok: false, error: 'DB query failed' }, { status: 500 })
    }

    for (const org of expiredOrgs ?? []) {
        try {
            await admin
                .from('organizations')
                .update({ status: 'suspended' })
                .eq('id', org.id)

            await admin.from('admin_audit_logs').insert({
                admin_email: 'cron',
                action: 'org.trial_expired_auto_suspended',
                target_table: 'organizations',
                target_id: org.id,
                payload: { org_name: org.name, org_slug: org.slug, triggered_by: 'cron/org-health-alert' },
            })

            console.info(`[cron/org-health-alert] suspended org ${org.slug} (trial expired)`)
            suspended++
        } catch (err) {
            console.error(`[cron/org-health-alert] failed to suspend org ${org.id}:`, err)
            errors++
        }
    }

    // ── Block 2: alert orgs expiring in ≤7 days ───────────────────────────────
    const { data: soonOrgs } = await admin
        .from('organizations')
        .select('id, name, slug, trial_ends_at, seats_included')
        .eq('status', 'trial')
        .gt('trial_ends_at', now.toISOString())
        .lt('trial_ends_at', in7Days)
        .is('deleted_at', null)

    for (const org of soonOrgs ?? []) {
        try {
            const msLeft = new Date(org.trial_ends_at!).getTime() - now.getTime()
            const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24))
            const urgency = org.trial_ends_at! < in3Days ? 'critical' : 'warning'

            await admin.from('admin_audit_logs').insert({
                admin_email: 'cron',
                action: 'org.trial_expiry_alert',
                target_table: 'organizations',
                target_id: org.id,
                payload: {
                    org_name: org.name,
                    org_slug: org.slug,
                    days_left: daysLeft,
                    urgency,
                    triggered_by: 'cron/org-health-alert',
                },
            })

            alerted++
        } catch (err) {
            console.error(`[cron/org-health-alert] alert failed for org ${org.id}:`, err)
            errors++
        }
    }

    // ── Block 3: calculate health score for all active orgs ──────────────────
    const { data: activeOrgs, error: activeOrgsErr } = await admin
        .from('organizations')
        .select('id, slug, seats_included')
        .in('status', ['active', 'trial'])
        .is('deleted_at', null)

    if (activeOrgsErr) {
        console.error('[cron/org-health-alert] activeOrgs query failed:', activeOrgsErr)
    } else {
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
        let scored = 0

        for (const org of activeOrgs ?? []) {
            try {
                const [membersRes, clientsRes] = await Promise.all([
                    admin
                        .from('organization_members')
                        .select('id', { count: 'exact', head: true })
                        .eq('org_id', org.id)
                        .eq('status', 'active')
                        .is('deleted_at', null),
                    admin
                        .from('clients')
                        .select('id, is_active')
                        .eq('org_id', org.id),
                ])

                const activeCoaches = membersRes.count ?? 0
                const allClients = clientsRes.data ?? []
                const totalClients = allClients.length
                const activeClients = allClients.filter(c => c.is_active).length

                let recentlyActive = 0
                if (totalClients > 0) {
                    const clientIds = allClients.map(c => c.id)
                    const { data: recentLogs } = await admin
                        .from('workout_logs')
                        .select('client_id')
                        .in('client_id', clientIds)
                        .gte('logged_at', sevenDaysAgo)
                    recentlyActive = new Set(recentLogs?.map(l => l.client_id) ?? []).size
                }

                const seats = Math.max(org.seats_included, 1)
                const coachRatio = Math.min(activeCoaches / seats, 1)
                const activeRatio = totalClients > 0 ? activeClients / totalClients : 0
                const engagementRatio = totalClients > 0 ? recentlyActive / totalClients : 0

                const score = Math.round(
                    coachRatio * 35 + activeRatio * 35 + engagementRatio * 30
                )

                await admin
                    .from('organizations')
                    .update({ last_health_score: score, last_health_score_at: now.toISOString() })
                    .eq('id', org.id)

                scored++
            } catch (err) {
                console.error(`[cron/org-health-alert] health score failed for org ${org.id}:`, err)
                errors++
            }
        }

        console.info(`[cron/org-health-alert] health scores updated — scored=${scored}`)
    }

    // ── Block 4: inactive client digest email to org admins ───────────────────
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eva-app.cl'
    let digests = 0

    const { data: orgsForDigest } = await admin
        .from('organizations')
        .select('id, slug, name')
        .in('status', ['active', 'trial'])
        .is('deleted_at', null)

    for (const org of orgsForDigest ?? []) {
        try {
            // Get all clients in org with their coach
            const { data: orgClients } = await admin
                .from('clients')
                .select('id, full_name, coach_id')
                .eq('org_id', org.id)
                .eq('is_active', true)

            if (!orgClients?.length) continue

            const clientIds = orgClients.map(c => c.id)
            const coachIds = [...new Set(orgClients.map(c => c.coach_id).filter(Boolean))] as string[]

            // Last log per client
            const { data: recentLogs } = await admin
                .from('workout_logs')
                .select('client_id, logged_at')
                .in('client_id', clientIds)
                .gte('logged_at', fourteenDaysAgo)

            const activeClientIds = new Set(recentLogs?.map(l => l.client_id) ?? [])
            const inactiveClients = orgClients.filter(c => !activeClientIds.has(c.id))

            if (!inactiveClients.length) continue

            // Resolve coach names
            const coachNameMap: Record<string, string> = {}
            if (coachIds.length > 0) {
                const { data: coaches } = await admin
                    .from('coaches')
                    .select('id, full_name')
                    .in('id', coachIds)
                for (const c of coaches ?? []) coachNameMap[c.id] = c.full_name ?? 'Coach'
            }

            // Get last log date per inactive client for days calculation
            const { data: lastLogs } = await admin
                .from('workout_logs')
                .select('client_id, logged_at')
                .in('client_id', inactiveClients.map(c => c.id))
                .order('logged_at', { ascending: false })

            const lastLogMap: Record<string, string> = {}
            for (const log of lastLogs ?? []) {
                if (!lastLogMap[log.client_id]) lastLogMap[log.client_id] = log.logged_at
            }

            const inactiveList = inactiveClients.map(c => {
                const lastLog = lastLogMap[c.id]
                const daysSince = lastLog
                    ? Math.floor((now.getTime() - new Date(lastLog).getTime()) / 86400000)
                    : 999
                return {
                    name: c.full_name ?? 'Alumno',
                    coachName: c.coach_id ? (coachNameMap[c.coach_id] ?? 'Sin coach') : 'Sin coach',
                    daysSinceLastLog: daysSince,
                }
            }).sort((a, b) => b.daysSinceLastLog - a.daysSinceLastLog)

            // Get org owners/admins
            const { data: admins } = await admin
                .from('organization_members')
                .select('user_id, role')
                .eq('org_id', org.id)
                .in('role', ['org_owner', 'org_admin'])
                .eq('status', 'active')
                .is('deleted_at', null)

            for (const adminMember of admins ?? []) {
                const { data: authUser } = await admin.auth.admin.getUserById(adminMember.user_id)
                const email = authUser.user?.email
                if (!email) continue

                const adminName = authUser.user?.user_metadata?.full_name ?? 'Administrador'
                const { subject, html } = buildOrgInactiveClientsEmail({
                    orgName: org.name,
                    adminName,
                    inactiveClients: inactiveList,
                    orgUrl: `${siteUrl}/org/${org.slug}/clients`,
                })

                await sendTransactionalEmail({ to: email, subject, html })
            }

            digests++
        } catch (err) {
            console.error(`[cron/org-health-alert] inactive digest failed for org ${org.id}:`, err)
            errors++
        }
    }

    console.info(`[cron/org-health-alert] inactive digests sent — orgs=${digests}`)
    console.info(`[cron/org-health-alert] done — suspended=${suspended} alerted=${alerted} errors=${errors}`)
    return NextResponse.json({ ok: true, suspended, alerted, digests, errors })
}
