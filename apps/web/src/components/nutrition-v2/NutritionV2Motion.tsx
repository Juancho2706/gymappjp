'use client'

import type { ReactNode } from 'react'
import { AlertTriangle, Check, LoaderCircle, Save } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion'
import {
  NUTRITION_MOTION,
  NUTRITION_STRATEGIES,
  type NutritionSaveState,
  type NutritionStrategy,
  type NutritionTone,
} from '@eva/nutrition-v2'

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

function easingTuple(
  value: readonly [number, number, number, number],
): [number, number, number, number] {
  return [value[0], value[1], value[2], value[3]]
}

const toneClasses: Record<NutritionTone, string> = {
  neutral: 'border-border-default bg-surface-card text-strong hover:bg-surface-sunken',
  brand: 'border-sport-500 bg-sport-500 text-on-sport hover:bg-sport-600',
  nutrition: 'border-primary bg-primary/100 text-white hover:bg-primary/90',
  success: 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700',
  warning: 'border-amber-500 bg-amber-500 text-slate-950 hover:bg-amber-600',
  danger: 'border-rose-600 bg-rose-600 text-white hover:bg-rose-700',
  info: 'border-sky-600 bg-sky-600 text-white hover:bg-sky-700',
}

type NutritionMotionButtonProps = Omit<HTMLMotionProps<'button'>, 'children'> & {
  children: ReactNode
  tone?: NutritionTone
  pending?: boolean
  success?: boolean
}

export function NutritionMotionButton({
  tone = 'nutrition',
  pending = false,
  success = false,
  children,
  className,
  disabled,
  ...props
}: NutritionMotionButtonProps) {
  const reduceMotion = useReducedMotion()
  const isDisabled = disabled || pending

  return (
    <motion.button
      animate={success && !reduceMotion ? { scale: [1, 1.03, 1] } : undefined}
      className={cx(
        'inline-flex min-h-11 items-center justify-center gap-2 rounded-control border px-4 text-sm font-semibold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55',
        toneClasses[tone],
        className,
      )}
      disabled={isDisabled}
      transition={{ duration: NUTRITION_MOTION.feedback.duration / 1000 }}
      whileTap={reduceMotion || isDisabled ? undefined : { scale: NUTRITION_MOTION.press.scale }}
      {...props}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {pending ? (
          <motion.span
            animate={{ opacity: 1, rotate: 360 }}
            aria-hidden="true"
            className="inline-flex"
            exit={{ opacity: 0, scale: 0.8 }}
            initial={{ opacity: 0, scale: 0.8 }}
            key="pending"
            transition={{
              duration: reduceMotion ? 0 : 0.7,
              ease: 'linear',
              repeat: reduceMotion ? 0 : Number.POSITIVE_INFINITY,
            }}
          >
            <LoaderCircle className="h-4 w-4" />
          </motion.span>
        ) : success ? (
          <motion.span
            animate={{ opacity: 1, scale: 1 }}
            aria-hidden="true"
            exit={{ opacity: 0, scale: 0.8 }}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.7 }}
            key="success"
            transition={{ duration: reduceMotion ? 0 : NUTRITION_MOTION.feedback.duration / 1000 }}
          >
            <Check className="h-4 w-4" />
          </motion.span>
        ) : null}
      </AnimatePresence>
      {children}
    </motion.button>
  )
}

export function SelectableStrategyCard({
  strategy,
  selected,
  onSelect,
  disabled = false,
}: {
  strategy: NutritionStrategy
  selected: boolean
  onSelect: (strategy: NutritionStrategy) => void
  disabled?: boolean
}) {
  const reduceMotion = useReducedMotion()
  const meta = NUTRITION_STRATEGIES[strategy]

  return (
    <motion.button
      animate={
        reduceMotion
          ? undefined
          : {
              borderColor: selected ? 'var(--theme-primary)' : 'var(--border-subtle)',
              y: selected ? -2 : 0,
            }
      }
      aria-pressed={selected}
      className={cx(
        'relative min-h-36 w-full rounded-card border bg-surface-card p-4 text-left shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-55',
        selected ? 'border-primary ring-2 ring-primary/20' : 'border-border-subtle hover:border-border-default',
      )}
      disabled={disabled}
      onClick={() => onSelect(strategy)}
      transition={{
        duration: reduceMotion ? 0 : NUTRITION_MOTION.selection.duration / 1000,
        ease: easingTuple(NUTRITION_MOTION.selection.easing),
      }}
      type="button"
      whileTap={reduceMotion || disabled ? undefined : { scale: NUTRITION_MOTION.press.scale }}
    >
      <span className="block pr-8 font-display text-lg font-semibold text-strong">{meta.label}</span>
      <span className="mt-2 block text-sm leading-6 text-muted">{meta.description}</span>
      <AnimatePresence initial={false}>
        {selected ? (
          <motion.span
            animate={{ opacity: 1, scale: 1 }}
            aria-hidden="true"
            className="absolute right-4 top-4 inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/100 text-white"
            exit={{ opacity: 0, scale: 0.7 }}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.7 }}
            transition={{ duration: reduceMotion ? 0 : NUTRITION_MOTION.feedback.duration / 1000 }}
          >
            <Check className="h-4 w-4" />
          </motion.span>
        ) : null}
      </AnimatePresence>
    </motion.button>
  )
}

