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
 * Login con Google RECHAZADO (sin fila `coaches`): avisa al servidor para que borre el auth user si
 * es un huérfano demostrable (`lib/auth/google-orphan-cleanup.ts`, caso Leonardo/Movens 2026-09-04)
 * y cierra la sesión en scope local. El aviso va PRIMERO porque la cookie de esa sesión es su
 * credencial. Los dos pasos son fail-silent: nada de esto puede dejar al usuario mirando el spinner.
 *
 * Único punto de código para las dos puertas web (GIS + `signInWithIdToken` en `GoogleSignInButton`
 * y el redirect viejo en `AuthExchangeClient`): las dos pasan por este resolvedor.
 */
async function cleanupRejectedGoogleLogin(supabase: ProjectSupabaseClient): Promise<void> {
    await fetch('/api/auth/google-orphan-cleanup', { method: 'POST' }).catch(() => {})
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
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
    const deferredCoachNext =
        safe !== null && safe.startsWith('/coach') && !isCoachDefaultLanding(safe) ? safe : null

    // El aterrizaje por defecto `/coach/dashboard` (los dos callers lo mandan como «sin destino
    // explícito») también espera al lookup cuando la intención es LOGIN. Hasta el 2026-09-04 se
    // devolvía de una y, sin fila `coaches`, el proxy lo convertía en `/coach/onboarding/complete`:
    // el alumno que tocaba «Continuar con Google» en el login de coach aterrizaba en «completa tu
    // cuenta de coach» con un auth user huérfano a cuestas (caso Leonardo/Movens; la misma trampa
    // que parió la cuenta fantasma de Natalia). Un botón de LOGIN no crea cuentas: el alta por Google
    // vive en `/register` (`intent = 'register'`) y no cambia.
    //
    // `/reset-password` se respeta de una (lo usan también los alumnos, que no tienen fila `coaches`).
    const defaultLandingLogin = intent === 'login' && safe !== null && isCoachDefaultLanding(safe)

    if (safe && !deferredCoachNext && !defaultLandingLogin) {
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
        // Coach real con el aterrizaje por defecto: exactamente lo de siempre.
        if (defaultLandingLogin && safe) {
            return safe
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

    // Sin fila `coaches` y con intención de LOGIN, el usuario que Google acaba de crear no le sirve
    // a nadie: es el alumno que se equivocó de puerta (caso Leonardo/Movens 2026-09-04). Si se
    // quedara, su correo pasaría a estar «ocupado» y su coach ya no podría darlo de alta. El
    // servidor decide si es un huérfano demostrable y lo borra (`lib/auth/google-orphan-cleanup.ts`);
    // desde acá solo se avisa, con la cookie de la sesión recién creada, y ANTES de cerrarla. La
    // sesión se cierra en scope local porque se rechazó el login: no hay motivo para dejarla viva
    // (y si hubo borrado, ya no apunta a nadie). Ninguno de los dos pasos puede bloquear el rebote.
    await cleanupRejectedGoogleLogin(supabase)

    // El destino NO se tira: el coach que venía del correo de cupo reintenta con contraseña y sigue
    // aterrizando en `/coach/subscription?utm_...` en vez de caer en el dashboard.
    return deferredCoachNext
        ? `/login?error=no_google_account&next=${encodeURIComponent(deferredCoachNext)}`
        : '/login?error=no_google_account'
}
