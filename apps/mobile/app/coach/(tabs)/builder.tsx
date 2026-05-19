import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { supabase } from '../../../lib/supabase'
import { getCoachProfile } from '../../../lib/coach'
import { useTheme } from '../../../context/ThemeContext'

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

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
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
          Programas
        </Text>
        <Text style={[styles.subtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          {clients.length === 0
            ? 'Sin alumnos activos'
            : selectedClient
            ? `Planes de ${selectedClient.full_name}`
            : 'Selecciona un alumno'}
        </Text>
      </View>

      {loadingClients ? (
        <ActivityIndicator style={{ flex: 1 }} color={theme.primary} />
      ) : (
        <View style={{ flex: 1 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.pickerRow}
          >
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
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
                Elige un alumno
              </Text>
              <Text style={[styles.emptySub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                Tocá un nombre arriba para ver sus planes de entrenamiento.
              </Text>
            </View>
          ) : loadingPlans ? (
            <ActivityIndicator style={{ marginTop: 32 }} color={theme.primary} />
          ) : plans.length === 0 ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
                Sin planes asignados
              </Text>
              <Text style={[styles.emptySub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                Crea planes desde la app web en eva-app.cl
              </Text>
            </View>
          ) : (
            <FlatList
              data={plans}
              keyExtractor={(p) => p.id}
              renderItem={({ item }) => (
                <View
                  style={[
                    styles.planCard,
                    { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl },
                  ]}
                >
                  <View style={styles.planLeft}>
                    {item.day_of_week != null && (
                      <Text
                        style={[styles.dow, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}
                      >
                        {DAY_NAMES[item.day_of_week]}
                      </Text>
                    )}
                    <Text
                      style={[styles.planTitle, { color: theme.foreground, fontFamily: 'Montserrat_600SemiBold' }]}
                      numberOfLines={2}
                    >
                      {item.title}
                    </Text>
                    <Text
                      style={[styles.planSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}
                    >
                      {item.blockCount} ejercicio{item.blockCount !== 1 ? 's' : ''}
                    </Text>
                  </View>
                </View>
              )}
              contentContainerStyle={styles.planList}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 12 },
  title: { fontSize: 28, letterSpacing: -0.5 },
  subtitle: { fontSize: 13, marginTop: 4 },
  pickerRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  clientChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    maxWidth: 180,
  },
  chipText: { fontSize: 13, letterSpacing: 0.3 },
  planList: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  planCard: { padding: 16, borderWidth: 1 },
  planLeft: { gap: 6 },
  dow: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  planTitle: { fontSize: 16, letterSpacing: -0.2 },
  planSub: { fontSize: 13 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: { fontSize: 17, marginBottom: 8 },
  emptySub: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
})
