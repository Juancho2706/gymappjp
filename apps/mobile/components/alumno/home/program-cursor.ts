/**
 * Adaptador RN del cursor del programa (spec `docs/specs/ciclo-real-y-por-lado`, W3.5) — PURO, sin
 * React ni RN ni Supabase, para que el test lo importe directo (mismo patron que `weekly-streak.ts`).
 *
 * Que hace: traduce lo que el shell del home ya tiene en memoria (el programa activo, sus planes ya
 * filtrados por variante A/B y las filas crudas de la lectura de 30 dias) al input de
 * `@eva/workout-engine` y devuelve el cursor ya listo para pintar.
 *
 * Que NO hace — y es el punto de la tarea: no reimplementa "hoy toca". La regla vive UNA sola vez en
 * el motor (`buildCycleCompletions` → `resolveCycleCursor`, R9/D1) y web y RN la consumen con el
 * MISMO fixture (`CYCLE_CURSOR_FIXTURES`). Antes el home resolvia el dia con
 * `plans.find(p => p.day_of_week === todayDbDay)`, que en un programa `cycle` lee el INDICE del ciclo
 * como si fuera el dia de la semana: un ciclo de 3 dias solo "tenia entreno" lun/mar/mie y el jueves
 * el hero quedaba vacio (feedback Movens 2026-09-03).
 *
 * `programState` (R30) sale del motor tal cual: ninguna superficie vuelve a deducir "no empezo" de
 * `start_date`. Las etiquetas salen de `programDayLabel` (R8/R31) — "Mar" en weekly, "Dia 2 de 3" en
 * ciclo — asi que las secciones nunca vuelven a indexar un arreglo de dias de la semana con un numero
 * que puede llegar hasta 14.
 *
 * PURO, SIN RELOJ: `todayIso` (dia Santiago ya resuelto por `getTodayInSantiago`) entra por
 * parametro, igual que en el motor.
 */
import {
  buildCycleCompletions,
  programDayLabel,
  resolveCycleCursor,
  type CycleCompletionLogRow,
  type CycleCursorPlan,
  type DayCompletionBlock,
} from '@eva/workout-engine'
import type { Plan, Program, ProgramCursorView, ProgramSlotView } from './types'

export interface ProgramCursorInput {
  /** Programa activo del alumno (`null` = sin programa ⇒ cursor vacio). */
  program: Program | null
  /**
   * Planes que participan: YA filtrados por variante A/B y con `day_of_week`, en el orden que pintan
   * las day-cards. El motor no re-filtra ni reordena (contrato de `CycleCursorInput`).
   */
  plans: readonly Plan[]
  /** Filas crudas de la lectura de 30 dias (`HomeData.cycleLogRows`). */
  logs: readonly CycleCompletionLogRow[]
  /** yyyy-mm-dd en America/Santiago (`getTodayInSantiago().iso`). */
  todayIso: string
}

/** Cursor de un alumno SIN programa activo: nada que resolver, nada que pintar. */
const EMPTY_CURSOR: ProgramCursorView = {
  mode: 'weekly',
  programState: 'active',
  todayState: 'todo',
  todayPlanId: null,
  todayCycleIndex: null,
  nextPlanId: null,
  nextCycleIndex: null,
  todayLabel: '',
  nextLabel: '',
  lastCompleted: null,
  slots: [],
}

/**
 * Denominador de cada dia: los bloques VIGENTES del plan (`sets` null/0 = 1 unidad, regla del motor).
 * Ya viajan en el fetch del programa, asi que no hay query extra. Un plan SIN bloques no participa del
 * ciclo (R9): el productor lo descarta solo.
 */
export function blocksByPlanRecord(plans: readonly Plan[]): Record<string, DayCompletionBlock[]> {
  const record: Record<string, DayCompletionBlock[]> = {}
  for (const plan of plans) record[plan.id] = plan.blocks.map((b) => ({ id: b.id, sets: b.sets }))
  return record
}

/**
 * Cursor del programa listo para las secciones del home. Weekly = identidad con la resolucion de
 * siempre; ciclo = cursor por completitud (D1).
 */
export function deriveProgramCursor(input: ProgramCursorInput): ProgramCursorView {
  const { program, plans, logs, todayIso } = input
  if (!program) return EMPTY_CURSOR

  const structure = program.structureType === 'cycle' ? 'cycle' : 'weekly'
  const cycleLength = program.cycleLength
  const cursorPlans: CycleCursorPlan[] = plans.map((p) => ({
    id: p.id,
    day_of_week: p.day_of_week,
    title: p.title,
  }))

  // Productor UNICO de completitud (R9): las mismas filas de 30 dias que consume web.
  const { completions, inProgress } = buildCycleCompletions({
    plans: cursorPlans,
    blocksByPlan: blocksByPlanRecord(plans),
    logs,
    todayIso,
  })

  const cursor = resolveCycleCursor({
    program: {
      program_structure_type: program.structureType,
      cycle_length: cycleLength,
      start_date: program.startDate,
      start_date_flexible: program.startDateFlexible,
    },
    plans: cursorPlans,
    completions,
    inProgress: inProgress ?? null,
    todayIso,
  })

  const titleByPlanId = new Map<string, string | null>()
  for (const plan of plans) if (!titleByPlanId.has(plan.id)) titleByPlanId.set(plan.id, plan.title)

  const label = (index: number | null, form: 'short' | 'long' | 'chip') =>
    programDayLabel(index, structure, cycleLength, { form })

  const slots: ProgramSlotView[] = cursor.slots.map((slot) => ({
    planId: slot.planId,
    cycleIndex: slot.cycleIndex,
    state: slot.state,
    doneDateIso: slot.doneDateIso ?? null,
    title: titleByPlanId.get(slot.planId) ?? null,
    label: label(slot.cycleIndex, 'short'),
    labelLong: label(slot.cycleIndex, 'long'),
    labelChip: label(slot.cycleIndex, 'chip'),
  }))

  return {
    mode: cursor.mode,
    programState: cursor.programState,
    todayState: cursor.todayState,
    todayPlanId: cursor.todayPlanId,
    todayCycleIndex: cursor.todayCycleIndex,
    nextPlanId: cursor.nextPlanId,
    nextCycleIndex: cursor.nextCycleIndex,
    todayLabel: label(cursor.todayCycleIndex, 'long'),
    nextLabel: label(cursor.nextCycleIndex, 'long'),
    lastCompleted: cursor.lastCompleted ?? null,
    slots,
  }
}
