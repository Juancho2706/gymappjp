// Fuerza / tonelaje / PR / desbalance muscular sobre logs PLANOS (WorkoutLogRow).
// Forma canonica: el data layer RN y las RPC entregan filas planas. La web mantiene sus
// wrappers anidados locales (mismo algoritmo) y comparte este kernel (epley, ranking, mappers).

import { shortLabel, startOfWeekMonday } from './dates'
import type {
  DailyTonnageRpcRow,
  ExerciseStrengthSeries,
  MuscleVolumeRow,
  OneRMHistoryPoint,
  SessionTonnagePoint,
  StrengthSeriesRpcRow,
  VolumeImbalance,
  WeeklyPrRpcRow,
  WeeklyWeightPR,
  WorkoutLogRow,
} from './types'

/** 1RM estimado (Epley), alineado con el dashboard del cliente. */
export function epleyOneRM(weightKg: number, reps: number): number {
  if (weightKg <= 0 || reps <= 0) return 0
  return weightKg * (1 + reps / 30)
}

function isKeyCompoundLift(name: string): boolean {
  const n = name.toLowerCase()
  return /banca|bench|press|sentadilla|squat|muerto|deadlift|dead lift/.test(n)
}

/** Por ejercicio y dia natural: mejor 1RM Epley del dia (si empate, mayor peso). */
export function buildExerciseStrengthSeriesMap(logs: WorkoutLogRow[]): Map<string, ExerciseStrengthSeries> {
  type DayBest = { oneRm: number; weightKg: number; reps: number }
  type Acc = { exerciseName: string; muscleGroup: string; byDay: Map<string, DayBest>; totalVolume: number }
  const byEx = new Map<string, Acc>()

  for (const log of logs || []) {
    const w = log.weightKg
    const r = log.reps ?? 0
    if (w == null || w <= 0 || r <= 0 || !log.loggedAt) continue
    const exId = log.exerciseId || `name:${log.exerciseName}`
    const day = log.loggedAt.slice(0, 10)
    const oneRm = epleyOneRM(w, r)
    if (oneRm <= 0) continue
    let acc = byEx.get(exId)
    if (!acc) {
      acc = { exerciseName: log.exerciseName || 'Ejercicio', muscleGroup: log.muscleGroup?.trim() || '—', byDay: new Map(), totalVolume: 0 }
      byEx.set(exId, acc)
    }
    acc.totalVolume += w * r
    const prev = acc.byDay.get(day)
    if (!prev || oneRm > prev.oneRm || (oneRm === prev.oneRm && w > prev.weightKg)) {
      acc.byDay.set(day, { oneRm: Math.round(oneRm * 10) / 10, weightKg: w, reps: r })
    }
  }

  const out = new Map<string, ExerciseStrengthSeries>()
  for (const [exerciseId, acc] of byEx) {
    const keys = [...acc.byDay.keys()].sort()
    const series: OneRMHistoryPoint[] = keys.map((dateKey) => {
      const d = acc.byDay.get(dateKey)!
      return { dateKey, label: shortLabel(dateKey), oneRm: d.oneRm, weightKg: d.weightKg, reps: d.reps }
    })
    if (series.length === 0) continue
    out.set(exerciseId, { exerciseId, exerciseName: acc.exerciseName, muscleGroup: acc.muscleGroup, series, totalVolume: acc.totalVolume })
  }
  return out
}

/** Hasta `maxCards` ejercicios desde logs planos. */
export function selectStrengthCardExercises(logs: WorkoutLogRow[], maxCards = 4): ExerciseStrengthSeries[] {
  return selectStrengthCardsFromSeries([...buildExerciseStrengthSeriesMap(logs).values()], maxCards)
}

// Mismo ranking/criterio que selectStrengthCardExercises pero sobre series YA construidas
// (p.ej. desde la RPC get_client_strength_series, que ya trae total_volume correcto).
// Single-source del ordenamiento para no duplicar isKeyCompoundLift.
export function selectStrengthCardsFromSeries(series: ExerciseStrengthSeries[], maxCards = 4): ExerciseStrengthSeries[] {
  const list = [...series].filter((s) => s.series.length > 0)
  list.sort((a, b) => {
    const ka = isKeyCompoundLift(a.exerciseName) ? 1 : 0
    const kb = isKeyCompoundLift(b.exerciseName) ? 1 : 0
    if (ka !== kb) return kb - ka
    if (b.totalVolume !== a.totalVolume) return b.totalVolume - a.totalVolume
    return b.series.length - a.series.length
  })
  return list.slice(0, maxCards)
}

