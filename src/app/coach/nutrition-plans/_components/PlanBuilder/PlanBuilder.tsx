'use client'

import { useCallback, useMemo, useState } from 'react'
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
import { PlanBuilderSidebar } from './PlanBuilderSidebar'
import { MealCanvas } from './MealCanvas'
import { FoodSearchDrawer } from './FoodSearchDrawer'
import { totalsFromMealDrafts } from './MacroCalculator'
import {
  upsertCoachNutritionTemplate,
  upsertClientNutritionPlanJson,
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
  const [searchDrawer, setSearchDrawer] = useState<{ open: boolean; targetMealId: string | null }>({
    open: false,
    targetMealId: null,
  })
  const [isSaving, setIsSaving] = useState(false)

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } })
  )

  const realTotals = useMemo(() => totalsFromMealDrafts(meals), [meals])

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
      { id: newMealId(), name: `Comida ${prev.length + 1}`, foodItems: [] },
    ])
  }, [])

  const updateMealName = useCallback((mealId: string, name: string) => {
    setMeals((prev) => prev.map((m) => (m.id === mealId ? { ...m, name } : m)))
  }, [])

  const removeMeal = useCallback((mealId: string) => {
    setMeals((prev) => prev.filter((m) => m.id !== mealId))
  }, [])

  const openFoodSearch = useCallback((mealId: string) => {
    setSearchDrawer({ open: true, targetMealId: mealId })
  }, [])

  const addFoodToMeal = useCallback((mealId: string, item: FoodItemDraft) => {
    setMeals((prev) =>
      prev.map((m) => (m.id === mealId ? { ...m, foodItems: [...m.foodItems, item] } : m))
    )
    setSearchDrawer({ open: false, targetMealId: null })
  }, [])

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

    const payloadMeals = meals.map((m, i) => ({
      name: m.name,
      order_index: i,
      foodItems: m.foodItems.map((fi) => ({
        food_id: fi.food_id,
        quantity: fi.quantity,
        unit: fi.unit,
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
    mode,
    coachId,
    clientId,
    initialData?.id,
    router,
  ])

  return (
    <div className="flex flex-col gap-6 min-h-[60vh] lg:flex-row">
      <div className="order-1 flex-shrink-0 lg:order-1 lg:w-80 xl:w-96">
        <PlanBuilderSidebar
          planName={planName}
          onNameChange={setPlanName}
          goals={goals}
          onGoalsChange={setGoals}
          realTotals={realTotals}
          onAutoSync={handleAutoSync}
          instructions={instructions}
          onInstructionsChange={setInstructions}
          isSaving={isSaving}
          onSave={handleSave}
          mode={mode}
        />
      </div>

      <div className="order-2 min-w-0 flex-1 lg:order-2">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={meals.map((m) => m.id)} strategy={verticalListSortingStrategy}>
            <MealCanvas
              meals={meals}
              onAddMeal={addMeal}
              onUpdateMealName={updateMealName}
              onRemoveMeal={removeMeal}
              onOpenFoodSearch={openFoodSearch}
              onUpdateFoodItem={updateFoodItem}
              onRemoveFoodItem={removeFoodItem}
            />
          </SortableContext>
        </DndContext>
      </div>

      <FoodSearchDrawer
        open={searchDrawer.open}
        onClose={() => setSearchDrawer({ open: false, targetMealId: null })}
        onConfirm={(item) => {
          if (searchDrawer.targetMealId) addFoodToMeal(searchDrawer.targetMealId, item)
        }}
      />
    </div>
  )
}
