import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { AlertTriangle, Apple, Check, Flame } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import { supabase } from '../../../lib/supabase'
import { checkOnline } from '../../../lib/use-online'
import { enqueueNutritionToggle } from '../../../lib/offline-cache'
import { toggleMealCompletion } from '../../../lib/nutrition.queries'
import { getTodayInSantiago, nutritionMealApplies } from '../../../lib/date-utils'
import { toast } from '../../Toast'
import {
  applyMealFoodSwaps,
  calculateConsumedMacrosWithCompletionFallback,
  normalizeMealForMacros,
  portionPctMapFromMealLogs,
  type FoodMacrosRow,
  type MealWithFoodItems,
} from '../../../lib/nutrition-utils'
import { Badge } from '../../Badge'
import { Card } from '../../Card'
import { MACRO_COLORS } from '../../MacroRingSummary'
import { DANGER_500, EMBER_500, SUCCESS_500 } from './types'

interface MealRow { id: string; name: string }
interface SwapLog {
  meal_id: string
  original_food_id: string
  swapped_food_id: string
  swapped_quantity?: number | null
  swapped_unit?: string | null
}

/**
 * Aplica los intercambios de una comida ya normalizada. Arma `swapFoodsByOriginal`
 * (lookup de la opcion elegida dentro de swap_options) y delega en el helper canonico
 * `applyMealFoodSwaps` (nutrition-engine macros.ts:239-269). Espejo verbatim del widget
 * web NutritionDailySummary.tsx:79-121.
 */
function applySwapsToMeal(meal: MealWithFoodItems, swapByMealFood: ReadonlyMap<string, SwapLog>): MealWithFoodItems {
  if (swapByMealFood.size === 0) return meal
  const swapFoodsByOriginal = new Map<
    string,
    { swappedFood: FoodMacrosRow; swappedQuantity?: number | null; swappedUnit?: string | null }
  >()
  for (const item of meal.food_items) {
    const originalFoodId = item.foods.id
    if (!originalFoodId) continue
    const swap = swapByMealFood.get(`${meal.id}:${originalFoodId}`)
    if (!swap) continue
    const option = (item.swap_options ?? []).find((x) => x.food_id === swap.swapped_food_id)
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
      swappedQuantity: swap.swapped_quantity ?? null,
      swappedUnit: swap.swapped_unit ?? null,
    })
  }
  return applyMealFoodSwaps(meal, swapFoodsByOriginal)
}
interface Loaded {
  planId: string
  planName: string
  consumedCal: number
  targetCal: number
  macros: { label: string; value: number; target: number; color: string }[]
  meals: MealRow[]
  completed: Set<string>
  hasLog: boolean
  logId: string | null
}

/**
 * §13 NutritionDailySummary (web `nutrition/NutritionDailySummary.tsx`). Respeta
 * el gate del dominio (el shell no la monta si nutrition esta OFF). Header (apple
 * + plan + "Ver todo →"), kcal hero + badge "N restantes", 3 MacroBar (P/C/G),
 * lista de comidas con estado de completado + CTA. Macros = paridad con el widget
 * web: aplica intercambios de alimento (nutrition_meal_food_swaps) y porciones
 * parciales (consumed_quantity) antes de contar (web :79-134).
 *
 * Toggle inline de comidas (2R-2, paridad MealCompletionRow.tsx:40-124): tap en la fila
 * marca/desmarca con actualizacion optimista, spinner de pending (web Loader2 :108-109 +
 * opacity-60 :99) y copy web verbatim en los toasts. Usa el MISMO camino de datos que la
 * pantalla de Nutricion RN (nutrition.queries.ts toggleMealCompletion + cola offline
 * enqueueNutritionToggle, dedup meal:fecha); al confirmar el server se refetchea el widget
 * completo (espejo del router.refresh() web :67 que actualiza kcal/macros).
 *
 * ADAPTACIONES NATIVAS DOCUMENTADAS:
 * - Offline/fallo transitorio: web revierte el check al cerrar la transicion (useOptimistic
 *   sin refresh) y la cola lo repone al sincronizar; en RN el check queda optimista mientras
 *   el toggle espera en cola — mismo patron del sibling nutricion.tsx:343-394, evita que el
 *   widget y la tab Nutricion muestren estados opuestos con la misma cola.
 * - Single-flight `toggling` (patron nutricion.tsx:328): mientras un toggle esta en vuelo
 *   las demas filas ignoran taps; web permite transiciones concurrentes por fila.
 * - Sin trackNutritionEvent: apps/mobile no tiene product-analytics.
 */
