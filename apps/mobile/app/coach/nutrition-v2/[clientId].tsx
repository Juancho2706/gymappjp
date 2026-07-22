import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import NetInfo from '@react-native-community/netinfo'
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Check,
  CheckCircle2,
  Info,
  LockKeyhole,
  Search,
  UserPlus,
  Users,
  X,
  XCircle,
} from 'lucide-react-native'
import {
  MacroBudget,
  MacroChipRow,
  NutritionHeader,
  NutritionMotionButton,
  NutritionSkeleton,
  NutritionStatePanel,
  NutritionCard,
  PlanVersionBadge,
  PortionDayCoverageCard,
  StrategyBadge,
} from '../../../components/nutrition-v2'
import { Sheet } from '../../../components/Sheet'
import {
  NutritionClientDetailReadModelSchema,
  createNutritionMacroValue,
  describeLegacyHistoryDay,
  type NutritionClientDetailReadModel,
  type NutritionV2CoachScope,
} from '@eva/nutrition-v2'
import { isEnabled } from '../../../lib/flags'
import { useEntitlements, useNutritionV2CoachFlagForClient } from '../../../lib/entitlements'
import { useWorkspace } from '../../../lib/workspace'
import {
  archiveNutritionPlan,
  assignNutritionPlanToClients,
  getNutritionClientDetailV2,
  getNutritionCoachHubV2,
  nutritionV2CoachScope,
  nutritionV2CoachScopeCacheKey,
} from '../../../lib/nutrition-v2.api'
import {
  canAssignSourcePlan,
  planReadModelToAssignSource,
  type AssignClientResult,
  type AssignSourcePlan,
  type AssignSummary,
} from '../../../lib/nutrition-v2-assign-archive'
import type { NutritionV2WriteClient } from '../../../lib/nutrition-v2-builder'
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

// Copy offline compartido con el quick-edit (delta 11): assign/archive fallan-cerrado sin red.
const OFFLINE_COPY = 'Sin conexión. Reintenta cuando vuelvas a tener señal.'
const EFFECTIVE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Fila del roster de destino para asignar (espejo de la web AssignRosterEntry). */
interface AssignRosterEntry {
  clientId: string
  clientName: string
  hasPlan: boolean
}

/**
 * Normaliza para búsqueda tolerante a acentos (misma pieza que el resto del móvil:
 * `.normalize('NFD')` + strip de marcas combinantes U+0300–U+036F). "josé" matchea "Jose".
 */
function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * OperationId estable por apertura del diálogo: ancla la clave de idempotencia por destino, de
 * modo que reintentar la MISMA operación no duplica versiones. crypto.randomUUID si existe (Hermes
 * polyfilleado / Node en tests), si no un fallback suficiente. Espejo del web genOperationId.
 */
