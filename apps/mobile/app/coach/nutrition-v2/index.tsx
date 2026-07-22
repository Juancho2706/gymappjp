import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { FlashList } from '@shopify/flash-list'
import {
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  FilePlus2,
  Plus,
  Search,
  Users,
  X,
} from 'lucide-react-native'
import {
  CoachAttentionCard,
  NutritionHeader,
  NutritionSkeleton,
  NutritionStatePanel,
  NutritionCard,
  PlanVersionBadge,
  StrategyBadge,
  SyncOfflineState,
} from '../../../components/nutrition-v2'
import { Button, Sheet } from '../../../components'
import { COACH_TABBAR_CLEARANCE } from '../../../components/coach/CoachMobileChrome'
import {
  NutritionCoachHubPageReadModelSchema,
  type NutritionCoachHubItem,
  type NutritionCoachHubPageReadModel,
} from '@eva/nutrition-v2'
import { supabase } from '../../../lib/supabase'
import { isEnabled } from '../../../lib/flags'
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
  nutritionV2BuilderHref,
  type NutritionRosterFilters,
  type NutritionSortKey,
} from '../../../lib/nutrition-v2-hub'
import { useTheme } from '../../../context/ThemeContext'

const PAGE_SIZE = 25
const COACH_TIMEZONE = 'America/Santiago'
// Roster COMPLETO del scope para el picker global "Nuevo plan": pagina el hub scoped (keyset por
// updatedAt) hasta este tope, espejo del RSC web (8×50). El picker filtra client-side.
const PICKER_PAGE_SIZE = 50
const PICKER_MAX_PAGES = 8

type HubCursor = { updatedAt: string; clientId: string }
type PickerEntry = { clientId: string; clientName: string; planStatus: string | null }

