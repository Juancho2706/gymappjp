'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  FoodCatalogCursorSchema,
  FoodCatalogSearchReadModelSchema,
  NutritionPlanDraftSchema,
  type NutritionPlanDraft,
} from '@eva/nutrition-v2'
import { createClient } from '@/lib/supabase/server'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import { isNutritionV2Enabled } from '@/services/nutrition-v2-rollout.service'
import { nutritionV2CoachScopeFromWorkspace } from '@/services/nutrition-v2-read.service'
import { getNutritionPlansPageCoach } from '../../../../nutrition-plans/_data/nutrition-page.queries'
import {
  buildItemInsertRow,
  buildSlotInsertRow,
  buildVariantInsertRow,
  type BuilderFood,
} from '../_lib/draft-builder'

// Builder V2 (web coach): publicacion de un plan de nutricion versionado.
// Fail-closed: cada accion re-verifica el gate (isNutritionV2Enabled, webCoach) y el
// scope del workspace. El draft se valida contra NutritionPlanDraftSchema. La
// persistencia pasa por las tablas versionadas (RLS coach-scoped) y la publicacion
// transaccional es SOLO via publish_nutrition_plan_v2 (idempotente por clave estable).
// Las macros de snapshot del alumno se re-derivan de `foods` en el servidor.

type DbError = { message: string; code?: string }
type DbResult<T> = { data: T | null; error: DbError | null }

interface SelectAfterInsert {
  single(): Promise<DbResult<{ id: string }>>
}
interface InsertResult extends PromiseLike<DbResult<null>> {
  select(columns: string): SelectAfterInsert
}
interface ReadChain<T> extends PromiseLike<DbResult<T[]>> {
  eq(column: string, value: unknown): ReadChain<T>
  order(column: string, options: { ascending: boolean }): ReadChain<T>
  limit(count: number): ReadChain<T>
  maybeSingle(): Promise<DbResult<T>>
}
interface TableApi {
  insert(rows: Record<string, unknown> | Record<string, unknown>[]): InsertResult
  select<T>(columns: string): ReadChain<T>
}
interface NutritionV2Db {
  from(table: string): TableApi
  rpc(name: string, args?: Record<string, unknown>): Promise<DbResult<unknown>>
}

type ActionFailure = { ok: false; code: string; error: string; fields?: Array<{ path: string; message: string }> }
type PublishSuccess = { ok: true; versionId: string; planId: string }

function fail(code: string, error: string, fields?: ActionFailure['fields']): ActionFailure {
  return { ok: false, code, error, ...(fields ? { fields } : {}) }
}

function zodFields(error: z.ZodError): ActionFailure['fields'] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
}

const PublishInputSchema = z.object({
  draft: NutritionPlanDraftSchema,
  idempotencyKey: z.string().trim().min(8).max(200),
  effectiveFrom: z.string().date(),
})

const SearchInputSchema = z.object({
  clientId: z.string().uuid(),
  query: z.string().trim().max(120),
  countryCode: z.string().trim().length(2).default('CL'),
  cursor: FoodCatalogCursorSchema.nullable().default(null),
})

async function authorizeCoach(
  clientId: string,
): Promise<{ ok: true; db: NutritionV2Db; userId: string } | ActionFailure> {
  const { user } = await getNutritionPlansPageCoach()
  if (!user) return fail('UNAUTHENTICATED', 'Debes iniciar sesion para editar planes.')

  const workspace = await getPreferredWorkspaceForRender(user.id)
  const teamId = workspace?.type === 'coach_team' ? workspace.teamId : null
  const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null

  const enabled = await isNutritionV2Enabled({
    surface: 'webCoach',
    userId: user.id,
    clientId,
    coachId: user.id,
    teamId,
    orgId,
  })
  if (!enabled) return fail('ROLLOUT_DISABLED', 'La nueva experiencia de nutricion no esta habilitada.')

  try {
    nutritionV2CoachScopeFromWorkspace(workspace)
  } catch {
    return fail('SCOPE_REQUIRED', 'Debes tener un espacio de trabajo de coach activo.')
  }

  const db = (await createClient()) as unknown as NutritionV2Db
  return { ok: true, db, userId: user.id }
}

