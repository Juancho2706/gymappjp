'use server'

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  FoodCatalogCursorSchema,
  FoodCatalogItemSchema,
  FoodCatalogSearchReadModelSchema,
  type FoodCatalogItem,
  type FoodCatalogCursor,
} from '@eva/nutrition-v2'
import { createClient } from '@/lib/supabase/server'
import { rateLimitNutritionCatalogSearch } from '@/lib/rate-limit'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import { nutritionV2CoachScopeFromWorkspace } from '@/services/nutrition-v2-read.service'
import { getCurrentCoachSession as getNutritionPlansPageCoach } from '@/services/auth/current-coach.service'
import { getCoachFoodOverridePage } from '@/services/nutrition-v2/coach-food-overrides.service'
import {
  coachEditedFoodToCatalogItem,
  type CoachEditedFoodRow,
} from '@/app/coach/nutrition-v2/_lib/edited-foods'

// Listado de alimentos del hub coach V2 (solo lectura).
// Fail-closed: re-verifica el scope V2 del workspace activo en CADA búsqueda, igual que el builder.
// Nunca trae el catálogo
// completo: pagina de a ~20 via keyset cursor sobre search_food_catalog_v2 (que ya
// aplica RLS token-scoped en la funcion SECURITY DEFINER).
//
// El filtro "Editados por mi" (T2.3 F1) es un SEGUNDO data path sobre los mismos guards:
// pagina `coach_food_overrides` por offset e hidrata identidad desde `foods`. No puede
// resolverse filtrando la pagina del RPC — ese exige query de 2+ caracteres y devolveria
// paginas casi vacias con "Cargar mas" lleno.

const PAGE_SIZE = 20

type CatalogRpc = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>
}

type ActionFailure = { ok: false; code: string; error: string }
type SearchSuccess = {
  ok: true
  items: FoodCatalogItem[]
  nextCursor: FoodCatalogCursor | null
  hasMore: boolean
}
type EditedListSuccess = {
  ok: true
  items: FoodCatalogItem[]
  hasMore: boolean
  nextOffset: number | null
}

function fail(code: string, error: string): ActionFailure {
  return { ok: false, code, error }
}

const SearchInputSchema = z.object({
  query: z.string().trim().max(120),
  countryCode: z.string().trim().length(2).default('CL'),
  cursor: FoodCatalogCursorSchema.nullable().default(null),
})

async function authorizeHubCoach(): Promise<
  { ok: true; db: CatalogRpc; coachId: string } | ActionFailure
> {
  const { user } = await getNutritionPlansPageCoach()
  if (!user) return fail('UNAUTHENTICATED', 'Debes iniciar sesion para ver el catalogo.')

  const limited = await rateLimitNutritionCatalogSearch(user.id)
  if (!limited.ok) {
    return fail('RATE_LIMITED', 'Demasiadas solicitudes. Espera un momento y vuelve a intentar.')
  }

  const workspace = await getPreferredWorkspaceForRender(user.id)

  try {
    nutritionV2CoachScopeFromWorkspace(workspace)
  } catch {
    return fail('SCOPE_REQUIRED', 'Debes tener un espacio de trabajo de coach activo.')
  }

  const db = (await createClient()) as unknown as CatalogRpc
  // El dueño de los overrides se deriva del ACTOR, jamas del payload (misma regla que
  // `food-overrides.actions.ts`).
  return { ok: true, db, coachId: user.id }
}

/**
 * Busca en el catalogo local (Chile por defecto) via search_food_catalog_v2.
 * Solo lectura, scope V2 re-verificado, paginación por cursor (pageSize 20).
 * Devuelve el read model validado (items + nextCursor + hasMore); el mapeo a card
 * ocurre en el cliente con el helper puro.
 */
export async function searchFoodCatalogHubAction(
  input: unknown,
): Promise<SearchSuccess | ActionFailure> {
  const parsed = SearchInputSchema.safeParse(input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', 'Busqueda invalida.')
  }

  // El RPC ya devuelve vacio bajo 2 caracteres; cortamos antes para no gastar la
  // instancia Micro en una consulta que no filtra nada.
  if (parsed.data.query.length < 2) {
    return { ok: true, items: [], nextCursor: null, hasMore: false }
  }

  const auth = await authorizeHubCoach()
  if (!auth.ok) return auth

  const search = await auth.db.rpc('search_food_catalog_v2', {
    p_query: parsed.data.query,
    p_country_code: parsed.data.countryCode.toUpperCase(),
    p_cursor_score: parsed.data.cursor?.score ?? null,
    p_cursor_name: parsed.data.cursor?.name ?? null,
    p_cursor_id: parsed.data.cursor?.id ?? null,
    p_page_size: PAGE_SIZE,
  })
  if (search.error) {
    if (search.error.code === '42501') {
      return fail('SCOPE_DENIED', 'No tienes permiso para consultar el catalogo.')
    }
    return fail('CATALOG_READ_FAILED', 'No se pudo consultar el catalogo. Intenta nuevamente.')
  }

  const result = FoodCatalogSearchReadModelSchema.safeParse(search.data)
  if (!result.success) {
    return fail('CATALOG_CONTRACT_MISMATCH', 'El catalogo devolvio un formato inesperado.')
  }

  return {
    ok: true,
    items: result.data.items,
    nextCursor: result.data.nextCursor,
    hasMore: result.data.hasMore,
  }
}

