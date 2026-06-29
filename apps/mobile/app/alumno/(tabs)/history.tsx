import { useEffect, useState } from 'react'
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { ChevronDown, Dumbbell, History } from 'lucide-react-native'
import { getClientProfile } from '../../../lib/client'
import {
  getWorkoutDaySummaries,
  HISTORY_DAYS_DEFAULT,
  HISTORY_DAYS_EXTENDED,
  type DaySummary,
} from '../../../lib/history.queries'
import { useTheme } from '../../../context/ThemeContext'
import { EmptyState, ScreenHeader } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AppBackground } from '../../../components/AppBackground'

const FONT_BOLD = 'HankenGrotesk_700Bold'
const FONT_MONO = 'JetBrainsMono_700Bold'

export default function HistoryScreen() {
  const { theme } = useTheme()
  const [loading, setLoading] = useState(true)
  const [expanding, setExpanding] = useState(false)
  const [daysBack, setDaysBack] = useState(HISTORY_DAYS_DEFAULT)
  const [summaries, setSummaries] = useState<DaySummary[]>([])

  useEffect(() => { load(HISTORY_DAYS_DEFAULT).catch(() => setLoading(false)) }, [])

  async function load(days: number) {
    setLoading(true)
    const client = await getClientProfile()
    if (!client) { setLoading(false); return }

    // Conteo de series por día agregado en DB (RPC) — 90d por defecto, 180d al "ver más".
    const data = await getWorkoutDaySummaries(client.id, days)
    setSummaries(data)
    setDaysBack(days)
    setLoading(false)
  }

  async function showMore() {
    setExpanding(true)
    try {
      await load(HISTORY_DAYS_EXTENDED)
    } finally {
      setExpanding(false)
    }
  }

  const monthsLabel = daysBack >= HISTORY_DAYS_EXTENDED ? '6 meses' : '3 meses'

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <AppBackground />
        <ScreenHeader title="Historial" subtitle="Tus entrenamientos" />
        <EvaLoaderScreen subtitle="Cargando historial…" />
      </SafeAreaView>
    )
  }

  if (summaries.length === 0) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <AppBackground />
        <ScreenHeader title="Historial" subtitle="Tus entrenamientos" />
        <EmptyState icon={History} title="Sin historial" subtitle="Completá tu primer entrenamiento para verlo aquí." />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <AppBackground />
      <FlatList
        data={summaries}
        keyExtractor={(d) => d.dayKey}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <ScreenHeader title="Historial" subtitle={`${summaries.length} días de entrenamiento`} />
        }
        renderItem={({ item, index }) => {
          const isFirst = index === 0
          const isLast = index === summaries.length - 1
          return (
            <View
              style={[
                styles.row,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  borderTopWidth: isFirst ? 1 : 0,
                  borderTopLeftRadius: isFirst ? 20 : 0,
                  borderTopRightRadius: isFirst ? 20 : 0,
                  borderBottomLeftRadius: isLast ? 20 : 0,
                  borderBottomRightRadius: isLast ? 20 : 0,
                },
              ]}
            >
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
          )
        }}
        ListFooterComponent={
          <View>
            {daysBack < HISTORY_DAYS_EXTENDED ? (
              <TouchableOpacity
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
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
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
    borderWidth: 1,
    borderRadius: 999,
  },
  moreTxt: { fontSize: 13.5 },
  disclaimer: { fontSize: 11.5, lineHeight: 17, textAlign: 'center', marginTop: 16 },
})
