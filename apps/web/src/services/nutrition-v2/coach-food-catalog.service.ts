import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '@/lib/database.types'
import {
  FoodCatalogItemSchema,
  foodRowToCatalogItem,
  type CatalogFoodRow,
  type FoodCatalogItem,
} from '@eva/nutrition-v2'
import {
  getCoachFoodOverridePage,
  getCoachFoodOverridesFor,
} from '@/services/nutrition-v2/coach-food-overrides.service'

/**
 * Los dos data paths por OFFSET del tab Alimentos: el browse del catalogo (con o sin "Solo mios")
 * y el listado "Editados por mi". Vivian dentro de las server actions del hub; se extraen aca en
 * T2.3 F6.1 porque la app movil los necesita IDENTICOS y no puede llamar a una server action.
 *
 * Este modulo NO autoriza: recibe el cliente ya scoped y el `coachId` que el llamador derivo del
 * ACTOR. Cada superficie pone su propia puerta — la web con `authorizeHubCoach` (sesion) y el
 * movil con `gateNutritionV2Api` (JWT + scope). RLS sigue siendo el techo de las dos.
 *
 * Por que no la RPC de busqueda: `search_food_catalog_v2` exige un termino de 2+ caracteres, es
 * una busqueda trigram. Navegar sin escribir y "Editados por mi" son listados, no busquedas.
 */

/** Pagina del browse del catalogo. Igual que el keyset del buscador para que el ritmo no cambie. */
export const COACH_FOOD_BROWSE_PAGE_SIZE = 20

/**
 * Pagina de "Solo mios". Mas grande a proposito: el universo son decenas de filas (24 en prod al
 * 2026-08-09) y dentro del modo la busqueda por texto es LOCAL sobre lo ya cargado, asi que una
 * pagina que cubra el universo entero de una es lo que hace que esa busqueda no mienta. Sigue
 * siendo UN round-trip.
 */
export const COACH_FOOD_MINE_PAGE_SIZE = 50

/** Pagina de "Editados por mi". */
export const COACH_FOOD_EDITED_PAGE_SIZE = 20

/**
 * Columnas de identidad/presentacion que la card y la ficha necesitan. Es el mismo set que emite
 * `private.food_catalog_v2_item_json`, menos `media`: traer la foto seria un round-trip extra y la
 * card ya tiene el icono de categoria como fallback garantizado.
 */
const FOOD_SELECT =
  'id, catalog_key, barcode, name, brand, category, country_code, serving_size, serving_unit, ' +
  'calories, protein_g, carbs_g, fats_g, fiber_g, macros_basis, household_label, household_grams, ' +
  'sodium_mg, sugar_g, saturated_fat_g, package_quantity, package_unit, catalog_source, source_ref, ' +
  'verification_status, coach_id, org_id'

// `database.types.ts` esta desactualizada para `foods` (le faltan catalog_key, barcode,
// country_code, package_*, catalog_source, source_ref, verification_status): el cliente tipado
// convertiria este select en un error de tipos. Misma tactica que `plan-foods.data.ts`: interfaz
// minima tipada sobre el mismo objeto de runtime. Se retira al regenerar los tipos.
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

/** Cliente scoped del actor. Se acepta el de supabase-js tal cual; el cast vive aca adentro. */
export type CoachFoodCatalogDb = SupabaseClient<Database>

export type CoachFoodOffsetPage =
  | { ok: true; items: FoodCatalogItem[]; hasMore: boolean; nextOffset: number | null }
  | { ok: false; code: string; error: string }

function fail(code: string, error: string): CoachFoodOffsetPage {
  return { ok: false, code, error }
}

/** El codigo de RLS negada tiene mensaje propio en las dos superficies. */
function readFailure(code: string | null | undefined, subject: string): CoachFoodOffsetPage {
  if (code === '42501') return fail('SCOPE_DENIED', `No tienes permiso para ver ${subject}.`)
  return fail('CATALOG_READ_FAILED', `No se pudo cargar ${subject}. Intenta nuevamente.`)
}

function validated(
  items: FoodCatalogItem[],
  hasMore: boolean,
  nextOffset: number | null,
): CoachFoodOffsetPage {
  const parsed = z.array(FoodCatalogItemSchema).safeParse(items)
  if (!parsed.success) {
    return fail('CATALOG_CONTRACT_MISMATCH', 'El catalogo devolvio un formato inesperado.')
  }
  return { ok: true, items: parsed.data, hasMore, nextOffset }
}

/**
 * Navega el catalogo SIN buscar, con o sin el filtro "Solo mios".
 *
 * `mineOnly` es un BOOLEAN y no un `coachId`: el dueño lo pone el llamador desde el actor, asi que
 * el payload no puede nombrar a otro coach ni por accidente. RLS ya acota lo visible, pero "mios"
 * es mas estrecho que "puedo verlo" — el catalogo publico (`coach_id is null`) tambien es visible
 * y no es mio.
 */
