'use client'

import { useMemo } from 'react'
import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import type { DayVariant, ExchangeGroup } from '@/domain/nutrition/exchange.types'
import {
  exchangeGroupColor,
  formatPortions,
  hasUnconfirmedMacros,
  macrosForTargets,
  portionsSummaryLabel,
} from '@/services/nutrition-exchanges/exchange-calc'
import type { ExchangeTargetDraft } from './types'

export type ExchangeSaveState = 'idle' | 'saving' | 'saved' | 'error'

interface Props {
  mealId: string
  /** false ⇒ comida aún sin id de DB (plan nuevo): steppers deshabilitados con hint. */
  persistable: boolean
  groups: ExchangeGroup[]
  targets: ExchangeTargetDraft[]
  onChange: (mealId: string, targets: ExchangeTargetDraft[]) => void
  variants: DayVariant[]
  variantId: string | null
  onVariantChange: (mealId: string, variantId: string | null) => void
  saveState: ExchangeSaveState
  /** Step del stepper (1 por defecto; prop preparada para 0.5 — pendiente Fran). */
  step?: number
}

/**
 * Editor de porciones por grupo de UNA comida (modo intercambios).
 * Steppers 44px, chips de color del grupo, totales derivados en vivo y badge
 * "macros referenciales" cuando algún grupo usado tiene `macros_confirmed=false`.
 */
export function ExchangeTargetsEditor({
  mealId,
  persistable,
  groups,
  targets,
  onChange,
  variants,
  variantId,
  onVariantChange,
  saveState,
  step = 1,
}: Props) {
  const { t } = useTranslation()
  const targetByGroup = useMemo(() => {
    const m = new Map<string, ExchangeTargetDraft>()
    for (const tg of targets) m.set(tg.exchangeGroupId, tg)
    return m
  }, [targets])

  const mealMacros = useMemo(() => macrosForTargets(targets, groups), [targets, groups])
  const summary = useMemo(() => portionsSummaryLabel(targets, groups), [targets, groups])
  const provisional = useMemo(() => hasUnconfirmedMacros(targets, groups), [targets, groups])

  const setPortions = (groupId: string, next: number) => {
    const clamped = Math.max(0, Math.min(99, Math.round(next * 10) / 10))
    const rest = targets.filter((tg) => tg.exchangeGroupId !== groupId)
    onChange(mealId, clamped > 0 ? [...rest, { exchangeGroupId: groupId, portions: clamped }] : rest)
  }

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
          {t('nutrition.exchange.portionsPerGroup')}
        </p>
        <div className="flex items-center gap-2">
          {provisional && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
              {t('nutrition.exchange.provisionalBadge')}
            </span>
          )}
          <span
            className={cn(
              'text-[9px] font-bold uppercase tracking-wide',
              saveState === 'error'
                ? 'text-red-600 dark:text-red-400'
                : saveState === 'saving'
                  ? 'text-muted-foreground'
                  : 'text-emerald-600 dark:text-emerald-400'
            )}
            aria-live="polite"
          >
            {saveState === 'saving'
              ? t('nutrition.exchange.saving')
              : saveState === 'saved'
                ? t('nutrition.exchange.saved')
                : saveState === 'error'
                  ? t('nutrition.exchange.saveError')
                  : ''}
          </span>
        </div>
      </div>

      {!persistable && (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-[11px] leading-snug text-amber-800 dark:text-amber-200">
          {t('nutrition.exchange.savePlanFirst')}
        </p>
      )}

      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {groups.map((group) => {
          const current = targetByGroup.get(group.id)?.portions ?? 0
          const color = exchangeGroupColor(group)
          return (
            <div
              key={group.id}
              className={cn(
                'flex items-center gap-2 rounded-xl border px-2 py-1.5 transition-colors',
                current > 0 ? 'border-border bg-card' : 'border-border/50 bg-transparent opacity-80'
              )}
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-black text-white"
                style={{ backgroundColor: color }}
                aria-hidden
              >
                {group.code}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-foreground">{group.name}</p>
                <p className="text-[10px] text-muted-foreground">
                  {Math.round(group.refCalories)} kcal/“1”
                  {!group.macrosConfirmed && <span aria-hidden> *</span>}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={!persistable || current <= 0}
                  onClick={() => setPortions(group.id, current - step)}
                  aria-label={`${t('nutrition.exchange.decrease')} ${group.name}`}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40 touch-manipulation"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="w-8 text-center text-sm font-black tabular-nums text-foreground">
                  {formatPortions(current)}
                </span>
                <button
                  type="button"
                  disabled={!persistable || current >= 99}
                  onClick={() => setPortions(group.id, current + step)}
                  aria-label={`${t('nutrition.exchange.increase')} ${group.name}`}
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40 touch-manipulation"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2">
        <p className="text-xs font-black text-foreground">
          {summary || t('nutrition.exchange.noPortions')}
        </p>
        <p className="text-[11px] font-bold text-muted-foreground tabular-nums">
          {Math.round(mealMacros.calories)} kcal · P {mealMacros.proteinG}g · C {mealMacros.carbsG}g · G{' '}
          {mealMacros.fatsG}g
        </p>
      </div>

      {variants.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
            {t('nutrition.exchange.dayVariant')}
          </span>
          <button
            type="button"
            disabled={!persistable}
            onClick={() => onVariantChange(mealId, null)}
            className={cn(
              'min-h-[2.25rem] rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors touch-manipulation',
              variantId == null
                ? 'bg-[color:var(--theme-primary)] text-white'
                : 'border border-border bg-background text-muted-foreground hover:bg-muted'
            )}
          >
            {t('nutrition.exchange.allVariants')}
          </button>
          {variants.map((v) => (
            <button
              key={v.id}
              type="button"
              disabled={!persistable}
              onClick={() => onVariantChange(mealId, v.id)}
              className={cn(
                'min-h-[2.25rem] rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors touch-manipulation',
                variantId === v.id
                  ? 'bg-[color:var(--theme-primary)] text-white'
                  : 'border border-border bg-background text-muted-foreground hover:bg-muted'
              )}
            >
              {v.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
