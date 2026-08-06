'use server'

/**
 * Server actions de PLANTILLAS de plan V2 (F3 — specs/nutrition-plan-templates-v2).
 *
 * Resuelven el callejon sin salida del Centro V2: hasta ahora el `+` SIEMPRE exigia elegir un
 * alumno antes de abrir el builder, y solo se podia copiar entre dias del MISMO plan.
 *
 * Autorizacion: sesion de coach (`getCurrentCoachSession`) + RLS de
 * `nutrition_plan_templates_v2` (lo propio, lo del team, lo de la org). El alumno no tiene
 * ninguna policy sobre la tabla. Sin gate comercial nuevo: hereda el permiso de nutricion.
 */

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { getCurrentCoachSession } from '@/services/auth/current-coach.service'
import { createClient } from '@/lib/supabase/server'
import {
  deletePlanTemplate,
  listPlanTemplates,
  loadPlanTemplate,
  renamePlanTemplate,
  savePlanTemplate,
  setPlanTemplateFavorite,
  updatePlanTemplateDraft,
  type PlanTemplateListItem,
} from '@/services/nutrition-v2/plan-templates.service'

type Actor = { db: SupabaseClient<Database>; coachId: string }

async function resolveActor(): Promise<Actor | null> {
  const { user } = await getCurrentCoachSession()
  if (!user) return null
  const supabase = await createClient()
  return { db: supabase as unknown as SupabaseClient<Database>, coachId: user.id }
}

function revalidateHub() {
  revalidatePath('/coach/nutrition-v2')
}

export type PlanTemplateListResult =
  | { ok: true; templates: PlanTemplateListItem[] }
  | { ok: false; error: string }

export async function listPlanTemplatesAction(input?: { search?: string }): Promise<PlanTemplateListResult> {
  const actor = await resolveActor()
  if (!actor) return { ok: false, error: 'No autorizado.' }
  try {
    const templates = await listPlanTemplates(actor.db, { search: input?.search ?? null })
    return { ok: true, templates }
  } catch {
    return { ok: false, error: 'No pudimos cargar tus plantillas.' }
  }
}

const SaveSchema = z.object({
  name: z.string().trim().min(1, 'Ponle un nombre a la plantilla').max(180),
  description: z.string().trim().max(2000).nullish(),
  /** Draft del contrato. Se valida entero en el servicio: el body no es autoridad. */
  draft: z.unknown(),
  /** Estado del wizard web (opcional): conserva las macros de los items libres. */
  builder: z.unknown().optional(),
  source: z.enum(['builder', 'plan']),
  sourcePlanId: z.string().uuid().nullish(),
})

export type SavePlanTemplateActionResult =
  | { ok: true; template: PlanTemplateListItem }
  | { ok: false; error: string }

export async function savePlanTemplateAction(input: unknown): Promise<SavePlanTemplateActionResult> {
  const parsed = SaveSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Revisa los datos de la plantilla.' }
  }
  const actor = await resolveActor()
  if (!actor) return { ok: false, error: 'No autorizado.' }

  const result = await savePlanTemplate(actor.db, {
    actorCoachId: actor.coachId,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    draft: parsed.data.draft,
    builder: parsed.data.builder,
    source: parsed.data.source,
    sourcePlanId: parsed.data.sourcePlanId ?? null,
  })
  if (!result.success) return { ok: false, error: result.error }
  revalidateHub()
  return { ok: true, template: result.template }
}

const UpdateDraftSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, 'Ponle un nombre a la plantilla').max(180).optional(),
  description: z.string().trim().max(2000).nullish(),
  /** Draft del contrato. Se valida entero en el servicio: el body no es autoridad. */
  draft: z.unknown(),
  /** Estado del wizard web (opcional): conserva las macros de los items libres. */
  builder: z.unknown().optional(),
})

/**
 * Guardar una plantilla que se abrio para EDITAR (`?template=<id>` del builder de plantillas).
 * Sin esto, "guardar" tras editar crearia una segunda plantilla y la biblioteca del coach se
 * llenaria de copias con el mismo nombre.
 */
