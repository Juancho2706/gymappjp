import { useEffect, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Apple, ArrowRight } from 'lucide-react-native'
import { MotiView } from 'moti'
import { supabase } from '../lib/supabase'
import { getTodayInSantiago, nutritionMealApplies } from '../lib/date-utils'
import {
  calculateConsumedMacrosWithCompletionFallback,
  normalizeMealForMacros,
} from '../lib/nutrition-utils'
import { useTheme } from '../context/ThemeContext'
import { ProgressBar } from './ProgressBar'
import { MACRO_COLORS } from './MacroRingSummary'

// Acento de dominio nutrición (ember-500, fijo — token-contract).
const EMBER = '#FF6A3D'

interface Props {
  clientId: string
}

interface MacroBar {
  label: string
  value: number
  target: number
  color: string
}

export function NutritionDailySummaryWidget({ clientId }: Props) {
  const { theme } = useTheme()
  const router = useRouter()
  const [planName, setPlanName] = useState<string | null>(null)
  const [calories, setCalories] = useState({ consumed: 0, target: 0 })
  const [macros, setMacros] = useState<MacroBar[]>([])
  const [completedCount, setCompletedCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)

  useEffect(() => {
    load()
  }, [clientId])

  async function load() {
    const { iso: todayIso } = getTodayInSantiago()

    const { data: plan } = await supabase
      .from('nutrition_plans')
      .select(`
        id, name, daily_calories, protein_g, carbs_g, fats_g,
        nutrition_meals (
          id, order_index, day_of_week,
          nutrition_meal_food_items (
            id, quantity, unit, swap_options,
            foods ( id, name, calories, protein_g, carbs_g, fats_g, serving_size, serving_unit )
          )
        )
      `)
      .eq('client_id', clientId)
      .eq('is_active', true)
      .maybeSingle()

    if (!plan) return
    setPlanName(plan.name)

    const mealsForDay = ((plan as any).nutrition_meals ?? []).filter(
      (m: any) => nutritionMealApplies(m, todayIso)
    )
    setTotalCount(mealsForDay.length)

    const { data: logData } = await supabase
      .from('daily_nutrition_logs')
      .select('id, nutrition_meal_logs ( meal_id, is_completed, consumed_quantity )')
      .eq('client_id', clientId)
      .eq('plan_id', plan.id)
      .eq('log_date', todayIso)
      .maybeSingle()

    const mealLogs = (logData as any)?.nutrition_meal_logs ?? []
    const completedIds = new Set(
      mealLogs.filter((l: any) => l.is_completed).map((l: any) => l.meal_id)
    )
    setCompletedCount(completedIds.size)

    const normalized = mealsForDay.map((m: any) =>
      normalizeMealForMacros({
        id: m.id,
        day_of_week: m.day_of_week,
        food_items: m.nutrition_meal_food_items,
      })
    )

    const goals = {
      calories: plan.daily_calories ?? 0,
      protein: plan.protein_g ?? 0,
      carbs: plan.carbs_g ?? 0,
      fats: plan.fats_g ?? 0,
    }

    const consumed = calculateConsumedMacrosWithCompletionFallback(
      normalized, completedIds as Set<string>, goals
    )

    setCalories({ consumed: consumed.calories, target: goals.calories })
    setMacros([
      { label: 'Proteína', value: consumed.protein, target: goals.protein, color: MACRO_COLORS.protein },
      { label: 'Carbos', value: consumed.carbs, target: goals.carbs, color: MACRO_COLORS.carbs },
      { label: 'Grasas', value: consumed.fats, target: goals.fats, color: MACRO_COLORS.fats },
    ])
  }

  if (!planName) return null

  const calPct = calories.target > 0 ? Math.min(calories.consumed / calories.target, 1) : 0

  return (
    <MotiView
      from={{ opacity: 0, translateY: 10 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 380 }}
      style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}
    >
      <View style={styles.header}>
        <Apple size={15} color={EMBER} strokeWidth={2} />
        <Text style={[styles.label, { color: theme.mutedForeground, fontFamily: 'Archivo_700Bold' }]}>
          PLAN ALIMENTICIO
        </Text>
      </View>

      <Text style={[styles.planName, { color: theme.foreground, fontFamily: 'Archivo_600SemiBold' }]} numberOfLines={1}>
        {planName}
      </Text>

      <View style={styles.calRow}>
        <Text style={[styles.calValue, { color: theme.foreground, fontFamily: 'Archivo_800ExtraBold' }]}>
          {Math.round(calories.consumed)}
        </Text>
        <Text style={[styles.calTarget, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          / {calories.target} kcal
        </Text>
        <View style={{ flex: 1 }} />
        <Text style={[styles.mealsCount, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          {completedCount}/{totalCount} comidas
        </Text>
      </View>

      <ProgressBar value={calPct} color={MACRO_COLORS.kcal} height={6} />

      <View style={styles.macrosRow}>
        {macros.map((m) => {
          const pct = m.target > 0 ? Math.min(m.value / m.target, 1) : 0
          return (
            <View key={m.label} style={styles.macroItem}>
              <Text style={[styles.macroLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                {m.label}
              </Text>
              <ProgressBar value={pct} color={m.color} height={4} />
              <Text style={[styles.macroValue, { color: theme.foreground, fontFamily: 'Archivo_700Bold' }]}>
                {Math.round(m.value)}g
              </Text>
            </View>
          )
        })}
      </View>

      <TouchableOpacity
        style={styles.linkRow}
        onPress={() => router.push('/alumno/nutricion')}
        activeOpacity={0.75}
      >
        <Text style={[styles.linkText, { color: theme.primary, fontFamily: 'Archivo_700Bold' }]}>
          Ver plan completo
        </Text>
        <ArrowRight size={13} color={theme.primary} strokeWidth={2.5} />
      </TouchableOpacity>
    </MotiView>
  )
}

const styles = StyleSheet.create({
  card: { padding: 16, borderWidth: 1, gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase' },
  planName: { fontSize: 15 },
  calRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  calValue: { fontSize: 28, letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  calTarget: { fontSize: 12 },
  mealsCount: { fontSize: 12 },
  macrosRow: { flexDirection: 'row', gap: 8 },
  macroItem: { flex: 1, gap: 4 },
  macroLabel: { fontSize: 10 },
  macroValue: { fontSize: 12 },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingTop: 2 },
  linkText: { fontSize: 13 },
})
