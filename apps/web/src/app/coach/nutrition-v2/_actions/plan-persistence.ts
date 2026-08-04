import 'server-only'

import { z } from 'zod'
import type { NutritionPlanDraft } from '@eva/nutrition-v2'
import { createClient } from '@/lib/supabase/server'
import { rateLimitNutritionCatalogSearch, rateLimitNutritionCoachWrite } from '@/lib/rate-limit'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import { nutritionV2CoachScopeFromWorkspace } from '@/services/nutrition-v2-read.service'
import { getCurrentCoachSession as getNutritionPlansPageCoach } from '@/services/auth/current-coach.service'
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
// aloja los tipos, helpers del lado servidor y la rutina TRANSACCIONAL de persistir+publicar
// un draft, para que publishPlanAction (builder), quickEditPublishAction,
// assignPlanToClientsAction y el endpoint movil (/api/mobile/nutrition-v2/coach/mutate)
// reusen EXACTAMENTE el mismo camino de escritura.
//
// NUT-011 (cerrado): el arbol YA NO se escribe en N llamadas PostgREST. `persistAndPublishDraft`
// es un THIN CALLER de `public.persist_and_publish_nutrition_plan_v2`
// (supabase/migrations/20260728140000_nutrition_v2_persist_and_publish_transactional.sql), que
// hace raiz -> version -> variantes -> franjas -> items -> reemplazos -> porciones -> publish
// DENTRO DE UNA SOLA TRANSACCION: o queda todo publicado o no queda nada. Ahi viven ahora el
// lock por alumno (advisory + for update), la numeracion `version_number = max+1` en SQL, el
// reuso + limpieza de la raiz huerfana, el compare-and-swap y la idempotencia por clave.
//
// Lo que SIGUE ocurriendo aca antes de la unica llamada, a proposito: la resolucion RLS-scoped
// del catalogo para el FREEZE de snapshots (`foods` por item/reemplazo y `exchange_groups` por
// target). Son LECTURAS — no producen estado parcial — y deben pasar por el cliente del coach:
// resolverlas dentro de la RPC (SECURITY DEFINER) bypassearia `foods_select` / `xg_select`, y
// recalcular las macros en SQL divergiria del motor unico (@eva/nutrition-engine). Ver la
// cabecera de la migracion para el detalle de la decision.
//
// Fail-closed: authorizeCoach re-verifica el workspace V2 y la RPC revalida
// `can_manage_client` y deriva `created_by`/`updated_by` de
// `auth.uid()` (NUT-034). Las macros de snapshot se re-derivan de foods en el servidor.

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
  // Errores propios de la RPC transaccional (NUT-011). Conservan los codigos/copys que antes
  // producia el camino por PostgREST, porque los callers los mapean (quick-edit -> VALIDATION).
  if (message.includes('nutrition_v2_persist_client_not_found')) {
    return fail('CLIENT_NOT_FOUND', 'No se encontro el alumno en tu espacio.')
  }
  if (message.includes('nutrition_v2_persist_plan_not_found')) {
    return fail('PLAN_NOT_FOUND', 'El plan indicado no pertenece a este alumno.')
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

/**
 * Techo de autorizacion de TODA accion V2 del coach: sesion, rate limit y workspace con scope
 * V2 activo. El `clientId` NO participa (nunca participo: el scope real lo pone la RLS del
 * cliente user-scoped y, en las escrituras, `can_manage_client` dentro de la RPC).
 *
 * Acepta `null` a proposito: el builder de PLANTILLAS trabaja SIN alumno (una plantilla es
 * material interno del coach), y pasar un uuid de relleno solo para satisfacer la firma seria
 * fingir un scope que no existe.
 */
export async function authorizeCoach(
  _clientId: string | null,
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

  try {
    nutritionV2CoachScopeFromWorkspace(workspace)
  } catch {
    return fail('SCOPE_REQUIRED', 'Debes tener un espacio de trabajo de coach activo.')
  }

  const db = (await createClient()) as unknown as NutritionV2Db
  return { ok: true, db, userId: user.id, proCtx: nutritionProCtxFromWorkspace(user.id, workspace), workspace }
}

// RETIRADO `ClientScopeRow`: el scope de la raiz (coach_id/org_id/team_id) ya no se lee aca
// para reenviarlo en el INSERT. Lo copia la RPC desde `public.clients` server-side, asi
// `plan_scope_matches_client` se cumple por construccion y el payload no puede falsearlo.

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

// -- Payload de la RPC transaccional (NUT-011) --
//
// RETIRADO: `resolveReusableUnpublishedPlanId`. La resolucion de la raiz (append explicito /
// reuso del huerfano + limpieza de su version draft / creacion) vive AHORA dentro de
// `public.persist_and_publish_nutrition_plan_v2`, bajo el lock por alumno. Mantener una
// segunda implementacion en TS era justamente el patron que produjo el drift web/RN que
// denuncia la auditoria (NUT-039). Las cuatro reglas quedan cubiertas por
// `supabase/tests/nutrition_v2_persist_and_publish_rollback.sql`.

/** Id de relleno para los builders puros: la RPC re-escribe TODA la vinculacion del arbol. */
const RPC_LINKED_ID = '00000000-0000-0000-0000-000000000000'

/** Copia la fila sin las claves de vinculacion (las asigna la RPC con los ids que inserta). */
function omitKeys(row: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (!keys.includes(key)) out[key] = value
  }
  return out
}

