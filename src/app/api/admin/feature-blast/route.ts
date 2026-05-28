import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import { buildFeatureAnnouncementEmail } from '@/lib/email/feature-templates'

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

    const url = new URL(req.url)
    const sampleMode = url.searchParams.get('sample') === 'true'
    const sampleEmail = url.searchParams.get('email')
    const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://eva-app.cl'

    if (sampleMode) {
        if (!sampleEmail) {
            return NextResponse.json({ error: 'Missing ?email= for sample mode' }, { status: 400 })
        }
        const { subject, html } = buildFeatureAnnouncementEmail({ coachName: 'Juan', baseUrl: appUrl })
        const result = await sendTransactionalEmail({ to: sampleEmail, subject, html })
        return NextResponse.json({ ok: result.ok, sample: true, to: sampleEmail, error: result.ok ? undefined : result.error })
    }

    const admin = createServiceRoleClient()

    const { data: coaches, error } = await admin
        .from('coaches')
        .select('id, full_name, subscription_status')
        .in('subscription_status', ['active', 'trialing'])

    if (error) {
        console.error('[feature-blast] coaches query error:', error)
        return NextResponse.json({ ok: false, error: 'DB query failed' }, { status: 500 })
    }

    let sent = 0
    let skipped = 0
    let errors = 0

    for (const coach of coaches ?? []) {
        try {
            const { data: authUser } = await admin.auth.admin.getUserById(coach.id)
            const email = authUser?.user?.email
            if (!email) { skipped++; continue }

            const { subject, html } = buildFeatureAnnouncementEmail({
                coachName: coach.full_name,
                baseUrl: appUrl,
            })

            const result = await sendTransactionalEmail({ to: email, subject, html })
            if (result.ok) {
                sent++
            } else {
                console.warn(`[feature-blast] email failed for coach ${coach.id}:`, result.error)
                errors++
            }
        } catch (err) {
            console.error(`[feature-blast] error for coach ${coach.id}:`, err)
            errors++
        }
    }

    await admin.from('admin_audit_logs').insert({
        admin_email: 'system',
        action: 'feature_blast.sent',
        target_table: 'coaches',
        target_id: null,
        payload: { sent, skipped, errors, feature: 'exercise-creator-client-import' },
    })

    return NextResponse.json({ ok: true, sent, skipped, errors })
}
