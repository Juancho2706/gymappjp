'use client'

import { useEffect, useMemo, useState } from 'react'
import { X, Search } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import type { ExchangeFoodEquivalence, ExchangeGroup } from '@/domain/nutrition/exchange.types'
import { exchangeGroupColor } from '@/services/nutrition-exchanges/exchange-calc'

interface Props {
  group: ExchangeGroup | null
  equivalences: ExchangeFoodEquivalence[]
  onClose: () => void
}

/**
 * Bottom sheet mobile-first con las equivalencias de UN grupo de intercambio:
 * alimento + medida casera + gramos (búsqueda local). Targets ≥44px, pb-safe, dark mode.
 */
export function ExchangeEquivalencesSheet({ group, equivalences, onClose }: Props) {
  const { t } = useTranslation()
  const reduceMotion = useReducedMotion()
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (group) setSearch('')
  }, [group])

  const foods = useMemo(() => {
    if (!group) return []
    const list = equivalences.filter((f) => f.exchangeGroupId === group.id)
    const term = search.trim().toLowerCase()
    if (!term) return list
    return list.filter((f) => f.name.toLowerCase().includes(term))
  }, [group, equivalences, search])

  return (
    <AnimatePresence>
      {group && (
        <>
          <motion.button
            type="button"
            aria-label={t('nutrition.exchange.close')}
            className="fixed inset-0 z-50 bg-black/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.15 }}
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={group.name}
            className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-lg max-h-[80dvh] overflow-hidden rounded-t-3xl border-t border-border bg-background pb-safe md:bottom-4 md:rounded-3xl md:border"
            initial={{ y: reduceMotion ? 0 : '100%' }}
            animate={{ y: 0 }}
            exit={{ y: reduceMotion ? 0 : '100%' }}
            transition={{ type: 'tween', duration: reduceMotion ? 0 : 0.22, ease: 'easeOut' }}
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30" aria-hidden />
            <div className="flex items-center gap-3 px-4 pt-3 pb-2">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-black text-white"
                style={{ backgroundColor: exchangeGroupColor(group) }}
                aria-hidden
              >
                {group.code}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-black tracking-tight text-foreground">{group.name}</h3>
                <p className="text-[11px] text-muted-foreground">
                  {t('nutrition.exchange.onePortion')} ≈ {Math.round(group.refCalories)} kcal · P{' '}
                  {group.refProteinG}g · C {group.refCarbsG}g · G {group.refFatsG}g
                  {!group.macrosConfirmed && (
                    <span className="ml-1 font-bold text-amber-600 dark:text-amber-400">
                      ({t('nutrition.exchange.provisionalBadge')})
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={t('nutrition.exchange.close')}
                className="flex h-11 w-11 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted touch-manipulation"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="px-4 pb-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('nutrition.exchange.searchFood')}
                  className="h-11 w-full rounded-xl border border-input bg-muted/30 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
            </div>

            <div className="overflow-y-auto px-4 pb-6" style={{ maxHeight: 'calc(80dvh - 9rem)' }}>
              {foods.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted-foreground">
                  {t('nutrition.exchange.noEquivalences')}
                </p>
              ) : (
                <ul className="divide-y divide-border/60">
                  {foods.map((f) => (
                    <li key={f.foodId} className="flex min-h-11 items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                        {f.name}
                      </span>
                      <span className="shrink-0 text-right">
                        <span
                          className={cn(
                            'block text-xs font-bold',
                            f.portionLabel ? 'text-foreground' : 'text-muted-foreground'
                          )}
                        >
                          {f.portionLabel ?? '—'}
                        </span>
                        <span className="block text-[10px] text-muted-foreground tabular-nums">
                          {f.portionGrams != null ? `${f.portionGrams} g` : ''}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
