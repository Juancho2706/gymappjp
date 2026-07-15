import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, RefreshControl, ScrollView, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import {
  MacroBudget,
  MealTimeline,
  NutritionHeader,
  NutritionMotionButton,
  NutritionSkeleton,
  NutritionStatePanel,
  PlanVersionBadge,
  StrategyBadge,
  SyncOfflineState,
} from '../../../components/nutrition-v2'
import {
  NutritionTodayReadModelSchema,
  createNutritionMacroValue,
  type NutritionMealSlotModel,
  type NutritionTodayReadModel,
} from '@eva/nutrition-v2'
import { supabase } from '../../../lib/supabase'
import { isEnabled } from '../../../lib/flags'
import { useEntitlements } from '../../../lib/entitlements'
import { getNutritionTodayV2 } from '../../../lib/nutrition-v2.api'
import {
  readNutritionV2Cache,
  writeNutritionV2Cache,
} from '../../../lib/nutrition-v2-cache'
import {
  flushNutritionV2MutationQueue,
  getNutritionV2QueueStatus,
} from '../../../lib/nutrition-v2-offline'

function todayInSantiago(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export default function StudentNutritionV2Screen() {
  const router = useRouter()
  const entitlements = useEntitlements()
  const [userId, setUserId] = useState<string | null>(null)
  const [model, setModel] = useState<NutritionTodayReadModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [offline, setOffline] = useState(false)
  const [pending, setPending] = useState(0)
  const date = useMemo(todayInSantiago, [])
  const enabled = entitlements.ready && isEnabled('nutritionV2Student')

  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setUserId(data.session?.user.id ?? null)
    })
    return () => {
      active = false
    }
  }, [])

  const mountedRef = useRef(true)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      controllerRef.current?.abort()
    }
  }, [])

  const load = useCallback(async (force = false) => {
    if (!userId || !enabled) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    if (!force) {
      const cached = await readNutritionV2Cache({
        userId,
        clientId: userId,
        kind: 'today',
        scopeKey: date,
        schema: NutritionTodayReadModelSchema,
        allowStale: true,
      })
      if (mountedRef.current && cached) {
        setModel(cached.payload)
        setOffline(cached.stale)
        setLoading(false)
      }
    }

    try {
      const fresh = await getNutritionTodayV2({ date, signal: controller.signal })
      if (!mountedRef.current) return
      setModel(fresh)
      setOffline(false)
      await writeNutritionV2Cache({
        userId,
        clientId: userId,
        kind: 'today',
        scopeKey: date,
        payload: fresh,
      })
      if (!mountedRef.current) return
      const flushed = await flushNutritionV2MutationQueue(userId)
      if (mountedRef.current) setPending(flushed.pending)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      if (mountedRef.current) setOffline(true)
      const queue = await getNutritionV2QueueStatus(userId)
      if (mountedRef.current) setPending(queue.pending)
    } finally {
      if (mountedRef.current) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [date, enabled, userId])

  useEffect(() => {
    if (!userId || !enabled) return
    void load()
  }, [enabled, load, userId])

  useEffect(() => {
    if (!userId || !enabled) return
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load(true)
    })
    return () => subscription.remove()
  }, [enabled, load, userId])

  if (!entitlements.ready || loading) {
    return (
      <View className="flex-1 bg-surface-app px-4 pt-6">
        <NutritionSkeleton variant="today" />
      </View>
    )
  }

  if (!enabled) {
    return (
      <View className="flex-1 bg-surface-app px-4 pt-6">
        <NutritionStatePanel
          icon="permission"
          title="Nutrición V2 no está habilitada"
          description="Esta pantalla solo se abre para scopes canary autorizados desde el servidor."
          action={
            <NutritionMotionButton
              accessibilityLabel="Volver a nutrición actual"
              onPress={() => router.replace('/alumno/(tabs)/nutricion')}
              tone="neutral"
            >
              Volver a Nutrición
            </NutritionMotionButton>
          }
        />
      </View>
    )
  }

  if (!model) {
    return (
      <View className="flex-1 bg-surface-app px-4 pt-6">
        <NutritionStatePanel
          icon="offline"
          tone="warning"
          title="No pudimos cargar Nutrición"
          description="No hay datos guardados en este dispositivo. Revisa tu conexión e inténtalo nuevamente."
          action={
            <NutritionMotionButton
              accessibilityLabel="Reintentar cargar nutrición"
              onPress={() => {
                setLoading(true)
                void load(true)
              }}
            >
              Reintentar
            </NutritionMotionButton>
          }
        />
      </View>
    )
  }

  const slots = toMealSlots(model)

  return (
    <ScrollView
      className="flex-1 bg-surface-app"
      contentContainerClassName="gap-5 px-4 pb-12 pt-5"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true)
            void load(true)
          }}
        />
      }
    >
      <NutritionHeader
        eyebrow="Canary privado"
        title="Nutrición"
        description="Tu consumo real frente al snapshot del día."
        actions={
          <SyncOfflineState
            state={offline ? 'offline' : pending > 0 ? 'pending' : 'synced'}
            label={pending > 0 ? `${pending} pendiente${pending === 1 ? '' : 's'}` : undefined}
          />
        }
      />

      {model.plan ? (
        <View className="flex-row flex-wrap gap-2">
          <StrategyBadge strategy={model.plan.strategy} />
          <PlanVersionBadge
            version={model.plan.versionNumber}
            status={model.plan.status}
            effectiveLabel={`desde ${model.plan.effectiveFrom}`}
          />
        </View>
      ) : null}

      <MacroBudget
        calories={{
          consumed: model.consumed.calories,
          target: model.targets.calories ?? 0,
        }}
        macros={[
          createNutritionMacroValue('protein', {
            consumed: model.consumed.proteinG,
            target: model.targets.proteinG ?? 0,
          }),
          createNutritionMacroValue('carbs', {
            consumed: model.consumed.carbsG,
            target: model.targets.carbsG ?? 0,
          }),
          createNutritionMacroValue('fats', {
            consumed: model.consumed.fatsG,
            target: model.targets.fatsG ?? 0,
          }),
        ]}
      />

      <MealTimeline slots={slots} />

      {!model.plan ? (
        <NutritionStatePanel
          title="Tu plan V2 todavía no está publicado"
          description="Puedes registrar alimentos cuando tu coach habilite el flujo o esperar la primera versión del plan."
        />
      ) : null}

      <Text className="text-center text-xs text-text-muted">
        Snapshot {model.localDate} · {model.timezone}
      </Text>
    </ScrollView>
  )
}

