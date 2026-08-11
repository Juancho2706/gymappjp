import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import {
  foodExchangeEquivalenceShape,
  normalizeFoodExchangeEquivalence,
  refineFoodExchangeEquivalence,
} from '@eva/schemas/nutrition-exchanges'
import { isExchangeGroupVisibleToActor } from '@/services/nutrition-exchanges/nutrition-exchanges.service'
import { syncFoodExchangeListRow } from '@/services/nutrition-exchanges/exchange-lists.service'
import type { BuilderFood } from '@/app/coach/nutrition-v2/[clientId]/builder/_lib/draft-builder'
import {
  fail,
  mapWriteError,
  zodFields,
  type ActionFailure,
  type NutritionV2Db,
} from '@/app/coach/nutrition-v2/_actions/plan-persistence'

/**
 * Alta de alimento coach-scoped ("Guardar en mi catálogo" del builder) — UNA sola implementación
 * para las dos superficies.
 *
 * La escritura vivía duplicada: la web en `createCoachFoodAction` (server action, con su gate) y
 * RN en `createCoachFoodV2`, que insertaba DIRECTO en `foods` con el JWT de la sesión. La RLS
 * `foods_insert_own` es la barrera de tenencia, pero no mira rollout ni el resto del gate de
 * Nutrición V2: era el último camino de escritura del coach móvil fuera del endpoint de
 * mutaciones (NUT-005). Aquí queda el insert; el gate lo pone cada llamador (server action web /
 * `POST /api/mobile/nutrition-v2/coach/mutate`).
 *
 * Este módulo NO es 'use server': es lógica de servidor reutilizable, no un endpoint.
 */

/**
 * El bloque opcional "Equivalencia de porciones" (P-B, specs/nutrition-custom-portions) viaja
 * en el MISMO payload del alta: `exchangeGroupId` + `exchangePortionGrams` (+ medida casera).
 * Al vivir dentro de este schema compartido, la server action del builder, el endpoint mobile
 * `createFood` (que solo hace `.extend({ action, workspace })`) y RN lo aceptan sin tocar el
 * route. Zod 4 conserva la clase del objeto tras `.superRefine()`, así que ese `.extend()`
 * sigue compilando.
 */
export const CoachFoodInputSchema = z
  .object({
    // El insert NUNCA usa `clientId`: solo la server action web autoriza POR el alumno
    // (`authorizeCoach(clientId)`) y ahi se exige aparte. El endpoint movil autoriza por
    // workspace + bearer, y el tab Alimentos de RN (F6.3) crea sin alumno en contexto.
    clientId: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(180),
    brand: z.string().trim().max(180).nullable().default(null),
    unit: z.enum(['g', 'ml']).default('g'),
    calories: z.number().nonnegative().max(2000),
    proteinG: z.number().nonnegative().max(500),
    carbsG: z.number().nonnegative().max(500),
    fatsG: z.number().nonnegative().max(500),
    ...foodExchangeEquivalenceShape,
  })
  .superRefine(refineFoodExchangeEquivalence)

export type CoachFoodInput = z.infer<typeof CoachFoodInputSchema>

/**
 * Inserta el alimento con macros POR 100 (`serving_size = 100`), `catalog_source='coach'` y
 * `verification_status='coach_verified'`; `coach_id = userId` lo exige la RLS `foods_insert_own`
 * (org_id NULL). Devuelve el alimento como `BuilderFood` para que el ítem libre pase a
 * referenciar su id. `db` debe ser el cliente RLS del propio coach, nunca service_role.
 */
export async function insertCoachFood(input: {
  db: NutritionV2Db
  userId: string
  input: unknown
}): Promise<{ ok: true; food: BuilderFood } | ActionFailure> {
  const parsed = CoachFoodInputSchema.safeParse(input.input)
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', 'El alimento tiene datos invalidos.', zodFields(parsed.error))
  }
  const { name, brand, unit, calories, proteinG, carbsG, fatsG } = parsed.data

  // Clasificación de porciones (P-B). El FK de `foods.exchange_group_id` acepta cualquier
  // grupo existente, así que el id client-controlled se verifica contra los VISIBLES para el
  // coach (system + propios + team activo) antes de escribir. Sin grupo no se consulta nada.
  const equivalence = normalizeFoodExchangeEquivalence(parsed.data)
  if (equivalence.exchangeGroupId) {
    const visible = await isExchangeGroupVisibleToActor(
      input.db as unknown as SupabaseClient<Database>,
      equivalence.exchangeGroupId,
    )
    if (!visible) {
      return fail('EXCHANGE_GROUP_NOT_FOUND', 'Ese grupo de porciones ya no esta disponible.')
    }
  }

  const ins = await input.db
    .from('foods')
    .insert({
      name,
      brand,
      coach_id: input.userId,
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
      exchange_group_id: equivalence.exchangeGroupId,
      exchange_portion_grams: equivalence.exchangePortionGrams,
      exchange_portion_label: equivalence.exchangePortionLabel,
    })
    .select('id')
    .single()
  if (ins.error || !ins.data) return mapWriteError(ins.error ?? { message: 'no food' }, 'alimento')

  // Doble escritura (F2): la clasificación también entra en `exchange_group_foods` como fila
  // del coach. Best-effort — si falla, el alimento igual quedó clasificado en sus columnas.
  await syncFoodExchangeListRow(input.db as unknown as SupabaseClient<Database>, {
    actorCoachId: input.userId,
    foodId: ins.data.id,
    exchangeGroupId: equivalence.exchangeGroupId,
    portionGrams: equivalence.exchangePortionGrams,
    portionLabel: equivalence.exchangePortionLabel,
  })

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
    category: 'otro',
    media: null,
  }
  return { ok: true, food }
}
