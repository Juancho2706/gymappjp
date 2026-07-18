'use client'

/**
 * Card "Usar como objetivos" del paso Objetivos (T1.1 — SPEC UX-a / R6): si el
 * draft tiene porciones, muestra los totales derivados (`dayTotalsByVariant` del
 * engine — misma expansión de compuestos que verá el alumno) en tono `nutrition`
 * (primary/10, white-label) y un botón que PRECARGA los target_* del plan.
 * NUNCA sobrescribe sin tap; los targets quedan editables (R6: si el coach no
 * deriva, sus metas manuales mandan).
 */

import { useEffect } from 'react'
import { Sparkles } from 'lucide-react'
import type { ExchangeMacroTotals } from '@eva/nutrition-engine'
import { NutritionCard, NutritionMotionButton } from '@/components/nutrition-v2'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'
import type { PortionsController } from './PortionsSection'
import { derivePortionTotals, hasAnyPortions } from './portions-state'

export function PortionsDeriveCard({
  liveSlotKeys,
  controller,
  onApply,
}: {
  /** Claves de las franjas VIVAS del wizard (state.slots), en orden. */
  liveSlotKeys: string[]
  controller: PortionsController
  /** Precarga los target_* con los totales derivados (solo tras el tap del coach). */
  onApply: (totals: ExchangeMacroTotals) => void
}) {
  const hasPortions = hasAnyPortions(controller.bySlot, liveSlotKeys)

  // Los grupos ya quedaron cargados al agregar targets desde el picker; este ensure
  // cubre cualquier camino raro sin catálogo en memoria (belt & suspenders).
  const ensureGroupsLoaded = controller.ensureGroupsLoaded
  useEffect(() => {
    if (hasPortions) ensureGroupsLoaded()
  }, [hasPortions, ensureGroupsLoaded])

  if (!hasPortions || controller.groups == null) return null

  const totals = derivePortionTotals(liveSlotKeys, controller.bySlot, controller.groups)
  const message = PORTIONS_COPY.builder.deriveCard(
    String(Math.round(totals.calories)),
    String(Math.round(totals.proteinG)),
    String(Math.round(totals.carbsG)),
    String(Math.round(totals.fatsG)),
  )

  return (
    <NutritionCard tone="nutrition" className="max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="flex min-w-0 items-start gap-2 text-sm font-medium">
          <Sparkles aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{message}</span>
        </p>
        <NutritionMotionButton
          type="button"
          tone="nutrition"
          onClick={() => onApply(totals)}
          className="shrink-0"
        >
          {PORTIONS_COPY.builder.deriveCta}
        </NutritionMotionButton>
      </div>
    </NutritionCard>
  )
}
