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
    const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    let purged = 0
    let errors = 0

    // ── Purge org_audit_logs older than 90 days ──────────────────────────────
    try {
        const { error } = await admin.rpc('purge_old_audit_logs' as never)
        if (error) throw error
        console.info('[cron/purge-data] purge_old_audit_logs done')
    } catch (err) {
        console.warn('[cron/purge-data] purge_old_audit_logs failed (may not exist yet):', err)
    }

    // ── Purge soft-deleted org members (deleted >30 days ago) ────────────────
    try {
        const { count, error } = await admin
            .from('organization_members')
            .delete({ count: 'exact' })
            .lt('deleted_at', cutoff)
            .not('deleted_at', 'is', null)

        if (error) throw error
        purged += count ?? 0
    } catch (err) {
        console.error('[cron/purge-data] org_members purge failed:', err)
        errors++
    }

    // ── Purge soft-deleted coach_client_assignments (deleted >30 days ago) ───
    try {
        const { count, error } = await admin
            .from('coach_client_assignments')
            .delete({ count: 'exact' })
            .lt('deleted_at', cutoff)
            .not('deleted_at', 'is', null)

        if (error) throw error
        purged += count ?? 0
    } catch (err) {
        console.error('[cron/purge-data] assignments purge failed:', err)
        errors++
    }

    await admin.from('admin_audit_logs').insert({
        admin_email: 'cron',
        action: 'cron.purge_data_ran',
        target_table: 'system',
        target_id: null,
        payload: { purged, errors, cutoff_date: cutoff },
    })

    console.info(`[cron/purge-data] done — purged=${purged} errors=${errors}`)
    return NextResponse.json({ ok: true, purged, errors })
}
