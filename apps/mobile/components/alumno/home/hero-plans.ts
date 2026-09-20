/**
 * Planes del hero del home alumno — PURO, sin React ni RN ni Supabase, para que el test los importe
 * directo (mismo patron que `program-cursor.ts` y `weekly-streak.ts`).
 *
 * Por que existe (punto 4 del SPEC `docs/specs/vuelta-nueva-salud-y-reloj`, feedback Movens 19-09):
 * el shell resolvia el hero de `weekly` con `plans.find(p => p.day_of_week === todayDbDay)` sobre
 * TODOS los planes, sin mirar la variante A/B, aunque el cursor YA recibe los planes filtrados. En
 * semana B el alumno veia el entreno de la semana A. Y en los dias SIN plan `nextPlan` caia a
 * `plans[0]` de una lista ordenada por `day_of_week`, asi que un martes de un Lun/Mie/Vie anunciaba
 * «Proximo: el del lunes» — un dia que ya paso. Las dos cosas se arreglan leyendo del cursor, que es
 * la unica resolucion de «hoy toca» (D1) y ya se comporta como la web
 * (`heroComplianceBundle.ts:256`: siguiente ISODOW con plan, sin dar la vuelta a la semana).
 */
import { programWeekIndex1Based, weekIndexToVariantLetter, effectiveWeekVariantFromPlans, workoutPlanMatchesVariant, type WeekVariantLetter } from '../../../lib/program-week-variant'
import type { Plan, Program, ProgramCursorView } from './types'

/** Lo que el shell necesita de la seleccion: la variante activa (para el badge) y los planes del programa. */
export interface ProgramPlanSelection {
  abMode: boolean
  /** Semana 1-based del programa (`null` sin `start_date`); alimenta tambien `currentWeek` (C3). */
  weekIdx: number | null
  /** Variante A/B EFECTIVA; 'A' cuando el programa no es A/B. */
  activeVariant: WeekVariantLetter
  /** Planes que participan del programa, ya filtrados por variante. Entrada del cursor. */
  programPlans: Plan[]
}

/**
 * Semana del programa + variante A/B EFECTIVA + planes que participan (paridad web
 * `ActiveProgramSection.tsx:37-49` / `weekPendingWorkouts.ts:108-117`): solo en `ab_mode`; cae a la
 * variante que tenga planes si la del ciclo esta vacia (A/B mal armado).
 */
export function selectProgramPlans(
  plans: readonly Plan[],
  program: Program | null | undefined,
  today: Date,
): ProgramPlanSelection {
  const abMode = program?.abMode ?? false
  const weekIdx = program
    ? programWeekIndex1Based({ start_date: program.startDate, weeks_to_repeat: program.weeksToRepeat }, today)
    : null
  const cycleVariant = weekIdx ? weekIndexToVariantLetter(weekIdx) : 'A'
  const activeVariant = effectiveWeekVariantFromPlans(plans, cycleVariant, abMode)
  const programPlans = plans.filter((p) => p.day_of_week != null && workoutPlanMatchesVariant(p, activeVariant, abMode))
  return { abMode, weekIdx, activeVariant, programPlans }
}

/**
 * Hero + «Proximo» desde el cursor, en las DOS estructuras. El cursor ya resolvio el dia (por ISODOW
 * en `weekly`, por completitud en `cycle`) sobre los planes de la variante activa, asi que el shell
 * solo traduce ids a planes. `planById` puede tener TODOS los planes: el cursor nunca devuelve un id
 * que no participe.
 *
 * `nextPlan` se pinta solo en `RestDayCard` (`HeroSection.tsx:94` corta con `if (todayPlan)`), o sea
 * los dias SIN plan; tras el ultimo entreno de la semana queda `null` y el alumno lee «Recupera bien
 * para la proxima sesion.», igual que en la web.
 */
export function heroPlansFromCursor(
  cursor: Pick<ProgramCursorView, 'todayPlanId' | 'nextPlanId'>,
  planById: ReadonlyMap<string, Plan>,
): { todayPlan: Plan | null; nextPlan: Plan | null } {
  return {
    todayPlan: cursor.todayPlanId ? planById.get(cursor.todayPlanId) ?? null : null,
    nextPlan: cursor.nextPlanId ? planById.get(cursor.nextPlanId) ?? null : null,
  }
}
