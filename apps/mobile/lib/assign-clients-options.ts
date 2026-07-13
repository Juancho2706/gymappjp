export interface AssignClientsOptions {
  startDateFlexible: boolean
  startDate: string
  durationWeeks: number
  selectedDays: number[]
}

export const ASSIGN_CLIENTS_DEFAULT_DURATION_WEEKS = 4

export const ASSIGN_CLIENT_DAY_OPTIONS = [
  { id: 1, label: 'Lun' },
  { id: 2, label: 'Mar' },
  { id: 3, label: 'Mié' },
  { id: 4, label: 'Jue' },
  { id: 5, label: 'Vie' },
  { id: 6, label: 'Sáb' },
  { id: 7, label: 'Dom' },
] as const

/** Valida una fecha calendario real, no solo la forma YYYY-MM-DD. */
export function isValidIsoYmd(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const parsed = new Date(Date.UTC(year, month - 1, day, 12))
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
}

export function clampAssignDurationWeeks(value: string | number): number {
  if (typeof value === 'string' && !value.trim()) return ASSIGN_CLIENTS_DEFAULT_DURATION_WEEKS
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return ASSIGN_CLIENTS_DEFAULT_DURATION_WEEKS
  return Math.max(1, Math.min(52, Math.trunc(parsed)))
}

export function defaultAssignClientsOptions(todaySantiagoIso: string): AssignClientsOptions {
  return {
    startDateFlexible: true,
    startDate: todaySantiagoIso,
    durationWeeks: ASSIGN_CLIENTS_DEFAULT_DURATION_WEEKS,
    selectedDays: [],
  }
}

export function normalizeAssignClientsOptions(
  options: AssignClientsOptions,
  todaySantiagoIso: string,
): AssignClientsOptions {
  const selectedDays = [...new Set(options.selectedDays)]
    .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
    .sort((a, b) => a - b)

  return {
    startDateFlexible: options.startDateFlexible,
    startDate: isValidIsoYmd(options.startDate) ? options.startDate : todaySantiagoIso,
    durationWeeks: clampAssignDurationWeeks(options.durationWeeks),
    selectedDays,
  }
}
