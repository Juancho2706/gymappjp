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
import { Apple, BadgeCheck, UtensilsCrossed } from 'lucide-react-native'
import { MotiView } from 'moti'
import { supabase } from '../../../lib/supabase'
import { getCoachProfile } from '../../../lib/coach'
import { useTheme } from '../../../context/ThemeContext'
import { EmptyState, MacroPill, ScreenHeader } from '../../../components'

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
      <ScreenHeader
        title="Nutricion"
        subtitle={selectedClient ? `Planes de ${selectedClient.full_name}` : 'Selecciona un alumno'}
      />

      {loadingClients ? (
        <ActivityIndicator style={{ flex: 1 }} color={theme.primary} />
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
              icon={UtensilsCrossed}
              title="Elige un alumno"
              subtitle="Toca un nombre arriba para ver sus planes de nutricion."
            />
          ) : loadingPlans ? (
            <ActivityIndicator style={{ marginTop: 32 }} color={theme.primary} />
          ) : plans.length === 0 ? (
            <EmptyState
              icon={Apple}
              title="Sin planes de nutricion"
              subtitle="Crea planes desde la app web en eva-app.cl."
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
                      {
                        backgroundColor: theme.card,
                        borderColor: item.is_active ? theme.success : theme.border,
                        borderWidth: item.is_active ? 2 : 1,
                        borderRadius: theme.radius.xl,
                      },
                    ]}
                  >
                    <View style={styles.planTop}>
                      <View style={styles.titleRow}>
                        <Apple size={18} color={theme.primary} strokeWidth={1.75} />
                        <Text
                          style={[styles.planName, { color: theme.foreground, fontFamily: 'Montserrat_600SemiBold' }]}
                          numberOfLines={2}
                        >
                          {item.name}
                        </Text>
                      </View>
                      {item.is_active ? (
                        <View style={[styles.activeBadge, { backgroundColor: theme.success + '22', borderRadius: theme.radius.sm }]}>
                          <BadgeCheck size={12} color={theme.success} />
                          <Text style={[styles.activeBadgeText, { color: theme.success, fontFamily: 'Montserrat_700Bold' }]}>
                            Activo
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={[styles.planSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                      {item.mealCount} comida{item.mealCount !== 1 ? 's' : ''}
                    </Text>
                    {(item.daily_calories || item.protein_g || item.carbs_g || item.fats_g) ? (
                      <View style={styles.macrosRow}>
                        {item.daily_calories != null && <MacroPill label="kcal" value={item.daily_calories} color={theme.primary} />}
                        {item.protein_g != null && <MacroPill label="P" value={item.protein_g} color="#EF4444" />}
                        {item.carbs_g != null && <MacroPill label="C" value={item.carbs_g} color="#F59E0B" />}
                        {item.fats_g != null && <MacroPill label="G" value={item.fats_g} color="#8B5CF6" />}
                      </View>
                    ) : null}
                  </View>
                </MotiView>
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
  pickerRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  clientChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderWidth: 1,
    maxWidth: 180,
  },
  chipText: { fontSize: 13, letterSpacing: 0.3 },
  planList: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  planCard: { padding: 16, gap: 8 },
  planTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  planName: { fontSize: 16, letterSpacing: -0.2, flex: 1 },
  activeBadge: { paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 },
  activeBadgeText: { fontSize: 11, letterSpacing: 0.3 },
  planSub: { fontSize: 13 },
  macrosRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 },
})
