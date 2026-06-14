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
 * `db` puede ser cualquier cliente (la consulta queda acotada por RLS coach-scoped o por
 * service-role). Devuelve 0 si el count viene null.
 */
export async function countActiveStandaloneClients(
    db: DB,
    coachId: string
): Promise<number> {
    const { count } = await db
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', coachId)
        .eq('is_archived', false)
        .is('org_id', null)
    return count ?? 0
}
