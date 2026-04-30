'use client'

import { useCallback, useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from 'react'
import { DayNavigator } from './DayNavigator'
import { MacroRingSummary } from './MacroRingSummary'
import { MealCard, type MealCardMeal } from './MealCard'
import { AdherenceStrip, type DayAdherence } from './AdherenceStrip'
import { NutritionStreakBanner } from './NutritionStreakBanner'
import { toggleMealCompletion, fetchLogForDate, updateMealConsumedPortion, updateMealSatisfaction, toggleClientFoodPreference, getClientFoodFavoritesForClient, applyMealFoodSwap } from '../_actions/nutrition.actions'
import {
  applyMealFoodSwaps,
  calculateConsumedMacrosWithCompletionFallback,
  normalizeMealForMacros,
  calculateFoodItemMacros,
  type NutritionMealMacroSource,
} from '@/lib/nutrition-utils'
import { nutritionMealAppliesOnIsoYmdInSantiago } from '@/lib/date-utils'
import { toast } from 'sonner'
import { Share2 } from 'lucide-react'
import { HabitsTracker } from './HabitsTracker'

type MealLogRow = { meal_id: string; is_completed: boolean; consumed_quantity: number | null; satisfaction_score?: number | null }
type MealSwapRow = {
  meal_id: string
  original_food_id: string
  swapped_food_id: string
  swapped_quantity?: number | null
  swapped_unit?: string | null
}

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
    coach_id?: string | null
    name?: string | null
    instructions?: string | null
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

const OFFLINE_QUEUE_KEY = 'eva_offline_toggle_queue'

interface OfflineToggleItem {
  userId: string
  planId: string
  mealId: string
  completed: boolean
  logId?: string
  coachSlug: string
  date: string
}

function readOfflineQueue(): OfflineToggleItem[] {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) ?? '[]') as OfflineToggleItem[]
  } catch {
    return []
  }
}

function writeOfflineQueue(q: OfflineToggleItem[]) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(q))
}

function enqueueOfflineToggle(item: OfflineToggleItem) {
  const q = readOfflineQueue()
  // Dedupe: if same mealId+date already queued, replace (last write wins)
  const idx = q.findIndex((x) => x.mealId === item.mealId && x.date === item.date)
  if (idx >= 0) q[idx] = item
  else q.push(item)
  writeOfflineQueue(q)
}

