'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import { isNutritionV2Enabled } from '@/services/nutrition-v2-rollout.service'
import { nutritionV2CoachScopeFromWorkspace } from '@/services/nutrition-v2-read.service'
import { getNutritionPlansPageCoach } from '../../nutrition-plans/_data/nutrition-page.queries'

// Cola de curacion del Centro V2 (hub coach): codigos escaneados (GTIN) que aun no
// existen en el catalogo local. Replica la logica de la V1 (FoodCatalogCurationQueue)
// pero con el patron V2: cada accion re-verifica el gate (isNutritionV2Enabled,
// webCoach) y el scope del workspace activo (fail-closed), valida con Zod, y pasa por
// el server client (coach derivado de la sesion). RLS de food_catalog_missing_codes /
// foods sigue siendo la frontera real de autorizacion.

const PAGE_SIZE = 20

type ActionFailure = { ok: false; code: string; error: string }

function fail(code: string, error: string): ActionFailure {
  return { ok: false, code, error }
}

export interface MissingCodeRow {
  id: string
  barcode: string
  countryCode: string
  sightings: number
  firstSeenAt: string
  lastSeenAt: string
}

type ListSuccess = { ok: true; items: MissingCodeRow[]; hasMore: boolean; nextOffset: number | null }
type ResolveSuccess = { ok: true }

async function authorizeHubCoach(): Promise<
  { ok: true; db: SupabaseClient; userId: string } | ActionFailure
> {
  const { user } = await getNutritionPlansPageCoach()
  if (!user) return fail('UNAUTHENTICATED', 'Debes iniciar sesion para gestionar la curacion.')

  const workspace = await getPreferredWorkspaceForRender(user.id)
  const teamId = workspace?.type === 'coach_team' ? workspace.teamId : null
  const orgId = workspace?.type === 'enterprise_coach' ? workspace.orgId : null

  const enabled = await isNutritionV2Enabled({
    surface: 'webCoach',
    userId: user.id,
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

  const db = (await createClient()) as unknown as SupabaseClient
  return { ok: true, db, userId: user.id }
}

const ListInputSchema = z.object({
  offset: z.number().int().nonnegative().max(100000).default(0),
})

interface RawMissingCodeRow {
  id: string
  barcode: string
  country_code: string
  sightings: number
  first_seen_at: string
  last_seen_at: string
}

/**
 * Lista los GTIN sin match local pendientes (resolved_at NULL), paginados de a 20 por
 * offset y ordenados por ultima aparicion. RLS acota la vista al coach.
 */
export async function listMissingFoodCodesHubAction(
  input: unknown,
): Promise<ListSuccess | ActionFailure> {
  const parsed = ListInputSchema.safeParse(input)
  if (!parsed.success) return fail('INVALID_PAYLOAD', 'Parametros invalidos.')

  const auth = await authorizeHubCoach()
  if (!auth.ok) return auth

  const from = parsed.data.offset
  const to = from + PAGE_SIZE
  const { data, error } = await auth.db
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
    items: page.map((row) => ({
      id: row.id,
      barcode: row.barcode,
      countryCode: row.country_code,
      sightings: row.sightings,
      firstSeenAt: row.first_seen_at,
      lastSeenAt: row.last_seen_at,
    })),
    hasMore,
    nextOffset: hasMore ? from + PAGE_SIZE : null,
  }
}

const ResolveInputSchema = z.object({
  missingCodeId: z.string().uuid(),
  resolvedFoodId: z.string().uuid(),
})

/**
 * Vincula un GTIN con una fila del catalogo local (foods.id). No inventa nutrientes:
 * solo ensena a EVA que fila corresponde a ese codigo. RLS es la frontera.
 */
export async function resolveMissingFoodCodeHubAction(
  input: unknown,
): Promise<ResolveSuccess | ActionFailure> {
  const parsed = ResolveInputSchema.safeParse(input)
  if (!parsed.success) return fail('INVALID_PAYLOAD', 'Datos invalidos.')

  const auth = await authorizeHubCoach()
  if (!auth.ok) return auth

  const { error } = await auth.db
    .from('food_catalog_missing_codes')
    .update({
      resolved_food_id: parsed.data.resolvedFoodId,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', parsed.data.missingCodeId)
    .is('resolved_at', null)

  if (error) {
    if (error.code === '42501') return fail('SCOPE_DENIED', 'No tienes permiso para vincular el codigo.')
    return fail('CURATION_RESOLVE_FAILED', 'No se pudo vincular el codigo. Intenta nuevamente.')
  }

  revalidatePath('/coach/nutrition-v2')
  return { ok: true }
}

const CreateAndResolveInputSchema = z.object({
  missingCodeId: z.string().uuid(),
  name: z.string().trim().min(1).max(180),
  brand: z.string().trim().max(180).nullable().default(null),
  unit: z.enum(['g', 'ml']).default('g'),
  calories: z.number().nonnegative().max(2000),
  proteinG: z.number().nonnegative().max(500),
  carbsG: z.number().nonnegative().max(500),
  fatsG: z.number().nonnegative().max(500),
})

/**
 * Crea un alimento coach-scoped (macros POR 100, catalog_source='coach',
 * verification_status='coach_verified'; coach_id = auth.uid() lo exige la RLS
 * foods_insert_own con org_id NULL) y vincula el codigo pendiente con el. Mismo patron
 * que createCoachFoodAction del builder, sin dependencia de clientId.
 */
export async function createCoachFoodForCurationAction(
  input: unknown,
): Promise<ResolveSuccess | ActionFailure> {
  const parsed = CreateAndResolveInputSchema.safeParse(input)
  if (!parsed.success) return fail('INVALID_PAYLOAD', 'El alimento tiene datos invalidos.')

  const auth = await authorizeHubCoach()
  if (!auth.ok) return auth
  const { db, userId } = auth
  const data = parsed.data

  // LIMITACIÓN CONOCIDA: insert(foods) + update(missing_codes) NO son atómicos (no hay RPC
  // transaccional a mano). Mitigamos el riesgo del retry en dos frentes:
  //  1) Idempotencia best-effort ANTES de crear: si un intento previo ya dejó un alimento
  //     coach-scoped con el mismo nombre normalizado, lo reusamos en vez de duplicar. No es
  //     garantía fuerte (no hay índice único sobre el nombre), solo reduce duplicados.
  //  2) Compensación best-effort DESPUÉS: si el vínculo falla y el alimento lo creamos en
  //     esta llamada, lo borramos para no dejarlo huérfano.
  const normalizedName = data.name.trim().toLowerCase()
  // Escapamos comodines de ILIKE (% y _ y \) para que el nombre matchee literal (ej "Leche 2%").
  const likePattern = data.name.trim().replace(/[\%_]/g, (m) => `\${m}`)

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
    foodId = (ins.data as { id: string }).id
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
    // Compensación best-effort: solo borramos si el alimento lo creamos en ESTA llamada (no
    // si reusamos uno preexistente). RLS `foods_delete_own` acota el DELETE al coach dueño.
    // Si el DELETE también falla queda un huérfano, pero el chequeo de idempotencia de arriba
    // lo reusará en el próximo retry sin duplicar.
    if (createdNow) {
      await db.from('foods').delete().eq('id', foodId).eq('coach_id', userId)
    }
    return fail('CURATION_RESOLVE_FAILED', 'Se creo el alimento pero no se pudo vincular el codigo.')
  }

  revalidatePath('/coach/nutrition-v2')
  return { ok: true }
}
