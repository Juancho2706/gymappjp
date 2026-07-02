'use client'

import { ProportionPlate, type PlateProportion } from '@/components/nutrition/ProportionPlate'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { cn } from '@/lib/utils'

export interface PlatePanelProps {
  /** Plate shares (veg/protein/carb), each 0..1, summing ~1. */
  proportion: PlateProportion
  className?: string
}

/**
 * "Tu plato" card — wraps {@link ProportionPlate} (method-of-the-plate visual)
 * with a heading, an info tooltip, and the plate's own legend. The plate is a
 * PROPORTIONAL guide (how to divide the plate), never an absolute "goal met"
 * indicator. Presentational only. Base tier.
 */
export function PlatePanel({ proportion, className }: PlatePanelProps) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-sm',
        className
      )}
    >
      <div className="mb-3 flex items-center gap-1.5">
        <h3 className="m-0 font-display text-[17px] font-extrabold tracking-tight text-foreground">Tu plato</h3>
        <InfoTooltip
          content="Es una guía proporcional: cómo dividir el plato (verduras, proteína, carbohidrato), no cantidades absolutas ni una meta cumplida."
          iconClassName="w-3.5 h-3.5"
        />
      </div>

      <ProportionPlate proportion={proportion} />
    </section>
  )
}
