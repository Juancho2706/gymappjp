import { supabase } from './supabase'
import { getSantiagoIsoYmdForUtcInstant, getTodayInSantiago, formatRelativeDate } from './date-utils'

export interface WorkoutLogRow {
  id: string
  logged_at: string
  block_id: string
  set_number: number | null
  weight_kg: number | null
  reps_done: number | null
  workout_blocks: { plan_id: string } | null
}

export interface DaySummary {
  dayKey: string
  dateLabel: string
  sets: number
  subtitle: string
}

// Default de la pantalla de historial (armonizado con la web: 90d default, 180d "ver más").
export const HISTORY_DAYS_DEFAULT = 90
export const HISTORY_DAYS_EXTENDED = 180

export async function getWorkoutHistoryFull(clientId: string) {
  const since = new Date(Date.now() - 180 * 86400000).toISOString()
  return supabase
    .from('workout_logs')
    // P1-3: sin !inner → los logs huérfanos (bloque borrado, block_id NULL) siguen contando en el
    // historial. plan_id no se usa en buildDaySummaries (solo logged_at), así que no afecta el conteo.
    .select('id, logged_at, block_id, set_number, weight_kg, reps_done, workout_blocks(plan_id)')
    .eq('client_id', clientId)
    .gte('logged_at', since)
    .order('logged_at', { ascending: false })
    .limit(8000)
}

/**
 * Conteo de series por día AGREGADO EN DB (RPC get_client_workout_day_counts, zona Santiago).
 * Reemplaza el patrón getWorkoutHistoryFull (bajaba hasta 8000 filas crudas) + buildDaySummaries
 * para la pantalla de historial. Paridad 1:1 con web getWorkoutHistoryDayCounts:
 * el map a dateLabel/subtitle es idéntico al de buildDaySummaries.
 */
export async function getWorkoutDaySummaries(
  clientId: string,
  daysBack: number = HISTORY_DAYS_DEFAULT
): Promise<DaySummary[]> {
  const { data, error } = await supabase.rpc('get_client_workout_day_counts', {
    p_client_id: clientId,
    p_days_back: daysBack,
  })
  if (error) {
    // Lanza para que las pantallas distingan "error" de "sin datos" (estado de error con reintento).
    // Los callers que solo quieren degradar a vacío usan `.catch(() => [])`.
    console.warn('[history.queries] day counts failed', error)
    throw error
  }
  const rows = (data ?? []) as { day: string; sets: number }[]
  const todayIso = getTodayInSantiago().iso
  // Orden crudo de la RPC (newest-first): la función SQL ya trae `ORDER BY 1 DESC`
  // (supabase/migrations/20260612051000_rpc_client_workout_day_counts.sql:24), así que
  // NO se re-ordena en cliente — paridad 1:1 con web getWorkoutHistoryDayCounts, que
  // mapea las filas de la MISMA RPC sin re-ordenar (dashboard.queries.ts:225-239) y cuya
  // spec §2 afirma "El orden de días viene de la RPC (no se re-ordena en cliente)". El
  // `.sort()` anterior era redundante con ese ORDER BY; se elimina para alinear ambas
  // superficies al mismo criterio explícito (el del RPC). Consumidores que asumen
  // newest-first (RecentWorkouts.slice(0,5)) siguen correctos. (La racha del perfil ya
  // NO se deriva de aquí: usa el RPC get_client_current_streak, migración 20260723110000.)
  return rows
    .map((r) => ({ dayKey: r.day.slice(0, 10), sets: Number(r.sets) }))
    .map(({ dayKey, sets }) => ({
      dayKey,
      dateLabel: formatRelativeDate(dayKey, todayIso),
      sets,
      subtitle: `${sets} serie${sets !== 1 ? 's' : ''} registrada${sets !== 1 ? 's' : ''}`,
    }))
}

export function buildDaySummaries(logs: WorkoutLogRow[]): DaySummary[] {
  const map = new Map<string, number>()
  for (const log of logs) {
    const dayKey = getSantiagoIsoYmdForUtcInstant(log.logged_at)
    map.set(dayKey, (map.get(dayKey) ?? 0) + 1)
  }
  const todayIso = getTodayInSantiago().iso
  return [...map.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dayKey, sets]) => ({
      dayKey,
      dateLabel: formatRelativeDate(dayKey, todayIso),
      sets,
      subtitle: `${sets} serie${sets !== 1 ? 's' : ''} registrada${sets !== 1 ? 's' : ''}`,
    }))
}