function mapWriteError(error: DbError, phase: string): ActionFailure {
  const code = error.code ?? 'DB_ERROR'
  const message = error.message ?? ''
  if (code === '42501') {
    return fail('SCOPE_DENIED', 'No tienes permiso para editar el plan de este alumno.')
  }
  if (message.includes('effective_date_must_follow_current_version')) {
    return fail('EFFECTIVE_DATE', 'La fecha de vigencia debe ser posterior a la de la version vigente.')
  }
  if (message.includes('requires_meal_slot')) {
    return fail('NEEDS_SLOT', 'El plan estructurado necesita al menos una franja.')
  }
  if (message.includes('requires_variant')) {
    return fail('NEEDS_VARIANT', 'El plan necesita al menos un dia definido.')
  }
  if (code === '22023') {
    return fail('INVALID_DRAFT', 'El plan tiene datos invalidos y no se pudo publicar.')
  }
  return fail('WRITE_FAILED', 'No se pudo guardar el plan (' + phase + '). Intenta nuevamente.')
}

interface ClientScopeRow {
  coach_id: string
  org_id: string | null
  team_id: string | null
}

interface FoodRow {
  id: string
  name: string
  brand: string | null
  calories: number
  protein_g: number
  carbs_g: number
  fats_g: number
  fiber_g: number | null
  serving_size: number
  serving_unit: string | null
}

function toBuilderFood(row: FoodRow): BuilderFood {
  return {
    id: row.id,
    name: row.name,
    brand: row.brand,
    calories: row.calories,
    proteinG: row.protein_g,
    carbsG: row.carbs_g,
    fatsG: row.fats_g,
    fiberG: row.fiber_g,
    servingSize: row.serving_size,
    servingUnit: row.serving_unit ?? 'g',
  }
}

function collectFoodIds(draft: NutritionPlanDraft): string[] {
  const ids = new Set<string>()
  for (const variant of draft.dayVariants) {
    for (const slot of variant.mealSlots) {
      for (const item of slot.items) {
        if (item.foodId) ids.add(item.foodId)
      }
    }
  }
  return [...ids]
}

/**
 * Publica un plan V2: valida el draft, persiste la version borrador (plan + version +
 * variantes + franjas + items) via tablas versionadas RLS-scoped, y publica de forma
 * transaccional con publish_nutrition_plan_v2 (idempotente por clave estable).
 */
