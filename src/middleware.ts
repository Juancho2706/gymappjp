import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database, Tables } from '@/lib/database.types'
import { resolveCoachSubscriptionRedirect } from '@/lib/coach-subscription-gate'
import { BRAND_APP_ICON, BRAND_PRIMARY_COLOR, SYSTEM_PRIMARY_COLOR } from '@/lib/brand-assets'
import {
    clientIpFromRequest,
    jsonRateLimited,
    rateLimitAuth,
    rateLimitSignup,
    rateLimitPayment,
    rateLimitAdmin,
} from '@/lib/rate-limit'

type Coach = Tables<'coaches'>
type Client = Tables<'clients'>

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl

    // Keep webhook endpoint lightweight and avoid auth calls in middleware.
    if (pathname === '/api/payments/webhook') {
        return NextResponse.next({ request })
    }

    // Edge Config kill switch — disable free tier registration without a deploy.
    // Set free_tier_kill_switch=true in Vercel Edge Config to block /register and /pricing.
    if (pathname === '/register' || pathname === '/registro-beta') {
        const edgeConfigId = process.env.EDGE_CONFIG
        if (edgeConfigId) {
            try {
                const { get } = await import('@vercel/edge-config')
                const killed = await get<boolean>('free_tier_kill_switch')
                if (killed) {
                    const url = request.nextUrl.clone()
                    url.pathname = '/pricing'
                    url.searchParams.set('notice', 'registration_paused')
                    return NextResponse.redirect(url)
                }
            } catch {
                // Edge Config unavailable — allow through (fail open)
            }
        }
    }

    const ip = clientIpFromRequest(request)

    // SEC-002: rate limit auth-related POSTs (login, register, password flows, client login).
    if (request.method === 'POST') {
        const authPost =
            pathname === '/login' ||
            pathname === '/register' ||
            pathname === '/forgot-password' ||
            pathname === '/reset-password' ||
            pathname === '/registro-beta' ||
            /^\/c\/[^/]+\/login$/.test(pathname)
        if (authPost) {
            const rl = await rateLimitAuth(ip)
            if (!rl.ok) return jsonRateLimited(rl.retryAfter)
        }
        // Tighter per-IP limit for account creation (5/hour) — prevents free-tier abuse
        if (pathname === '/register' || pathname === '/registro-beta') {
            const rl = await rateLimitSignup(ip)
            if (!rl.ok) return jsonRateLimited(rl.retryAfter)
        }

        // SEC-003: rate limit payment mutation endpoints (excluding webhook).
        if (pathname.startsWith('/api/payments/')) {
            const rl = await rateLimitPayment(ip)
            if (!rl.ok) return jsonRateLimited(rl.retryAfter)
        }

        // SEC-004: rate limit admin mutation endpoints.
        if (pathname.startsWith('/admin/')) {
            const rl = await rateLimitAdmin(ip)
            if (!rl.ok) return jsonRateLimited(rl.retryAfter)
        }
    }

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

    // For /c/ routes, coach fetch is independent of auth — start both in parallel to save ~100-200ms TTFB
    const cRouteSlug = pathname.startsWith('/c/') ? pathname.split('/')[2] ?? null : null
    const coachBrandingPromise = cRouteSlug
        ? supabase
              .from('coaches')
              .select('id, brand_name, primary_color, logo_url, slug, loader_text, use_custom_loader, loader_text_color, loader_icon_mode, subscription_tier')
              .eq('slug', cRouteSlug)
              .maybeSingle()
        : null

    // On /c/[slug]/login with no session cookie, skip the Supabase auth round-trip — the user
    // is definitely unauthenticated, so there is no session to refresh.
    const isClientLoginPage = /^\/c\/[^/]+\/login$/.test(pathname)
    const noSessionCookie = isClientLoginPage && (() => {
        const projectRef = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').match(/https?:\/\/([^.]+)\./)?.[1] ?? ''
        return !request.cookies.getAll().some(c => c.name.startsWith(`sb-${projectRef}-auth-token`))
    })()

    // Refresh session — IMPORTANT: do not remove (skipped only on login page with no session)
    const { data: { user } } = noSessionCookie
        ? { data: { user: null } }
        : await supabase.auth.getUser()

    // ============================================================
    // ADMIN ROUTE PROTECTION
    // ============================================================
    if (pathname.startsWith('/admin')) {
        // Allow admin login page without check
        if (pathname === '/admin/login') {
            return supabaseResponse
        }

        // Must be authenticated
        if (!user) {
            const redirectUrl = request.nextUrl.clone()
            redirectUrl.pathname = '/admin/login'
            return NextResponse.redirect(redirectUrl)
        }

        // Must be in admin allowlist
        const { isAdminEmail } = await import('@/lib/admin/admin-gate')
        if (!isAdminEmail(user.email)) {
            const redirectUrl = request.nextUrl.clone()
            redirectUrl.pathname = '/'
            return NextResponse.redirect(redirectUrl)
        }

        return supabaseResponse
    }

    // ============================================================
    // 1. PROTECT /coach/* routes (only for coaches)
    // ============================================================
    if (pathname.startsWith('/coach')) {
        if (!user) {
            const redirectUrl = request.nextUrl.clone()
            redirectUrl.pathname = '/login'
            return NextResponse.redirect(redirectUrl)
        }

        // OAuth onboarding complete page: user is authenticated but has no coaches record yet
        if (pathname === '/coach/onboarding/complete') {
            return supabaseResponse
        }

        // Verify the user has a coaches record
        const { data: coachData } = await supabase
            .from('coaches')
            .select('id, subscription_status, subscription_tier, current_period_end')
            .eq('id', user.id)
            .maybeSingle()

        const coach = coachData as Pick<Coach, 'id' | 'subscription_status' | 'current_period_end'> & { subscription_tier?: string } | null

        if (!coach) {
            // User is logged in but isn't a coach → send to OAuth onboarding
            const redirectUrl = request.nextUrl.clone()
            redirectUrl.pathname = '/coach/onboarding/complete'
            return NextResponse.redirect(redirectUrl)
        }

        // Free tier email pending: block access until email confirmed
        if (coach.subscription_status === 'pending_email' && coach.subscription_tier === 'free') {
            const redirectUrl = request.nextUrl.clone()
            redirectUrl.pathname = '/verify-email'
            return NextResponse.redirect(redirectUrl)
        }

        const redirectPath = resolveCoachSubscriptionRedirect(pathname, coach.subscription_status, coach.current_period_end)
        if (redirectPath) {
            const redirectUrl = request.nextUrl.clone()
            redirectUrl.pathname = redirectPath
            if (redirectPath === '/coach/reactivate') {
                redirectUrl.searchParams.set('reason', 'subscription_blocked')
            }
            return NextResponse.redirect(redirectUrl)
        }

        return supabaseResponse
    }

    // ============================================================
    // 2. WHITE-LABEL route handling for /c/[coach_slug]/*
    // ============================================================
    if (pathname.startsWith('/c/')) {
        const coachSlug = cRouteSlug

        if (!coachSlug) {
            return supabaseResponse
        }

        // Coach branding fetch was started in parallel with getUser() above — await the result
        const { data: coachData } = await coachBrandingPromise!

        const coach = coachData as Pick<Coach, 'id' | 'brand_name' | 'primary_color' | 'logo_url' | 'slug' | 'loader_text' | 'use_custom_loader' | 'loader_text_color' | 'loader_icon_mode'> | null

        if (!coach) {
            // Coach slug doesn't exist → 404
            const notFoundUrl = request.nextUrl.clone()
            notFoundUrl.pathname = '/not-found'
            return NextResponse.redirect(notFoundUrl)
        }

        const resolvedColor = coach.primary_color || BRAND_PRIMARY_COLOR

        // Forward branding as request headers so layouts and loading.tsx can read them
        const requestHeaders = new Headers(request.headers)
        requestHeaders.set('x-coach-id', coach.id)
        requestHeaders.set('x-coach-slug', coach.slug)
        requestHeaders.set('x-coach-brand-name', coach.brand_name)
        requestHeaders.set('x-coach-primary-color', resolvedColor)
        requestHeaders.set('x-coach-logo-url', coach.logo_url?.trim() || BRAND_APP_ICON)
        requestHeaders.set('x-coach-loader-text', (coach as any).loader_text?.trim() || '')
        requestHeaders.set('x-coach-use-custom-loader', String((coach as any).use_custom_loader ?? false))
        requestHeaders.set('x-coach-loader-text-color', (coach as any).loader_text_color?.trim() || '')
        requestHeaders.set('x-coach-loader-icon-mode', (coach as any).loader_icon_mode || 'eva')
        requestHeaders.set('x-coach-subscription-tier', (coach as any).subscription_tier ?? 'starter')

        const response = NextResponse.next({ request: { headers: requestHeaders } })

        // Copy all cookies from supabaseResponse
        supabaseResponse.cookies.getAll().forEach(cookie => {
            response.cookies.set(cookie.name, cookie.value)
        })

        // Also set on response for backwards compatibility with any response-header consumers
        response.headers.set('x-coach-id', coach.id)
        response.headers.set('x-coach-slug', coach.slug)
        response.headers.set('x-coach-brand-name', coach.brand_name)
        response.headers.set('x-coach-primary-color', resolvedColor)
        response.headers.set('x-coach-logo-url', coach.logo_url?.trim() || BRAND_APP_ICON)
        response.headers.set('x-coach-loader-text', (coach as any).loader_text?.trim() || '')
        response.headers.set('x-coach-use-custom-loader', String((coach as any).use_custom_loader ?? false))
        response.headers.set('x-coach-loader-text-color', (coach as any).loader_text_color?.trim() || '')
        response.headers.set('x-coach-loader-icon-mode', (coach as any).loader_icon_mode || 'eva')
        response.headers.set('x-coach-subscription-tier', (coach as any).subscription_tier ?? 'starter')

        // Check if client is authenticated for protected /c/* routes (not login page)
        const isLoginPage = pathname.endsWith('/login')

        if (isLoginPage && user) {
            // If already logged in, check if it's a client of this coach and redirect to dashboard
            const { data: clientData } = await supabase
                .from('clients')
                .select('id, coach_id')
                .eq('id', user.id)
                .eq('coach_id', coach.id)
                .maybeSingle()

            if (clientData) {
                const dashboardUrl = request.nextUrl.clone()
                dashboardUrl.pathname = `/c/${coachSlug}/dashboard`
                return NextResponse.redirect(dashboardUrl)
            }
        }

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
                .select('id, coach_id, force_password_change, onboarding_completed, is_active, use_coach_brand_colors')
                .eq('id', user.id)
                .eq('coach_id', coach.id)
                .maybeSingle()

            const client = clientData as (Client & { use_coach_brand_colors?: boolean }) | null

            if (!client) {
                // Logged in user is NOT a client of this coach
                const redirectUrl = request.nextUrl.clone()
                redirectUrl.pathname = `/c/${coachSlug}/login`
                return NextResponse.redirect(redirectUrl)
            }

            // Default behavior if columns are missing or false
            const useBrandColors = client.use_coach_brand_colors ?? true
            response.headers.set('x-client-use-brand-colors', String(useBrandColors))

            if (!useBrandColors) {
                response.headers.set('x-coach-primary-color', SYSTEM_PRIMARY_COLOR)
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
    // 3. AUTO-REDIRECT authenticated users away from root /
    // ============================================================
    if (pathname === '/' && user) {
        const [{ data: coachData }, { data: clientData }] = await Promise.all([
            supabase.from('coaches').select('id').eq('id', user.id).maybeSingle(),
            supabase.from('clients').select('id, coach_id, coaches(slug)').eq('id', user.id).maybeSingle(),
        ])

        if (coachData) {
            const redirectUrl = request.nextUrl.clone()
            redirectUrl.pathname = '/coach/dashboard'
            return NextResponse.redirect(redirectUrl)
        }

        if (clientData?.coaches) {
            const coach = clientData.coaches as unknown as Pick<Coach, 'slug'>
            const redirectUrl = request.nextUrl.clone()
            redirectUrl.pathname = `/c/${coach.slug}/dashboard`
            return NextResponse.redirect(redirectUrl)
        }
    }

    // ============================================================
    // 4. Redirect logged-in coaches away from auth pages
    // EXCEPT for /reset-password which needs the session
    // ============================================================
    const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register') || pathname.startsWith('/forgot-password') || pathname.startsWith('/registro-beta')
    if (isAuthPage && user) {
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
        '/((?!_next/static|_next/image|favicon.ico|api/manifest/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
    ],
}
