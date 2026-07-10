// Areas del builder (workout_section_templates) — lado coach.
//
// Mismo query que web (services/workout/workout-areas.service → repository
// findAvailableSectionTemplates): system (7 fijas) + las del scope del coach. Devuelve la
// forma `WorkoutArea` de @eva/workout-engine (misma que consume el reducer del builder).
import { supabase } from './supabase'
import { nextCustomSortOrder, slugifyAreaName, type WorkoutArea } from '@eva/workout-engine'

export type BuilderAreaScope = { coachId: string | null; teamId: string | null }

// Columnas de la forma WorkoutArea (deleted_at se filtra pero no se selecciona).
const AREA_COLUMNS = 'id, name, slug, coach_id, team_id, sort_order, is_system'

/**
 * Areas visibles para el builder segun el workspace del coach (separacion estricta, igual
 * que web): team ⇒ system + las del team; standalone ⇒ system + propias; sin scope
 * (enterprise) ⇒ solo system. RLS (wst_select) es el techo; estos filtros son defensa en
 * profundidad. Degrada a [] ante cualquier error (RLS/red/columna faltante en prod vieja)
 * → el reducer del builder cae al orden clasico W→M→C sin romperse.
 */
export async function listBuilderAreas(scope: BuilderAreaScope): Promise<WorkoutArea[]> {
  try {
    let query = supabase
      .from('workout_section_templates')
      .select(AREA_COLUMNS)
      .is('deleted_at', null)

    if (scope.teamId) {
      query = query.or(`is_system.eq.true,team_id.eq.${scope.teamId}`)
    } else if (scope.coachId) {
      query = query.or(`is_system.eq.true,and(coach_id.eq.${scope.coachId},team_id.is.null)`)
    } else {
      query = query.eq('is_system', true)
    }

    const { data, error } = await query
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
    if (error) return []
    return (data ?? []) as WorkoutArea[]
  } catch {
    return []
  }
}

// ── CRUD del builder (Settings > Areas, E7-05) — write-path PostgREST directo ──────────────────
// Espejo EXACTO de services/workout/workout-areas.service.ts + infrastructure/db/workout.repository:
// RLS (wst_insert/update/delete) es el techo real; el scope + los guards `is_system=false` /
// `deleted_at is null` son defensa en profundidad. Renombrar REGENERA el slug (los bloques
// referencian por id) para no bloquear el nombre viejo para siempre.

/** Colision de slug por scope (indices parciales *_slug_uidx) / RLS → mensaje friendly. */
function friendlyAreaError(msg: string | null | undefined): string {
  if (!msg) return 'Ocurrió un error. Intenta de nuevo.'
  if (/duplicate key|_slug_uidx/i.test(msg)) return 'Ya existe un área con ese nombre en este contexto.'
  if (/row-level security/i.test(msg)) return 'No tienes permiso para gestionar esta área.'
  return msg
}

/**
 * Alta de area custom en el scope activo (team gana sobre coach, como el listado). `existing` = las
 * areas ya visibles (para el sort_order). Cliente user-scoped: RLS wst_insert es el techo.
 */
export async function createBuilderArea(
  scope: BuilderAreaScope,
  input: { name: string },
  existing: readonly WorkoutArea[],
): Promise<{ area?: WorkoutArea; error?: string }> {
  const coach_id = scope.teamId ? null : scope.coachId
  const team_id = scope.teamId
  if (!coach_id && !team_id) return { error: 'Contexto inválido para crear áreas.' }
  const values = {
    name: input.name,
    slug: slugifyAreaName(input.name),
    sort_order: nextCustomSortOrder(existing),
    coach_id,
    team_id,
    is_system: false,
  }
  const { data, error } = await supabase
    .from('workout_section_templates')
    .insert(values)
    .select(AREA_COLUMNS)
    .single()
  if (error || !data) return { error: friendlyAreaError(error?.message) }
  return { area: data as WorkoutArea }
}

/** Renombrar / reordenar area custom (regenera slug al renombrar). `is_system=false` como defensa. */
export async function updateBuilderArea(
  id: string,
  values: { name?: string; sort_order?: number },
): Promise<{ area?: WorkoutArea; error?: string }> {
  if (values.name === undefined && values.sort_order === undefined) return { error: 'Nada que actualizar.' }
  const patch: { name?: string; slug?: string; sort_order?: number } = {}
  if (values.name !== undefined) {
    patch.name = values.name
    patch.slug = slugifyAreaName(values.name)
  }
  if (values.sort_order !== undefined) patch.sort_order = values.sort_order
  const { data, error } = await supabase
    .from('workout_section_templates')
    .update(patch)
    .eq('id', id)
    .eq('is_system', false)
    .is('deleted_at', null)
    .select(AREA_COLUMNS)
    .maybeSingle()
  if (error) return { error: friendlyAreaError(error.message) }
  if (!data) return { error: 'Área no encontrada o sin permiso para editarla.' }
  return { area: data as WorkoutArea }
}

/** Soft-delete de area custom; los bloques que la usaban caen al bucket legacy (sin perder datos). */
export async function deleteBuilderArea(id: string): Promise<{ error?: string }> {
  const { data, error } = await supabase
    .from('workout_section_templates')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('is_system', false)
    .is('deleted_at', null)
    .select('id')
    .maybeSingle()
  if (error) return { error: friendlyAreaError(error.message) }
  if (!data) return { error: 'Área no encontrada o sin permiso para eliminarla.' }
  return {}
}
