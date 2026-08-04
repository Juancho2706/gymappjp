import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'
import type { NutritionPlanTemplateSummary } from '@eva/nutrition-v2'

/**
 * Repository de `nutrition_plan_templates_v2` (F3 — specs/nutrition-plan-templates-v2).
 *
 * RLS es el TECHO: con el cliente user-scoped del coach, un SELECT devuelve lo suyo, lo de su
 * team y lo de su org, y nunca lo de otro coach. El alumno no tiene NINGUNA policy sobre esta
 * tabla: una plantilla es material interno del coach.
 *
 * `deleted_at` es soft-delete y la tabla NO tiene policy de DELETE a proposito: borrar de
 * verdad perderia la trazabilidad del rescate de las 33 plantillas V1.
 */

type DB = SupabaseClient<Database>

export type PlanTemplateRow = {
  id: string
  name: string
  description: string | null
  strategy: string
  schemaVersion: number
  payload: Json
  summary: NutritionPlanTemplateSummary | null
  source: string
  sourcePlanId: string | null
  legacyTemplateId: string | null
  isFavorite: boolean
  usageCount: number
  createdAt: string
  updatedAt: string
}

const COLUMNS =
  'id, name, description, strategy, schema_version, draft, summary, source, source_plan_id, legacy_template_id, is_favorite, usage_count, created_at, updated_at'

type Raw = {
  id: string
  name: string
  description: string | null
  strategy: string
  schema_version: number
  draft: Json
  summary: Json | null
  source: string
  source_plan_id: string | null
  legacy_template_id: string | null
  is_favorite: boolean
  usage_count: number
  created_at: string
  updated_at: string
}

function mapRow(raw: Raw): PlanTemplateRow {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    strategy: raw.strategy,
    schemaVersion: raw.schema_version,
    payload: raw.draft,
    summary: (raw.summary as NutritionPlanTemplateSummary | null) ?? null,
    source: raw.source,
    sourcePlanId: raw.source_plan_id,
    legacyTemplateId: raw.legacy_template_id,
    isFavorite: raw.is_favorite,
    usageCount: raw.usage_count,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
  }
}

/**
 * Biblioteca del coach. Orden: favoritas primero, despues las mas usadas y al final las mas
 * recientes — que es como se busca una plantilla de verdad ("la que uso siempre").
 */