function genAssignOperationId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
  if (c?.randomUUID) {
    try {
      return c.randomUUID()
    } catch {
      // cae al fallback
    }
  }
  return 'op-' + Math.random().toString(36).slice(2) + Date.now().toString(36)
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
  // Diálogos de acciones del coach (4B-08): asignar el plan a otros alumnos + archivar el vigente.
  const [assignOpen, setAssignOpen] = useState(false)
  const [archiveOpen, setArchiveOpen] = useState(false)
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
  // "Asignar a otros alumnos" solo si la FUENTE tiene una versión publicada vigente + estructura
  // (misma señal en vivo `detail.plan.plan` que gobierna el empty-state). Un plan superseded/sin
  // variantes no es copiable, por eso no gatilla el CTA ni la carga del roster. Espejo del web.
  const canAssign = canAssignSourcePlan({
    vigentePlanStatus: activePlan?.status ?? null,
    hasPlanStructure: activePlan !== null,
    variantCount: detail.plan.dayVariants.length,
  })
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
        <View className="flex-row flex-wrap items-center gap-2">
          <StrategyBadge strategy={(detail.today.plan ?? detail.plan.plan).strategy} />
          <PlanVersionBadge
            version={(detail.today.plan ?? detail.plan.plan).versionNumber}
            status={(detail.today.plan ?? detail.plan.plan).status}
            effectiveLabel={`desde ${(detail.today.plan ?? detail.plan.plan).effectiveFrom}`}
          />
          {/* Disparador secundario "Asignar a otros alumnos" (delta 2): en la fila de badges, a
              la derecha (ml-auto), NUNCA en el header. Gateado por canAssign (delta 1). */}
          {canAssign && userId ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Asignar a otros alumnos"
              onPress={() => setAssignOpen(true)}
              className="ml-auto min-h-11 flex-row items-center gap-1.5 rounded-control border border-border-subtle bg-surface-card px-3"
            >
              <UserPlus color={theme.primary} size={14} />
              <Text className="text-xs font-semibold text-text-body">Asignar a otros alumnos</Text>
            </Pressable>
          ) : null}
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

          {/* Fila "Porciones" read-only bajo los macros del día (SPEC UX-b; web
              coach/nutrition-v2/[clientId]/page.tsx:260-263). Misma fuente que el alumno
              (read-model), cero cálculo nuevo; sin targets de porciones no renderiza nada. */}
          <PortionDayCoverageCard coverage={detail.today.dayCoverage} />

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

          {/* Card "Hoy" (web page.tsx:273-281; copy verbatim del web, incluida la
              ortografía "segun/dia" sin tilde del original). */}
          <NutritionCard>
            <Text className="font-display text-lg font-semibold text-text-strong">Hoy</Text>
            <Text className="mt-1 text-sm text-text-muted">
              {detail.today.consumed.entryCount} registro
              {detail.today.consumed.entryCount === 1 ? '' : 's'} · {detail.today.mealSlots.length}{' '}
              franjas
            </Text>
            <Text className="mt-3 text-sm text-text-body">
              {detail.today.remaining.calories ?? 0} kcal restantes segun el snapshot del dia.
            </Text>
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

      {/* Zona "Archivar plan vigente" (delta 7): discreta, separada y aislada del CTA primario
          para evitar toques accidentales. Solo con plan vigente. Microcopy no tóxica. */}
      {activePlan && userId ? (
        <View className="mt-2 gap-3 border-t border-border-subtle pt-5">
          <Text className="text-xs leading-5 text-text-muted">
            Archivar retira el plan de la vista del alumno. El historial registrado se conserva.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Archivar plan"
            onPress={() => setArchiveOpen(true)}
            className="min-h-11 flex-row items-center gap-2 self-start rounded-control border border-border-subtle bg-surface-card px-3"
          >
            <Archive color={theme.textSecondary} size={16} />
            <Text className="text-sm font-semibold text-text-muted">Archivar plan</Text>
          </Pressable>
        </View>
      ) : null}

      {canAssign && userId ? (
        <AssignPlanModal
          visible={assignOpen}
          onClose={() => setAssignOpen(false)}
          scope={scope}
          sourceClientId={detail.client.id}
          sourcePlanName={detail.plan.plan?.name ?? 'este plan'}
          source={planReadModelToAssignSource(detail.plan)}
          userId={userId}
          hasNutritionPro={hasNutritionPro}
          today={date}
        />
      ) : null}

      {activePlan && userId ? (
        <ArchivePlanConfirmSheet
          open={archiveOpen}
          clientId={detail.client.id}
          planId={activePlan.id}
          planName={activePlan.name}
          userId={userId}
          onClose={() => setArchiveOpen(false)}
          onArchived={() => {
            setArchiveOpen(false)
            setReloadNonce((n) => n + 1)
          }}
        />
      ) : null}
    </ScrollView>
  )
}

// ---------------------------------------------------------------------------
// Diálogo "Asignar plan a otros alumnos" (delta 4/5/6). Modal full-screen (patrón FoodSearchModal,
// resolución del juez: consistencia con los flujos coach existentes), NO Sheet. Roster paginado
// del workspace + buscador acento-insensible + "Vigente desde" YYYY-MM-DD + reporte parcial.
// La escritura la hace assignNutritionPlanToClients (lib) contra el cliente RLS de la sesión.
// ---------------------------------------------------------------------------

