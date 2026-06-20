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
import { AlertTriangle } from 'lucide-react'
import { easings } from '@/lib/animation-presets'
import { cn } from '@/lib/utils'
import { InfoTooltip } from '@/components/ui/info-tooltip'

/**
 * Número que cuenta hacia arriba acoplado al llenado del anillo/barra.
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

interface MacroData {
  consumed: number
  target: number
  label: string
  color: string
  bgColor: string
  tooltip?: string
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

function MacroRing({
  consumed,
  target,
  label,
  color,
  tooltip,
  size = 80,
  ringTransition: ringTrans,
  reduce,
  countDuration,
}: MacroData & { size?: number; ringTransition: Transition; reduce: boolean; countDuration: number }) {
  const pct = target > 0 ? Math.min(consumed / target, 1.1) : 0
  const over = consumed > target && target > 0
  const radius = (size - 8) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDash = circumference * Math.min(pct, 1)
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
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" aria-hidden>
          {over ? (
            <AlertTriangle className="w-4 h-4 text-red-500" />
          ) : (
            <CountUp
              value={consumed}
              duration={countDuration}
              reduce={reduce}
              className="text-sm font-black tabular-nums leading-none"
            />
          )}
        </div>
      </div>
      <div className="text-center">
        <div className="flex items-center justify-center gap-0.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{label}</p>
          {tooltip && <InfoTooltip content={tooltip} iconClassName="w-3 h-3" />}
        </div>
        <p className="text-[9px] text-muted-foreground/60 tabular-nums">/ {Math.round(target)}g</p>
      </div>
    </div>
  )
}

export function MacroRingSummary({ calories, protein, carbs, fats, isReadOnly }: Props) {
  const reduceMotion = useReducedMotion()
  const reduce = !!reduceMotion
  const ringTrans: Transition = reduce
    ? { duration: 0 }
    : { duration: 0.8, ease: easings.ringFill }
  const barTrans: Transition = reduce ? { duration: 0 } : { duration: 0.6, ease: 'easeOut' }
  // Count-up acoplado al anillo (0.8s) y a la barra (0.6s) para que número y trazo lleguen juntos.
  const ringCountDuration = 0.8
  const barCountDuration = 0.6

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
            <div className="flex items-center gap-1">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">
                Energía {isReadOnly ? '· Solo lectura' : 'diaria'}
              </p>
              <InfoTooltip content="Meta calórica diaria definida por tu coach. Si completaste todas tus comidas, estarás cerca del 100%." iconClassName="w-3 h-3" />
            </div>
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <CountUp
                value={calories.consumed}
                duration={barCountDuration}
                reduce={reduce}
                className="text-4xl font-black tabular-nums tracking-tight"
              />
              <span className="text-sm font-bold text-muted-foreground/50">/ {calories.target} kcal</span>
            </div>
          </div>
          <div className="text-right">
            <span
              className={cn(
                'inline-flex items-baseline text-2xl font-black tabular-nums',
                calOver ? 'text-red-500' : 'text-emerald-500'
              )}
            >
              <CountUp value={calPct} duration={barCountDuration} reduce={reduce} />%
            </span>
          </div>
        </div>

        <div
          className="h-3 w-full bg-muted rounded-full overflow-hidden"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(calPct)}
          aria-valuetext={`${Math.round(calories.consumed)} de ${calories.target} kilocalorías, ${Math.round(calPct)} por ciento`}
          aria-label="Progreso de calorías del día respecto a la meta"
        >
          <motion.div
            className={cn(
              'h-full rounded-full shadow-[0_0_10px_rgba(16,185,129,0.3)]',
              calOver ? 'bg-red-500' : 'bg-emerald-500'
            )}
            initial={{ width: '0%' }}
            animate={{ width: `${calPct}%` }}
            transition={barTrans}
            aria-hidden
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 pt-1">
        <MacroRing
          consumed={protein.consumed}
          target={protein.target}
          label="Proteína"
          color="var(--color-macro-protein)"
          bgColor="#7c2d12"
          size={88}
          ringTransition={ringTrans}
          reduce={reduce}
          countDuration={ringCountDuration}
          tooltip="La proteína ayuda a mantener y construir músculo. Tu meta diaria está definida en tu plan."
        />
        <MacroRing
          consumed={carbs.consumed}
          target={carbs.target}
          label="Carbos"
          color="var(--color-macro-carbs)"
          bgColor="#1e3a5f"
          size={88}
          ringTransition={ringTrans}
          reduce={reduce}
          countDuration={ringCountDuration}
          tooltip="Los carbohidratos son tu fuente principal de energía. Son especialmente importantes en días de entrenamiento."
        />
        <MacroRing
          consumed={fats.consumed}
          target={fats.target}
          label="Grasas"
          color="var(--color-macro-fats)"
          bgColor="#713f12"
          size={88}
          ringTransition={ringTrans}
          reduce={reduce}
          countDuration={ringCountDuration}
          tooltip="Las grasas saludables son esenciales para el equilibrio hormonal y la absorción de vitaminas."
        />
      </div>
    </div>
  )
}
