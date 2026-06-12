import { useEffect, useState } from 'react'
import {
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { History } from 'lucide-react-native'
import { getClientProfile } from '../../../lib/client'
import {
  getWorkoutDaySummaries,
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
  const [sections, setSections] = useState<{ title: string; subtitle: string; data: string[] }[]>([])

  useEffect(() => { load(HISTORY_DAYS_DEFAULT).catch(() => setLoading(false)) }, [])

  async function load(days: number) {
    setLoading(true)
    const client = await getClientProfile()
    if (!client) { setLoading(false); return }

    // Conteo de series por día agregado en DB (RPC) — 90d por defecto, 180d al "ver más".
    const summaries = await getWorkoutDaySummaries(client.id, days)
    setSections(summaries.map((s) => ({
      title: s.dateLabel,
      subtitle: s.subtitle,
      data: [s.dayKey],
    })))
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

  if (sections.length === 0) {
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
      <SectionList
        sections={sections}
        keyExtractor={(item) => item}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <ScreenHeader title="Historial" subtitle={`${sections.length} días de entrenamiento`} />
        }
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { backgroundColor: theme.background }]}>
            <Text style={[styles.sectionTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
              {section.title}
            </Text>
            <Text style={[styles.sectionSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              {section.subtitle}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <View style={[styles.dayCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
            <View style={[styles.dayDot, { backgroundColor: theme.primary }]} />
            <Text style={[styles.dayLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              {item}
            </Text>
          </View>
        )}
        SectionSeparatorComponent={() => <View style={{ height: 4 }} />}
        ListFooterComponent={
          daysBack < HISTORY_DAYS_EXTENDED && sections.length > 0 ? (
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
  sectionHeader: { paddingTop: 16, paddingBottom: 6 },
  sectionTitle: { fontSize: 17, letterSpacing: -0.2 },
  sectionSub: { fontSize: 12, marginTop: 2 },
  dayCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, marginBottom: 4 },
  dayDot: { width: 8, height: 8, borderRadius: 4 },
  dayLabel: { fontSize: 13 },
  moreBtn: { marginTop: 14, paddingVertical: 13, alignItems: 'center', borderWidth: 1 },
  moreTxt: { fontSize: 14 },
})
