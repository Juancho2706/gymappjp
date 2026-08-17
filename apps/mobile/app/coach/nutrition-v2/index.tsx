import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { FlashList } from '@shopify/flash-list'
import {
  Apple,
  ArrowLeft,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  FilePlus2,
  Plus,
  ScanLine,
  Search,
  Users,
  X,
} from 'lucide-react-native'
import {
  AddActionButton,
  CoachAttentionCard,
  NutritionHeader,
  NutritionSkeleton,
  NutritionStatePanel,
  NutritionCard,
  PlanTemplateList,
  StrategyBadge,
  SyncOfflineState,
} from '../../../components/nutrition-v2'
import { Button, Sheet } from '../../../components'
import { COACH_TABBAR_CLEARANCE } from '../../../components/coach/CoachMobileChrome'
import {
  reportCoachTabbarScroll,
  resetCoachTabbarScroll,
} from '../../../components/coach/CoachTabbarScroll'
import {
  NutritionCoachHubPageReadModelSchema,
  formatPlanBuilderOrigin,
  type NutritionCoachHubItem,
  type NutritionCoachHubPageReadModel,
  type NutritionV2CoachScope,
} from '@eva/nutrition-v2'
import { supabase } from '../../../lib/supabase'
import { useEntitlements } from '../../../lib/entitlements'
import { useWorkspace } from '../../../lib/workspace'
import {
  getNutritionCoachHubV2,
  nutritionV2CoachScope,
  nutritionV2CoachScopeCacheKey,
} from '../../../lib/nutrition-v2.api'
import {
  readNutritionV2Cache,
  writeNutritionV2Cache,
} from '../../../lib/nutrition-v2-cache'
import {
  fetchNutritionV2PlanTemplates,
  type NutritionV2PlanTemplateListItem,
} from '../../../lib/nutrition-v2-plan-templates.api'
import {
  DEFAULT_NUTRITION_ROSTER_FILTERS,
  NUTRITION_ATTENTION_FILTER_OPTIONS,
  NUTRITION_SORT_OPTIONS,
  applyNutritionRosterFilters,
  filterNutritionPickerEntries,
  isNutritionHubPageComplete,
  isNutritionRosterFiltered,
  localDateOf,
  mapNutritionHubMetrics,
  nutritionAttentionCardDescription,
  nutritionAttentionCardTitle,
  nutritionAttentionCardTone,
  nutritionHubMetricScopeLabel,
  nutritionPlanCtaLabel,
  nutritionV2EditorHref,
  nutritionV2TemplateEditorHref,
  resolveNutritionHubInitialTab,
  type NutritionHubTabKey,
  type NutritionRosterFilters,
  type NutritionSortKey,
} from '../../../lib/nutrition-v2-hub'
import { useTheme } from '../../../context/ThemeContext'
import { resolveEffectiveCoachBrandTheme } from '../../../lib/theme'
// Cuerpos embebibles de las otras dos superficies del hub, montados bajo el tablist (4B-17).
// `foods.tsx` expone la variante `embedded` sobre su default; `curation.tsx` (4B-07) expone el
// cuerpo embebible como export nombrado `CurationQueueScreen` — se usa el export REAL entregado.
// `portions.tsx` YA NO se embebe (QA T3.v): es una pantalla propia, se navega desde Alimentos.
import CoachNutritionCatalogScreen from './foods'
import { CurationQueueScreen } from './curation'

const PAGE_SIZE = 25
const COACH_TIMEZONE = 'America/Santiago'
// Roster COMPLETO del scope para el picker global "Nuevo plan": pagina el hub scoped (keyset por
// updatedAt) hasta este tope, espejo del RSC web (8×50). El picker filtra client-side.
const PICKER_PAGE_SIZE = 50
const PICKER_MAX_PAGES = 8
// Alto estimado del chrome colapsable (titulo + tablist) usado SOLO en el primer frame, antes
// de que `onLayout` mida de verdad. Sin esta semilla las 3 listas arrancan con paddingTop 0 y se
// ve un salto al medir. Aproximado a ojo: pt-5 + header (titulo 3xl + descripcion) + tira de tabs.
const HUB_CHROME_FALLBACK_HEIGHT = 180

type HubCursor = { updatedAt: string; clientId: string }
// `planId` (NUT-004): raiz de plan ACTIVA del alumno. Viaja al builder por query para que publique
// una version nueva sobre ella en vez de insertar otra raiz activa.
type PickerEntry = { clientId: string; clientName: string; planStatus: string | null; planId: string | null }

// Tablist del hub — espejo de web `NutritionHubTabs.tsx:12-17`: orden fijo, copys e iconos
// verbatim, default "Alumnos". Estado local; el deep link `?tab=` (NUT-027) solo fija el valor
// INICIAL y se re-aplica si el parametro cambia (nunca pisa la seleccion manual del coach).
//
// PARIDAD (decision owner, QA T3.v): la segunda pestaña es "Plantillas", como en la web. Antes
// era "Porciones", que la web no tiene: el coach que venia del navegador no reconocia el hub y su
// biblioteca de plantillas era inalcanzable sin abrir el sheet "Nuevo plan". Porciones no se
// pierde — es una PANTALLA propia a la que se entra desde la pestaña Alimentos.
type HubTabKey = NutritionHubTabKey
const HUB_TABS: Array<{ key: HubTabKey; label: string; icon: typeof Users }> = [
  { key: 'roster', label: 'Alumnos', icon: Users },
  { key: 'templates', label: 'Plantillas', icon: Copy },
  { key: 'foods', label: 'Alimentos', icon: Apple },
  { key: 'curation', label: 'Curación', icon: ScanLine },
]

