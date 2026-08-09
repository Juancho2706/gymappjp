'use server'

/**
 * Clasificar un alimento PROPIO ya existente dentro de un grupo de porciones
 * (specs/nutrition-custom-portions §P-B, camino de UPDATE). El alta ya puede llevar la
 * equivalencia en el mismo formulario; esto cubre el caso real del coach que tiene su
 * catálogo hecho y recién ahora empieza a usar "porciones a elección".
 *
 * Autorización en tres capas, ninguna en la UI:
 *  1. `requireCoachSession`-equivalente: sesión propia (el `coachId` del cliente se compara
 *     contra el usuario autenticado, nunca se confía).
 *  2. `.eq('coach_id', userId)` en el UPDATE: solo alimentos propios. Los globales del
 *     catálogo (coach_id NULL) NO se pueden clasificar desde acá.
 *  3. RLS `foods_update_own` + el grant column-level de las 3 columnas `exchange_*` para
 *     `authenticated` (verificado en LIVE — P-B no necesita migración).
 *
 * El grupo se verifica VISIBLE para el coach antes de escribir: el FK de
 * `foods.exchange_group_id` acepta cualquier grupo existente, incluido el custom de otro
 * coach.
 *
 * Efecto: CERO cambios de read models. `exchangeFoods` y la cobertura derivada leen `foods`
 * vivo. Ojo con el cap del read model — la vista corta en `rn <= 40` equivalencias por grupo
 * ordenadas por nombre (`20260718150000_nutrition_portions_read_models.sql:364`), así que el
 * alimento 41 de un grupo queda clasificado pero no aparece en el sheet del alumno hasta que
 * se priorice a los propios (F2 del SPEC).
 */

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  foodExchangeEquivalenceIssue,
  foodExchangeEquivalenceShape,
  normalizeFoodExchangeEquivalence,
  refineFoodExchangeEquivalence,
} from '@eva/schemas/nutrition-exchanges'
import { isExchangeGroupVisibleToActor } from '@/services/nutrition-exchanges/nutrition-exchanges.service'
import { syncFoodExchangeListRow } from '@/services/nutrition-exchanges/exchange-lists.service'

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

  const equivalence = normalizeFoodExchangeEquivalence(parsed.data)
  if (equivalence.exchangeGroupId) {
    const visible = await isExchangeGroupVisibleToActor(supabase, equivalence.exchangeGroupId)
    if (!visible) return { success: false, error: 'Ese grupo de porciones ya no está disponible.' }
  }

  const { data, error } = await supabase
    .from('foods')
    .update({
      exchange_group_id: equivalence.exchangeGroupId,
      exchange_portion_grams: equivalence.exchangePortionGrams,
      exchange_portion_label: equivalence.exchangePortionLabel,
    })
    .eq('id', parsed.data.foodId)
    .eq('coach_id', user.id)
    .select('id')
    .maybeSingle()

  if (error) {
    if (error.code === '42501') {
      return { success: false, error: 'No tienes permiso para editar este alimento.' }
    }
    return { success: false, error: 'No pudimos guardar la equivalencia. Intenta nuevamente.' }
  }
  if (!data) return { success: false, error: 'Ese alimento no es tuyo o ya no existe.' }

  // Doble escritura (F2): la misma clasificación como fila propia de `exchange_group_foods`.
  // Reclasificar de grupo borra la fila vieja, así el alumno no ve el alimento en dos grupos.
  await syncFoodExchangeListRow(supabase, {
    actorCoachId: user.id,
    foodId: parsed.data.foodId,
    exchangeGroupId: equivalence.exchangeGroupId,
    portionGrams: equivalence.exchangePortionGrams,
    portionLabel: equivalence.exchangePortionLabel,
  })

  // T2.3 F5: `/coach/foods` dejó de existir (hoy solo redirige); la superficie propia es el hub.
  revalidatePath('/coach/nutrition-v2')
  revalidatePath('/coach/nutrition-plans')
  return { success: true }
}
