import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { NextResponse, type NextRequest } from 'next/server'
import { sendTransactionalEmail } from '@/lib/email/send-email'
import { buildFreeCoachWelcomeEmail } from '@/lib/email/transactional-templates'
import { scheduleFreeCoachDripSequence } from '@/lib/email/send-drip-sequence'

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url)
    const token_hash = searchParams.get('token_hash')
    const type = searchParams.get('type') as 'email' | 'recovery' | null

    if (!token_hash || !type) {
        return NextResponse.redirect(`${origin}/login?error=invalid_confirmation_link`)
    }

    const supabase = await createClient()
    const { data, error } = await supabase.auth.verifyOtp({ token_hash, type })

    if (error || !data.user) {
        return NextResponse.redirect(`${origin}/login?error=confirmation_expired`)
    }

    // Activate free tier coach whose registration was pending email confirmation
    const adminDb = createServiceRoleClient()
    const { data: coach } = await adminDb
        .from('coaches')
        .select('id, subscription_status, full_name, brand_name, subscription_tier')
        .eq('id', data.user.id)
        .maybeSingle()

    if (coach && coach.subscription_status === 'pending_email' && coach.subscription_tier === 'free') {
        await adminDb
            .from('coaches')
            .update({ subscription_status: 'active' })
            .eq('id', coach.id)

        // Fire welcome + drip emails now that email is confirmed
        const appUrl = process.env.NEXT_PUBLIC_SITE_URL ?? origin
        const { subject, html } = buildFreeCoachWelcomeEmail({
            coachName: coach.full_name ?? '',
            brandName: coach.brand_name ?? '',
            dashboardUrl: `${appUrl}/coach/dashboard`,
            clientsUrl: `${appUrl}/coach/clients`,
            subscriptionUrl: `${appUrl}/coach/subscription`,
        })
        sendTransactionalEmail({ to: data.user.email!, subject, html }).catch(() => null)
        scheduleFreeCoachDripSequence({
            email: data.user.email!,
            coachName: coach.full_name ?? '',
            brandName: coach.brand_name ?? '',
        }).catch(() => null)

        return NextResponse.redirect(`${origin}/coach/dashboard?welcome=free`)
    }

    // Default: just redirect to dashboard (recovery / other confirmation types)
    return NextResponse.redirect(`${origin}/coach/dashboard`)
}
