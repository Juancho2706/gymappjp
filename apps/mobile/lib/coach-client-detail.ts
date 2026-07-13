import {
  getSantiagoIsoYmdForUtcInstant,
  getSantiagoUtcBoundsForDay,
  getTodayInSantiago,
  isoDateAddDays,
} from './date-utils'
import { isMissingColumnError, selectWithFallback } from './db-compat'
import { getCoachProfile } from './coach'
import type {
  WorkoutLogRow,
  ExerciseStrengthSeries,
  OneRMHistoryPoint,
  SessionTonnagePoint,
  WeeklyWeightPR,
} from './profile-analytics'
import { selectStrengthCardsFromSeries } from './profile-analytics'
import {
  normalizeMealForMacros,
  sumMealMacros,
  type MealWithFoodItems,
} from './nutrition-utils'
import {
  activePlanNutritionComplianceForDay,
  averageNutritionTimelineCompliance,
  buildNutritionTimeline,
  checkInRegularityPercentAsOfSantiago,
  effectiveWorkoutTarget,
  filterTimelineForActivePlan,
  type NutritionTimelineEntry,
} from './coach-client-detail-logic'
import { supabase } from './supabase'
import { apiFetch } from './api'
import type { ClientActionWorkspace } from './client-actions'
import {
  resolveSections,
  resolveDomainEnabled,
  NUTRITION_SECTIONS,
  type SectionPrefs,
  type ModuleKey,
  type NutritionSectionKey,
} from '@eva/feature-prefs'

// Coach-side client detail data. Reads via Supabase (RLS: coach sees own clients).
// Mutations (update/archive/review) also use the coach session. Service-role never runs in RN.

export interface CoachClientDetail {
  id: string
  full_name: string
  email: string
  phone: string | null
  is_active: boolean | null
  is_archived: boolean | null
  org_id: string | null
  team_id: string | null
  goal_weight_kg: number | null
  height_cm: number | null
  initial_weight_kg: number | null
  sex: ClientSex | null
  subscription_start_date: string | null
  created_at: string
}

export const SEX_VALUES = ['male', 'female', 'other'] as const
export type ClientSex = (typeof SEX_VALUES)[number]

export interface CheckInEntry {
  id: string
  date: string
  created_at: string | null
  weight: number | null
  energy_level: number | null
  notes: string | null
  front_photo_url: string | null
  side_photo_url: string | null
  back_photo_url: string | null
  reviewed_at: string | null
}

export interface ActiveNutritionInfo {
  id: string
  name: string
  daily_calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fats_g: number | null
}

export interface NutritionMealPlanEntry {
  id: string
  name: string
  description: string | null
  day_of_week: number | null
  order_index: number
  foodCount: number
  calories: number
  protein: number
  carbs: number
  fats: number
}

export type { NutritionTimelineEntry } from './coach-client-detail-logic'

export interface FavoriteFoodEntry {
  id: string
  name: string
}

export interface PaymentEntry {
  id: string
  amount: number
  payment_date: string
  service_description: string | null
  status: string | null
  period_months: number | null
  receipt_url?: string | null
}

export interface ActiveProgramInfo {
  id: string
  name: string
  planCount: number
  start_date: string | null
  end_date: string | null
  weeks_to_repeat: number
  program_structure_type: string | null
  ab_mode: boolean | null
  cycle_length: number | null
  program_phases: { name: string; weeks: number; color?: string }[]
  workoutPlans: ProgramDay[]
}

export interface ProgramBlock {
  id: string
  order_index: number
  sets: number
  reps: string
  rest_time: string | null
  tempo: string | null
  rir: string | null
  target_weight_kg: number | null
  notes: string | null
  exerciseName: string
  muscleGroup: string | null
  gifUrl: string | null
  thumbnailUrl: string | null
  supersetGroup: string | null
}

export interface ProgramDay {
  id: string
  title: string
  day_of_week: number | null
  week_variant: string | null
  blocks: ProgramBlock[]
}

export interface PersonalRecordEntry {
  exerciseName: string
  muscleGroup: string | null
  maxWeightKg: number
  repsAtMax: number | null
}

export interface MuscleVolumeEntry {
  muscleGroup: string
  volume: number
}

export interface MuscleVolumeSetsEntry {
  muscleGroup: string
  sets: number
  reps: number
}

export interface ComplianceSummary {
  workoutsThisWeek: number
  workoutsPrevWeek: number
  workoutsTarget: number
  nutritionWeeklyAvgPct: number
  nutritionPrevWeeklyAvgPct: number
  checkInCompliancePercent: number
  checkInCompliancePercentWeekAgo: number
}

export interface ActivityDay {
  date: string
  workout: boolean
  nutrition: boolean
  checkIn: boolean
}

export interface WorkoutDaySet {
  exerciseName: string
  muscleGroup: string | null
  setNumber: number | null
  weightKg: number | null
  repsDone: number | null
  rpe: number | null
  rir: number | null
  note: string | null
  substitutedExerciseName: string | null
  substitutionReason: string | null
  targetReps: string | null
  targetWeightKg: number | null
  planName: string | null
}

export interface NutritionDayFood {
  name: string
  quantity: number | null
  unit: string | null
}

export interface NutritionDayMeal {
  name: string
  completed: boolean
  foods: NutritionDayFood[]
}

export interface HabitsDayEntry {
  water_ml: number | null
  steps: number | null
  sleep_hours: number | null
  fasting_hours: number | null
  supplements: string[] | null
  notes: string | null
}

export interface DailyHabitRow extends HabitsDayEntry {
  log_date: string
}

export interface DailyHabitsSummary {
  today: DailyHabitRow | null
  daysLogged: number
  avg: {
    water_ml: number | null
    steps: number | null
    sleep_hours: number | null
    fasting_hours: number | null
  }
}

function summarizeDailyHabits(rows: DailyHabitRow[], todayIso: string): DailyHabitsSummary {
  const average = (key: 'water_ml' | 'steps' | 'sleep_hours' | 'fasting_hours') => {
    const values = rows.map((row) => row[key]).filter((value): value is number => typeof value === 'number')
    return values.length
      ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10
      : null
  }
  return {
    today: rows.find((row) => row.log_date === todayIso) ?? null,
    daysLogged: rows.filter((row) =>
      row.water_ml != null ||
      row.steps != null ||
      row.sleep_hours != null ||
      row.fasting_hours != null ||
      (row.supplements?.length ?? 0) > 0
    ).length,
    avg: {
      water_ml: average('water_ml'),
      steps: average('steps'),
      sleep_hours: average('sleep_hours'),
      fasting_hours: average('fasting_hours'),
    },
  }
}

export interface ClientDayDetail {
  date: string
  workoutSets: WorkoutDaySet[]
  nutritionMeals: NutritionDayMeal[]
  habits: HabitsDayEntry | null
}

function nutritionAveragePct(rows: { nutrition_meal_logs?: { is_completed?: boolean | null }[] | null }[]): number {
  if (!rows.length) return 0
  let sum = 0
  for (const row of rows) {
    const logs = row.nutrition_meal_logs ?? []
    const total = logs.length
    const done = logs.filter((log) => log.is_completed).length
    sum += total > 0 ? (done / total) * 100 : 0
  }
  return Math.round(sum / rows.length)
}

function nutritionStreakDays(todayIso: string, rows: NutritionTimelineEntry[]): number {
  const byDate = new Map(rows.map((row) => [row.date, row]))
  let streak = 0
  for (let i = 0; i < 30; i++) {
    const day = isoDateAddDays(todayIso, -i)
    const row = byDate.get(day)
    if (!row || row.compliancePct < 80) break
    streak++
  }
  return streak
}

