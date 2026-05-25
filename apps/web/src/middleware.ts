import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import type { Database, Tables } from '@/lib/database.types'
import type { EnterpriseStaffRole, WorkspaceSummary } from '@/domain/auth/types'
import { resolveCoachSubscriptionRedirect } from '@/lib/coach-subscription-gate'
import { resolvePostLoginRedirect } from '@/lib/auth/post-login-redirect.server'
import { listUserWorkspaces, resolvePreferredWorkspace } from '@/services/auth/workspace.service'
import { canAccessWorkspacePath, defaultWorkspaceHome } from '@/services/auth/workspace-route-guard.service'
import { BRAND_APP_ICON, BRAND_PRIMARY_COLOR, SYSTEM_PRIMARY_COLOR } from '@/lib/brand-assets'
import {
    clientIpFromRequest,
    jsonRateLimited,
    rateLimitAuth,
    rateLimitSignup,
    rateLimitPayment,
    rateLimitAdmin,
} from '@/lib/rate-limit'
import { getEnterpriseDomain, getEnterpriseUrl } from '@/lib/enterprise/domain'
import { ENTERPRISE_STAFF_ROLES } from '@/domain/org/permissions'

type Coach = Tables<'coaches'>
type Client = Tables<'clients'>

export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl
    const host = request.headers.get('host') ?? ''

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

    // SEC-002: rate limit auth-related POSTs — runs BEFORE enterprise subdomain rewrite
    // so enterprise.eva-app.cl/login and direct /org/login POSTs are both protected.
    if (request.method === 'POST') {
        const authPost =
            pathname === '/login' ||
            pathname === '/register' ||
            pathname === '/forgot-password' ||
            pathname === '/reset-password' ||
            pathname === '/registro-beta' ||
            pathname === '/org/login' ||
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

    // B-6: Enterprise subdomain rewrite — enterprise.eva-app.cl → /org/*
    if (host === getEnterpriseDomain()) {
        const url = request.nextUrl.clone()
        if (url.pathname === '/' || url.pathname === '') {
            // Show enterprise landing page, not login
            url.pathname = '/enterprise'
            return NextResponse.rewrite(url)
        }
        if (url.pathname === '/login') {
            url.pathname = '/org/login'
            return NextResponse.rewrite(url)
        }
        if (
            !url.pathname.startsWith('/org') &&
            !url.pathname.startsWith('/invite') &&
            !url.pathname.startsWith('/enterprise')
        ) {
            url.pathname = '/org' + url.pathname
        }
        return NextResponse.rewrite(url)
    }

    // Protect /org/* — accessible only via enterprise.eva-app.cl subdomain.
    // Redirect main domain requests to the enterprise subdomain.
    const isLocalDev = host.includes('localhost') || host.includes('127.0.0.1')
    if (pathname.startsWith('/org/') && !isLocalDev) {
        return NextResponse.redirect(getEnterpriseUrl() + pathname)
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

    // Gap 1: bifurcar por formato — invite_code (5 chars, sin O/0/I/1) vs slug
    const INVITE_CODE_RE = /^[A-Z2-9]{5}$/
    const SLUG_RE = /^[a-z0-9-]{3,50}$/
    const coachBrandingPromise = cRouteSlug
        ? (() => {
              const base = supabase
                  .from('coaches')
                  .select('id, brand_name, primary_color, logo_url, slug, loader_text, use_custom_loader, loader_text_color, loader_icon_mode, subscription_tier')
              if (INVITE_CODE_RE.test(cRouteSlug)) return base.eq('invite_code', cRouteSlug).maybeSingle()
              if (SLUG_RE.test(cRouteSlug)) return base.eq('slug', cRouteSlug).maybeSingle()
              return null
          })()
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
    // 0. PROTECT /org/* routes (enterprise org admins/owners)
    // ============================================================
    if (pathname.startsWith('/org/')) {
        const isPublicOrgPath =
            pathname === '/org/login' ||
            pathname.startsWith('/org/setup-account')
        if (isPublicOrgPath) return supabaseResponse

        if (!user) {
            const redirectUrl = request.nextUrl.clone()
            redirectUrl.pathname = '/org/login'
            return NextResponse.redirect(redirectUrl)
        }

        // MFA enforcement: org_owner/org_admin must enroll TOTP before accessing org
        const appMeta = user.app_metadata as { requires_mfa_setup?: boolean }
        if (appMeta?.requires_mfa_setup) {
            // Extract slug from /org/[slug]/...
            const slugMatch = pathname.match(/^\/org\/([^/]+)/)
            const slug = slugMatch?.[1]
            if (slug && !pathname.includes('/setup-mfa')) {
                const redirectUrl = request.nextUrl.clone()
                redirectUrl.pathname = `/org/${slug}/setup-mfa`
                return NextResponse.redirect(redirectUrl)
            }
        }

        const orgWorkspace = await resolveOrgRouteWorkspace(supabase, user.id, pathname)
        if (!orgWorkspace) {
            const fallback = await resolveCoachRouteWorkspace(supabase, user.id)
            const redirectUrl = request.nextUrl.clone()
            redirectUrl.pathname = fallback && fallback !== 'select'
                ? defaultWorkspaceHome(fallback)
                : '/workspace/select'
            redirectUrl.searchParams.set('reason', 'org_routes_require_enterprise_staff')
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

        const activeWorkspace = await resolveCoachRouteWorkspace(supabase, user.id)
        if (activeWorkspace === 'select') {
            const redirectUrl = request.nextUrl.clone()
            redirectUrl.pathname = '/workspace/select'
            redirectUrl.searchParams.set('from', 'coach')
            return NextResponse.redirect(redirectUrl)
        }

        if (activeWorkspace) {
            const decision = canAccessWorkspacePath(activeWorkspace, pathname)
            if (!decision.allowed) {
                const redirectUrl = request.nextUrl.clone()
                redirectUrl.pathname = decision.redirectTo ?? defaultWorkspaceHome(activeWorkspace)
                if (decision.reason) redirectUrl.searchParams.set('reason', decision.reason)
                return NextResponse.redirect(redirectUrl)
            }
        }

        if (pathname === '/coach/dashboard') {
            const redirectPath = await resolvePostLoginRedirect(supabase, user.id)
            if (redirectPath.startsWith('/org/')) {
                const redirectUrl = request.nextUrl.clone()
                redirectUrl.pathname = redirectPath
                return NextResponse.redirect(redirectUrl)
            }
        }

        if (
            coach.subscription_status === 'org_managed' &&
            (pathname.startsWith('/coach/subscription') || pathname.startsWith('/coach/settings'))
        ) {
            const redirectUrl = request.nextUrl.clone()
            redirectUrl.pathname = '/coach/dashboard'
            redirectUrl.searchParams.set('managed_by', 'org')
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

        // Debounced in DB (no-op if <5min since last update), so await is safe
        await supabase.rpc('touch_coach_activity', { p_coach_id: user.id })

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

        const buildClientRouteResponse = () => {
            const response = NextResponse.next({ request: { headers: requestHeaders } })

            // Copy all cookies from supabaseResponse
            supabaseResponse.cookies.getAll().forEach(cookie => {
                response.cookies.set(cookie.name, cookie.value)
            })

            // Also set on response for backwards compatibility with any response-header consumers
            response.headers.set('x-coach-id', requestHeaders.get('x-coach-id') ?? coach.id)
            response.headers.set('x-coach-slug', requestHeaders.get('x-coach-slug') ?? coach.slug)
            response.headers.set('x-coach-brand-name', requestHeaders.get('x-coach-brand-name') ?? coach.brand_name)
            response.headers.set('x-coach-primary-color', requestHeaders.get('x-coach-primary-color') ?? resolvedColor)
            response.headers.set('x-coach-logo-url', requestHeaders.get('x-coach-logo-url') ?? coach.logo_url?.trim() ?? BRAND_APP_ICON)
            response.headers.set('x-coach-loader-text', requestHeaders.get('x-coach-loader-text') ?? '')
            response.headers.set('x-coach-use-custom-loader', requestHeaders.get('x-coach-use-custom-loader') ?? 'false')
            response.headers.set('x-coach-loader-text-color', requestHeaders.get('x-coach-loader-text-color') ?? '')
            response.headers.set('x-coach-loader-icon-mode', requestHeaders.get('x-coach-loader-icon-mode') ?? 'eva')
            response.headers.set('x-coach-subscription-tier', requestHeaders.get('x-coach-subscription-tier') ?? 'starter')
            return response
        }

        // Check if client is authenticated for protected /c/* routes (not login page)
        const isLoginPage = pathname.endsWith('/login')

        if (isLoginPage && user) {
            // If already logged in, check if it's a client of this coach (direct or via org) and redirect to dashboard
            const { data: clientData } = await supabase
                .from('clients')
                .select('id, coach_id, org_id')
                .eq('id', user.id)
                .maybeSingle()

            const isDirectClient = clientData?.coach_id === coach.id
            let isOrgClient = false
            if (!isDirectClient && clientData?.org_id) {
                const { data: orgMember } = await supabase
                    .from('organization_members')
                    .select('id')
                    .eq('org_id', clientData.org_id)
                    .eq('coach_id', coach.id)
                    .eq('status', 'active')
                    .is('deleted_at', null)
                    .maybeSingle()
                isOrgClient = !!orgMember
            }

            if (isDirectClient || isOrgClient) {
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
                supabaseResponse.cookies.getAll().forEach(cookie => {
                    redirect.cookies.set(cookie.name, cookie.value)
                })
                return redirect
            }

            // Verify the user is a client belonging to this coach (direct or via org membership)
            const { data: rawClientData } = await supabase
                .from('clients')
                .select('id, coach_id, org_id, force_password_change, onboarding_completed, is_active, is_archived, use_coach_brand_colors')
                .eq('id', user.id)
                .maybeSingle()

            type ClientWithBrand = Client & { use_coach_brand_colors?: boolean }
            let client: ClientWithBrand | null = null
            if (rawClientData) {
                if (rawClientData.coach_id === coach.id) {
                    client = rawClientData as unknown as ClientWithBrand
                } else if (rawClientData.org_id) {
                    const { data: orgMember } = await supabase
                        .from('organization_members')
                        .select('id')
                        .eq('org_id', rawClientData.org_id)
                        .eq('coach_id', coach.id)
                        .eq('status', 'active')
                        .is('deleted_at', null)
                        .maybeSingle()
                    if (orgMember) client = rawClientData as unknown as ClientWithBrand
                }
            }

            if (!client) {
                // Logged in user is NOT a client of this coach or org
                const redirectUrl = request.nextUrl.clone()
                redirectUrl.pathname = `/c/${coachSlug}/login`
                return NextResponse.redirect(redirectUrl)
            }

            if (client.org_id) {
                const { data: orgBrand } = await supabase
                    .from('organizations')
                    .select('name, primary_color, logo_url')
                    .eq('id', client.org_id)
                    .maybeSingle()

                if (orgBrand) {
                    requestHeaders.set('x-coach-brand-name', orgBrand.name ?? coach.brand_name)
                    requestHeaders.set('x-coach-primary-color', orgBrand.primary_color || resolvedColor)
                    requestHeaders.set('x-coach-logo-url', orgBrand.logo_url?.trim() || coach.logo_url?.trim() || BRAND_APP_ICON)
                    requestHeaders.set('x-workspace-brand-source', 'organization')
                }
            }

            // Default behavior if columns are missing or false
            const useBrandColors = client.use_coach_brand_colors ?? true
            requestHeaders.set('x-client-use-brand-colors', String(useBrandColors))

            if (!client.org_id && !useBrandColors) {
                requestHeaders.set('x-coach-primary-color', SYSTEM_PRIMARY_COLOR)
            }

            const response = buildClientRouteResponse()

            // Suspend access if archived or inactive
            const isBlocked = client.is_archived === true || client.is_active === false
            if (isBlocked && !pathname.includes('/suspended')) {
                const redirectUrl = request.nextUrl.clone()
                redirectUrl.pathname = `/c/${coachSlug}/suspended`
                return NextResponse.redirect(redirectUrl)
            }

            // Force password change flow
            if (!isBlocked && client.force_password_change && !pathname.includes('/change-password')) {
                const redirectUrl = request.nextUrl.clone()
                redirectUrl.pathname = `/c/${coachSlug}/change-password`
                return NextResponse.redirect(redirectUrl)
            }

            // Force intake/onboarding flow right after password change
            if (!isBlocked && !client.force_password_change && !client.onboarding_completed && !pathname.includes('/onboarding')) {
                const redirectUrl = request.nextUrl.clone()
                redirectUrl.pathname = `/c/${coachSlug}/onboarding`
                return NextResponse.redirect(redirectUrl)
            }
        }

        return buildClientRouteResponse()
    }

    // ============================================================
    // 3. AUTO-REDIRECT authenticated users away from root /
    // ============================================================
    if (pathname === '/' && user) {
        const redirectPath = await resolvePostLoginRedirect(supabase, user.id)
        if (redirectPath !== '/login') {
            const redirectUrl = request.nextUrl.clone()
            redirectUrl.pathname = redirectPath
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
            const redirectPath = await resolvePostLoginRedirect(supabase, user.id)
            const redirectUrl = request.nextUrl.clone()
            redirectUrl.pathname = redirectPath
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

async function resolveCoachRouteWorkspace(
    supabase: SupabaseClient<Database>,
    userId: string
): Promise<WorkspaceSummary | 'select' | null> {
    const preferred = await resolvePreferredWorkspace(supabase, userId)
    if (preferred) return preferred

    const workspaces = await listUserWorkspaces(supabase, userId)
    if (workspaces.length > 1) return 'select'
    return workspaces[0] ?? null
}

async function resolveOrgRouteWorkspace(
    supabase: SupabaseClient<Database>,
    userId: string,
    pathname: string
): Promise<WorkspaceSummary | null> {
    const slug = pathname.match(/^\/org\/([^/]+)/)?.[1]
    if (!slug) return null

    const { data: org } = await supabase
        .from('organizations')
        .select('id, slug, name')
        .eq('slug', slug)
        .is('deleted_at', null)
        .maybeSingle()
    if (!org) return null

    const { data: member } = await supabase
        .from('organization_members')
        .select('id, role')
        .eq('org_id', org.id)
        .eq('user_id', userId)
        .in('role', ENTERPRISE_STAFF_ROLES)
        .eq('status', 'active')
        .is('deleted_at', null)
        .maybeSingle()
    if (!member) return null

    return {
        type: 'enterprise_staff',
        userId,
        orgId: org.id,
        memberId: member.id,
        role: member.role as EnterpriseStaffRole,
        label: `${org.name} - Admin`,
        brandName: org.name,
        slug: org.slug,
    }
}
