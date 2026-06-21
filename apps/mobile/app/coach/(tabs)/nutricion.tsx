import { useCallback, useEffect, useState } from 'react'
import { Alert, FlatList, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { Apple, BadgeCheck, ChefHat, CheckCircle2, ChevronRight, Copy, HelpCircle, Layers, LayoutGrid, Link2, Lock, Pencil, Plus, Trash2, Users, UtensilsCrossed } from 'lucide-react-native'
import { MotiView } from 'moti'
import { supabase } from '../../../lib/supabase'
import { getCoachProfile } from '../../../lib/coach'
import { useTheme } from '../../../context/ThemeContext'
import { Button, EmptyState, MacroPill, NativeDialog, ScreenHeader } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { deletePlan, duplicatePlanToClient, getClientPlans, getNutritionBoard, listCoachFoods, setPlanActive, type NutritionBoardRow, type PlanSummary } from '../../../lib/nutrition-builder'
import { Sparkline } from '../../../components/Sparkline'
import { assignTemplateToClients, deleteTemplate, listTemplates, type TemplateSummary } from '../../../lib/nutrition-templates'
import { canUseNutrition, type SubscriptionTier } from '../../../lib/coach-tiers'
import { getApiBaseUrl } from '../../../lib/api'

interface Client { id: string; full_name: string }
type HubTab = 'templates' | 'clients' | 'foods'

export default function CoachNutricionScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const [tab, setTab] = useState<HubTab>('templates')
  const [clients, setClients] = useState<Client[]>([])
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [foodsCount, setFoodsCount] = useState(0)
  const [loading, setLoading] = useState(true)

  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [plans, setPlans] = useState<PlanSummary[]>([])
  const [loadingPlans, setLoadingPlans] = useState(false)

  const [copyPlan, setCopyPlan] = useState<PlanSummary | null>(null)
  const [copyBusy, setCopyBusy] = useState(false)
  const [assignTemplate, setAssignTemplate] = useState<TemplateSummary | null>(null)
  const [assignIds, setAssignIds] = useState<string[]>([])
  const [tplBusy, setTplBusy] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)
  const [tier, setTier] = useState<SubscriptionTier>('free')
  const [clientsWithPlan, setClientsWithPlan] = useState<Set<string>>(new Set())
  const [board, setBoard] = useState<NutritionBoardRow[]>([])

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const coach = await getCoachProfile()
    if (!coach) { setLoading(false); return }
    setTier(coach.subscriptionTier)
    if (!canUseNutrition(coach.subscriptionTier)) { setLoading(false); return }
    const [{ data: cl }, tpl, foods, { data: activePlans }] = await Promise.all([
      supabase.from('clients').select('id, full_name').eq('coach_id', coach.id).eq('is_archived', false).eq('is_active', true).order('full_name'),
      listTemplates(),
      listCoachFoods().catch(() => []),
      // N-F6 (lite): qué alumnos tienen plan de nutrición activo → marcar "sin plan" en el roster.
      supabase.from('nutrition_plans').select('client_id').eq('coach_id', coach.id).eq('is_active', true),
    ])
    setClients(cl ?? [])
    setTemplates(tpl)
    setFoodsCount(foods.length)
    setClientsWithPlan(new Set(((activePlans ?? []) as any[]).map((p) => p.client_id).filter(Boolean)))
    setLoading(false)
    // N-F6-full: board de adherencia (en paralelo, no bloquea el render).
    getNutritionBoard().then(setBoard).catch(() => {})
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
  function confirmDeleteTemplate(t: TemplateSummary) {
    Alert.alert('Eliminar plantilla', `¿Eliminar "${t.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        const r = await deleteTemplate(t.id)
        if (!r.ok) { Alert.alert('Error', r.error ?? 'No se pudo eliminar.'); return }
        setTemplates(await listTemplates())
      } },
    ])
  }
  async function doAssign() {
    if (!assignTemplate || !assignIds.length) return
    setTplBusy(true)
    const r = await assignTemplateToClients(assignTemplate.id, assignIds)
    setTplBusy(false)
    setAssignTemplate(null)
    setAssignIds([])
    if (!r.ok) { Alert.alert('Error', r.error ?? 'No se pudo asignar.'); return }
    Alert.alert('Plantilla asignada', `Asignada a ${assignIds.length} alumno(s) como plan activo.`)
    if (selectedClient) loadPlans(selectedClient.id)
  }

  const TABS: { key: HubTab; label: string; icon: any }[] = [
    { key: 'templates', label: 'Plantillas', icon: Layers },
    { key: 'clients', label: 'Alumnos', icon: Users },
    { key: 'foods', label: 'Alimentos', icon: Apple },
  ]

  return (
    <SafeAreaView edges={[]} style={[styles.container, { backgroundColor: theme.background }]}>
      <AppBackground />
      <ScreenHeader
        title="Nutrición"
        subtitle="Centro de protocolos y alimentos"
        trailing={
          <TouchableOpacity onPress={() => setGuideOpen(true)} activeOpacity={0.85} style={[styles.headerBtn, { backgroundColor: '#F59E0B22', borderWidth: 1, borderColor: '#F59E0B55' }]}>
            <HelpCircle size={18} color="#F59E0B" />
          </TouchableOpacity>
        }
      />

      {loading ? (
        <EvaLoaderScreen subtitle="Cargando nutrición…" />
      ) : !canUseNutrition(tier) ? (
        <View style={styles.upsellWrap}>
          <View style={[styles.upsellCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
            <View style={[styles.upsellIcon, { backgroundColor: theme.primary + '1A' }]}>
              <Lock size={26} color={theme.primary} />
            </View>
            <Text style={[styles.upsellTitle, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>Nutrición en Pro o superior</Text>
            <Text style={[styles.upsellText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              Tu plan actual incluye entrenos. Al subir a Pro desbloqueás plantillas de nutrición, catálogo de alimentos y asignación de planes a tus alumnos.
            </Text>
            <Button label="Ver planes y upgrade" onPress={() => Linking.openURL(`${getApiBaseUrl()}/coach/subscription`).catch(() => null)} full />
          </View>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
          {/* Stats */}
          <View style={styles.statsRow}>
            <Stat theme={theme} value={templates.length} label="Plantillas" />
            <Stat theme={theme} value={clientsWithPlan.size} label="Con plan" />
            <Stat theme={theme} value={foodsCount} label="Alimentos" />
          </View>

          {/* Tabs */}
          <View style={[styles.tabBar, { backgroundColor: theme.secondary }]}>
            {TABS.map((t) => {
              const on = tab === t.key
              const Icon = t.icon
              return (
                <TouchableOpacity key={t.key} onPress={() => setTab(t.key)} activeOpacity={0.85}
                  style={[styles.tab, on && { backgroundColor: theme.background }]}>
                  <Icon size={15} color={on ? theme.primary : theme.mutedForeground} />
                  <Text style={[styles.tabText, { color: on ? theme.foreground : theme.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>{t.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {tab === 'templates' ? (
            <ScrollView contentContainerStyle={styles.tabBody} showsVerticalScrollIndicator={false}>
              <Button label="Nueva plantilla" leftIcon={Plus} onPress={() => router.push('/coach/nutrition-builder?mode=template')} full />
              {templates.length === 0 ? (
                <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans, marginTop: 8 }]}>Aún no tenés plantillas. Creá una para reutilizar planes entre alumnos.</Text>
              ) : (
                templates.map((t) => (
                  <View key={t.id} style={[styles.tplCard, { borderColor: theme.border, backgroundColor: theme.card, borderRadius: theme.radius.lg }]}>
                    <Text style={[styles.tplName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={1}>{t.name}</Text>
                    <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{t.daily_calories ?? 0} kcal · {t.mealCount} comida{t.mealCount !== 1 ? 's' : ''}</Text>
                    <View style={styles.tplActions}>
                      <TouchableOpacity style={styles.tplBtn} activeOpacity={0.8} onPress={() => router.push(`/coach/nutrition-builder?templateId=${t.id}`)}>
                        <Pencil size={14} color={theme.foreground} /><Text style={[styles.tplBtnText, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>Editar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.tplBtn} activeOpacity={0.8} onPress={() => { setAssignIds([]); setAssignTemplate(t) }}>
                        <Users size={14} color={theme.primary} /><Text style={[styles.tplBtnText, { color: theme.primary, fontFamily: 'Inter_600SemiBold' }]}>Asignar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.tplBtn} activeOpacity={0.8} onPress={() => confirmDeleteTemplate(t)}>
                        <Trash2 size={14} color={theme.destructive} /><Text style={[styles.tplBtnText, { color: theme.destructive, fontFamily: 'Inter_600SemiBold' }]}>Borrar</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          ) : tab === 'clients' ? (
            <View style={{ flex: 1 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pickerRow}>
                {clients.map((c) => {
                  const active = selectedClient?.id === c.id
                  const noPlan = !clientsWithPlan.has(c.id)
                  return (
                    <TouchableOpacity key={c.id} style={[styles.clientChip, { borderColor: active ? theme.primary : noPlan ? '#F59E0B55' : theme.border, backgroundColor: active ? theme.primary : theme.secondary, borderRadius: theme.radius.lg, flexDirection: 'row', alignItems: 'center', gap: 6 }]}
                      onPress={() => selectClient(c)} activeOpacity={0.8}>
                      {noPlan && !active ? <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: '#F59E0B' }} /> : null}
                      <Text style={[styles.chipText, { color: active ? theme.primaryForeground : theme.foreground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={1}>{c.full_name}</Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>

              {!selectedClient ? (
                board.length ? (
                  <ScrollView contentContainerStyle={styles.tabBody} showsVerticalScrollIndicator={false}>
                    <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Adherencia 7 días · peor primero. Tocá para gestionar el plan.</Text>
                    {board.map((row) => {
                      const c = adherenceColorFor(row.avg7d)
                      return (
                        <TouchableOpacity key={row.clientId} activeOpacity={0.85}
                          onPress={() => selectClient({ id: row.clientId, full_name: row.clientName })}
                          style={[styles.boardCard, { borderColor: theme.border, backgroundColor: theme.card, borderRadius: theme.radius.lg }]}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[styles.boardName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={1}>{row.clientName}</Text>
                            <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>
                              {row.todayKcal}{row.targetKcal ? ` / ${row.targetKcal}` : ''} kcal hoy · {row.planName}
                            </Text>
                          </View>
                          {row.sparkline7d.some((v) => v > 0) ? <Sparkline values={row.sparkline7d} width={70} height={26} color={c} /> : null}
                          <Text style={[styles.boardPct, { color: c, fontFamily: 'Montserrat_800ExtraBold' }]}>{row.avg7d}%</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </ScrollView>
                ) : (
                  <EmptyState icon={UtensilsCrossed} title="Elegí un alumno" subtitle="Tocá un nombre arriba para ver y crear sus planes." />
                )
              ) : loadingPlans ? (
                <EvaLoaderScreen subtitle="Cargando planes…" />
              ) : (
                <FlatList
                  data={plans}
                  keyExtractor={(p) => p.id}
                  ListHeaderComponent={
                    <TouchableOpacity onPress={() => openBuilder()} activeOpacity={0.85} style={[styles.newPlanBtn, { borderColor: theme.primary + '55' }]}>
                      <Plus size={16} color={theme.primary} />
                      <Text style={[styles.newPlanText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>Nuevo plan para {selectedClient.full_name}</Text>
                    </TouchableOpacity>
                  }
                  ListEmptyComponent={<EmptyState icon={Apple} title="Sin planes" subtitle="Creá el primer plan de este alumno." />}
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
                              <BadgeCheck size={12} color={theme.success} /><Text style={[styles.activeBadgeText, { color: theme.success, fontFamily: 'Montserrat_700Bold' }]}>Activo</Text>
                            </View>
                          ) : null}
                        </View>
                        {/* Badge sincronizado / personalizado */}
                        {item.template_id ? (
                          item.is_custom ? (
                            <View style={[styles.syncBadge, { borderColor: '#F59E0B55', backgroundColor: '#F59E0B14' }]}>
                              <Pencil size={11} color="#F59E0B" /><Text style={[styles.syncText, { color: '#F59E0B' }]}>PERSONALIZADO</Text>
                            </View>
                          ) : (
                            <View style={[styles.syncBadge, { borderColor: theme.success + '55', backgroundColor: theme.success + '14' }]}>
                              <Link2 size={11} color={theme.success} /><Text style={[styles.syncText, { color: theme.success }]}>SINCRONIZADO</Text>
                            </View>
                          )
                        ) : null}
                        <Text style={[styles.planSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{item.mealCount} comida{item.mealCount !== 1 ? 's' : ''}</Text>
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
                              <CheckCircle2 size={15} color={theme.success} /><Text style={[styles.actionText, { color: theme.success, fontFamily: 'Inter_600SemiBold' }]}>Activar</Text>
                            </TouchableOpacity>
                          ) : <View style={styles.actionBtn} />}
                          <TouchableOpacity onPress={() => setCopyPlan(item)} activeOpacity={0.8} style={styles.actionBtn}>
                            <Copy size={15} color={theme.primary} /><Text style={[styles.actionText, { color: theme.primary, fontFamily: 'Inter_600SemiBold' }]}>Copiar</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => confirmDelete(item)} activeOpacity={0.8} style={styles.actionBtn}>
                            <Trash2 size={15} color={theme.destructive} /><Text style={[styles.actionText, { color: theme.destructive, fontFamily: 'Inter_600SemiBold' }]}>Eliminar</Text>
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
          ) : (
            <View style={styles.tabBody}>
              <TouchableOpacity onPress={() => router.push('/coach/foods')} activeOpacity={0.85}
                style={[styles.foodsCta, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
                <View style={[styles.foodsIcon, { backgroundColor: theme.primary + '1A' }]}><Apple size={22} color={theme.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.foodsTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Biblioteca de alimentos</Text>
                  <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{foodsCount} alimento{foodsCount !== 1 ? 's' : ''} · crear / editar / borrar</Text>
                </View>
                <ChevronRight size={20} color={theme.mutedForeground} />
              </TouchableOpacity>

              <TouchableOpacity onPress={() => router.push('/coach/recipes')} activeOpacity={0.85}
                style={[styles.foodsCta, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
                <View style={[styles.foodsIcon, { backgroundColor: theme.primary + '1A' }]}><ChefHat size={22} color={theme.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.foodsTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Recetas</Text>
                  <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Ideas inspiracionales para tus alumnos</Text>
                </View>
                <ChevronRight size={20} color={theme.mutedForeground} />
              </TouchableOpacity>

              <TouchableOpacity onPress={() => router.push('/coach/meal-groups')} activeOpacity={0.85}
                style={[styles.foodsCta, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
                <View style={[styles.foodsIcon, { backgroundColor: theme.primary + '1A' }]}><LayoutGrid size={22} color={theme.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.foodsTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Grupos de alimentos</Text>
                  <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Combos reutilizables para armar comidas</Text>
                </View>
                <ChevronRight size={20} color={theme.mutedForeground} />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Copiar plan a otro alumno */}
      <NativeDialog open={!!copyPlan} title="Copiar plan a otro alumno" onClose={() => setCopyPlan(null)}>
        <View style={{ gap: 8 }}>
          <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Se crea como plan activo del alumno elegido (su plan anterior queda inactivo).</Text>
          {clients.filter((c) => c.id !== selectedClient?.id).map((c) => (
            <TouchableOpacity key={c.id} disabled={copyBusy} onPress={() => copyToClient(c.id)} activeOpacity={0.8}
              style={[styles.copyRow, { borderColor: theme.border, backgroundColor: theme.secondary, borderRadius: theme.radius.lg, opacity: copyBusy ? 0.5 : 1 }]}>
              <Text style={[styles.copyName, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={2}>{c.full_name}</Text>
              <Copy size={15} color={theme.primary} />
            </TouchableOpacity>
          ))}
        </View>
      </NativeDialog>

      {/* Asignar plantilla */}
      <NativeDialog open={!!assignTemplate} title={`Asignar "${assignTemplate?.name ?? ''}"`} onClose={() => setAssignTemplate(null)}>
        <View style={{ gap: 8 }}>
          <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Cada alumno elegido recibe esta plantilla como plan activo (queda SINCRONIZADO).</Text>
          {/* N-F7: aviso de reemplazo + seleccionar todos. */}
          <View style={[styles.assignWarn, { backgroundColor: '#F59E0B14', borderColor: '#F59E0B40' }]}>
            <Text style={[styles.assignWarnTxt, { color: '#F59E0B', fontFamily: 'Inter_600SemiBold' }]}>
              ⚠ Si un alumno ya tiene un plan activo, se reemplazará por esta plantilla.
            </Text>
          </View>
          {clients.length > 0 ? (
            <TouchableOpacity onPress={() => setAssignIds((ids) => ids.length === clients.length ? [] : clients.map((c) => c.id))} activeOpacity={0.8} style={styles.selectAllRow}>
              <Text style={[styles.selectAllTxt, { color: theme.primary, fontFamily: 'Inter_700Bold' }]}>
                {assignIds.length === clients.length ? 'Quitar selección' : 'Seleccionar todos'}
              </Text>
            </TouchableOpacity>
          ) : null}
          <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
            {clients.map((c) => {
              const on = assignIds.includes(c.id)
              return (
                <TouchableOpacity key={c.id} activeOpacity={0.8} onPress={() => setAssignIds((ids) => on ? ids.filter((x) => x !== c.id) : [...ids, c.id])}
                  style={[styles.copyRow, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary + '1A' : theme.secondary, borderRadius: theme.radius.lg }]}>
                  <Text style={[styles.copyName, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={2}>{c.full_name}</Text>
                  {on ? <CheckCircle2 size={16} color={theme.primary} /> : <View style={{ width: 16 }} />}
                </TouchableOpacity>
              )
            })}
          </ScrollView>
          <Button label={tplBusy ? 'Asignando...' : `Asignar a ${assignIds.length} alumno(s)`} onPress={doAssign} disabled={tplBusy || assignIds.length === 0} full />
        </View>
      </NativeDialog>

      {/* Guía: logística synced/custom */}
      <NativeDialog open={guideOpen} title="Cómo funciona" onClose={() => setGuideOpen(false)}>
        <View style={{ gap: 12 }}>
          <GuideRow theme={theme} color={theme.primary} title="1. Plantillas (moldes)" text="Son moldes reutilizables. No pertenecen a un alumno hasta que las asignás. Si editás una plantilla, los alumnos SINCRONIZADOS se actualizan con ese molde." />
          <GuideRow theme={theme} color={theme.success} title="2. Alumnos (planes activos)" text="Al asignar una plantilla, el plan del alumno queda SINCRONIZADO con el molde." />
          <GuideRow theme={theme} color="#F59E0B" title="3. Edición individual (custom)" text="Si ajustás el plan solo para un alumno, pasa a PERSONALIZADO y deja de seguir el molde (editar la plantilla ya no lo cambia)." />
        </View>
      </NativeDialog>
    </SafeAreaView>
  )
}

function adherenceColorFor(p: number): string {
  return p >= 80 ? '#10B981' : p >= 50 ? '#F59E0B' : '#EF4444'
}

function Stat({ theme, value, label }: { theme: any; value: number; label: string }) {
  return (
    <View style={[styles.stat, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
      <Text style={[styles.statValue, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>{label}</Text>
    </View>
  )
}

function GuideRow({ theme, color, title, text }: { theme: any; color: string; title: string; text: string }) {
  return (
    <View style={{ gap: 3 }}>
      <Text style={[styles.guideTitle, { color, fontFamily: 'Montserrat_700Bold' }]}>{title}</Text>
      <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  boardCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, padding: 12 },
  boardName: { fontSize: 14 },
  boardPct: { fontSize: 16, minWidth: 44, textAlign: 'right' },
  upsellWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  upsellCard: { borderWidth: 1, padding: 24, gap: 14, alignItems: 'center', maxWidth: 420, width: '100%' },
  upsellIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  upsellTitle: { fontSize: 19, textAlign: 'center', letterSpacing: -0.3 },
  upsellText: { fontSize: 13.5, lineHeight: 20, textAlign: 'center' },
  assignWarn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  assignWarnTxt: { fontSize: 12, lineHeight: 17 },
  selectAllRow: { alignSelf: 'flex-end', paddingVertical: 4, paddingHorizontal: 4 },
  selectAllTxt: { fontSize: 12.5 },
  headerBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 10 },
  stat: { flex: 1, borderWidth: 1, paddingVertical: 10, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 20 },
  statLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  tabBar: { flexDirection: 'row', gap: 3, marginHorizontal: 16, padding: 4, borderRadius: 14, marginBottom: 8 },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 9, borderRadius: 10 },
  tabText: { fontSize: 12 },
  tabBody: { paddingHorizontal: 16, paddingBottom: 110, gap: 10 },
  hint: { fontSize: 12, lineHeight: 17 },
  pickerRow: { paddingHorizontal: 16, paddingVertical: 8, gap: 8 },
  clientChip: { paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, maxWidth: 180 },
  chipText: { fontSize: 13, letterSpacing: 0.3 },
  newPlanBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 12, marginBottom: 10 },
  newPlanText: { fontSize: 13 },
  planList: { paddingHorizontal: 16, paddingBottom: 110, gap: 10 },
  planCard: { padding: 16, gap: 8 },
  planTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  planName: { fontSize: 16, letterSpacing: -0.2, flex: 1 },
  activeBadge: { paddingHorizontal: 8, paddingVertical: 3, flexDirection: 'row', alignItems: 'center', gap: 4 },
  activeBadgeText: { fontSize: 11, letterSpacing: 0.3 },
  syncBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  syncText: { fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  planSub: { fontSize: 13 },
  macrosRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 },
  actionRow: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, marginTop: 6, paddingTop: 10, gap: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  actionText: { fontSize: 13 },
  copyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  copyName: { fontSize: 14, flex: 1 },
  tplCard: { borderWidth: 1, padding: 12, gap: 4 },
  tplName: { fontSize: 15 },
  tplActions: { flexDirection: 'row', gap: 14, marginTop: 6 },
  tplBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tplBtnText: { fontSize: 13 },
  foodsCta: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, padding: 16 },
  foodsIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  foodsTitle: { fontSize: 15 },
  guideTitle: { fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.3 },
})
