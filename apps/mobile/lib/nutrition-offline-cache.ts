import AsyncStorage from '@react-native-async-storage/async-storage'

const CACHE_KEY_PREFIX = 'eva_nutrition_readmodel'
const MAX_BYTES = 450_000

interface NutritionCachePayload {
  v: number
  cachedAt: string
  today: string
  plan: unknown
  adherence: unknown
  dailyLog: unknown | null
  clientUserId: string
}

export async function writeNutritionCache(planId: string, data: {
  today: string
  plan: unknown
  adherence: unknown
  dailyLog: unknown | null
  clientUserId: string
}): Promise<void> {
  const payload: NutritionCachePayload = { v: 1, cachedAt: new Date().toISOString(), ...data }
  const serialized = JSON.stringify(payload)
  if (serialized.length > MAX_BYTES) return
  try {
    await AsyncStorage.setItem(`${CACHE_KEY_PREFIX}:${planId}`, serialized)
  } catch {}
}

export async function readNutritionCache(planId: string): Promise<NutritionCachePayload | null> {
  try {
    const raw = await AsyncStorage.getItem(`${CACHE_KEY_PREFIX}:${planId}`)
    if (!raw) return null
    return JSON.parse(raw) as NutritionCachePayload
  } catch {
    return null
  }
}

export async function clearNutritionCache(planId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${CACHE_KEY_PREFIX}:${planId}`)
  } catch {}
}
