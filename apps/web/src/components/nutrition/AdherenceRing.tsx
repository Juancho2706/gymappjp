'use client'

import { useEffect, useState } from 'react'
import {
  useReducedMotion,
  useMotionValue,
  useSpring,
  useMotionValueEvent,
} from 'framer-motion'
import { CircularProgressbar, buildStyles } from 'react-circular-progressbar'
import 'react-circular-progressbar/dist/styles.css'
import { cn } from '@/lib/utils'
import { MACRO_GOAL_COLOR } from './macro-tokens'

export interface AdherenceRingProps {
  /** Adherence/compliance percentage (0–100). Clamped. */
  value: number
  /** Caption under the ring. */
  label: string
  /** Ring stroke color (CSS color). Defaults to the success/adherence green. */
  color?: string
  /** No data in window → grey ring + em-dash + "Sin datos". */
  empty?: boolean
  /** Pixel size of the ring box. */
  size?: number
  /**
   * Full accessible sentence ("Adherencia semanal: 82 por ciento").
   * If omitted, a sentence is composed from `label` + value.
   */
  ariaValueText?: string
  className?: string
}

const EMPTY_STROKE = '#9ca3af'

/**
 * Single circular progress ring for adherence/compliance percentages.
 * Presentational + a11y-complete: `role="progressbar"` with `aria-valuetext`
 * (never color-alone). Animates with a spring; collapses to the final value
 * under `prefers-reduced-motion`.
 */
export function AdherenceRing({
  value,
  label,
  color = MACRO_GOAL_COLOR,
  empty,
  size = 88,
  ariaValueText,
  className,
}: AdherenceRingProps) {
  const reduce = useReducedMotion()
  const clamped = Math.max(0, Math.min(100, Math.round(value)))
  const [animated, setAnimated] = useState(reduce ? clamped : 0)
  const mv = useMotionValue(0)
  const spring = useSpring(mv, { stiffness: 60, damping: 20 })

  useEffect(() => {
    if (empty) {
      mv.set(0)
      setAnimated(0)
      return
    }
    mv.set(clamped)
  }, [clamped, mv, empty])

  useMotionValueEvent(spring, 'change', (v) => setAnimated(Math.round(v)))

  const displayPct = empty ? 0 : reduce ? clamped : animated
  const pathColor = empty ? EMPTY_STROKE : color
  const centerText = empty ? '—' : `${displayPct}%`
  const valueText = empty
    ? `${label}: sin datos en el periodo`
    : (ariaValueText ?? `${label}: ${clamped} por ciento`)

  return (
    <div className={cn('flex flex-col items-center gap-1', className)}>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={empty ? undefined : clamped}
        aria-valuetext={valueText}
        aria-label={label}
        style={{ width: size, height: size }}
      >
        <CircularProgressbar
          value={displayPct}
          text={centerText}
          styles={buildStyles({
            pathColor,
            trailColor: 'var(--ring-track-strong)',
            textColor: empty ? 'var(--muted-foreground)' : 'var(--foreground)',
            textSize: empty ? '22px' : '26px',
            pathTransitionDuration: reduce ? 0 : 0.001,
          })}
        />
      </div>
      <span className="text-center text-[10px] font-medium text-muted-foreground sm:text-xs">
        {label}
      </span>
      {empty ? (
        <span className="text-center text-[9px] text-muted-foreground/80">Sin datos</span>
      ) : null}
    </div>
  )
}
