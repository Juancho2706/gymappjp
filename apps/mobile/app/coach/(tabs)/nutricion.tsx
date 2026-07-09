import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, FlatList, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import {
  Apple,
  CalendarHeart,
  ChefHat,
  Check,
  CheckCircle2,
  ChevronRight,
  Globe,
  HelpCircle,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  UserPlus,
  Users,
  Utensils,
} from 'lucide-react-native'
import { MotiView } from 'moti'
import { supabase } from '../../../lib/supabase'
import { getCoachProfile } from '../../../lib/coach'
import { useTheme } from '../../../context/ThemeContext'
import { Badge, Button, EmptyState, Input, MacroPill, NativeDialog, Sheet } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { FONT } from '../../../lib/typography'
import { SHADOWS, type Scheme } from '../../../lib/shadows'
import { MACRO_COLORS } from '../../../components/MacroRingSummary'
import {
  FOOD_CATEGORIES,
  FOOD_UNITS,
  createCustomFood,
  deleteFood,
  getNutritionBoard,
  listCoachFoods,
  searchFoods,
  updateFood,
  type FoodRow,
  type FoodUnit,
  type NutritionBoardRow,
} from '../../../lib/nutrition-builder'
import { assignTemplateToClients, deleteTemplate, listTemplates, type TemplateSummary } from '../../../lib/nutrition-templates'
import { canUseNutrition, type SubscriptionTier } from '../../../lib/coach-tiers'
import { getApiBaseUrl } from '../../../lib/api'

// Acentos de dominio FIJOS del token-contract (§1 — NO white-label, seguros para SVG).
const EMBER = '#FF6A3D' // ember-500 — planes personalizados / dominio nutrición
const WARNING = '#F5A524' // warning-500 — sin plan
const SUCCESS = '#1FB877' // success-500

interface Client { id: string; full_name: string }
type HubTab = 'templates' | 'clients' | 'foods' | 'recipes'
type PlanMeta = { planId: string; isCustom: boolean }
type BoardRow = NutritionBoardRow & { planId?: string; isCustom: boolean }

function adherenceColorFor(p: number): string {
  return p >= 80 ? SUCCESS : p >= 50 ? WARNING : '#F4365A'
}

// P/C/G split como % de las calorías (misma fórmula que web macroCalorieSplit).
function macroSplit(cal: number, p: number, c: number, f: number): { pPct: number; cPct: number; fPct: number } {
  const fromMacros = p * 4 + c * 4 + f * 9
  const denom = cal > 0 ? cal : fromMacros
  if (denom <= 0) return { pPct: 0, cPct: 0, fPct: 0 }
  const pPct = Math.round(((p * 4) / denom) * 100)
  const cPct = Math.round(((c * 4) / denom) * 100)
  const fPct = Math.max(0, 100 - pPct - cPct)
  return { pPct, cPct, fPct }
}

