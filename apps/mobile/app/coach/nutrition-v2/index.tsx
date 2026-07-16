import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { FlashList } from '@shopify/flash-list'
import { ChevronLeft, ChevronRight, Plus, Users } from 'lucide-react-native'
import {
  NutritionHeader,
  NutritionSkeleton,
  NutritionStatePanel,
  NutritionCard,
  StrategyBadge,
  SyncOfflineState,
} from '../../../components/nutrition-v2'
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
  NUTRITION_ATTENTION_FILTER_OPTIONS,
  applyNutritionAttentionFilter,
  isNutritionHubPageComplete,
  localDateOf,
  mapNutritionHubMetrics,
  nutritionAttentionLabel,
  nutritionHubMetricScopeLabel,
  nutritionPlanCtaLabel,
  nutritionV2BuilderHref,
  type NutritionAttentionFilter,
} from '../../../lib/nutrition-v2-hub'
import { useTheme } from '../../../context/ThemeContext'

const PAGE_SIZE = 25
const COACH_TIMEZONE = 'America/Santiago'

type HubCursor = { updatedAt: string; clientId: string }

export default function CoachNutritionV2Screen() {
  const router = useRouter()
  const { theme } = useTheme()
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
  const [attention, setAttention] = useState<NutritionAttentionFilter>('all')
  const [loading, setLoading] = useState(true)
  const [paging, setPaging] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [offline, setOffline] = useState(false)
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
    () => applyNutritionAttentionFilter(items, attention),
    [attention, items],
  )

  if (!entitlements.ready || !workspaceReady) {
    return (
      <View className="flex-1 bg-surface-app px-4 pt-6">
        <NutritionSkeleton variant="coach" />
      </View>
    )
  }

  if (!enabled || !scope) {
    return (
      <View className="flex-1 bg-surface-app px-4 pt-6">
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
      <View className="flex-1 bg-surface-app px-4 pt-6">
        <NutritionSkeleton variant="coach" />
      </View>
    )
  }

  return (
    <View className="flex-1 bg-surface-app">
      <FlashList
        data={visibleItems}
        keyExtractor={(item) => item.clientId}
        onRefresh={() => {
          setRefreshing(true)
          void loadFirst(true)
        }}
        refreshing={refreshing}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}
        ListHeaderComponent={
          <View className="gap-4 pb-5 pt-5">
            <NutritionHeader
              eyebrow="Canary privado"
              title="Centro de Nutrición"
              description="Planes, actividad y señales de atención por alumno."
              actions={<SyncOfflineState state={offline ? 'offline' : 'synced'} />}
            />
            <View className="flex-row gap-3">
              <Metric label="Con plan" value={metrics.withPlan} />
              <Metric label="Sin plan" value={metrics.withoutPlan} />
              <Metric label="Actividad hoy" value={metrics.activeToday} />
            </View>
            <Text className="text-xs text-text-muted">
              {metrics.total} {metrics.total === 1 ? 'alumno' : 'alumnos'} {scopeLabel}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerClassName="gap-2 pr-2"
            >
              {NUTRITION_ATTENTION_FILTER_OPTIONS.map((option) => {
                const active = attention === option.value
                return (
                  <Pressable
                    key={option.value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Filtrar: ${option.label}`}
                    onPress={() => setAttention(option.value)}
                    className={`min-h-9 items-center justify-center rounded-pill border px-3 ${active ? 'border-ember-500 bg-ember-100' : 'border-border-subtle bg-surface-card'}`}
                  >
                    <Text className={`text-xs font-semibold ${active ? 'text-ember-700' : 'text-text-muted'}`}>
                      {option.label}
                    </Text>
                  </Pressable>
                )
              })}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          <NutritionStatePanel
            title={attention === 'all' ? 'No hay alumnos en este scope' : 'Nadie coincide con el filtro'}
            description={
              attention === 'all'
                ? 'El Centro respeta el workspace activo y no mezcla pools.'
                : 'Cambia el filtro de atención para ver al resto del roster.'
            }
          />
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
                <View className="h-11 w-11 items-center justify-center rounded-full bg-ember-100">
                  <Users color={theme.scheme === 'dark' ? '#FFB79E' : '#C23E14'} size={20} />
                </View>
                <View className="min-w-0 flex-1">
                  <View className="flex-row flex-wrap items-center gap-2">
                    <Text className="shrink font-display text-lg font-semibold text-text-strong" numberOfLines={1}>
                      {item.clientName}
                    </Text>
                    {item.strategy ? <StrategyBadge compact strategy={item.strategy} /> : null}
                  </View>
                  <Text className="mt-1 text-xs text-text-muted" numberOfLines={1}>
                    {item.planName ?? 'Sin plan V2'} · {item.intakeEntries7d} registros en 7 días
                  </Text>
                  {item.attentionReason !== 'none' ? (
                    <Text className="mt-1 text-xs font-semibold text-warning-700">
                      {nutritionAttentionLabel(item.attentionReason)}
                    </Text>
                  ) : null}
                </View>
                <ChevronRight color={theme.textSecondary} size={20} />
              </View>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${nutritionPlanCtaLabel(item.planStatus)} para ${item.clientName}`}
              onPress={() => router.push(nutritionV2BuilderHref(item.clientId))}
              className="mt-3 min-h-11 flex-row items-center justify-center gap-1.5 rounded-control border border-ember-300 bg-ember-100 px-3"
            >
              <Plus color={theme.scheme === 'dark' ? '#FFB79E' : '#C23E14'} size={15} />
              <Text className="text-sm font-semibold text-ember-700">
                {nutritionPlanCtaLabel(item.planStatus)}
              </Text>
            </Pressable>
          </NutritionCard>
        )}
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
