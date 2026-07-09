import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AppState,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { supabase } from '../../../lib/supabase'
import { getClientProfile } from '../../../lib/client'
import { useOnline } from '../../../lib/use-online'
import { Accordion } from '../../../components/Accordion'
import { FONT } from '../../../lib/typography'
import { getTodayInSantiago, isoDateAddDays, nutritionMealApplies } from '../../../lib/date-utils'
import {
  calculateConsumedMacrosWithCompletionFallback,
  portionPctMapFromMealLogs,
} from '../../../lib/nutrition-utils'
import {
  getActiveNutritionPlanFull,
  getNutritionAdherence30d,
  getNutritionLogForDate,
  toggleMealCompletion,
  updateMealConsumedPortion,
  updateMealSatisfaction,
} from '../../../lib/nutrition.queries'
import { enqueueNutritionToggle, flushNutritionQueue } from '../../../lib/offline-cache'
import { readNutritionCache, writeNutritionCache } from '../../../lib/nutrition-offline-cache'
import { useStudentExchanges } from '../../../lib/nutrition-exchanges.queries'
import { getAssignedRecipesForClient, type RecipeRow } from '../../../lib/recipes.queries'
import {
  applyMealFoodSwap,
  clearMealFoodSwap,
  getClientFoodFavorites,
  toggleClientFoodFavorite,
  type SwapOption,
} from '../../../lib/nutrition-swaps'
import type { FoodItemForMacros } from '../../../lib/nutrition-utils'
import type { IntakeMacros } from '../../../lib/nutrition-intake.queries'
import { useTheme } from '../../../context/ThemeContext'
import {
  AdherenceStrip,
  DayNavigator,
  MacroRingSummary,
  MealCardExpandable,
  OfflineBanner,
  ProgressBar,
  WorkoutContextBanner,
} from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import {
  DayCompleteConfetti,
  ExchangeEquivalencesSheet,
  ExchangeMealSection,
  ExchangeModeToggle,
  ExportDayActions,
  FilteredMealsBanner,
  HistoricBanner,
  MicrosPanel,
  NotesThread,
  NutritionEmpty,
  NutritionHeader,
  NutritionStreakBanner,
  OffPlanLogger,
  PlatePanel,
  PushBanner,
  RecipeIdeasSection,
  ShoppingList,
  SwapSheet,
  WeeklyRecapCard,
  computeNutritionStreak,
  normalizeMealForDisplay,
  EMBER_500,
  type AdherenceDay,
  type DailyLog,
  type ExchangeViewMode,
  type NutritionPlan,
} from '../../../components/alumno/nutrition'

/**
 * Nutrición alumno — SHELL de secciones (E4). Reestructura el monolito previo al
 * patrón del dashboard E1: `nutricion.tsx` hace UN fetch, deriva y compone las
 * secciones (cada una en `components/alumno/nutrition/*`), espejo del árbol mobile
 * de la web `apps/web/src/app/c/[coach_slug]/nutrition` (columna <760 del
 * NutritionShell). Orden vertical: header (glow de marca) → offline → workout →
 * navegador de día → banners (histórico / comidas filtradas) → push → racha →
 * anillos → micros → plato → comidas (+ bloque de intercambios por comida) →
 * fuera de plan → notas → lista de compras → recap semanal → recetas →
 * adherencia. Sheets: equivalencias de intercambio, swap de alimento y export
 * del día (share del header).
 *
 * Gating: exchanges = hasModule('nutrition_exchanges') + enabled del server
 * (fail-closed); micros = secciones resueltas server-side (el panel degrada
 * ocultándose); el resto es base tier (RLS client-scoped). La cola offline de
 * toggles de comida se preserva intacta (offline-cache → offline-queue
 * idempotente). Los hábitos NO viven aquí (ruling D4: viven en el dashboard).
 */
