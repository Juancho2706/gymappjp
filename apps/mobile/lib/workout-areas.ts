// Areas del builder (workout_section_templates) — lado coach.
//
// Mismo query que web (services/workout/workout-areas.service → repository
// findAvailableSectionTemplates): system (7 fijas) + las del scope del coach. Devuelve la
// forma `WorkoutArea` de @eva/workout-engine (misma que consume el reducer del builder).
import { supabase } from './supabase'
import type { WorkoutArea } from '@eva/workout-engine'

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
