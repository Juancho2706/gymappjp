'use client'

import { createClient } from '@/lib/supabase/client'

export async function startCoachGoogleLogin() {
    const supabase = createClient()
    const origin = window.location.origin
    await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${origin}/auth/callback?next=/coach/dashboard` },
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