export default function AlumnoNutricionScreen() {
  const { theme } = useTheme()
  const { iso: todayIso } = getTodayInSantiago()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const onReconnect = useCallback(() => {
    flushNutritionQueue(supabase).catch(() => {})
  }, [])
  const isOnline = useOnline(onReconnect)
  const [plan, setPlan] = useState<NutritionPlan | null>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const [clientUserId, setClientUserId] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(todayIso)
  const [currentLog, setCurrentLog] = useState<DailyLog | null>(null)
  const [adherence, setAdherence] = useState<AdherenceDay[]>([])
  const [isDateLoading, setIsDateLoading] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [hasTodayWorkout, setHasTodayWorkout] = useState(false)
  const [confettiTick, setConfettiTick] = useState(0)
  const confettiFiredRef = useRef<Set<string>>(new Set())

  // ─── Wave 2: intercambios, swaps, off-plan, recetas, export ──────────────────
  const [recipes, setRecipes] = useState<RecipeRow[]>([])
  const [favoriteFoodIds, setFavoriteFoodIds] = useState<Set<string>>(new Set())
  const [exchangeMode, setExchangeMode] = useState<ExchangeViewMode>('porciones')
  const [openExchangeGroupId, setOpenExchangeGroupId] = useState<string | null>(null)
  const [swapState, setSwapState] = useState<{ mealId: string; mealName: string; item: FoodItemForMacros } | null>(null)
  const [applyingSwap, setApplyingSwap] = useState(false)
  const [offPlanExtra, setOffPlanExtra] = useState<IntakeMacros>({ calories: 0, protein: 0, carbs: 0, fats: 0 })
  const [refreshTick, setRefreshTick] = useState(0)
  const [exportOpen, setExportOpen] = useState(false)

  // Nutrición Pro por-alumno (módulo `nutrition_exchanges`): gate de oro server-side
  // + hasModule. Sin derecho ⇒ enabled=false (cero fetch, cero render de superficie).
  const exchanges = useStudentExchanges(plan?.id)

  const appStateRef = useRef(AppState.currentState)

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (state) => {
      if (state === 'active' && appStateRef.current !== 'active') {
        if (isOnline && clientId && plan) await flushNutritionQueue(supabase)
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
    if (!client) {
      setLoading(false)
      return
    }
    setClientId(client.id)
    setClientUserId(client.userId ?? null)

    // Secundarios (fail-open, no bloquean el plan): favoritos para swaps + recetas-idea.
    getClientFoodFavorites(client.id).then(setFavoriteFoodIds).catch(() => {})
    getAssignedRecipesForClient(client.id).then(setRecipes).catch(() => setRecipes([]))

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

    const since30 = isoDateAddDays(todayIso, -30)
    const [logResult, adherenceResult, workoutResult] = await Promise.all([
      getNutritionLogForDate(client.id, planData.id, todayIso),
      getNutritionAdherence30d(client.id, planData.id, since30),
      supabase
        .from('workout_programs')
        .select('id, workout_plans ( id, day_of_week, assigned_date )')
        .eq('client_id', client.id)
        .eq('is_active', true)
        .maybeSingle(),
    ])

    setCurrentLog(logResult.data as unknown as DailyLog | null)
    setAdherence((adherenceResult.data ?? []) as unknown as AdherenceDay[])

    if (workoutResult.data?.workout_plans) {
      const today = new Date().getDay() === 0 ? 7 : new Date().getDay()
      const plans = workoutResult.data.workout_plans as { day_of_week: number | null; assigned_date: string | null }[]
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
    setRefreshTick((t) => t + 1)
    setRefreshing(true)
    await load()
  }

  const fetchLogForDate = useCallback(
    async (date: string) => {
      if (!clientId || !plan) return
      setIsDateLoading(true)
      const { data } = await getNutritionLogForDate(clientId, plan.id, date)
      setCurrentLog(data as unknown as DailyLog | null)
      setIsDateLoading(false)
    },
    [clientId, plan]
  )

  async function handleDateChange(date: string) {
    setSelectedDate(date)
    await fetchLogForDate(date)
  }

  // ─── Derived state ───────────────────────────────────────────────────────────

  const mealsForDay = (plan?.nutrition_meals ?? [])
    .filter((m) => nutritionMealApplies(m, selectedDate))
    .sort((a, b) => a.order_index - b.order_index)

  const totalPlanMeals = plan?.nutrition_meals.length ?? 0

  const mealLogs = currentLog?.nutrition_meal_logs ?? []
  const completedMealIds = new Set(mealLogs.filter((l) => l.is_completed).map((l) => l.meal_id))
  const portionMap = portionPctMapFromMealLogs(mealLogs)

  const normalizedMeals = useMemo(() => mealsForDay.map(normalizeMealForDisplay), [mealsForDay])

  const goals = {
    calories: plan?.daily_calories ?? 0,
    protein: plan?.protein_g ?? 0,
    carbs: plan?.carbs_g ?? 0,
    fats: plan?.fats_g ?? 0,
  }

  const consumed = calculateConsumedMacrosWithCompletionFallback(normalizedMeals, completedMealIds, goals, portionMap)

  // Los anillos suman lo comido fuera de plan (OffPlanLogger reporta su subtotal del día).
  const consumedTotal = {
    calories: consumed.calories + offPlanExtra.calories,
    protein: consumed.protein + offPlanExtra.protein,
    carbs: consumed.carbs + offPlanExtra.carbs,
    fats: consumed.fats + offPlanExtra.fats,
  }

  // Swaps activos del día por comida (badge "swap" en la tarjeta). Clave = food_id
  // original + food_id sustituto (se muestra sobre cualquiera de los dos).
  const swapsByMeal = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const s of currentLog?.nutrition_meal_food_swaps ?? []) {
      const set = m.get(s.meal_id) ?? new Set<string>()
      set.add(s.original_food_id)
      set.add(s.swapped_food_id)
      m.set(s.meal_id, set)
    }
    return m
  }, [currentLog])

  const activeSwappedFoodId = swapState
    ? (currentLog?.nutrition_meal_food_swaps ?? []).find(
        (s) => s.meal_id === swapState.mealId && s.original_food_id === (swapState.item.foods.id ?? ''),
      )?.swapped_food_id ?? null
    : null

  const adherenceDates = new Set(adherence.map((a) => a.log_date))
  const completedCount = completedMealIds.size
  const totalCount = mealsForDay.length
  const isToday = selectedDate === todayIso

  // ─── Racha (motor único @eva/nutrition-engine — E4-06, mata el drift) ─────────
  const streak = useMemo(() => {
    if (!plan) return { count: 0, atRisk: false, priorCount: 0 }
    const logsByDate = new Map<string, { meal_id: string; is_completed: boolean }[]>()
    for (const a of adherence) logsByDate.set(a.log_date, a.nutrition_meal_logs)
    // Reflejar los toggles LIVE de hoy (currentLog) por encima del snapshot del server.
    if (selectedDate === todayIso && currentLog) {
      logsByDate.set(
        todayIso,
        (currentLog.nutrition_meal_logs ?? []).map((l) => ({ meal_id: l.meal_id, is_completed: l.is_completed }))
      )
    }
    return computeNutritionStreak({
      planMeals: plan.nutrition_meals.map((m) => ({ id: m.id, day_of_week: m.day_of_week })),
      logsByDate,
      todayIso,
    })
  }, [plan, adherence, currentLog, selectedDate, todayIso])

  // ─── Mutaciones ──────────────────────────────────────────────────────────────

  async function handleToggle(mealId: string, isCompleted: boolean) {
    if (!clientId || !plan || toggling) return
    setToggling(mealId)

    const newCompleted = !isCompleted
    const logId = currentLog?.id ?? null

    // Confetti al completar la ÚLTIMA comida del día (1×/fecha; reduce-motion lo veta el componente).
    if (newCompleted && !confettiFiredRef.current.has(selectedDate)) {
      const stillPending = mealsForDay.filter((m) => m.id !== mealId && !completedMealIds.has(m.id))
      if (stillPending.length === 0 && mealsForDay.length > 0) {
        confettiFiredRef.current.add(selectedDate)
        setConfettiTick((t) => t + 1)
      }
    }

    if (newCompleted) {
      setCurrentLog((prev) => {
        if (!prev) return prev
        const exists = prev.nutrition_meal_logs.some((l) => l.meal_id === mealId)
        if (exists)
          return {
            ...prev,
            nutrition_meal_logs: prev.nutrition_meal_logs.map((l) =>
              l.meal_id === mealId ? { ...l, is_completed: true } : l
            ),
          }
        return {
          ...prev,
          nutrition_meal_logs: [
            ...prev.nutrition_meal_logs,
            { id: '', meal_id: mealId, is_completed: true, consumed_quantity: null, satisfaction_score: null },
          ],
        }
      })
    } else {
      setCurrentLog((prev) =>
        prev ? { ...prev, nutrition_meal_logs: prev.nutrition_meal_logs.filter((l) => l.meal_id !== mealId) } : prev
      )
    }

    if (!isOnline) {
      await enqueueNutritionToggle({
        clientId,
        planId: plan.id,
        mealId,
        completed: newCompleted,
        logId: logId ?? undefined,
        date: selectedDate,
      })
      setToggling(null)
      return
    }

    const { success, logId: newLogId } = await toggleMealCompletion(clientId, plan.id, mealId, newCompleted, logId, selectedDate)

    if (!success) {
      await enqueueNutritionToggle({
        clientId,
        planId: plan.id,
        mealId,
        completed: newCompleted,
        logId: logId ?? undefined,
        date: selectedDate,
      })
    } else if (newLogId && !currentLog?.id) {
      setCurrentLog((prev) => (prev ? { ...prev, id: newLogId } : null))
    }

    setToggling(null)
  }

  async function handleSatisfaction(mealId: string, score: 1 | 2 | 3 | null) {
    if (!currentLog) return
    setCurrentLog((prev) =>
      prev
        ? {
            ...prev,
            nutrition_meal_logs: prev.nutrition_meal_logs.map((l) =>
              l.meal_id === mealId ? { ...l, satisfaction_score: score } : l
            ),
          }
        : prev
    )
    await updateMealSatisfaction(currentLog.id, mealId, score)
  }

  async function handlePortion(mealId: string, pct: number | null) {
    if (!currentLog?.id) return
    setCurrentLog((prev) =>
      prev
        ? {
            ...prev,
            nutrition_meal_logs: prev.nutrition_meal_logs.map((l) =>
              l.meal_id === mealId ? { ...l, consumed_quantity: pct } : l
            ),
          }
        : prev
    )
    await updateMealConsumedPortion(currentLog.id, mealId, pct)
  }

  // Export rico del día (E4-16): el share del header abre el sheet de 3 acciones
  // (copiar detalle / resumen WhatsApp / PDF branded expo-print).
  function handleShare() {
    if (!plan) return
    setExportOpen(true)
  }

  // ─── Swaps interactivos + favoritos (E4-08) ──────────────────────────────────

  async function handleToggleFavorite(foodId: string) {
    if (!clientId || !foodId) return
    // Optimista con rollback (espejo del NutritionShell web).
    const flip = (prev: Set<string>) => {
      const next = new Set(prev)
      if (next.has(foodId)) next.delete(foodId)
      else next.add(foodId)
      return next
    }
    setFavoriteFoodIds(flip)
    const res = await toggleClientFoodFavorite({ clientId, foodId })
    if (!res.success) setFavoriteFoodIds(flip)
  }

  async function handleApplySwap(option: SwapOption) {
    const target = swapState
    if (!clientId || !plan || !target || applyingSwap) return
    setApplyingSwap(true)
    const { success } = await applyMealFoodSwap({
      clientId,
      planId: plan.id,
      dailyLogId: currentLog?.id || null,
      mealId: target.mealId,
      originalFoodId: target.item.foods.id ?? '',
      option,
      targetDate: selectedDate,
    })
    if (success) await fetchLogForDate(selectedDate)
    setApplyingSwap(false)
  }

  async function handleRevertSwap() {
    const target = swapState
    if (!currentLog?.id || !target || applyingSwap) return
    setApplyingSwap(true)
    const { success } = await clearMealFoodSwap({
      dailyLogId: currentLog.id,
      mealId: target.mealId,
      originalFoodId: target.item.foods.id ?? '',
    })
    if (success) await fetchLogForDate(selectedDate)
    setApplyingSwap(false)
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.container} className="bg-surface-app">
        <AppBackground />
        <NutritionHeader planName="Tu plan personalizado" />
        <EvaLoaderScreen subtitle="Cargando nutrición…" />
      </View>
    )
  }

  if (!plan) {
    return (
      <View style={styles.container} className="bg-surface-app">
        <AppBackground />
        <NutritionHeader planName="Tu plan personalizado" />
        {/* E4-SEAM-domain-off: gating de dominio (NutritionDomainOff) + gating por
            sección + master switch — wave 2 (B3, useEntitlements.nutritionEnabled,
            fail-open igual que web). Hoy: solo estado "sin plan". */}
        <NutritionEmpty />
      </View>
    )
  }

  return (
    <View style={styles.container} className="bg-surface-app">
      <AppBackground />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <NutritionHeader planName={plan.name} onShare={handleShare} />

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />
          }
        >
          {!isOnline && <OfflineBanner visible />}

          <WorkoutContextBanner visible={hasTodayWorkout && isToday} />

          <DayNavigator
            selectedDate={selectedDate}
            onDateChange={handleDateChange}
            adherenceDates={adherenceDates}
            isLoading={isDateLoading}
          />

          {!isToday && <HistoricBanner />}

          <FilteredMealsBanner visible={totalCount} total={totalPlanMeals} />

          {isToday && <PushBanner userId={clientUserId} />}

          {/* §Stats de un vistazo (orden kit móvil web <760: racha → anillos → micros → plato) */}
          <NutritionStreakBanner streak={streak} />

          <MacroRingSummary
            calories={{ consumed: consumedTotal.calories, target: goals.calories }}
            protein={{ consumed: consumedTotal.protein, target: goals.protein }}
            carbs={{ consumed: consumedTotal.carbs, target: goals.carbs }}
            fats={{ consumed: consumedTotal.fats, target: goals.fats }}
            isReadOnly={!isToday}
          />

          {/* Micros del día (E4-09): base gratis + avanzados Pro; gate y datos
              resueltos server-side, el panel degrada ocultándose. */}
          <MicrosPanel date={selectedDate} />

          <PlatePanel proteinG={goals.protein} carbsG={goals.carbs} />

          {totalCount > 0 && (
            <View style={styles.progressRow}>
              <Text style={[styles.progressLabel, { color: theme.mutedForeground, fontFamily: FONT.uiMedium }]}>
                {completedCount}/{totalCount} comidas completadas
              </Text>
              <ProgressBar value={totalCount > 0 ? completedCount / totalCount : 0} color={EMBER_500} height={6} />
            </View>
          )}

          {plan.instructions ? (
            <View style={{ marginTop: 4 }}>
              <Accordion question="Indicaciones del coach" answer={plan.instructions} defaultOpen />
            </View>
          ) : null}

          {/* Nutrición Pro por-alumno (E4-07): toggle local Porciones|Gramos.
              Solo con módulo + plan en modo intercambios (enabled del server). */}
          {exchanges.enabled && <ExchangeModeToggle value={exchangeMode} onChange={setExchangeMode} />}

          {/* §Comidas de hoy */}
          {normalizedMeals.length === 0 ? (
            <View style={[styles.noMeals, { backgroundColor: theme.muted, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
              <Text style={{ color: theme.mutedForeground, fontFamily: FONT.uiMedium, fontSize: 13 }}>
                Sin comidas para este día
              </Text>
            </View>
          ) : (
            normalizedMeals.map((meal) => {
              const mealLog = mealLogs.find((l) => l.meal_id === meal.id)
              return (
                <Fragment key={meal.id}>
                  <MealCardExpandable
                    meal={meal}
                    isCompleted={completedMealIds.has(meal.id)}
                    isToday={isToday}
                    isToggling={toggling === meal.id}
                    satisfactionScore={mealLog?.satisfaction_score ?? null}
                    consumedPct={mealLog?.consumed_quantity ?? null}
                    onToggle={() => handleToggle(meal.id, completedMealIds.has(meal.id))}
                    onSatisfaction={(score) => handleSatisfaction(meal.id, score)}
                    onPortionChange={(pct) => handlePortion(meal.id, pct)}
                    // Swaps interactivos (E4-08): badge sobre alimentos intercambiados hoy
                    // + botón que abre el SwapSheet (solo alimentos con alternativas).
                    activeSwapMealIds={swapsByMeal.get(meal.id)}
                    onSwapFood={
                      isToday
                        ? (item) => setSwapState({ mealId: meal.id, mealName: meal.name, item })
                        : undefined
                    }
                  />
                  {/* Bloque "En porciones" (E4-07): chips de intercambio + macros
                      derivados de targets; null en modo gramos o sin targets. */}
                  <ExchangeMealSection
                    meal={exchanges.mealById(meal.id)}
                    mode={exchangeMode}
                    onChipTap={setOpenExchangeGroupId}
                  />
                </Fragment>
              )
            })
          )}

          {/* Fuera de plan (E4-11): quick-add del catálogo; su subtotal se suma a los anillos. */}
          {clientId && (
            <OffPlanLogger
              clientId={clientId}
              logDate={selectedDate}
              isToday={isToday}
              onTotalsChange={setOffPlanExtra}
            />
          )}

          {/* Notas del día (E4-12): hilo bidireccional coach ⇄ alumno, scope = día seleccionado. */}
          <NotesThread logDate={selectedDate} />

          {/* Lista de compras (E4-13): derivada del plan + manuales; sheet propio. */}
          <ShoppingList refreshSignal={refreshTick} />

          {/* Recap semanal (E4-14): adherencia 7d vs 7d previos, tono adaptativo. */}
          <WeeklyRecapCard refreshSignal={refreshTick} />

          {/* Ideas de recetas (E4-15): inspiración asignada por el coach (solo lectura).
              Solo se muestra con recetas asignadas (la sección vacía no aporta). */}
          {recipes.length > 0 && <RecipeIdeasSection recipes={recipes} />}

          <AdherenceStrip
            adherence={adherence}
            planMeals={plan.nutrition_meals.map((m) => ({ id: m.id, day_of_week: m.day_of_week }))}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Sheet de equivalencias de UN grupo de intercambio (E4-07). */}
      <ExchangeEquivalencesSheet
        openGroupId={openExchangeGroupId}
        groups={exchanges.groups}
        equivalences={exchanges.equivalences}
        onClose={() => setOpenExchangeGroupId(null)}
      />

      {/* Sheet de swap de alimento (E4-08). */}
      <SwapSheet
        open={swapState !== null}
        onClose={() => setSwapState(null)}
        item={swapState?.item ?? null}
        mealName={swapState?.mealName}
        activeSwappedFoodId={activeSwappedFoodId}
        favoriteFoodIds={favoriteFoodIds}
        onToggleFavorite={handleToggleFavorite}
        onApply={handleApplySwap}
        onRevert={handleRevertSwap}
        applying={applyingSwap}
      />

      {/* Export del día (E4-16): copiar detalle / resumen WhatsApp / PDF branded. */}
      <ExportDayActions
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        planName={plan.name}
        instructions={plan.instructions}
        date={selectedDate}
        dateLabel={isToday ? 'Hoy' : selectedDate}
        meals={normalizedMeals}
        goals={goals}
      />

      <DayCompleteConfetti tick={confettiTick} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingBottom: 40, paddingTop: 14, gap: 14 },
  progressRow: { gap: 6 },
  progressLabel: { fontSize: 12 },
  noMeals: { paddingVertical: 28, alignItems: 'center', gap: 8, borderWidth: 1 },
})
