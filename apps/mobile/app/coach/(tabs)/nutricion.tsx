import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, FlatList, Image, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect, useRouter } from 'expo-router'
import { Apple, BadgeCheck, BookOpen, ChefHat, CheckCircle2, ChevronRight, Copy, HelpCircle, Layers, LayoutGrid, Link2, Lock, Pencil, Plus, Search, Trash2, Users, UtensilsCrossed, X } from 'lucide-react-native'
import { MotiView } from 'moti'
import { supabase } from '../../../lib/supabase'
import { getCoachProfile } from '../../../lib/coach'
import { useTheme } from '../../../context/ThemeContext'
import { Button, EmptyState, MacroPill, NativeDialog, ScreenHeader } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { deletePlan, duplicatePlanToClient, getClientPlans, getNutritionBoard, listCoachFoods, setPlanActive, type NutritionBoardRow, type PlanSummary } from '../../../lib/nutrition-builder'
import { Sparkline } from '../../../components/Sparkline'
import { assignTemplateToClients, deleteTemplate, duplicateTemplate, listTemplates, type TemplateSummary } from '../../../lib/nutrition-templates'
import { listCoachRecipes, type RecipeRow } from '../../../lib/recipes'
import { canUseNutrition, type SubscriptionTier } from '../../../lib/coach-tiers'
import { getActiveScope } from '../../../lib/workspaces'
import { getApiBaseUrl } from '../../../lib/api'

interface Client { id: string; full_name: string }
type HubTab = 'templates' | 'clients' | 'foods' | 'recipes'
type BoardSort = 'name' | 'plan' | 'updated'

// Espejo de goalLabel (TemplateLibrary.tsx web): normaliza goal_type a etiqueta es-CL.
function goalLabel(goal: string | null | undefined): string | null {
  if (!goal) return null
  const g = goal.toLowerCase()
  if (g.includes('deficit') || g === 'cut') return 'Déficit'
  if (g.includes('surplus') || g.includes('bulk') || g === 'volume') return 'Volumen'
  if (g.includes('maint')) return 'Mantenimiento'
  return goal.replace(/_/g, ' ')
}

// Espejo de macroCalorieSplit (TemplateLibrary.tsx web): % de kcal por macro para la barra.
function macroCalorieSplit(calories: number, p: number, c: number, f: number) {
  const fromMacros = p * 4 + c * 4 + f * 9
  const denom = calories > 0 ? calories : fromMacros
  if (denom <= 0) return { pPct: 33, cPct: 34, fPct: 33 }
  const pPct = Math.round(((p * 4) / denom) * 100)
  const cPct = Math.round(((c * 4) / denom) * 100)
  const fPct = Math.max(0, 100 - pPct - cPct)
  return { pPct, cPct, fPct }
}

// Espejo de COACH_NUTRITION_ONBOARDING_STEPS + NUTRITION_SURFACES (web).
const ONBOARDING_STEPS = [
  { number: 1, icon: Apple, color: '#10B981', title: 'Agrega tus alimentos', description: 'Busca en el catálogo (~250 alimentos chilenos y globales) o crea los tuyos propios. Los alimentos son la base de todos tus planes.', cta: 'Ir al catálogo', route: '/coach/foods' },
  { number: 2, icon: BookOpen, color: '#8B5CF6', title: 'Crea tu primera plantilla', description: 'Una plantilla es un modelo de plan reutilizable. Arma las comidas con sus alimentos y cantidades. Tarda menos de 5 minutos.', cta: 'Crear plantilla', route: '/coach/nutrition-builder?mode=template' },
  { number: 3, icon: Users, color: '#0EA5E9', title: 'Asigna el plan a un alumno', description: 'Una vez tengas una plantilla lista, asígnala a tus alumnos. Puedes asignar la misma plantilla a varios a la vez.', cta: 'Asignar plan', route: null },
] as const

