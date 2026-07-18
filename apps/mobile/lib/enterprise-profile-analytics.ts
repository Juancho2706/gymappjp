import {
  buildDailyTonnageSeries,
  findWeeklyWeightPRs,
  selectStrengthCardExercises,
  type ExerciseStrengthSeries,
  type SessionTonnagePoint,
  type WeeklyWeightPR,
  type WorkoutLogRow,
} from '@eva/profile-analytics'
import { getSantiagoIsoYmdForUtcInstant, isoDateAddDays } from './date-utils'

/**
 * Fallback puro para la ficha enterprise.
 *
 * Los RPC SECURITY DEFINER de analitica conservan un guard legacy que no reconoce
 * asignaciones enterprise. El read directo de workout_logs si queda protegido por RLS;
 * este mapper solo reconstruye localmente las mismas formas que consumen los tabs.
 */

export type EnterpriseExerciseMeta = {
  name: string
  muscleGroup: string | null
}

export type EnterpriseAnalyticsLogDbRow = {
  exercise_id?: string | null
  exercise_name_at_log?: string | null
  weight_kg?: number | null
  reps_done?: number | null
  logged_at?: string | null
  workout_blocks?: {
    exercise_id?: string | null
    exercises?: { name?: string | null; muscle_group?: string | null } | null
  } | null
}

export type EnterpriseActivityLogDbRow = { logged_at?: string | null }

export type EnterprisePersonalRecord = {
  exerciseName: string
  muscleGroup: string | null
  maxWeightKg: number
  repsAtMax: number | null
}

export type EnterpriseMuscleVolume = { muscleGroup: string; volume: number }

export type EnterpriseProfileAnalyticsFallback = {
  personalRecords: EnterprisePersonalRecord[]
  muscleVolume: EnterpriseMuscleVolume[]
  strengthCards: ExerciseStrengthSeries[]
  tonnageSeries: SessionTonnagePoint[]
  weeklyPRs: WeeklyWeightPR[]
  workoutDates371: string[]
  workoutDayCounts30: { day: string; sets: number }[]
  lastWorkoutAt: string | null
  hasTrained: boolean
}

function normalizeBlock(value: EnterpriseAnalyticsLogDbRow['workout_blocks']) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null
}

export function mapEnterpriseWorkoutLogs(
  rows: EnterpriseAnalyticsLogDbRow[],
  exerciseMeta: ReadonlyMap<string, EnterpriseExerciseMeta> = new Map(),
): WorkoutLogRow[] {
  const out: WorkoutLogRow[] = []
  for (const row of rows) {
    if (!row.logged_at) continue
    const block = normalizeBlock(row.workout_blocks)
    const exerciseId = block?.exercise_id ?? row.exercise_id ?? null
    if (!exerciseId) continue
    const meta = exerciseMeta.get(exerciseId)
    const exerciseName = block?.exercises?.name?.trim() || meta?.name?.trim() || row.exercise_name_at_log?.trim() || 'Ejercicio'
    const muscleGroup = block?.exercises?.muscle_group?.trim() || meta?.muscleGroup?.trim() || '—'
    // Los helpers compartidos agrupan por loggedAt.slice(0, 10). Normalizamos primero
    // el instante al dia calendario de Santiago para no heredar la TZ del dispositivo.
    const santiagoDay = getSantiagoIsoYmdForUtcInstant(row.logged_at)
    out.push({
      exerciseId,
      exerciseName,
      muscleGroup,
      weightKg: row.weight_kg == null ? null : Number(row.weight_kg),
      reps: row.reps_done == null ? null : Number(row.reps_done),
      loggedAt: `${santiagoDay}T12:00:00`,
    })
  }
  return out
}

