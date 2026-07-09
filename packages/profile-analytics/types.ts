// Tipos compartidos de la analitica de perfil de alumno.
// Consumidos por web (@eva/web) y mobile (apps/mobile) — fuente unica, sin drift.

/** Fila de log PLANA (forma canonica del data layer RN / RPC). */
export interface WorkoutLogRow {
  exerciseId: string
  exerciseName: string
  muscleGroup: string
  weightKg: number | null
  reps: number | null
  loggedAt: string
}

export interface MuscleVolumeRow {
  muscleGroup: string
  volume: number
}

export type OneRMHistoryPoint = {
  dateKey: string
  label: string
  oneRm: number
  weightKg: number
  reps: number
}

export type ExerciseStrengthSeries = {
  exerciseId: string
  exerciseName: string
  muscleGroup: string
  series: OneRMHistoryPoint[]
  totalVolume: number
}

export type WeeklyWeightPR = {
  exerciseId: string
  exerciseName: string
  muscleGroup: string
  newWeightKg: number
  newReps: number
  newOneRm: number
  prevWeightKg: number
  prevReps: number
  prevOneRm: number
  pctChange: number | null
}

export type SessionTonnagePoint = {
  dateKey: string
  label: string
  tonnage: number
  sessions: number
  movingAvg?: number
}

export type VolumeImbalance = {
  stronger: string
  weaker: string
  ratio: number
}

export type ProfileCalendarActivity = { date: string; count: number; level: number }

// ── RPC row shapes (Postgres agrega; el mapper solo re-forma) ──────────────────

/** Fila de `get_client_strength_series` (1 fila por (ejercicio, dia)). */
export type StrengthSeriesRpcRow = {
  exercise_id: string
  name: string
  muscle_group: string
  /** YYYY-MM-DD en zona Santiago. */
  day: string
  one_rm: number
  weight_kg: number
  reps_done: number
  /** Por-ejercicio: identico en todas las filas de ese exercise_id. */
  total_volume: number
}

/** Fila de `get_client_weekly_prs`. */
export type WeeklyPrRpcRow = {
  exercise_id: string
  name: string
  muscle_group: string
  week_weight: number
  week_reps: number
  week_1rm: number
  before_weight: number
  before_reps: number
  before_1rm: number
  pct_change: number
}

/** Fila de `get_client_daily_tonnage`. */
export type DailyTonnageRpcRow = {
  /** YYYY-MM-DD en zona Santiago. */
  day: string
  tonnage: number
  sessions: number
  moving_avg: number
}

// ── Estado unificado del alumno (Hero) ─────────────────────────────────────────

export type ClientStatusLevel = 'ok' | 'attention' | 'urgent'

export type ClientStatusInput = {
  /** Score crudo de calculateAttentionScore (0..~100). Alimenta niveles + tooltip. */
  attentionScore: number
  /** Dias desde el ultimo check-in; null si nunca hubo check-in. */
  daysSinceCheckin: number | null
  /** Dias desde el ultimo workout logueado; null si no hay programa activo o nunca entreno. */
  daysSinceWorkout: number | null
  hasActiveWorkoutProgram: boolean
  /** Adherencia nutricional representativa (0..100); null si no hay plan. */
  nutritionAdherencePct: number | null
  /** Dias restantes del ciclo/programa; null si no hay programa con fechas. */
  planDaysRemaining: number | null
}

export type ClientStatus = {
  level: ClientStatusLevel
  /** Etiqueta ES del badge unico: 'Al dia' | 'Atencion' | 'Urgente'. */
  label: string
  /** 2-3 motivos legibles, ya recortados. Vacio = sin senales de riesgo. */
  reasons: string[]
  /** Score crudo (para tooltip / detalle). */
  score: number
}

// ── Triage banner (getProfileTopAlert) ─────────────────────────────────────────

export type ProfileAlertType = 'warning' | 'danger' | 'info' | 'success'

export type ProfileTopAlert = {
  type: ProfileAlertType
  message: string
}