export async function browseCoachFoodCatalog(
  db: CoachFoodCatalogDb,
  input: { coachId: string; offset: number; countryCode: string; mineOnly: boolean },
): Promise<CoachFoodOffsetPage> {
  const pageSize = input.mineOnly ? COACH_FOOD_MINE_PAGE_SIZE : COACH_FOOD_BROWSE_PAGE_SIZE
  const from = input.offset
  const country = input.countryCode.toUpperCase()

  let chain = (db as unknown as FoodsReadDb)
    .from('foods')
    .select(FOOD_SELECT)
    .neq('verification_status', 'rejected')
    .or(`country_code.is.null,country_code.eq.${country}`)

  if (input.mineOnly) chain = chain.eq('coach_id', input.coachId)

  // `id` desempata: `name` no es unico y sin desempate la pagina 2 puede repetir u omitir filas.
  // El `+1` del rango dice si hay mas sin pagar un COUNT (patron de la cola de curacion).
  const foods = await chain
    .order('name', { ascending: true })
    .order('id', { ascending: true })
    .range(from, from + pageSize)

  if (foods.error || foods.data == null) {
    return readFailure(foods.error?.code, 'el catalogo')
  }

  const hasMore = foods.data.length > pageSize
  const rows = hasMore ? foods.data.slice(0, pageSize) : foods.data
  const nextOffset = hasMore ? from + pageSize : null
  if (rows.length === 0) return { ok: true, items: [], hasMore: false, nextOffset: null }

  // Si esta lectura falla, el repo degrada a mapa vacio (como en el freeze): la lista se ve con
  // los macros del catalogo en vez de romperse. Es la unica degradacion tolerada aca.
  const overrides = await getCoachFoodOverridesFor(db, { coachId: input.coachId }, rows.map((row) => row.id))

  return validated(
    rows.map((row) => foodRowToCatalogItem(row, overrides.get(row.id) ?? null)),
    hasMore,
    nextOffset,
  )
}

/**
 * Lista los alimentos que ESTE coach corrigio ("Editados por mi").
 *
 * Dos round-trips fijos, nunca N+1: una pagina de `coach_food_overrides` por offset (mas reciente
 * primero) y UN `in('id', ids)` sobre `foods` para hidratar identidad. El merge de macros lo hace
 * `resolveFoodMacros`, el MISMO helper puro que usan el freeze y la rehidratacion — asi el numero
 * de esta lista es el mismo que el del buscador.
 *
 * No se puede resolver filtrando la pagina del RPC: ese exige query de 2+ caracteres y devolveria
 * paginas casi vacias con "Cargar mas" lleno.
 */
export async function listCoachEditedFoods(
  db: CoachFoodCatalogDb,
  input: { coachId: string; offset: number },
): Promise<CoachFoodOffsetPage> {
  const from = input.offset
  const page = await getCoachFoodOverridePage(
    db,
    { coachId: input.coachId },
    { offset: from, limit: COACH_FOOD_EDITED_PAGE_SIZE + 1 },
  )
  if (!page.ok) return readFailure(page.code, 'tus correcciones')

  const hasMore = page.rows.length > COACH_FOOD_EDITED_PAGE_SIZE
  const rows = hasMore ? page.rows.slice(0, COACH_FOOD_EDITED_PAGE_SIZE) : page.rows
  const nextOffset = hasMore ? from + COACH_FOOD_EDITED_PAGE_SIZE : null
  if (rows.length === 0) return { ok: true, items: [], hasMore: false, nextOffset: null }

  const foods = await (db as unknown as FoodsReadDb)
    .from('foods')
    .select(FOOD_SELECT)
    .in('id', rows.map((row) => row.foodId))
  if (foods.error || foods.data == null) {
    return readFailure(foods.error?.code, 'tus alimentos editados')
  }

  const byId = new Map(foods.data.map((row) => [row.id, row]))
  // El orden lo manda la pagina de overrides (updated_at desc), no el orden de `foods`. Un
  // alimento que ya no se puede leer (borrado o fuera de scope) desaparece de la lista sin
  // romperla: el override huerfano no tiene identidad que mostrar. `hasMore`/`nextOffset` NO se
  // recalculan por eso — la paginacion es sobre los overrides, no sobre los alimentos.
  const items: FoodCatalogItem[] = []
  for (const row of rows) {
    const food = byId.get(row.foodId)
    if (food) items.push(foodRowToCatalogItem(food, row.values))
  }

  return validated(items, hasMore, nextOffset)
}
