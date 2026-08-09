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
import {
  getCoachFoodOverridePage,
  getCoachFoodOverridesFor,
} from '@/services/nutrition-v2/coach-food-overrides.service'
import {
  getFoodExchangeClassification,
  type FoodExchangeClassificationRead,
} from '@/services/nutrition-exchanges/exchange-lists.service'
import {
  foodRowToCatalogItem,
  type CatalogFoodRow,
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
//
// El browse (T2.3 F4.5) es el TERCER data path: navegar el catalogo SIN buscar y el filtro
// "Solo mios", tambien por offset sobre `foods`. Existe porque `/coach/foods` se borro en F5 y su
// `FoodBrowser` era la unica forma de ver el catalogo sin tipear.

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
/**
 * Forma comun de los data paths paginados por OFFSET (editados y browse). El cliente no necesita
 * saber cual de los dos respondio: pide `nextOffset` y lo devuelve tal cual en "Cargar mas", asi
 * que el tamaño de pagina lo decide el servidor y puede diferir por modo.
 */
type OffsetListSuccess = {
  ok: true
  items: FoodCatalogItem[]
  hasMore: boolean
  nextOffset: number | null
}
type FoodClassificationSuccess = { ok: true; classification: FoodExchangeClassificationRead }

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

const FoodClassificationInputSchema = z.object({ foodId: z.string().uuid() })

/**
 * Dónde está clasificado HOY un alimento (T2.3 F3), para que el formulario único del tab abra
 * mostrando el estado real en vez de un formulario en blanco.
 *
 * Existe como lectura propia porque el read model del catálogo NO emite nada de intercambios
 * (`packages/nutrition-v2/catalog.ts`: `FoodCatalogItem` no tiene grupo ni gramos) y ninguna
 * action de `exchange-lists` responde "en qué grupo está ESTE alimento" — todas parten del
 * grupo. Recorrer los ~10 grupos del coach para averiguarlo serían 10 round-trips al abrir un
 * sheet. Sin RPC nueva y sin cambio de schema: dos SELECT sobre tablas existentes, RLS como
 * techo.
 *
 * Lectura pura: sin `revalidatePath`.
 */
export async function loadFoodExchangeClassificationHubAction(
  input: unknown,
): Promise<FoodClassificationSuccess | ActionFailure> {
  const parsed = FoodClassificationInputSchema.safeParse(input)
  if (!parsed.success) return fail('INVALID_PAYLOAD', 'Alimento invalido.')

  const auth = await authorizeHubCoach()
  if (!auth.ok) return auth

  const result = await getFoodExchangeClassification(auth.db as unknown as SupabaseClient<Database>, {
    // El dueño de la lectura sale del ACTOR, jamas del payload.
    actorCoachId: auth.coachId,
    foodId: parsed.data.foodId,
  })
  if (!result.success) return fail('CLASSIFICATION_READ_FAILED', result.error)
  return { ok: true, classification: result.classification }
}

const EditedListInputSchema = z.object({
  offset: z.number().int().nonnegative().max(100000).default(0),
})

/**
 * Columnas de identidad/presentacion que la card y la ficha necesitan. Es el mismo set que emite
 * `private.food_catalog_v2_item_json`, menos `media` (ver mas abajo). Lo comparten los DOS data
 * paths por offset (editados y browse): si divergieran, la misma card mostraria campos distintos
 * segun por que modo llego el coach.
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
type FoodsReadResult = {
  data: CatalogFoodRow[] | null
  error: { message: string; code?: string } | null
}
interface FoodsReadChain extends PromiseLike<FoodsReadResult> {
  in(column: string, values: readonly string[]): FoodsReadChain
  eq(column: string, value: string): FoodsReadChain
  neq(column: string, value: string): FoodsReadChain
  or(filter: string): FoodsReadChain
  order(column: string, options: { ascending: boolean }): FoodsReadChain
  range(from: number, to: number): FoodsReadChain
}
interface FoodsReadDb {
  from(table: 'foods'): { select(columns: string): FoodsReadChain }
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
): Promise<OffsetListSuccess | ActionFailure> {
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

  const foods = await (auth.db as unknown as FoodsReadDb)
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
    if (food) items.push(foodRowToCatalogItem(food, row.values))
  }

  const validated = z.array(FoodCatalogItemSchema).safeParse(items)
  if (!validated.success) {
    return fail('CATALOG_CONTRACT_MISMATCH', 'El catalogo devolvio un formato inesperado.')
  }

  return { ok: true, items: validated.data, hasMore, nextOffset }
}

const BrowseInputSchema = z.object({
  offset: z.number().int().nonnegative().max(100000).default(0),
  /**
   * "Solo mios". Es un BOOLEAN, no un `coachId`: el dueño se deriva del actor y el payload no
   * puede nombrar a otro coach ni por accidente.
   */
  mineOnly: z.boolean().default(false),
  /**
   * Solo letras, a diferencia del schema de busqueda: aca el valor se interpola en un filtro
   * `or(...)` de PostgREST (texto, no parametro), asi que una coma o un parentesis reescribirian
   * la condicion. La RPC no tiene ese problema porque recibe el pais como argumento.
   */
  countryCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/)
    .default('CL'),
})

