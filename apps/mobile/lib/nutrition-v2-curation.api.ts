/**
 * Cola de curación V2 (RN coach) — contrato de datos + persistencia por RPC scoped,
 * espejo 1:1 de `apps/web/src/app/coach/nutrition-v2/_actions/curation.actions.ts`.
 *
 * Las tres operaciones van por `db.rpc(...)` contra las funciones
 * `*_scoped_v2` (`supabase/migrations/20260728131000_nutrition_v2_curation_scoped.sql`):
 *  - filtran por el workspace ACTIVO (`private.nutrition_v2_client_matches_workspace`), no
 *    por la union de policies PERMISSIVE (que mezclaba el pool propio con el de todos los
 *    teams activos del coach);
 *  - lanzan `P0002` cuando el UPDATE no toca ninguna fila (codigo ya resuelto, inexistente
 *    o de otro workspace) en vez de reportar exito falso;
 *  - resuelven crear+vincular en UNA transaccion del servidor (sin compensacion best-effort).
 *
 * `scope` es OBLIGATORIO y fail-closed: sin scope valido no se toca la red. El servidor
 * revalida igual (SECURITY DEFINER + auth.uid()); la UI nunca autoriza.
 *
 * El cliente se INYECTA (`db`) como en `persistAndPublishDraft({ db, … })` para que la
 * lógica sea pura y testeable con un mock; la pantalla pasa
 * `supabase as unknown as CurationWriteClient`.
 */

import type { NutritionV2CoachScope } from '@eva/nutrition-v2'

// ---------------------------------------------------------------------------
// Cliente de escritura (subconjunto estructural de supabase-js)
// ---------------------------------------------------------------------------

export type DbError = { message?: string; code?: string }
export type DbResult<T> = { data: T | null; error: DbError | null }

/**
 * Subconjunto del cliente supabase-js que consume la curación. El cliente real del móvil
 * (`lib/supabase.ts`) es estructuralmente compatible: se pasa con
 * `supabase as unknown as CurationWriteClient` (igual que el builder castea su cliente).
 */
export interface CurationWriteClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<DbResult<unknown>>
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

/** Copy compartido con el web: el codigo ya estaba resuelto o no es del workspace activo. */
export const CURATION_ALREADY_RESOLVED = 'CURATION_ALREADY_RESOLVED'
const ALREADY_RESOLVED_MESSAGE =
  'Ese código ya fue resuelto o no está en tu espacio de trabajo. Actualizamos la bandeja.'

function fail(code: string, error: string): CurationFailure {
  return { ok: false, code, error }
}

/** Argumentos de scope comunes a las tres RPC. `null` cuando el scope no los usa. */
function scopeArgs(scope: NutritionV2CoachScope): Record<string, unknown> {
  return {
    p_scope_type: scope.scopeType,
    p_team_id: scope.teamId,
    p_org_id: scope.orgId,
  }
}

function isValidScope(scope: NutritionV2CoachScope | null | undefined): scope is NutritionV2CoachScope {
  if (!scope) return false
  if (scope.scopeType === 'standalone') return true
  if (scope.scopeType === 'team') return typeof scope.teamId === 'string' && scope.teamId.length > 0
  return false
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
// Listar GTIN sin match (resolved_at NULL) del workspace activo, paginado por offset
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
 * Lista los códigos pendientes del workspace activo ordenados por última aparición (desc),
 * 20 por página. Pide 21 (`p_page_size = PAGE_SIZE + 1`) para saber si hay más sin un COUNT
 * extra, igual que el web.
 */
export async function listMissingFoodCodesV2(input: {
  db: CurationWriteClient
  scope: NutritionV2CoachScope | null
  offset?: number
}): Promise<ListResult> {
  if (!isValidScope(input.scope)) {
    return fail('SCOPE_REQUIRED', 'Debes tener un espacio de trabajo de coach activo.')
  }

  const offset = Math.max(0, Math.min(100_000, Math.trunc(input.offset ?? 0)))
  const { data, error } = await input.db.rpc('list_missing_food_codes_scoped_v2', {
    ...scopeArgs(input.scope),
    p_offset: offset,
    p_page_size: PAGE_SIZE + 1,
  })

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
    nextOffset: hasMore ? offset + PAGE_SIZE : null,
  }
}

