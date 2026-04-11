import { NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'

function isAuthorized(request: Request) {
    const expected = process.env.BETA_MONITOR_TOKEN
    if (!expected) return false
    const auth = request.headers.get('authorization')
    return auth === `Bearer ${expected}`
}

export async function GET(request: Request) {
    if (!isAuthorized(request)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const admin = createServiceRoleClient()
    const db = admin as any
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const [{ count: paymentFailures }, { count: paymentEvents }, { count: coachCount }, { count: dripFailures }, { count: onboardingEvents }] =
        await Promise.all([
            admin
                .from('subscription_events')
                .select('id', { count: 'exact', head: true })
                .in('provider_status', ['cancelled', 'rejected', 'failed'])
                .gte('created_at', since),
            admin.from('subscription_events').select('id', { count: 'exact', head: true }).gte('created_at', since),
            admin.from('coaches').select('id', { count: 'exact', head: true }),
            db
                .from('coach_email_drip_events')
                .select('id', { count: 'exact', head: true })
                .eq('status', 'failed')
                .gte('created_at', since),
            db.from('coach_onboarding_events').select('id', { count: 'exact', head: true }).gte('created_at', since),
        ])

    return NextResponse.json({
        ok: true,
        windowHours: 24,
        since,
        totals: {
            coaches: coachCount ?? 0,
            paymentEvents24h: paymentEvents ?? 0,
            paymentFailures24h: paymentFailures ?? 0,
            dripFailures24h: dripFailures ?? 0,
            onboardingEvents24h: onboardingEvents ?? 0,
        },
    })
}
