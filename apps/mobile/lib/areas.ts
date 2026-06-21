import { supabase } from './supabase'
import {
  WorkoutAreaCreateSchema,
  WorkoutAreaUpdateSchema,
  WorkoutAreaDeleteSchema,
} from '@eva/schemas'

/**
 * Áreas del builder (workout_section_templates) — CRUD del coach STANDALONE (mobile v1).
 * Lecturas/escrituras DIRECTAS por PostgREST bajo la sesión del coach. RLS (wst_*) es el
 * techo real: el coach solo ve/edita sus áreas custom + las system (read-only). Las MISMAS
 * columnas que escribe el server action web (que corre bajo la sesión del coach, no
 * service-role) → los GRANT de columna para `authenticated` ya existen, sin migración.
 *
 * Sin team-scope (el contexto team/pool no se resuelve acá): coachId = auth.uid(), team_id null.
 */

export interface WorkoutArea {
  id: string
  name: string
  slug: string
  sort_order: number
  is_system: boolean
  coach_id: string | null
  team_id: string | null
}

const SELECT_COLS = 'id, name, slug, coach_id, team_id, sort_order, is_system'

function toArea(r: any): WorkoutArea {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    sort_order: r.sort_order ?? 0,
    is_system: !!r.is_system,
    coach_id: r.coach_id ?? null,
    team_id: r.team_id ?? null,
  }
}

// ─── Helpers puros (espejo de apps/web/src/lib/workout-areas.ts) ─────────────

/** UUIDs fijos de las áreas system clásicas (seed) — para el short label CAL/PRI/ENF. */
const LEGACY_SECTION_AREA_ID = {
  warmup: '0000a5ec-0000-0000-0000-000000000001',
  main: '0000a5ec-0000-0000-0000-000000000010',
  cooldown: '0000a5ec-0000-0000-0000-000000000020',
} as const

type LegacySectionSlug = keyof typeof LEGACY_SECTION_AREA_ID

const CLASSIC_SHORT: Record<LegacySectionSlug, string> = { warmup: 'CAL', main: 'PRI', cooldown: 'ENF' }

function classicSlugOf(area: Pick<WorkoutArea, 'slug' | 'is_system'>): LegacySectionSlug | null {
  if (area.is_system && (area.slug === 'warmup' || area.slug === 'main' || area.slug === 'cooldown')) {
    return area.slug
  }
  return null
}

/** Abreviatura de 3 letras desde el nombre (sin diacríticos). Espejo de areaShortLabel (web). */
export function areaShortLabel(area: Pick<WorkoutArea, 'name' | 'slug' | 'is_system'>): string {
  const classic = classicSlugOf(area)
  if (classic) return CLASSIC_SHORT[classic]
  const plain = area.name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
  return (plain.slice(0, 3) || '???').toUpperCase()
}

/** Slug estable desde el nombre (espejo de slugifyAreaName web). El server lo regenera igual;
 *  acá solo lo precomputamos para el insert/update bajo RLS. */
export function slugifyAreaName(name: string): string {
  const slug = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
  if (slug) return slug
  let hash = 0
  for (let i = 0; i < name.length; i += 1) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return `area-${hash.toString(36)}`
}

/** sort_order para una área custom nueva (espejo de nextCustomSortOrder web). */
export function nextCustomSortOrder(areas: readonly Pick<WorkoutArea, 'sort_order'>[]): number {
  const maxExisting = areas.reduce((max, a) => Math.max(max, a.sort_order), 0)
  return Math.max(100, maxExisting + 10)
}

/**
 * Color (hex) estable por área para el badge — equivalente RN de la paleta Tailwind de
 * buildAreaVMs (web). Clásicas conservan su color; el resto toma la paleta por orden.
 */
const CLASSIC_COLOR: Record<LegacySectionSlug, string> = {
  warmup: '#F59E0B', // amber
  main: '#007AFF', // primary (azul sistema)
  cooldown: '#0EA5E9', // sky
}

const AREA_PALETTE = [
  '#8B5CF6', // violet
  '#10B981', // emerald
  '#F43F5E', // rose
  '#F97316', // orange
  '#14B8A6', // teal
  '#D946EF', // fuchsia
]

export interface AreaVM extends WorkoutArea {
  shortLabel: string
  color: string
  isClassic: boolean
}

