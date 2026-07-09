import { Dimensions, StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../context/ThemeContext'
import { FONT } from '../lib/typography'
import { getTodayInSantiago, isoDateAddDays, nutritionMealApplies } from '../lib/date-utils'

const SCREEN_WIDTH = Dimensions.get('window').width
const COLS = 10
const GAP = 4
const SQUARE_SIZE = Math.floor((SCREEN_WIDTH - 32 - GAP * (COLS - 1)) / COLS)

interface AdherenceDay {
  log_date: string
  nutrition_meal_logs: { meal_id: string; is_completed: boolean }[]
}

interface Props {
  adherence: AdherenceDay[]
  planMeals: { id: string; day_of_week?: number | null }[]
}

function getSquareColor(
  pct: number,
  hasData: boolean,
  theme: { muted: string }
): string {
  if (!hasData) return theme.muted
  if (pct >= 0.8) return '#10B981'
  if (pct >= 0.5) return '#F59E0B'
  return '#EF4444'
}

export function AdherenceStrip({ adherence, planMeals }: Props) {
  const { theme } = useTheme()
  const todayIso = getTodayInSantiago().iso

  const days: string[] = []
  for (let i = 29; i >= 0; i--) {
    days.push(isoDateAddDays(todayIso, -i))
  }

  const adherenceMap = new Map(adherence.map((a) => [a.log_date, a]))

  const daysWithData = days.filter((d) => adherenceMap.has(d))
  const completedDays = daysWithData.filter((d) => {
    const entry = adherenceMap.get(d)!
    const dayMeals = planMeals.filter((m) => nutritionMealApplies(m, d))
    if (dayMeals.length === 0) return false
    const completed = entry.nutrition_meal_logs.filter((l) => l.is_completed).length
    return completed / dayMeals.length >= 0.5
  })

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.foreground, fontFamily: FONT.uiBold }]}>
          Adherencia — 30 días
        </Text>
        <Text style={[styles.count, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>
          {completedDays.length}/30 días
        </Text>
      </View>

      <View style={styles.grid}>
        {days.map((day) => {
          const entry = adherenceMap.get(day)
          const isToday = day === todayIso
          const dayMeals = planMeals.filter((m) => nutritionMealApplies(m, day))
          let pct = 0
          let hasData = false

          if (entry && dayMeals.length > 0) {
            hasData = true
            const completed = entry.nutrition_meal_logs.filter((l) => l.is_completed).length
            pct = completed / dayMeals.length
          }

          const bg = getSquareColor(pct, hasData, theme)

          return (
            <View
              key={day}
              style={[
                styles.square,
                {
                  width: SQUARE_SIZE,
                  height: SQUARE_SIZE,
                  backgroundColor: bg,
                  borderRadius: 3,
                  borderWidth: isToday ? 2 : 0,
                  borderColor: isToday ? theme.primary : 'transparent',
                },
              ]}
            />
          )
        })}
      </View>

      <View style={styles.legend}>
        {[
          { color: '#10B981', label: '≥80%' },
          { color: '#F59E0B', label: '≥50%' },
          { color: '#EF4444', label: '<50%' },
          { color: theme.muted, label: 'Sin datos' },
        ].map(({ color, label }) => (
          <View key={label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: color }]} />
            <Text style={[styles.legendText, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>
              {label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { padding: 16, borderWidth: 1, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 13 },
  count: { fontSize: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  square: {},
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendText: { fontSize: 10 },
})
