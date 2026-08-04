import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { EXCHANGE_LIST_OWNER_RANK, type ExchangeListOwnerRank } from '@eva/nutrition-v2'
import type { NutritionMacrosBasis } from '@eva/nutrition-v2'

/**
 * Repository de `exchange_group_foods` — la LISTA de equivalencias de un grupo de porciones
 * (F2, specs/nutrition-exchange-lists). Tabla nueva: no toca `exchanges.repository.ts`.
 *
 * RLS es el TECHO. Con el cliente user-scoped del coach, un SELECT por grupo devuelve
 * exactamente tres cosas: las filas globales (sin dueño), las suyas y las de su org. Por eso
 * el rango de dueño se puede derivar de las columnas sin volver a preguntar quién soy:
 * si `coach_id` viene poblado, es mío; si viene `org_id`, es de mi org.
 *
 * Estas funciones JAMÁS reciben el cliente service-role: el catálogo global es territorio del
 * backfill (`20260804090500`), y ninguna policy de `authenticated` deja crear filas sin dueño.
 */

type DB = SupabaseClient<Database>

/** Dueño de la fila que escribe el actor. Lo resuelve el servicio desde sesión + workspace. */
export type ExchangeListOwner = { coachId: string | null; orgId: string | null }

export type ExchangeListRow = {
  id: string
  exchangeGroupId: string
  foodId: string
  foodName: string
  foodBrand: string | null
  portionGrams: number | null
  portionLabel: string | null
  isExcluded: boolean
  source: string
  ownerRank: ExchangeListOwnerRank
  /** true ⇒ la fila la escribió el actor (o su org): se puede editar, excluir y devolver al catálogo. */
  isOwn: boolean
}

export type ExchangeListFoodMacros = {
  id: string
  name: string
  brand: string | null
  calories: number | null
  proteinG: number | null
  carbsG: number | null
  fatsG: number | null
  servingSize: number | null
  macrosBasis: NutritionMacrosBasis | null
  /** true ⇒ el alimento es del catálogo global (nadie lo puede editar, pero sí clasificar). */
  isGlobal: boolean
}

const ROW_COLUMNS =
  'id, exchange_group_id, food_id, coach_id, org_id, portion_grams, portion_label, is_excluded, source, foods!inner(name, brand)'

type RawRow = {
  id: string
  exchange_group_id: string
  food_id: string
  coach_id: string | null
  org_id: string | null
  portion_grams: number | string | null
  portion_label: string | null
  is_excluded: boolean
  source: string
  foods: { name: string | null; brand: string | null } | { name: string | null; brand: string | null }[] | null
}

function foodOf(raw: RawRow): { name: string; brand: string | null } {
  const embedded = Array.isArray(raw.foods) ? raw.foods[0] : raw.foods
  return { name: embedded?.name ?? 'Alimento', brand: embedded?.brand ?? null }
}

function mapRow(raw: RawRow): ExchangeListRow {
  const food = foodOf(raw)
  const ownerRank: ExchangeListOwnerRank =
    raw.coach_id != null
      ? EXCHANGE_LIST_OWNER_RANK.coach
      : raw.org_id != null
        ? EXCHANGE_LIST_OWNER_RANK.org
        : EXCHANGE_LIST_OWNER_RANK.global
  return {
    id: raw.id,
    exchangeGroupId: raw.exchange_group_id,
    foodId: raw.food_id,
    foodName: food.name,
    foodBrand: food.brand,
    portionGrams: raw.portion_grams != null ? Number(raw.portion_grams) : null,
    portionLabel: raw.portion_label,
    isExcluded: raw.is_excluded,
    source: raw.source,
    ownerRank,
    isOwn: ownerRank !== EXCHANGE_LIST_OWNER_RANK.global,
  }
}

/**
 * Filas de UN grupo visibles para el actor. Devuelve las de TODAS las procedencias sin resolver:
 * quien decide cuál gana es `resolveExchangeListRows` (el espejo TS del `distinct on` del
 * read-model), para que la gestión del coach muestre exactamente lo que verá el alumno.
 *
 * `search` filtra por el `name_search` del alimento (columna ya normalizada sin tildes que usa
 * todo el buscador del catálogo), no por `name`: buscar "platano" tiene que encontrar "Plátano".
 */