export default function CoachNutritionV2Screen() {
  const router = useRouter()
  const { theme, branding } = useTheme()
  /**
   * Color de marca REAL del coach para las pastillas `primary` de la «Familia N». Es el requisito
   * duro del white-label: el fondo de esas pastillas ES la marca y la tinta se calcula CONTRA ese
   * hex, así que si el botón se pintara con el default del componente (#2563EB, el primary de la
   * web) una marca clara terminaría con texto blanco sobre amarillo. `resolveEffectiveCoachBrandTheme`
   * es el mismo resolutor del que sale `theme` (tier + preset + azul EVA de fallback).
   */
  const brandColor = resolveEffectiveCoachBrandTheme(branding).brandColor
  const insets = useSafeAreaInsets()
  const entitlements = useEntitlements()
  const {
    ready: workspaceReady,
    kind: workspaceKind,
    teamId: workspaceTeamId,
    orgId: workspaceOrgId,
  } = useWorkspace()
  const [userId, setUserId] = useState<string | null>(null)
  // Deep link `/coach/foods` -> `/coach/nutricion?tab=foods` (NUT-027): con V2 ON el hub montaba
  // con `roster` fijo y el parametro se perdia. Se lee aqui (la pantalla se monta embebida en el
  // tab del coach, asi que ve los params de esa ruta) y se traduce con el helper puro.
  const routeParams = useLocalSearchParams<{ tab?: string }>()
  const tabParam = Array.isArray(routeParams.tab) ? (routeParams.tab[0] ?? null) : (routeParams.tab ?? null)
  // Tab activa del hub (estado local efímero; inicial derivada del `?tab=`).
  const [activeTab, setActiveTab] = useState<HubTabKey>(() => resolveNutritionHubInitialTab(tabParam))
  // Re-sincroniza SOLO cuando el parametro cambia (otro deep link con el hub ya montado): sin este
  // guard, cada render pisaria la pestana que el coach eligio a mano.
  const lastTabParamRef = useRef<string | null>(tabParam)
  const [page, setPage] = useState<NutritionCoachHubPageReadModel | null>(null)
  const [items, setItems] = useState<NutritionCoachHubItem[]>([])
  const [pageIndex, setPageIndex] = useState(0)
  const [filters, setFilters] = useState<NutritionRosterFilters>(DEFAULT_NUTRITION_ROSTER_FILTERS)
  const [loading, setLoading] = useState(true)
  const [paging, setPaging] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [offline, setOffline] = useState(false)
  // CTA global "Nuevo plan": sheet + roster completo (cargado perezosamente al abrir).
  const [sortOpen, setSortOpen] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerRoster, setPickerRoster] = useState<PickerEntry[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)
  const pickerLoadedRef = useRef(false)
  // Pestaña "Reutilizar" del picker (F4, espejo del modal web `NewPlanPickerButton`): la biblioteca
  // de plantillas se carga PEREZOSAMENTE al entrar a esa pestaña — quien crea desde cero no paga
  // una consulta que no pidió. `null` = todavía no se intentó.
  const [pickerTemplates, setPickerTemplates] = useState<NutritionV2PlanTemplateListItem[] | null>(null)
  const [pickerTemplatesLoading, setPickerTemplatesLoading] = useState(false)
  const [pickerTemplatesError, setPickerTemplatesError] = useState<string | null>(null)
  // Pila de cursores ancestros: cursors[i] es el cursor con que se cargo la pagina i (null = primera).
  const cursorsRef = useRef<Array<HubCursor | null>>([null])
  // Fail-closed: only fetch once the workspace resolved AND collapses to a valid coach scope.
  const scope = useMemo(
    () =>
      workspaceReady
        ? nutritionV2CoachScope({ kind: workspaceKind, teamId: workspaceTeamId, orgId: workspaceOrgId })
        : null,
    [workspaceReady, workspaceKind, workspaceTeamId, workspaceOrgId],
  )
  const scopeCacheKey = scope ? nutritionV2CoachScopeCacheKey(scope) : null
  const enabled = entitlements.ready && scope !== null
  const todayLocalDate = useMemo(
    () => localDateOf(new Date().toISOString(), COACH_TIMEZONE) ?? '',
    [],
  )

  useEffect(() => {
    if (tabParam === lastTabParamRef.current) return
    lastTabParamRef.current = tabParam
    if (tabParam != null) setActiveTab(resolveNutritionHubInitialTab(tabParam))
  }, [tabParam])

  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setUserId(data.session?.user.id ?? null)
    })
    return () => {
      active = false
    }
  }, [])

  const fetchPage = useCallback(
    async (cursor: HubCursor | null): Promise<NutritionCoachHubPageReadModel> =>
      getNutritionCoachHubV2({
        scope: scope!,
        cursorUpdatedAt: cursor?.updatedAt,
        cursorClientId: cursor?.clientId,
        pageSize: PAGE_SIZE,
      }),
    [scope],
  )

  const loadFirst = useCallback(async (force = false) => {
    if (!userId || !enabled || !scope || !scopeCacheKey) return
    const firstPageKey = `${scopeCacheKey}:first-page`

    if (!force) {
      const cached = await readNutritionV2Cache({
        userId,
        kind: 'coachHub',
        scopeKey: firstPageKey,
        schema: NutritionCoachHubPageReadModelSchema,
        allowStale: true,
      })
      if (cached) {
        setPage(cached.payload)
        setItems(cached.payload.items)
        setOffline(cached.stale)
        setLoading(false)
      }
    }

    try {
      const fresh = await fetchPage(null)
      cursorsRef.current = [null]
      setPageIndex(0)
      setPage(fresh)
      setItems(fresh.items)
      setOffline(false)
      await writeNutritionV2Cache({
        userId,
        kind: 'coachHub',
        scopeKey: firstPageKey,
        payload: fresh,
      })
    } catch {
      setOffline(true)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [enabled, fetchPage, userId, scope, scopeCacheKey])

  const goToPage = useCallback(
    async (targetIndex: number, cursor: HubCursor | null) => {
      if (!scope || paging) return
      setPaging(true)
      try {
        const next = await fetchPage(cursor)
        cursorsRef.current[targetIndex] = cursor
        setPage(next)
        setItems(next.items)
        setPageIndex(targetIndex)
        setOffline(false)
      } catch {
        setOffline(true)
      } finally {
        setPaging(false)
      }
    },
    [fetchPage, paging, scope],
  )

  const onNext = useCallback(() => {
    if (!page?.hasMore || !page.nextCursor) return
    void goToPage(pageIndex + 1, page.nextCursor)
  }, [goToPage, page, pageIndex])

  const onPrev = useCallback(() => {
    if (pageIndex === 0) return
    void goToPage(pageIndex - 1, cursorsRef.current[pageIndex - 1] ?? null)
  }, [goToPage, pageIndex])

  useEffect(() => {
    if (userId && enabled && scope) void loadFirst()
  }, [enabled, loadFirst, userId, scope])

  // Carga el roster COMPLETO del scope para el picker (independiente de la paginacion visible).
  // Perezosa: se dispara la primera vez que se abre el CTA global, no en cada montaje del hub.
  const loadPickerRoster = useCallback(async () => {
    if (!scope) return
    setPickerLoading(true)
    try {
      const acc: PickerEntry[] = []
      let cursor: HubCursor | null = null
      for (let p = 0; p < PICKER_MAX_PAGES; p += 1) {
        const chunk = await getNutritionCoachHubV2({
          scope,
          cursorUpdatedAt: cursor?.updatedAt,
          cursorClientId: cursor?.clientId,
          pageSize: PICKER_PAGE_SIZE,
        })
        for (const it of chunk.items) {
          acc.push({
            clientId: it.clientId,
            clientName: it.clientName,
            planStatus: it.planStatus,
            planId: it.planId,
          })
        }
        if (!chunk.hasMore || !chunk.nextCursor) break
        cursor = chunk.nextCursor
      }
      setPickerRoster(acc)
      pickerLoadedRef.current = true
    } catch {
      // Offline: el picker cae al roster de la pagina visible (effectivePickerRoster).
    } finally {
      setPickerLoading(false)
    }
  }, [scope])

  // Biblioteca de plantillas del coach (pestaña "Reutilizar"). Perezosa y con reintento: el orden
  // lo fija el servidor (favoritas → más usadas → más recientes) y la UI NO lo toca.
  const loadPickerTemplates = useCallback(async () => {
    if (!scope) return
    setPickerTemplatesLoading(true)
    setPickerTemplatesError(null)
    try {
      const templates = await fetchNutritionV2PlanTemplates({ scope })
      setPickerTemplates(templates)
    } catch {
      setPickerTemplates([])
      setPickerTemplatesError('No pudimos cargar tus plantillas. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setPickerTemplatesLoading(false)
    }
  }, [scope])

  const openPicker = useCallback(() => {
    setPickerSearch('')
    setPickerOpen(true)
    if (!pickerLoadedRef.current) void loadPickerRoster()
  }, [loadPickerRoster])

  /**
   * Alumno elegido en el picker. Con ORIGEN (plantilla) se navega a la MISMA ruta del builder con
   * `?from=template:<id>` (AD-3): no hay un segundo camino de creación que pueda divergir del
   * wizard normal.
   *
   * `planId` viaja SIEMPRE, con origen o sin él: son cosas distintas — el origen dice de qué CONTENIDO
   * partir, y `planId` dice sobre qué RAÍZ publicar la versión (NUT-004). Mezclarlos crearía una
   * segunda raíz activa para un alumno que ya tenía plan.
   */
  const choosePickerClient = useCallback(
    (clientId: string, planId: string | null, origin: string | null) => {
      setPickerOpen(false)
      // CORTE RN (T3.3b): el `+` entra por el EDITOR UNICO, con la MISMA puerta `?from=` que la
      // web. El `planId` ya no viaja: el editor lee la ficha del alumno y resuelve solo si hay
      // plan vigente (y con el, el CAS del reemplazo) — imposible crear una segunda raiz.
      router.push(nutritionV2EditorHref(clientId, { from: origin }))
    },
    [router],
  )

  /**
   * Administrar material reutilizable desde el telefono (corte RN, T3.3b): `null` = plantilla
   * nueva. Hasta ahora crear o editar una plantilla exigia la web.
   */
  const editTemplate = useCallback(
    (templateId: string | null) => {
      setPickerOpen(false)
      router.push(nutritionV2TemplateEditorHref(templateId))
    },
    [router],
  )

  const metrics = useMemo(
    () => mapNutritionHubMetrics(items, { todayLocalDate, timeZone: COACH_TIMEZONE }),
    [items, todayLocalDate],
  )
  const pageComplete = isNutritionHubPageComplete({
    hasMore: page?.hasMore ?? false,
    hasIncomingCursor: pageIndex > 0,
  })
  const scopeLabel = nutritionHubMetricScopeLabel(pageComplete)
  const visibleItems = useMemo(
    () => applyNutritionRosterFilters(items, filters),
    [filters, items],
  )
  const filtered = isNutritionRosterFiltered(filters)
  const sortLabel = NUTRITION_SORT_OPTIONS.find((option) => option.value === filters.sort)?.label ?? ''
  // Roster efectivo del picker: el completo si ya cargo; si no (o si fallo offline), la pagina visible.
  const effectivePickerRoster = useMemo<PickerEntry[]>(
    () =>
      pickerRoster.length > 0
        ? pickerRoster
        : items.map((it) => ({
            clientId: it.clientId,
            clientName: it.clientName,
            planStatus: it.planStatus,
            planId: it.planId,
          })),
    [pickerRoster, items],
  )
  const clearFilters = useCallback(() => setFilters(DEFAULT_NUTRITION_ROSTER_FILTERS), [])

  // ── Chrome colapsable del hub (QA-4 H2) ───────────────────────────────────────────────────
  // Requerimiento: SOLO las 3 pestanas quedan pegadas arriba. El bloque de titulo (+ pill de
  // sync + CTA "Nuevo plan") se va con el scroll. Como las 3 superficies del hub usan FlashList
  // (y ahi `stickyHeaderIndices` indexa `data`, no los hijos), el patron del alumno con
  // `ScrollView stickyHeaderIndices` no se puede copiar: el chrome vive en un overlay absoluto
  // que se traslada hasta -alto-del-titulo y ahi se detiene (clamp). Las listas solo aportan
  // `onScroll` + `paddingTop` y pasan POR DETRAS del overlay, que es opaco a proposito.
  const scrollY = useRef(new Animated.Value(0)).current
  // Alto TOTAL del overlay (titulo + tabs) = paddingTop de las 3 listas.
  const [chromeHeight, setChromeHeight] = useState(HUB_CHROME_FALLBACK_HEIGHT)
  // Alto del bloque de titulo SOLO = recorrido del colapso.
  const [headerHeight, setHeaderHeight] = useState(0)
  const onChromeLayout = useCallback(
    (event: LayoutChangeEvent) => setChromeHeight(event.nativeEvent.layout.height),
    [],
  )
  const onHeaderLayout = useCallback(
    (event: LayoutChangeEvent) => setHeaderHeight(event.nativeEvent.layout.height),
    [],
  )
  const chromeTranslate = useMemo(() => {
    const travel = Math.max(1, headerHeight)
    return scrollY.interpolate({
      inputRange: [0, travel],
      outputRange: [0, -travel],
      extrapolate: 'clamp',
    })
  }, [headerHeight, scrollY])
  // Handler unico de las 3 superficies. NO usamos `Animated.event` con `useNativeDriver: true`:
  // FlashList v2 expone un imperative handle (no un host component) y ademas invoca `onScroll`
  // como listener JS plano en vez de reenviarlo al ScrollView, asi que el driver nativo nunca
  // llegaria a engancharse. Con `Animated.Value.setValue` el overlay se actualiza por
  // `setNativeProps` (sin re-render de React), que es lo que importa para no repintar el roster.
  // Bono: alimenta la capsula flotante del coach, que hasta ahora nunca se minimizaba en el hub V2.
  const onBodyScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = event.nativeEvent.contentOffset.y
      scrollY.setValue(y)
      reportCoachTabbarScroll(y)
    },
    [scrollY],
  )
  // Cada tab monta su propio scroll en 0: sin este reset el overlay se queda colapsado sobre una
  // lista que esta en el tope y el titulo desaparece sin forma de recuperarlo.
  useEffect(() => {
    scrollY.setValue(0)
    resetCoachTabbarScroll()
  }, [activeTab, scrollY])

  if (!entitlements.ready || !workspaceReady) {
    return (
      <View className="flex-1 bg-surface-app px-4" style={{ paddingTop: insets.top + 24 }}>
        <NutritionSkeleton variant="coach" />
      </View>
    )
  }

  if (!enabled || !scope) {
    return (
      <View className="flex-1 bg-surface-app px-4" style={{ paddingTop: insets.top + 24 }}>
        <NutritionStatePanel
          icon="permission"
          title="Centro V2 no habilitado"
           description="Este workspace no es compatible con Nutrición V2."
        />
      </View>
    )
  }

  if (loading) {
    return (
      <View className="flex-1 bg-surface-app px-4" style={{ paddingTop: insets.top + 24 }}>
        <NutritionSkeleton variant="coach" />
      </View>
    )
  }

  return (
    <View className="flex-1 bg-surface-app">
      {/* Franja de safe-area SOLIDA y en flujo: el overlay de abajo es `absolute` dentro de un
          contenedor sin padding (`top: 0` sin ambigüedad de Yoga) y ninguna lista puede quedar
          bajo la barra de estado. */}
      <View style={{ height: insets.top }} />

      <View className="flex-1">
      {/* Cuerpo de la tab activa. Conmutación INLINE (sin `router.push`) para conservar la
          cápsula del coach y espejar que las 3 son secciones de UNA superficie. Va ANTES del
          chrome en el árbol: el overlay es hermano posterior, así pinta y recibe toques encima
          en Android sin depender solo de `zIndex`. */}
      <View className="flex-1">
        {activeTab === 'templates' ? (
          <HubTemplatesTab scope={scope} chromeHeight={chromeHeight} onScroll={onBodyScroll} />
        ) : activeTab === 'foods' ? (
          <CoachNutritionCatalogScreen embedded chromeHeight={chromeHeight} onScroll={onBodyScroll} />
        ) : activeTab === 'curation' ? (
          <CurationQueueScreen embedded chromeHeight={chromeHeight} onScroll={onBodyScroll} />
        ) : (
      <FlashList
        data={visibleItems}
        keyExtractor={(item) => item.clientId}
        onScroll={onBodyScroll}
        scrollEventThrottle={16}
        onRefresh={() => {
          setRefreshing(true)
          void loadFirst(true)
        }}
        refreshing={refreshing}
        // Sin `progressViewOffset` el spinner del pull-to-refresh nace DETRAS del overlay opaco.
        progressViewOffset={chromeHeight}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: chromeHeight,
          paddingBottom: insets.bottom + COACH_TABBAR_CLEARANCE,
        }}
        ListHeaderComponent={
          <View className="gap-4 pb-5 pt-2">
            <View className="flex-row gap-3">
              <Metric label="Con plan" value={metrics.withPlan} />
              <Metric label="Sin plan" value={metrics.withoutPlan} />
              <Metric label="Activos hoy" value={metrics.activeToday} />
            </View>
            <Text className="text-xs text-muted">
              {metrics.total} {metrics.total === 1 ? 'alumno' : 'alumnos'} {scopeLabel}
            </Text>
            <View className="min-h-11 flex-row items-center gap-2 rounded-control border border-default bg-surface-card px-3">
              <Search color={theme.textSecondary} size={16} />
              <TextInput
                value={filters.search}
                onChangeText={(text) => setFilters((prev) => ({ ...prev, search: text.slice(0, 120) }))}
                placeholder="Buscar en esta página…"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={120}
                accessibilityLabel="Buscar alumno en el roster"
                className="flex-1 py-2 text-sm text-strong"
              />
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerClassName="gap-2 pr-2"
            >
              {NUTRITION_ATTENTION_FILTER_OPTIONS.map((option) => {
                const active = filters.attention === option.value
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Filtrar: ${option.label}`}
                    onPress={() => setFilters((prev) => ({ ...prev, attention: option.value }))}
                    className={`min-h-9 items-center justify-center rounded-pill border px-3 ${active ? 'border-primary bg-primary/10' : 'border-subtle bg-surface-card'}`}
                  >
                    <Text className={`text-xs font-semibold ${active ? 'text-primary' : 'text-muted'}`}>
                      {option.label}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>
            <View className="flex-row items-center gap-2">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Ordenar roster"
                onPress={() => setSortOpen(true)}
                className="min-h-9 flex-1 flex-row items-center gap-1.5 rounded-control border border-default bg-surface-card px-3"
              >
                <ArrowUpDown color={theme.textSecondary} size={15} />
                <Text className="shrink text-xs font-semibold text-body" numberOfLines={1}>
                  Orden: {sortLabel}
                </Text>
              </Pressable>
              {filtered ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Limpiar filtros"
                  onPress={clearFilters}
                  className="min-h-9 flex-row items-center gap-1.5 rounded-control border border-default bg-surface-card px-3"
                >
                  <X color={theme.textSecondary} size={14} />
                  <Text className="text-xs font-semibold text-muted">Limpiar</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          items.length === 0 ? (
            // NUT-024: sin items hay DOS causas distintas y antes ambas decían lo mismo.
            // Con `offline` en true la primera carga falló y no había caché: el roster no
            // está vacío, no lo pudimos leer. El badge "Sin conexión" del header lo anuncia
            // (visible aquí: sin items no hay scroll, así que el chrome nunca colapsa); el
            // empty-state deja de contradecirlo.
            offline ? (
              <NutritionStatePanel
                title="Sin conexión y sin datos guardados"
                description="No pudimos cargar tu roster y no hay una copia local de este espacio. Revisa tu conexión y desliza hacia abajo para reintentar."
              />
            ) : (
              <NutritionStatePanel
                title="No hay alumnos en este scope"
                description="El Centro respeta el workspace activo y no mezcla pools."
              />
            )
          ) : (
            <View className="gap-3">
              <NutritionStatePanel
                title="Sin coincidencias"
                description="Ningún alumno de esta página coincide con los filtros. Ajusta la búsqueda o limpia los filtros."
                action={
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Limpiar filtros"
                    onPress={clearFilters}
                    className="min-h-11 flex-row items-center justify-center gap-1.5 rounded-control border border-default bg-surface-card px-3"
                  >
                    <X color={theme.textSecondary} size={16} />
                    <Text className="text-sm font-semibold text-strong">Limpiar filtros</Text>
                  </Pressable>
                }
              />
              {page?.hasMore ? (
                <Text className="text-center text-xs text-muted">
                  Hay más alumnos en otras páginas. La búsqueda solo cubre la página actual.
                </Text>
              ) : null}
            </View>
          )
        }
        ListFooterComponent={
          <PaginationBar
            pageIndex={pageIndex}
            hasMore={page?.hasMore ?? false}
            paging={paging}
            onPrev={onPrev}
            onNext={onNext}
            theme={theme}
          />
        }
        ItemSeparatorComponent={() => <View className="h-3" />}
        renderItem={({ item }) => (
          <NutritionCard>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Abrir ficha nutricional de ${item.clientName}`}
              onPress={() => router.push(`/coach/nutrition-v2/${item.clientId}`)}
            >
              <View className="flex-row items-center gap-3">
                <View className="h-11 w-11 items-center justify-center rounded-full bg-primary/10">
                  <Users color={theme.primary} size={20} />
                </View>
                <View className="min-w-0 flex-1">
                  <View className="flex-row flex-wrap items-center gap-2">
                    <Text className="shrink font-display text-lg font-semibold text-strong" numberOfLines={1}>
                      {item.clientName}
                    </Text>
                    {item.strategy ? <StrategyBadge compact strategy={item.strategy} /> : null}
                  </View>
                  <Text className="mt-1 text-xs text-muted" numberOfLines={1}>
                    {item.planName ?? 'Sin plan publicado'} · {item.intakeEntries7d} registros en 7 días
                  </Text>
                  <View className="mt-1.5">
                    <RosterWeekDots activeDays={item.activeDays7d} />
                  </View>
                </View>
                <ChevronRight color={theme.textSecondary} size={20} />
              </View>
            </Pressable>
            {/* Alta del plan del alumno, «Familia N» (T3.v Cabina): es LA acción de la fila, así
                que va en la variante `primary` — fondo de marca real del coach, con la tinta
                calculada contra ese hex. `justify-center` conserva el CTA centrado de ancho
                completo que la fila ya tenía; la navegación es la de siempre. */}
            <AddActionButton
              variant="primary"
              icon="version"
              label={nutritionPlanCtaLabel(item.planStatus)}
              accessibilityLabel={`${nutritionPlanCtaLabel(item.planStatus)} para ${item.clientName}`}
              brandColor={brandColor}
              onPress={() => router.push(nutritionV2EditorHref(item.clientId))}
              className="mt-3 justify-center"
            />
            {/* Web (HubRoster): la tarjeta de atención va al FINAL de la fila, tras el CTA. */}
            {item.attentionReason !== 'none' ? (
              <View className="mt-3">
                <CoachAttentionCard
                  item={{
                    id: item.clientId,
                    title: nutritionAttentionCardTitle(item.attentionReason),
                    description: nutritionAttentionCardDescription(item.attentionReason),
                    reason: item.attentionReason,
                    tone: nutritionAttentionCardTone(item.attentionReason),
                    actionLabel: 'Revisar',
                  }}
                  onAction={() => router.push(`/coach/nutrition-v2/${item.clientId}`)}
                />
              </View>
            ) : null}
          </NutritionCard>
        )}
      />
        )}
      </View>

        {/* Chrome del hub (paridad web `page.tsx:86-104`): header con CTA "Nuevo plan" + estado
            de sync, y debajo el tablist DS. Solo el TABLIST queda pegado: el bloque de titulo se
            traslada hacia arriba con el scroll y desaparece (el CTA "+" y la pill se van con el;
            el CTA por-alumno de cada tarjeta sigue disponible). Fondo SOLIDO obligatorio porque
            las listas pasan por detras; `box-none` en el wrapper animado para no capturar gestos
            fuera del bloque opaco, que si los recibe (default `auto`). */}
        <Animated.View
          pointerEvents="box-none"
          onLayout={onChromeLayout}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
            transform: [{ translateY: chromeTranslate }],
          }}
        >
          <View className="bg-surface-app">
            <View className="px-4 pt-5" onLayout={onHeaderLayout}>
              <NutritionHeader
                title="Centro de Nutrición"
                description="Planes, consumo reciente y alumnos por atender."
                actions={
                  <View className="flex-row items-center gap-2">
                    <SyncOfflineState state={offline ? 'offline' : 'synced'} />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Nuevo plan"
                      onPress={openPicker}
                      className="h-11 w-11 items-center justify-center rounded-control bg-primary"
                    >
                      <Plus color="#FFFFFF" size={20} />
                    </Pressable>
                  </View>
                }
              />
            </View>
            <View className="px-4 pb-3 pt-4">
              <HubTablist active={activeTab} onSelect={setActiveTab} inactiveColor={theme.textSecondary} />
            </View>
          </View>
        </Animated.View>
      </View>

      <HubSortSheet
        open={sortOpen}
        onClose={() => setSortOpen(false)}
        selected={filters.sort}
        onSelect={(value) => setFilters((prev) => ({ ...prev, sort: value }))}
      />

      <NewPlanPickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        search={pickerSearch}
        onSearch={setPickerSearch}
        roster={effectivePickerRoster}
        loading={pickerLoading}
        onChoose={choosePickerClient}
        textSecondary={theme.textSecondary}
        templates={pickerTemplates}
        templatesLoading={pickerTemplatesLoading}
        templatesError={pickerTemplatesError}
        onLoadTemplates={loadPickerTemplates}
        onEditTemplate={editTemplate}
      />
    </View>
  )
}