export async function findPlanTemplates(
  db: DB,
  input: { search?: string | null; limit?: number } = {}
): Promise<PlanTemplateRow[]> {
  let query = db.from('nutrition_plan_templates_v2').select(COLUMNS).is('deleted_at', null)

  const term = (input.search ?? '').trim()
  if (term) query = query.ilike('name', `%${term.replace(/%/g, '\\%')}%`)

  const { data, error } = await query
    .order('is_favorite', { ascending: false })
    .order('usage_count', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(input.limit ?? 100)

  if (error || data == null) return []
  return (data as unknown as Raw[]).map(mapRow)
}

export async function findPlanTemplateById(db: DB, id: string): Promise<PlanTemplateRow | null> {
  const { data } = await db
    .from('nutrition_plan_templates_v2')
    .select(COLUMNS)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  return data ? mapRow(data as unknown as Raw) : null
}

export async function countPlanTemplatesForCoach(db: DB, coachId: string): Promise<number> {
  const { count } = await db
    .from('nutrition_plan_templates_v2')
    .select('id', { count: 'exact', head: true })
    .eq('coach_id', coachId)
    .is('deleted_at', null)
  return count ?? 0
}

export type InsertPlanTemplateInput = {
  coachId: string
  name: string
  description: string | null
  strategy: string
  payload: Json
  schemaVersion: number
  summary: Json
  source: 'builder' | 'plan' | 'import_v1'
  sourcePlanId?: string | null
  legacyTemplateId?: string | null
  createdBy?: string | null
}

export async function insertPlanTemplate(
  db: DB,
  input: InsertPlanTemplateInput
): Promise<{ template?: PlanTemplateRow; error?: string }> {
  const { data, error } = await db
    .from('nutrition_plan_templates_v2')
    .insert({
      coach_id: input.coachId,
      name: input.name,
      description: input.description,
      strategy: input.strategy,
      draft: input.payload,
      schema_version: input.schemaVersion,
      summary: input.summary,
      source: input.source,
      source_plan_id: input.sourcePlanId ?? null,
      legacy_template_id: input.legacyTemplateId ?? null,
      created_by: input.createdBy ?? null,
    })
    .select(COLUMNS)
    .single()
  if (error || !data) return { error: error?.message ?? 'No se pudo guardar la plantilla.' }
  return { template: mapRow(data as unknown as Raw) }
}

/**
 * Cambios que el coach puede hacer sobre una plantilla suya. La procedencia (`source`,
 * `legacy_template_id`, `source_plan_id`) y el dueno NO estan aca: son inmutables desde la app
 * y el `GRANT UPDATE` column-level de la migracion es el techo real.
 */
export async function updatePlanTemplate(
  db: DB,
  id: string,
  patch: { name?: string; description?: string | null; isFavorite?: boolean; deletedAt?: string | null }
): Promise<{ error?: string }> {
  const payload: Record<string, unknown> = {}
  if (patch.name !== undefined) payload.name = patch.name
  if (patch.description !== undefined) payload.description = patch.description
  if (patch.isFavorite !== undefined) payload.is_favorite = patch.isFavorite
  if (patch.deletedAt !== undefined) payload.deleted_at = patch.deletedAt
  if (Object.keys(payload).length === 0) return {}

  const { data, error } = await db
    .from('nutrition_plan_templates_v2')
    .update(payload)
    .eq('id', id)
    .select('id')
    .maybeSingle()
  if (error) return { error: error.message }
  if (!data) return { error: 'Esa plantilla ya no esta disponible.' }
  return {}
}

/**
 * Reescribe el CONTENIDO de una plantilla (el coach la reabrio en el builder y la guardo).
 *
 * Separado de `updatePlanTemplate` a proposito: aquel toca metadatos (nombre, favorita,
 * soft-delete) y devuelve solo el id; este reescribe `draft`/`strategy`/`summary`/
 * `schema_version` juntos —los cuatro tienen que moverse en el MISMO UPDATE o la fila queda
 * con un resumen que miente sobre su draft— y devuelve la fila completa para refrescar la
 * biblioteca sin una segunda lectura.
 *
 * Las cuatro columnas estan dentro del `GRANT UPDATE` column-level de la migracion
 * (20260804120000_nutrition_plan_templates_v2.sql); la procedencia (`source`,
 * `legacy_template_id`, `source_plan_id`) y el dueno siguen sin grant, o sea inmutables.
 */
export type UpdatePlanTemplateDraftInput = {
  name?: string
  description?: string | null
  strategy: string
  payload: Json
  schemaVersion: number
  summary: Json
}

export async function updatePlanTemplateDraft(
  db: DB,
  id: string,
  input: UpdatePlanTemplateDraftInput
): Promise<{ template?: PlanTemplateRow; error?: string }> {
  const payload: Record<string, unknown> = {
    draft: input.payload,
    strategy: input.strategy,
    schema_version: input.schemaVersion,
    summary: input.summary,
  }
  if (input.name !== undefined) payload.name = input.name
  if (input.description !== undefined) payload.description = input.description

  const { data, error } = await db
    .from('nutrition_plan_templates_v2')
    .update(payload)
    .eq('id', id)
    .is('deleted_at', null)
    .select(COLUMNS)
    .maybeSingle()
  if (error) return { error: error.message }
  // Sin fila: la plantilla es de otro coach (RLS) o ya se elimino. Nunca se crea una nueva.
  if (!data) return { error: 'Esa plantilla ya no esta disponible.' }
  return { template: mapRow(data as unknown as Raw) }
}

/**
 * Suma 1 al contador de uso. Best-effort y sin transaccion: es una señal de ordenamiento de la
 * biblioteca, no un dato con el que se decida nada. Perder un incremento por una carrera es
 * preferible a bloquear la apertura del builder.
 */
export async function bumpPlanTemplateUsage(db: DB, id: string, current: number): Promise<void> {
  await db
    .from('nutrition_plan_templates_v2')
    .update({ usage_count: current + 1 })
    .eq('id', id)
}
