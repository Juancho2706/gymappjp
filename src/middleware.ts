import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database } from '@/lib/database.types'
import type { Coach, Client } from '@/lib/database.types'

export async function middleware(request: NextRequest) {
    let supabaseResponse = NextResponse.next({ request })

    const supabase = createServerClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll() {
                    return request.cookies.getAll()
                },
                setAll(cookiesToSet) {
                    cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
                    supabaseResponse = NextResponse.next({ request })
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, options)
                    )
                },
            },
        }
    )

    // Refresh session — IMPORTANT: do not remove
    const { data: { user } } = await supabase.auth.getUser()

    const { pathname } = request.nextUrl

    // ============================================================
    // 1. PROTECT /coach/* routes (only for coaches)
    // ============================================================
    if (pathname.startsWith('/coach')) {
        if (!user) {
            const redirectUrl = request.nextUrl.clone()
            redirectUrl.pathname = '/login'
            return NextResponse.redirect(redirectUrl)
        }

        // Verify the user has a coaches record
        const { data: coachData } = await supabase
            .from('coaches')
            .select('id, subscription_status')
            .eq('id', user.id)
            .maybeSingle()

        const coach = coachData as Pick<Coach, 'id' | 'subscription_status'> | null

        if (!coach) {
            // User is logged in but isn't a coach → redirect
            const redirectUrl = request.nextUrl.clone()
            redirectUrl.pathname = '/login'
            return NextResponse.redirect(redirectUrl)
        }

        return supabaseResponse
    }

    // ============================================================
    // 2. WHITE-LABEL route handling for /c/[coach_slug]/*
    // ============================================================
    if (pathname.startsWith('/c/')) {
        const segments = pathname.split('/')
        const coachSlug = segments[2] // /c/[coach_slug]/...

        if (!coachSlug) {
            return supabaseResponse
        }

        // Fetch coach branding by slug (public read — no auth required)
        const { data: coachData } = await supabase
            .from('coaches')
            .select('id, brand_name, primary_color, logo_url, slug')
            .eq('slug', coachSlug)
            .maybeSingle()

        const coach = coachData as Pick<Coach, 'id' | 'brand_name' | 'primary_color' | 'logo_url' | 'slug'> | null

        if (!coach) {
            // Coach slug doesn't exist → 404
            const notFoundUrl = request.nextUrl.clone()
            notFoundUrl.pathname = '/not-found'
            return NextResponse.redirect(notFoundUrl)
        }

        // Forward branding as request headers so layouts can read them
        const response = NextResponse.next({ request })

        // Copy all cookies from supabaseResponse
        supabaseResponse.cookies.getAll().forEach(cookie => {
            response.cookies.set(cookie.name, cookie.value)
        })

        response.headers.set('x-coach-id', coach.id)
        response.headers.set('x-coach-slug', coach.slug)
        response.headers.set('x-coach-brand-name', coach.brand_name)
        response.headers.set('x-coach-primary-color', coach.primary_color)
        response.headers.set('x-coach-logo-url', coach.logo_url ?? '')

        // Check if client is authenticated for protected /c/* routes (not login page)
        const isLoginPage = pathname === `/c/${coachSlug}/login`

        if (!isLoginPage) {
            if (!user) {
                const redirectUrl = request.nextUrl.clone()
                redirectUrl.pathname = `/c/${coachSlug}/login`
                const redirect = NextResponse.redirect(redirectUrl)
                response.cookies.getAll().forEach(cookie => {
                    redirect.cookies.set(cookie.name, cookie.value)
                })
                return redirect
            }

            // Verify the user is a client belonging to this coach
            const { data: clientData } = await supabase
                .from('clients')
                .select('id, coach_id, force_password_change, onboarding_completed, is_active')
                .eq('id', user.id)
                .eq('coach_id', coach.id)
                .maybeSingle()

            const client = clientData as Pick<Client, 'id' | 'coach_id' | 'force_password_change' | 'onboarding_completed' | 'is_active'> | null

            if (!client) {
                // Logged in user is NOT a client of this coach
                const redirectUrl = request.nextUrl.clone()
                redirectUrl.pathname = `/c/${coachSlug}/login`
                return NextResponse.redirect(redirectUrl)
            }

            // Suspend access if inactive
            if (client.is_active === false && !pathname.includes('/suspended')) {
                const redirectUrl = request.nextUrl.clone()
                redirectUrl.pathname = `/c/${coachSlug}/suspended`
                return NextResponse.redirect(redirectUrl)
            }

            // Force password change flow
            if (client.is_active !== false && client.force_password_change && !pathname.includes('/change-password')) {
                const redirectUrl = request.nextUrl.clone()
                redirectUrl.pathname = `/c/${coachSlug}/change-password`
                return NextResponse.redirect(redirectUrl)
            }

            // Force intake/onboarding flow right after password change
            if (client.is_active !== false && !client.force_password_change && !client.onboarding_completed && !pathname.includes('/onboarding')) {
                const redirectUrl = request.nextUrl.clone()
                redirectUrl.pathname = `/c/${coachSlug}/onboarding`
                return NextResponse.redirect(redirectUrl)
            }
        }

        return response
    }

    // ============================================================
    // 3. Redirect logged-in coaches away from auth pages
    // ============================================================
    if ((pathname.startsWith('/login') || pathname.startsWith('/register')) && user) {
        const { data: coachData } = await supabase
            .from('coaches')
            .select('id')
            .eq('id', user.id)
            .maybeSingle()

        const coach = coachData as Pick<Coach, 'id'> | null

        if (coach) {
            const redirectUrl = request.nextUrl.clone()
            redirectUrl.pathname = '/coach/dashboard'
            return NextResponse.redirect(redirectUrl)
        }
    }

    return supabaseResponse
}

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
