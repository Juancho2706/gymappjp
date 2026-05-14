import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')
    const next = searchParams.get('next') ?? '/coach/dashboard'

    if (code) {
        // Hand the code off to the client-side exchange page.
        // The browser Supabase client completes the PKCE exchange using the code
        // verifier it stored in document.cookie — no server-side cookie forwarding needed.
        const exchangeUrl = new URL(`${origin}/auth/exchange`)
        // Use 'oauth_code' not 'code' — Supabase's detectSessionInUrl auto-fires on ?code=
        // which would double-exchange the one-time code and cause a failure on our manual call.
        exchangeUrl.searchParams.set('oauth_code', code)
        exchangeUrl.searchParams.set('next', next)
        return NextResponse.redirect(exchangeUrl.toString())
    }

    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
