import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
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
import { getEnterpriseDomain } from '@/lib/enterprise/domain'
import { ENTERPRISE_STAFF_ROLES } from '@/domain/org/permissions'

type Coach = Tables<'coaches'>
type Client = Tables<'clients'>

/**
 * F2/B-9: answer "is this coach an active member of this org?" from the proxy. The alumno's
 * RLS-scoped client cannot read `organization_members` (policy `org_members_see_peers` gates it
 * to active org members), so a direct table read here always returned null and mis-branded EVERY
 * enterprise alumno as orphaned (neutral EVA) instead of their org's white-label. The SECURITY
 * DEFINER RPC returns just the boolean without leaking any row.
 */
async function isCoachActiveOrgMember(
    db: SupabaseClient<Database>,
    orgId: string,
    coachId: string,
): Promise<boolean> {
    const { data, error } = await db.rpc('is_coach_active_org_member', { p_org_id: orgId, p_coach_id: coachId })
    if (error) {
        console.error('[proxy] is_coach_active_org_member error:', error.message)
        return false
    }
    return data === true
}

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl
    const host = request.headers.get('host') ?? ''

    // Keep webhook endpoint lightweight and avoid auth calls in middleware.
    if (pathname === '/api/payments/webhook') {
        return NextResponse.next({ request })
    }

    // Edge Config kill switch — disable free tier registration without a deploy.
    // Set free_tier_kill_switch=true in Vercel Edge Config to block /register and /pricing.
    if (pathname === '/register') {
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
            pathname === '/org/login' ||
            /^\/c\/[^/]+\/login$/.test(pathname) ||
            /^\/e\/[^/]+\/login$/.test(pathname) ||
            // §3.5: la puerta de login del pool team (Movida = 300+ alumnos) debe ir throttled
            // igual que /c y /e — sin esto teamClientLoginAction corre signInWithPassword sin límite.
            // El POST de /consent también pasa por aquí (otra acción auth-adyacente del shell /t).
            /^\/t\/[^/]+\/login$/.test(pathname) ||
            /^\/t\/[^/]+\/consent$/.test(pathname)
        if (authPost) {
            const rl = await rateLimitAuth(ip)
            if (!rl.ok) return jsonRateLimited(rl.retryAfter)
        }
        // Tighter per-IP limit for account creation (5/hour) — prevents free-tier abuse
        if (pathname === '/register') {
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

    // API routes authenticate themselves (own getUser / Bearer token / CRON_SECRET) and return JSON,
    // not redirects — they don't need the middleware session validation + routing below. Skipping it
    // removes a redundant GoTrue /user round-trip per API request (mobile, cron, status polling, etc.).
    // Rate limits for payment/admin POSTs above already ran; the webhook is handled earlier.
    if (pathname.startsWith('/api/')) {
        return NextResponse.next({ request })
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
            !url.pathname.startsWith('/enterprise') &&
            // P1.4: enterprise alumno area lives at /e/[org_slug]/* (its own route tree, org
            // branding) — serve it directly on the subdomain, never /org-prefix it.
            !url.pathname.startsWith('/e/') &&
            !url.pathname.startsWith('/api') &&
            // Shared auth pages/routes live at the app root (route group (auth) + /auth/*);
            // don't prefix them with /org or they 404 on the enterprise subdomain. Covers
            // forgot/reset password and the recovery callback/exchange/confirm routes.
            !url.pathname.startsWith('/forgot-password') &&
            !url.pathname.startsWith('/reset-password') &&
            !url.pathname.startsWith('/auth')
        ) {
            url.pathname = '/org' + url.pathname
        }
        return NextResponse.rewrite(url)
    }

    // Protect /org/* — accessible only via enterprise.eva-app.cl subdomain.
    // ARCHIVADO 2026-06: subdominio enterprise redirige al home — ver docs/plans/estrategia/01-PLAN-archivado-enterprise.md §F3
    const isLocalDev = host.includes('localhost') || host.includes('127.0.0.1')
    if (pathname.startsWith('/org/') && !isLocalDev) {
        return NextResponse.redirect(new URL('/login', request.url))
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
                    // P1.0: optionally scope auth cookies to a shared domain (AUTH_COOKIE_DOMAIN,
                    // e.g. `.eva-app.cl`) for the future /e/* alumno area. Unset = current behavior.
                    const cookieDomain = process.env.AUTH_COOKIE_DOMAIN || undefined
                    cookiesToSet.forEach(({ name, value, options }) =>
                        supabaseResponse.cookies.set(name, value, cookieDomain ? { ...options, domain: cookieDomain } : options)
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

        const appMeta = user.app_metadata as { requires_mfa_setup?: boolean; requires_password_change?: boolean }
        const slugMatch = pathname.match(/^\/org\/([^/]+)/)
        const slug = slugMatch?.[1]

        // First-login password change: any staff created with temp password must change it first
        if (appMeta?.requires_password_change && slug && !pathname.includes('/setup-password')) {
            const redirectUrl = request.nextUrl.clone()
            redirectUrl.pathname = `/org/${slug}/setup-password`
            return NextResponse.redirect(redirectUrl)
        }

        // MFA enforcement: org_owner/org_admin must enroll TOTP before accessing org
        if (appMeta?.requires_mfa_setup && slug && !pathname.includes('/setup-mfa')) {
            const redirectUrl = request.nextUrl.clone()
            redirectUrl.pathname = `/org/${slug}/setup-mfa`
            return NextResponse.redirect(redirectUrl)
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
            (coach.subscription_status === 'org_managed' || coach.subscription_status === 'team_managed') &&
            (pathname.startsWith('/coach/subscription') || pathname.startsWith('/coach/settings')) &&
            // C (Settings hub): team_managed SÍ entra a /coach/settings (hub context-aware del
            // team: Módulos + Mi Equipo + cuenta) — EXCEPTO el preview de marca personal.
            // Suscripción sigue bloqueada para todo managed.
            !(
                coach.subscription_status === 'team_managed' &&
                pathname.startsWith('/coach/settings') &&
                !pathname.startsWith('/coach/settings/preview')
            )
        ) {
            const redirectUrl = request.nextUrl.clone()
            redirectUrl.pathname = '/coach/dashboard'
            redirectUrl.searchParams.set('managed_by', coach.subscription_status === 'team_managed' ? 'team' : 'org')
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
    // 1.5 ENTERPRISE ALUMNO AREA — /e/[org_slug]/* (F3, same-domain)
    // Serves the enterprise student the SAME client app, ORG-branded, keeping the visible URL at
    // /e/[org_slug]/* by rewriting to /c/[coach_slug]/* + an x-client-base-path header (the client
    // app — F2 — builds its in-app links from that base). One gated RPC resolves everything.
    // ============================================================
    if (pathname.startsWith('/e/')) {
        const eSegs = pathname.split('/')          // ['', 'e', orgSlug, ...rest]
        const eOrgSlug = eSegs[2] ?? ''
        if (!eOrgSlug) return supabaseResponse
        const eRest = '/' + eSegs.slice(3).join('/')   // '/dashboard' | '/login' | '/'

        // Login page is public. If already a member of this org, send them into the area.
        if (eRest === '/login') {
            if (user) {
                const { data: ctx } = await supabase.rpc('get_enterprise_alumno_context', { p_org_slug: eOrgSlug })
                if (ctx && (ctx as Record<string, unknown>).is_member === true) {
                    const r = request.nextUrl.clone()
                    r.pathname = `/e/${eOrgSlug}/dashboard`
                    return NextResponse.redirect(r)
                }
            }
            return supabaseResponse
        }

        // Protected — require auth
        if (!user) {
            const r = request.nextUrl.clone()
            r.pathname = `/e/${eOrgSlug}/login`
            const redirect = NextResponse.redirect(r)
            supabaseResponse.cookies.getAll().forEach(c => redirect.cookies.set(c.name, c.value))
            return redirect
        }

        const { data: eCtxRaw } = await supabase.rpc('get_enterprise_alumno_context', { p_org_slug: eOrgSlug })
        const eCtx = eCtxRaw as Record<string, unknown> | null
        if (!eCtx) {
            const r = request.nextUrl.clone(); r.pathname = '/not-found'
            return NextResponse.redirect(r)
        }
        if (eCtx.is_member !== true) {
            const r = request.nextUrl.clone(); r.pathname = `/e/${eOrgSlug}/login`
            return NextResponse.redirect(r)
        }

        // Org white-label request headers (mirror the /c org-branding block) + base path so the
        // client app builds links under /e/[org_slug].
        const eStr = (v: unknown) => (typeof v === 'string' ? v : '')
        const eRequestHeaders = new Headers(request.headers)
        eRequestHeaders.set('x-coach-id', eStr(eCtx.coach_id) || eStr(eCtx.org_id))
        eRequestHeaders.set('x-coach-slug', eStr(eCtx.coach_slug))
        eRequestHeaders.set('x-coach-brand-name', eStr(eCtx.name) || 'EVA')
        eRequestHeaders.set('x-coach-primary-color', eStr(eCtx.primary_color) || SYSTEM_PRIMARY_COLOR)
        eRequestHeaders.set('x-coach-logo-url', eStr(eCtx.logo_url).trim() || BRAND_APP_ICON)
        eRequestHeaders.set('x-coach-subscription-tier', 'pro')
        eRequestHeaders.set('x-coach-accent-light', eStr(eCtx.accent_light).trim())
        eRequestHeaders.set('x-coach-accent-dark', eStr(eCtx.accent_dark).trim())
        eRequestHeaders.set('x-coach-logo-url-dark', eStr(eCtx.logo_url_dark).trim())
        eRequestHeaders.set('x-coach-neutral-tint', String(eCtx.neutral_tint === true))
        eRequestHeaders.set('x-coach-loader-text', eStr(eCtx.loader_text).trim())
        eRequestHeaders.set('x-coach-use-custom-loader', String(eCtx.use_custom_loader === true))
        eRequestHeaders.set('x-coach-loader-text-color', eStr(eCtx.loader_text_color).trim())
        eRequestHeaders.set('x-coach-loader-icon-mode', eCtx.loader_icon_mode === 'text' ? 'none' : 'coach')
        eRequestHeaders.set('x-client-use-brand-colors', 'true')
        eRequestHeaders.set('x-workspace-brand-source', 'organization')
        eRequestHeaders.set('x-client-base-path', `/e/${eOrgSlug}`)

        // Suspended: redirigir SOLO si hay coach activo (la página se sirve vía rewrite a /c).
        // Orphan suspendido cae al holding (sin esta condición: loop suspended<->dashboard).
        const eBlocked = eCtx.is_archived === true || eCtx.is_active === false
        const eHasActiveCoach = !!eCtx.coach_slug && eCtx.coach_active === true
        if (eBlocked && eHasActiveCoach && !eRest.includes('/suspended')) {
            const r = request.nextUrl.clone(); r.pathname = `/e/${eOrgSlug}/suspended`
            return NextResponse.redirect(r)
        }

        // Pool / orphan (no active coach) → org-branded holding dashboard, no rewrite.
        if (!eCtx.coach_slug || eCtx.coach_active !== true) {
            if (eRest === '/dashboard' || eRest === '/') {
                const resp = NextResponse.next({ request: { headers: eRequestHeaders } })
                supabaseResponse.cookies.getAll().forEach(c => resp.cookies.set(c.name, c.value))
                return resp
            }
            const r = request.nextUrl.clone(); r.pathname = `/e/${eOrgSlug}/dashboard`
            return NextResponse.redirect(r)
        }

        // Force-password / onboarding guards (targets are /e so this branch re-runs cleanly).
        if (!eBlocked && eCtx.force_password_change === true && !eRest.includes('/change-password')) {
            const r = request.nextUrl.clone(); r.pathname = `/e/${eOrgSlug}/change-password`
            return NextResponse.redirect(r)
        }
        if (!eBlocked && eCtx.force_password_change !== true && eCtx.onboarding_completed === false && !eRest.includes('/onboarding')) {
            const r = request.nextUrl.clone(); r.pathname = `/e/${eOrgSlug}/onboarding`
            return NextResponse.redirect(r)
        }

        // Assigned alumno → render the client app under /c via rewrite (URL stays /e).
        const eRewriteUrl = request.nextUrl.clone()
        eRewriteUrl.pathname = `/c/${eStr(eCtx.coach_slug)}${eRest === '/' ? '/dashboard' : eRest}`
        const eResponse = NextResponse.rewrite(eRewriteUrl, { request: { headers: eRequestHeaders } })
        supabaseResponse.cookies.getAll().forEach(c => eResponse.cookies.set(c.name, c.value))
        return eResponse
    }

    // ============================================================
    // 1.6 TEAM ALUMNO AREA — /t/[team_slug]/* (pool plano, same-domain). Espejo de /e/.
    // Sirve al alumno de pool la MISMA app del cliente, TEAM-branded, manteniendo la URL en
    // /t/[team_slug]/* (rewrite a /c/[coach_slug]/* + x-client-base-path). Una RPC gated resuelve todo.
    // Guards de estado (suspended/force-pwd/consent/onboarding) viven en ESTE branch (el rewrite
    // no re-ejecuta los guards de /c); redirigen dentro de /t y la página se sirve vía rewrite.
    // ============================================================
    if (pathname.startsWith('/t/')) {
        const tSegs = pathname.split('/')          // ['', 't', teamSlug, ...rest]
        const tTeamSlug = tSegs[2] ?? ''
        if (!tTeamSlug) return supabaseResponse
        const tRest = '/' + tSegs.slice(3).join('/')

        // Nuevo RPC aún no en database.types.ts -> cast localizado de la función rpc (existe en prod, migr. 20260609190000).
        const teamCtx = (slug: string) =>
            (supabase.rpc as unknown as (fn: string, args: Record<string, string>) => PromiseLike<{ data: unknown }>)(
                'get_team_alumno_context', { p_team_slug: slug },
            )

        if (tRest === '/login') {
            if (user) {
                const { data: ctx } = await teamCtx(tTeamSlug)
                if (ctx && (ctx as Record<string, unknown>).is_member === true) {
                    const r = request.nextUrl.clone(); r.pathname = `/t/${tTeamSlug}/dashboard`
                    return NextResponse.redirect(r)
                }
            }
            return supabaseResponse
        }

        if (!user) {
            const r = request.nextUrl.clone(); r.pathname = `/t/${tTeamSlug}/login`
            const redirect = NextResponse.redirect(r)
            supabaseResponse.cookies.getAll().forEach(c => redirect.cookies.set(c.name, c.value))
            return redirect
        }

        const { data: tCtxRaw } = await teamCtx(tTeamSlug)
        const tCtx = tCtxRaw as Record<string, unknown> | null
        if (!tCtx) { const r = request.nextUrl.clone(); r.pathname = '/not-found'; return NextResponse.redirect(r) }
        if (tCtx.is_member !== true) { const r = request.nextUrl.clone(); r.pathname = `/t/${tTeamSlug}/login`; return NextResponse.redirect(r) }

        const tStr = (v: unknown) => (typeof v === 'string' ? v : '')
        const tRequestHeaders = new Headers(request.headers)
        tRequestHeaders.set('x-coach-id', tStr(tCtx.coach_id) || tStr(tCtx.team_id))
        tRequestHeaders.set('x-coach-slug', tStr(tCtx.coach_slug))
        tRequestHeaders.set('x-coach-brand-name', tStr(tCtx.name) || 'EVA')
        tRequestHeaders.set('x-coach-primary-color', tStr(tCtx.primary_color) || SYSTEM_PRIMARY_COLOR)
        tRequestHeaders.set('x-coach-logo-url', tStr(tCtx.logo_url).trim() || BRAND_APP_ICON)
        tRequestHeaders.set('x-coach-subscription-tier', 'pro')
        // White-label COMPLETO del TEAM (RPC v3, paridad con /e): la marca personal del coach
        // nunca llega al alumno de pool. loader 'logo' muestra el logo del TEAM (x-coach-logo-url
        // ya es el del team); 'text'/'none' sin ícono; 'eva' ícono EVA.
        tRequestHeaders.set('x-coach-accent-light', tStr(tCtx.accent_light).trim())
        tRequestHeaders.set('x-coach-accent-dark', tStr(tCtx.accent_dark).trim())
        tRequestHeaders.set('x-coach-logo-url-dark', tStr(tCtx.logo_url_dark).trim())
        tRequestHeaders.set('x-coach-neutral-tint', String(tCtx.neutral_tint === true))
        tRequestHeaders.set('x-coach-loader-text', tStr(tCtx.loader_text).trim())
        tRequestHeaders.set('x-coach-use-custom-loader', String(tCtx.use_custom_loader === true))
        tRequestHeaders.set('x-coach-loader-text-color', tStr(tCtx.loader_text_color).trim())
        tRequestHeaders.set(
            'x-coach-loader-icon-mode',
            tCtx.loader_icon_mode === 'logo' ? 'coach'
                : tCtx.loader_icon_mode === 'eva' ? 'eva'
                : 'none',
        )
        tRequestHeaders.set('x-client-use-brand-colors', 'true')
        tRequestHeaders.set('x-workspace-brand-source', 'organization')
        tRequestHeaders.set('x-client-base-path', `/t/${tTeamSlug}`)

        const tCoachSlug = tStr(tCtx.coach_slug)
        const tHasActiveCoach = !!tCoachSlug && tCtx.coach_active === true
        const tBlocked = tCtx.is_archived === true || tCtx.is_active === false

        // Guards de estado (espejo de /e): el rewrite NO re-ejecuta los guards del branch /c, así
        // que deben vivir ACÁ. Redirigen DENTRO de /t/[slug]/* y la página real se sirve vía rewrite
        // (la URL nunca se escapa a /c).
        //
        // §5: el estado suspendido se evalúa ANTES de la condición de coach activo, así un orphan
        // suspendido (sin coach activo) ve la pantalla "suspended" en vez del holding "asignándote
        // un coach". coach_slug sigue poblado aunque el coach ya no sea miembro activo del team
        // (la RPC lo resuelve por COALESCE(membership.coach_id, clients.coach_id)), así que la
        // página suspended se sirve vía rewrite a /c/[coach_slug]/suspended. Solo un alumno sin
        // coach_id alguno (coach_slug vacío) cae al holding como último recurso.
        if (tBlocked && tCoachSlug) {
            if (!tRest.includes('/suspended')) {
                const r = request.nextUrl.clone(); r.pathname = `/t/${tTeamSlug}/suspended`
                return NextResponse.redirect(r)
            }
            const tSuspUrl = request.nextUrl.clone()
            tSuspUrl.pathname = `/c/${tCoachSlug}/suspended`
            const tSuspResp = NextResponse.rewrite(tSuspUrl, { request: { headers: tRequestHeaders } })
            supabaseResponse.cookies.getAll().forEach(c => tSuspResp.cookies.set(c.name, c.value))
            return tSuspResp
        }
        if (!tBlocked && tHasActiveCoach && tCtx.force_password_change === true && !tRest.includes('/change-password')) {
            const r = request.nextUrl.clone(); r.pathname = `/t/${tTeamSlug}/change-password`
            return NextResponse.redirect(r)
        }

        // Consent gate (Ley 21.719): tras password, ANTES de onboarding/app — el alumno de pool
        // debe otorgar acceso multidisciplinario. /consent se sirve sin rewrite (página propia de /t).
        if (tRest === '/consent') {
            if (tCtx.has_pool_consent === true) {
                const r = request.nextUrl.clone(); r.pathname = `/t/${tTeamSlug}/dashboard`; return NextResponse.redirect(r)
            }
            const resp = NextResponse.next({ request: { headers: tRequestHeaders } })
            supabaseResponse.cookies.getAll().forEach(c => resp.cookies.set(c.name, c.value))
            return resp
        }
        // /perfil: pantalla propia de /t para gestionar/revocar el consentimiento (Ley 21.719).
        // Se sirve SIN rewrite (no existe /c/[coach]/perfil) y ANTES del consent gate para que el
        // alumno YA consentido pueda entrar a revocar. La acción de revoke redirige a /dashboard,
        // que el consent gate (has_pool_consent=false) rebota a /consent.
        if (tRest === '/perfil') {
            const resp = NextResponse.next({ request: { headers: tRequestHeaders } })
            supabaseResponse.cookies.getAll().forEach(c => resp.cookies.set(c.name, c.value))
            return resp
        }
        if (tCtx.has_pool_consent !== true && !tBlocked && tCtx.force_password_change !== true) {
            const r = request.nextUrl.clone(); r.pathname = `/t/${tTeamSlug}/consent`
            const redirect = NextResponse.redirect(r)
            supabaseResponse.cookies.getAll().forEach(c => redirect.cookies.set(c.name, c.value))
            return redirect
        }

        if (!tBlocked && tHasActiveCoach && tCtx.force_password_change !== true && tCtx.onboarding_completed === false && !tRest.includes('/onboarding')) {
            const r = request.nextUrl.clone(); r.pathname = `/t/${tTeamSlug}/onboarding`
            return NextResponse.redirect(r)
        }

        // Pool / orfandad (sin coach activo) → holding team-branded, sin rewrite.
        if (!tHasActiveCoach) {
            if (tRest === '/dashboard' || tRest === '/') {
                const resp = NextResponse.next({ request: { headers: tRequestHeaders } })
                supabaseResponse.cookies.getAll().forEach(c => resp.cookies.set(c.name, c.value))
                return resp
            }
            const r = request.nextUrl.clone(); r.pathname = `/t/${tTeamSlug}/dashboard`
            return NextResponse.redirect(r)
        }

        // Alumno con coach → app del cliente bajo /c vía rewrite (URL queda en /t).
        const tRewriteUrl = request.nextUrl.clone()
        tRewriteUrl.pathname = `/c/${tCoachSlug}${tRest === '/' ? '/dashboard' : tRest}`
        const tResponse = NextResponse.rewrite(tRewriteUrl, { request: { headers: tRequestHeaders } })
        supabaseResponse.cookies.getAll().forEach(c => tResponse.cookies.set(c.name, c.value))
        return tResponse
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
                isOrgClient = await isCoachActiveOrgMember(supabase, clientData.org_id, coach.id)
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
                .select('id, coach_id, org_id, team_id, force_password_change, onboarding_completed, is_active, is_archived, use_coach_brand_colors')
                .eq('id', user.id)
                .maybeSingle()

            type ClientWithBrand = Client & { use_coach_brand_colors?: boolean }
            let client: ClientWithBrand | null = null
            // F2: org branding may only be painted when the accessing coach is an ACTIVE
            // member of the client's org. A direct coach_id match is NOT enough — a coach
            // removed from the org must stop showing org white-label to their (now orphaned)
            // enterprise client and fall back to coach branding.
            let orgMembershipActive = false
            if (rawClientData) {
                if (rawClientData.coach_id === coach.id) {
                    client = rawClientData as unknown as ClientWithBrand
                    if (rawClientData.org_id) {
                        orgMembershipActive = await isCoachActiveOrgMember(supabase, rawClientData.org_id, coach.id)
                    }
                } else if (rawClientData.org_id) {
                    if (await isCoachActiveOrgMember(supabase, rawClientData.org_id, coach.id)) {
                        client = rawClientData as unknown as ClientWithBrand
                        orgMembershipActive = true
                    }
                }
            }

            if (!client) {
                // Logged in user is NOT a client of this coach or org
                const redirectUrl = request.nextUrl.clone()
                redirectUrl.pathname = `/c/${coachSlug}/login`
                return NextResponse.redirect(redirectUrl)
            }

            if (client.org_id && orgMembershipActive) {
                // F2/B-9: read org white-label via the gated SECURITY DEFINER RPC — the alumno
                // has no RLS read on `organizations` (org_members_see_own_org), so a direct read
                // returned null and the org branding silently fell back to the coach's.
                const { data: orgBrandJson } = await supabase.rpc('get_org_branding', { p_org_id: client.org_id })
                const orgBrand = (orgBrandJson && typeof orgBrandJson === 'object' && !Array.isArray(orgBrandJson))
                    ? (orgBrandJson as Record<string, unknown>)
                    : null

                if (orgBrand) {
                    const brandName = typeof orgBrand.name === 'string' ? orgBrand.name : ''
                    const orgPrimary = typeof orgBrand.primary_color === 'string' ? orgBrand.primary_color : ''
                    const orgLogo = typeof orgBrand.logo_url === 'string' ? orgBrand.logo_url.trim() : ''
                    requestHeaders.set('x-coach-brand-name', brandName || coach.brand_name)
                    requestHeaders.set('x-coach-primary-color', orgPrimary || resolvedColor)
                    requestHeaders.set('x-coach-logo-url', orgLogo || coach.logo_url?.trim() || BRAND_APP_ICON)
                    // Per-mode white-label theme inputs (brand-kit resolves on render).
                    const ob = orgBrand as Record<string, unknown>
                    requestHeaders.set('x-coach-accent-light', String(ob.accent_light ?? '').trim())
                    requestHeaders.set('x-coach-accent-dark', String(ob.accent_dark ?? '').trim())
                    requestHeaders.set('x-coach-logo-url-dark', String(ob.logo_url_dark ?? '').trim())
                    requestHeaders.set('x-coach-neutral-tint', String(ob.neutral_tint ?? false))
                    // Org is the source of truth for the loader (white-label consistency
                    // across all its coaches). org icon mode 'logo'→show logo, 'text'→none.
                    const orgRow = orgBrand as Record<string, unknown>
                    requestHeaders.set('x-coach-loader-text', String(orgRow.loader_text ?? '').trim())
                    requestHeaders.set('x-coach-use-custom-loader', String(orgRow.use_custom_loader ?? false))
                    requestHeaders.set('x-coach-loader-text-color', String(orgRow.loader_text_color ?? '').trim())
                    requestHeaders.set('x-coach-loader-icon-mode', orgRow.loader_icon_mode === 'text' ? 'none' : 'coach')
                    requestHeaders.set('x-workspace-brand-source', 'organization')
                }
            } else if (client.org_id && !orgMembershipActive) {
                // B-9: enterprise client whose coach is no longer an active member of the org.
                // Don't fall back to the (departed) coach's branding — show neutral EVA branding
                // and flag the client as orphaned so the app can prompt them to contact the org
                // for reassignment to another coach.
                // Org name via the gated RPC (the orphaned client keeps client.org_id, so the
                // reader still returns it) — the direct table read is RLS-blocked for alumnos.
                const { data: orphanBrandJson } = await supabase.rpc('get_org_branding', { p_org_id: client.org_id })
                const orphanName = (orphanBrandJson && typeof orphanBrandJson === 'object' && !Array.isArray(orphanBrandJson))
                    ? (orphanBrandJson as Record<string, unknown>).name
                    : null
                requestHeaders.set('x-coach-brand-name', 'EVA')
                requestHeaders.set('x-coach-primary-color', SYSTEM_PRIMARY_COLOR)
                requestHeaders.set('x-coach-logo-url', BRAND_APP_ICON)
                requestHeaders.set('x-workspace-brand-source', 'orphan')
                requestHeaders.set('x-workspace-orphan', 'true')
                requestHeaders.set('x-orphan-org-name', typeof orphanName === 'string' ? orphanName : '')
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

            // §3.1 — Consent gate Ley 21.719 para alumnos de POOL que entran por /c directo
            // (bookmark, PWA start_url legacy). El branch /t ya fuerza /t/[slug]/consent ANTES de
            // la app; pero un alumno de pool (team_id SET) que llega por /c/[coach_slug]/* lo
            // saltaba — admitido solo por coach_id — y podía procesar datos de salud
            // (bodycomp/movimiento) sin consentimiento. Se reusa la MISMA resolución del branch /t
            // (get_team_alumno_context) tras resolver el slug del team (el alumno no tiene lectura
            // RLS sobre teams → service-role acotado a id→slug, mismo patrón que el holding /t y
            // login.actions). Standalone (team_id NULL) NO entra a este guard.
            if (!isBlocked && !client.force_password_change && client.team_id) {
                const teamId = client.team_id
                const admin = createServiceRoleClient()
                const { data: teamRow } = await admin
                    .from('teams')
                    .select('slug')
                    .eq('id', teamId)
                    .is('deleted_at', null)
                    .maybeSingle()
                const teamSlug = teamRow?.slug
                if (teamSlug) {
                    // Espejo exacto del branch /t: has_pool_consent desde get_team_alumno_context
                    // (SECURITY DEFINER, scoped por team + auth.uid()). RPC aún no en database.types.ts.
                    const { data: poolCtxRaw } = await (
                        supabase.rpc as unknown as (fn: string, args: Record<string, string>) => PromiseLike<{ data: unknown }>
                    )('get_team_alumno_context', { p_team_slug: teamSlug })
                    const poolCtx = poolCtxRaw as Record<string, unknown> | null
                    if (poolCtx && poolCtx.has_pool_consent !== true) {
                        const redirectUrl = request.nextUrl.clone()
                        redirectUrl.pathname = `/t/${teamSlug}/consent`
                        const redirect = NextResponse.redirect(redirectUrl)
                        supabaseResponse.cookies.getAll().forEach(cookie => {
                            redirect.cookies.set(cookie.name, cookie.value)
                        })
                        return redirect
                    }
                }
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
    const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/register') || pathname.startsWith('/forgot-password')
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
    // Excluye assets estáticos del middleware. Incluye json/webmanifest/fonts/media:
    // si no, en el host enterprise el rewrite /org prefijaba p.ej. /lottie/*.json
    // → /org/lottie/*.json → 404 (animaciones Lottie del landing no cargaban).
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico|api/manifest/.*|.*\\.(?:svg|png|jpg|jpeg|gif|webp|json|webmanifest|woff|woff2|ttf|otf|mp4|webm|mp3|txt|xml|lottie)$).*)',
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
