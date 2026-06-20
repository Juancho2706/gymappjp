'use client'

import { motion, useReducedMotion, type Transition } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  MACRO_META,
  MACRO_OVER_COLOR,
  macroRatio,
  type MacroKey,
} from './macro-tokens'

export interface MacroDatum {
  consumed: number
  target: number
}

export interface MacroRingsProps {
  protein: MacroDatum
  carbs: MacroDatum
  fats: MacroDatum
  /** Override the default Spanish labels (e.g. for i18n). */
  labels?: Partial<Record<MacroKey, string>>
  /** Pixel size of each ring. */
  size?: number
  className?: string
}

/** Accessible sentence for a single macro ring. Exported for tests. */
export function macroRingAriaLabel(
  label: string,
  consumed: number,
  target: number,
  over: boolean
): string {
  const c = Math.round(consumed)
  const t = Math.round(target)
  if (t <= 0) return `${label}: sin meta definida, valor mostrado ${c} gramos`
  if (over) return `${label}: ${c} gramos consumidos, por encima de la meta de ${t} gramos`
  const pct = Math.round((consumed / target) * 100)
  return `${label}: ${c} de ${t} gramos, ${pct} por ciento de la meta del día`
}

function MacroRing({
  consumed,
  target,
  label,
  color,
  size,
  ringTransition,
}: MacroDatum & {
  label: string
  color: string
  size: number
  ringTransition: Transition
}) {
  const ratio = macroRatio(consumed, target)
  const over = consumed > target && target > 0
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDash = circumference * Math.min(ratio, 1)
  const ringLabel = macroRingAriaLabel(label, consumed, target, over)

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        role="img"
        aria-label={ringLabel}
        className="relative"
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} className="-rotate-90" aria-hidden>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={7}
            stroke="var(--ring-track-strong)"
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={7}
            strokeLinecap="round"
            style={{ stroke: over ? MACRO_OVER_COLOR : color }}
            strokeDasharray={`${circumference}`}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference - strokeDash }}
            transition={ringTransition}
          />
        </svg>
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
          aria-hidden
        >
          {over ? (
            <AlertTriangle className="h-4 w-4" style={{ color: MACRO_OVER_COLOR }} />
          ) : (
            <span className="text-sm font-black tabular-nums leading-none">
              {Math.round(consumed)}
            </span>
          )}
        </div>
      </div>
      <div className="text-center">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <p className="text-[9px] text-muted-foreground/60 tabular-nums">/ {Math.round(target)}g</p>
      </div>
    </div>
  )
}

/**
 * Three-up macro rings (protein / carbs / fats) using canonical macro tokens.
 * Each ring carries `role="img"` + `aria-label` (color is never the only channel:
 * hue + position + label + grams; over-target = distinct hue + word + icon).
 */
export function MacroRings({
  protein,
  carbs,
  fats,
  labels,
  size = 88,
  className,
}: MacroRingsProps) {
  const reduce = useReducedMotion()
  const ringTransition: Transition = reduce
    ? { duration: 0 }
    : { duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }

  const rows: { key: MacroKey; datum: MacroDatum }[] = [
    { key: 'protein', datum: protein },
    { key: 'carbs', datum: carbs },
    { key: 'fats', datum: fats },
  ]

  return (
    <div className={cn('grid grid-cols-3 gap-2', className)}>
      {rows.map(({ key, datum }) => (
        <MacroRing
          key={key}
          consumed={datum.consumed}
          target={datum.target}
          label={labels?.[key] ?? MACRO_META[key].label}
          color={MACRO_META[key].color}
          size={size}
          ringTransition={ringTransition}
        />
      ))}
    </div>
  )
}
