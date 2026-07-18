'use client'

import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Search, X } from 'lucide-react'
import type {
  NutritionExchangeFoodRead,
  NutritionMealSlotRead,
} from '@eva/nutrition-v2'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'
import { NutritionMotionButton } from '@/components/nutrition-v2'
import type { PortionMarksApi } from './PortionMarks'
import { PortionGroupCircle } from './PortionCoverageRow'
import { exchangeFoodsForGroup, orderedExchangeTargets } from './portion-marks.logic'

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

/**
 * Sheet de equivalencias V2 (SPEC UX-b): puerto del patrón `ExchangeEquivalencesSheet`
 * V1 al read-model V2 — TODO sale del snapshot congelado del target y de
 * `Today.exchangeFoods` (el sheet nunca consulta `exchange_groups` ni `foods` —
 * hallazgo F3). Tabs si la franja tiene varios grupos; badge referencial si
 * `macrosConfirmed=false`; CTAs "Marcar 1 porción" (mismo camino que el tap, con
 * confirmación de exceso inline) y "Registrar alimento" (flujo existente
 * preseleccionando la franja).
 */
export function PortionEquivalencesSheet({
  slot,
  initialGroupCode,
  exchangeFoods,
  api,
  onClose,
  onRegister,
}: {
  /** Franja abierta (null ⇒ sheet cerrado). */
  slot: NutritionMealSlotRead | null
  initialGroupCode: string | null
  exchangeFoods: NutritionExchangeFoodRead[] | undefined
  api: PortionMarksApi
  onClose: () => void
  /** Abre el flujo de registro existente preseleccionando la franja. */
  onRegister: (slotCode: string) => void
}) {
  const reduceMotion = useReducedMotion()
  const [activeCode, setActiveCode] = useState<string | null>(initialGroupCode)
  const [search, setSearch] = useState('')
  const [confirmExtra, setConfirmExtra] = useState(false)

  // Reset al abrir/cambiar de franja o grupo inicial (mismo patrón que el sheet V1).
  useEffect(() => {
    setActiveCode(initialGroupCode)
    setSearch('')
    setConfirmExtra(false)
  }, [slot?.id, initialGroupCode])

  const targets = useMemo(() => (slot ? orderedExchangeTargets(slot) : []), [slot])
  const target = targets.find((t) => t.groupCode === activeCode) ?? targets[0] ?? null

  const foods = useMemo(() => {
    if (!target) return []
    const list = exchangeFoodsForGroup(exchangeFoods, target.groupCode)
    const term = search.trim().toLowerCase()
    if (!term) return list
    return list.filter((food) => food.name.toLowerCase().includes(term))
  }, [target, exchangeFoods, search])

  const open = slot !== null && target !== null

  const handleMark = () => {
    if (!slot || !target) return
    const next = api.nextMarkFor(slot.code, target)
    if (next.extra && !confirmExtra) {
      setConfirmExtra(true)
      return
    }
    setConfirmExtra(false)
    api.mark({ slot, target, portions: next.extra ? 1 : next.portions })
  }

  return (
    <AnimatePresence>
      {open && slot && target ? (
        <>
          <motion.button
            animate={{ opacity: 1 }}
            aria-label={PORTIONS_COPY.student.close}
            className="fixed inset-0 z-50 bg-black/50"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onClick={onClose}
            transition={{ duration: reduceMotion ? 0 : 0.15 }}
            type="button"
          />
          <motion.div
            animate={{ y: 0 }}
            aria-label={PORTIONS_COPY.student.sheetTitle(target.groupName)}
            aria-modal="true"
            className="fixed inset-x-0 bottom-0 z-50 mx-auto flex w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border-t border-border-subtle bg-surface-card pb-safe shadow-xl md:bottom-4 md:rounded-3xl md:border"
            exit={{ y: reduceMotion ? 0 : '100%' }}
            initial={{ y: reduceMotion ? 0 : '100%' }}
            role="dialog"
            style={{ maxHeight: '85dvh' }}
            transition={{ type: 'tween', duration: reduceMotion ? 0 : 0.22, ease: 'easeOut' }}
          >
            <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 rounded-full bg-border-default" />

            {/* Header: circulito + título + "1 porción ≈ ref" + badge referencial. */}
            <div className="flex items-start gap-3 px-4 pb-2 pt-3">
              <PortionGroupCircle
                code={target.groupCode}
                color={target.color}
                size="md"
                sortOrder={target.orderIndex}
              />
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-display text-base font-semibold text-strong">
                  {PORTIONS_COPY.student.sheetTitle(target.groupName)}
                </h3>
                <p className="text-[11px] text-muted">
                  ≈ {Math.round(target.ref.calories)} kcal · P {target.ref.proteinG} g · C{' '}
                  {target.ref.carbsG} g · G {target.ref.fatsG} g
                </p>
                {!target.macrosConfirmed ? (
                  <span className="mt-1 inline-flex rounded-pill border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300">
                    {PORTIONS_COPY.builder.referentialBadge}
                  </span>
                ) : null}
              </div>
              <button
                aria-label={PORTIONS_COPY.student.close}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-sunken hover:text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={onClose}
                type="button"
              >
                <X aria-hidden="true" className="h-5 w-5" />
              </button>
            </div>

            {/* Tabs si la franja prescribe varios grupos. */}
            {targets.length > 1 ? (
              <div className="flex gap-1.5 overflow-x-auto px-4 pb-2">
                {targets.map((t) => {
                  const active = t.groupCode === target.groupCode
                  return (
                    <button
                      aria-pressed={active}
                      className={cx(
                        'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-pill border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                        active
                          ? 'border-primary bg-primary/100 text-white'
                          : 'border-border-subtle bg-surface-card text-strong hover:bg-surface-sunken',
                      )}
                      key={t.id}
                      onClick={() => {
                        setActiveCode(t.groupCode)
                        setConfirmExtra(false)
                      }}
                      type="button"
                    >
                      {t.groupCode} · {t.groupName}
                    </button>
                  )
                })}
              </div>
            ) : null}

            <p className="px-4 pb-1 text-xs font-medium text-muted">
              {PORTIONS_COPY.student.sheetSubtitle}
            </p>

            <div className="px-4 pb-2">
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                />
                <input
                  aria-label={PORTIONS_COPY.student.sheetSearchAria}
                  className="min-h-11 w-full rounded-control border border-border-default bg-surface-app pl-9 pr-3 text-sm text-strong outline-none placeholder:text-muted focus:ring-2 focus:ring-ring"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={PORTIONS_COPY.student.sheetSearchPlaceholder}
                  type="search"
                  value={search}
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
              {foods.length === 0 ? (
                <p className="py-8 text-center text-xs text-muted">
                  {search.trim().length > 0
                    ? PORTIONS_COPY.student.sheetNoResults
                    : PORTIONS_COPY.student.sheetEmpty}
                </p>
              ) : (
                <ul className="divide-y divide-border-subtle">
                  {foods.map((food) => (
                    <li className="flex min-h-11 items-center justify-between gap-3 py-2.5" key={food.foodId}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-strong">{food.name}</span>
                        {food.brand ? (
                          <span className="block truncate text-xs text-muted">{food.brand}</span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-right">
                        <span
                          className={cx(
                            'block text-xs font-bold',
                            food.portionLabel ? 'text-strong' : 'text-muted',
                          )}
                        >
                          {food.portionLabel ?? '—'}
                        </span>
                        <span className="block text-[10px] tabular-nums text-muted">
                          {food.portionGrams != null ? `${food.portionGrams} g` : ''}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* CTAs al pie: marcar (mismo camino del tap) y registrar (flujo existente). */}
            <div className="border-t border-border-subtle px-4 py-3">
              {confirmExtra ? (
                <p className="mb-2 text-xs font-medium text-amber-800 dark:text-amber-300">
                  {PORTIONS_COPY.student.extraConfirm(target.groupName)}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <NutritionMotionButton
                  className="min-h-11 flex-1"
                  onClick={handleMark}
                  tone={confirmExtra ? 'warning' : 'nutrition'}
                >
                  {PORTIONS_COPY.student.sheetMark}
                </NutritionMotionButton>
                <NutritionMotionButton
                  className="min-h-11 flex-1"
                  onClick={() => onRegister(slot.code)}
                  tone="neutral"
                >
                  {PORTIONS_COPY.student.sheetRegister}
                </NutritionMotionButton>
              </div>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  )
}
