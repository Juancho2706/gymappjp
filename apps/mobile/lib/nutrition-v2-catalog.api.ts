import {
  FoodBarcodeLookupReadModelSchema,
  FoodCatalogSearchReadModelSchema,
  MissingFoodBarcodeReportSchema,
  type FoodBarcodeLookupReadModel,
  type FoodCatalogCursor,
  type FoodCatalogSearchReadModel,
  type MissingFoodBarcodeReport,
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

export async function searchFoodCatalogV2(input: {
  query: string
  countryCode?: string
  cursor?: FoodCatalogCursor | null
  pageSize?: number
  surface?: 'student' | 'coach'
  signal?: AbortSignal
}): Promise<FoodCatalogSearchReadModel> {
  const raw = await apiFetch<unknown>(
    `/api/mobile/nutrition-v2/catalog${params({
      operation: 'search',
      surface: input.surface ?? 'student',
      query: input.query,
      countryCode: input.countryCode ?? 'CL',
      cursorScore: input.cursor?.score,
      cursorName: input.cursor?.name,
      cursorId: input.cursor?.id,
      pageSize: input.pageSize ?? 25,
    })}`,
    { authenticated: true, signal: input.signal },
  )
  return FoodCatalogSearchReadModelSchema.parse(raw)
}

export async function lookupFoodByGtinV2(input: {
  gtin: string
  countryCode?: string
  surface?: 'student' | 'coach'
  signal?: AbortSignal
}): Promise<FoodBarcodeLookupReadModel> {
  const raw = await apiFetch<unknown>(
    `/api/mobile/nutrition-v2/catalog${params({
      operation: 'gtin',
      surface: input.surface ?? 'student',
      gtin: input.gtin,
      countryCode: input.countryCode ?? 'CL',
    })}`,
    { authenticated: true, signal: input.signal },
  )
  return FoodBarcodeLookupReadModelSchema.parse(raw)
}

export async function reportMissingFoodGtinV2(
  payload: MissingFoodBarcodeReport,
  signal?: AbortSignal,
): Promise<{ ok: true; id: string }> {
  const validated = MissingFoodBarcodeReportSchema.parse(payload)
  const raw = await apiFetch<unknown>('/api/mobile/nutrition-v2/catalog', {
    method: 'POST',
    authenticated: true,
    signal,
    body: validated,
  })
  if (!raw || typeof raw !== 'object') throw new Error('Invalid missing food response')
  const value = raw as Record<string, unknown>
  if (value.ok !== true || typeof value.id !== 'string') {
    throw new Error('Invalid missing food response')
  }
  return { ok: true, id: value.id }
}

export function foodMediaPublicUrl(input: {
  supabaseUrl: string
  bucket: string
  objectPath: string
  version: number
}): string {
  const base = input.supabaseUrl.replace(/\/$/, '')
  const encodedPath = input.objectPath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `${base}/storage/v1/object/public/${encodeURIComponent(input.bucket)}/${encodedPath}?v=${input.version}`
}
