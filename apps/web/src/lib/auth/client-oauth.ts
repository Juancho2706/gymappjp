'use client'

import { createClient } from '@/lib/supabase/client'

/**
 * @param next destino interno ya validado (`safeNext`) — p. ej. `/coach/subscription?utm_...`
 *             cuando el coach llegó desde el correo de cupo. Sin `next`, el dashboard.
 */
export async function startCoachGoogleLogin(next?: string | null) {
    const supabase = createClient()
    const origin = window.location.origin
    const target = next ?? '/coach/dashboard'
    await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(target)}` },
    })
}

export async function startCoachGoogleRegistration() {
    const supabase = createClient()
    const origin = window.location.origin
    await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${origin}/auth/register-callback` },
    })
}

export async function getCurrentOAuthUserProfile() {
    const supabase = createClient()
    const { data } = await supabase.auth.getUser()
    const user = data.user
    if (!user) return null

    return {
        email: user.email ?? '',
        fullName:
            (user.user_metadata?.full_name as string | undefined) ??
            (user.user_metadata?.name as string | undefined) ??
            '',
    }
}
