import { differenceInCalendarWeeks, parseISO } from 'date-fns'

export type NutritionCycleBlock = {
  week_start: number
  week_end: number
  template_id: string
  label: string
}

/**
 * Índice de semana 1-based desde start_date (misma semana calendario que start = semana 1).
 * Busca el bloque que contiene esa semana.
 */
export function resolveNutritionCycleBlockForDate(
  startDateIso: string,
  blocks: NutritionCycleBlock[],
  todayIso: string
): { weekIndex: number; block: NutritionCycleBlock | null } {
  const start = parseISO(`${startDateIso}T12:00:00`)
  const today = parseISO(`${todayIso}T12:00:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(today.getTime())) {
    return { weekIndex: 0, block: null }
  }
  if (today < start) return { weekIndex: 0, block: null }
  const weekIndex = differenceInCalendarWeeks(today, start) + 1
  const sorted = [...blocks].sort((a, b) => a.week_start - b.week_start)
  for (const b of sorted) {
    if (weekIndex >= b.week_start && weekIndex <= b.week_end) {
      return { weekIndex, block: b }
    }
  }
  return { weekIndex, block: null }
}
