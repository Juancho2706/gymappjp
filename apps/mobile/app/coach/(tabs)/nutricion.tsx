import { useCallback, useEffect, useState } from 'react'
import { Alert, FlatList, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { Apple, BadgeCheck, CheckCircle2, Copy, Plus, Trash2, UtensilsCrossed } from 'lucide-react-native'
import { MotiView } from 'moti'
import { supabase } from '../../../lib/supabase'
import { getCoachProfile } from '../../../lib/coach'
import { useTheme } from '../../../context/ThemeContext'
import { EmptyState, MacroPill, NativeDialog, ScreenHeader } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { deletePlan, duplicatePlanToClient, getClientPlans, setPlanActive, type PlanSummary } from '../../../lib/nutrition-builder'

interface Client { id: string; full_name: string }

export default function CoachNutricionScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const [clients, setClients] = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [plans, setPlans] = useState<PlanSummary[]>([])
  const [loadingClients, setLoadingClients] = useState(true)
  const [loadingPlans, setLoadingPlans] = useState(false)
  const [copyPlan, setCopyPlan] = useState<PlanSummary | null>(null)
  const [copyBusy, setCopyBusy] = useState(false)

  useEffect(() => { loadClients() }, [])

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

  const loadPlans = useCallback(async (clientId: string) => {
    setLoadingPlans(true)
    setPlans(await getClientPlans(clientId))
    setLoadingPlans(false)
  }, [])

  function selectClient(client: Client) {
    setSelectedClient(client)
    setPlans([])
    loadPlans(client.id)
  }

  // Reload the selected client's plans when returning from the builder.
  useFocusEffect(useCallback(() => {
    if (selectedClient) loadPlans(selectedClient.id)
  }, [selectedClient, loadPlans]))

  function openBuilder(planId?: string) {
    if (!selectedClient) return
    const base = `/coach/nutrition-builder?clientId=${selectedClient.id}&clientName=${encodeURIComponent(selectedClient.full_name)}`
    router.push(planId ? `${base}&planId=${planId}` : base)
  }

  async function activate(plan: PlanSummary) {
    if (!selectedClient) return
    const r = await setPlanActive(selectedClient.id, plan.id)
    if (!r.ok) { Alert.alert('Error', r.error ?? 'No se pudo activar.'); return }
    loadPlans(selectedClient.id)
  }

  function confirmDelete(plan: PlanSummary) {
    if (!selectedClient) return
    Alert.alert('Eliminar plan', `¿Eliminar "${plan.name}"? No se puede deshacer.`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        const r = await deletePlan(plan.id)
        if (!r.ok) { Alert.alert('Error', r.error ?? 'No se pudo eliminar.'); return }
        loadPlans(selectedClient.id)
      } },
    ])
  }

  async function copyToClient(targetId: string) {
    if (!copyPlan) return
    setCopyBusy(true)
    const r = await duplicatePlanToClient(copyPlan.id, targetId)
    setCopyBusy(false)
    setCopyPlan(null)
    if (!r.ok) { Alert.alert('Error', r.error ?? 'No se pudo copiar.'); return }
    Alert.alert('Plan copiado', 'El plan quedó activo para el alumno elegido.')
  }

  return (
    <SafeAreaView edges={[]} style={[styles.container, { backgroundColor: theme.background }]}>
      <AppBackground />
      <ScreenHeader
        title="Nutricion"
        subtitle={selectedClient ? `Planes de ${selectedClient.full_name}` : 'Selecciona un alumno'}
        trailing={selectedClient ? (
          <TouchableOpacity onPress={() => openBuilder()} activeOpacity={0.85} style={[styles.headerBtn, { backgroundColor: theme.primary }]}>
            <Plus size={20} color={theme.primaryForeground} />
          </TouchableOpacity>
        ) : undefined}
      />

      {loadingClients ? (
        <EvaLoaderScreen subtitle="Cargando alumnos…" />
      ) : (
        <View style={{ flex: 1 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerRow}>
            {clients.map((c) => {
              const active = selectedClient?.id === c.id
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.clientChip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary : theme.secondary, borderRadius: theme.radius.lg }]}
                  onPress={() => selectClient(c)}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.chipText, { color: active ? theme.primaryForeground : theme.foreground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={1}>
                    {c.full_name}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>

          {!selectedClient ? (
            <EmptyState icon={UtensilsCrossed} title="Elige un alumno" subtitle="Toca un nombre arriba para ver y crear sus planes de nutricion." />
          ) : loadingPlans ? (
            <EvaLoaderScreen subtitle="Cargando planes…" />
          ) : plans.length === 0 ? (
            <View style={{ flex: 1 }}>
              <EmptyState icon={Apple} title="Sin planes de nutricion" subtitle="Toca + para crear el primer plan de este alumno." />
            </View>
          ) : (
            <FlatList
              data={plans}
              keyExtractor={(p) => p.id}
              renderItem={({ item, index }) => (
                <MotiView from={{ opacity: 0, translateY: 12 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 320, delay: Math.min(index * 50, 400) }}>
                  <TouchableOpacity activeOpacity={0.85} onPress={() => openBuilder(item.id)}
                    style={[styles.planCard, { backgroundColor: theme.card, borderColor: item.is_active ? theme.success : theme.border, borderWidth: item.is_active ? 2 : 1, borderRadius: theme.radius.xl }]}>
                    <View style={styles.planTop}>
                      <View style={styles.titleRow}>
                        <Apple size={18} color={theme.primary} strokeWidth={1.75} />
                        <Text style={[styles.planName, { color: theme.foreground, fontFamily: 'Montserrat_600SemiBold' }]} numberOfLines={2}>{item.name}</Text>
                      </View>
                      {item.is_active ? (
                        <View style={[styles.activeBadge, { backgroundColor: theme.success + '22', borderRadius: theme.radius.sm }]}>
                          <BadgeCheck size={12} color={theme.success} />
                          <Text style={[styles.activeBadgeText, { color: theme.success, fontFamily: 'Montserrat_700Bold' }]}>Activo</Text>
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
                    <View style={[styles.actionRow, { borderTopColor: theme.border }]}>
                      {!item.is_active ? (
                        <TouchableOpacity onPress={() => activate(item)} activeOpacity={0.8} style={styles.actionBtn}>
                          <CheckCircle2 size={15} color={theme.success} />
                          <Text style={[styles.actionText, { color: theme.success, fontFamily: 'Inter_600SemiBold' }]}>Activar</Text>
                        </TouchableOpacity>
                      ) : <View style={styles.actionBtn} />}
                      <TouchableOpacity onPress={() => setCopyPlan(item)} activeOpacity={0.8} style={styles.actionBtn}>
                        <Copy size={15} color={theme.primary} />
                        <Text style={[styles.actionText, { color: theme.primary, fontFamily: 'Inter_600SemiBold' }]}>Copiar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => confirmDelete(item)} activeOpacity={0.8} style={styles.actionBtn}>
                        <Trash2 size={15} color={theme.destructive} />
                        <Text style={[styles.actionText, { color: theme.destructive, fontFamily: 'Inter_600SemiBold' }]}>Eliminar</Text>
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>
                </MotiView>
              )}
              contentContainerStyle={styles.planList}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      )}

      <NativeDialog open={!!copyPlan} title="Copiar plan a otro alumno" onClose={() => setCopyPlan(null)}>
        <View style={{ gap: 8 }}>
          <Text style={[styles.copyHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Se crea como plan activo del alumno elegido (su plan anterior queda inactivo).
          </Text>
          {clients.filter((c) => c.id !== selectedClient?.id).map((c) => (
            <TouchableOpacity key={c.id} disabled={copyBusy} onPress={() => copyToClient(c.id)} activeOpacity={0.8}
              style={[styles.copyRow, { borderColor: theme.border, backgroundColor: theme.secondary, borderRadius: theme.radius.lg, opacity: copyBusy ? 0.5 : 1 }]}>
              <Text style={[styles.copyName, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>{c.full_name}</Text>
              <Copy size={15} color={theme.primary} />
            </TouchableOpacity>
          ))}
          {clients.filter((c) => c.id !== selectedClient?.id).length === 0 ? (
            <Text style={[styles.copyHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>No hay otros alumnos.</Text>
          ) : null}
        </View>
      </NativeDialog>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  pickerRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  clientChip: { paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, maxWidth: 180 },
  chipText: { fontSize: 13, letterSpacing: 0.3 },
  planList: { paddingHorizontal: 16, paddingBottom: 110, gap: 10 },
  planCard: { padding: 16, gap: 8 },
  planTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  planName: { fontSize: 16, letterSpacing: -0.2, flex: 1 },
  activeBadge: { paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 },
  activeBadgeText: { fontSize: 11, letterSpacing: 0.3 },
  planSub: { fontSize: 13 },
  macrosRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 },
  actionRow: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, marginTop: 6, paddingTop: 10, gap: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionText: { fontSize: 13 },
  copyHint: { fontSize: 12, lineHeight: 17 },
  copyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  copyName: { fontSize: 14, flex: 1 },
})
