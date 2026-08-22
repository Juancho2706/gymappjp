import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'

type DB = SupabaseClient<Database>

/**
 * services/billing/capacity.service — capacidad real de alumnos del coach standalone.
 * NO importa de `app/` ni de Next. Pieza de la lógica de cambio de plan (plan estrategia 06):
 * un DOWNGRADE a un tier cuyo `max_clients` < alumnos activos se bloquea (OVER_CAPACITY).
 */

/**
 * Cuenta los alumnos ACTIVOS standalone del coach (mismo filtro canónico que el cap gate de
 * alta de alumno en `coach/clients/_actions/clients.actions.ts`): `coach_id = coachId` +
 * `is_archived = false` + `org_id IS NULL`. Usa `is_archived`, NO `is_active`, y excluye los
 * alumnos de org/team (scope standalone). `head: true` + `count: 'exact'` → no trae filas.
 *
 * `is_demo = false` (onboarding v2): el alumno de ejemplo que siembra el onboarding NO ocupa cupo.
 * Con Free = 1 alumno (pricing v3), si el demo contara, el coach nuevo nacería lleno y el
 * onboarding sería un muro. Este conteo alimenta el banner de sobre-límite del layout /coach, el
 * gate de downgrade y «volver a Free»: todos deben ver el MISMO número.
 *
 * `db` puede ser cualquier cliente (la consulta queda acotada por RLS coach-scoped o por
 * service-role). Devuelve 0 si el count viene null y propaga errores de consulta para que los
 * callers de billing puedan fallar cerrado en vez de tratar una lectura rota como cupo libre.
 */
export async function countActiveStandaloneClients(
    db: DB,
    coachId: string
): Promise<number> {
    const { count, error } = await db
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', coachId)
        .eq('is_archived', false)
        .eq('is_demo', false)
        .is('org_id', null)
        .is('team_id', null)
    if (error) throw error
    return count ?? 0
}
