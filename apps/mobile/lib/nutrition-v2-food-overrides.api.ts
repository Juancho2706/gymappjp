import type { CoachFoodOverrideValues, NutritionV2CoachScope } from '@eva/nutrition-v2'
import { apiFetch } from './api'

/**
 * Correcciones de macros del coach desde RN (T2.2 — specs/nutrition-food-overrides).
 *
 * Espejo del camino web (server actions): mismo servicio detras, mismo dueño derivado del actor.
 * La app movil no tiene server actions, asi que escribe por `/api/mobile/nutrition-v2/
 * food-overrides`, igual que los grupos de porciones.
 */

export type FoodOverrideWriteResult = { ok: true } | { ok: false; error: string }

type MutationResult = { ok?: boolean; error?: string }

const GENERIC_ERROR = 'No pudimos guardar la correccion. Intenta nuevamente.'

async function write(
  scope: NutritionV2CoachScope,
  body: Record<string, unknown>,
  method: 'POST' | 'DELETE',
): Promise<FoodOverrideWriteResult> {
  try {
    const raw = await apiFetch<MutationResult>('/api/mobile/nutrition-v2/food-overrides', {
      authenticated: true,
      method,
      body: { ...body, workspace: scope },
    })
    return raw.ok === true ? { ok: true } : { ok: false, error: raw.error ?? GENERIC_ERROR }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : GENERIC_ERROR }
  }
}

/** Crea o actualiza la correccion del coach sobre un alimento del catalogo. */
export async function saveNutritionV2FoodOverride(
  scope: NutritionV2CoachScope,
  input: { foodId: string; values: CoachFoodOverrideValues },
): Promise<FoodOverrideWriteResult> {
  return write(scope, { foodId: input.foodId, values: input.values }, 'POST')
}

/** Devuelve el alimento a los macros del catalogo. Sin correccion previa tambien responde ok. */
export async function restoreNutritionV2FoodMacros(
  scope: NutritionV2CoachScope,
  foodId: string,
): Promise<FoodOverrideWriteResult> {
  return write(scope, { foodId }, 'DELETE')
}
