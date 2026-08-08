'use server'

/**
 * Server actions de OVERRIDES DE MACROS del coach (T2.1, specs/nutrition-food-overrides):
 * corregir los macros de un alimento del catalogo y fijarle una medida casera propia, sin
 * clonarlo.
 *
 * Autorizacion: `authorizeCoach` (sesion + rate limit de escritura + workspace V2 activo), el
 * mismo gate que el resto del builder. La RLS `cfo_*` es la segunda capa y el techo real: la
 * escritura corre con el cliente de la sesion, JAMAS con service role, y `cfo_insert_own` exige
 * ademas que el coach PUEDA LEER el alimento (sin eso, un override sobre el alimento privado de
 * otro coach confirmaria su existencia por el error del unique).
 *
 * El dueño del override no viaja en el payload: lo pone `userId` de la sesion.
 *
 * Sin gate Pro ni de modulo, igual que los grupos de porciones propios: corregir un alimento
 * mal cargado es higiene del catalogo, no una funcion avanzada.
 */

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { CoachFoodOverrideInputSchema } from '@eva/nutrition-v2'
import {
  restoreCatalogFoodMacros,
  saveCoachFoodOverride,
} from '@/services/nutrition-v2/coach-food-overrides.service'
import {
  authorizeCoach,
  fail,
  zodFields,
  type ActionFailure,
  type AuthorizedCoach,
} from '@/app/coach/nutrition-v2/_actions/plan-persistence'

export type FoodOverrideActionResult = { ok: true; foodId: string } | ActionFailure

function dbOf(auth: AuthorizedCoach): SupabaseClient<Database> {
  return auth.db as unknown as SupabaseClient<Database>
}

/**
 * `clientId` es una PISTA DE REVALIDACION, no autorizacion: el override es del coach y
 * `authorizeCoach` nunca lo miro. Acepta `null` porque el catalogo tambien se corrige desde el
 * builder de plantillas, donde no hay ficha de alumno en pantalla.
 */
const RevalidationHintSchema = z.object({
  clientId: z.string().uuid('Alumno invalido').nullable().default(null),
})

function revalidateCoachSurfaces(clientId: string | null) {
  if (clientId == null) return
  revalidatePath('/coach/nutrition-v2/' + clientId)
  revalidatePath('/coach/nutrition-v2/' + clientId + '/builder')
}

const SaveSchema = CoachFoodOverrideInputSchema.and(RevalidationHintSchema)
const RestoreSchema = z.object({ foodId: z.string().uuid('Alimento invalido') }).and(RevalidationHintSchema)

/** Crea o actualiza la correccion del coach sobre un alimento del catalogo. */
export async function saveFoodOverrideAction(input: unknown): Promise<FoodOverrideActionResult> {
  const parsed = SaveSchema.safeParse(input)
  if (!parsed.success) {
    return fail('VALIDATION', 'Revisa los macros del alimento.', zodFields(parsed.error))
  }

  const auth = await authorizeCoach(null)
  if (!auth.ok) return auth

  const result = await saveCoachFoodOverride(
    dbOf(auth),
    { coachId: auth.userId },
    { foodId: parsed.data.foodId, values: parsed.data.values },
  )
  if (!result.ok) {
    return fail('WRITE_FAILED', 'No se pudo guardar la correccion del alimento. Intenta nuevamente.')
  }

  revalidateCoachSurfaces(parsed.data.clientId)
  return { ok: true, foodId: parsed.data.foodId }
}

/** Devuelve el alimento a los macros del catalogo (borra la correccion del coach). */
export async function restoreFoodMacrosAction(input: unknown): Promise<FoodOverrideActionResult> {
  const parsed = RestoreSchema.safeParse(input)
  if (!parsed.success) {
    return fail('VALIDATION', 'Alimento invalido.', zodFields(parsed.error))
  }

  const auth = await authorizeCoach(null)
  if (!auth.ok) return auth

  const result = await restoreCatalogFoodMacros(dbOf(auth), { coachId: auth.userId }, parsed.data.foodId)
  if (!result.ok) {
    return fail('WRITE_FAILED', 'No se pudo restaurar el alimento. Intenta nuevamente.')
  }

  revalidateCoachSurfaces(parsed.data.clientId)
  return { ok: true, foodId: parsed.data.foodId }
}
