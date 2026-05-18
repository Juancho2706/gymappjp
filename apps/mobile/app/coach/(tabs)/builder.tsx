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

    // Try active program first
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
        <Text style={[styles.title, { color: theme.text }]}>Programas</Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>Selecciona un cliente</Text>
      </View>

      {loadingClients ? (
        <ActivityIndicator style={{ flex: 1 }} color={theme.primary} />
      ) : (
        <View style={{ flex: 1 }}>
          {/* Client picker */}
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
                    { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary : theme.card },
                  ]}
                  onPress={() => selectClient(c)}
                >
                  <Text style={[styles.chipText, { color: active ? '#fff' : theme.text }]} numberOfLines={1}>
                    {c.full_name}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>

          {/* Plans list */}
          {!selectedClient ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: theme.muted }]}>
                Elige un cliente para ver sus planes
              </Text>
            </View>
          ) : loadingPlans ? (
            <ActivityIndicator style={{ marginTop: 32 }} color={theme.primary} />
          ) : plans.length === 0 ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyText, { color: theme.muted }]}>Sin planes asignados</Text>
              <Text style={[styles.webHint, { color: theme.muted }]}>
                Crea planes desde la app web
              </Text>
            </View>
          ) : (
            <FlatList
              data={plans}
              keyExtractor={(p) => p.id}
              renderItem={({ item }) => (
                <View style={[styles.planCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
                  <View style={styles.planLeft}>
                    {item.day_of_week != null && (
                      <Text style={[styles.dow, { color: theme.primary }]}>
                        {DAY_NAMES[item.day_of_week]}
                      </Text>
                    )}
                    <Text style={[styles.planTitle, { color: theme.text }]}>{item.title}</Text>
                    <Text style={[styles.planSub, { color: theme.muted }]}>
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
  header: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: 2 },
  pickerRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  clientChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, maxWidth: 160 },
  chipText: { fontSize: 14, fontWeight: '600' },
  planList: { paddingHorizontal: 16, paddingBottom: 24, gap: 10 },
  planCard: { borderRadius: 14, padding: 16, borderWidth: 1 },
  planLeft: { gap: 4 },
  dow: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  planTitle: { fontSize: 15, fontWeight: '600' },
  planSub: { fontSize: 13 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
  emptyText: { fontSize: 15, textAlign: 'center' },
  webHint: { fontSize: 13, textAlign: 'center' },
})
