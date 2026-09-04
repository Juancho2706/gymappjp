import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Sentry from '@sentry/react-native'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { WorkoutLogMetadata } from '@eva/workout-engine'
import { toggleMealCompletion } from './nutrition.queries'
import { getSantiagoIsoYmdForUtcInstant, getSantiagoUtcBoundsForDay } from './date-utils'
import { enqueueOp, flushQueue, queueCount, queueDueCount, type AsyncKV, type FlushSummary } from './offline-queue'

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
  // Ejes tipados + sustitución (deuda GRAVE #1 · specs/cardio-ejes-y-fixes): sin estos campos una
  // ronda de cardio/movilidad/roller encolada sin red subía con minutos/distancia/FC/pace/hold/lados
  // en NULL (y perdía la sustitución). Aditivo y retrocompatible: entradas viejas en AsyncStorage no
  // traen las keys (⇒ undefined ⇒ no viajan al insert/update) y el drain de `flushLogQueue` ya
  // spreadea el item completo menos `queued_at`, así que no necesita cambios.
  actual_duration_sec?: number | null
  actual_distance_m?: number | null
  actual_pace_sec_per_km?: number | null
  actual_hold_sec?: number | null
  actual_avg_hr?: number | null
  /**
   * jsonb `workout_logs.metadata` COMPLETO, con el tipo del motor (`WorkoutLogMetadata`) en vez de
   * un literal propio: hold por lado de movilidad `{left_sec, right_sec}` (E0.5), reps por lado de
   * fuerza `{left_reps, right_reps}` (R27) y el resto de las claves que ya transporta la columna.
   * El literal anterior declaraba SÓLO los segundos, así que la cola prometía por tipo que perdía
   * los lados de fuerza aunque el drain (spread del item) los subiera igual.
   */
  metadata?: WorkoutLogMetadata | null
  substituted_exercise_id?: string | null
  substituted_exercise_name?: string | null
  substitution_reason?: string | null
  exercise_name_at_log: string | null
  queued_at: string
  /**
   * Fecha objetivo `yyyy-mm-dd` (Santiago) cuando la serie se encoló EDITANDO un día PASADO (`?fecha`).
   * Cambia dos cosas del drenaje: la ventana del día es ÉSTA (no la del `queued_at`) y el modo es
   * SOLO-UPDATE — sin fila que corregir se DESCARTA permanentemente, jamás se inserta (espejo del
   * `past_set_not_found` de la action web, que la cola web trata como fallo permanente). Es metadato de
   * la cola: NUNCA viaja como columna a `workout_logs`. Ausente (todo item legacy / sesión normal) ⇒
   * comportamiento previo byte-idéntico: ventana del `queued_at` y upsert con INSERT.
   */
  target_date?: string
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
//
// El día de la clave es el día al que la serie ESCRIBE: `target_date` cuando se está editando una fecha
// pasada, el día del `queued_at` en una sesión normal. Sin esa distinción, corregir el martes con la red
// caída colapsaba contra la serie de hoy del mismo block:set (misma clave) y una de las dos se perdía.

function workoutDedupKey(l: { client_id: string; block_id: string; set_number: number; queued_at?: string; target_date?: string }): string {
  const day = l.target_date ?? getSantiagoIsoYmdForUtcInstant(l.queued_at ?? new Date().toISOString())
  return `${l.client_id}:${l.block_id}:${l.set_number}:${day}`
}

/**
 * Scope opcional de la cola de series — equivalente RN del `{ planId }` de la web. El payload persistido
 * NO lleva `plan_id` (ver `PendingLog`), así que el plan viaja como el conjunto de `block_id` de la
 * sesión: lo que sabe el ejecutor sin cambiar el formato guardado (un APK viejo sigue siendo legible).
 * Sin scope, todo se comporta como antes (cola global).
 */
export interface LogQueueScope {
  blockIds?: readonly string[]
}

function scopeFilter(scope?: LogQueueScope): ((l: PendingLog) => boolean) | undefined {
  const ids = scope?.blockIds
  if (!ids || ids.length === 0) return undefined
  const set = new Set(ids)
  return (l) => set.has(l.block_id)
}

export async function enqueueLog(log: Omit<PendingLog, 'queued_at'>): Promise<void> {
  const payload: PendingLog = { ...log, queued_at: new Date().toISOString() }
  await enqueueOp(kv, LOG_QUEUE_KEY, workoutDedupKey(payload), payload, workoutDedupKey)
}