export async function findExchangeListRowsByGroup(
  db: DB,
  input: { groupId: string; search?: string | null; limit?: number; offset?: number }
): Promise<{ rows: ExchangeListRow[]; total: number }> {
  let query = db
    .from('exchange_group_foods')
    .select(ROW_COLUMNS, { count: 'exact' })
    .eq('exchange_group_id', input.groupId)

  const term = (input.search ?? '').trim()
  if (term) {
    const normalized = term
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/%/g, '\\%')
    query = query.ilike('foods.name_search', `%${normalized}%`)
  }

  const limit = input.limit ?? 60
  const offset = input.offset ?? 0
  const { data, error, count } = await query
    // Propias primero: lo que el coach cambió es lo que quiere revisar.
    .order('coach_id', { ascending: false, nullsFirst: false })
    .order('food_id', { ascending: true })
    .range(offset, offset + limit - 1)

  if (error || data == null) return { rows: [], total: 0 }
  return { rows: (data as unknown as RawRow[]).map(mapRow), total: count ?? data.length }
}

/** Todas las filas de un grupo SIN paginar (copia masiva al duplicar; tope duro en el servicio). */
export async function findAllExchangeListRowsByGroup(
  db: DB,
  groupId: string,
  hardLimit: number
): Promise<ExchangeListRow[]> {
  const { data, error } = await db
    .from('exchange_group_foods')
    .select(ROW_COLUMNS)
    .eq('exchange_group_id', groupId)
    .order('coach_id', { ascending: false, nullsFirst: false })
    .limit(hardLimit)
  if (error || data == null) return []
  return (data as unknown as RawRow[]).map(mapRow)
}

/** Fila del actor para (grupo, alimento), si existe. Distingue alta de edición sin adivinar. */
export async function findOwnExchangeListRow(
  db: DB,
  input: { groupId: string; foodId: string; owner: ExchangeListOwner }
): Promise<{ id: string } | null> {
  let query = db
    .from('exchange_group_foods')
    .select('id')
    .eq('exchange_group_id', input.groupId)
    .eq('food_id', input.foodId)

  query = input.owner.coachId
    ? query.eq('coach_id', input.owner.coachId)
    : input.owner.orgId
      ? query.eq('org_id', input.owner.orgId)
      : query.is('coach_id', null).is('org_id', null)

  const { data } = await query.maybeSingle()
  return data ? { id: data.id as string } : null
}

export type ExchangeListWriteResult = { ok: true } | { ok: false; error: string }

/**
 * Alta o edición de MI fila. No usa `upsert` de PostgREST a propósito: el único unique de la
 * tabla es `NULLS NOT DISTINCT` sobre cuatro columnas, dos de ellas nullables, y el
 * `on_conflict` de PostgREST sobre columnas nullables es terreno resbaloso. Un select previo
 * cuesta un round-trip y deja el camino explícito.
 */
export async function upsertOwnExchangeListRow(
  db: DB,
  input: {
    groupId: string
    foodId: string
    owner: ExchangeListOwner
    portionGrams: number
    portionLabel: string | null
    source?: 'coach' | 'import'
    createdBy?: string | null
  }
): Promise<ExchangeListWriteResult> {
  const existing = await findOwnExchangeListRow(db, input)
  if (existing) {
    const { data, error } = await db
      .from('exchange_group_foods')
      .update({
        portion_grams: input.portionGrams,
        portion_label: input.portionLabel,
        is_excluded: false,
      })
      .eq('id', existing.id)
      .select('id')
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: false, error: 'No se pudo guardar la equivalencia.' }
    return { ok: true }
  }

  const { data, error } = await db
    .from('exchange_group_foods')
    .insert({
      exchange_group_id: input.groupId,
      food_id: input.foodId,
      coach_id: input.owner.coachId,
      org_id: input.owner.orgId,
      portion_grams: input.portionGrams,
      portion_label: input.portionLabel,
      is_excluded: false,
      source: input.source ?? 'coach',
      created_by: input.createdBy ?? null,
    })
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'No se pudo guardar la equivalencia.' }
  return { ok: true }
}

/**
 * Lápida: saca el alimento de MI lista sin tocar el catálogo. Es un upsert con
 * `is_excluded = true` y gramos en NULL (el check `egf_grams_required_when_visible` solo deja
 * gramos nulos en filas excluidas, así que una lápida no puede quedar como fila muda visible).
 */
export async function excludeExchangeListRow(
  db: DB,
  input: { groupId: string; foodId: string; owner: ExchangeListOwner }
): Promise<ExchangeListWriteResult> {
  const existing = await findOwnExchangeListRow(db, input)
  if (existing) {
    const { data, error } = await db
      .from('exchange_group_foods')
      .update({ is_excluded: true, portion_grams: null, portion_label: null })
      .eq('id', existing.id)
      .select('id')
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: false, error: 'No se pudo quitar el alimento de la lista.' }
    return { ok: true }
  }

  const { data, error } = await db
    .from('exchange_group_foods')
    .insert({
      exchange_group_id: input.groupId,
      food_id: input.foodId,
      coach_id: input.owner.coachId,
      org_id: input.owner.orgId,
      portion_grams: null,
      portion_label: null,
      is_excluded: true,
      source: 'coach',
    })
    .select('id')
    .maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!data) return { ok: false, error: 'No se pudo quitar el alimento de la lista.' }
  return { ok: true }
}