/**
 * Puntos de la semana del alumno en el roster (SPEC ola 3 punto 8: "hub coach con dots de semana
 * por alumno"). El read-model del hub móvil (`NutritionCoachHubItem`) NO trae un desglose por
 * día — solo `activeDays7d` (cuántos de los últimos 7 tuvieron registro) e `intakeEntries7d`
 * (cuenta total). Sin la fecha de cada día no se puede pintar Lu-Do real, así que estos puntos
 * son un CONTEO (los primeros `activeDays7d` de 7 se ven llenos), no un calendario: el
 * `accessibilityLabel` lo dice explícito para no insinuar qué día exacto tuvo registro.
 */
function RosterWeekDots({ activeDays }: { activeDays: number }) {
  const filled = Math.max(0, Math.min(7, Math.trunc(activeDays)))
  return (
    <View
      accessibilityRole="summary"
      accessibilityLabel={`${filled} de 7 días con registro esta semana`}
      className="flex-row gap-1"
    >
      {Array.from({ length: 7 }, (_, index) =>
        index < filled ? (
          <View key={index} className="h-1.5 w-1.5 rounded-full bg-success-500" />
        ) : (
          <View key={index} className="h-1.5 w-1.5 rounded-full bg-ink-300" />
        ),
      )}
    </View>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View className="min-w-0 flex-1 rounded-card border border-subtle bg-surface-card p-4">
      <Text className="font-display text-2xl font-bold text-strong">{value}</Text>
      <Text className="mt-1 text-xs text-muted">{label}</Text>
    </View>
  )
}

