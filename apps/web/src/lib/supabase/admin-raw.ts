import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/lib/database.types'

/**
 * @deprecated NO es un bypass de RLS (auditoria 2026-06-11). Cliente BIMODAL:
 * - CON sesion en cookies: PostgREST recibe el JWT de la SESION en `Authorization` (la service
 *   key queda solo en `apikey`) → corre como `authenticated` y RLS APLICA.
 * - SIN sesion: cae a la service key → service_role real.
 * Excepcion: los metodos `auth.admin.*` (GoTrue Admin API) usan los headers globales del
 * constructor, asi que SI son admin reales siempre.
 *
 * No usar en codigo nuevo:
 * - Queries que deben pasar RLS del usuario → `createClient()` de `@/lib/supabase/server`.
 * - Bypass real → `createServiceRoleClient()` de `@/lib/supabase/admin-client`, SOLO post-gate
 *   server-side y con filtros explicitos de tenant (org/team/coach).
 * Call sites restantes (corren como el usuario y pasan RLS — refactor R3 pendiente ahi):
 * coach/exercises/_actions/exercise-media.actions.ts y
 * c/[coach_slug]/dashboard/_actions/dashboard.actions.ts. Borrar este archivo al migrarlos.
 */
export async function createRawAdminClient() {
    const cookieStore = await cookies()

     
    return createServerClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
            cookies: {
                getAll() {
                    return cookieStore.getAll()
                },
                setAll(cookiesToSet) {
                    try {
                        cookiesToSet.forEach(({ name, value, options }) =>
                            cookieStore.set(name, value, options)
                        )
                    } catch {
                        // no-op
                    }
                },
            },
        }
    )
}
