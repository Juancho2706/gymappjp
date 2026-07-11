import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { Dumbbell } from 'lucide-react-native'
import { MotiView } from 'moti'
import { cssInterop } from 'nativewind'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import { getWorkoutDaySummaries, type DaySummary } from '../../../lib/history.queries'
import { SectionTitle } from './SectionTitle'

// NativeWind maneja el `color` del glyph via clases `text-*` (patron DS, ver
// tools.tsx/perfil.tsx) → el tinte sport-600 sigue la marca white-label y el modo
// oscuro en runtime, sin hardcodear hex.
cssInterop(Dumbbell, { className: { target: 'style', nativeStyleToProp: { color: true } } })

/**
 * §10 RecentWorkoutsSection (web `history/RecentWorkoutsSection.tsx` +
 * WorkoutLogItem): actividad reciente AGRUPADA POR DIA (dia + "N series
 * registradas" + badge). Cascada fade-up. Null si no hay registros — incluyendo
 * su propia SectionTitle ("Actividad reciente" · acción "Historial"), que vive
 * DENTRO de la sección (espejo web RecentWorkoutsSection.tsx:15-19: el header se
 * oculta junto con la card cuando no hay logs). Ventana 30d (paridad web
 * dashboard.queries.ts:147-148); contenedor transparente + borde subtle SIN
 * sombra (web RecentWorkoutsSection.tsx:20).
 */
export function RecentWorkouts({ clientId, onHistory }: { clientId: string; onHistory: () => void }) {
  const { theme } = useTheme()
  const [days, setDays] = useState<DaySummary[] | null>(null)

  useEffect(() => {
    getWorkoutDaySummaries(clientId, 30).then((d) => setDays(d)).catch(() => setDays([]))
  }, [clientId])

  if (days == null || days.length === 0) return null
  const rows = days.slice(0, 5)

  return (
    <View>
      <SectionTitle action="Historial" onAction={onHistory} actionTestID="home-history-link">Actividad reciente</SectionTitle>
      <View className="rounded-card border border-subtle" style={{ overflow: 'hidden' }}>
      {rows.map((d, idx) => {
        // dateLabel es-CL weekday-largo + dia + mes-corto ("lunes, 7 jul"), mapeado
        // aqui desde dayKey (paridad web dashboard.queries.ts:198-202). NO se toca
        // getWorkoutDaySummaries (compartida con historial, que declara paridad con
        // formatRelativeDate).
        const dateLabel = new Date(`${d.dayKey}T12:00:00`).toLocaleDateString('es-CL', {
          weekday: 'long',
          day: 'numeric',
          month: 'short',
        })
        return (
          <MotiView
            key={d.dayKey}
            from={{ opacity: 0, translateY: 8 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 320, delay: idx * 60 }}
            style={[styles.row, idx > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.border }]}
          >
            <View className="rounded-control bg-surface-sunken" style={styles.icon}>
              <Dumbbell size={18} className="text-sport-600" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text className="text-strong font-sans-bold" numberOfLines={1} style={{ fontSize: 14 }}>{dateLabel}</Text>
              <Text className="text-muted font-sans" numberOfLines={1} style={{ fontSize: 12 }}>{d.subtitle}</Text>
            </View>
            <Text className="text-subtle" style={{ fontFamily: FONT.uiBold, fontSize: 12, fontVariant: ['tabular-nums'] }}>
              {d.sets} {d.sets === 1 ? 'serie' : 'series'}
            </Text>
          </MotiView>
        )
      })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  icon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
})
