/**
 * Cola local de toggles de comida cuando no hay red (alumno /c/).
 * Dedupe por mealId + fecha (último estado gana).
 */

export const NUTRITION_OFFLINE_TOGGLE_QUEUE_KEY = 'eva_offline_toggle_queue'

export type NutritionOfflineToggleItem = {
  userId: string
  planId: string
  mealId: string
  completed: boolean
  logId?: string
  coachSlug: string
  date: string
}

export function isLikelyOfflineError(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const msg = err instanceof Error ? err.message : String(err)
  return /failed to fetch|networkerror|network request failed|load failed|fetch/i.test(msg)
}

export function readNutritionOfflineToggleQueue(): NutritionOfflineToggleItem[] {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(window.localStorage.getItem(NUTRITION_OFFLINE_TOGGLE_QUEUE_KEY) ?? '[]') as NutritionOfflineToggleItem[]
  } catch {
    return []
  }
}

export function writeNutritionOfflineToggleQueue(q: NutritionOfflineToggleItem[]): void {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(NUTRITION_OFFLINE_TOGGLE_QUEUE_KEY, JSON.stringify(q))
}

export function enqueueNutritionOfflineToggle(item: NutritionOfflineToggleItem): void {
  const q = readNutritionOfflineToggleQueue()
  const idx = q.findIndex((x) => x.mealId === item.mealId && x.date === item.date)
  if (idx >= 0) q[idx] = item
  else q.push(item)
  writeNutritionOfflineToggleQueue(q)
}
