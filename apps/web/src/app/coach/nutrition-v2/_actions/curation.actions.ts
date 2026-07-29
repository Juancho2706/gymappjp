'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { NutritionV2CoachScope } from '@eva/nutrition-v2'
import { createClient } from '@/lib/supabase/server'
import { rateLimitNutritionCoachWrite } from '@/lib/rate-limit'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import { isNutritionV2Enabled } from '@/services/nutrition-v2-rollout.service'
import { nutritionV2CoachScopeFromWorkspace } from '@/services/nutrition-v2-read.service'
import { getNutritionPlansPageCoach } from '../../nutrition-plans/_data/nutrition-page.queries'

// Cola de curacion del Centro V2 (hub coach): codigos escaneados (GTIN) que aun no
// existen en el catalogo local. Cada accion re-verifica el gate (isNutritionV2Enabled,
// webCoach), deriva el scope del workspace activo (fail-closed) y lo PASA al servidor:
// las tres operaciones van por las RPC scoped `*_scoped_v2`
// (20260728131000_nutrition_v2_curation_scoped.sql), que filtran con
// private.nutrition_v2_client_matches_workspace y devuelven error real cuando no
// actualizan ninguna fila. Antes se operaba por PostgREST crudo: la union de policies
// PERMISSIVE mezclaba el pool propio con el de TODOS los teams activos (NUT-014) y un
// UPDATE de cero filas se reportaba como exito (NUT-023).

const PAGE_SIZE = 20

type ActionFailure = { ok: false; code: string; error: string }

/** Codigo compartido con RN: el codigo ya estaba resuelto o no es del workspace activo. */
const ALREADY_RESOLVED_MESSAGE =
  'Ese código ya fue resuelto o no está en tu espacio de trabajo. Actualizamos la bandeja.'

function fail(code: string, error: string): ActionFailure {
  return { ok: false, code, error }
}

type CurationRpc = {
  rpc: (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>
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

async function authorizeHubCoach(
  enforceCoachWriteLimit = false,
): Promise<
  { ok: true; db: CurationRpc; scope: NutritionV2CoachScope } | ActionFailure
> {
  const { user } = await getNutritionPlansPageCoach()
  if (!user) return fail('UNAUTHENTICATED', 'Debes iniciar sesion para gestionar la curacion.')

  // Solo las mutaciones (resolver/crear) consumen cupo; el listado es lectura y no limita.
  if (enforceCoachWriteLimit) {
    const limited = await rateLimitNutritionCoachWrite(user.id)
    if (!limited.ok) {
      return fail('RATE_LIMITED', 'Demasiadas solicitudes. Espera un momento y vuelve a intentar.')
    }
  }

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

  // El scope VIAJA al servidor (antes se calculaba y se descartaba): es el filtro real de
  // la bandeja y de cada mutacion, no solo un gate de render.
  let scope: NutritionV2CoachScope
  try {
    scope = nutritionV2CoachScopeFromWorkspace(workspace)
  } catch {
    return fail('SCOPE_REQUIRED', 'Debes tener un espacio de trabajo de coach activo.')
  }

  const db = (await createClient()) as unknown as CurationRpc
  return { ok: true, db, scope }
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
 * Lista los GTIN sin match local pendientes (resolved_at NULL) del workspace activo,
 * paginados de a 20 por offset y ordenados por ultima aparicion. La RPC pide 21 filas
 * para saber si hay mas sin un COUNT extra.
 */
export async function listMissingFoodCodesHubAction(
  input: unknown,
): Promise<ListSuccess | ActionFailure> {
  const parsed = ListInputSchema.safeParse(input)
  if (!parsed.success) return fail('INVALID_PAYLOAD', 'Parametros invalidos.')

  const auth = await authorizeHubCoach()
  if (!auth.ok) return auth

  const from = parsed.data.offset
  const { data, error } = await auth.db.rpc('list_missing_food_codes_scoped_v2', {
    p_scope_type: auth.scope.scopeType,
    p_team_id: auth.scope.teamId,
    p_org_id: auth.scope.orgId,
    p_offset: from,
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
 * solo ensena a EVA que fila corresponde a ese codigo. La RPC valida el workspace, exige
 * que el alimento destino sea legible por el coach y lanza P0002 si no actualizo nada.
 */
export async function resolveMissingFoodCodeHubAction(
  input: unknown,
): Promise<ResolveSuccess | ActionFailure> {
  const parsed = ResolveInputSchema.safeParse(input)
  if (!parsed.success) return fail('INVALID_PAYLOAD', 'Datos invalidos.')

  const auth = await authorizeHubCoach(true)
  if (!auth.ok) return auth

  const { error } = await auth.db.rpc('resolve_missing_food_code_scoped_v2', {
    p_missing_code_id: parsed.data.missingCodeId,
    p_food_id: parsed.data.resolvedFoodId,
    p_scope_type: auth.scope.scopeType,
    p_team_id: auth.scope.teamId,
    p_org_id: auth.scope.orgId,
  })

  if (error) {
    if (error.code === 'P0002') return fail('CURATION_ALREADY_RESOLVED', ALREADY_RESOLVED_MESSAGE)
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
 * verification_status='coach_verified', coach_id = auth.uid() con org_id NULL) y vincula
 * el codigo pendiente con el, TODO dentro de una sola funcion plpgsql: la atomicidad es
 * del servidor, ya no hay compensacion best-effort (insert huerfano si el vinculo fallaba).
 * La RPC ademas escribe `foods.barcode` cuando esta libre, para que el proximo escaneo del
 * alumno encuentre el alimento.
 */
export async function createCoachFoodForCurationAction(
  input: unknown,
): Promise<ResolveSuccess | ActionFailure> {
  const parsed = CreateAndResolveInputSchema.safeParse(input)
  if (!parsed.success) return fail('INVALID_PAYLOAD', 'El alimento tiene datos invalidos.')

  const auth = await authorizeHubCoach(true)
  if (!auth.ok) return auth
  const data = parsed.data

  const { error } = await auth.db.rpc('create_food_and_resolve_missing_code_scoped_v2', {
    p_missing_code_id: data.missingCodeId,
    p_name: data.name,
    p_calories: data.calories,
    p_protein_g: data.proteinG,
    p_carbs_g: data.carbsG,
    p_fats_g: data.fatsG,
    p_scope_type: auth.scope.scopeType,
    p_brand: data.brand,
    p_unit: data.unit,
    p_team_id: auth.scope.teamId,
    p_org_id: auth.scope.orgId,
  })

  if (error) {
    if (error.code === 'P0002') return fail('CURATION_ALREADY_RESOLVED', ALREADY_RESOLVED_MESSAGE)
    if (error.code === '42501') return fail('SCOPE_DENIED', 'No tienes permiso para crear alimentos.')
    if (error.code === '22023') return fail('INVALID_PAYLOAD', 'El alimento tiene datos invalidos.')
    return fail('FOOD_CREATE_FAILED', 'No se pudo crear el alimento. Intenta nuevamente.')
  }

  revalidatePath('/coach/nutrition-v2')
  return { ok: true }
}
