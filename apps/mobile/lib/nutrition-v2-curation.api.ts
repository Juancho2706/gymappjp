/**
 * Cola de curación V2 (RN coach) — contrato de datos + persistencia DIRECTA por
 * supabase-js (PostgREST), espejo 1:1 de
 * `apps/web/src/app/coach/nutrition-v2/_actions/curation.actions.ts`.
 *
 * Igual que el builder V2 (`nutrition-v2-builder.ts`), NO hay endpoint móvil ni RPC de
 * curación: se opera contra `food_catalog_missing_codes` / `foods` mediante el cliente
 * `supabase-js` autenticado, y la RLS del servidor re-valida cada operación. Un `42501`
 * aquí == `SCOPE_DENIED` (mismo mapeo que el web `:115,165,253`). La UI nunca autoriza;
 * la barrera real es la RLS.
 *
 * El cliente de escritura se INYECTA (`db`) como en `persistAndPublishDraft({ db, … })`
 * para que la lógica sea pura y testeable con un mock; la pantalla pasa
 * `supabase as unknown as CurationWriteClient`.
 */

// ---------------------------------------------------------------------------
// Cliente de escritura (subconjunto estructural de supabase-js)
// ---------------------------------------------------------------------------

export type DbError = { message?: string; code?: string }
export type DbResult<T> = { data: T | null; error: DbError | null }

/** Encadenable de lectura (`select().is().order().range()` o `.eq().ilike().limit()`). */
interface ReadFilter<T> extends PromiseLike<DbResult<T[]>> {
  eq(column: string, value: unknown): ReadFilter<T>
  is(column: string, value: unknown): ReadFilter<T>
  ilike(column: string, pattern: string): ReadFilter<T>
  order(column: string, options: { ascending: boolean }): ReadFilter<T>
  range(from: number, to: number): ReadFilter<T>
  limit(count: number): ReadFilter<T>
}

/** Encadenable de mutación filtrada (`update(...).eq().is()` / `delete().eq().eq()`). */
interface MutateFilter extends PromiseLike<DbResult<null>> {
  eq(column: string, value: unknown): MutateFilter
  is(column: string, value: unknown): MutateFilter
}

interface InsertSelect {
  single(): Promise<DbResult<{ id: string }>>
}
interface InsertBuilder extends PromiseLike<DbResult<null>> {
  select(columns: string): InsertSelect
}

interface CurationTableApi {
  select(columns: string): ReadFilter<Record<string, unknown>>
  insert(rows: Record<string, unknown>): InsertBuilder
  update(values: Record<string, unknown>): MutateFilter
  delete(): MutateFilter
}

/**
 * Subconjunto del cliente supabase-js que consume la curación. El cliente real del móvil
 * (`lib/supabase.ts`) es estructuralmente compatible: se pasa con
 * `supabase as unknown as CurationWriteClient` (igual que el builder castea su cliente).
 */
export interface CurationWriteClient {
  from(table: string): CurationTableApi
}

// ---------------------------------------------------------------------------
// Tipos de resultado
// ---------------------------------------------------------------------------

export interface MissingCodeRow {
  id: string
  barcode: string
  countryCode: string
  sightings: number
  firstSeenAt: string
  lastSeenAt: string
}

export type CurationFailure = { ok: false; code: string; error: string }
export type ListResult =
  | { ok: true; items: MissingCodeRow[]; hasMore: boolean; nextOffset: number | null }
  | CurationFailure
export type ResolveResult = { ok: true } | CurationFailure

const PAGE_SIZE = 20

function fail(code: string, error: string): CurationFailure {
  return { ok: false, code, error }
}

// ---------------------------------------------------------------------------
// Puro: fecha relativa (port 1:1 de `curation.actions.ts` / `CurationQueue.tsx:21-28`)
// ---------------------------------------------------------------------------

/**
 * "Hoy" (0 días) / "Ayer" (1 día) / "Hace {n} dias". Fecha inválida → cadena vacía.
 * Módulo PURO: sin React, sin Supabase. Testeado.
 */
export function formatRelativeDate(value: string): string {
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return ''
  const days = Math.max(0, Math.round((Date.now() - timestamp) / 86_400_000))
  if (days === 0) return 'Hoy'
  if (days === 1) return 'Ayer'
  return `Hace ${days} dias`
}

// ---------------------------------------------------------------------------
// Listar GTIN sin match (resolved_at NULL), paginado por offset
// ---------------------------------------------------------------------------

interface RawMissingCodeRow {
  id: string
  barcode: string
  country_code: string
  sightings: number
  first_seen_at: string
  last_seen_at: string
}

