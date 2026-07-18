'use client'

/**
 * Resumen read-only de porciones del paso Revisar (T1.1 — SPEC UX-a): chips
 * `portionsSummaryLabel` ("2C · 1,5V", coma decimal es-CL) por franja con porciones,
 * y banner `warning` si algún grupo usado tiene `macros_confirmed=false`. El
 * MacroBudget existente ya refleja los totales derivados vía "Usar como objetivos"
 * — aquí no se duplica ningún total.
 */

import { AlertTriangle } from 'lucide-react'
import { hasUnconfirmedMacros, portionsSummaryLabel } from '@eva/nutrition-engine'
import { NutritionCard } from '@/components/nutrition-v2'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'
import type { PortionsController } from './PortionsSection'
import { esDecimal, hasAnyPortions, slotPortionTargets } from './portions-state'

export function PortionsReviewSection({
  slots,
  controller,
}: {
  /** Franjas VIVAS del wizard (state.slots), en orden. */
  slots: Array<{ key: string; name: string }>
  controller: PortionsController
}) {
  const keys = slots.map((s) => s.key)
  const { groups } = controller
  if (!hasAnyPortions(controller.bySlot, keys) || groups == null) return null

  const rows = slots
    .map((slot) => ({ slot, targets: slotPortionTargets(controller.bySlot, slot.key) }))
    .filter(({ targets }) => targets.length > 0)
  const unconfirmed = rows.some(({ targets }) => hasUnconfirmedMacros(targets, groups))

  return (
    <>
      {unconfirmed ? (
        <p className="flex items-start gap-2 rounded-control border border-amber-300/60 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          {PORTIONS_COPY.builder.unconfirmedBanner}
        </p>
      ) : null}
      <NutritionCard>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          {PORTIONS_COPY.builder.sectionTitle}
        </p>
        <ul className="space-y-2">
          {rows.map(({ slot, targets }) => (
            <li key={slot.key} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-xs text-body">{slot.name.trim() || 'Sin nombre'}</span>
              <span className="shrink-0 rounded-pill border border-border-subtle bg-surface-sunken px-2.5 py-1 font-mono text-xs font-semibold tabular-nums text-strong">
                {esDecimal(portionsSummaryLabel(targets, groups))}
              </span>
            </li>
          ))}
        </ul>
      </NutritionCard>
    </>
  )
}
