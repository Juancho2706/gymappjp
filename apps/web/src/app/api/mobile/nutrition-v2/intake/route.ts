import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  NutritionIntakeCorrectionSchema,
  NutritionIntakeMutationSchema,
  type NutritionIntakeMutation,
} from '@eva/nutrition-v2'
import {
  gateNutritionV2Api,
  jsonNoStore,
  logNutritionV2Api,
  rpcErrorResponse,
  type NutritionV2ApiGate,
} from '../_shared'
import { jsonRateLimited, rateLimitNutritionIntake } from '@/lib/rate-limit'

const ResponseIdSchema = z.string().uuid()

type SupportedAction = 'record' | 'correct'

function commonRpcArgs(payload: NutritionIntakeMutation): Record<string, unknown> {
  return {
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
}

async function executeMutation(input: {
  gate: NutritionV2ApiGate
  action: SupportedAction
  rpcName: string
  args: Record<string, unknown>
  startedAt: number
}) {
  const route = 'mobile.nutrition-v2.intake'
  const { data, error } = await input.gate.rpc.rpc(input.rpcName, input.args)
  if (error) {
    const response = rpcErrorResponse(error, 'NUTRITION_V2_INTAKE_FAILED')
    logNutritionV2Api({
      route,
      startedAt: input.startedAt,
      status: response.status,
      errorCode: error.code || 'NUTRITION_V2_INTAKE_FAILED',
      rolloutReason: input.gate.rolloutReason,
    })
    return response
  }

  const id = ResponseIdSchema.safeParse(data)
  if (!id.success) {
    logNutritionV2Api({
      route,
      startedAt: input.startedAt,
      status: 500,
      errorCode: 'INVALID_RPC_RESPONSE',
      rolloutReason: input.gate.rolloutReason,
    })
    return jsonNoStore(
      { error: 'Respuesta de escritura inválida.', code: 'INVALID_RPC_RESPONSE' },
      500,
    )
  }

  const responsePayload = { ok: true as const, id: id.data, action: input.action }
  const status = input.action === 'record' ? 201 : 200
  logNutritionV2Api({
    route,
    startedAt: input.startedAt,
    status,
    payload: responsePayload,
    rolloutReason: input.gate.rolloutReason,
  })
  return jsonNoStore(responsePayload, status)
}

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

  const limited = await rateLimitNutritionIntake(gate.userId)
  if (!limited.ok) {
    logNutritionV2Api({ route, startedAt, status: 429, errorCode: 'RATE_LIMIT', rolloutReason: gate.rolloutReason })
    return jsonRateLimited(limited.retryAfter)
  }

  const body = await request.json().catch(() => null)
  const action = body?.action

  if (action === 'record') {
    const parsed = NutritionIntakeMutationSchema.safeParse(body?.payload)
    if (!parsed.success) return invalidPayload(parsed.error, startedAt)
    if (!gate.clientId || parsed.data.clientId !== gate.clientId) {
      return scopeMismatch(startedAt)
    }
    return executeMutation({
      gate,
      action: 'record',
      rpcName: 'record_nutrition_intake_v2',
      args: commonRpcArgs(parsed.data),
      startedAt,
    })
  }

  if (action === 'correct') {
    const parsed = NutritionIntakeCorrectionSchema.safeParse(body?.payload)
    if (!parsed.success) return invalidPayload(parsed.error, startedAt)
    if (!gate.clientId || parsed.data.clientId !== gate.clientId) {
      return scopeMismatch(startedAt)
    }
    return executeMutation({
      gate,
      action: 'correct',
      rpcName: 'correct_nutrition_intake_v2',
      args: {
        p_corrects_entry_id: parsed.data.correctsEntryId,
        p_correction_reason: parsed.data.correctionReason,
        ...commonRpcArgs(parsed.data),
      },
      startedAt,
    })
  }

  logNutritionV2Api({ route, startedAt, status: 400, errorCode: 'INVALID_ACTION' })
  return jsonNoStore({ error: 'Acción inválida.', code: 'INVALID_ACTION' }, 400)
}

function invalidPayload(error: z.ZodError, startedAt: number) {
  logNutritionV2Api({
    route: 'mobile.nutrition-v2.intake',
    startedAt,
    status: 400,
    errorCode: 'INVALID_PAYLOAD',
  })
  return jsonNoStore(
    {
      error: 'Datos de consumo inválidos.',
      code: 'INVALID_PAYLOAD',
      fields: error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    },
    400,
  )
}

function scopeMismatch(startedAt: number) {
  logNutritionV2Api({
    route: 'mobile.nutrition-v2.intake',
    startedAt,
    status: 403,
    errorCode: 'CLIENT_SCOPE_MISMATCH',
  })
  return jsonNoStore(
    { error: 'El registro no pertenece a este alumno.', code: 'CLIENT_SCOPE_MISMATCH' },
    403,
  )
}
