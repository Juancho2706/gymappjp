// Date helpers date-fns-free (Hermes-safe). Fuente unica compartida por web y mobile.
// Reemplazan a date-fns (startOfWeek/subDays/differenceIn*) con la misma semantica para
// entradas date-only (YYYY-MM-DD) — mismos numeros que la web original.

export const DAY_MS = 86_400_000

/** YYYY-MM-DD (o ISO) → Date fijado a las 12:00 local (evita saltos de dia por timezone). */
export function parseYmd(s: string): Date {
  return new Date(`${s.slice(0, 10)}T12:00:00`)
}

/** Date → 'YYYY-MM-DD' (fecha local). */
export function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

/** Dias completos entre a y b (b - a), truncado. Equivale a date-fns differenceInDays para diffs positivos. */
export function diffDays(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / DAY_MS)
}

/** Diferencia de meses calendario (no considera dia-del-mes). */
export function diffMonths(a: Date, b: Date): number {
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
}

/** Lunes 00:00 de la semana de `d` (weekStartsOn=1). Equivale a date-fns startOfWeek. */
export function startOfWeekMonday(d: Date): Date {
  const x = new Date(d)
  const day = (x.getDay() + 6) % 7 // 0 = lunes
  x.setHours(0, 0, 0, 0)
  x.setDate(x.getDate() - day)
  return x
}

/** Etiqueta corta es-ES: '02 ene'. */
export function shortLabel(dateKey: string): string {
  return parseYmd(dateKey).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
}
