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
} from '@eva/nutrition-v2'
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

export function getNutritionCoachHubV2ForWeb(input: {
  cursorUpdatedAt?: string | null
  cursorClientId?: string | null
  pageSize?: number
} = {}): Promise<NutritionCoachHubPageReadModel> {
  return rpcRead({
    name: 'get_nutrition_coach_hub_v2',
    args: {
      p_cursor_updated_at: input.cursorUpdatedAt ?? null,
      p_cursor_client_id: input.cursorClientId ?? null,
      p_page_size: input.pageSize ?? 25,
    },
    parse: (value) => NutritionCoachHubPageReadModelSchema.parse(value),
  })
}

export function getNutritionClientDetailV2ForWeb(input: {
  clientId: string
  date: string
  timezone?: string
}): Promise<NutritionClientDetailReadModel> {
  return rpcRead({
    name: 'get_nutrition_client_detail_v2',
    args: {
      p_client_id: input.clientId,
      p_local_date: input.date,
      p_timezone: input.timezone ?? 'America/Santiago',
    },
    parse: (value) => NutritionClientDetailReadModelSchema.parse(value),
  })
}
