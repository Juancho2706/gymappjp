import { cache } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

/**
 * test-accounts — fuente única de verdad de las cuentas de coach de PRUEBA/internas
 * que NO deben contaminar las métricas financieras del CEO (MRR/ARR/ARPC/adopción/churn).
 *
 * Son filas normales de `coaches` con tiers/add-ons pagos sembrados para QA, así que sin
 * este filtro cuentan como ingreso real. El panel /admin/finanzas las excluye usando este
 * módulo (lado TS) y los RPCs de MRR las excluyen en SQL con el MISMO predicado
 * (migración `*_exclude_test_coaches_from_mrr.sql`).
 *
 * ⚠️ MANTENER EN SINCRONÍA con la cláusula `WHERE` de esos RPCs. Si agregas un email/dominio
 *    acá, agregalo también en la migración SQL (y viceversa).
 */

/**
 * Emails EXPLÍCITOS de cuentas de prueba (case-insensitive). Para AGREGAR más cuentas
 * permanentes de prueba del dueño (p.ej. las `yolomon.2*` / `josefit*` mencionadas en la
 * memoria — sus emails reales NO se conocen acá, NO inventar), suma el email exacto a esta
 * lista Y a la migración SQL de los RPCs de MRR.
 */
export const TEST_COACH_EMAILS: string[] = [
    'juanmvr2706@gmail.com', // coach de prueba del dueño
    // 'yolomon.2...@...',   // ← agregar email real cuando se conozca (multi-ctx josefit/Carolina/Diana)
]

/**
 * Dominios completos de prueba (case-insensitive). Todo coach con email `…@evatest.cl`
 * (las 8 personas e2e) se considera de prueba.
 */
export const TEST_COACH_EMAIL_DOMAINS: string[] = ['evatest.cl']

// Sets normalizados (lowercase) para lookup O(1) — el módulo es singleton por proceso.
const EMAIL_SET = new Set(TEST_COACH_EMAILS.map((e) => e.trim().toLowerCase()))
const DOMAIN_SET = new Set(TEST_COACH_EMAIL_DOMAINS.map((d) => d.trim().toLowerCase()))

/**
 * Predicado puro: ¿este email pertenece a una cuenta de coach de prueba?
 * Match por dominio O por lista explícita, case-insensitive. Espejo exacto de la
 * cláusula `WHERE` de los RPCs de MRR.
 */
export function isTestCoachEmail(email: string | null | undefined): boolean {
    if (!email) return false
    const normalized = email.trim().toLowerCase()
    if (!normalized) return false
    if (EMAIL_SET.has(normalized)) return true
    const domain = normalized.slice(normalized.lastIndexOf('@') + 1)
    return domain.length > 0 && DOMAIN_SET.has(domain)
}

/**
 * Resuelve los `coach_id` (= auth uid) de TODAS las cuentas de prueba.
 *
 * El email vive en `auth.users` (no en `public.coaches`), así que se pagina el admin API
 * (`listUsers`) y se aplica el predicado puro. Se intersecta contra `coaches` para devolver
 * SOLO ids que sean coaches reales (no alumnos/orgs con el mismo dominio). Cacheado por
 * request (`React.cache`) — el panel /admin lo invoca una vez por render.
 *
 * Requiere el service-role client (lee `auth.users`).
 */
export const getTestCoachIds = cache(
    async (admin: SupabaseClient<Database>): Promise<Set<string>> => {
        // 1) Recolectar uids de auth.users cuyo email matchea el predicado de prueba.
        const testUserIds = new Set<string>()
        const perPage = 1000
        for (let page = 1; page <= 50; page++) {
            const { data, error } = await admin.auth.admin.listUsers({ page, perPage })
            if (error) {
                console.error('getTestCoachIds: listUsers error', error)
                break
            }
            const users = data?.users ?? []
            for (const u of users) {
                if (isTestCoachEmail(u.email)) testUserIds.add(u.id)
            }
            if (users.length < perPage) break // última página
        }

        if (testUserIds.size === 0) return testUserIds

        // 2) Intersectar con coaches reales (evita arrastrar alumnos/orgs homónimos).
        const { data: coachRows } = await admin
            .from('coaches')
            .select('id')
            .in('id', [...testUserIds])

        return new Set((coachRows ?? []).map((c) => c.id))
    }
)
