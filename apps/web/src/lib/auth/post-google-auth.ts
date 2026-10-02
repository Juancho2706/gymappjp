'use client'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { getPostLoginRedirect } from '@/lib/auth/post-login-redirect'
import { AUTH_CALLBACK_NEXT_PREFIXES, isCoachDefaultLanding, safeNext } from '@/lib/auth/safe-next'
import { STUDENT_LOGIN_ERROR_CODES } from '@/lib/auth/student-login-messages'

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
async function cleanupRejectedGoogleLogin(supabase: ProjectSupabaseClient): Promise<boolean> {
    await fetch('/api/auth/google-orphan-cleanup', { method: 'POST' }).catch(() => {})

    // Devuelve si la sesión local quedó cerrada. auth-js NO borra la sesión local cuando `/logout`
    // falla por red o 5xx (solo tolera 401/403/404), y con la sesión viva el login de alumno del
    // coach (`/c/<slug>/login`) rebota directo a su app: el alumno quedaría adentro CON Google, que es
    // justo lo que se rechaza. Un reintento; si igual falla, el caller vuelve al rebote de siempre.
    for (let attempt = 0; attempt < 2; attempt++) {
        const result = await supabase.auth.signOut({ scope: 'local' }).catch((error: unknown) => ({ error }))
        if (!result?.error) return true
    }
    return false
}

/**
 * Login de SU coach para el alumno que tocó Google en el login de coach (02-10, caso Carolina/Movens:
 * volvía a tocar Google una y otra vez porque el rebote a `/login` no le decía adónde ir).
 *
 * Se lee con la sesión de Google todavía viva, ANTES de cerrarla: RLS deja que el alumno lea su fila
 * `clients` y la de su coach (`clients_self_select` + `clients_read_coach_branding`), la misma
 * lectura que hace `resolvePostLoginRedirect`. El slug no le revela nada ajeno: Google acaba de
 * probar que el correo es suyo. Sin fila, sin slug o con error ⇒ `null` y queda el rebote de siempre.
 *
 * Google para alumnos sigue DIFERIDO (decisión CEO 2026-06-21): no se lo deja entrar, se lo manda a
 * su puerta con un aviso que explica cómo entrar (`google_solo_coach`, `student-login-messages.ts`).
 */
async function resolveStudentLoginUrl(supabase: ProjectSupabaseClient, userId: string): Promise<string | null> {
    try {
        const { data: client } = await supabase
            .from('clients')
            .select('id, coaches(slug)')
            .eq('id', userId)
            .maybeSingle()

        const coach = client?.coaches as unknown as { slug?: string | null } | null
        const slug = coach?.slug?.trim()
        if (!slug) return null

        return `/c/${encodeURIComponent(slug)}/login?error=${STUDENT_LOGIN_ERROR_CODES.GOOGLE_SOLO_COACH}`
    } catch {
        return null
    }
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
 * 3. No coach row: login → alumno con coach → '/c/<slug>/login?error=google_solo_coach';
 *    cualquier otro → '/login?error=no_google_account' (conservando el destino explícito);
 *    register → alumno con coach → su login (como arriba); cualquier otro → '/register?from=google'.
 *    Si la sesión de un rechazado no se puede cerrar, nunca se lo manda al login del coach.
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
        // Alumno que toca «Registrarse con Google» (02-10): el alta de coach lo rechaza igual en el
        // servidor (`oauth_session_is_client`, `complete.actions.ts`), así que llegaba a un callejón
        // con la sesión de Google viva. Se lo manda a su puerta, como en el login. Cualquier otro
        // usuario sigue al onboarding y su sesión se QUEDA (ni aviso ni signOut).
        const studentLoginUrl = await resolveStudentLoginUrl(supabase, userId)
        if (!studentLoginUrl) return '/register?from=google'
        const closed = await cleanupRejectedGoogleLogin(supabase)
        return closed ? studentLoginUrl : '/login?error=no_google_account'
    }

    // Sin fila `coaches` y con intención de LOGIN, el usuario que Google acaba de crear no le sirve
    // a nadie: es el alumno que se equivocó de puerta (caso Leonardo/Movens 2026-09-04). Si se
    // quedara, su correo pasaría a estar «ocupado» y su coach ya no podría darlo de alta. El
    // servidor decide si es un huérfano demostrable y lo borra (`lib/auth/google-orphan-cleanup.ts`);
    // desde acá solo se avisa, con la cookie de la sesión recién creada, y ANTES de cerrarla. La
    // sesión se cierra en scope local porque se rechazó el login: no hay motivo para dejarla viva
    // (y si hubo borrado, ya no apunta a nadie). Ninguno de los dos pasos puede bloquear el rebote.
    //
    // Si es ALUMNO (tiene fila `clients`), el rebote va al login de SU coach en vez de a `/login`
    // (02-10, caso Carolina/Movens). Se resuelve ANTES de cerrar la sesión: la lectura la necesita.
    // Un alumno nunca es huérfano, así que la limpieza del servidor no lo borra; corre igual porque
    // la decisión es del servidor, no de esta lectura de cliente.
    // Si la sesión no se pudo cerrar, NO se manda al login del coach (rebotaría a su app con Google
    // adentro): queda el rebote de siempre.
    const studentLoginUrl = await resolveStudentLoginUrl(supabase, userId)
    const closed = await cleanupRejectedGoogleLogin(supabase)
    if (studentLoginUrl && closed) return studentLoginUrl

    // El destino NO se tira: el coach que venía del correo de cupo reintenta con contraseña y sigue
    // aterrizando en `/coach/subscription?utm_...` en vez de caer en el dashboard.
    return deferredCoachNext
        ? `/login?error=no_google_account&next=${encodeURIComponent(deferredCoachNext)}`
        : '/login?error=no_google_account'
}
