import { useEffect, useState } from 'react'
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Calendar, Dumbbell, Plus } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useRouter } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { getCoachProfile } from '../../../lib/coach'
import { useTheme } from '../../../context/ThemeContext'
import { EmptyState, ScreenHeader } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab']

interface Client { id: string; full_name: string }
interface Plan {
  id: string
  title: string
  day_of_week: number | null
  assigned_date: string | null
  blockCount: number
}

export default function BuilderScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [plans, setPlans] = useState<Plan[]>([])
  const [loadingClients, setLoadingClients] = useState(true)
  const [loadingPlans, setLoadingPlans] = useState(false)

  useEffect(() => {
    loadClients()
  }, [])

  async function loadClients() {
    setLoadingClients(true)
    const coach = await getCoachProfile()
    if (!coach) { setLoadingClients(false); return }

    const { data } = await supabase
      .from('clients')
      .select('id, full_name')
      .eq('coach_id', coach.id)
      .eq('is_archived', false)
      .eq('is_active', true)
      .order('full_name')

    setClients(data ?? [])
    setLoadingClients(false)
  }

  async function selectClient(client: Client) {
    setSelectedClient(client)
    setPlans([])
    setLoadingPlans(true)

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
        .limit(10)

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
    setLoadingPlans(false)
  }

  return (
    <SafeAreaView edges={[]} style={[styles.container, { backgroundColor: theme.background }]}>
      <AppBackground />
      <ScreenHeader
        title="Programas"
        subtitle={
          clients.length === 0
            ? 'Sin alumnos activos'
            : selectedClient
            ? `Planes de ${selectedClient.full_name}`
            : 'Selecciona un alumno'
        }
      />

      {loadingClients ? (
        <EvaLoaderScreen subtitle="Cargando programas..." />
      ) : (
        <View style={{ flex: 1 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerRow}>
            {clients.map((c) => {
              const active = selectedClient?.id === c.id
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[
                    styles.clientChip,
                    {
                      borderColor: active ? theme.primary : theme.border,
                      backgroundColor: active ? theme.primary : theme.secondary,
                      borderRadius: theme.radius.lg,
                    },
                  ]}
                  onPress={() => selectClient(c)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: active ? theme.primaryForeground : theme.foreground,
                        fontFamily: 'Montserrat_700Bold',
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {c.full_name}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>

          {!selectedClient ? (
            <EmptyState
              icon={Dumbbell}
              title="Elige un alumno"
              subtitle="Toca un nombre arriba para ver sus planes de entrenamiento."
            />
          ) : loadingPlans ? (
            <EvaLoaderScreen subtitle="Cargando planes..." />
          ) : plans.length === 0 ? (
            <EmptyState
              icon={Dumbbell}
              title="Sin planes asignados"
              subtitle="Crea el primer plan para este alumno."
            />
          ) : (
            <FlatList
              data={plans}
              keyExtractor={(p) => p.id}
              renderItem={({ item, index }) => (
                <MotiView
                  from={{ opacity: 0, translateY: 12 }}
                  animate={{ opacity: 1, translateY: 0 }}
                  transition={{ type: 'timing', duration: 350, delay: Math.min(index * 50, 400) }}
                >
                  <View
                    style={[
                      styles.planCard,
                      { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl },
                    ]}
                  >
                    <View
                      style={[
                        styles.planIcon,
                        {
                          backgroundColor: theme.primary + '1A',
                          borderColor: theme.primary + '33',
                          borderRadius: theme.radius.lg,
                        },
                      ]}
                    >
                      <Dumbbell size={20} color={theme.primary} strokeWidth={1.75} />
                    </View>
                    <View style={styles.planLeft}>
                      {item.day_of_week != null && (
                        <View style={styles.dowRow}>
                          <Calendar size={12} color={theme.primary} />
                          <Text style={[styles.dow, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>
                            {DAY_NAMES[item.day_of_week]}
                          </Text>
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
                  </View>
                </MotiView>
              )}
              contentContainerStyle={styles.planList}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      )}

      {/* FAB: create new plan for selected client */}
      {selectedClient && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: theme.primary }]}
          onPress={() =>
            router.push({
              pathname: '/coach/program-builder',
              params: { clientId: selectedClient.id, clientName: selectedClient.full_name },
            })
          }
          activeOpacity={0.85}
        >
          <Plus size={24} color="#fff" />
        </TouchableOpacity>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, position: 'relative' },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  pickerRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  clientChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    maxWidth: 180,
  },
  chipText: { fontSize: 13, letterSpacing: 0.3 },
  planList: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  planCard: { padding: 16, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  planIcon: { width: 42, height: 42, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  planLeft: { gap: 6, flex: 1, minWidth: 0 },
  dowRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dow: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  planTitle: { fontSize: 16, letterSpacing: -0.2 },
  planSub: { fontSize: 13 },
})
