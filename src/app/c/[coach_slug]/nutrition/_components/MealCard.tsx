'use client'

import { useState, useCallback } from 'react'
import { CheckCircle2, ChevronDown, ChevronUp, Lock } from 'lucide-react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { sumMealMacros, type FoodItemForMacros } from '@/lib/nutrition-utils'
import { MealIngredientRow } from './MealIngredientRow'

export interface MealCardMeal {
  id: string
  name: string
  description?: string | null
  food_items: FoodItemForMacros[]
}

interface Props {
  meal: MealCardMeal
  isCompleted: boolean
  isToday: boolean
  isPending: boolean
  onToggle: (mealId: string, current: boolean) => void
}

export function MealCard({ meal, isCompleted, isToday, isPending, onToggle }: Props) {
  const reduceMotion = useReducedMotion()
  const [isExpanded, setIsExpanded] = useState(false)
  const mealMacros = sumMealMacros(meal)
  const desc = meal.description?.trim()

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!isToday || isPending) return
      if ('vibrate' in navigator) navigator.vibrate(50)
      onToggle(meal.id, isCompleted)
    },
    [isToday, isPending, meal.id, isCompleted, onToggle]
  )

  return (
    <motion.div
      layout
      className={cn(
        'rounded-2xl border transition-colors duration-300 overflow-hidden',
        isCompleted ? 'bg-emerald-500/[0.04] border-emerald-500/25' : 'bg-card border-border'
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
            'w-11 h-11 -ml-1 flex items-center justify-center rounded-xl flex-shrink-0',
            'transition-all duration-200 touch-manipulation',
            !isToday && 'cursor-default opacity-50'
          )}
          disabled={!isToday || isPending}
          aria-label={isCompleted ? 'Marcar incompleta' : 'Marcar completa'}
        >
          <motion.div
            animate={
              isCompleted
                ? { scale: [1, 1.2, 1], backgroundColor: '#10b981' }
                : { scale: 1, backgroundColor: 'transparent' }
            }
            transition={
              reduceMotion
                ? { duration: 0 }
                : isCompleted
                  ? {
                      duration: 0.45,
                      ease: 'easeOut',
                      times: [0, 0.35, 1],
                    }
                  : { duration: 0.2, ease: 'easeOut' }
            }
            className={cn(
              'w-7 h-7 rounded-full border-2 flex items-center justify-center',
              isCompleted
                ? 'border-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.4)]'
                : 'border-muted-foreground/30'
            )}
          >
            <AnimatePresence mode="wait">
              {isCompleted && (
                <motion.div
                  key="check"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0, opacity: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.15 }}
                >
                  <CheckCircle2 className="w-4 h-4 text-white" />
                </motion.div>
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
                  ? 'text-emerald-600 dark:text-emerald-400 line-through'
                  : 'text-foreground'
              )}
            >
              {meal.name}
            </h4>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {!isToday && <Lock className="w-3 h-3 text-muted-foreground/40" aria-hidden />}
              <span className="text-xs font-black text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                {Math.round(mealMacros.calories)} kcal
              </span>
              {isExpanded ? (
                <ChevronUp className="w-4 h-4 text-muted-foreground/40" />
              ) : (
                <ChevronDown className="w-4 h-4 text-muted-foreground/40" />
              )}
            </div>
          </div>
          <div className="flex gap-2 mt-1">
            <span className="text-[10px] font-bold text-orange-500">P {Math.round(mealMacros.protein)}g</span>
            <span className="text-[10px] font-bold text-blue-500">C {Math.round(mealMacros.carbs)}g</span>
            <span className="text-[10px] font-bold text-yellow-500">G {Math.round(mealMacros.fats)}g</span>
          </div>
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
                  <MealIngredientRow key={(item as { id?: string }).id ?? `${meal.id}-fi-${i}`} item={item} />
                ))
              ) : (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Esta comida no tiene alimentos especificados
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
