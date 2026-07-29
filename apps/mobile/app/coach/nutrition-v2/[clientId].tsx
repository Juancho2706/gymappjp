import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import NetInfo from '@react-native-community/netinfo'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  AlertTriangle,
  Archive,
  ArrowLeft,
  Check,
  CheckCircle2,
  History,
  Info,
  LockKeyhole,
  Search,
  UserPlus,
  Users,
  X,
  XCircle,
} from 'lucide-react-native'
import {
  DayVariantWeekStrip,
  MacroBudget,
  MacroChipRow,
  NutritionHeader,
  NutritionMotionButton,
  NutritionSkeleton,
  NutritionStatePanel,
  NutritionCard,
  PlanVersionBadge,
  PortionDayCoverageCard,
  PrescribedPortionChips,
  StrategyBadge,
  WeekDayNav,
} from '../../../components/nutrition-v2'
import { Sheet } from '../../../components/Sheet'
import {
  NutritionClientDetailReadModelSchema,
  buildNutritionWeek,
  createNutritionMacroValue,
  describeLegacyHistoryDay,
  formatNutritionCalories,
  resolveNutritionDayVariantForDate,
  sortNutritionDayVariantsForDisplay,
  type NutritionClientDetailReadModel,
  type NutritionV2CoachScope,
  type NutritionWeekCell,
} from '@eva/nutrition-v2'
import { formatNutritionShortDate } from '../../../lib/date-utils'
import { isEnabled } from '../../../lib/flags'
import { useEntitlements, useNutritionV2CoachFlagForClient } from '../../../lib/entitlements'
import { useWorkspace } from '../../../lib/workspace'
import {
  archiveNutritionPlan,
  assignNutritionPlanToClients,
  getNutritionClientDetailV2,
  getNutritionCoachRosterV2,
  getNutritionConversionLinkV2,
  NUTRITION_COACH_ROSTER_PAGE_SIZE,
  nutritionV2CoachScope,
  nutritionV2CoachScopeCacheKey,
} from '../../../lib/nutrition-v2.api'
import {
  canAssignSourcePlan,
  type AssignClientResult,
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

// Prefijo de la clave de descarte del banner "plan convertido", por planId. Espejo del web
// (`ConvertedPlanBanner.tsx:6`, `eva:nutrition-v2-converted-plan-banner-dismissed:{planId}`) para
// que el descarte sea consistente en concepto (en RN persiste en AsyncStorage, no en localStorage).
const CONVERTED_BANNER_DISMISS_PREFIX = 'eva:nutrition-v2-converted-plan-banner-dismissed:'

/**
 * Formatea un timestamp ISO (`nutrition_v2_conversion_links.converted_at`) a `dd-mm-yyyy` en
 * America/Santiago. Espejo verbatim de la salida del web `formatDateDdMmYyyySantiago`
 * (`apps/web/src/lib/date-utils.ts:197`): deriva los componentes con `Intl.DateTimeFormat`
 * (DST-safe, mismo patrón que `todayInSantiago`), nunca con la TZ del host. Timestamp inválido →
 * cadena vacía (el llamador oculta el banner). Nota: el nombre web dice "DdMmYyyy" y la salida usa
 * separador "-"; se conserva la salida verbatim del web para paridad visual 1:1.
 */
function formatConvertedAtSantiago(isoTimestamp: string): string {
  const instant = new Date(isoTimestamp)
  if (Number.isNaN(instant.getTime())) return ''
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Santiago',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  )
  return `${parts.day}-${parts.month}-${parts.year}`
}

// Copy offline compartido con el quick-edit (delta 11): assign/archive fallan-cerrado sin red.
const OFFLINE_COPY = 'Sin conexión. Reintenta cuando vuelvas a tener señal.'
const EFFECTIVE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Celda de la semana de la ficha con los tipos REALES del read model del coach: la variante trae
 * `label`/`mealSlots` y la fila de historial su capa legacy, así el cuerpo del día no castea nada
 * (el helper compartido es genérico justamente para esto).
 */
type CoachWeekCell = NutritionWeekCell<
  NutritionClientDetailReadModel['plan']['dayVariants'][number],
  NutritionClientDetailReadModel['recentDays'][number]
>

/** Fila del roster de destino para asignar (espejo de la web AssignRosterEntry). */
interface AssignRosterEntry {
  clientId: string
  clientName: string
  hasPlan: boolean
}

// NUT-026: a partir de 2 caracteres la búsqueda deja de filtrar la primera página en memoria y
// pasa a ser SERVER-SIDE sobre todo el workspace (mismos umbrales que el diálogo web).
const ROSTER_SEARCH_DEBOUNCE_MS = 300
const ROSTER_MIN_SERVER_SEARCH_LEN = 2

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
 * Página del roster scoped -> filas del selector: excluye al alumno FUENTE (no tiene sentido
 * asignarle su propio plan) y marca "Ya tiene plan" con el mismo criterio que la web
 * (`planStatus === 'published'`). Sin nombre => "Alumno", como en la action web.
 */
function rosterEntriesFrom(
  items: ReadonlyArray<{ clientId: string; clientName: string | null; planStatus: string | null }>,
  sourceClientId: string,
): AssignRosterEntry[] {
  return items
    .filter((item) => item.clientId !== sourceClientId)
    .map((item) => ({
      clientId: item.clientId,
      clientName: item.clientName ?? 'Alumno',
      hasPlan: item.planStatus === 'published',
    }))
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
  // Banner "plan convertido" V1->V2 (D-08): etiqueta de fecha del link de conversión del plan
  // vigente. El link NO viaja en el read-model/API RN (igual que en web); se lee aparte RLS-scoped.
  // null = sin link (o fail-soft) => sin banner, paridad con el `null` del web.
  const [convertedAtLabel, setConvertedAtLabel] = useState<string | null>(null)
  const date = useMemo(todayInSantiago, [])
  // T3.5 — semana Lu-Do del alumno dentro de la ficha. Estado LOCAL (la ficha no navega ni vuelve
  // a pedir nada): la semana se pinta con el payload que `clientDetail` ya trajo. Hoy arranca
  // seleccionado porque es el día del que el coach pregunta primero.
  const [selectedIso, setSelectedIso] = useState(date)
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

  // Semana Lu-Do compuesta con datos YA descargados: plan completo (`dayVariants`, el RPC devuelve
  // TODAS las variantes) + historial disperso (`recentDays`, ya recortado a la ventana del addon).
  // CERO fetch por celda y, sobre todo, cero `get_nutrition_today_v2` con otra fecha: ese RPC es
  // `volatile` (materializa snapshots) y revienta con fecha > hoy+1. Días pasados = snapshot del
  // historial; días futuros = proyección client-side de la variante que aplica.
  const weekCells = useMemo<CoachWeekCell[]>(
    () =>
      detail
        ? buildNutritionWeek({
            variants: detail.plan.dayVariants,
            history: recentDays,
            weekStartIso: date,
            todayIso: date,
          })
        : [],
    [date, detail, recentDays],
  )
  const selectedCell = useMemo(
    () => weekCells.find((cell) => cell.isoDate === selectedIso) ?? null,
    [weekCells, selectedIso],
  )

  // Banner "plan convertido" (D-08): solo se consulta cuando hay plan vigente; si no existe link
  // (o la lectura degrada), queda null y no se renderiza nada (paridad con el fail-soft del web).
  // Read directo RLS-scoped fuera del hot-path (la data no llega en el read-model), tras hidratar
  // el detalle. Se re-consulta si cambia el id del plan vigente (p.ej. tras publicar/archivar).
  const activePlanId = detail?.plan.plan?.id ?? null
  useEffect(() => {
    if (!activePlanId) {
      setConvertedAtLabel(null)
      return
    }
    let active = true
    void (async () => {
      const link = await getNutritionConversionLinkV2({
        db: supabase as unknown as NutritionV2WriteClient,
        v2PlanId: activePlanId,
      })
      if (!active) return
      setConvertedAtLabel(link ? formatConvertedAtSantiago(link.convertedAt) : null)
    })()
    return () => {
      active = false
    }
  }, [activePlanId])

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
  // NUT-004: con plan vigente el builder DEBE recibir la raiz (`?planId=`) para publicar una
  // version nueva sobre ella; sin plan queda sin query y crea la primera raiz. Espejo del web.
  const builderHref = nutritionV2BuilderHref(detail.client.id, activePlan?.id ?? null)
  const showTodayPlanLag = activePlan !== null && (todayPlan === null || todayPlan.id !== activePlan.id)
  const todayPlanLagMessage =
    todayPlan === null
      ? 'El plan vigente ya está publicado. El registro de hoy todavía no tiene metas asignadas; desde mañana se aplican las del nuevo plan.'
      : 'El plan vigente ya está publicado. Los registros de hoy siguen mostrando el plan anterior; desde mañana se usa el nuevo.'

  // FD3 (espejo de web coach/nutrition-v2/[clientId]/page.tsx): día base primero y después los
  // días específicos Lu→Do, cada card con su tira de días. "Hoy aplica" solo si el registro del
  // día ya es del plan vigente (con lag el snapshot es de otra versión). Cero selección nueva.
  const orderedVariants = sortNutritionDayVariantsForDisplay(detail.plan.dayVariants)
  const multiDayPlan = detail.plan.dayVariants.length > 1
  const todayVariant =
    multiDayPlan && !showTodayPlanLag
      ? resolveNutritionDayVariantForDate(detail.plan.dayVariants, date)
      : null

  // T3.5 — día seleccionado de la semana. Sin celda (semana no compuesta) la ficha se comporta
  // exactamente como antes: hoy. La sección del día NUNCA ofrece registro: la ficha del coach es
  // read-only y el pasado, además, es solo lectura por regla de producto.
  const showingToday = selectedCell == null || selectedCell.state === 'today'
  const selectedDayLabel = formatNutritionShortDate(selectedIso, { todayIso: date, relative: true })
  // "Aplica el sábado" SOLO para días futuros: rotular la variante de hoy sobre un día PASADO
  // sería proyectar el plan vigente hacia atrás (el snapshot de ese día pudo congelar otra
  // versión). El pasado se cuenta con su historial, nunca con la estructura de hoy.
  const highlightedVariantId =
    selectedCell != null && selectedCell.state === 'future' ? (selectedCell.variant?.id ?? null) : null

  // Modo edicion in-place (quick-edit): misma ruta, estado cliente. Al publicar, la
  // ficha re-lee el read model (reloadNonce) y el baseline se re-hidrata solo.
  if (editing && activePlan && userId) {
    const clientFullName = detail.client.fullName
    return (
      <QuickEditMode
        clientId={detail.client.id}
        clientName={clientFullName}
        planModel={detail.plan}
        scope={scope}
        todayIso={date}
        hasNutritionPro={hasNutritionPro}
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

      {/* Banner "plan convertido" V1->V2 (D-08): solo con plan vigente y link presente. Descartable
          por planId (AsyncStorage). Espejo del web (banner primero, luego la fila de badges). */}
      {detail.plan.plan && convertedAtLabel ? (
        <ConvertedPlanBanner planId={detail.plan.plan.id} convertedAtLabel={convertedAtLabel} />
      ) : null}

      {detail.plan.plan ? (
        <View className="flex-row flex-wrap items-center gap-2">
          <StrategyBadge strategy={(detail.today.plan ?? detail.plan.plan).strategy} />
          <PlanVersionBadge
            version={(detail.today.plan ?? detail.plan.plan).versionNumber}
            status={(detail.today.plan ?? detail.plan.plan).status}
            effectiveLabel={`desde ${(detail.today.plan ?? detail.plan.plan).effectiveFrom}`}
          />
          {/* Disparador secundario "Asignar a otros alumnos" (delta 2): en la fila de badges, a
              la derecha (ml-auto), NUNCA en el header. Gateado por canAssign (delta 1).
              NUT-012 — fail-closed con cache stale: `offline` significa que la ficha se está
              mostrando desde la copia local (el refresco falló), así que el plan visible puede no
              ser el vigente. Se deshabilita el disparador en vez de arriesgar copiar un plan viejo
              a otros alumnos; al recuperar señal la ficha se re-lee y el CTA vuelve. */}
          {canAssign && userId ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Asignar a otros alumnos"
              accessibilityState={{ disabled: offline }}
              disabled={offline}
              onPress={() => setAssignOpen(true)}
              className={`ml-auto min-h-11 flex-row items-center gap-1.5 rounded-control border border-border-subtle bg-surface-card px-3 ${offline ? 'opacity-50' : ''}`}
            >
              <UserPlus color={offline ? theme.textSecondary : theme.primary} size={14} />
              <Text className="text-xs font-semibold text-text-body">Asignar a otros alumnos</Text>
            </Pressable>
          ) : null}
          {canAssign && userId && offline ? (
            <Text className="w-full text-[11px] text-text-muted">
              Sin conexión no podemos confirmar que este sea el plan vigente: reintenta al recuperar señal.
            </Text>
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
          illustration="sin-plan"
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
          {/* T3.5 — semana Lu-Do del alumno. La tira NO se desmonta al cambiar de día (solo cambia
              el cuerpo de abajo) y HOY queda marcado aunque el coach esté mirando el sábado. Todo
              sale del payload que la ficha ya trajo: cambiar de día no dispara una sola lectura. */}
          <View className="gap-3">
            <View className="flex-row flex-wrap items-center justify-between gap-2">
              <Text className="font-display text-xl font-semibold text-text-strong">La semana</Text>
              {!showingToday ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Volver a hoy"
                  onPress={() => setSelectedIso(date)}
                  className="min-h-11 flex-row items-center justify-center rounded-control border border-border-subtle bg-surface-card px-3"
                >
                  <Text className="text-xs font-semibold text-primary">Volver a hoy</Text>
                </Pressable>
              ) : null}
            </View>

            <WeekDayNav
              cells={weekCells}
              selectedIso={selectedIso}
              onSelect={setSelectedIso}
              label={`Días de la semana de ${detail.client.fullName}`}
            />

            <Text className="text-xs font-semibold uppercase tracking-wide text-text-subtle">
              {selectedDayLabel}
            </Text>

            {showingToday || selectedCell == null ? (
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
                    (read-model), cero cálculo nuevo; sin targets de porciones no renderiza nada.
                    Solo HOY: `recentDays` no trae cobertura de porciones por día. */}
                <PortionDayCoverageCard coverage={detail.today.dayCoverage} />

                {/* Card "Hoy" (web page.tsx:273-281; copy verbatim del web, incluida la
                    ortografía "segun/dia" sin tilde del original). */}
                <NutritionCard>
                  <Text className="font-display text-lg font-semibold text-text-strong">Hoy</Text>
                  <Text className="mt-1 text-sm text-text-muted">
                    {detail.today.consumed.entryCount} registro
                    {detail.today.consumed.entryCount === 1 ? '' : 's'} ·{' '}
                    {detail.today.mealSlots.length} franjas
                  </Text>
                  <Text className="mt-3 text-sm text-text-body">
                    {detail.today.remaining.calories ?? 0} kcal restantes segun el snapshot del dia.
                  </Text>
                </NutritionCard>
              </>
            ) : (
              <WeekDaySummaryCard cell={selectedCell} />
            )}
          </View>

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
          {orderedVariants.map((variant) => (
            <NutritionCard key={variant.id}>
              <View className="flex-row flex-wrap items-center justify-between gap-2">
                <View className="flex-row flex-wrap items-center gap-2">
                  <Text className="font-display text-base font-semibold text-text-strong">{variant.label}</Text>
                  {todayVariant?.id === variant.id ? (
                    <View className="rounded-pill border border-primary/30 bg-primary/10 px-2 py-0.5">
                      <Text className="text-[10px] font-semibold text-primary">Hoy aplica</Text>
                    </View>
                  ) : null}
                  {/* T3.5: con un día FUTURO seleccionado en la tira, la estructura que le toca
                      queda rotulada ("Aplica el sábado"). Solo futuro: rotular el pasado con el
                      plan de hoy sería proyectar hacia atrás una versión que ese día no tuvo. */}
                  {highlightedVariantId === variant.id && selectedCell != null ? (
                    <View className="rounded-pill border border-border-default bg-surface-sunken px-2 py-0.5">
                      <Text className="text-[10px] font-semibold text-text-body">
                        Aplica el {selectedCell.longLabel.toLowerCase()}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text className="text-xs text-text-muted" style={{ fontVariant: ['tabular-nums'] }}>
                  {variant.targets.calories != null
                    ? `${formatNutritionCalories(variant.targets.calories)} objetivo`
                    : 'Sin objetivo de energía'}
                </Text>
              </View>
              {/* Tira Lu-Do de la variante (FD3): con un solo día no aporta y no se pinta. */}
              {multiDayPlan ? (
                <DayVariantWeekStrip
                  variants={detail.plan.dayVariants}
                  variant={variant}
                  todayIso={date}
                />
              ) : null}
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
                      ) : null}
                      {/* Capa de porciones (P0-3, paridad con web page.tsx:362-368): la franja puede
                          prescribir SOLO porciones, o porciones ademas de los alimentos fijos. Sin
                          targets no pinta nada. */}
                      <PrescribedPortionChips className="mt-2" targets={slot.exchangeTargets} />
                      {slot.prescriptionItems.length === 0 &&
                      (slot.exchangeTargets?.length ?? 0) === 0 ? (
                        <Text className="mt-2 text-xs text-text-muted">Sin alimentos prescritos en esta franja.</Text>
                      ) : null}
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
        {/* D-07: palabra alineada a web ("informacion", no "contenido"), conservando la ortografía
            correcta del proyecto (tildes). El typo web "informacion" queda como deuda RN-out. */}
        <Text className="mt-2 text-xs text-text-muted">El alumno no recibe esta información.</Text>
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
                        {/* QW-10: fecha legible ("ayer", "sáb 25 jul"), no el ISO crudo. Mismo
                            helper y mismas opciones que el historial del alumno RN. */}
                        <Text className="font-semibold text-text-strong">
                          {formatNutritionShortDate(day.localDate, { todayIso: date, relative: true })}
                        </Text>
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

      {/* NUT-012: la pantalla ya NO entrega la copia del plan (podría venir de cache stale); solo
          el id de la versión vigente que mostró. La lib relee la fuente y corta si cambió. */}
      {canAssign && userId ? (
        <AssignPlanModal
          visible={assignOpen}
          onClose={() => setAssignOpen(false)}
          scope={scope}
          sourceClientId={detail.client.id}
          sourcePlanName={detail.plan.plan?.name ?? 'este plan'}
          sourceVersionId={activePlan?.versionId ?? ''}
          today={date}
        />
      ) : null}

      {activePlan && userId ? (
        <ArchivePlanConfirmSheet
          open={archiveOpen}
          scope={scope}
          clientId={detail.client.id}
          planId={activePlan.id}
          planName={activePlan.name}
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
// Cuerpo del día seleccionado cuando NO es hoy (T3.5). Read-only estricto: el pasado muestra los
// resultados congelados del snapshot del historial y el futuro, el plan proyectado — ninguno de los
// dos ofrece jamás un control de registro (la ficha del coach no registra, y el alumno solo puede
// registrar el día en curso). Se pinta con datos que la ficha YA tenía: cero fetch al cambiar de día.
//
// Reglas de datos que este componente respeta al pie de la letra:
//  - `consumed = null` es SIN REGISTRO, no "registró cero": no se pintan ceros inventados.
//  - las metas del pasado salen del snapshot (`cell.targets` con `targetsSource = 'snapshot'`),
//    nunca de la estructura vigente, así republicar el plan no reescribe la historia;
//  - un día del sistema anterior se cuenta con su capa legacy (sus totales V2 son ceros por
//    construcción y mostrarían "0 kcal" sobre un día que sí tuvo registros).
// Tono: pasado sin rojo ni culpa — "sin registros" es un dato, no un reproche.
// ---------------------------------------------------------------------------

/** ¿El snapshot dejó alguna meta comparable? Sin ninguna, las barras mentirían un "de 0". */
function hasAnyMacroTarget(targets: {
  calories: number | null
  proteinG: number | null
  carbsG: number | null
  fatsG: number | null
}): boolean {
  return (
    targets.calories != null ||
    targets.proteinG != null ||
    targets.carbsG != null ||
    targets.fatsG != null
  )
}

function WeekDaySummaryCard({ cell }: { cell: CoachWeekCell }) {
  const targets = cell.targets
  const consumed = cell.consumed
  const legacy = cell.legacy

  if (cell.state === 'future') {
    return (
      <NutritionCard>
        <View className="flex-row flex-wrap items-center justify-between gap-2">
          <Text className="min-w-0 flex-1 font-display text-base font-semibold text-text-strong">
            {cell.variant ? cell.variant.label : 'Sin estructura para este día'}
          </Text>
          <View className="rounded-pill border border-border-subtle bg-surface-sunken px-2 py-0.5">
            <Text className="text-[10px] font-semibold text-text-muted">Próximo</Text>
          </View>
        </View>
        <Text className="mt-1 text-sm leading-5 text-text-muted">
          {cell.variant
            ? 'Esto es lo que le va a tocar. Todavía no hay nada que registrar.'
            : 'El plan vigente no prescribe una estructura para este día.'}
        </Text>
        {targets ? (
          <View className="mt-3">
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle">
              Metas del día
            </Text>
            <View className="mt-1">
              <MacroChipRow
                calories={targets.calories}
                proteinG={targets.proteinG}
                carbsG={targets.carbsG}
                fatsG={targets.fatsG}
                size="sm"
              />
            </View>
          </View>
        ) : null}
      </NutritionCard>
    )
  }

  if (cell.state === 'past-empty') {
    return (
      <NutritionCard>
        <Text className="font-display text-base font-semibold text-text-strong">Sin registros</Text>
        <Text className="mt-1 text-sm leading-5 text-text-muted">
          Ese día no quedó ningún registro. No es un cero: simplemente no hay datos.
        </Text>
      </NutritionCard>
    )
  }

  // Día del sistema anterior sin detalle V2: manda la capa legacy (mismas frases que "Últimos días").
  if (legacy?.legacyOnly) {
    return (
      <NutritionCard>
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="font-display text-base font-semibold text-text-strong">Registro anterior</Text>
          <View className="rounded-pill border border-warning-500/40 bg-warning-500/10 px-2 py-0.5">
            <Text className="text-[10px] font-semibold text-warning-700">Historial anterior</Text>
          </View>
        </View>
        {legacy.hasMacros && legacy.consumed ? (
          <View className="mt-2">
            <MacroChipRow
              calories={legacy.consumed.calories}
              proteinG={legacy.consumed.proteinG}
              carbsG={legacy.consumed.carbsG}
              fatsG={legacy.consumed.fatsG}
              size="sm"
            />
          </View>
        ) : (
          <Text className="mt-1 text-sm text-text-muted">
            {legacy.completionCount > 0 ? legacy.completionsLabel : 'Registrado en el sistema anterior'}
          </Text>
        )}
        {legacy.mealsLabel ? (
          <Text className="mt-2 text-xs leading-5 text-text-subtle">{legacy.mealsLabel}</Text>
        ) : null}
      </NutritionCard>
    )
  }

  // Pasado con registro V2 y metas congeladas: mismo lenguaje visual que el bloque de hoy. Un
  // snapshot puede existir con TODAS las metas en null (plan flexible o sin objetivos): ahí no hay
  // adherencia que comparar y las barras dirían "de 0", así que cae al bloque honesto de abajo.
  if (consumed && targets && hasAnyMacroTarget(targets)) {
    return (
      <>
        <MacroBudget
          calories={{ consumed: consumed.calories, target: targets.calories ?? 0 }}
          macros={[
            createNutritionMacroValue('protein', {
              consumed: consumed.proteinG,
              target: targets.proteinG ?? 0,
            }),
            createNutritionMacroValue('carbs', {
              consumed: consumed.carbsG,
              target: targets.carbsG ?? 0,
            }),
            createNutritionMacroValue('fats', {
              consumed: consumed.fatsG,
              target: targets.fatsG ?? 0,
            }),
          ]}
        />
        <NutritionCard>
          <Text className="text-sm text-text-muted" style={{ fontVariant: ['tabular-nums'] }}>
            {consumed.entryCount} registro{consumed.entryCount === 1 ? '' : 's'} ese día
          </Text>
          <Text className="mt-2 text-sm leading-5 text-text-body">
            Resultados del día, tal como quedaron. Solo lectura.
          </Text>
          {legacy?.secondaryLabel ? (
            <Text className="mt-2 text-xs text-text-subtle">{legacy.secondaryLabel}</Text>
          ) : null}
        </NutritionCard>
      </>
    )
  }

  // Hubo actividad pero el snapshot no dejó metas (o el consumo no viaja): se dice tal cual.
  return (
    <NutritionCard>
      <Text className="font-display text-base font-semibold text-text-strong">Con actividad</Text>
      {consumed ? (
        <View className="mt-2">
          <MacroChipRow
            calories={consumed.calories}
            proteinG={consumed.proteinG}
            carbsG={consumed.carbsG}
            fatsG={consumed.fatsG}
            size="sm"
          />
        </View>
      ) : null}
      <Text className="mt-2 text-sm leading-5 text-text-muted">
        Ese día no quedaron metas asignadas en el registro, así que no hay adherencia que comparar.
      </Text>
    </NutritionCard>
  )
}

// ---------------------------------------------------------------------------
// Banner "plan convertido" V1->V2 (D-08 / SPEC AC8). Espejo RN del web ConvertedPlanBanner: aviso
// discreto e informativo (Fase 1 sin botón "regenerar"; el re-sync es por CLI). Descartable
// client-side, persistido por planId en AsyncStorage (equivalente RN del localStorage web; misma
// convención de key). Progressive-enhancement: arranca oculto y se resuelve en el efecto para no
// parpadear un aviso ya descartado. Tokens del DS, theme-aware — mismo tratamiento que el aviso
// "hoy" de esta ficha. Copy verbatim del web.
// ---------------------------------------------------------------------------

function ConvertedPlanBanner({
  planId,
  convertedAtLabel,
}: {
  planId: string
  convertedAtLabel: string
}) {
  const { theme } = useTheme()
  const dismissKey = `${CONVERTED_BANNER_DISMISS_PREFIX}${planId}`
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const dismissed = await AsyncStorage.getItem(dismissKey)
        if (active && dismissed !== '1') setVisible(true)
      } catch {
        if (active) setVisible(true)
      }
    })()
    return () => {
      active = false
    }
  }, [dismissKey])

  const dismiss = useCallback(() => {
    setVisible(false)
    void AsyncStorage.setItem(dismissKey, '1').catch(() => {
      /* almacenamiento no disponible: descarte solo en memoria */
    })
  }, [dismissKey])

  if (!visible) return null

  return (
    <View
      accessibilityRole="summary"
      className="flex-row items-start gap-2 rounded-control border border-border-subtle bg-surface-sunken px-4 py-3"
    >
      <History color={theme.mutedForeground} size={16} />
      <Text className="flex-1 text-sm leading-5 text-text-body">
        Plan convertido del sistema anterior el{' '}
        <Text className="font-semibold text-text-strong">{convertedAtLabel}</Text> — revísalo cuando
        quieras.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Descartar aviso"
        onPress={dismiss}
        hitSlop={8}
        className="-mr-1 -mt-1 h-7 w-7 items-center justify-center rounded-control"
      >
        <X color={theme.mutedForeground} size={16} />
      </Pressable>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Diálogo "Asignar plan a otros alumnos" (delta 4/5/6). Modal full-screen (patrón FoodSearchModal,
// resolución del juez: consistencia con los flujos coach existentes), NO Sheet. Roster paginado
// del workspace + buscador acento-insensible + "Vigente desde" YYYY-MM-DD + reporte parcial.
// La escritura la hace assignNutritionPlanToClients, que POSTea al endpoint de mutaciones del
// coach (NUT-005): rollout, workspace, gate Pro y relectura de la fuente se validan server-side.
// ---------------------------------------------------------------------------

function AssignPlanModal({
  visible,
  onClose,
  scope,
  sourceClientId,
  sourcePlanName,
  sourceVersionId,
  today,
}: {
  visible: boolean
  onClose: () => void
  scope: NutritionV2CoachScope
  sourceClientId: string
  sourcePlanName: string
  /** Versión vigente que la ficha mostró: CAS anti-stale que el servidor valida tras releer la fuente. */
  sourceVersionId: string
  today: string
}) {
  const { theme } = useTheme()
  const [roster, setRoster] = useState<AssignRosterEntry[]>([])
  const [rosterHasMore, setRosterHasMore] = useState(false)
  const [rosterLoading, setRosterLoading] = useState(false)
  const [rosterError, setRosterError] = useState(false)
  const [search, setSearch] = useState('')
  // Resultados de la búsqueda server-side (null = todavía no aplica: término corto o sin respuesta).
  const [remote, setRemote] = useState<AssignRosterEntry[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  // Nombres vistos en CUALQUIER página o búsqueda de esta apertura: el reporte final debe poder
  // nombrar a un alumno seleccionado en una búsqueda ya descartada (si no, caería a "Alumno").
  const [seenNames, setSeenNames] = useState<Record<string, string>>({})
  const searchTicketRef = useRef(0)
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

  const term = search.trim()
  const useRemote = term.length >= ROSTER_MIN_SERVER_SEARCH_LEN

  // Carga bajo demanda (al abrir): reset del estado + PRIMERA página alfabética del roster scoped
  // (NUT-026). Antes se encadenaban hasta 8 páginas del hub (tope silencioso de 400 alumnos, con el
  // #401 invisible e imbuscable) y se filtraba en memoria. Fresh operationId por apertura.
  useEffect(() => {
    if (!visible) return
    operationId.current = genAssignOperationId()
    setSearch('')
    setRemote(null)
    setSearching(false)
    setSearchError(null)
    setSeenNames({})
    setSelected(new Set())
    setEffectiveFrom(today)
    setTopError(null)
    setResults(null)
    setRosterError(false)
    setRosterLoading(true)
    let active = true
    void (async () => {
      try {
        const page = await getNutritionCoachRosterV2({
          db: supabase as unknown as NutritionV2WriteClient,
          scope,
          pageSize: NUTRITION_COACH_ROSTER_PAGE_SIZE,
        })
        if (!active) return
        setRoster(rosterEntriesFrom(page.items, sourceClientId))
        setRosterHasMore(page.hasMore)
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

  // Búsqueda server-side con debounce de 300 ms; `searchTicketRef` descarta respuestas fuera de
  // orden (una petición lenta no puede pisar el resultado de un término más nuevo).
  useEffect(() => {
    if (!visible || !useRemote) {
      setRemote(null)
      setSearching(false)
      setSearchError(null)
      return
    }
    setSearching(true)
    setSearchError(null)
    const ticket = ++searchTicketRef.current
    const timer = setTimeout(() => {
      void getNutritionCoachRosterV2({
        db: supabase as unknown as NutritionV2WriteClient,
        scope,
        search: term,
        pageSize: NUTRITION_COACH_ROSTER_PAGE_SIZE,
      })
        .then((page) => {
          if (ticket !== searchTicketRef.current) return
          const entries = rosterEntriesFrom(page.items, sourceClientId)
          setRemote(entries)
          setSeenNames((prev) => {
            const next = { ...prev }
            for (const entry of entries) next[entry.clientId] = entry.clientName
            return next
          })
        })
        .catch(() => {
          if (ticket === searchTicketRef.current) {
            setSearchError('No pudimos buscar alumnos. Intenta de nuevo.')
          }
        })
        .finally(() => {
          if (ticket === searchTicketRef.current) setSearching(false)
        })
    }, ROSTER_SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [visible, useRemote, term, scope, sourceClientId])

  const nameById = useMemo(() => {
    const map = new Map<string, string>()
    for (const entry of roster) map.set(entry.clientId, entry.clientName)
    for (const [clientId, clientName] of Object.entries(seenNames)) map.set(clientId, clientName)
    return map
  }, [roster, seenNames])

  const filtered = useMemo(() => {
    if (useRemote) return remote ?? []
    const needle = normalizeName(search)
    if (needle.length === 0) return roster
    return roster.filter((entry) => normalizeName(entry.clientName).includes(needle))
  }, [useRemote, remote, roster, search])

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
    setRemote(null)
    setSearchError(null)
    setSeenNames({})
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
      sourceClientId,
      sourceScope: scope,
      expectedVersionId: sourceVersionId,
      targetClientIds: [...selected],
      effectiveFrom: effectiveFrom.trim(),
      operationId: operationId.current,
    })
    if (!mountedRef.current) return
    setSubmitting(false)
    if (res.ok) setResults({ items: res.results, summary: res.summary })
    else setTopError(res.error)
  }, [selected, submitting, effectiveFrom, scope, sourceClientId, sourceVersionId])

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
            ) : roster.length === 0 && !rosterHasMore ? (
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
                    autoCorrect={false}
                    className="min-h-11 flex-1 py-2 text-base text-text-strong"
                  />
                  {searching ? <ActivityIndicator color={theme.mutedForeground} size="small" /> : null}
                </View>

                {/* Honestidad del tope (NUT-026): la primera página no es todo el espacio. */}
                {rosterHasMore && !useRemote ? (
                  <Text className="text-xs text-text-muted">
                    Tu espacio tiene más alumnos de los que caben aquí. Escribe para buscarlos a todos.
                  </Text>
                ) : null}
                {searchError ? (
                  <View className="rounded-control border border-danger-500/30 bg-danger-500/10 px-3 py-2">
                    <Text className="text-sm font-medium text-danger-600">{searchError}</Text>
                  </View>
                ) : null}

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
                    searching ? (
                      <View className="items-center py-6">
                        <ActivityIndicator color={theme.primary} />
                      </View>
                    ) : (
                      <Text className="py-6 text-center text-sm text-text-muted">
                        {searchError ? 'No pudimos completar la búsqueda.' : 'Sin coincidencias.'}
                      </Text>
                    )
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
// y offline fail-closed. La escritura la hace archiveNutritionPlan via la API movil (UPDATE
// RLS-scoped e idempotente server-side; NUT-005).
// ---------------------------------------------------------------------------

function ArchivePlanConfirmSheet({
  open,
  scope,
  clientId,
  planId,
  planName,
  onClose,
  onArchived,
}: {
  open: boolean
  scope: NutritionV2CoachScope
  clientId: string
  planId: string
  planName: string
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
    const outcome = await archiveNutritionPlan({ scope, clientId, planId })
    if (!mountedRef.current) return
    setPending(false)
    if (outcome.code === 'OK') {
      onArchived()
      return
    }
    setError(outcome.error)
  }, [pending, scope, clientId, planId, onArchived])

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
