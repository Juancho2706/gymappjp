/**
 * Logica PURA del campo de fecha segmentado (`components/DateField.tsx`).
 *
 * Sin react-native ni expo a proposito: el componente solo aporta teclado/foco, y estas
 * funciones son las que deciden que es una fecha valida y como se compone el ISO
 * `AAAA-MM-DD` que espera el backend. Se testean desde `tests/` raiz.
 *
 * QA2-B5: reemplaza el TextInput crudo "AAAA-MM-DD" (el coach tipeaba "1991" y solo veia
 * "Fecha invalida"). 100% JS — cero dependencias nativas, OTA-safe.
 */

export interface DateParts {
  /** Dia sin padding, tal como se tipea (1-2 digitos). */
  day: string
  /** Mes sin padding, tal como se tipea (1-2 digitos). */
  month: string
  /** Año de 4 digitos, tal como se tipea. */
  year: string
}

export const EMPTY_DATE_PARTS: DateParts = { day: '', month: '', year: '' }

/** Longitud maxima por segmento (tambien la usa el auto-avance). */
export const DATE_SEGMENT_MAX = { day: 2, month: 2, year: 4 } as const

export type DateSegment = keyof typeof DATE_SEGMENT_MAX

/** Año minimo aceptado por defecto — por debajo es tipeo, no una fecha de nacimiento. */
export const MIN_DATE_YEAR = 1900

export const DATE_FIELD_MESSAGES = {
  incomplete: 'Completa día, mes y año.',
  badDay: 'El día debe estar entre 1 y 31.',
  badMonth: 'El mes debe estar entre 1 y 12.',
  badYear: `El año debe tener 4 dígitos (desde ${MIN_DATE_YEAR}).`,
  noSuchDate: 'Esa fecha no existe.',
  future: 'La fecha no puede ser futura.',
} as const

export type DateFieldStatus =
  | { kind: 'empty' }
  | { kind: 'incomplete'; message: string }
  | { kind: 'invalid'; message: string }
  | { kind: 'valid'; iso: string }

/** Deja solo digitos y recorta al largo del segmento. */
export function normalizeDateSegment(raw: string, segment: DateSegment): string {
  return raw.replace(/\D+/g, '').slice(0, DATE_SEGMENT_MAX[segment])
}

/**
 * ¿El segmento quedo "cerrado" y conviene saltar al siguiente?
 * Dia: 2 digitos, o 1 digito > 3 (ningun dia empieza con 4-9).
 * Mes: 2 digitos, o 1 digito > 1 (ningun mes empieza con 2-9).
 * Año: nunca auto-avanza (es el ultimo segmento).
 */
export function shouldAdvanceSegment(segment: DateSegment, value: string): boolean {
  if (segment === 'year') return false
  if (value.length >= DATE_SEGMENT_MAX[segment]) return true
  if (value.length !== 1) return false
  const digit = Number(value)
  return segment === 'day' ? digit > 3 : digit > 1
}

/** Dias reales del mes (mes 1-12; año con siglo). Fuera de rango => 0. */
export function daysInMonth(month: number, year: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) return 0
  if (!Number.isInteger(year)) return 0
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (month !== 2) return lengths[month - 1]
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  return leap ? 29 : 28
}

/** Parte un ISO `AAAA-MM-DD` en segmentos editables. Cualquier otra cosa => vacio. */
export function isoToDateParts(iso: string | null | undefined): DateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso ?? '').trim())
  if (!match) return { ...EMPTY_DATE_PARTS }
  // Se muestran sin cero a la izquierda: el coach ve "9" y no "09" (se repadea al componer).
  return {
    year: match[1],
    month: String(Number(match[2])),
    day: String(Number(match[3])),
  }
}

function pad2(value: number): string {
  return value < 10 ? '0' + String(value) : String(value)
}

/**
 * Estado del campo a partir de los segmentos. `maxIso` (opcional) es el tope superior
 * inclusive — para fecha de nacimiento se pasa el hoy local del dispositivo.
 */
export function resolveDateParts(
  parts: DateParts,
  options?: { maxIso?: string | null; minYear?: number },
): DateFieldStatus {
  const day = parts.day.trim()
  const month = parts.month.trim()
  const year = parts.year.trim()

  if (day === '' && month === '' && year === '') return { kind: 'empty' }
  if (day === '' || month === '' || year === '') {
    return { kind: 'incomplete', message: DATE_FIELD_MESSAGES.incomplete }
  }

  const minYear = options?.minYear ?? MIN_DATE_YEAR
  const dayNumber = Number(day)
  const monthNumber = Number(month)
  const yearNumber = Number(year)

  if (year.length !== 4 || !Number.isInteger(yearNumber) || yearNumber < minYear) {
    return { kind: 'invalid', message: DATE_FIELD_MESSAGES.badYear }
  }
  if (!Number.isInteger(monthNumber) || monthNumber < 1 || monthNumber > 12) {
    return { kind: 'invalid', message: DATE_FIELD_MESSAGES.badMonth }
  }
  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31) {
    return { kind: 'invalid', message: DATE_FIELD_MESSAGES.badDay }
  }
  if (dayNumber > daysInMonth(monthNumber, yearNumber)) {
    return { kind: 'invalid', message: DATE_FIELD_MESSAGES.noSuchDate }
  }

  const iso = `${year}-${pad2(monthNumber)}-${pad2(dayNumber)}`
  const maxIso = options?.maxIso?.trim()
  // Comparacion lexicografica: ambos son `AAAA-MM-DD` con padding, asi que el orden de
  // string coincide con el cronologico (cero Date, cero husos).
  if (maxIso && /^\d{4}-\d{2}-\d{2}$/.test(maxIso) && iso > maxIso) {
    return { kind: 'invalid', message: DATE_FIELD_MESSAGES.future }
  }

  return { kind: 'valid', iso }
}

/** ISO `AAAA-MM-DD` si los segmentos forman una fecha valida; null en cualquier otro caso. */
export function datePartsToIso(
  parts: DateParts,
  options?: { maxIso?: string | null; minYear?: number },
): string | null {
  const status = resolveDateParts(parts, options)
  return status.kind === 'valid' ? status.iso : null
}

/** Hoy en la zona LOCAL del dispositivo como `AAAA-MM-DD` (tope de fechas de nacimiento). */
export function localTodayIso(now: Date = new Date()): string {
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`
}
