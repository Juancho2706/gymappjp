/**
 * Presets de copia (BD3) — PURO, sin React.
 *
 * "Lu a Vi", "Fin de semana" y "Todos" son los tres recortes que el coach hace SIEMPRE al copiar
 * un día o una franja. Hasta ahora eran 5 toques en un multi-select (o siete en el submenú del
 * día) para expresar algo que tiene nombre propio.
 *
 * Los presets NO reemplazan el flujo: MARCAN la selección existente (franja) o resuelven la
 * lista de días libres (día). Por eso todo aquí devuelve una selección, nunca ejecuta la copia:
 * el coach sigue confirmando con la CTA de siempre y los destinos deshabilitados siguen
 * deshabilitados (se filtran, jamás se fuerzan).
 */

/** Días de semana de cada preset, en orden de lectura. `null` = "todos" (no filtra por día). */
export type CopyPresetId = 'weekdays' | 'weekend' | 'all'

export interface CopyPreset {
  id: CopyPresetId
  label: string
  /** Días (0=domingo … 6=sábado) que abarca; `null` = sin filtro (todos los destinos). */
  days: readonly number[] | null
}

export const COPY_PRESETS: readonly CopyPreset[] = [
  { id: 'weekdays', label: 'Lu a Vi', days: [1, 2, 3, 4, 5] },
  { id: 'weekend', label: 'Fin de semana', days: [6, 0] },
  { id: 'all', label: 'Todos', days: null },
]

/** Forma mínima de un destino de copia (la cumplen `BuilderVariant` y las celdas del strip). */
export interface CopyPresetTarget {
  key: string
  dayOfWeek: number | null
}

/**
 * Destinos que abarca el preset, en el orden en que llegaron (que ya es el de lectura).
 *
 * El día BASE (`dayOfWeek` null) solo entra en "Todos": no pertenece a Lu-Vi ni al fin de semana,
 * y meterlo ahí sería copiar sobre el día que rige a toda la semana sin que nadie lo pidiera.
 */
export function targetsForCopyPreset(
  targets: readonly CopyPresetTarget[],
  preset: CopyPreset,
): string[] {
  if (preset.days === null) return targets.map((target) => target.key)
  const days = new Set(preset.days)
  return targets.filter((target) => target.dayOfWeek != null && days.has(target.dayOfWeek)).map((t) => t.key)
}

/**
 * Días de la semana del preset que TODAVÍA están libres (para el submenú del día, donde cada día
 * ocupado ya viene deshabilitado). Orden de lectura del preset; "Todos" cubre la semana completa.
 */
export function freeDaysForCopyPreset(preset: CopyPreset, takenDays: Iterable<number>): number[] {
  const taken = new Set(takenDays)
  const days = preset.days ?? [1, 2, 3, 4, 5, 6, 0]
  return days.filter((day) => !taken.has(day))
}
