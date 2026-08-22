'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { getPostLoginRedirect } from '@/lib/auth/post-login-redirect'
import { AUTH_CALLBACK_NEXT_PREFIXES, isCoachDefaultLanding, safeNext } from '@/lib/auth/safe-next'

type ProjectSupabaseClient = SupabaseClient<Database>

interface ResolvePostGoogleAuthUrlParams {
    supabase: ProjectSupabaseClient
    userId: string
    intent: 'login' | 'register'
    next?: string | null
}

/**
 * Resolves the post-Google-auth destination URL.
 *
 * Shared by AuthExchangeClient (redirect flow) and GoogleSignInButton (GIS +
 * signInWithIdToken flow). Behavior mirrors the original inline logic:
 * 1. A safe internal `next` (validated by `safeNext` against the emitters' allowlist) wins
 *    outright — salvo un destino EXPLÍCITO bajo `/coach/**`, que espera al lookup (ver abajo).
 * 2. Otherwise look up the coach (+ active org membership) and delegate to
 *    getPostLoginRedirect.
 * 3. No coach row: login → '/login?error=no_google_account' (conservando el destino explícito);
 *    register → '/register?from=google'.
 */
export async function resolvePostGoogleAuthUrl({
    supabase,
    userId,
    intent,
    next,
}: ResolvePostGoogleAuthUrlParams): Promise<string> {
    // Allowlist de los emisores reales: `/reset-password` (recovery) y el
    // `/coach/subscription?utm_...` del correo de cupo (W3).
    const safe = safeNext(next, AUTH_CALLBACK_NEXT_PREFIXES)

    // Un destino EXPLÍCITO bajo `/coach/**` solo sirve si el usuario tiene fila `coaches`: se
    // decide después del lookup para no perderlo en el fallback (caso real: un coach que llega
    // del correo de cupo y elige por error otra cuenta de Google).
    //
    // Todo lo demás se respeta de una: `/reset-password` (lo usan también los alumnos, que no
    // tienen fila `coaches`) y el aterrizaje por defecto `/coach/dashboard`, que los dos callers
    // mandan siempre como «sin destino explícito» — sin fila `coaches` el proxy lo deriva al alta
    // OAuth, que es el registro con Google desde /login y no se toca.
    const deferredCoachNext =
        safe !== null && safe.startsWith('/coach') && !isCoachDefaultLanding(safe) ? safe : null

    if (safe && !deferredCoachNext) {
        return safe
    }

    const { data: coach } = await supabase
        .from('coaches')
        .select('id, active_org_id')
        .eq('id', userId)
        .maybeSingle()

    if (coach) {
        // Con fila `coaches`, el destino explícito gana sobre el aterrizaje por defecto.
        if (deferredCoachNext) {
            return deferredCoachNext
        }

        let activeOrgSlug: string | null = null
        let activeOrgRole: string | null = null

        if (coach.active_org_id) {
            const { data: membership } = await supabase
                .from('organization_members')
                .select('role, organizations(slug)')
                .eq('org_id', coach.active_org_id)
                .eq('user_id', userId)
                .eq('status', 'active')
                .is('deleted_at', null)
                .maybeSingle()

            const organization = membership?.organizations as unknown as { slug?: string | null } | null
            activeOrgSlug = organization?.slug ?? null
            activeOrgRole = membership?.role ?? null
        }

        return getPostLoginRedirect({
            isCoach: true,
            activeOrgSlug,
            activeOrgRole,
        })
    }

    if (intent === 'register') {
        return '/register?from=google'
    }

    // Sin fila `coaches` el login con Google no puede seguir, pero el destino NO se tira: el coach
    // que venía del correo de cupo reintenta con contraseña y sigue aterrizando en
    // `/coach/subscription?utm_...` en vez de caer en el dashboard.
    return deferredCoachNext
        ? `/login?error=no_google_account&next=${encodeURIComponent(deferredCoachNext)}`
        : '/login?error=no_google_account'
}
