import type { ClientProfile } from '../../../lib/client'
import type { HabitsData } from '../../../lib/habits.queries'

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
}

/** Estado de un dia del programa en la semana actual (espejo de `WeekDayStatus`). */
export type DayStatus = 'today' | 'done' | 'pending' | 'upcoming'

export interface PlanDayView {
  plan: Plan
  status: DayStatus
  isToday: boolean
}

/** Dia pasado esta semana sin registro → recuperable HOY (delta Fase L / E1-19). */
export interface PendingDay {
  planId: string
  dayOfWeek: number
  dayLabel: string
}

// ── Acentos DS FIJOS (rampas constantes, nunca white-label; sport sigue la marca
//    en runtime via theme.primary / clases NativeWind). Mirror token-contract. ──
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