/**
 * Pagina del browse de "todos". 20 como la busqueda: el catalogo son decenas de miles de filas y
 * el coach navega, no audita.
 */
const BROWSE_PAGE_SIZE = PAGE_SIZE
/**
 * Pagina de "Solo mios". Mas grande a proposito: el universo son decenas de filas (24 en prod al
 * 2026-08-09) y dentro del modo la busqueda por texto es LOCAL sobre lo cargado, asi que una
 * pagina que cubra el universo entero de una es lo que hace que esa busqueda no mienta. Sigue
 * siendo UN round-trip.
 */
const MINE_PAGE_SIZE = 50

/**
 * Navega el catalogo SIN buscar (T2.3 F4.5), con o sin el filtro "Solo mios".
 *
 * Por que no la RPC: `search_food_catalog_v2` exige un termino — es una busqueda trigram, no un
 * listado. Esto es un SELECT directo a `foods` con RLS como techo, ordenado por nombre y paginado
 * por offset (el mismo patron del listado de editados; keyset no aporta nada sobre un orden
 * alfabetico estable de paginas que el coach recorre hacia adelante).
 *
 * **La visibilidad se replica a mano, y eso es deliberado**: `verification_status <> 'rejected'` y
 * `country_code` nulo o del pais pedido son los mismos dos predicados que aplica la RPC. Hoy en
 * LIVE no hay ninguna fila que caiga afuera, asi que el filtro no cambia lo que se ve; existe para
 * que el browse nunca pueda mostrar un alimento que la busqueda no encontraria — dos listados de
 * la misma pantalla que difieren en su universo es un bug de confianza, no de datos. El resto de
 * la visibilidad (dueño, org, coach del alumno) lo pone RLS sobre `foods`, que es lo mismo que
 * evalua `private.food_catalog_v2_can_read_food`.
 *
 * Overrides: UN batch para toda la pagina (`getCoachFoodOverridesFor`), nunca N+1, y el merge lo
 * hace `resolveFoodMacros` dentro del mapper — la misma formula que la RPC y que el freeze. Sin
 * eso, el mismo alimento mostraria los macros del catalogo en el browse y los corregidos en la
 * busqueda. (Si esa lectura falla, el repo degrada a mapa vacio como en el freeze: la pagina se
 * ve con los macros del catalogo en vez de romperse. Es la unica degradacion tolerada aca.)
 *
 * Lectura pura: sin `revalidatePath`.
 */
export async function browseFoodCatalogHubAction(
  input: unknown,
): Promise<OffsetListSuccess | ActionFailure> {
  const parsed = BrowseInputSchema.safeParse(input)
  if (!parsed.success) return fail('INVALID_PAYLOAD', 'Parametros invalidos.')

  const auth = await authorizeHubCoach()
  if (!auth.ok) return auth

  const pageSize = parsed.data.mineOnly ? MINE_PAGE_SIZE : BROWSE_PAGE_SIZE
  const from = parsed.data.offset
  const country = parsed.data.countryCode.toUpperCase()

  let chain = (auth.db as unknown as FoodsReadDb)
    .from('foods')
    .select(EDITED_FOOD_SELECT)
    .neq('verification_status', 'rejected')
    .or(`country_code.is.null,country_code.eq.${country}`)

  // El dueño sale del ACTOR. RLS ya acota lo visible, pero "mios" es mas estrecho que "puedo
  // verlo": el catalogo publico (`coach_id is null`) tambien es visible y no es mio.
  if (parsed.data.mineOnly) chain = chain.eq('coach_id', auth.coachId)

  // `id` desempata: `name` no es unico y sin desempate la pagina 2 puede repetir u omitir filas.
  const foods = await chain
    .order('name', { ascending: true })
    .order('id', { ascending: true })
    // +1 para saber si hay mas sin pagar un COUNT (patron de la cola de curacion).
    .range(from, from + pageSize)

  if (foods.error || foods.data == null) {
    if (foods.error?.code === '42501') {
      return fail('SCOPE_DENIED', 'No tienes permiso para consultar el catalogo.')
    }
    return fail('CATALOG_READ_FAILED', 'No se pudo cargar el catalogo. Intenta nuevamente.')
  }

  const hasMore = foods.data.length > pageSize
  const rows = hasMore ? foods.data.slice(0, pageSize) : foods.data
  const nextOffset = hasMore ? from + pageSize : null
  if (rows.length === 0) return { ok: true, items: [], hasMore: false, nextOffset: null }

  const overrides = await getCoachFoodOverridesFor(
    auth.db as unknown as SupabaseClient<Database>,
    { coachId: auth.coachId },
    rows.map((row) => row.id),
  )

  const items = rows.map((row) => foodRowToCatalogItem(row, overrides.get(row.id) ?? null))

  const validated = z.array(FoodCatalogItemSchema).safeParse(items)
  if (!validated.success) {
    return fail('CATALOG_CONTRACT_MISMATCH', 'El catalogo devolvio un formato inesperado.')
  }

  return { ok: true, items: validated.data, hasMore, nextOffset }
}
