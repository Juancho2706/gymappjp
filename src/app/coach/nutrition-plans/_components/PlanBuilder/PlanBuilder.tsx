'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { PlanBuilderSidebar } from './PlanBuilderSidebar'
import { MealCanvas } from './MealCanvas'

const FoodSearchDrawer = dynamic(
    () => import('./FoodSearchDrawer').then((m) => ({ default: m.FoodSearchDrawer })),
    { loading: () => <Skeleton className="fixed inset-x-0 bottom-0 z-50 h-48 border-t border-border bg-card md:left-auto md:right-4 md:bottom-4 md:h-[min(32rem,80vh)] md:w-full md:max-w-lg md:rounded-xl md:border" /> }
)
import { totalsFromMealDrafts } from './MacroCalculator'
import { coerceSwapOptionUnit } from '@/lib/nutrition-utils'
import {
  upsertCoachNutritionTemplate,
  upsertClientNutritionPlanJson,
  getClientFoodFavorites,
} from '../../_actions/nutrition-coach.actions'
import type { FoodItemDraft, MealDraft, PlanBuilderInitialData } from './types'

function newMealId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `meal-${crypto.randomUUID()}`
  return `meal-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

interface Props {
  mode: 'template' | 'client-plan'
  coachId: string
  clientId?: string
  initialData?: PlanBuilderInitialData | null
}

export function PlanBuilder({ mode, coachId, clientId, initialData }: Props) {
  const router = useRouter()
  const [planName, setPlanName] = useState(initialData?.name ?? '')
  const [goals, setGoals] = useState({
    calories: initialData?.daily_calories ?? 0,
    protein: initialData?.protein_g ?? 0,
    carbs: initialData?.carbs_g ?? 0,
    fats: initialData?.fats_g ?? 0,
  })
  const [instructions, setInstructions] = useState(initialData?.instructions ?? '')
  const [meals, setMeals] = useState<MealDraft[]>(initialData?.meals ?? [])
  const [searchDrawer, setSearchDrawer] = useState<{
    open: boolean
    targetMealId: string | null
    mode: 'add-food' | 'add-swap'
    targetFoodIndex: number | null
  }>({
    open: false,
    targetMealId: null,
    mode: 'add-food',
    targetFoodIndex: null,
  })
  const [isSaving, setIsSaving] = useState(false)
  const [autoSync, setAutoSync] = useState(true)
  const [clientFavoriteIds, setClientFavoriteIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!clientId) return
    getClientFoodFavorites(clientId).then((ids) => setClientFavoriteIds(new Set(ids)))
  }, [clientId])

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } })
  )

  const realTotals = useMemo(() => totalsFromMealDrafts(meals), [meals])
  const emptyMeals = useMemo(() => meals.filter((m) => m.foodItems.length === 0), [meals])

  // Auto-sync goals whenever meals change and toggle is ON
  useEffect(() => {
    if (!autoSync) return
    setGoals({
      calories: Math.round(realTotals.calories),
      protein: Math.round(realTotals.protein),
      carbs: Math.round(realTotals.carbs),
      fats: Math.round(realTotals.fats),
    })
  }, [autoSync, realTotals])

  const handleAutoSync = useCallback(() => {
    setGoals({
      calories: Math.round(realTotals.calories),
      protein: Math.round(realTotals.protein),
      carbs: Math.round(realTotals.carbs),
      fats: Math.round(realTotals.fats),
    })
  }, [realTotals])

  const handleDragEnd = useCallback(({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    setMeals((prev) => {
      const from = prev.findIndex((m) => m.id === active.id)
      const to = prev.findIndex((m) => m.id === over.id)
      if (from < 0 || to < 0) return prev
      return arrayMove(prev, from, to)
    })
  }, [])

  const addMeal = useCallback(() => {
    setMeals((prev) => [
      ...prev,
      { id: newMealId(), name: `Comida ${prev.length + 1}`, day_of_week: null, foodItems: [] },
    ])
  }, [])

  const updateMealName = useCallback((mealId: string, name: string) => {
    setMeals((prev) => prev.map((m) => (m.id === mealId ? { ...m, name } : m)))
  }, [])

  const updateMealDayOfWeek = useCallback((mealId: string, day: number | null) => {
    setMeals((prev) => prev.map((m) => (m.id === mealId ? { ...m, day_of_week: day } : m)))
  }, [])

  const removeMeal = useCallback((mealId: string) => {
    setMeals((prev) => prev.filter((m) => m.id !== mealId))
  }, [])

  const openFoodSearch = useCallback((mealId: string) => {
    setSearchDrawer({ open: true, targetMealId: mealId, mode: 'add-food', targetFoodIndex: null })
  }, [])

  const openSwapSearch = useCallback((mealId: string, foodIndex: number) => {
    setSearchDrawer({ open: true, targetMealId: mealId, mode: 'add-swap', targetFoodIndex: foodIndex })
  }, [])

  const addFoodToMeal = useCallback((mealId: string, item: FoodItemDraft) => {
    setMeals((prev) =>
      prev.map((m) => (m.id === mealId ? { ...m, foodItems: [...m.foodItems, item] } : m))
    )
    setSearchDrawer({ open: false, targetMealId: null, mode: 'add-food', targetFoodIndex: null })
  }, [])

  const addSwapOptionToFoodItem = useCallback(
    (
      mealId: string,
      foodIndex: number,
      option: {
        food_id: string
        quantity: number
        unit: 'g' | 'un' | 'ml'
        food: {
          name: string
          calories: number
          protein_g: number
          carbs_g: number
          fats_g: number
          serving_size: number
          serving_unit: string
          is_liquid?: boolean | null
          brand?: string | null
        }
      }
    ) => {
      setMeals((prev) =>
        prev.map((m) => {
          if (m.id !== mealId) return m
          const next = [...m.foodItems]
          const base = next[foodIndex]
          if (!base) return m
          if (base.food_id === option.food_id) return m
          const prevOptions = base.swapOptions ?? []
          if (prevOptions.some((x) => x.food_id === option.food_id)) return m
          next[foodIndex] = {
            ...base,
            swapOptions: [...prevOptions, option],
          }
          return { ...m, foodItems: next }
        })
      )
      setSearchDrawer({ open: false, targetMealId: null, mode: 'add-food', targetFoodIndex: null })
    },
    []
  )

  const removeSwapOption = useCallback((mealId: string, foodIndex: number, swapFoodId: string) => {
    setMeals((prev) =>
      prev.map((m) => {
        if (m.id !== mealId) return m
        const next = [...m.foodItems]
        const base = next[foodIndex]
        if (!base) return m
        next[foodIndex] = {
          ...base,
          swapOptions: (base.swapOptions ?? []).filter((x) => x.food_id !== swapFoodId),
        }
        return { ...m, foodItems: next }
      })
    )
  }, [])

  const updateSwapOption = useCallback(
    (mealId: string, foodIndex: number, swapFoodId: string, quantity: number, unit: 'g' | 'un' | 'ml') => {
      setMeals((prev) =>
        prev.map((m) => {
          if (m.id !== mealId) return m
          const next = [...m.foodItems]
          const base = next[foodIndex]
          if (!base) return m
          next[foodIndex] = {
            ...base,
            swapOptions: (base.swapOptions ?? []).map((opt) =>
              opt.food_id === swapFoodId ? { ...opt, quantity, unit } : opt
            ),
          }
          return { ...m, foodItems: next }
        })
      )
    },
    []
  )

  const updateFoodItem = useCallback((mealId: string, idx: number, qty: number, unit: string) => {
    setMeals((prev) =>
      prev.map((m) => {
        if (m.id !== mealId) return m
        const next = [...m.foodItems]
        next[idx] = { ...next[idx], quantity: qty, unit }
        return { ...m, foodItems: next }
      })
    )
  }, [])

  const removeFoodItem = useCallback((mealId: string, idx: number) => {
    setMeals((prev) =>
      prev.map((m) =>
        m.id === mealId ? { ...m, foodItems: m.foodItems.filter((_, i) => i !== idx) } : m
      )
    )
  }, [])

  const handleSave = useCallback(async () => {
    if (!planName.trim()) {
      toast.error('El nombre es obligatorio.')
      return
    }
    if (mode === 'client-plan' && !clientId) {
      toast.error('Falta el alumno.')
      return
    }
    if (meals.length === 0) {
      toast.error('Agrega al menos una comida antes de guardar')
      return
    }
    if (emptyMeals.length > 0) {
      toast.error('Cada comida debe tener al menos 1 alimento')
      return
    }

    const payloadMeals = meals.map((m, i) => ({
      name: m.name,
      order_index: i,
      day_of_week: m.day_of_week ?? null,
      foodItems: m.foodItems.map((fi) => ({
        food_id: fi.food_id,
        quantity: fi.quantity,
        unit: fi.unit,
        swap_options:
          fi.swapOptions?.map((opt) => {
            const isLiquid = !!opt.food.is_liquid
            return {
              food_id: opt.food_id,
              name: opt.food.name,
              calories: opt.food.calories,
              protein_g: opt.food.protein_g,
              carbs_g: opt.food.carbs_g,
              fats_g: opt.food.fats_g,
              serving_size: opt.food.serving_size,
              serving_unit: opt.food.serving_unit ?? null,
              quantity: opt.quantity,
              unit: coerceSwapOptionUnit(opt.unit, isLiquid),
              is_liquid: isLiquid,
            }
          }) ?? [],
      })),
    }))

    setIsSaving(true)
    try {
      if (mode === 'template') {
        const res = await upsertCoachNutritionTemplate(coachId, {
          id: initialData?.id,
          name: planName.trim(),
          daily_calories: goals.calories,
          protein_g: goals.protein,
          carbs_g: goals.carbs,
          fats_g: goals.fats,
          instructions: instructions || null,
          meals: payloadMeals,
          propagateClientIds: [],
        })
        if (!res.success) {
          toast.error(res.error ?? 'No se pudo guardar')
          return
        }
        toast.success('Plantilla guardada')
        router.push('/coach/nutrition-plans')
        router.refresh()
      } else {
        const res = await upsertClientNutritionPlanJson(coachId, clientId!, {
          id: initialData?.id,
          name: planName.trim(),
          daily_calories: goals.calories,
          protein_g: goals.protein,
          carbs_g: goals.carbs,
          fats_g: goals.fats,
          instructions: instructions || null,
          meals: payloadMeals,
        })
        if (!res.success) {
          toast.error(res.error ?? 'No se pudo guardar')
          return
        }
        toast.success('Plan guardado')
        router.push('/coach/nutrition-plans')
        router.refresh()
      }
    } finally {
      setIsSaving(false)
    }
  }, [
    planName,
    goals,
    instructions,
    meals,
    emptyMeals.length,
    mode,
    coachId,
    clientId,
    initialData?.id,
    router,
  ])

  return (
    <div className="flex min-h-[60vh] flex-col gap-6">
      {emptyMeals.length > 0 && (
        <div className="w-full shrink-0 rounded-2xl border border-orange-500/40 bg-orange-500/10 px-4 py-3 text-sm text-orange-700 dark:text-orange-300">
          <p className="font-bold">Reparación asistida: hay comidas incompletas</p>
          <p className="mt-1 text-xs leading-relaxed">
            Completa alimentos en {emptyMeals.length} comida(s): {emptyMeals.map((m) => m.name || 'Sin nombre').join(', ')}.
            El guardado se bloquea hasta corregirlas para evitar pérdida de datos.
          </p>
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-6 lg:flex-row lg:items-start">
        <div className="order-1 w-full shrink-0 lg:order-1 lg:w-80 lg:max-w-[24rem] xl:w-96">
          <PlanBuilderSidebar
            planName={planName}
            onNameChange={setPlanName}
            goals={goals}
            onGoalsChange={setGoals}
            realTotals={realTotals}
            onAutoSync={handleAutoSync}
            autoSync={autoSync}
            onAutoSyncToggle={setAutoSync}
            instructions={instructions}
            onInstructionsChange={setInstructions}
            isSaving={isSaving}
            onSave={handleSave}
            mode={mode}
          />
        </div>

        <div className="order-2 min-w-0 w-full flex-1 lg:order-2">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={meals.map((m) => m.id)} strategy={verticalListSortingStrategy}>
              <MealCanvas
                meals={meals}
                onAddMeal={addMeal}
                onUpdateMealName={updateMealName}
                onUpdateMealDayOfWeek={updateMealDayOfWeek}
                onRemoveMeal={removeMeal}
                onOpenFoodSearch={openFoodSearch}
                onUpdateFoodItem={updateFoodItem}
                onRemoveFoodItem={removeFoodItem}
                onOpenSwapSearch={openSwapSearch}
                onRemoveSwapOption={removeSwapOption}
                onUpdateSwapOption={updateSwapOption}
              />
            </SortableContext>
          </DndContext>
        </div>
      </div>

      <FoodSearchDrawer
        open={searchDrawer.open}
        coachId={coachId}
        onClose={() =>
          setSearchDrawer({ open: false, targetMealId: null, mode: 'add-food', targetFoodIndex: null })
        }
        onConfirm={(item) => {
          if (searchDrawer.mode !== 'add-food') return
          if (searchDrawer.targetMealId) addFoodToMeal(searchDrawer.targetMealId, item)
        }}
        selectionMode={searchDrawer.mode}
        onConfirmSwapFood={(food) => {
          if (searchDrawer.mode !== 'add-swap') return
          if (!searchDrawer.targetMealId || searchDrawer.targetFoodIndex == null) return
          addSwapOptionToFoodItem(searchDrawer.targetMealId, searchDrawer.targetFoodIndex, {
            food_id: food.id,
            quantity: Number(food.serving_size) || 100,
            unit: coerceSwapOptionUnit(food.serving_unit ?? undefined, !!food.is_liquid),
            food: {
              name: food.name,
              calories: food.calories,
              protein_g: food.protein_g,
              carbs_g: food.carbs_g,
              fats_g: food.fats_g,
              serving_size: food.serving_size,
              serving_unit: food.serving_unit ?? 'g',
              is_liquid: food.is_liquid ?? false,
              brand: food.brand ?? null,
            },
          })
        }}
        excludedFoodIds={
          searchDrawer.mode === 'add-swap' &&
          searchDrawer.targetMealId &&
          searchDrawer.targetFoodIndex != null
            ? (() => {
                const meal = meals.find((m) => m.id === searchDrawer.targetMealId)
                const base = meal?.foodItems[searchDrawer.targetFoodIndex]
                if (!base) return []
                return [base.food_id, ...(base.swapOptions ?? []).map((s) => s.food_id)]
              })()
            : []
        }
        clientFavoriteIds={clientFavoriteIds.size > 0 ? clientFavoriteIds : undefined}
      />
    </div>
  )
}
