'use server'

import { z } from 'zod'
import {
  FoodCatalogCursorSchema,
  FoodCatalogSearchReadModelSchema,
  type FoodCatalogItem,
  type FoodCatalogCursor,
} from '@eva/nutrition-v2'
import { createClient } from '@/lib/supabase/server'
import { rateLimitNutritionCatalogSearch } from '@/lib/rate-limit'
import { getPreferredWorkspaceForRender } from '@/services/auth/workspace-render-cache'
import { isNutritionV2Enabled } from '@/services/nutrition-v2-rollout.service'
import { nutritionV2CoachScopeFromWorkspace } from '@/services/nutrition-v2-read.service'
import { getNutritionPlansPageCoach } from '../../nutrition-plans/_data/nutrition-page.queries'

// Listado de alimentos del hub coach V2 (solo lectura).
// Fail-closed: re-verifica el gate (isNutritionV2Enabled, webCoach) y el scope del
// workspace activo en CADA busqueda, igual que el builder. Nunca trae el catalogo
// completo: pagina de a ~20 via keyset cursor sobre search_food_catalog_v2 (que ya
// aplica RLS token-scoped en la funcion SECURITY DEFINER).

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

function fail(code: string, error: string): ActionFailure {
  return { ok: false, code, error }
}

const SearchInputSchema = z.object({
  query: z.string().trim().max(120),
  countryCode: z.string().trim().length(2).default('CL'),
  cursor: FoodCatalogCursorSchema.nullable().default(null),
})

async function authorizeHubCoach(): Promise<{ ok: true; db: CatalogRpc } | ActionFailure> {
  const { user } = await getNutritionPlansPageCoach()
  if (!user) return fail('UNAUTHENTICATED', 'Debes iniciar sesion para ver el catalogo.')

  const limited = await rateLimitNutritionCatalogSearch(user.id)
  if (!limited.ok) {
    return fail('RATE_LIMITED', 'Demasiadas solicitudes. Espera un momento y vuelve a intentar.')
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

  try {
    nutritionV2CoachScopeFromWorkspace(workspace)
  } catch {
    return fail('SCOPE_REQUIRED', 'Debes tener un espacio de trabajo de coach activo.')
  }

  const db = (await createClient()) as unknown as CatalogRpc
  return { ok: true, db }
}

/**
 * Busca en el catalogo local (Chile por defecto) via search_food_catalog_v2.
 * Solo lectura, gate webCoach re-verificado, paginacion por cursor (pageSize 20).
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
