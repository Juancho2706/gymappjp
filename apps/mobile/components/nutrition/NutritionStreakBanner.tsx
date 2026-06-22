import { useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Flame, AlertTriangle } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../context/ThemeContext'
import { getTodayInSantiago, isoDateAddDays, nutritionMealApplies } from '../../lib/date-utils'

/**
 * Banner de racha — espejo 1:1 de la web (NutritionStreakBanner.tsx).
 * Cuenta días consecutivos con >=50% de comidas aplicables completadas, saltando días sin plan.
 * Estado "en riesgo" (grace day): la racha se rompió por exactamente ayer pero antes vivía (>=2).
 */

interface DayAdherence {
  log_date: string
  nutrition_meal_logs: { meal_id: string; is_completed: boolean }[]
}

interface Props {
  adherenceData: DayAdherence[]
  planMeals: { id: string; day_of_week?: number | null }[]
}

const ORANGE = '#f97316'
const AMBER = '#f59e0b'

export function NutritionStreakBanner({ adherenceData, planMeals }: Props) {
  const { theme } = useTheme()
  const { iso: today } = getTodayInSantiago()

  const { count, atRisk, priorCount } = useMemo(() => {
    const map = new Map(adherenceData.map((d) => [d.log_date, d]))

    const dayMet = (iso: string): boolean | null => {
      const applicable = planMeals.filter((m) => nutritionMealApplies(m, iso))
      if (applicable.length === 0) return null
      const applicableIds = new Set(applicable.map((m) => m.id))
      const log = map.get(iso)
      const completed =
        log?.nutrition_meal_logs.filter((m) => m.is_completed && applicableIds.has(m.meal_id)).length ?? 0
      return completed / applicable.length >= 0.5
    }

    const countFrom = (startOffset: number): { count: number; brokeOffset: number | null } => {
      let c = 0
      for (let i = startOffset; i < 365; i++) {
        const iso = isoDateAddDays(today, -i)
        const met = dayMet(iso)
        if (met === null) continue
        if (met) c++
        else return { count: c, brokeOffset: i }
      }
      return { count: c, brokeOffset: null }
    }

    const live = countFrom(0)
    if (live.count > 0) {
      return { count: live.count, atRisk: false, priorCount: live.count }
    }
    if (live.brokeOffset === 1) {
      const prior = countFrom(2)
      if (prior.count >= 2) {
        return { count: 0, atRisk: true, priorCount: prior.count }
      }
    }
    return { count: 0, atRisk: false, priorCount: 0 }
  }, [adherenceData, today, planMeals])

  if (atRisk) {
    const riskFrame = priorCount <= 7 ? `${priorCount} de 7 días` : `${priorCount} días`
    return (
      <MotiView
        from={{ opacity: 0, translateY: -10 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: 350 }}
        style={[styles.banner, { backgroundColor: AMBER + '1A', borderColor: AMBER + '40', borderRadius: theme.radius['2xl'] }]}
      >
        <AlertTriangle size={20} color={AMBER} strokeWidth={2} />
        <View style={styles.textCol}>
          <Text style={[styles.title, { color: AMBER, fontFamily: 'Montserrat_700Bold' }]}>
            Racha en riesgo · {riskFrame}
          </Text>
          <Text style={[styles.subtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Registra tus comidas de hoy para mantenerla.
          </Text>
        </View>
      </MotiView>
    )
  }

  if (count < 2) return null

  const streakFrame = count <= 7 ? `${count} de 7 días` : `${count} días`
  const sub =
    count >= 7 ? '¡Semana perfecta! Sigue así.' : count >= 3 ? 'Vas muy bien, no lo rompas.' : 'Buen comienzo, mantén el ritmo.'

  return (
    <MotiView
      from={{ opacity: 0, translateY: -10 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 300 }}
      style={[styles.banner, { backgroundColor: ORANGE + '1A', borderColor: ORANGE + '33', borderRadius: theme.radius['2xl'] }]}
    >
      <Flame size={20} color={ORANGE} strokeWidth={2} />
      <View style={styles.textCol}>
        <Text style={[styles.title, { color: ORANGE, fontFamily: 'Montserrat_700Bold' }]}>
          {streakFrame} de racha
        </Text>
        <Text style={[styles.subtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{sub}</Text>
      </View>
    </MotiView>
  )
}

const styles = StyleSheet.create({
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  textCol: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 14 },
  subtitle: { fontSize: 11 },
})
