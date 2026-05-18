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
import { supabase } from '../../../lib/supabase'
import { getClientProfile } from '../../../lib/client'
import { useTheme } from '../../../context/ThemeContext'

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

// nutrition_meals.day_of_week: 1=Mon … 7=Sun; JS getDay(): 0=Sun … 6=Sat
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

    // Fetch active plan
    const { data: planData } = await supabase
      .from('nutrition_plans')
      .select('id, name, daily_calories, protein_g, carbs_g, fats_g, instructions')
      .eq('client_id', client.id)
      .eq('is_active', true)
      .maybeSingle()

    if (!planData) { setLoading(false); return }
    setPlan(planData)

    // Fetch today's meals (day_of_week = today OR null = every day)
    const { data: mealsData } = await supabase
      .from('nutrition_meals')
      .select('id, name, description, order_index, day_of_week')
      .eq('plan_id', planData.id)
      .or(`day_of_week.eq.${todayDb},day_of_week.is.null`)
      .order('order_index')

    const todayMeals = mealsData ?? []
    setMeals(todayMeals)

    // Get or create daily_nutrition_log
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
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Nutrición</Text>
        {plan && (
          <Text style={[styles.subtitle, { color: theme.muted }]}>
            {completedCount}/{totalCount} comidas
          </Text>
        )}
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={theme.primary} />
      ) : !plan ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyText, { color: theme.muted }]}>
            Tu coach aún no ha asignado un plan de nutrición
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Macros summary */}
          {(plan.daily_calories || plan.protein_g || plan.carbs_g || plan.fats_g) ? (
            <View style={[styles.macrosCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.planName, { color: theme.text }]}>{plan.name}</Text>
              <View style={styles.macrosRow}>
                {plan.daily_calories != null && (
                  <MacroPill label="kcal" value={plan.daily_calories} color={theme.primary} theme={theme} />
                )}
                {plan.protein_g != null && (
                  <MacroPill label="P" value={plan.protein_g} color="#EF4444" theme={theme} />
                )}
                {plan.carbs_g != null && (
                  <MacroPill label="C" value={plan.carbs_g} color="#F59E0B" theme={theme} />
                )}
                {plan.fats_g != null && (
                  <MacroPill label="G" value={plan.fats_g} color="#8B5CF6" theme={theme} />
                )}
              </View>
              {plan.instructions ? (
                <Text style={[styles.instructions, { color: theme.muted }]}>{plan.instructions}</Text>
              ) : null}
            </View>
          ) : null}

          {/* Progress bar */}
          {totalCount > 0 && (
            <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
              <View
                style={[
                  styles.progressFill,
                  { backgroundColor: theme.success, width: `${(completedCount / totalCount) * 100}%` },
                ]}
              />
            </View>
          )}

          {/* Meals list */}
          {meals.length === 0 ? (
            <Text style={[styles.emptyText, { color: theme.muted, textAlign: 'center', marginTop: 32 }]}>
              Sin comidas para hoy
            </Text>
          ) : (
            meals.map((meal) => {
              const done = completedMealIds.has(meal.id)
              const isToggling = toggling === meal.id
              return (
                <TouchableOpacity
                  key={meal.id}
                  style={[
                    styles.mealCard,
                    {
                      backgroundColor: theme.card,
                      borderColor: done ? theme.success : theme.border,
                      borderWidth: done ? 2 : 1,
                    },
                  ]}
                  onPress={() => toggleMeal(meal.id)}
                  activeOpacity={0.7}
                  disabled={!!toggling}
                >
                  <View style={styles.mealLeft}>
                    <Text style={[styles.mealName, { color: done ? theme.success : theme.text }]}>
                      {meal.name}
                    </Text>
                    {meal.description ? (
                      <Text style={[styles.mealDesc, { color: theme.muted }]}>{meal.description}</Text>
                    ) : null}
                  </View>
                  {isToggling ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                  ) : (
                    <View
                      style={[
                        styles.checkCircle,
                        { borderColor: done ? theme.success : theme.border },
                        done && { backgroundColor: theme.success },
                      ]}
                    >
                      {done && <Text style={styles.checkMark}>✓</Text>}
                    </View>
                  )}
                </TouchableOpacity>
              )
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

function MacroPill({ label, value, color, theme }: { label: string; value: number; color: string; theme: any }) {
  return (
    <View style={[styles.macroPill, { borderColor: color }]}>
      <Text style={[styles.macroValue, { color }]}>{value}</Text>
      <Text style={[styles.macroLabel, { color: theme.muted }]}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: 13 },
  scroll: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  macrosCard: { borderRadius: 16, padding: 16, borderWidth: 1, gap: 10 },
  planName: { fontSize: 15, fontWeight: '700' },
  macrosRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  macroPill: { borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center', minWidth: 56 },
  macroValue: { fontSize: 16, fontWeight: '700' },
  macroLabel: { fontSize: 11, fontWeight: '500' },
  instructions: { fontSize: 13, lineHeight: 18 },
  progressBar: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  mealCard: { borderRadius: 14, padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mealLeft: { flex: 1, gap: 4, marginRight: 12 },
  mealName: { fontSize: 15, fontWeight: '600' },
  mealDesc: { fontSize: 13 },
  checkCircle: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkMark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyText: { fontSize: 15, lineHeight: 22 },
})
