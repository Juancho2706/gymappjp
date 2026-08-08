import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import type { CoachFoodOverrideValues } from '@eva/nutrition-v2'
import {
  deleteCoachFoodOverride,
  findCoachFoodOverride,
  findCoachFoodOverridesByFoodIds,
  upsertCoachFoodOverride,
  type CoachFoodOverrideWriteResult,
} from '@/infrastructure/db/coach-food-overrides.repository'

/**
 * Servicio de overrides de macros por coach (T2.1, specs/nutrition-food-overrides).
 *
 * Regla que gobierna todo el archivo: **el dueño se deriva del actor**, jamas del payload. La
 * firma pide `coachId` explicito y el unico caller autorizado (la action) lo llena con el
 * `userId` de la sesion. El techo de autorizacion vive en el caller (`authorizeCoach`); aca no
 * se re-implementa, se asume y se documenta.
 *
 * Limites que la UI (T2.2) debera decir en voz alta: corregir un alimento NO reescribe los
 * planes ya publicados — sus macros quedaron congelados al publicar y propagarlos exige
 * republicar. El historial del alumno es inmutable por diseño.
 */

type DB = SupabaseClient<Database>

export type CoachFoodOverrideActor = { coachId: string }

/** El override vigente del coach para un alimento (lo que prellena el sheet de edicion). */
export async function getCoachFoodOverride(
  db: DB,
  actor: CoachFoodOverrideActor,
  foodId: string,
): Promise<CoachFoodOverrideValues | null> {
  return findCoachFoodOverride(db, { coachId: actor.coachId, foodId })
}

/** Los overrides del coach para un lote de alimentos (freeze y rehidratacion). */
export async function getCoachFoodOverridesFor(
  db: DB,
  actor: CoachFoodOverrideActor,
  foodIds: readonly string[],
): Promise<Map<string, CoachFoodOverrideValues>> {
  return findCoachFoodOverridesByFoodIds(db, { coachId: actor.coachId, foodIds })
}

/**
 * Guarda la correccion. Los cinco macros y la base viajan siempre completos: el merge es un
 * reemplazo total, y un override sin base declarada se congelaria con numeros equivocados.
 */
export async function saveCoachFoodOverride(
  db: DB,
  actor: CoachFoodOverrideActor,
  input: { foodId: string; values: CoachFoodOverrideValues },
): Promise<CoachFoodOverrideWriteResult> {
  return upsertCoachFoodOverride(db, {
    coachId: actor.coachId,
    foodId: input.foodId,
    values: input.values,
    createdBy: actor.coachId,
  })
}

/** Restaurar el original: borra la fila. Sin fila previa el resultado tambien es ok. */
export async function restoreCatalogFoodMacros(
  db: DB,
  actor: CoachFoodOverrideActor,
  foodId: string,
): Promise<CoachFoodOverrideWriteResult> {
  return deleteCoachFoodOverride(db, { coachId: actor.coachId, foodId })
}
