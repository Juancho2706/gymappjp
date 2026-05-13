import { createClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/coach/dashboard'

    console.log('[auth/callback] hit', { hasCode: !!code, next, origin })

    if (code) {
        const supabase = await createClient()
        const { data, error } = await supabase.auth.exchangeCodeForSession(code)

        console.log('[auth/callback] exchangeCodeForSession', {
            userId: data?.user?.id ?? null,
            email: data?.user?.email ?? null,
            error: error?.message ?? null,
        })

        if (!error && data.user) {
            const adminDb = createServiceRoleClient()
            const { data: coach, error: coachError } = await adminDb
                .from('coaches')
                .select('id')
                .eq('id', data.user.id)
                .maybeSingle()

            console.log('[auth/callback] coaches lookup', {
                found: !!coach,
                coachError: coachError?.message ?? null,
            })

            if (coach) {
                console.log('[auth/callback] returning coach → /coach/dashboard')
                return NextResponse.redirect(`${origin}/coach/dashboard`)
            }

            console.log('[auth/callback] new OAuth user → /coach/onboarding/complete')
            return NextResponse.redirect(`${origin}/coach/onboarding/complete`)
        }
    }

    console.log('[auth/callback] fallback → login?error=auth_callback_failed')
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
