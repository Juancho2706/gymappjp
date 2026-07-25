/**
 * NutritionV2Summary — tab Nutrición V2 embebido en la ficha del alumno del coach. Espejo RN
 * 1:1 del `NutritionTabV2` web (`apps/web/src/app/coach/clients/[clientId]/NutritionTabV2.tsx`):
 * header con eyebrow "Nutrición · V2" + acciones (abrir ficha completa / builder), empty-state
 * "Sin plan V2 vigente", badges de estrategia/versión, MacroBudget del día, cards "Plan vigente"
 * y "Hoy", y sección "Últimos días" con CTA de Nutrición Pro sin addon.
 *
 * Gating (paralelo del server-resolve web `resolveNutritionTabV2`, clients/[clientId]/page.tsx:240):
 * cuando el flag/canary `nutritionV2Coach` está ON Y el fetch del read model responde,
 * `NutricionTab` renderiza este tab; ante flag OFF o CUALQUIER fallo cae al tab V1 exactamente
 * igual (fail-open, cero regresión) — el mismo `null ⇒ NutritionTabB5` del web.
 *
 * Adaptaciones nativas (documentadas en verify-fix/ficha-nutricion-v2.md):
 *  - `PendingNavLink` (spinner "Abriendo ficha…") es un fix de latencia RSC del web; en RN la
 *    navegación es inmediata y el destino trae su propio skeleton, así que no se replica.
 *  - Aviso "Mostrando la última copia disponible." cuando el detail proviene de cache stale
 *    (no existe en web: RSC no tiene cache offline).
 *  - El recorte del historial sin addon Pro corre client-side con la MISMA función
 *    `filterHistoryDaysToBaseWindow` que usa el server web.
 */
import { useEffect, useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { ArrowUpRight, LockKeyhole, Plus, Utensils } from 'lucide-react-native'
import {
  MacroBudget,
  NutritionCard,
  NutritionStatePanel,
  PlanVersionBadge,
  StrategyBadge,
} from '../../../nutrition-v2'
import {
  NutritionClientDetailReadModelSchema,
  type NutritionClientDetailReadModel,
} from '@eva/nutrition-v2'
import { isEnabled } from '../../../../lib/flags'
import { useEntitlements, useNutritionV2CoachFlagForClient } from '../../../../lib/entitlements'
import { useWorkspace } from '../../../../lib/workspace'
import {
  getNutritionClientDetailV2,
  nutritionV2CoachScope,
  nutritionV2CoachScopeCacheKey,
} from '../../../../lib/nutrition-v2.api'
import {
  readNutritionV2Cache,
  writeNutritionV2Cache,
} from '../../../../lib/nutrition-v2-cache'
import {
  NUTRITION_PRO_MODULE_KEY,
  filterHistoryDaysToBaseWindow,
} from '../../../../lib/nutrition-v2-pro'
import { supabase } from '../../../../lib/supabase'
import { buildNutritionTabV2ViewModel } from '../../../../lib/coach-nutrition-v2-tab-logic'

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ')
}