function buildActivityWindow(todayIso: string): Map<string, ActivityDay> {
  const out = new Map<string, ActivityDay>()
  for (let i = 29; i >= 0; i--) {
    const date = isoDateAddDays(todayIso, -i)
    out.set(date, { date, workout: false, nutrition: false, checkIn: false })
  }
  return out
}

function buildPersonalRecords(rows: any[]): PersonalRecordEntry[] {
  const byExercise = new Map<string, PersonalRecordEntry>()
  for (const row of rows) {
    const weight = Number(row.weight_kg ?? 0)
    if (weight <= 0) continue
    const block = row.workout_blocks
    const exerciseId = block?.exercise_id
    if (!exerciseId) continue
    const prev = byExercise.get(exerciseId)
    if (prev && weight < prev.maxWeightKg) continue
    byExercise.set(exerciseId, {
      exerciseName: block?.exercises?.name ?? row.exercise_name_at_log ?? 'Ejercicio',
      muscleGroup: block?.exercises?.muscle_group ?? null,
      maxWeightKg: weight,
      repsAtMax: row.reps_done ?? null,
    })
  }
  return [...byExercise.values()].sort((a, b) => b.maxWeightKg - a.maxWeightKg).slice(0, 8)
}

function buildMuscleVolume(rows: any[]): MuscleVolumeEntry[] {
  const volumes = new Map<string, number>()
  for (const row of rows) {
    const volume = Number(row.weight_kg ?? 0) * Number(row.reps_done ?? 0)
    if (volume <= 0) continue
    const group = row.workout_blocks?.exercises?.muscle_group?.trim() || 'Otro'
    volumes.set(group, (volumes.get(group) ?? 0) + volume)
  }
  return [...volumes.entries()]
    .map(([muscleGroup, volume]) => ({ muscleGroup, volume }))
    .sort((a, b) => b.volume - a.volume)
}

// Volumen por SERIES/REPS por grupo — agnóstico al peso (calistenia/cardio).
// Cada fila de workout_logs = 1 serie registrada.
function buildMuscleVolumeBySets(rows: any[]): MuscleVolumeSetsEntry[] {
  const map = new Map<string, { sets: number; reps: number }>()
  for (const row of rows) {
    const group = row.workout_blocks?.exercises?.muscle_group?.trim() || 'Otro'
    const reps = Number(row.reps_done ?? 0)
    const cur = map.get(group) ?? { sets: 0, reps: 0 }
    cur.sets += 1
    cur.reps += reps > 0 ? reps : 0
    map.set(group, cur)
  }
  return [...map.entries()]
    .map(([muscleGroup, v]) => ({ muscleGroup, sets: v.sets, reps: v.reps }))
    .sort((a, b) => b.sets - a.sets)
}

function buildNutritionMeals(rawNutrition: any): { entries: NutritionMealPlanEntry[]; macroMeals: MealWithFoodItems[] } {
  const meals = ((rawNutrition?.nutrition_meals ?? []) as any[])
    .slice()
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))

  const entries: NutritionMealPlanEntry[] = []
  const macroMeals: MealWithFoodItems[] = []
  for (const meal of meals) {
    const foodItems = meal.food_items ?? meal.nutrition_meal_food_items ?? []
    const normalized = normalizeMealForMacros({ ...meal, food_items: foodItems })
    const macros = sumMealMacros(normalized)
    macroMeals.push(normalized)
    entries.push({
      id: meal.id as string,
      name: meal.name ?? 'Comida',
      description: meal.description ?? null,
      day_of_week: meal.day_of_week ?? null,
      order_index: Number(meal.order_index ?? 0),
      foodCount: foodItems.length,
      calories: Math.round(macros.calories),
      protein: Math.round(macros.protein),
      carbs: Math.round(macros.carbs),
      fats: Math.round(macros.fats),
    })
  }
  return { entries, macroMeals }
}

export interface DaySeriesPoint { date: string; v: number }

// Serie diaria de volumen (tonelaje = Σ peso×reps) desde logs ya fetchados.
function buildVolumeSeries(rows: any[]): DaySeriesPoint[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    const d = String(r.logged_at ?? '').slice(0, 10)
    if (!d) continue
    map.set(d, (map.get(d) ?? 0) + (Number(r.weight_kg) || 0) * (Number(r.reps_done) || 0))
  }
  return [...map].sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, v: Math.round(v) }))
}

// Serie diaria de fuerza (mejor 1RM estimado = peso×(1+reps/30)) desde logs ya fetchados.
function buildStrengthSeries(rows: any[]): DaySeriesPoint[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    const d = String(r.logged_at ?? '').slice(0, 10)
    const w = Number(r.weight_kg) || 0
    if (!d || w <= 0) continue
    const e1rm = w * (1 + (Number(r.reps_done) || 0) / 30)
    map.set(d, Math.max(map.get(d) ?? 0, e1rm))
  }
  return [...map].sort((a, b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, v: Math.round(v) }))
}

// Logs crudos (planos) para análisis de fuerza/tonelaje/PR — alimenta lib/profile-analytics.
function buildWorkoutLogRows(rows: any[]): WorkoutLogRow[] {
  const out: WorkoutLogRow[] = []
  for (const row of rows) {
    const block = row.workout_blocks
    const name = block?.exercises?.name ?? row.exercise_name_at_log ?? 'Ejercicio'
    const id = block?.exercise_id ?? `name:${String(name).toLowerCase()}`
    out.push({
      exerciseId: String(id),
      exerciseName: String(name),
      muscleGroup: block?.exercises?.muscle_group ?? null,
      weightKg: row.weight_kg == null ? null : Number(row.weight_kg),
      reps: row.reps_done == null ? null : Number(row.reps_done),
      loggedAt: String(row.logged_at ?? ''),
    })
  }
  return out
}

// ── Mapeo RPC → shapes que consumen los componentes (paridad con web) ─────────
// Las RPC ya AGREGAN en Postgres; aquí solo renombramos snake_case → camelCase y
// reconstruimos las MISMAS estructuras que antes producían los helpers JS
// (buildMuscleVolume, buildPersonalRecords, buildExerciseStrengthSeriesMap →
// selectStrengthCardExercises, buildDailyTonnageSeries, findWeeklyWeightPRs).

// Etiqueta de fecha idéntica a profile-analytics.shortLabel (es-ES, dd + mes corto).
function rpcShortLabel(dayKey: string): string {
  return new Date(`${dayKey.slice(0, 10)}T12:00:00`).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
}

// get_client_muscle_volume → MuscleVolumeEntry[] (orden volume DESC ya viene de la RPC).
function mapMuscleVolumeRpc(rows: any[]): MuscleVolumeEntry[] {
  return (rows ?? [])
    .map((r) => ({ muscleGroup: String(r.muscle_group ?? 'Otro'), volume: Number(r.volume ?? 0) }))
    .filter((r) => r.volume > 0)
}

// get_client_exercise_prs → PersonalRecordEntry[] (1 fila/ejercicio = PR de peso máx).
// Web ordena por peso DESC y corta a 8 (paridad con buildPersonalRecords).
function mapExercisePrsRpc(rows: any[]): PersonalRecordEntry[] {
  return (rows ?? [])
    .map((r) => ({
      exerciseName: String(r.name ?? 'Ejercicio'),
      muscleGroup: r.muscle_group ?? null,
      maxWeightKg: Number(r.max_weight_kg ?? 0),
      repsAtMax: r.reps_at_max == null ? null : Number(r.reps_at_max),
    }))
    .filter((r) => r.maxWeightKg > 0)
    .sort((a, b) => b.maxWeightKg - a.maxWeightKg)
    .slice(0, 8)
}

