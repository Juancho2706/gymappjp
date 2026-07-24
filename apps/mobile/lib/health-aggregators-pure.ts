/**
 * Parte PURA de los agregadores de salud (E6.3) — ventanas de tiempo y normalizacion de datos.
 * SIN imports de react-native: corre en Vitest (node) y queda testeable. Los adaptadores nativos
 * (HealthKit / Health Connect) viven en `health-aggregators.ts` tras el guard dinamico.
 */

/** Ventana "hoy" (local): 00:00 de hoy → ahora. Para sumar pasos del dia en curso. */
export function todayWindow(now: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  return { start, end: new Date(now) }
}

/**
 * Ventana "anoche" (local): ayer 18:00 → hoy 12:00. Cubre el sueño de la noche pasada aunque el
 * alumno abra la app a media mañana; el corte a las 12:00 evita capturar una siesta de la tarde.
 * Si aun no son las 12:00, el fin es "ahora" (no adelantamos al futuro).
 */
export function lastNightWindow(now: Date = new Date()): { start: Date; end: Date } {
  const start = new Date(now)
  start.setDate(start.getDate() - 1)
  start.setHours(18, 0, 0, 0)
  const noon = new Date(now)
  noon.setHours(12, 0, 0, 0)
  return { start, end: noon.getTime() > now.getTime() ? new Date(now) : noon }
}

/** Horas entre dos instantes ISO/Date; 0 si el rango es invalido o negativo. */
export function hoursBetween(start: string | Date, end: string | Date): number {
  const s = new Date(start).getTime()
  const e = new Date(end).getTime()
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 0
  return (e - s) / 3_600_000
}

/**
 * Redondea horas de sueño a la opcion mas cercana del selector de habitos (chips 6..9 cada 0.5),
 * solo si cae dentro de la tolerancia (0.5h por defecto). null si no hay match razonable — asi no
 * "inventamos" un chip cuando el dato del agregador es raro (ej. 3h o 13h).
 */
export function nearestSleepOption(
  hours: number | null | undefined,
  options: readonly number[],
  toleranceH = 0.5,
): number | null {
  if (hours == null || !Number.isFinite(hours) || hours <= 0 || options.length === 0) return null
  let best: number | null = null
  let bestDist = Infinity
  for (const opt of options) {
    const dist = Math.abs(opt - hours)
    if (dist < bestDist) {
      bestDist = dist
      best = opt
    }
  }
  return best != null && bestDist <= toleranceH ? best : null
}

/** Suma horas de sueño de una lista de muestras {start,end} (solo tramos dormido). null si vacio. */
export function sumSleepHours(samples: readonly { start: string | Date; end: string | Date }[]): number | null {
  if (!samples || samples.length === 0) return null
  const total = samples.reduce((acc, s) => acc + hoursBetween(s.start, s.end), 0)
  return total > 0 ? Math.round(total * 10) / 10 : null
}