/**
 * Cuerpo de la pestaña "Plantillas" (paridad con la web, QA T3.v).
 *
 * Es la biblioteca del coach — la MISMA lista que el sheet "Nuevo plan → Reutilizar", vía el
 * componente compartido `PlanTemplateList` — con el verbo cambiado: aca cada fila ABRE la
 * plantilla en el editor único, y el CTA de cabecera crea una nueva. Nada de esto existía sin
 * pasar antes por el sheet.
 *
 * Estado PROPIO (no el del picker) para que entrar a la pestaña no arrastre ni pise la carga
 * perezosa del sheet. Se monta al activarse la pestaña (conmutación inline del hub), así que
 * cargar en el montaje ES cargar al entrar; volver del editor no re-monta nada, y por eso hay
 * pull-to-refresh: es la única forma de ver una plantilla recién creada sin salir del hub.
 *
 * "Desde un alumno" (segunda alta de la web) queda fuera: ese camino no tiene endpoint mobile.
 */
function HubTemplatesTab({
  scope,
  chromeHeight,
  onScroll,
}: {
  scope: NutritionV2CoachScope
  chromeHeight: number
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void
}) {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  // Marca real del coach: la pastilla «Nueva plantilla» va en `primary` y su fondo ES la marca.
  const { branding } = useTheme()
  const brandColor = resolveEffectiveCoachBrandTheme(branding).brandColor
  const [templates, setTemplates] = useState<NutritionV2PlanTemplateListItem[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      setTemplates(await fetchNutritionV2PlanTemplates({ scope }))
    } catch {
      setTemplates([])
      setError('No pudimos cargar tus plantillas. Revisa tu conexión e intenta de nuevo.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [scope])

  useEffect(() => {
    void load()
  }, [load])

  // «Familia N» (T3.v Cabina). El blanco crudo del label MUERE aquí: antes el texto era
  // `text-white` fijo sobre `bg-primary`, así que una marca clara (un amarillo, un lima) dejaba el
  // CTA ilegible. Ahora la tinta la decide el contraste WCAG contra el hex real de la marca.
  const newTemplateCta = (
    <AddActionButton
      variant="primary"
      icon="plantilla"
      label="Nueva plantilla"
      brandColor={brandColor}
      onPress={() => router.push(nutritionV2TemplateEditorHref(null))}
    />
  )

  return (
    <ScrollView
      onScroll={onScroll}
      scrollEventThrottle={16}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true)
            void load()
          }}
          // Sin offset el spinner nace DETRAS del overlay opaco del chrome.
          progressViewOffset={chromeHeight}
        />
      }
      // El chrome del hub es un overlay opaco y esta lista pasa POR DETRAS: sin este paddingTop
      // la cabecera de la pestaña nace tapada por el tablist.
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: chromeHeight,
        paddingBottom: insets.bottom + COACH_TABBAR_CLEARANCE,
      }}
    >
      <View className="gap-3 pb-5 pt-2">
        <Text className="text-sm text-muted">
          Arma un plan reutilizable y aplícalo a cualquier alumno desde «Nuevo plan → Reutilizar».
        </Text>
        <View className="flex-row">{newTemplateCta}</View>
        <PlanTemplateList
          templates={templates}
          loading={loading}
          error={error}
          onRetry={() => {
            setLoading(true)
            void load()
          }}
          onOpen={(template) => router.push(nutritionV2TemplateEditorHref(template.id))}
          openAccessibilityLabel={(name) => `Abrir la plantilla ${name} en el editor`}
          showDescription
          emptyMessage="Todavía no tienes plantillas. Arma una desde cero y aplícala al alumno que quieras."
          emptyAction={newTemplateCta}
        />
      </View>
    </ScrollView>
  )
}