// get_client_strength_series (filas PLANAS, 1 por ejercicio+día) → ExerciseStrengthSeries[].
// Agrupamos por exercise_id (total_volume es idéntico en todas las filas del ejercicio),
// ordenamos los puntos por día ASC y dejamos que selectStrengthCardExercises (mismo
// criterio que la web) elija las 4 tarjetas.
function mapStrengthSeriesRpc(rows: any[], maxCards = 4): ExerciseStrengthSeries[] {
  type Acc = { exerciseName: string; muscleGroup: string; totalVolume: number; byDay: Map<string, OneRMHistoryPoint> }
  const byEx = new Map<string, Acc>()
  for (const r of rows ?? []) {
    const exId = String(r.exercise_id ?? `name:${String(r.name ?? '').toLowerCase()}`)
    const day = String(r.day ?? '').slice(0, 10)
    if (!day) continue
    let acc = byEx.get(exId)
    if (!acc) {
      acc = {
        exerciseName: String(r.name ?? 'Ejercicio'),
        muscleGroup: (r.muscle_group ?? '').toString().trim() || '—',
        totalVolume: Number(r.total_volume ?? 0),
        byDay: new Map(),
      }
      byEx.set(exId, acc)
    }
    // total_volume es por-ejercicio (idéntico en cada fila) → tomamos el máximo visto.
    acc.totalVolume = Math.max(acc.totalVolume, Number(r.total_volume ?? 0))
    acc.byDay.set(day, {
      dateKey: day,
      label: rpcShortLabel(day),
      oneRm: Math.round(Number(r.one_rm ?? 0) * 10) / 10,
      weightKg: Number(r.weight_kg ?? 0),
      reps: Number(r.reps_done ?? 0),
    })
  }
  const all: ExerciseStrengthSeries[] = []
  for (const [exerciseId, acc] of byEx) {
    const series = [...acc.byDay.keys()].sort().map((k) => acc.byDay.get(k)!)
    if (series.length === 0) continue
    // total_volume viene correcto de la RPC (verdadero total sobre todas las series),
    // NO se recalcula desde los puntos diarios → paridad con el "Volumen total" de la web.
    all.push({ exerciseId, exerciseName: acc.exerciseName, muscleGroup: acc.muscleGroup, series, totalVolume: acc.totalVolume })
  }
  // Mismo ranking/corte que la web (key lifts → volumen → nº sesiones), sobre series ya armadas.
  return selectStrengthCardsFromSeries(all, maxCards)
}

// get_client_daily_tonnage → SessionTonnagePoint[] (orden day ASC; moving_avg ya calculado en DB).
function mapDailyTonnageRpc(rows: any[]): SessionTonnagePoint[] {
  return (rows ?? []).map((r) => ({
    dateKey: String(r.day ?? '').slice(0, 10),
    label: rpcShortLabel(String(r.day ?? '')),
    tonnage: Math.round(Number(r.tonnage ?? 0)),
    sessions: Number(r.sessions ?? 1),
    movingAvg: Math.round(Number(r.moving_avg ?? r.tonnage ?? 0)),
  }))
}

// get_client_weekly_prs (solo ejercicios que mejoraron esta semana) → WeeklyWeightPR[].
function mapWeeklyPrsRpc(rows: any[]): WeeklyWeightPR[] {
  return (rows ?? [])
    .map((r) => ({
      exerciseId: String(r.exercise_id ?? `name:${String(r.name ?? '').toLowerCase()}`),
      exerciseName: String(r.name ?? 'Ejercicio'),
      muscleGroup: (r.muscle_group ?? '').toString().trim() || '—',
      newWeightKg: Number(r.week_weight ?? 0),
      newReps: Number(r.week_reps ?? 0),
      newOneRm: Math.round(Number(r.week_1rm ?? 0) * 10) / 10,
      prevWeightKg: Number(r.before_weight ?? 0),
      prevReps: Number(r.before_reps ?? 0),
      prevOneRm: Math.round(Number(r.before_1rm ?? 0) * 10) / 10,
      pctChange: r.pct_change == null ? null : Math.round(Number(r.pct_change) * 10) / 10,
    }))
    .sort((a, b) => b.newOneRm - a.newOneRm)
}

