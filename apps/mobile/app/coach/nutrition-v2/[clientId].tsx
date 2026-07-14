import { useEffect, useMemo, useState } from 'react'
import { ScrollView, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import {
  MacroBudget,
  NutritionHeader,
  NutritionMotionButton,
  NutritionSkeleton,
  NutritionStatePanel,
  NutritionCard,
  PlanVersionBadge,
  StrategyBadge,
} from '../../../components/nutrition-v2'
import {
  NutritionClientDetailReadModelSchema,
  createNutritionMacroValue,
  type NutritionClientDetailReadModel,
} from '@eva/nutrition-v2'
import { isEnabled } from '../../../lib/flags'
import { useEntitlements } from '../../../lib/entitlements'
import { getNutritionClientDetailV2 } from '../../../lib/nutrition-v2.api'
import {
  readNutritionV2Cache,
  writeNutritionV2Cache,
} from '../../../lib/nutrition-v2-cache'
import { supabase } from '../../../lib/supabase'

function todayInSantiago(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export default function CoachNutritionV2ClientScreen() {
  const router = useRouter()
  const params = useLocalSearchParams<{ clientId: string }>()
  const clientId = Array.isArray(params.clientId) ? params.clientId[0] : params.clientId
  const entitlements = useEntitlements()
  const [userId, setUserId] = useState<string | null>(null)
  const [detail, setDetail] = useState<NutritionClientDetailReadModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const date = useMemo(todayInSantiago, [])
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

  useEffect(() => {
    if (!enabled || !userId || !clientId) {
      if (entitlements.ready) setLoading(false)
      return
    }

    const controller = new AbortController()
    let active = true

    void (async () => {
      const cached = await readNutritionV2Cache({
        userId,
        clientId,
        kind: 'clientDetail',
        scopeKey: date,
        schema: NutritionClientDetailReadModelSchema,
        allowStale: true,
      })
      if (active && cached) {
        setDetail(cached.payload)
        setOffline(cached.stale)
        setLoading(false)
      }

      try {
        const fresh = await getNutritionClientDetailV2({
          clientId,
          date,
          signal: controller.signal,
        })
        if (!active) return
        setDetail(fresh)
        setOffline(false)
        await writeNutritionV2Cache({
          userId,
          clientId,
          kind: 'clientDetail',
          scopeKey: date,
          payload: fresh,
        })
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        if (active) setOffline(true)
      } finally {
        if (active) setLoading(false)
      }
    })()

    return () => {
      active = false
      controller.abort()
    }
  }, [clientId, date, enabled, entitlements.ready, userId])

  if (!entitlements.ready || loading) {
    return (
      <View className="flex-1 bg-surface-app px-4 pt-6">
        <NutritionSkeleton variant="coach" />
      </View>
    )
  }

  if (!enabled || !clientId) {
    return (
      <View className="flex-1 bg-surface-app px-4 pt-6">
        <NutritionStatePanel
          icon="permission"
          title="Ficha V2 no habilitada"
          description="La ficha requiere rollout de coach y un alumno válido."
          action={
            <NutritionMotionButton
              accessibilityLabel="Volver al centro"
              tone="neutral"
              onPress={() => router.back()}
            >
              Volver
            </NutritionMotionButton>
          }
        />
      </View>
    )
  }

  if (!detail) {
    return (
      <View className="flex-1 bg-surface-app px-4 pt-6">
        <NutritionStatePanel
          icon="offline"
          tone="warning"
          title="No pudimos abrir la ficha"
          description="No existe una copia local y la lectura remota falló."
        />
      </View>
    )
  }

  return (
    <ScrollView
      className="flex-1 bg-surface-app"
      contentContainerClassName="gap-5 px-4 pb-12 pt-5"
    >
      <NutritionHeader
        eyebrow="Ficha nutricional V2"
        title={detail.client.fullName}
        description={offline ? 'Mostrando la última copia disponible.' : 'Datos canónicos del día.'}
      />

      {detail.today.plan ? (
        <View className="flex-row flex-wrap gap-2">
          <StrategyBadge strategy={detail.today.plan.strategy} />
          <PlanVersionBadge
            version={detail.today.plan.versionNumber}
            status={detail.today.plan.status}
          />
        </View>
      ) : null}

      <MacroBudget
        calories={{
          consumed: detail.today.consumed.calories,
          target: detail.today.targets.calories ?? 0,
        }}
        macros={[
          createNutritionMacroValue('protein', {
            consumed: detail.today.consumed.proteinG,
            target: detail.today.targets.proteinG ?? 0,
          }),
          createNutritionMacroValue('carbs', {
            consumed: detail.today.consumed.carbsG,
            target: detail.today.targets.carbsG ?? 0,
          }),
          createNutritionMacroValue('fats', {
            consumed: detail.today.consumed.fatsG,
            target: detail.today.targets.fatsG ?? 0,
          }),
        ]}
      />

      <NutritionCard>
        <Text className="font-display text-lg font-semibold text-text-strong">Nota profesional</Text>
        <Text className="mt-2 text-sm leading-5 text-text-body">
          {detail.privateNote?.note || 'Sin nota privada para la versión vigente.'}
        </Text>
        <Text className="mt-2 text-xs text-text-muted">El alumno no recibe este contenido.</Text>
      </NutritionCard>

      <NutritionCard>
        <Text className="font-display text-lg font-semibold text-text-strong">Últimos días</Text>
        <View className="mt-3 gap-3">
          {detail.recentDays.map((day) => (
            <View
              className="flex-row items-center justify-between border-b border-border-subtle pb-3"
              key={day.localDate}
            >
              <View>
                <Text className="font-semibold text-text-strong">{day.localDate}</Text>
                <Text className="mt-0.5 text-xs text-text-muted">
                  {day.activeEntryCount} registros
                </Text>
              </View>
              <Text className="font-mono text-sm font-semibold text-text-strong">
                {day.consumed.calories} kcal
              </Text>
            </View>
          ))}
        </View>
      </NutritionCard>
    </ScrollView>
  )
}
