import 'server-only'

import { unstable_noStore as noStore } from 'next/cache'
import {
  NutritionClientDetailReadModelSchema,
  NutritionCoachHubPageReadModelSchema,
  NutritionHistoryPageReadModelSchema,
  NutritionPlanReadModelSchema,
  NutritionTodayReadModelSchema,
  type NutritionClientDetailReadModel,
  type NutritionCoachHubPageReadModel,
  type NutritionHistoryPageReadModel,
  type NutritionPlanReadModel,
  type NutritionTodayReadModel,
  type NutritionV2CoachScope,
} from '@eva/nutrition-v2'
import type { WorkspaceSummary } from '@/domain/auth/types'
import { createClient } from '@/lib/supabase/server'

type RpcClient = {
  rpc: (
    name: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>
}

async function rpcRead<T>(input: {
  name: string
  args: Record<string, unknown>
  parse: (value: unknown) => T
}): Promise<T> {
  noStore()
  const startedAt = Date.now()
  const client = await createClient()
  const { data, error } = await (client as unknown as RpcClient).rpc(input.name, input.args)

  if (error) {
    console.error('nutrition_v2_web_read', {
      rpc: input.name,
      durationMs: Date.now() - startedAt,
      ok: false,
      errorCode: error.code ?? 'RPC_ERROR',
    })
    throw new Error(`Nutrition V2 read failed: ${error.code ?? 'RPC_ERROR'}`)
  }

  const result = input.parse(data)
  console.info('nutrition_v2_web_read', {
    rpc: input.name,
    durationMs: Date.now() - startedAt,
    ok: true,
  })
  return result
}

export function getNutritionTodayV2ForWeb(input: {
  clientId: string
  date: string
  timezone?: string
}): Promise<NutritionTodayReadModel> {
  return rpcRead({
    name: 'get_nutrition_today_v2',
    args: {
      p_client_id: input.clientId,
      p_local_date: input.date,
      p_timezone: input.timezone ?? 'America/Santiago',
    },
    parse: (value) => NutritionTodayReadModelSchema.parse(value),
  })
}

export function getNutritionPlanV2ForWeb(input: {
  clientId: string
  date: string
  timezone?: string
}): Promise<NutritionPlanReadModel> {
  return rpcRead({
    name: 'get_nutrition_plan_read_v2',
    args: {
      p_client_id: input.clientId,
      p_as_of_date: input.date,
      p_timezone: input.timezone ?? 'America/Santiago',
    },
    parse: (value) => NutritionPlanReadModelSchema.parse(value),
  })
}

export function getNutritionHistoryV2ForWeb(input: {
  clientId: string
  before?: string | null
  pageSize?: number
}): Promise<NutritionHistoryPageReadModel> {
  return rpcRead({
    name: 'get_nutrition_history_page_v2',
    args: {
      p_client_id: input.clientId,
      p_before: input.before ?? null,
      p_page_size: input.pageSize ?? 14,
    },
    parse: (value) => NutritionHistoryPageReadModelSchema.parse(value),
  })
}

/**
 * Maps the RSC-resolved workspace (`getPreferredWorkspaceForRender`) to the professional read scope.
 * Fail-closed: any workspace that is not a coach pool (null, enterprise staff, a student workspace)
 * throws instead of degrading to an unscoped read — the coach roster/detail must never mix pools.
 */
export function nutritionV2CoachScopeFromWorkspace(
  workspace: WorkspaceSummary | null,
): NutritionV2CoachScope {
  switch (workspace?.type) {
    case 'coach_standalone':
      return { scopeType: 'standalone', teamId: null, orgId: null }
    case 'coach_team':
      return { scopeType: 'team', teamId: workspace.teamId, orgId: null }
    case 'enterprise_coach':
      return { scopeType: 'organization', teamId: null, orgId: workspace.orgId }
    default:
      throw new Error(
        `Nutrition V2 coach read requires a coach workspace, got: ${workspace?.type ?? 'null'}`,
      )
  }
}

export function getNutritionCoachHubV2ForWeb(input: {
  scope: NutritionV2CoachScope
  cursorUpdatedAt?: string | null
  cursorClientId?: string | null
  pageSize?: number
}): Promise<NutritionCoachHubPageReadModel> {
  // Scoped RPC: server-side it re-validates coach membership against auth.uid()
  // (private.nutrition_v2_client_matches_workspace). `get_nutrition_coach_hub_v2` is revoked.
  return rpcRead({
    name: 'get_nutrition_coach_hub_scoped_v2',
    args: {
      p_scope_type: input.scope.scopeType,
      p_team_id: input.scope.teamId,
      p_org_id: input.scope.orgId,
      p_cursor_updated_at: input.cursorUpdatedAt ?? null,
      p_cursor_client_id: input.cursorClientId ?? null,
      p_page_size: input.pageSize ?? 25,
    },
    parse: (value) => NutritionCoachHubPageReadModelSchema.parse(value),
  })
}

// Interfaz minima para leer `nutrition_v2_conversion_links` (patron identico a `RpcClient` mas
// arriba: cast acotado, cero `any` fuera de esta forma). TODO(nutrition-v2-conversion): la tabla
// aun no esta en `database.types.ts` — la crea la migracion aditiva
// `20260717120000_nutrition_v2_conversion_links.sql` (specs/nutrition-v2-conversion/SPEC.md
// §Trazabilidad), pendiente de aplicar a prod (protocolo aditivo-en-LIVE). Regenerar
// `database.types.ts` y retirar este cast cuando la migracion este LIVE.
type ConversionLinkClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => Promise<{
          data: { converted_at: string } | null
          error: { message: string; code?: string } | null
        }>
      }
    }
  }
}