export async function getCoachClientDetail(clientId: string, workspace?: ClientActionWorkspace): Promise<{
  client: CoachClientDetail | null
  checkIns: CheckInEntry[]
  payments: PaymentEntry[]
  activeProgram: ActiveProgramInfo | null
  activeNutrition: ActiveNutritionInfo | null
  sessions30d: number
  compliance: ComplianceSummary
  activity: ActivityDay[]
  personalRecords: PersonalRecordEntry[]
  muscleVolume: MuscleVolumeEntry[]
  volumeSeries: DaySeriesPoint[]
  strengthSeries: DaySeriesPoint[]
  strengthCards: ExerciseStrengthSeries[]
  tonnageSeries: SessionTonnagePoint[]
  weeklyPRs: WeeklyWeightPR[]
  nutritionMeals: NutritionMealPlanEntry[]
  nutritionTimeline: NutritionTimelineEntry[]
  nutritionMonthlyAvgPct: number | null
  nutritionTodayCompliancePct: number
  nutritionStreakDays: number
  favoriteFoods: FavoriteFoodEntry[]
  workoutLogs: WorkoutLogRow[]
  workoutLogsAll: WorkoutLogRow[]
  muscleVolumeReps: MuscleVolumeSetsEntry[]
  workoutDates371: string[]
  nutritionActivityDates371: string[]
  dailyHabits: DailyHabitRow[]
  dailyHabitsSummary: DailyHabitsSummary
  lastWorkoutAt: string | null
  hasTrained: boolean
}> {
  // Cliente primero (independiente) → el detalle SIEMPRE abre, aunque las queries
  // ricas fallen en una prod sin columnas enterprise/Codex.
  let clientQuery = supabase
    .from('clients')
    .select('id, full_name, email, phone, is_active, is_archived, org_id, team_id, goal_weight_kg, subscription_start_date, created_at')
    .eq('id', clientId)
  if (workspace?.kind === 'team_owner' || workspace?.kind === 'team_member') {
    clientQuery = workspace.teamId
      ? clientQuery.eq('team_id', workspace.teamId).is('org_id', null)
      : clientQuery.eq('team_id', '__invalid_workspace__')
  } else if (workspace?.kind === 'enterprise') {
    clientQuery = workspace.orgId
      ? clientQuery.eq('org_id', workspace.orgId).is('team_id', null)
      : clientQuery.eq('org_id', '__invalid_workspace__')
  } else if (workspace) {
    clientQuery = clientQuery.is('team_id', null).is('org_id', null)
  }
  const { data: clientData, error: clientError } = await clientQuery.maybeSingle()
  if (clientError) throw clientError
  const baseClient: CoachClientDetail | null = clientData
    ? ({ ...(clientData as any), height_cm: null, initial_weight_kg: null, sex: null } as CoachClientDetail)
    : null
  const EMPTY = {
    client: baseClient,
    checkIns: [] as CheckInEntry[],
    payments: [] as PaymentEntry[],
    activeProgram: null as ActiveProgramInfo | null,
    activeNutrition: null as ActiveNutritionInfo | null,
    sessions30d: 0,
    compliance: { workoutsThisWeek: 0, workoutsPrevWeek: 0, workoutsTarget: 1, nutritionWeeklyAvgPct: 0, nutritionPrevWeeklyAvgPct: 0, checkInCompliancePercent: 0, checkInCompliancePercentWeekAgo: 0 },
    activity: [] as ActivityDay[],
    personalRecords: [] as PersonalRecordEntry[],
    muscleVolume: [] as MuscleVolumeEntry[],
    volumeSeries: [] as DaySeriesPoint[],
    strengthSeries: [] as DaySeriesPoint[],
    strengthCards: [] as ExerciseStrengthSeries[],
    tonnageSeries: [] as SessionTonnagePoint[],
    weeklyPRs: [] as WeeklyWeightPR[],
    nutritionMeals: [] as NutritionMealPlanEntry[],
    nutritionTimeline: [] as NutritionTimelineEntry[],
    nutritionMonthlyAvgPct: null,
    nutritionTodayCompliancePct: 0,
    nutritionStreakDays: 0,
    favoriteFoods: [] as FavoriteFoodEntry[],
    workoutLogs: [] as WorkoutLogRow[],
    workoutLogsAll: [] as WorkoutLogRow[],
    muscleVolumeReps: [] as MuscleVolumeSetsEntry[],
    workoutDates371: [] as string[],
    nutritionActivityDates371: [] as string[],
    dailyHabits: [] as DailyHabitRow[],
    dailyHabitsSummary: summarizeDailyHabits([], getTodayInSantiago().iso),
    lastWorkoutAt: null as string | null,
    hasTrained: false,
  }
  if (!baseClient) return EMPTY
  try {
  const { iso: todayIso } = getTodayInSantiago()
  const sevenDaysAgo = isoDateAddDays(todayIso, -7)
  const fourteenDaysAgo = isoDateAddDays(todayIso, -14)
  const habitsFromIso = isoDateAddDays(todayIso, -6)
  const activityStart = isoDateAddDays(todayIso, -371)
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString()

  // Volumen por SERIES (calistenia/cardio): NO hay RPC equivalente (get_client_muscle_volume
  // sólo agrega peso×reps), así que mantenemos un fetch crudo MÍNIMO de 30d sólo para
  // buildMuscleVolumeBySets. El resto del análisis (PRs, volumen con peso, fuerza/1RM,
  // tonelaje, PRs semanales, fechas de actividad, conteo de días) ya viene de RPC agregada.
  const muscleSetsSelect = `
    reps_done,
    workout_blocks (
      exercises ( muscle_group )
    )
  `

  const [
    intakeRes,
    checkInRes,
    paymentRes,
    programRes,
    nutritionRes,
    dayCounts30Res,
    nutritionLogsRes,
    sessionsRes,
    muscleVolumeRes,
    exercisePrsRes,
    strengthSeriesRes,
    tonnageRes,
    weeklyPrsRes,
    activityDatesRes,
    setsLogsRes,
    favoriteFoodsRes,
    dailyHabitsRes,
    lastWorkoutRes,
  ] = await Promise.all([
      // Biometria (talla/peso inicial/sexo) vive en client_intake, NO en clients (esas
      // columnas no existen en clients). El coach la lee por RLS (client_intake_coach FOR ALL).
      // El INSERT placeholder (alumnos sin intake) mete 0 en height/weight NOT NULL → 0 = "sin dato".
      supabase.from('client_intake').select('height_cm, weight_kg, sex').eq('client_id', clientId).maybeSingle(),
      // Tiers defensivos (columna faltante = 400 al select entero → degradar en orden):
      //  1) reviewed_at + side_photo_url  (side = 3ra foto opcional, hoy inexistente en prod)
      //  2) reviewed_at                    (prod actual)  3) base (DB legacy)
      selectWithFallback<any>(
        () => supabase.from('check_ins').select('id, date, created_at, weight, energy_level, notes, front_photo_url, side_photo_url, back_photo_url, reviewed_at').eq('client_id', clientId).order('date', { ascending: false }).limit(200),
        () => selectWithFallback<any>(
          () => supabase.from('check_ins').select('id, date, created_at, weight, energy_level, notes, front_photo_url, back_photo_url, reviewed_at').eq('client_id', clientId).order('date', { ascending: false }).limit(200),
          () => supabase.from('check_ins').select('id, date, created_at, weight, energy_level, notes, front_photo_url, back_photo_url').eq('client_id', clientId).order('date', { ascending: false }).limit(200)
        )
      ),
      selectWithFallback<any>(
        () => supabase.from('client_payments').select('id, amount, payment_date, service_description, status, period_months, receipt_url').eq('client_id', clientId).order('payment_date', { ascending: false }).limit(20),
        () => supabase.from('client_payments').select('id, amount, payment_date, service_description, status, period_months').eq('client_id', clientId).order('payment_date', { ascending: false }).limit(20)
      ),
      supabase
        .from('workout_programs')
        .select(`
          id, name, start_date, end_date, weeks_to_repeat, program_structure_type, ab_mode, cycle_length, program_phases,
          workout_plans (
            id, title, day_of_week, week_variant,
            workout_blocks (
              id, order_index, sets, reps, rest_time, tempo, rir, target_weight_kg, notes, superset_group,
              exercises ( name, muscle_group, gif_url, thumbnail_url )
            )
          )
        `)
        .eq('client_id', clientId)
        .eq('is_active', true)
        .maybeSingle(),
      supabase
        .from('nutrition_plans')
        .select(`
          id, name, daily_calories, protein_g, carbs_g, fats_g,
          nutrition_meals (
            id, name, description, order_index, day_of_week,
            food_items (
              id, quantity, unit, swap_options,
              foods ( id, name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit )
            )
          )
        `)
        .eq('client_id', clientId)
        .eq('is_active', true)
        .maybeSingle(),
      // Conteo de días con series (30d, zona Santiago) → reemplaza el fetch de logged_at crudo.
      supabase.rpc('get_client_workout_day_counts', { p_client_id: clientId, p_days_back: 30 }),
      supabase
        .from('daily_nutrition_logs')
        .select('log_date, plan_id, target_calories_at_log, target_protein_at_log, target_carbs_at_log, target_fats_at_log, nutrition_meal_logs ( meal_id, is_completed, consumed_quantity )')
        .eq('client_id', clientId)
        .gte('log_date', activityStart)
        .order('log_date', { ascending: false }),
      supabase
        .from('workout_sessions' as never)
        .select('date_completed')
        .eq('client_id', clientId)
        .gte('date_completed', fourteenDaysAgo),
      // Volumen muscular con peso (30d) agregado en DB.
      supabase.rpc('get_client_muscle_volume', { p_client_id: clientId, p_days_back: 30 }),
      // PR de peso máximo por ejercicio agregado en DB.
      supabase.rpc('get_client_exercise_prs', { p_client_id: clientId }),
      // Serie de fuerza (1RM) por ejercicio/día agregada en DB.
      supabase.rpc('get_client_strength_series', { p_client_id: clientId }),
      // Tonelaje diario + media móvil agregado en DB.
      supabase.rpc('get_client_daily_tonnage', { p_client_id: clientId, p_max_days: 21 }),
      // PRs 1RM de la semana agregados en DB.
      supabase.rpc('get_client_weekly_prs', { p_client_id: clientId }),
      // Fechas con actividad del último año (zona Santiago) agregadas en DB.
      supabase.rpc('get_client_activity_dates', { p_client_id: clientId, p_days_back: 371 }),
      // Fallback por SERIES (sin RPC): fetch crudo mínimo 30d.
      supabase
        .from('workout_logs')
        .select(muscleSetsSelect)
        .eq('client_id', clientId)
        .gte('logged_at', since30),
      supabase
        .from('client_food_preferences' as never)
        .select('food_id, foods ( id, name )')
        .eq('client_id' as never, clientId as never)
        .eq('preference_type' as never, 'favorite' as never)
        .limit(20),
      supabase
        .from('daily_habits')
        .select('log_date, water_ml, steps, sleep_hours, fasting_hours, supplements, notes')
        .eq('client_id', clientId)
        .gte('log_date', habitsFromIso)
        .order('log_date', { ascending: false }),
      // TopAlert necesita un instante real; una fecha YYYY-MM-DD se parsea como UTC y
      // produce falsos >=7 dias cerca del cierre del dia en Santiago.
      supabase.rpc('get_clients_last_workout_date', {
        p_client_ids: [clientId],
        p_since: getSantiagoUtcBoundsForDay(activityStart).startIso,
      }),
    ])

  const rawProgram = programRes.data as any
  const program = rawProgram
    ? {
        id: rawProgram.id as string,
        name: rawProgram.name as string,
        start_date: rawProgram.start_date ?? null,
        end_date: rawProgram.end_date ?? null,
        weeks_to_repeat: Number(rawProgram.weeks_to_repeat ?? 1),
        program_structure_type: rawProgram.program_structure_type ?? null,
        ab_mode: rawProgram.ab_mode ?? null,
        cycle_length: rawProgram.cycle_length ?? null,
        program_phases: (Array.isArray(rawProgram.program_phases) ? rawProgram.program_phases : []).map((phase: any) => ({
          name: String(phase?.name ?? 'Fase'),
          weeks: Math.max(1, Number(phase?.weeks) || 1),
          ...(typeof phase?.color === 'string' ? { color: phase.color } : {}),
        })),
        workoutPlans: ((rawProgram.workout_plans ?? []) as any[])
          .map((plan) => ({
            id: plan.id as string,
            title: plan.title as string,
            day_of_week: plan.day_of_week ?? null,
            week_variant: plan.week_variant ?? null,
            blocks: ((plan.workout_blocks ?? []) as any[])
              .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
              .map((block) => ({
                id: block.id as string,
                order_index: Number(block.order_index ?? 0),
                sets: Number(block.sets ?? 0),
                reps: String(block.reps ?? ''),
                rest_time: block.rest_time ?? null,
                tempo: block.tempo ?? null,
                rir: block.rir ?? null,
                target_weight_kg: block.target_weight_kg ?? null,
                notes: block.notes ?? null,
                exerciseName: block.exercises?.name ?? 'Ejercicio',
                muscleGroup: block.exercises?.muscle_group ?? null,
                gifUrl: block.exercises?.gif_url ?? null,
                thumbnailUrl: block.exercises?.thumbnail_url ?? null,
                supersetGroup: block.superset_group ?? null,
              })),
          }))
          .sort((a, b) => (a.day_of_week ?? 99) - (b.day_of_week ?? 99)),
        planCount: ((rawProgram.workout_plans ?? []) as any[]).length,
      }
    : null

  const checkIns = (checkInRes.data as CheckInEntry[] | null) ?? []
  // Días con series (30d) — la RPC ya devuelve `day` en zona Santiago (YYYY-MM-DD).
  const workoutDays30 = new Set<string>()
  for (const row of (dayCounts30Res.data as { day: string; sets: number }[] | null) ?? []) {
    if (row.day) workoutDays30.add(row.day.slice(0, 10))
  }
  // Fechas de actividad del último año — RPC en zona Santiago (YYYY-MM-DD).
  const workoutDays371 = new Set<string>()
  for (const row of (activityDatesRes.data as { day: string }[] | null) ?? []) {
    if (row.day) workoutDays371.add(row.day.slice(0, 10))
  }

  const workoutThisWeek = new Set<string>()
  const workoutPrevWeek = new Set<string>()
  const sessionRows = (sessionsRes.data as unknown as { date_completed?: string | null }[] | null) ?? []
  if (sessionRows.length > 0) {
    for (const row of sessionRows) {
      const day = row.date_completed?.slice(0, 10)
      if (!day) continue
      if (day >= sevenDaysAgo) workoutThisWeek.add(day)
      else if (day >= fourteenDaysAgo) workoutPrevWeek.add(day)
    }
  } else {
    for (const day of workoutDays30) {
      if (day >= sevenDaysAgo) workoutThisWeek.add(day)
      else if (day >= fourteenDaysAgo) workoutPrevWeek.add(day)
    }
  }

  const nutritionRows =
    (nutritionLogsRes.data as unknown as { log_date: string; nutrition_meal_logs?: { is_completed?: boolean | null }[] | null }[] | null) ?? []
  const nutritionThisWeek = nutritionAveragePct(nutritionRows.filter((row) => row.log_date >= sevenDaysAgo))
  const nutritionPrevWeek = nutritionAveragePct(
    nutritionRows.filter((row) => row.log_date >= fourteenDaysAgo && row.log_date < sevenDaysAgo)
  )
  const rawNutrition = nutritionRes.data as any
  const dailyHabits = ((dailyHabitsRes.data as DailyHabitRow[] | null) ?? [])
  const { entries: nutritionMeals, macroMeals } = buildNutritionMeals(rawNutrition)
  for (const meal of macroMeals as (MealWithFoodItems & { day_of_week?: number | null })[]) {
    const matching = nutritionMeals.find((entry) => entry.id === meal.id)
    meal.day_of_week = matching?.day_of_week ?? null
  }
  const nutritionGoals = {
    calories: Number(rawNutrition?.daily_calories ?? 0),
    protein: Number(rawNutrition?.protein_g ?? 0),
    carbs: Number(rawNutrition?.carbs_g ?? 0),
    fats: Number(rawNutrition?.fats_g ?? 0),
  }
  const activeNutritionPlanId = typeof rawNutrition?.id === 'string' ? rawNutrition.id : null
  const nutritionTimeline = buildNutritionTimeline(
    todayIso,
    (nutritionLogsRes.data as any[] | null) ?? [],
    macroMeals as (MealWithFoodItems & { day_of_week?: number | null })[],
    nutritionGoals,
    activeNutritionPlanId,
  )
  const activePlanTimeline = filterTimelineForActivePlan(nutritionTimeline, activeNutritionPlanId)
  const nutritionTodayCompliancePct = activePlanNutritionComplianceForDay(
    todayIso,
    (nutritionLogsRes.data as any[] | null) ?? [],
    macroMeals as (MealWithFoodItems & { day_of_week?: number | null })[],
    activeNutritionPlanId,
  )
  const lastWorkoutAt = String(((lastWorkoutRes.data as any[] | null) ?? [])[0]?.last_logged_at ?? '') || null

  const activityByDate = buildActivityWindow(todayIso)
  for (const day of workoutDays30) activityByDate.get(day) && (activityByDate.get(day)!.workout = true)
  for (const row of nutritionRows) activityByDate.get(row.log_date) && (activityByDate.get(row.log_date)!.nutrition = true)
  for (const row of checkIns) {
    const day = row.date.slice(0, 10)
    activityByDate.get(day) && (activityByDate.get(day)!.checkIn = true)
  }

  const intake = intakeRes.data as { height_cm?: number | null; weight_kg?: number | null; sex?: string | null } | null
  // Placeholder 0 (INSERT sin dato) → null al leer (se muestra "—").
  const intakeNum = (v: unknown): number | null => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null }
  const rawSex = intake?.sex
  const intakeSex: ClientSex | null = rawSex === 'male' || rawSex === 'female' || rawSex === 'other' ? rawSex : null
  const client: CoachClientDetail | null = baseClient
    ? { ...baseClient, height_cm: intakeNum(intake?.height_cm), initial_weight_kg: intakeNum(intake?.weight_kg), sex: intakeSex }
    : null

  return {
    client,
    checkIns,
    payments: (paymentRes.data as PaymentEntry[] | null) ?? [],
    activeProgram: program,
    activeNutrition: rawNutrition
      ? {
          id: rawNutrition.id,
          name: rawNutrition.name,
          daily_calories: rawNutrition.daily_calories ?? null,
          protein_g: rawNutrition.protein_g ?? null,
          carbs_g: rawNutrition.carbs_g ?? null,
          fats_g: rawNutrition.fats_g ?? null,
        }
      : null,
    sessions30d: workoutDays30.size,
    compliance: {
      workoutsThisWeek: workoutThisWeek.size,
      workoutsPrevWeek: workoutPrevWeek.size,
      workoutsTarget: effectiveWorkoutTarget(program),
      nutritionWeeklyAvgPct: nutritionThisWeek,
      nutritionPrevWeeklyAvgPct: nutritionPrevWeek,
      checkInCompliancePercent: checkInRegularityPercentAsOfSantiago(todayIso, checkIns),
      checkInCompliancePercentWeekAgo: checkInRegularityPercentAsOfSantiago(sevenDaysAgo, checkIns),
    },
    activity: Array.from(activityByDate.values()).reverse(),
    // ── Análisis de entrenamiento: AGREGADO EN DB (RPC), no iterando logs crudos en JS ──
    personalRecords: mapExercisePrsRpc(exercisePrsRes.data as any[]),
    muscleVolume: mapMuscleVolumeRpc(muscleVolumeRes.data as any[]),
    // volumeSeries/strengthSeries (DaySeriesPoint) sin consumidores actuales → stub vacío.
    volumeSeries: [],
    strengthSeries: [],
    strengthCards: mapStrengthSeriesRpc(strengthSeriesRes.data as any[], 4),
    tonnageSeries: mapDailyTonnageRpc(tonnageRes.data as any[]),
    weeklyPRs: mapWeeklyPrsRpc(weeklyPrsRes.data as any[]),
    nutritionMeals,
    nutritionTimeline,
    nutritionMonthlyAvgPct: averageNutritionTimelineCompliance(activePlanTimeline),
    nutritionTodayCompliancePct,
    nutritionStreakDays: nutritionStreakDays(todayIso, activePlanTimeline),
    favoriteFoods: (((favoriteFoodsRes.data as any[] | null) ?? [])
      .map((row) => row.foods)
      .filter(Boolean) as any[])
      .map((food) => ({ id: food.id as string, name: food.name as string })),
    // workoutLogs/workoutLogsAll (logs planos) ya no se calculan en cliente — el análisis
    // viene precomputado de RPC. Se dejan vacíos por compatibilidad de tipo.
    workoutLogs: [],
    workoutLogsAll: [],
    muscleVolumeReps: buildMuscleVolumeBySets((setsLogsRes.data as any[] | null) ?? []),
    workoutDates371: [...workoutDays371].sort(),
    nutritionActivityDates371: nutritionRows
      .filter((row) => (row.nutrition_meal_logs ?? []).some((meal) => meal.is_completed === true))
      .map((row) => row.log_date)
      .sort(),
    dailyHabits,
    dailyHabitsSummary: summarizeDailyHabits(dailyHabits, todayIso),
    lastWorkoutAt,
    hasTrained:
      workoutDays371.size > 0 ||
      workoutDays30.size > 0 ||
      ((exercisePrsRes.data as any[] | null)?.length ?? 0) > 0 ||
      ((muscleVolumeRes.data as any[] | null)?.length ?? 0) > 0 ||
      ((strengthSeriesRes.data as any[] | null)?.length ?? 0) > 0,
  }
  } catch (e) {
    console.warn('[coach-client-detail] partial load', e)
    return EMPTY
  }
}

