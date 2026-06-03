import { useEffect, useState } from 'react'
import {
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { History } from 'lucide-react-native'
import { getClientProfile } from '../../../lib/client'
import { getWorkoutHistoryFull, buildDaySummaries } from '../../../lib/history.queries'
import type { DaySummary } from '../../../lib/history.queries'
import { useTheme } from '../../../context/ThemeContext'
import { EmptyState, ScreenHeader } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AppBackground } from '../../../components/AppBackground'

export default function HistoryScreen() {
  const { theme } = useTheme()
  const [loading, setLoading] = useState(true)
  const [sections, setSections] = useState<{ title: string; subtitle: string; data: string[] }[]>([])

  useEffect(() => { load().catch(() => setLoading(false)) }, [])

  async function load() {
    setLoading(true)
    const client = await getClientProfile()
    if (!client) { setLoading(false); return }

    const { data } = await getWorkoutHistoryFull(client.id)
    const summaries = buildDaySummaries((data ?? []) as any[])
    setSections(summaries.map((s) => ({
      title: s.dateLabel,
      subtitle: s.subtitle,
      data: [s.dayKey],
    })))
    setLoading(false)
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
})
