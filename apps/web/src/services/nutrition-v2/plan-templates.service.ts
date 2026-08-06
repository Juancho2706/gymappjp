import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/database.types'
import {
  MAX_PLAN_TEMPLATES_PER_COACH,
  TEMPLATE_SCHEMA_VERSION,
  buildTemplatePayload,
  parseTemplatePayload,
  summarizeTemplateDraft,
  type NutritionPlanTemplateDraft,
  type NutritionPlanTemplateSummary,
} from '@eva/nutrition-v2'
import {
  bumpPlanTemplateUsage,
  countPlanTemplatesForCoach,
  findPlanTemplateById,
  findPlanTemplates,
  insertPlanTemplate,
  updatePlanTemplate,
  updatePlanTemplateDraft as updatePlanTemplateDraftRow,
  type PlanTemplateRow,
} from '@/infrastructure/db/plan-templates.repository'

/**
 * Servicio de plantillas de plan V2 (F3 — specs/nutrition-plan-templates-v2).
 *
 * Sin imports de Next (Clean Architecture): recibe el cliente DB del caller, que SIEMPRE es el
 * user-scoped del coach. El techo de autorizacion lo pone el caller (server action con el mismo
 * gate del builder / API movil) y, debajo, la RLS de la tabla.
 *
 * El `draft` guardado es JSON client-controlled: se valida con Zod al GUARDAR y OTRA VEZ al
 * abrirlo. Confiar en lo que quedo escrito es exactamente como se cuela un draft corrupto al
 * builder de un alumno real.
 */

type DB = SupabaseClient<Database>

export type PlanTemplateListItem = {
  id: string
  name: string
  description: string | null
  strategy: string
  summary: NutritionPlanTemplateSummary | null
  isFavorite: boolean
  usageCount: number
  source: string
  /** false ⇒ el draft guardado ya no valida contra el contrato: la UI la muestra, pero no deja abrirla. */
  readable: boolean
  updatedAt: string
}

function toListItem(row: PlanTemplateRow): PlanTemplateListItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    strategy: row.strategy,
    summary: row.summary,
    isFavorite: row.isFavorite,
    usageCount: row.usageCount,
    source: row.source,
    readable: parseTemplatePayload(row.payload) != null,
    updatedAt: row.updatedAt,
  }
}

export async function listPlanTemplates(
  db: DB,
  input: { search?: string | null } = {}
): Promise<PlanTemplateListItem[]> {
  const rows = await findPlanTemplates(db, { search: input.search })
  return rows.map(toListItem)
}

export type SavePlanTemplateResult =
  | { success: true; template: PlanTemplateListItem }
  | { success: false; error: string }

/**
 * Traduce el error crudo de la escritura a algo que el coach pueda accionar.
 *
 * El caso que motivo esto (QA del owner, 2026-08-05): un INSERT devolvio `new row violates
 * row-level security policy for table "nutrition_plan_templates_v2"` y ese texto llego tal cual
 * al dialogo. La policy `npt2_insert_own` exige `coach_id = auth.uid()` y la app SIEMPRE escribe
 * `coach_id = <sub del JWT>`, asi que el unico modo de fallarla es que la base haya visto
 * `auth.uid() = NULL`: el token que viajo a PostgREST no era el de una sesion viva (expirado o
 * ausente) aunque `getClaims()` —verificacion LOCAL contra el JWKS— ya hubiera devuelto un `sub`
 * del cookie. Es una carrera de refresco de sesion, no un problema de tenencia: la salida real
 * para el coach es recargar. Se registra en el server para poder distinguirlo de un 42501 de
 * scope si vuelve a pasar.
 */
function toWriteErrorMessage(raw: string | undefined, phase: 'insert' | 'update'): string {
  const message = raw ?? ''
  if (/row-level security|permission denied|42501/i.test(message)) {
    console.error('nutrition_v2_plan_template_write_denied', { phase, message })
    return 'Tu sesión ya no tiene permiso para guardar plantillas. Recarga la página e inténtalo de nuevo.'
  }
  return message || 'No se pudo guardar la plantilla.'
}

