'use server'

/**
 * Clasificar un alimento PROPIO ya existente dentro de un grupo de porciones
 * (specs/nutrition-custom-portions §P-B, camino de UPDATE). El alta ya puede llevar la
 * equivalencia en el mismo formulario; esto cubre el caso real del coach que tiene su
 * catálogo hecho y recién ahora empieza a usar "porciones a elección".
 *
 * Autorización en tres capas, ninguna en la UI:
 *  1. `requireCoachSession`-equivalente: sesión propia (el `coachId` del cliente se compara
 *     contra el usuario autenticado, nunca se confía). ESTA capa vive acá.
 *  2. `.eq('coach_id', userId)` en el UPDATE: solo alimentos propios. Los globales del
 *     catálogo (coach_id NULL) NO se pueden clasificar desde acá.
 *  3. RLS `foods_update_own` + el grant column-level de las 3 columnas `exchange_*` para
 *     `authenticated` (verificado en LIVE — P-B no necesita migración).
 *
 * La ESCRITURA en sí (capas 2 y 3, verificación del grupo visible y doble escritura de la lista)
 * se mudó a `setOwnFoodExchangeEquivalence` (T2.3 F6.4) para que el tab Alimentos de RN clasifique
 * por el MISMO camino vía `POST /api/mobile/nutrition-v2/coach/mutate`. Acá queda solo lo que es
 * de esta superficie: sesión, normalización del payload y `revalidatePath`.
 *
 * Efecto: CERO cambios de read models. `exchangeFoods` y la cobertura derivada leen `foods`
 * vivo. Ojo con el cap del read model — la vista corta en `rn <= 40` equivalencias por grupo
 * ordenadas por nombre (`20260718150000_nutrition_portions_read_models.sql:364`), así que el
 * alimento 41 de un grupo queda clasificado pero no aparece en el sheet del alumno hasta que
 * se priorice a los propios (F2 del SPEC).
 */

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/lib/database.types'
import {
  foodExchangeEquivalenceIssue,
  foodExchangeEquivalenceShape,
  normalizeFoodExchangeEquivalence,
  refineFoodExchangeEquivalence,
} from '@eva/schemas/nutrition-exchanges'
import { setOwnFoodExchangeEquivalence } from '@/services/nutrition-exchanges/exchange-lists.service'

const InputSchema = z
  .object({
    foodId: z.guid('Alimento inválido'),
    ...foodExchangeEquivalenceShape,
  })
  .superRefine(refineFoodExchangeEquivalence)

export type FoodEquivalenceActionResult = { success: true } | { success: false; error: string }

export async function setFoodExchangeEquivalenceAction(input: unknown): Promise<FoodEquivalenceActionResult> {
  const parsed = InputSchema.safeParse(input)
  if (!parsed.success) {
    const issue = foodExchangeEquivalenceIssue(
      (input ?? {}) as Parameters<typeof foodExchangeEquivalenceIssue>[0]
    )
    return { success: false, error: issue?.message ?? parsed.error.issues[0]?.message ?? 'Revisa los datos.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'No autorizado.' }

  // El dueño de la escritura sale del ACTOR (`user.id`), jamás del payload, y el cliente que
  // recibe el servicio es el RLS de esta sesión — nunca service_role.
  // El cast es el mismo que usan las demás actions de intercambios: el cliente SSR y el tipo
  // `SupabaseClient<Database>` del servicio difieren solo en genéricos de schema.
  const result = await setOwnFoodExchangeEquivalence(supabase as unknown as SupabaseClient<Database>, {
    actorCoachId: user.id,
    foodId: parsed.data.foodId,
    ...normalizeFoodExchangeEquivalence(parsed.data),
  })
  if (!result.ok) return { success: false, error: result.error }

  // T2.3 F5: `/coach/foods` dejó de existir (hoy solo redirige); la superficie propia es el hub.
  revalidatePath('/coach/nutrition-v2')
  revalidatePath('/coach/nutrition-plans')
  return { success: true }
}