export function AnimatedStatusCheck({
  checked,
  label,
  error = false,
}: {
  checked: boolean
  label: string
  error?: boolean
}) {
  const reduceMotion = useReducedMotion()

  return (
    <motion.div
      animate={error && !reduceMotion ? { x: [0, -3, 3, -2, 2, 0] } : { x: 0 }}
      aria-live="polite"
      className={cx(
        'inline-flex min-h-9 items-center gap-2 rounded-pill border px-3 text-sm font-semibold',
        error
          ? 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-700 dark:bg-rose-950/30 dark:text-rose-300'
          : checked
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300'
            : 'border-border-default bg-surface-card text-muted',
      )}
      transition={{ duration: reduceMotion ? 0 : NUTRITION_MOTION.feedback.duration / 1000 }}
    >
      <AnimatePresence initial={false} mode="wait">
        {error ? (
          <motion.span
            animate={{ opacity: 1, scale: 1 }}
            aria-hidden="true"
            exit={{ opacity: 0, scale: 0.8 }}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.8 }}
            key="error"
          >
            <AlertTriangle className="h-4 w-4" />
          </motion.span>
        ) : checked ? (
          <motion.span
            animate={{ opacity: 1, scale: 1 }}
            aria-hidden="true"
            exit={{ opacity: 0, scale: 0.8 }}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.7 }}
            key="checked"
          >
            <Check className="h-4 w-4" />
          </motion.span>
        ) : (
          <span aria-hidden="true" className="h-3.5 w-3.5 rounded-full border border-current opacity-60" />
        )}
      </AnimatePresence>
      {label}
    </motion.div>
  )
}

export function SaveStateIndicator({ state }: { state: NutritionSaveState }) {
  const reduceMotion = useReducedMotion()
  const config = {
    idle: { label: 'Sin cambios', icon: Save, className: 'text-muted' },
    dirty: { label: 'Cambios sin guardar', icon: Save, className: 'text-amber-700 dark:text-amber-300' },
    saving: { label: 'Guardando…', icon: LoaderCircle, className: 'text-sky-700 dark:text-sky-300' },
    saved: { label: 'Guardado', icon: Check, className: 'text-emerald-700 dark:text-emerald-300' },
    error: { label: 'No se pudo guardar', icon: AlertTriangle, className: 'text-rose-700 dark:text-rose-300' },
  }[state]
  const Icon = config.icon

  return (
    <AnimatePresence initial={false} mode="wait">
      <motion.span
        animate={{ opacity: 1, y: 0 }}
        aria-live="polite"
        className={cx('inline-flex min-h-8 items-center gap-1.5 text-xs font-semibold', config.className)}
        exit={reduceMotion ? undefined : { opacity: 0, y: -3 }}
        initial={reduceMotion ? false : { opacity: 0, y: 3 }}
        key={state}
        transition={{ duration: reduceMotion ? 0 : NUTRITION_MOTION.feedback.duration / 1000 }}
      >
        <Icon aria-hidden="true" className={cx('h-3.5 w-3.5', state === 'saving' && 'animate-spin')} />
        {config.label}
      </motion.span>
    </AnimatePresence>
  )
}

export function AnimatedListItem({ children, layoutId }: { children: ReactNode; layoutId?: string }) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.div
      animate={{ opacity: 1, height: 'auto', scale: 1 }}
      exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0, scale: 0.98 }}
      initial={reduceMotion ? false : { opacity: 0, height: 0, scale: 0.98 }}
      layout={!reduceMotion}
      layoutId={layoutId}
      transition={{
        duration: reduceMotion ? 0 : NUTRITION_MOTION.layout.duration / 1000,
        ease: easingTuple(NUTRITION_MOTION.layout.easing),
      }}
    >
      {children}
    </motion.div>
  )
}
