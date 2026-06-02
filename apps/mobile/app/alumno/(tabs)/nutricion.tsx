import { useCallback, useEffect, useRef, useState } from 'react'
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
import { Apple, Share2 } from 'lucide-react-native'
import { supabase } from '../../../lib/supabase'
import { getClientProfile } from '../../../lib/client'
import { getTodayInSantiago, isoDateAddDays, nutritionMealApplies } from '../../../lib/date-utils'
import {
  calculateConsumedMacrosWithCompletionFallback,
  normalizeMealForMacros,
  portionPctMapFromMealLogs,
  sumMealMacros,
} from '../../../lib/nutrition-utils'
import type { MealWithFoodItems } from '../../../lib/nutrition-utils'
import {
  getActiveNutritionPlanFull,
  getNutritionAdherence30d,
  getNutritionLogForDate,
  toggleMealCompletion,
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
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { SafeAreaView } from 'react-native-safe-area-context'
import { getDailyHabits } from '../../../lib/habits.queries'
import type { HabitsData } from '../../../lib/habits.queries'
import { readNutritionCache, writeNutritionCache } from '../../../lib/nutrition-offline-cache'

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
  nutrition_meal_food_swaps: {
    meal_id: string
    original_food_id: string
    swapped_food_id: string
    swapped_quantity: number | null
    swapped_unit: string | null
  }[]
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
  const [isOnline, setIsOnline] = useState(true)
  const [plan, setPlan] = useState<NutritionPlan | null>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(todayIso)
  const [currentLog, setCurrentLog] = useState<DailyLog | null>(null)
  const [adherence, setAdherence] = useState<AdherenceDay[]>([])
  const [isDateLoading, setIsDateLoading] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [hasTodayWorkout, setHasTodayWorkout] = useState(false)
  const [habits, setHabits] = useState<HabitsData | null>(null)

  const appStateRef = useRef(AppState.currentState)

  // Auto-flush nutrition queue on app foreground
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
    load()
  }, [])

  async function load() {
    setLoading(true)
    const client = await getClientProfile()
    if (!client) { setLoading(false); return }
    setClientId(client.id)

    const { data: planData } = await getActiveNutritionPlanFull(client.id)

    if (!planData) {
      // Try reading from cache when offline
      const cached = await readNutritionCache('active')
      if (cached?.plan) {
        setPlan(cached.plan as unknown as NutritionPlan)
        setCurrentLog(cached.dailyLog as unknown as DailyLog | null)
        setAdherence((cached.adherence as unknown as AdherenceDay[]) ?? [])
        setIsOnline(false)
      }
      setLoading(false)
      setRefreshing(false)
      return
    }

    setPlan(planData as unknown as NutritionPlan)

    const since30 = isoDateAddDays(todayIso, -30)
    const [logResult, adherenceResult, habitsResult, workoutResult] = await Promise.all([
      getNutritionLogForDate(client.id, planData.id, todayIso),
      getNutritionAdherence30d(client.id, planData.id, since30),
      getDailyHabits(client.id, todayIso),
      supabase
        .from('workout_programs')
        .select('id, workout_plans ( id, day_of_week, assigned_date )')
        .eq('client_id', client.id)
        .eq('is_active', true)
        .maybeSingle(),
    ])

    setCurrentLog(logResult.data as unknown as DailyLog | null)
    setAdherence((adherenceResult.data ?? []) as unknown as AdherenceDay[])
    setHabits(habitsResult)

    if (workoutResult.data?.workout_plans) {
      const today = new Date().getDay() === 0 ? 7 : new Date().getDay()
      const plans = workoutResult.data.workout_plans as any[]
      setHasTodayWorkout(plans.some((p) => p.day_of_week === today || p.assigned_date === todayIso))
    }

    // Write fresh data to cache for offline use
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
    setIsDateLoading(false)
  }, [clientId, plan])

  async function handleDateChange(date: string) {
    setSelectedDate(date)
    await fetchLogForDate(date)
  }

  async function handleToggle(mealId: string, isCompleted: boolean) {
    if (!clientId || !plan || toggling) return
    setToggling(mealId)

    const newCompleted = !isCompleted
    const logId = currentLog?.id ?? null

    // Optimistic update
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
      Alert.alert('Error', 'No se pudo guardar. Intenta de nuevo.')
      await fetchLogForDate(selectedDate)
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

  // ─── Derived state ─────────────────────────────────────────────────────────

  const mealsForDay: RawMeal[] = (plan?.nutrition_meals ?? [])
    .filter((m) => nutritionMealApplies(m, selectedDate))
    .sort((a, b) => a.order_index - b.order_index)

  const mealLogs = currentLog?.nutrition_meal_logs ?? []
  const completedMealIds = new Set(mealLogs.filter((l) => l.is_completed).map((l) => l.meal_id))
  const portionMap = portionPctMapFromMealLogs(mealLogs)

  const normalizedMeals: (MealWithFoodItems & { name: string; description: string | null })[] = mealsForDay.map((m) => ({
    ...normalizeMealForMacros({ id: m.id, day_of_week: m.day_of_week, food_items: m.nutrition_meal_food_items }),
    name: m.name,
    description: m.description,
  }))

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

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <ScreenHeader title="Nutrición" subtitle="Tu plan personalizado" />
        <EvaLoaderScreen subtitle="Cargando nutrición…" />
      </SafeAreaView>
    )
  }

  if (!plan) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <ScreenHeader title="Nutrición" subtitle="Tu plan personalizado" />
        <EmptyState icon={Apple} title="Sin plan activo" subtitle="Tu coach aún no te asignó un plan de nutrición." />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} />}
        >
          {!isOnline && <OfflineBanner visible />}

          <WorkoutContextBanner visible={hasTodayWorkout && isToday} />

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

          {mealsForDay.length === 0 ? (
            <View style={styles.noMeals}>
              <Apple size={22} color={theme.mutedForeground} />
              <Text style={[styles.noMealsText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Sin comidas para este día</Text>
            </View>
          ) : (
            normalizedMeals.map((meal) => {
              const mealLog = mealLogs.find((l) => l.meal_id === meal.id)
              return (
                <MealCardExpandable
                  key={meal.id}
                  meal={meal}
                  isCompleted={completedMealIds.has(meal.id)}
                  isToday={isToday}
                  isToggling={toggling === meal.id}
                  satisfactionScore={mealLog?.satisfaction_score ?? null}
                  onToggle={() => handleToggle(meal.id, completedMealIds.has(meal.id))}
                  onSatisfaction={(score) => handleSatisfaction(meal.id, score)}
                />
              )
            })
          )}

          {clientId && (
            <HabitsTracker
              clientId={clientId}
              logDate={selectedDate}
              isToday={isToday}
              initialData={habits}
            />
          )}

          <AdherenceStrip
            adherence={adherence}
            planMeals={plan.nutrition_meals.map((m) => ({ id: m.id, day_of_week: m.day_of_week }))}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
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
})