export function NutritionShell({ plan, initialLog, adherence, userId, coachSlug, today }: Props) {
  const [selectedDate, setSelectedDate] = useState(today)
  const [currentLog, setCurrentLog] = useState<Record<string, unknown> | null>(initialLog)
  const [isDateLoading, startDateTransition] = useTransition()
  const [isTogglePending, startToggleTransition] = useTransition()
  const [isPortionPending, startPortionTransition] = useTransition()
  const [isSatisfactionPending, startSatisfactionTransition] = useTransition()
  const [isSwapPending, startSwapTransition] = useTransition()
  const [favoriteFoodIds, setFavoriteFoodIds] = useState<Set<string>>(new Set())
  const planIdRef = useRef(plan.id)
  const selectedDateRef = useRef(selectedDate)
  selectedDateRef.current = selectedDate

  // Flush offline toggle queue when back online
  useEffect(() => {
    async function flushQueue() {
      const q = readOfflineQueue()
      if (q.length === 0) return
      let flushed = 0
      const remaining: OfflineToggleItem[] = []
      for (const item of q) {
        try {
          await toggleMealCompletion(item.userId, item.planId, item.mealId, item.completed, item.logId, item.coachSlug, item.date)
          flushed++
        } catch {
          remaining.push(item)
        }
      }
      writeOfflineQueue(remaining)
      if (flushed > 0) {
        toast.success(`${flushed} acción${flushed !== 1 ? 'es' : ''} sincronizada${flushed !== 1 ? 's' : ''}`)
        // Refresh log if the flushed date matches current view
        const hasToday = q.some((x) => x.date === selectedDateRef.current && x.planId === planIdRef.current)
        if (hasToday) {
          const { dailyLog } = await fetchLogForDate(userId, planIdRef.current, selectedDateRef.current)
          setCurrentLog(dailyLog as Record<string, unknown> | null)
        }
      }
    }
    flushQueue()
    window.addEventListener('online', flushQueue)
    return () => window.removeEventListener('online', flushQueue)
  }, [userId])

  useEffect(() => {
    getClientFoodFavoritesForClient(userId).then((ids) => setFavoriteFoodIds(new Set(ids)))
  }, [userId])

  const mealLogs = useMemo(
    () => (currentLog?.nutrition_meal_logs as MealLogRow[] | undefined) ?? [],
    [currentLog]
  )
  const mealSwapLogs = useMemo(
    () => (currentLog?.nutrition_meal_food_swaps as MealSwapRow[] | undefined) ?? [],
    [currentLog]
  )

  const serverPartialPct = useMemo(() => {
    const o: Record<string, number> = {}
    for (const ml of mealLogs) {
      if (ml.is_completed && ml.consumed_quantity != null && !Number.isNaN(Number(ml.consumed_quantity))) {
        o[ml.meal_id] = Number(ml.consumed_quantity)
      }
    }
    return o
  }, [mealLogs])

  const [optimisticPartialPct, applyOptimisticPartial] = useOptimistic(
    serverPartialPct,
    (state, u: { mealId: string; pct: number | null }) => {
      const n = { ...state }
      if (u.pct == null) delete n[u.mealId]
      else n[u.mealId] = u.pct
      return n
    }
  )

  const portionMapForMacros = useMemo(
    () => new Map<string, number>(Object.entries(optimisticPartialPct) as [string, number][]),
    [optimisticPartialPct]
  )

  const serverCompletions = useMemo(() => {
    const o: Record<string, boolean> = {}
    for (const ml of mealLogs) {
      o[ml.meal_id] = ml.is_completed
    }
    return o
  }, [mealLogs])

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

  const mealsVisible = useMemo(
    () => mealsSorted.filter((m) => nutritionMealAppliesOnIsoYmdInSantiago(m, selectedDate)),
    [mealsSorted, selectedDate]
  )

  const planMealsForAdherence = useMemo(
    () => (plan.nutrition_meals ?? []).map((m) => ({ id: m.id, day_of_week: m.day_of_week ?? null })),
    [plan.nutrition_meals]
  )

  const mealsVisibleWithSwaps = useMemo(() => {
    if (mealSwapLogs.length === 0) return mealsVisible
    const swapByMealFood = new Map<string, MealSwapRow>()
    for (const s of mealSwapLogs) {
      swapByMealFood.set(`${s.meal_id}:${s.original_food_id}`, s)
    }

    return mealsVisible.map((meal) => {
      const normalized = normalizeMealForMacros(meal)
      const swapFoodsByOriginal = new Map<
        string,
        {
          swappedFood: {
            id?: string
            name: string
            calories: number
            protein_g: number
            carbs_g: number
            fats_g: number
            serving_size: number
            serving_unit: string | null
          }
          swappedQuantity?: number | null
          swappedUnit?: string | null
        }
      >()
      for (const item of normalized.food_items) {
        const originalFoodId = item.foods.id
        if (!originalFoodId) continue
        const swapLog = swapByMealFood.get(`${meal.id}:${originalFoodId}`)
        if (!swapLog) continue
        const option = (item.swap_options ?? []).find((x) => x.food_id === swapLog.swapped_food_id)
        if (!option) continue
        swapFoodsByOriginal.set(originalFoodId, {
          swappedFood: {
            id: option.food_id,
            name: option.name,
            calories: option.calories,
            protein_g: option.protein_g,
            carbs_g: option.carbs_g,
            fats_g: option.fats_g,
            serving_size: option.serving_size,
            serving_unit: option.serving_unit ?? null,
          },
          swappedQuantity: swapLog.swapped_quantity ?? null,
          swappedUnit: swapLog.swapped_unit ?? null,
        })
      }
      const swapped = applyMealFoodSwaps(normalized, swapFoodsByOriginal)
      return {
        ...meal,
        food_items: swapped.food_items,
      }
    })
  }, [mealsVisible, mealSwapLogs])

  const mealsForMacros = useMemo(
    () => mealsVisibleWithSwaps.map(normalizeMealForMacros),
    [mealsVisibleWithSwaps]
  )

  const completedIds = useMemo(() => {
    const ids = new Set<string>()
    for (const m of mealsVisible) {
      if (optimisticCompletions[m.id]) ids.add(m.id)
    }
    return ids
  }, [mealsVisible, optimisticCompletions])

  const goals = useMemo(
    () => ({
      calories: plan.daily_calories ?? 0,
      protein: plan.protein_g ?? 0,
      carbs: plan.carbs_g ?? 0,
      fats: plan.fats_g ?? 0,
    }),
    [plan.daily_calories, plan.protein_g, plan.carbs_g, plan.fats_g]
  )

  const consumed = useMemo(() => {
    return calculateConsumedMacrosWithCompletionFallback(
      mealsForMacros,
      completedIds,
      goals,
      portionMapForMacros
    )
  }, [mealsForMacros, completedIds, goals, portionMapForMacros])

  const adherenceDates = useMemo(() => {
    const s = new Set<string>()
    const allMeals = plan.nutrition_meals ?? []
    for (const d of adherence) {
      const applicableIds = new Set(
        allMeals.filter((m) => nutritionMealAppliesOnIsoYmdInSantiago(m, d.log_date)).map((m) => m.id)
      )
      if (d.nutrition_meal_logs?.some((m) => m.is_completed && applicableIds.has(m.meal_id))) {
        s.add(d.log_date)
      }
    }
    return s
  }, [adherence, plan.nutrition_meals])

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
          if (!navigator.onLine) {
            enqueueOfflineToggle({
              userId,
              planId: plan.id,
              mealId,
              completed: next,
              logId: currentLog?.id as string | undefined,
              coachSlug,
              date: selectedDate,
            })
            toast('Sin conexión — se sincronizará automáticamente', { icon: '📶' })
          } else {
            toast.error('Error al registrar comida')
            const { dailyLog } = await fetchLogForDate(userId, plan.id, selectedDate)
            setCurrentLog(dailyLog as Record<string, unknown> | null)
          }
        }
      })
    },
    [setOptimisticCompletion, userId, plan.id, currentLog, coachSlug, selectedDate]
  )

  const handlePartialPctChange = useCallback(
    (mealId: string, pct: number | null) => {
      const dailyLogId = currentLog?.id as string | undefined
      if (!dailyLogId || !isToday) return
      startPortionTransition(async () => {
        applyOptimisticPartial({ mealId, pct })
        try {
          const { success } = await updateMealConsumedPortion({
            clientId: userId,
            planId: plan.id,
            mealId,
            dailyLogId,
            coachSlug,
            targetDate: selectedDate,
            consumedPct: pct,
          })
          if (!success) throw new Error('portion')
          const { dailyLog } = await fetchLogForDate(userId, plan.id, selectedDate)
          setCurrentLog(dailyLog as Record<string, unknown> | null)
        } catch (e) {
          console.error(e)
          toast.error('No se pudo guardar la porción')
          const { dailyLog } = await fetchLogForDate(userId, plan.id, selectedDate)
          setCurrentLog(dailyLog as Record<string, unknown> | null)
        }
      })
    },
    [
      currentLog,
      isToday,
      applyOptimisticPartial,
      userId,
      plan.id,
      coachSlug,
      selectedDate,
    ]
  )

  const satisfactionMap = useMemo(() => {
    const o: Record<string, 1 | 2 | 3> = {}
    for (const ml of mealLogs) {
      if (ml.satisfaction_score != null && [1, 2, 3].includes(ml.satisfaction_score)) {
        o[ml.meal_id] = ml.satisfaction_score as 1 | 2 | 3
      }
    }
    return o
  }, [mealLogs])

  const handleSatisfactionChange = useCallback(
    (mealId: string, score: 1 | 2 | 3 | null) => {
      const dailyLogId = currentLog?.id as string | undefined
      if (!dailyLogId || !isToday) return
      startSatisfactionTransition(async () => {
        await updateMealSatisfaction({ clientId: userId, dailyLogId, mealId, score })
        const { dailyLog } = await fetchLogForDate(userId, plan.id, selectedDate)
        setCurrentLog(dailyLog as Record<string, unknown> | null)
      })
    },
    [currentLog, isToday, userId, plan.id, selectedDate]
  )

  const handleToggleFoodFavorite = useCallback(
    (foodId: string) => {
      setFavoriteFoodIds((prev) => {
        const next = new Set(prev)
        if (next.has(foodId)) next.delete(foodId)
        else next.add(foodId)
        return next
      })
      toggleClientFoodPreference({
        clientId: userId,
        foodId,
        preferenceType: 'favorite',
        clientProfileRevalidateId: userId,
      }).then((res) => {
        if (!res.success) {
          setFavoriteFoodIds((prev) => {
            const next = new Set(prev)
            if (next.has(foodId)) next.delete(foodId)
            else next.add(foodId)
            return next
          })
          toast.error('No se pudo guardar el favorito')
        }
      })
    },
    [userId]
  )

  const totalMeals = mealsVisible.length
  const isPending = isTogglePending || isDateLoading || isPortionPending || isSatisfactionPending || isSwapPending
  const activeSwapByMealFoodKey = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of mealSwapLogs) {
      m.set(`${s.meal_id}:${s.original_food_id}`, s.swapped_food_id)
      m.set(`${s.meal_id}:${s.swapped_food_id}`, s.swapped_food_id)
    }
    return m
  }, [mealSwapLogs])

  const handleApplySwap = useCallback(
    (mealId: string, originalFoodId: string, swappedFoodId: string) => {
      if (!isToday) return
      startSwapTransition(async () => {
        const dailyLogId = currentLog?.id as string | undefined
        const { success, error } = await applyMealFoodSwap({
          clientId: userId,
          planId: plan.id,
          ...(dailyLogId ? { dailyLogId } : {}),
          mealId,
          originalFoodId,
          swappedFoodId,
          coachSlug,
          targetDate: selectedDate,
        })
        if (!success) {
          toast.error(error ?? 'No se pudo aplicar el intercambio')
          return
        }
        toast.success('Intercambio aplicado')
        const { dailyLog } = await fetchLogForDate(userId, plan.id, selectedDate)
        setCurrentLog(dailyLog as Record<string, unknown> | null)
      })
    },
    [isToday, currentLog, userId, plan.id, coachSlug, selectedDate]
  )

  const copyToClipboard = useCallback((text: string, okMsg: string) => {
    if (navigator.clipboard) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          toast.success(okMsg)
        })
        .catch(() => {
          toast.error('No se pudo copiar automáticamente')
        })
    } else {
      toast.error('Tu navegador no soporta copiar al portapapeles')
    }
  }, [])

  const handleCopyDayDetail = useCallback(() => {
    const lines: string[] = []
    lines.push(`*Plan Nutricional: ${plan.name ?? 'Mi Plan'}*`)
    lines.push(`_Fecha: ${selectedDate}_`)
    lines.push('')
    if (typeof plan.instructions === 'string' && plan.instructions.trim().length > 0) {
      lines.push('*Indicaciones del coach:*')
      lines.push(plan.instructions.trim())
      lines.push('')
    }

    for (const meal of mealsVisibleWithSwaps) {
      lines.push(`*${meal.name.toUpperCase()}*`)
      const items = meal.food_items ?? []
      let mealCalories = 0
      let mealProtein = 0
      let mealCarbs = 0
      let mealFats = 0
      for (const fi of items) {
        const name = fi.foods?.name ?? '—'
        const qty = fi.quantity ?? 0
        const unit = fi.unit ?? 'g'
        const macros = fi.foods
          ? calculateFoodItemMacros({
              quantity: qty,
              unit,
              foods: fi.foods as Parameters<typeof calculateFoodItemMacros>[0]['foods'],
            })
          : null
        const kcalStr = macros ? ` · ${Math.round(macros.calories)} kcal` : ''
        if (macros) {
          mealCalories += macros.calories
          mealProtein += macros.protein
          mealCarbs += macros.carbs
          mealFats += macros.fats
        }
        lines.push(`• ${name} — ${qty}${unit}${kcalStr}`)
      }
      lines.push(
        `Subtotal: ${Math.round(mealCalories)} kcal | P ${Math.round(mealProtein)}g · C ${Math.round(mealCarbs)}g · G ${Math.round(mealFats)}g`
      )
      lines.push('')
    }

    lines.push(`📊 Meta: ${goals.calories} kcal | P ${goals.protein}g · C ${goals.carbs}g · G ${goals.fats}g`)

    copyToClipboard(lines.join('\n'), 'Detalle del día copiado — listo para WhatsApp 📋')
  }, [mealsVisibleWithSwaps, plan.name, plan.instructions, goals, selectedDate, copyToClipboard])

  const handleCopyDayShort = useCallback(() => {
    const lines: string[] = []
    lines.push(`*${plan.name ?? 'Mi plan'} · ${selectedDate}*`)
    lines.push('')
    for (const meal of mealsVisibleWithSwaps) {
      const items = meal.food_items ?? []
      let kcal = 0
      let p = 0
      let c = 0
      let f = 0
      for (const fi of items) {
        const macros = fi.foods
          ? calculateFoodItemMacros({
              quantity: fi.quantity ?? 0,
              unit: fi.unit ?? 'g',
              foods: fi.foods as Parameters<typeof calculateFoodItemMacros>[0]['foods'],
            })
          : null
        if (macros) {
          kcal += macros.calories
          p += macros.protein
          c += macros.carbs
          f += macros.fats
        }
      }
      lines.push(
        `• ${meal.name} — ${Math.round(kcal)} kcal (P ${Math.round(p)} · C ${Math.round(c)} · G ${Math.round(f)})`
      )
    }
    lines.push('')
    lines.push(`Meta diaria: ${goals.calories} kcal | P ${goals.protein}g · C ${goals.carbs}g · G ${goals.fats}g`)
    copyToClipboard(lines.join('\n'), 'Resumen corto copiado 📋')
  }, [mealsVisibleWithSwaps, plan.name, goals, selectedDate, copyToClipboard])

  return (
    <div className="space-y-5">
      <DayNavigator
        selectedDate={selectedDate}
        onDateChange={handleDateChange}
        adherenceDates={adherenceDates}
        isLoading={isDateLoading}
      />

      {mealsSorted.length > mealsVisible.length && mealsVisible.length > 0 && (
        <p className="rounded-xl border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-[11px] leading-snug text-sky-100/90">
          Hoy ves {mealsVisible.length} de {mealsSorted.length} comidas del plan. Las demás están fijadas a otro día
          de la semana en el plan del coach; prueba otra fecha en el calendario o consulta con tu coach.
        </p>
      )}

      {adherence.length > 0 && totalMeals > 0 && (
        <NutritionStreakBanner adherenceData={adherence} planMeals={planMealsForAdherence} />
      )}

      <MacroRingSummary
        calories={{ consumed: consumed.calories, target: goals.calories }}
        protein={{ consumed: consumed.protein, target: goals.protein }}
        carbs={{ consumed: consumed.carbs, target: goals.carbs }}
        fats={{ consumed: consumed.fats, target: goals.fats }}
        isReadOnly={!isToday}
      />

      <div className="space-y-3">
        {mealsVisible.length === 0 ? (
          <p className="rounded-2xl border border-border/60 bg-muted/15 px-4 py-3 text-center text-xs text-muted-foreground">
            No hay comidas planificadas para este día.
          </p>
        ) : (
          mealsVisibleWithSwaps.map((meal) => (
            <MealCard
              key={meal.id}
              meal={toMealCardMeal(meal)}
              isCompleted={!!optimisticCompletions[meal.id]}
              partialPlanPct={meal.id in optimisticPartialPct ? optimisticPartialPct[meal.id]! : null}
              isToday={isToday}
              isPending={isPending}
              onToggle={handleToggle}
              onPartialPlanPctChange={handlePartialPctChange}
              satisfactionScore={satisfactionMap[meal.id] ?? null}
              onSatisfactionChange={isToday ? handleSatisfactionChange : undefined}
              favoriteFoodIds={favoriteFoodIds}
              onToggleFoodFavorite={handleToggleFoodFavorite}
              onApplyFoodSwap={isToday ? handleApplySwap : undefined}
              activeSwaps={activeSwapByMealFoodKey}
            />
          ))
        )}
      </div>

      <HabitsTracker
        clientId={userId}
        coachSlug={coachSlug}
        logDate={selectedDate}
        isToday={isToday}
      />

      {totalMeals > 0 && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleCopyDayDetail}
            className="flex items-center justify-center gap-1.5 rounded-2xl border border-border/60 bg-muted/20 py-3 px-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground transition-colors hover:bg-muted/40 active:scale-[0.98]"
          >
            <Share2 className="h-3.5 w-3.5 shrink-0" />
            WhatsApp · Detalle
          </button>
          <button
            type="button"
            onClick={handleCopyDayShort}
            className="flex items-center justify-center gap-1.5 rounded-2xl border border-border/60 bg-muted/10 py-3 px-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground transition-colors hover:bg-muted/30 active:scale-[0.98]"
          >
            <Share2 className="h-3.5 w-3.5 shrink-0" />
            WhatsApp · Resumen
          </button>
        </div>
      )}

      {adherence.length > 0 && (plan.nutrition_meals?.length ?? 0) > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4">
          <AdherenceStrip data={adherence} planMeals={planMealsForAdherence} />
        </div>
      )}
    </div>
  )
}
