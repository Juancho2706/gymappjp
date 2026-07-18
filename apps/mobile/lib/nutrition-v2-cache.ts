import AsyncStorage from '@react-native-async-storage/async-storage'
import type { z } from 'zod'

const PREFIX = 'eva:nutrition-v2:read:v1'
const CACHE_SCHEMA_VERSION = 1
const MAX_ENTRY_BYTES = 750_000

export const NUTRITION_V2_CACHE_TTL_MS = {
  today: 10 * 60 * 1000,
  plan: 12 * 60 * 60 * 1000,
  history: 30 * 60 * 1000,
  coachHub: 10 * 60 * 1000,
  clientDetail: 10 * 60 * 1000,
} as const

export type NutritionV2CacheKind = keyof typeof NUTRITION_V2_CACHE_TTL_MS

type CacheEnvelope = {
  schemaVersion: typeof CACHE_SCHEMA_VERSION
  userId: string
  clientId: string | null
  kind: NutritionV2CacheKind
  scopeKey: string
  storedAt: number
  expiresAt: number
  payload: unknown
}

function safeSegment(value: string | null | undefined): string {
  return (value || 'none').replace(/[^a-zA-Z0-9:_-]/g, '-')
}

export function nutritionV2CacheKey(input: {
  userId: string
  clientId?: string | null
  kind: NutritionV2CacheKind
  scopeKey: string
}): string {
  return [
    PREFIX,
    safeSegment(input.userId),
    safeSegment(input.clientId),
    input.kind,
    safeSegment(input.scopeKey),
  ].join(':')
}

export async function writeNutritionV2Cache<T>(input: {
  userId: string
  clientId?: string | null
  kind: NutritionV2CacheKind
  scopeKey: string
  payload: T
  ttlMs?: number
}): Promise<boolean> {
  const storedAt = Date.now()
  const envelope: CacheEnvelope = {
    schemaVersion: CACHE_SCHEMA_VERSION,
    userId: input.userId,
    clientId: input.clientId ?? null,
    kind: input.kind,
    scopeKey: input.scopeKey,
    storedAt,
    expiresAt: storedAt + (input.ttlMs ?? NUTRITION_V2_CACHE_TTL_MS[input.kind]),
    payload: input.payload,
  }

  try {
    const serialized = JSON.stringify(envelope)
    if (new TextEncoder().encode(serialized).byteLength > MAX_ENTRY_BYTES) return false
    await AsyncStorage.setItem(nutritionV2CacheKey(input), serialized)
    return true
  } catch {
    return false
  }
}

export async function readNutritionV2Cache<T>(input: {
  userId: string
  clientId?: string | null
  kind: NutritionV2CacheKind
  scopeKey: string
  schema: z.ZodType<T>
  allowStale?: boolean
}): Promise<{ payload: T; stale: boolean; storedAt: number } | null> {
  try {
    const raw = await AsyncStorage.getItem(nutritionV2CacheKey(input))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CacheEnvelope>
    if (
      parsed.schemaVersion !== CACHE_SCHEMA_VERSION ||
      parsed.userId !== input.userId ||
      parsed.clientId !== (input.clientId ?? null) ||
      parsed.kind !== input.kind ||
      parsed.scopeKey !== input.scopeKey ||
      typeof parsed.storedAt !== 'number' ||
      typeof parsed.expiresAt !== 'number'
    ) {
      await AsyncStorage.removeItem(nutritionV2CacheKey(input))
      return null
    }

    const stale = Date.now() > parsed.expiresAt
    if (stale && input.allowStale !== true) return null
    const payload = input.schema.safeParse(parsed.payload)
    if (!payload.success) {
      await AsyncStorage.removeItem(nutritionV2CacheKey(input))
      return null
    }
    return { payload: payload.data, stale, storedAt: parsed.storedAt }
  } catch {
    return null
  }
}

export async function removeNutritionV2Cache(input: {
  userId: string
  clientId?: string | null
  kind: NutritionV2CacheKind
  scopeKey: string
}): Promise<void> {
  await AsyncStorage.removeItem(nutritionV2CacheKey(input)).catch(() => {})
}

export async function clearNutritionV2CacheForUser(userId: string): Promise<void> {
  try {
    const prefix = `${PREFIX}:${safeSegment(userId)}:`
    const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(prefix))
    await Promise.all(keys.map((key) => AsyncStorage.removeItem(key)))
  } catch {
    // Best effort on logout or account switch.
  }
}