/**
 * Guarda una plantilla desde el borrador del builder o desde un plan publicado.
 *
 * `buildTemplatePayload` es quien quita la identidad (plan, version, alumno y los ids de cada
 * fila hija). El `builder` opcional conserva el estado exacto del wizard web — con las macros de
 * los items libres, que el contrato no lleva — para que reutilizar devuelva el plan identico.
 */
export async function savePlanTemplate(
  db: DB,
  input: {
    actorCoachId: string
    name: string
    description?: string | null
    draft: unknown
    builder?: unknown
    source: 'builder' | 'plan'
    sourcePlanId?: string | null
  }
): Promise<SavePlanTemplateResult> {
  const used = await countPlanTemplatesForCoach(db, input.actorCoachId)
  if (used >= MAX_PLAN_TEMPLATES_PER_COACH) {
    return {
      success: false,
      error: `Alcanzaste el máximo de ${MAX_PLAN_TEMPLATES_PER_COACH} plantillas. Elimina alguna para guardar otra.`,
    }
  }

  let payload: ReturnType<typeof buildTemplatePayload>
  try {
    payload = buildTemplatePayload({
      draft: input.draft as never,
      builder: input.builder,
    })
  } catch {
    return { success: false, error: 'Ese plan todavía no se puede guardar como plantilla.' }
  }

  // Segunda barrera: lo que se va a escribir tiene que poder volver a leerse.
  const roundTrip = parseTemplatePayload(payload)
  if (!roundTrip) return { success: false, error: 'Ese plan todavía no se puede guardar como plantilla.' }

  const summary = summarizeTemplateDraft(roundTrip.draft)
  const { template, error } = await insertPlanTemplate(db, {
    coachId: input.actorCoachId,
    name: input.name.trim(),
    description: (input.description ?? '').trim() || null,
    strategy: roundTrip.draft.strategy,
    payload: payload as unknown as Json,
    schemaVersion: TEMPLATE_SCHEMA_VERSION,
    summary: summary as unknown as Json,
    source: input.source,
    sourcePlanId: input.sourcePlanId ?? null,
    createdBy: input.actorCoachId,
  })
  if (error || !template) return { success: false, error: toWriteErrorMessage(error, 'insert') }
  return { success: true, template: toListItem(template) }
}

/**
 * Reescribe una plantilla EXISTENTE con el contenido que el coach acaba de armar en el builder
 * de plantillas (`/coach/nutrition-v2/plantillas/builder?template=<id>`).
 *
 * Es el gemelo de `savePlanTemplate` y comparte sus DOS barreras — quitar la identidad
 * (`buildTemplatePayload`) y el round-trip Zod antes de escribir — porque el riesgo es el
 * mismo: dejar en la columna un draft que despues no se pueda volver a abrir. Lo que NO
 * comparte es el tope por coach: actualizar no suma filas, asi que un coach en el limite
 * igual puede seguir editando lo que ya tiene (cobrarle el tope ahi seria dejarlo encerrado).
 *
 * El dueño no se verifica aca: lo pone la RLS de la tabla sobre el cliente user-scoped del
 * coach — un id de otro coach no matchea ninguna fila y el repository responde "ya no esta
 * disponible" en vez de escribir.
 */
export async function updatePlanTemplateDraft(
  db: DB,
  input: {
    id: string
    name?: string
    description?: string | null
    draft: unknown
    builder?: unknown
  }
): Promise<SavePlanTemplateResult> {
  let payload: ReturnType<typeof buildTemplatePayload>
  try {
    payload = buildTemplatePayload({
      draft: input.draft as never,
      builder: input.builder,
    })
  } catch {
    return { success: false, error: 'Ese plan todavía no se puede guardar como plantilla.' }
  }

  // Segunda barrera: lo que se va a escribir tiene que poder volver a leerse.
  const roundTrip = parseTemplatePayload(payload)
  if (!roundTrip) return { success: false, error: 'Ese plan todavía no se puede guardar como plantilla.' }

  const summary = summarizeTemplateDraft(roundTrip.draft)
  const { template, error } = await updatePlanTemplateDraftRow(db, input.id, {
    ...(input.name === undefined ? {} : { name: input.name.trim() }),
    ...(input.description === undefined
      ? {}
      : { description: (input.description ?? '').trim() || null }),
    strategy: roundTrip.draft.strategy,
    payload: payload as unknown as Json,
    schemaVersion: TEMPLATE_SCHEMA_VERSION,
    summary: summary as unknown as Json,
  })
  if (error || !template) return { success: false, error: toWriteErrorMessage(error, 'update') }
  return { success: true, template: toListItem(template) }
}

