import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { buildDripTemplates } from '@/lib/email/drip-templates'
import { sendTransactionalEmail } from '@/lib/email/send-email'

function isAuthorized(request: Request) {
    const token = process.env.DRIP_CRON_TOKEN
    if (!token) return false
    const url = new URL(request.url)
    const queryToken = url.searchParams.get('token')
    if (queryToken && queryToken === token) return true
    const auth = request.headers.get('authorization')
    return auth === `Bearer ${token}`
}

function diffDays(fromIso: string, now: Date) {
    const from = new Date(fromIso)
    const diffMs = now.getTime() - from.getTime()
    return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

export async function POST(request: Request) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const url = new URL(request.url)
    const dryRun = url.searchParams.get('dryRun') === '1'
    const now = new Date()
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

    const admin = createServiceRoleClient()
    const db = admin as any

    const { data: coaches, error: coachesError } = await admin
        .from('coaches')
        .select('id, full_name, brand_name, created_at, subscription_status')
        .in('subscription_status', ['trialing', 'active', 'pending_payment'])
        .order('created_at', { ascending: false })
        .limit(500)

    if (coachesError) {
        return NextResponse.json({ error: coachesError.message }, { status: 500 })
    }

    const coachIds = (coaches ?? []).map((c) => c.id)
    const { data: existingEvents } = coachIds.length
        ? await db
              .from('coach_email_drip_events')
              .select('coach_id, template_key, status')
              .in('coach_id', coachIds)
        : { data: [] as Array<{ coach_id: string; template_key: string; status: string }> }

    const seen = new Set((existingEvents ?? []).map((e: any) => `${e.coach_id}:${e.template_key}`))

    let sent = 0
    let failed = 0
    let skipped = 0
    const details: Array<{ coachId: string; template: string; status: string; note?: string }> = []

    for (const coach of coaches ?? []) {
        const ageDays = diffDays(coach.created_at, now)
        if (ageDays < 1) continue

        const templates = buildDripTemplates({
            coachName: coach.full_name,
            brandName: coach.brand_name,
            baseUrl,
        }).filter((t) => ageDays >= t.day)

        if (!templates.length) continue

        const userResult = await admin.auth.admin.getUserById(coach.id)
        const email = userResult.data.user?.email
        if (!email) {
            skipped++
            details.push({ coachId: coach.id, template: 'all_due', status: 'skipped', note: 'missing_email' })
            continue
        }

        for (const template of templates) {
            const key = `${coach.id}:${template.key}`
            if (seen.has(key)) continue

            if (dryRun) {
                skipped++
                details.push({ coachId: coach.id, template: template.key, status: 'skipped', note: 'dry_run' })
                continue
            }

            const result = await sendTransactionalEmail({
                to: email,
                subject: template.subject,
                html: template.html,
            })

            if (result.ok) {
                await db.from('coach_email_drip_events').insert({
                    coach_id: coach.id,
                    template_key: template.key,
                    scheduled_day: template.day,
                    status: 'sent',
                    provider_message_id: result.providerMessageId,
                    sent_at: new Date().toISOString(),
                })
                sent++
                details.push({ coachId: coach.id, template: template.key, status: 'sent' })
                seen.add(key)
            } else {
                await db.from('coach_email_drip_events').insert({
                    coach_id: coach.id,
                    template_key: template.key,
                    scheduled_day: template.day,
                    status: 'failed',
                    error: result.error,
                })
                failed++
                details.push({ coachId: coach.id, template: template.key, status: 'failed', note: result.error })
                seen.add(key)
            }
        }
    }

    return NextResponse.json({
        ok: true,
        dryRun,
        now: now.toISOString(),
        totals: { sent, failed, skipped },
        details,
    })
}
