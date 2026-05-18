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

interface Client { id: string; full_name: string }
interface NutritionPlan {
  id: string
  name: string
  daily_calories: number | null
  protein_g: number | null
  carbs_g: number | null
  fats_g: number | null
  is_active: boolean
  mealCount: number
}

export default function CoachNutricionScreen() {
  const { theme } = useTheme()
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [plans, setPlans] = useState<NutritionPlan[]>([])
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

    const { data } = await supabase
      .from('nutrition_plans')
      .select('id, name, daily_calories, protein_g, carbs_g, fats_g, is_active, nutrition_meals ( id )')
      .eq('client_id', client.id)
      .order('is_active', { ascending: false })
      .order('created_at', { ascending: false })

    setPlans(
      (data ?? []).map((p: any) => ({
        id: p.id,
        name: p.name,
        daily_calories: p.daily_calories,
        protein_g: p.protein_g,
        carbs_g: p.carbs_g,
        fats_g: p.fats_g,
        is_active: p.is_active,
        mealCount: p.nutrition_meals?.length ?? 0,
      }))
    )
    setLoadingPlans(false)
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>Nutrición</Text>
        <Text style={[styles.subtitle, { color: theme.muted }]}>Selecciona un cliente</Text>
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
              <Text style={[styles.emptyText, { color: theme.muted }]}>Sin planes de nutrición</Text>
              <Text style={[styles.webHint, { color: theme.muted }]}>Crea planes desde la app web</Text>
            </View>
          ) : (
            <FlatList
              data={plans}
              keyExtractor={(p) => p.id}
              renderItem={({ item }) => (
                <View style={[
                  styles.planCard,
                  { backgroundColor: theme.card, borderColor: item.is_active ? theme.success : theme.border, borderWidth: item.is_active ? 2 : 1 },
                ]}>
                  <View style={styles.planTop}>
                    <Text style={[styles.planName, { color: theme.text }]}>{item.name}</Text>
                    {item.is_active && (
                      <View style={[styles.activeBadge, { backgroundColor: theme.success + '22' }]}>
                        <Text style={[styles.activeBadgeText, { color: theme.success }]}>Activo</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.planSub, { color: theme.muted }]}>
                    {item.mealCount} comida{item.mealCount !== 1 ? 's' : ''}
                  </Text>
                  {(item.daily_calories || item.protein_g || item.carbs_g || item.fats_g) ? (
                    <View style={styles.macrosRow}>
                      {item.daily_calories != null && <MacroChip label="kcal" value={item.daily_calories} color={theme.primary} theme={theme} />}
                      {item.protein_g != null && <MacroChip label="P" value={item.protein_g} color="#EF4444" theme={theme} />}
                      {item.carbs_g != null && <MacroChip label="C" value={item.carbs_g} color="#F59E0B" theme={theme} />}
                      {item.fats_g != null && <MacroChip label="G" value={item.fats_g} color="#8B5CF6" theme={theme} />}
                    </View>
                  ) : null}
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

function MacroChip({ label, value, color, theme }: { label: string; value: number; color: string; theme: any }) {
  return (
    <View style={[styles.macroChip, { borderColor: color }]}>
      <Text style={[styles.macroValue, { color }]}>{value}</Text>
      <Text style={[styles.macroLabel, { color: theme.muted }]}>{label}</Text>
    </View>
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
  planCard: { borderRadius: 14, padding: 16, gap: 8 },
  planTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planName: { fontSize: 15, fontWeight: '600', flex: 1 },
  activeBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  activeBadgeText: { fontSize: 11, fontWeight: '600' },
  planSub: { fontSize: 13 },
  macrosRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 },
  macroChip: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, alignItems: 'center', minWidth: 48 },
  macroValue: { fontSize: 13, fontWeight: '700' },
  macroLabel: { fontSize: 10, fontWeight: '500' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 8 },
  emptyText: { fontSize: 15, textAlign: 'center' },
  webHint: { fontSize: 13, textAlign: 'center' },
})
