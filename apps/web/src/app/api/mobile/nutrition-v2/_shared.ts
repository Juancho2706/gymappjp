import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServiceRoleClient } from '@/lib/supabase/admin-client'
import { verifyMobileBearer, isBlockedClientRow } from '@/lib/mobile-auth'
import { resolveNutritionDomainEnabled } from '@/services/feature-prefs.service'
import { resolveMobileCoachNutritionContext } from '@/services/mobile-nutrition-v2-workspace-context'
import type { NutritionV2CoachScope } from '@eva/nutrition-v2'

type NutritionV2Surface = 'mobileStudent' | 'mobileCoach'

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

/**
 * Gate unico de la API movil de Nutricion V2.
 *
 * Superficie COACH: el contexto se deriva del WORKSPACE que el llamador declara (`coachScope`,
 * validado de forma) y del alumno de la pantalla (`requestedClientId`). La fila `clients` del
 * propio coach se ignora: una persona que también sea alumno no contamina el workspace operado.
 * Nutrition V2 es canónica para standalone/Team; Enterprise se rechaza antes de tocar una RPC.
 */
export async function gateNutritionV2Api(
  request: NextRequest,
  options: {
    surface: NutritionV2Surface
    mutation?: boolean
    /** Workspace coach declarado por el cliente; su pertenencia se valida server-side. */
    coachScope?: NutritionV2CoachScope | null
    /** Alumno de la pantalla; se valida dentro del workspace declarado. */
    requestedClientId?: string | null
  },
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

  // Las mutaciones deben pasar por GoTrue: la verificación local de firma es suficiente para
  // lecturas de bajo riesgo, pero no observa revocaciones/bans recientes. Esto es especialmente
  // importante al archivar, porque un JWT emitido antes del ban no puede seguir escribiendo.
  if (options.mutation) {
    const { data, error } = await admin.auth.getUser(token)
    if (!error && data.user) userId = data.user.id
  } else {
    const verified = await verifyMobileBearer(token)
    if (verified.ok) userId = verified.userId
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

  const studentSurface = options.surface === 'mobileStudent'
  const coachSurface = options.surface === 'mobileCoach'

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

  if (studentSurface && client?.org_id) {
    return {
      ok: false,
      response: jsonNoStore(
        { error: 'Nutrition V2 is not available for this workspace.', code: 'NUTRITION_V2_WORKSPACE_UNSUPPORTED' },
        404,
      ),
    }
  }

  // Contexto de autorización. ALUMNO: sale de su propia fila `clients`. COACH: sale del
  // workspace declarado + el alumno validado, jamás de la fila `clients` del propio coach.
  let workspaceContext: { clientId: string | null; coachId: string | null; teamId: string | null; orgId: string | null }
  if (coachSurface) {
    if (options.coachScope) {
      const resolved = await resolveMobileCoachNutritionContext(
        admin,
        userId,
        options.coachScope,
        options.requestedClientId ?? null,
      )
      if (!resolved.ok) {
        return {
          ok: false,
          response: jsonNoStore(
            { error: 'Workspace no autorizado.', code: 'WORKSPACE_NOT_ALLOWED' },
            403,
          ),
        }
      }
      workspaceContext = resolved.context
    } else {
      workspaceContext = { clientId: null, coachId: userId, teamId: null, orgId: null }
    }
  } else {
    workspaceContext = {
      clientId: client?.id ?? null,
      coachId: studentSurface ? client?.coach_id ?? null : coach?.id ?? null,
      teamId: client?.team_id ?? null,
      orgId: client?.org_id ?? null,
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

  // El master switch funcional del alumno sigue separado del acceso técnico. El scope
  // proviene de la fila autenticada, nunca del body; el servicio conserva su fail-open
  // deliberado cuando FEATURE_PREFS está apagado/no disponible.
  if (studentSurface) {
    const domainEnabled = await resolveNutritionDomainEnabled(
      {
        coachId: client?.coach_id ?? '',
        clientId: client?.id ?? null,
        clientTeamId: client?.team_id ?? null,
        clientOrgId: client?.org_id ?? null,
      },
      userClient as never,
    )
    if (!domainEnabled) {
      return {
        ok: false,
        response: jsonNoStore(
          { error: 'Nutrition is disabled for this student.', code: 'NUTRITION_DOMAIN_DISABLED' },
          404,
        ),
      }
    }
  }

  return {
    ok: true,
    userId,
    // Superficie coach: los ids describen el WORKSPACE operado, no una eventual membresia de
    // alumno del propio coach.
    clientId: coachSurface ? workspaceContext.clientId : client?.id ?? null,
    coachId: coachSurface ? userId : client?.coach_id ?? null,
    teamId: workspaceContext.teamId,
    orgId: workspaceContext.orgId,
    rpc: userClient as unknown as NutritionV2RpcClient,
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
