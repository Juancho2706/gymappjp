'use client'

import { useState, useCallback } from 'react'
import { Check, Utensils, ChevronDown, ChevronUp, Lock } from 'lucide-react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { springs } from '@/lib/animation-presets'
import { cn } from '@/lib/utils'
import { sumMealMacros, type FoodItemForMacros } from '@/lib/nutrition-utils'
import { MealIngredientRow } from './MealIngredientRow'
import { InfoTooltip } from '@/components/ui/info-tooltip'

export interface MealCardMeal {
  id: string
  name: string
  description?: string | null
  food_items: FoodItemForMacros[]
}

interface Props {
  meal: MealCardMeal
  isCompleted: boolean
  /** null = modo binario (100% del plan); 0–100 = % explícito de macros del plan */
  partialPlanPct: number | null
  isToday: boolean
  isPending: boolean
  onToggle: (mealId: string, current: boolean) => void
  onPartialPlanPctChange?: (mealId: string, pct: number | null) => void
  satisfactionScore?: 1 | 2 | 3 | null
  onSatisfactionChange?: (mealId: string, score: 1 | 2 | 3 | null) => void
  favoriteFoodIds?: Set<string>
  onToggleFoodFavorite?: (foodId: string) => void
  onApplyFoodSwap?: (mealId: string, originalFoodId: string, swappedFoodId: string) => void
  activeSwaps?: Map<string, string>
  /** Módulo nutrition_exchanges: macros derivados de porciones (la comida no tiene alimentos). */
  macroOverride?: { calories: number; protein: number; carbs: number; fats: number } | null
  /** Módulo nutrition_exchanges: chips de códigos ("2C · 1LAC") renderizados bajo los macros. */
  exchangeContent?: React.ReactNode
}

const SATISFACTION = [
  { score: 1 as const, emoji: '😕', label: 'No me gustó' },
  { score: 2 as const, emoji: '😐', label: 'Regular' },
  { score: 3 as const, emoji: '😋', label: 'Muy rico' },
]

