import { NextRequest } from 'next/server'
import {
  NutritionClientDetailReadModelSchema,
  NutritionCoachHubPageReadModelSchema,
  NutritionV2CoachScopeSchema,
} from '@eva/nutrition-v2'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  gateNutritionV2Api,
  jsonNoStore,
  logNutritionV2Api,
  rpcErrorResponse,
} from '../_shared'
import {
  filterHistoryDaysToBaseWindow,
  hasNutritionProV2,
} from '@/app/coach/nutrition-v2/_lib/nutrition-pro'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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
  const route = 'mobile.nutrition-v2.coach'
  const gate = await gateNutritionV2Api(request, { surface: 'mobileCoach' })

  if (!gate.ok) {
    logNutritionV2Api({ route, startedAt, status: gate.response.status })
    return gate.response
  }

  // The client sends the ACTIVE coach workspace as query params. Membership is NOT trusted from the
  // wire: the scoped RPC (get_nutrition_*_scoped_v2) re-validates it server-side against auth.uid()
  // via private.nutrition_v2_client_matches_workspace. Here we only enforce the shape (fail-closed:
  // unknown scopeType / mismatched team/org ids => 400, never an unscoped read).
  const scopeResult = NutritionV2CoachScopeSchema.safeParse({
    scopeType: request.nextUrl.searchParams.get('scopeType'),
    teamId: request.nextUrl.searchParams.get('teamId') || null,
    orgId: request.nextUrl.searchParams.get('orgId') || null,
  })
  if (!scopeResult.success) {
    logNutritionV2Api({ route, startedAt, status: 400, errorCode: 'INVALID_WORKSPACE_SCOPE' })
    return jsonNoStore({ error: 'Workspace inválido.', code: 'INVALID_WORKSPACE_SCOPE' }, 400)
  }
  const scope = scopeResult.data

  const view = request.nextUrl.searchParams.get('view') ?? 'hub'
  let rpcName: string
  let args: Record<string, unknown>
  let parse: (data: unknown) => unknown
  let detailDate = ''

  if (view === 'hub') {
    const cursorUpdatedAt = request.nextUrl.searchParams.get('cursorUpdatedAt')
    const cursorClientId = request.nextUrl.searchParams.get('cursorClientId')
    const rawPageSize = Number(request.nextUrl.searchParams.get('pageSize') ?? 25)
    const pageSize = Number.isFinite(rawPageSize)
      ? Math.min(50, Math.max(1, Math.trunc(rawPageSize)))
      : 25

    if (cursorUpdatedAt && Number.isNaN(Date.parse(cursorUpdatedAt))) {
      logNutritionV2Api({ route, startedAt, status: 400, errorCode: 'INVALID_CURSOR_TIME' })
      return jsonNoStore({ error: 'Cursor inválido.', code: 'INVALID_CURSOR_TIME' }, 400)
    }
    if (cursorClientId && !UUID.test(cursorClientId)) {
      logNutritionV2Api({ route, startedAt, status: 400, errorCode: 'INVALID_CURSOR_CLIENT' })
      return jsonNoStore({ error: 'Cursor inválido.', code: 'INVALID_CURSOR_CLIENT' }, 400)
    }

    rpcName = 'get_nutrition_coach_hub_scoped_v2'
    args = {
      p_scope_type: scope.scopeType,
      p_team_id: scope.teamId,
      p_org_id: scope.orgId,
      p_cursor_updated_at: cursorUpdatedAt || null,
      p_cursor_client_id: cursorClientId || null,
      p_page_size: pageSize,
    }
    parse = (data) => NutritionCoachHubPageReadModelSchema.parse(data)
  } else if (view === 'client') {
    const clientId = request.nextUrl.searchParams.get('clientId') ?? ''
    const date = request.nextUrl.searchParams.get('date') ?? todayInSantiago()
    const timezone = request.nextUrl.searchParams.get('timezone') ?? 'America/Santiago'

    if (!UUID.test(clientId) || !ISO_DATE.test(date) || timezone.length < 1 || timezone.length > 80) {
      logNutritionV2Api({ route, startedAt, status: 400, errorCode: 'INVALID_CLIENT_DETAIL_INPUT' })
      return jsonNoStore(
        { error: 'Alumno, fecha o zona horaria inválida.', code: 'INVALID_CLIENT_DETAIL_INPUT' },
        400,
      )
    }

    detailDate = date
    rpcName = 'get_nutrition_client_detail_scoped_v2'
    args = {
      p_client_id: clientId,
      p_scope_type: scope.scopeType,
      p_team_id: scope.teamId,
      p_org_id: scope.orgId,
      p_local_date: date,
      p_timezone: timezone,
    }
    parse = (data) => NutritionClientDetailReadModelSchema.parse(data)
  } else {
    logNutritionV2Api({ route, startedAt, status: 400, errorCode: 'INVALID_VIEW' })
    return jsonNoStore({ error: 'Vista inválida.', code: 'INVALID_VIEW' }, 400)
  }

  const { data, error } = await gate.rpc.rpc(rpcName, args)
  if (error) {
    const response = rpcErrorResponse(error, 'NUTRITION_V2_COACH_READ_FAILED')
    logNutritionV2Api({
      route,
      startedAt,
      status: response.status,
      errorCode: error.code || 'NUTRITION_V2_COACH_READ_FAILED',
      rolloutReason: gate.rolloutReason,
    })
    return response
  }

  try {
    let payload = parse(data)

    // Gate del addon Nutricion Pro para la ficha del coach en movil: sin addon, el historial
    // del alumno se limita a la ventana BASE (~30 dias). Mismo corte server-side post-fetch que
    // la ficha web (los RPC no aceptan limite temporal). El gate resuelve el coach; para el
    // scope de pool usamos el teamId del scope ya validado (fail-closed via RLS al leer modulos).
    if (view === 'client') {
      const proEnabled = await hasNutritionProV2(gate.rpc as unknown as SupabaseClient, {
        coachId: gate.coachId,
        teamId: scope.scopeType === 'team' ? scope.teamId : null,
      })
      if (!proEnabled) {
        const detail = payload as { recentDays?: Array<{ localDate: string }> }
        if (Array.isArray(detail.recentDays)) {
          payload = {
            ...detail,
            recentDays: filterHistoryDaysToBaseWindow(detail.recentDays, detailDate),
          }
        }
      }
    }

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
