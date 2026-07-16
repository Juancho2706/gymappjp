import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ArrowLeft, LockKeyhole } from 'lucide-react-native'
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
import { useWorkspace } from '../../../lib/workspace'
import {
  getNutritionClientDetailV2,
  nutritionV2CoachScope,
  nutritionV2CoachScopeCacheKey,
} from '../../../lib/nutrition-v2.api'
import {
  readNutritionV2Cache,
  writeNutritionV2Cache,
} from '../../../lib/nutrition-v2-cache'
import {
  nutritionPlanCtaLabel,
  nutritionV2BuilderHref,
} from '../../../lib/nutrition-v2-hub'
import {
  NUTRITION_PRO_HISTORY_BANNER_LABEL,
  NUTRITION_PRO_MODULE_KEY,
  filterHistoryDaysToBaseWindow,
  shouldShowNutritionProHistoryBanner,
} from '../../../lib/nutrition-v2-pro'
import { supabase } from '../../../lib/supabase'
import { useTheme } from '../../../context/ThemeContext'

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
  const { theme } = useTheme()
  const params = useLocalSearchParams<{ clientId: string }>()
  const clientId = Array.isArray(params.clientId) ? params.clientId[0] : params.clientId
  const entitlements = useEntitlements()
  const {
    ready: workspaceReady,
    kind: workspaceKind,
    teamId: workspaceTeamId,
    orgId: workspaceOrgId,
  } = useWorkspace()
  const [userId, setUserId] = useState<string | null>(null)
  const [detail, setDetail] = useState<NutritionClientDetailReadModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const date = useMemo(todayInSantiago, [])
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
  const hasNutritionPro = entitlements.hasModule(NUTRITION_PRO_MODULE_KEY)

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
    if (!enabled || !userId || !clientId || !scope || !scopeCacheKey) {
      if (entitlements.ready && workspaceReady) setLoading(false)
      return
    }

    // Fold the workspace scope into the cache key so two pools of the same coach never collide.
    const detailScopeKey = `${scopeCacheKey}:${date}`
    const controller = new AbortController()
    let active = true

    void (async () => {
      const cached = await readNutritionV2Cache({
        userId,
        clientId,
        kind: 'clientDetail',
        scopeKey: detailScopeKey,
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
          scope,
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
          scopeKey: detailScopeKey,
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
  }, [clientId, date, enabled, entitlements.ready, workspaceReady, userId, scope, scopeCacheKey])

  const recentDays = useMemo(() => {
    if (!detail) return []
    // El API movil ya corta a ~30d server-side sin addon; el clamp cliente es defensa en
    // profundidad para que RN nunca muestre >30d aunque el servidor no cortara.
    return hasNutritionPro ? detail.recentDays : filterHistoryDaysToBaseWindow(detail.recentDays, date)
  }, [date, detail, hasNutritionPro])
  const showHistoryUpsell = shouldShowNutritionProHistoryBanner({ hasNutritionPro })

  if (!entitlements.ready || !workspaceReady || loading) {
    return (
      <View className="flex-1 bg-surface-app px-4 pt-6">
        <NutritionSkeleton variant="coach" />
      </View>
    )
  }

  if (!enabled || !clientId || !scope) {
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

  const planStatus = detail.today.plan ? 'published' : null
  const ctaLabel = nutritionPlanCtaLabel(planStatus)
  const builderHref = nutritionV2BuilderHref(detail.client.id)

  return (
    <ScrollView
      className="flex-1 bg-surface-app"
      contentContainerClassName="gap-5 px-4 pb-12 pt-5"
    >
      <View className="flex-row items-center gap-3">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Volver al Centro"
          onPress={() => router.back()}
          hitSlop={8}
          className="h-11 w-11 items-center justify-center rounded-control border border-border-subtle bg-surface-card"
        >
          <ArrowLeft color={theme.textSecondary} size={20} />
        </Pressable>
        <View className="min-w-0 flex-1">
          <NutritionHeader
            eyebrow="Ficha nutricional V2"
            title={detail.client.fullName}
            description={offline ? 'Mostrando la última copia disponible.' : 'Datos canónicos del día.'}
          />
        </View>
      </View>

      {detail.today.plan ? (
        <View className="flex-row flex-wrap gap-2">
          <StrategyBadge strategy={detail.today.plan.strategy} />
          <PlanVersionBadge
            version={detail.today.plan.versionNumber}
            status={detail.today.plan.status}
            effectiveLabel={`desde ${detail.today.plan.effectiveFrom}`}
          />
        </View>
      ) : null}

      {!detail.today.plan ? (
        <NutritionStatePanel
          title="Sin plan V2 vigente"
          description="Crea y publica una versión antes de revisar objetivos y adherencia canónica."
          action={
            <NutritionMotionButton
              accessibilityLabel="Crear plan"
              onPress={() => router.push(builderHref)}
            >
              Crear plan
            </NutritionMotionButton>
          }
        />
      ) : (
        <>
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
            <Text className="font-display text-lg font-semibold text-text-strong">Plan vigente</Text>
            <Text className="mt-1 text-sm text-text-muted">{detail.plan.plan?.name}</Text>
            <Text className="mt-3 text-sm leading-5 text-text-body">
              {detail.plan.visibleNotes || 'Sin indicaciones visibles.'}
            </Text>
          </NutritionCard>
        </>
      )}

      {detail.today.plan && detail.plan.dayVariants.length > 0 ? (
        <View className="gap-3">
          <Text className="font-display text-xl font-semibold text-text-strong">Estructura prescrita</Text>
          {detail.plan.dayVariants.map((variant) => (
            <NutritionCard key={variant.id}>
              <View className="flex-row flex-wrap items-center justify-between gap-2">
                <Text className="font-display text-base font-semibold text-text-strong">{variant.label}</Text>
                <Text className="text-xs text-text-muted">{variant.targets.calories ?? 0} kcal objetivo</Text>
              </View>
              {variant.mealSlots.length === 0 ? (
                <Text className="mt-2 text-sm text-text-muted">Plan flexible: sin franjas prescritas.</Text>
              ) : (
                <View className="mt-3 gap-3">
                  {variant.mealSlots.map((slot) => (
                    <View key={slot.id} className="rounded-control border border-border-subtle bg-surface-app p-3">
                      <View className="flex-row items-center justify-between gap-2">
                        <Text className="text-sm font-semibold text-text-strong">{slot.name}</Text>
                        {slot.startTime ? <Text className="text-xs text-text-muted">{slot.startTime}</Text> : null}
                      </View>
                      {slot.prescriptionItems.length > 0 ? (
                        <View className="mt-2 gap-1">
                          {slot.prescriptionItems.map((prescription) => (
                            <View key={prescription.id} className="flex-row items-center justify-between gap-2">
                              <Text className="min-w-0 flex-1 text-sm text-text-body" numberOfLines={1}>
                                {prescription.name || 'Alimento'} · {prescription.quantity} {prescription.unit}
                              </Text>
                              <Text className="shrink-0 text-xs text-text-muted">
                                {Math.round(prescription.macros.calories ?? 0)} kcal
                              </Text>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <Text className="mt-2 text-xs text-text-muted">Sin alimentos prescritos en esta franja.</Text>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </NutritionCard>
          ))}
        </View>
      ) : null}

      <NutritionCard>
        <View className="flex-row items-center gap-2">
          <LockKeyhole color={theme.primary} size={16} />
          <Text className="font-display text-lg font-semibold text-text-strong">Nota profesional</Text>
        </View>
        <Text className="mt-2 text-sm leading-5 text-text-body">
          {detail.privateNote?.note || 'Sin nota privada para la versión vigente.'}
        </Text>
        <Text className="mt-2 text-xs text-text-muted">El alumno no recibe este contenido.</Text>
      </NutritionCard>

      <NutritionCard>
        <Text className="font-display text-lg font-semibold text-text-strong">Últimos días</Text>
        {showHistoryUpsell ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={NUTRITION_PRO_HISTORY_BANNER_LABEL}
            onPress={() => router.push('/coach/settings/modules')}
            className="mt-3 flex-row items-center gap-2 self-start rounded-control border border-border-subtle bg-surface-sunken px-3 py-2"
          >
            <LockKeyhole color={theme.primary} size={14} />
            <Text className="text-xs font-semibold text-text-muted">{NUTRITION_PRO_HISTORY_BANNER_LABEL}</Text>
          </Pressable>
        ) : null}
        <View className="mt-3 gap-3">
          {recentDays.length === 0 ? (
            <Text className="text-sm text-text-muted">Sin registros en la ventana disponible.</Text>
          ) : (
            recentDays.map((day) => (
              <View
                className="flex-row items-center justify-between border-b border-border-subtle pb-3"
                key={day.localDate}
              >
                <View>
                  <Text className="font-semibold text-text-strong">{day.localDate}</Text>
                  <Text className="mt-0.5 text-xs text-text-muted">{day.activeEntryCount} registros</Text>
                </View>
                <Text className="font-mono text-sm font-semibold text-text-strong">
                  {day.consumed.calories} kcal
                </Text>
              </View>
            ))
          )}
        </View>
      </NutritionCard>

      <NutritionMotionButton
        accessibilityLabel={ctaLabel}
        onPress={() => router.push(builderHref)}
      >
        {ctaLabel}
      </NutritionMotionButton>
    </ScrollView>
  )
}
