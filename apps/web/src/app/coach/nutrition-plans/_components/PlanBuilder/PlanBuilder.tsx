'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
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
  getClientFoodRestrictions,
} from '../../_actions/nutrition-coach.actions'
import {
  createDayVariantAction,
  deleteDayVariantAction,
  assignMealVariantAction,
  saveMealExchangeTargetsAction,
  setPlanModeAction,
  logNutritionPdfGeneratedAction,
} from '../../_actions/exchange.actions'
import { ExchangeModePanel } from './ExchangeModePanel'
import { ExchangeTargetsEditor, type ExchangeSaveState } from './ExchangeTargetsEditor'
import {
  dayTotalsByVariant,
  hasUnconfirmedMacros,
} from '@/services/nutrition-exchanges/exchange-calc'
import { trackNutritionEvent } from '@/lib/product-analytics'
import { saveMealGroup } from '../../../meal-groups/_actions/meal-groups.actions'
import type { DayVariant, NutritionPlanMode } from '@/domain/nutrition/exchange.types'
import type { ExchangeBuilderData, ExchangeTargetDraft, FoodItemDraft, MealDraft, PlanBuilderInitialData } from './types'
import type { ClientProfileHint } from './PlanBuilderSidebar'
import type { NutritionSectionKey } from '@eva/feature-prefs'

/** Comidas nuevas usan id local `meal-*` hasta que el plan se guarda (no persistibles aún). */
function isPersistedMealId(mealId: string): boolean {
  return !mealId.startsWith('meal-')
}

