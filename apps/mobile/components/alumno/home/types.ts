import type { ClientProfile } from '../../../lib/client'
import type { HabitsData } from '../../../lib/habits.queries'
import type { OrgAnnouncement } from '../../../lib/org-announcements'

/**
 * Contrato de datos del dashboard alumno (mobile). El shell (`home.tsx`) hace UN
 * fetch, deriva y alimenta a las secciones presentacionales de este folder — cada
 * seccion vive en su propio archivo (paridad 1:1 con el arbol mobile de la web:
 * `apps/web/src/app/c/[coach_slug]/dashboard/_components/*`).
 */

/** Bloque del plan de hoy para la hero card (nombre + prescripcion). */
export interface HeroBlock {
  id: string
  name: string
  sets: number
  reps: string
}

export interface Plan {
  id: string
  title: string
  day_of_week: number | null
  assigned_date: string | null
  /** Variante A/B del plan (solo relevante en programas ab_mode). Espejo de `workout_plans.week_variant`. */
  week_variant: string | null
  blockCount: number
  blocks: HeroBlock[]
}

/** Fase del programa (mesociclo) — espejo de `program_phases` jsonb. */
export interface ProgramPhase {
  name: string
  weeks: number
  color?: string
}

export interface Program {
  id: string
  name: string
  plans: Plan[]
  phases: ProgramPhase[] | null
  weeksToRepeat: number
  startDate: string | null
  /** Programa A/B (semanas alternadas). Espejo de `workout_programs.ab_mode`. */
  abMode: boolean
}

export interface RecentWorkout {
  id: string
  logged_at: string
  exercise_name_at_log: string | null
}

export interface CheckInPoint {
  date: string
  weight: number | null
}

export interface WelcomeModalConfig {
  enabled: boolean
  content: string
  type: 'text' | 'video'
  version: number
  brandName?: string
}

export interface HomeData {
  client: ClientProfile | null
  /** §1 — avisos activos de la org (vacio si el alumno no tiene org o sin anuncios). */
  announcements: OrgAnnouncement[]
  coachName: string | null
  coachWelcome: string | null
  program: Program | null
  recentWorkouts: RecentWorkout[]
  workoutDates: Set<string>
  /** block_id -> series logueadas HOY (para el progreso de la hero card). */
  todayLoggedByBlock: Map<string, number>
  nutritionDates: Set<string>
  checkIns: CheckInPoint[]
  habitsToday: HabitsData | null
  welcomeModal: WelcomeModalConfig | null
  /** §3 Racha — RPC `get_client_current_streak` (MISMA fuente que web): dias ASIGNADOS hechos; dia sin asignacion = neutro (migracion 20260723110000). */
  streak: number
}

/** Estado de un dia del programa en la semana actual (espejo de `WeekDayStatus`, incluye 'rest' = dia sin plan). */
export type DayStatus = 'today' | 'done' | 'pending' | 'upcoming' | 'rest'

export interface PlanDayView {
  plan: Plan
  status: DayStatus
  isToday: boolean
  /** Fecha ISO YYYY-MM-DD de este dia en la semana actual (para params de navegacion recuperar/fecha). */
  dateIso: string
  /**
   * Si el dia quedo 'done' por una sesion hecha en OTRO dia de esta semana (recuperacion), fecha ISO
   * YYYY-MM-DD de esa sesion; `null` cuando se hizo en su propia fecha (o no esta hecho). Espejo aditivo
   * de `WeekDay.doneOnDate` (web weekPendingWorkouts.ts, atribucion greedy E1.1).
   */
  doneOnDate: string | null
  /** Nombre completo del dia de `doneOnDate` ("Jueves") para el copy "Hecho el jueves". `null` = mismo caso que doneOnDate. */
  doneOnLabel: string | null
}

/** Dia pasado esta semana sin registro → recuperable HOY (delta Fase L / E1-19). */
export interface PendingDay {
  planId: string
  dayOfWeek: number
  dayLabel: string
  /** Fecha ISO YYYY-MM-DD de ese dia en la semana actual (param `recuperar` al ejecutor). */
  dateIso: string
}

// ── Acentos DS FIJOS (rampas constantes, nunca white-label; sport sigue la marca
//    en runtime via theme.primary / clases NativeWind). Mirror TOKENS.md. ──
export const EMBER_400 = '#FF8C66' // fill claro de la barra de racha (web --ember-400, globals.css:405)
export const EMBER_500 = '#FF6A3D' // accent-nutrition / racha
export const EMBER_600 = '#E8511E'
export const EMBER_700 = '#C2410C'
export const AQUA_700 = '#0A6E8D' // hidratacion (habitos)
export const DANGER_600 = '#BE183C'
export const DANGER_500 = '#F4365A'
export const WARNING_500 = '#F5A524'
export const SUCCESS_500 = '#1FB877'

// Etiquetas de dia — verbatim del diseno.
export const WEEK_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'] // Lun..Dom (tira semanal)
export const DAY_SHORT = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] // dbDay 1..7
export const DAY_FULL = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'] // dbDay 1..7 (web DAY_NAMES_FULL)
