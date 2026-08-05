import 'server-only'

import { unstable_noStore as noStore } from 'next/cache'
import { z } from 'zod'
import {
  NutritionClientDetailReadModelSchema,
  NutritionCoachHubPageReadModelSchema,
  NutritionHistoryPageReadModelSchema,
  NutritionLegacyHistoryDetailReadModelSchema,
  NutritionPlanReadModelSchema,
  NutritionTodayReadModelSchema,
  type NutritionClientDetailReadModel,
  type NutritionCoachHubPageReadModel,
  type NutritionHistoryPageReadModel,
  type NutritionLegacyHistoryDetailReadModel,
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
 * Detalle inmutable de un día del sistema Nutrition V1, presentado por V2 en modo
 * lectura. El RPC conserva los datos fuente: no sintetiza ni escribe eventos V2.
 */
export function getNutritionLegacyHistoryDetailV2ForWeb(input: {
  clientId: string
  date: string
}): Promise<NutritionLegacyHistoryDetailReadModel> {
  return rpcRead({
    name: 'get_nutrition_legacy_history_detail_v2',
    args: {
      p_client_id: input.clientId,
      p_local_date: input.date,
    },
    parse: (value) => NutritionLegacyHistoryDetailReadModelSchema.parse(value),
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
      throw new Error('Nutrition V2 is not available for enterprise workspaces')
    default:
      throw new Error(
        `Nutrition V2 coach read requires a coach workspace, got: ${workspace?.type ?? 'null'}`,
      )
  }
}

/**
 * Roster del hub del coach. Desde la migración 20260805211949 la búsqueda por nombre y el
 * orden viven SERVER-side: `sort: 'attention'` ordena por riesgo (score desc, updatedAt desc,
 * id desc) y en ese modo el keyset necesita además `cursorScore` — sin él la página 2 vuelve
 * a empezar por el más urgente. `sort: 'default'` conserva el keyset histórico por updatedAt.
 */
export function getNutritionCoachHubV2ForWeb(input: {
  scope: NutritionV2CoachScope
  cursorUpdatedAt?: string | null
  cursorClientId?: string | null
  cursorScore?: number | null
  pageSize?: number
  search?: string | null
  sort?: 'default' | 'attention'
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
      p_search: input.search?.trim() ? input.search.trim().slice(0, 120) : null,
      p_sort: input.sort ?? 'default',
      p_cursor_score: input.cursorScore ?? null,
    },
    parse: (value) => NutritionCoachHubPageReadModelSchema.parse(value),
  })
}

/**
 * NUT-026 — Roster liviano del workspace para los selectores de alumno (picker "Nuevo plan"
 * y "Asignar a otros alumnos"). Reemplaza el bucle de 8 paginas x 50 sobre el hub scoped que
 * topaba en 400 alumnos SIN aviso y encadenaba 8 round-trips en el render RSC: aqui la
 * busqueda y la paginacion son server-side (`get_nutrition_coach_roster_scoped_v2`).
 *
 * El read model es local a este servicio a proposito: es una proyeccion de UI del roster, no
 * un contrato de dominio compartido con RN.
 */
const NutritionCoachRosterPageSchema = z.object({
  schemaVersion: z.number(),
  generatedAt: z.string(),
  items: z.array(
    z.object({
      clientId: z.string(),
      clientName: z.string().nullable(),
      planStatus: z.string().nullable(),
    }),
  ),
  nextCursor: z.object({ name: z.string(), clientId: z.string() }).nullable(),
  hasMore: z.boolean(),
})

export type NutritionCoachRosterPage = z.infer<typeof NutritionCoachRosterPageSchema>

export function getNutritionCoachRosterV2ForWeb(input: {
  scope: NutritionV2CoachScope
  search?: string | null
  cursorName?: string | null
  cursorClientId?: string | null
  pageSize?: number
}): Promise<NutritionCoachRosterPage> {
  return rpcRead({
    name: 'get_nutrition_coach_roster_scoped_v2',
    args: {
      p_scope_type: input.scope.scopeType,
      p_team_id: input.scope.teamId,
      p_org_id: input.scope.orgId,
      p_search: input.search?.trim() ? input.search.trim().slice(0, 120) : null,
      p_cursor_name: input.cursorName ?? null,
      p_cursor_client_id: input.cursorClientId ?? null,
      p_page_size: input.pageSize ?? 50,
    },
    parse: (value) => NutritionCoachRosterPageSchema.parse(value),
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