/**
 * Link de trazabilidad V1->V2 del plan vigente (si existe). Alimenta el banner "plan convertido"
 * de la ficha del coach (SPEC AC8). RLS en `nutrition_v2_conversion_links` ya scopea la fila al
 * coach dueno (`coach_id = auth.uid()`); el filtro por `v2_plan_id` acota a lo sumo un link
 * (1 plan V1 -> 1 plan V2, el mismo plan sobrevive los re-sync que solo versionan).
 *
 * No-bloqueante por diseno: si la tabla no existe todavia (migracion sin aplicar) o el read
 * falla por cualquier razon, degrada a `null` (sin banner) en vez de romper la ficha — el aviso
 * es informativo, nunca critico para ver el plan del alumno.
 */
export async function getNutritionConversionLinkForWeb(input: {
  v2PlanId: string
}): Promise<{ convertedAt: string } | null> {
  noStore()
  const client = await createClient()
  const { data, error } = await (client as unknown as ConversionLinkClient)
    .from('nutrition_v2_conversion_links')
    .select('converted_at')
    .eq('v2_plan_id', input.v2PlanId)
    .maybeSingle()

  if (error) {
    console.error('nutrition_v2_web_read', {
      rpc: 'nutrition_v2_conversion_links.select',
      ok: false,
      errorCode: error.code ?? 'READ_ERROR',
    })
    return null
  }

  return data ? { convertedAt: data.converted_at } : null
}

export function getNutritionClientDetailV2ForWeb(input: {
  clientId: string
  scope: NutritionV2CoachScope
  date: string
  timezone?: string
}): Promise<NutritionClientDetailReadModel> {
  // Scoped RPC: server-side it enforces the workspace against auth.uid() and delegates to the same
  // detail implementation. `get_nutrition_client_detail_v2` (unscoped) is no longer used here.
  return rpcRead({
    name: 'get_nutrition_client_detail_scoped_v2',
    args: {
      p_client_id: input.clientId,
      p_scope_type: input.scope.scopeType,
      p_team_id: input.scope.teamId,
      p_org_id: input.scope.orgId,
      p_local_date: input.date,
      p_timezone: input.timezone ?? 'America/Santiago',
    },
    parse: (value) => NutritionClientDetailReadModelSchema.parse(value),
  })
}