function mapRow(row: RawMissingCodeRow): MissingCodeRow {
  return {
    id: row.id,
    barcode: row.barcode,
    countryCode: row.country_code,
    sightings: row.sightings,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  }
}

/**
 * Lista los códigos pendientes ordenados por última aparición (desc), 20 por página.
 * Pide 21 (`range(from, from + 20)`) para saber si hay más sin un COUNT extra, igual que
 * el web (`curation.actions.ts:105-134`). RLS acota la vista al coach.
 */
export async function listMissingFoodCodesV2(input: {
  db: CurationWriteClient
  offset?: number
}): Promise<ListResult> {
  const offset = Math.max(0, Math.min(100_000, Math.trunc(input.offset ?? 0)))
  const from = offset
  const to = from + PAGE_SIZE
  const { data, error } = await input.db
    .from('food_catalog_missing_codes')
    .select('id, barcode, country_code, sightings, first_seen_at, last_seen_at')
    .is('resolved_at', null)
    .order('last_seen_at', { ascending: false })
    .range(from, to)

  if (error) {
    if (error.code === '42501') return fail('SCOPE_DENIED', 'No tienes permiso para ver la cola.')
    return fail('CURATION_READ_FAILED', 'No se pudo cargar la cola de curacion.')
  }

  const rows = (data as RawMissingCodeRow[] | null) ?? []
  const hasMore = rows.length > PAGE_SIZE
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows
  return {
    ok: true,
    items: page.map(mapRow),
    hasMore,
    nextOffset: hasMore ? from + PAGE_SIZE : null,
  }
}

// ---------------------------------------------------------------------------
// Vincular con una fila existente del catálogo
// ---------------------------------------------------------------------------

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Vincula un GTIN con una fila del catálogo (`foods.id`). No inventa nutrientes: solo
 * asocia el código. RLS es la frontera (`curation.actions.ts:155-170`).
 */
