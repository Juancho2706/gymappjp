import AsyncStorage from '@react-native-async-storage/async-storage'
import type { SupabaseClient } from '@supabase/supabase-js'
import { toggleMealCompletion } from './nutrition.queries'
import { getSantiagoIsoYmdForUtcInstant, getSantiagoUtcBoundsForDay } from './date-utils'
import { enqueueOp, flushQueue, queueCount, type AsyncKV } from './offline-queue'

const PLAN_PREFIX = 'eva_plan_'
const LOG_QUEUE_KEY = 'eva_log_queue'
const NUTRITION_QUEUE_KEY = 'eva_nutrition_queue'

/**
 * Migrada a la cola generalizada idempotente `offline-queue.ts` (E4-23). Las firmas públicas
 * (`enqueueLog`/`flushLogQueue`/`enqueueNutritionToggle`/`flushNutritionQueue`/`getPending*`) se
 * conservan intactas → los consumidores (workout-session, LegacyExecutor, tabs layout, pantalla de
 * nutrición) NO cambian. La idempotencia real vive en las CLAVES NATURALES de dedup + el candado de
 * flush del módulo generalizado.
 */
const kv: AsyncKV = {
  getItem: (k) => AsyncStorage.getItem(k),
  setItem: (k, v) => AsyncStorage.setItem(k, v),
}

interface PendingLog {
  block_id: string
  client_id: string
  set_number: number
  weight_kg: number | null
  reps_done: number | null
  rpe?: number | null
  rir?: number | null
  note?: string | null
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

// ─── Workout log queue ─────────────────────────────────────────────────────
// Clave natural = client:block:set:día-Santiago — MISMA identidad que el índice único de prod
// `workout_logs_unique_set_per_day` (PR #113). Re-encolar la misma serie del mismo día colapsa
// (last-wins); un flush concurrente ya no puede duplicar (candado + índice como backstop 23505).

function workoutDedupKey(l: { client_id: string; block_id: string; set_number: number; queued_at?: string }): string {
  const day = getSantiagoIsoYmdForUtcInstant(l.queued_at ?? new Date().toISOString())
  return `${l.client_id}:${l.block_id}:${l.set_number}:${day}`
}

export async function enqueueLog(log: Omit<PendingLog, 'queued_at'>): Promise<void> {
  const payload: PendingLog = { ...log, queued_at: new Date().toISOString() }
  await enqueueOp(kv, LOG_QUEUE_KEY, workoutDedupKey(payload), payload, workoutDedupKey)
}

export async function flushLogQueue(supabase: SupabaseClient): Promise<number> {
  const res = await flushQueue<PendingLog>(
    kv,
    LOG_QUEUE_KEY,
    async (item) => {
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
        if (selErr) return 'retry'
        if (existing && existing.length > 0) {
          const [keep, ...dups] = existing as { id: string }[]
          const upd = await supabase.from('workout_logs').update(log).eq('id', keep.id)
          if (upd.error) return 'retry'
          if (dups.length) await supabase.from('workout_logs').delete().in('id', dups.map((d) => d.id))
          return 'ok'
        }
        const ins = await supabase.from('workout_logs').insert({ ...log, logged_at: loggedAt })
        if (ins.error) {
          const code = (ins.error as { code?: string }).code
          // 23505 = el índice único de prod ya tiene la fila (otro flush/optimista la insertó primero) →
          // éxito idempotente, drenar. 23503 = FK del bloque borrado (reseed) → descartar, no loopear.
          if (code === '23505') return 'ok'
          if (code === '23503') return 'discard'
          return 'retry'
        }
        return 'ok'
      } catch {
        return 'retry'
      }
    },
    { deriveKey: workoutDedupKey },
  )
  return res.flushed
}

export async function getPendingLogCount(): Promise<number> {
  return queueCount(kv, LOG_QUEUE_KEY)
}

// ─── Nutrition toggle queue ────────────────────────────────────────────────
// Clave natural = meal:fecha. `toggleMealCompletion` ya es idempotente (upsert onConflict /
// delete-si-existe), así que un reintento repetido converge al mismo estado.

export interface PendingNutritionToggle {
  clientId: string
  planId: string
  mealId: string
  completed: boolean
  logId?: string
  date: string
}

function nutritionDedupKey(x: PendingNutritionToggle): string {
  return `${x.mealId}:${x.date}`
}

export async function enqueueNutritionToggle(item: PendingNutritionToggle): Promise<void> {
  await enqueueOp(kv, NUTRITION_QUEUE_KEY, nutritionDedupKey(item), item, nutritionDedupKey)
}

export async function flushNutritionQueue(supabase: SupabaseClient): Promise<number> {
  const res = await flushQueue<PendingNutritionToggle>(
    kv,
    NUTRITION_QUEUE_KEY,
    async (item) => {
      const { success } = await toggleMealCompletion(
        item.clientId, item.planId, item.mealId,
        item.completed, item.logId ?? null, item.date,
      )
      return success ? 'ok' : 'retry'
    },
    { deriveKey: nutritionDedupKey },
  )
  return res.flushed
}

export async function getPendingNutritionCount(): Promise<number> {
  return queueCount(kv, NUTRITION_QUEUE_KEY)
}
