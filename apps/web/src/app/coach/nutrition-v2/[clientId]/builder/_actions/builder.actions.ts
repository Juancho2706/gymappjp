'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import {
  FoodCatalogCursorSchema,
  FoodCatalogSearchReadModelSchema,
  NutritionPlanDraftSchema,
} from '@eva/nutrition-v2'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  NUTRITION_PRO_FEATURE_LABEL,
  hasNutritionProV2,
  requiredNutritionProFeature,
} from '@/app/coach/nutrition-v2/_lib/nutrition-pro'
import type { BuilderFood } from '../_lib/draft-builder'
import { CoachFoodInputSchema, insertCoachFood } from '@/app/coach/nutrition-v2/_lib/coach-food'
import {
  authorizeCoach,
  fail,
  mapWriteError,
  persistAndPublishDraft,
  zodFields,
  type ActionFailure,
  type PublishSuccess,
} from '@/app/coach/nutrition-v2/_actions/plan-persistence'

// Builder V2 (web coach): publicacion de un plan de nutricion versionado.
// Fail-closed: cada accion re-verifica el gate (isNutritionV2Enabled, webCoach) y el
// scope del workspace via authorizeCoach. El draft se valida contra NutritionPlanDraftSchema.
// La persistencia + publicacion transaccional vive en `persistAndPublishDraft` (modulo
// compartido `_actions/plan-persistence.ts`), reusado por `assignPlanToClientsAction`.

const PublishInputSchema = z.object({
  draft: NutritionPlanDraftSchema,
  idempotencyKey: z.string().trim().min(8).max(200),
  effectiveFrom: z.string().date(),
  /**
   * Compare-and-swap opcional (NUT-011): id de la version vigente que el wizard tenia en
   * pantalla al abrirse. Si otra sesion (otra pestaña, RN, quick-edit) publico entremedio, el
   * RPC responde `nutrition_v2_publish_stale_base` -> STALE_BASE en vez de superponer una
   * version calculada sobre datos viejos. Ausente (plan nuevo o rama "Reemplazar") => el RPC
   * omite el guard, comportamiento identico al anterior.
   */
  expectedCurrentVersionId: z.string().uuid().optional(),
})

const SearchInputSchema = z.object({
  clientId: z.string().uuid(),
  query: z.string().trim().max(120),
  countryCode: z.string().trim().length(2).default('CL'),
  cursor: FoodCatalogCursorSchema.nullable().default(null),
})

/**
 * Publica un plan V2: valida el draft, aplica el gate comercial del addon Nutricion Pro y
 * delega la persistencia + publicacion transaccional en `persistAndPublishDraft`.
 */
export async function publishPlanAction(input: unknown): Promise<PublishSuccess | ActionFailure> {
  const parsed = PublishInputSchema.safeParse(input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', 'El plan tiene datos invalidos.', zodFields(parsed.error))
  }
  const { draft, idempotencyKey, effectiveFrom, expectedCurrentVersionId } = parsed.data

  const auth = await authorizeCoach(draft.clientId)
  if (!auth.ok) return auth
  const { db, userId } = auth

  // Gate comercial del addon Nutricion Pro (frontera CEO): strategy 'hybrid', mas de una
  // variante, o notas privadas/protocolo exigen el addon `nutrition_exchanges`. BASE publica
  // structured/flexible con UNA variante y sin notas privadas/protocolo, sin friccion. El
  // draft llega como `unknown`, asi que este assert server-side es la barrera real (la UI
  // solo espeja). Sin addon => error tipado UPGRADE_REQUIRED, nunca un 500.
  const proFeature = requiredNutritionProFeature(draft)
  if (proFeature) {
    const proEnabled = await hasNutritionProV2(db as unknown as SupabaseClient, auth.proCtx)
    if (!proEnabled) {
      return {
        ok: false,
        code: 'UPGRADE_REQUIRED',
        feature: proFeature,
        error: `Activa Nutricion Pro para publicar ${NUTRITION_PRO_FEATURE_LABEL[proFeature]}.`,
      }
    }
  }

  const result = await persistAndPublishDraft({
    db,
    userId,
    draft,
    idempotencyKey,
    effectiveFrom,
    // Solo cuando el wizard edita un plan existente (el CAS exige una version base real).
    ...(expectedCurrentVersionId ? { expectedCurrentVersionId } : {}),
  })
  if (!result.ok) return result

  revalidatePath('/coach/nutrition-v2')
  revalidatePath('/coach/nutrition-v2/' + draft.clientId)
  return result
}

/**
 * Busqueda en el catalogo local (Chile) via search_food_catalog_v2 para el builder.
 * Solo lectura; re-verifica el gate webCoach y devuelve el read model validado.
 */
export async function searchFoodCatalogCoachAction(
  input: unknown,
): Promise<{ ok: true; result: z.infer<typeof FoodCatalogSearchReadModelSchema> } | ActionFailure> {
  const parsed = SearchInputSchema.safeParse(input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', 'Busqueda invalida.', zodFields(parsed.error))
  }

  const auth = await authorizeCoach(parsed.data.clientId, 'catalog-search')
  if (!auth.ok) return auth

  const search = await auth.db.rpc('search_food_catalog_v2', {
    p_query: parsed.data.query,
    p_country_code: parsed.data.countryCode.toUpperCase(),
    p_cursor_score: parsed.data.cursor?.score ?? null,
    p_cursor_name: parsed.data.cursor?.name ?? null,
    p_cursor_id: parsed.data.cursor?.id ?? null,
    p_page_size: 25,
  })
  if (search.error) return mapWriteError(search.error, 'catalogo')

  const result = FoodCatalogSearchReadModelSchema.safeParse(search.data)
  if (!result.success) {
    return fail('CATALOG_CONTRACT_MISMATCH', 'El catalogo devolvio un formato inesperado.')
  }
  return { ok: true, result: result.data }
}

/**
 * Crea un alimento coach-scoped desde el "alimento libre con macros" del builder.
 * Fail-closed: re-verifica el gate/scope via authorizeCoach. El INSERT vive en
 * `_lib/coach-food.ts` (`insertCoachFood`) y lo comparte con el endpoint de mutaciones del coach
 * movil (`POST /api/mobile/nutrition-v2/coach/mutate`, accion `createFood`): una sola
 * implementacion de la escritura para web y RN, con macros POR 100 (serving_size = 100),
 * catalog_source='coach' y verification_status='coach_verified'.
 */
export async function createCoachFoodAction(
  input: unknown,
): Promise<{ ok: true; food: BuilderFood } | ActionFailure> {
  const parsed = CoachFoodInputSchema.safeParse(input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', 'El alimento tiene datos invalidos.', zodFields(parsed.error))
  }
  const { clientId } = parsed.data

  const auth = await authorizeCoach(clientId)
  if (!auth.ok) return auth

  const created = await insertCoachFood({ db: auth.db, userId: auth.userId, input: parsed.data })
  if (!created.ok) return created

  revalidatePath('/coach/nutrition-v2/' + clientId)
  return created
}