export type CoachClientDetailData = Awaited<ReturnType<typeof getCoachClientDetail>>

export async function getCoachClientDayDetail(clientId: string, date: string): Promise<ClientDayDetail> {
  const { startIso, endIso } = getSantiagoUtcBoundsForDay(date)
  const [workoutRes, nutritionRes, habitsRes] = await Promise.all([
    supabase
      .from('workout_logs')
      .select(`
        set_number, weight_kg, reps_done, rpe, rir, note, substituted_exercise_name, substitution_reason,
        target_reps_at_log, target_weight_at_log, plan_name_at_log, logged_at,
        workout_blocks (
          exercises ( name, muscle_group )
        )
      `)
      .eq('client_id', clientId)
      .gte('logged_at', startIso)
      .lt('logged_at', endIso)
      .order('logged_at'),
    supabase
      .from('daily_nutrition_logs')
      .select(`
        log_date,
        nutrition_meal_logs (
          is_completed,
          nutrition_meals ( name, order_index, food_items ( quantity, unit, foods ( name ) ) )
        )
      `)
      .eq('client_id', clientId)
      .eq('log_date', date)
      .maybeSingle(),
    supabase
      .from('daily_habits')
      .select('water_ml, steps, sleep_hours, fasting_hours, supplements, notes')
      .eq('client_id', clientId)
      .eq('log_date', date)
      .maybeSingle(),
  ])

  const workoutSets = ((workoutRes.data as any[] | null) ?? []).map((row) => ({
    exerciseName: row.workout_blocks?.exercises?.name ?? 'Ejercicio',
    muscleGroup: row.workout_blocks?.exercises?.muscle_group ?? null,
    setNumber: row.set_number ?? null,
    weightKg: row.weight_kg ?? null,
    repsDone: row.reps_done ?? null,
    rpe: row.rpe ?? null,
    rir: row.rir ?? null,
    note: row.note ?? null,
    substitutedExerciseName: row.substituted_exercise_name ?? null,
    substitutionReason: row.substitution_reason ?? null,
    targetReps: row.target_reps_at_log ?? null,
    targetWeightKg: row.target_weight_at_log ?? null,
    planName: row.plan_name_at_log ?? null,
  }))

  const nutritionMeals = (((nutritionRes.data as any)?.nutrition_meal_logs ?? []) as any[])
    .sort((a, b) => (a.nutrition_meals?.order_index ?? 0) - (b.nutrition_meals?.order_index ?? 0))
    .map((row) => ({
      name: row.nutrition_meals?.name ?? 'Comida',
      completed: !!row.is_completed,
      foods: ((row.nutrition_meals?.food_items ?? []) as any[]).map((fi) => ({
        name: fi.foods?.name ?? 'Alimento',
        quantity: fi.quantity ?? null,
        unit: fi.unit ?? null,
      })),
    }))

  return {
    date,
    workoutSets,
    nutritionMeals,
    habits: (habitsRes.data as HabitsDayEntry | null) ?? null,
  }
}