// Tablist DS del hub (espejo de web `NutritionHubTabs.tsx:28-54`): fila segmentada 3-en-1 con
// los mismos tokens (`bg-surface-card`/`border-default`; activo `bg-primary` + texto
// blanco, inactivo `text-muted`). Sin `hover`/breakpoint (no aplican en RN): icono+label
// siempre visibles. Estado local en el padre; conmutar NO toca la URL. White-label safe (solo
// el blanco del texto activo es crudo, igual que web `text-white`).
function HubTablist({
  active,
  onSelect,
  inactiveColor,
}: {
  active: HubTabKey
  onSelect: (key: HubTabKey) => void
  inactiveColor: string
}) {
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="Secciones del centro de nutrición"
      className="flex-row gap-1 rounded-control border border-default bg-surface-card p-1"
    >
      {HUB_TABS.map((tab) => {
        const on = active === tab.key
        const Icon = tab.icon
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={tab.label}
            onPress={() => onSelect(tab.key)}
            className={`min-h-11 min-w-0 flex-1 flex-row items-center justify-center gap-1.5 rounded-[10px] px-2 ${on ? 'bg-primary' : ''}`}
          >
            <Icon size={16} color={on ? '#FFFFFF' : inactiveColor} />
            <Text
              className={`shrink text-sm font-semibold ${on ? 'text-white' : 'text-muted'}`}
              numberOfLines={1}
            >
              {tab.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// Selector de orden del roster (espejo del `SortSheet` del shell V1 `nutricion.tsx`). Sheet nativo
// (nativeModal) por robustez de apertura desde la raiz del tab. Las 4 opciones espejan el `<select>`
// web (`HubRoster.tsx:185-198`); seleccionar reordena en vivo y el footer cierra.
function HubSortSheet({
  open,
  onClose,
  selected,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  selected: NutritionSortKey
  onSelect: (value: NutritionSortKey) => void
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Ordenar roster"
      accessibilityLabel="Ordenar roster"
      snapPoints={['42%']}
      nativeModal
      footer={<Button label="Ver resultados" variant="sport" full onPress={onClose} />}
    >
      <View className="gap-2">
        <Text className="text-xs font-semibold text-muted">Ordenar por</Text>
        <View className="flex-row flex-wrap gap-2">
          {NUTRITION_SORT_OPTIONS.map((option) => {
            const on = selected === option.value
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => onSelect(option.value)}
                className={`min-h-11 items-center justify-center rounded-pill border px-3.5 ${on ? 'border-primary bg-primary/10' : 'border-default bg-surface-card'}`}
              >
                <Text className={`text-sm font-semibold ${on ? 'text-primary' : 'text-body'}`}>
                  {option.label}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </View>
    </Sheet>
  )
}

// CTA global "Nuevo plan" (espejo de `NewPlanPickerButton` web): el hub no tiene alumno
// seleccionado, asi que abre un selector buscable con el roster COMPLETO del workspace y navega al
// builder del alumno elegido. Sheet nativo (nativeModal) para abrir con teclado de forma robusta.
//
// F4 — DOS puertas, una sola ruta de destino (AD-3): "Desde cero" es el flujo de siempre;
// "Reutilizar" elige primero una PLANTILLA y despues el alumno, y navega al MISMO builder con
// `?from=template:<id>`. Copiar el plan vigente de otro alumno (`plan:<clientId>` en web) queda
// fuera de esta ola: el builder RN todavia no resuelve ese origen.
function NewPlanPickerSheet({
  open,
  onClose,
  search,
  onSearch,
  roster,
  loading,
  onChoose,
  textSecondary,
  templates,
  templatesLoading,
  templatesError,
  onLoadTemplates,
  onEditTemplate,
}: {
  open: boolean
  onClose: () => void
  search: string
  onSearch: (value: string) => void
  roster: PickerEntry[]
  loading: boolean
  onChoose: (clientId: string, planId: string | null, origin: string | null) => void
  textSecondary: string
  /** `null` = la biblioteca todavía no se intentó cargar (pestaña "Reutilizar" sin abrir). */
  templates: NutritionV2PlanTemplateListItem[] | null
  templatesLoading: boolean
  templatesError: string | null
  onLoadTemplates: () => void
  /**
   * Corte RN (T3.3b): administrar la plantilla en el EDITOR. `null` = plantilla nueva. Es la
   * primera vez que el coach movil puede crear o editar material reutilizable sin la web.
   */
  onEditTemplate: (templateId: string | null) => void
}) {
  const [tab, setTab] = useState<'scratch' | 'reuse'>('scratch')
  // Origen elegido: hasta que exista, "Reutilizar" muestra la biblioteca; después, el roster.
  const [source, setSource] = useState<{ id: string; name: string } | null>(null)
  const filtered = useMemo(() => filterNutritionPickerEntries(roster, search), [roster, search])

  // Cada apertura empieza en "Desde cero" y sin origen: reabrir el sheet nunca hereda la intención
  // de la vez anterior (mismo criterio que `onOpenChange` del modal web).
  useEffect(() => {
    if (open) {
      setTab('scratch')
      setSource(null)
    }
  }, [open])

  // Las plantillas se cargan al ENTRAR a "Reutilizar", no al abrir el sheet.
  useEffect(() => {
    if (!open || tab !== 'reuse' || templates !== null || templatesLoading) return
    onLoadTemplates()
  }, [open, tab, templates, templatesLoading, onLoadTemplates])

  const description = source
    ? `Partirás de «${source.name}». Elige el alumno que recibe el plan.`
    : tab === 'reuse'
      ? 'Elige la plantilla de la que quieres partir.'
      : 'Elige el alumno para abrir su builder y crear (o versionar) su plan.'

  const showTemplates = tab === 'reuse' && source == null

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nuevo plan de nutrición"
      description={description}
      accessibilityLabel="Nuevo plan de nutrición"
      snapPoints={['85%']}
      nativeModal
    >
      <View className="gap-4">
        <View
          accessibilityRole="tablist"
          accessibilityLabel="Origen del plan"
          className="flex-row gap-1 rounded-control bg-surface-sunken p-1"
        >
          {(
            [
              { id: 'scratch', label: 'Desde cero' },
              { id: 'reuse', label: 'Reutilizar' },
            ] as const
          ).map((entry) => {
            const on = tab === entry.id
            return (
              <Pressable
                key={entry.id}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                accessibilityLabel={entry.label}
                onPress={() => {
                  setTab(entry.id)
                  setSource(null)
                }}
                className={`min-h-11 flex-1 items-center justify-center rounded-control px-3 ${on ? 'bg-surface-card' : ''}`}
              >
                <Text className={`text-sm font-semibold ${on ? 'text-strong' : 'text-muted'}`}>
                  {entry.label}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {showTemplates ? (
          <View className="gap-2">
            <View className="flex-row items-center justify-between gap-2">
              <Text className="text-xs font-bold uppercase tracking-wide text-muted">Tus plantillas</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Nueva plantilla"
                onPress={() => onEditTemplate(null)}
                className="min-h-11 flex-row items-center gap-1.5 rounded-control border border-primary/30 bg-primary/10 px-3"
              >
                <Text className="text-sm font-semibold text-primary">Nueva plantilla</Text>
              </Pressable>
            </View>
            {/* MISMA lista que la pestaña "Plantillas" del hub (componente compartido): el picker
                solo cambia el verbo de la fila — aca elegir origen, alla abrir el editor. */}
            <PlanTemplateList
              templates={templates}
              loading={templatesLoading}
              error={templatesError}
              onRetry={onLoadTemplates}
              onOpen={(template) => setSource({ id: template.id, name: template.name })}
              openAccessibilityLabel={(name) => `Partir de la plantilla ${name}`}
              onEdit={(template) => onEditTemplate(template.id)}
              emptyMessage="Aún no tienes plantillas. Crea una desde cero con «Nueva plantilla», o guarda el plan de un alumno como plantilla."
            />
          </View>
        ) : roster.length === 0 && !loading ? (
          <View className="items-center rounded-control border border-subtle bg-surface-sunken px-4 py-8">
            <Users color={textSecondary} size={26} />
            <Text className="mt-2 text-center text-sm text-muted">
              No hay alumnos en tu espacio para crear un plan.
            </Text>
          </View>
        ) : (
          <View className="gap-4">
            {source ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cambiar el origen"
                onPress={() => setSource(null)}
                className="min-h-11 flex-row items-center gap-1.5 self-start"
              >
                <ArrowLeft color={textSecondary} size={16} />
                <Text className="text-sm font-semibold text-muted">Cambiar el origen</Text>
              </Pressable>
            ) : null}
            <View className="min-h-11 flex-row items-center gap-2 rounded-control border border-default bg-surface-card px-3">
              <Search color={textSecondary} size={16} />
              <TextInput
                value={search}
                onChangeText={(text) => onSearch(text.slice(0, 120))}
                placeholder="Buscar alumno…"
                placeholderTextColor={textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={120}
                accessibilityLabel="Buscar alumno"
                className="flex-1 py-2 text-sm text-strong"
              />
            </View>

            {loading && roster.length === 0 ? (
              <Text className="py-6 text-center text-sm text-muted">Cargando…</Text>
            ) : (
              <View className="gap-1.5">
                {filtered.map((entry) => (
                  <Pressable
                    key={entry.clientId}
                    accessibilityRole="button"
                    accessibilityLabel={`${nutritionPlanCtaLabel(entry.planStatus)} para ${entry.clientName}`}
                    onPress={() =>
                      onChoose(
                        entry.clientId,
                        entry.planId,
                        source ? formatPlanBuilderOrigin({ kind: 'template', id: source.id }) : null,
                      )
                    }
                    className="min-h-11 flex-row items-center gap-3 rounded-control border border-default bg-surface-card px-3 py-2.5"
                  >
                    <Text className="min-w-0 flex-1 font-semibold text-strong" numberOfLines={1}>
                      {entry.clientName}
                    </Text>
                    <View className="flex-row items-center gap-1.5 rounded-pill border border-subtle bg-surface-sunken px-2 py-0.5">
                      <FilePlus2 color={textSecondary} size={12} />
                      <Text className="text-[11px] font-semibold text-muted">
                        {nutritionPlanCtaLabel(entry.planStatus)}
                      </Text>
                    </View>
                    <ChevronRight color={textSecondary} size={16} />
                  </Pressable>
                ))}
                {filtered.length === 0 ? (
                  <Text className="py-6 text-center text-sm text-muted">Sin coincidencias.</Text>
                ) : null}
              </View>
            )}
          </View>
        )}
      </View>
    </Sheet>
  )
}

function PaginationBar({
  pageIndex,
  hasMore,
  paging,
  onPrev,
  onNext,
  theme,
}: {
  pageIndex: number
  hasMore: boolean
  paging: boolean
  onPrev: () => void
  onNext: () => void
  theme: { textSecondary: string }
}) {
  const canPrev = pageIndex > 0 && !paging
  const canNext = hasMore && !paging
  if (pageIndex === 0 && !hasMore) {
    return paging ? (
      <View className="items-center py-5">
        <Text className="text-sm text-muted">Cargando…</Text>
      </View>
    ) : null
  }
  return (
    <View className="mt-5 flex-row items-center justify-between">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Página anterior"
        accessibilityState={{ disabled: !canPrev }}
        disabled={!canPrev}
        onPress={onPrev}
        className={`min-h-11 flex-row items-center gap-1.5 rounded-control border px-3 ${canPrev ? 'border-default bg-surface-card' : 'border-subtle bg-surface-sunken opacity-50'}`}
      >
        <ChevronLeft color={theme.textSecondary} size={18} />
        <Text className="text-sm font-semibold text-body">Anterior</Text>
      </Pressable>
      <Text className="text-xs font-semibold text-muted">
        {paging ? 'Cargando…' : `Página ${pageIndex + 1}`}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Página siguiente"
        accessibilityState={{ disabled: !canNext }}
        disabled={!canNext}
        onPress={onNext}
        className={`min-h-11 flex-row items-center gap-1.5 rounded-control border px-3 ${canNext ? 'border-default bg-surface-card' : 'border-subtle bg-surface-sunken opacity-50'}`}
      >
        <Text className="text-sm font-semibold text-body">Siguiente</Text>
        <ChevronRight color={theme.textSecondary} size={18} />
      </Pressable>
    </View>
  )
}