/**
 * Borra MI fila (valor propio o lápida) ⇒ el alimento vuelve a lo que diga el catálogo global.
 * 0 filas afectadas NO es error: significa que nunca hubo fila propia y el estado final es el
 * que el coach pidió.
 */
export async function deleteOwnExchangeListRow(
  db: DB,
  input: { groupId: string; foodId: string; owner: ExchangeListOwner }
): Promise<ExchangeListWriteResult> {
  let query = db
    .from('exchange_group_foods')
    .delete()
    .eq('exchange_group_id', input.groupId)
    .eq('food_id', input.foodId)

  query = input.owner.coachId
    ? query.eq('coach_id', input.owner.coachId)
    : input.owner.orgId
      ? query.eq('org_id', input.owner.orgId)
      : query.is('coach_id', null).is('org_id', null)

  const { error } = await query
  return error ? { ok: false, error: error.message } : { ok: true }
}

/**
 * Borra TODAS mis filas de un alimento, en cualquier grupo. Lo usa la doble escritura: cuando
 * el coach reclasifica un alimento de un grupo a otro, la fila vieja tiene que irse o el alumno
 * vería el mismo alimento en los dos grupos.
 */
export async function deleteOwnExchangeListRowsForFood(
  db: DB,
  input: { foodId: string; owner: ExchangeListOwner }
): Promise<ExchangeListWriteResult> {
  let query = db.from('exchange_group_foods').delete().eq('food_id', input.foodId)
  query = input.owner.coachId
    ? query.eq('coach_id', input.owner.coachId)
    : input.owner.orgId
      ? query.eq('org_id', input.owner.orgId)
      : query.is('coach_id', null).is('org_id', null)
  const { error } = await query
  return error ? { ok: false, error: error.message } : { ok: true }
}

/** Copia masiva al duplicar un grupo. Una sola sentencia: 715 filas no son 715 round-trips. */
export async function insertExchangeListRows(
  db: DB,
  rows: {
    groupId: string
    foodId: string
    owner: ExchangeListOwner
    portionGrams: number
    portionLabel: string | null
    createdBy?: string | null
  }[]
): Promise<{ inserted: number; error?: string }> {
  if (rows.length === 0) return { inserted: 0 }
  const { data, error } = await db
    .from('exchange_group_foods')
    .insert(
      rows.map((row) => ({
        exchange_group_id: row.groupId,
        food_id: row.foodId,
        coach_id: row.owner.coachId,
        org_id: row.owner.orgId,
        portion_grams: row.portionGrams,
        portion_label: row.portionLabel,
        is_excluded: false,
        source: 'import' as const,
        created_by: row.createdBy ?? null,
      }))
    )
    .select('id')
  if (error) return { inserted: 0, error: error.message }
  return { inserted: data?.length ?? 0 }
}

/**
 * Buscador de alimentos para clasificar: TODO el catálogo visible, no solo los propios. Es el
 * cambio de fondo de F2 — hasta F1 el coach solo podía clasificar lo que él mismo había creado.
 *
 * Devuelve los macros y la BASE declarada (`macros_basis`), que es lo que necesita
 * `suggestPortionGrams` para no equivocarse entre `per_100` y `per_serving`. `getFoodLibrary`
 * no trae esa columna, por eso esta lectura es propia y no una opción más de aquella.
 */
export async function searchFoodsForExchangeList(
  db: DB,
  input: { search?: string | null; limit?: number }
): Promise<ExchangeListFoodMacros[]> {
  let query = db
    .from('foods')
    .select('id, name, brand, calories, protein_g, carbs_g, fats_g, serving_size, macros_basis, coach_id, org_id')

  const term = (input.search ?? '').trim()
  if (term) {
    const normalized = term
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/%/g, '\\%')
    query = query.ilike('name_search', `%${normalized}%`)
  }

  const { data, error } = await query
    // Propios primero (son los que el coach reconoce), después el catálogo global.
    .order('coach_id', { ascending: false, nullsFirst: false })
    .order('name', { ascending: true })
    .limit(input.limit ?? 40)

  if (error || data == null) return []
  return data.map((raw) => {
    const row = raw as {
      id: string
      name: string | null
      brand: string | null
      calories: number | null
      protein_g: number | null
      carbs_g: number | null
      fats_g: number | null
      serving_size: number | null
      macros_basis: string | null
      coach_id: string | null
      org_id: string | null
    }
    return {
      id: row.id,
      name: row.name ?? 'Alimento',
      brand: row.brand,
      calories: row.calories,
      proteinG: row.protein_g,
      carbsG: row.carbs_g,
      fatsG: row.fats_g,
      servingSize: row.serving_size,
      macrosBasis:
        row.macros_basis === 'per_100' || row.macros_basis === 'per_serving'
          ? (row.macros_basis as NutritionMacrosBasis)
          : null,
      isGlobal: row.coach_id == null && row.org_id == null,
    }
  })
}