/**
 * Ensambla el `p_draft` de la RPC: el arbol del plan con los `snapshot_*` YA CONGELADOS.
 *
 * Cada fila hoja la emiten los MISMOS builders puros que hasta ahora alimentaban a PostgREST
 * (`draft-builder.ts`), asi que lo que termina en la base es byte-identico al camino viejo; lo
 * unico que se les quita son las columnas de vinculacion (`version_id`, `day_variant_id`,
 * `meal_slot_id`, `prescription_item_id`), que la RPC asigna con los ids que ella inserta.
 * `privateNotes` no viaja (NUT-007: columna deprecada e ilegible; ahora ni siquiera es
 * alcanzable desde este camino).
 *
 * Falla-cerrado con `ActionFailure` si un target de porciones no puede congelar su grupo
 * (mismo mapeo de `ExchangeGroupSnapshotError` que el camino anterior).
 */
export function buildPersistDraftPayload(input: {
  draft: NutritionPlanDraft
  foods: Map<string, BuilderFood>
  exchangeGroupsById: Map<string, BuilderExchangeGroup>
  resolveBaseGroup: (code: string) => BuilderExchangeGroup | null
}): { ok: true; payload: Record<string, unknown> } | ActionFailure {
  const { draft, foods, exchangeGroupsById, resolveBaseGroup } = input

  // Guard de dia vacio (defecto 2026-08-03): un plan con franjas NO puede publicar una
  // variante de dia sin ninguna. El alumno no ve "un dia sin porciones": ve el dia ENTERO
  // vacio, sin comidas ni nada. Verificado en LIVE: 16 variantes publicadas asi, en 4
  // versiones de 2 alumnos.
  //
  // Vive ACA y no en la UI a proposito: el builder web ya lo bloqueaba
  // (`draft-builder.ts` valida `variant.slots.length === 0`), y aun asi entraron dias
  // vacios por el quick-edit y por RN. Este es el unico punto por el que pasan TODAS las
  // publicaciones, asi que es el unico lugar donde el guard es real. La UI nunca autoriza.
  //
  // `flexible` queda fuera por definicion: esa estrategia no tiene franjas en ninguna
  // variante y un dia sin franjas es su estado correcto.
  if (draft.strategy !== 'flexible') {
    const vacia = draft.dayVariants.find((variant) => variant.mealSlots.length === 0)
    if (vacia != null) {
      return fail(
        'EMPTY_DAY_VARIANT',
        'Hay un día del plan sin ninguna comida (' +
          (vacia.label.trim() || 'día sin nombre') +
          '). Tu alumno lo vería vacío: agrégale comidas o elimínalo para que herede el día base.',
      )
    }
  }

  const foodFor = (foodId: string | null): BuilderFood | null => (foodId ? foods.get(foodId) ?? null : null)

  let variants: Array<Record<string, unknown>>
  try {
    variants = draft.dayVariants.map((variant) => ({
      ...omitKeys(buildVariantInsertRow(RPC_LINKED_ID, variant), ['version_id']),
      mealSlots: variant.mealSlots.map((slot) => ({
        ...omitKeys(buildSlotInsertRow(RPC_LINKED_ID, RPC_LINKED_ID, slot), [
          'version_id',
          'day_variant_id',
        ]),
        items: slot.items.map((item, index) => {
          // Id explicito por item (F-02), igual que antes: los reemplazos cuelgan de el sin un
          // RETURNING por fila.
          const itemId = crypto.randomUUID()
          return {
            ...omitKeys(
              buildItemInsertRow({
                versionId: RPC_LINKED_ID,
                mealSlotId: RPC_LINKED_ID,
                orderIndex: index,
                item,
                food: foodFor(item.foodId),
                id: itemId,
              }),
              ['version_id', 'meal_slot_id'],
            ),
            // PENDIENTE (NUT-008, capa 1 — merge server-side): la publicacion reescribe el arbol
            // COMPLETO y las sustituciones salen EXCLUSIVAMENTE del draft; un draft sin la
            // coleccion borra las de la version base. La mitigacion vigente es de cliente
            // (carry-over + guard de UI que bloquea publicar si la lectura fallo). El merge
            // server-side NO se implementa aqui a proposito: el contrato es ambiguo —
            // `substitutions` es opcional y "ausente" no se distingue de "el coach las borro
            // todas", asi que el merge las resucitaria. Requiere volver la coleccion explicita
            // en el contrato (o un flag `substitutionsEdited` por item).
            substitutions: (item.substitutions ?? []).map((sub, subIndex) =>
              omitKeys(
                buildItemSubstitutionInsertRow({
                  versionId: RPC_LINKED_ID,
                  prescriptionItemId: itemId,
                  orderIndex: subIndex,
                  sub,
                  food: foodFor(sub.foodId),
                }),
                ['version_id', 'prescription_item_id'],
              ),
            ),
          }
        }),
        exchangeTargets: (slot.exchangeTargets ?? []).map((target, index) =>
          omitKeys(
            buildExchangeTargetInsertRow({
              versionId: RPC_LINKED_ID,
              mealSlotId: RPC_LINKED_ID,
              orderIndex: index,
              target,
              group: exchangeGroupsById.get(target.exchangeGroupId) ?? null,
              resolveBaseGroup,
            }),
            ['version_id', 'meal_slot_id'],
          ),
        ),
      })),
    }))
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

  return {
    ok: true,
    payload: {
      clientId: draft.clientId,
      name: draft.name,
      strategy: draft.strategy,
      timezone: draft.timezone,
      permissions: draft.permissions,
      visibleNotes: draft.visibleNotes,
      protocolNotes: draft.protocolNotes,
      variants,
    },
  }
}

/** Respuesta de `persist_and_publish_nutrition_plan_v2` (el resto de las claves es telemetria). */
const PersistRpcResultSchema = z.object({
  versionId: z.string().uuid(),
  planId: z.string().uuid(),
})

/**
 * Persiste un draft (raiz/version/variantes/franjas/items/reemplazos/porciones) y lo publica
 * de forma ATOMICA con `public.persist_and_publish_nutrition_plan_v2` (NUT-011): una sola
 * llamada, una sola transaccion SQL. NO hace el gate comercial (Pro) ni revalida rutas: eso
 * queda en el caller.
 *
 * Antes de esa llamada solo hay LECTURAS RLS-scoped (catalogo de alimentos y grupos de
 * porciones) para congelar los `snapshot_*`; ninguna produce estado parcial si falla.
 *
 * Idempotente: la misma `idempotencyKey` devuelve la version ya publicada sin crear una
 * segunda (el guard vive en la RPC, acotado al alumno). El `version_number` se calcula EN SQL
 * bajo el lock del alumno, asi que dos publicaciones concurrentes se serializan en vez de
 * chocar contra el unique `(plan_id, version_number)`.
 */
export async function persistAndPublishDraft(input: {
  db: NutritionV2Db
  /**
   * Coach autenticado. Ya NO viaja a la base: la RPC deriva `created_by`/`updated_by` de
   * `auth.uid()` server-side (NUT-034). Se conserva en la firma porque los cuatro callers lo
   * pasan y sirve de documentacion del actor esperado.
   */
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
  const { db, draft, idempotencyKey, effectiveFrom, expectedCurrentVersionId } = input

  // Foods de los items MÁS los referenciados por los reemplazos autorizados (F-02): un solo
  // set para resolver/congelar todo en una pasada. RLS-scoped a proposito (ver cabecera).
  const foodIds = [...new Set([...collectFoodIds(draft), ...collectSubstitutionFoodIds(draft)])]
  const foods = new Map<string, BuilderFood>()
  for (const id of foodIds) {
    const foodRes = await db
      .from('foods')
      .select<FoodRow>('id, name, brand, calories, protein_g, carbs_g, fats_g, fiber_g, serving_size, serving_unit')
      .eq('id', id)
      .maybeSingle()
    if (foodRes.error) return mapWriteError(foodRes.error, 'alimentos')
    if (foodRes.data) foods.set(id, toBuilderFood(foodRes.data))
  }

  // Resolucion server-side de los grupos de porciones para el freeze (SPEC R2/A2). Se
  // resuelve una sola vez para todo el draft (grupos directos + bases de compuestos).
  // Falla-cerrado si algun grupo no resuelve.
  const groupsRes = await resolveExchangeGroupsForDraft(db, draft)
  if (!groupsRes.ok) return groupsRes
  const { byId: exchangeGroupsById, byCode: exchangeGroupsByCode } = groupsRes.groups

  const built = buildPersistDraftPayload({
    draft,
    foods,
    exchangeGroupsById,
    resolveBaseGroup: (code: string) => exchangeGroupsByCode.get(code) ?? null,
  })
  if (!built.ok) return built

  // UNA llamada: raiz + version + arbol + publish, todo o nada.
  const res = await db.rpc('persist_and_publish_nutrition_plan_v2', {
    p_draft: built.payload,
    p_effective_from: effectiveFrom,
    p_idempotency_key: idempotencyKey,
    // Solo el quick-edit (y el builder sobre un plan existente) envian el guard optimista; sin
    // la clave, PostgREST resuelve al default null y la RPC omite el compare-and-swap.
    ...(expectedCurrentVersionId ? { p_expected_current_version_id: expectedCurrentVersionId } : {}),
    // Raiz explicita: edicion de un plan existente. Ausente => la RPC decide entre reusar la
    // raiz huerfana del alumno (limpiando su draft parcial) o crear una nueva.
    ...(draft.planId ? { p_plan_id: draft.planId } : {}),
  })
  if (res.error) return mapWriteError(res.error, 'publicacion')

  const parsed = PersistRpcResultSchema.safeParse(res.data)
  if (!parsed.success) {
    return fail('INVALID_RESPONSE', 'La publicacion devolvio una respuesta inesperada.')
  }
  return { ok: true, versionId: parsed.data.versionId, planId: parsed.data.planId }
}