function todayInSantiago(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export type CoachNutritionV2Gate = {
  enabled: boolean
  detail: NutritionClientDetailReadModel | null
  offline: boolean
  active: boolean
}

export function useCoachNutritionV2Detail(clientId: string): CoachNutritionV2Gate {
  const entitlements = useEntitlements()
  const {
    ready: workspaceReady,
    kind: workspaceKind,
    teamId: workspaceTeamId,
    orgId: workspaceOrgId,
  } = useWorkspace()
  const [userId, setUserId] = useState<string | null>(null)
  const [detail, setDetail] = useState<NutritionClientDetailReadModel | null>(null)
  const [offline, setOffline] = useState(false)
  const date = useMemo(todayInSantiago, [])

  const scope = useMemo(
    () =>
      workspaceReady
        ? nutritionV2CoachScope({ kind: workspaceKind, teamId: workspaceTeamId, orgId: workspaceOrgId })
        : null,
    [workspaceReady, workspaceKind, workspaceTeamId, workspaceOrgId],
  )
  const scopeCacheKey = scope ? nutritionV2CoachScopeCacheKey(scope) : null
  // Canary por alumno: el resumen V2 aparece en la ficha aunque el flag global del coach esté apagado;
  // el flag global sigue prendiendo V2 por sí solo (OR) sin esperar esta consulta.
  const clientCanaryV2 = useNutritionV2CoachFlagForClient(clientId)
  const enabled = entitlements.ready && (isEnabled('nutritionV2Coach') || clientCanaryV2)

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
    if (!enabled || !userId || !clientId || !scope || !scopeCacheKey) return

    const detailScopeKey = `${scopeCacheKey}:${date}`
    const controller = new AbortController()
    let active = true
    let hasCopy = false

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
        hasCopy = true
        setDetail(cached.payload)
        setOffline(cached.stale)
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
        // Fail-open: sin copia previa el detail sigue null y el caller renderiza V1.
        if (active && hasCopy) setOffline(true)
      }
    })()

    return () => {
      active = false
      controller.abort()
    }
  }, [clientId, date, enabled, userId, scope, scopeCacheKey])

  return { enabled, detail, offline, active: enabled && detail != null }
}

/** CTA sólida ember del tab (web NutritionTabV2.tsx:91,109: bg-ember-500 hover:bg-ember-600). */
function EmberCta({
  label,
  accessibilityLabel,
  onPress,
}: {
  label: string
  accessibilityLabel: string
  onPress: () => void
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress}>
      {({ pressed }) => (
        <View
          className={cx(
            'min-h-11 flex-row items-center justify-center gap-2 rounded-control px-4',
            pressed ? 'bg-ember-600' : 'bg-ember-500',
          )}
        >
          <Plus size={16} className="text-white" />
          <Text className="text-sm font-semibold text-white">{label}</Text>
        </View>
      )}
    </Pressable>
  )
}

