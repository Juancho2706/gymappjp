import type { DayState, ProgramStructureType } from './types'
import { DAYS_OF_WEEK } from './reducer'

/**
 * Build/reshape the day skeleton for a given structure, preserving existing
 * titles/blocks/rest by day id. Ported from web reshapeDays.
 *  - 'weekly' → 7 fixed days (Lun..Dom), ids 1-7.
 *  - 'cycle'  → hasta 14 días genéricos ("Día N"), ids 1..length.
 */
export function buildDaySkeleton(
  structure: ProgramStructureType,
  cycleLength: number,
  existing: DayState[]
): DayState[] {
  const len = Math.max(1, Math.min(14, cycleLength))
  const skeleton: DayState[] = structure === 'weekly'
    ? DAYS_OF_WEEK.map((day) => ({ ...day, title: '', blocks: [] }))
    : Array.from({ length: len }, (_, index) => ({
        id: index + 1,
        name: `Día ${index + 1}`,
        title: '',
        blocks: [],
      }))
  const byId = new Map(existing.map((day) => [day.id, day]))
  const merged = skeleton.map((day) => {
    const previous = byId.get(day.id)
    return previous
      ? { ...day, title: previous.title, blocks: previous.blocks, is_rest: previous.is_rest }
      : day
  })
  const survivingIds = new Set(merged.map((day) => day.id))
  const orphanBlocks = existing
    .filter((day) => !survivingIds.has(day.id))
    .flatMap((day) => day.blocks)
  if (orphanBlocks.length > 0 && merged.length > 0) {
    const lastIndex = merged.length - 1
    const last = merged[lastIndex]!
    merged[lastIndex] = { ...last, blocks: [...last.blocks, ...orphanBlocks] }
  }
  return merged
}