export function NutritionDailySummary({ clientId, onSeeAll, reloadSignal = 0 }: { clientId: string; onSeeAll: () => void; reloadSignal?: number }) {
  const { theme } = useTheme()
  const [data, setData] = useState<Loaded | null>(null)
  const [noPlan, setNoPlan] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)

  // Reset SOLO al cambiar de alumno: evita dejar render stale del alumno anterior
  // mientras llega el fetch nuevo (clientId es estable en una sesion normal, asi que
  // esto no parpadea en el uso corriente; el last-write-wins vive dentro de load()).
  useEffect(() => {
    setData(null)
    setNoPlan(false)
  }, [clientId])

  // Refetch en cada FOCUS del Home (montaje inicial + cada regreso a la tab Inicio) y
  // cuando el dashboard hace pull-to-refresh (`reloadSignal` cambia). Sin esto el widget
  // quedaba CONGELADO en el snapshot de su primer montaje: como las tabs de expo-router
  // NO se desmontan (sin unmountOnBlur, _layout.tsx), la `useEffect([clientId])` original
  // corria una sola vez y jamas volvia a consultar. Una comida completada DESPUES (en la
  // tab Nutricion, en la web, o por el coach) nunca aparecia en el widget aunque la tab
  // Nutricion (que SI refetchea) y la web ya la mostraran → 0/target + "Registra tu primera
  // comida" fantasma. Web (RSC) se re-renderiza en cada navegacion; esto replica esa frescura.
  // Guarda last-write-wins: un load en vuelo se marca `ignore` para no pisar uno mas nuevo.
  useFocusEffect(
    useCallback(() => {
      let ignore = false
      load(() => ignore)
      return () => {
        ignore = true
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clientId, reloadSignal])
  )

  async function load(isIgnored: () => boolean) {
    const { iso: todayIso } = getTodayInSantiago()
    const { data: plan } = await supabase
      .from('nutrition_plans')
      .select(`
        id, name, daily_calories, protein_g, carbs_g, fats_g,
        nutrition_meals ( id, name, order_index, day_of_week,
          nutrition_meal_food_items:food_items ( id, quantity, unit, swap_options,
            foods ( id, name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit ) ) )
      `)
      .eq('client_id', clientId)
      .eq('is_active', true)
      .maybeSingle()

    if (isIgnored()) return
    if (!plan) { setNoPlan(true); return }

    // Web ordena las comidas por order_index (dashboard.queries.ts:276 .order('order_index', asc));
    // el select anidado de PostgREST no garantiza orden, asi que ordenamos aca para paridad visual.
    const mealsForDay = ((plan as any).nutrition_meals ?? [])
      .filter((m: any) => nutritionMealApplies(m, todayIso))
      .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))

    const { data: logData } = await supabase
      .from('daily_nutrition_logs')
      .select(
        'id, nutrition_meal_logs ( meal_id, is_completed, consumed_quantity ), nutrition_meal_food_swaps ( meal_id, original_food_id, swapped_food_id, swapped_quantity, swapped_unit )'
      )
      .eq('client_id', clientId)
      .eq('plan_id', plan.id)
      .eq('log_date', todayIso)
      .maybeSingle()

    if (isIgnored()) return

    const mealLogs = (logData as any)?.nutrition_meal_logs ?? []
    const mealSwaps: SwapLog[] = (logData as any)?.nutrition_meal_food_swaps ?? []
    const completed = new Set<string>(mealLogs.filter((l: any) => l.is_completed).map((l: any) => l.meal_id))

    // Web NutritionDailySummary.tsx:75-121 — index swaps por `${meal_id}:${original_food_id}`.
    const swapByMealFood = new Map<string, SwapLog>()
    for (const s of mealSwaps) swapByMealFood.set(`${s.meal_id}:${s.original_food_id}`, s)

    const normalized = mealsForDay.map((m: any) =>
      normalizeMealForMacros({ id: m.id, day_of_week: m.day_of_week, food_items: m.nutrition_meal_food_items })
    )
    // Aplica intercambios de alimento antes de contar macros (paridad con applyMealFoodSwaps,
    // nutrition-engine macros.ts:239-269): si no hay swaps, la comida queda intacta.
    const mealsWithSwaps = normalized.map((meal: MealWithFoodItems) => applySwapsToMeal(meal, swapByMealFood))
    // Porcion parcial registrada por comida (consumed_quantity) — escala macros (web :123).
    const portionMap = portionPctMapFromMealLogs(mealLogs)
    const goals = { calories: plan.daily_calories ?? 0, protein: plan.protein_g ?? 0, carbs: plan.carbs_g ?? 0, fats: plan.fats_g ?? 0 }
    const consumed = calculateConsumedMacrosWithCompletionFallback(mealsWithSwaps, completed, goals, portionMap)

    // Limpia el flag "sin plan" en la ruta de exito: si un load previo lo puso en true
    // (l.140) y el coach asigna el plan con la app abierta, el refetch (mismo clientId, sin
    // pasar por el reset de useEffect([clientId]) l.102) debe mostrar el plan. Sin esto,
    // `if (noPlan)` (l.194) precede a `if (!data)` y congela "Sin plan" pese al setData.
    setNoPlan(false)
    setData({
      planId: plan.id,
      planName: plan.name,
      consumedCal: Math.round(consumed.calories),
      targetCal: goals.calories,
      macros: [
        { label: 'Proteína', value: consumed.protein, target: goals.protein, color: MACRO_COLORS.protein },
        { label: 'Carbos', value: consumed.carbs, target: goals.carbs, color: MACRO_COLORS.carbs },
        { label: 'Grasas', value: consumed.fats, target: goals.fats, color: MACRO_COLORS.fats },
      ],
      meals: mealsForDay.map((m: any) => ({ id: m.id, name: m.name })),
      completed,
      hasLog: !!logData,
      logId: (logData as any)?.id ?? null,
    })
  }

  /** Flip local del check de una comida (base del optimista y del revert en fallo). */
  function setMealCompleted(mealId: string, completedNow: boolean) {
    setData((prev) => {
      if (!prev) return prev
      const next = new Set(prev.completed)
      if (completedNow) next.add(mealId)
      else next.delete(mealId)
      return { ...prev, completed: next }
    })
  }

  /**
   * Toggle inline (web MealCompletionRow.tsx:40-90): optimista → mutacion → refetch
   * (router.refresh web) | revert + toast error (4xx) | cola offline + toast señal.
   */
  async function handleToggle(mealId: string) {
    if (!data || toggling) return
    const wasCompleted = data.completed.has(mealId)
    const next = !wasCompleted
    // Fecha calculada AL MOMENTO del tap, no al load (web MealCompletionRow.tsx:42).
    const targetDate = getTodayInSantiago().iso
    const { planId, logId } = data
    setToggling(mealId)
    setMealCompleted(mealId, next)
    try {
      if (!(await checkOnline())) {
        await enqueueNutritionToggle({ clientId, planId, mealId, completed: next, logId: logId ?? undefined, date: targetDate })
        toast.info('Sin conexión — se sincronizará al volver la señal')
        return
      }
      const { success, logId: newLogId } = await toggleMealCompletion(clientId, planId, mealId, next, logId, targetDate)
      if (!success) {
        // supabase-js no lanza en corte de red: distingue offline real (→ cola, como el
        // isLikelyOfflineError web :69-83) de un rechazo del server (→ revert + toast :55-57).
        if (!(await checkOnline())) {
          await enqueueNutritionToggle({ clientId, planId, mealId, completed: next, logId: logId ?? undefined, date: targetDate })
          toast.info('Sin conexión — se sincronizará al volver la señal')
          return
        }
        setMealCompleted(mealId, wasCompleted)
        toast.error('No se pudo registrar la comida')
        return
      }
      if (newLogId && !logId) setData((prev) => (prev ? { ...prev, logId: newLogId, hasLog: true } : prev))
      // Espejo del router.refresh() web (:64-67): refresca kcal/macros/base del optimista.
      await load(() => false)
    } catch (e) {
      console.error(e)
      setMealCompleted(mealId, wasCompleted)
      toast.error('Error al registrar comida')
    } finally {
      setToggling(null)
    }
  }

  if (noPlan) {
    return (
      <Card padding="lg" style={{ alignItems: 'center' }}>
        <Apple size={40} color={theme.mutedForeground} strokeWidth={1.75} />
        <Text className="text-strong font-sans-bold" style={{ fontSize: 14, marginTop: 8 }}>Sin plan nutricional</Text>
        <Text className="text-muted font-sans" style={{ fontSize: 12, marginTop: 2 }}>Pídele un plan a tu coach</Text>
      </Card>
    )
  }
  if (!data) return null

  return (
    <Card padding="md" style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 }}>
          <View style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: EMBER_500 + '1A' }}>
            <Apple size={18} color={EMBER_500} strokeWidth={2.25} />
          </View>
          <View style={{ flexShrink: 1, minWidth: 0 }}>
            <Text className="text-strong font-sans-bold" numberOfLines={1} style={{ fontSize: 14 }}>{data.planName}</Text>
            <Text className="text-subtle" style={{ fontFamily: FONT.uiBold, fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>Hoy</Text>
          </View>
        </View>
        <TouchableOpacity testID="nutrition-see-all" onPress={onSeeAll} activeOpacity={0.7}>
          <Text className="text-sport-600" style={{ fontFamily: FONT.uiBold, fontSize: 11 }}>Ver todo →</Text>
        </TouchableOpacity>
      </View>

      {!data.hasLog && data.meals.length > 0 ? (
        <Text className="text-muted font-sans" style={{ fontSize: 12 }}>¡Registra tu primera comida desde nutrición!</Text>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text className="text-strong" style={{ fontFamily: FONT.displayBlack, fontSize: 27, fontVariant: ['tabular-nums'] }}>{data.consumedCal.toLocaleString('es-CL')}</Text>
          <Text className="text-muted font-sans" style={{ fontSize: 13 }}>/ {data.targetCal.toLocaleString('es-CL')} kcal</Text>
        </View>
        <Badge tone="ember" icon={<Flame size={12} color={EMBER_500} strokeWidth={2.5} />}>
          {Math.max(0, data.targetCal - data.consumedCal).toLocaleString('es-CL')} restantes
        </Badge>
      </View>

      {/* Web separa las 3 barras con space-y-2 (8px), no el gap-4 (16px) del Card. */}
      <View style={{ gap: 8 }}>
        {data.macros.map((m) => <MacroBar key={m.label} {...m} />)}
      </View>

      {/* Filas-toggle (web MealCompletionRow.tsx:92-124): boton con borde sutil + bg card,
          check 32px (success al completar), spinner mientras pende y opacity-60 en pending. */}
      <View style={{ gap: 8 }}>
        {data.meals.map((meal) => {
          const done = data.completed.has(meal.id)
          const pending = toggling === meal.id
          return (
            <TouchableOpacity
              key={meal.id}
              onPress={() => handleToggle(meal.id)}
              disabled={pending}
              activeOpacity={0.7}
              className="rounded-control border border-subtle bg-surface-card"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 8, opacity: pending ? 0.6 : 1 }}
            >
              <View
                className={done ? undefined : 'bg-surface-sunken border-strong'}
                style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? SUCCESS_500 : undefined, borderWidth: done ? 0 : 1.5 }}
              >
                {pending ? (
                  <ActivityIndicator size="small" color={done ? '#fff' : theme.mutedForeground} />
                ) : done ? (
                  <Check size={16} color="#fff" strokeWidth={3} />
                ) : null}
              </View>
              <Text className={done ? 'text-subtle' : 'text-strong'} numberOfLines={1} style={{ flex: 1, fontFamily: FONT.uiSemibold, fontSize: 14, textDecorationLine: done ? 'line-through' : 'none' }}>{meal.name}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      <TouchableOpacity
        onPress={onSeeAll}
        activeOpacity={0.82}
        className="rounded-control"
        style={{ paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: EMBER_500 + '55', backgroundColor: EMBER_500 + '1A' }}
      >
        <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: EMBER_500 }}>Ver plan completo con macros →</Text>
      </TouchableOpacity>
    </Card>
  )
}

function MacroBar({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0
  const over = target > 0 && value > target
  const rv = Math.round(value)
  const rt = Math.round(target)
  return (
    <View
      style={{ gap: 4 }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: rt, now: rv }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text className="text-muted" style={{ fontFamily: FONT.uiSemibold, fontSize: 11 }}>{label}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Text className="text-body" style={{ fontFamily: FONT.uiSemibold, fontSize: 11, fontVariant: ['tabular-nums'] }}>{rv}/{rt}g</Text>
          {over ? <AlertTriangle size={12} color={DANGER_500} strokeWidth={2.5} /> : null}
        </View>
      </View>
      <View className="bg-surface-sunken" style={{ height: 8, borderRadius: 999, overflow: 'hidden' }}>
        <View style={{ height: 8, borderRadius: 999, width: `${pct}%`, backgroundColor: over ? DANGER_500 : color }} />
      </View>
    </View>
  )
}
