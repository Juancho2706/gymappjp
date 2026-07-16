import type { ReactNode } from 'react'
import { AlertTriangle, Info } from 'lucide-react'
import {
  NUTRITION_MACROS,
  formatNutritionAmount,
  formatNutritionCalories,
  nutritionProgressPercent,
  resolveMacroProgressState,
  type NutritionAttentionModel,
  type NutritionMacroValue,
  type NutritionTone,
} from '@eva/nutrition-v2'

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

const macroBarClasses = {
  protein: 'bg-ember-500',
  carbs: 'bg-sport-500',
  fats: 'bg-aqua-500',
} as const

const macroTextClasses = {
  protein: 'text-ember-700 dark:text-ember-300',
  carbs: 'text-sport-700 dark:text-sport-300',
  fats: 'text-aqua-700 dark:text-aqua-300',
} as const

const toneClasses: Record<NutritionTone, string> = {
  neutral: 'border-border-subtle bg-surface-card text-strong',
  brand: 'border-sport-300/50 bg-sport-100/70 text-sport-700 dark:border-sport-600/40 dark:bg-sport-100/20 dark:text-sport-300',
  nutrition: 'border-primary/30 bg-primary/10 text-primary',
  success: 'border-emerald-300/60 bg-emerald-50 text-emerald-800 dark:border-emerald-700/50 dark:bg-emerald-950/30 dark:text-emerald-300',
  warning: 'border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-700/50 dark:bg-amber-950/30 dark:text-amber-200',
  danger: 'border-rose-300/60 bg-rose-50 text-rose-800 dark:border-rose-700/50 dark:bg-rose-950/30 dark:text-rose-300',
  info: 'border-sky-300/60 bg-sky-50 text-sky-800 dark:border-sky-700/50 dark:bg-sky-950/30 dark:text-sky-300',
}

export function MacroBudget({
  calories,
  macros,
  compact = false,
  className,
}: {
  calories?: { consumed: number; target: number }
  macros: NutritionMacroValue[]
  compact?: boolean
  className?: string
}) {
  return (
    <section
      aria-label="Presupuesto nutricional"
      className={cx('rounded-card border border-border-subtle bg-surface-card p-4 shadow-sm', className)}
    >
      {calories ? (
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-border-subtle pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-subtle">Energía</p>
            <p className="mt-1 font-display text-2xl font-bold tabular-nums text-strong">
              {formatNutritionCalories(calories.consumed)}
              <span className="ml-1 text-sm font-medium text-muted">/ {formatNutritionCalories(calories.target)}</span>
            </p>
          </div>
          <p className="text-sm font-semibold tabular-nums text-primary">
            {formatNutritionCalories(Math.max(calories.target - calories.consumed, 0))} restantes
          </p>
        </div>
      ) : null}
      <div className={cx('grid gap-3', compact ? 'grid-cols-3' : 'sm:grid-cols-3')}>
        {macros.map((macro) => (
          <MacroProgress key={macro.macro} {...macro} compact={compact} />
        ))}
      </div>
    </section>
  )
}

export function MacroProgress({
  macro,
  consumed,
  target,
  unit = 'g',
  tolerancePercent = 5,
  compact = false,
}: NutritionMacroValue & { compact?: boolean }) {
  const meta = NUTRITION_MACROS[macro]
  const percent = nutritionProgressPercent(consumed, target)
  const state = resolveMacroProgressState(consumed, target, tolerancePercent)
  const stateLabel = {
    empty: 'Sin registros',
    under: 'Bajo el rango',
    'in-range': 'En rango',
    over: 'Sobre el rango',
  }[state]

  return (
    <div className={cx('min-w-0', compact ? 'space-y-1.5' : 'space-y-2')}>
      <div className="flex items-center justify-between gap-2">
        <span className={cx('truncate text-xs font-semibold', macroTextClasses[macro])}>
          {compact ? meta.shortLabel : meta.label}
        </span>
        <span className="text-[11px] font-medium text-muted">{stateLabel}</span>
      </div>
      <div
        aria-label={`${meta.label}: ${consumed} de ${target} ${unit}`}
        aria-valuemax={target}
        aria-valuemin={0}
        aria-valuenow={Math.min(consumed, target)}
        role="progressbar"
        className="h-2 overflow-hidden rounded-pill bg-surface-sunken"
      >
        <div
          className={cx('h-full rounded-pill transition-[width] duration-[var(--dur-base)]', macroBarClasses[macro])}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="font-mono text-xs text-muted">
        <span className="font-semibold text-strong">{formatNutritionAmount(consumed, unit, 1)}</span>
        {' / '}
        {formatNutritionAmount(target, unit, 1)}
      </p>
    </div>
  )
}

export function CoachAttentionCard({
  item,
  action,
}: {
  item: NutritionAttentionModel
  action?: ReactNode
}) {
  const Icon = item.tone === 'warning' || item.tone === 'danger' ? AlertTriangle : Info
  return (
    <article className={cx('rounded-card border p-4', toneClasses[item.tone])}>
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-current/10">
          <Icon aria-hidden="true" className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{item.title}</h3>
          <p className="mt-1 text-sm opacity-85">{item.description}</p>
          <p className="mt-2 text-xs font-medium opacity-70">Motivo: {item.reason}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </article>
  )
}

export function StudentPreview({
  title = 'Vista del alumno',
  themeLabel,
  children,
}: {
  title?: string
  themeLabel?: string
  children: ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-[32px] border-8 border-surface-inverse bg-surface-app shadow-xl">
      <div className="flex h-7 items-center justify-center bg-surface-inverse">
        <span className="h-1.5 w-20 rounded-pill bg-white/20" />
      </div>
      <div className="flex items-center justify-between border-b border-border-subtle bg-surface-card px-4 py-3">
        <p className="text-sm font-semibold text-strong">{title}</p>
        {themeLabel ? <span className="text-xs text-muted">{themeLabel}</span> : null}
      </div>
      <div className="max-h-[620px] overflow-y-auto p-3">{children}</div>
    </section>
  )
}