// Columnas editables de `clients` (allowlist grantada a authenticated: full_name/phone/
// goal_weight_kg/subscription_start_date). height_cm/initial_weight_kg NO existen en clients
// (viven en client_intake) → biometria va por upsertClientBiometrics, no por aca.
export async function updateCoachClient(
  clientId: string,
  fields: { full_name?: string; phone?: string | null; goal_weight_kg?: number | null; subscription_start_date?: string | null },
  workspace?: ClientActionWorkspace,
): Promise<{ ok: boolean; error?: string }> {
  if (workspace) {
    try {
      await apiFetch(`/api/mobile/coach/clients/${clientId}`, {
        method: 'PATCH',
        authenticated: true,
        body: { ...fields, workspace },
      })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'No se pudo actualizar el alumno.' }
    }
  }
  const { error } = await supabase.from('clients').update(fields).eq('id', clientId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// Espejo del write-path web `upsertClientBiometrics` (services/client/client-detail.service.ts):
// el coach edita talla/peso inicial/sexo de la intake de SU alumno como `authenticated`
// (RLS `client_intake_coach` FOR ALL; grants de columna confirmados por la auditoria E0-B1).
// UPSERT manual: ~15 alumnos no tienen fila y height_cm/weight_kg/goals/experience_level/
// availability son NOT NULL sin default → INSERT con placeholders (0 / '') en lo no editado.
export async function upsertClientBiometrics(
  clientId: string,
  input: { heightCm: number | null; weightKg: number | null; sex: ClientSex | null },
  workspace?: ClientActionWorkspace,
): Promise<{ ok: boolean; error?: string }> {
  const { heightCm, weightKg, sex } = input
  if (heightCm != null && (!Number.isFinite(heightCm) || heightCm < 50 || heightCm > 260)) {
    return { ok: false, error: 'La altura debe estar entre 50 y 260 cm.' }
  }
  if (weightKg != null && (!Number.isFinite(weightKg) || weightKg < 20 || weightKg > 400)) {
    return { ok: false, error: 'El peso debe estar entre 20 y 400 kg.' }
  }
  if (sex != null && !SEX_VALUES.includes(sex)) return { ok: false, error: 'Sexo invalido.' }

  try {
    await apiFetch(`/api/mobile/coach/clients/${clientId}/biometrics`, {
      method: 'PATCH',
      authenticated: true,
      body: { heightCm, weightKg, sex, ...(workspace ? { workspace } : {}) },
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'No se pudo guardar la biometría.' }
  }
}

async function setCoachCheckInReviewed(
  clientId: string,
  checkInId: string,
  reviewed: boolean,
  workspace?: ClientActionWorkspace,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await apiFetch(`/api/mobile/coach/clients/${clientId}/check-ins/${checkInId}/reviewed`, {
      method: 'PATCH',
      authenticated: true,
      body: { reviewed, ...(workspace ? { workspace } : {}) },
    })
    return { ok: true }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'No se pudo actualizar el check-in.' }
  }
}

