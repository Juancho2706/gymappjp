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

    // Try to get active program plans
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
      // Fallback: fetch standalone plans (no program)
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
          { backgroundColor: theme.card, borderColor: isToday ? theme.primary : theme.border },
          isToday && styles.cardToday,
        ]}
        onPress={() => router.push(`/alumno/workout/${item.id}`)}
        activeOpacity={0.8}
      >
        <View style={styles.cardLeft}>
          {item.day_of_week != null && (
            <Text style={[styles.dow, { color: isToday ? theme.primary : theme.muted }]}>
              {DAY_NAMES[item.day_of_week]}{isToday ? ' · HOY' : ''}
            </Text>
          )}
          <Text style={[styles.planTitle, { color: theme.text }]}>{item.title}</Text>
          <Text style={[styles.planSub, { color: theme.muted }]}>
            {item.blockCount} ejercicio{item.blockCount !== 1 ? 's' : ''}
          </Text>
        </View>
        <Text style={[styles.arrow, { color: theme.primary }]}>→</Text>
      </TouchableOpacity>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Mi entrenamiento</Text>
        {pendingLogs > 0 && (
          <TouchableOpacity
            style={[styles.syncBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
            onPress={handleSync}
            disabled={syncing}
          >
            {syncing ? (
              <ActivityIndicator size="small" color={theme.primary} />
            ) : (
              <Text style={[styles.syncText, { color: theme.primary }]}>
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
          <Text style={[styles.emptyText, { color: theme.muted }]}>
            Tu coach aún no ha asignado un programa
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 },
  title: { fontSize: 24, fontWeight: '700' },
  syncBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  syncText: { fontSize: 13, fontWeight: '600' },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  card: { borderRadius: 16, padding: 20, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardToday: { borderWidth: 2 },
  cardLeft: { gap: 4, flex: 1 },
  dow: { fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  planTitle: { fontSize: 17, fontWeight: '600' },
  planSub: { fontSize: 13 },
  arrow: { fontSize: 20, marginLeft: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 22 },
})
