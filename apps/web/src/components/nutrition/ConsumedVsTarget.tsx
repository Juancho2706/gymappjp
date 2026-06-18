'use client'

import { motion, useReducedMotion, type Transition } from 'framer-motion'
import { cn } from '@/lib/utils'
import { MACRO_GOAL_COLOR, MACRO_OVER_COLOR, macroPct } from './macro-tokens'

export interface ConsumedVsTargetProps {
  /** Consumed amount. */
  consumed: number
  /** Target amount. */
  target: number
  /** Unit shown next to the numbers. */
  unit?: 'kcal' | 'g'
  /** Headline above the numbers (e.g. "Energía diaria", "Calorías"). */
  label: string
  /** Bar fill color when on/under target. Defaults to adherence green. */
  color?: string
  className?: string
}

/**
 * Calorie/energy "consumed vs target" headline + progress bar. The big number,
 * the percentage and the over/under state all carry text — color is never the
 * only signal. Bar is an a11y `progressbar` with an `aria-valuetext` sentence.
 */
export function ConsumedVsTarget({
  consumed,
  target,
  unit = 'kcal',
  label,
  color = MACRO_GOAL_COLOR,
  className,
}: ConsumedVsTargetProps) {
  const reduce = useReducedMotion()
  const pct = macroPct(consumed, target)
  const over = target > 0 && consumed > target
  const transition: Transition = reduce ? { duration: 0 } : { duration: 0.6, ease: 'easeOut' }
  const word = unit === 'kcal' ? 'kilocalorías' : 'gramos'
  const valueText = `${Math.round(consumed)} de ${Math.round(target)} ${word}, ${Math.round(
    pct
  )} por ciento${over ? ', por encima de la meta' : ''}`

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-baseline justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
            {label}
          </p>
          <div className="mt-0.5 flex items-baseline gap-1.5">
            <span className="text-4xl font-black tabular-nums tracking-tight">
              {Math.round(consumed)}
            </span>
            <span className="text-sm font-bold text-muted-foreground/50">
              / {Math.round(target)} {unit}
            </span>
          </div>
        </div>
        <span
          className="text-2xl font-black tabular-nums"
          style={{ color: over ? MACRO_OVER_COLOR : MACRO_GOAL_COLOR }}
        >
          {Math.round(pct)}%
          {over ? <span className="ml-1 text-xs font-bold align-middle">Sobre meta</span> : null}
        </span>
      </div>

      <div
        className="h-3 w-full overflow-hidden rounded-full"
        style={{ backgroundColor: 'var(--ring-track-strong)' }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-valuetext={valueText}
        aria-label={label}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: over ? MACRO_OVER_COLOR : color }}
          initial={{ width: '0%' }}
          animate={{ width: `${pct}%` }}
          transition={transition}
          aria-hidden
        />
      </div>
    </div>
  )
}