export async function publishPlanAction(input: unknown): Promise<PublishSuccess | ActionFailure> {
  const parsed = PublishInputSchema.safeParse(input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', 'El plan tiene datos invalidos.', zodFields(parsed.error))
  }
  const { draft, idempotencyKey, effectiveFrom } = parsed.data

  const auth = await authorizeCoach(draft.clientId)
  if (!auth.ok) return auth
  const { db, userId } = auth

  const existing = await db
    .from('nutrition_plan_versions_v2')
    .select<{ id: string; plan_id: string }>('id, plan_id')
    .eq('publish_idempotency_key', idempotencyKey)
    .maybeSingle()
  if (existing.error) return mapWriteError(existing.error, 'idempotencia')
  if (existing.data) return { ok: true, versionId: existing.data.id, planId: existing.data.plan_id }

  const clientRes = await db
    .from('clients')
    .select<ClientScopeRow>('coach_id, org_id, team_id')
    .eq('id', draft.clientId)
    .maybeSingle()
  if (clientRes.error) return mapWriteError(clientRes.error, 'alumno')
  if (!clientRes.data) return fail('CLIENT_NOT_FOUND', 'No se encontro el alumno en tu espacio.')
  const clientScope = clientRes.data

  let planId: string
  let nextVersion = 1
  if (draft.planId) {
    const planRes = await db
      .from('nutrition_plans_v2')
      .select<{ id: string; client_id: string }>('id, client_id')
      .eq('id', draft.planId)
      .maybeSingle()
    if (planRes.error) return mapWriteError(planRes.error, 'plan')
    if (!planRes.data || planRes.data.client_id !== draft.clientId) {
      return fail('PLAN_NOT_FOUND', 'El plan indicado no pertenece a este alumno.')
    }
    planId = planRes.data.id
    const maxRes = await db
      .from('nutrition_plan_versions_v2')
      .select<{ version_number: number }>('version_number')
      .eq('plan_id', planId)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (maxRes.error) return mapWriteError(maxRes.error, 'version')
    nextVersion = (maxRes.data?.version_number ?? 0) + 1
  } else {
    const planIns = await db
      .from('nutrition_plans_v2')
      .insert({
        client_id: draft.clientId,
        coach_id: clientScope.coach_id,
        org_id: clientScope.org_id,
        team_id: clientScope.team_id,
        name: draft.name,
        strategy: draft.strategy,
        created_by: userId,
        updated_by: userId,
      })
      .select('id')
      .single()
    if (planIns.error || !planIns.data) return mapWriteError(planIns.error ?? { message: 'no plan' }, 'plan')
    planId = planIns.data.id
  }

  const versionIns = await db
    .from('nutrition_plan_versions_v2')
    .insert({
      plan_id: planId,
      version_number: nextVersion,
      status: 'draft',
      strategy: draft.strategy,
      timezone: draft.timezone,
      student_permissions: draft.permissions,
      visible_notes: draft.visibleNotes,
      private_notes: draft.privateNotes,
      protocol_notes: draft.protocolNotes,
      created_by: userId,
      updated_by: userId,
    })
    .select('id')
    .single()
  if (versionIns.error || !versionIns.data) {
    return mapWriteError(versionIns.error ?? { message: 'no version' }, 'version')
  }
  const versionId = versionIns.data.id

  const foodIds = collectFoodIds(draft)
  const foodMap = new Map<string, BuilderFood>()
  for (const id of foodIds) {
    const foodRes = await db
      .from('foods')
      .select<FoodRow>('id, name, brand, calories, protein_g, carbs_g, fats_g, fiber_g, serving_size, serving_unit')
      .eq('id', id)
      .maybeSingle()
    if (foodRes.error) return mapWriteError(foodRes.error, 'alimentos')
    if (foodRes.data) foodMap.set(id, toBuilderFood(foodRes.data))
  }

  for (const variant of draft.dayVariants) {
    const variantIns = await db
      .from('nutrition_day_variants_v2')
      .insert(buildVariantInsertRow(versionId, variant))
      .select('id')
      .single()
    if (variantIns.error || !variantIns.data) {
      return mapWriteError(variantIns.error ?? { message: 'no variant' }, 'dia')
    }
    const variantId = variantIns.data.id

    for (const slot of variant.mealSlots) {
      const slotIns = await db
        .from('nutrition_meal_slots_v2')
        .insert(buildSlotInsertRow(versionId, variantId, slot))
        .select('id')
        .single()
      if (slotIns.error || !slotIns.data) {
        return mapWriteError(slotIns.error ?? { message: 'no slot' }, 'franja')
      }
      const mealSlotId = slotIns.data.id

      if (slot.items.length > 0) {
        const itemRows = slot.items.map((item, index) =>
          buildItemInsertRow({
            versionId,
            mealSlotId,
            orderIndex: index,
            item,
            food: item.foodId ? foodMap.get(item.foodId) ?? null : null,
          }),
        )
        const itemsIns = await db.from('nutrition_prescription_items_v2').insert(itemRows)
        if (itemsIns.error) return mapWriteError(itemsIns.error, 'items')
      }
    }
  }

  const publishRes = await db.rpc('publish_nutrition_plan_v2', {
    p_version_id: versionId,
    p_effective_from: effectiveFrom,
    p_idempotency_key: idempotencyKey,
  })
  if (publishRes.error) return mapWriteError(publishRes.error, 'publicacion')

  const publishedId = z.string().uuid().safeParse(publishRes.data)
  if (!publishedId.success) {
    return fail('INVALID_RESPONSE', 'La publicacion devolvio una respuesta inesperada.')
  }

  revalidatePath('/coach/nutrition-v2')
  revalidatePath('/coach/nutrition-v2/' + draft.clientId)
  return { ok: true, versionId: publishedId.data, planId }
}

/**
 * Busqueda en el catalogo local (Chile) via search_food_catalog_v2 para el builder.
 * Solo lectura; re-verifica el gate webCoach y devuelve el read model validado.
 */
export async function searchFoodCatalogCoachAction(
  input: unknown,
): Promise<{ ok: true; result: z.infer<typeof FoodCatalogSearchReadModelSchema> } | ActionFailure> {
  const parsed = SearchInputSchema.safeParse(input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', 'Busqueda invalida.', zodFields(parsed.error))
  }

  const auth = await authorizeCoach(parsed.data.clientId)
  if (!auth.ok) return auth

  const search = await auth.db.rpc('search_food_catalog_v2', {
    p_query: parsed.data.query,
    p_country_code: parsed.data.countryCode.toUpperCase(),
    p_cursor_score: parsed.data.cursor?.score ?? null,
    p_cursor_name: parsed.data.cursor?.name ?? null,
    p_cursor_id: parsed.data.cursor?.id ?? null,
    p_page_size: 25,
  })
  if (search.error) return mapWriteError(search.error, 'catalogo')

  const result = FoodCatalogSearchReadModelSchema.safeParse(search.data)
  if (!result.success) {
    return fail('CATALOG_CONTRACT_MISMATCH', 'El catalogo devolvio un formato inesperado.')
  }
  return { ok: true, result: result.data }
}
