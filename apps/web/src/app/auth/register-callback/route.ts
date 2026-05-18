import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url)
    const code = searchParams.get('code')

    if (code) {
        const exchangeUrl = new URL(`${origin}/auth/exchange`)
        exchangeUrl.searchParams.set('oauth_code', code)
        exchangeUrl.searchParams.set('intent', 'register')
        return NextResponse.redirect(exchangeUrl.toString())
    }

    return NextResponse.redirect(`${origin}/register?error=auth_callback_failed`)
}