export function NutritionV2Summary({
  detail,
  clientId,
  offline,
}: {
  detail: NutritionClientDetailReadModel
  clientId: string
  offline: boolean
}) {
  const router = useRouter()
  const entitlements = useEntitlements()
  const hasNutritionPro = entitlements.hasModule(NUTRITION_PRO_MODULE_KEY)
  const date = useMemo(todayInSantiago, [])

  // Espejo del server web: recorta el historial a la ventana base (~30d) sin addon Pro
  // (clients/[clientId]/page.tsx:273-275) y luego proyecta con el mapper puro compartido.
  const view = useMemo(
    () =>
      buildNutritionTabV2ViewModel({
        clientId,
        detail,
        nutritionProEnabled: hasNutritionPro,
        recentDaysForDisplay: hasNutritionPro
          ? detail.recentDays
          : filterHistoryDaysToBaseWindow(detail.recentDays, date),
      }),
    [clientId, detail, hasNutritionPro, date],
  )

  const openDetail = () => router.push(view.detailHref)
  const openBuilder = () => router.push(view.builderHref)

  return (
    <View className="min-w-0 gap-6">
      {offline ? (
        <Text className="text-xs text-text-muted">Mostrando la última copia disponible.</Text>
      ) : null}

      {/* Header: eyebrow + título + acciones (web NutritionTabV2.tsx:71-98; en móvil el
          sm:flex-row no aplica → columna con las acciones en fila envolvente). */}
      <View className="gap-3">
        <View className="min-w-0">
          <Text className="font-sans-extra text-[10px] uppercase tracking-[1px] text-text-muted">
            Nutrición · V2
          </Text>
          <Text className="mt-1 font-display text-xl font-bold text-text-strong">
            Ficha nutricional
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-2">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Abrir ficha nutrición completa"
            onPress={openDetail}
          >
            {({ pressed }) => (
              <View
                className={cx(
                  'min-h-11 flex-row items-center gap-2 rounded-control border border-border-default px-3',
                  pressed ? 'bg-surface-sunken' : 'bg-surface-card',
                )}
              >
                <Text className="text-sm font-semibold text-text-strong">
                  Abrir ficha nutrición completa
                </Text>
                <ArrowUpRight size={16} className="text-text-strong" />
              </View>
            )}
          </Pressable>
          <EmberCta
            label={view.builderCtaLabel}
            accessibilityLabel={view.builderCtaLabel}
            onPress={openBuilder}
          />
        </View>
      </View>

      {!view.hasActivePlan ? (
        <NutritionStatePanel
          icon="empty"
          title="Sin plan V2 vigente"
          description="Este alumno todavía no tiene una versión publicada de su plan de nutrición. Crea la primera para ver metas, franjas y adherencia."
          action={<EmberCta label="Crear plan" accessibilityLabel="Crear plan" onPress={openBuilder} />}
        />
      ) : (
        <View className="gap-5">
          {view.plan ? (
            <View className="flex-row flex-wrap items-center gap-2">
              <StrategyBadge strategy={view.plan.strategy} />
              <PlanVersionBadge
                version={view.plan.versionNumber}
                status={view.plan.status}
                effectiveLabel={`desde ${view.plan.effectiveFromLabel}`}
              />
            </View>
          ) : null}

          <MacroBudget calories={view.today.calories} macros={view.today.macros} />

          {/* Grid lg:grid-cols-2 del web colapsa a una columna en móvil. */}
          <View className="gap-4">
            <NutritionCard>
              <View className="flex-row items-center gap-2">
                <Utensils size={16} className="text-ember-600 dark:text-ember-300" />
                <Text className="font-display text-base font-semibold text-text-strong">
                  Plan vigente
                </Text>
              </View>
              <Text className="mt-2 text-sm font-medium text-text-strong">
                {view.plan?.name ?? 'Plan de nutrición'}
              </Text>
              <Text className="mt-2 text-sm leading-6 text-text-body">
                {view.plan?.visibleNotes || 'Sin indicaciones visibles para el alumno.'}
              </Text>
            </NutritionCard>
            <NutritionCard>
              <Text className="font-display text-base font-semibold text-text-strong">Hoy</Text>
              <Text className="mt-2 text-sm text-text-muted">
                {view.today.entryCount} registro{view.today.entryCount === 1 ? '' : 's'} ·{' '}
                {view.today.mealSlotCount} franja{view.today.mealSlotCount === 1 ? '' : 's'}
              </Text>
              <Text className="mt-3 text-sm text-text-body">
                <Text className="font-semibold text-text-strong">
                  {Math.round(view.today.remainingCalories)} kcal
                </Text>{' '}
                restantes según el snapshot del día.
              </Text>
            </NutritionCard>
          </View>

          <View>
            <Text className="mb-3 font-display text-lg font-semibold text-text-strong">
              Últimos días
            </Text>
            {view.showHistoryUpgradeCta ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Histórico completo con Nutrición Pro"
                onPress={() => router.push(view.historyUpgradeHref)}
                className="mb-3 flex-row items-center gap-2 self-start rounded-control border border-border-subtle bg-surface-sunken px-3 py-2"
              >
                <LockKeyhole size={14} className="text-ember-600 dark:text-ember-300" />
                <Text className="text-xs text-text-muted">Histórico completo con Nutrición Pro</Text>
              </Pressable>
            ) : null}
            {view.recentDays.length === 0 ? (
              <NutritionCard tone="neutral">
                <Text className="text-sm text-text-muted">
                  Aún no hay días registrados en la ventana visible.
                </Text>
              </NutritionCard>
            ) : (
              <View className="gap-3">
                {view.recentDays.map((day) => (
                  <NutritionCard key={day.localDate}>
                    <Text className="font-semibold text-text-strong">{day.label}</Text>
                    <Text className="mt-1 text-sm text-text-muted">
                      {Math.round(day.calories)} kcal · {day.entryCount} registro
                      {day.entryCount === 1 ? '' : 's'}
                    </Text>
                  </NutritionCard>
                ))}
              </View>
            )}
          </View>
        </View>
      )}
    </View>
  )
}
