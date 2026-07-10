import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Dumbbell } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import { getWorkoutDaySummaries, type DaySummary } from '../../../lib/history.queries'
import { Card } from '../../Card'

/**
 * §11 RecentWorkoutsSection (web `history/RecentWorkoutsSection.tsx` +
 * WorkoutLogItem): actividad reciente AGRUPADA POR DIA (dia + "N series
 * registradas" + badge). Cascada fade-up. Null si no hay registros. La
 * SectionTitle ("Actividad reciente" · acción "Historial") la pone el shell.
 */
export function RecentWorkouts({ clientId }: { clientId: string }) {
  const { theme } = useTheme()
  const [days, setDays] = useState<DaySummary[] | null>(null)

  useEffect(() => {
    getWorkoutDaySummaries(clientId).then((d) => setDays(d)).catch(() => setDays([]))
  }, [clientId])

  if (days == null || days.length === 0) return null
  const rows = days.slice(0, 5)

  return (
    <Card padding="none" style={{ overflow: 'hidden' }}>
      {rows.map((d, idx) => (
        <MotiView
          key={d.dayKey}
          from={{ opacity: 0, translateY: 8 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 320, delay: idx * 60 }}
          style={[styles.row, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}
        >
          <View className="rounded-control bg-surface-sunken" style={styles.icon}>
            <Dumbbell size={18} color={theme.primary} strokeWidth={2.25} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text className="text-strong font-sans-bold" numberOfLines={1} style={{ fontSize: 14 }}>{d.dateLabel}</Text>
            <Text className="text-muted font-sans" numberOfLines={1} style={{ fontSize: 12 }}>{d.subtitle}</Text>
          </View>
          <Text className="text-subtle" style={{ fontFamily: FONT.uiBold, fontSize: 12, fontVariant: ['tabular-nums'] }}>
            {d.sets} {d.sets === 1 ? 'serie' : 'series'}
          </Text>
        </MotiView>
      ))}
    </Card>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  icon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
})
