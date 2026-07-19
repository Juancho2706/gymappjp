import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { verifyMobileBearer, isBlockedClientRow } from '@/lib/mobile-auth'
import { resolveNutritionV2RolloutDecision } from '@/services/nutrition-v2-rollout.service'
import type { NutritionV2Surface } from '@eva/nutrition-v2'

type RpcError = { message: string; code?: string; details?: string | null }

export type NutritionV2RpcClient = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcError | null }>
}

export type NutritionV2ApiGate = {
  ok: true
  userId: string
  clientId: string | null
  coachId: string | null
  teamId: string | null
  orgId: string | null
  rpc: NutritionV2RpcClient
  rolloutReason: string
}

export type NutritionV2ApiGateError = {
  ok: false
  response: NextResponse
}

export function bearerToken(request: NextRequest): string | null {
  const value = request.headers.get('authorization') || request.headers.get('Authorization')
  if (!value?.startsWith('Bearer ')) return null
  return value.slice('Bearer '.length).trim() || null
}

export async function gateNutritionV2Api(
  request: NextRequest,
  options: { surface: NutritionV2Surface; mutation?: boolean },
): Promise<NutritionV2ApiGate | NutritionV2ApiGateError> {
  const token = bearerToken(request)
  if (!token) {
    return {
      ok: false,
      response: jsonNoStore({ error: 'Unauthorized', code: 'MISSING_TOKEN' }, 401),
    }
  }

  const admin = createServiceRoleClient()
  let userId: string | null = null

  if (options.mutation) {
    const { data, error } = await admin.auth.getUser(token)
    if (!error && data.user) userId = data.user.id
  } else {
    const result = await verifyMobileBearer(token)
    if (result.ok) userId = result.userId
  }

  if (!userId) {
    return {
      ok: false,
      response: jsonNoStore({ error: 'Unauthorized', code: 'INVALID_TOKEN' }, 401),
    }
  }

  const [coachResult, clientResult] = await Promise.all([
    admin.from('coaches').select('id').eq('id', userId).maybeSingle(),
    admin
      .from('clients')
      .select('id, coach_id, team_id, org_id, is_archived, is_active')
      .eq('id', userId)
      .maybeSingle(),
  ])

  const coach = coachResult.data
  const client = clientResult.data as {
    id: string
    coach_id: string | null
    team_id: string | null
    org_id: string | null
    is_archived: boolean | null
    is_active: boolean | null
  } | null

  const studentSurface = options.surface === 'mobileStudent' || options.surface === 'webStudent'
  const coachSurface = options.surface === 'mobileCoach' || options.surface === 'webCoach'

  if ((studentSurface && !client) || (coachSurface && !coach)) {
    return {
      ok: false,
      response: jsonNoStore({ error: 'Workspace not allowed', code: 'WORKSPACE_NOT_ALLOWED' }, 403),
    }
  }

  // Superficie ALUMNO: un alumno archivado/pausado queda SIN acceso a datos (el coach sí puede
  // seguir viendo los datos de sus archivados, por eso el chequeo es sólo en el camino de alumno).
  if (studentSurface && isBlockedClientRow(client)) {
    return {
      ok: false,
      response: jsonNoStore({ error: 'No autorizado', code: 'CLIENT_BLOCKED' }, 403),
    }
  }

  const decision = await resolveNutritionV2RolloutDecision({
    surface: options.surface,
    userId,
    clientId: client?.id ?? null,
    coachId: studentSurface ? client?.coach_id ?? null : coach?.id ?? null,
    teamId: client?.team_id ?? null,
    orgId: client?.org_id ?? null,
  })

  if (!decision.enabled) {
    return {
      ok: false,
      response: jsonNoStore(
        { error: 'Nutrition V2 is not enabled for this scope.', code: 'NUTRITION_V2_DISABLED' },
        404,
      ),
    }
  }

  const userClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  )

  return {
    ok: true,
    userId,
    clientId: client?.id ?? null,
    coachId: coach?.id ?? client?.coach_id ?? null,
    teamId: client?.team_id ?? null,
    orgId: client?.org_id ?? null,
    rpc: userClient as unknown as NutritionV2RpcClient,
    rolloutReason: decision.reason,
  }
}

export function jsonNoStore(payload: unknown, status = 200): NextResponse {
  return NextResponse.json(payload, {
    status,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      Vary: 'Authorization',
    },
  })
}

export function logNutritionV2Api(input: {
  route: string
  startedAt: number
  status: number
  payload?: unknown
  errorCode?: string
  rolloutReason?: string
}): void {
  let payloadBytes: number | null = null
  try {
    payloadBytes = input.payload == null
      ? 0
      : new TextEncoder().encode(JSON.stringify(input.payload)).byteLength
  } catch {
    payloadBytes = null
  }

  console.info('nutrition_v2_api', {
    route: input.route,
    durationMs: Math.max(0, Date.now() - input.startedAt),
    status: input.status,
    payloadBytes,
    errorCode: input.errorCode ?? null,
    rolloutReason: input.rolloutReason ?? null,
  })
}

export function rpcErrorResponse(error: RpcError, fallbackCode: string): NextResponse {
  const denied = error.code === '42501'
  const status = denied ? 403 : 500
  return jsonNoStore(
    {
      error: denied ? 'No autorizado para esta operación.' : 'No se pudo cargar Nutrición V2.',
      code: error.code || fallbackCode,
    },
    status,
  )
}
