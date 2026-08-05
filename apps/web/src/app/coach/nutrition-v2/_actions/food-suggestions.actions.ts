'use server'

import { z } from 'zod'
import {
  CoachFoodSuggestionsReadModelSchema,
  type CoachFoodSuggestionsReadModel,
} from '@eva/nutrition-v2'
import { authorizeCoach, fail, zodFields, type ActionFailure } from './plan-persistence'

// Sugerencias PRE-BUSQUEDA del picker de alimentos V2 (una sola RPC, solo lectura):
//  - `coachTop`: lo que este coach mas prescribe (opcionalmente filtrado por el nombre de la
//    franja en pantalla, para que "Desayuno" no proponga lo del almuerzo),
//  - `clientRecent`: lo que el alumno realmente comio en los ultimos 90 dias,
//  - `clientFavorites`: sus favoritos declarados.
//
// Fail-closed: mismo gate que las acciones vecinas (`authorizeCoach` re-verifica sesion,
// rate limit y scope V2 del workspace activo). Con alumno se autoriza CON el clientId; sin
// alumno (builder de plantillas) la puerta es la sesion del coach y la RPC solo devuelve
// `coachTop`. El corte real de datos del alumno vive dentro de la RPC
// (`private.nutrition_v2_can_read_client`), no en esta capa.

const SuggestionsInputSchema = z.object({
  /** `null` = sin alumno en contexto (plantillas): solo frecuentes del coach. */
  clientId: z.string().uuid().nullable().default(null),
  /** Nombre de la franja en pantalla ("Desayuno"): filtra `coachTop` por igualdad ilike. */
  slotName: z.string().trim().max(120).nullable().default(null),
  limit: z.number().int().min(1).max(24).default(12),
})

type SuggestionsSuccess = { ok: true; suggestions: CoachFoodSuggestionsReadModel }

export async function getCoachFoodSuggestionsAction(
  input: unknown,
): Promise<SuggestionsSuccess | ActionFailure> {
  const parsed = SuggestionsInputSchema.safeParse(input ?? {})
  if (!parsed.success) {
    return fail('INVALID_PAYLOAD', 'Solicitud de sugerencias invalida.', zodFields(parsed.error))
  }

  // Cupo laxo de catalogo: son lecturas de exploracion, no escrituras del plan.
  const auth = await authorizeCoach(parsed.data.clientId, 'catalog-search')
  if (!auth.ok) return auth

  const res = await auth.db.rpc('get_coach_food_suggestions_v2', {
    p_client_id: parsed.data.clientId,
    p_slot_name: parsed.data.slotName,
    p_limit: parsed.data.limit,
  })
  // Lectura, no escritura: no se reusa `mapWriteError` (su copy habla de "guardar el plan").
  if (res.error) {
    if (res.error.code === '42501') {
      return fail('SCOPE_DENIED', 'No tienes permiso para ver estas sugerencias.')
    }
    return fail('SUGGESTIONS_READ_FAILED', 'No se pudieron cargar las sugerencias.')
  }

  const result = CoachFoodSuggestionsReadModelSchema.safeParse(res.data)
  if (!result.success) {
    return fail('SUGGESTIONS_CONTRACT_MISMATCH', 'Las sugerencias llegaron en un formato inesperado.')
  }

  return { ok: true, suggestions: result.data }
}
