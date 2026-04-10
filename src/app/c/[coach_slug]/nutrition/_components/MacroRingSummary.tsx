'use client'

import { motion, useReducedMotion, type Transition } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MacroData {
  consumed: number
  target: number
  label: string
  color: string
  bgColor: string
}

interface Props {
  calories: { consumed: number; target: number }
  protein: { consumed: number; target: number }
  carbs: { consumed: number; target: number }
  fats: { consumed: number; target: number }
  isReadOnly?: boolean
}

function MacroRing({
  consumed,
  target,
  label,
  color,
  size = 80,
  ringTransition: ringTrans,
}: MacroData & { size?: number; ringTransition: Transition }) {
  const pct = target > 0 ? Math.min(consumed / target, 1.1) : 0
  const over = consumed > target && target > 0
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDash = circumference * Math.min(pct, 1)

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={7}
            className="stroke-muted-foreground/25"
          />
          <motion.circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={7}
            strokeLinecap="round"
            className={over ? 'stroke-destructive' : ''}
            style={over ? undefined : { stroke: color }}
            strokeDasharray={`${circumference}`}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: circumference - strokeDash }}
            transition={ringTrans}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {over ? (
            <AlertTriangle className="w-4 h-4 text-red-500" />
          ) : (
            <span className="text-sm font-black tabular-nums leading-none">{Math.round(consumed)}</span>
          )}
        </div>
      </div>
      <div className="text-center">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
        <p className="text-[9px] text-muted-foreground/60 tabular-nums">/ {Math.round(target)}g</p>
      </div>
    </div>
  )
}

export function MacroRingSummary({ calories, protein, carbs, fats, isReadOnly }: Props) {
  const reduceMotion = useReducedMotion()
  const ringTrans: Transition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.8, ease: [0.34, 1.56, 0.64, 1] }
  const barTrans: Transition = reduceMotion ? { duration: 0 } : { duration: 0.6, ease: 'easeOut' }

  const calPct = calories.target > 0 ? Math.min((calories.consumed / calories.target) * 100, 100) : 0
  const calOver = calories.consumed > calories.target && calories.target > 0

  return (
    <div
      className={cn(
        'bg-card border border-border rounded-3xl p-5 space-y-5 shadow-sm overflow-hidden relative',
        isReadOnly && 'opacity-80'
      )}
    >
      <div className="space-y-2">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
              Energía {isReadOnly ? '· Solo lectura' : 'diaria'}
            </p>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className="text-4xl font-black tabular-nums tracking-tight">
                {Math.round(calories.consumed)}
              </span>
              <span className="text-sm font-bold text-muted-foreground/50">/ {calories.target} kcal</span>
            </div>
          </div>
          <div className="text-right">
            <span
              className={cn('text-2xl font-black tabular-nums', calOver ? 'text-red-500' : 'text-emerald-500')}
            >
              {Math.round(calPct)}%
            </span>
          </div>
        </div>

        <div className="h-3 w-full bg-muted rounded-full overflow-hidden">
          <motion.div
            className={cn(
              'h-full rounded-full shadow-[0_0_10px_rgba(16,185,129,0.3)]',
              calOver ? 'bg-red-500' : 'bg-emerald-500'
            )}
            initial={{ width: '0%' }}
            animate={{ width: `${calPct}%` }}
            transition={barTrans}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 pt-1">
        <MacroRing
          consumed={protein.consumed}
          target={protein.target}
          label="Proteína"
          color="#f97316"
          bgColor="#7c2d12"
          size={88}
          ringTransition={ringTrans}
        />
        <MacroRing
          consumed={carbs.consumed}
          target={carbs.target}
          label="Carbos"
          color="#3b82f6"
          bgColor="#1e3a5f"
          size={88}
          ringTransition={ringTrans}
        />
        <MacroRing
          consumed={fats.consumed}
          target={fats.target}
          label="Grasas"
          color="#eab308"
          bgColor="#713f12"
          size={88}
          ringTransition={ringTrans}
        />
      </div>
    </div>
  )
}