export default function CoachNutricionScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const params = useLocalSearchParams<{ tab?: string }>()

  const [tab, setTab] = useState<HubTab>(
    (['templates', 'clients', 'foods', 'recipes'].includes(params.tab ?? '') ? params.tab : 'clients') as HubTab
  )
  const [clients, setClients] = useState<Client[]>([])
  const [templates, setTemplates] = useState<TemplateSummary[]>([])
  const [foodsCount, setFoodsCount] = useState(0)
  const [board, setBoard] = useState<NutritionBoardRow[]>([])
  const [planMeta, setPlanMeta] = useState<Map<string, PlanMeta>>(new Map())
  const [clientsWithPlan, setClientsWithPlan] = useState<Set<string>>(new Set())
  const [tier, setTier] = useState<SubscriptionTier>('free')
  const [loading, setLoading] = useState(true)

  const [guideOpen, setGuideOpen] = useState(false)
  const [assignTemplate, setAssignTemplate] = useState<TemplateSummary | null>(null)
  const [assignIds, setAssignIds] = useState<string[]>([])
  const [tplBusy, setTplBusy] = useState(false)

  const firstLoad = useRef(true)

  const loadAll = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    const coach = await getCoachProfile()
    if (!coach) { setLoading(false); return }
    setTier(coach.subscriptionTier)
    if (!canUseNutrition(coach.subscriptionTier)) { setLoading(false); return }
    const [{ data: cl }, tpl, foods, { data: activePlans }] = await Promise.all([
      supabase.from('clients').select('id, full_name').eq('coach_id', coach.id).eq('is_archived', false).eq('is_active', true).order('full_name'),
      listTemplates(),
      listCoachFoods().catch(() => []),
      // Plan activo por alumno → set "con plan" + meta (planId + sync/custom) para el board.
      supabase.from('nutrition_plans').select('id, client_id, is_custom').eq('coach_id', coach.id).eq('is_active', true),
    ])
    setClients((cl ?? []) as Client[])
    setTemplates(tpl)
    setFoodsCount(foods.length)
    const meta = new Map<string, PlanMeta>()
    const withPlan = new Set<string>()
    for (const p of ((activePlans ?? []) as any[])) {
      if (!p.client_id) continue
      withPlan.add(p.client_id)
      meta.set(p.client_id, { planId: p.id, isCustom: !!p.is_custom })
    }
    setPlanMeta(meta)
    setClientsWithPlan(withPlan)
    setLoading(false)
    getNutritionBoard().then(setBoard).catch(() => {})
  }, [])

  useFocusEffect(useCallback(() => {
    void loadAll(!firstLoad.current)
    firstLoad.current = false
  }, [loadAll]))

  const refreshFoodsCount = useCallback(() => {
    listCoachFoods().then((f) => setFoodsCount(f.length)).catch(() => {})
  }, [])

  async function doAssign() {
    if (!assignTemplate || !assignIds.length) return
    setTplBusy(true)
    const r = await assignTemplateToClients(assignTemplate.id, assignIds)
    setTplBusy(false)
    setAssignTemplate(null)
    setAssignIds([])
    if (!r.ok) { Alert.alert('Error', r.error ?? 'No se pudo asignar.'); return }
    Alert.alert('Plantilla asignada', `Asignada a ${assignIds.length} alumno(s) como plan activo.`)
    void loadAll(true)
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

  const TAB_META: { key: HubTab; label: string; count: number }[] = [
    { key: 'templates', label: 'Plantillas', count: templates.length },
    { key: 'clients', label: 'Alumnos', count: board.length },
    { key: 'foods', label: 'Alimentos', count: foodsCount },
    { key: 'recipes', label: 'Recetas', count: 0 },
  ]
  const showCreate = tab === 'clients' || tab === 'templates'

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.background }]}>
      <AppBackground />

      {/* Header — título + subtítulo + acciones (1:1 NutritionHub móvil) */}
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.hTitle, { color: theme.foreground, fontFamily: FONT.displayBold }]}>Nutrición</Text>
          <Text style={[styles.hSub, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>Planes, alimentos y recetas</Text>
        </View>
        <View style={styles.hActions}>
          <TouchableOpacity
            testID="nutricion-guide-open"
            onPress={() => setGuideOpen(true)}
            activeOpacity={0.85}
            style={[styles.hIconBtn, { backgroundColor: theme.card, borderColor: theme.border }]}
          >
            <HelpCircle size={18} color={theme.foreground} />
          </TouchableOpacity>
          {showCreate ? (
            <TouchableOpacity
              testID="nutricion-new-template"
              onPress={() => router.push('/coach/nutrition-builder?mode=template')}
              activeOpacity={0.9}
              style={[styles.hCreateBtn, { backgroundColor: theme.primary }]}
            >
              <Plus size={16} color={theme.primaryForeground} />
              <Text style={[styles.hCreateTxt, { color: theme.primaryForeground, fontFamily: FONT.uiBold }]}>Plantilla</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {loading ? (
        <EvaLoaderScreen subtitle="Cargando nutrición…" />
      ) : !canUseNutrition(tier) ? (
        <UpsellCard theme={theme} />
      ) : (
        <View style={{ flex: 1 }}>
          {/* Strip de tabs (label + conteo mono) — SegmentedControl DS de 4 segmentos */}
          <View style={styles.tabStripWrap}>
            <View style={[styles.tabStrip, { backgroundColor: theme.secondary }]}>
              {TAB_META.map((t) => {
                const on = tab === t.key
                return (
                  <TouchableOpacity
                    key={t.key}
                    testID={`nutricion-tab-${t.key}`}
                    onPress={() => setTab(t.key)}
                    activeOpacity={0.85}
                    style={[styles.tabSeg, { backgroundColor: on ? theme.card : 'transparent' }, on ? SHADOWS[theme.scheme].sm : null]}
                  >
                    <Text numberOfLines={1} style={{ fontSize: 12.5, color: on ? theme.foreground : theme.mutedForeground, fontFamily: on ? FONT.uiExtra : FONT.uiSemibold }}>
                      {t.label}
                    </Text>
                    <Text style={{ fontSize: 10.5, marginTop: 1, fontVariant: ['tabular-nums'], color: on ? theme.primary : theme.mutedForeground, fontFamily: FONT.monoBold }}>
                      {t.count}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>

          {tab === 'templates' ? (
            <TemplatesTab
              theme={theme}
              templates={templates}
              onEdit={(t) => router.push(`/coach/nutrition-builder?templateId=${t.id}`)}
              onAssign={(t) => { setAssignIds([]); setAssignTemplate(t) }}
              onDelete={confirmDeleteTemplate}
              onCreate={() => router.push('/coach/nutrition-builder?mode=template')}
            />
          ) : tab === 'clients' ? (
            <ClientsBoardTab
              theme={theme}
              board={board}
              planMeta={planMeta}
              clientsWithoutPlan={clients.filter((c) => !clientsWithPlan.has(c.id))}
              onManage={(row) => router.push(`/coach/nutrition-builder?clientId=${row.clientId}&clientName=${encodeURIComponent(row.clientName)}${row.planId ? `&planId=${row.planId}` : ''}`)}
              onAssignEmpty={(c) => router.push(`/coach/nutrition-builder?clientId=${c.id}&clientName=${encodeURIComponent(c.full_name)}`)}
              onReload={() => loadAll(true)}
            />
          ) : tab === 'foods' ? (
            <FoodsTab theme={theme} onFoodsChanged={refreshFoodsCount} />
          ) : (
            <RecipesTab theme={theme} />
          )}
        </View>
      )}

      {/* Asignar plantilla */}
      <NativeDialog open={!!assignTemplate} title={`Asignar "${assignTemplate?.name ?? ''}"`} onClose={() => setAssignTemplate(null)}>
        <View style={{ gap: 8 }}>
          <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>Cada alumno elegido recibe esta plantilla como plan activo (queda SINCRONIZADO).</Text>
          <View style={[styles.assignWarn, { backgroundColor: WARNING + '14', borderColor: WARNING + '40' }]}>
            <Text style={[styles.assignWarnTxt, { color: WARNING, fontFamily: FONT.uiSemibold }]}>
              ⚠ Si un alumno ya tiene un plan activo, se reemplazará por esta plantilla.
            </Text>
          </View>
          {clients.length > 0 ? (
            <TouchableOpacity testID="nutricion-assign-select-all" onPress={() => setAssignIds((ids) => ids.length === clients.length ? [] : clients.map((c) => c.id))} activeOpacity={0.8} style={styles.selectAllRow}>
              <Text style={[styles.selectAllTxt, { color: theme.primary, fontFamily: FONT.uiBold }]}>
                {assignIds.length === clients.length ? 'Quitar selección' : 'Seleccionar todos'}
              </Text>
            </TouchableOpacity>
          ) : null}
          <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
            {clients.map((c) => {
              const on = assignIds.includes(c.id)
              return (
                <TouchableOpacity key={c.id} testID={`nutricion-assign-client-${c.id}`} activeOpacity={0.8} onPress={() => setAssignIds((ids) => on ? ids.filter((x) => x !== c.id) : [...ids, c.id])}
                  style={[styles.copyRow, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary + '1A' : theme.secondary, borderRadius: theme.radius.lg }]}>
                  <Text style={[styles.copyName, { color: theme.foreground, fontFamily: FONT.uiSemibold }]} numberOfLines={2}>{c.full_name}</Text>
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
          <GuideRow theme={theme} color={SUCCESS} title="2. Alumnos (planes activos)" text="Al asignar una plantilla, el plan del alumno queda SINCRONIZADO con el molde." />
          <GuideRow theme={theme} color={EMBER} title="3. Edición individual (custom)" text="Si ajustás el plan solo para un alumno, pasa a PERSONALIZADO y deja de seguir el molde (editar la plantilla ya no lo cambia)." />
        </View>
      </NativeDialog>
    </SafeAreaView>
  )
}

// ─── Search + filter bar (patrón "Filtros y orden" — Alumnos/Plantillas/Alimentos) ──
function SearchFilterBar({
  theme, value, onChange, placeholder, onFilter, filtersActive,
}: {
  theme: any; value: string; onChange: (v: string) => void; placeholder: string; onFilter?: () => void; filtersActive?: boolean
}) {
  return (
    <View style={styles.filterBar}>
      <Input leftIcon={Search} placeholder={placeholder} value={value} onChangeText={onChange} clearButtonMode="while-editing" autoCapitalize="none" autoCorrect={false} containerStyle={{ flex: 1 }} />
      {onFilter ? (
        <TouchableOpacity
          testID="nutricion-filter-open"
          onPress={onFilter}
          activeOpacity={0.8}
          style={[styles.filterBtn, { backgroundColor: filtersActive ? theme.primary + '1A' : theme.card, borderColor: filtersActive ? theme.primary : theme.border }]}
        >
          <SlidersHorizontal size={18} color={filtersActive ? theme.primary : theme.mutedForeground} />
          {filtersActive ? <View style={[styles.filterDot, { backgroundColor: theme.primary, borderColor: theme.card }]} /> : null}
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

function SortSheet<T extends string>({
  theme, open, onClose, options, selected, onSelect,
}: {
  theme: any; open: boolean; onClose: () => void; options: { value: T; label: string }[]; selected: T; onSelect: (v: T) => void
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Filtros y orden" snapPoints={['42%']} footer={<Button label="Ver resultados" variant="sport" full onPress={onClose} />}>
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 12, color: theme.mutedForeground, fontFamily: FONT.uiMedium }}>Ordenar por</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {options.map((o) => {
            const on = selected === o.value
            return (
              <TouchableOpacity
                key={o.value}
                testID={`nutricion-sort-${o.value}`}
                onPress={() => onSelect(o.value)}
                activeOpacity={0.8}
                style={[styles.sortPill, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary + '1A' : theme.card }]}
              >
                <Text style={{ fontSize: 13, color: on ? theme.primary : theme.foreground, fontFamily: on ? FONT.uiBold : FONT.uiSemibold }}>{o.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>
    </Sheet>
  )
}

// ─── Tab: Plantillas ────────────────────────────────────────────────────────────
type TplSort = 'recent' | 'name' | 'kcalDesc' | 'kcalAsc'
function TemplatesTab({
  theme, templates, onEdit, onAssign, onDelete, onCreate,
}: {
  theme: any; templates: TemplateSummary[]; onEdit: (t: TemplateSummary) => void; onAssign: (t: TemplateSummary) => void; onDelete: (t: TemplateSummary) => void; onCreate: () => void
}) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<TplSort>('recent')
  const [filterOpen, setFilterOpen] = useState(false)

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    let out = q ? templates.filter((t) => t.name.toLowerCase().includes(q)) : [...templates]
    if (sort === 'name') out = out.sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'kcalDesc') out = out.sort((a, b) => (b.daily_calories ?? 0) - (a.daily_calories ?? 0))
    else if (sort === 'kcalAsc') out = out.sort((a, b) => (a.daily_calories ?? 0) - (b.daily_calories ?? 0))
    return out
  }, [templates, query, sort])

  if (templates.length === 0) {
    return (
      <View style={{ flex: 1 }}>
        <EmptyState icon={CalendarHeart} title="Sin plantillas todavía" subtitle="Creá tu primera plantilla para reutilizar planes de nutrición entre tus alumnos."
          action={<Button label="Nueva plantilla" leftIcon={Plus} variant="sport" onPress={onCreate} style={{ marginTop: 8 }} />} />
      </View>
    )
  }

  return (
    <View style={{ flex: 1 }}>
      <SearchFilterBar theme={theme} value={query} onChange={setQuery} placeholder="Buscar plantilla…" onFilter={() => setFilterOpen(true)} filtersActive={sort !== 'recent'} />
      <ScrollView contentContainerStyle={styles.tabBody} showsVerticalScrollIndicator={false}>
        {list.map((t) => {
          const { pPct, cPct, fPct } = macroSplit(t.daily_calories ?? 0, t.protein_g ?? 0, t.carbs_g ?? 0, t.fats_g ?? 0)
          const hasSplit = pPct + cPct + fPct > 0
          return (
            <View key={t.id} style={[styles.tplCard, { borderColor: theme.border, backgroundColor: theme.card, borderRadius: theme.radius.xl }, SHADOWS[theme.scheme as Scheme].sm]}>
              <View style={styles.tplTop}>
                <Text style={[styles.tplName, { color: theme.foreground, fontFamily: FONT.displayBold }]} numberOfLines={2}>{t.name}</Text>
                <Badge tone="neutral" variant="soft" size="sm">{t.mealCount} comida{t.mealCount !== 1 ? 's' : ''}</Badge>
              </View>
              <Text style={[styles.tplKcal, { color: theme.foreground, fontFamily: FONT.monoBold }]}>
                {t.daily_calories ?? 0}<Text style={{ fontSize: 12, color: theme.mutedForeground }}> kcal/día</Text>
              </Text>
              {hasSplit ? (
                <View style={styles.splitBar}>
                  {pPct > 0 ? <View style={{ flex: pPct, backgroundColor: MACRO_COLORS.protein }} /> : null}
                  {cPct > 0 ? <View style={{ flex: cPct, backgroundColor: MACRO_COLORS.carbs }} /> : null}
                  {fPct > 0 ? <View style={{ flex: fPct, backgroundColor: MACRO_COLORS.fats }} /> : null}
                </View>
              ) : null}
              <View style={styles.macrosRow}>
                {t.protein_g != null ? <MacroPill label="P" value={t.protein_g} color={MACRO_COLORS.protein} /> : null}
                {t.carbs_g != null ? <MacroPill label="C" value={t.carbs_g} color={MACRO_COLORS.carbs} /> : null}
                {t.fats_g != null ? <MacroPill label="G" value={t.fats_g} color={MACRO_COLORS.fats} /> : null}
              </View>
              <View style={[styles.tplActions, { borderTopColor: theme.border }]}>
                <TouchableOpacity testID={`nutricion-tpl-edit-${t.id}`} style={styles.tplBtn} activeOpacity={0.8} onPress={() => onEdit(t)}>
                  <Pencil size={14} color={theme.foreground} /><Text style={[styles.tplBtnText, { color: theme.foreground, fontFamily: FONT.uiSemibold }]}>Editar</Text>
                </TouchableOpacity>
                <TouchableOpacity testID={`nutricion-tpl-assign-${t.id}`} style={styles.tplBtn} activeOpacity={0.8} onPress={() => onAssign(t)}>
                  <UserPlus size={14} color={theme.primary} /><Text style={[styles.tplBtnText, { color: theme.primary, fontFamily: FONT.uiSemibold }]}>Asignar</Text>
                </TouchableOpacity>
                <TouchableOpacity testID={`nutricion-tpl-delete-${t.id}`} style={styles.tplBtn} activeOpacity={0.8} onPress={() => onDelete(t)}>
                  <Trash2 size={14} color={theme.destructive} /><Text style={[styles.tplBtnText, { color: theme.destructive, fontFamily: FONT.uiSemibold }]}>Borrar</Text>
                </TouchableOpacity>
              </View>
            </View>
          )
        })}
      </ScrollView>
      <SortSheet theme={theme} open={filterOpen} onClose={() => setFilterOpen(false)} selected={sort} onSelect={setSort}
        options={[{ value: 'recent', label: 'Recientes' }, { value: 'name', label: 'Nombre' }, { value: 'kcalDesc', label: 'Kcal ↓' }, { value: 'kcalAsc', label: 'Kcal ↑' }]} />
    </View>
  )
}

// ─── Tab: Alumnos (ActivePlansBoard móvil — sync/custom) ──────────────────────────
type BoardSort = 'adherence' | 'name' | 'plan'
function ClientsBoardTab({
  theme, board, planMeta, clientsWithoutPlan, onManage, onAssignEmpty, onReload,
}: {
  theme: any
  board: NutritionBoardRow[]
  planMeta: Map<string, PlanMeta>
  clientsWithoutPlan: Client[]
  onManage: (row: BoardRow) => void
  onAssignEmpty: (c: Client) => void
  onReload: () => void
}) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<BoardSort>('adherence')
  const [filterOpen, setFilterOpen] = useState(false)

  const rows: BoardRow[] = useMemo(() => {
    const q = query.trim().toLowerCase()
    let out: BoardRow[] = board.map((r) => {
      const m = planMeta.get(r.clientId)
      return { ...r, planId: m?.planId, isCustom: !!m?.isCustom }
    })
    if (q) out = out.filter((r) => r.clientName.toLowerCase().includes(q) || r.planName.toLowerCase().includes(q))
    if (sort === 'name') out = [...out].sort((a, b) => a.clientName.localeCompare(b.clientName))
    else if (sort === 'plan') out = [...out].sort((a, b) => a.planName.localeCompare(b.planName))
    else out = [...out].sort((a, b) => a.avg7d - b.avg7d) // adherencia peor primero (triage)
    return out
  }, [board, planMeta, query, sort])

  const synced = rows.filter((r) => !r.isCustom)
  const custom = rows.filter((r) => r.isCustom)

  function confirmUnassign(row: BoardRow) {
    if (!row.planId) return
    Alert.alert('Quitar plan', 'El plan de este alumno se marcará inactivo. No se borran comidas ni el historial de adherencia.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Quitar plan', style: 'destructive', onPress: async () => {
        const coachId = (await supabase.auth.getUser()).data.user?.id
        if (!coachId) return
        const { error } = await supabase.from('nutrition_plans').update({ is_active: false }).eq('id', row.planId!).eq('coach_id', coachId)
        if (error) { Alert.alert('Error', 'No se pudo quitar el plan.'); return }
        onReload()
      } },
    ])
  }

  const globalEmpty = board.length === 0 && clientsWithoutPlan.length === 0

  return (
    <View style={{ flex: 1 }}>
      <SearchFilterBar theme={theme} value={query} onChange={setQuery} placeholder="Buscar por alumno o plan…" onFilter={() => setFilterOpen(true)} filtersActive={sort !== 'adherence'} />
      {query.trim() ? (
        <View style={styles.resultBar}>
          <Text style={{ fontSize: 12, color: theme.mutedForeground, fontFamily: FONT.ui }}>{rows.length} resultado{rows.length !== 1 ? 's' : ''}</Text>
          <TouchableOpacity onPress={() => setQuery('')} activeOpacity={0.7}><Text style={{ fontSize: 12, color: theme.primary, fontFamily: FONT.uiBold }}>Limpiar</Text></TouchableOpacity>
        </View>
      ) : null}

      {globalEmpty ? (
        <EmptyState icon={Users} title="No hay alumnos en tu cartera" subtitle="Cuando asignes planes de nutrición, tus alumnos activos aparecerán acá." />
      ) : (
        <ScrollView contentContainerStyle={styles.tabBody} showsVerticalScrollIndicator={false}>
          <BoardColumn theme={theme} title="Sincronizados" subtitle="Siguen una plantilla — los cambios se propagan." accent={theme.primary} rows={synced} onManage={onManage} onUnassign={confirmUnassign} />
          <BoardColumn theme={theme} title="Personalizados" subtitle="Editados a mano — no sincronizan con la plantilla." accent={EMBER} rows={custom} onManage={onManage} onUnassign={confirmUnassign} />

          {clientsWithoutPlan.length > 0 ? (
            <View style={{ gap: 10, marginTop: 4 }}>
              <View style={styles.colHead}>
                <Users size={15} color={theme.mutedForeground} />
                <Text style={[styles.colTitle, { color: theme.foreground, fontFamily: FONT.uiExtra }]}>Sin plan activo ({clientsWithoutPlan.length})</Text>
              </View>
              {clientsWithoutPlan.map((c) => (
                <View key={c.id} style={[styles.noPlanCard, { borderColor: theme.border, backgroundColor: theme.card, borderRadius: theme.radius.lg }]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.noPlanName, { color: theme.foreground, fontFamily: FONT.uiBold }]} numberOfLines={1}>{c.full_name}</Text>
                    <Text style={[styles.noPlanHint, { color: theme.mutedForeground, fontFamily: FONT.uiSemibold }]}>Asigná desde Plantillas</Text>
                  </View>
                  <TouchableOpacity testID={`nutricion-assign-empty-${c.id}`} onPress={() => onAssignEmpty(c)} activeOpacity={0.85} style={[styles.assignEmptyBtn, { backgroundColor: theme.secondary, borderColor: theme.border }]}>
                    <UserPlus size={13} color={theme.primary} /><Text style={[styles.assignEmptyTxt, { color: theme.primary, fontFamily: FONT.uiExtra }]}>Asignar</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>
      )}

      <SortSheet theme={theme} open={filterOpen} onClose={() => setFilterOpen(false)} selected={sort} onSelect={setSort}
        options={[{ value: 'adherence', label: 'Adherencia' }, { value: 'name', label: 'Alumno' }, { value: 'plan', label: 'Plan' }]} />
    </View>
  )
}

function BoardColumn({
  theme, title, subtitle, accent, rows, onManage, onUnassign,
}: {
  theme: any; title: string; subtitle: string; accent: string; rows: BoardRow[]; onManage: (r: BoardRow) => void; onUnassign: (r: BoardRow) => void
}) {
  return (
    <View style={{ gap: 10 }}>
      <View style={{ gap: 2 }}>
        <View style={styles.colHead}>
          <Text style={[styles.colTitle, { color: accent, fontFamily: FONT.uiExtra }]}>{title}</Text>
          <Text style={{ fontSize: 11, color: theme.mutedForeground, fontFamily: FONT.monoBold }}>{rows.length}</Text>
        </View>
        <Text style={{ fontSize: 11, color: theme.mutedForeground, fontFamily: FONT.ui }}>{subtitle}</Text>
      </View>
      {rows.length === 0 ? (
        <View style={[styles.colEmpty, { borderColor: theme.border }]}>
          <Text style={{ fontSize: 13, color: theme.mutedForeground, fontFamily: FONT.ui }}>Sin planes en esta columna</Text>
        </View>
      ) : (
        rows.map((row, i) => <PlanCard key={row.clientId} theme={theme} row={row} accent={accent} index={i} onManage={onManage} onUnassign={onUnassign} />)
      )}
    </View>
  )
}

function PlanCard({
  theme, row, accent, index, onManage, onUnassign,
}: {
  theme: any; row: BoardRow; accent: string; index: number; onManage: (r: BoardRow) => void; onUnassign: (r: BoardRow) => void
}) {
  const initial = (row.clientName || '?').charAt(0).toUpperCase()
  return (
    <MotiView from={{ opacity: 0, translateY: 10 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 300, delay: Math.min(index * 45, 360) }}>
      <View style={[styles.planCard, { borderColor: theme.border, backgroundColor: theme.card, borderRadius: theme.radius.xl }, SHADOWS[theme.scheme as Scheme].sm]}>
        <View style={styles.planTop}>
          <View style={styles.planId}>
            <View style={[styles.avatar, { backgroundColor: accent + '1A' }]}>
              <Text style={{ fontSize: 15, color: accent, fontFamily: FONT.displayBold }}>{initial}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.planName, { color: theme.foreground, fontFamily: FONT.uiBold }]} numberOfLines={1}>{row.clientName}</Text>
              <Text style={[styles.planSub, { color: theme.mutedForeground, fontFamily: FONT.ui }]} numberOfLines={1}>{row.planName}</Text>
            </View>
          </View>
          <Badge tone={row.isCustom ? 'ember' : 'sport'} variant="soft" size="sm">{row.isCustom ? 'CUSTOM' : 'SYNCED'}</Badge>
        </View>

        <View style={styles.sparkHead}>
          <Text style={[styles.eyebrow, { color: theme.mutedForeground }]}>Últimos 7 días</Text>
          <Text style={{ fontSize: 10.5, color: theme.mutedForeground, fontFamily: FONT.mono }}>
            Hoy: <Text style={{ color: theme.foreground, fontFamily: FONT.monoBold }}>{row.todayKcal}</Text>{row.targetKcal ? ` / ${row.targetKcal} kcal` : ' kcal'}
          </Text>
        </View>
        <View style={styles.sparkBars}>
          {row.sparkline7d.map((v, i) => (
            <View key={i} style={{ flex: 1, borderRadius: 2, height: `${Math.max(8, Math.min(v, 100))}%`, backgroundColor: adherenceColorFor(row.avg7d), opacity: 0.4 + Math.min(v, 100) / 200 }} />
          ))}
        </View>

        <View style={[styles.planActions, { borderTopColor: theme.border }]}>
          <TouchableOpacity testID={`nutricion-manage-${row.clientId}`} onPress={() => onManage(row)} activeOpacity={0.85} style={[styles.manageBtn, { backgroundColor: theme.secondary, borderColor: theme.border }]}>
            <Text style={[styles.manageTxt, { color: theme.foreground, fontFamily: FONT.uiSemibold }]}>Gestionar plan</Text>
            <ChevronRight size={15} color={theme.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity testID={`nutricion-unassign-${row.clientId}`} onPress={() => onUnassign(row)} activeOpacity={0.8} style={[styles.trashBtn, { backgroundColor: theme.destructive + '14', borderColor: theme.destructive + '33' }]}>
            <Trash2 size={16} color={theme.destructive} />
          </TouchableOpacity>
        </View>
      </View>
    </MotiView>
  )
}

// ─── Tab: Alimentos (FoodLibrary embebida — E3-19) ────────────────────────────────
function FoodsTab({ theme, onFoodsChanged }: { theme: any; onFoodsChanged: () => void }) {
  const [foods, setFoods] = useState<FoodRow[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [scope, setScope] = useState<'mine' | 'all'>('mine')
  const [editing, setEditing] = useState<FoodRow | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setFoods(scope === 'all' ? await searchFoods(query) : await listCoachFoods())
    } finally {
      setLoading(false)
    }
  }, [scope, query])

  useEffect(() => { void load() }, [scope])
  useEffect(() => {
    if (scope !== 'all') return
    const t = setTimeout(() => { searchFoods(query).then(setFoods).catch(() => {}) }, 300)
    return () => clearTimeout(t)
  }, [query, scope])

  const filtered = useMemo(() => {
    if (scope === 'all') return foods
    const q = query.trim().toLowerCase()
    return q ? foods.filter((f) => f.name.toLowerCase().includes(q)) : foods
  }, [foods, query, scope])

  function confirmDelete(food: FoodRow) {
    Alert.alert('Eliminar alimento', `¿Eliminar "${food.name}"?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Eliminar', style: 'destructive', onPress: async () => {
        const r = await deleteFood(food.id)
        if (!r.ok) { Alert.alert('Error', r.error ?? 'No se pudo eliminar.'); return }
        void load(); onFoodsChanged()
      } },
    ])
  }

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.foodsHead}>
        <View style={styles.scopeRow}>
          {(['mine', 'all'] as const).map((s) => {
            const on = scope === s
            return (
              <TouchableOpacity key={s} testID={`nutricion-food-scope-${s}`} onPress={() => setScope(s)} activeOpacity={0.8}
                style={[styles.scopeChip, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary + '1A' : 'transparent' }]}>
                <Text style={{ fontSize: 12.5, fontFamily: FONT.uiSemibold, color: on ? theme.primary : theme.mutedForeground }}>{s === 'mine' ? 'Míos' : 'Catálogo'}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
        <TouchableOpacity testID="nutricion-food-new" onPress={() => setCreating(true)} activeOpacity={0.9} style={[styles.foodAddBtn, { backgroundColor: theme.primary }]}>
          <Plus size={16} color={theme.primaryForeground} />
          <Text style={[styles.foodAddTxt, { color: theme.primaryForeground, fontFamily: FONT.uiBold }]}>Nuevo</Text>
        </TouchableOpacity>
      </View>

      <SearchFilterBar theme={theme} value={query} onChange={setQuery} placeholder="Buscar alimento…" />

      {loading ? (
        <EvaLoaderScreen subtitle="Cargando alimentos…" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(f) => f.id}
          contentContainerStyle={styles.foodsList}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ paddingTop: 40 }}>
              <EmptyState icon={Apple} title={scope === 'mine' ? 'Sin alimentos propios' : 'Sin resultados'} subtitle={scope === 'mine' ? 'Tocá Nuevo para crear tu primer alimento.' : 'Probá con otro término de búsqueda.'} />
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.foodCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
              <View style={styles.foodMark}>
                {scope === 'mine' ? <Star size={15} color={EMBER} fill={EMBER} /> : <Globe size={15} color={theme.mutedForeground} />}
              </View>
              <TouchableOpacity style={{ flex: 1 }} activeOpacity={scope === 'mine' ? 0.8 : 1} onPress={() => { if (scope === 'mine') setEditing(item) }}>
                <Text style={[styles.foodName, { color: theme.foreground, fontFamily: FONT.uiBold }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[styles.foodMacros, { color: theme.mutedForeground, fontFamily: FONT.mono }]}>
                  {item.calories} kcal · P{item.protein_g} C{item.carbs_g} G{item.fats_g} / {item.serving_size}{item.serving_unit}
                </Text>
              </TouchableOpacity>
              {scope === 'mine' ? (
                <>
                  <TouchableOpacity testID={`nutricion-food-edit-${item.id}`} onPress={() => setEditing(item)} hitSlop={8} style={styles.iconBtn}><Pencil size={16} color={theme.mutedForeground} /></TouchableOpacity>
                  <TouchableOpacity testID={`nutricion-food-delete-${item.id}`} onPress={() => confirmDelete(item)} hitSlop={8} style={styles.iconBtn}><Trash2 size={16} color={theme.destructive} /></TouchableOpacity>
                </>
              ) : (
                <Text style={[styles.foodMacros, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>Catálogo</Text>
              )}
            </View>
          )}
        />
      )}

      <NativeDialog open={creating || !!editing} title={editing ? 'Editar alimento' : 'Nuevo alimento'} onClose={() => { setCreating(false); setEditing(null) }}>
        <FoodForm theme={theme} food={editing} onDone={() => { setCreating(false); setEditing(null); void load(); onFoodsChanged() }} onCancel={() => { setCreating(false); setEditing(null) }} />
      </NativeDialog>
    </View>
  )
}

function FoodForm({ theme, food, onDone, onCancel }: { theme: any; food: FoodRow | null; onDone: () => void; onCancel: () => void }) {
  const [name, setName] = useState(food?.name ?? '')
  const [calories, setCalories] = useState(food ? String(food.calories) : '')
  const [protein, setProtein] = useState(food ? String(food.protein_g) : '')
  const [carbs, setCarbs] = useState(food ? String(food.carbs_g) : '')
  const [fats, setFats] = useState(food ? String(food.fats_g) : '')
  const [serving, setServing] = useState(food ? String(food.serving_size) : '100')
  const [unit, setUnit] = useState<FoodUnit>((food?.serving_unit as FoodUnit) ?? 'g')
  const [category, setCategory] = useState<string>(food?.category ?? 'otro')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    setSaving(true)
    const input = {
      name, calories: Number(calories) || 0, protein_g: Number(protein) || 0, carbs_g: Number(carbs) || 0,
      fats_g: Number(fats) || 0, serving_size: Number(serving) || 100, serving_unit: unit, category,
    }
    const r = food ? await updateFood(food.id, input) : await createCustomFood(input)
    setSaving(false)
    if (!r.ok) { setError(r.error ?? 'No se pudo guardar.'); return }
    onDone()
  }

  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 420 }} contentContainerStyle={{ gap: 12 }}>
      {error ? <Text style={{ color: theme.destructive, fontSize: 13, fontFamily: FONT.ui }}>{error}</Text> : null}
      <FField theme={theme} label="Nombre" value={name} onChangeText={setName} placeholder="Ej: Pechuga de pollo" />
      <View style={styles.macroInputRow}>
        <FField theme={theme} center label="kcal" value={calories} onChangeText={setCalories} keyboardType="number-pad" />
        <FField theme={theme} center label="Prot" value={protein} onChangeText={setProtein} keyboardType="number-pad" />
        <FField theme={theme} center label="Carbs" value={carbs} onChangeText={setCarbs} keyboardType="number-pad" />
        <FField theme={theme} center label="Gras" value={fats} onChangeText={setFats} keyboardType="number-pad" />
      </View>
      <View style={styles.servingRow}>
        <FField theme={theme} center label="Porción" value={serving} onChangeText={setServing} keyboardType="number-pad" />
        <View style={{ gap: 5 }}>
          <Text style={[styles.fLabel, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>Unidad</Text>
          <View style={[styles.unitWrap, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
            {FOOD_UNITS.map((u) => (
              <TouchableOpacity key={u} testID={`nutricion-food-unit-${u}`} onPress={() => setUnit(u)} activeOpacity={0.8} style={[styles.unitChip, unit === u && { backgroundColor: theme.primary }]}>
                <Text style={{ fontSize: 12, fontFamily: FONT.uiSemibold, color: unit === u ? theme.primaryForeground : theme.mutedForeground }}>{u}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
      <Text style={[styles.fLabel, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>Categoría</Text>
      <View style={styles.catGrid}>
        {FOOD_CATEGORIES.map((c) => {
          const active = c === category
          return (
            <TouchableOpacity key={c} testID={`nutricion-food-cat-${c}`} onPress={() => setCategory(c)} activeOpacity={0.8}
              style={[styles.catChip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary + '1A' : 'transparent' }]}>
              <Text style={{ fontSize: 12, fontFamily: FONT.uiSemibold, color: active ? theme.primary : theme.mutedForeground }}>{c}</Text>
            </TouchableOpacity>
          )
        })}
      </View>
      <View style={styles.formActions}>
        <TouchableOpacity onPress={onCancel} disabled={saving} style={[styles.cancelBtn, { borderColor: theme.border }]} activeOpacity={0.8}>
          <Text style={{ color: theme.mutedForeground, fontFamily: FONT.uiSemibold, fontSize: 14 }}>Cancelar</Text>
        </TouchableOpacity>
        <TouchableOpacity testID="nutricion-food-save" onPress={submit} disabled={saving} style={[styles.saveBtn, { backgroundColor: theme.primary, opacity: saving ? 0.6 : 1 }]} activeOpacity={0.85}>
          <Text style={{ color: theme.primaryForeground, fontFamily: FONT.uiBold, fontSize: 14 }}>{saving ? 'Guardando...' : food ? 'Guardar' : 'Crear'}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

function FField({ theme, label, center, ...rest }: any) {
  return (
    <View style={{ flex: 1, gap: 5 }}>
      <Text style={[styles.fLabel, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>{label}</Text>
      <TextInput placeholderTextColor={theme.mutedForeground}
        style={[styles.fInput, !center && { textAlign: 'left' }, { borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: FONT.ui }]} {...rest} />
    </View>
  )
}

// ─── Tab: Recetas (placeholder — la library llega en E5) ──────────────────────────
function RecipesTab({ theme }: { theme: any }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={[styles.baseBanner, { backgroundColor: theme.secondary }]}>
        <Badge tone="aqua" variant="soft" size="sm">Base</Badge>
        <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, color: theme.mutedForeground, fontFamily: FONT.ui }}>
          Vienen incluidas en el módulo. Son inspiración — no afectan macros ni adherencia.
        </Text>
      </View>
      <EmptyState icon={ChefHat} title="Recetas — próximamente" subtitle="La biblioteca de recetas para compartir con tus alumnos llegará pronto a la app." />
    </View>
  )
}

// ─── Upsell (gate por tier, SOLO visual) ──────────────────────────────────────────
function UpsellCard({ theme }: { theme: any }) {
  const features = [
    'Plantillas de nutrición reutilizables',
    'Catálogo de alimentos y macros por porción',
    'Asignación de planes a tus alumnos',
  ]
  return (
    <View style={styles.upsellWrap}>
      <View style={[styles.upsellCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }, SHADOWS[theme.scheme as Scheme].sm]}>
        <View style={[styles.upsellIcon, { backgroundColor: theme.primary + '1A' }]}>
          <Utensils size={26} color={theme.primary} />
        </View>
        <View style={styles.upsellBadge}>
          <Sparkles size={12} color={theme.primary} />
          <Text style={{ fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', color: theme.primary, fontFamily: FONT.uiExtra }}>Módulo Pro</Text>
        </View>
        <Text style={[styles.upsellTitle, { color: theme.foreground, fontFamily: FONT.displayBold }]}>Nutrición en Pro o superior</Text>
        <Text style={[styles.upsellText, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>
          Tu plan actual incluye entrenos. Al subir a Pro desbloqueás el centro de nutrición completo.
        </Text>
        <View style={{ gap: 8, alignSelf: 'stretch', marginVertical: 4 }}>
          {features.map((f) => (
            <View key={f} style={styles.featRow}>
              <Check size={15} color={SUCCESS} />
              <Text style={{ flex: 1, fontSize: 13, color: theme.foreground, fontFamily: FONT.uiMedium }}>{f}</Text>
            </View>
          ))}
        </View>
        <Button label="Mejorar a Pro" variant="sport" full onPress={() => Linking.openURL(`${getApiBaseUrl()}/coach/subscription?upgrade=pro`).catch(() => null)} />
      </View>
    </View>
  )
}

function GuideRow({ theme, color, title, text }: { theme: any; color: string; title: string; text: string }) {
  return (
    <View style={{ gap: 3 }}>
      <Text style={[styles.guideTitle, { color, fontFamily: FONT.uiExtra }]}>{title}</Text>
      <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>{text}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 12 },
  hTitle: { fontSize: 25, letterSpacing: -0.5 },
  hSub: { fontSize: 13, marginTop: 2 },
  hActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  hIconBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  hCreateBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 40, paddingHorizontal: 14, borderRadius: 12 },
  hCreateTxt: { fontSize: 13 },

  tabStripWrap: { paddingHorizontal: 16, paddingBottom: 10 },
  tabStrip: { flexDirection: 'row', gap: 3, padding: 3, borderRadius: 14 },
  tabSeg: { flex: 1, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 11, paddingHorizontal: 4 },

  filterBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 10 },
  filterBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderRadius: 14 },
  filterDot: { position: 'absolute', top: -4, right: -4, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },
  resultBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 8 },
  sortPill: { borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 9 },

  tabBody: { paddingHorizontal: 16, paddingBottom: 120, gap: 16 },
  hint: { fontSize: 12, lineHeight: 17 },
  eyebrow: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1, fontFamily: FONT.uiExtra },

  // Template card
  tplCard: { borderWidth: 1, padding: 16, gap: 10 },
  tplTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  tplName: { fontSize: 16, letterSpacing: -0.2, flex: 1 },
  tplKcal: { fontSize: 22 },
  splitBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden' },
  macrosRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tplActions: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 16 },
  tplBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tplBtnText: { fontSize: 13 },

  // Board
  colHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  colTitle: { fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.3 },
  colEmpty: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 16, paddingVertical: 24, alignItems: 'center' },
  planCard: { borderWidth: 1, padding: 14, gap: 12 },
  planTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  planId: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 },
  avatar: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  planName: { fontSize: 14 },
  planSub: { fontSize: 12, marginTop: 1 },
  sparkHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sparkBars: { height: 32, flexDirection: 'row', alignItems: 'flex-end', gap: 3, width: '100%' },
  planActions: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  manageBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 40, paddingHorizontal: 14, borderWidth: 1, borderRadius: 12 },
  manageTxt: { fontSize: 13 },
  trashBtn: { width: 40, height: 40, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  noPlanCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  noPlanName: { fontSize: 14 },
  noPlanHint: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 2 },
  assignEmptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 12, borderWidth: 1, borderRadius: 999 },
  assignEmptyTxt: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3 },

  // Foods
  foodsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  scopeRow: { flexDirection: 'row', gap: 8 },
  scopeChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 7 },
  foodAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 38, paddingHorizontal: 14, borderRadius: 12 },
  foodAddTxt: { fontSize: 13 },
  foodsList: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 120 },
  foodCard: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderWidth: 1 },
  foodMark: { width: 22, alignItems: 'center', justifyContent: 'center' },
  foodName: { fontSize: 14 },
  foodMacros: { fontSize: 12, marginTop: 3 },
  iconBtn: { padding: 4 },
  macroInputRow: { flexDirection: 'row', gap: 8 },
  servingRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-end' },
  fLabel: { fontSize: 12 },
  fInput: { height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, fontSize: 15, textAlign: 'center' },
  unitWrap: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, padding: 3, gap: 3 },
  unitChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  catChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 4 },
  cancelBtn: { flex: 1, height: 46, borderWidth: 1, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  saveBtn: { flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

  // Recipes
  baseBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 8, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 14 },

  // Upsell
  upsellWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  upsellCard: { borderWidth: 1, padding: 24, gap: 12, alignItems: 'center', maxWidth: 420, width: '100%' },
  upsellIcon: { width: 56, height: 56, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  upsellBadge: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  upsellTitle: { fontSize: 19, textAlign: 'center', letterSpacing: -0.3 },
  upsellText: { fontSize: 13.5, lineHeight: 20, textAlign: 'center' },
  featRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  // Dialogs
  assignWarn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  assignWarnTxt: { fontSize: 12, lineHeight: 17 },
  selectAllRow: { alignSelf: 'flex-end', paddingVertical: 4, paddingHorizontal: 4 },
  selectAllTxt: { fontSize: 12.5 },
  copyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  copyName: { fontSize: 14, flex: 1 },
  guideTitle: { fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.3 },
})
