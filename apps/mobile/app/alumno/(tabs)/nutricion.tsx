import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Apple, Check, UtensilsCrossed } from 'lucide-react-native'
import { MotiView } from 'moti'
import { supabase } from '../../../lib/supabase'
import { getClientProfile } from '../../../lib/client'
import { useTheme } from '../../../context/ThemeContext'
import { EmptyState, MacroPill, ScreenHeader } from '../../../components'

interface NutritionPlan {
  id: string
  name: string
  daily_calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fats_g: number | null
  instructions: string | null
}

interface Meal {
  id: string
  name: string
  description: string
  order_index: number
  day_of_week: number | null
}

function jsDayToDbDay(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay
}

export default function AlumnoNutricionScreen() {
  const { theme } = useTheme()
  const [plan, setPlan] = useState<NutritionPlan | null>(null)
  const [meals, setMeals] = useState<Meal[]>([])
  const [completedMealIds, setCompletedMealIds] = useState<Set<string>>(new Set())
  const [dailyLogId, setDailyLogId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)

  const todayDb = jsDayToDbDay(new Date().getDay())
  const todayIso = new Date().toISOString().slice(0, 10)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const client = await getClientProfile()
    if (!client) { setLoading(false); return }

    const { data: planData } = await supabase
      .from('nutrition_plans')
      .select('id, name, daily_calories, protein_g, carbs_g, fats_g, instructions')
      .eq('client_id', client.id)
      .eq('is_active', true)
      .maybeSingle()

    if (!planData) { setLoading(false); return }
    setPlan(planData)

    const { data: mealsData } = await supabase
      .from('nutrition_meals')
      .select('id, name, description, order_index, day_of_week')
      .eq('plan_id', planData.id)
      .or(`day_of_week.eq.${todayDb},day_of_week.is.null`)
      .order('order_index')

    const todayMeals = mealsData ?? []
    setMeals(todayMeals)

    const { data: existingLog } = await supabase
      .from('daily_nutrition_logs')
      .select('id')
      .eq('client_id', client.id)
      .eq('plan_id', planData.id)
      .eq('log_date', todayIso)
      .maybeSingle()

    let logId = existingLog?.id ?? null
    if (!logId) {
      const { data: newLog } = await supabase
        .from('daily_nutrition_logs')
        .insert({
          client_id: client.id,
          plan_id: planData.id,
          log_date: todayIso,
          plan_name_at_log: planData.name,
          target_calories_at_log: planData.daily_calories,
          target_protein_at_log: planData.protein_g,
          target_carbs_at_log: planData.carbs_g,
          target_fats_at_log: planData.fats_g,
        })
        .select('id')
        .single()
      logId = newLog?.id ?? null
    }
    setDailyLogId(logId)

    if (logId && todayMeals.length > 0) {
      const { data: mealLogs } = await supabase
        .from('nutrition_meal_logs')
        .select('meal_id')
        .eq('daily_log_id', logId)
        .eq('is_completed', true)

      setCompletedMealIds(new Set((mealLogs ?? []).map((l) => l.meal_id)))
    }
    setLoading(false)
  }

  async function toggleMeal(mealId: string) {
    if (!dailyLogId || toggling) return
    setToggling(mealId)
    const isCompleted = completedMealIds.has(mealId)

    if (isCompleted) {
      await supabase
        .from('nutrition_meal_logs')
        .delete()
        .eq('daily_log_id', dailyLogId)
        .eq('meal_id', mealId)
      setCompletedMealIds((prev) => {
        const next = new Set(prev)
        next.delete(mealId)
        return next
      })
    } else {
      await supabase
        .from('nutrition_meal_logs')
        .upsert({ daily_log_id: dailyLogId, meal_id: mealId, is_completed: true })
      setCompletedMealIds((prev) => new Set(prev).add(mealId))
    }
    setToggling(null)
  }

  const completedCount = completedMealIds.size
  const totalCount = meals.length

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Nutricion"
        subtitle={plan ? `${completedCount} de ${totalCount} comidas hoy` : 'Tu plan personalizado'}
      />

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={theme.primary} />
      ) : !plan ? (
        <EmptyState
          icon={Apple}
          title="Sin plan activo"
          subtitle="Tu coach aun no te asigno un plan de nutricion."
        />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {(plan.daily_calories || plan.protein_g || plan.carbs_g || plan.fats_g) ? (
            <MotiView
              from={{ opacity: 0, translateY: 16 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 450 }}
              style={[
                styles.macrosCard,
                { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl },
              ]}
            >
              <View style={styles.planTitleRow}>
                <UtensilsCrossed size={18} color={theme.primary} strokeWidth={1.75} />
                <Text style={[styles.planName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={2}>
                  {plan.name}
                </Text>
              </View>
              <View style={styles.macrosRow}>
                {plan.daily_calories != null ? <MacroPill label="kcal" value={plan.daily_calories} color={theme.primary} /> : null}
                {plan.protein_g != null ? <MacroPill label="P" value={plan.protein_g} color="#EF4444" /> : null}
                {plan.carbs_g != null ? <MacroPill label="C" value={plan.carbs_g} color="#F59E0B" /> : null}
                {plan.fats_g != null ? <MacroPill label="G" value={plan.fats_g} color="#8B5CF6" /> : null}
              </View>
              {plan.instructions ? (
                <Text style={[styles.instructions, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                  {plan.instructions}
                </Text>
              ) : null}
            </MotiView>
          ) : null}

          {totalCount > 0 ? (
            <View style={[styles.progressBar, { backgroundColor: theme.muted }]}>
              <View
                style={[
                  styles.progressFill,
                  { backgroundColor: theme.success, width: `${(completedCount / totalCount) * 100}%` },
                ]}
              />
            </View>
          ) : null}

          {meals.length === 0 ? (
            <View style={styles.emptyDay}>
              <Apple size={22} color={theme.mutedForeground} />
              <Text style={[styles.emptyDayText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                Sin comidas para hoy
              </Text>
            </View>
          ) : (
            meals.map((meal, index) => {
              const done = completedMealIds.has(meal.id)
              const isToggling = toggling === meal.id
              return (
                <MotiView
                  key={meal.id}
                  from={{ opacity: 0, translateY: 12 }}
                  animate={{ opacity: 1, translateY: 0 }}
                  transition={{ type: 'timing', duration: 350, delay: Math.min(index * 50, 400) }}
                >
                  <TouchableOpacity
                    style={[
                      styles.mealCard,
                      {
                        backgroundColor: theme.card,
                        borderColor: done ? theme.success : theme.border,
                        borderWidth: done ? 2 : 1,
                        borderRadius: theme.radius.xl,
                      },
                    ]}
                    onPress={() => toggleMeal(meal.id)}
                    activeOpacity={0.75}
                    disabled={!!toggling}
                  >
                    <View style={styles.mealLeft}>
                      <Text
                        style={[
                          styles.mealName,
                          {
                            color: done ? theme.success : theme.foreground,
                            fontFamily: 'Montserrat_600SemiBold',
                          },
                        ]}
                        numberOfLines={2}
                      >
                        {meal.name}
                      </Text>
                      {meal.description ? (
                        <Text style={[styles.mealDesc, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={2}>
                          {meal.description}
                        </Text>
                      ) : null}
                    </View>
                    {isToggling ? (
                      <ActivityIndicator size="small" color={theme.primary} />
                    ) : (
                      <View
                        style={[
                          styles.checkCircle,
                          {
                            borderColor: done ? theme.success : theme.border,
                            backgroundColor: done ? theme.success : 'transparent',
                            borderRadius: theme.radius.lg,
                          },
                        ]}
                      >
                        {done ? <Check size={16} color={theme.primaryForeground} strokeWidth={2.5} /> : null}
                      </View>
                    )}
                  </TouchableOpacity>
                </MotiView>
              )
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  macrosCard: { padding: 18, borderWidth: 1, gap: 12 },
  planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planName: { fontSize: 16, letterSpacing: -0.2, flex: 1 },
  macrosRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  instructions: { fontSize: 13, lineHeight: 19 },
  progressBar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  mealCard: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  mealLeft: { flex: 1, gap: 4 },
  mealName: { fontSize: 15, letterSpacing: -0.1 },
  mealDesc: { fontSize: 13, lineHeight: 18 },
  checkCircle: {
    width: 30,
    height: 30,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyDay: { paddingVertical: 32, alignItems: 'center', gap: 8 },
  emptyDayText: { fontSize: 13 },
})
