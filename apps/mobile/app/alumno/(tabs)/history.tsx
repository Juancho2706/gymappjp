import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { MotiView } from 'moti'
import { AlertTriangle, Calendar, ChevronDown, Dumbbell } from 'lucide-react-native'
import { getClientProfile } from '../../../lib/client'
import {
  getWorkoutDaySummaries,
  HISTORY_DAYS_DEFAULT,
  HISTORY_DAYS_EXTENDED,
  type DaySummary,
} from '../../../lib/history.queries'
import { useTheme } from '../../../context/ThemeContext'
import { Button, ScreenHeader } from '../../../components'
import { Card } from '../../../components/Card'
import { EmptyState } from '../../../components/EmptyState'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AppBackground } from '../../../components/AppBackground'

const FONT_BOLD = 'HankenGrotesk_700Bold'
const FONT_MONO = 'JetBrainsMono_700Bold'

export default function HistoryScreen() {
  const { theme } = useTheme()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [expanding, setExpanding] = useState(false)
  const [daysBack, setDaysBack] = useState(HISTORY_DAYS_DEFAULT)
  const [summaries, setSummaries] = useState<DaySummary[]>([])

  useEffect(() => { void load(HISTORY_DAYS_DEFAULT) }, [])

  async function load(days: number) {
    setLoading(true)
    setError(false)
    try {
      const client = await getClientProfile()
      if (!client) { setLoading(false); return }

      // Conteo de series por día agregado en DB (RPC) — 90d por defecto, 180d al "ver más".
      const data = await getWorkoutDaySummaries(client.id, days)
      setSummaries(data)
      setDaysBack(days)
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  }

  async function showMore() {
    setExpanding(true)
    try {
      await load(HISTORY_DAYS_EXTENDED)
    } finally {
      setExpanding(false)
    }
  }

  const extended = daysBack >= HISTORY_DAYS_EXTENDED
  const monthsLabel = extended ? '6 meses' : '3 meses'
  const subtitle = `Días con series registradas (últimos ${monthsLabel})`

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <AppBackground />
        <ScreenHeader title="Historial de entrenos" subtitle={subtitle} />
        <EvaLoaderScreen subtitle="Cargando historial…" />
      </SafeAreaView>
    )
  }

  if (error) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <AppBackground />
        <ScreenHeader title="Historial de entrenos" subtitle={subtitle} />
        <View style={styles.errorBox}>
          <View
            style={{
              width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center',
              backgroundColor: theme.destructive + '14', borderWidth: 1, borderColor: theme.destructive + '33', marginBottom: 4,
            }}
          >
            <AlertTriangle size={26} color={theme.destructive} strokeWidth={1.9} />
          </View>
          <Text style={[styles.errorTitle, { color: theme.foreground, fontFamily: FONT_BOLD }]}>
            No pudimos cargar tu historial
          </Text>
          <Text style={[styles.errorSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Revisa tu conexión e intenta de nuevo en un momento.
          </Text>
          <Button testID="history-retry" label="Reintentar" variant="outline" onPress={() => load(daysBack)} />
        </View>
      </SafeAreaView>
    )
  }

  if (summaries.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <AppBackground />
        <ScreenHeader title="Historial de entrenos" subtitle={subtitle} />
        <EmptyState
          icon={Calendar}
          title="Aún no hay series registradas"
          subtitle="Cuando completes entrenos en este periodo, aparecerán aquí."
        />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <AppBackground />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <ScreenHeader title="Historial de entrenos" subtitle={subtitle} />

        <View style={styles.body}>
          {/* Un solo Card con filas y divisores hairline — 1:1 con WorkoutHistoryList (web). */}
          <Card padding="none" style={{ overflow: 'hidden' }}>
            {summaries.map((item, index) => (
              <MotiView
                key={item.dayKey}
                from={{ opacity: 0, translateY: 8 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: 'timing', duration: 280, delay: Math.min(index, 12) * 40 }}
              >
                {index > 0 ? (
                  <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border, marginHorizontal: 14 }} />
                ) : null}
                <View style={styles.row}>
                  <View style={[styles.dayChip, { backgroundColor: theme.muted, borderRadius: theme.radius.sm }]}>
                    <Dumbbell size={17} color={theme.primary} strokeWidth={2} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.dayLabel, { color: theme.foreground, fontFamily: FONT_BOLD }]} numberOfLines={1}>
                      {item.dateLabel}
                    </Text>
                    <Text style={[styles.daySub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>
                      {item.subtitle}
                    </Text>
                  </View>
                  <View style={[styles.setsPill, { backgroundColor: theme.muted }]}>
                    <Text style={[styles.setsPillText, { color: theme.foreground, fontFamily: FONT_MONO }]}>
                      {item.sets === 1 ? '1 serie' : `${item.sets} series`}
                    </Text>
                  </View>
                </View>
              </MotiView>
            ))}
          </Card>

          {!extended ? (
            <TouchableOpacity
              testID="history-show-more"
              activeOpacity={0.82}
              onPress={showMore}
              disabled={expanding}
              style={[styles.moreBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
            >
              <ChevronDown size={16} color={theme.primary} strokeWidth={2.25} />
              <Text style={[styles.moreTxt, { color: theme.foreground, fontFamily: FONT_BOLD }]}>
                {expanding ? 'Cargando…' : 'Ver últimos 6 meses'}
              </Text>
            </TouchableOpacity>
          ) : null}

          <Text style={[styles.disclaimer, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Solo ves tus propios registros. Mostrando los últimos {monthsLabel}.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingBottom: 40 },
  body: { paddingHorizontal: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  dayChip: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  dayLabel: { fontSize: 14.5, letterSpacing: -0.1, textTransform: 'capitalize' },
  daySub: { fontSize: 12.5, marginTop: 1 },
  setsPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  setsPillText: { fontSize: 12 },
  moreBtn: {
    marginTop: 14,
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderRadius: 999,
  },
  moreTxt: { fontSize: 13.5 },
  disclaimer: { fontSize: 11.5, lineHeight: 17, textAlign: 'center', marginTop: 16 },
  errorBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 32 },
  errorTitle: { fontSize: 17, letterSpacing: -0.3, textAlign: 'center' },
  errorSub: { fontSize: 13, lineHeight: 19, textAlign: 'center', maxWidth: 300, marginBottom: 4 },
})
