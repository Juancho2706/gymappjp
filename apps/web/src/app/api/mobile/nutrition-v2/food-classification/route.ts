import { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/database.types'
import { gateNutritionV2Api, jsonNoStore, logNutritionV2Api } from '../_shared'
import { getFoodExchangeClassification } from '@/services/nutrition-exchanges/exchange-lists.service'

/**
 * Dónde está clasificado HOY un alimento para ESTE coach (T2.3 F6.4), para que el formulario de
 * clasificación del tab Alimentos de RN abra mostrando el estado real en vez de un formulario en
 * blanco — el mismo motivo por el que existe en la web (`loadFoodExchangeClassificationHubAction`).
 *
 * Sin esto RN reclasificaría a ciegas: el read model del catálogo (`FoodCatalogItem`) NO emite
 * nada de intercambios y ninguna otra lectura responde "en qué grupo está ESTE alimento" (todas
 * parten del grupo, y recorrer los ~10 grupos serían 10 round-trips al abrir un sheet).
 *
 * Es la MISMA función de servicio que usa la web (`getFoodExchangeClassification`): el móvil no
 * reimplementa la regla ni agrega una RPC. Autorización: gate móvil (rollout + JWT) como techo
 * comercial y la RLS de `foods` / `exchange_group_foods` como techo de datos; el dueño de la
 * lectura sale del ACTOR (`gate.coachId`), jamás del query string.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const ROUTE = 'mobile.nutrition-v2.food-classification'

export async function GET(request: NextRequest) {
  const startedAt = Date.now()
  const requestedSurface = request.nextUrl.searchParams.get('surface') === 'coach'
    ? 'mobileCoach'
    : 'mobileStudent'
  const gate = await gateNutritionV2Api(request, { surface: requestedSurface })

  if (!gate.ok) {
    logNutritionV2Api({ route: ROUTE, startedAt, status: gate.response.status })
    return gate.response
  }

  // Solo coach: el alumno no clasifica alimentos ni tiene lista propia. `requestedSurface` ya
  // gateó por JWT; esto rechaza pedir la lectura sin `?surface=coach` (mismo criterio que los
  // data paths del catálogo, F6.1).
  if (requestedSurface !== 'mobileCoach' || !gate.coachId) {
    logNutritionV2Api({ route: ROUTE, startedAt, status: 403, errorCode: 'COACH_ONLY' })
    return jsonNoStore({ error: 'Solo para coaches.', code: 'COACH_ONLY' }, 403)
  }

  const foodId = request.nextUrl.searchParams.get('foodId') ?? ''
  if (!UUID.test(foodId)) {
    logNutritionV2Api({ route: ROUTE, startedAt, status: 400, errorCode: 'INVALID_PAYLOAD' })
    return jsonNoStore({ error: 'Alimento inválido.', code: 'INVALID_PAYLOAD' }, 400)
  }

  const result = await getFoodExchangeClassification(
    gate.rpc as unknown as SupabaseClient<Database>,
    { actorCoachId: gate.coachId, foodId },
  )
  if (!result.success) {
    const status = result.code === 'SCOPE_DENIED' ? 403 : 500
    logNutritionV2Api({ route: ROUTE, startedAt, status, errorCode: result.code })
    return jsonNoStore({ error: result.error, code: result.code }, status)
  }

  const payload = { ok: true as const, classification: result.classification }
  logNutritionV2Api({ route: ROUTE, startedAt, status: 200, payload })
  return jsonNoStore(payload)
}
