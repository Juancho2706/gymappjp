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
    .select('id, logged_at, block_id, set_number, weight_kg, reps_done, workout_blocks!inner(plan_id)')
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
    console.warn('[history.queries] day counts failed', error)
    return []
  }
  const rows = (data ?? []) as { day: string; sets: number }[]
  const todayIso = getTodayInSantiago().iso
  return rows
    .map((r) => ({ dayKey: r.day.slice(0, 10), sets: Number(r.sets) }))
    .sort((a, b) => b.dayKey.localeCompare(a.dayKey))
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
      .select('weight_kg, block_id, logged_at')
      .eq('client_id', clientId)
      .gte('logged_at', since14)
      .not('weight_kg', 'is', null)
      .order('logged_at', { ascending: false })
      .limit(120),
    supabase
      .from('workout_logs')
      .select('weight_kg, block_id')
      .eq('client_id', clientId)
      .not('weight_kg', 'is', null)
      .limit(3000),
  ])

  const blockIds = [...new Set([...(recentLogs ?? []), ...(allLogs ?? [])].map((l) => l.block_id))]
  if (blockIds.length === 0) return []

  const { data: blocks } = await supabase
    .from('workout_blocks')
    .select('id, exercise_id')
    .in('id', blockIds)

  const exerciseIds = [...new Set((blocks ?? []).map((b) => b.exercise_id).filter(Boolean))]
  const { data: exercises } = await supabase
    .from('exercises')
    .select('id, name')
    .in('id', exerciseIds)

  const nameMap = new Map((exercises ?? []).map((e) => [e.id, e.name]))
  const blockMap = new Map((blocks ?? []).map((b) => [b.id, b.exercise_id]))

  const maxByExercise = new Map<string, number>()
  for (const log of allLogs ?? []) {
    const exId = blockMap.get(log.block_id)
    if (!exId) continue
    maxByExercise.set(exId, Math.max(maxByExercise.get(exId) ?? 0, log.weight_kg ?? 0))
  }

  const prs: { exerciseId: string; exerciseName: string; weightKg: number; achievedAt: string }[] = []
  const seen = new Set<string>()
  for (const log of recentLogs ?? []) {
    const exId = blockMap.get(log.block_id)
    if (!exId || seen.has(exId)) continue
    const histMax = maxByExercise.get(exId) ?? 0
    if ((log.weight_kg ?? 0) >= histMax) {
      seen.add(exId)
      prs.push({ exerciseId: exId, exerciseName: nameMap.get(exId) ?? exId, weightKg: log.weight_kg!, achievedAt: log.logged_at })
    }
  }
  return prs.sort((a, b) => b.weightKg - a.weightKg).slice(0, 5)
}
