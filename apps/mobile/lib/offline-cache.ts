import AsyncStorage from '@react-native-async-storage/async-storage'
import type { SupabaseClient } from '@supabase/supabase-js'
import { toggleMealCompletion } from './nutrition.queries'
import { getSantiagoIsoYmdForUtcInstant, getSantiagoUtcBoundsForDay } from './date-utils'

const PLAN_PREFIX = 'eva_plan_'
const LOG_QUEUE_KEY = 'eva_log_queue'
const NUTRITION_QUEUE_KEY = 'eva_nutrition_queue'

interface PendingLog {
  block_id: string
  client_id: string
  set_number: number
  weight_kg: number | null
  reps_done: number | null
  rpe?: number | null
  rir?: number | null
  exercise_name_at_log: string | null
  queued_at: string
}

export async function cachePlan(planId: string, data: unknown): Promise<void> {
  await AsyncStorage.setItem(PLAN_PREFIX + planId, JSON.stringify(data))
}

export async function getCachedPlan<T>(planId: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(PLAN_PREFIX + planId)
  if (!raw) return null
  try { return JSON.parse(raw) as T } catch { return null }
}

export async function enqueueLog(log: Omit<PendingLog, 'queued_at'>): Promise<void> {
  const raw = await AsyncStorage.getItem(LOG_QUEUE_KEY)
  const queue: PendingLog[] = raw ? JSON.parse(raw) : []
  queue.push({ ...log, queued_at: new Date().toISOString() })
  await AsyncStorage.setItem(LOG_QUEUE_KEY, JSON.stringify(queue))
}

export async function flushLogQueue(supabase: SupabaseClient): Promise<number> {
  const raw = await AsyncStorage.getItem(LOG_QUEUE_KEY)
  if (!raw) return 0
  const queue: PendingLog[] = JSON.parse(raw)
  if (queue.length === 0) return 0

  // Fix S1/S2: per-item resiliente (un registro malo no bloquea la cola) + dedup
  // select-then-update/insert (no duplica) + preserva el timestamp original del entreno.
  let flushed = 0
  const remaining: PendingLog[] = []
  for (const item of queue) {
    const { queued_at, ...log } = item
    const loggedAt = queued_at || new Date().toISOString()
    const dayIso = getSantiagoIsoYmdForUtcInstant(loggedAt)
    const { startIso, endIso } = getSantiagoUtcBoundsForDay(dayIso)
    try {
      const { data: existing, error: selErr } = await supabase
        .from('workout_logs')
        .select('id')
        .eq('client_id', log.client_id)
        .eq('block_id', log.block_id)
        .eq('set_number', log.set_number)
        .gte('logged_at', startIso)
        .lt('logged_at', endIso)
        .order('logged_at', { ascending: false })
      if (selErr) { remaining.push(item); continue }
      let opErr: { message: string } | null = null
      if (existing && existing.length > 0) {
        const [keep, ...dups] = existing as { id: string }[]
        const upd = await supabase.from('workout_logs').update(log).eq('id', keep.id)
        opErr = upd.error
        if (dups.length) await supabase.from('workout_logs').delete().in('id', dups.map((d) => d.id))
      } else {
        const ins = await supabase.from('workout_logs').insert({ ...log, logged_at: loggedAt })
        opErr = ins.error
      }
      if (opErr) remaining.push(item)
      else flushed++
    } catch {
      remaining.push(item)
    }
  }
  await AsyncStorage.setItem(LOG_QUEUE_KEY, JSON.stringify(remaining))
  return flushed
}

export async function getPendingLogCount(): Promise<number> {
  const raw = await AsyncStorage.getItem(LOG_QUEUE_KEY)
  if (!raw) return 0
  try { return (JSON.parse(raw) as PendingLog[]).length } catch { return 0 }
}

// ─── Nutrition offline queue ───────────────────────────────────────────────

export interface PendingNutritionToggle {
  clientId: string
  planId: string
  mealId: string
  completed: boolean
  logId?: string
  date: string
}

export async function enqueueNutritionToggle(item: PendingNutritionToggle): Promise<void> {
  const raw = await AsyncStorage.getItem(NUTRITION_QUEUE_KEY)
  const queue: PendingNutritionToggle[] = raw ? JSON.parse(raw) : []
  const idx = queue.findIndex((x) => x.mealId === item.mealId && x.date === item.date)
  if (idx >= 0) queue[idx] = item
  else queue.push(item)
  await AsyncStorage.setItem(NUTRITION_QUEUE_KEY, JSON.stringify(queue))
}

export async function flushNutritionQueue(supabase: SupabaseClient): Promise<number> {
  const raw = await AsyncStorage.getItem(NUTRITION_QUEUE_KEY)
  if (!raw) return 0
  const queue: PendingNutritionToggle[] = JSON.parse(raw)
  if (queue.length === 0) return 0
  let flushed = 0
  const remaining: PendingNutritionToggle[] = []
  for (const item of queue) {
    const { success } = await toggleMealCompletion(
      item.clientId, item.planId, item.mealId,
      item.completed, item.logId ?? null, item.date
    )
    if (success) flushed++
    else remaining.push(item)
  }
  await AsyncStorage.setItem(NUTRITION_QUEUE_KEY, JSON.stringify(remaining))
  return flushed
}

export async function getPendingNutritionCount(): Promise<number> {
  const raw = await AsyncStorage.getItem(NUTRITION_QUEUE_KEY)
  if (!raw) return 0
  try { return (JSON.parse(raw) as unknown[]).length } catch { return 0 }
}
