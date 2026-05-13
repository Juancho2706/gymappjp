import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/coach/dashboard'

    if (code) {
        const supabase = await createClient()
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error && data.user) {
            // Check if this user already has a coaches record
            const adminDb = createServiceRoleClient()
            const { data: coach } = await adminDb
                .from('coaches')
                .select('id')
                .eq('id', data.user.id)
                .maybeSingle()

            if (coach) {
                // Returning coach — go straight to dashboard
                return NextResponse.redirect(`${origin}/coach/dashboard`)
            }

            // New OAuth user without coaches record — always go to onboarding
            return NextResponse.redirect(`${origin}/coach/onboarding/complete`)
        }
    }

    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