function AssignPlanModal({
  visible,
  onClose,
  scope,
  sourceClientId,
  sourcePlanName,
  source,
  userId,
  hasNutritionPro,
  today,
}: {
  visible: boolean
  onClose: () => void
  scope: NutritionV2CoachScope
  sourceClientId: string
  sourcePlanName: string
  source: AssignSourcePlan
  userId: string
  hasNutritionPro: boolean
  today: string
}) {
  const { theme } = useTheme()
  const [roster, setRoster] = useState<AssignRosterEntry[]>([])
  const [rosterLoading, setRosterLoading] = useState(false)
  const [rosterError, setRosterError] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [effectiveFrom, setEffectiveFrom] = useState(today)
  const [submitting, setSubmitting] = useState(false)
  const [topError, setTopError] = useState<string | null>(null)
  const [results, setResults] = useState<{ items: AssignClientResult[]; summary: AssignSummary } | null>(null)
  const operationId = useRef(genAssignOperationId())
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Carga bajo demanda (al abrir): reset del estado + paginación keyset del hub scoped (tope 8×50,
  // excluye la fuente, marca hasPlan), misma fuente que el web. Fresh operationId por apertura.
  useEffect(() => {
    if (!visible) return
    operationId.current = genAssignOperationId()
    setSearch('')
    setSelected(new Set())
    setEffectiveFrom(today)
    setTopError(null)
    setResults(null)
    setRosterError(false)
    setRosterLoading(true)
    let active = true
    void (async () => {
      try {
        const collected: AssignRosterEntry[] = []
        let cursor: { updatedAt: string; clientId: string } | null = null
        for (let page = 0; page < 8; page += 1) {
          const hub = await getNutritionCoachHubV2({
            scope,
            cursorUpdatedAt: cursor?.updatedAt ?? null,
            cursorClientId: cursor?.clientId ?? null,
            pageSize: 50,
          })
          for (const item of hub.items) {
            if (item.clientId === sourceClientId) continue
            collected.push({
              clientId: item.clientId,
              clientName: item.clientName,
              hasPlan: item.planStatus === 'published',
            })
          }
          if (!hub.hasMore || !hub.nextCursor) break
          cursor = hub.nextCursor
        }
        if (active) setRoster(collected)
      } catch {
        if (active) setRosterError(true)
      } finally {
        if (active) setRosterLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [visible, scope, sourceClientId, today])

  const nameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const entry of roster) map.set(entry.clientId, entry.clientName)
    return map
  }, [roster])

  const filtered = useMemo(() => {
    const needle = normalizeName(search)
    if (needle.length === 0) return roster
    return roster.filter((entry) => normalizeName(entry.clientName).includes(needle))
  }, [roster, search])

  const toggle = useCallback((clientId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(clientId)) next.delete(clientId)
      else next.add(clientId)
      return next
    })
  }, [])

  const resetForNewRun = useCallback(() => {
    operationId.current = genAssignOperationId()
    setSelected(new Set())
    setSearch('')
    setEffectiveFrom(today)
    setResults(null)
    setTopError(null)
  }, [today])

  const handleConfirm = useCallback(async () => {
    if (selected.size === 0 || submitting) return
    if (!EFFECTIVE_DATE_RE.test(effectiveFrom.trim())) {
      setTopError('Ingresa una fecha válida (AAAA-MM-DD).')
      return
    }
    // Offline fail-closed (delta 11): no escribir sin red; nunca encolar.
    const net = await NetInfo.fetch()
    if (net.isConnected === false) {
      if (mountedRef.current) setTopError(OFFLINE_COPY)
      return
    }
    setSubmitting(true)
    setTopError(null)
    const res = await assignNutritionPlanToClients({
      db: supabase as unknown as NutritionV2WriteClient,
      userId,
      source,
      sourceClientId,
      targetClientIds: [...selected],
      effectiveFrom: effectiveFrom.trim(),
      operationId: operationId.current,
      hasNutritionPro,
    })
    if (!mountedRef.current) return
    setSubmitting(false)
    if (res.ok) setResults({ items: res.results, summary: res.summary })
    else setTopError(res.error)
  }, [selected, submitting, effectiveFrom, userId, source, sourceClientId, hasNutritionPro])

  const confirmLabel = submitting
    ? 'Asignando…'
    : selected.size === 0
      ? 'Selecciona alumnos'
      : `Asignar a ${selected.size} alumno${selected.size === 1 ? '' : 's'}`

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-surface-app">
        <View className="flex-row items-center gap-2 border-b border-border-subtle px-4 py-3">
          <Text className="min-w-0 flex-1 font-display text-lg font-semibold text-text-strong">
            Asignar plan a otros alumnos
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar"
            onPress={onClose}
            className="min-h-11 min-w-11 items-center justify-center rounded-control"
          >
            <X color={theme.foreground} size={20} />
          </Pressable>
        </View>

        {results ? (
          <ScrollView className="flex-1" contentContainerClassName="gap-3 px-4 py-4">
            <View className="rounded-control border border-border-subtle bg-surface-sunken px-4 py-3">
              <Text className="text-sm text-text-body">
                <Text className="font-semibold text-text-strong">{results.summary.succeeded}</Text> asignado
                {results.summary.succeeded === 1 ? '' : 's'}
                {results.summary.failed > 0
                  ? ` · ${results.summary.failed} con problemas`
                  : ''}{' '}
                de {results.summary.total}.
              </Text>
            </View>
            <View className="gap-2">
              {results.items.map((item) => (
                <View
                  key={item.clientId}
                  className="flex-row items-start gap-2 rounded-control border border-border-subtle bg-surface-card px-3 py-2.5"
                >
                  {item.ok ? (
                    <CheckCircle2 color={theme.success} size={16} />
                  ) : (
                    <XCircle color={theme.destructive} size={16} />
                  )}
                  <View className="min-w-0 flex-1">
                    <Text className="text-sm font-semibold text-text-strong">
                      {nameById.get(item.clientId) ?? 'Alumno'}
                    </Text>
                    <Text className="mt-0.5 text-xs text-text-muted">
                      {item.ok ? 'Nueva versión publicada.' : item.error}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
            <View className="mt-1 gap-3">
              <NutritionMotionButton
                accessibilityLabel="Asignar a otros"
                tone="neutral"
                onPress={resetForNewRun}
              >
                Asignar a otros
              </NutritionMotionButton>
              <NutritionMotionButton accessibilityLabel="Listo" onPress={onClose}>
                Listo
              </NutritionMotionButton>
            </View>
          </ScrollView>
        ) : (
          <ScrollView
            className="flex-1"
            contentContainerClassName="gap-4 px-4 py-4"
            keyboardShouldPersistTaps="handled"
          >
            <Text className="text-sm leading-5 text-text-body">
              Se copiará la estructura de{' '}
              <Text className="font-semibold text-text-strong">{sourcePlanName}</Text> a los alumnos que
              elijas. A quienes ya tengan un plan se les creará una nueva versión vigente.
            </Text>

            {rosterLoading ? (
              <View className="items-center py-8">
                <ActivityIndicator color={theme.primary} />
              </View>
            ) : rosterError ? (
              <View className="rounded-control border border-border-subtle bg-surface-sunken px-4 py-8">
                <Text className="text-center text-sm text-text-muted">
                  No pudimos cargar la lista de alumnos. Cierra y vuelve a intentar.
                </Text>
              </View>
            ) : roster.length === 0 ? (
              <View className="items-center rounded-control border border-border-subtle bg-surface-sunken px-4 py-8">
                <Users color={theme.mutedForeground} size={28} />
                <Text className="mt-2 text-center text-sm text-text-muted">
                  No hay otros alumnos en tu espacio para asignar este plan.
                </Text>
              </View>
            ) : (
              <>
                <View className="flex-row items-center gap-2 rounded-control border border-border-default bg-surface-card px-3">
                  <Search color={theme.mutedForeground} size={16} />
                  <TextInput
                    value={search}
                    onChangeText={(value) => setSearch(value.slice(0, 120))}
                    placeholder="Buscar alumno…"
                    placeholderTextColor={theme.mutedForeground}
                    className="min-h-11 flex-1 py-2 text-base text-text-strong"
                  />
                </View>

                <View className="flex-row items-center justify-between">
                  <Text className="text-xs text-text-muted">
                    {selected.size} seleccionado{selected.size === 1 ? '' : 's'}
                  </Text>
                  <View className="flex-row items-center gap-4">
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Seleccionar visibles"
                      onPress={() => setSelected(new Set(filtered.map((entry) => entry.clientId)))}
                    >
                      <Text className="text-xs font-semibold text-primary">Seleccionar visibles</Text>
                    </Pressable>
                    {selected.size > 0 ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Limpiar selección"
                        onPress={() => setSelected(new Set())}
                      >
                        <Text className="text-xs font-semibold text-text-muted">Limpiar</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>

                <View className="gap-2">
                  {filtered.length === 0 ? (
                    <Text className="py-6 text-center text-sm text-text-muted">Sin coincidencias.</Text>
                  ) : (
                    filtered.map((entry) => {
                      const isSelected = selected.has(entry.clientId)
                      return (
                        <Pressable
                          key={entry.clientId}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: isSelected }}
                          accessibilityLabel={entry.clientName}
                          onPress={() => toggle(entry.clientId)}
                          className={`min-h-14 flex-row items-center gap-3 rounded-control border px-3 py-2.5 ${
                            isSelected ? 'border-primary bg-primary/10' : 'border-border-subtle bg-surface-card'
                          }`}
                        >
                          <Text className="min-w-0 flex-1 text-sm font-semibold text-text-strong" numberOfLines={1}>
                            {entry.clientName}
                          </Text>
                          {entry.hasPlan ? (
                            <View className="flex-row items-center gap-1 rounded-pill border border-warning-500/40 bg-warning-500/10 px-2 py-0.5">
                              <AlertTriangle color={theme.warning} size={11} />
                              <Text className="text-[10px] font-semibold text-warning-700">Ya tiene plan</Text>
                            </View>
                          ) : null}
                          {isSelected ? <Check color={theme.primary} size={16} /> : null}
                        </Pressable>
                      )
                    })
                  )}
                </View>

                <View className="border-t border-border-subtle pt-4">
                  <Text className="mb-1.5 text-sm font-semibold text-text-strong">Vigente desde</Text>
                  <TextInput
                    value={effectiveFrom}
                    onChangeText={setEffectiveFrom}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.mutedForeground}
                    autoCapitalize="none"
                    className="min-h-11 rounded-control border border-border-default bg-surface-card px-3 py-2 text-base text-text-strong"
                  />
                  <Text className="mt-1 text-xs text-text-muted">
                    Formato AAAA-MM-DD. Para quienes ya tienen plan, debe ser posterior a la de su versión
                    vigente.
                  </Text>
                </View>

                {topError ? (
                  <View className="rounded-control border border-danger-500/30 bg-danger-500/10 px-3 py-2">
                    <Text className="text-sm font-medium text-danger-600">{topError}</Text>
                  </View>
                ) : null}

                <NutritionMotionButton
                  accessibilityLabel={confirmLabel}
                  pending={submitting}
                  disabled={selected.size === 0 || submitting}
                  onPress={handleConfirm}
                >
                  {confirmLabel}
                </NutritionMotionButton>
              </>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Confirmación "Archivar plan vigente" (delta 8). Sheet nativeModal (patrón PublishConfirmSheet,
// resolución del juez), copy no tóxico, botón destructivo + Cancelar, bloqueo durante la escritura
// y offline fail-closed. La escritura la hace archiveNutritionPlan (UPDATE RLS-scoped idempotente).
// ---------------------------------------------------------------------------

function ArchivePlanConfirmSheet({
  open,
  clientId,
  planId,
  planName,
  userId,
  onClose,
  onArchived,
}: {
  open: boolean
  clientId: string
  planId: string
  planName: string
  userId: string
  onClose: () => void
  onArchived: () => void
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (open) setError(null)
  }, [open])

  const handleClose = useCallback(() => {
    if (pending) return
    onClose()
  }, [pending, onClose])

  const handleConfirm = useCallback(async () => {
    if (pending) return
    setError(null)
    // Offline fail-closed (delta 11): no escribir sin red.
    const net = await NetInfo.fetch()
    if (net.isConnected === false) {
      if (mountedRef.current) setError(OFFLINE_COPY)
      return
    }
    setPending(true)
    const outcome = await archiveNutritionPlan({
      db: supabase as unknown as NutritionV2WriteClient,
      userId,
      clientId,
      planId,
    })
    if (!mountedRef.current) return
    setPending(false)
    if (outcome.code === 'OK') {
      onArchived()
      return
    }
    setError(outcome.error)
  }, [pending, userId, clientId, planId, onArchived])

  return (
    <Sheet
      open={open}
      onClose={handleClose}
      nativeModal
      dynamicSizing
      showCloseButton={!pending}
      title="Archivar plan vigente"
      accessibilityLabel="Archivar plan vigente"
    >
      <Text className="text-sm leading-5 text-text-body">
        El alumno dejará de ver {planName}. El historial registrado se conserva. Puedes crear uno nuevo
        cuando quieras.
      </Text>
      {error ? (
        <View className="mt-3 rounded-control border border-danger-500/30 bg-danger-500/10 px-3 py-2">
          <Text className="text-sm font-medium text-danger-600">{error}</Text>
        </View>
      ) : null}
      <View className="mt-3 gap-3">
        <NutritionMotionButton
          accessibilityLabel="Archivar plan"
          tone="danger"
          pending={pending}
          disabled={pending}
          onPress={handleConfirm}
        >
          Archivar plan
        </NutritionMotionButton>
        <NutritionMotionButton
          accessibilityLabel="Cancelar"
          tone="neutral"
          disabled={pending}
          onPress={handleClose}
        >
          Cancelar
        </NutritionMotionButton>
      </View>
    </Sheet>
  )
}
