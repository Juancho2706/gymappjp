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
  const { draft, idempotencyKey, effectiveFrom } = parsed.data

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

  const result = await persistAndPublishDraft({ db, userId, draft, idempotencyKey, effectiveFrom })
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

  const auth = await authorizeCoach(parsed.data.clientId)
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
 * Fail-closed: re-verifica el gate/scope via authorizeCoach. Escribe con macros POR 100
 * (serving_size = 100), catalog_source='coach' y verification_status='coach_verified';
 * coach_id = auth.uid() lo exige la RLS foods_insert_own (org_id NULL). Devuelve el
 * alimento como BuilderFood para que el item pase a referenciar su id.
 */
const CreateCoachFoodInputSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().trim().min(1).max(180),
  brand: z.string().trim().max(180).nullable().default(null),
  unit: z.enum(['g', 'ml']).default('g'),
  calories: z.number().nonnegative().max(2000),
  proteinG: z.number().nonnegative().max(500),
  carbsG: z.number().nonnegative().max(500),
  fatsG: z.number().nonnegative().max(500),
})

export async function createCoachFoodAction(
  input: unknown,
): Promise<{ ok: true; food: BuilderFood } | ActionFailure> {
  const parsed = CreateCoachFoodInputSchema.safeParse(input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', 'El alimento tiene datos invalidos.', zodFields(parsed.error))
  }
  const { clientId, name, brand, unit, calories, proteinG, carbsG, fatsG } = parsed.data

  const auth = await authorizeCoach(clientId)
  if (!auth.ok) return auth
  const { db, userId } = auth

  const ins = await db
    .from('foods')
    .insert({
      name,
      brand,
      coach_id: userId,
      org_id: null,
      calories,
      protein_g: proteinG,
      carbs_g: carbsG,
      fats_g: fatsG,
      serving_size: 100,
      serving_unit: unit,
      is_liquid: unit === 'ml',
      category: 'otro',
      country_code: 'CL',
      catalog_source: 'coach',
      verification_status: 'coach_verified',
    })
    .select('id')
    .single()
  if (ins.error || !ins.data) return mapWriteError(ins.error ?? { message: 'no food' }, 'alimento')

  revalidatePath('/coach/nutrition-v2/' + clientId)

  const food: BuilderFood = {
    id: ins.data.id,
    name,
    brand,
    calories,
    proteinG,
    carbsG,
    fatsG,
    fiberG: null,
    servingSize: 100,
    servingUnit: unit,
  }
  return { ok: true, food }
}