export function markCoachCheckInReviewed(clientId: string, checkInId: string, workspace?: ClientActionWorkspace) {
  return setCoachCheckInReviewed(clientId, checkInId, true, workspace)
}

export function unmarkCoachCheckInReviewed(clientId: string, checkInId: string, workspace?: ClientActionWorkspace) {
  return setCoachCheckInReviewed(clientId, checkInId, false, workspace)
}

export async function setCoachClientArchived(clientId: string, archived: boolean): Promise<{ ok: boolean; error?: string }> {
  // A-F13 (parcial): al REACTIVAR, rechequear el límite del plan (la web bloquea si está lleno).
  // El email de archivado/reactivado sigue requiriendo endpoint server (Resend).
  if (!archived) {
    const coach = await getCoachProfile()
    if (coach?.maxClients && coach.maxClients > 0) {
      const { count } = await supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', coach.id)
        .eq('is_archived', false)
      if ((count ?? 0) >= coach.maxClients) {
        return { ok: false, error: `Alcanzaste el límite de tu plan (${coach.maxClients} alumnos activos). Sube de plan para reactivar.` }
      }
    }
  }
  const { error } = await supabase.from('clients').update({ is_archived: archived }).eq('id', clientId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteCoachClientPayment(clientId: string, paymentId: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('client_payments').delete().eq('id', paymentId).eq('client_id', clientId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ── Zona C de nutrición (coach) ──────────────────────────────────────────────
// Espejo 1:1 de NutritionTabB5 zona C + sus services web (nutrition-notes.service,
// nutrient-targets.service, feature-prefs.service). Write-paths = mismos que web: PostgREST
// como el coach `authenticated` (las server actions web NO usan service-role → RLS es el gate,
// idéntico aquí). La resolución de secciones reusa el paquete puro `@eva/feature-prefs` (cero
// copia de lógica); el entitlement se computa leyendo `coaches/teams.enabled_modules` directo
// (patrón sancionado del paquete) + el kill-switch/flag server-only del endpoint /api/mobile/config.

export interface CoachPrivateNoteEntry { id: string; body: string; created_at: string | null; updated_at: string | null }
export interface CoachMealCommentEntry { id: string; authorRole: 'coach' | 'client'; body: string; created_at: string }
export interface CoachNutrientTargetEntry {
  id: string
  client_id: string | null
  nutrient_key: string
  intent: 'aimup' | 'cap'
  floor_value: number | null
  target_value: number | null
  ceiling_value: number | null
}
export type NutritionEntitledByModule = Partial<Record<ModuleKey, boolean>>

export interface NutritionZoneCData {
  privateNotes: CoachPrivateNoteEntry[]
  mealComments: CoachMealCommentEntry[]
  nutrientTargets: CoachNutrientTargetEntry[]
  /** Override crudo `client_feature_prefs.sections` (parcial). Key ausente => heredar. */
  override: SectionPrefs
  /** Resolver SIN la capa del alumno (lo que se hereda de coach/team) — estado "heredar". */
  baseEffective: Record<NutritionSectionKey, boolean>
  /** Resolver CON el override del alumno (visibilidad efectiva para el gating de la tab). */
  effective: Record<NutritionSectionKey, boolean>
  entitledByModule: NutritionEntitledByModule
  domainEnabledBase: boolean
  useTeamBase: boolean
  prefsEnabled: boolean
  proEnabled: boolean
}

export async function getCoachNutritionZoneC(clientId: string, logDate: string): Promise<NutritionZoneCData> {
  const { data: userData } = await supabase.auth.getUser()
  const coachId = userData.user?.id ?? ''

  // Flag Edge Config (FEATURE_PREFS_ENABLED) + kill-switch de operador — server-only, vía el
  // endpoint mobile. Fail-OPEN: cualquier fallo => prefs ignoradas = mostrar todo lo entitled.
  let disabledModules: string[] = []
  let prefsEnabled = false
  try {
    const cfg = await apiFetch<{ disabledModules?: string[]; featurePrefsEnabled?: boolean }>('/api/mobile/config', { authenticated: true })
    disabledModules = cfg.disabledModules ?? []
    prefsEnabled = cfg.featurePrefsEnabled === true
  } catch { /* fail-open */ }

  const [notesRes, commentsRes, targetsRes, overrideRes, clientRes] = await Promise.all([
    supabase.from('nutrition_private_notes').select('id, body, created_at, updated_at').eq('client_id', clientId).order('updated_at', { ascending: false }),
    supabase.from('nutrition_meal_comments').select('id, author_role, body, created_at').eq('client_id', clientId).eq('log_date', logDate).order('created_at', { ascending: true }),
    supabase.from('nutrient_targets').select('id, client_id, nutrient_key, intent, floor_value, target_value, ceiling_value').eq('coach_id', coachId).or(`client_id.eq.${clientId},client_id.is.null`).order('nutrient_key', { ascending: true }),
    supabase.from('client_feature_prefs').select('sections').eq('client_id', clientId).eq('domain', 'nutrition').maybeSingle(),
    supabase.from('clients').select('team_id, org_id').eq('id', clientId).maybeSingle(),
  ])

  const teamId = (clientRes.data as any)?.team_id ?? null
  const orgId = (clientRes.data as any)?.org_id ?? null
  const useTeamBase = !!teamId && !orgId

  // Base de preferencias: team si el alumno vive en un pool (base = team), si no el coach.
  const baseRes = useTeamBase
    ? await supabase.from('team_feature_prefs').select('preset, sections').eq('team_id', teamId).eq('domain', 'nutrition').maybeSingle()
    : await supabase.from('coach_feature_prefs').select('preset, sections').eq('coach_id', coachId).eq('domain', 'nutrition').maybeSingle()
  const basePreset = ((baseRes.data as any)?.preset ?? null) as string | null
  const baseSections = (((baseRes.data as any)?.sections ?? null)) as SectionPrefs | null

  // Entitlement por módulo (fail-closed). Pool-wins: el team decide; si no, el coach dueño.
  // Enterprise (org) => sin resolución client-side de módulos => todo false (mismo fail-closed web).
  let enabledModules: Record<string, unknown> = {}
  if (useTeamBase) {
    const { data } = await supabase.from('teams').select('enabled_modules').eq('id', teamId).maybeSingle()
    enabledModules = ((data as any)?.enabled_modules ?? {}) as Record<string, unknown>
  } else if (!orgId) {
    const { data } = await supabase.from('coaches').select('enabled_modules').eq('id', coachId).maybeSingle()
    enabledModules = ((data as any)?.enabled_modules ?? {}) as Record<string, unknown>
  }
  const ent = (k: ModuleKey): boolean => enabledModules[k] === true && !disabledModules.includes(k)
  const entitledByModule: NutritionEntitledByModule = {
    cardio: ent('cardio'),
    movement_assessment: ent('movement_assessment'),
    body_composition: ent('body_composition'),
    nutrition_exchanges: ent('nutrition_exchanges'),
  }

  const override = (((overrideRes.data as any)?.sections ?? {})) as SectionPrefs

  const resolveInput = (clientSections: SectionPrefs | null) => ({
    domain: 'nutrition' as const,
    entitledByModule,
    preset: basePreset,
    useTeamBase,
    coachSections: useTeamBase ? null : baseSections,
    teamSections: useTeamBase ? baseSections : null,
    clientSections,
  })

  // Flag OFF/ausente/Edge caído => fail-OPEN: mostrar TODO lo entitled (comportamiento de HOY, espejo web).
  const failOpen = (): Record<NutritionSectionKey, boolean> => {
    const out = {} as Record<NutritionSectionKey, boolean>
    for (const s of NUTRITION_SECTIONS) {
      out[s.key] = s.core ? true : s.requiresModule ? entitledByModule[s.requiresModule] === true : true
    }
    return out
  }

  const baseEffective = prefsEnabled ? (resolveSections(resolveInput(null)) as Record<NutritionSectionKey, boolean>) : failOpen()
  const effective = prefsEnabled ? (resolveSections(resolveInput(override)) as Record<NutritionSectionKey, boolean>) : failOpen()
  const domainEnabledBase = prefsEnabled ? resolveDomainEnabled(resolveInput(null)) : true

  return {
    privateNotes: (((notesRes.data as any[] | null) ?? [])).map((n) => ({ id: String(n.id), body: String(n.body ?? ''), created_at: n.created_at ?? null, updated_at: n.updated_at ?? null })),
    mealComments: (((commentsRes.data as any[] | null) ?? [])).map((c) => ({ id: String(c.id), authorRole: c.author_role === 'coach' ? 'coach' : 'client', body: String(c.body ?? ''), created_at: String(c.created_at ?? '') })),
    nutrientTargets: (((targetsRes.data as any[] | null) ?? [])).map((t) => ({
      id: String(t.id),
      client_id: t.client_id ?? null,
      nutrient_key: String(t.nutrient_key),
      intent: t.intent === 'cap' ? 'cap' : 'aimup',
      floor_value: t.floor_value ?? null,
      target_value: t.target_value ?? null,
      ceiling_value: t.ceiling_value ?? null,
    })),
    override,
    baseEffective,
    effective,
    entitledByModule,
    domainEnabledBase,
    useTeamBase,
    prefsEnabled,
    proEnabled: effective.micros_advanced === true,
  }
}

// Nota privada del coach (una viva por par coach↔alumno). Espejo de NutritionNotesService.upsertPrivateNote.
export async function upsertCoachPrivateNote(clientId: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const trimmed = body.trim()
  if (!trimmed) return { ok: false, error: 'La nota no puede estar vacía.' }
  const { data: userData } = await supabase.auth.getUser()
  const coachId = userData.user?.id
  if (!coachId) return { ok: false, error: 'No autorizado.' }
  const { data: existing } = await supabase
    .from('nutrition_private_notes')
    .select('id')
    .eq('coach_id', coachId)
    .eq('client_id', clientId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if ((existing as any)?.id) {
    const { error } = await supabase.from('nutrition_private_notes').update({ body: trimmed, updated_at: new Date().toISOString() }).eq('id', (existing as any).id)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }
  const { error } = await supabase.from('nutrition_private_notes').insert({ coach_id: coachId, client_id: clientId, body: trimmed })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// Comentario bidireccional (author_role='coach', anclado al día) sobre la bitácora del alumno.
// Espejo de NutritionNotesService.addMealComment. author_id = uid de la sesión (nunca del body).
export async function addCoachMealComment(clientId: string, logDate: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const trimmed = body.trim()
  if (!trimmed) return { ok: false, error: 'El comentario no puede estar vacío.' }
  const { data: userData } = await supabase.auth.getUser()
  const authorId = userData.user?.id
  if (!authorId) return { ok: false, error: 'No autorizado.' }
  const { error } = await supabase.from('nutrition_meal_comments').insert({
    client_id: clientId, meal_log_id: null, log_date: logDate, body: trimmed, author_id: authorId, author_role: 'coach',
  })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// Umbral de micronutriente por (coach, alumno, nutriente). Espejo de NutrientTargetsService.upsertNutrientTarget.
// El gate de "Nutrición Pro" (micros avanzados) se aplica en la UI (solo se ofrecen si proEnabled);
// RLS garantiza la pertenencia coach↔alumno igual que la server action web.
export async function upsertCoachNutrientTarget(input: {
  clientId: string
  nutrientKey: string
  intent: 'aimup' | 'cap'
  floorValue: number | null
  targetValue: number | null
  ceilingValue: number | null
}): Promise<{ ok: boolean; error?: string }> {
  if (input.floorValue == null && input.targetValue == null && input.ceilingValue == null) {
    return { ok: false, error: 'Define al menos un umbral (piso, meta o techo).' }
  }
  const { data: userData } = await supabase.auth.getUser()
  const coachId = userData.user?.id
  if (!coachId) return { ok: false, error: 'No autorizado.' }
  const { data: existing } = await supabase
    .from('nutrient_targets')
    .select('id')
    .eq('coach_id', coachId)
    .eq('client_id', input.clientId)
    .eq('nutrient_key', input.nutrientKey)
    .maybeSingle()
  const payload = {
    coach_id: coachId,
    client_id: input.clientId,
    nutrient_key: input.nutrientKey,
    floor_value: input.floorValue,
    target_value: input.targetValue,
    ceiling_value: input.ceilingValue,
    intent: input.intent,
    provenance: 'manual',
    updated_at: new Date().toISOString(),
  }
  if ((existing as any)?.id) {
    const { error } = await supabase.from('nutrient_targets').update(payload).eq('id', (existing as any).id)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  }
  const { error } = await supabase.from('nutrient_targets').insert(payload)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// Override por-alumno de la zona "Funciones" (client_feature_prefs.sections). Escribe SOLO el
// jsonb de secciones (RLS coach-owner es el gate) — NUNCA toca enabled_modules ni borra datos.
// Espejo de feature-prefs.actions.setClientFeaturePrefs.
export async function setClientNutritionOverride(clientId: string, sections: SectionPrefs): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('client_feature_prefs')
    .upsert({ client_id: clientId, domain: 'nutrition', sections, updated_at: new Date().toISOString() }, { onConflict: 'client_id,domain' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