export async function updatePlanTemplateDraftAction(input: unknown): Promise<SavePlanTemplateActionResult> {
  const parsed = UpdateDraftSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Revisa los datos de la plantilla.' }
  }
  const actor = await resolveActor()
  if (!actor) return { ok: false, error: 'No autorizado.' }

  const result = await updatePlanTemplateDraft(actor.db, {
    id: parsed.data.id,
    ...(parsed.data.name === undefined ? {} : { name: parsed.data.name }),
    ...(parsed.data.description === undefined ? {} : { description: parsed.data.description ?? null }),
    draft: parsed.data.draft,
    builder: parsed.data.builder,
  })
  if (!result.success) return { ok: false, error: result.error }
  revalidateHub()
  return { ok: true, template: result.template }
}

const IdSchema = z.object({ id: z.string().uuid() })

export type LoadPlanTemplateActionResult =
  | { ok: true; name: string; description: string | null; draft: unknown; builder: unknown }
  | { ok: false; error: string }

/**
 * Contenido COMPLETO de una plantilla (el mismo que el builder carga al editarla).
 *
 * Existe para el "Deshacer" de la baja: la biblioteca solo tiene metadatos
 * (`PlanTemplateListItem`), asi que sin esto restaurar significaria re-crear una plantilla
 * VACIA — justo lo que el coach cree estar recuperando. Se lee ANTES de borrar y se cachea en
 * memoria; el DELETE entonces puede salir de inmediato (ver `PlanTemplatesLibrary`).
 *
 * `ok:false` cuando la plantilla no existe, es de otro coach (RLS) o su draft ya no valida
 * contra el contrato: en ese caso NO hay nada que cachear y la UI cae a una confirmacion
 * inline sin deshacer, en vez de prometer un undo que borraria el contenido.
 */
export async function loadPlanTemplateContentAction(input: unknown): Promise<LoadPlanTemplateActionResult> {
  const parsed = IdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Solicitud inválida.' }
  const actor = await resolveActor()
  if (!actor) return { ok: false, error: 'No autorizado.' }

  const template = await loadPlanTemplate(actor.db, parsed.data.id)
  if (!template) return { ok: false, error: 'Esa plantilla ya no se puede abrir.' }
  return {
    ok: true,
    name: template.name,
    description: template.description,
    draft: template.draft,
    builder: template.builder,
  }
}

export type PlanTemplateMutationResult = { ok: true } | { ok: false; error: string }

export async function renamePlanTemplateAction(input: unknown): Promise<PlanTemplateMutationResult> {
  const parsed = IdSchema.extend({
    name: z.string().trim().min(1, 'Ponle un nombre a la plantilla').max(180),
    description: z.string().trim().max(2000).nullish(),
  }).safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Solicitud inválida.' }
  const actor = await resolveActor()
  if (!actor) return { ok: false, error: 'No autorizado.' }

  const result = await renamePlanTemplate(actor.db, {
    id: parsed.data.id,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
  })
  if (!result.success) return { ok: false, error: result.error ?? 'No se pudo renombrar.' }
  revalidateHub()
  return { ok: true }
}

export async function setPlanTemplateFavoriteAction(input: unknown): Promise<PlanTemplateMutationResult> {
  const parsed = IdSchema.extend({ isFavorite: z.boolean() }).safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Solicitud inválida.' }
  const actor = await resolveActor()
  if (!actor) return { ok: false, error: 'No autorizado.' }

  const result = await setPlanTemplateFavorite(actor.db, parsed.data)
  if (!result.success) return { ok: false, error: result.error ?? 'No se pudo actualizar.' }
  revalidateHub()
  return { ok: true }
}

/** Soft-delete: la plantilla desaparece de la biblioteca pero la fila queda para trazabilidad. */
export async function deletePlanTemplateAction(input: unknown): Promise<PlanTemplateMutationResult> {
  const parsed = IdSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: 'Solicitud inválida.' }
  const actor = await resolveActor()
  if (!actor) return { ok: false, error: 'No autorizado.' }

  const result = await deletePlanTemplate(actor.db, parsed.data.id)
  if (!result.success) return { ok: false, error: result.error ?? 'No se pudo eliminar.' }
  revalidateHub()
  return { ok: true }
}
