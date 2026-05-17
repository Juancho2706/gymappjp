import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

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

    console.info(`[cron/org-health-alert] done — suspended=${suspended} alerted=${alerted} errors=${errors}`)
    return NextResponse.json({ ok: true, suspended, alerted, errors })
}
