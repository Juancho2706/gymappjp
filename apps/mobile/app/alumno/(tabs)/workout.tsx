import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { ChevronRight, Dumbbell, RefreshCw } from 'lucide-react-native'
import { MotiView } from 'moti'
import { supabase } from '../../../lib/supabase'
import { getClientProfile } from '../../../lib/client'
import { flushLogQueue, getPendingLogCount } from '../../../lib/offline-cache'
import { useTheme } from '../../../context/ThemeContext'
import { Badge, EmptyState, ScreenHeader } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AppBackground } from '../../../components/AppBackground'

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

  function renderPlan({ item, index }: { item: Plan; index: number }) {
    const isToday = item.day_of_week === TODAY_DOW
    return (
      <MotiView
        from={{ opacity: 0, translateY: 12 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: 350, delay: Math.min(index * 60, 400) }}
      >
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
                {isToday && <Badge label="HOY" tone="primary" />}
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
          <ChevronRight size={22} color={isToday ? theme.primary : theme.mutedForeground} />
        </TouchableOpacity>
      </MotiView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <AppBackground />
      <ScreenHeader
        title="Mi entrenamiento"
        subtitle="Tocá el plan de hoy para empezar"
        trailing={
          pendingLogs > 0 ? (
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
                <>
                  <RefreshCw size={13} color={theme.primary} strokeWidth={2.25} />
                  <Text style={[styles.syncText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>
                    Sync ({pendingLogs})
                  </Text>
                </>
              )}
            </TouchableOpacity>
          ) : null
        }
      />

      {loading ? (
        <EvaLoaderScreen subtitle="Cargando rutinas…" />
      ) : plans.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title="Sin programa activo"
          subtitle="Tu coach aún no te asignó un plan de entrenamiento."
        />
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
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
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
  planTitle: { fontSize: 17, letterSpacing: -0.2 },
  planSub: { fontSize: 13 },
})
