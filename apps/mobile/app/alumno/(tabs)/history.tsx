import { useEffect, useState } from 'react'
import {
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Dumbbell, History } from 'lucide-react-native'
import { MotiView } from 'moti'
import { getClientProfile } from '../../../lib/client'
import {
  getWorkoutDaySummaries,
  type DaySummary,
  HISTORY_DAYS_DEFAULT,
  HISTORY_DAYS_EXTENDED,
} from '../../../lib/history.queries'
import { useTheme } from '../../../context/ThemeContext'
import { EmptyState, ScreenHeader } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AppBackground } from '../../../components/AppBackground'

export default function HistoryScreen() {
  const { theme } = useTheme()
  const [loading, setLoading] = useState(true)
  const [expanding, setExpanding] = useState(false)
  const [daysBack, setDaysBack] = useState(HISTORY_DAYS_DEFAULT)
  const [items, setItems] = useState<DaySummary[]>([])

  useEffect(() => { load(HISTORY_DAYS_DEFAULT).catch(() => setLoading(false)) }, [])

  async function load(days: number) {
    setLoading(true)
    const client = await getClientProfile()
    if (!client) { setLoading(false); return }

    // Conteo de series por día agregado en DB (RPC) — 90d por defecto, 180d al "ver más".
    const summaries = await getWorkoutDaySummaries(client.id, days)
    setItems(summaries)
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

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <AppBackground />
        <ScreenHeader title="Historial" subtitle="Tus entrenamientos" />
        <EvaLoaderScreen subtitle="Cargando historial…" />
      </SafeAreaView>
    )
  }

  if (items.length === 0) {
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
        data={items}
        keyExtractor={(item) => item.dayKey}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <ScreenHeader title="Historial" subtitle={`${items.length} días de entrenamiento`} />
        }
        renderItem={({ item, index }) => (
          <MotiView
            from={{ opacity: 0, translateY: 8 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 280, delay: Math.min(index * 30, 240) }}
          >
            <View
              style={[
                styles.row,
                index < items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
              ]}
            >
              <View style={[styles.icon, { backgroundColor: theme.primary + '1A', borderRadius: theme.radius.md }]}>
                <Dumbbell size={16} color={theme.primary} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.dateLabel, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>
                  {item.dateLabel}
                </Text>
                <Text style={[styles.subtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                  {item.subtitle}
                </Text>
              </View>
              <Text style={[styles.count, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>
                {item.sets} {item.sets === 1 ? 'serie' : 'series'}
              </Text>
            </View>
          </MotiView>
        )}
        ListFooterComponent={
          daysBack < HISTORY_DAYS_EXTENDED && items.length > 0 ? (
            <TouchableOpacity
              activeOpacity={0.82}
              onPress={showMore}
              disabled={expanding}
              style={[styles.moreBtn, { borderColor: theme.border, backgroundColor: theme.card, borderRadius: theme.radius.xl }]}
            >
              <Text style={[styles.moreTxt, { color: theme.primary, fontFamily: 'Inter_600SemiBold' }]}>
                {expanding ? 'Cargando…' : 'Ver más (180 días)'}
              </Text>
            </TouchableOpacity>
          ) : null
        }
      />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  icon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  dateLabel: { fontSize: 14 },
  subtitle: { fontSize: 10, marginTop: 1 },
  count: { fontSize: 12 },
  moreBtn: { marginTop: 14, paddingVertical: 13, alignItems: 'center', borderWidth: 1 },
  moreTxt: { fontSize: 14 },
})
