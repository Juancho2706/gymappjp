import { useCallback, useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { FlashList } from '@shopify/flash-list'
import { ChevronRight, Users } from 'lucide-react-native'
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
import { getNutritionCoachHubV2 } from '../../../lib/nutrition-v2.api'
import {
  readNutritionV2Cache,
  writeNutritionV2Cache,
} from '../../../lib/nutrition-v2-cache'
import { useTheme } from '../../../context/ThemeContext'

export default function CoachNutritionV2Screen() {
  const router = useRouter()
  const { theme } = useTheme()
  const entitlements = useEntitlements()
  const [userId, setUserId] = useState<string | null>(null)
  const [page, setPage] = useState<NutritionCoachHubPageReadModel | null>(null)
  const [items, setItems] = useState<NutritionCoachHubItem[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [offline, setOffline] = useState(false)
  const enabled = entitlements.ready && isEnabled('nutritionV2Coach')

  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setUserId(data.session?.user.id ?? null)
    })
    return () => {
      active = false
    }
  }, [])

  const loadFirst = useCallback(async (force = false) => {
    if (!userId || !enabled) return

    if (!force) {
      const cached = await readNutritionV2Cache({
        userId,
        kind: 'coachHub',
        scopeKey: 'first-page',
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
      const fresh = await getNutritionCoachHubV2({ pageSize: 25 })
      setPage(fresh)
      setItems(fresh.items)
      setOffline(false)
      await writeNutritionV2Cache({
        userId,
        kind: 'coachHub',
        scopeKey: 'first-page',
        payload: fresh,
      })
    } catch {
      setOffline(true)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [enabled, userId])

  const loadMore = useCallback(async () => {
    if (!page?.hasMore || !page.nextCursor || loadingMore) return
    setLoadingMore(true)
    try {
      const next = await getNutritionCoachHubV2({
        cursorUpdatedAt: page.nextCursor.updatedAt,
        cursorClientId: page.nextCursor.clientId,
        pageSize: 25,
      })
      setItems((current) => {
        const known = new Set(current.map((item) => item.clientId))
        return [...current, ...next.items.filter((item) => !known.has(item.clientId))]
      })
      setPage(next)
      setOffline(false)
    } catch {
      setOffline(true)
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore, page])

  useEffect(() => {
    if (userId && enabled) void loadFirst()
  }, [enabled, loadFirst, userId])

  if (!entitlements.ready || loading) {
    return (
      <View className="flex-1 bg-surface-app px-4 pt-6">
        <NutritionSkeleton variant="coach" />
      </View>
    )
  }

  if (!enabled) {
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

  return (
    <View className="flex-1 bg-surface-app">
      <FlashList
        data={items}
        keyExtractor={(item) => item.clientId}
        onEndReached={() => void loadMore()}
        onEndReachedThreshold={0.4}
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
              <Metric label="Alumnos" value={items.length} />
              <Metric
                label="Atención"
                value={items.filter((item) => item.attentionReason !== 'none').length}
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          <NutritionStatePanel
            title="No hay alumnos en este scope"
            description="El Centro respeta el workspace activo y no mezcla pools."
          />
        }
        ListFooterComponent={
          loadingMore ? (
            <View className="items-center py-5">
              <Text className="text-sm text-text-muted">Cargando más alumnos…</Text>
            </View>
          ) : null
        }
        ItemSeparatorComponent={() => <View className="h-3" />}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Abrir ficha nutricional de ${item.clientName}`}
            onPress={() => router.push(`/coach/nutrition-v2/${item.clientId}`)}
          >
            <NutritionCard>
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
                      {attentionLabel(item.attentionReason)}
                    </Text>
                  ) : null}
                </View>
                <ChevronRight color={theme.textSecondary} size={20} />
              </View>
            </NutritionCard>
          </Pressable>
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

function attentionLabel(reason: NutritionCoachHubItem['attentionReason']): string {
  if (reason === 'no_plan') return 'Sin plan V2'
  if (reason === 'draft_pending') return 'Borrador pendiente'
  if (reason === 'no_recent_intake') return 'Sin consumo reciente'
  return 'Al día'
}
