import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  NUTRITION_V2_PERMISSION_DENIED_CODE,
  NutritionIntakeCorrectionSchema,
  NutritionIntakeMutationSchema,
  NutritionIntakeVoidSchema,
  isNutritionV2PermissionDenied,
  type NutritionIntakeMutation,
} from '@eva/nutrition-v2'
import {
  gateNutritionV2Api,
  jsonNoStore,
  logNutritionV2Api,
  rpcErrorResponse,
  type NutritionV2ApiGate,
} from '../_shared'
import {
  evaluateCorrectPermission,
  evaluateRecordPermission,
  resolveStudentIntakePermissions,
  type StudentIntakePermissionDenial,
} from '@/services/nutrition-v2-student-permissions.service'
import { jsonRateLimited, rateLimitNutritionIntake } from '@/lib/rate-limit'

const ResponseIdSchema = z.string().uuid()

/**
 * `void` (NUT-010, opción A) llama a la RPC terminal `void_nutrition_intake_v2`. `correct` se
 * conserva INTACTO al menos un ciclo de release: la cola offline de RN puede tener retiros
 * encolados con el payload viejo (corrección de contribución cero) y esos tienen que drenar.
 */
type SupportedAction = 'record' | 'correct' | 'void'

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
    // NUT-009: el guard de permisos del plan viaja con errcode 42501, igual que un scope denegado.
    // `rpcErrorResponse` los mezclaría (403 con `code: '42501'`) y la cola offline de RN no sabría
    // distinguirlos. Se responde con un código PROPIO y 403 — no reintentable por `isRetryable`,
    // así que la mutación se descarta en vez de gastar 8 intentos contra una regla del coach.
    if (isNutritionV2PermissionDenied(error.message)) {
      logNutritionV2Api({
        route,
        startedAt: input.startedAt,
        status: 403,
        errorCode: NUTRITION_V2_PERMISSION_DENIED_CODE,
      })
      return jsonNoStore(
        { error: 'Tu coach no permite este cambio en el plan de hoy.', code: NUTRITION_V2_PERMISSION_DENIED_CODE },
        403,
      )
    }
    const response = rpcErrorResponse(error, 'NUTRITION_V2_INTAKE_FAILED')
    logNutritionV2Api({
      route,
      startedAt: input.startedAt,
      status: response.status,
      errorCode: error.code || 'NUTRITION_V2_INTAKE_FAILED',
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
    })
    return jsonNoStore(
      { error: 'Respuesta de escritura inválida.', code: 'INVALID_RPC_RESPONSE' },
      500,
    )
  }

  const responsePayload = { ok: true as const, id: id.data, action: input.action }
  const status: number = input.action === 'record' ? 201 : 200
  logNutritionV2Api({
    route,
    startedAt: input.startedAt,
    status,
    payload: responsePayload,
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
    logNutritionV2Api({ route, startedAt, status: 429, errorCode: 'RATE_LIMIT' })
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
    // NUT-009: ESPEJO EXACTO de la server action web. La asimetría entre las dos superficies fue
    // justamente lo que dejó el permiso sin efecto; el evaluador es el mismo módulo compartido.
    const permissions = await resolveStudentIntakePermissions(gate.rpc, {
      clientId: parsed.data.clientId,
      localDate: parsed.data.localDate,
      prescriptionItemId: parsed.data.prescriptionItemId,
    })
    const denial = evaluateRecordPermission(permissions, parsed.data)
    if (denial) return permissionDenied(denial, startedAt)
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
    const permissions = await resolveStudentIntakePermissions(gate.rpc, {
      clientId: parsed.data.clientId,
      localDate: parsed.data.localDate,
      prescriptionItemId: parsed.data.prescriptionItemId,
    })
    const denial = evaluateCorrectPermission(permissions, parsed.data)
    if (denial) return permissionDenied(denial, startedAt)
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

  // Retiro TERMINAL (NUT-010, opción A). Payload mínimo: no hay snapshot ni cantidad que mandar.
  // Sin guard de permisos: retirar lo propio siempre se puede — bloquearlo dejaría al alumno con un
  // registro erróneo imborrable, que es peor que la regla que protegería.
  if (action === 'void') {
    const parsed = NutritionIntakeVoidSchema.safeParse(body?.payload)
    if (!parsed.success) return invalidPayload(parsed.error, startedAt)
    if (!gate.clientId || parsed.data.clientId !== gate.clientId) {
      return scopeMismatch(startedAt)
    }
    return executeMutation({
      gate,
      action: 'void',
      rpcName: 'void_nutrition_intake_v2',
      args: {
        p_client_id: parsed.data.clientId,
        p_entry_id: parsed.data.entryId,
        p_reason: parsed.data.reason,
        p_idempotency_key: parsed.data.idempotencyKey,
      },
      startedAt,
    })
  }

  logNutritionV2Api({ route, startedAt, status: 400, errorCode: 'INVALID_ACTION' })
  return jsonNoStore({ error: 'Acción inválida.', code: 'INVALID_ACTION' }, 400)
}

function permissionDenied(denial: StudentIntakePermissionDenial, startedAt: number) {
  logNutritionV2Api({
    route: 'mobile.nutrition-v2.intake',
    startedAt,
    status: 403,
    errorCode: denial.code,
  })
  return jsonNoStore({ error: denial.error, code: NUTRITION_V2_PERMISSION_DENIED_CODE }, 403)
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
