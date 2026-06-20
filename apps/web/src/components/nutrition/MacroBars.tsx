'use client'

import { useRef } from 'react'
import { motion, useInView, useReducedMotion, type Transition } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  MACRO_META,
  MACRO_OVER_COLOR,
  macroPct,
  type MacroKey,
} from './macro-tokens'

export interface MacroBarDatum {
  consumed: number
  target: number
}

export interface MacroBarRowProps extends MacroBarDatum {
  label: string
  /** Bar fill color (CSS color). */
  color: string
  unit?: 'g' | 'kcal'
  /** Stagger index for the entrance animation. */
  delayIndex?: number
  className?: string
}

/** Accessible sentence for a single macro bar. Exported for tests. */
export function macroBarAriaText(
  label: string,
  consumed: number,
  target: number,
  unit: 'g' | 'kcal'
): string {
  const c = Math.round(consumed)
  const t = Math.round(target)
  if (t <= 0) return `${label}: ${c} ${unit === 'g' ? 'gramos' : 'kilocalorías'}, sin meta`
  const pct = Math.round((consumed / target) * 100)
  const over = consumed > target
  const word = unit === 'g' ? 'gramos' : 'kilocalorías'
  return `${label}: ${c} de ${t} ${word}, ${pct} por ciento${over ? ', por encima de la meta' : ''}`
}

/** A single horizontal macro bar with a11y `progressbar` semantics. */
export function MacroBarRow({
  label,
  consumed,
  target,
  color,
  unit = 'g',
  delayIndex = 0,
  className,
}: MacroBarRowProps) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-10%' })
  const reduce = useReducedMotion()
  const pct = macroPct(consumed, target)
  const over = target > 0 && consumed > target
  const transition: Transition = reduce
    ? { duration: 0 }
    : { type: 'spring', stiffness: 80, damping: 18, delay: delayIndex * 0.15 }

  return (
    <div ref={ref} className={cn('space-y-1', className)}>
      <div className="flex justify-between text-[10px] font-medium text-muted-foreground">
        <span>{label}</span>
        <span className="tabular-nums">
          {Math.round(consumed)}/{Math.round(target)}
          {unit}
          {over ? (
            <AlertTriangle
              className="ml-1 inline h-3 w-3"
              style={{ color: MACRO_OVER_COLOR }}
              aria-hidden
            />
          ) : null}
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full"
        style={{ backgroundColor: 'var(--ring-track-strong)' }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-valuetext={macroBarAriaText(label, consumed, target, unit)}
        aria-label={label}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: over ? MACRO_OVER_COLOR : color }}
          initial={{ width: '0%' }}
          animate={inView ? { width: `${pct}%` } : { width: '0%' }}
          transition={transition}
          aria-hidden
        />
      </div>
    </div>
  )
}

export interface MacroBarsProps {
  protein: MacroBarDatum
  carbs: MacroBarDatum
  fats: MacroBarDatum
  labels?: Partial<Record<MacroKey, string>>
  className?: string
}

/**
 * Stacked protein / carbs / fats bars (the daily-summary "weekly"-style layout).
 * Each bar is an independent `progressbar` with an `aria-valuetext` sentence.
 */
export function MacroBars({ protein, carbs, fats, labels, className }: MacroBarsProps) {
  const rows: { key: MacroKey; datum: MacroBarDatum }[] = [
    { key: 'protein', datum: protein },
    { key: 'carbs', datum: carbs },
    { key: 'fats', datum: fats },
  ]
  return (
    <div className={cn('space-y-2', className)}>
      {rows.map(({ key, datum }, i) => (
        <MacroBarRow
          key={key}
          label={labels?.[key] ?? MACRO_META[key].label}
          consumed={datum.consumed}
          target={datum.target}
          color={MACRO_META[key].color}
          unit="g"
          delayIndex={i}
        />
      ))}
    </div>
  )
}