export type LoadedPlanTemplate = {
  id: string
  name: string
  /**
   * Viaja para que EDITAR la plantilla pueda precargarla: el guardado reescribe la fila
   * completa, asi que abrir el dialogo con la descripcion vacia la borraria en silencio.
   */
  description: string | null
  draft: NutritionPlanTemplateDraft
  /** Estado del wizard web guardado con la plantilla, si existe. */
  builder: unknown
  usageCount: number
}

/**
 * Abre una plantilla para aplicarla. Devuelve `null` si no existe o si su draft ya no valida:
 * preferimos "no se puede abrir" a rehidratar el wizard a medias, porque publicar reescribe la
 * version completa y un dato faltante seria una perdida silenciosa (misma regla que el guard
 * anti-colapso del builder).
 */
export async function loadPlanTemplate(db: DB, id: string): Promise<LoadedPlanTemplate | null> {
  const row = await findPlanTemplateById(db, id)
  if (!row) return null
  const payload = parseTemplatePayload(row.payload)
  if (!payload) return null
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    draft: payload.draft,
    builder: payload.builder,
    usageCount: row.usageCount,
  }
}

/** Marca que la plantilla se uso. Best-effort: nunca debe impedir abrir el builder. */
export async function markPlanTemplateUsed(db: DB, template: LoadedPlanTemplate): Promise<void> {
  try {
    await bumpPlanTemplateUsage(db, template.id, template.usageCount)
  } catch {
    // Señal de ordenamiento de la biblioteca, no un dato con el que se decida nada.
  }
}

export async function renamePlanTemplate(
  db: DB,
  input: { id: string; name: string; description?: string | null }
): Promise<{ success: boolean; error?: string }> {
  const { error } = await updatePlanTemplate(db, input.id, {
    name: input.name.trim(),
    description: input.description === undefined ? undefined : (input.description ?? '').trim() || null,
  })
  return error ? { success: false, error } : { success: true }
}

export async function setPlanTemplateFavorite(
  db: DB,
  input: { id: string; isFavorite: boolean }
): Promise<{ success: boolean; error?: string }> {
  const { error } = await updatePlanTemplate(db, input.id, { isFavorite: input.isFavorite })
  return error ? { success: false, error } : { success: true }
}

/**
 * Soft-delete: la fila queda para trazabilidad y el unico parcial libera el `legacy_template_id`.
 *
 * Va por RPC definer y NO por UPDATE PostgREST: marcar `deleted_at` vuelve la fila invisible
 * para las policies de SELECT (todas filtran `deleted_at IS NULL`), y PostgREST envuelve el
 * UPDATE en un CTE con RETURNING incluso con `return=minimal`/`count` — Postgres lo rechaza
 * con "new row violates row-level security policy". Verificado dos veces en LIVE (QA 05-08).
 */
export async function deletePlanTemplate(db: DB, id: string): Promise<{ success: boolean; error?: string }> {
  // Cast puntual: el RPC (migracion 20260806022947) aun no esta en database.types.ts — la
  // regeneracion quedo pendiente en la otra corriente (panel CEO) y regenerar aqui arrastraria
  // su schema a este commit.
  const rpc = db.rpc as unknown as (
    fn: string,
    args: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message: string } | null }>
  const { data, error } = await rpc('soft_delete_nutrition_plan_template_v2', { p_id: id })
  if (error) return { success: false, error: error.message }
  if (data !== true) return { success: false, error: 'Esa plantilla ya no esta disponible.' }
  return { success: true }
}