export function MealCard({
  meal,
  isCompleted,
  partialPlanPct,
  isToday,
  isPending,
  onToggle,
  onPartialPlanPctChange,
  satisfactionScore,
  onSatisfactionChange,
  favoriteFoodIds,
  onToggleFoodFavorite,
  onApplyFoodSwap,
  activeSwaps,
  macroOverride,
  exchangeContent,
}: Props) {
  const reduceMotion = useReducedMotion()
  const [isExpanded, setIsExpanded] = useState(false)
  const mealMacros = macroOverride ?? sumMealMacros(meal)
  const macroScale = partialPlanPct != null ? partialPlanPct / 100 : 1
  const desc = meal.description?.trim()

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      // Sin gate por isPending: el completado es local instantáneo + persistencia serializada en el
      // shell (spam-safe). Bloquearlo aquí volvía a "perder" toques rápidos. Solo se veta día no-hoy.
      if (!isToday) return
      if ('vibrate' in navigator) navigator.vibrate(50)
      onToggle(meal.id, isCompleted)
    },
    [isToday, meal.id, isCompleted, onToggle]
  )

  return (
    <motion.div
      layout
      className={cn(
        'rounded-card border transition-colors duration-300 overflow-hidden',
        isCompleted ? 'bg-ember-500/[0.04] border-ember-500/25' : 'bg-card border-border'
      )}
    >
      <div
        className="flex items-center gap-3 p-4 cursor-pointer select-none"
        onClick={() => setIsExpanded((v) => !v)}
      >
        <button
          type="button"
          onClick={handleToggle}
          className={cn(
            'w-11 h-11 -ml-1 flex items-center justify-center rounded-full flex-shrink-0',
            'transition-all duration-200 touch-manipulation',
            !isToday && 'cursor-default opacity-50'
          )}
          disabled={!isToday}
          aria-label={isCompleted ? 'Marcar incompleta' : 'Marcar completa'}
        >
          <motion.div
            animate={{ scale: 1 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : isCompleted
                  ? springs.elastic
                  : { duration: 0.2, ease: 'easeOut' }
            }
            className={cn(
              'w-11 h-11 rounded-full flex items-center justify-center transition-colors duration-200',
              isCompleted
                ? 'bg-ember-500 text-white shadow-[var(--glow-ember)]'
                : 'bg-surface-sunken text-muted-foreground'
            )}
          >
            <AnimatePresence mode="wait" initial={false}>
              {isCompleted ? (
                <motion.span
                  key="check"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={reduceMotion ? { duration: 0 } : springs.elastic}
                  className="flex"
                >
                  <Check className="w-5 h-5" strokeWidth={2.5} />
                </motion.span>
              ) : (
                <motion.span
                  key="utensils"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={reduceMotion ? { duration: 0 } : { duration: 0.15 }}
                  className="flex"
                >
                  <Utensils className="w-5 h-5" aria-hidden />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.div>
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4
              className={cn(
                'font-black text-base tracking-tight truncate',
                isCompleted
                  ? 'text-ember-700 line-through'
                  : 'text-foreground'
              )}
            >
              {meal.name}
            </h4>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {!isToday && <Lock className="w-3 h-3 text-muted-foreground/40" aria-hidden />}
              <span className="text-xs font-black text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {Math.round(mealMacros.calories * macroScale)} kcal
                {isCompleted && partialPlanPct != null && partialPlanPct < 100 ? (
                  <span className="ml-1 text-[10px] font-bold text-ember-700">
                    ({partialPlanPct}%)
                  </span>
                ) : null}
              </span>
              {isExpanded ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground/40" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground/40" />
              )}
            </div>
          </div>
          <div className="flex gap-2 mt-1">
            <span className="text-[10px] font-bold text-[color:var(--color-macro-protein)]">
              P {Math.round(mealMacros.protein * macroScale)}g
            </span>
            <span className="text-[10px] font-bold text-[color:var(--color-macro-carbs)]">
              C {Math.round(mealMacros.carbs * macroScale)}g
            </span>
            <span className="text-[10px] font-bold text-[color:var(--color-macro-fats)]">
              G {Math.round(mealMacros.fats * macroScale)}g
            </span>
          </div>
          {exchangeContent}
          {desc && !isExpanded && (
            <p className="text-[11px] text-muted-foreground/60 mt-0.5 truncate">{desc}</p>
          )}
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-2">
              <div className="h-px bg-gradient-to-r from-transparent via-border to-transparent mb-3" />
              {desc && <p className="text-xs text-muted-foreground mb-3 italic">{desc}</p>}
              {meal.food_items.length > 0 ? (
                meal.food_items.map((item, i) => (
                  <MealIngredientRow
                  key={(item as { id?: string }).id ?? `${meal.id}-fi-${i}`}
                  item={item}
                  isFavorite={item.foods.id ? favoriteFoodIds?.has(item.foods.id) : false}
                  onToggleFavorite={onToggleFoodFavorite}
                  mealId={meal.id}
                  onApplySwap={onApplyFoodSwap}
                  activeSwapFoodId={item.foods.id ? activeSwaps?.get(`${meal.id}:${item.foods.id}`) : undefined}
                />
                ))
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Esta comida no tiene alimentos especificados
                </p>
              )}
              {isToday && isCompleted && onPartialPlanPctChange ? (
                <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 space-y-2">
                  <div className="flex items-center gap-1">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      Porción del plan
                    </p>
                    <InfoTooltip content="Si consumiste una cantidad diferente a la planificada, ajústala aquí. Los macros se recalcularán automáticamente." iconClassName="w-3 h-3" />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {([25, 50, 75] as const).map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        disabled={isPending}
                        onClick={(e) => {
                          e.stopPropagation()
                          onPartialPlanPctChange(meal.id, pct)
                        }}
                        className={cn(
                          'min-w-[2.75rem] rounded-lg px-2 py-1.5 text-[11px] font-bold transition-colors touch-manipulation',
                          partialPlanPct === pct
                            ? 'bg-ember-500 text-white'
                            : 'bg-background border border-border/80 text-foreground hover:bg-muted/60'
                        )}
                      >
                        {pct}%
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={(e) => {
                        e.stopPropagation()
                        onPartialPlanPctChange(meal.id, 100)
                      }}
                      className={cn(
                        'min-w-[2.75rem] rounded-lg px-2 py-1.5 text-[11px] font-bold transition-colors touch-manipulation',
                        partialPlanPct === 100
                          ? 'bg-ember-500 text-white'
                          : 'bg-background border border-border/80 text-foreground hover:bg-muted/60'
                      )}
                    >
                      100%
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={(e) => {
                        e.stopPropagation()
                        onPartialPlanPctChange(meal.id, null)
                      }}
                      className={cn(
                        'rounded-lg px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide transition-colors touch-manipulation',
                        partialPlanPct == null
                          ? 'bg-ember-500/20 text-ember-700 ring-1 ring-ember-500/40'
                          : 'bg-background border border-border/80 text-muted-foreground hover:bg-muted/60'
                      )}
                    >
                      Plan completo
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    «Plan completo» usa el 100% de macros del plan (igual que antes). Ajusta % si comiste menos.
                  </p>
                </div>
              ) : null}
              {isCompleted && onSatisfactionChange && (
                <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5 space-y-2">
                  <div className="flex items-center gap-1">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                      ¿Cómo estuvo?
                    </p>
                    <InfoTooltip content="Tu coach puede ver este feedback para ajustar tu plan. Es opcional." iconClassName="w-3 h-3" />
                  </div>
                  <div className="flex gap-2">
                    {SATISFACTION.map(({ score, emoji, label }) => (
                      <button
                        key={score}
                        type="button"
                        disabled={isPending}
                        onClick={(e) => {
                          e.stopPropagation()
                          onSatisfactionChange(meal.id, satisfactionScore === score ? null : score)
                        }}
                        aria-label={label}
                        className={cn(
                          'flex-1 rounded-xl py-2 text-xl transition-all touch-manipulation',
                          satisfactionScore === score
                            ? 'bg-ember-500/15 ring-1 ring-ember-500/40 scale-110'
                            : 'bg-background border border-border/80 hover:bg-muted/60 opacity-70 hover:opacity-100'
                        )}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
