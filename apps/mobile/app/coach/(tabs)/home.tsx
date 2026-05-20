import { useEffect, useState } from 'react'
import { ActivityIndicator, FlatList, SafeAreaView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import { CalendarCheck, ChevronRight, Dumbbell, Users } from 'lucide-react-native'
import { MotiView } from 'moti'
import { supabase } from '../../../lib/supabase'
import { getCoachProfile } from '../../../lib/coach'
import { useTheme } from '../../../context/ThemeContext'
import { Card, EmptyState, ScreenHeader } from '../../../components'

interface TodayWorkout {
  id: string
  title: string
  client_id: string | null
  clients: { full_name: string } | null
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function mondayIso(): string {
  const d = new Date()
  const day = d.getDay() || 7
  d.setDate(d.getDate() - day + 1)
  d.setHours(0, 0, 0, 0)
  return isoDate(d)
}

export default function CoachHomeScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [activeClients, setActiveClients] = useState(0)
  const [weeklyCheckIns, setWeeklyCheckIns] = useState(0)
  const [todayWorkouts, setTodayWorkouts] = useState<TodayWorkout[]>([])

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const coach = await getCoachProfile()
    if (!coach) { setLoading(false); return }

    const today = isoDate(new Date())
    const weekStart = mondayIso()

    const [{ count: clientsCount }, { data: clientRows }, { data: workoutRows }] = await Promise.all([
      supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('coach_id', coach.id)
        .eq('is_archived', false)
        .eq('is_active', true),
      supabase
        .from('clients')
        .select('id')
        .eq('coach_id', coach.id)
        .eq('is_archived', false),
      supabase
        .from('workout_plans')
        .select('id, title, client_id, clients ( full_name )')
        .eq('coach_id', coach.id)
        .eq('assigned_date', today)
        .limit(10),
    ])

    const clientIds = (clientRows ?? []).map((c) => c.id)
    let checkInCount = 0
    if (clientIds.length) {
      const { count } = await supabase
        .from('check_ins')
        .select('id', { count: 'exact', head: true })
        .in('client_id', clientIds)
        .gte('date', weekStart)
      checkInCount = count ?? 0
    }

    setActiveClients(clientsCount ?? 0)
    setWeeklyCheckIns(checkInCount)
    setTodayWorkouts(
      (workoutRows ?? []).map((row) => ({
        ...row,
        clients: Array.isArray(row.clients) ? row.clients[0] ?? null : row.clients,
      })) as TodayWorkout[]
    )
    setLoading(false)
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator style={{ flex: 1 }} color={theme.primary} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScreenHeader title="Dashboard" subtitle="Resumen operativo de hoy" />

      <View style={styles.content}>
        <View style={styles.statsGrid}>
          <StatCard icon={Users} label="Alumnos activos" value={activeClients} />
          <StatCard icon={CalendarCheck} label="Check-ins semana" value={weeklyCheckIns} color="#10B981" />
          <StatCard icon={Dumbbell} label="Workouts hoy" value={todayWorkouts.length} color="#F59E0B" />
        </View>

        <Card style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
              Proximos workouts
            </Text>
            <Text style={[styles.sectionSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              Hoy
            </Text>
          </View>

          {todayWorkouts.length === 0 ? (
            <EmptyState icon={Dumbbell} title="Sin workouts hoy" subtitle="Los planes asignados para hoy apareceran aca." />
          ) : (
            <FlatList
              data={todayWorkouts}
              keyExtractor={(item) => item.id}
              scrollEnabled={false}
              renderItem={({ item, index }) => (
                <MotiView
                  from={{ opacity: 0, translateY: 10 }}
                  animate={{ opacity: 1, translateY: 0 }}
                  transition={{ type: 'timing', duration: 320, delay: Math.min(index * 50, 300) }}
                >
                  <TouchableOpacity
                    style={[styles.workoutRow, index < todayWorkouts.length - 1 && { borderBottomColor: theme.border }]}
                    activeOpacity={0.75}
                    onPress={() => item.client_id && router.push(`/coach/cliente/${item.client_id}`)}
                  >
                    <View style={styles.workoutCopy}>
                      <Text style={[styles.workoutTitle, { color: theme.foreground, fontFamily: 'Montserrat_600SemiBold' }]} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text style={[styles.workoutClient, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>
                        {item.clients?.full_name ?? 'Alumno'}
                      </Text>
                    </View>
                    <ChevronRight size={18} color={theme.mutedForeground} />
                  </TouchableOpacity>
                </MotiView>
              )}
            />
          )}
        </Card>
      </View>
    </SafeAreaView>
  )
}

function StatCard({ icon: Icon, label, value, color }: { icon: typeof Users; label: string; value: number; color?: string }) {
  const { theme } = useTheme()
  const c = color ?? theme.primary
  return (
    <MotiView
      from={{ opacity: 0, translateY: 12 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 350 }}
      style={styles.statWrap}
    >
      <Card padding={14} style={styles.statCard}>
        <View style={[styles.statIcon, { backgroundColor: c + '15', borderRadius: theme.radius.lg }]}>
          <Icon size={19} color={c} />
        </View>
        <Text style={[styles.statValue, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>
          {value}
        </Text>
        <Text style={[styles.statLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={2}>
          {label}
        </Text>
      </Card>
    </MotiView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 16, paddingBottom: 32, gap: 12 },
  statsGrid: { flexDirection: 'row', gap: 8 },
  statWrap: { flex: 1 },
  statCard: { minHeight: 126, gap: 8 },
  statIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  statValue: { fontSize: 26, letterSpacing: -0.7 },
  statLabel: { fontSize: 11, lineHeight: 15 },
  sectionCard: { gap: 6 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  sectionTitle: { fontSize: 16, letterSpacing: -0.2 },
  sectionSub: { fontSize: 12 },
  workoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  workoutCopy: { flex: 1, minWidth: 0, gap: 3 },
  workoutTitle: { fontSize: 14 },
  workoutClient: { fontSize: 12 },
})
