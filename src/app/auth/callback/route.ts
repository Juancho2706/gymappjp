import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'
import type { CookieOptions } from '@supabase/ssr'

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')

    console.log('[auth/callback] hit', { hasCode: !!code, origin })

    if (code) {
        const cookieStore = await cookies()
        const captured: Array<{ name: string; value: string; options: CookieOptions }> = []

        // Build the client manually so we can capture cookies set during exchangeCodeForSession
        // and explicitly forward them on the redirect response — cookies().set() attaches to
        // Next.js's internal context, not to a custom NextResponse.redirect() instance.
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() { return cookieStore.getAll() },
                    setAll(toSet) {
                        captured.push(...toSet)
                        toSet.forEach(({ name, value, options }) => {
                            try { cookieStore.set(name, value, options) } catch {}
                        })
                    },
                },
            }
        )

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

            const destination = coach
                ? `${origin}/coach/dashboard`
                : `${origin}/coach/onboarding/complete`

            console.log('[auth/callback] redirect →', destination)

            const res = NextResponse.redirect(destination)
            captured.forEach(({ name, value, options }) => res.cookies.set(name, value, options))
            return res
        }
    }

    console.log('[auth/callback] fallback → login?error=auth_callback_failed')
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