/** VMs ordenados por sort_order (color de paleta solo a las no clásicas, en ese orden). */
export function buildAreaVMs(areas: readonly WorkoutArea[]): AreaVM[] {
  const ordered = [...areas].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name))
  let paletteIdx = 0
  return ordered.map((area) => {
    const classic = classicSlugOf(area)
    if (classic) {
      return { ...area, shortLabel: CLASSIC_SHORT[classic], color: CLASSIC_COLOR[classic], isClassic: true }
    }
    const color = AREA_PALETTE[paletteIdx % AREA_PALETTE.length]
    paletteIdx += 1
    return { ...area, shortLabel: areaShortLabel(area), color, isClassic: false }
  })
}

// ─── CRUD (RLS coach, sin service-role) ──────────────────────────────────────

/** Áreas visibles: system + propias del coach (RLS es el techo). Ordenadas por sort_order. */
export async function listAreas(): Promise<WorkoutArea[]> {
  try {
    const { data } = await supabase
      .from('workout_section_templates')
      .select(SELECT_COLS)
      .is('deleted_at', null)
      .is('team_id', null)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
    return ((data ?? []) as any[]).map(toArea)
  } catch {
    return []
  }
}

/** Alta de área custom. Valida con el schema compartido + escribe bajo RLS (coach_id propio). */
export async function createArea(
  input: { name: string },
  existing: readonly WorkoutArea[]
): Promise<{ area?: WorkoutArea; error?: string }> {
  const parsed = WorkoutAreaCreateSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const { data: auth } = await supabase.auth.getUser()
    const coachId = auth.user?.id
    if (!coachId) return { error: 'No autenticado.' }

    const { data, error } = await supabase
      .from('workout_section_templates')
      .insert({
        name: parsed.data.name,
        slug: slugifyAreaName(parsed.data.name),
        sort_order: nextCustomSortOrder(existing),
        coach_id: coachId,
        team_id: null,
        is_system: false,
      })
      .select(SELECT_COLS)
      .single()

    if (error) return { error: friendlyError(error.message) }
    if (!data) return { error: 'No se pudo crear el área.' }
    return { area: toArea(data) }
  } catch (e: any) {
    return { error: e?.message ?? 'No se pudo crear el área.' }
  }
}

/** Renombrar / reordenar área custom. Renombrar regenera el slug (los bloques referencian por id). */
export async function updateArea(input: {
  id: string
  name?: string
  sort_order?: number
}): Promise<{ area?: WorkoutArea; error?: string }> {
  const parsed = WorkoutAreaUpdateSchema.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  const { id, name, sort_order } = parsed.data
  if (name === undefined && sort_order === undefined) return { error: 'Nada que actualizar.' }

  const patch: { name?: string; slug?: string; sort_order?: number } = {}
  if (name !== undefined) {
    patch.name = name
    patch.slug = slugifyAreaName(name)
  }
  if (sort_order !== undefined) patch.sort_order = sort_order

  try {
    const { data, error } = await supabase
      .from('workout_section_templates')
      .update(patch)
      .eq('id', id)
      .eq('is_system', false)
      .is('deleted_at', null)
      .select(SELECT_COLS)
      .maybeSingle()

    if (error) return { error: friendlyError(error.message) }
    if (!data) return { error: 'Área no encontrada o sin permiso para editarla.' }
    return { area: toArea(data) }
  } catch (e: any) {
    return { error: e?.message ?? 'No se pudo actualizar el área.' }
  }
}

/** Soft-delete de área custom (los ejercicios que la usaban vuelven al área Principal). */
export async function deleteArea(id: string): Promise<{ error?: string }> {
  const parsed = WorkoutAreaDeleteSchema.safeParse({ id })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Datos inválidos' }

  try {
    const { data, error } = await supabase
      .from('workout_section_templates')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', parsed.data.id)
      .eq('is_system', false)
      .is('deleted_at', null)
      .select('id')
      .maybeSingle()

    if (error) return { error: friendlyError(error.message) }
    if (!data) return { error: 'Área no encontrada o sin permiso para eliminarla.' }
    return {}
  } catch (e: any) {
    return { error: e?.message ?? 'No se pudo eliminar el área.' }
  }
}

/** Colisión de slug por scope / RLS → mensaje friendly (espejo de friendlyAreaError web). */
function friendlyError(message: string | null): string {
  if (!message) return 'Algo salió mal.'
  if (/duplicate key|_slug_uidx/i.test(message)) return 'Ya existe un área con ese nombre en este contexto.'
  if (/row-level security/i.test(message)) return 'No tienes permiso para gestionar esta área.'
  return message
}
