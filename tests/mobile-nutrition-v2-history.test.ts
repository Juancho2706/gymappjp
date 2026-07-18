import { describe, expect, it } from 'vitest'
import type { NutritionHistoryDay } from '@eva/nutrition-v2'
import {
  canLoadMoreHistory,
  dedupeHistoryDays,
  historyDayHasDetail,
  historyDayIsLegacy,
  mergeHistoryPages,
  nextHistoryCursor,
} from '../apps/mobile/lib/nutrition-v2-history'

function day(localDate: string, over: Partial<NutritionHistoryDay> = {}): NutritionHistoryDay {
  return {
    localDate,
    snapshotId: null,
    planVersionId: null,
    strategy: null,
    targets: {
      calories: 2000,
      proteinG: 150,
      carbsG: 200,
      fatsG: 60,
      fiberG: 25,
      sodiumMg: null,
      waterMl: null,
    },
    consumed: { calories: 1800, proteinG: 140, carbsG: 180, fatsG: 55, fiberG: 20, entryCount: 4 },
    activeEntryCount: 4,
    correctionCount: 0,
    legacyCompletionCount: 0,
    legacyDisclosure: null,
    lastRecordedAt: '2026-07-14T18:00:00.000Z',
    ...over,
  }
}

describe('nutrition v2 history · dedupeHistoryDays', () => {
  it('keeps the first occurrence of a repeated date and preserves order', () => {
    const fresh = day('2026-07-14', { consumed: { calories: 1900, proteinG: 0, carbsG: 0, fatsG: 0, fiberG: 0, entryCount: 5 } })
    const stale = day('2026-07-14', { consumed: { calories: 100, proteinG: 0, carbsG: 0, fatsG: 0, fiberG: 0, entryCount: 1 } })
    const result = dedupeHistoryDays([fresh, day('2026-07-13'), stale])
    expect(result.map((d) => d.localDate)).toEqual(['2026-07-14', '2026-07-13'])
    expect(result[0].consumed.calories).toBe(1900)
  })

  it('is a no-op on already-unique input', () => {
    const input = [day('2026-07-14'), day('2026-07-13'), day('2026-07-12')]
    expect(dedupeHistoryDays(input).map((d) => d.localDate)).toEqual([
      '2026-07-14',
      '2026-07-13',
      '2026-07-12',
    ])
  })
})

describe('nutrition v2 history · mergeHistoryPages', () => {
  it('appends an older page after the existing days', () => {
    const p1 = [day('2026-07-14'), day('2026-07-13')]
    const p2 = [day('2026-07-12'), day('2026-07-11')]
    expect(mergeHistoryPages(p1, p2).map((d) => d.localDate)).toEqual([
      '2026-07-14',
      '2026-07-13',
      '2026-07-12',
      '2026-07-11',
    ])
  })

  it('drops a boundary day repeated across pages, existing wins', () => {
    const p1 = [day('2026-07-14'), day('2026-07-13', { activeEntryCount: 9 })]
    const p2 = [day('2026-07-13', { activeEntryCount: 1 }), day('2026-07-12')]
    const merged = mergeHistoryPages(p1, p2)
    expect(merged.map((d) => d.localDate)).toEqual(['2026-07-14', '2026-07-13', '2026-07-12'])
    expect(merged[1].activeEntryCount).toBe(9)
  })

  it('does not mutate the input arrays', () => {
    const p1 = [day('2026-07-14')]
    const p2 = [day('2026-07-13')]
    mergeHistoryPages(p1, p2)
    expect(p1).toHaveLength(1)
    expect(p2).toHaveLength(1)
  })
})

describe('nutrition v2 history · cursor', () => {
  it('returns the cursor only when there is more and a cursor exists', () => {
    expect(nextHistoryCursor({ hasMore: true, nextCursor: '2026-07-01' })).toBe('2026-07-01')
    expect(nextHistoryCursor({ hasMore: false, nextCursor: '2026-07-01' })).toBeNull()
    expect(nextHistoryCursor({ hasMore: true, nextCursor: null })).toBeNull()
  })

  it('canLoadMoreHistory fails closed on null / exhausted pages', () => {
    expect(canLoadMoreHistory(null)).toBe(false)
    expect(canLoadMoreHistory({ hasMore: true, nextCursor: '2026-07-01' })).toBe(true)
    expect(canLoadMoreHistory({ hasMore: false, nextCursor: '2026-07-01' })).toBe(false)
    expect(canLoadMoreHistory({ hasMore: true, nextCursor: null })).toBe(false)
  })
})

describe('nutrition v2 history · day flags', () => {
  it('detects expandable detail from entries or corrections', () => {
    expect(historyDayHasDetail(day('2026-07-14', { activeEntryCount: 0, correctionCount: 0 }))).toBe(false)
    expect(historyDayHasDetail(day('2026-07-14', { activeEntryCount: 3, correctionCount: 0 }))).toBe(true)
    expect(historyDayHasDetail(day('2026-07-14', { activeEntryCount: 0, correctionCount: 2 }))).toBe(true)
  })

  it('flags legacy disclosure days', () => {
    expect(historyDayIsLegacy(day('2026-07-14'))).toBe(false)
    expect(
      historyDayIsLegacy(day('2026-07-14', { legacyDisclosure: 'legacy_completion_without_food_detail' })),
    ).toBe(true)
  })
})
