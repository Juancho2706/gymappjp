'use client'

import { useCallback, useMemo, useOptimistic, useState, useTransition } from 'react'
import { DayNavigator } from './DayNavigator'
import { MacroRingSummary } from './MacroRingSummary'
import { MealCard, type MealCardMeal } from './MealCard'
import { AdherenceStrip, type DayAdherence } from './AdherenceStrip'
import { NutritionStreakBanner } from './NutritionStreakBanner'
import { toggleMealCompletion, fetchLogForDate } from '../_actions/nutrition.actions'
import {
  calculateConsumedMacros,
  normalizeMealForMacros,
  type NutritionMealMacroSource,
} from '@/lib/nutrition-utils'
import { toast } from 'sonner'

type MealLogRow = { meal_id: string; is_completed: boolean }

type PlanMealRow = NutritionMealMacroSource & {
  name: string
  description?: string | null
  order_index: number
}

function toMealCardMeal(m: PlanMealRow): MealCardMeal {
  return {
    id: m.id,
    name: m.name,
    description: m.description,
    food_items: normalizeMealForMacros(m).food_items,
  }
}

interface Props {
  plan: {
    id: string
    nutrition_meals?: PlanMealRow[]
    daily_calories?: number | null
    protein_g?: number | null
    carbs_g?: number | null
    fats_g?: number | null
  }
  initialLog: Record<string, unknown> | null
  adherence: DayAdherence[]
  userId: string
  coachSlug: string
  today: string
}

export function NutritionShell({ plan, initialLog, adherence, userId, coachSlug, today }: Props) {
  const [selectedDate, setSelectedDate] = useState(today)
  const [currentLog, setCurrentLog] = useState<Record<string, unknown> | null>(initialLog)
  const [isDateLoading, startDateTransition] = useTransition()
  const [isTogglePending, startToggleTransition] = useTransition()

  const serverCompletions = useMemo(() => {
    const logs = (currentLog?.nutrition_meal_logs as MealLogRow[] | undefined) ?? []
    const o: Record<string, boolean> = {}
    for (const ml of logs) {
      o[ml.meal_id] = ml.is_completed
    }
    return o
  }, [currentLog])

  const [optimisticCompletions, setOptimisticCompletion] = useOptimistic(
    serverCompletions,
    (state: Record<string, boolean>, update: { mealId: string; isCompleted: boolean }) => ({
      ...state,
      [update.mealId]: update.isCompleted,
    })
  )

  const isToday = selectedDate === today
  const mealsSorted = useMemo(
    () => [...(plan.nutrition_meals ?? [])].sort((a, b) => a.order_index - b.order_index),
    [plan.nutrition_meals]
  )

  const mealsForMacros = useMemo(() => mealsSorted.map(normalizeMealForMacros), [mealsSorted])

  const completedIds = useMemo(() => {
    const ids = new Set<string>()
    for (const [mealId, v] of Object.entries(optimisticCompletions)) {
      if (v) ids.add(mealId)
    }
    return ids
  }, [optimisticCompletions])

  const consumed = useMemo(
    () => calculateConsumedMacros(mealsForMacros, completedIds),
    [mealsForMacros, completedIds]
  )

  const goals = {
    calories: plan.daily_calories ?? 0,
    protein: plan.protein_g ?? 0,
    carbs: plan.carbs_g ?? 0,
    fats: plan.fats_g ?? 0,
  }

  const adherenceDates = useMemo(() => {
    const s = new Set<string>()
    for (const d of adherence) {
      if (d.nutrition_meal_logs?.some((m) => m.is_completed)) {
        s.add(d.log_date)
      }
    }
    return s
  }, [adherence])

  const handleDateChange = useCallback(
    (date: string) => {
      setSelectedDate(date)
      startDateTransition(async () => {
        const { dailyLog } = await fetchLogForDate(userId, plan.id, date)
        setCurrentLog(dailyLog as Record<string, unknown> | null)
      })
    },
    [userId, plan.id]
  )

  const handleToggle = useCallback(
    (mealId: string, currentCompleted: boolean) => {
      const next = !currentCompleted
      startToggleTransition(async () => {
        setOptimisticCompletion({ mealId, isCompleted: next })
        try {
          await toggleMealCompletion(
            userId,
            plan.id,
            mealId,
            next,
            currentLog?.id as string | undefined,
            coachSlug,
            selectedDate
          )
          const { dailyLog } = await fetchLogForDate(userId, plan.id, selectedDate)
          setCurrentLog(dailyLog as Record<string, unknown> | null)
        } catch (e) {
          console.error(e)
          toast.error('Error al registrar comida')
          const { dailyLog } = await fetchLogForDate(userId, plan.id, selectedDate)
          setCurrentLog(dailyLog as Record<string, unknown> | null)
        }
      })
    },
    [userId, plan.id, currentLog?.id, coachSlug, selectedDate]
  )

  const totalMeals = mealsSorted.length
  const isPending = isTogglePending || isDateLoading

  return (
    <div className="space-y-5">
      <DayNavigator
        selectedDate={selectedDate}
        onDateChange={handleDateChange}
        adherenceDates={adherenceDates}
        isLoading={isDateLoading}
      />

      {adherence.length > 0 && totalMeals > 0 && (
        <NutritionStreakBanner adherenceData={adherence} totalMeals={totalMeals} />
      )}

      <MacroRingSummary
        calories={{ consumed: consumed.calories, target: goals.calories }}
        protein={{ consumed: consumed.protein, target: goals.protein }}
        carbs={{ consumed: consumed.carbs, target: goals.carbs }}
        fats={{ consumed: consumed.fats, target: goals.fats }}
        isReadOnly={!isToday}
      />

      <div className="space-y-3">
        {mealsSorted.map((meal) => (
          <MealCard
            key={meal.id}
            meal={toMealCardMeal(meal)}
            isCompleted={!!optimisticCompletions[meal.id]}
            isToday={isToday}
            isPending={isPending}
            onToggle={handleToggle}
          />
        ))}
      </div>

      {adherence.length > 0 && totalMeals > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4">
          <AdherenceStrip data={adherence} totalMeals={totalMeals} />
        </div>
      )}
    </div>
  )
}
