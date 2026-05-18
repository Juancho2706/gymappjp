import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')

    if (code) {
        const exchangeUrl = new URL(`${origin}/auth/exchange`)
        // Use 'oauth_code' not 'code' — Supabase's detectSessionInUrl auto-fires on ?code=
        exchangeUrl.searchParams.set('oauth_code', code)
        exchangeUrl.searchParams.set('intent', 'login')
        return NextResponse.redirect(exchangeUrl.toString())
    }

    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
