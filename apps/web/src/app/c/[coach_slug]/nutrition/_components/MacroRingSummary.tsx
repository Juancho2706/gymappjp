'use client'

import { useEffect } from 'react'
import {
  motion,
  useReducedMotion,
  useMotionValue,
  useTransform,
  animate,
  type Transition,
} from 'framer-motion'
import { easings } from '@/lib/animation-presets'
import { cn } from '@/lib/utils'

/**
 * Número que cuenta hacia arriba acoplado al llenado del anillo.
 * Respeta reduced-motion mostrando el valor final al instante.
 */
function CountUp({
  value,
  duration,
  reduce,
  className,
}: {
  value: number
  duration: number
  reduce: boolean
  className?: string
}) {
  const mv = useMotionValue(reduce ? value : 0)
  const rounded = useTransform(mv, (v) => Math.round(v).toLocaleString('es-CL'))

  useEffect(() => {
    if (reduce) {
      mv.set(value)
      return
    }
    const controls = animate(mv, value, { duration, ease: easings.ringFill })
    return () => controls.stop()
  }, [value, duration, reduce, mv])

  return <motion.span className={className}>{rounded}</motion.span>
}

interface Props {
  calories: { consumed: number; target: number }
  protein: { consumed: number; target: number }
  carbs: { consumed: number; target: number }
  fats: { consumed: number; target: number }
  isReadOnly?: boolean
}

/** Etiquetas ARIA para anillos de macros (proteína, carbos, grasas). Exportado para tests. */
export function macroRingAriaLabel(label: string, consumed: number, target: number, over: boolean): string {
  const c = Math.round(consumed)
  const t = Math.round(target)
  if (t <= 0) return `${label}: sin meta definida, valor mostrado ${c} gramos`
  if (over) return `${label}: ${c} gramos consumidos, por encima de la meta de ${t} gramos`
  return `${label}: ${c} de ${t} gramos respecto a la meta del día`
}

/** Anillo SVG con trazo animado (track + arco). Cool-tinted para superficie inverse. */
function Ring({
  size,
  stroke,
  pct,
  color,
  reduce,
  children,
  ringLabel,
}: {
  size: number
  stroke: number
  pct: number
  color: string
  reduce: boolean
  children: React.ReactNode
  ringLabel: string
}) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDash = circumference * Math.min(pct, 1)
  const ringTrans: Transition = reduce ? { duration: 0 } : { duration: 0.8, ease: easings.ringFill }

  return (
    <div role="img" aria-label={ringLabel} className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          stroke="rgba(255,255,255,0.12)"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          style={{ stroke: color }}
          strokeDasharray={`${circumference}`}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - strokeDash }}
          transition={ringTrans}
        />
      </svg>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" aria-hidden>
        {children}
      </div>
    </div>
  )
}

const MACROS = [
  { key: 'protein', label: 'Proteína', color: 'var(--ember-500)' },
  { key: 'carbs', label: 'Carbos', color: 'var(--sport-500)' },
  { key: 'fats', label: 'Grasas', color: 'var(--aqua-500)' },
] as const

export function MacroRingSummary({ calories, protein, carbs, fats, isReadOnly }: Props) {
  const reduceMotion = useReducedMotion()
  const reduce = !!reduceMotion

  const data: Record<'protein' | 'carbs' | 'fats', { consumed: number; target: number }> = {
    protein,
    carbs,
    fats,
  }

  const calPct = calories.target > 0 ? Math.min(calories.consumed / calories.target, 1) : 0
  const calOver = calories.consumed > calories.target && calories.target > 0
  const remaining = calories.target - calories.consumed
  // Centro del anillo de kcal: "RESTANTES" (objetivo − consumido) o "DE MÁS" si se pasó.
  const kcalCenterValue =
    calories.target <= 0 ? calories.consumed : calOver ? calories.consumed - calories.target : remaining
  const kcalCenterLabel = calories.target <= 0 ? 'KCAL' : calOver ? 'DE MÁS' : 'RESTANTES'

  return (
    <div
      className={cn(
        // Card inverse (DS): superficie oscura fija, hero de progreso del día.
        'relative overflow-hidden rounded-card border border-[var(--border-inverse)] bg-[var(--surface-inverse)] p-5 text-[var(--text-on-dark)] shadow-md',
        isReadOnly && 'opacity-80'
      )}
    >
      {isReadOnly && (
        <span className="absolute right-3 top-3 rounded-pill bg-white/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.12em] text-[var(--text-on-dark-muted)]">
          Solo lectura
        </span>
      )}

      <div className="flex items-center gap-4">
        {/* Anillo de energía (kcal) — acento ember (dominio nutrición). */}
        <Ring
          size={92}
          stroke={8}
          pct={calPct}
          color={calOver ? 'var(--danger-500)' : 'var(--ember-500)'}
          reduce={reduce}
          ringLabel={
            calories.target > 0
              ? `Energía: ${Math.round(calories.consumed)} de ${calories.target} kilocalorías, ${Math.round(calPct * 100)} por ciento`
              : `Energía: ${Math.round(calories.consumed)} kilocalorías, sin meta definida`
          }
        >
          <CountUp
            value={Math.max(0, kcalCenterValue)}
            duration={reduce ? 0 : 0.8}
            reduce={reduce}
            className="font-display text-xl font-black leading-none tracking-[-0.03em] tabular-nums"
          />
          <span className="mt-0.5 text-[8.5px] font-black uppercase tracking-[0.1em] text-[var(--text-on-dark-muted)]">
            {kcalCenterLabel}
          </span>
        </Ring>

        {/* Anillos de macros (proteína / carbos / grasas). */}
        <div className="flex flex-1 items-start justify-around">
          {MACROS.map((m) => {
            const { consumed, target } = data[m.key]
            const pct = target > 0 ? Math.min(consumed / target, 1) : 0
            const over = consumed > target && target > 0
            return (
              <div key={m.key} className="flex flex-col items-center gap-1.5">
                <Ring
                  size={52}
                  stroke={5}
                  pct={pct}
                  color={over ? 'var(--danger-500)' : m.color}
                  reduce={reduce}
                  ringLabel={macroRingAriaLabel(m.label, consumed, target, over)}
                >
                  <CountUp
                    value={consumed}
                    duration={reduce ? 0 : 0.8}
                    reduce={reduce}
                    className={cn(
                      'text-[11px] font-black leading-none tabular-nums',
                      over ? 'text-[var(--danger-500)]' : 'text-[var(--text-on-dark)]'
                    )}
                  />
                </Ring>
                <span className="text-[10px] font-bold text-[var(--text-on-dark-muted)]">{m.label}</span>
                <span className="-mt-1 text-[9px] tabular-nums text-[var(--text-on-dark-muted)] opacity-70">
                  / {Math.round(target)}g
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