export async function getPersonalRecords(clientId: string) {
  const since14 = new Date(Date.now() - 14 * 86400000).toISOString()
  const [{ data: recentLogs }, { data: allLogs }] = await Promise.all([
    supabase
      .from('workout_logs')
      .select('weight_kg, block_id, logged_at, exercise_id')
      .eq('client_id', clientId)
      .gte('logged_at', since14)
      .not('weight_kg', 'is', null)
      .order('logged_at', { ascending: false })
      .limit(120),
    supabase
      .from('workout_logs')
      .select('weight_kg, block_id, exercise_id')
      .eq('client_id', clientId)
      .not('weight_kg', 'is', null)
      .limit(3000),
  ])

  // P1-3: resolver el ejercicio por el snapshot exercise_id del log; el bloque queda solo como
  // fallback para logs viejos sin snapshot (0 hoy tras backfill) → los huérfanos siguen apareciendo.
  const blockIds = [...new Set([...(recentLogs ?? []), ...(allLogs ?? [])].map((l) => l.block_id).filter(Boolean))]

  const { data: blocks } = blockIds.length === 0 ? { data: [] } : await supabase
    .from('workout_blocks')
    .select('id, exercise_id')
    .in('id', blockIds)

  const logExerciseIds = [...(recentLogs ?? []), ...(allLogs ?? [])].map((l: any) => l.exercise_id).filter(Boolean)
  const exerciseIds = [...new Set([...(blocks ?? []).map((b) => b.exercise_id).filter(Boolean), ...logExerciseIds])]
  const { data: exercises } = await supabase
    .from('exercises')
    .select('id, name')
    .in('id', exerciseIds)

  const nameMap = new Map((exercises ?? []).map((e) => [e.id, e.name]))
  const blockMap = new Map((blocks ?? []).map((b) => [b.id, b.exercise_id]))

  const maxByExercise = new Map<string, number>()
  for (const log of allLogs ?? []) {
    const exId = (log as any).exercise_id ?? blockMap.get(log.block_id)
    if (!exId) continue
    maxByExercise.set(exId, Math.max(maxByExercise.get(exId) ?? 0, log.weight_kg ?? 0))
  }

  const prs: { exerciseId: string; exerciseName: string; weightKg: number; achievedAt: string }[] = []
  const seen = new Set<string>()
  for (const log of recentLogs ?? []) {
    const exId = (log as any).exercise_id ?? blockMap.get(log.block_id)
    if (!exId || seen.has(exId)) continue
    const histMax = maxByExercise.get(exId) ?? 0
    if ((log.weight_kg ?? 0) >= histMax) {
      seen.add(exId)
      prs.push({ exerciseId: exId, exerciseName: nameMap.get(exId) ?? 'Ejercicio', weightKg: log.weight_kg!, achievedAt: log.logged_at })
    }
  }
  return prs.sort((a, b) => b.weightKg - a.weightKg).slice(0, 5)
}

// ── PR detail (progresion de un lift) — E1-04 PRDetailSheet. Espejo del web
//    getExercisePRHistory: agrupa por dia Santiago (top peso + mejor 1RM Epley),
//    hitos = cada vez que el peso tope supero el maximo acumulado. ──
export interface PRHistoryPoint { date: string; topWeightKg: number; estimated1RM: number }
export interface PRMilestone { date: string; weightKg: number; prevKg: number; deltaKg: number }
export interface ExercisePRDetail {
  exerciseId: string
  exerciseName: string
  currentPr: { weightKg: number; achievedAt: string }
  history: PRHistoryPoint[]
  milestones: PRMilestone[]
}

function epleyOneRM(weight: number, reps: number): number {
  return reps <= 1 ? weight : weight * (1 + reps / 30)
}

export async function getExercisePRHistory(clientId: string, exerciseId: string): Promise<ExercisePRDetail | null> {
  const [{ data: logs }, { data: exRow }] = await Promise.all([
    supabase
      .from('workout_logs')
      .select('weight_kg, reps_done, logged_at')
      .eq('client_id', clientId)
      .eq('exercise_id', exerciseId)
      .not('weight_kg', 'is', null)
      .order('logged_at', { ascending: true })
      .limit(2000),
    supabase.from('exercises').select('name').eq('id', exerciseId).maybeSingle(),
  ])

  const rows = (logs ?? []) as { weight_kg: number | null; reps_done: number | null; logged_at: string }[]
  if (rows.length === 0) return null

  type DayAgg = { topWeightKg: number; best1RM: number; topAt: string }
  const byDate = new Map<string, DayAgg>()
  for (const r of rows) {
    if (r.weight_kg == null) continue
    const ymd = getSantiagoIsoYmdForUtcInstant(r.logged_at)
    const reps = Math.max(1, r.reps_done ?? 1)
    const oneRm = epleyOneRM(r.weight_kg, reps)
    const cur = byDate.get(ymd)
    if (!cur) {
      byDate.set(ymd, { topWeightKg: r.weight_kg, best1RM: oneRm, topAt: r.logged_at })
    } else {
      if (r.weight_kg > cur.topWeightKg) { cur.topWeightKg = r.weight_kg; cur.topAt = r.logged_at }
      if (oneRm > cur.best1RM) cur.best1RM = oneRm
    }
  }

  const history: PRHistoryPoint[] = [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([date, v]) => ({ date, topWeightKg: v.topWeightKg, estimated1RM: Math.round(v.best1RM * 10) / 10 }))
  if (history.length === 0) return null

  const milestones: PRMilestone[] = []
  let runningMax = 0
  for (const p of history) {
    if (p.topWeightKg > runningMax) {
      milestones.push({ date: p.date, weightKg: p.topWeightKg, prevKg: runningMax, deltaKg: Math.round((p.topWeightKg - runningMax) * 10) / 10 })
      runningMax = p.topWeightKg
    }
  }

  let best = history[0]
  for (const p of history) if (p.topWeightKg > best.topWeightKg) best = p
  const bestDay = byDate.get(best.date)!

  return {
    exerciseId,
    exerciseName: exRow?.name ?? 'Ejercicio',
    currentPr: { weightKg: best.topWeightKg, achievedAt: bestDay.topAt },
    history,
    milestones,
  }
}