/**
 * Drena la cola de series y devuelve el RESUMEN COMPLETO (`flushed` + `discarded` + `remaining`).
 *
 * Antes devolvía sólo `flushed` y tiraba `discarded` a la basura: un descarte 23503 (bloque borrado por
 * un reseed del plan) es una serie que el alumno YA entrenó y que no va a llegar al server NUNCA, así que
 * silenciarlo era pérdida de datos invisible — y peor, dejaba al chip del ejecutor en "Todo sincronizado"
 * verde. Los consumidores necesitan el descarte para avisar (espejo del `OfflineWorkoutQueueSync` web).
 *
 * Descartes permanentes hoy: `23503` (FK del bloque borrado) y `past_set_not_found` (item con
 * `target_date` cuya serie no existe en esa fecha ⇒ el solo-UPDATE no puede insertarla).
 */
export async function flushLogQueue(supabase: SupabaseClient, scope?: LogQueueScope): Promise<FlushSummary> {
  const res = await flushQueue<PendingLog>(
    kv,
    LOG_QUEUE_KEY,
    async (item) => {
      // `queued_at` y `target_date` son metadato de la cola: se sacan del payload para que NUNCA viajen
      // como columnas (`target_date` no existe en `workout_logs` → PGRST204 y la serie se perdería).
      const { queued_at, target_date, ...log } = item
      const loggedAt = queued_at || new Date().toISOString()
      // Ventana del día: la fecha editada manda; si no, el día del encolado (el día real del entreno).
      const dayIso = target_date ?? getSantiagoIsoYmdForUtcInstant(loggedAt)
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
        if (target_date) {
          // Modo SOLO-UPDATE (edición de día pasado): sin fila en esa fecha no hay nada que corregir y
          // JAMÁS se inserta. Descarte PERMANENTE, no 'retry': reintentar con backoff contra una fila que
          // no existe es un loop infinito (por eso la cola web mete `past_set_not_found` en
          // PERMANENT_FAILURE_CODES). Se deja rastro en Sentry igual que el descarte 23503.
          try {
            Sentry.captureMessage('workout-offline-queue: descarte past_set_not_found', {
              // fingerprint fijo: sin él Sentry agrupa por el nombre de la función del stack (EVA-MOBILE-9/C).
              fingerprint: ['workout-offline-queue', 'discard', 'past_set_not_found'],
              level: 'warning',
              tags: { area: 'workout-offline-queue', platform: 'rn', discard_code: 'past_set_not_found' },
              extra: { blockId: log.block_id, setNumber: log.set_number, targetDate: target_date },
            })
          } catch {
            // Sentry no inicializado (sin DSN) / versión sin API → no-op silencioso.
          }
          return 'discard'
        }
        const ins = await supabase.from('workout_logs').insert({ ...log, logged_at: loggedAt })
        if (ins.error) {
          const code = (ins.error as { code?: string }).code
          // 23505 = el índice único de prod ya tiene la fila (otro flush/optimista la insertó primero) →
          // éxito idempotente, drenar. 23503 = FK del bloque borrado (reseed) → descartar, no loopear.
          if (code === '23505') return 'ok'
          if (code === '23503') {
            // Descarte = pérdida REAL de un dato ya entrenado. Se deja rastro en Sentry para triage
            // (mismo evento que emite la web en `OfflineWorkoutQueueSync`); el aviso al alumno lo da
            // el consumidor con el `discarded` del resumen.
            try {
              Sentry.captureMessage('workout-offline-queue: descarte 23503', {
                fingerprint: ['workout-offline-queue', 'discard', '23503'],
                level: 'warning',
                tags: { area: 'workout-offline-queue', platform: 'rn', discard_code: '23503' },
                extra: { blockId: log.block_id, setNumber: log.set_number },
              })
            } catch {
              // Sentry no inicializado (sin DSN) / versión sin API → no-op silencioso.
            }
            return 'discard'
          }
          return 'retry'
        }
        return 'ok'
      } catch {
        return 'retry'
      }
    },
    { deriveKey: workoutDedupKey, filter: scopeFilter(scope) },
  )
  return res
}

/** Series sin subir (incluye las que aún esperan su backoff) — conteo de BADGE. */
export async function getPendingLogCount(scope?: LogQueueScope): Promise<number> {
  return queueCount<PendingLog>(kv, LOG_QUEUE_KEY, { deriveKey: workoutDedupKey, filter: scopeFilter(scope) })
}

/**
 * Series sin subir VENCIDAS: las que un flush intentaría ahora mismo. Es el conteo que debe gatear los
 * avisos disparados por el alumno (p.ej. Finalizar): `getPendingLogCount` cuenta también las que siguen
 * en backoff y avisaba "hay pendientes" sin haber intentado nada.
 */
export async function getDueLogCount(scope?: LogQueueScope): Promise<number> {
  return queueDueCount<PendingLog>(kv, LOG_QUEUE_KEY, { deriveKey: workoutDedupKey, filter: scopeFilter(scope) })
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
