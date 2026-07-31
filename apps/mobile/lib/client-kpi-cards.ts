/**
 * Contrato de las 5 KPI cards del Resumen de la ficha del alumno (QA2 A2).
 *
 * El QA de dispositivo mostró los labels truncados a mitad de palabra ("Mejor racha · hi…",
 * "Sesiones · últim…", "Adherencia e…", "Δ Peso (30d) · c…", "Sem. programa …"): el label
 * concatenaba `label · hint` en UNA línea con ellipsis. El contrato nuevo (que la web
 * aplica igual) fija copys CORTOS y auto-explicativos, sin hint concatenado, y los pinta
 * DEBAJO del valor en hasta 2 líneas.
 *
 * Módulo puro (sin RN ni lucide) para que el copy/tono/orden se testee de verdad; la
 * pantalla mapea `icon` → componente lucide y `tone` → clases del DS.
 */

/** Tono del tile del icono. `info` y `neutral` se suman a los 3 de antes (A2). */
export type ClientKpiTone = 'ember' | 'sport' | 'success' | 'info' | 'neutral'

/** Icono lógico; la pantalla lo resuelve al componente lucide correspondiente. */
export type ClientKpiIcon = 'flame' | 'dumbbell' | 'pieChart' | 'scale' | 'calendarDays'

export interface ClientKpiCard {
  key: 'streak' | 'sessions' | 'workoutAdherence' | 'weightDelta' | 'programWeek'
  icon: ClientKpiIcon
  tone: ClientKpiTone
  /** Copy fijo y corto — nunca se concatena con un hint. */
  label: string
  value: string
  /** Tooltip informativo (se conserva el de adherencia). */
  info?: string
  /** La 5ta card ocupa la fila completa del grid de 2 columnas. */
  span: 'half' | 'full'
}

export interface ClientKpiInput {
  /** Racha histórica más larga, en días. */
  longestStreakDays: number
  /** Sesiones con series en los últimos 30 días. */
  sessions30d: number
  /** % de entrenos completados vs objetivo semanal (0-100). */
  workoutAdherencePct: number
  /** Δ de peso a 30 días en kg; `null` si no hay dos check-ins con peso en la ventana. */
  weightDelta30dKg: number | null
  /** Semana actual del programa activo; `null` sin programa o sin fecha de inicio. */
  programCurrentWeek: number | null
  /** Total de semanas del programa activo. */
  programTotalWeeks: number
  /** ¿Hay programa activo? Sin programa la card muestra "—". */
  hasActiveProgram: boolean
}

function formatDays(days: number): string {
  return `${days} día${days === 1 ? '' : 's'}`
}

function formatWeightDelta(kg: number | null): string {
  if (kg == null) return '—'
  return `${kg > 0 ? '+' : ''}${kg} kg`
}

/**
 * Las 5 cards en orden fijo. Los copys son literales del contrato QA2 A2:
 * "Mejor racha" · "Sesiones (30d)" · "Adherencia entreno" · "Δ peso (30d)" · "Semana de programa".
 */
export function buildClientKpiCards(input: ClientKpiInput): ClientKpiCard[] {
  return [
    {
      key: 'streak',
      icon: 'flame',
      tone: 'ember',
      label: 'Mejor racha',
      value: formatDays(input.longestStreakDays),
      span: 'half',
    },
    {
      key: 'sessions',
      icon: 'dumbbell',
      tone: 'sport',
      label: 'Sesiones (30d)',
      value: String(input.sessions30d),
      span: 'half',
    },
    {
      key: 'workoutAdherence',
      icon: 'pieChart',
      tone: 'success',
      label: 'Adherencia entreno',
      value: `${input.workoutAdherencePct}%`,
      info: 'Porcentaje de entrenamientos completados frente al objetivo semanal.',
      span: 'half',
    },
    {
      key: 'weightDelta',
      icon: 'scale',
      tone: 'info',
      label: 'Δ peso (30d)',
      value: formatWeightDelta(input.weightDelta30dKg),
      span: 'half',
    },
    {
      key: 'programWeek',
      icon: 'calendarDays',
      tone: 'neutral',
      label: 'Semana de programa',
      value: input.hasActiveProgram && input.programCurrentWeek != null
        ? `${input.programCurrentWeek} / ${Math.max(1, input.programTotalWeeks)}`
        : '—',
      span: 'full',
    },
  ]
}
