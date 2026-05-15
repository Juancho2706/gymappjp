import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import {
    buildTrialExpiryWarningEmail,
    buildTrialExpiredEmail,
} from '@/lib/email/transactional-templates'
import { getRecommendedTier, getTierMaxClients, TIER_CONFIG } from '@/lib/constants'
import type { TablesInsert } from '@/lib/database.types'

function isAuthorized(req: Request) {
    const expected = process.env.CRON_SECRET
    if (!expected) return true
    const auth = req.headers.get('authorization') ?? ''
    return auth === `Bearer ${expected}`
}

const WARNING_THRESHOLDS = [7, 3, 1]

export async function GET(req: Request) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createServiceRoleClient()
    const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eva-app.cl'
    const reactivateBase = `${appUrl}/coach/reactivate`

    let expired = 0
    let warned = 0
    let errors = 0

    // ── Block 1: expire overdue trials ────────────────────────────────────────
    const { data: overdueTrials, error: overdueErr } = await admin
        .from('coaches')
        .select('id, full_name, trial_warning_days_sent, subscription_tier')
        .eq('subscription_status', 'trialing')
        .or(
            'current_period_end.lt.now(),and(current_period_end.is.null,trial_ends_at.lt.now())'
        )

    if (overdueErr) {
        console.error('[cron/trial-expiry] overdue query error:', overdueErr)
        return NextResponse.json({ ok: false, error: 'DB query failed' }, { status: 500 })
    }

    for (const coach of overdueTrials ?? []) {
        try {
            await admin
                .from('coaches')
                .update({ subscription_status: 'expired', current_period_end: null })
                .eq('id', coach.id)

            // Fetch email from auth.users via RPC — use service role direct query
            const { data: authUser } = await admin.auth.admin.getUserById(coach.id)
            const email = authUser?.user?.email
            const coachName = coach.full_name ?? 'Coach'

            if (email) {
                // Count active clients
                const { count: clientCount } = await admin
                    .from('clients')
                    .select('id', { count: 'exact', head: true })
                    .eq('coach_id', coach.id)
                    .eq('is_archived', false)

                const activeCount = clientCount ?? 0
                const recTier = getRecommendedTier(activeCount)
                const recConfig = TIER_CONFIG[recTier]

                const { subject, html } = buildTrialExpiredEmail({
                    coachName,
                    brandName: coachName,
                    activeClientCount: activeCount,
                    recommendedTierLabel: recConfig.label,
                    recommendedTierSlug: recTier,
                    recommendedMaxClients: getTierMaxClients(recTier),
                    recommendedPriceClp: recConfig.monthlyPriceClp,
                    reactivateUrl: `${reactivateBase}?tier=${recTier}`,
                })

                await sendTransactionalEmail({ to: email, subject, html })
            }

            const auditRow: TablesInsert<'admin_audit_logs'> = {
                admin_email: 'cron',
                action: 'coach.trial_expired_auto',
                target_table: 'coaches',
                target_id: coach.id,
                payload: { previous_status: 'trialing', triggered_by: 'cron/trial-expiry' },
            }
            await admin.from('admin_audit_logs').insert(auditRow)

            expired++
        } catch (err) {
            console.error(`[cron/trial-expiry] failed to expire coach ${coach.id}:`, err)
            errors++
        }
    }

    // ── Block 2: warning emails for trials expiring in ≤7 days ───────────────
    const { data: soonTrials, error: soonErr } = await admin
        .from('coaches')
        .select('id, full_name, trial_ends_at, trial_warning_days_sent, subscription_tier')
        .eq('subscription_status', 'trialing')
        .gt('trial_ends_at', new Date().toISOString())
        .lt('trial_ends_at', new Date(Date.now() + 8 * 24 * 60 * 60 * 1000).toISOString())

    if (soonErr) {
        console.error('[cron/trial-expiry] soon query error:', soonErr)
    }

    for (const coach of soonTrials ?? []) {
        if (!coach.trial_ends_at) continue

        const msLeft = new Date(coach.trial_ends_at).getTime() - Date.now()
        const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24))
        const sentThresholds: number[] = coach.trial_warning_days_sent ?? []

        const threshold = WARNING_THRESHOLDS.find(
            t => daysLeft <= t && !sentThresholds.includes(t)
        )
        if (!threshold) continue

        try {
            const { data: authUser } = await admin.auth.admin.getUserById(coach.id)
            const email = authUser?.user?.email
            if (!email) continue

            const { count: clientCount } = await admin
                .from('clients')
                .select('id', { count: 'exact', head: true })
                .eq('coach_id', coach.id)
                .eq('is_archived', false)

            const activeCount = clientCount ?? 0
            const recTier = getRecommendedTier(activeCount)
            const recConfig = TIER_CONFIG[recTier]
            const coachName = coach.full_name ?? 'Coach'

            const { subject, html } = buildTrialExpiryWarningEmail({
                coachName,
                brandName: coachName,
                daysLeft,
                activeClientCount: activeCount,
                recommendedTierLabel: recConfig.label,
                recommendedTierSlug: recTier,
                recommendedMaxClients: getTierMaxClients(recTier),
                recommendedPriceClp: recConfig.monthlyPriceClp,
                reactivateUrl: `${reactivateBase}?tier=${recTier}`,
            })

            const emailResult = await sendTransactionalEmail({ to: email, subject, html })
            if (!emailResult.ok) {
                console.warn(`[cron/trial-expiry] email failed for coach ${coach.id}:`, emailResult.error)
                errors++
                continue
            }

            await admin
                .from('coaches')
                .update({ trial_warning_days_sent: [...sentThresholds, threshold] })
                .eq('id', coach.id)

            warned++
        } catch (err) {
            console.error(`[cron/trial-expiry] warning failed for coach ${coach.id}:`, err)
            errors++
        }
    }

    const auditResult: TablesInsert<'admin_audit_logs'> = {
        admin_email: 'cron',
        action: 'cron.trial_expiry_ran',
        target_table: 'coaches',
        target_id: null,
        payload: { expired, warned, errors },
    }
    await admin.from('admin_audit_logs').insert(auditResult)

    console.info(`[cron/trial-expiry] done — expired=${expired} warned=${warned} errors=${errors}`)
    return NextResponse.json({ ok: true, expired, warned, errors })
}
