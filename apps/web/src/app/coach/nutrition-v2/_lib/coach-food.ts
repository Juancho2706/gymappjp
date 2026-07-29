import { z } from 'zod'
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

export const CoachFoodInputSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().trim().min(1).max(180),
  brand: z.string().trim().max(180).nullable().default(null),
  unit: z.enum(['g', 'ml']).default('g'),
  calories: z.number().nonnegative().max(2000),
  proteinG: z.number().nonnegative().max(500),
  carbsG: z.number().nonnegative().max(500),
  fatsG: z.number().nonnegative().max(500),
})

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
    })
    .select('id')
    .single()
  if (ins.error || !ins.data) return mapWriteError(ins.error ?? { message: 'no food' }, 'alimento')

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
