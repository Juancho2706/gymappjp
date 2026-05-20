import AsyncStorage from '@react-native-async-storage/async-storage'
import type { SupabaseClient } from '@supabase/supabase-js'

const PLAN_PREFIX = 'eva_plan_'
const LOG_QUEUE_KEY = 'eva_log_queue'

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

  const { error } = await supabase.from('workout_logs').insert(
    queue.map(({ queued_at: _q, ...log }) => ({ ...log, logged_at: new Date().toISOString() }))
  )
  if (error) return 0

  await AsyncStorage.removeItem(LOG_QUEUE_KEY)
  return queue.length
}

export async function getPendingLogCount(): Promise<number> {
  const raw = await AsyncStorage.getItem(LOG_QUEUE_KEY)
  if (!raw) return 0
  try { return (JSON.parse(raw) as PendingLog[]).length } catch { return 0 }
}
