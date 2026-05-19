import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { getClientProfile } from '../../../lib/client'
import { flushLogQueue, getPendingLogCount } from '../../../lib/offline-cache'
import { useTheme } from '../../../context/ThemeContext'

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const TODAY_DOW = new Date().getDay()

interface Plan {
  id: string
  title: string
  day_of_week: number | null
  assigned_date: string | null
  blockCount: number
}

export default function WorkoutScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const [plans, setPlans] = useState<Plan[]>([])
  const [loading, setLoading] = useState(true)
  const [pendingLogs, setPendingLogs] = useState(0)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const client = await getClientProfile()
    if (!client) { setLoading(false); return }

    const count = await getPendingLogCount()
    setPendingLogs(count)

    const { data: program } = await supabase
      .from('workout_programs')
      .select('id, name, workout_plans ( id, title, day_of_week, assigned_date, workout_blocks ( id ) )')
      .eq('client_id', client.id)
      .eq('is_active', true)
      .maybeSingle()

    if (program?.workout_plans) {
      const mapped = (program.workout_plans as any[]).map((p) => ({
        id: p.id,
        title: p.title,
        day_of_week: p.day_of_week,
        assigned_date: p.assigned_date,
        blockCount: p.workout_blocks?.length ?? 0,
      }))
      mapped.sort((a, b) => (a.day_of_week ?? 7) - (b.day_of_week ?? 7))
      setPlans(mapped)
    } else {
      const { data } = await supabase
        .from('workout_plans')
        .select('id, title, day_of_week, assigned_date, workout_blocks ( id )')
        .eq('client_id', client.id)
        .order('assigned_date', { ascending: false })
        .limit(14)
      setPlans(
        (data ?? []).map((p: any) => ({
          id: p.id,
          title: p.title,
          day_of_week: p.day_of_week,
          assigned_date: p.assigned_date,
          blockCount: p.workout_blocks?.length ?? 0,
        }))
      )
    }
    setLoading(false)
  }

  async function handleSync() {
    setSyncing(true)
    const synced = await flushLogQueue(supabase)
    if (synced > 0) setPendingLogs(0)
    setSyncing(false)
  }

  function renderPlan({ item }: { item: Plan }) {
    const isToday = item.day_of_week === TODAY_DOW
    return (
      <TouchableOpacity
        style={[
          styles.card,
          {
            backgroundColor: theme.card,
            borderColor: isToday ? theme.primary : theme.border,
            borderRadius: theme.radius.xl,
            borderWidth: isToday ? 2 : 1,
          },
          isToday && theme.shadowGlowBlue,
        ]}
        onPress={() => router.push(`/alumno/workout/${item.id}`)}
        activeOpacity={0.85}
      >
        <View style={styles.cardLeft}>
          {item.day_of_week != null && (
            <View style={styles.dowRow}>
              <Text
                style={[
                  styles.dow,
                  { color: isToday ? theme.primary : theme.mutedForeground, fontFamily: 'Montserrat_700Bold' },
                ]}
              >
                {DAY_NAMES[item.day_of_week]}
              </Text>
              {isToday && (
                <View
                  style={[
                    styles.todayChip,
                    { backgroundColor: theme.primary + '22', borderRadius: theme.radius.sm },
                  ]}
                >
                  <Text
                    style={[
                      styles.todayChipText,
                      { color: theme.primary, fontFamily: 'Montserrat_700Bold' },
                    ]}
                  >
                    HOY
                  </Text>
                </View>
              )}
            </View>
          )}
          <Text
            style={[styles.planTitle, { color: theme.foreground, fontFamily: 'Montserrat_600SemiBold' }]}
            numberOfLines={2}
          >
            {item.title}
          </Text>
          <Text style={[styles.planSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            {item.blockCount} ejercicio{item.blockCount !== 1 ? 's' : ''}
          </Text>
        </View>
        <Text style={[styles.arrow, { color: isToday ? theme.primary : theme.mutedForeground }]}>→</Text>
      </TouchableOpacity>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <View style={styles.headerTextWrap}>
          <Text
            style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}
          >
            Mi entrenamiento
          </Text>
          <Text style={[styles.subtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Toca el plan de hoy para empezar
          </Text>
        </View>
        {pendingLogs > 0 && (
          <TouchableOpacity
            style={[
              styles.syncBtn,
              {
                backgroundColor: theme.primary + '15',
                borderColor: theme.primary + '40',
                borderRadius: theme.radius.lg,
              },
            ]}
            onPress={handleSync}
            disabled={syncing}
            activeOpacity={0.8}
          >
            {syncing ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Text style={[styles.syncText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>
                Sync ({pendingLogs})
              </Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={theme.primary} />
      ) : plans.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
            Sin programa activo
          </Text>
          <Text style={[styles.emptySub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Tu coach aún no te asignó un plan de entrenamiento.
          </Text>
        </View>
      ) : (
        <FlatList
          data={plans}
          keyExtractor={(p) => p.id}
          renderItem={renderPlan}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    gap: 12,
  },
  headerTextWrap: { flex: 1, minWidth: 0 },
  title: { fontSize: 28, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 4 },
  syncBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
  },
  syncText: { fontSize: 12, letterSpacing: 0.3 },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  card: {
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardLeft: { gap: 6, flex: 1 },
  dowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dow: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  todayChip: { paddingHorizontal: 7, paddingVertical: 2 },
  todayChipText: { fontSize: 10, letterSpacing: 0.8 },
  planTitle: { fontSize: 17, letterSpacing: -0.2 },
  planSub: { fontSize: 13 },
  arrow: { fontSize: 22, marginLeft: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, marginBottom: 8 },
  emptySub: { fontSize: 14, textAlign: 'center', lineHeight: 21 },
})
