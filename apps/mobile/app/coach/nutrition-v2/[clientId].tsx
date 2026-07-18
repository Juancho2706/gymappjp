import { useEffect, useMemo, useState } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ArrowLeft, Info, LockKeyhole } from 'lucide-react-native'
import {
  MacroBudget,
  MacroChipRow,
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
  describeLegacyHistoryDay,
  type NutritionClientDetailReadModel,
} from '@eva/nutrition-v2'
import { isEnabled } from '../../../lib/flags'
import { useEntitlements, useNutritionV2CoachFlagForClient } from '../../../lib/entitlements'
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
import { toast } from '../../../components/Toast'
import {
  QUICK_EDIT_COPY,
  QuickEditMode,
  publishSuccessToast,
} from '../../../components/nutrition-v2/quick-edit'

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
  // Modo edicion in-place del plan vigente (quick-edit) + nonce para re-leer la ficha
  // tras publicar (el read model re-hidrata el baseline con la version nueva).
  const [editing, setEditing] = useState(false)
  const [reloadNonce, setReloadNonce] = useState(0)
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
  // Canary por alumno: alcanza esta ficha aunque el flag global del coach esté apagado; el flag global
  // sigue prendiendo V2 por sí solo (OR) sin esperar esta consulta.
  const clientCanaryV2 = useNutritionV2CoachFlagForClient(clientId)
  const enabled = entitlements.ready && (isEnabled('nutritionV2Coach') || clientCanaryV2)
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
  }, [clientId, date, enabled, entitlements.ready, workspaceReady, userId, scope, scopeCacheKey, reloadNonce])

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

  // El plan vigente (`detail.plan.plan`) es la senal en vivo del plan activo/publicado. El bloque
  // "hoy" se calcula sobre el registro del dia, que puede haberse generado antes de publicar el
  // plan nuevo: en ese caso mostramos la ficha completa con un aviso, no un empty-state.
  const todayPlan = detail.today.plan
  const activePlan = detail.plan.plan
  const planStatus = activePlan ? 'published' : null
  const ctaLabel = nutritionPlanCtaLabel(planStatus)
  const builderHref = nutritionV2BuilderHref(detail.client.id)
  const showTodayPlanLag = activePlan !== null && (todayPlan === null || todayPlan.id !== activePlan.id)
  const todayPlanLagMessage =
    todayPlan === null
      ? 'El plan vigente ya está publicado. El registro de hoy todavía no tiene metas asignadas; desde mañana se aplican las del nuevo plan.'
      : 'El plan vigente ya está publicado. Los registros de hoy siguen mostrando el plan anterior; desde mañana se usa el nuevo.'

  // Modo edicion in-place (quick-edit): misma ruta, estado cliente. Al publicar, la
  // ficha re-lee el read model (reloadNonce) y el baseline se re-hidrata solo.
  if (editing && activePlan && userId) {
    const clientFullName = detail.client.fullName
    return (
      <QuickEditMode
        clientId={detail.client.id}
        clientName={clientFullName}
        planModel={detail.plan}
        hasNutritionPro={hasNutritionPro}
        userId={userId}
        todayIso={date}
        onExit={() => setEditing(false)}
        onPublished={() => {
          setEditing(false)
          toast.success(publishSuccessToast(clientFullName))
          setReloadNonce((n) => n + 1)
        }}
        onStaleReload={() => {
          setEditing(false)
          setReloadNonce((n) => n + 1)
        }}
      />
    )
  }

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
            eyebrow="Ficha nutricional"
            title={detail.client.fullName}
            description={offline ? 'Mostrando la última copia disponible.' : 'Resumen del día del alumno.'}
          />
        </View>
      </View>

      {detail.plan.plan ? (
        <View className="flex-row flex-wrap gap-2">
          <StrategyBadge strategy={(detail.today.plan ?? detail.plan.plan).strategy} />
          <PlanVersionBadge
            version={(detail.today.plan ?? detail.plan.plan).versionNumber}
            status={(detail.today.plan ?? detail.plan.plan).status}
            effectiveLabel={`desde ${(detail.today.plan ?? detail.plan.plan).effectiveFrom}`}
          />
        </View>
      ) : null}

      {showTodayPlanLag ? (
        <View className="flex-row items-start gap-2 rounded-control border border-border-subtle bg-surface-sunken px-4 py-3">
          <Info color={theme.primary} size={16} />
          <Text className="flex-1 text-sm leading-5 text-text-body">{todayPlanLagMessage}</Text>
        </View>
      ) : null}

      {!detail.plan.plan ? (
        <NutritionStatePanel
          title="Sin plan vigente"
          description="Crea y publica un plan para revisar objetivos y adherencia."
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
            <View className="mt-4">
              <NutritionMotionButton
                accessibilityLabel={QUICK_EDIT_COPY.enter}
                disabled={!userId}
                onPress={() => setEditing(true)}
              >
                {QUICK_EDIT_COPY.enter}
              </NutritionMotionButton>
            </View>
          </NutritionCard>
        </>
      )}

      {detail.plan.plan && detail.plan.dayVariants.length > 0 ? (
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
            onPress={() => router.push('/coach/modules')}
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
            recentDays.map((day) => {
              const legacy = describeLegacyHistoryDay(day)
              const showLegacyMacros = legacy.legacyOnly && legacy.hasMacros && legacy.consumed != null
              return (
                <View className="border-b border-border-subtle pb-3" key={day.localDate}>
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="min-w-0 flex-1">
                      <View className="flex-row flex-wrap items-center gap-2">
                        <Text className="font-semibold text-text-strong">{day.localDate}</Text>
                        {legacy.isLegacy ? (
                          <View className="rounded-pill border border-warning-500/40 bg-warning-500/10 px-2 py-0.5">
                            <Text className="text-[10px] font-semibold text-warning-700">Historial anterior</Text>
                          </View>
                        ) : null}
                      </View>
                      {showLegacyMacros && legacy.consumed ? (
                        <View className="mt-1">
                          <MacroChipRow
                            calories={legacy.consumed.calories}
                            proteinG={legacy.consumed.proteinG}
                            carbsG={legacy.consumed.carbsG}
                            fatsG={legacy.consumed.fatsG}
                            size="sm"
                          />
                        </View>
                      ) : (
                        <Text className="mt-0.5 text-xs text-text-muted">
                          {legacy.legacyOnly
                            ? legacy.completionCount > 0
                              ? legacy.completionsLabel
                              : 'Registrado en el sistema anterior'
                            : `${day.activeEntryCount} registros`}
                        </Text>
                      )}
                      {legacy.isLegacy && !legacy.legacyOnly && legacy.secondaryLabel ? (
                        <Text className="mt-1 text-[11px] text-text-subtle">{legacy.secondaryLabel}</Text>
                      ) : null}
                      {legacy.isLegacy && legacy.mealsLabel ? (
                        <Text numberOfLines={2} className="mt-1 text-[11px] text-text-subtle">
                          {legacy.mealsLabel}
                        </Text>
                      ) : null}
                    </View>
                    {!legacy.legacyOnly ? (
                      <Text className="font-mono text-sm font-semibold text-text-strong">
                        {day.consumed.calories} kcal
                      </Text>
                    ) : null}
                  </View>
                </View>
              )
            })
          )}
        </View>
      </NutritionCard>

      {/* Con plan vigente el camino primario es "Editar plan" (card); el wizard queda como
          camino secundario "Rehacer con el asistente" (qe-design §1.2.A). */}
      <NutritionMotionButton
        accessibilityLabel={activePlan ? QUICK_EDIT_COPY.redo : ctaLabel}
        tone={activePlan ? 'neutral' : 'nutrition'}
        onPress={() => router.push(builderHref)}
      >
        {activePlan ? QUICK_EDIT_COPY.redo : ctaLabel}
      </NutritionMotionButton>
    </ScrollView>
  )
}
