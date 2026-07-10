import { useEffect, useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { Apple, Check, Flame } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import { supabase } from '../../../lib/supabase'
import { getTodayInSantiago, nutritionMealApplies } from '../../../lib/date-utils'
import { calculateConsumedMacrosWithCompletionFallback, normalizeMealForMacros } from '../../../lib/nutrition-utils'
import { Badge } from '../../Badge'
import { Card } from '../../Card'
import { MACRO_COLORS } from '../../MacroRingSummary'
import { EMBER_500 } from './types'

interface MealRow { id: string; name: string }
interface Loaded {
  planName: string
  consumedCal: number
  targetCal: number
  macros: { label: string; value: number; target: number; color: string }[]
  meals: MealRow[]
  completed: Set<string>
  hasLog: boolean
}

/**
 * §13 NutritionDailySummary (web `nutrition/NutritionDailySummary.tsx`). Respeta
 * el gate del dominio (el shell no la monta si nutrition esta OFF). Header (apple
 * + plan + "Ver todo →"), kcal hero + badge "N restantes", 3 MacroBar (P/C/G),
 * lista de comidas con estado de completado + CTA. Desviacion: el toggle de
 * completar comida (optimista + cola offline) vive en la pantalla de Nutrición;
 * aca las filas son read-only y navegan al plan.
 */
export function NutritionDailySummary({ clientId, onSeeAll }: { clientId: string; onSeeAll: () => void }) {
  const { theme } = useTheme()
  const [data, setData] = useState<Loaded | null>(null)
  const [noPlan, setNoPlan] = useState(false)

  useEffect(() => {
    load()
  }, [clientId])

  async function load() {
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

    if (!plan) { setNoPlan(true); return }

    const mealsForDay = ((plan as any).nutrition_meals ?? []).filter((m: any) => nutritionMealApplies(m, todayIso))

    const { data: logData } = await supabase
      .from('daily_nutrition_logs')
      .select('id, nutrition_meal_logs ( meal_id, is_completed, consumed_quantity )')
      .eq('client_id', clientId)
      .eq('plan_id', plan.id)
      .eq('log_date', todayIso)
      .maybeSingle()

    const mealLogs = (logData as any)?.nutrition_meal_logs ?? []
    const completed = new Set<string>(mealLogs.filter((l: any) => l.is_completed).map((l: any) => l.meal_id))

    const normalized = mealsForDay.map((m: any) =>
      normalizeMealForMacros({ id: m.id, day_of_week: m.day_of_week, food_items: m.nutrition_meal_food_items })
    )
    const goals = { calories: plan.daily_calories ?? 0, protein: plan.protein_g ?? 0, carbs: plan.carbs_g ?? 0, fats: plan.fats_g ?? 0 }
    const consumed = calculateConsumedMacrosWithCompletionFallback(normalized, completed, goals)

    setData({
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
    })
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

      {data.macros.map((m) => <MacroBar key={m.label} {...m} />)}

      <View style={{ gap: 8 }}>
        {data.meals.map((meal) => {
          const done = data.completed.has(meal.id)
          return (
            <TouchableOpacity key={meal.id} onPress={onSeeAll} activeOpacity={0.7} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? EMBER_500 : 'transparent', borderWidth: done ? 0 : 1.5, borderColor: theme.border }}>
                {done ? <Check size={14} color="#fff" strokeWidth={3} /> : null}
              </View>
              <Text className={done ? 'text-muted' : 'text-strong'} numberOfLines={1} style={{ flex: 1, fontFamily: FONT.uiSemibold, fontSize: 13.5 }}>{meal.name}</Text>
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
  return (
    <View style={{ gap: 4 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text className="text-muted" style={{ fontFamily: FONT.uiSemibold, fontSize: 11 }}>{label}</Text>
        <Text className="text-strong" style={{ fontFamily: FONT.uiSemibold, fontSize: 11, fontVariant: ['tabular-nums'] }}>{Math.round(value)}/{Math.round(target)}g</Text>
      </View>
      <View className="bg-surface-sunken" style={{ height: 8, borderRadius: 999, overflow: 'hidden' }}>
        <View style={{ height: 8, borderRadius: 999, width: `${pct}%`, backgroundColor: color }} />
      </View>
    </View>
  )
}
