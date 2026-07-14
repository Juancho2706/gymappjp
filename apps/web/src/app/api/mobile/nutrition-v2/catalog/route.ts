import { NextRequest } from 'next/server'
import { z } from 'zod'
import {
  FoodBarcodeLookupReadModelSchema,
  FoodCatalogSearchReadModelSchema,
  MissingFoodBarcodeReportSchema,
} from '@eva/nutrition-v2'
import {
  gateNutritionV2Api,
  jsonNoStore,
  logNutritionV2Api,
  rpcErrorResponse,
} from '../_shared'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export async function GET(request: NextRequest) {
  const startedAt = Date.now()
  const route = 'mobile.nutrition-v2.catalog'
  const requestedSurface = request.nextUrl.searchParams.get('surface') === 'coach'
    ? 'mobileCoach'
    : 'mobileStudent'
  const gate = await gateNutritionV2Api(request, { surface: requestedSurface })

  if (!gate.ok) {
    logNutritionV2Api({ route, startedAt, status: gate.response.status })
    return gate.response
  }

  const operation = request.nextUrl.searchParams.get('operation') ?? 'search'
  let rpcName: string
  let args: Record<string, unknown>
  let parse: (value: unknown) => unknown

  if (operation === 'search') {
    const query = request.nextUrl.searchParams.get('query') ?? ''
    const countryCode = (request.nextUrl.searchParams.get('countryCode') ?? 'CL').toUpperCase()
    const cursorScoreRaw = request.nextUrl.searchParams.get('cursorScore')
    const cursorName = request.nextUrl.searchParams.get('cursorName')
    const cursorId = request.nextUrl.searchParams.get('cursorId')
    const pageSizeRaw = Number(request.nextUrl.searchParams.get('pageSize') ?? 25)
    const pageSize = Number.isFinite(pageSizeRaw)
      ? Math.min(50, Math.max(1, Math.trunc(pageSizeRaw)))
      : 25

    if (countryCode.length !== 2 || (cursorId && !UUID.test(cursorId))) {
      return jsonNoStore({ error: 'Parámetros de búsqueda inválidos.', code: 'INVALID_SEARCH_INPUT' }, 400)
    }

    const cursorScore = cursorScoreRaw == null || cursorScoreRaw === ''
      ? null
      : Number(cursorScoreRaw)
    if (cursorScore !== null && !Number.isFinite(cursorScore)) {
      return jsonNoStore({ error: 'Cursor inválido.', code: 'INVALID_CURSOR' }, 400)
    }

    rpcName = 'search_food_catalog_v2'
    args = {
      p_query: query,
      p_country_code: countryCode,
      p_cursor_score: cursorScore,
      p_cursor_name: cursorName || null,
      p_cursor_id: cursorId || null,
      p_page_size: pageSize,
    }
    parse = (value) => FoodCatalogSearchReadModelSchema.parse(value)
  } else if (operation === 'gtin') {
    const gtin = request.nextUrl.searchParams.get('gtin') ?? ''
    const countryCode = (request.nextUrl.searchParams.get('countryCode') ?? 'CL').toUpperCase()
    rpcName = 'lookup_food_by_gtin_v2'
    args = { p_gtin: gtin, p_country_code: countryCode }
    parse = (value) => FoodBarcodeLookupReadModelSchema.parse(value)
  } else {
    return jsonNoStore({ error: 'Operación inválida.', code: 'INVALID_OPERATION' }, 400)
  }

  const { data, error } = await gate.rpc.rpc(rpcName, args)
  if (error) {
    const response = rpcErrorResponse(error, 'FOOD_CATALOG_V2_READ_FAILED')
    logNutritionV2Api({
      route,
      startedAt,
      status: response.status,
      errorCode: error.code || 'FOOD_CATALOG_V2_READ_FAILED',
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
    return jsonNoStore({ error: 'Contrato de catálogo inválido.', code: 'CATALOG_CONTRACT_MISMATCH' }, 500)
  }
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now()
  const route = 'mobile.nutrition-v2.catalog.report'
  const gate = await gateNutritionV2Api(request, {
    surface: 'mobileStudent',
    mutation: true,
  })

  if (!gate.ok) {
    logNutritionV2Api({ route, startedAt, status: gate.response.status })
    return gate.response
  }

  const body = await request.json().catch(() => null)
  const parsed = MissingFoodBarcodeReportSchema.safeParse(body)
  if (!parsed.success || !gate.clientId || parsed.data.clientId !== gate.clientId) {
    return jsonNoStore({ error: 'Reporte inválido.', code: 'INVALID_REPORT' }, 400)
  }

  const { data, error } = await gate.rpc.rpc('report_missing_food_gtin_v2', {
    p_client_id: parsed.data.clientId,
    p_gtin: parsed.data.gtin,
    p_country_code: parsed.data.countryCode.toUpperCase(),
    p_captured_name: parsed.data.capturedName,
    p_captured_brand: parsed.data.capturedBrand,
    p_package_photo_path: parsed.data.packagePhotoPath,
    p_source: parsed.data.source,
    p_idempotency_key: parsed.data.idempotencyKey,
  })

  if (error) return rpcErrorResponse(error, 'FOOD_CATALOG_V2_REPORT_FAILED')
  const id = z.string().uuid().safeParse(data)
  if (!id.success) {
    return jsonNoStore({ error: 'Respuesta de reporte inválida.', code: 'INVALID_REPORT_RESPONSE' }, 500)
  }
  return jsonNoStore({ ok: true, id: id.data }, 201)
}