function newMealId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return `meal-${crypto.randomUUID()}`
  return `meal-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

interface Props {
  mode: 'template' | 'client-plan'
  coachId: string
  clientId?: string
  initialData?: PlanBuilderInitialData | null
  clientProfile?: ClientProfileHint | null
  /** Módulo nutrition_exchanges (solo si está ON para el workspace activo). */
  exchange?: ExchangeBuilderData | null
  /**
   * Visibilidad efectiva por sección (resuelta server-side: entitlement AND preferencia).
   * Gobierna los paneles Pro del sidebar — `goals_bodycomp` (objetivos por composición
   * corporal, hornea `body_composition`) y `micros_advanced` (hornea `nutrition_exchanges`).
   * Ausente => fail-OPEN al entitlement legacy (`!!exchange`) para no romper call sites viejos.
   */
  sectionFlags?: Partial<Record<NutritionSectionKey, boolean>> | null
}

export function PlanBuilder({ mode, coachId, clientId, initialData, clientProfile, exchange, sectionFlags }: Props) {
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
  // "Guardar como grupo": crea un saved_meal desde los alimentos actuales de una comida.
  const [saveGroupState, setSaveGroupState] = useState<{ mealId: string; name: string } | null>(null)
  const [isSavingGroup, setIsSavingGroup] = useState(false)
  const [autoSync, setAutoSync] = useState(true)
  const [clientFavoriteIds, setClientFavoriteIds] = useState<Set<string>>(new Set())
  // Restricciones del alumno (A3): alergia = bloqueo con override; intolerancia/dislike = aviso blando
  // (se mantienen como sets SEPARADOS para no degradar una intolerancia a "no le gusta" en el badge).
  const [clientAllergyIds, setClientAllergyIds] = useState<Set<string>>(new Set())
  const [clientIntoleranceIds, setClientIntoleranceIds] = useState<Set<string>>(new Set())
  const [clientDislikeIds, setClientDislikeIds] = useState<Set<string>>(new Set())

  // ─── Módulo nutrition_exchanges (solo client-plan, con módulo ON) ──────────────
  // Gating efectivo: el bundle `exchange` (entitlement server-side) AND la visibilidad
  // de seccion `micros_advanced` (entitlement AND preferencia coach/team/cliente). Sin
  // `sectionFlags` => fail-OPEN al legacy (`!!exchange`). Render-only: el modo `exchanges`
  // YA persistido en el plan se conserva en DB; solo se oculta la superficie de edición.
  const microsAdvancedVisible = sectionFlags ? sectionFlags.micros_advanced === true : !!exchange
  const exchangeEnabled = !!exchange && mode === 'client-plan' && microsAdvancedVisible
  const [planMode, setPlanMode] = useState<NutritionPlanMode>(exchange?.planMode ?? 'grams')
  const [exchangeTargets, setExchangeTargets] = useState<Record<string, ExchangeTargetDraft[]>>(
    exchange?.targetsByMealId ?? {}
  )
  const [dayVariants, setDayVariants] = useState<DayVariant[]>(exchange?.variants ?? [])
  const [variantByMealId, setVariantByMealId] = useState<Record<string, string | null>>(
    exchange?.variantByMealId ?? {}
  )
  const [exchangeSaveState, setExchangeSaveState] = useState<Record<string, ExchangeSaveState>>({})
  const [isModeToggling, startModeToggle] = useTransition()
  const [isVariantPending, startVariantTransition] = useTransition()
  const [isExchangePdfPending, startExchangePdf] = useTransition()
  const targetSaveTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const exchangeActive = exchangeEnabled && planMode === 'exchanges'

  // En modo porciones los objetivos son el REQUERIMIENTO de la nutri (no se autosincronizan
  // con los alimentos por gramos).
  useEffect(() => {
    if (exchangeActive) setAutoSync(false)
  }, [exchangeActive])

  // Limpieza de debounces al desmontar.
  useEffect(() => {
    const timers = targetSaveTimers.current
    return () => {
      for (const t of Object.values(timers)) clearTimeout(t)
    }
  }, [])

  const handleToggleExchangeMode = useCallback(
    (next: boolean) => {
      const planId = exchange?.planId
      if (!planId) return
      const nextMode: NutritionPlanMode = next ? 'exchanges' : 'grams'
      const prev = planMode
      setPlanMode(nextMode)
      startModeToggle(async () => {
        const res = await setPlanModeAction({ planId, mode: nextMode })
        if (!res.success) {
          setPlanMode(prev)
          toast.error(res.error ?? 'No se pudo cambiar el modo del plan.')
        }
      })
    },
    [exchange?.planId, planMode]
  )

  const handleExchangeTargetsChange = useCallback((mealId: string, targets: ExchangeTargetDraft[]) => {
    setExchangeTargets((prev) => ({ ...prev, [mealId]: targets }))
    if (!isPersistedMealId(mealId)) return
    setExchangeSaveState((prev) => ({ ...prev, [mealId]: 'saving' }))
    if (targetSaveTimers.current[mealId]) clearTimeout(targetSaveTimers.current[mealId])
    targetSaveTimers.current[mealId] = setTimeout(async () => {
      const res = await saveMealExchangeTargetsAction({
        mealId,
        targets: targets.map((t) => ({
          exchangeGroupId: t.exchangeGroupId,
          portions: t.portions,
          notes: t.notes ?? null,
        })),
      })
      setExchangeSaveState((prev) => ({ ...prev, [mealId]: res.success ? 'saved' : 'error' }))
      if (!res.success) toast.error(res.error ?? 'No se pudieron guardar las porciones.')
    }, 700)
  }, [])

  const handleMealVariantChange = useCallback((mealId: string, variantId: string | null) => {
    if (!isPersistedMealId(mealId)) return
    setVariantByMealId((prev) => ({ ...prev, [mealId]: variantId }))
    startVariantTransition(async () => {
      const res = await assignMealVariantAction({ mealId, variantId })
      if (!res.success) toast.error(res.error ?? 'No se pudo asignar la variante.')
    })
  }, [])

  const handleCreateVariant = useCallback(
    (name: string) => {
      const planId = exchange?.planId
      if (!planId) return
      startVariantTransition(async () => {
        const res = await createDayVariantAction({ planId, name })
        if (res.success && res.variant) {
          setDayVariants((prev) => [...prev, res.variant!])
        } else {
          toast.error(res.error ?? 'No se pudo crear la variante.')
        }
      })
    },
    [exchange?.planId]
  )

  const handleDeleteVariant = useCallback((variantId: string) => {
    startVariantTransition(async () => {
      const res = await deleteDayVariantAction({ variantId })
      if (res.success) {
        setDayVariants((prev) => prev.filter((v) => v.id !== variantId))
        setVariantByMealId((prev) => {
          const next: Record<string, string | null> = {}
          for (const [mealId, vid] of Object.entries(prev)) next[mealId] = vid === variantId ? null : vid
          return next
        })
      } else {
        toast.error(res.error ?? 'No se pudo eliminar la variante.')
      }
    })
  }, [])

  const exchangeMealsLike = useMemo(
    () =>
      meals.map((m) => ({
        targets: exchangeTargets[m.id] ?? [],
        dayVariantId: variantByMealId[m.id] ?? null,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [meals.map((m) => m.id).join('|'), exchangeTargets, variantByMealId]
  )

  const exchangeTotalsByVariant = useMemo(
    () => (exchange ? dayTotalsByVariant(exchangeMealsLike, dayVariants, exchange.groups) : []),
    [exchange, exchangeMealsLike, dayVariants]
  )

  const exchangeProvisional = useMemo(
    () =>
      exchange
        ? hasUnconfirmedMacros(
            Object.values(exchangeTargets).flat(),
            exchange.groups
          )
        : false,
    [exchange, exchangeTargets]
  )

  const handleDownloadExchangePdf = useCallback(
    (format: 'compact' | 'equivalences') => {
      if (!exchange) return
      startExchangePdf(async () => {
        try {
          const { downloadNutritionExchangePdf } = await import('@/lib/nutrition-exchange-pdf')
          const logoDataUrl = exchange.logoDataUrl
          await downloadNutritionExchangePdf({
            format,
            brand: exchange.brand,
            logoDataUrl,
            planName: planName || 'Pauta nutricional',
            clientName: exchange.clientName ?? null,
            instructions: instructions || null,
            goals,
            meals: meals.map((m) => ({
              id: m.id,
              name: m.name,
              notes: m.notes ?? null,
              dayVariantId: variantByMealId[m.id] ?? null,
              targets: exchangeTargets[m.id] ?? [],
            })),
            variants: dayVariants,
            groups: exchange.groups,
            equivalences: exchange.equivalences,
            fileStem: `pauta-${(exchange.clientName ?? planName ?? 'porciones').toLowerCase()}`,
          })
          trackNutritionEvent('nutrition_exchange_pdf_ok', { format, source: 'coach_builder' })
          toast.success('PDF descargado')
          // Bitácora AC7 — fire-and-forget; solo inserta si el contexto activo es team.
          if (exchange.planId) {
            void logNutritionPdfGeneratedAction({ planId: exchange.planId, format })
          }
        } catch (e) {
          console.error('[module:nutrition_exchanges] pdf coach', e)
          trackNutritionEvent('nutrition_exchange_pdf_error', { format, source: 'coach_builder' })
          toast.error('No se pudo generar el PDF. Intenta de nuevo.')
        }
      })
    },
    [exchange, planName, instructions, goals, meals, variantByMealId, exchangeTargets, dayVariants]
  )

  useEffect(() => {
    if (!clientId) return
    getClientFoodFavorites(clientId).then((ids) => setClientFavoriteIds(new Set(ids)))
    getClientFoodRestrictions(clientId).then((rows) => {
      setClientAllergyIds(new Set(rows.filter((r) => r.preference_type === 'allergy').map((r) => r.food_id)))
      setClientIntoleranceIds(new Set(rows.filter((r) => r.preference_type === 'intolerance').map((r) => r.food_id)))
      setClientDislikeIds(new Set(rows.filter((r) => r.preference_type === 'dislike').map((r) => r.food_id)))
    })
  }, [clientId])

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } })
  )

  const realTotals = useMemo(() => totalsFromMealDrafts(meals), [meals])
  const emptyMeals = useMemo(() => meals.filter((m) => m.foodItems.length === 0), [meals])

  // Gating del panel "Objetivos por composición corporal" del sidebar. Si llega `sectionFlags`
  // (resolver server-side: entitlement AND preferencia), manda; si no, fail-OPEN al entitlement
  // legacy `!!exchange`. `goals_bodycomp` ya hornea el módulo `body_composition`.
  const proBodyComp = sectionFlags ? sectionFlags.goals_bodycomp === true : !!exchange

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

  const updateMealNotes = useCallback((mealId: string, notes: string) => {
    setMeals((prev) => prev.map((m) => (m.id === mealId ? { ...m, notes: notes || null } : m)))
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

  // Insertar grupo = agregar N alimentos de una (mismo path que addFoodToMeal, en batch).
  const addFoodsToMeal = useCallback((mealId: string, items: FoodItemDraft[]) => {
    if (items.length === 0) return
    setMeals((prev) =>
      prev.map((m) => (m.id === mealId ? { ...m, foodItems: [...m.foodItems, ...items] } : m))
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

  const reorderFoodItems = useCallback((mealId: string, fromIndex: number, toIndex: number) => {
    setMeals((prev) =>
      prev.map((m) => {
        if (m.id !== mealId) return m
        const items = [...m.foodItems]
        const [moved] = items.splice(fromIndex, 1)
        items.splice(toIndex, 0, moved)
        return { ...m, foodItems: items }
      })
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
    // Modo porciones: las comidas se prescriben por grupos de intercambio, no por alimentos.
    if (!exchangeActive && emptyMeals.length > 0) {
      toast.error('Cada comida debe tener al menos 1 alimento')
      return
    }

    const payloadMeals = meals.map((m, i) => ({
      // R1 (modo porciones): el server matchea por ID de DB — los targets de intercambio
      // y la variante de día viajan SIEMPRE con su comida al reordenar/borrar comidas.
      // Modo gramos NO envía id ⇒ matching legacy por posición byte-identical (AC1).
      ...(exchangeActive && isPersistedMealId(m.id) ? { id: m.id } : {}),
      name: m.name,
      notes: m.notes ?? null,
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
          plan_mode: exchangeActive ? 'exchanges' : 'grams',
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
    exchangeActive,
  ])

  const openSaveAsGroup = useCallback(
    (mealId: string) => {
      const meal = meals.find((m) => m.id === mealId)
      setSaveGroupState({ mealId, name: meal?.name ?? '' })
    },
    [meals]
  )

  // Reusa la action de meal-groups: crea un saved_meal (INSERT) con los alimentos actuales.
  const handleConfirmSaveGroup = useCallback(async () => {
    if (!saveGroupState) return
    const name = saveGroupState.name.trim()
    if (!name) {
      toast.error('Ponle un nombre al grupo.')
      return
    }
    const meal = meals.find((m) => m.id === saveGroupState.mealId)
    if (!meal || meal.foodItems.length === 0) {
      toast.error('La comida no tiene alimentos.')
      return
    }
    setIsSavingGroup(true)
    try {
      const res = await saveMealGroup(
        {
          name,
          items: meal.foodItems.map((fi) => ({
            food_id: fi.food_id,
            quantity: fi.quantity,
            unit: fi.unit,
          })),
        },
        coachId
      )
      if ('success' in res && res.success) {
        toast.success('Grupo guardado — disponible en Grupos')
        setSaveGroupState(null)
      } else {
        const message = 'error' in res ? res.error : undefined
        toast.error(message ?? 'No se pudo guardar el grupo.')
      }
    } finally {
      setIsSavingGroup(false)
    }
  }, [saveGroupState, meals, coachId])

  // Totales del sidebar: en modo porciones se derivan de los targets (Σ porciones × ref).
  const sidebarTotals = useMemo(() => {
    if (!exchangeActive || !exchange) return realTotals
    const whole = exchangeTotalsByVariant.length > 0
      ? exchangeTotalsByVariant[0].totals
      : { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0 }
    return {
      calories: whole.calories,
      protein: whole.proteinG,
      carbs: whole.carbsG,
      fats: whole.fatsG,
    }
  }, [exchangeActive, exchange, realTotals, exchangeTotalsByVariant])

  return (
    <div className="flex min-h-[60vh] flex-col gap-6">
      {exchangeEnabled && exchange && (
        <ExchangeModePanel
          active={exchangeActive}
          canToggle={!!exchange.planId}
          togglePending={isModeToggling}
          onToggleMode={handleToggleExchangeMode}
          groups={exchange.groups}
          variants={dayVariants}
          totalsByVariant={exchangeTotalsByVariant}
          goals={goals}
          provisional={exchangeProvisional}
          variantPending={isVariantPending}
          onCreateVariant={handleCreateVariant}
          onDeleteVariant={handleDeleteVariant}
          brand={exchange.brand}
          pdfPending={isExchangePdfPending}
          onDownloadPdf={handleDownloadExchangePdf}
        />
      )}
      {mode === 'template' && sectionFlags?.micros_advanced === true && (
        <div className="w-full shrink-0 rounded-2xl border border-[color:var(--sport-300)] bg-[var(--sport-100)] px-4 py-3 text-sm text-[var(--sport-700)]">
          <p className="font-bold">Porciones y equivalencias</p>
          <p className="mt-1 text-xs leading-relaxed">
            Las porciones (grupos de intercambio) y equivalencias se configuran al asignar este plan a un alumno, no en la plantilla.
          </p>
        </div>
      )}
      {!exchangeActive && emptyMeals.length > 0 && (
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
            realTotals={sidebarTotals}
            onAutoSync={handleAutoSync}
            autoSync={autoSync}
            onAutoSyncToggle={setAutoSync}
            instructions={instructions}
            onInstructionsChange={setInstructions}
            isSaving={isSaving}
            onSave={handleSave}
            mode={mode}
            clientProfile={clientProfile}
            proBodyComp={proBodyComp}
          />
        </div>

        <div className="order-2 min-w-0 w-full flex-1 lg:order-2">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={meals.map((m) => m.id)} strategy={verticalListSortingStrategy}>
              <MealCanvas
                meals={meals}
                exchangeMode={exchangeActive}
                renderMealExtra={
                  exchangeActive && exchange
                    ? (mealId) => (
                        <ExchangeTargetsEditor
                          mealId={mealId}
                          persistable={isPersistedMealId(mealId)}
                          groups={exchange.groups}
                          targets={exchangeTargets[mealId] ?? []}
                          onChange={handleExchangeTargetsChange}
                          variants={dayVariants}
                          variantId={variantByMealId[mealId] ?? null}
                          onVariantChange={handleMealVariantChange}
                          saveState={exchangeSaveState[mealId] ?? 'idle'}
                        />
                      )
                    : undefined
                }
                onAddMeal={addMeal}
                onUpdateMealName={updateMealName}
                onUpdateMealDayOfWeek={updateMealDayOfWeek}
                onUpdateMealNotes={updateMealNotes}
                onRemoveMeal={removeMeal}
                onSaveMealAsGroup={openSaveAsGroup}
                onOpenFoodSearch={openFoodSearch}
                onUpdateFoodItem={updateFoodItem}
                onRemoveFoodItem={removeFoodItem}
                onReorderFoodItems={reorderFoodItems}
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
        clientAllergyIds={clientAllergyIds.size > 0 ? clientAllergyIds : undefined}
        clientIntoleranceIds={clientIntoleranceIds.size > 0 ? clientIntoleranceIds : undefined}
        clientDislikeIds={clientDislikeIds.size > 0 ? clientDislikeIds : undefined}
        groupsEnabled={!exchangeActive}
        onInsertGroup={(items) => {
          if (searchDrawer.mode !== 'add-food') return
          if (searchDrawer.targetMealId) addFoodsToMeal(searchDrawer.targetMealId, items)
        }}
      />

      {/* Guardar comida como grupo reutilizable */}
      <Dialog
        open={!!saveGroupState}
        onOpenChange={(o) => {
          if (!o) setSaveGroupState(null)
        }}
      >
        <DialogContent className="border-subtle bg-surface-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-lg font-extrabold text-strong">
              Guardar como grupo
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="save-meal-group-name" className="text-xs font-bold text-muted">
              Nombre del grupo
            </Label>
            <Input
              id="save-meal-group-name"
              autoFocus
              placeholder="Ej: Desayuno proteico"
              value={saveGroupState?.name ?? ''}
              onChange={(e) =>
                setSaveGroupState((s) => (s ? { ...s, name: e.target.value } : s))
              }
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleConfirmSaveGroup()
                }
              }}
              className="h-11 rounded-control border-default bg-surface-card text-[15px] font-semibold text-strong placeholder:text-muted"
            />
            <p className="text-[11px] text-muted">
              Se guardará en Grupos con los alimentos actuales de esta comida.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveGroupState(null)} disabled={isSavingGroup}>
              Cancelar
            </Button>
            <Button
              variant="sport"
              onClick={handleConfirmSaveGroup}
              disabled={isSavingGroup || !saveGroupState?.name.trim()}
              className="min-w-[130px]"
            >
              {isSavingGroup ? 'Guardando…' : 'Guardar grupo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
