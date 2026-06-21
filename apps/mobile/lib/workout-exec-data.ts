import { supabase } from './supabase'
import { resolveClientZones, type HrZoneRange } from './cardio'
import { classicSlugForAreaId, type WorkoutArea } from './workout-exec'

/**
 * Datos del módulo cardio + áreas para la EJECUCIÓN del alumno (mobile). Espejo de la
 * resolución server-side de apps/web/.../workout-execution.queries.ts, adaptado a RLS bajo
 * la sesión del alumno (PostgREST directo, sin service-role en mobile).
 *
 * NOTA RLS: la web usa service-role para leer (a) áreas custom del coach/team (el alumno no
 * las ve por RLS wst_select) y (b) el flag enabled_modules del coach/team. En mobile NO hay
 * service-role: leemos solo lo que el alumno puede ver. Consecuencia (degradación elegante,
 * idéntica al fallback de la web): un área custom no resoluble cae al bucket legacy del
 * bloque, y las zonas FC personalizadas solo se muestran si el alumno puede leer su propio
 * perfil (clients own-row, RLS OK). Los chips de zona caen a "Z4" sin rango cuando no hay perfil.
 */

export interface ClientCardioView {
  enabled: boolean
  zones: HrZoneRange[] | null
}

/** Perfil cardio del propio alumno (own-row) → zonas resueltas. */
export async function getOwnCardioZones(clientId: string): Promise<ClientCardioView> {
  try {
    const { data } = await supabase
      .from('clients')
      .select('birth_date, resting_hr, max_hr_override')
      .eq('id', clientId)
      .maybeSingle()
    if (!data) return { enabled: false, zones: null }
    const resolved = resolveClientZones({
      birthDate: (data as any).birth_date ?? null,
      restingHr: (data as any).resting_hr ?? null,
      maxHrOverride: (data as any).max_hr_override ?? null,
    })
    // "enabled" en mobile = el perfil deriva zonas (no podemos leer enabled_modules del coach
    // por RLS; si el coach prescribió hr_zone, el módulo está ON de su lado). Sin perfil → chips "Z4".
    return { enabled: resolved != null, zones: resolved?.zones ?? null }
  } catch {
    return { enabled: false, zones: null }
  }
}

/**
 * Áreas (no clásicas) referenciadas por el plan que el alumno PUEDE ver por RLS. Las clásicas
 * (warmup/main/cooldown) nunca se resuelven (van por la vía legacy con sus títulos de siempre).
 */
export async function getPlanAreas(sectionTemplateIds: (string | null | undefined)[]): Promise<WorkoutArea[]> {
  const ids = [...new Set(sectionTemplateIds.filter((id): id is string => !!id && !classicSlugForAreaId(id)))]
  if (ids.length === 0) return []
  try {
    const { data } = await supabase
      .from('workout_section_templates')
      .select('id, name, slug, sort_order, is_system, coach_id, team_id')
      .in('id', ids)
      .is('deleted_at', null)
    return ((data ?? []) as any[]).map((r) => ({
      id: r.id,
      name: r.name,
      slug: r.slug,
      sort_order: r.sort_order ?? 0,
      is_system: !!r.is_system,
      coach_id: r.coach_id ?? null,
      team_id: r.team_id ?? null,
    })) as WorkoutArea[]
  } catch {
    return []
  }
}
