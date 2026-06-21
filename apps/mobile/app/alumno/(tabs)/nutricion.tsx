import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert,
  AppState,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Apple, ArrowLeftRight, Share2 } from 'lucide-react-native'
import { supabase } from '../../../lib/supabase'
import { getClientProfile } from '../../../lib/client'
import { useOnline } from '../../../lib/use-online'
import { Accordion } from '../../../components/Accordion'
import { getTodayInSantiago, isoDateAddDays, nutritionMealApplies } from '../../../lib/date-utils'
import {
  applyMealFoodSwaps,
  buildSwapMapForMeal,
  applyMealFoodSwap as applyMealFoodSwapMutation,
  clearMealFoodSwap,
  type MealFoodSwapApplied,
} from '../../../lib/nutrition-swaps'
import {
  calculateConsumedMacrosWithCompletionFallback,
  normalizeMealForMacros,
  portionPctMapFromMealLogs,
} from '../../../lib/nutrition-utils'
import type { MealWithFoodItems } from '../../../lib/nutrition-utils'
import {
  getActiveNutritionPlanFull,
  getNutritionAdherence30d,
  getNutritionLogForDate,
  toggleMealCompletion,
  updateMealConsumedPortion,
  updateMealSatisfaction,
} from '../../../lib/nutrition.queries'
import {
  enqueueNutritionToggle,
  flushNutritionQueue,
} from '../../../lib/offline-cache'
import { useTheme } from '../../../context/ThemeContext'
import {
  AdherenceStrip,
  DayNavigator,
  EmptyState,
  HabitsTracker,
  MacroRingSummary,
  MealCardExpandable,
  OfflineBanner,
  ProgressBar,
  ScreenHeader,
  WorkoutContextBanner,
} from '../../../components'
import {
  ExchangeEquivalencesSheet,
  ExchangeMealChips,
  FoodSwapSheet,
  MicrosPanel,
  NotesThread,
  OffPlanLogger,
  PlatePanel,
  RecipeIdeasSection,
  ShoppingListView,
  WeeklyRecapCard,
  type NotesThreadComment,
} from '../../../components/nutrition'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AppBackground } from '../../../components/AppBackground'
import { getDailyHabits } from '../../../lib/habits.queries'
import type { HabitsData } from '../../../lib/habits.queries'
import { readNutritionCache, writeNutritionCache } from '../../../lib/nutrition-offline-cache'
// ─── Overhaul de nutrición (paridad con la web post-2026-06) ──────────────────
import {
  resolveStudentNutritionPrefs,
  ALL_SECTIONS_VISIBLE,
  type SectionFlags,
} from '../../../lib/nutrition-sections'
import {
  getStudentExchangeBundle,
  macrosForTargets,
  EMPTY_EXCHANGE_BUNDLE,
  type ExchangeGroup,
  type StudentExchangeBundle,
} from '../../../lib/nutrition-exchanges'
import {
  getPlanDayMicros,
  getMicroTargetsForClient,
  platePropFromMacros,
  type DayMicros,
  type MicroTargets,
  type PlateProportion,
} from '../../../lib/nutrition-micros'
import { getAssignedRecipesForClient } from '../../../lib/nutrition-recipes-client'
import type { RecipeRow } from '../../../lib/recipes'
import { getRecentIntakeFoods, type IntakeFoodRef } from '../../../lib/nutrition-intake'
import { listMealComments, addMealComment } from '../../../lib/nutrition-notes'
import { computeWeeklyRecap, type WeeklyRecap } from '../../../lib/nutrition-recap'

// ─── Types ──────────────────────────────────────────────────────────────────

interface NutritionPlan {
  id: string
  name: string
  daily_calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fats_g: number | null
  instructions: string | null
  coach_id: string | null
  nutrition_meals: RawMeal[]
}

interface RawMeal {
  id: string
  name: string
  description: string | null
  order_index: number
  day_of_week: number | null
  nutrition_meal_food_items: RawFoodItem[]
}

interface RawFoodItem {
  id: string
  quantity: number
  unit: string | null
  swap_options: unknown
  foods: {
    id: string
    name: string
    calories: number
    protein_g: number
    carbs_g: number
    fats_g: number
    serving_size: number
    serving_unit: string | null
  } | null
}