export async function resolveMissingFoodCodeV2(input: {
  db: CurationWriteClient
  missingCodeId: string
  resolvedFoodId: string
}): Promise<ResolveResult> {
  if (!isNonEmptyString(input.missingCodeId) || !isNonEmptyString(input.resolvedFoodId)) {
    return fail('INVALID_PAYLOAD', 'Datos invalidos.')
  }

  const { error } = await input.db
    .from('food_catalog_missing_codes')
    .update({
      resolved_food_id: input.resolvedFoodId,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', input.missingCodeId)
    .is('resolved_at', null)

  if (error) {
    if (error.code === '42501') return fail('SCOPE_DENIED', 'No tienes permiso para vincular el codigo.')
    return fail('CURATION_RESOLVE_FAILED', 'No se pudo vincular el codigo. Intenta nuevamente.')
  }

  return { ok: true }
}

// ---------------------------------------------------------------------------
// Crear alimento coach-scoped + vincular (flujo NO atómico con mitigaciones)
// ---------------------------------------------------------------------------

export interface CreateCoachFoodInput {
  missingCodeId: string
  name: string
  brand?: string | null
  unit?: 'g' | 'ml'
  calories: number
  proteinG: number
  carbsG: number
  fatsG: number
}

interface ValidatedCreate {
  missingCodeId: string
  name: string
  brand: string | null
  unit: 'g' | 'ml'
  calories: number
  proteinG: number
  carbsG: number
  fatsG: number
}

/** Guarda de rango, espejo del Zod web (`curation.actions.ts:173-182`). */
function inRange(value: unknown, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max
}

function validateCreateInput(
  input: CreateCoachFoodInput,
): { ok: true; value: ValidatedCreate } | CurationFailure {
  if (!isNonEmptyString(input.missingCodeId)) return fail('INVALID_PAYLOAD', 'El alimento tiene datos invalidos.')
  const name = typeof input.name === 'string' ? input.name.trim() : ''
  if (name.length < 1 || name.length > 180) return fail('INVALID_PAYLOAD', 'El alimento tiene datos invalidos.')

  let brand: string | null = null
  if (input.brand != null) {
    const trimmed = String(input.brand).trim()
    if (trimmed.length > 180) return fail('INVALID_PAYLOAD', 'El alimento tiene datos invalidos.')
    brand = trimmed === '' ? null : trimmed
  }

  const unit: 'g' | 'ml' = input.unit === 'ml' ? 'ml' : 'g'
  if (input.unit != null && input.unit !== 'g' && input.unit !== 'ml') {
    return fail('INVALID_PAYLOAD', 'El alimento tiene datos invalidos.')
  }

  if (!inRange(input.calories, 2000)) return fail('INVALID_PAYLOAD', 'El alimento tiene datos invalidos.')
  if (!inRange(input.proteinG, 500)) return fail('INVALID_PAYLOAD', 'El alimento tiene datos invalidos.')
  if (!inRange(input.carbsG, 500)) return fail('INVALID_PAYLOAD', 'El alimento tiene datos invalidos.')
  if (!inRange(input.fatsG, 500)) return fail('INVALID_PAYLOAD', 'El alimento tiene datos invalidos.')

  return {
    ok: true,
    value: {
      missingCodeId: input.missingCodeId,
      name,
      brand,
      unit,
      calories: input.calories,
      proteinG: input.proteinG,
      carbsG: input.carbsG,
      fatsG: input.fatsG,
    },
  }
}

/**
 * Crea un alimento coach-scoped (macros POR 100, `catalog_source='coach'`,
 * `verification_status='coach_verified'`, `org_id NULL`; `coach_id=userId` lo exige la
 * RLS `foods_insert_own`) y vincula el código pendiente en un paso.
 *
 * LIMITACIÓN CONOCIDA (portada 1:1 del web `:190-283`): insert(foods) + update(missing)
 * NO son atómicos. Mitigaciones:
 *  1) Idempotencia best-effort ANTES de crear: si un intento previo dejó un alimento
 *     coach-scoped con el mismo nombre normalizado, se reusa en vez de duplicar (sin
 *     índice único; solo reduce duplicados).
 *  2) Compensación best-effort DESPUÉS: si el vínculo falla y el alimento se creó en
 *     ESTA llamada, se borra para no dejarlo huérfano.
 */
export async function createCoachFoodForCurationV2(
  input: { db: CurationWriteClient; userId: string } & CreateCoachFoodInput,
): Promise<ResolveResult> {
  const parsed = validateCreateInput(input)
  if (!parsed.ok) return parsed
  const data = parsed.value
  const { db, userId } = input

  if (!isNonEmptyString(userId)) return fail('SCOPE_DENIED', 'No tienes permiso para crear alimentos.')

  const normalizedName = data.name.toLowerCase()
  // Escapamos comodines de ILIKE (% y _) para que el nombre matchee literal (ej "Leche 2%").
  const likePattern = data.name.replace(/[%_]/g, (m) => `\\${m}`)

  let foodId: string | null = null
  const existing = await db
    .from('foods')
    .select('id, name')
    .eq('coach_id', userId)
    .is('org_id', null)
    .eq('catalog_source', 'coach')
    .ilike('name', likePattern)
    .limit(20)
  if (!existing.error && existing.data) {
    const match = (existing.data as Array<{ id: string; name: string }>).find(
      (row) => row.name.trim().toLowerCase() === normalizedName,
    )
    if (match) foodId = match.id
  }

  const createdNow = foodId === null
  if (createdNow) {
    const ins = await db
      .from('foods')
      .insert({
        name: data.name,
        brand: data.brand,
        coach_id: userId,
        org_id: null,
        calories: data.calories,
        protein_g: data.proteinG,
        carbs_g: data.carbsG,
        fats_g: data.fatsG,
        serving_size: 100,
        serving_unit: data.unit,
        is_liquid: data.unit === 'ml',
        category: 'otro',
        country_code: 'CL',
        catalog_source: 'coach',
        verification_status: 'coach_verified',
      })
      .select('id')
      .single()

    if (ins.error || !ins.data) {
      if (ins.error?.code === '42501') return fail('SCOPE_DENIED', 'No tienes permiso para crear alimentos.')
      return fail('FOOD_CREATE_FAILED', 'No se pudo crear el alimento. Intenta nuevamente.')
    }
    foodId = ins.data.id
  }

  if (foodId === null) {
    // Inalcanzable (o reusamos un id o lo insertamos); defensivo para el narrowing.
    return fail('FOOD_CREATE_FAILED', 'No se pudo crear el alimento. Intenta nuevamente.')
  }

  const resolve = await db
    .from('food_catalog_missing_codes')
    .update({ resolved_food_id: foodId, resolved_at: new Date().toISOString() })
    .eq('id', data.missingCodeId)
    .is('resolved_at', null)

  if (resolve.error) {
    // Compensación best-effort: solo borramos si el alimento lo creamos en ESTA llamada.
    // RLS `foods_delete_own` acota el DELETE al coach dueño. Si el DELETE también falla
    // queda un huérfano, pero la idempotencia de arriba lo reusará en el próximo retry.
    if (createdNow) {
      await db.from('foods').delete().eq('id', foodId).eq('coach_id', userId)
    }
    return fail('CURATION_RESOLVE_FAILED', 'Se creo el alimento pero no se pudo vincular el codigo.')
  }

  return { ok: true }
}
