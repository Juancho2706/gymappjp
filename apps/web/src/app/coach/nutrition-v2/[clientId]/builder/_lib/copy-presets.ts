/**
 * Presets de copia (BD3) — PURO, sin React.
 *
 * "Lu a Vi", "Fin de semana" y "Todos" son los tres recortes que el coach hace SIEMPRE al copiar
 * un día o una franja. Hasta ahora eran 5 toques en un multi-select (o siete en el submenú del
 * día) para expresar algo que tiene nombre propio.
 *
 * Los presets NO reemplazan el flujo: MARCAN la selección existente (franja) o resuelven la
 * lista de días destino (día). Por eso todo aquí devuelve una selección, nunca ejecuta la copia:
 * el coach sigue confirmando con la CTA de siempre.
 *
 * QA owner 08-05: los días que YA tienen contenido propio dejaron de estar deshabilitados. El
 * coach que armó el lunes y quiere replicarlo al resto de la semana chocaba contra un menú
 * apagado y tenía que borrar cada día a mano. Ahora se pueden elegir y la copia los SOBRESCRIBE;
 * este módulo solo los marca (`replaces`) para que la UI pida confirmación y ofrezca deshacer.
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

/** Semana completa en orden de lectura, para el preset "Todos" (que no filtra por día). */
const FULL_WEEK: readonly number[] = [1, 2, 3, 4, 5, 6, 0]

/** Un día destino del submenú del día: si ya tiene contenido propio, copiar lo sobrescribe. */
export interface CopyPresetDay {
  dayOfWeek: number
  /** Ese día YA tiene su propio contenido: la copia lo REEMPLAZA. */
  replaces: boolean
}

/**
 * Días destino del preset para el submenú del día, cada uno marcado con si se reemplaza.
 *
 * El día de ORIGEN nunca es destino (copiar un día sobre sí mismo no significa nada), así que se
 * excluye aunque el preset lo abarque. Orden de lectura del preset; "Todos" cubre la semana
 * completa Lu→Do.
 */
export function daysForCopyPreset(
  preset: CopyPreset,
  params: { takenDays: Iterable<number>; sourceDayOfWeek: number | null },
): CopyPresetDay[] {
  const taken = new Set(params.takenDays)
  const days = preset.days ?? FULL_WEEK
  return days
    .filter((day) => day !== params.sourceDayOfWeek)
    .map((day) => ({ dayOfWeek: day, replaces: taken.has(day) }))
}

/** Los días de una selección que se van a sobrescribir (vacío = la copia no pisa nada). */
export function replacedDaysOf(days: readonly CopyPresetDay[]): number[] {
  return days.filter((day) => day.replaces).map((day) => day.dayOfWeek)
}