interface DailyLog {
  id: string
  log_date: string
  target_calories_at_log: number | null
  target_protein_at_log: number | null
  target_carbs_at_log: number | null
  target_fats_at_log: number | null
  nutrition_meal_logs: {
    id: string
    meal_id: string
    is_completed: boolean
    consumed_quantity: number | null
    satisfaction_score: number | null
  }[]
  nutrition_meal_food_swaps: MealFoodSwapApplied[]
}

interface AdherenceDay {
  log_date: string
  nutrition_meal_logs: { meal_id: string; is_completed: boolean }[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildShareText(
  plan: NutritionPlan,
  mealsForDay: RawMeal[],
  completedIds: Set<string>,
  dateLabel: string
): string {
  const completedMeals = mealsForDay.filter((m) => completedIds.has(m.id))
  const lines = [
    `*${plan.name}* — ${dateLabel}`,
    `✅ ${completedIds.size}/${mealsForDay.length} comidas`,
    '',
    ...completedMeals.map((m) => `• ${m.name}`),
  ]
  return lines.join('\n')
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function AlumnoNutricionScreen() {
  const { theme } = useTheme()
  const { iso: todayIso } = getTodayInSantiago()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const onReconnect = useCallback(() => { flushNutritionQueue(supabase).catch(() => {}) }, [])
  const isOnline = useOnline(onReconnect)
  const [plan, setPlan] = useState<NutritionPlan | null>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(todayIso)
  const [currentLog, setCurrentLog] = useState<DailyLog | null>(null)
  const [adherence, setAdherence] = useState<AdherenceDay[]>([])
  const [isDateLoading, setIsDateLoading] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [hasTodayWorkout, setHasTodayWorkout] = useState(false)
  const [habits, setHabits] = useState<HabitsData | null>(null)

  // ─── Overhaul state ──────────────────────────────────────────────────────────
  const [sectionFlags, setSectionFlags] = useState<SectionFlags>(ALL_SECTIONS_VISIBLE)
  const [domainEnabled, setDomainEnabled] = useState(true)
  const [nutritionProEnabled, setNutritionProEnabled] = useState(false)
  const [exchange, setExchange] = useState<StudentExchangeBundle>(EMPTY_EXCHANGE_BUNDLE)
  const [dayMicros, setDayMicros] = useState<DayMicros | null>(null)
  const [microTargets, setMicroTargets] = useState<MicroTargets>({})
  const [plateProportion, setPlateProportion] = useState<PlateProportion | null>(null)
  const [recipes, setRecipes] = useState<RecipeRow[]>([])
  const [offPlanRecents, setOffPlanRecents] = useState<IntakeFoodRef[]>([])
  const [notes, setNotes] = useState<NotesThreadComment[]>([])
  const [weeklyRecap, setWeeklyRecap] = useState<WeeklyRecap | null>(null)
  // Sheets
  const [equivalenceGroup, setEquivalenceGroup] = useState<ExchangeGroup | null>(null)
  const [swapMealId, setSwapMealId] = useState<string | null>(null)
  const [swapPending, setSwapPending] = useState<string | null>(null)

  const appStateRef = useRef(AppState.currentState)

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'active' && appStateRef.current !== 'active') {
        if (isOnline && clientId && plan) {
          await flushNutritionQueue(supabase)
        }
      }
      appStateRef.current = state
    })
    return () => sub.remove()
  }, [isOnline, clientId, plan])

  useEffect(() => {
    load().catch(() => setLoading(false))
  }, [])

  async function load() {
    setLoading(true)
    const client = await getClientProfile()
    if (!client) { setLoading(false); return }
    setClientId(client.id)

    const { data: planData } = await getActiveNutritionPlanFull(client.id)

    if (!planData) {
      const cached = await readNutritionCache('active')
      if (cached?.plan) {
        setPlan(cached.plan as unknown as NutritionPlan)
        setCurrentLog(cached.dailyLog as unknown as DailyLog | null)
        setAdherence((cached.adherence as unknown as AdherenceDay[]) ?? [])
      }
      setLoading(false)
      setRefreshing(false)
      return
    }

    setPlan(planData as unknown as NutritionPlan)

    const planCoachId = (planData as any).coach_id ?? null
    const since30 = isoDateAddDays(todayIso, -30)

    // Resolver de feature-prefs / entitlement primero: gobierna que mas cargar.
    const prefs = await resolveStudentNutritionPrefs(planCoachId, client.id)
    setSectionFlags(prefs.sections)
    setDomainEnabled(prefs.domainEnabled)
    setNutritionProEnabled(prefs.nutritionProEnabled)

    // Plan mode (para intercambios) — no viene en getActiveNutritionPlanFull.
    const { data: planModeRow } = await supabase
      .from('nutrition_plans')
      .select('plan_mode')
      .eq('id', planData.id)
      .maybeSingle()
    const planMode = (planModeRow as any)?.plan_mode ?? 'grams'

    const [
      logResult,
      adherenceResult,
      habitsResult,
      workoutResult,
      exchangeBundle,
      micros,
      targets,
      recipesData,
      recents,
      notesData,
    ] = await Promise.all([
      getNutritionLogForDate(client.id, planData.id, todayIso),
      getNutritionAdherence30d(client.id, planData.id, since30),
      getDailyHabits(client.id, todayIso),
      supabase
        .from('workout_programs')
        .select('id, workout_plans ( id, day_of_week, assigned_date )')
        .eq('client_id', client.id)
        .eq('is_active', true)
        .maybeSingle(),
      prefs.nutritionProEnabled
        ? getStudentExchangeBundle({
            planId: planData.id,
            planCoachId,
            planMode,
            nutritionProEnabled: prefs.nutritionProEnabled,
          })
        : Promise.resolve(EMPTY_EXCHANGE_BUNDLE),
      prefs.sections.micros_base || prefs.sections.micros_advanced
        ? getPlanDayMicros(client.id, planData.id, todayIso)
        : Promise.resolve(null),
      prefs.sections.micros_base || prefs.sections.micros_advanced
        ? getMicroTargetsForClient(planCoachId, client.id)
        : Promise.resolve({} as MicroTargets),
      prefs.sections.recipes ? getAssignedRecipesForClient(client.id) : Promise.resolve([] as RecipeRow[]),
      prefs.sections.off_plan_log ? getRecentIntakeFoods(client.id, 10) : Promise.resolve([] as IntakeFoodRef[]),
      prefs.sections.notes ? listMealComments(client.id, todayIso) : Promise.resolve([]),
    ])

    setCurrentLog(logResult.data as unknown as DailyLog | null)
    const adherenceRows = (adherenceResult.data ?? []) as unknown as AdherenceDay[]
    setAdherence(adherenceRows)
    setHabits(habitsResult)
    setExchange(exchangeBundle)
    setDayMicros(micros)
    setMicroTargets(targets)
    setRecipes(recipesData)
    setOffPlanRecents(recents)
    setNotes(toNotesComments(notesData))

    // Plate + weekly recap (puros sobre data ya cargada).
    if (prefs.sections.plate) {
      setPlateProportion(platePropFromMacros((planData as any).protein_g ?? 0, (planData as any).carbs_g ?? 0))
    } else {
      setPlateProportion(null)
    }
    setWeeklyRecap(
      computeWeeklyRecap(
        adherenceRows,
        ((planData as any).nutrition_meals ?? []).map((m: any) => ({ id: m.id, day_of_week: m.day_of_week })),
        todayIso
      )
    )

    if (workoutResult.data?.workout_plans) {
      const today = new Date().getDay() === 0 ? 7 : new Date().getDay()
      const plans = workoutResult.data.workout_plans as any[]
      setHasTodayWorkout(plans.some((p) => p.day_of_week === today || p.assigned_date === todayIso))
    }

    writeNutritionCache('active', {
      today: todayIso,
      plan: planData,
      adherence: adherenceResult.data ?? [],
      dailyLog: logResult.data ?? null,
      clientUserId: client.userId,
    })

    setLoading(false)
    setRefreshing(false)
  }

  async function onRefresh() {
    setRefreshing(true)
    await load()
  }

  const fetchLogForDate = useCallback(async (date: string) => {
    if (!clientId || !plan) return
    setIsDateLoading(true)
    const { data } = await getNutritionLogForDate(clientId, plan.id, date)
    setCurrentLog(data as unknown as DailyLog | null)
    // Notas del dia seleccionado (si la seccion esta visible).
    if (sectionFlags.notes) {
      const dayNotes = await listMealComments(clientId, date)
      setNotes(toNotesComments(dayNotes))
    }
    setIsDateLoading(false)
  }, [clientId, plan, sectionFlags.notes])

  async function handleDateChange(date: string) {
    setSelectedDate(date)
    await fetchLogForDate(date)
  }

  async function handleToggle(mealId: string, isCompleted: boolean) {
    if (!clientId || !plan || toggling) return
    setToggling(mealId)

    const newCompleted = !isCompleted
    const logId = currentLog?.id ?? null

    if (newCompleted) {
      setCurrentLog((prev) => {
        if (!prev) return prev
        const exists = prev.nutrition_meal_logs.some((l) => l.meal_id === mealId)
        if (exists) return { ...prev, nutrition_meal_logs: prev.nutrition_meal_logs.map((l) => l.meal_id === mealId ? { ...l, is_completed: true } : l) }
        return { ...prev, nutrition_meal_logs: [...prev.nutrition_meal_logs, { id: '', meal_id: mealId, is_completed: true, consumed_quantity: null, satisfaction_score: null }] }
      })
    } else {
      setCurrentLog((prev) => {
        if (!prev) return prev
        return { ...prev, nutrition_meal_logs: prev.nutrition_meal_logs.filter((l) => l.meal_id !== mealId) }
      })
    }

    if (!isOnline) {
      await enqueueNutritionToggle({ clientId, planId: plan.id, mealId, completed: newCompleted, logId: logId ?? undefined, date: selectedDate })
      setToggling(null)
      return
    }

    const { success, logId: newLogId } = await toggleMealCompletion(
      clientId, plan.id, mealId, newCompleted, logId, selectedDate
    )

    if (!success) {
      await enqueueNutritionToggle({ clientId, planId: plan.id, mealId, completed: newCompleted, logId: logId ?? undefined, date: selectedDate })
    } else if (newLogId && !currentLog?.id) {
      setCurrentLog((prev) => prev ? { ...prev, id: newLogId } : null)
    }

    setToggling(null)
  }

  async function handleSatisfaction(mealId: string, score: 1 | 2 | 3 | null) {
    if (!currentLog) return
    setCurrentLog((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        nutrition_meal_logs: prev.nutrition_meal_logs.map((l) =>
          l.meal_id === mealId ? { ...l, satisfaction_score: score } : l
        ),
      }
    })
    await updateMealSatisfaction(currentLog.id, mealId, score)
  }

  async function handlePortion(mealId: string, pct: number) {
    if (!currentLog?.id) return
    setCurrentLog((prev) => prev ? {
      ...prev,
      nutrition_meal_logs: prev.nutrition_meal_logs.map((l) => l.meal_id === mealId ? { ...l, consumed_quantity: pct } : l),
    } : prev)
    await updateMealConsumedPortion(currentLog.id, mealId, pct)
  }

  // ─── Food swap (modo gramos) ───────────────────────────────────────────────
  async function handleApplySwap(mealId: string, originalFoodId: string, swappedFoodId: string) {
    if (!clientId || !plan) return
    setSwapPending(originalFoodId)
    // El swap exige un daily_log: si no existe, crearlo via toggle silencioso del log.
    let dailyLogId = currentLog?.id ?? null
    if (!dailyLogId) {
      const { logId } = await toggleMealCompletion(clientId, plan.id, mealId, false, null, selectedDate)
      dailyLogId = logId
      if (dailyLogId) setCurrentLog((prev) => prev ? { ...prev, id: dailyLogId! } : prev)
    }
    const res = await applyMealFoodSwapMutation({ clientId, dailyLogId, mealId, originalFoodId, swappedFoodId })
    setSwapPending(null)
    if (!res.success) {
      Alert.alert('Intercambio', res.error ?? 'No se pudo aplicar el intercambio.')
      return
    }
    // Refrescar el log del dia para traer la fila de swap.
    const { data } = await getNutritionLogForDate(clientId, plan.id, selectedDate)
    setCurrentLog(data as unknown as DailyLog | null)
  }

  async function handleRevertSwap(mealId: string, originalFoodId: string) {
    if (!clientId || !plan) return
    setSwapPending(originalFoodId)
    const res = await clearMealFoodSwap({ clientId, dailyLogId: currentLog?.id ?? null, mealId, originalFoodId })
    setSwapPending(null)
    if (!res.success) {
      Alert.alert('Intercambio', res.error ?? 'No se pudo revertir el intercambio.')
      return
    }
    const { data } = await getNutritionLogForDate(clientId, plan.id, selectedDate)
    setCurrentLog(data as unknown as DailyLog | null)
  }

  async function handleAddNote(body: string) {
    if (!clientId) return
    const res = await addMealComment({ clientId, logDate: selectedDate, body })
    if (!res.ok) {
      Alert.alert('Notas', res.error ?? 'No se pudo enviar la nota.')
      return
    }
    // Refrescar el hilo del dia.
    const dayNotes = await listMealComments(clientId, selectedDate)
    setNotes(toNotesComments(dayNotes))
  }

  async function handleShare() {
    if (!plan || !mealsForDay) return
    const completedIds = new Set(
      (currentLog?.nutrition_meal_logs ?? [])
        .filter((l) => l.is_completed)
        .map((l) => l.meal_id)
    )
    const text = buildShareText(plan, mealsForDay, completedIds, selectedDate === todayIso ? 'Hoy' : selectedDate)
    await Share.share({ message: text })
  }

  const refreshOffPlanRecents = useCallback(() => {
    if (!clientId) return
    getRecentIntakeFoods(clientId, 10).then(setOffPlanRecents).catch(() => {})
  }, [clientId])

  // ─── Derived state ─────────────────────────────────────────────────────────

  const mealsForDay: RawMeal[] = (plan?.nutrition_meals ?? [])
    .filter((m) => nutritionMealApplies(m, selectedDate))
    .sort((a, b) => a.order_index - b.order_index)

  const mealLogs = currentLog?.nutrition_meal_logs ?? []
  const swapRows = currentLog?.nutrition_meal_food_swaps ?? []
  const completedMealIds = new Set(mealLogs.filter((l) => l.is_completed).map((l) => l.meal_id))
  const portionMap = portionPctMapFromMealLogs(mealLogs)

  // Mapa originalFoodId->swappedFoodId activo por comida (para el FoodSwapSheet + badge).
  const activeSwapByMeal = useMemo(() => {
    const m = new Map<string, Map<string, string>>()
    for (const s of swapRows) {
      const inner = m.get(s.meal_id) ?? new Map<string, string>()
      inner.set(s.original_food_id, s.swapped_food_id)
      m.set(s.meal_id, inner)
    }
    return m
  }, [swapRows])

  // Comidas normalizadas con swaps aplicados (badge + macros reflejan el intercambio).
  const normalizedMeals: (MealWithFoodItems & { name: string; description: string | null })[] = mealsForDay.map((m) => {
    const base = normalizeMealForMacros({ id: m.id, day_of_week: m.day_of_week, food_items: m.nutrition_meal_food_items })
    const swapMap = buildSwapMapForMeal(base, swapRows)
    const withSwaps = applyMealFoodSwaps(base, swapMap)
    return { ...withSwaps, name: m.name, description: m.description }
  })

  // Items ORIGINALES por comida (para el sheet de swap — necesita swap_options sin aplicar).
  const originalMealsById = useMemo(() => {
    const m = new Map<string, MealWithFoodItems>()
    for (const meal of mealsForDay) {
      m.set(meal.id, normalizeMealForMacros({ id: meal.id, day_of_week: meal.day_of_week, food_items: meal.nutrition_meal_food_items }))
    }
    return m
  }, [mealsForDay])

  const goals = {
    calories: plan?.daily_calories ?? 0,
    protein: plan?.protein_g ?? 0,
    carbs: plan?.carbs_g ?? 0,
    fats: plan?.fats_g ?? 0,
  }

  const consumed = calculateConsumedMacrosWithCompletionFallback(
    normalizedMeals, completedMealIds, goals, portionMap
  )

  const adherenceDates = new Set(adherence.map((a) => a.log_date))
  const completedCount = completedMealIds.size
  const totalCount = mealsForDay.length
  const isToday = selectedDate === todayIso

  const variantNameById = useMemo(
    () => new Map((exchange.variants ?? []).map((v) => [v.id, v.name])),
    [exchange.variants]
  )

  // ─── Streak ────────────────────────────────────────────────────────────────
  let streak = 0
  if (adherence.length > 0 && plan) {
    let cursor = isoDateAddDays(todayIso, -1)
    for (let i = 0; i < 60; i++) {
      const dayMeals = (plan.nutrition_meals ?? []).filter((m) => nutritionMealApplies(m, cursor))
      if (dayMeals.length === 0) { cursor = isoDateAddDays(cursor, -1); continue }
      const logDay = adherence.find((a) => a.log_date === cursor)
      if (!logDay) break
      const completedDay = logDay.nutrition_meal_logs.filter((l) => l.is_completed).length
      if (completedDay / dayMeals.length < 0.5) break
      streak++
      cursor = isoDateAddDays(cursor, -1)
    }
  }

  const microsVisible = sectionFlags.micros_base || sectionFlags.micros_advanced

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <AppBackground />
        <ScreenHeader title="Nutrición" subtitle="Tu plan personalizado" />
        <EvaLoaderScreen subtitle="Cargando nutrición…" />
      </SafeAreaView>
    )
  }

  // Dominio apagado por el coach => ocultar TODA la nutricion (nunca blanco).
  if (plan && !domainEnabled) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <AppBackground />
        <ScreenHeader title="Nutrición" subtitle="Tu plan personalizado" />
        <EmptyState icon={Apple} title="Nutrición no disponible" subtitle="Tu coach desactivó la sección de nutrición por ahora." />
      </SafeAreaView>
    )
  }

  if (!plan) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <AppBackground />
        <ScreenHeader title="Nutrición" subtitle="Tu plan personalizado" />
        <EmptyState icon={Apple} title="Sin plan activo" subtitle="Tu coach aún no te asignó un plan de nutrición." />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <AppBackground />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScreenHeader
          title="Nutrición"
          subtitle={plan.name}
          trailing={
            <TouchableOpacity onPress={handleShare} style={styles.shareBtn} activeOpacity={0.75} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Share2 size={18} color={theme.foreground} strokeWidth={2} />
            </TouchableOpacity>
          }
        />

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />}
        >
          {!isOnline && <OfflineBanner visible />}

          <WorkoutContextBanner visible={hasTodayWorkout && isToday} />

          {/* Recap semanal (feature K) — motivacional, read-only. */}
          {weeklyRecap && <WeeklyRecapCard recap={weeklyRecap} />}

          <DayNavigator
            selectedDate={selectedDate}
            onDateChange={handleDateChange}
            adherenceDates={adherenceDates}
            isLoading={isDateLoading}
          />

          {!isToday && (
            <View style={[styles.readOnlyBanner, { backgroundColor: theme.secondary, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
              <Text style={[styles.readOnlyText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                Día histórico — solo lectura
              </Text>
            </View>
          )}

          {streak >= 2 && (
            <View style={[styles.streakBanner, { backgroundColor: '#f97316' + '1A', borderColor: '#f97316' + '40', borderRadius: theme.radius.lg }]}>
              <Text style={[styles.streakText, { color: '#f97316', fontFamily: 'Montserrat_700Bold' }]}>
                🔥 {streak} días de racha
              </Text>
            </View>
          )}

          <MacroRingSummary
            calories={{ consumed: consumed.calories, target: goals.calories }}
            protein={{ consumed: consumed.protein, target: goals.protein }}
            carbs={{ consumed: consumed.carbs, target: goals.carbs }}
            fats={{ consumed: consumed.fats, target: goals.fats }}
            isReadOnly={!isToday}
          />

          {totalCount > 0 && (
            <View style={styles.progressRow}>
              <Text style={[styles.progressLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                {completedCount}/{totalCount} comidas completadas
              </Text>
              <ProgressBar value={totalCount > 0 ? completedCount / totalCount : 0} color={theme.success} height={6} />
            </View>
          )}

          {/* Micros (sodio/fibra + avanzados Pro) — colapsable. */}
          {microsVisible && (
            <MicrosPanel
              sodiumMg={dayMicros?.sodiumMg ?? null}
              fiberG={dayMicros?.fiberG ?? null}
              sugarG={dayMicros?.sugarG ?? null}
              saturatedFatG={dayMicros?.saturatedFatG ?? null}
              unsaturatedFatG={dayMicros?.unsaturatedFatG ?? null}
              sodiumTarget={microTargets.sodium}
              fiberTarget={microTargets.fiber}
              sugarTarget={microTargets.sugar}
              saturatedFatTarget={microTargets.saturatedFat}
              unsaturatedFatTarget={microTargets.unsaturatedFat}
              proEnabled={nutritionProEnabled && sectionFlags.micros_advanced}
            />
          )}

          {/* Metodo del plato. */}
          {sectionFlags.plate && plateProportion && <PlatePanel proportion={plateProportion} />}

          {plan?.instructions ? (
            <View style={{ marginTop: 4 }}>
              <Accordion question="Indicaciones del coach" answer={plan.instructions} defaultOpen />
            </View>
          ) : null}

          {mealsForDay.length === 0 ? (
            <View style={styles.noMeals}>
              <Apple size={22} color={theme.mutedForeground} />
              <Text style={[styles.noMealsText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Sin comidas para este día</Text>
            </View>
          ) : (
            normalizedMeals.map((meal) => {
              const mealLog = mealLogs.find((l) => l.meal_id === meal.id)
              const mealTargets = exchange.enabled ? (exchange.targetsByMealId[meal.id] ?? []) : []
              const hasExchangeTargets = mealTargets.length > 0
              const derived = hasExchangeTargets ? macrosForTargets(mealTargets, exchange.groups) : null
              const mealVariantId = exchange.enabled ? (exchange.variantByMealId[meal.id] ?? null) : null
              const variantName = mealVariantId ? variantNameById.get(mealVariantId) : null
              const original = originalMealsById.get(meal.id)
              const hasSwapOptions = (original?.food_items ?? []).some((fi) => (fi.swap_options ?? []).length > 0)
              const activeSwapMealIds = new Set(
                [...(activeSwapByMeal.get(meal.id)?.keys() ?? [])]
              )
              return (
                <View key={meal.id} style={styles.mealBlock}>
                  <MealCardExpandable
                    meal={meal}
                    isCompleted={completedMealIds.has(meal.id)}
                    isToday={isToday}
                    isToggling={toggling === meal.id}
                    satisfactionScore={mealLog?.satisfaction_score ?? null}
                    consumedPct={mealLog?.consumed_quantity ?? null}
                    activeSwapMealIds={activeSwapMealIds}
                    onToggle={() => handleToggle(meal.id, completedMealIds.has(meal.id))}
                    onSatisfaction={(score) => handleSatisfaction(meal.id, score)}
                    onPortionChange={(pct) => handlePortion(meal.id, pct)}
                  />

                  {/* Chips de intercambios (Nutricion Pro) — debajo de la comida. */}
                  {exchange.enabled && hasExchangeTargets && (
                    <View style={styles.exchangeRow}>
                      {variantName && (
                        <View style={[styles.variantBadge, { backgroundColor: theme.secondary }]}>
                          <Text style={[styles.variantText, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>
                            {variantName}
                          </Text>
                        </View>
                      )}
                      <ExchangeMealChips targets={mealTargets} groups={exchange.groups} onChipTap={setEquivalenceGroup} />
                      {derived && (
                        <Text style={[styles.derivedMacros, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                          ≈ {Math.round(derived.calories)} kcal · P {Math.round(derived.proteinG)}g · C {Math.round(derived.carbsG)}g · G {Math.round(derived.fatsG)}g
                        </Text>
                      )}
                    </View>
                  )}

                  {/* Intercambiar alimento (modo gramos) — solo hoy + si el coach configuro alternativas. */}
                  {isToday && hasSwapOptions && (
                    <TouchableOpacity
                      onPress={() => setSwapMealId(meal.id)}
                      activeOpacity={0.75}
                      style={[styles.swapTrigger, { borderColor: theme.border }]}
                    >
                      <ArrowLeftRight size={13} color={theme.primary} />
                      <Text style={[styles.swapTriggerText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>
                        Intercambiar alimento
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )
            })
          )}

          {/* Registro fuera de plan (off-plan) — solo hoy. */}
          {sectionFlags.off_plan_log && isToday && clientId && (
            <OffPlanLogger
              clientId={clientId}
              recents={offPlanRecents.map((f) => ({ id: f.id, name: f.name }))}
              today={todayIso}
              onLogged={refreshOffPlanRecents}
            />
          )}

          {sectionFlags.habits && clientId && (
            <HabitsTracker
              clientId={clientId}
              logDate={selectedDate}
              isToday={isToday}
              initialData={habits}
            />
          )}

          {/* Notas del dia (hilo bidireccional). */}
          {sectionFlags.notes && (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
              <Text style={[styles.cardTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Notas del día</Text>
              <NotesThread
                comments={notes}
                onSubmit={handleAddNote}
                emptyHint="Escribe una nota a tu coach sobre tu día (antojos, cómo te sentiste, dudas)."
              />
            </View>
          )}

          {/* Lista de compras — colapsable. */}
          {sectionFlags.shopping && clientId && (
            <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
              <ShoppingListView clientId={clientId} />
            </View>
          )}

          {/* Ideas de recetas (feature L). */}
          {sectionFlags.recipes && <RecipeIdeasSection recipes={recipes} />}

          <AdherenceStrip
            adherence={adherence}
            planMeals={plan.nutrition_meals.map((m) => ({ id: m.id, day_of_week: m.day_of_week }))}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sheet de equivalencias (Nutricion Pro). */}
      <ExchangeEquivalencesSheet
        group={equivalenceGroup}
        equivalences={exchange.equivalences}
        onClose={() => setEquivalenceGroup(null)}
      />

      {/* Sheet de intercambio de alimentos (modo gramos). */}
      <FoodSwapSheet
        visible={swapMealId !== null}
        mealName={mealsForDay.find((m) => m.id === swapMealId)?.name ?? ''}
        foodItems={swapMealId ? (originalMealsById.get(swapMealId)?.food_items ?? []) : []}
        activeSwaps={swapMealId ? (activeSwapByMeal.get(swapMealId) ?? new Map()) : new Map()}
        pendingFoodId={swapPending}
        onApply={(orig, swapped) => swapMealId && handleApplySwap(swapMealId, orig, swapped)}
        onRevert={(orig) => swapMealId && handleRevertSwap(swapMealId, orig)}
        onClose={() => setSwapMealId(null)}
      />
    </SafeAreaView>
  )
}

/** Mapea filas de comentarios DB al shape del hilo. */
function toNotesComments(
  rows: { id: string; author_role: 'coach' | 'client'; body: string; created_at: string }[]
): NotesThreadComment[] {
  return rows.map((c) => ({
    id: c.id,
    author_role: c.author_role === 'coach' ? 'coach' : 'client',
    body: c.body,
    created_at: c.created_at,
  }))
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingBottom: 40, gap: 12 },
  shareBtn: { padding: 8 },
  readOnlyBanner: {
    borderWidth: 1,
    paddingVertical: 8,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  readOnlyText: { fontSize: 13 },
  streakBanner: {
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  streakText: { fontSize: 14 },
  progressRow: { gap: 6 },
  progressLabel: { fontSize: 12 },
  noMeals: { paddingVertical: 32, alignItems: 'center', gap: 8 },
  noMealsText: { fontSize: 13 },
  mealBlock: { gap: 6 },
  exchangeRow: { gap: 4, paddingHorizontal: 2 },
  variantBadge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  variantText: { fontSize: 9, letterSpacing: 0.5, textTransform: 'uppercase' },
  derivedMacros: { fontSize: 11, marginTop: 2 },
  swapTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginLeft: 2,
  },
  swapTriggerText: { fontSize: 11 },
  card: { borderWidth: 1, padding: 16, gap: 10 },
  cardTitle: { fontSize: 14 },
})