/**
 * Página del recorrido del contador. PostgREST corta CUALQUIER select en `max_rows` (1000 en este
 * proyecto, `supabase/config.toml:18`) y la tabla ya pasa las 2500 filas globales, así que una
 * sola lectura devolvía un tercio del catálogo: los grupos que quedaban fuera de la ventana
 * desaparecían del mapa y los que entraban a medias reportaban un número más chico que el real.
 */
const COUNT_PAGE_SIZE = 1000
/** Techo duro del recorrido (20 páginas). Un catálogo mayor se declara TRUNCADO, no se adivina. */
const COUNT_MAX_PAGES = 20

export type ExchangeListCounts = {
  counts: Record<string, number>
  /**
   * true ⇒ la lectura se cortó y el mapa NO es exhaustivo: un grupo ausente puede tener
   * equivalencias igual. Quien pinte "sin alimentos" a partir de una clave ausente DEBE callarse
   * en este caso — un falso "tu alumno no verá ejemplos" sobre un grupo con 715 alimentos es peor
   * que no decir nada.
   */
  truncated: boolean
}

/**
 * Cuántas equivalencias VIVAS tiene cada grupo (las lápidas no cuentan). Los grupos SIN una sola
 * fila vuelven con `0` explícito: distinguir "vacío de verdad" de "no lo sé" es justamente lo que
 * habilita el aviso de porciones huérfanas.
 */
export async function countExchangeListRowsByGroup(
  db: DB,
  groupIds: string[]
): Promise<ExchangeListCounts> {
  if (groupIds.length === 0) return { counts: {}, truncated: false }

  // Se resuelve la precedencia antes de contar: si el coach excluyó un alimento global, el
  // contador tiene que bajar. Un COUNT plano mentiría al alza justo en el caso que importa.
  const byGroup = new Map<string, Map<string, { rank: number; excluded: boolean }>>()
  let truncated = false

  for (let page = 0; page < COUNT_MAX_PAGES; page += 1) {
    const from = page * COUNT_PAGE_SIZE
    const { data, error } = await db
      .from('exchange_group_foods')
      .select('exchange_group_id, food_id, coach_id, org_id, is_excluded')
      .in('exchange_group_id', groupIds)
      // Orden estable: sin él, dos páginas pueden repetir u omitir filas (el plan es libre de
      // devolverlas en otro orden entre requests).
      .order('id', { ascending: true })
      .range(from, from + COUNT_PAGE_SIZE - 1)
    if (error || data == null) return { counts: {}, truncated: true }

    for (const raw of data) {
      const row = raw as {
        exchange_group_id: string
        food_id: string
        coach_id: string | null
        org_id: string | null
        is_excluded: boolean
      }
      const rank =
        row.coach_id != null
          ? EXCHANGE_LIST_OWNER_RANK.coach
          : row.org_id != null
            ? EXCHANGE_LIST_OWNER_RANK.org
            : EXCHANGE_LIST_OWNER_RANK.global
      const group = byGroup.get(row.exchange_group_id) ?? new Map()
      const current = group.get(row.food_id)
      if (current == null || rank < current.rank) {
        group.set(row.food_id, { rank, excluded: row.is_excluded })
      }
      byGroup.set(row.exchange_group_id, group)
    }

    if (data.length < COUNT_PAGE_SIZE) break
    if (page === COUNT_MAX_PAGES - 1) truncated = true
  }

  const counts: Record<string, number> = {}
  // Denso a propósito: un grupo pedido y sin filas vale 0, no "ausente".
  if (!truncated) for (const groupId of groupIds) counts[groupId] = 0
  for (const [groupId, foods] of byGroup) {
    let alive = 0
    for (const winner of foods.values()) if (!winner.excluded) alive += 1
    counts[groupId] = alive
  }
  return { counts, truncated }
}
