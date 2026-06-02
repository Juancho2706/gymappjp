import type { DayState, ProgramStructureType } from './types'
import { DAYS_OF_WEEK } from './reducer'

/**
 * Build/reshape the day skeleton for a given structure, preserving existing
 * titles/blocks/rest by day id. Ported from web reshapeDays.
 *  - 'weekly' → 7 fixed days (Lun..Dom), ids 1-7.
 *  - 'cycle'  → `length` generic days ("Día N"), ids 1..length.
 */
export function buildDaySkeleton(
  structure: ProgramStructureType,
  cycleLength: number,
  existing: DayState[]
): DayState[] {
  if (structure === 'weekly') {
    return DAYS_OF_WEEK.map((d) => {
      const prev = existing.find((e) => e.id === d.id)
      return { id: d.id, name: d.name, title: prev?.title ?? '', blocks: prev?.blocks ?? [], is_rest: prev?.is_rest }
    })
  }
  const len = Math.max(1, Math.min(31, cycleLength))
  return Array.from({ length: len }, (_, i) => {
    const id = i + 1
    const prev = existing.find((e) => e.id === id)
    return { id, name: `Día ${id}`, title: prev?.title ?? '', blocks: prev?.blocks ?? [], is_rest: prev?.is_rest }
  })
}
