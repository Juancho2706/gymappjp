import 'server-only'

import { z } from 'zod'
import type { NutritionPlanDraft } from '@eva/nutrition-v2'
import { createClient } from '@/lib/supabase/server'
import { rateLimitNutritionCatalogSearch, rateLimitNutritionCoachWrite } from '@/lib/rate-limit'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import { isNutritionV2Enabled } from '@/services/nutrition-v2-rollout.service'
import { nutritionV2CoachScopeFromWorkspace } from '@/services/nutrition-v2-read.service'
import { getNutritionPlansPageCoach } from '@/app/coach/nutrition-plans/_data/nutrition-page.queries'
import {
  nutritionProCtxFromWorkspace,
  type NutritionProCtx,
  type NutritionProFeature,
} from '@/app/coach/nutrition-v2/_lib/nutrition-pro'
import type { WorkspaceSummary } from '@/domain/auth/types'
import {
  buildExchangeTargetInsertRow,
  buildItemInsertRow,
  buildItemSubstitutionInsertRow,
  buildSlotInsertRow,
  buildVariantInsertRow,
  collectExchangeGroupIds,
  collectSubstitutionFoodIds,
  ExchangeGroupSnapshotError,
  type BuilderExchangeGroup,
  type BuilderFood,
} from '@/app/coach/nutrition-v2/[clientId]/builder/_lib/draft-builder'

// Persistencia compartida del Builder V2 (web coach). Este modulo NO es 'use server':
// aloja los tipos, helpers del lado servidor y la rutina transaccional de persistir+publicar
// un draft, para que tanto publishPlanAction (builder) como assignPlanToClientsAction
// (asignar a otros alumnos) reusen EXACTAMENTE el mismo camino de escritura
// (plan -> version -> variantes -> franjas -> items -> publish_nutrition_plan_v2).
// Fail-closed: authorizeCoach re-verifica el gate (rollout + webCoach) y el scope del
// workspace; la publicacion transaccional (RPC) revalida can_manage (RLS) por cada alumno.
// Las macros de snapshot se re-derivan de foods en el servidor.

export type DbError = { message: string; code?: string }
export type DbResult<T> = { data: T | null; error: DbError | null }

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
export interface NutritionV2Db {
  from(table: string): TableApi
  rpc(name: string, args?: Record<string, unknown>): Promise<DbResult<unknown>>
}

export type ActionFailure = {
  ok: false
  code: string
  error: string
  feature?: NutritionProFeature
  fields?: Array<{ path: string; message: string }>
}
export type PublishSuccess = { ok: true; versionId: string; planId: string }

export function fail(code: string, error: string, fields?: ActionFailure['fields']): ActionFailure {
  return { ok: false, code, error, ...(fields ? { fields } : {}) }
}

export function zodFields(error: z.ZodError): ActionFailure['fields'] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
}