const EditedListInputSchema = z.object({
  offset: z.number().int().nonnegative().max(100000).default(0),
})

/**
 * Columnas de identidad/presentacion que la card y la ficha necesitan. Es el mismo set que emite
 * `private.food_catalog_v2_item_json`, menos `media` (ver mas abajo).
 */
const EDITED_FOOD_SELECT =
  'id, catalog_key, barcode, name, brand, category, country_code, serving_size, serving_unit, ' +
  'calories, protein_g, carbs_g, fats_g, fiber_g, macros_basis, household_label, household_grams, ' +
  'sodium_mg, sugar_g, saturated_fat_g, package_quantity, package_unit, catalog_source, source_ref, ' +
  'verification_status, coach_id, org_id'

// `database.types.ts` esta desactualizada para `foods` (le faltan catalog_key, barcode,
// country_code, package_*, catalog_source, source_ref, verification_status): el cliente tipado
// convertiria este select en un error de tipos. Misma tactica que `plan-foods.data.ts`:
// interfaz minima tipada sobre el mismo objeto de runtime.
interface EditedFoodsReadChain
  extends PromiseLike<{ data: CoachEditedFoodRow[] | null; error: { message: string; code?: string } | null }> {
  in(column: string, values: readonly string[]): EditedFoodsReadChain
}
interface EditedFoodsReadDb {
  from(table: 'foods'): { select(columns: string): EditedFoodsReadChain }
}

/**
 * Lista los alimentos que ESTE coach corrigio (filtro "Editados por mi" del tab Alimentos).
 *
 * Dos round-trips fijos, nunca N+1: una pagina de `coach_food_overrides` por offset (mas
 * reciente primero) y UN `in('id', ids)` sobre `foods` para hidratar identidad. El merge de
 * macros lo hace `resolveFoodMacros`, el MISMO helper puro que usan el freeze y la
 * rehidratacion — asi el numero de esta lista es el mismo que el del buscador.
 *
 * `media` queda en null (icono de categoria): traer la foto seria un tercer round-trip.
 *
 * Lectura pura: sin `revalidatePath`. Ver el listado de correcciones no propaga nada ni toca
 * planes publicados.
 */
export async function listCoachEditedFoodsHubAction(
  input: unknown,
): Promise<EditedListSuccess | ActionFailure> {
  const parsed = EditedListInputSchema.safeParse(input)
  if (!parsed.success) return fail('INVALID_PAYLOAD', 'Parametros invalidos.')

  const auth = await authorizeHubCoach()
  if (!auth.ok) return auth

  const from = parsed.data.offset
  // PAGE_SIZE + 1 para saber si hay mas sin un COUNT extra (patron de la cola de curacion).
  const page = await getCoachFoodOverridePage(
    auth.db as unknown as SupabaseClient<Database>,
    { coachId: auth.coachId },
    { offset: from, limit: PAGE_SIZE + 1 },
  )
  if (!page.ok) {
    if (page.code === '42501') {
      return fail('SCOPE_DENIED', 'No tienes permiso para ver tus correcciones.')
    }
    return fail('CATALOG_READ_FAILED', 'No se pudieron cargar tus alimentos editados.')
  }

  const hasMore = page.rows.length > PAGE_SIZE
  const rows = hasMore ? page.rows.slice(0, PAGE_SIZE) : page.rows
  const nextOffset = hasMore ? from + PAGE_SIZE : null
  if (rows.length === 0) return { ok: true, items: [], hasMore: false, nextOffset: null }

  const foods = await (auth.db as unknown as EditedFoodsReadDb)
    .from('foods')
    .select(EDITED_FOOD_SELECT)
    .in(
      'id',
      rows.map((row) => row.foodId),
    )
  if (foods.error || foods.data == null) {
    if (foods.error?.code === '42501') {
      return fail('SCOPE_DENIED', 'No tienes permiso para consultar el catalogo.')
    }
    return fail('CATALOG_READ_FAILED', 'No se pudieron cargar tus alimentos editados.')
  }

  const byId = new Map(foods.data.map((row) => [row.id, row]))
  // El orden lo manda la pagina de overrides (updated_at desc), no el orden de `foods`.
  // Un alimento que ya no se puede leer (borrado o fuera de scope) desaparece de la lista sin
  // romperla: el override huerfano no tiene identidad que mostrar. `hasMore`/`nextOffset` NO se
  // recalculan por eso — la paginacion es sobre los overrides, no sobre los alimentos.
  const items: FoodCatalogItem[] = []
  for (const row of rows) {
    const food = byId.get(row.foodId)
    if (food) items.push(coachEditedFoodToCatalogItem(food, row.values))
  }

  const validated = z.array(FoodCatalogItemSchema).safeParse(items)
  if (!validated.success) {
    return fail('CATALOG_CONTRACT_MISMATCH', 'El catalogo devolvio un formato inesperado.')
  }

  return { ok: true, items: validated.data, hasMore, nextOffset }
}