export default function CoachNutritionV2Screen() {
  const router = useRouter()
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  const entitlements = useEntitlements()
  const {
    ready: workspaceReady,
    kind: workspaceKind,
    teamId: workspaceTeamId,
    orgId: workspaceOrgId,
  } = useWorkspace()
  const [userId, setUserId] = useState<string | null>(null)
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
  const enabled = entitlements.ready && isEnabled('nutritionV2Coach')
  const todayLocalDate = useMemo(
    () => localDateOf(new Date().toISOString(), COACH_TIMEZONE) ?? '',
    [],
  )

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
          acc.push({ clientId: it.clientId, clientName: it.clientName, planStatus: it.planStatus })
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

  const openPicker = useCallback(() => {
    setPickerSearch('')
    setPickerOpen(true)
    if (!pickerLoadedRef.current) void loadPickerRoster()
  }, [loadPickerRoster])

  const choosePickerClient = useCallback(
    (clientId: string) => {
      setPickerOpen(false)
      router.push(nutritionV2BuilderHref(clientId))
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
        : items.map((it) => ({ clientId: it.clientId, clientName: it.clientName, planStatus: it.planStatus })),
    [pickerRoster, items],
  )
  const clearFilters = useCallback(() => setFilters(DEFAULT_NUTRITION_ROSTER_FILTERS), [])

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
          description="El rollout del coach está apagado o este workspace no pertenece al canary."
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
    <View className="flex-1 bg-surface-app" style={{ paddingTop: insets.top }}>
      <FlashList
        data={visibleItems}
        keyExtractor={(item) => item.clientId}
        onRefresh={() => {
          setRefreshing(true)
          void loadFirst(true)
        }}
        refreshing={refreshing}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + COACH_TABBAR_CLEARANCE,
        }}
        ListHeaderComponent={
          <View className="gap-4 pb-5 pt-5">
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
            <View className="flex-row gap-3">
              <Metric label="Con plan" value={metrics.withPlan} />
              <Metric label="Sin plan" value={metrics.withoutPlan} />
              <Metric label="Activos hoy" value={metrics.activeToday} />
            </View>
            <Text className="text-xs text-text-muted">
              {metrics.total} {metrics.total === 1 ? 'alumno' : 'alumnos'} {scopeLabel}
            </Text>
            <View className="min-h-11 flex-row items-center gap-2 rounded-control border border-border-default bg-surface-card px-3">
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
                className="flex-1 py-2 text-sm text-text-strong"
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
                    className={`min-h-9 items-center justify-center rounded-pill border px-3 ${active ? 'border-primary bg-primary/10' : 'border-border-subtle bg-surface-card'}`}
                  >
                    <Text className={`text-xs font-semibold ${active ? 'text-primary' : 'text-text-muted'}`}>
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
                className="min-h-9 flex-1 flex-row items-center gap-1.5 rounded-control border border-border-default bg-surface-card px-3"
              >
                <ArrowUpDown color={theme.textSecondary} size={15} />
                <Text className="shrink text-xs font-semibold text-text-body" numberOfLines={1}>
                  Orden: {sortLabel}
                </Text>
              </Pressable>
              {filtered ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Limpiar filtros"
                  onPress={clearFilters}
                  className="min-h-9 flex-row items-center gap-1.5 rounded-control border border-border-default bg-surface-card px-3"
                >
                  <X color={theme.textSecondary} size={14} />
                  <Text className="text-xs font-semibold text-text-muted">Limpiar</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          items.length === 0 ? (
            <NutritionStatePanel
              title="No hay alumnos en este scope"
              description="El Centro respeta el workspace activo y no mezcla pools."
            />
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
                    className="min-h-11 flex-row items-center justify-center gap-1.5 rounded-control border border-border-default bg-surface-card px-3"
                  >
                    <X color={theme.textSecondary} size={16} />
                    <Text className="text-sm font-semibold text-text-strong">Limpiar filtros</Text>
                  </Pressable>
                }
              />
              {page?.hasMore ? (
                <Text className="text-center text-xs text-text-muted">
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
                    <Text className="shrink font-display text-lg font-semibold text-text-strong" numberOfLines={1}>
                      {item.clientName}
                    </Text>
                    {item.strategy ? <StrategyBadge compact strategy={item.strategy} /> : null}
                    {item.versionNumber && item.planStatus === 'published' ? (
                      <PlanVersionBadge version={item.versionNumber} status="published" />
                    ) : null}
                  </View>
                  <Text className="mt-1 text-xs text-text-muted" numberOfLines={1}>
                    {item.planName ?? 'Sin plan publicado'} · {item.intakeEntries7d} registros en 7 días
                  </Text>
                </View>
                <ChevronRight color={theme.textSecondary} size={20} />
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${nutritionPlanCtaLabel(item.planStatus)} para ${item.clientName}`}
              onPress={() => router.push(nutritionV2BuilderHref(item.clientId))}
              className="mt-3 min-h-11 flex-row items-center justify-center gap-1.5 rounded-control border border-primary/30 bg-primary/10 px-3"
            >
              <Plus color={theme.primary} size={15} />
              <Text className="text-sm font-semibold text-primary">
                {nutritionPlanCtaLabel(item.planStatus)}
              </Text>
            </Pressable>
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
      />
    </View>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <View className="min-w-0 flex-1 rounded-card border border-border-subtle bg-surface-card p-4">
      <Text className="font-display text-2xl font-bold text-text-strong">{value}</Text>
      <Text className="mt-1 text-xs text-text-muted">{label}</Text>
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
        <Text className="text-xs font-semibold text-text-muted">Ordenar por</Text>
        <View className="flex-row flex-wrap gap-2">
          {NUTRITION_SORT_OPTIONS.map((option) => {
            const on = selected === option.value
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => onSelect(option.value)}
                className={`min-h-11 items-center justify-center rounded-pill border px-3.5 ${on ? 'border-primary bg-primary/10' : 'border-border-default bg-surface-card'}`}
              >
                <Text className={`text-sm font-semibold ${on ? 'text-primary' : 'text-text-body'}`}>
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
function NewPlanPickerSheet({
  open,
  onClose,
  search,
  onSearch,
  roster,
  loading,
  onChoose,
  textSecondary,
}: {
  open: boolean
  onClose: () => void
  search: string
  onSearch: (value: string) => void
  roster: PickerEntry[]
  loading: boolean
  onChoose: (clientId: string) => void
  textSecondary: string
}) {
  const filtered = useMemo(() => filterNutritionPickerEntries(roster, search), [roster, search])
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Nuevo plan de nutrición"
      description="Elige el alumno para abrir su builder y crear (o versionar) su plan."
      accessibilityLabel="Nuevo plan de nutrición"
      snapPoints={['85%']}
      nativeModal
    >
      {roster.length === 0 && !loading ? (
        <View className="items-center rounded-control border border-border-subtle bg-surface-sunken px-4 py-8">
          <Users color={textSecondary} size={26} />
          <Text className="mt-2 text-center text-sm text-text-muted">
            No hay alumnos en tu espacio para crear un plan.
          </Text>
        </View>
      ) : (
        <View className="gap-4">
          <View className="min-h-11 flex-row items-center gap-2 rounded-control border border-border-default bg-surface-card px-3">
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
              className="flex-1 py-2 text-sm text-text-strong"
            />
          </View>

          {loading && roster.length === 0 ? (
            <Text className="py-6 text-center text-sm text-text-muted">Cargando…</Text>
          ) : (
            <View className="gap-1.5">
              {filtered.map((entry) => (
                <Pressable
                  key={entry.clientId}
                  accessibilityRole="button"
                  accessibilityLabel={`${nutritionPlanCtaLabel(entry.planStatus)} para ${entry.clientName}`}
                  onPress={() => onChoose(entry.clientId)}
                  className="min-h-11 flex-row items-center gap-3 rounded-control border border-border-default bg-surface-card px-3 py-2.5"
                >
                  <Text className="min-w-0 flex-1 font-semibold text-text-strong" numberOfLines={1}>
                    {entry.clientName}
                  </Text>
                  <View className="flex-row items-center gap-1.5 rounded-pill border border-border-subtle bg-surface-sunken px-2 py-0.5">
                    <FilePlus2 color={textSecondary} size={12} />
                    <Text className="text-[11px] font-semibold text-text-muted">
                      {nutritionPlanCtaLabel(entry.planStatus)}
                    </Text>
                  </View>
                  <ChevronRight color={textSecondary} size={16} />
                </Pressable>
              ))}
              {filtered.length === 0 ? (
                <Text className="py-6 text-center text-sm text-text-muted">Sin coincidencias.</Text>
              ) : null}
            </View>
          )}
        </View>
      )}
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
        <Text className="text-sm text-text-muted">Cargando…</Text>
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
        className={`min-h-11 flex-row items-center gap-1.5 rounded-control border px-3 ${canPrev ? 'border-border-default bg-surface-card' : 'border-border-subtle bg-surface-sunken opacity-50'}`}
      >
        <ChevronLeft color={theme.textSecondary} size={18} />
        <Text className="text-sm font-semibold text-text-body">Anterior</Text>
      </Pressable>
      <Text className="text-xs font-semibold text-text-muted">
        {paging ? 'Cargando…' : `Página ${pageIndex + 1}`}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Página siguiente"
        accessibilityState={{ disabled: !canNext }}
        disabled={!canNext}
        onPress={onNext}
        className={`min-h-11 flex-row items-center gap-1.5 rounded-control border px-3 ${canNext ? 'border-border-default bg-surface-card' : 'border-border-subtle bg-surface-sunken opacity-50'}`}
      >
        <Text className="text-sm font-semibold text-text-body">Siguiente</Text>
        <ChevronRight color={theme.textSecondary} size={18} />
      </Pressable>
    </View>
  )
}