function buildPersonalRecords(logs: WorkoutLogRow[]): EnterprisePersonalRecord[] {
  const best = new Map<string, EnterprisePersonalRecord>()
  for (const log of logs) {
    const weight = Number(log.weightKg ?? 0)
    if (weight <= 0) continue
    const prev = best.get(log.exerciseId)
    // Input ordenado ascendente: en empate gana el log mas reciente, como el RPC.
    if (prev && weight < prev.maxWeightKg) continue
    best.set(log.exerciseId, {
      exerciseName: log.exerciseName,
      muscleGroup: log.muscleGroup === '—' ? null : log.muscleGroup,
      maxWeightKg: weight,
      repsAtMax: log.reps,
    })
  }
  return [...best.values()].sort((a, b) => b.maxWeightKg - a.maxWeightKg).slice(0, 8)
}

function buildMuscleVolume(logs: WorkoutLogRow[]): EnterpriseMuscleVolume[] {
  const volume = new Map<string, number>()
  for (const log of logs) {
    const add = Number(log.weightKg ?? 0) * Number(log.reps ?? 0)
    if (add <= 0) continue
    const group = log.muscleGroup?.trim() && log.muscleGroup !== '—' ? log.muscleGroup.trim() : 'Otro'
    volume.set(group, (volume.get(group) ?? 0) + add)
  }
  return [...volume]
    .map(([muscleGroup, value]) => ({ muscleGroup, volume: value }))
    .sort((a, b) => b.volume - a.volume)
}

export function buildEnterpriseProfileAnalyticsFallback(
  analyticsRows: EnterpriseAnalyticsLogDbRow[],
  activityRows: EnterpriseActivityLogDbRow[],
  todayIso: string,
  exerciseMeta: ReadonlyMap<string, EnterpriseExerciseMeta> = new Map(),
  now: Date = new Date(),
): EnterpriseProfileAnalyticsFallback {
  const logs = mapEnterpriseWorkoutLogs(analyticsRows, exerciseMeta)
  // Paridad exacta con get_client_muscle_volume(..., 30): ventana de instante
  // `logged_at >= now() - interval '30 days'`, no 30 dias calendario Santiago.
  const muscleCutoffMs = now.getTime() - 30 * 86_400_000
  const muscleLogs = mapEnterpriseWorkoutLogs(
    analyticsRows.filter((row) => {
      if (!row.logged_at) return false
      const time = new Date(row.logged_at).getTime()
      return Number.isFinite(time) && time >= muscleCutoffMs
    }),
    exerciseMeta,
  )
  const activityDays = new Map<string, number>()
  let lastWorkoutAt: string | null = null
  const activityStart = isoDateAddDays(todayIso, -371)
  // Paridad exacta con get_client_workout_day_counts(..., 30): SQL usa
  // `dia_santiago >= hoy_santiago - 30`, inclusivo.
  const dayCountsStart = isoDateAddDays(todayIso, -30)

  for (const row of activityRows) {
    if (!row.logged_at) continue
    const day = getSantiagoIsoYmdForUtcInstant(row.logged_at)
    if (day < activityStart || day > todayIso) continue
    activityDays.set(day, (activityDays.get(day) ?? 0) + 1)
    if (!lastWorkoutAt || row.logged_at > lastWorkoutAt) lastWorkoutAt = row.logged_at
  }

  const santiagoNow = new Date(`${todayIso}T12:00:00`)
  return {
    personalRecords: buildPersonalRecords(logs),
    muscleVolume: buildMuscleVolume(muscleLogs),
    // Infinity es intencional: el tab filtra por musculo y debe conservar TODAS las cards.
    strengthCards: selectStrengthCardExercises(logs, Number.POSITIVE_INFINITY),
    tonnageSeries: buildDailyTonnageSeries(logs, 21),
    weeklyPRs: findWeeklyWeightPRs(logs, santiagoNow),
    workoutDates371: [...activityDays.keys()].sort(),
    workoutDayCounts30: [...activityDays]
      .filter(([day]) => day >= dayCountsStart)
      .map(([day, sets]) => ({ day, sets }))
      .sort((a, b) => b.day.localeCompare(a.day)),
    lastWorkoutAt,
    hasTrained: activityDays.size > 0 || logs.length > 0,
  }
}