// ---------------------------------------------------------------------------
// Vincular con una fila existente del catálogo
// ---------------------------------------------------------------------------

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

/**
 * Vincula un GTIN con una fila del catálogo (`foods.id`) dentro del workspace activo. No
 * inventa nutrientes: solo asocia el código. Si la RPC no actualiza ninguna fila devuelve
 * `CURATION_ALREADY_RESOLVED` (P0002), nunca un éxito falso.
 */
export async function resolveMissingFoodCodeV2(input: {
  db: CurationWriteClient
  scope: NutritionV2CoachScope | null
  missingCodeId: string
  resolvedFoodId: string
}): Promise<ResolveResult> {
  if (!isValidScope(input.scope)) {
    return fail('SCOPE_REQUIRED', 'Debes tener un espacio de trabajo de coach activo.')
  }
  if (!isNonEmptyString(input.missingCodeId) || !isNonEmptyString(input.resolvedFoodId)) {
    return fail('INVALID_PAYLOAD', 'Datos invalidos.')
  }

  const { error } = await input.db.rpc('resolve_missing_food_code_scoped_v2', {
    p_missing_code_id: input.missingCodeId,
    p_food_id: input.resolvedFoodId,
    ...scopeArgs(input.scope),
  })

  if (error) {
    if (error.code === 'P0002') return fail(CURATION_ALREADY_RESOLVED, ALREADY_RESOLVED_MESSAGE)
    if (error.code === '42501') return fail('SCOPE_DENIED', 'No tienes permiso para vincular el codigo.')
    return fail('CURATION_RESOLVE_FAILED', 'No se pudo vincular el codigo. Intenta nuevamente.')
  }

  return { ok: true }
}

// ---------------------------------------------------------------------------
// Crear alimento coach-scoped + vincular (atómico en el servidor)
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

/** Guarda de rango, espejo del Zod web (`CreateAndResolveInputSchema`). */
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
 * `verification_status='coach_verified'`, `org_id NULL`, `coach_id = auth.uid()`) y vincula
 * el código pendiente, TODO en una sola función plpgsql: la atomicidad la garantiza el
 * servidor. La RPC reusa el alimento del coach con el mismo nombre (idempotencia del
 * reintento) y escribe `foods.barcode` cuando está libre, para que el próximo escaneo del
 * alumno encuentre el producto.
 */
export async function createCoachFoodForCurationV2(
  input: {
    db: CurationWriteClient
    scope: NutritionV2CoachScope | null
  } & CreateCoachFoodInput,
): Promise<ResolveResult> {
  if (!isValidScope(input.scope)) {
    return fail('SCOPE_REQUIRED', 'Debes tener un espacio de trabajo de coach activo.')
  }

  const parsed = validateCreateInput(input)
  if (!parsed.ok) return parsed
  const data = parsed.value

  const { error } = await input.db.rpc('create_food_and_resolve_missing_code_scoped_v2', {
    p_missing_code_id: data.missingCodeId,
    p_name: data.name,
    p_calories: data.calories,
    p_protein_g: data.proteinG,
    p_carbs_g: data.carbsG,
    p_fats_g: data.fatsG,
    p_brand: data.brand,
    p_unit: data.unit,
    ...scopeArgs(input.scope),
  })

  if (error) {
    if (error.code === 'P0002') return fail(CURATION_ALREADY_RESOLVED, ALREADY_RESOLVED_MESSAGE)
    if (error.code === '42501') return fail('SCOPE_DENIED', 'No tienes permiso para crear alimentos.')
    if (error.code === '22023') return fail('INVALID_PAYLOAD', 'El alimento tiene datos invalidos.')
    return fail('FOOD_CREATE_FAILED', 'No se pudo crear el alimento. Intenta nuevamente.')
  }

  return { ok: true }
}
