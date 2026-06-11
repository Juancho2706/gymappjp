import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import type { WorkoutArea } from '@/domain/workout/types'
import { findAvailableSectionTemplates } from '@/infrastructure/db/workout.repository'

type DB = SupabaseClient<Database>

/**
 * Areas del builder visibles para el usuario segun su workspace activo.
 * team activo ⇒ system + las del team; standalone ⇒ system + propias;
 * enterprise (u otro contexto sin areas propias) ⇒ pasar ambos null: solo system.
 */
export async function listAvailableWorkoutAreas(
    db: DB,
    scope: { coachId: string | null; teamId: string | null }
): Promise<WorkoutArea[]> {
    const rows = await findAvailableSectionTemplates(db, scope)
    return rows.map(r => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        sort_order: r.sort_order,
        is_system: r.is_system,
        coach_id: r.coach_id,
        team_id: r.team_id,
    }))
}
