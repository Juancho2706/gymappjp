'use client'

import { useMemo } from 'react'
import type { ExchangeGroup } from '@/domain/nutrition/exchange.types'
import { exchangeGroupColor, formatPortions } from '@/services/nutrition-exchanges/exchange-calc'

interface Props {
  targets: { exchangeGroupId: string; portions: number }[]
  groups: ExchangeGroup[]
  onChipTap: (group: ExchangeGroup) => void
}

/**
 * Chips de códigos de la comida ("2C · 1LAC · 1F"). Tap en un chip ⇒ el padre abre el
 * sheet de equivalencias del grupo. Targets ≥44px de alto efectivo (área táctil).
 */
export function ExchangeMealChips({ targets, groups, onChipTap }: Props) {
  const rows = useMemo(() => {
    const byId = new Map(groups.map((g) => [g.id, g]))
    return targets
      .map((t) => ({ group: byId.get(t.exchangeGroupId), portions: t.portions }))
      .filter((r): r is { group: ExchangeGroup; portions: number } => !!r.group && r.portions > 0)
      .sort((a, b) =>
        a.group.sortOrder !== b.group.sortOrder
          ? a.group.sortOrder - b.group.sortOrder
          : a.group.code.localeCompare(b.group.code)
      )
  }, [targets, groups])

  if (rows.length === 0) return null

  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {rows.map(({ group, portions }) => (
        <button
          key={group.id}
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onChipTap(group)
          }}
          aria-label={`${formatPortions(portions)} ${group.name}`}
          className="inline-flex min-h-9 items-center gap-1 rounded-full border border-border/60 bg-background px-2.5 py-1 transition-colors hover:bg-muted touch-manipulation"
        >
          <span
            className="flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-black text-white"
            style={{ backgroundColor: exchangeGroupColor(group) }}
            aria-hidden
          >
            {group.code}
          </span>
          <span className="text-[11px] font-black tabular-nums text-foreground">
            {formatPortions(portions)}
            {group.code}
          </span>
        </button>
      ))}
    </div>
  )
}
