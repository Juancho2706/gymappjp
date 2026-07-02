'use client'

import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { NutrientRangeBar } from '@/components/nutrition/NutrientRangeBar'
import { InfoTooltip } from '@/components/ui/info-tooltip'
import { cn } from '@/lib/utils'

/** Optional coach-defined bounds for a single micronutrient. */
export interface MicroTarget {
  floor?: number
  target?: number
  ceiling?: number
}

export interface MicrosPanelProps {
  /** Sodium consumed today, in mg. `null` when nothing logged. */
  sodiumMg: number | null
  /** Fiber consumed today, in g. `null` when nothing logged. */
  fiberG: number | null
  /** Sugar consumed today, in g (advanced, Pro). `null` when nothing logged. */
  sugarG?: number | null
  /** Saturated fat consumed today, in g (advanced, Pro). `null` when nothing logged. */
  saturatedFatG?: number | null
  /** Unsaturated fat consumed today, in g (advanced, Pro). `null` when nothing logged. */
  unsaturatedFatG?: number | null
  /** Coach-defined sodium bounds (intent `cap`). Optional. */
  sodiumTarget?: MicroTarget
  /** Coach-defined fiber bounds (intent `aimup`). Optional. */
  fiberTarget?: MicroTarget
  /** Coach-defined sugar bounds (intent `cap`, advanced). Optional. */
  sugarTarget?: MicroTarget
  /** Coach-defined saturated-fat bounds (intent `cap`, advanced). Optional. */
  saturatedFatTarget?: MicroTarget
  /** Coach-defined unsaturated-fat bounds (intent `aimup`, advanced). Optional. */
  unsaturatedFatTarget?: MicroTarget
  /**
   * When `true`, render the advanced micro rows (azúcar, grasa saturada, grasa
   * insaturada) in addition to the base sodio + fibra. Resolved SERVER-SIDE from
   * the plan's `nutrition_exchanges` module ("Nutrición Pro"). Defaults `false`.
   */
  proEnabled?: boolean
  className?: string
}

function hasAnyBound(t?: MicroTarget): boolean {
  return t != null && (t.floor != null || t.target != null || t.ceiling != null)
}

function roundish(n: number): number {
  return Math.abs(n) < 10 ? Math.round(n * 10) / 10 : Math.round(n)
}

/**
 * Collapsible "Micronutrientes" accordion (closed by default — progressive
 * disclosure). Renders a {@link NutrientRangeBar} for sodium (intent `cap`) and
 * fiber (intent `aimup`) for the current day. When a nutrient has no coach-defined
 * target, it falls back to a plain value + a muted "sin meta definida" line.
 *
 * Presentational only (props in, no IO). Base tier.
 */
export function MicrosPanel({
  sodiumMg,
  fiberG,
  sugarG = null,
  saturatedFatG = null,
  unsaturatedFatG = null,
  sodiumTarget,
  fiberTarget,
  sugarTarget,
  saturatedFatTarget,
  unsaturatedFatTarget,
  proEnabled = false,
  className,
}: MicrosPanelProps) {
  const reduce = useReducedMotion()
  const [open, setOpen] = useState(false)

  type MicroRow = {
    key: string
    label: string
    value: number | null
    unit: string
    intent: 'cap' | 'aimup'
    target?: MicroTarget
  }

  const baseRows: MicroRow[] = [
    { key: 'sodio', label: 'Sodio', value: sodiumMg, unit: 'mg', intent: 'cap', target: sodiumTarget },
    { key: 'fibra', label: 'Fibra', value: fiberG, unit: 'g', intent: 'aimup', target: fiberTarget },
  ]

  const advancedRows: MicroRow[] = [
    { key: 'azucar', label: 'Azúcar', value: sugarG, unit: 'g', intent: 'cap', target: sugarTarget },
    { key: 'grasa-saturada', label: 'Grasa saturada', value: saturatedFatG, unit: 'g', intent: 'cap', target: saturatedFatTarget },
    { key: 'grasa-insaturada', label: 'Grasa insaturada', value: unsaturatedFatG, unit: 'g', intent: 'aimup', target: unsaturatedFatTarget },
  ]

  const renderRow = (row: MicroRow, delayIndex: number) => {
    if (row.value == null && !hasAnyBound(row.target)) {
      return (
        <div key={row.key} className="space-y-0.5">
          <div className="flex items-center justify-between text-[11px] font-medium">
            <span className="text-muted-foreground">{row.label}</span>
            <span className="tabular-nums text-muted-foreground">— {row.unit}</span>
          </div>
          <p className="text-[10px] text-muted-foreground/60">sin meta definida</p>
        </div>
      )
    }

    if (!hasAnyBound(row.target)) {
      // Value present, but no coach target: show the number plainly.
      return (
        <div key={row.key} className="space-y-0.5">
          <div className="flex items-center justify-between text-[11px] font-medium">
            <span className="text-muted-foreground">{row.label}</span>
            <span className="tabular-nums text-foreground">
              {roundish(row.value ?? 0)}
              {row.unit}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground/60">sin meta definida</p>
        </div>
      )
    }

    return (
      <NutrientRangeBar
        key={row.key}
        label={row.label}
        value={row.value ?? 0}
        unit={row.unit}
        intent={row.intent}
        floor={row.target?.floor}
        target={row.target?.target}
        ceiling={row.target?.ceiling}
        delayIndex={delayIndex}
      />
    )
  }

  return (
    <section
      className={cn(
        'rounded-2xl border border-border/60 bg-card/60 backdrop-blur-sm',
        className
      )}
    >
      <h3 className="m-0">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="micros-panel-content"
          className="flex min-h-[44px] w-full items-center justify-between gap-2 px-4 py-3 text-left"
        >
          <span className="flex items-center gap-1.5">
            <span className="font-display text-[17px] font-extrabold tracking-tight text-foreground">Micronutrientes</span>
            <InfoTooltip
              content="Micros — base. Tu coach puede fijar topes (ej. sodio) y metas (ej. fibra)."
              iconClassName="w-3.5 h-3.5"
            />
          </span>
          <motion.span
            aria-hidden
            initial={false}
            animate={{ rotate: open ? 180 : 0 }}
            transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 24 }}
            className="text-muted-foreground"
          >
            <ChevronDown className="h-4 w-4" />
          </motion.span>
        </button>
      </h3>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="micros-panel-content"
            key="content"
            initial={reduce ? false : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={reduce ? { duration: 0 } : { duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-4 px-4 pb-4 pt-1">
              {baseRows.map((row, i) => renderRow(row, i))}

              {/* Divisor "AVANZADOS · PRO" (kit alumno-nutricion.jsx:351-357). */}
              <div className="space-y-2 pt-1">
                <div className="h-px bg-border/60" />
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-extrabold uppercase tracking-wide text-muted-foreground/70">
                    Avanzados
                  </span>
                  <span className="rounded-full bg-sport-100 px-1.5 py-0.5 text-[9px] font-extrabold text-sport-600">
                    PRO
                  </span>
                </div>
              </div>

              {proEnabled ? (
                advancedRows.map((row, i) => renderRow(row, baseRows.length + i))
              ) : (
                <p className="text-[10px] leading-snug text-muted-foreground/60">
                  Azúcar y grasas detalladas con Nutrición Pro de tu coach.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