function toMealSlots(model: NutritionTodayReadModel): NutritionMealSlotModel[] {
  return model.mealSlots.map((slot) => {
    const consumed = slot.intakeItems.map((item) => ({
      id: item.id,
      name: item.snapshot.name,
      detail: item.snapshot.brand,
      quantityLabel: `${item.quantity} ${item.unit}`,
      calories: item.totals.calories,
      proteinG: item.totals.proteinG,
      carbsG: item.totals.carbsG,
      fatsG: item.totals.fatsG,
      status: offlineStatus(item.status),
    }))
    const prescribed = slot.prescriptionItems.map((item) => ({
      id: item.id,
      name: item.name ?? 'Alimento prescrito',
      detail: item.brand,
      quantityLabel: `${item.quantity} ${item.unit}`,
      calories: item.macros.calories,
      proteinG: item.macros.proteinG,
      carbsG: item.macros.carbsG,
      fatsG: item.macros.fatsG,
      status: 'default' as const,
    }))

    return {
      id: slot.id,
      name: slot.name,
      timeLabel: slot.startTime,
      prescriptionLabel: prescribed.length > 0 ? `${prescribed.length} esperado${prescribed.length === 1 ? '' : 's'}` : null,
      state: consumed.length > 0 ? 'consumed' : prescribed.length > 0 ? 'prescribed' : 'empty',
      subtotalCalories: consumed.reduce((sum, item) => sum + (item.calories ?? 0), 0),
      foods: consumed.length > 0 ? consumed : prescribed,
    }
  })
}

function offlineStatus(status: 'active' | 'corrected' | 'voided') {
  return status === 'corrected' ? ('corrected' as const) : ('default' as const)
}
