import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { NextResponse, type NextRequest } from 'next/server'
import { sendFreeCoachOnboardingEmails } from '@/lib/email/free-coach-onboarding'

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url)
    const token_hash = searchParams.get('token_hash')
    // `magiclink`: lo emite el REENVÍO de confirmación (QA pre-campaña 17-08 — para un usuario ya
    // creado GoTrue rechaza `invite` y `signup`, así que el reenvío firma magiclink; verificarlo
    // confirma el email igual, y la rama de activación de abajo hace el resto).
    const type = searchParams.get('type') as 'email' | 'recovery' | 'magiclink' | null

    if (!token_hash || !type) {
        return NextResponse.redirect(`${origin}/login?error=invalid_confirmation_link`)
    }

    const supabase = await createClient()
    const { data, error } = await supabase.auth.verifyOtp({ token_hash, type })

    if (error || !data.user) {
        return NextResponse.redirect(`${origin}/login?error=confirmation_expired`)
    }

    // Password recovery: land on the reset form with the recovery session active,
    // not on the dashboard. (Covers token_hash-style recovery links.)
    if (type === 'recovery') {
        const next = searchParams.get('next')
        const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : '/reset-password'
        return NextResponse.redirect(`${origin}${dest}`)
    }

    // Activate free tier coach whose registration was pending email confirmation.
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

        // Fire welcome + drip now that email is confirmed. Helper compartido con el alta por
        // Google (`completeOAuthOnboarding`), que nace `active` y nunca pasa por acá.
        sendFreeCoachOnboardingEmails({
            email: data.user.email!,
            coachName: coach.full_name ?? '',
            brandName: coach.brand_name ?? '',
            appUrl: process.env.NEXT_PUBLIC_SITE_URL ?? origin,
        })

        return NextResponse.redirect(`${origin}/coach/dashboard?welcome=free`)
    }

    // Default: just redirect to dashboard (recovery / other confirmation types)
    return NextResponse.redirect(`${origin}/coach/dashboard`)
}