export function strengthTrendDeltaKg(series: OneRMHistoryPoint[]): number | null {
  if (series.length < 2) return null
  return Math.round((series[series.length - 1]!.oneRm - series[0]!.oneRm) * 10) / 10
}

export function maxOneRMIndex(series: OneRMHistoryPoint[]): number {
  let best = -1
  let idx = 0
  series.forEach((p, i) => {
    if (p.oneRm > best) {
      best = p.oneRm
      idx = i
    }
  })
  return idx
}

/** PR de 1RM Epley en la semana calendario (lunes → hoy). Solo sets con reps ≤ 30. */
export function findWeeklyWeightPRs(logs: WorkoutLogRow[], now: Date = new Date()): WeeklyWeightPR[] {
  const weekStart = startOfWeekMonday(now)
  type Agg = { name: string; muscle: string; before1rm: number; beforeWeightKg: number; beforeReps: number; inWeek1rm: number; inWeekWeightKg: number; inWeekReps: number }
  const byEx = new Map<string, Agg>()
  for (const log of logs || []) {
    const w = log.weightKg
    if (w == null || w <= 0) continue
    const r = log.reps ?? 0
    if (r <= 0 || r > 30 || !log.loggedAt) continue
    const d = new Date(log.loggedAt)
    if (!isFinite(d.getTime())) continue
    const orm = epleyOneRM(w, r)
    if (orm <= 0) continue
    const exId = log.exerciseId || `name:${log.exerciseName}`
    let row = byEx.get(exId)
    if (!row) {
      row = { name: log.exerciseName || 'Ejercicio', muscle: log.muscleGroup?.trim() || '—', before1rm: 0, beforeWeightKg: 0, beforeReps: 0, inWeek1rm: 0, inWeekWeightKg: 0, inWeekReps: 0 }
      byEx.set(exId, row)
    }
    if (d >= weekStart) {
      if (orm > row.inWeek1rm || (orm === row.inWeek1rm && w > row.inWeekWeightKg)) {
        row.inWeek1rm = orm
        row.inWeekWeightKg = w
        row.inWeekReps = r
      }
    } else {
      if (orm > row.before1rm || (orm === row.before1rm && w > row.beforeWeightKg)) {
        row.before1rm = orm
        row.beforeWeightKg = w
        row.beforeReps = r
      }
    }
  }
  const out: WeeklyWeightPR[] = []
  for (const [exerciseId, row] of byEx) {
    if (row.inWeek1rm <= 0 || row.before1rm <= 0 || row.inWeek1rm <= row.before1rm) continue
    const pct = Math.round(((row.inWeek1rm - row.before1rm) / row.before1rm) * 1000) / 10
    out.push({
      exerciseId,
      exerciseName: row.name,
      muscleGroup: row.muscle,
      newWeightKg: row.inWeekWeightKg,
      newReps: row.inWeekReps,
      newOneRm: Math.round(row.inWeek1rm * 10) / 10,
      prevWeightKg: row.beforeWeightKg,
      prevReps: row.beforeReps,
      prevOneRm: Math.round(row.before1rm * 10) / 10,
      pctChange: pct,
    })
  }
  return out.sort((a, b) => b.newOneRm - a.newOneRm)
}

/** Agrupa tonelaje (Σ peso×reps) por dia natural del log; ultimos `maxDays` con actividad + media movil 7. */
export function buildDailyTonnageSeries(logs: WorkoutLogRow[], maxDays = 21): SessionTonnagePoint[] {
  const byDay = new Map<string, number>()
  for (const log of logs || []) {
    const add = (log.weightKg ?? 0) * (log.reps ?? 0)
    if (add <= 0 || !log.loggedAt) continue
    const day = log.loggedAt.slice(0, 10)
    byDay.set(day, (byDay.get(day) ?? 0) + add)
  }
  const slice = [...byDay.keys()].sort().slice(-maxDays)
  const points = slice.map((dateKey) => ({ dateKey, label: shortLabel(dateKey), tonnage: Math.round(byDay.get(dateKey) ?? 0), sessions: 1 }))
  const window = 7
  return points.map((pt, i) => {
    const s = points.slice(Math.max(0, i - window + 1), i + 1)
    return { ...pt, movingAvg: Math.round(s.reduce((acc, p) => acc + p.tonnage, 0) / s.length) }
  })
}

