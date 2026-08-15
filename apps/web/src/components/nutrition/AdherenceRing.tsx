'use client'

import { useEffect, useState } from 'react'
import { useReducedMotion } from '@/lib/use-reduced-motion'
import { CircularProgressbarWithChildren, buildStyles } from 'react-circular-progressbar'
import 'react-circular-progressbar/dist/styles.css'
import { CountUpText } from '@/components/ui/count-up'
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

/** `textSize` de la librería va en unidades del viewBox 0 0 100 100. */
const CENTER_TEXT_UNITS = 26
const EMPTY_TEXT_UNITS = 22

/**
 * Single circular progress ring for adherence/compliance percentages.
 * Presentational + a11y-complete: `role="progressbar"` with `aria-valuetext`
 * (never color-alone). Animates with a spring; collapses to the final value
 * under `prefers-reduced-motion`.
 *
 * El número del centro lo interpola `CountUpText` (MotionValue → DOM) y el arco
 * lo mueve la transición CSS de la librería. Antes un único `setState` por frame
 * manejaba las dos cosas: eso es lo que dispara el "Maximum update depth
 * exceeded" de React 19 (ver `components/ui/count-up.tsx`).
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

  // Un ÚNICO commit al montar dispara el barrido 0 → valor del arco por CSS.
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  const ringValue = empty || !mounted ? 0 : clamped
  const pathColor = empty ? EMPTY_STROKE : color
  const valueText = empty
    ? `${label}: sin datos en el periodo`
    : (ariaValueText ?? `${label}: ${clamped} por ciento`)

  // Centro en HTML (antes era `<text>` SVG): hay que pasar el tamaño del viewBox a px reales.
  const centerFontSize = (size * (empty ? EMPTY_TEXT_UNITS : CENTER_TEXT_UNITS)) / 100

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
        <CircularProgressbarWithChildren
          value={ringValue}
          styles={buildStyles({
            pathColor,
            trailColor: 'var(--ring-track-strong)',
            pathTransitionDuration: reduce ? 0 : 0.8,
          })}
        >
          {empty ? (
            <span
              aria-hidden
              style={{ fontSize: centerFontSize, color: 'var(--muted-foreground)' }}
            >
              —
            </span>
          ) : (
            <span
              aria-hidden
              className="tabular-nums"
              style={{ fontSize: centerFontSize, color: 'var(--foreground)' }}
            >
              <CountUpText value={clamped} />%
            </span>
          )}
        </CircularProgressbarWithChildren>
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
