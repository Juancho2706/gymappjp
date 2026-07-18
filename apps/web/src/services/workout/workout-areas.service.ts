import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import type { WorkoutArea } from '@/domain/workout/types'
import {
    findAvailableSectionTemplates,
    insertSectionTemplate,
    softDeleteSectionTemplate,
    updateSectionTemplate,
    type WorkoutSectionTemplateRow,
} from '@/infrastructure/db/workout.repository'
import { nextCustomSortOrder, slugifyAreaName } from '@eva/workout-engine'

type DB = SupabaseClient<Database>

export type AreaScope = { coachId: string | null; teamId: string | null }

function toDomain(r: WorkoutSectionTemplateRow): WorkoutArea {
    return {
        id: r.id,
        name: r.name,
        slug: r.slug,
        sort_order: r.sort_order,
        is_system: r.is_system,
        coach_id: r.coach_id,
        team_id: r.team_id,
    }
}

/** Colision de slug por scope (indices parciales *_slug_uidx) → mensaje friendly. */
function friendlyAreaError(error: string | null): string | null {
    if (!error) return null
    if (/duplicate key|_slug_uidx/i.test(error)) return 'Ya existe un área con ese nombre en este contexto.'
    if (/row-level security/i.test(error)) return 'No tienes permiso para gestionar esta área.'
    return error
}

/**
 * Areas del builder visibles para el usuario segun su workspace activo.
 * team activo ⇒ system + las del team; standalone ⇒ system + propias;
 * enterprise (u otro contexto sin areas propias) ⇒ pasar ambos null: solo system.
 */
export async function listAvailableWorkoutAreas(db: DB, scope: AreaScope): Promise<WorkoutArea[]> {
    const rows = await findAvailableSectionTemplates(db, scope)
    return rows.map(toDomain)
}

/**
 * Alta de area custom en el scope dado (team gana sobre coach, como en el listado).
 * Cliente user-scoped: RLS wst_insert es el techo (coach propio / team-gestor).
 */
export async function createWorkoutArea(
    db: DB,
    scope: AreaScope,
    input: { name: string }
): Promise<{ area?: WorkoutArea; error?: string }> {
    const existing = await findAvailableSectionTemplates(db, scope)
    const values = {
        name: input.name,
        slug: slugifyAreaName(input.name),
        sort_order: nextCustomSortOrder(existing),
        coach_id: scope.teamId ? null : scope.coachId,
        team_id: scope.teamId,
    }
    if (!values.coach_id && !values.team_id) return { error: 'Contexto inválido para crear áreas.' }
    const { row, error } = await insertSectionTemplate(db, values)
    const friendly = friendlyAreaError(error)
    if (friendly || !row) return { error: friendly ?? 'No se pudo crear el área.' }
    return { area: toDomain(row) }
}

/**
 * Renombrar / reordenar area custom. RLS es el techo; el caller valida el contexto.
 * Renombrar REGENERA el slug (los bloques referencian por id, asi que es seguro): si no,
 * el slug viejo bloquea ese nombre para siempre y permite nombres duplicados por la via rename.
 */
export async function updateWorkoutArea(
    db: DB,
    id: string,
    values: { name?: string; sort_order?: number }
): Promise<{ area?: WorkoutArea; error?: string }> {
    if (values.name === undefined && values.sort_order === undefined) return { error: 'Nada que actualizar.' }
    const patch: { name?: string; slug?: string; sort_order?: number } = { ...values }
    if (values.name !== undefined) patch.slug = slugifyAreaName(values.name)
    const { row, error } = await updateSectionTemplate(db, id, patch)
    const friendly = friendlyAreaError(error)
    if (friendly) return { error: friendly }
    if (!row) return { error: 'Área no encontrada o sin permiso para editarla.' }
    return { area: toDomain(row) }
}

/** Soft-delete de area custom; los bloques existentes caen al bucket legacy (sin perder datos). */
export async function deleteWorkoutArea(db: DB, id: string): Promise<{ error?: string }> {
    const { done, error } = await softDeleteSectionTemplate(db, id)
    const friendly = friendlyAreaError(error)
    if (friendly) return { error: friendly }
    if (!done) return { error: 'Área no encontrada o sin permiso para eliminarla.' }
    return {}
}
