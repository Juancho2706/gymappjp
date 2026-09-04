import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { capturePostHogServerEvent } from '@/lib/posthog/server-capture'

type Db = SupabaseClient<Database>

/**
 * Limpieza del auth user HUÉRFANO que deja «Continuar con Google» en el login de COACH.
 *
 * CASO REAL (Leonardo, alumno de Movens, 2026-09-04): mandó su solicitud por `/join/[código]`, entró
 * a `eva-app.cl/login` (el login de coach), apretó «Continuar con Google» y Supabase le creó un
 * `auth.users` con provider `google` ANTES de que `resolvePostGoogleAuthUrl` mirara si tenía fila
 * `coaches`. No la tenía: rebotó con `no_google_account`, pero el usuario quedó. Efectos en cadena:
 * el correo pasó a estar «ocupado» (`check_platform_email_availability.exists_in_auth`), el coach no
 * pudo convertir la solicitud en alumno («Este correo ya tiene una cuenta en EVA»), y el alumno pudo
 * ponerse una contraseña por «olvidé mi clave» y seguir chocando con «No tienes acceso». Mismo patrón
 * que la alumna de JP en el login de coach (memoria `project_login_y_auth`) y que la cuenta fantasma
 * de Natalia. El alta de alumno por invitación (F2b) sigue en backlog; esto cierra la fuente del
 * huérfano, que es la parte barata.
 *
 * REGLA: se borra el usuario SOLO si es demostrablemente vacío:
 *  - todas sus identidades son `google` (sin identidad `email` = nunca tuvo contraseña propia);
 *  - cero filas en `coaches`, `clients`, `client_accounts`, `client_memberships`,
 *    `organization_members` (las tablas que dan identidad en EVA; los datos de coach y alumno
 *    cuelgan de esas filas) y su correo no está en `platform_admins`.
 * Un usuario así, por construcción, no es cliente de EVA: no tiene nada que perder. El coach a medio
 * onboarding por Google (`/register?from=google`) también es «vacío» y si toca Google en `/login`
 * pierde el auth user: al volver a «Registrarse con Google» se recrea igual y sigue su alta. Nada
 * de esto corre con `intent = 'register'` — ahí el usuario se queda para el onboarding.
 *
 * FAIL-CLOSED: cualquier error de lectura cuenta como «tiene filas» y NO se borra (queda como hoy).
 * Nunca lanza. La respuesta del endpoint no distingue casos (`{ ok: true }` siempre): si el cliente
 * supiera «borré / no borré», cualquier sesión podría preguntarle al servidor si un correo ajeno ya
 * tenía cuenta. El resultado real vive en el log del servidor (sin PII) y en PostHog.
 */
export type GoogleOrphanCleanupContext = 'post_google_auth' | 'mobile_post_google_auth'

export type GoogleOrphanCleanupResult =
    | { deleted: true }
    | { deleted: false; reason: 'no_user' | 'not_google_only' | 'has_rows' | 'delete_failed' }

/** Los builders de PostgREST son thenables (PromiseLike), no Promises: `Promise.all` los acepta igual. */
type RowsLookup = PromiseLike<{ data: unknown[] | null; error: unknown }>

/** `true` si hay al menos una fila O si la lectura falló (fail-closed). */
function occupied({ data, error }: { data: unknown[] | null; error: unknown }): boolean {
    return Boolean(error) || (data?.length ?? 0) > 0
}

/**
 * Las tablas que dan identidad en EVA, una consulta explícita por cada una (sin unión dinámica de
 * nombres: que el tipado de cada `from` sea el de siempre). Todo lo demás cuelga de estas filas.
 */
async function hasIdentityRows(admin: Db, userId: string, email: string | null): Promise<boolean> {
    const checks: RowsLookup[] = [
        admin.from('coaches').select('id').eq('id', userId).limit(1),
        admin.from('clients').select('id').eq('id', userId).limit(1),
        admin.from('client_accounts').select('id').eq('id', userId).limit(1),
        admin.from('client_memberships').select('id').eq('account_id', userId).limit(1),
        admin.from('organization_members').select('id').eq('user_id', userId).limit(1),
    ]

    if (email) {
        checks.push(
            admin
                .from('platform_admins')
                .select('email')
                .eq('email', email.trim().toLowerCase())
                .is('revoked_at', null)
                .limit(1)
        )
    }

    const results = await Promise.all(checks)
    return results.some(occupied)
}

export async function deleteGoogleOrphanAuthUser(params: {
    /** Service-role: leer identidades y borrar un auth user no lo puede hacer nadie más. */
    admin: Db
    /** Sale de la sesión (cookie o Bearer validado), jamás del cuerpo del request. */
    userId: string
    context: GoogleOrphanCleanupContext
}): Promise<GoogleOrphanCleanupResult> {
    const { admin, userId, context } = params

    const { data: userData, error: userError } = await admin.auth.admin.getUserById(userId)
    const user = userData?.user
    if (userError || !user) return { deleted: false, reason: 'no_user' }

    const providers = (user.identities ?? []).map((identity) => identity.provider)
    if (providers.length === 0 || providers.some((provider) => provider !== 'google')) {
        return { deleted: false, reason: 'not_google_only' }
    }

    if (await hasIdentityRows(admin, userId, user.email ?? null)) {
        return { deleted: false, reason: 'has_rows' }
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
    if (deleteError) {
        // Sin PII: el mensaje de GoTrue puede repetir el correo.
        console.error('[google-orphan-cleanup] no se pudo borrar el auth user huérfano')
        return { deleted: false, reason: 'delete_failed' }
    }

    // Rastro del borrado (el log del servidor solo admite warn/error): sin PII, solo la puerta.
    // También es la métrica del embudo: cuántos alumnos (o curiosos) se equivocan de puerta.
    await capturePostHogServerEvent({
        event: 'google_orphan_auth_user_deleted',
        distinctId: userId,
        properties: { context },
    })

    return { deleted: true }
}
