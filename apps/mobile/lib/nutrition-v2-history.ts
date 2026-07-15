/**
 * Pure, framework-agnostic helpers for the student History tab (Tanda 7).
 *
 * The history read model is a cursor-paginated list of days ordered newest-first.
 * These helpers own the page-merge / dedupe / cursor logic so the screen stays a
 * thin renderer and the invariants are unit-tested in isolation (no RN imports).
 */
import type { NutritionHistoryDay, NutritionHistoryPageReadModel } from '@eva/nutrition-v2'

type HistoryCursorPage = Pick<NutritionHistoryPageReadModel, 'hasMore' | 'nextCursor'>

/**
 * Dedupe by `localDate` keeping the FIRST occurrence. The server pages are
 * newest-first and non-overlapping, but a cursor boundary (or a refetch racing an
 * append) can repeat the edge day — dropping later duplicates preserves both the
 * original ordering and the freshest copy already on screen.
 */
export function dedupeHistoryDays(items: readonly NutritionHistoryDay[]): NutritionHistoryDay[] {
  const seen = new Set<string>()
  const out: NutritionHistoryDay[] = []
  for (const day of items) {
    if (seen.has(day.localDate)) continue
    seen.add(day.localDate)
    out.push(day)
  }
  return out
}

/**
 * Append a freshly-fetched page onto the days already on screen, deduped by date.
 * Existing rows win, so incremental "load more" never reorders or flickers the
 * list the student is already looking at.
 */
export function mergeHistoryPages(
  existing: readonly NutritionHistoryDay[],
  incoming: readonly NutritionHistoryDay[],
): NutritionHistoryDay[] {
  return dedupeHistoryDays([...existing, ...incoming])
}

/** The `before` cursor to fetch the next (older) page, or null when the list is exhausted. */
export function nextHistoryCursor(page: HistoryCursorPage): string | null {
  return page.hasMore && page.nextCursor ? page.nextCursor : null
}

/** Whether another page can be requested from the current tail page. */
export function canLoadMoreHistory(page: HistoryCursorPage | null): boolean {
  return page != null && page.hasMore && page.nextCursor != null
}

/** A day carries lazily-loadable intake detail only when it has active entries or corrections. */
export function historyDayHasDetail(day: NutritionHistoryDay): boolean {
  return day.activeEntryCount > 0 || day.correctionCount > 0
}

/** Legacy V1 completions surfaced without per-food detail get a disclosure badge. */
export function historyDayIsLegacy(day: NutritionHistoryDay): boolean {
  return day.legacyDisclosure !== null
}
