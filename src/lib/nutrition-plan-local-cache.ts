/**
 * Copia local del plan nutrición visible (read model) para resiliencia offline / recarga sin red.
 * Solo datos ya mostrados al alumno; no sustituye servidor ni RLS.
 */

import { getTodayInSantiago } from '@/lib/date-utils'

const PREFIX = 'eva_nutrition_readmodel:'
const LAST_VIEWED_PREFIX = 'eva_nutrition_last_viewed:'
/** ~450 KB para no saturar localStorage en móviles. */
const MAX_SERIALIZED_CHARS = 450_000

export type NutritionReadModelCacheV1 = {
  v: 1
  cachedAt: string
  /** Día de registro (Santiago) al que corresponde `dailyLog` y ventana de adherencia guardada. */
  today: string
  /** Mismo `user.id` del alumno; recuperación sin servidor exige este campo en cache nueva. */
  clientUserId?: string
  plan: unknown
  adherence: unknown
  /** Log del día `today` (tabla daily_nutrition_logs + hijos). */
  dailyLog?: unknown | null
}

export function nutritionPlanCacheKey(coachSlug: string, planId: string): string {
  return `${PREFIX}${coachSlug}:${planId}`
}

export function writeNutritionLastViewed(coachSlug: string, payload: { planId: string; userId: string }): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(`${LAST_VIEWED_PREFIX}${coachSlug}`, JSON.stringify(payload))
  } catch {
    // ignore
  }
}

export function readNutritionLastViewed(coachSlug: string): { planId: string; userId: string } | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(`${LAST_VIEWED_PREFIX}${coachSlug}`)
    if (!raw) return null
    const o = JSON.parse(raw) as { planId?: string; userId?: string }
    if (!o?.planId || !o?.userId) return null
    return { planId: o.planId, userId: o.userId }
  } catch {
    return null
  }
}

export function writeNutritionReadModelCache(
  coachSlug: string,
  payload: {
    plan: { id: string }
    today: string
    adherence: unknown
    clientUserId: string
    dailyLog?: unknown | null
  }
): void {
  if (typeof window === 'undefined') return
  try {
    const body: NutritionReadModelCacheV1 = {
      v: 1,
      cachedAt: new Date().toISOString(),
      today: payload.today,
      clientUserId: payload.clientUserId,
      plan: payload.plan,
      adherence: payload.adherence,
      dailyLog: payload.dailyLog ?? null,
    }
    const raw = JSON.stringify(body)
    if (raw.length > MAX_SERIALIZED_CHARS) return
    localStorage.setItem(nutritionPlanCacheKey(coachSlug, payload.plan.id), raw)
    writeNutritionLastViewed(coachSlug, { planId: payload.plan.id, userId: payload.clientUserId })
  } catch {
    // QuotaExceeded u otros: ignorar
  }
}

export function readNutritionReadModelCache(
  coachSlug: string,
  planId: string
): NutritionReadModelCacheV1 | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(nutritionPlanCacheKey(coachSlug, planId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as NutritionReadModelCacheV1
    if (parsed?.v !== 1 || !parsed.plan) return null
    return parsed
  } catch {
    return null
  }
}

/**
 * Si el servidor no devuelve plan activo pero hay copia local del mismo usuario y slug, devuelve datos para montar la vista.
 * Requiere `clientUserId` en cache (caches antiguas sin campo no califican).
 */
export function tryLoadNutritionRecoveryBundle(
  coachSlug: string,
  userId: string
): {
  plan: unknown
  adherence: unknown
  dailyLog: unknown | null
  todayIso: string
  cachedAt: string
  cacheLogDate: string
} | null {
  const last = readNutritionLastViewed(coachSlug)
  if (!last || last.userId !== userId) return null
  const c = readNutritionReadModelCache(coachSlug, last.planId)
  if (!c || c.clientUserId !== userId) return null
  if (!c.plan || typeof c.plan !== 'object') return null
  const todayIso = getTodayInSantiago().iso
  return {
    plan: c.plan,
    adherence: c.adherence,
    dailyLog: c.dailyLog ?? null,
    todayIso,
    cachedAt: c.cachedAt,
    cacheLogDate: c.today,
  }
}
