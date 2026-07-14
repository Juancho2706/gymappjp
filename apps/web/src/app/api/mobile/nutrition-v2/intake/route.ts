import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  NutritionIntakeCorrectionSchema,
  NutritionIntakeMutationSchema,
} from '@eva/nutrition-v2'
import {
  gateNutritionV2Api,
  jsonNoStore,
  logNutritionV2Api,
  rpcErrorResponse,
} from '../_shared'

const ResponseIdSchema = z.string().uuid()

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  const route = 'mobile.nutrition-v2.intake'
  const gate = await gateNutritionV2Api(request, {
    surface: 'mobileStudent',
    mutation: true,
  })

  if (!gate.ok) {
    logNutritionV2Api({ route, startedAt, status: gate.response.status })
    return gate.response
  }

  const body = await request.json().catch(() => null)
  const action = body?.action

  if (action !== 'record' && action !== 'correct') {
    logNutritionV2Api({ route, startedAt, status: 400, errorCode: 'INVALID_ACTION' })
    return jsonNoStore({ error: 'Acción inválida.', code: 'INVALID_ACTION' }, 400)
  }

  const parsed = action === 'record'
    ? NutritionIntakeMutationSchema.safeParse(body?.payload)
    : NutritionIntakeCorrectionSchema.safeParse(body?.payload)

  if (!parsed.success) {
    logNutritionV2Api({ route, startedAt, status: 400, errorCode: 'INVALID_PAYLOAD' })
    return jsonNoStore(
      {
        error: 'Datos de consumo inválidos.',
        code: 'INVALID_PAYLOAD',
        fields: parsed.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      },
      400,
    )
  }

  const payload = parsed.data
  if (!gate.clientId || payload.clientId !== gate.clientId) {
    logNutritionV2Api({ route, startedAt, status: 403, errorCode: 'CLIENT_SCOPE_MISMATCH' })
    return jsonNoStore(
      { error: 'El registro no pertenece a este alumno.', code: 'CLIENT_SCOPE_MISMATCH' },
      403,
    )
  }

  const commonArgs = {
    p_client_id: payload.clientId,
    p_local_date: payload.localDate,
    p_occurred_at: payload.occurredAt,
    p_timezone: payload.timezone,
    p_food_id: payload.foodId,
    p_custom_name: payload.customName,
    p_quantity: payload.quantity,
    p_unit: payload.unit,
    p_meal_slot: payload.mealSlot,
    p_source: payload.source,
    p_capture_method: payload.captureMethod,
    p_plan_version_id: payload.planVersionId,
    p_prescription_item_id: payload.prescriptionItemId,
    p_idempotency_key: payload.idempotencyKey,
    p_note: payload.note,
    p_snapshot: payload.snapshot,
  }

  const rpcName = action === 'record'
    ? 'record_nutrition_intake_v2'
    : 'correct_nutrition_intake_v2'

  const args = action === 'record'
    ? commonArgs
    : {
        p_corrects_entry_id: payload.correctsEntryId,
        p_correction_reason: payload.correctionReason,
        ...commonArgs,
      }

  const { data, error } = await gate.rpc.rpc(rpcName, args)
  if (error) {
    const response = rpcErrorResponse(error, 'NUTRITION_V2_INTAKE_FAILED')
    logNutritionV2Api({
      route,
      startedAt,
      status: response.status,
      errorCode: error.code || 'NUTRITION_V2_INTAKE_FAILED',
      rolloutReason: gate.rolloutReason,
    })
    return response
  }

  const id = ResponseIdSchema.safeParse(data)
  if (!id.success) {
    logNutritionV2Api({
      route,
      startedAt,
      status: 500,
      errorCode: 'INVALID_RPC_RESPONSE',
      rolloutReason: gate.rolloutReason,
    })
    return jsonNoStore(
      { error: 'Respuesta de escritura inválida.', code: 'INVALID_RPC_RESPONSE' },
      500,
    )
  }

  const responsePayload = { ok: true, id: id.data, action }
  const status = action === 'record' ? 201 : 200
  logNutritionV2Api({
    route,
    startedAt,
    status,
    payload: responsePayload,
    rolloutReason: gate.rolloutReason,
  })
  return jsonNoStore(responsePayload, status)
}
