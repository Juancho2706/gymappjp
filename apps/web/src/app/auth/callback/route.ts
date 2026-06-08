import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    // Password-recovery links set next=/reset-password; forward it so the exchange lands
    // the user on the reset form instead of treating it as a plain login.
    const next = searchParams.get('next')

    if (code) {
        const exchangeUrl = new URL(`${origin}/auth/exchange`)
        // Use 'oauth_code' not 'code' — Supabase's detectSessionInUrl auto-fires on ?code=
        exchangeUrl.searchParams.set('oauth_code', code)
        exchangeUrl.searchParams.set('intent', 'login')
        if (next) exchangeUrl.searchParams.set('next', next)
        return NextResponse.redirect(exchangeUrl.toString())
    }

    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