/** Si el grupo con mas volumen supera ≥ `minRatio`× al de menos volumen entre los top `take` grupos. */
export function detectVolumeImbalances(rows: MuscleVolumeRow[], take = 6, minRatio = 2): VolumeImbalance[] {
  const list = [...(rows || [])].filter((r) => r.volume > 0)
  if (list.length < 2) return []
  const top = list.sort((a, b) => b.volume - a.volume).slice(0, take)
  const maxV = top[0]?.volume ?? 0
  const strong = top[0]?.muscleGroup ?? ''
  if (maxV <= 0 || !strong) return []
  const alerts: VolumeImbalance[] = []
  for (let i = 1; i < top.length; i++) {
    const w = top[i]!
    if (w.volume <= 0) continue
    const ratio = maxV / w.volume
    if (ratio >= minRatio) alerts.push({ stronger: strong, weaker: w.muscleGroup, ratio: Math.round(ratio * 10) / 10 })
  }
  return alerts
}

// ── RPC mappers (filas planas → estructuras del dashboard) ─────────────────────

/** `get_client_strength_series` → `Map<string, ExerciseStrengthSeries>`. */
export function mapStrengthSeriesRpc(rows: StrengthSeriesRpcRow[] | null): Map<string, ExerciseStrengthSeries> {
  const out = new Map<string, ExerciseStrengthSeries>()
  if (!rows?.length) return out
  // Las filas ya vienen ORDER BY exercise_id, day ASC → empujamos en orden.
  for (const r of rows) {
    const exId = r.exercise_id
    let entry = out.get(exId)
    if (!entry) {
      entry = {
        exerciseId: exId,
        exerciseName: r.name ?? 'Ejercicio',
        muscleGroup: r.muscle_group?.trim() || '—',
        series: [],
        // total_volume es por-ejercicio: igual en todas las filas → se toma una vez.
        totalVolume: r.total_volume ?? 0,
      }
      out.set(exId, entry)
    }
    const dt = new Date(r.day + 'T12:00:00')
    entry.series.push({
      dateKey: r.day,
      label: dt.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
      oneRm: Math.round((r.one_rm ?? 0) * 10) / 10,
      weightKg: r.weight_kg,
      reps: r.reps_done,
    })
  }
  for (const [exId, entry] of out) {
    if (entry.series.length === 0) out.delete(exId)
  }
  return out
}

/** `get_client_weekly_prs` → `WeeklyWeightPR[]` (orden por 1RM nuevo DESC). */
export function mapWeeklyWeightPRsRpc(rows: WeeklyPrRpcRow[] | null): WeeklyWeightPR[] {
  if (!rows?.length) return []
  return rows
    .map((r) => ({
      exerciseId: r.exercise_id,
      exerciseName: r.name ?? 'Ejercicio',
      muscleGroup: r.muscle_group?.trim() || '—',
      newWeightKg: r.week_weight,
      newReps: r.week_reps,
      newOneRm: Math.round((r.week_1rm ?? 0) * 10) / 10,
      prevWeightKg: r.before_weight,
      prevReps: r.before_reps,
      prevOneRm: Math.round((r.before_1rm ?? 0) * 10) / 10,
      pctChange: r.pct_change,
    }))
    .sort((a, b) => b.newOneRm - a.newOneRm)
}

/** `get_client_daily_tonnage` → `SessionTonnagePoint[]` (mantiene el orden day ASC). */
export function mapDailyTonnageRpc(rows: DailyTonnageRpcRow[] | null): SessionTonnagePoint[] {
  if (!rows?.length) return []
  return rows.map((r) => {
    const d = new Date(r.day + 'T12:00:00')
    return {
      dateKey: r.day,
      label: d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }),
      tonnage: Math.round(r.tonnage ?? 0),
      sessions: r.sessions ?? 1,
      movingAvg: Math.round(r.moving_avg ?? 0),
    }
  })
}
