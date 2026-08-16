/**
 * Porciones a eleccion — piezas PURAS compartidas entre el wizard web y el editor unico
 * (R1, extraccion T3.x). Vivian en `apps/web/.../builder/_components/portions-state.ts`;
 * el editor (`editor-state.ts`, este paquete) necesita la clave compuesta y el diagnostico
 * de porciones huerfanas (defecto B4), y un paquete no puede importar de `apps/web`.
 * Movidas VERBATIM; el resto del estado de porciones del wizard sigue alla y re-exporta
 * estas desde su ruta historica.
 */

/** Target de porciones de una franja en el wizard (pre-draft, sin notes en F1 web). */
export interface PortionTargetDraft {
  exchangeGroupId: string
  portions: number
}

/**
 * Mapa `clave de franja -> targets de porciones` (estado hermano del wizard).
 *
 * Multi-dia: la clave es COMPUESTA (`variantKey::slotKey`, ver `portionsKey`). Con la clave
 * plana anterior, dos dias con franjas homonimas —el caso normal: el sabado se clona del
 * base y conserva "Almuerzo"— compartian porciones y editar el sabado movia el lunes.
 */
export type PortionsBySlot = Record<string, PortionTargetDraft[]>

/** Separador de la clave compuesta. `::` no aparece en las keys (uuid / uuid~uuid). */
export const PORTIONS_KEY_SEPARATOR = '::'

/** Clave del mapa de porciones para una franja DENTRO de un dia. */
export function portionsKey(variantKey: string, slotKey: string): string {
  return variantKey + PORTIONS_KEY_SEPARATOR + slotKey
}

/**
 * Dia del wizard con lo minimo para diagnosticar porciones huerfanas (incluye el NOMBRE de
 * la franja: el emparejamiento entre dias es por nombre, igual que `resolveSlotCopyTargets`).
 */
export interface PortionsDayLike {
  key: string
  isDefault: boolean
  slots: ReadonlyArray<{ key: string; name: string }>
}

/** Un dia que no recibio las porciones del dia base. */
export interface PortionsDayGap {
  variantKey: string
  /** Pares base -> dia copiables (franja homonima viva en el dia). */
  slotKeyPairs: Array<{ from: string; to: string }>
  /** El dia no tiene NINGUNA franja homonima: copiar no alcanza, hay que armarle el dia. */
  unmatched: boolean
}

function normalizedSlotName(name: string): string {
  return name.trim().toLocaleLowerCase('es')
}

/**
 * Dias que se quedaron SIN las porciones del dia base (defecto B4, 2026-08-03).
 *
 * La clave del mapa es `variantKey::slotKey`, asi que las porciones cargadas en el dia base
 * pertenecen SOLO a esa variante. En un plan con dias asignados el base unicamente se sirve
 * los dias sin variante propia, de modo que el coach ve sus porciones en el builder, publica,
 * y al alumno no le llega ninguna. Verificado en LIVE: 3 de 3 planes multi-dia publicados
 * tenian el 100% de las porciones en el base y cero en los dias.
 *
 * Esta funcion NO decide: solo reporta lo que falta y con que pares se arregla. La UI del
 * builder pinta el aviso antes de publicar y ofrece copiarlas.
 */
export function daysMissingBasePortions(
  map: PortionsBySlot,
  variants: ReadonlyArray<PortionsDayLike>,
): PortionsDayGap[] {
  const base = variants.find((variant) => variant.isDefault)
  if (base == null) return []

  const baseSlotsWithPortions = base.slots.filter(
    (slot) => (map[portionsKey(base.key, slot.key)] ?? []).length > 0,
  )
  if (baseSlotsWithPortions.length === 0) return []

  const gaps: PortionsDayGap[] = []
  for (const day of variants) {
    if (day.isDefault) continue
    const byName = new Map(day.slots.map((slot) => [normalizedSlotName(slot.name), slot.key]))
    const slotKeyPairs: Array<{ from: string; to: string }> = []
    let matched = 0
    for (const baseSlot of baseSlotsWithPortions) {
      const targetSlotKey = byName.get(normalizedSlotName(baseSlot.name))
      if (targetSlotKey == null) continue
      matched += 1
      // Ya tiene porciones propias en esa franja: es una decision del coach, no un hueco.
      if ((map[portionsKey(day.key, targetSlotKey)] ?? []).length > 0) continue
      slotKeyPairs.push({ from: baseSlot.key, to: targetSlotKey })
    }
    if (slotKeyPairs.length === 0 && matched > 0) continue
    gaps.push({ variantKey: day.key, slotKeyPairs, unmatched: matched === 0 })
  }
  return gaps
}
