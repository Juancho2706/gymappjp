import { NextRequest } from 'next/server'
import {
  NutritionHistoryPageReadModelSchema,
  NutritionPlanReadModelSchema,
  NutritionTodayReadModelSchema,
} from '@eva/nutrition-v2'
import {
  gateNutritionV2Api,
  jsonNoStore,
  logNutritionV2Api,
  rpcErrorResponse,
} from '../_shared'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function todayInSantiago(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now()
  const route = 'mobile.nutrition-v2.read'
  const gate = await gateNutritionV2Api(request, { surface: 'mobileStudent' })

  if (!gate.ok) {
    logNutritionV2Api({ route, startedAt, status: gate.response.status })
    return gate.response
  }

  const clientId = gate.clientId
  if (!clientId) {
    logNutritionV2Api({ route, startedAt, status: 403, errorCode: 'CLIENT_REQUIRED' })
    return jsonNoStore({ error: 'Client required', code: 'CLIENT_REQUIRED' }, 403)
  }

  const view = request.nextUrl.searchParams.get('view') ?? 'today'
  const date = request.nextUrl.searchParams.get('date') ?? todayInSantiago()
  const timezone = request.nextUrl.searchParams.get('timezone') ?? 'America/Santiago'

  if (!ISO_DATE.test(date) || timezone.length < 1 || timezone.length > 80) {
    logNutritionV2Api({ route, startedAt, status: 400, errorCode: 'INVALID_DATE_OR_TIMEZONE' })
    return jsonNoStore(
      { error: 'Fecha o zona horaria inválida.', code: 'INVALID_DATE_OR_TIMEZONE' },
      400,
    )
  }

  let rpcName: string
  let args: Record<string, unknown>
  let parse: (data: unknown) => unknown

  if (view === 'today') {
    rpcName = 'get_nutrition_today_v2'
    args = { p_client_id: clientId, p_local_date: date, p_timezone: timezone }
    parse = (data) => NutritionTodayReadModelSchema.parse(data)
  } else if (view === 'plan') {
    rpcName = 'get_nutrition_plan_read_v2'
    args = { p_client_id: clientId, p_as_of_date: date, p_timezone: timezone }
    parse = (data) => NutritionPlanReadModelSchema.parse(data)
  } else if (view === 'history') {
    const before = request.nextUrl.searchParams.get('before')
    const rawPageSize = Number(request.nextUrl.searchParams.get('pageSize') ?? 14)
    const pageSize = Number.isFinite(rawPageSize)
      ? Math.min(31, Math.max(1, Math.trunc(rawPageSize)))
      : 14

    if (before && !ISO_DATE.test(before)) {
      logNutritionV2Api({ route, startedAt, status: 400, errorCode: 'INVALID_CURSOR' })
      return jsonNoStore({ error: 'Cursor inválido.', code: 'INVALID_CURSOR' }, 400)
    }

    rpcName = 'get_nutrition_history_page_v2'
    args = { p_client_id: clientId, p_before: before || null, p_page_size: pageSize }
    parse = (data) => NutritionHistoryPageReadModelSchema.parse(data)
  } else {
    logNutritionV2Api({ route, startedAt, status: 400, errorCode: 'INVALID_VIEW' })
    return jsonNoStore({ error: 'Vista inválida.', code: 'INVALID_VIEW' }, 400)
  }

  const { data, error } = await gate.rpc.rpc(rpcName, args)
  if (error) {
    const response = rpcErrorResponse(error, 'NUTRITION_V2_READ_FAILED')
    logNutritionV2Api({
      route,
      startedAt,
      status: response.status,
      errorCode: error.code || 'NUTRITION_V2_READ_FAILED',
      rolloutReason: gate.rolloutReason,
    })
    return response
  }

  try {
    const payload = parse(data)
    logNutritionV2Api({
      route,
      startedAt,
      status: 200,
      payload,
      rolloutReason: gate.rolloutReason,
    })
    return jsonNoStore(payload)
  } catch {
    logNutritionV2Api({
      route,
      startedAt,
      status: 500,
      errorCode: 'READ_MODEL_CONTRACT_MISMATCH',
      rolloutReason: gate.rolloutReason,
    })
    return jsonNoStore(
      { error: 'Contrato de lectura inválido.', code: 'READ_MODEL_CONTRACT_MISMATCH' },
      500,
    )
  }
}