const NUTRITION_SURFACES = [
  { label: 'Recetas', description: 'Ideas de recetas para inspirar a tus alumnos. No afectan macros ni adherencia.', tier: 'base' as const },
  { label: 'Micronutrientes', description: 'Vitaminas y minerales estimados del plan, sin trabajo extra de tu parte.', tier: 'base' as const },
  { label: 'Notas', description: 'Notas y recordatorios que dejas a un alumno sobre su nutrición.', tier: 'base' as const },
  { label: 'Lista de compras', description: 'Lista de compras generada desde el plan del alumno, agrupada por categoría.', tier: 'base' as const },
  { label: 'Objetivos', description: 'Calorías y macros objetivo calculados a partir de los datos del alumno.', tier: 'base' as const },
  { label: 'Intercambios', description: 'Sistema de equivalencias para que el alumno arme comidas con flexibilidad.', tier: 'pro' as const },
]

export default function CoachNutricionScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const [tab, setTab] = useState<HubTab>('clients')
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
  const [recipes, setRecipes] = useState<RecipeRow[]>([])
  const [dupBusy, setDupBusy] = useState<string | null>(null)
  // Board (tab Alumnos): búsqueda + orden, espejo de ActivePlansBoard (web).
  const [boardQuery, setBoardQuery] = useState('')
  const [boardSort, setBoardSort] = useState<BoardSort>('name')
  // Onboarding empty-state (tab Plantillas sin plantillas) — descartable en sesión.
  const [onboardingDismissed, setOnboardingDismissed] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    const coach = await getCoachProfile()
    if (!coach) { setLoading(false); return }
    setTier(coach.subscriptionTier)
    if (!canUseNutrition(coach.subscriptionTier)) { setLoading(false); return }
    // Workspace-aware: en contexto team, alumnos y planes activos son del POOL del equipo
    // (clients.team_id), SIN filtro coach_id — espejo de getCoachClients / getActiveClientPlans
    // (web). standalone/enterprise = comportamiento actual (coach_id).
    const scope = await getActiveScope()
    const isTeam = scope.type === 'coach_team' && !!scope.teamId
    const clientsQuery = isTeam
      ? supabase.from('clients').select('id, full_name').eq('team_id', scope.teamId!).is('org_id', null).eq('is_archived', false).eq('is_active', true).order('full_name')
      : supabase.from('clients').select('id, full_name').eq('coach_id', coach.id).eq('is_archived', false).eq('is_active', true).order('full_name')
    const [{ data: cl }, tpl, foods, { data: activePlans }] = await Promise.all([
      clientsQuery,
      listTemplates(),
      listCoachFoods().catch(() => []),
      // N-F6 (lite): qué alumnos tienen plan de nutrición activo → marcar "sin plan" en el roster.
      // Team: planes activos del pool (org∅) — el set se intersecta con el roster del pool igual.
      isTeam
        ? supabase.from('nutrition_plans').select('client_id').is('org_id', null).eq('is_active', true)
        : supabase.from('nutrition_plans').select('client_id').eq('coach_id', coach.id).eq('is_active', true),
    ])
    setClients(cl ?? [])
    setTemplates(tpl)
    setFoodsCount(foods.length)
    setClientsWithPlan(new Set(((activePlans ?? []) as any[]).map((p) => p.client_id).filter(Boolean)))
    setLoading(false)
    // N-F6-full: board de adherencia + recetas (en paralelo, no bloquea el render).
    getNutritionBoard().then(setBoard).catch(() => {})
    listCoachRecipes().then(setRecipes).catch(() => {})
  }

  async function duplicate(t: TemplateSummary) {
    setDupBusy(t.id)
    const r = await duplicateTemplate(t.id)
    setDupBusy(null)
    if (!r.ok) { Alert.alert('Error', r.error ?? 'No se pudo duplicar.'); return }
    setTemplates(await listTemplates())
  }

  const hasClients = clients.length > 0

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
    // Al volver del builder/recetas/alimentos, refrescá listas (cuentas + tarjetas) sin spinner.
    listTemplates().then(setTemplates).catch(() => {})
    listCoachRecipes().then(setRecipes).catch(() => {})
    listCoachFoods().then((f) => setFoodsCount(f.length)).catch(() => {})
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
    { key: 'recipes', label: 'Recetas', icon: ChefHat },
  ]

  // Board filtrado + ordenado (espejo de ActivePlansBoard.filtered).
  const boardFiltered = useMemo(() => {
    const q = boardQuery.trim().toLowerCase()
    let list = board.filter((row) => {
      if (!q) return true
      return row.clientName.toLowerCase().includes(q) || (row.planName ?? '').toLowerCase().includes(q)
    })
    list = [...list].sort((a, b) => {
      if (boardSort === 'plan') return (a.planName ?? '').localeCompare(b.planName ?? '')
      if (boardSort === 'updated') return b.avg7d - a.avg7d
      return a.clientName.localeCompare(b.clientName)
    })
    return list
  }, [board, boardQuery, boardSort])

  // Alumnos sin plan activo (espejo de clientsWithoutPlan).
  const clientsWithoutPlan = useMemo(
    () => clients.filter((c) => !clientsWithPlan.has(c.id)),
    [clients, clientsWithPlan]
  )

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
              {/* Section heading (espejo SectionHeading web) */}
              <View style={[styles.sectionHead, { borderBottomColor: theme.primary + '33' }]}>
                <View style={[styles.sectionIcon, { backgroundColor: theme.primary + '1A' }]}><Layers size={18} color={theme.primary} /></View>
                <Text style={[styles.sectionTitle, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>Protocolos maestros</Text>
              </View>

              <Button label="Nueva plantilla" leftIcon={Plus} onPress={() => router.push('/coach/nutrition-builder?mode=template')} full />

              {/* Onboarding 3-pasos (espejo NutritionOnboarding web) cuando no hay plantillas */}
              {templates.length === 0 && !onboardingDismissed ? (
                <View style={[styles.onboardCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
                  <View style={{ gap: 4 }}>
                    <Text style={[styles.onboardTitle, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>🥗 Bienvenido al módulo de nutrición</Text>
                    <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Seguí estos 3 pasos para empezar a asignar planes nutricionales a tus alumnos.</Text>
                  </View>
                  {ONBOARDING_STEPS.map((step) => {
                    const Icon = step.icon
                    const disabled = step.number === 3 && !hasClients
                    return (
                      <View key={step.number} style={[styles.onboardStep, { borderColor: theme.border, backgroundColor: theme.secondary, opacity: disabled ? 0.5 : 1 }]}>
                        <View style={styles.onboardStepHead}>
                          <View style={[styles.onboardStepIcon, { backgroundColor: step.color + '1A' }]}><Icon size={16} color={step.color} /></View>
                          <Text style={[styles.onboardStepNum, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>PASO {step.number}</Text>
                        </View>
                        <Text style={[styles.onboardStepTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{step.title}</Text>
                        <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{step.description}</Text>
                        <TouchableOpacity disabled={disabled} activeOpacity={0.8}
                          onPress={() => { if (step.route) router.push(step.route as any); else setTab('clients') }}
                          style={styles.onboardCta}>
                          <Text style={[styles.onboardCtaText, { color: disabled ? theme.mutedForeground : step.color, fontFamily: 'Inter_700Bold' }]}>{step.cta}</Text>
                          <ChevronRight size={14} color={disabled ? theme.mutedForeground : step.color} />
                        </TouchableOpacity>
                      </View>
                    )
                  })}
                  <View style={styles.onboardFooter}>
                    {!hasClients ? <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans, flex: 1 }]}>Necesitás al menos un alumno para el paso 3.</Text> : <View style={{ flex: 1 }} />}
                    <TouchableOpacity onPress={() => setOnboardingDismissed(true)} activeOpacity={0.8} style={[styles.onboardDismiss, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
                      <CheckCircle2 size={12} color={theme.mutedForeground} />
                      <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', color: theme.mutedForeground, textTransform: 'uppercase', letterSpacing: 0.5 }}>Entendido, ocultar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}

              {templates.length === 0 ? (
                onboardingDismissed ? (
                  <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans, marginTop: 8 }]}>Aún no tenés plantillas. Creá una para reutilizar planes entre alumnos.</Text>
                ) : null
              ) : (
                templates.map((t) => {
                  const kcal = t.daily_calories ?? 0
                  const p = t.protein_g ?? 0
                  const c = t.carbs_g ?? 0
                  const f = t.fats_g ?? 0
                  const split = macroCalorieSplit(kcal, p, c, f)
                  const goal = goalLabel(t.goal_type)
                  const chips = t.mealNames.slice(0, 8)
                  return (
                    <View key={t.id} style={[styles.tplCard, { borderColor: theme.border, backgroundColor: theme.card, borderRadius: theme.radius.xl }]}>
                      <View style={styles.tplHead}>
                        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
                          <View style={styles.tplTitleRow}>
                            {goal ? (
                              <View style={[styles.goalBadge, { backgroundColor: theme.secondary }]}>
                                <Text style={[styles.goalBadgeText, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{goal.toUpperCase()}</Text>
                              </View>
                            ) : null}
                            <Text style={[styles.tplName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={1}>{t.name}</Text>
                          </View>
                          {t.description ? (
                            <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={2}>{t.description}</Text>
                          ) : null}
                        </View>
                        <View style={styles.tplHeadActions}>
                          <TouchableOpacity onPress={() => router.push(`/coach/nutrition-builder?templateId=${t.id}`)} hitSlop={6} style={styles.iconBtnSm}><Pencil size={16} color={theme.mutedForeground} /></TouchableOpacity>
                          <TouchableOpacity disabled={dupBusy === t.id} onPress={() => duplicate(t)} hitSlop={6} style={styles.iconBtnSm}><Copy size={16} color={dupBusy === t.id ? theme.muted : theme.mutedForeground} /></TouchableOpacity>
                          <TouchableOpacity onPress={() => confirmDeleteTemplate(t)} hitSlop={6} style={styles.iconBtnSm}><Trash2 size={16} color={theme.destructive} /></TouchableOpacity>
                        </View>
                      </View>

                      {/* Macro grid 4 celdas (kcal/P/C/G) */}
                      <View style={styles.tplMacroGrid}>
                        <TplMacroCell theme={theme} label="Kcal" value={String(kcal)} color="#F97316" />
                        <TplMacroCell theme={theme} label="P" value={`${p}g`} color="#3B82F6" />
                        <TplMacroCell theme={theme} label="C" value={`${c}g`} color="#10B981" />
                        <TplMacroCell theme={theme} label="G" value={`${f}g`} color="#8B5CF6" />
                      </View>

                      {/* Barra de split de macros */}
                      {kcal > 0 ? (
                        <View style={[styles.splitBar, { backgroundColor: theme.secondary }]}>
                          <View style={{ width: `${split.pPct}%`, backgroundColor: '#3B82F6CC' }} />
                          <View style={{ width: `${split.cPct}%`, backgroundColor: '#10B981CC' }} />
                          <View style={{ width: `${split.fPct}%`, backgroundColor: '#8B5CF6CC' }} />
                        </View>
                      ) : null}

                      {/* Chips de comidas */}
                      <View style={styles.tplChipWrap}>
                        {chips.length === 0 ? (
                          <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Sin comidas en la plantilla</Text>
                        ) : (
                          <>
                            {chips.map((name, i) => (
                              <View key={`${t.id}-chip-${i}`} style={[styles.mealChip, { borderColor: theme.border }]}>
                                <Text style={[styles.mealChipText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>{name}</Text>
                              </View>
                            ))}
                            {t.mealNames.length > 8 ? (
                              <View style={[styles.mealChip, { borderColor: theme.border }]}><Text style={[styles.mealChipText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>+{t.mealNames.length - 8}</Text></View>
                            ) : null}
                          </>
                        )}
                      </View>

                      {/* Footer: N comidas + N activos + Asignar + Ver plan */}
                      <View style={[styles.tplFooter, { borderTopColor: theme.border }]}>
                        <View style={styles.tplFooterMeta}>
                          <UtensilsCrossed size={13} color={theme.mutedForeground} />
                          <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{t.mealCount} comidas</Text>
                          {t.assignedCount > 0 ? (
                            <View style={[styles.activeCountPill, { backgroundColor: theme.primary + '1A' }]}>
                              <Users size={11} color={theme.primary} />
                              <Text style={[styles.activeCountText, { color: theme.primary, fontFamily: 'Inter_700Bold' }]}>{t.assignedCount} activos</Text>
                            </View>
                          ) : null}
                        </View>
                        <View style={styles.tplFooterBtns}>
                          <TouchableOpacity onPress={() => { setAssignIds([]); setAssignTemplate(t) }} activeOpacity={0.85} style={[styles.tplPrimaryBtn, { backgroundColor: theme.primary }]}>
                            <Users size={13} color={theme.primaryForeground} />
                            <Text style={[styles.tplPrimaryBtnText, { color: theme.primaryForeground, fontFamily: 'Inter_700Bold' }]}>Asignar</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => router.push(`/coach/nutrition-builder?templateId=${t.id}`)} activeOpacity={0.85} style={[styles.tplGhostBtn, { borderColor: theme.border }]}>
                            <Text style={[styles.tplGhostBtnText, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]}>Ver plan</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  )
                })
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
                    {/* Buscador + orden (espejo ActivePlansBoard web) */}
                    <View style={[styles.searchBar, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
                      <Search size={16} color={theme.mutedForeground} />
                      <TextInput value={boardQuery} onChangeText={setBoardQuery} placeholder="Buscar por alumno o plan…" placeholderTextColor={theme.mutedForeground}
                        autoCapitalize="none" style={[styles.searchInput, { color: theme.foreground, fontFamily: theme.fontSans }]} />
                      {boardQuery.length > 0 ? <TouchableOpacity onPress={() => setBoardQuery('')} hitSlop={8}><X size={16} color={theme.mutedForeground} /></TouchableOpacity> : null}
                    </View>
                    <View style={styles.sortRow}>
                      {(['name', 'plan', 'updated'] as const).map((k) => {
                        const on = boardSort === k
                        return (
                          <TouchableOpacity key={k} onPress={() => setBoardSort(k)} activeOpacity={0.8}
                            style={[styles.sortChip, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary : 'transparent' }]}>
                            <Text style={{ fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.5, textTransform: 'uppercase', color: on ? theme.primaryForeground : theme.mutedForeground }}>
                              {k === 'name' ? 'Alumno' : k === 'plan' ? 'Plan' : 'Adherencia'}
                            </Text>
                          </TouchableOpacity>
                        )
                      })}
                    </View>
                    <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Adherencia 7 días. Tocá para gestionar el plan.</Text>
                    {boardFiltered.map((row) => {
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

                    {/* Sin plan activo (espejo clientsWithoutPlan web) */}
                    {clientsWithoutPlan.length > 0 ? (
                      <View style={{ gap: 8, marginTop: 8 }}>
                        <View style={styles.sinPlanHead}>
                          <Users size={14} color={theme.foreground} />
                          <Text style={[styles.sinPlanTitle, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>Sin plan activo ({clientsWithoutPlan.length})</Text>
                        </View>
                        {clientsWithoutPlan.map((cwp) => (
                          <TouchableOpacity key={cwp.id} activeOpacity={0.85} onPress={() => selectClient(cwp)}
                            style={[styles.sinPlanCard, { borderColor: '#F59E0B55', backgroundColor: theme.card, borderRadius: theme.radius.lg }]}>
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={[styles.boardName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={1}>{cwp.full_name}</Text>
                              <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans, textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 10 }]}>Asigná desde Plantillas</Text>
                            </View>
                            <View style={[styles.sinPlanBtn, { backgroundColor: theme.primary }]}>
                              <Plus size={13} color={theme.primaryForeground} />
                              <Text style={[styles.sinPlanBtnText, { color: theme.primaryForeground, fontFamily: 'Inter_700Bold' }]}>Asignar</Text>
                            </View>
                          </TouchableOpacity>
                        ))}
                      </View>
                    ) : null}
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
          ) : tab === 'foods' ? (
            <ScrollView contentContainerStyle={styles.tabBody} showsVerticalScrollIndicator={false}>
              {/* Section heading (espejo SectionHeading "Biblioteca nutricional") */}
              <View style={[styles.sectionHead, { borderBottomColor: theme.primary + '33' }]}>
                <View style={[styles.sectionIcon, { backgroundColor: theme.primary + '1A' }]}><Apple size={18} color={theme.primary} /></View>
                <Text style={[styles.sectionTitle, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>Biblioteca nutricional</Text>
              </View>

              <TouchableOpacity onPress={() => router.push('/coach/foods')} activeOpacity={0.85}
                style={[styles.foodsCta, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
                <View style={[styles.foodsIcon, { backgroundColor: theme.primary + '1A' }]}><Apple size={22} color={theme.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.foodsTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Biblioteca de alimentos</Text>
                  <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{foodsCount} alimento{foodsCount !== 1 ? 's' : ''} · catálogo global y tus customs</Text>
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
            </ScrollView>
          ) : (
            // ── Tab Recetas (espejo RecipeLibrary web, BASE tier) ──
            <ScrollView contentContainerStyle={styles.tabBody} showsVerticalScrollIndicator={false}>
              <View style={[styles.sectionHead, { borderBottomColor: theme.primary + '33' }]}>
                <View style={[styles.sectionIcon, { backgroundColor: theme.primary + '1A' }]}><ChefHat size={18} color={theme.primary} /></View>
                <Text style={[styles.sectionTitle, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>Recetas</Text>
                <View style={[styles.tierBadge, { backgroundColor: theme.secondary, borderColor: theme.border }]}>
                  <Text style={[styles.tierBadgeText, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>BASE</Text>
                </View>
              </View>
              <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                Ideas de recetas para inspirar a tus alumnos. Viene incluido en el módulo de nutrición (Base). No afectan macros ni adherencia.
              </Text>

              <TouchableOpacity onPress={() => router.push('/coach/recipes')} activeOpacity={0.85}
                style={[styles.newPlanBtn, { borderColor: theme.primary + '55', marginBottom: 4 }]}>
                <Plus size={16} color={theme.primary} />
                <Text style={[styles.newPlanText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>Nueva receta</Text>
              </TouchableOpacity>

              {recipes.length === 0 ? (
                <View style={{ paddingTop: 24 }}>
                  <EmptyState icon={ChefHat} title="Todavía no tienes recetas" subtitle="Toca el botón para crear ideas de recetas que inspiren a tus alumnos." />
                </View>
              ) : (
                recipes.map((r) => (
                  <TouchableOpacity key={r.id} activeOpacity={0.85} onPress={() => router.push('/coach/recipes')}
                    style={[styles.recipeCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
                    {r.image_url ? (
                      <Image source={{ uri: r.image_url }} style={styles.recipeImage} resizeMode="cover" />
                    ) : (
                      <View style={[styles.recipeImagePlaceholder, { backgroundColor: theme.primary + '14' }]}>
                        <ChefHat size={26} color={theme.primary + '88'} />
                      </View>
                    )}
                    <View style={styles.recipeBody}>
                      <Text style={[styles.recipeName, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]} numberOfLines={2}>{r.name}</Text>
                      {r.ingredients_text ? (
                        <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={2}>{r.ingredients_text}</Text>
                      ) : null}
                    </View>
                    <ChevronRight size={18} color={theme.mutedForeground} />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
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
      <NativeDialog open={guideOpen} title="Guía rápida — Nutrición" onClose={() => setGuideOpen(false)}>
        <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 12 }} showsVerticalScrollIndicator={false}>
          <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Tres pasos para sacar provecho al módulo. Podés volver acá cuando quieras.</Text>
          <GuideRow theme={theme} color={theme.primary} title="1. Plantillas (moldes)" text="Son moldes reutilizables. No pertenecen a un alumno hasta que las asignás. Si editás una plantilla, los alumnos SINCRONIZADOS se actualizan con ese molde." />
          <GuideRow theme={theme} color={theme.success} title="2. Alumnos (planes activos)" text="Al asignar una plantilla, el plan del alumno queda SINCRONIZADO con el molde." />
          <GuideRow theme={theme} color="#F59E0B" title="3. Edición individual (custom)" text="Si ajustás el plan solo para un alumno, pasa a PERSONALIZADO y deja de seguir el molde (editar la plantilla ya no lo cambia)." />

          {/* Qué incluye nutrición (espejo NUTRITION_SURFACES web) */}
          <View style={[styles.guideDivider, { borderTopColor: theme.border }]} />
          <Text style={[styles.guideSectionTitle, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>QUÉ INCLUYE NUTRICIÓN</Text>
          {NUTRITION_SURFACES.map((s) => {
            const isPro = s.tier === 'pro'
            return (
              <View key={s.label} style={styles.surfaceRow}>
                <View style={[styles.tierBadge, { backgroundColor: isPro ? theme.primary + '1A' : theme.secondary, borderColor: isPro ? theme.primary + '55' : theme.border }]}>
                  <Text style={[styles.tierBadgeText, { color: isPro ? theme.primary : theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{isPro ? 'PRO' : 'BASE'}</Text>
                </View>
                <View style={{ flex: 1, gap: 1 }}>
                  <Text style={[styles.surfaceLabel, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{s.label}</Text>
                  <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{s.description}</Text>
                </View>
              </View>
            )
          })}
        </ScrollView>
      </NativeDialog>
    </SafeAreaView>
  )
}

function TplMacroCell({ theme, label, value, color }: { theme: any; label: string; value: string; color: string }) {
  return (
    <View style={[styles.tplMacroCell, { backgroundColor: color + '14', borderColor: color + '33' }]}>
      <Text style={[styles.tplMacroLabel, { color, fontFamily: 'Inter_700Bold' }]}>{label}</Text>
      <Text style={[styles.tplMacroValue, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{value}</Text>
    </View>
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
  tplCard: { borderWidth: 1, padding: 14, gap: 10 },
  tplName: { fontSize: 16, flexShrink: 1 },
  tplHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  tplTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  tplHeadActions: { flexDirection: 'row', gap: 2 },
  iconBtnSm: { padding: 5 },
  goalBadge: { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  goalBadgeText: { fontSize: 8.5, letterSpacing: 0.5 },
  tplMacroGrid: { flexDirection: 'row', gap: 6 },
  tplMacroCell: { flex: 1, borderWidth: 1, borderRadius: 9, paddingVertical: 6, alignItems: 'center', gap: 1 },
  tplMacroLabel: { fontSize: 8.5, textTransform: 'uppercase', letterSpacing: 0.3 },
  tplMacroValue: { fontSize: 13 },
  splitBar: { flexDirection: 'row', height: 7, borderRadius: 999, overflow: 'hidden' },
  tplChipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  mealChip: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, maxWidth: 150 },
  mealChipText: { fontSize: 10 },
  tplFooter: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 8 },
  tplFooterMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  activeCountPill: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  activeCountText: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 },
  tplFooterBtns: { flexDirection: 'row', gap: 8 },
  tplPrimaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, height: 36, borderRadius: 10 },
  tplPrimaryBtnText: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  tplGhostBtn: { flex: 1, alignItems: 'center', justifyContent: 'center', height: 36, borderWidth: 1, borderRadius: 10 },
  tplGhostBtnText: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  foodsCta: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, padding: 16 },
  foodsIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  foodsTitle: { fontSize: 15 },
  guideTitle: { fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.3 },
  // Section headings
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 2, paddingBottom: 8, marginBottom: 4 },
  sectionIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 17, textTransform: 'uppercase', letterSpacing: -0.3 },
  tierBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  tierBadgeText: { fontSize: 8.5, letterSpacing: 0.5 },
  // Onboarding
  onboardCard: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 16, padding: 16, gap: 12 },
  onboardTitle: { fontSize: 16, letterSpacing: -0.3 },
  onboardStep: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
  onboardStepHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  onboardStepIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  onboardStepNum: { fontSize: 9.5, letterSpacing: 0.8 },
  onboardStepTitle: { fontSize: 13.5 },
  onboardCta: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  onboardCtaText: { fontSize: 12 },
  onboardFooter: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  onboardDismiss: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 6 },
  // Board search/sort
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, fontSize: 15 },
  sortRow: { flexDirection: 'row', gap: 8 },
  sortChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  // Sin plan activo
  sinPlanHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sinPlanTitle: { fontSize: 13, textTransform: 'uppercase', letterSpacing: -0.2 },
  sinPlanCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, padding: 12 },
  sinPlanBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 7 },
  sinPlanBtnText: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  // Recipes tab
  recipeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, padding: 10 },
  recipeImage: { width: 64, height: 64, borderRadius: 10 },
  recipeImagePlaceholder: { width: 64, height: 64, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  recipeBody: { flex: 1, minWidth: 0, gap: 3 },
  recipeName: { fontSize: 15, lineHeight: 19 },
  // Guide surfaces
  guideDivider: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 2 },
  guideSectionTitle: { fontSize: 10.5, letterSpacing: 0.8 },
  surfaceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  surfaceLabel: { fontSize: 13 },
})
