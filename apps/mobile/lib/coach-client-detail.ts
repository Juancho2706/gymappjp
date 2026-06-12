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
  calculateConsumedMacrosWithCompletionFallback,
  normalizeMealForMacros,
  portionPctMapFromMealLogs,
  sumMealMacros,
  type MealWithFoodItems,
} from './nutrition-utils'
import { supabase } from './supabase'

// Coach-side client detail data. Reads via Supabase (RLS: coach sees own clients).
// Mutations (update/archive/review) also use the coach session. Service-role never runs in RN.

export interface CoachClientDetail {
  id: string
  full_name: string
  email: string
  phone: string | null
  is_active: boolean | null
  is_archived: boolean | null
  goal_weight_kg: number | null
  height_cm: number | null
  initial_weight_kg: number | null
  subscription_start_date: string | null
  created_at: string
}

export interface CheckInEntry {
  id: string
  date: string
  created_at: string | null
  weight: number | null
  energy_level: number | null
  notes: string | null
  front_photo_url: string | null
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

export interface NutritionTimelineEntry {
  date: string
  mealsDone: number
  mealsTotal: number
  compliancePct: number
  targetCalories: number
  consumedCalories: number
}

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

function dayOfWeekIso(iso: string): number {
  const jsDay = new Date(`${iso}T12:00:00`).getDay()
  return jsDay === 0 ? 7 : jsDay
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

function checkInRegularityPercent(asOfIso: string, checkIns: CheckInEntry[]): number {
  const latest = checkIns
    .map((row) => row.date.slice(0, 10))
    .filter((date) => date <= asOfIso)
    .sort()
    .pop()
  if (!latest) return 0

  const diffDays = Math.round(
    (new Date(`${asOfIso}T12:00:00`).getTime() - new Date(`${latest}T12:00:00`).getTime()) / 86400000
  )
  if (diffDays <= 7) return 100
  if (diffDays <= 14) return 70
  if (diffDays <= 21) return 45
  if (diffDays <= 30) return 25
  return 0
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

function buildNutritionTimeline(
  todayIso: string,
  rows: any[],
  macroMeals: MealWithFoodItems[],
  goals: { calories: number; protein: number; carbs: number; fats: number }
): NutritionTimelineEntry[] {
  const byDate = new Map<string, any>()
  for (const row of rows) byDate.set(row.log_date, row)

  const out: NutritionTimelineEntry[] = []
  for (let i = 29; i >= 0; i--) {
    const date = isoDateAddDays(todayIso, -i)
    const row = byDate.get(date)
    const logs = ((row?.nutrition_meal_logs ?? []) as any[]).map((log) => ({
      meal_id: String(log.meal_id ?? ''),
      is_completed: !!log.is_completed,
      consumed_quantity: log.consumed_quantity ?? null,
    }))
    const applicableMeals = macroMeals.filter((meal) => {
      const entry = meal as MealWithFoodItems & { day_of_week?: number | null }
      return entry.day_of_week == null || entry.day_of_week === dayOfWeekIso(date)
    })
    const total = logs.length || applicableMeals.length
    const done = logs.filter((log) => log.is_completed).length
    const completedMealIds = new Set(logs.filter((log) => log.is_completed).map((log) => log.meal_id))
    const consumed = calculateConsumedMacrosWithCompletionFallback(
      applicableMeals,
      completedMealIds,
      goals,
      portionPctMapFromMealLogs(logs)
    )
    const targetCalories = Number(row?.target_calories_at_log ?? goals.calories ?? 0)
    out.push({
      date,
      mealsDone: done,
      mealsTotal: total,
      compliancePct: total > 0 ? Math.round((done / total) * 100) : 0,
      targetCalories,
      consumedCalories: Math.round(consumed.calories),
    })
  }
  return out.reverse()
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

export async function getCoachClientDetail(clientId: string): Promise<{
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
  nutritionMonthlyAvgPct: number
  nutritionStreakDays: number
  favoriteFoods: FavoriteFoodEntry[]
  workoutLogs: WorkoutLogRow[]
  workoutLogsAll: WorkoutLogRow[]
  muscleVolumeReps: MuscleVolumeSetsEntry[]
  workoutDates371: string[]
  hasTrained: boolean
}> {
  // Cliente primero (independiente) → el detalle SIEMPRE abre, aunque las queries
  // ricas fallen en una prod sin columnas enterprise/Codex.
  const { data: clientData } = await supabase
    .from('clients')
    .select('id, full_name, email, phone, is_active, is_archived, goal_weight_kg, subscription_start_date, created_at')
    .eq('id', clientId)
    .maybeSingle()
  const baseClient: CoachClientDetail | null = clientData
    ? ({ ...(clientData as any), height_cm: null, initial_weight_kg: null } as CoachClientDetail)
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
    nutritionMonthlyAvgPct: 0,
    nutritionStreakDays: 0,
    favoriteFoods: [] as FavoriteFoodEntry[],
    workoutLogs: [] as WorkoutLogRow[],
    workoutLogsAll: [] as WorkoutLogRow[],
    muscleVolumeReps: [] as MuscleVolumeSetsEntry[],
    workoutDates371: [] as string[],
    hasTrained: false,
  }
  try {
  const { iso: todayIso } = getTodayInSantiago()
  const sevenDaysAgo = isoDateAddDays(todayIso, -7)
  const fourteenDaysAgo = isoDateAddDays(todayIso, -14)
  const thirtyDaysAgo = isoDateAddDays(todayIso, -30)
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
    clientRes,
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
  ] = await Promise.all([
      selectWithFallback<any>(
        () => supabase.from('clients').select('id, full_name, email, phone, is_active, is_archived, goal_weight_kg, height_cm, initial_weight_kg, subscription_start_date, created_at').eq('id', clientId).maybeSingle(),
        () => supabase.from('clients').select('id, full_name, email, phone, is_active, is_archived, goal_weight_kg, subscription_start_date, created_at').eq('id', clientId).maybeSingle()
      ),
      selectWithFallback<any>(
        () => supabase.from('check_ins').select('id, date, created_at, weight, energy_level, notes, front_photo_url, back_photo_url, reviewed_at').eq('client_id', clientId).order('date', { ascending: false }).limit(200),
        () => supabase.from('check_ins').select('id, date, created_at, weight, energy_level, notes, front_photo_url, back_photo_url').eq('client_id', clientId).order('date', { ascending: false }).limit(200)
      ),
      selectWithFallback<any>(
        () => supabase.from('client_payments').select('id, amount, payment_date, service_description, status, period_months, receipt_url').eq('client_id', clientId).order('payment_date', { ascending: false }).limit(20),
        () => supabase.from('client_payments').select('id, amount, payment_date, service_description, status, period_months').eq('client_id', clientId).order('payment_date', { ascending: false }).limit(20)
      ),
      supabase
        .from('workout_programs')
        .select(`
          id, name, start_date, end_date, weeks_to_repeat, program_structure_type, ab_mode, cycle_length,
          workout_plans (
            id, title, day_of_week, week_variant,
            workout_blocks (
              id, order_index, sets, reps, rest_time, tempo, rir, target_weight_kg, notes,
              exercises ( name, muscle_group, gif_url )
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
        .select('log_date, target_calories_at_log, target_protein_at_log, target_carbs_at_log, target_fats_at_log, nutrition_meal_logs ( meal_id, is_completed, consumed_quantity )')
        .eq('client_id', clientId)
        .gte('log_date', thirtyDaysAgo)
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
  const nutritionTimeline = buildNutritionTimeline(todayIso, (nutritionLogsRes.data as any[] | null) ?? [], macroMeals, nutritionGoals)

  const activityByDate = buildActivityWindow(todayIso)
  for (const day of workoutDays30) activityByDate.get(day) && (activityByDate.get(day)!.workout = true)
  for (const row of nutritionRows) activityByDate.get(row.log_date) && (activityByDate.get(row.log_date)!.nutrition = true)
  for (const row of checkIns) {
    const day = row.date.slice(0, 10)
    activityByDate.get(day) && (activityByDate.get(day)!.checkIn = true)
  }

  const richClient = clientRes.data as any
  const client: CoachClientDetail | null = baseClient
    ? { ...baseClient, height_cm: richClient?.height_cm ?? null, initial_weight_kg: richClient?.initial_weight_kg ?? null }
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
      workoutsTarget: Math.max(1, program?.planCount ?? 1),
      nutritionWeeklyAvgPct: nutritionThisWeek,
      nutritionPrevWeeklyAvgPct: nutritionPrevWeek,
      checkInCompliancePercent: checkInRegularityPercent(todayIso, checkIns),
      checkInCompliancePercentWeekAgo: checkInRegularityPercent(sevenDaysAgo, checkIns),
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
    nutritionMonthlyAvgPct: Math.round(
      nutritionTimeline.reduce((sum, row) => sum + row.compliancePct, 0) / Math.max(1, nutritionTimeline.length)
    ),
    nutritionStreakDays: nutritionStreakDays(todayIso, nutritionTimeline),
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
        set_number, weight_kg, reps_done, rpe, logged_at,
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

export async function updateCoachClient(
  clientId: string,
  fields: { full_name?: string; phone?: string | null; goal_weight_kg?: number | null; height_cm?: number | null; initial_weight_kg?: number | null; subscription_start_date?: string | null }
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.from('clients').update(fields).eq('id', clientId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function markCoachCheckInReviewed(clientId: string, checkInId: string): Promise<{ ok: boolean; error?: string }> {
  const { data } = await supabase.auth.getUser()
  const userId = data.user?.id
  if (!userId) return { ok: false, error: 'Unauthorized' }
  const { error } = await supabase
    .from('check_ins')
    .update({ reviewed_at: new Date().toISOString(), reviewed_by: userId })
    .eq('id', checkInId)
    .eq('client_id', clientId)
    .is('reviewed_at', null)
  if (error) {
    if (isMissingColumnError(error)) return { ok: false, error: 'Marcar revisado estará disponible al actualizar tu cuenta.' }
    return { ok: false, error: error.message }
  }
  return { ok: true }
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
        return { ok: false, error: `Alcanzaste el límite de tu plan (${coach.maxClients} alumnos activos). Subí de plan para reactivar.` }
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
