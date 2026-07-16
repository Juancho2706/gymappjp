/**
 * NutritionV2Summary — resumen V2 del tab de nutricion de la ficha de alumno del coach (paralelo del
 * tab web de Tanda 8). Cuando el flag `nutritionV2Coach` esta ON Y el fetch V2 del alumno responde,
 * NutricionTab renderiza este resumen (plan vigente: estrategia/version/metas + consumo de hoy vs
 * metas + CTA "Ver ficha nutricion completa"). Ante flag OFF o CUALQUIER fallo, NutricionTab cae al
 * tab V1 exactamente igual (fail-open, cero regresion).
 *
 * useCoachNutritionV2Detail clona el patron del hub (app/coach/nutrition-v2/[clientId].tsx): scope del
 * workspace activo (fail-closed), cache scoped por workspace+fecha, cancelacion via bandera active +
 * AbortController (nunca setState tras unmount).
 *
 * NOTA DE DISENO (conservadora): NutritionPlanSection / coach-nutrition-detail-logic son de la
 * iteracion V1-parity (modelan comidas con food_items y timeline de adherencia por dia). El read model
 * V2 tiene otra forma (today.plan resumen + targets + mealSlots/prescriptionItems, sin compliancePct
 * por dia) y no mapea sin forzar, asi que se dejan intactos y aqui se usa el kit nutrition-v2
 * (StrategyBadge, PlanVersionBadge, MacroBudget, NutritionCard, NutritionMotionButton).
 */
import { useEffect, useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import {
  MacroBudget,
  NutritionCard,
  NutritionMotionButton,
  PlanVersionBadge,
  StrategyBadge,
} from '../../../nutrition-v2'
import {
  createNutritionMacroValue,
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
import { supabase } from '../../../../lib/supabase'
import { buildNutritionV2TabViewModel } from '../../../../lib/coach-nutrition-v2-tab-logic'

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

export function NutritionV2Summary({
  detail,
  clientId,
  offline,
  onEditNutrition,
}: {
  detail: NutritionClientDetailReadModel
  clientId: string
  offline: boolean
  onEditNutrition?: () => void
}) {
  const router = useRouter()
  const vm = useMemo(() => buildNutritionV2TabViewModel(detail), [detail])
  if (!vm) return null

  const openFull = () => router.push(`/coach/nutrition-v2/${clientId}`)

  return (
    <View className="gap-4">
      {offline ? (
        <Text className="text-xs text-text-muted">Mostrando la ultima copia disponible.</Text>
      ) : null}

      <NutritionCard>
        <Text className="font-mono text-[11px] font-semibold uppercase tracking-[1.5px] text-ember-600">
          Nutricion V2
        </Text>
        <Text className="mt-1 font-display text-lg font-semibold text-text-strong">
          {vm.hasPlan ? vm.planName || 'Plan vigente' : 'Sin plan V2 vigente'}
        </Text>
        {vm.hasPlan && vm.strategy ? (
          <View className="mt-3 flex-row flex-wrap gap-2">
            <StrategyBadge strategy={vm.strategy} />
            {vm.versionNumber != null && vm.status ? (
              <PlanVersionBadge version={vm.versionNumber} status={vm.status} />
            ) : null}
          </View>
        ) : (
          <Text className="mt-2 text-sm leading-5 text-text-muted">
            Este alumno todavia no tiene un plan de nutricion V2 publicado.
          </Text>
        )}
      </NutritionCard>

      <MacroBudget
        calories={{ consumed: vm.calories.consumed, target: vm.calories.target }}
        macros={vm.macros.map((macro) =>
          createNutritionMacroValue(macro.key, {
            consumed: macro.consumed,
            target: macro.target,
          }),
        )}
      />

      <NutritionMotionButton
        accessibilityLabel="Ver ficha nutricion completa"
        tone="nutrition"
        onPress={openFull}
      >
        Ver ficha nutricion completa
      </NutritionMotionButton>

      {onEditNutrition ? (
        <NutritionMotionButton
          accessibilityLabel="Editar o asignar plan de nutricion"
          tone="neutral"
          onPress={onEditNutrition}
        >
          Editar / asignar plan
        </NutritionMotionButton>
      ) : null}
    </View>
  )
}