export function mapWriteError(error: DbError, phase: string): ActionFailure {
  const code = error.code ?? 'DB_ERROR'
  const message = error.message ?? ''
  if (code === '42501') {
    return fail('SCOPE_DENIED', 'No tienes permiso para editar el plan de este alumno.')
  }
  if (message.includes('publish_stale_base')) {
    return fail(
      'STALE_BASE',
      'Este plan cambio en otra sesion. Recarga para ver la version vigente antes de editar.',
    )
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

export interface AuthorizedCoach {
  ok: true
  db: NutritionV2Db
  userId: string
  proCtx: NutritionProCtx
  workspace: WorkspaceSummary | null
}

export async function authorizeCoach(
  clientId: string,
  limiter: 'coach-write' | 'catalog-search' = 'coach-write',
): Promise<AuthorizedCoach | ActionFailure> {
  const { user } = await getNutritionPlansPageCoach()
  if (!user) return fail('UNAUTHENTICATED', 'Debes iniciar sesion para editar planes.')

  // Limite por coach autenticado antes de tocar la base (no hay IP en una server action):
  // la busqueda de catalogo usa su propio cupo laxo; el resto (publicar/asignar/archivar/crear)
  // comparte el cupo de escritura.
  const limited =
    limiter === 'catalog-search'
      ? await rateLimitNutritionCatalogSearch(user.id)
      : await rateLimitNutritionCoachWrite(user.id)
  if (!limited.ok) {
    return fail('RATE_LIMITED', 'Demasiadas solicitudes. Espera un momento y vuelve a intentar.')
  }

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
  return { ok: true, db, userId: user.id, proCtx: nutritionProCtxFromWorkspace(user.id, workspace), workspace }
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
    category: null,
    media: null,
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

// -- Porciones (intercambios): resolucion server-side de grupos para el FREEZE (T0.3) --
//
// El snapshot de cada target se congela al persistir el draft (mecanica identica a las
// macros de items: `foods` se resuelve server-side y `buildItemInsertRow` congela). Aqui
// se resuelven los `exchange_groups` referenciados por el draft, mas los grupos BASE que
// aparecen en `composed_of` (LEG -> P + C), para enriquecer el snapshot (SPEC R2/A2).
//
// NOTA (codigo gana sobre SPEC — anotada): el SPEC B5/R2 pide resolver el grupo por id
// INCLUSO soft-borrado. La policy `xg_select` de `exchange_groups`
// (20260611093001_nutrition_exchanges.sql) exige `deleted_at IS NULL`, de modo que el
// cliente RLS-scoped del coach NO lee grupos soft-borrados: si el grupo esta soft-borrado
// (o no existe), la resolucion falla con error EXPLICITO (`EXCHANGE_GROUP_NOT_FOUND`),
// jamas snapshot NULL — se respeta el invariante duro. Cerrar del todo el sub-caso
// soft-borrado exigiria una lectura service-role acotada por id (cambio de scope de
// seguridad, fuera de T0.3); queda como follow-up.

interface ExchangeGroupRow {
  id: string
  code: string
  name: string
  ref_calories: number
  ref_protein_g: number
  ref_carbs_g: number
  ref_fats_g: number
  composed_of: Array<{ code: string; portions: number }> | null
  macros_confirmed: boolean
  is_system: boolean
}

const EXCHANGE_GROUP_COLUMNS =
  'id, code, name, ref_calories, ref_protein_g, ref_carbs_g, ref_fats_g, composed_of, macros_confirmed, is_system'

function toBuilderExchangeGroup(row: ExchangeGroupRow): BuilderExchangeGroup {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    refCalories: row.ref_calories,
    refProteinG: row.ref_protein_g,
    refCarbsG: row.ref_carbs_g,
    refFatsG: row.ref_fats_g,
    composedOf: row.composed_of,
    macrosConfirmed: row.macros_confirmed,
  }
}

export interface ResolvedExchangeGroups {
  byId: Map<string, BuilderExchangeGroup>
  byCode: Map<string, BuilderExchangeGroup>
}

/**
 * Resuelve, RLS-scoped, todos los grupos de intercambio que el draft necesita para el
 * freeze: (1) los referenciados directo por los targets (por id); (2) los grupos BASE por
 * codigo referenciados en `composed_of` de esos grupos (LEG -> P + C), tomando el grupo
 * system VIVO por codigo. Falla-cerrado con `ActionFailure` si algun grupo no se resuelve
 * (nunca deja pasar un target sin snapshot). Draft sin porciones ⇒ mapas vacios (Q1: el
 * camino de escritura queda byte-identico a hoy).
 */
export async function resolveExchangeGroupsForDraft(
  db: NutritionV2Db,
  draft: NutritionPlanDraft,
): Promise<{ ok: true; groups: ResolvedExchangeGroups } | ActionFailure> {
  const ids = collectExchangeGroupIds(draft)
  const byId = new Map<string, BuilderExchangeGroup>()
  const byCode = new Map<string, BuilderExchangeGroup>()
  if (ids.length === 0) return { ok: true, groups: { byId, byCode } }

  // 1) Grupos directos por id (RLS: system + propios + team activo; soft-borrado no visible).
  for (const id of ids) {
    const res = await db
      .from('exchange_groups')
      .select<ExchangeGroupRow>(EXCHANGE_GROUP_COLUMNS)
      .eq('id', id)
      .maybeSingle()
    if (res.error) return mapWriteError(res.error, 'grupos')
    if (!res.data) {
      return fail(
        'EXCHANGE_GROUP_NOT_FOUND',
        'Un grupo de porciones del plan ya no esta disponible. Recarga el builder para actualizar los grupos.',
      )
    }
    const group = toBuilderExchangeGroup(res.data)
    byId.set(group.id, group)
    if (!byCode.has(group.code)) byCode.set(group.code, group)
  }

  // 2) Grupos BASE por codigo referenciados en `composed_of` y aun no resueltos. Se toma el
  //    grupo SYSTEM vivo por codigo (LEG->P+C son system; los custom compuestos estan fuera
  //    de alcance F1 — SPEC R3). Congelar aqui el ref_* VIGENTE del base es lo correcto.
  const neededBaseCodes = new Set<string>()
  for (const group of byId.values()) {
    for (const part of group.composedOf ?? []) {
      if (!byCode.has(part.code)) neededBaseCodes.add(part.code)
    }
  }
  for (const code of neededBaseCodes) {
    const res = await db
      .from('exchange_groups')
      .select<ExchangeGroupRow>(EXCHANGE_GROUP_COLUMNS)
      .eq('code', code)
      .eq('is_system', true)
      .maybeSingle()
    if (res.error) return mapWriteError(res.error, 'grupos-base')
    if (!res.data) {
      return fail(
        'EXCHANGE_BASE_GROUP_NOT_FOUND',
        'No se pudo resolver un grupo base de un compuesto (por ejemplo Legumbres). Reintenta.',
      )
    }
    const base = toBuilderExchangeGroup(res.data)
    if (!byCode.has(base.code)) byCode.set(base.code, base)
    if (!byId.has(base.id)) byId.set(base.id, base)
  }

  return { ok: true, groups: { byId, byCode } }
}

/**
 * Resuelve el plan V2 activo de un alumno (para APPEND de una nueva version en vez de crear
 * un plan duplicado). RLS-scoped: si el alumno esta fuera del pool, la lectura no devuelve
 * filas y se retorna null (persistAndPublishDraft creara un plan nuevo, cuya escritura la
 * RLS negara igualmente). Elige el plan activo mas reciente ante multiples.
 */
export async function resolveActiveClientPlanId(
  db: NutritionV2Db,
  clientId: string,
): Promise<{ ok: true; planId: string | null } | ActionFailure> {
  const res = await db
    .from('nutrition_plans_v2')
    .select<{ id: string }>('id')
    .eq('client_id', clientId)
    .eq('lifecycle_status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (res.error) return mapWriteError(res.error, 'plan-existente')
  return { ok: true, planId: res.data?.id ?? null }
}

/**
 * Resuelve un plan V2 ACTIVO del alumno que todavia NO tiene version publicada
 * (`current_published_version_id` null) para REUTILIZARLO en vez de crear un duplicado.
 *
 * Motivo (secuela del bug de grants 42501): `persistAndPublishDraft` inserta el plan y luego
 * la version/variantes/franjas/items en llamadas PostgREST separadas (no hay transaccion que
 * cruce todas). Si una escritura posterior falla, la fila del plan queda HUERFANA (0 versiones).
 * Al reintentar, el builder vuelve con `draft.planId` null y crearia OTRO plan -> el alumno
 * termina con dos planes activos y el read model del hub podia elegir el huerfano (bug
 * "Plan publicado" + "Sin plan vigente"). Reutilizando el huerfano se corta la acumulacion en
 * origen (complementa el fix del read model, que ya prefiere el plan con version publicada).
 *
 * RLS-scoped. Nunca reutiliza un plan ya publicado: esa ruta va por `draft.planId` explicito
 * del builder (edicion), asi no tocamos un plan vivo. Toma el plan activo mas reciente y solo
 * lo reutiliza si no tiene version publicada.
 */
export async function resolveReusableUnpublishedPlanId(
  db: NutritionV2Db,
  clientId: string,
): Promise<{ ok: true; planId: string | null } | ActionFailure> {
  const res = await db
    .from('nutrition_plans_v2')
    .select<{ id: string; current_published_version_id: string | null }>(
      'id, current_published_version_id',
    )
    .eq('client_id', clientId)
    .eq('lifecycle_status', 'active')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (res.error) return mapWriteError(res.error, 'plan-huerfano')
  const row = res.data
  if (!row || row.current_published_version_id != null) return { ok: true, planId: null }
  return { ok: true, planId: row.id }
}

/**
 * Persiste un draft (plan/version/variantes/franjas/items) via las tablas versionadas
 * RLS-scoped y publica de forma transaccional con publish_nutrition_plan_v2 (idempotente
 * por clave estable). NO hace el gate comercial (Pro) ni revalida rutas: eso queda en el
 * caller. Idempotente: si la clave ya existe, devuelve la version publicada existente.
 */
export async function persistAndPublishDraft(input: {
  db: NutritionV2Db
  userId: string
  draft: NutritionPlanDraft
  idempotencyKey: string
  effectiveFrom: string
  /**
   * Compare-and-swap opcional (quick-edit): id de la version vigente sobre la que se baso la
   * edicion. Se pasa como `p_expected_current_version_id` al RPC; si la version vigente cambio
   * (publicacion concurrente), el RPC lanza `nutrition_v2_publish_stale_base` -> STALE_BASE.
   * El builder wizard NO lo envia (undefined) -> el RPC omite el guard (comportamiento intacto).
   */
  expectedCurrentVersionId?: string
}): Promise<PublishSuccess | ActionFailure> {
  const { db, userId, draft, idempotencyKey, effectiveFrom, expectedCurrentVersionId } = input

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
    // Prevencion de planes huerfanos (secuela del bug 42501): si el alumno ya tiene un plan
    // ACTIVO sin version publicada (basura de un intento previo que fallo entre el INSERT del
    // plan y el de la version), REUTILIZALO en vez de crear otro. Asi el read model nunca ve
    // dos planes activos compitiendo. Solo aplica cuando el builder no trajo `draft.planId`.
    const reusable = await resolveReusableUnpublishedPlanId(db, draft.clientId)
    if (!reusable.ok) return reusable
    if (reusable.planId) {
      planId = reusable.planId
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

  // Foods de los items MÁS los referenciados por los reemplazos autorizados (F-02): un solo
  // set para resolver/congelar todo en una pasada.
  const foodIds = [...new Set([...collectFoodIds(draft), ...collectSubstitutionFoodIds(draft)])]
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

  // Resolucion server-side de los grupos de porciones para el freeze (SPEC R2/A2). Se
  // resuelve una sola vez para todo el draft (grupos directos + bases de compuestos) y se
  // congela por target en el loop de abajo. Falla-cerrado si algun grupo no resuelve.
  const groupsRes = await resolveExchangeGroupsForDraft(db, draft)
  if (!groupsRes.ok) return groupsRes
  const { byId: exchangeGroupsById, byCode: exchangeGroupsByCode } = groupsRes.groups
  const resolveBaseGroup = (code: string): BuilderExchangeGroup | null =>
    exchangeGroupsByCode.get(code) ?? null

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
        // Id explícito por item (F-02): lo generamos aquí para poder colgar los reemplazos
        // referenciándolo, sin un round-trip extra de RETURNING.
        const itemsWithIds = slot.items.map((item) => ({ item, id: crypto.randomUUID() }))
        const itemRows = itemsWithIds.map(({ item, id }, index) =>
          buildItemInsertRow({
            versionId,
            mealSlotId,
            orderIndex: index,
            item,
            food: item.foodId ? foodMap.get(item.foodId) ?? null : null,
            id,
          }),
        )
        const itemsIns = await db.from('nutrition_prescription_items_v2').insert(itemRows)
        if (itemsIns.error) return mapWriteError(itemsIns.error, 'items')

        // Reemplazos autorizados del coach (F-02), congelados por item. Solo structured/hybrid
        // tienen items (flexible nunca llega aquí). Un item sin reemplazos no toca la tabla nueva.
        const substitutionRows = itemsWithIds.flatMap(({ item, id }) =>
          (item.substitutions ?? []).map((sub, subIndex) =>
            buildItemSubstitutionInsertRow({
              versionId,
              prescriptionItemId: id,
              orderIndex: subIndex,
              sub,
              food: sub.foodId ? foodMap.get(sub.foodId) ?? null : null,
            }),
          ),
        )
        if (substitutionRows.length > 0) {
          const subsIns = await db.from('nutrition_item_substitutions_v2').insert(substitutionRows)
          if (subsIns.error) return mapWriteError(subsIns.error, 'reemplazos')
        }
      }

      // Targets de porciones de la franja, congelados en la MISMA pasada de escritura del
      // draft (misma "tx" en el sentido de esta arquitectura: mismas llamadas PostgREST
      // pre-publish que items/franjas; no hay tx SQL que cruce todas — ver cabecera del
      // modulo). El snapshot ya viene resuelto/enriquecido; `publish_nutrition_plan_v2`
      // queda INTACTO (A1). Los grupos fueron validados arriba; el throw defensivo de
      // `buildExchangeTargetInsertRow` se traduce a un ActionFailure limpio por si acaso.
      const exchangeTargets = slot.exchangeTargets ?? []
      if (exchangeTargets.length > 0) {
        let targetRows
        try {
          targetRows = exchangeTargets.map((target, index) =>
            buildExchangeTargetInsertRow({
              versionId,
              mealSlotId,
              orderIndex: index,
              target,
              group: exchangeGroupsById.get(target.exchangeGroupId) ?? null,
              resolveBaseGroup,
            }),
          )
        } catch (err) {
          if (err instanceof ExchangeGroupSnapshotError) {
            return fail(
              err.reason === 'BASE_GROUP_NOT_FOUND'
                ? 'EXCHANGE_BASE_GROUP_NOT_FOUND'
                : 'EXCHANGE_GROUP_NOT_FOUND',
              'No se pudo congelar un grupo de porciones del plan. Recarga el builder e intenta de nuevo.',
            )
          }
          throw err
        }
        const targetsIns = await db.from('nutrition_slot_exchange_targets_v2').insert(targetRows)
        if (targetsIns.error) return mapWriteError(targetsIns.error, 'porciones')
      }
    }
  }

  const publishRes = await db.rpc('publish_nutrition_plan_v2', {
    p_version_id: versionId,
    p_effective_from: effectiveFrom,
    p_idempotency_key: idempotencyKey,
    // Solo el quick-edit envia el guard optimista; el builder pasa undefined -> PostgREST resuelve
    // a la firma con default null y el RPC omite el compare-and-swap.
    ...(expectedCurrentVersionId ? { p_expected_current_version_id: expectedCurrentVersionId } : {}),
  })
  if (publishRes.error) return mapWriteError(publishRes.error, 'publicacion')

  const publishedId = z.string().uuid().safeParse(publishRes.data)
  if (!publishedId.success) {
    return fail('INVALID_RESPONSE', 'La publicacion devolvio una respuesta inesperada.')
  }
  return { ok: true, versionId: publishedId.data, planId }
}
