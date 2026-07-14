import {
  NutritionClientDetailReadModelSchema,
  NutritionCoachHubPageReadModelSchema,
  NutritionHistoryPageReadModelSchema,
  NutritionIntakeCorrectionSchema,
  NutritionIntakeMutationSchema,
  NutritionPlanReadModelSchema,
  NutritionTodayReadModelSchema,
  type NutritionClientDetailReadModel,
  type NutritionCoachHubPageReadModel,
  type NutritionHistoryPageReadModel,
  type NutritionIntakeCorrection,
  type NutritionIntakeMutation,
  type NutritionPlanReadModel,
  type NutritionTodayReadModel,
} from '@eva/nutrition-v2'
import { apiFetch } from './api'

function params(values: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined && value !== '') search.set(key, String(value))
  }
  const result = search.toString()
  return result ? `?${result}` : ''
}

export async function getNutritionTodayV2(input: {
  date: string
  timezone?: string
  signal?: AbortSignal
}): Promise<NutritionTodayReadModel> {
  const raw = await apiFetch<unknown>(
    `/api/mobile/nutrition-v2/read${params({
      view: 'today',
      date: input.date,
      timezone: input.timezone ?? 'America/Santiago',
    })}`,
    { authenticated: true, signal: input.signal },
  )
  return NutritionTodayReadModelSchema.parse(raw)
}

export async function getNutritionPlanV2(input: {
  date: string
  timezone?: string
  signal?: AbortSignal
}): Promise<NutritionPlanReadModel> {
  const raw = await apiFetch<unknown>(
    `/api/mobile/nutrition-v2/read${params({
      view: 'plan',
      date: input.date,
      timezone: input.timezone ?? 'America/Santiago',
    })}`,
    { authenticated: true, signal: input.signal },
  )
  return NutritionPlanReadModelSchema.parse(raw)
}

export async function getNutritionHistoryV2(input: {
  before?: string | null
  pageSize?: number
  signal?: AbortSignal
}): Promise<NutritionHistoryPageReadModel> {
  const raw = await apiFetch<unknown>(
    `/api/mobile/nutrition-v2/read${params({
      view: 'history',
      before: input.before,
      pageSize: input.pageSize ?? 14,
    })}`,
    { authenticated: true, signal: input.signal },
  )
  return NutritionHistoryPageReadModelSchema.parse(raw)
}

export async function getNutritionCoachHubV2(input: {
  cursorUpdatedAt?: string | null
  cursorClientId?: string | null
  pageSize?: number
  signal?: AbortSignal
} = {}): Promise<NutritionCoachHubPageReadModel> {
  const raw = await apiFetch<unknown>(
    `/api/mobile/nutrition-v2/coach${params({
      view: 'hub',
      cursorUpdatedAt: input.cursorUpdatedAt,
      cursorClientId: input.cursorClientId,
      pageSize: input.pageSize ?? 25,
    })}`,
    { authenticated: true, signal: input.signal },
  )
  return NutritionCoachHubPageReadModelSchema.parse(raw)
}

export async function getNutritionClientDetailV2(input: {
  clientId: string
  date: string
  timezone?: string
  signal?: AbortSignal
}): Promise<NutritionClientDetailReadModel> {
  const raw = await apiFetch<unknown>(
    `/api/mobile/nutrition-v2/coach${params({
      view: 'client',
      clientId: input.clientId,
      date: input.date,
      timezone: input.timezone ?? 'America/Santiago',
    })}`,
    { authenticated: true, signal: input.signal },
  )
  return NutritionClientDetailReadModelSchema.parse(raw)
}

function parseMutationResponse(raw: unknown): { ok: true; id: string; action: 'record' | 'correct' } {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid Nutrition V2 mutation response')
  const value = raw as Record<string, unknown>
  if (
    value.ok !== true ||
    typeof value.id !== 'string' ||
    (value.action !== 'record' && value.action !== 'correct')
  ) {
    throw new Error('Invalid Nutrition V2 mutation response')
  }
  return value as { ok: true; id: string; action: 'record' | 'correct' }
}

export async function recordNutritionIntakeV2(
  payload: NutritionIntakeMutation,
  signal?: AbortSignal,
): Promise<{ ok: true; id: string; action: 'record' }> {
  const validated = NutritionIntakeMutationSchema.parse(payload)
  const raw = await apiFetch<unknown>('/api/mobile/nutrition-v2/intake', {
    method: 'POST',
    authenticated: true,
    signal,
    body: { action: 'record', payload: validated },
  })
  const result = parseMutationResponse(raw)
  if (result.action !== 'record') throw new Error('Unexpected Nutrition V2 action')
  return result
}

export async function correctNutritionIntakeV2(
  payload: NutritionIntakeCorrection,
  signal?: AbortSignal,
): Promise<{ ok: true; id: string; action: 'correct' }> {
  const validated = NutritionIntakeCorrectionSchema.parse(payload)
  const raw = await apiFetch<unknown>('/api/mobile/nutrition-v2/intake', {
    method: 'POST',
    authenticated: true,
    signal,
    body: { action: 'correct', payload: validated },
  })
  const result = parseMutationResponse(raw)
  if (result.action !== 'correct') throw new Error('Unexpected Nutrition V2 action')
  return result
}
