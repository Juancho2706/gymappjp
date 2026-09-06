import type { NutritionV2CoachScope } from '@eva/nutrition-v2'
import { ApiError, apiFetch } from './api'

/**
 * El coach RETIRA y CORRIGE registros del día de su alumno desde la app (W4.1 del tren «Cantidades
 * honestas», SPEC §7.1).
 *
 * Espejo del cliente de `nutrition-v2.api.ts`: RN NUNCA toca los RPC directo (NUT-005). Todo pasa
 * por `POST /api/mobile/nutrition-v2/coach/intake`, que re-verifica rollout, workspace y sesión
 * server-side y reusa la MISMA implementación que la server action web. Acá solo queda el
 * transporte y el mapeo de errores a un resultado tipado (nunca lanza: la pantalla ramifica por
 * `code`, igual que el resto de las escrituras del coach).
 */

const COACH_INTAKE_PATH = '/api/mobile/nutrition-v2/coach/intake'

/** Falla de red (el endpoint no respondió): honesta y distinta de un rechazo del servidor. */
const NETWORK_FAILURE_COPY = 'No pudimos conectar con el servidor. Revisa tu conexión e intenta de nuevo.'

export type CoachIntakeRNResult = { ok: true; id: string } | { ok: false; code: string; error: string }

async function postCoachIntake(body: Record<string, unknown>): Promise<CoachIntakeRNResult> {
  try {
    const data = await apiFetch<{ ok: true; id: string }>(COACH_INTAKE_PATH, {
      method: 'POST',
      authenticated: true,
      body,
    })
    return { ok: true, id: data.id }
  } catch (error) {
    if (error instanceof ApiError) {
      return { ok: false, code: error.code ?? 'WRITE_FAILED', error: error.message }
    }
    return { ok: false, code: 'NETWORK', error: NETWORK_FAILURE_COPY }
  }
}

/** Retira un registro del día del alumno. Idempotente por estado: repetirlo devuelve el mismo id. */
export async function voidIntakeAsCoachRN(input: {
  scope: NutritionV2CoachScope
  clientId: string
  entryId: string
}): Promise<CoachIntakeRNResult> {
  return postCoachIntake({
    op: 'void',
    workspace: input.scope,
    clientId: input.clientId,
    entryId: input.entryId,
  })
}

/** Corrige la CANTIDAD de un registro; la unidad, el alimento y el snapshot congelado no se tocan. */
export async function correctIntakeQuantityAsCoachRN(input: {
  scope: NutritionV2CoachScope
  clientId: string
  entryId: string
  quantity: number
}): Promise<CoachIntakeRNResult> {
  return postCoachIntake({
    op: 'correct-quantity',
    workspace: input.scope,
    clientId: input.clientId,
    entryId: input.entryId,
    quantity: input.quantity,
  })
}
