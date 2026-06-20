'use client'

import { useRef } from 'react'
import { motion, useInView, useReducedMotion, type Transition } from 'framer-motion'
import { ArrowUp, Check, Triangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MACRO_GOAL_COLOR, MACRO_OVER_COLOR } from './macro-tokens'

/**
 * Intent of a nutrient target:
 * - `aimup`  → "fill to reach" (e.g. protein, fiber): under target is neutral,
 *   at/above target is good.
 * - `cap`    → "fill to avoid" (e.g. sodium, sugar, saturated fat): approaching
 *   the ceiling is a warning, over the ceiling is an alarm.
 */
export type NutrientIntent = 'aimup' | 'cap'

/** Redundant status — NEVER encoded by color alone (color + word + icon + position). */
export type NutrientStatus = 'low' | 'optimal' | 'high'

const STATUS_META: Record<
  NutrientStatus,
  { word: string; Icon: typeof ArrowUp; color: string }
> = {
  // Neutral / muted: not failing, just not there yet (aimup) — uses muted text color.
  low: { word: 'Bajo', Icon: ArrowUp, color: 'var(--muted-foreground)' },
  optimal: { word: 'Óptimo', Icon: Check, color: MACRO_GOAL_COLOR },
  high: { word: 'Alto', Icon: Triangle, color: MACRO_OVER_COLOR },
}

export interface NutrientRangeBarProps {
  label: string
  value: number
  unit: string
  /** Lower bound (minimum desirable). Optional. */
  floor?: number
  /** Target value (the goal). Optional. */
  target?: number
  /** Upper bound (do-not-exceed). Optional. */
  ceiling?: number
  intent: NutrientIntent
  /** Stagger index for entrance animation. */
  delayIndex?: number
  className?: string
}

/**
 * Resolve the redundant status for a nutrient value.
 *
 * `aimup`: below floor (or below target when no floor) = `low` (neutral),
 * at/above target (or floor) = `optimal`, above ceiling = `high` (over-shoot).
 *
 * `cap`: comfortably under = `optimal`, within ~85% of ceiling (or above target)
 * = `low` is meaningless here, so we map approaching = `optimal`→warning is via
 * `high` only when over. To keep three redundant words, `cap` uses:
 *   under target → `optimal`, between target and ceiling → `low` (caution band
 *   surfaced as the neutral word is confusing) → we instead use `optimal`/`high`.
 *
 * Exported for tests.
 */
export function nutrientStatus(
  value: number,
  intent: NutrientIntent,
  floor?: number,
  target?: number,
  ceiling?: number
): NutrientStatus {
  if (intent === 'cap') {
    // Fill-to-avoid: over the ceiling (or over target when no ceiling) = alarm.
    const limit = ceiling ?? target
    if (limit != null && value > limit) return 'high'
    // Approaching the ceiling (>=85%) is a caution — surface as `high` word-wise
    // would over-alarm; keep `optimal` until limit, `low` is not used for cap.
    return 'optimal'
  }
  // aimup: fill-to-reach.
  if (ceiling != null && value > ceiling) return 'high' // overshot the safe range
  const reach = target ?? floor
  if (reach != null && value >= reach) return 'optimal'
  if (floor != null && value >= floor) return 'optimal'
  return 'low'
}

/** Accessible sentence: "value unit, estado". Exported for tests. */
export function nutrientRangeAriaText(
  label: string,
  value: number,
  unit: string,
  status: NutrientStatus
): string {
  return `${label}: ${roundish(value)} ${unit}, ${STATUS_META[status].word}`
}

function roundish(n: number): number {
  return Math.abs(n) < 10 ? Math.round(n * 10) / 10 : Math.round(n)
}

/** Scale max used to place ticks + the fill. */
function scaleMax(value: number, floor?: number, target?: number, ceiling?: number): number {
  const candidates = [value, floor ?? 0, target ?? 0, ceiling ?? 0].filter((n) => n > 0)
  const max = candidates.length ? Math.max(...candidates) : 1
  // Give a little headroom so the top tick/fill is never flush against the edge.
  return max * 1.1
}

function pct(n: number, max: number): number {
  if (max <= 0) return 0
  return Math.min(Math.max((n / max) * 100, 0), 100)
}

/**
 * Horizontal nutrient range bar with floor/target/ceiling tick marks and a fill.
 * Presentational only (props in, no IO). Status is encoded redundantly — color,
 * status word (Bajo/Óptimo/Alto), a lucide icon, and fill position — and exposed
 * to assistive tech via `role="meter"` + `aria-valuetext`.
 */
export function NutrientRangeBar({
  label,
  value,
  unit,
  floor,
  target,
  ceiling,
  intent,
  delayIndex = 0,
  className,
}: NutrientRangeBarProps) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-10%' })
  const reduce = useReducedMotion()

  const status = nutrientStatus(value, intent, floor, target, ceiling)
  const meta = STATUS_META[status]
  const StatusIcon = meta.Icon

  const max = scaleMax(value, floor, target, ceiling)
  const fillPct = pct(value, max)

  const fillColor =
    status === 'high'
      ? MACRO_OVER_COLOR
      : status === 'optimal'
        ? MACRO_GOAL_COLOR
        : 'var(--color-macro-protein)'

  const transition: Transition = reduce
    ? { duration: 0 }
    : { type: 'spring', stiffness: 80, damping: 18, delay: delayIndex * 0.12 }

  const ticks: { key: string; at: number; title: string }[] = [
    floor != null ? { key: 'floor', at: floor, title: `Mínimo ${roundish(floor)} ${unit}` } : null,
    target != null ? { key: 'target', at: target, title: `Meta ${roundish(target)} ${unit}` } : null,
    ceiling != null
      ? { key: 'ceiling', at: ceiling, title: `Máximo ${roundish(ceiling)} ${unit}` }
      : null,
  ].filter((t): t is { key: string; at: number; title: string } => t !== null)

  return (
    <div ref={ref} className={cn('space-y-1', className)}>
      <div className="flex items-center justify-between text-[11px] font-medium">
        <span className="text-muted-foreground">{label}</span>
        <span className="flex items-center gap-1 tabular-nums" style={{ color: meta.color }}>
          {roundish(value)}
          {unit}
          <StatusIcon className="h-3 w-3" aria-hidden />
          <span className="font-semibold">{meta.word}</span>
        </span>
      </div>
      <div
        className="relative h-2.5 overflow-hidden rounded-full"
        style={{ backgroundColor: 'var(--ring-track-strong)' }}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={roundish(max)}
        aria-valuenow={roundish(value)}
        aria-valuetext={nutrientRangeAriaText(label, value, unit, status)}
        aria-label={label}
      >
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: fillColor }}
          initial={{ width: '0%' }}
          animate={inView ? { width: `${fillPct}%` } : { width: '0%' }}
          transition={transition}
          aria-hidden
        />
        {ticks.map((t) => (
          <span
            key={t.key}
            title={t.title}
            aria-hidden
            className={cn(
              'absolute top-0 h-full w-px',
              t.key === 'ceiling' ? 'bg-[var(--color-macro-over)]' : 'bg-foreground/40'
            )}
            style={{ left: `${pct(t.at, max)}%` }}
          />
        ))}
      </div>
    </div>
  )
}
