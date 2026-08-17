import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Alert, AppState, Pressable, RefreshControl, ScrollView, Share, Text, TextInput, View } from 'react-native'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { FlashList } from '@shopify/flash-list'
import { MotiView } from 'moti'
import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  History,
  Info,
  ListChecks,
  Lock,
  Pencil,
  Plus,
  ScanBarcode,
  Share2,
  Trash2,
  Utensils,
} from 'lucide-react-native'
import {
  AuraHero,
  DayVariantWeekStrip,
  FoodRow,
  MacroChipRow,
  NutritionCard,
  NutritionHeader,
  NutritionMotionButton,
  NutritionSkeleton,
  NutritionStatePanel,
  PrescribedPortionChips,
  StrategyBadge,
  SyncOfflineState,
  WeekDayNav,
  CelebrationOverlay,
  type CelebrationInstance,
} from '../../../../components/nutrition-v2'
import { Sheet as ActionSheet } from '../../../../components/Sheet'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ALUMNO_TABBAR_CLEARANCE } from '../../../../components/alumno/AlumnoMobileChrome'
import { useAlumnoScrollHandler } from '../../../../lib/alumno-chrome-scroll'
import { NutritionDomainOff } from '../../../../components/nutrition-v2'
import { SubstitutionSheet } from '../../../../components/nutrition-v2/SubstitutionSheet'
import { SwipeToExchange } from '../../../../components/nutrition-v2/SwipeToExchange'
import {
  CoachNoteBand,
  PastDaySummary,
  LegacyHistoryDetail,
  PortionDayCoverageRow,
  PortionEquivalencesSheet,
  PortionSlotSection,
  PortionSnackbar,
  ReadOnlyDayBanner,
  type PortionSnackbarState,
  coverageViewFor,
  useNutritionWeekHistory,
  usePortionMarks,
} from '../../../../components/alumno/nutrition-v2'
import type {
  PendingPortionMark,
  PendingPortionVoid,
  PortionCoverageView,
} from '../../../../lib/nutrition-v2-portions'
import {
  NUTRITION_MOTION,
  type BulkMarkSlotState,
  type NutritionSlotExchangeTargetRead,
  NutritionHistoryPageReadModelSchema,
  NutritionPlanReadModelSchema,
  NutritionTodayReadModelSchema,
  buildNutritionDayShareText,
  buildNutritionWeek,
  bulkMarkCtaLabel,
  bulkMarkSlotState,
  consumedPrescriptionItemIds,
  countEnergyDaysEvaluable,
  countEnergyDaysInRange,
  energyGoalReached,
  energyTrendDirection,
  firstNameFromFullName,
  formatNutritionAmount,
  formatNutritionCalories,
  formatNutritionTodayVariantBadge,
  computeSubstitutionEquivalence,
  nutritionWeekStartIso,
  resolveNutritionDayVariantForDate,
  substituteFromOption,
  substitutionAttemptFromToday,
  swipeApplicableOptions,
  swipeOptionAt,
  SubstitutionOptionsReadModelSchema,
  type NutritionFoodRowModel,
  type SubstitutionAnyOption,
  type SubstitutionEquivalence,
  type SubstitutionOptionsItem,
  type NutritionHistoryDay,
  type NutritionHistoryPageReadModel,
  type NutritionIntakeReadItem,
  type NutritionMealSlotRead,
  type NutritionPlanReadModel,
  type NutritionTodayReadModel,
  type NutritionWeekCell,
  type NutritionWeekTargetsLike,
  type NutritionWeekVariantLike,
} from '@eva/nutrition-v2'
import { supabase } from '../../../../lib/supabase'
import { humanizeStudentWriteError } from '../../../../lib/student-access-copy'
import { formatNutritionShortDate } from '../../../../lib/date-utils'
import { foodMediaThumbnailUrl } from '../../../../lib/nutrition-v2-food-media'
import { describeItemGuidance } from '../../../../lib/nutrition-v2-plan'
import { useEntitlements } from '../../../../lib/entitlements'
import { getNutritionHistoryV2, getNutritionPlanV2, getNutritionTodayV2 } from '../../../../lib/nutrition-v2.api'
import {
  readNutritionV2Cache,
  writeNutritionV2Cache,
} from '../../../../lib/nutrition-v2-cache'
import {
  flushNutritionV2MutationQueue,
  getNutritionV2QueueStatus,
  getNutritionV2QueuedMutations,
  removeNutritionV2QueuedMutation,
} from '../../../../lib/nutrition-v2-offline'
import {
  EMPTY_QUEUED_INTAKE_OVERLAY,
  buildAteAsPrescribedMutation,
  bulkAteSnackbarState,
  buildEditIntakeCorrection,
  buildQueuedIntakeOverlay,
  buildVoidIntakeRequest,
  computeIntakeTotals,
  optimisticIntakeRow,
  prescribedIntakeSnapshotMacros,
  prescribedIntakeTotals,
  prescribedIntentOperationId,
  type OptimisticNutritionFoodRowModel,
  type NutritionIntakeTotals,
  type QueuedIntakeOverlay,
} from '../../../../lib/nutrition-v2-intake'
import { NUTRITION_TZ, useLocalDay } from '../../../../lib/nutrition-v2-date'
import {
  getStableDeviceId,
  newNutritionV2OperationId,
  submitCorrectIntake,
  submitRecordIntake,
  submitSubstituteIntake,
  submitVoidIntake,
} from '../../../../lib/nutrition-v2-intake-runner'
import { useEvaMotion } from '../../../../lib/motion'
import { shadow } from '../../../../lib/shadows'
import {
  decideDayCloseCelebration,
  decideEnergyGoalCelebration,
  decideMealLoggedCelebration,
  isNutritionDayComplete,
  type CelebrationDecision,
} from '../../../../lib/nutrition-v2-celebrations'
import {
  claimDayCloseCelebration,
  claimEnergyGoalCelebration,
  claimMealLoggedCelebration,
} from '../../../../lib/nutrition-v2-celebrations.storage'
import { useTheme } from '../../../../context/ThemeContext'
import {
  canLoadMoreHistory,
  mergeHistoryPages,
  nextHistoryCursor,
} from '../../../../lib/nutrition-v2-history'

// La fecha del dia (y su TZ) viven en `nutrition-v2-date`: el dia local es un VALOR VIVO
// (`useLocalDay`), no un memo congelado al montar — cruzar medianoche con la app abierta ya no deja
// el "Hoy" y los `log_date` anclados a ayer (NUT-018).
const TZ = NUTRITION_TZ

type OptimisticOverlay = QueuedIntakeOverlay

type EntryCorrectionAction = {
  kind: 'edit' | 'void'
  entry: NutritionIntakeReadItem
}

const EMPTY_OVERLAY: OptimisticOverlay = EMPTY_QUEUED_INTAKE_OVERLAY
// Constantes de referencia ESTABLE para props de cards memoizadas (hallazgo M3):
// `?? []` inline crearía un array nuevo por render y rompería React.memo.
const EMPTY_PORTION_MARKS: PendingPortionMark[] = []
const EMPTY_PORTION_VOIDS: PendingPortionVoid[] = []
// Idem para la semana: sin plan cargado, `?? []` inline recompondría las 7 celdas en cada render.
const EMPTY_DAY_VARIANTS: PlanVariant[] = []

/**
 * Tab "Hoy". Con la semana Lu-Do (SPEC nutrition-week-view) esta pantalla muestra UN día:
 *  - `selectedDay === null` (o igual a hoy) ⇒ la experiencia de registro completa, INTACTA;
 *  - un día pasado ⇒ resumen de solo lectura con los resultados congelados del historial;
 *  - un día futuro ⇒ vista previa del plan proyectado, sin ningún control de registro.
 *
 * El día elegido vive en el contenedor (no acá) por dos razones: cambiar de tab remonta este
 * componente, y el tab Historial abre un día concreto en modo lectura.
 *
 * INVARIANTE DE DATOS: `load()` sigue pidiendo `view=today` SOLO con la fecha de hoy. Ese RPC es
 * `volatile` (materializa snapshots create-once) y revienta con fecha > hoy+1; los otros días se
 * pintan del plan ya descargado y del historial de la semana.
 */
function TodayTab({
  chrome,
  selectedDay,
  onSelectDay,
  focusSlotCode,
}: {
  /** Título + tabs del módulo: scrollean con el contenido (ver `NutritionChrome`). */
  chrome: ReactNode
  /** Fecha `YYYY-MM-DD` que se está mirando; `null` = hoy. */
  selectedDay: string | null
  onSelectDay: (isoDate: string | null) => void
  /** Franja a resaltar al entrar (deep-link desde la card de Nutrición del Home). */
  focusSlotCode?: string | null
}) {
  const router = useRouter()
  // 4A-01: bajo la cápsula de (tabs) el scroll reserva clearance en el
  // contentContainer (patrón del layout, ver (tabs)/_layout.tsx) y alimenta el
  // minimizado de la cápsula, igual que las demás tabs del alumno.
  const insets = useSafeAreaInsets()
  const onScrollChrome = useAlumnoScrollHandler()
  const entitlements = useEntitlements()
  const { theme } = useTheme()
  const [userId, setUserId] = useState<string | null>(null)
  const [clientName, setClientName] = useState<string | null>(null)
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [model, setModel] = useState<NutritionTodayReadModel | null>(null)
  // 4A-02: plan VIGENTE en vivo, misma señal doble que la web (page.tsx:147-151 resuelve
  // today + plan en paralelo): decide el empty-state sin plan (page.tsx:153-162) y el
  // banner de lag del registro del día (page.tsx:164-177). null = aún desconocido.
  const [livePlan, setLivePlan] = useState<NutritionPlanReadModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [offline, setOffline] = useState(false)
  const [pending, setPending] = useState(0)
  // 4A-02: banner inline de error de mutación (web TodayExperience.tsx:216-225), copy
  // humanizado con humanizeStudentWriteError — nunca el código técnico crudo.
  const [mutationError, setMutationError] = useState<string | null>(null)
  // 4A-02: pending por ítem del botón "Lo comí" (web busyId `eat:{item.id}`, TodayExperience.tsx:618).
  const [eatingId, setEatingId] = useState<string | null>(null)
  const [overlay, setOverlay] = useState<OptimisticOverlay>(EMPTY_OVERLAY)
  // Reemplazos autorizados por el coach (F-02), agrupados por prescriptionItemId. Se leen con UN
  // select RLS-scoped a la version publicada del Today (fuera del hot-path del read-model) y se
  // muestran bajo cada item prescrito. Sin plan/version o sin reemplazos => mapa vacío.
  const [substitutionsByItemId, setSubstitutionsByItemId] = useState<
    ReadonlyMap<string, SubstitutionOptionsItem>
  >(() => new Map())
  /** Opción en vuelo (T2.4): apaga solo esa mientras la escritura viaja. */
  const [substitutingId, setSubstitutingId] = useState<string | null>(null)
  /** T2.5: item cuyo sheet de intercambio está abierto. */
  const [exchange, setExchange] = useState<{
    itemEntry: SubstitutionOptionsItem
    consumedFoodId: string | null
  } | null>(null)
  /**
   * Cuántos swipes lleva cada item, para que el siguiente ofrezca la siguiente opción. Ref y no
   * estado: cambiarlo no tiene que repintar la lista, y el ciclo es efímero por definición.
   */
  const swipeCycleRef = useRef<Record<string, number>>({})
  const [entryAction, setEntryAction] = useState<EntryCorrectionAction | null>(null)
  const [entryActionPending, setEntryActionPending] = useState(false)
  const [entryActionError, setEntryActionError] = useState<string | null>(null)
  const [celebration, setCelebration] = useState<CelebrationInstance | null>(null)
  // Bulk-mark de franja ("Comí toda esta comida"): franja en curso + snackbar propio (reusa el
  // componente PortionSnackbar) para el "Deshacer" transitorio, sin pisar el snackbar de porciones.
  const [bulkBusySlot, setBulkBusySlot] = useState<string | null>(null)
  const [bulkSnackbar, setBulkSnackbar] = useState<PortionSnackbarState | null>(null)
  const bulkSnackbarNonce = useRef(0)
  const bulkSnackbarTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Porciones: sheet de equivalencias abierto + puente hacia la reconciliación del
  // delta optimista (el hook se declara DESPUÉS de `load`, así que va por ref).
  const [equivOpen, setEquivOpen] = useState<{ slotCode: string; groupCode: string } | null>(null)
  const portionsReconcile = useRef<(fetchStartedAt: number) => void>(() => {})
  const celebrationNonce = useRef(0)
  const fireCelebration = useCallback((decision: CelebrationDecision) => {
    celebrationNonce.current += 1
    setCelebration({ ...decision, nonce: celebrationNonce.current })
  }, [])
  // Día local VIVO (NUT-018): se reevalúa al cruzar medianoche y cuando la pantalla lo revalida
  // (foco / vuelta del background). `load` depende de `date`, así que el cambio reencadena el fetch.
  const [date, recheckDate] = useLocalDay(TZ)
  const enabled = entitlements.ready

  // ── Semana Lu-Do (SPEC nutrition-week-view) ─────────────────────────────────
  // `date` es HOY y sigue siendo el único día que se lee con `view=today` y el único con
  // escritura; `viewDate` es el día que el alumno está MIRANDO.
  const viewDate = selectedDay ?? date
  const isViewingToday = viewDate === date
  // La semana se ancla al día mirado (no a hoy): el tab Historial puede abrir un día de hace
  // tres semanas y su tira tiene que ser la de ESA semana.
  const weekStartIso = useMemo(() => nutritionWeekStartIso(viewDate), [viewDate])
  const weekHistory = useNutritionWeekHistory({ userId, weekStartIso, enabled })
  const weekVariants = livePlan?.dayVariants ?? EMPTY_DAY_VARIANTS
  // Cero fetch por celda: la semana se compone del plan YA descargado (las 7 variantes viajan en
  // el mismo `Promise.all` del Hoy) más UNA página del historial.
  const weekCells = useMemo(
    () =>
      buildNutritionWeek({
        variants: weekVariants,
        history: weekHistory.days,
        weekStartIso,
        todayIso: date,
      }),
    [date, weekHistory.days, weekStartIso, weekVariants],
  )
  // Racha honesta semanal (T2.7 F2, espejo web page.tsx): dias CERRADOS de la semana en curso
  // dentro del rango de energia. Hoy no cuenta (a media mañana "fuera de rango" seria mentira);
  // sin dias evaluables no hay chip. Solo aplica mirando HOY (el hero no se pinta en otros dias).
  const weekInRangeCount = useMemo(() => {
    if (!isViewingToday || !weekHistory.ready) return null
    const closed = weekHistory.days.filter(
      (day) => nutritionWeekStartIso(day.localDate) === weekStartIso && day.localDate < date,
    )
    if (countEnergyDaysEvaluable(closed) === 0) return null
    return countEnergyDaysInRange(closed)
  }, [date, isViewingToday, weekHistory.days, weekHistory.ready, weekStartIso])
  const selectedCell = useMemo(
    () => weekCells.find((cell) => cell.isoDate === viewDate) ?? null,
    [viewDate, weekCells],
  )
  const onSelectWeekDay = useCallback(
    (isoDate: string) => {
      void Haptics.selectionAsync()
      // Hoy se guarda como `null` a propósito: cruzar la medianoche con la app abierta no debe
      // dejar la vista anclada a ayer (misma regla viva que `useLocalDay`, NUT-018).
      onSelectDay(isoDate === date ? null : isoDate)
    },
    [date, onSelectDay],
  )

  const mountedRef = useRef(true)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      controllerRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(async ({ data }) => {
      const uid = data.session?.user.id ?? null
      if (active) setUserId(uid)
      if (uid) {
        // Nombre para el saludo del héroe (RLS limita a la fila propia). Sin fila/nombre => saludo sin nombre.
        const { data: row } = await supabase.from('clients').select('full_name').eq('id', uid).maybeSingle()
        if (active) setClientName((row?.full_name as string | null) ?? null)
      }
    })
    void getStableDeviceId().then((id) => {
      if (active) setDeviceId(id)
    })
    return () => {
      active = false
    }
  }, [])

  const load = useCallback(async (force = false) => {
    if (!userId || !enabled) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller

    if (!force) {
      const [cached, cachedPlan] = await Promise.all([
        readNutritionV2Cache({
          userId,
          clientId: userId,
          kind: 'today',
          scopeKey: date,
          schema: NutritionTodayReadModelSchema,
          allowStale: true,
        }),
        readNutritionV2Cache({
          userId,
          clientId: userId,
          kind: 'plan',
          scopeKey: date,
          schema: NutritionPlanReadModelSchema,
          allowStale: true,
        }),
      ])
      if (mountedRef.current && cached) {
        setModel(cached.payload)
        // `cached.stale` es solo TTL vencido, NO falta de conectividad: derivar
        // `offline` de ahí prendía el banner "Sin conexión" un instante en cada
        // entrada con red OK. El estado offline lo fija el catch del fetch.
        setLoading(false)
      }
      if (mountedRef.current && cachedPlan) setLivePlan(cachedPlan.payload)
    }

    try {
      const fetchStartedAt = Date.now()
      // 4A-02: today + plan vigente EN PARALELO como la web (page.tsx:147-151). Si el plan
      // falla (red), se conserva el último conocido — el Hoy no se cae por esa señal.
      const [fresh, freshPlan] = await Promise.all([
        getNutritionTodayV2({ date, signal: controller.signal }),
        getNutritionPlanV2({ date, signal: controller.signal }).catch(() => null),
      ])
      if (!mountedRef.current) return
      setModel(fresh)
      if (freshPlan) setLivePlan(freshPlan)
      setOffline(false)
      setOverlay(EMPTY_OVERLAY)
      portionsReconcile.current(fetchStartedAt)
      await writeNutritionV2Cache({ userId, clientId: userId, kind: 'today', scopeKey: date, payload: fresh })
      if (freshPlan) {
        await writeNutritionV2Cache({ userId, clientId: userId, kind: 'plan', scopeKey: date, payload: freshPlan })
      }
      if (!mountedRef.current) return
      const flushed = await flushNutritionV2MutationQueue(userId)
      if (mountedRef.current) setPending(flushed.pending)
      if (flushed.terminal > 0 && mountedRef.current) {
        setMutationError(
          flushed.terminal === 1
            ? 'Una acción pendiente no pudo sincronizarse. Revisa tus registros e intenta de nuevo.'
            : `${flushed.terminal} acciones pendientes no pudieron sincronizarse. Revisa tus registros e intenta de nuevo.`,
        )
      }
      if (flushed.sent > 0 && mountedRef.current) {
        // Server truth changed after replay: refetch once so consumed reflects flushed writes.
        const replayStartedAt = Date.now()
        const replayed = await getNutritionTodayV2({ date }).catch(() => null)
        if (replayed && mountedRef.current) {
          setModel(replayed)
          setOverlay(EMPTY_OVERLAY)
          portionsReconcile.current(replayStartedAt)
          await writeNutritionV2Cache({ userId, clientId: userId, kind: 'today', scopeKey: date, payload: replayed })
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      if (mountedRef.current) setOffline(true)
      const queue = await getNutritionV2QueueStatus(userId)
      if (mountedRef.current) setPending(queue.pending)
    } finally {
      // Solo el load VIGENTE manda sobre el estado de carga. Entrar al tab dispara dos: el del
      // montaje y el del foco, y el segundo ABORTA al primero — pero el `finally` del abortado
      // corria igual y apagaba `loading` con el fetch ganador todavia en vuelo. Ese render
      // intermedio (`loading` false + `model` null) es exactamente la condicion del panel
      // "No pudimos cargar Nutricion", que aparecia en la primera entrada en frio (sin cache
      // que rellene `model`) y se arreglaba solo al responder el fetch bueno.
      if (mountedRef.current && controllerRef.current === controller) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, [date, enabled, userId])

  useEffect(() => {
    if (!userId || !enabled) return
    void load()
  }, [enabled, load, userId])

  useFocusEffect(
    useCallback(() => {
      // Revalidar el día ANTES de refrescar: si cambió, `load` se reencadena solo con la fecha nueva.
      recheckDate()
      if (userId && enabled) void load(true)
    }, [enabled, load, recheckDate, userId]),
  )

  useEffect(() => {
    if (!userId || !enabled) return
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return
      recheckDate()
      void load(true)
    })
    return () => subscription.remove()
  }, [enabled, load, recheckDate, userId])

  // Una edición/retiro/alta aceptada offline debe sobrevivir remount, focus y
  // reinicio. La cola es la única fuente persistida; no duplicamos estado local.
  useEffect(() => {
    if (!userId || !enabled) return
    let active = true
    void getNutritionV2QueuedMutations(userId)
      .then((queued) => {
        if (active && mountedRef.current) setOverlay(buildQueuedIntakeOverlay(queued, date))
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [date, enabled, model, pending, userId])

  /**
   * Reemplazos autorizados del día (T2.4). Antes era un select directo a
   * `nutrition_item_substitutions_v2`, y por eso la pill mostraba los `snapshot_*` congelados: con
   * `quantity` NULL — el 100% de las filas vivas — esos macros son los de UNA PORCIÓN DEL
   * SUSTITUTO, sin relación con lo prescrito ("Lomo liso 120 g / 240 kcal" ofrecía "Posta / 17 kcal").
   *
   * Ahora va por `get_nutrition_substitution_options_v2`, que trae los macros VIGENTES (catálogo +
   * override del coach) y resuelve la versión desde el snapshot del día, no desde la última
   * publicada. Best-effort igual que antes: cualquier fallo deja el mapa vacío y la línea no se
   * pinta — jamás debe tumbar el Today.
   */
  useEffect(() => {
    if (!userId || !enabled) {
      setSubstitutionsByItemId((prev) => (prev.size === 0 ? prev : new Map()))
      return
    }
    let active = true
    void (async () => {
      const { data, error } = await supabase.rpc('get_nutrition_substitution_options_v2', {
        p_client_id: userId,
        p_local_date: date,
      })
      if (!active || !mountedRef.current) return
      const parsed = error ? null : SubstitutionOptionsReadModelSchema.safeParse(data)
      if (!parsed?.success) {
        setSubstitutionsByItemId((prev) => (prev.size === 0 ? prev : new Map()))
        return
      }
      const grouped = new Map<string, SubstitutionOptionsItem>()
      for (const entry of parsed.data.items) {
        // T2.5: ya no alcanza con tener reemplazos del coach (15 items en toda la base). Un item
        // con grupo de intercambio tambien ofrece equivalentes, y son 832.
        if (entry.options.length > 0 || entry.groupTotal > 0) {
          grouped.set(entry.prescriptionItemId, entry)
        }
      }
      setSubstitutionsByItemId(grouped)
    })()
    return () => {
      active = false
    }
  }, [date, enabled, userId])

  const refreshPending = useCallback(async () => {
    if (!userId) return
    const q = await getNutritionV2QueueStatus(userId)
    if (mountedRef.current) setPending(q.pending)
  }, [userId])

  /** Reconstruye el overlay desde la cola (única fuente persistida) tras cancelar/encolar algo. */
  const syncOverlayFromQueue = useCallback(async () => {
    if (!userId) return
    const queued = await getNutritionV2QueuedMutations(userId).catch(() => null)
    if (queued && mountedRef.current) setOverlay(buildQueuedIntakeOverlay(queued, date))
  }, [date, userId])

  /**
   * Retirar una fila que todavía está EN COLA. No hay entry server-side que anular: se cancela la
   * mutación por su idempotency key (mismo modelo que el deshacer de porciones, sin rastro de
   * auditoría). Si un flush la envió primero el remove devuelve false y el registro ya existe: se
   * refresca para que aparezca como fila real, con su lápiz y su papelera normales.
   */
  const onCancelQueued = useCallback(
    async (queuedKey: string) => {
      if (!userId) return
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      const removed = await removeNutritionV2QueuedMutation(userId, queuedKey)
      if (!mountedRef.current) return
      if (!removed) {
        setMutationError('Ese registro ya se sincronizó. Lo actualicé para que puedas retirarlo.')
        void load(true)
        return
      }
      await refreshPending()
      await syncOverlayFromQueue()
    },
    [load, refreshPending, syncOverlayFromQueue, userId],
  )

  // ── Porciones (SPEC nutrition-portions UX-b/UX-c). Callbacks ESTABLES para no
  // romper el React.memo de las cards por franja (hallazgo M3). ──
  const requestReload = useCallback(() => {
    void load(true)
  }, [load])
  const onQueuedChange = useCallback(() => {
    void refreshPending()
  }, [refreshPending])
  const portions = usePortionMarks({
    userId,
    deviceId,
    model,
    date,
    timezone: TZ,
    requestReload,
    onQueuedChange,
  })
  useEffect(() => {
    portionsReconcile.current = portions.reconcile
  }, [portions.reconcile])
  const onOpenEquivalences = useCallback((slotCode: string, groupCode: string) => {
    setEquivOpen({ slotCode, groupCode })
  }, [])
  const hiddenSet = useMemo(() => new Set(overlay.hiddenIds), [overlay.hiddenIds])
  // Items prescritos con un registro AÚN encolado (offline). La cola es autoritativa y persistida:
  // sin esto el botón "Lo comí" volvía a habilitarse apenas la mutación se encolaba y un segundo
  // toque generaba una segunda entrada (NUT-003).
  const queuedItemIds = useMemo(
    () => new Set(overlay.queuedPrescriptionItemIds),
    [overlay.queuedPrescriptionItemIds],
  )
  // Set de items prescritos ya consumidos (misma verdad que la web): alimenta el medidor de
  // progreso por franja y el estado del control de registro en bloque. Une el snapshot del servidor
  // (`model`, estable tras cada `load(true)`) con lo que sigue en la cola local.
  const consumedIds = useMemo(() => {
    const server = model ? consumedPrescriptionItemIds(model) : new Set<string>()
    if (queuedItemIds.size === 0) return server
    const merged = new Set(server)
    queuedItemIds.forEach((id) => merged.add(id))
    return merged
  }, [model, queuedItemIds])

  const addRow = useCallback((slotCode: string | null, row: OptimisticNutritionFoodRowModel) => {
    setOverlay((prev) =>
      slotCode
        ? { ...prev, addedBySlot: { ...prev.addedBySlot, [slotCode]: [...(prev.addedBySlot[slotCode] ?? []), row] } }
        : { ...prev, addedUnassigned: [...prev.addedUnassigned, row] },
    )
  }, [])

  const removeRow = useCallback((slotCode: string | null, id: string) => {
    setOverlay((prev) =>
      slotCode
        ? { ...prev, addedBySlot: { ...prev.addedBySlot, [slotCode]: (prev.addedBySlot[slotCode] ?? []).filter((r) => r.id !== id) } }
        : { ...prev, addedUnassigned: prev.addedUnassigned.filter((r) => r.id !== id) },
    )
  }, [])

  /**
   * Marca la fila optimista como encolada. Además de pintarla `offline`, le adosa la
   * `idempotencyKey` (habilita el "Retirar" de una fila en cola) y, si vino de un item prescrito,
   * lo registra como encolado para apagar su botón "Lo comí" de forma SÍNCRONA — sin depender del
   * efecto async que relee la cola (NUT-003 capa 2).
   */
  const markRowOffline = useCallback(
    (slotCode: string | null, id: string, queuedKey: string, prescriptionItemId?: string | null) => {
      const patch = (rows: OptimisticNutritionFoodRowModel[]) =>
        rows.map((r) => (r.id === id ? { ...r, status: 'offline' as const, queuedKey } : r))
      setOverlay((prev) => {
        const base = slotCode
          ? { ...prev, addedBySlot: { ...prev.addedBySlot, [slotCode]: patch(prev.addedBySlot[slotCode] ?? []) } }
          : { ...prev, addedUnassigned: patch(prev.addedUnassigned) }
        if (!prescriptionItemId || base.queuedKeyByPrescriptionItemId[prescriptionItemId]) return base
        return {
          ...base,
          queuedPrescriptionItemIds: [...base.queuedPrescriptionItemIds, prescriptionItemId],
          queuedKeyByPrescriptionItemId: {
            ...base.queuedKeyByPrescriptionItemId,
            [prescriptionItemId]: queuedKey,
          },
        }
      })
    },
    [],
  )

  const setHidden = useCallback((id: string, hidden: boolean) => {
    setOverlay((prev) => ({
      ...prev,
      hiddenIds: hidden ? [...prev.hiddenIds, id] : prev.hiddenIds.filter((x) => x !== id),
    }))
  }, [])

  const onAtePrescribed = useCallback(
    async (slot: NutritionMealSlotRead, item: NutritionMealSlotRead['prescriptionItems'][number]) => {
      if (!userId || !deviceId) return
      // Web limpia el error al iniciar cada mutación (runMutation, TodayExperience.tsx:109).
      setMutationError(null)
      setEatingId(item.id)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      // Intención lógica, no gesto: (día + item prescrito) ⇒ MISMA idempotency key. Dos toques
      // colapsan en la cola (dedup por userId+key) y en el RPC (dedup por client_id+key) — NUT-003.
      const operationId = prescribedIntentOperationId({ localDate: date, prescriptionItemId: item.id })
      const tempId = `opt-${operationId}`
      // Totales optimistas con el MISMO snapshot normalizado que viaja al servidor (NUT-002).
      const totals: NutritionIntakeTotals = prescribedIntakeTotals(item)
      addRow(slot.code, optimisticIntakeRow({
        id: tempId,
        name: item.name ?? 'Alimento prescrito',
        brand: item.brand,
        quantity: item.quantity,
        unit: item.unit,
        status: 'pending',
        totals,
      }))
      let payload
      try {
        payload = buildAteAsPrescribedMutation({
          clientId: userId,
          deviceId,
          operationId,
          localDate: date,
          occurredAt: new Date().toISOString(),
          timezone: TZ,
          slotCode: slot.code,
          planVersionId: model?.plan?.versionId ?? null,
          daySnapshotId: model?.snapshotId ?? null,
          item,
        })
      } catch {
        removeRow(slot.code, tempId)
        setEatingId((cur) => (cur === item.id ? null : cur))
        return
      }
      const outcome = await submitRecordIntake(userId, payload)
      if (!mountedRef.current) return
      if (outcome.status === 'recorded') {
        void (async () => {
          const claimed = await claimMealLoggedCelebration(userId, date)
          const decision = decideMealLoggedCelebration(!claimed)
          if (decision && mountedRef.current) fireCelebration(decision)
        })()
        // El botón sigue pending HASTA que la verdad del servidor llegue: entre `setEatingId(null)`
        // y el refetch había una ventana de cientos de ms con el botón habilitado y `consumedIds`
        // todavía sin el item — un doble toque nervioso con red normal duplicaba igual (NUT-003).
        await load(true)
        if (!mountedRef.current) return
        setEatingId((cur) => (cur === item.id ? null : cur))
      } else if (outcome.status === 'queued') {
        markRowOffline(slot.code, tempId, payload.idempotencyKey, item.id)
        setEatingId((cur) => (cur === item.id ? null : cur))
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        await refreshPending()
      } else {
        removeRow(slot.code, tempId)
        setEatingId((cur) => (cur === item.id ? null : cur))
        // Banner inline con copy humanizado (web TodayExperience.tsx:119,216-225).
        setMutationError(humanizeStudentWriteError(outcome.error.message, 'No se pudo completar la acción.'))
      }
    },
    [addRow, date, deviceId, fireCelebration, load, markRowOffline, model, refreshPending, removeRow, userId],
  )

  const onVoidEntry = useCallback(
    async (entry: NutritionIntakeReadItem, reason: string) => {
      if (!userId || !deviceId) {
        setEntryActionError('No pudimos preparar la corrección. Recarga e intenta de nuevo.')
        return
      }
      setEntryActionPending(true)
      setEntryActionError(null)
      setMutationError(null)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      try {
        // NUT-010 (opción A): retiro TERMINAL. Antes esto mandaba una corrección de contribución
        // cero cuyo reemplazo quedaba ACTIVO — el item del plan seguía "consumido" y la cobertura
        // derivada no bajaba. Ahora `void_nutrition_intake_v2` marca la fila `voided` y los read
        // models (que filtran `active`) la dejan de ver.
        const payload = buildVoidIntakeRequest({
          clientId: userId,
          deviceId,
          operationId: newNutritionV2OperationId(),
          entry,
          reason,
        })
        setHidden(entry.id, true)
        const outcome = await submitVoidIntake(userId, payload)
        if (!mountedRef.current) return
        if (outcome.status === 'recorded') {
          setEntryAction(null)
          setEntryActionPending(false)
          void load(true)
        } else if (outcome.status === 'queued') {
          setEntryAction(null)
          setEntryActionPending(false)
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
          await refreshPending()
        } else {
          setHidden(entry.id, false)
          setEntryActionPending(false)
          setEntryActionError(humanizeStudentWriteError(outcome.error.message, 'No se pudo retirar el registro.'))
        }
      } catch (error) {
        setHidden(entry.id, false)
        if (!mountedRef.current) return
        setEntryActionPending(false)
        setEntryActionError(
          humanizeStudentWriteError(error instanceof Error ? error.message : '', 'No se pudo retirar el registro.'),
        )
      }
    },
    [deviceId, load, refreshPending, setHidden, userId],
  )

  // ── Snackbar del bulk-mark (mismo componente que porciones, estado propio) ──
  // F-01: los dos productores comparten UN SOLO host, así que emitir uno DESCARTA al
  // otro — el snackbar nuevo reemplaza al anterior en vez de dibujarse exactamente
  // encima (antes se montaban dos overlays en las mismas coordenadas).
  const portionsSnackbar = portions.snackbar
  const dismissPortionsSnackbar = portions.dismissSnackbar

  const dismissBulkSnackbar = useCallback(() => {
    if (bulkSnackbarTimer.current) clearTimeout(bulkSnackbarTimer.current)
    setBulkSnackbar(null)
  }, [])

  const showBulkSnackbar = useCallback((next: Omit<PortionSnackbarState, 'nonce'>) => {
    dismissPortionsSnackbar()
    bulkSnackbarNonce.current += 1
    setBulkSnackbar({ ...next, nonce: bulkSnackbarNonce.current })
    if (bulkSnackbarTimer.current) clearTimeout(bulkSnackbarTimer.current)
    bulkSnackbarTimer.current = setTimeout(() => {
      if (mountedRef.current) setBulkSnackbar(null)
    }, 6000)
  }, [dismissPortionsSnackbar])

  // Dirección inversa: el snackbar de porciones lo emite el hook (no hay puente hacia
  // acá), así que el descarte del bulk se dispara al ver el estado nuevo.
  useEffect(() => {
    if (portionsSnackbar) dismissBulkSnackbar()
  }, [dismissBulkSnackbar, portionsSnackbar])

  // Estado que efectivamente se dibuja. Porciones gana el desempate del frame en que
  // ambos siguen vivos: el bulk ya quedó descartado por el efecto de arriba.
  const activeSnackbar = portionsSnackbar ?? bulkSnackbar
  // Cada productor lleva su propio contador de nonce, así que el prefijo evita que dos
  // snackbars distintos compartan key y se salten la animación de entrada.
  const activeSnackbarKey = portionsSnackbar
    ? `portions-${portionsSnackbar.nonce}`
    : `bulk-${bulkSnackbar?.nonce ?? 0}`

  useEffect(
    () => () => {
      if (bulkSnackbarTimer.current) clearTimeout(bulkSnackbarTimer.current)
    },
    [],
  )

  // Deshacer una tanda: RETIRA (estado terminal `voided`) cada registro creado por el bulk, vía el
  // MISMO runner de void del "Retirar" individual. Recibe entries sintetizados con el id REAL
  // devuelto por el servidor, así no depende del refetch para poder deshacer.
  //
  // Lo ENCOLADO no se anula con un void (todavía no existe server-side): se CANCELA en la cola por
  // su idempotency key, exactamente como ya hace el deshacer de porciones
  // (usePortionMarks → cancelQueuedPortionMark). Sin esto el undo dejaba vivas las mutaciones
  // offline y minutos después reaparecían como registros (NUT-019).
  const onBulkUndo = useCallback(
    async (slotName: string, entries: NutritionIntakeReadItem[], queuedKeys: string[]) => {
      if (!userId || !deviceId || (entries.length === 0 && queuedKeys.length === 0)) return
      dismissBulkSnackbar()
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      let undone = 0
      let queued = 0
      for (const entry of entries) {
        setHidden(entry.id, true)
        const payload = buildVoidIntakeRequest({
          clientId: userId,
          deviceId,
          operationId: newNutritionV2OperationId(),
          entry,
          reason: 'Deshacer registro de la comida',
        })
        const outcome = await submitVoidIntake(userId, payload)
        if (!mountedRef.current) return
        if (outcome.status === 'recorded') undone += 1
        else if (outcome.status === 'queued') queued += 1
        else {
          setHidden(entry.id, false)
        }
      }
      // Carrera real: un flush pudo enviar la mutación entre el tap de "Deshacer" y el remove. En
      // ese caso `removeNutritionV2QueuedMutation` devuelve false y el intake YA existe server-side.
      let cancelled = 0
      let raced = 0
      for (const key of queuedKeys) {
        const removed = await removeNutritionV2QueuedMutation(userId, key)
        if (!mountedRef.current) return
        if (removed) cancelled += 1
        else raced += 1
      }
      if (!mountedRef.current) return
      if (undone > 0 || raced > 0) void load(true)
      if (queued > 0 || cancelled > 0) {
        await refreshPending()
        await syncOverlayFromQueue()
      }
      if (!mountedRef.current) return
      if (undone === 0 && queued === 0 && cancelled === 0) {
        showBulkSnackbar({
          message: 'No se pudo deshacer. Retira los registros uno por uno en la comida.',
          tone: 'danger',
        })
      } else {
        showBulkSnackbar({
          message: `Deshice el registro de ${slotName}.`,
          detail:
            raced > 0
              ? raced === 1
                ? '1 alcanzó a sincronizarse: retíralo desde "Consumido hoy".'
                : `${raced} alcanzaron a sincronizarse: retíralos desde "Consumido hoy".`
              : null,
        })
      }
    },
    [
      deviceId,
      dismissBulkSnackbar,
      load,
      refreshPending,
      setHidden,
      showBulkSnackbar,
      syncOverlayFromQueue,
      userId,
    ],
  )

  // Registro en bloque de una franja ("Comí toda esta comida"). Por cada item ELEGIBLE (el helper
  // puro decide cuáles = requeridos aún no consumidos) arma la MISMA mutation que el "Comí"
  // individual (`buildAteAsPrescribedMutation`, key propia por item) y la envía por
  // `submitRecordIntake`, heredando online + cola offline + idempotencia + optimismo sin superficie
  // nueva. UNA sola celebración por tanda; el "Deshacer" anula solo los registros recién creados.
  const onBulkAte = useCallback(
    async (slot: NutritionMealSlotRead, eligible: NutritionMealSlotRead['prescriptionItems'][number][]) => {
      if (!userId || !deviceId || eligible.length === 0) return
      setMutationError(null)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      setBulkBusySlot(slot.code)

      let recorded = 0
      let queued = 0
      const undoEntries: NutritionIntakeReadItem[] = []
      const queuedKeys: string[] = []
      const nowIso = new Date().toISOString()

      for (const item of eligible) {
        // Misma clave determinista que el "Lo comí" individual: registrar la franja completa y
        // luego marcar un item suelto del mismo día colapsa en UNA escritura (NUT-003).
        const operationId = prescribedIntentOperationId({ localDate: date, prescriptionItemId: item.id })
        const tempId = `opt-${operationId}`
        const totals: NutritionIntakeTotals = prescribedIntakeTotals(item)
        addRow(slot.code, optimisticIntakeRow({
          id: tempId,
          name: item.name ?? 'Alimento prescrito',
          brand: item.brand,
          quantity: item.quantity,
          unit: item.unit,
          status: 'pending',
          totals,
        }))
        let payload
        try {
          payload = buildAteAsPrescribedMutation({
            clientId: userId,
            deviceId,
            operationId,
            localDate: date,
            occurredAt: nowIso,
            timezone: TZ,
            slotCode: slot.code,
            planVersionId: model?.plan?.versionId ?? null,
            daySnapshotId: model?.snapshotId ?? null,
            item,
          })
        } catch {
          removeRow(slot.code, tempId)
          continue
        }
        const outcome = await submitRecordIntake(userId, payload)
        if (!mountedRef.current) return
        if (outcome.status === 'recorded') {
          recorded += 1
          undoEntries.push(synthPrescribedIntakeEntry(item, slot.code, outcome.id, nowIso))
        } else if (outcome.status === 'queued') {
          queued += 1
          queuedKeys.push(payload.idempotencyKey)
          markRowOffline(slot.code, tempId, payload.idempotencyKey, item.id)
        } else {
          removeRow(slot.code, tempId)
        }
      }

      if (!mountedRef.current) return
      // Celebración UNA sola vez por tanda, solo si algo quedó realmente registrado (no encolado).
      if (recorded > 0) {
        void (async () => {
          const claimed = await claimMealLoggedCelebration(userId, date)
          const decision = decideMealLoggedCelebration(!claimed)
          if (decision && mountedRef.current) fireCelebration(decision)
        })()
        await load(true)
      }
      if (queued > 0) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        await refreshPending()
      }
      setBulkBusySlot(null)

      // Feedback + "Deshacer" transitorio. El copy y la disponibilidad del undo salen de un reducer
      // PURO (fijado por tests): el detalle nombra siempre lo que quedó en cola y el "Deshacer"
      // cubre registrado + encolado, incluido el caso "todo offline" (NUT-019).
      const snack = bulkAteSnackbarState({
        slotName: slot.name,
        eligible: eligible.length,
        recorded,
        queued,
      })
      const canUndo = snack.canUndo && (undoEntries.length > 0 || queuedKeys.length > 0)
      showBulkSnackbar({
        message: snack.message,
        detail: snack.detail,
        tone: snack.tone === 'danger' ? 'danger' : undefined,
        actionLabel: canUndo ? 'Deshacer' : null,
        onAction: canUndo ? () => void onBulkUndo(slot.name, undoEntries, queuedKeys) : null,
      })
    },
    [addRow, date, deviceId, fireCelebration, load, markRowOffline, model, onBulkUndo, refreshPending, removeRow, showBulkSnackbar, userId],
  )

  const onEditEntry = useCallback(
    async (entry: NutritionIntakeReadItem, quantity: number, reason: string) => {
      if (!userId || !deviceId) {
        setEntryActionError('No pudimos preparar la corrección. Recarga e intenta de nuevo.')
        return
      }
      setEntryActionPending(true)
      setEntryActionError(null)
      setMutationError(null)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      const operationId = newNutritionV2OperationId()
      const tempId = `opt-${operationId}`
      const totals = computeIntakeTotals(quantity, entry.unit, {
        calories: entry.snapshot.calories,
        proteinG: entry.snapshot.proteinG,
        carbsG: entry.snapshot.carbsG,
        fatsG: entry.snapshot.fatsG,
        fiberG: entry.snapshot.fiberG,
        servingSize: entry.snapshot.servingSize,
      })
      try {
        const payload = buildEditIntakeCorrection({
          clientId: userId,
          deviceId,
          operationId,
          localDate: date,
          timezone: TZ,
          entry,
          quantity,
          planVersionId: model?.plan?.versionId ?? null,
          daySnapshotId: model?.snapshotId ?? null,
          reason,
        })
        setHidden(entry.id, true)
        addRow(entry.mealSlot, optimisticIntakeRow({
          id: tempId,
          name: entry.snapshot.name,
          brand: entry.snapshot.brand,
          quantity,
          unit: entry.unit,
          status: 'pending',
          totals,
        }))
        const outcome = await submitCorrectIntake(userId, payload)
        if (!mountedRef.current) return
        if (outcome.status === 'recorded') {
          setEntryAction(null)
          setEntryActionPending(false)
          void load(true)
        } else if (outcome.status === 'queued') {
          // Una corrección encolada no bloquea ningún item prescrito: solo se marca la fila.
          markRowOffline(entry.mealSlot, tempId, payload.idempotencyKey)
          setEntryAction(null)
          setEntryActionPending(false)
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
          await refreshPending()
        } else {
          setHidden(entry.id, false)
          removeRow(entry.mealSlot, tempId)
          setEntryActionPending(false)
          setEntryActionError(humanizeStudentWriteError(outcome.error.message, 'No se pudo guardar la corrección.'))
        }
      } catch (error) {
        setHidden(entry.id, false)
        removeRow(entry.mealSlot, tempId)
        if (!mountedRef.current) return
        setEntryActionPending(false)
        setEntryActionError(
          humanizeStudentWriteError(error instanceof Error ? error.message : '', 'No se pudo guardar la corrección.'),
        )
      }
    },
    [addRow, date, deviceId, load, markRowOffline, model, refreshPending, removeRow, setHidden, userId],
  )

  const onRegister = useCallback(
    (slot?: NutritionMealSlotRead, query?: string) => {
      router.push({
        pathname: '/alumno/nutrition-v2/add-food-v2',
        params: {
          ...(slot ? { slot: slot.code, slotName: slot.name } : {}),
          // T1.6: busqueda precargada al llegar desde una pill de reemplazo autorizado.
          ...(query ? { q: query } : {}),
        },
      })
    },
    [router],
  )

  // QA device T1.2 (paridad web NUT-009): lo prescrito consumido tambien se corrige/retira
  // desde SU fila — antes RN solo ofrecia correccion en "Fuera del plan".
  const onCorrectPrescribed = useCallback((kind: 'edit' | 'void', entry: NutritionIntakeReadItem) => {
    setEntryActionError(null)
    setEntryAction({ kind, entry })
  }, [])

  /**
   * T2.4 (paridad web): un tap registra el reemplazo AUTORIZADO. Ya no pasa por el registro libre
   * ni pide `canRegisterFreely` — sustituir por algo que el coach autorizó no es registro libre.
   *
   * El cliente manda solo la intención; el alimento, la cantidad, la franja y los macros los
   * resuelve el servidor desde la fila autorizada (mismo servicio que la web). `attempt` sale del
   * read-model en pantalla: cuenta los registros de HOY de ese ítem en CUALQUIER estado, así
   * deshacer y volver a registrar genera una clave nueva en vez de chocar con el short-circuit.
   *
   * Los dos casos degradados de la equivalencia (cantidad implausible o sin datos) piden
   * confirmación explícita antes de escribir. El stepper completo llega con el sheet de T2.5.
   */
  const submitSubstitution = useCallback(
    async (
      itemEntry: SubstitutionOptionsItem,
      option: SubstitutionAnyOption,
      equivalence: SubstitutionEquivalence,
    ) => {
      if (!userId || !model) return
      // T2.5: la opción del grupo no tiene fila, así que viaja como `groupFoodId`. Los dos caminos
      // son excluyentes en el contrato y el servidor los valida por separado.
      const isGroupOption = option.substitutionId === null
      const key = option.substitutionId ?? `gf-${option.foodId}`
      setMutationError(null)
      setSubstitutingId(key)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      const outcome = await submitSubstituteIntake(
        userId,
        {
          clientId: userId,
          localDate: date,
          occurredAt: new Date().toISOString(),
          timezone: TZ,
          prescriptionItemId: itemEntry.prescriptionItemId,
          ...(isGroupOption
            ? { groupFoodId: option.foodId as string }
            : { substitutionId: option.substitutionId as string }),
          attempt: substitutionAttemptFromToday(model, itemEntry.prescriptionItemId),
          quantity: null,
        },
        // Reparo heredado de T2.4: con esto la fila se pinta con "En cola" al encolar sin red.
        // Son datos LOCALES para la pantalla; el payload sigue siendo solo la intención.
        {
          name: option.food?.name ?? option.customName ?? equivalence.snapshot.name,
          brand: option.food?.brand ?? null,
          quantity: equivalence.quantity,
          unit: equivalence.unit,
          mealSlot: itemEntry.mealSlotCode,
          totals: equivalence.totals,
        },
      )
      if (!mountedRef.current) return
      if (outcome.status === 'recorded') {
        setExchange(null)
        await load(true)
        if (!mountedRef.current) return
        setSubstitutingId(null)
      } else if (outcome.status === 'queued') {
        setSubstitutingId(null)
        setExchange(null)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        await refreshPending()
        await syncOverlayFromQueue()
      } else {
        setSubstitutingId(null)
        setMutationError(
          humanizeStudentWriteError(outcome.error.message, 'No se pudo registrar el reemplazo.'),
        )
      }
    },
    [date, load, model, refreshPending, syncOverlayFromQueue, userId],
  )

  const onOpenExchange = useCallback(
    (itemEntry: SubstitutionOptionsItem, consumedFoodId: string | null) => {
      setExchange({ itemEntry, consumedFoodId })
    },
    [],
  )

  /**
   * T2.5 F6: deslizar la fila. Aplica de un gesto el reemplazo del coach que toque en el ciclo; si
   * el item no tiene ninguno aplicable a ciegas, ABRE el sheet en vez de escribir — elegir entre
   * los cientos del grupo es una decisión que se toma mirando, no deslizando.
   */
  const onSwipeExchange = useCallback(
    (itemEntry: SubstitutionOptionsItem, consumedFoodId: string | null) => {
      const options = swipeApplicableOptions({ entry: itemEntry, consumedFoodId })
      const cycle = swipeCycleRef.current[itemEntry.prescriptionItemId] ?? 0
      const option = swipeOptionAt(options, cycle)
      if (!option) {
        setExchange({ itemEntry, consumedFoodId })
        return
      }
      // El swipe siguiente ofrece la opción siguiente: deslizar de nuevo es cambiar de opinión.
      swipeCycleRef.current[itemEntry.prescriptionItemId] = cycle + 1
      const equivalence = computeSubstitutionEquivalence({
        item: itemEntry.item,
        substitute: substituteFromOption(option),
      })
      void submitSubstitution(itemEntry, option, equivalence)
    },
    [submitSubstitution],
  )

  const onPickSubstitution = useCallback(
    (
      itemEntry: SubstitutionOptionsItem,
      option: SubstitutionAnyOption,
      equivalence: SubstitutionEquivalence,
    ) => {
      const name = option.food?.name ?? option.customName ?? option.frozen.name ?? 'el reemplazo'
      if (!equivalence.requiresConfirmation) {
        void submitSubstitution(itemEntry, option, equivalence)
        return
      }
      Alert.alert(
        'Confirma la cantidad',
        equivalence.kind === 'unavailable'
          ? `No pudimos calcular la equivalencia de ${name}. ¿Registrar ${equivalence.quantity} ${equivalence.unit}?`
          : `La equivalencia da ${equivalence.quantity} ${equivalence.unit} de ${name}. ¿La registramos?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: `Registrar ${equivalence.quantity} ${equivalence.unit}`,
            onPress: () => void submitSubstitution(itemEntry, option, equivalence),
          },
        ],
      )
    },
    [submitSubstitution],
  )

  // Compartir usa la MISMA vista efectiva que el render: verdad del servidor menos
  // registros ocultos por correcciones + filas optimistas en vuelo/cola. Así Aura,
  // "Consumido hoy" y el texto compartido no divergen mientras falta sincronizar.
  const shareSnapshot = useMemo(() => {
    if (!model) return null
    const hidden = new Set(overlay.hiddenIds)
    const serverEntries = [...model.mealSlots.flatMap((slot) => slot.intakeItems), ...model.unassignedIntake]
      .filter((entry) => entry.status === 'active' && !hidden.has(entry.id))
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    const optimisticRows = [...Object.values(overlay.addedBySlot).flat(), ...overlay.addedUnassigned]
    const consumed = {
      calories: model.consumed.calories,
      proteinG: model.consumed.proteinG,
      carbsG: model.consumed.carbsG,
      fatsG: model.consumed.fatsG,
    }
    const subtractHidden = (entries: NutritionIntakeReadItem[]) => {
      for (const entry of entries) {
        if (!hidden.has(entry.id)) continue
        consumed.calories -= entry.totals.calories
        consumed.proteinG -= entry.totals.proteinG
        consumed.carbsG -= entry.totals.carbsG
        consumed.fatsG -= entry.totals.fatsG
      }
    }
    model.mealSlots.forEach((slot) => subtractHidden(slot.intakeItems))
    subtractHidden(model.unassignedIntake)
    for (const row of optimisticRows) {
      consumed.calories += row.calories ?? 0
      consumed.proteinG += row.proteinG ?? 0
      consumed.carbsG += row.carbsG ?? 0
      consumed.fatsG += row.fatsG ?? 0
    }
    return {
      consumed: {
        calories: Math.max(consumed.calories, 0),
        proteinG: Math.max(consumed.proteinG, 0),
        carbsG: Math.max(consumed.carbsG, 0),
        fatsG: Math.max(consumed.fatsG, 0),
      },
      items: [
        ...serverEntries.map((entry) => ({
          name: entry.snapshot.name,
          quantity: entry.quantity,
          unit: entry.unit,
        })),
        ...optimisticRows.map((row) => ({
          name: row.name,
          quantity: row.shareQuantity,
          unit: row.shareUnit,
        })),
      ],
    }
  }, [model, overlay])

  const onShareDay = useCallback(async () => {
    if (!model || !shareSnapshot) return
    const text = buildNutritionDayShareText({
      localDate: model.localDate,
      planName: model.plan?.name ?? null,
      consumed: shareSnapshot.consumed,
      targets: {
        calories: model.targets.calories,
        proteinG: model.targets.proteinG,
        carbsG: model.targets.carbsG,
        fatsG: model.targets.fatsG,
      },
      items: shareSnapshot.items,
    })
    try {
      await Share.share({ message: text })
    } catch {
      // El usuario canceló el diálogo de compartir o el share nativo falló: sin acción.
    }
  }, [model, shareSnapshot])

  const dayComplete = useMemo(() => {
    if (!model) return false
    const hidden = new Set(overlay.hiddenIds)
    return isNutritionDayComplete(
      model.mealSlots.map((slot) => ({
        hasPrescription: slot.prescriptionItems.length > 0,
        hasConsumption:
          slot.intakeItems.some((e) => !hidden.has(e.id) && e.status !== 'voided') ||
          (overlay.addedBySlot[slot.code]?.length ?? 0) > 0,
      })),
    )
  }, [model, overlay])

  useEffect(() => {
    if (!userId || !dayComplete) return
    let active = true
    void claimDayCloseCelebration(userId, date).then((claimed) => {
      const decision = decideDayCloseCelebration(dayComplete, !claimed)
      if (active && decision) fireCelebration(decision)
    })
    return () => {
      active = false
    }
  }, [userId, dayComplete, date, fireCelebration])

  // Energía consumida del día incluyendo el overlay optimista (mismo cálculo que el render).
  const consumedCalories = useMemo(() => {
    if (!model) return 0
    const hidden = new Set(overlay.hiddenIds)
    let cal = model.consumed.calories
    for (const rows of Object.values(overlay.addedBySlot)) for (const row of rows) cal += row.calories ?? 0
    for (const row of overlay.addedUnassigned) cal += row.calories ?? 0
    const sub = (items: NutritionIntakeReadItem[]) => {
      for (const it of items) if (hidden.has(it.id)) cal -= it.totals.calories
    }
    model.mealSlots.forEach((slot) => sub(slot.intakeItems))
    sub(model.unassignedIntake)
    return Math.max(cal, 0)
  }, [model, overlay])

  // Cruce de la meta de energía → celebración completa (confeti + badge), una vez por día.
  useEffect(() => {
    if (!userId || !model) return
    if (!energyGoalReached(consumedCalories, model.targets.calories)) return
    let active = true
    void claimEnergyGoalCelebration(userId, date).then((claimed) => {
      const decision = decideEnergyGoalCelebration(true, !claimed)
      if (active && decision) fireCelebration(decision)
    })
    return () => {
      active = false
    }
  }, [userId, model, consumedCalories, date, fireCelebration])

  // El esqueleto de HOY solo aplica al día de hoy: mirar el sábado no depende del fetch del Today.
  if (!entitlements.ready || (isViewingToday && loading)) {
    return (
      <View className="flex-1 gap-5 bg-surface-app px-4">
        {chrome}
        <NutritionSkeleton variant="today" />
      </View>
    )
  }

  if (!enabled) {
    return (
      <View className="flex-1 gap-5 bg-surface-app px-4">
        {chrome}
        <NutritionStatePanel
          icon="permission"
          title="Nutrición todavía no está disponible para ti"
          description="Tu coach todavía no activó esta vista para ti."
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

  // ── Día que NO es hoy: SOLO LECTURA (SPEC nutrition-week-view) ───────────────
  // Pasado: manda la fila del historial (resultados congelados). Futuro: vista previa del plan
  // proyectado, sin checks, sin steppers y sin registro en bloque. Ninguno de los dos pide
  // `view=today` con otra fecha: ese RPC materializa snapshots y revienta más allá de hoy+1.
  if (!isViewingToday) {
    const isFuture = selectedCell?.state === 'future'
    const dayLabel = selectedCell ? selectedCell.longLabel.toLowerCase() : 'día'
    let body: ReactNode
    if (selectedCell == null) {
      body = (
        <NutritionStatePanel
          icon="info"
          title="No pudimos abrir ese día"
          description="Vuelve a hoy y elige otra fecha en la tira de la semana."
        />
      )
    } else if (!isFuture) {
      body = (
        <>
          <PastDaySummary cell={selectedCell} ready={weekHistory.ready} />
          {selectedCell.isLegacy ? <LegacyHistoryDetail date={selectedCell.isoDate} /> : null}
        </>
      )
    } else if (livePlan == null) {
      body = (
        <NutritionStatePanel
          icon="offline"
          tone="warning"
          title="No pudimos cargar tu plan"
          description="Sin el plan no podemos mostrarte lo que viene. Revisa tu conexión e inténtalo nuevamente."
        />
      )
    } else if (selectedCell.variant == null) {
      // Puede ser que no haya plan publicado o que el plan no prescriba ese día: en los dos casos
      // el snapshot tampoco prescribiría nada, así que NO se inventa la variante por defecto.
      body =
        livePlan.plan == null ? (
          <NutritionStatePanel
            icon="empty"
            illustration="sin-plan"
            title="Tu plan todavía no está publicado"
            description="Cuando tu coach publique la primera versión, aparecerán aquí tus objetivos y comidas."
          />
        ) : (
          <NutritionStatePanel
            icon="empty"
            title={`Tu plan no prescribe nada para el ${dayLabel}`}
            description="Ese día no tiene comidas fijas: seguirás tus metas diarias y podrás registrar lo que comas."
          />
        )
    } else {
      // Metas y comidas PROYECTADAS con la MISMA regla del snapshot. El día todavía no ocurrió:
      // ni consumo, ni checks, ni steppers, ni registro en bloque — cero controles.
      body = (
        <>
          <PlanObjectives targets={selectedCell.targets} dayLabel={selectedCell.longLabel} />
          <PlanVariantCard
            variant={selectedCell.variant}
            variants={weekVariants}
            showTargets={false}
            showWeekStrip={false}
            todayIso={date}
          />
        </>
      )
    }

    return (
      <View className="flex-1 bg-surface-app">
        <ScrollView
          className="flex-1"
          contentContainerClassName="gap-4 px-4"
          contentContainerStyle={{ paddingBottom: insets.bottom + ALUMNO_TABBAR_CLEARANCE }}
          onScroll={onScrollChrome}
          scrollEventThrottle={16}
          // [0] chrome (scrollea) · [1] tira de días (PEGADA) · [2+] contenido.
          stickyHeaderIndices={[1]}
        >
          {chrome}
          <StickyWeekBar>
            <WeekDayNav cells={weekCells} selectedIso={viewDate} onSelect={onSelectWeekDay} />
          </StickyWeekBar>
          <ReadOnlyDayBanner
            isoDate={viewDate}
            tone={isFuture ? 'future' : 'past'}
            onBackToToday={() => onSelectDay(null)}
          />
          {body}
        </ScrollView>
      </View>
    )
  }

  if (!model) {
    return (
      <View className="flex-1 gap-5 bg-surface-app px-4">
        {chrome}
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

  // 4A-02: sin plan vigente publicado, la vista Hoy COMPLETA se reemplaza por el panel
  // sin-plan con los copys exactos de la web (page.tsx:153-162). Con `livePlan` aún
  // desconocido (offline sin cache del plan) se muestra la vista normal — adaptación
  // offline-first documentada: la web nunca renderiza sin resolver el plan.
  if (livePlan && !livePlan.plan) {
    return (
      <ScrollView
        className="flex-1 bg-surface-app"
        contentContainerClassName="gap-5 px-4"
        contentContainerStyle={{ paddingBottom: insets.bottom + ALUMNO_TABBAR_CLEARANCE }}
        onScroll={onScrollChrome}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              void load(true)
            }}
            // QA4: el spinner de pull-to-refresh se tiñe con la marca (iOS: tintColor, Android: colors).
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        {chrome}
        <NutritionStatePanel
          icon="empty"
          illustration="sin-plan"
          title="Tu plan todavía no está publicado"
          description="Cuando tu coach publique la primera versión, aparecerán aquí tus objetivos, comidas y registros."
        />
      </ScrollView>
    )
  }

  const extra = { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0 }
  for (const rows of Object.values(overlay.addedBySlot)) {
    for (const row of rows) {
      extra.calories += row.calories ?? 0
      extra.proteinG += row.proteinG ?? 0
      extra.carbsG += row.carbsG ?? 0
      extra.fatsG += row.fatsG ?? 0
    }
  }
  for (const row of overlay.addedUnassigned) {
    extra.calories += row.calories ?? 0
    extra.proteinG += row.proteinG ?? 0
    extra.carbsG += row.carbsG ?? 0
    extra.fatsG += row.fatsG ?? 0
  }
  const removeHidden = (items: NutritionIntakeReadItem[]) => {
    for (const it of items) {
      if (!hiddenSet.has(it.id)) continue
      extra.calories -= it.totals.calories
      extra.proteinG -= it.totals.proteinG
      extra.carbsG -= it.totals.carbsG
      extra.fatsG -= it.totals.fatsG
    }
  }
  model.mealSlots.forEach((slot) => removeHidden(slot.intakeItems))
  removeHidden(model.unassignedIntake)

  const consumed = {
    calories: Math.max(model.consumed.calories + extra.calories, 0),
    proteinG: Math.max(model.consumed.proteinG + extra.proteinG, 0),
    carbsG: Math.max(model.consumed.carbsG + extra.carbsG, 0),
    fatsG: Math.max(model.consumed.fatsG + extra.fatsG, 0),
  }

  // 4A-02: banner de lag del plan (web page.tsx:164-177): el registro del día todavía
  // apunta al plan anterior (o no existe) mientras ya hay un plan nuevo publicado.
  const showTodayPlanLag = livePlan?.plan != null && (model.plan === null || model.plan.id !== livePlan.plan.id)
  const lagMessage =
    model.plan === null
      ? 'Tu nuevo plan ya está publicado. Las metas y comidas de hoy se activan mañana; hoy puedes registrar lo que comas.'
      : 'Tu nuevo plan ya está publicado. Hoy todavía ves las metas del plan anterior; desde mañana se aplican las del nuevo.'

  // FD3 (espejo de web page.tsx): badge multi-día SOLO con más de una variante y SOLO cuando el
  // registro del día ya es del plan vigente — durante el lag el snapshot es de otra versión y
  // nombrar la variante nueva sería mentir. No decide nada: explica lo que el snapshot ya fijó.
  const todayVariant =
    (livePlan?.dayVariants.length ?? 0) > 1 && !showTodayPlanLag
      ? resolveNutritionDayVariantForDate(livePlan?.dayVariants ?? [], date)
      : null

  // 4A-02: copia RN de slotsWithPrescribedContent (web portion-marks.logic.ts:357-363):
  // solo franjas con items fijos O con targets de porciones aparecen en "Tu plan de hoy".
  const slotsWithPrescription = model.mealSlots.filter(
    (slot) => slot.prescriptionItems.length > 0 || (slot.exchangeTargets?.length ?? 0) > 0,
  )

  // SPEC nutrition-ui-poda #1: "Fuera del plan" reemplaza a "Consumido hoy". Antes listaba TODOS
  // los registros del día, incluidos los prescritos — que ya se ven 300px más arriba en "Tu plan
  // de hoy" con su chip "Registrado" (eco x2 confirmado en auditoría, hallazgo H4). Ahora solo
  // entran los registros SIN prescriptionItemId (alimento libre). Las porciones marcadas
  // (`exchangeGroupCode` no nulo) tampoco entran: ya viven colapsadas por franja en
  // `PortionSlotSection`/`PortionDayCoverageRow` — una fila por marca sería el mismo eco de
  // porciones que documentó la auditoría (4 marcas de "Cereales" = 4 filas idénticas).
  const outOfPlanRows: Array<{
    row: NutritionFoodRowModel
    entry: NutritionIntakeReadItem | null
    queuedKey: string | null
  }> = [
    ...[...model.mealSlots.flatMap((slot) => slot.intakeItems), ...model.unassignedIntake]
      .filter((entry) => !hiddenSet.has(entry.id) && entry.prescriptionItemId === null && !entry.exchangeGroupCode)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
      .map((entry) => ({ row: intakeToRow(entry), entry, queuedKey: null })),
    // Filas encoladas: siempre vienen del flujo "Registrar alimento" (libre), nunca de marcar
    // porciones ni de "Lo comí" — esas dos rutas usan otros overlays (`portions`, `queuedItemIds`).
    ...Object.values(overlay.addedBySlot)
      .flat()
      .map((row) => ({ row, entry: null, queuedKey: row.queuedKey ?? null })),
    ...overlay.addedUnassigned.map((row) => ({ row, entry: null, queuedKey: row.queuedKey ?? null })),
  ]

  // Sheet de equivalencias: datos derivados de la franja abierta (solo cuando está
  // abierto; sin hooks — el early-return de arriba lo permite).
  const equivSlot = equivOpen
    ? model.mealSlots.find((slot) => slot.code === equivOpen.slotCode) ?? null
    : null
  const equivTargets = equivSlot?.exchangeTargets ?? []
  const equivViews: Record<string, PortionCoverageView> = {}
  if (equivSlot) {
    const slotPending = portions.pendingBySlot[equivSlot.code] ?? EMPTY_PORTION_MARKS
    const slotVoids = portions.voidsBySlot[equivSlot.code] ?? EMPTY_PORTION_VOIDS
    for (const target of equivTargets) {
      equivViews[target.groupCode] = coverageViewFor(target, slotPending, slotVoids)
    }
  }
  const onSheetMark = (target: NutritionSlotExchangeTargetRead, step: 1 | 0.5) => {
    if (!equivSlot) return
    const view = equivViews[target.groupCode]
    const completes = view ? view.coverage + step + 1e-9 >= view.prescribed : false
    portions.mark(equivSlot.code, target, step, completes)
  }
  const onSheetRegister = () => {
    if (!equivSlot) return
    setEquivOpen(null)
    onRegister(equivSlot)
  }

  return (
    <>
      <ScrollView
        className="flex-1 bg-surface-app"
        contentContainerClassName="gap-5 px-4"
        contentContainerStyle={{ paddingBottom: insets.bottom + ALUMNO_TABBAR_CLEARANCE }}
        onScroll={onScrollChrome}
        scrollEventThrottle={16}
        // [0] chrome (scrollea) · [1] tira Lu-Do (PEGADA) · [2+] contenido.
        stickyHeaderIndices={[1]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true)
              void load(true)
            }}
            // QA4: mismo tinte de marca que el resto de los pull-to-refresh de la app.
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        {chrome}
        {/* Tira Lu-Do (SPEC nutrition-week-view): queda PEGADA arriba al scrollear, así nunca se
            va de pantalla al bajar por el día. HOY queda marcado siempre, aunque el alumno esté
            mirando otro día. */}
        <StickyWeekBar>
          <WeekDayNav cells={weekCells} selectedIso={viewDate} onSelect={onSelectWeekDay} />
        </StickyWeekBar>
        {showTodayPlanLag ? (
          // Banner de lag del plan (web page.tsx:172-177): Info muted sobre superficie hundida.
          <View className="flex-row items-start gap-2 rounded-control border border-subtle bg-surface-sunken px-4 py-3">
            <Info color={theme.textSecondary} size={16} style={{ marginTop: 2 }} />
            <Text className="min-w-0 flex-1 text-sm leading-5 text-body">{lagMessage}</Text>
          </View>
        ) : null}

        {todayVariant ? (
          // Badge "Hoy: plan de {día} · {kcal}" (web page.tsx, mismo texto por helper compartido).
          <View className="flex-row items-center gap-2 self-start rounded-pill border border-primary/30 bg-primary/10 px-3 py-1">
            <CalendarDays color={theme.primary} size={14} />
            <Text className="text-xs font-semibold text-primary">
              {formatNutritionTodayVariantBadge(todayVariant)}
            </Text>
          </View>
        ) : null}

        {offline || pending > 0 ? (
          // Adaptación nativa documentada (cola offline; sin contraparte web): el chip de
          // sincronización SOLO aparece offline o con mutaciones pendientes, nunca en synced.
          <SyncOfflineState
            state={offline ? 'offline' : 'pending'}
            label={pending > 0 ? `${pending} pendiente${pending === 1 ? '' : 's'}` : undefined}
          />
        ) : null}

        {/* SPEC nutrition-ui-poda #1/#3: fuera StrategyBadge + chip "Ya registraste hoy" (el
            anillo, la lista y el punto verde del selector ya lo dicen). La nota visible del
            coach SUBE al Hoy (antes vivía enterrada en el tab Plan) — `livePlan` ya está en
            memoria, cero fetch extra. */}
        {livePlan?.visibleNotes ? <CoachNoteCard note={livePlan.visibleNotes} /> : null}

        <AuraHero
          greetingName={firstNameFromFullName(clientName)}
          weekInRangeCount={weekInRangeCount}
          calories={{ consumed: consumed.calories, target: model.targets.calories }}
          macros={{
            protein: { consumed: consumed.proteinG, target: model.targets.proteinG },
            carbs: { consumed: consumed.carbsG, target: model.targets.carbsG },
            fats: { consumed: consumed.fatsG, target: model.targets.fatsG },
          }}
        />

        {/* Citas de la información de salud (App Review 1.4.1): las calorías y macros del anillo son
            ESTIMACIONES calculadas con ecuaciones publicadas. El link a "Fuentes y método" tiene que
            estar acá, pegado a los números, no enterrado en un ajuste. */}
        <Pressable
          accessibilityRole="link"
          accessibilityLabel="Ver las fuentes y el método de cálculo de calorías y macronutrientes"
          onPress={() => router.push('/fuentes')}
          className="flex-row items-center gap-2 self-center px-3 py-2"
        >
          <BookOpen color={theme.textSecondary} size={13} />
          <Text className="text-xs font-semibold text-muted underline">
            Cómo se calculan estos números · Fuentes
          </Text>
        </Pressable>

        {portions.active && (model.dayCoverage?.length ?? 0) > 0 ? (
          <PortionDayCoverageRow
            dayCoverage={model.dayCoverage!}
            pendingByGroup={portions.pendingByGroup}
            voidedByGroup={portions.voidedByGroup}
          />
        ) : null}

        {mutationError ? (
          // Banner de error de mutación (web TodayExperience.tsx:216-225): entre coverage y CTAs.
          <View
            accessibilityLiveRegion="assertive"
            accessibilityRole="alert"
            className="flex-row items-start gap-2 rounded-card border border-danger-500/30 bg-danger-500/10 p-3"
          >
            <AlertTriangle color={theme.destructive} size={16} style={{ marginTop: 2 }} />
            <Text className="min-w-0 flex-1 text-sm leading-5 text-danger-700">{mutationError}</Text>
          </View>
        ) : null}

        {/* Fila de CTAs en tercios iguales, una sola línea (orden owner 2026-08-07):
            Escanear · Registrar (primario, al centro) · Compartir. El texto visible del primario
            se acorta a "Registrar" para que los tres entren sin envolver; `a11yLabel` conserva
            "Registrar alimento" para lectores de pantalla.
            NUT-009: con "Solo alimentos prescritos" (canRegisterFreely = false) desaparecen
            Registrar y Escanear — antes se ofrecían igual y el alumno rompía la regla del coach sin
            enterarse. La UI no autoriza: el guard real está en la API móvil y en el RPC. */}
        {model.permissions.canRegisterFreely ? (
          // Sin `flex-wrap` (con wrap Yoga reparte distinto y la fila se descuadra). Escanear y
          // Compartir van a su ancho natural para que se lean enteros; el primario es el unico
          // `fill` y absorbe el resto, asi que adelgaza en vez de comerse la fila.
          <View className="flex-row items-center gap-2">
            <TodayCta
              Icon={ScanBarcode}
              label="Escanear"
              tone="neutral"
              onPress={() => router.push('/alumno/nutrition-v2/scanner')}
            />
            <TodayCta
              fill
              Icon={Plus}
              label="Registrar"
              a11yLabel="Registrar alimento"
              tone="nutrition"
              onPress={() => onRegister()}
            />
            <TodayCta Icon={Share2} label="Compartir" tone="neutral" onPress={() => void onShareDay()} />
          </View>
        ) : (
          // Sin registro libre la fila pierde sus dos primeros tercios: queda el aviso del
          // candado a ancho completo y Compartir debajo, con su ancho propio.
          <View className="flex-row flex-wrap items-center gap-2">
            <View className="w-full flex-row items-start gap-2 rounded-card border border-subtle bg-surface-sunken px-3 py-2">
              <Lock color={theme.textSecondary} size={16} style={{ marginTop: 2 }} />
              <Text className="min-w-0 flex-1 text-sm leading-5 text-muted">
                Tu coach dejó el plan en solo alimentos prescritos: marca lo que comiste del plan.
              </Text>
            </View>
            <TodayCta Icon={Share2} label="Compartir" tone="neutral" onPress={() => void onShareDay()} />
          </View>
        )}

        {slotsWithPrescription.length > 0 ? (
          // "Tu plan de hoy" (web TodayExperience.tsx:561-640): sin sección si no hay franjas
          // con prescripción (PrescribedSection retorna null, TodayExperience.tsx:582).
          <View accessibilityLabel="Tu plan de hoy" className="gap-3">
            <Text className="font-display text-lg font-semibold text-strong">Tu plan de hoy</Text>
            {slotsWithPrescription.map((slot) => (
              <TodaySlotCard
                key={slot.id}
                slot={slot}
                today={model}
                consumedIds={consumedIds}
                queuedItemIds={queuedItemIds}
                substitutionsByItemId={substitutionsByItemId}
                substitutingId={substitutingId}
                eatingId={eatingId}
                onAte={onAtePrescribed}
                onBulkAte={onBulkAte}
                bulkBusy={bulkBusySlot === slot.code}
                portionPending={portions.pendingBySlot[slot.code] ?? EMPTY_PORTION_MARKS}
                portionVoids={portions.voidsBySlot[slot.code] ?? EMPTY_PORTION_VOIDS}
                onMarkPortion={portions.mark}
                onOpenEquivalences={onOpenEquivalences}
                onOpenExchange={onOpenExchange}
                onSwipeExchange={onSwipeExchange}
                onCorrect={onCorrectPrescribed}
                highlighted={slot.code === focusSlotCode}
              />
            ))}
          </View>
        ) : null}

        {/* SPEC nutrition-ui-poda #1: "Fuera del plan" reemplaza a "Consumido hoy" — solo lo que
            NO es prescrito (los registros del plan ya se ven arriba, bajo su franja, con su chip
            "Registrado"). Sin registros, no se pinta nada (paridad web T1.3, TodayExperience.tsx
            "auditoría H4"): el estado vacío ya lo cubren las franjas de arriba, repetirlo era el eco. */}
        {outOfPlanRows.length === 0 ? null : (
          <View accessibilityLabel="Fuera del plan" className="gap-3">
            <View className="flex-row items-center gap-2">
              <Utensils color={theme.primary} size={16} />
              <Text className="font-display text-lg font-semibold text-strong">Fuera del plan</Text>
            </View>
            <NutritionCard>
              {outOfPlanRows.map(({ row, entry, queuedKey }, index) => (
                <View key={row.id} className={index > 0 ? 'border-t border-subtle' : undefined}>
                  <FoodRow
                    food={row}
                    fallbackCategory={entry?.category}
                    actions={
                      entry ? (
                        // Icon-buttons lápiz/papelera: cada uno abre su corrección dedicada,
                        // igual que EditQuantityDialog/VoidEntryDialog en web (4A-06).
                        <View className="flex-row items-center gap-1">
                          {/* NUT-009: "Editar cantidad" solo si el plan lo permite. La regla
                              gobierna los registros ligados a un item PRESCRITO; un alimento libre
                              ya registrado se corrige siempre. "Retirar" NUNCA se esconde: dejar un
                              registro erróneo imborrable sería peor que la regla que protege. */}
                          {entry.prescriptionItemId === null || model.permissions.canAdjustPrescribedQuantity ? (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="Editar cantidad"
                              hitSlop={8}
                              onPress={() => {
                                setEntryActionError(null)
                                setEntryAction({ kind: 'edit', entry })
                              }}
                              className="h-10 w-10 items-center justify-center rounded-control"
                            >
                              <Pencil color={theme.textSecondary} size={16} />
                            </Pressable>
                          ) : null}
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Retirar registro"
                            hitSlop={8}
                            onPress={() => {
                              setEntryActionError(null)
                              setEntryAction({ kind: 'void', entry })
                            }}
                            className="h-10 w-10 items-center justify-center rounded-control"
                          >
                            <Trash2 color={theme.destructive} size={16} />
                          </Pressable>
                        </View>
                      ) : queuedKey ? (
                        // Fila aún EN COLA: no existe server-side, así que no hay edición ni void.
                        // La papelera cancela la mutación encolada (mismo modelo que porciones).
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Retirar registro en cola"
                          hitSlop={8}
                          onPress={() => void onCancelQueued(queuedKey)}
                          className="h-10 w-10 items-center justify-center rounded-control"
                        >
                          <Trash2 color={theme.destructive} size={16} />
                        </Pressable>
                      ) : undefined
                    }
                  />
                </View>
              ))}
            </NutritionCard>
          </View>
        )}
      </ScrollView>

      <EntryCorrectionSheet
        action={entryAction}
        error={entryActionError}
        pending={entryActionPending}
        onClose={() => {
          if (entryActionPending) return
          setEntryAction(null)
          setEntryActionError(null)
        }}
        onEdit={onEditEntry}
        onVoid={onVoidEntry}
      />
      {/* T2.5: sheet de intercambio. Se cierra solo al registrar; si la opción exige confirmar la
          cantidad, el Alert se abre encima y cancelar devuelve a la lista. */}
      <SubstitutionSheet
        open={exchange !== null}
        onClose={() => setExchange(null)}
        entry={exchange?.itemEntry ?? null}
        clientId={userId ?? ''}
        localDate={date}
        consumedFoodId={exchange?.consumedFoodId ?? null}
        pendingId={substitutingId}
        onPick={onPickSubstitution}
      />
      <PortionEquivalencesSheet
        open={equivOpen}
        targets={equivTargets}
        exchangeFoods={model.exchangeFoods ?? []}
        views={equivViews}
        onClose={() => setEquivOpen(null)}
        onMark={onSheetMark}
        onRegister={model.permissions.canRegisterFreely ? onSheetRegister : null}
      />
      <PortionSnackbar
        key={activeSnackbarKey}
        state={activeSnackbar}
        onDismiss={portionsSnackbar ? dismissPortionsSnackbar : dismissBulkSnackbar}
      />
      <CelebrationOverlay celebration={celebration} onDone={() => setCelebration(null)} />
    </>
  )
}

/**
 * Nota visible del coach, en el tab Hoy (SPEC nutrition-ui-poda #3). Expandida por defecto
 * (paridad web T1.3, ver TodayExperience.tsx): es la unica voz humana del modulo y debe leerse
 * sin abrir el tab Plan. Colapsable para que el alumno la repliegue una vez leida, no para
 * esconderla — cerrada no deja preview, mismo patron que web.
 */
function CoachNoteCard({ note }: { note: string }) {
  const { theme } = useTheme()
  const { reduced, duration } = useEvaMotion()
  const [open, setOpen] = useState(true)
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Nota de tu coach"
      accessibilityHint={open ? 'Toca para ocultarla' : 'Toca para leerla completa'}
      accessibilityState={{ expanded: open }}
      onPress={() => setOpen((v) => !v)}
      className="rounded-control border border-subtle bg-surface-sunken px-4 py-3"
    >
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Nota de tu coach</Text>
        <MotiView
          animate={{ rotate: reduced ? '0deg' : open ? '180deg' : '0deg' }}
          transition={{ type: 'timing', duration: duration('fast') }}
        >
          <ChevronDown color={theme.textSecondary} size={16} />
        </MotiView>
      </View>
      {open ? <Text className="mt-1 text-sm leading-6 text-body">{note}</Text> : null}
    </Pressable>
  )
}

function intakeToRow(entry: NutritionIntakeReadItem): NutritionFoodRowModel {
  return {
    id: entry.id,
    name: entry.snapshot.name,
    detail: entry.snapshot.brand,
    thumbnailUrl: foodMediaThumbnailUrl(entry.media),
    quantityLabel: `${entry.quantity} ${entry.unit}`,
    calories: entry.totals.calories,
    proteinG: entry.totals.proteinG,
    carbsG: entry.totals.carbsG,
    fatsG: entry.totals.fatsG,
    status: entry.status === 'corrected' ? 'corrected' : 'default',
  }
}

// 4A-02: CTA de la fila principal del Hoy (web TodayExperience.tsx:228-248): primario
// "Registrar alimento" sólido en tono nutrition + secundarios neutros "Escanear"/"Compartir"
// (web: border-default bg-surface-card text-strong). El NutritionMotionButton del kit
// RN renderiza children dentro de <Text> y no admite ícono, así que la fila se arma local
// con la misma motion de presión (NUTRITION_MOTION.press) y háptica del kit.
function TodayCta({
  Icon,
  label,
  tone,
  onPress,
  fill = false,
  a11yLabel,
}: {
  Icon: typeof Plus
  label: string
  tone: 'nutrition' | 'neutral'
  onPress: () => void
  /** Absorbe el ancho sobrante de la fila (el primario) en vez de fijar su ancho al contenido. */
  fill?: boolean
  /** Etiqueta accesible cuando el texto visible se acorta para que la fila entre. */
  a11yLabel?: string
}) {
  const { theme } = useTheme()
  const { reduced, duration } = useEvaMotion()
  const [pressed, setPressed] = useState(false)
  return (
    <Pressable
      accessibilityLabel={a11yLabel ?? label}
      accessibilityRole="button"
      className={fill ? 'min-w-0 flex-1' : undefined}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        onPress()
      }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
    >
      <MotiView
        animate={{ scale: reduced ? 1 : pressed ? NUTRITION_MOTION.press.scale : 1 }}
        transition={{ type: 'timing', duration: duration('fast') }}
      >
        <View
          className={`min-h-11 flex-row items-center justify-center gap-1.5 rounded-control border ${
            fill ? 'px-2' : 'px-4'
          } ${tone === 'nutrition' ? 'border-primary bg-primary' : 'border-default bg-surface-card'}`}
          style={shadow('sm', theme.scheme)}
        >
          <Icon
            className={tone === 'nutrition' ? 'text-white' : undefined}
            color={tone === 'nutrition' ? undefined : theme.foreground}
            size={16}
          />
          <Text
            className={`text-sm font-semibold ${fill ? 'min-w-0 shrink' : ''} ${
              tone === 'nutrition' ? 'text-white' : 'text-strong'
            }`}
            numberOfLines={1}
          >
            {label}
          </Text>
        </View>
      </MotiView>
    </Pressable>
  )
}

/**
 * Entry SINTÉTICO de un item prescrito recién registrado por el bulk. Solo alimenta a
 * `buildVoidIntakeCorrection` en el "Deshacer": lleva el id REAL devuelto por el servidor
 * (correctsEntryId) y los mismos campos congelados que usó `buildAteAsPrescribedMutation`, así el
 * void referencia el registro correcto sin depender del read-model refrescado. Los `totals` en 0
 * son irrelevantes (la corrección de void no los lee).
 */
function synthPrescribedIntakeEntry(
  item: NutritionMealSlotRead['prescriptionItems'][number],
  slotCode: string,
  id: string,
  occurredAt: string,
): NutritionIntakeReadItem {
  return {
    id,
    foodId: item.foodId,
    customName: item.foodId ? null : item.name ?? 'Alimento prescrito',
    quantity: item.quantity,
    unit: item.unit,
    mealSlot: slotCode,
    source: 'prescription',
    captureMethod: 'prescription',
    occurredAt,
    status: 'active',
    revision: 1,
    correctsEntryId: null,
    prescriptionItemId: item.id,
    // Mismo snapshot NORMALIZADO (per-unidad, servingSize 1) que viajó en el registro original:
    // el void lo reusa y debe describir la misma base (NUT-002).
    snapshot: {
      name: item.name ?? 'Alimento prescrito',
      brand: item.brand,
      ...prescribedIntakeSnapshotMacros(item),
      servingUnit: item.unit,
    },
    totals: { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0, fiberG: 0 },
  }
}

// 4A-02: card de franja de "Tu plan de hoy" 1:1 con la web. Conserva la jerarquía compacta
// del rediseño y suma progreso, bulk-mark y reemplazos estructurados. Memoizada: marcar una
// porción solo cambia `portionPending`/`portionVoids` de SU franja.
/**
 * Checkbox de registro del item prescrito (T2.7 F2, decisión D-C, espejo del `EatCheckbox` web):
 * el check ES el registro — tap en vacío registra; tap en marcado abre "Retirar registro" (el
 * sheet con motivo de siempre: des-registrar nunca es un tap accidental). Caja visible de 22px
 * (el tamaño del catálogo) con área táctil de 44px. Con el registro EN COLA el check queda
 * marcado pero inerte: no hay entry del servidor que retirar todavía.
 */
function EatCheckbox({
  checked,
  name,
  disabled,
  pending,
  onToggle,
}: {
  checked: boolean
  name: string
  disabled?: boolean
  pending?: boolean
  onToggle?: () => void
}) {
  const { theme } = useTheme()
  const inert = disabled || onToggle == null
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled: inert }}
      accessibilityLabel={checked ? `Retirar registro de ${name}` : `Registrar ${name}`}
      disabled={inert}
      onPress={onToggle}
      className="h-11 w-8 items-center justify-center"
      style={pending ? { opacity: 0.55 } : undefined}
    >
      <View
        className={`h-[22px] w-[22px] items-center justify-center rounded-md ${
          checked ? '' : 'border-2 border-default bg-surface-card'
        }`}
        style={checked ? { backgroundColor: theme.success } : undefined}
      >
        {/* Blanco literal a propósito: success es semántico fijo (no white-label) y el tick
            va sobre ese verde en claro y oscuro. */}
        {checked ? <Check color="#FFFFFF" size={14} strokeWidth={3.5} /> : null}
      </View>
    </Pressable>
  )
}

const TodaySlotCard = memo(function TodaySlotCard({
  slot,
  today,
  consumedIds,
  queuedItemIds,
  substitutionsByItemId,
  substitutingId,
  eatingId,
  onAte,
  onBulkAte,
  bulkBusy,
  portionPending,
  portionVoids,
  onMarkPortion,
  onOpenEquivalences,
  onOpenExchange,
  onSwipeExchange,
  onCorrect,
  highlighted = false,
}: {
  slot: NutritionMealSlotRead
  today: NutritionTodayReadModel
  consumedIds: Set<string>
  /** Subconjunto de `consumedIds` que aún NO llegó al servidor (mutación en cola). */
  queuedItemIds: Set<string>
  substitutionsByItemId: ReadonlyMap<string, SubstitutionOptionsItem>
  /** Opción de reemplazo en vuelo (T2.4): apaga solo esa pill. */
  substitutingId: string | null
  eatingId: string | null
  onAte: (slot: NutritionMealSlotRead, item: NutritionMealSlotRead['prescriptionItems'][number]) => void
  onBulkAte: (slot: NutritionMealSlotRead, eligible: NutritionMealSlotRead['prescriptionItems'][number][]) => void
  bulkBusy: boolean
  portionPending: PendingPortionMark[]
  portionVoids: PendingPortionVoid[]
  onMarkPortion: (
    slotCode: string,
    target: NutritionSlotExchangeTargetRead,
    portions: 1 | 0.5,
    completes: boolean,
  ) => void
  onOpenEquivalences: (slotCode: string, groupCode: string) => void
  /** T2.5: abre el sheet de intercambio de ese item (dos bloques: coach y grupo). */
  onOpenExchange: (itemEntry: SubstitutionOptionsItem, consumedFoodId: string | null) => void
  /** T2.5 F6: deslizar la fila. Aplica el primer reemplazo del coach, o abre el sheet. */
  onSwipeExchange: (itemEntry: SubstitutionOptionsItem, consumedFoodId: string | null) => void
  /** Corregir/retirar el registro de un item prescrito consumido (paridad web NUT-009). */
  onCorrect: (kind: 'edit' | 'void', entry: NutritionIntakeReadItem) => void
  /** Franja apuntada por el deep-link de la card de Nutrición del Home (SPEC #8). */
  highlighted?: boolean
}) {
  const { theme } = useTheme()
  const bulk = bulkMarkSlotState(today, slot, consumedIds)
  return (
    <NutritionCard tone={highlighted ? 'nutrition' : 'neutral'}>
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text className="font-display text-base font-semibold text-strong">{slot.name}</Text>
        {slot.startTime ? <Text className="font-mono text-xs text-muted">{slot.startTime}</Text> : null}
      </View>

      {/* Nota del coach de la franja (SPEC nutrition-coach-notes N3): banda 💬 bajo el
          título. Viaja congelada en el snapshot del publish; sin nota ⇒ cero render. */}
      <CoachNoteBand className="mt-2" note={slot.instructions} />

      {bulk.requiredTotal > 0 ? (
        <View className="mt-2">
          <MealProgressMeter consumed={bulk.requiredConsumed} total={bulk.requiredTotal} />
        </View>
      ) : null}

      {slot.prescriptionItems.length > 0 ? (
        <View className="mt-3">
          {slot.prescriptionItems.map((item, index) => {
            const substitutionEntry = substitutionsByItemId.get(item.id)
            const substitutionCount = substitutionEntry?.options.length ?? 0
            const consumed = consumedIds.has(item.id)
            const activeEntry =
              slot.intakeItems.find((e) => e.prescriptionItemId === item.id && e.status === 'active') ?? null
            // T2.4: el estado "sustituido" lo dice el read-model (`source`), que sale de
            // `intake_source_v2`. Cuando pasa, la fila muestra el REEMPLAZO y aclara a quién
            // sustituyó — mismo vocabulario que la web y que el catálogo de pantallas.
            const isSubstituted = activeEntry?.source === 'substitution'
            const rawNote = item.notes?.trim() || null
            const displayNote = substitutionCount > 0 && rawNote?.startsWith('Alternativas:') ? null : rawNote
            return (
              <View key={item.id} className={index > 0 ? 'border-t border-subtle' : undefined}>
                <SwipeToExchange
                  enabled={substitutionEntry !== undefined && substitutingId === null}
                  onSwipe={() => {
                    if (substitutionEntry) onSwipeExchange(substitutionEntry, activeEntry?.foodId ?? null)
                  }}
                >
                <FoodRow
                  food={{
                    id: item.id,
                    name: isSubstituted && activeEntry
                      ? activeEntry.snapshot.name
                      : item.name ?? 'Alimento prescrito',
                    detail: isSubstituted && activeEntry ? activeEntry.snapshot.brand : item.brand,
                    thumbnailUrl: foodMediaThumbnailUrl(isSubstituted && activeEntry ? activeEntry.media ?? item.media : item.media),
                    quantityLabel:
                      isSubstituted && activeEntry
                        ? `${activeEntry.quantity} ${activeEntry.unit}`
                        : `${item.quantity} ${item.unit}${item.optional ? ' · opcional' : ''}`,
                    calories: isSubstituted && activeEntry ? activeEntry.totals.calories : item.macros.calories,
                    proteinG: isSubstituted && activeEntry ? activeEntry.totals.proteinG : item.macros.proteinG,
                    carbsG: isSubstituted && activeEntry ? activeEntry.totals.carbsG : item.macros.carbsG,
                    fatsG: isSubstituted && activeEntry ? activeEntry.totals.fatsG : item.macros.fatsG,
                  }}
                  fallbackCategory={item.category}
                  note={
                    isSubstituted
                      ? `sustituyó a ${item.name ?? 'tu alimento'} · ${item.quantity} ${item.unit}`
                      : displayNote
                  }
                  // T2.7 F2 (D-C): el CHECK es el registro — muere el botón "Lo comí". Tap en
                  // vacío registra; tap en marcado abre el sheet "Retirar registro". Con el
                  // registro en cola el check queda marcado pero inerte (aún no hay entry).
                  leading={
                    <EatCheckbox
                      checked={consumed}
                      name={item.name ?? 'alimento prescrito'}
                      disabled={eatingId === item.id}
                      pending={eatingId === item.id}
                      onToggle={
                        consumed
                          ? activeEntry && !queuedItemIds.has(item.id)
                            ? () => onCorrect('void', activeEntry)
                            : undefined
                          : () => onAte(slot, item)
                      }
                    />
                  }
                  actions={
                    consumed ? (
                      queuedItemIds.has(item.id) ? (
                        // Encolado: el check queda marcado pero el chip NO miente — todavía no
                        // llegó al servidor.
                        <View className="flex-row items-center gap-1">
                          <History color={theme.textSecondary} size={16} />
                          <Text className="text-xs font-semibold text-muted">En cola</Text>
                        </View>
                      ) : (
                        // Correccion en la fila (regla web NUT-009): lapiz solo con permiso de
                        // ajustar cantidades; "Retirar" NUNCA se esconde. El estado registrado ya
                        // lo dice el check de la izquierda; solo "Sustituido" conserva su chip.
                        (() => {
                          const entry = activeEntry
                          return (
                            <View className="flex-row items-center gap-1">
                              {isSubstituted ? (
                                <Text className="text-xs font-semibold text-success-700">⇄ Sustituido</Text>
                              ) : null}
                              {entry && today.permissions.canAdjustPrescribedQuantity ? (
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={`Editar cantidad de ${item.name ?? 'alimento prescrito'}`}
                                  onPress={() => onCorrect('edit', entry)}
                                  className="h-10 w-10 items-center justify-center rounded-control"
                                >
                                  <Pencil color={theme.textSecondary} size={16} />
                                </Pressable>
                              ) : null}
                              {entry ? (
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={`Retirar registro de ${item.name ?? 'alimento prescrito'}`}
                                  onPress={() => onCorrect('void', entry)}
                                  className="h-10 w-10 items-center justify-center rounded-control"
                                >
                                  <Trash2 color={theme.destructive} size={16} />
                                </Pressable>
                              ) : null}
                            </View>
                          )
                        })()
                      )
                    ) : null
                  }
                />
                </SwipeToExchange>
                {/* Los reemplazos se ofrecen SIEMPRE, también sobre un item ya registrado: ahí el
                    servidor corrige en vez de duplicar (D3), que es lo que permite cambiar de
                    opinión. Solo se esconde la opción ya registrada. */}
                <ItemExchangeTrigger
                  entry={substitutionEntry}
                  disabled={substitutingId !== null}
                  consumedFoodId={activeEntry?.foodId ?? null}
                  onOpen={onOpenExchange}
                />
              </View>
            )
          })}
        </View>
      ) : null}

      {/* Registro en bloque de la franja ("Comí toda esta comida") — thumb-zone bajo los items. */}
      <BulkMarkControl state={bulk} pending={bulkBusy} onEat={() => onBulkAte(slot, bulk.eligible)} />

      {(slot.exchangeTargets?.length ?? 0) > 0 ? (
        <PortionSlotSection
          slotCode={slot.code}
          targets={slot.exchangeTargets!}
          pending={portionPending}
          voids={portionVoids}
          onMark={onMarkPortion}
          onOpenEquivalences={onOpenEquivalences}
        />
      ) : null}
    </NutritionCard>
  )
})

/**
 * Medidor compacto de progreso de la franja (espeja el web): barra + "consumidos/total" de items
 * REQUERIDOS. Al completar muta a un chip con check y "Completa". Solo lectura — la acción vive en
 * el control de registro en bloque de abajo. La barra anima el ancho (respeta reduced-motion).
 */
function MealProgressMeter({ consumed, total }: { consumed: number; total: number }) {
  const { theme } = useTheme()
  const { duration } = useEvaMotion()
  const pct = total > 0 ? Math.min(100, Math.round((consumed / total) * 100)) : 0
  const complete = total > 0 && consumed >= total
  return (
    <View
      accessibilityLabel={`${consumed} de ${total} registrados`}
      className={`self-start flex-row items-center gap-2 rounded-pill border px-2.5 py-1 ${
        complete ? 'border-success-500/30 bg-success-500/10' : 'border-subtle bg-surface-sunken'
      }`}
    >
      {complete ? (
        <Check color={theme.success} size={13} />
      ) : (
        <View className="h-1.5 w-12 overflow-hidden rounded-pill bg-border-subtle">
          <MotiView
            animate={{ width: `${pct}%` }}
            className="h-full rounded-pill bg-success-500"
            transition={{ type: 'timing', duration: duration('base') }}
          />
        </View>
      )}
      <Text className={`font-mono text-[11px] font-semibold ${complete ? 'text-success-700' : 'text-muted'}`}>
        {complete ? 'Completa' : `${consumed}/${total}`}
      </Text>
    </View>
  )
}

/**
 * Afordancia de intercambio bajo un item prescrito (T2.5). Espejo del web: antes acá vivían las
 * pills, una por reemplazo del coach — servían a 15 items en toda la base y no tenían dónde poner
 * los 832 que solo tienen grupo. Ahora es UN control que abre el sheet.
 *
 * Sin equivalentes ⇒ no renderiza nada (D2); el copy honesto de por qué vive dentro del sheet.
 */
function ItemExchangeTrigger({
  entry,
  disabled,
  consumedFoodId,
  onOpen,
}: {
  entry: SubstitutionOptionsItem | undefined
  disabled: boolean
  /** Alimento con el que el item ya está registrado, para no contar "cambiar a lo mismo". */
  consumedFoodId: string | null
  onOpen: (itemEntry: SubstitutionOptionsItem, consumedFoodId: string | null) => void
}) {
  if (!entry) return null
  const coachCount = entry.options.filter(
    (option) => consumedFoodId === null || option.foodId !== consumedFoodId,
  ).length
  const total = coachCount + entry.groupTotal
  if (total === 0) return null

  return (
    <View className="pb-3 pl-14">
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        disabled={disabled}
        accessibilityLabel={`Cambiar ${entry.item.name ?? 'este alimento'}: ${total} equivalentes`}
        onPress={() => onOpen(entry, consumedFoodId)}
        className="min-h-9 flex-row items-center gap-1.5 self-start rounded-pill border border-subtle bg-surface-sunken px-2.5 py-1"
      >
        <Text className="text-xs text-body">⇄</Text>
        <Text className="text-xs font-medium text-body">
          {total} {total === 1 ? 'equivalente' : 'equivalentes'}
        </Text>
      </Pressable>
    </View>
  )
}

/**
 * Control de registro en bloque de una franja. Estados (del helper puro compartido):
 *  - none-required → nada (la franja no tiene items requeridos; p. ej. solo-porciones).
 *  - complete      → nada (SPEC nutrition-ui-poda #1/H1): el chip "Completa" del
 *                     `MealProgressMeter`, en la misma card, ya lo dice — el banner
 *                     "Comida completa" era el mismo hecho una segunda vez.
 *  - all-open      → CTA "Comí toda esta comida · N kcal".
 *  - partial       → CTA "Comer lo que falta (N) · M kcal".
 */
function BulkMarkControl({
  state,
  pending,
  onEat,
}: {
  state: BulkMarkSlotState
  pending: boolean
  onEat: () => void
}) {
  if (state.status === 'none-required' || state.status === 'complete') return null
  const label = bulkMarkCtaLabel(state) ?? 'Registrar comida'
  const kcal = state.eligibleKcal > 0 ? ` · ${Math.round(state.eligibleKcal)} kcal` : ''
  return (
    <View className="mt-3">
      <NutritionMotionButton
        accessibilityLabel={`${label}${kcal}`}
        tone="success"
        pending={pending}
        onPress={onEat}
      >
        {`${label}${kcal}`}
      </NutritionMotionButton>
    </View>
  )
}

/**
 * T1.2 (nutrition-flows-redesign), paridad exacta con la web: chips de razon con la primera
 * preseleccionada — el texto del chip ya cumple el minimo de 3 caracteres del server, asi que
 * la validacion del RPC no cambia. "Otro motivo" abre el campo libre (ahi si, minimo 3).
 */
const EDIT_REASON_CHIPS = ['Me equivoqué de cantidad', 'Comí menos', 'Comí más'] as const
const VOID_REASON_CHIPS = ['Lo registré por error', 'No lo comí', 'Registro duplicado'] as const
const OTHER_REASON = '__otro__'

/** Chip elegido o texto libre; null si "Otro motivo" quedo bajo el minimo del server. */
function resolveCorrectionReason(value: string, customText: string): string | null {
  if (value !== OTHER_REASON) return value
  const trimmed = customText.trim()
  return trimmed.length >= 3 && trimmed.length <= 1000 ? trimmed : null
}

function ReasonChips({
  label,
  options,
  value,
  customText,
  pending,
  onSelect,
  onCustomChange,
}: {
  label: string
  options: readonly string[]
  value: string
  customText: string
  pending: boolean
  onSelect: (next: string) => void
  onCustomChange: (text: string) => void
}) {
  const { theme } = useTheme()
  return (
    <View>
      <Text className="mb-1.5 text-xs font-semibold text-muted">{label}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={label} className="flex-row flex-wrap gap-2">
        {[...options, OTHER_REASON].map((option) => {
          const selected = value === option
          const text = option === OTHER_REASON ? 'Otro motivo' : option
          return (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled: pending }}
              disabled={pending}
              onPress={() => onSelect(option)}
              // `shrink-0`: sin esto Yoga encoge el chip que no entra en la linea y le CORTA el
              // texto ("No lo comi" quedaba en "No lo") en vez de envolverlo a la fila siguiente.
              className={`min-h-9 shrink-0 items-center justify-center rounded-full border px-3 ${
                selected ? '' : 'border-default bg-surface-app'
              }`}
              style={selected ? { borderColor: theme.primary, backgroundColor: `${theme.primary}1A` } : undefined}
            >
              <Text
                className={`text-xs font-semibold ${selected ? '' : 'text-body'}`}
                // Sin `numberOfLines` Yoga envuelve el chip a dos lineas mientras mide y la caja
                // se queda con la altura de UNA: la segunda linea desaparecia ("No lo comi" =>
                // "No lo"). Mismo patron que el denominador del AuraHero.
                numberOfLines={1}
                style={selected ? { color: theme.primary } : undefined}
              >
                {text}
              </Text>
            </Pressable>
          )
        })}
      </View>
      {value === OTHER_REASON ? (
        <TextInput
          accessibilityLabel="Otro motivo"
          accessibilityHint="Escribe al menos tres caracteres"
          className="mt-2 min-h-12 w-full rounded-control border border-default bg-surface-app px-3 text-base text-strong"
          editable={!pending}
          maxLength={1000}
          onChangeText={onCustomChange}
          placeholder="Cuéntale a tu coach (mínimo 3 caracteres)"
          placeholderTextColor={theme.mutedForeground}
          returnKeyType="done"
          value={customText}
          autoFocus
        />
      ) : null}
    </View>
  )
}

function EntryCorrectionSheet({
  action,
  error,
  pending,
  onClose,
  onEdit,
  onVoid,
}: {
  action: EntryCorrectionAction | null
  error: string | null
  pending: boolean
  onClose: () => void
  onEdit: (entry: NutritionIntakeReadItem, quantity: number, reason: string) => void
  onVoid: (entry: NutritionIntakeReadItem, reason: string) => void
}) {
  const { theme } = useTheme()
  const [quantity, setQuantity] = useState('')
  const [reasonChoice, setReasonChoice] = useState<string>(EDIT_REASON_CHIPS[0])
  const [customReason, setCustomReason] = useState('')
  const entry = action?.entry ?? null

  useEffect(() => {
    setQuantity(entry ? String(entry.quantity) : '')
    setReasonChoice(action?.kind === 'void' ? VOID_REASON_CHIPS[0] : EDIT_REASON_CHIPS[0])
    setCustomReason('')
  }, [action, entry])

  const parsed = Number(quantity.replace(',', '.'))
  const validQuantity = Number.isFinite(parsed) && parsed > 0
  // Paso hibrido, misma regla que la web: gramos/ml en saltos de 10, unidades contadas de a 0.5.
  const step = entry?.unit === 'g' || entry?.unit === 'ml' ? 10 : 0.5
  const adjustQuantity = (delta: number) => {
    const base = validQuantity ? parsed : entry?.quantity ?? 0
    const next = Math.max(step, Math.round((base + delta) * 10) / 10)
    setQuantity(String(next))
  }
  const reason = resolveCorrectionReason(reasonChoice, customReason)
  const canSubmit = reason !== null && (action?.kind === 'void' || validQuantity)
  const title = action?.kind === 'edit' ? 'Editar cantidad' : 'Retirar registro'
  const description = entry
    ? action?.kind === 'edit'
      ? `${entry.snapshot.name} · registrado como ${entry.quantity} ${entry.unit}`
      : `${entry.snapshot.name} · ${entry.quantity} ${entry.unit}`
    : undefined
  const footer = action && entry ? (
    <View className="flex-row gap-2">
      <View className="flex-1">
        <NutritionMotionButton
          accessibilityLabel="Cancelar corrección"
          disabled={pending}
          tone="neutral"
          onPress={onClose}
        >
          Cancelar
        </NutritionMotionButton>
      </View>
      <View className="flex-1">
        <NutritionMotionButton
          accessibilityLabel={action.kind === 'edit' ? 'Guardar corrección' : 'Confirmar retiro del registro'}
          disabled={!canSubmit}
          pending={pending}
          tone={action.kind === 'void' ? 'danger' : 'nutrition'}
          onPress={() => {
            if (!canSubmit || reason === null) return
            if (action.kind === 'edit') onEdit(entry, parsed, reason)
            else onVoid(entry, reason)
          }}
        >
          {action.kind === 'edit' ? 'Guardar corrección' : 'Retirar registro'}
        </NutritionMotionButton>
      </View>
    </View>
  ) : undefined

  return (
    <ActionSheet
      open={action != null}
      onClose={onClose}
      nativeModal
      title={title}
      description={description}
      footer={footer}
      showCloseButton={!pending}
      // 85/78: con "Otro motivo" abierto el input caia DETRAS del teclado (QA device 06-08) —
      // el sheet mas alto deja el campo visible sobre el teclado con el KAV existente.
      snapPoints={[action?.kind === 'edit' ? '85%' : '78%']}
      accessibilityLabel={action?.kind === 'edit' ? 'Editar cantidad consumida' : 'Retirar registro consumido'}
    >
      {action && entry ? (
        <View className="gap-4">
          {error ? (
            <View
              accessibilityRole="alert"
              className="flex-row items-start gap-2 rounded-control border border-danger-500/30 bg-danger-500/10 px-3 py-2.5"
            >
              <AlertTriangle color={theme.destructive} size={16} />
              <Text accessibilityLiveRegion="polite" className="flex-1 text-sm leading-5 text-danger-700">
                {error}
              </Text>
            </View>
          ) : null}

          {action.kind === 'edit' ? (
            <View>
              <Text className="mb-1 text-xs font-semibold text-muted">Nueva cantidad ({entry.unit})</Text>
              <View className="flex-row items-stretch gap-2">
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Restar ${step} ${entry.unit}`}
                  disabled={pending}
                  onPress={() => adjustQuantity(-step)}
                  className="min-h-12 w-12 items-center justify-center rounded-control border border-default bg-surface-app"
                >
                  <Text className="text-lg font-bold text-strong">−</Text>
                </Pressable>
                <TextInput
                  accessibilityLabel={`Nueva cantidad en ${entry.unit}`}
                  accessibilityHint="Ingresa un número mayor que cero"
                  className="min-h-12 flex-1 rounded-control border border-default bg-surface-app px-3 text-center text-base font-semibold text-strong"
                  editable={!pending}
                  inputMode="decimal"
                  keyboardType="decimal-pad"
                  onChangeText={(value) => setQuantity(value.replace(/[^0-9.,]/g, ''))}
                  selectTextOnFocus
                  value={quantity}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Sumar ${step} ${entry.unit}`}
                  disabled={pending}
                  onPress={() => adjustQuantity(step)}
                  className="min-h-12 w-12 items-center justify-center rounded-control border border-default bg-surface-app"
                >
                  <Text className="text-lg font-bold text-strong">＋</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Text className="text-sm leading-5 text-body">
              El registro dejará de contar en tu día, pero se conserva en el historial para tu coach.
            </Text>
          )}

          <ReasonChips
            label="¿Por qué? (opcional)"
            options={action.kind === 'edit' ? EDIT_REASON_CHIPS : VOID_REASON_CHIPS}
            value={reasonChoice}
            customText={customReason}
            pending={pending}
            onSelect={setReasonChoice}
            onCustomChange={setCustomReason}
          />
          {action.kind === 'edit' ? (
            <Text className="text-[11px] leading-4 text-subtle">
              Se conserva el registro original para tu coach.
            </Text>
          ) : null}
        </View>
      ) : null}
    </ActionSheet>
  )
}

// ---------------------------------------------------------------------------
// Tabs shell (Tanda 7): Hoy / Plan / Historial. `TodayTab` above keeps the full
// registro experience verbatim; Plan and History are read-only tabs that mirror
// the web semantics (apps/web .../nutrition-v2/page.tsx) with cache-first loads.
// ---------------------------------------------------------------------------

type NutritionV2Tab = 'today' | 'plan' | 'history'
type PlanVariant = NutritionPlanReadModel['dayVariants'][number]

export default function StudentNutritionV2Screen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const entitlements = useEntitlements()
  const enabled = entitlements.ready
  const { reduced, duration } = useEvaMotion()
  // Deep-link desde la card "Nutrición" del Home (SPEC nutrition-ui-poda #8): `slot` señala la
  // franja que le toca ahora al alumno; solo resalta una card, jamás abre otra fecha ni dispara
  // otra lectura (el Hoy siempre carga el mismo día de hoy).
  const { slot: focusSlotParam } = useLocalSearchParams<{ slot?: string }>()
  const focusSlotCode = typeof focusSlotParam === 'string' ? focusSlotParam : null
  const [tab, setTab] = useState<NutritionV2Tab>('today')
  // Día que el tab "Hoy" está mostrando; `null` = hoy (SPEC nutrition-week-view). Vive acá, y no
  // dentro de `TodayTab`, por dos razones: cambiar de tab REMONTA el tab (MotiView con `key`), y
  // el historial abre un día concreto en modo lectura.
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const openDayFromHistory = useCallback((isoDate: string) => {
    setSelectedDay(isoDate)
    setTab('today')
  }, [])

  // Volver a la pantalla de Nutrición SIEMPRE aterriza en hoy: el día elegido sobrevive a cambiar
  // de tab (Hoy ⇄ Plan ⇄ Historial, que remontan) pero no a salir del módulo — el tab se llama
  // "Hoy" y reencontrarlo mostrando el miércoles pasado sería desorientador.
  useFocusEffect(
    useCallback(() => {
      setSelectedDay(null)
    }, []),
  )

  if (!entitlements.ready || !enabled) {
    // Pre-hidratación de entitlements: skeleton neutro sin mostrar datos incompletos.
    return (
      <View
        className="flex-1 bg-surface-app px-4"
        style={{ paddingTop: insets.top + 24 }}
      >
        <NutritionSkeleton variant="today" />
      </View>
    )
  }

  // 4A-01: master switch del dominio también en la RUTA, no solo en el nav
  // (espejo de la intención web: redirect V1 + `showNutrition` del ClientNav
  // aseguran que dominio OFF jamás muestra nutrición, ClientNav.tsx:44-46,120;
  // el shell V1 RN hace lo mismo en nutricion.tsx). Un deep-link (widget del
  // Inicio, notificación) con dominio apagado ve el aviso — NUNCA el plan.
  if (!entitlements.nutritionEnabled) {
    return (
      <View className="flex-1 bg-surface-app">
        <View
          className="gap-4 px-4 pb-3"
          style={{ paddingTop: insets.top + 20 }}
        >
          <NutritionHeader
            title="Nutrición"
            description="Prescripción, consumo real e historial en una sola experiencia."
          />
        </View>
        <NutritionDomainOff />
      </View>
    )
  }

  // El chrome (título + tabs) ya NO es fijo: viaja DENTRO del scroll de cada tab
  // para que al bajar se vaya de pantalla y quede pegada SOLO la tira de días.
  const chrome = <NutritionChrome value={tab} onChange={setTab} />

  return (
    // `paddingTop` del notch en el shell (no en el contenido) para que la tira de
    // días, al quedar pegada, tope contra la barra de estado y no debajo de ella.
    <View className="flex-1 bg-surface-app" style={{ paddingTop: insets.top }}>
      <MotiView
        key={tab}
        className="flex-1"
        from={reduced ? undefined : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ type: 'timing', duration: duration('base') }}
      >
        {tab === 'today' ? (
          <TodayTab
            chrome={chrome}
            selectedDay={selectedDay}
            onSelectDay={setSelectedDay}
            focusSlotCode={focusSlotCode}
          />
        ) : null}
        {tab === 'plan' ? <PlanTab chrome={chrome} /> : null}
        {tab === 'history' ? <HistoryTab chrome={chrome} onOpenDay={openDayFromHistory} /> : null}
      </MotiView>
    </View>
  )
}

/**
 * Título + tabs del módulo. Se renderiza como PRIMER hijo del ScrollView de cada
 * tab (índice 0) para que scrollee; el índice 1 de ese mismo ScrollView es la
 * tira de días con `stickyHeaderIndices` — lo único que queda pegado arriba.
 *
 * Header 1:1 web (nutrition-v2/page.tsx:62-65): título "Nutrición" + descripción,
 * SIN eyebrow. Adaptación documentada: la web muestra flecha de volver
 * (`backHref={base}/dashboard`, NutritionV2Kit.tsx:122-150) porque /nutrition-v2
 * es una página; aquí la superficie ES el tab Nutrición y los tabs RN no tienen
 * back — la flecha se omite.
 */
function NutritionChrome({
  value,
  onChange,
}: {
  value: NutritionV2Tab
  onChange: (tab: NutritionV2Tab) => void
}) {
  return (
    <View className="gap-4 pt-5">
      <NutritionHeader
        title="Nutrición"
        description="Prescripción, consumo real e historial en una sola experiencia."
      />
      <NutritionTabBar value={value} onChange={onChange} />
    </View>
  )
}

/**
 * Envoltorio de la tira de días que queda PEGADA arriba (`stickyHeaderIndices`).
 * El fondo sólido y el `-mx-4` (que anula el `px-4` del contenedor) son
 * obligatorios: sin ellos el contenido se ve pasar por detrás y por los costados.
 */
function StickyWeekBar({ children }: { children: ReactNode }) {
  return <View className="-mx-4 bg-surface-app px-4 pb-3">{children}</View>
}

const NUTRITION_V2_TABS: { key: NutritionV2Tab; label: string; Icon: typeof Utensils }[] = [
  { key: 'today', label: 'Hoy', Icon: Utensils },
  { key: 'plan', label: 'Plan', Icon: ListChecks },
  { key: 'history', label: 'Historial', Icon: History },
]

function NutritionTabBar({ value, onChange }: { value: NutritionV2Tab; onChange: (tab: NutritionV2Tab) => void }) {
  const { theme } = useTheme()
  return (
    <View
      accessibilityRole="tablist"
      // 4A-05: toolbar espejo del web (`NutritionToolbar`, NutritionV2Kit.tsx:169-180) —
      // rounded-card + p-2 + gap-2 + min-h-12; `shadow-sm` web = decisión única del kit
      // (`shadow('sm', scheme)`, ver NutritionCard). Pills conservan min-h-11 (44pt táctil).
      className="min-h-12 flex-row flex-wrap items-center gap-2 rounded-card border border-subtle bg-surface-card p-2"
      style={shadow('sm', theme.scheme)}
    >
      {NUTRITION_V2_TABS.map(({ key, label, Icon }) => {
        const active = key === value
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={label}
            onPress={() => {
              if (!active) {
                void Haptics.selectionAsync()
                onChange(key)
              }
            }}
            className={`min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-control ${active ? 'bg-primary' : ''}`}
          >
            <Icon color={active ? '#FFFFFF' : theme.textSecondary} size={16} />
            <Text className={`text-sm font-semibold ${active ? 'text-white' : 'text-muted'}`}>{label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Plan tab
// ---------------------------------------------------------------------------

function PlanTab({ chrome }: { chrome: ReactNode }) {
  // 4A-01: clearance de la cápsula + minimizado por scroll (ver TodayTab).
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  const onScrollChrome = useAlumnoScrollHandler()
  const [userId, setUserId] = useState<string | null>(null)
  const [plan, setPlan] = useState<NutritionPlanReadModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [offline, setOffline] = useState(false)
  // Día local VIVO (NUT-018): la pestaña Plan también deja de quedar anclada al día del montaje.
  const [date] = useLocalDay(TZ)
  // Día de la semana que se está mirando; `null` = hoy (SPEC nutrition-week-view). Local al tab:
  // el Plan siempre muestra la semana ACTUAL — no navega a semanas viejas, porque el plan que
  // tenemos en memoria es el vigente y proyectarlo hacia atrás sería mentir.
  const [selectedIso, setSelectedIso] = useState<string | null>(null)
  const viewIso = selectedIso ?? date

  const mountedRef = useRef(true)
  const controllerRef = useRef<AbortController | null>(null)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      controllerRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setUserId(data.session?.user.id ?? null)
    })
    return () => {
      active = false
    }
  }, [])

  const load = useCallback(
    async (force = false) => {
      if (!userId) return
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller

      if (!force) {
        const cached = await readNutritionV2Cache({
          userId,
          clientId: userId,
          kind: 'plan',
          scopeKey: date,
          schema: NutritionPlanReadModelSchema,
          allowStale: true,
        })
        if (mountedRef.current && cached) {
          setPlan(cached.payload)
          // `stale` = TTL vencido, no conectividad (ver TodayTab): el banner
          // "Sin conexión" solo lo prende el catch del fetch.
          setLoading(false)
        }
      }

      try {
        const fresh = await getNutritionPlanV2({ date, signal: controller.signal })
        if (!mountedRef.current) return
        setPlan(fresh)
        setOffline(false)
        await writeNutritionV2Cache({ userId, clientId: userId, kind: 'plan', scopeKey: date, payload: fresh })
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        if (mountedRef.current) setOffline(true)
      } finally {
        if (mountedRef.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [date, userId],
  )

  useEffect(() => {
    if (userId) void load()
  }, [load, userId])

  // ── Semana Lu-Do del plan (SPEC nutrition-week-view) ────────────────────────
  // Las 7 variantes ya viajaron en `plan.dayVariants`; el historial de la semana entra solo para
  // que el punto de cada chip diga la verdad ("con registro" / "sin registro"). Reusa el MISMO
  // scope de cache que el tab Hoy: dentro del TTL de 30 min, cambiar de tab no cuesta red.
  const weekStartIso = useMemo(() => nutritionWeekStartIso(date), [date])
  const weekHistory = useNutritionWeekHistory({ userId, weekStartIso })
  const weekVariants = plan?.dayVariants ?? EMPTY_DAY_VARIANTS
  const weekCells = useMemo(
    () =>
      buildNutritionWeek({
        variants: weekVariants,
        history: weekHistory.days,
        weekStartIso,
        todayIso: date,
      }),
    [date, weekHistory.days, weekStartIso, weekVariants],
  )
  const selectedCell = useMemo(
    () => weekCells.find((cell) => cell.isoDate === viewIso) ?? null,
    [viewIso, weekCells],
  )
  const onSelectWeekDay = useCallback(
    (isoDate: string) => {
      void Haptics.selectionAsync()
      // Hoy vuelve a `null`: cruzar la medianoche no debe dejar el Plan anclado a ayer.
      setSelectedIso(isoDate === date ? null : isoDate)
    },
    [date],
  )

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true)
        void load(true)
      }}
      // QA4: mismo tinte de marca que el resto de los pull-to-refresh de la app.
      tintColor={theme.primary}
      colors={[theme.primary]}
    />
  )

  if (loading) {
    return (
      <View className="flex-1 gap-5 px-4">
        {chrome}
        <NutritionSkeleton variant="today" />
      </View>
    )
  }

  if (!plan?.plan) {
    return (
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-5 px-4"
        contentContainerStyle={{ paddingBottom: insets.bottom + ALUMNO_TABBAR_CLEARANCE }}
        onScroll={onScrollChrome}
        scrollEventThrottle={16}
        refreshControl={refreshControl}
      >
        {chrome}
        <NutritionStatePanel
          icon={offline ? 'offline' : 'empty'}
          illustration={offline ? undefined : 'sin-plan'}
          tone={offline ? 'warning' : 'neutral'}
          title={offline ? 'Sin conexión' : 'No hay un plan vigente'}
          description={
            offline
              ? 'No pudimos actualizar tu plan y no hay copia guardada en este dispositivo.'
              : 'El plan aparecerá cuando tu coach publique una versión con fecha efectiva.'
          }
        />
      </ScrollView>
    )
  }

  const summary = plan.plan
  const multiDay = plan.dayVariants.length > 1
  // UNA sola variante visible: la del día elegido, resuelta con la MISMA regla del snapshot que
  // usa el servidor (`buildNutritionWeek` → `resolveNutritionDayVariantForDow`). Antes esta vista
  // apilaba las 7 variantes expandidas (~9.700 px sin selector) y "Metas diarias" mostraba
  // siempre la del día base, aunque hoy tocara otra (F-08).
  const selectedVariant = selectedCell?.variant ?? null
  const selectedDayLabel = selectedCell?.longLabel ?? null

  return (
    <View className="flex-1">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gap-4 px-4"
        contentContainerStyle={{ paddingBottom: insets.bottom + ALUMNO_TABBAR_CLEARANCE }}
        onScroll={onScrollChrome}
        scrollEventThrottle={16}
        // [0] chrome (scrollea) · [1] tira de días (PEGADA) · [2+] contenido.
        stickyHeaderIndices={[1]}
        refreshControl={refreshControl}
      >
        {chrome}
        {/* Tira Lu-Do pegada: el selector no se va de pantalla al bajar por las franjas del día. */}
        <StickyWeekBar>
          <WeekDayNav
            cells={weekCells}
            selectedIso={viewIso}
            onSelect={onSelectWeekDay}
            label="Días del plan"
          />
        </StickyWeekBar>
        {offline ? (
          <View className="items-end">
            <SyncOfflineState state="offline" />
          </View>
        ) : null}

        <NutritionCard>
          <View className="flex-row flex-wrap items-center gap-2">
            <StrategyBadge strategy={summary.strategy} />
          </View>
          <Text className="mt-4 font-display text-2xl font-bold text-strong">{summary.name}</Text>
          <Text className="mt-1 text-xs text-muted">
            Vigente desde {formatNutritionShortDate(summary.effectiveFrom)}
            {summary.effectiveTo ? ` hasta ${formatNutritionShortDate(summary.effectiveTo)}` : ' · versión actual'}
          </Text>
          {/* SPEC nutrition-ui-poda #2 (paridad web T1.3, "Auditoría P2"): fuera el parrafo de
              descripcion de la estrategia — texto de folleto, constante, se lee una vez en la
              vida y no cambia ninguna decision del alumno. */}
          {plan.visibleNotes ? (
            <View className="mt-4 rounded-control border border-subtle bg-surface-sunken p-3">
              <Text className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Notas de tu coach</Text>
              <Text className="mt-1 text-sm leading-6 text-body">{plan.visibleNotes}</Text>
            </View>
          ) : null}
        </NutritionCard>

        {/* Metas del DÍA ELEGIDO (F-08): antes eran siempre las del día base. */}
        {selectedVariant ? (
          <PlanObjectives
            targets={selectedVariant.targets}
            dayLabel={multiDay ? selectedDayLabel : null}
          />
        ) : null}

        <PlanRulesCard permissions={plan.permissions} />

        {selectedVariant ? (
          // SPEC nutrition-ui-poda #2 (regresión RN detectada en auditoría): la tira Lu-Do de
          // arriba (`WeekDayNav`) ya es LA tira del tab Plan — `showWeekStrip` duplicaba una
          // segunda dentro de esta card. `showTargets` duplicaba las mismas 4 metas que
          // `PlanObjectives` (única fuente) ya pintó arriba. Espejo de `FutureDayPreview`, que
          // ya pasaba `false` en los dos.
          <PlanVariantCard
            variant={selectedVariant}
            variants={plan.dayVariants}
            showTargets={false}
            showWeekStrip={false}
            todayIso={date}
          />
        ) : (
          // Plan sin variante para ese día y sin día base: el snapshot tampoco prescribiría nada,
          // así que no se inventa la default (regla 1 de `buildNutritionWeek`).
          <NutritionStatePanel
            icon="empty"
            title={`Tu plan no prescribe nada para el ${(selectedDayLabel ?? 'día').toLowerCase()}`}
            description="Ese día no tiene comidas fijas: sigue tus metas diarias y registra lo que comas."
          />
        )}
      </ScrollView>
    </View>
  )
}

/**
 * "Metas diarias" del día ELEGIDO. `targets` se tipa con la forma mínima compartida
 * (`NutritionWeekTargetsLike`) porque también llega desde una celda de la semana, donde las metas
 * pueden venir del snapshot congelado y no de la variante del plan vigente.
 */
function PlanObjectives({
  targets,
  dayLabel,
}: {
  targets: NutritionWeekTargetsLike | null
  /** Día al que pertenecen estas metas; `null` en planes de un solo día (no hay qué desambiguar). */
  dayLabel?: string | null
}) {
  const rows: { label: string; value: string }[] = []
  if (targets == null) return null
  if (targets.calories != null) rows.push({ label: 'Energía', value: formatNutritionCalories(targets.calories) })
  if (targets.proteinG != null) rows.push({ label: 'Proteína', value: formatNutritionAmount(targets.proteinG, 'g') })
  if (targets.carbsG != null) rows.push({ label: 'Carbohidratos', value: formatNutritionAmount(targets.carbsG, 'g') })
  if (targets.fatsG != null) rows.push({ label: 'Grasas', value: formatNutritionAmount(targets.fatsG, 'g') })
  // SPEC nutrition-ui-poda (paridad web T1.3, "Auditoría P4"): fuera "Fibra" — ningun builder
  // actual escribe `targets.fiberG` (siempre null), era una fila de codigo inalcanzable.
  if (rows.length === 0) return null
  return (
    <NutritionCard>
      <Text className="text-[11px] font-semibold uppercase tracking-wide text-subtle">
        Metas diarias{dayLabel ? ` · ${dayLabel}` : ''}
      </Text>
      <View className="mt-3 flex-row flex-wrap gap-y-3">
        {rows.map((row) => (
          <View key={row.label} className="min-w-[30%] flex-1 pr-2">
            <Text className="font-display text-lg font-bold text-strong" style={{ fontVariant: ['tabular-nums'] }}>
              {row.value}
            </Text>
            <Text className="text-xs text-muted">{row.label}</Text>
          </View>
        ))}
      </View>
    </NutritionCard>
  )
}

// SPEC nutrition-ui-poda (paridad web T1.3, "Auditoría P1"): podado a los 2 permisos que de
// verdad cambian la pantalla del alumno (`canRegisterFreely`, `canAdjustPrescribedQuantity`). Se
// retiraron "Intercambios permitidos" / "Puedes mover comidas de franja" / "Puedes omitir
// opcionales": chips de texto sin setter en ningun builder ni consumidor real en esta pantalla —
// la card prometía reglas que la pantalla no cumplía.
function PlanRulesCard({ permissions }: { permissions: NutritionPlanReadModel['permissions'] }) {
  const chips: string[] = []
  chips.push(permissions.canRegisterFreely ? 'Registro libre habilitado' : 'Solo alimentos prescritos')
  if (permissions.canAdjustPrescribedQuantity) {
    chips.push(
      permissions.quantityAdjustmentPercent != null
        ? `Ajuste de cantidad ±${permissions.quantityAdjustmentPercent}%`
        : 'Ajuste de cantidad permitido',
    )
  }
  return (
    <NutritionCard>
      <Text className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Reglas del plan</Text>
      <View className="mt-3 flex-row flex-wrap gap-2">
        {chips.map((chip) => (
          <View key={chip} className="rounded-pill border border-subtle bg-surface-sunken px-2.5 py-1">
            <Text className="text-xs font-medium text-body">{chip}</Text>
          </View>
        ))}
      </View>
    </NutritionCard>
  )
}

function PlanVariantCard({
  variant,
  variants,
  showTargets,
  showWeekStrip,
  todayIso,
}: {
  variant: PlanVariant
  variants: readonly PlanVariant[]
  showTargets: boolean
  showWeekStrip: boolean
  todayIso: string
}) {
  return (
    <NutritionCard>
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text className="font-display text-lg font-semibold text-strong">{variant.label}</Text>
        {variant.isDefault ? (
          <View className="rounded-pill border border-primary/30 bg-primary/10 px-2 py-0.5">
            <Text className="text-[10px] font-semibold text-primary">Por defecto</Text>
          </View>
        ) : null}
      </View>
      <Text className="mt-1 text-sm text-muted" style={{ fontVariant: ['tabular-nums'] }}>
        {variant.mealSlots.length} franja{variant.mealSlots.length === 1 ? '' : 's'}
        {variant.targets.calories != null ? ` · ${formatNutritionCalories(variant.targets.calories)}` : ''}
      </Text>
      {/* FD3: con un solo día la tira sería ruido; con varios explica qué días le tocan a esta card. */}
      {showWeekStrip ? <DayVariantWeekStrip variants={variants} variant={variant} todayIso={todayIso} /> : null}
      {showTargets ? (
        <View className="mt-2">
          <MacroChipRow
            calories={variant.targets.calories}
            proteinG={variant.targets.proteinG}
            carbsG={variant.targets.carbsG}
            fatsG={variant.targets.fatsG}
            size="sm"
          />
        </View>
      ) : null}
      <View className="mt-2 gap-4">
        {variant.mealSlots.length === 0 ? (
          <Text className="text-sm text-muted">
            Plan sin franjas fijas: sigue tus metas diarias y registra lo que comas.
          </Text>
        ) : (
          variant.mealSlots.map((slot) => <PlanSlotBlock key={slot.id} slot={slot} />)
        )}
      </View>
    </NutritionCard>
  )
}

/** Una franja del plan: encabezado (hora), indicaciones, alimentos prescritos y subtotal. */
function PlanSlotBlock({ slot }: { slot: PlanVariant['mealSlots'][number] }) {
  const timeLabel = slot.startTime ? (slot.endTime ? `${slot.startTime}–${slot.endTime}` : slot.startTime) : null
  const subtotal = slot.prescriptionItems.reduce((sum, item) => sum + (item.macros.calories ?? 0), 0)
  const hasItems = slot.prescriptionItems.length > 0
  // Capa de porciones (P0-3, espejo del fix web): una franja puede prescribir SOLO porciones a
  // elección; sin esto la vista Plan la mostraba como "franja flexible sin alimentos prescritos" y
  // un plan de porciones se veía vacío.
  const hasPortions = (slot.exchangeTargets?.length ?? 0) > 0
  const targetChips =
    slot.targets.calories != null ||
    slot.targets.proteinG != null ||
    slot.targets.carbsG != null ||
    slot.targets.fatsG != null

  return (
    <View className="rounded-control border border-subtle bg-surface-sunken/40 p-3">
      <View className="flex-row items-center justify-between gap-2">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="font-display text-base font-semibold text-strong">{slot.name}</Text>
          {timeLabel ? <Text className="font-mono text-xs text-muted">{timeLabel}</Text> : null}
        </View>
        {hasItems && subtotal > 0 ? (
          <Text className="font-mono text-xs font-semibold text-strong">{formatNutritionCalories(subtotal)}</Text>
        ) : null}
      </View>
      {slot.instructions ? <Text className="mt-1 text-xs leading-5 text-subtle">{slot.instructions}</Text> : null}
      {hasItems ? (
        <View className="mt-2">
          {slot.prescriptionItems.map((item, index) => (
            <View key={item.id} className={index > 0 ? 'border-t border-subtle' : undefined}>
              <FoodRow
                food={{
                  id: item.id,
                  name: item.name ?? 'Alimento prescrito',
                  detail: item.brand,
                  thumbnailUrl: foodMediaThumbnailUrl(item.media),
                  quantityLabel: `${item.quantity} ${item.unit}${item.optional ? ' · opcional' : ''}`,
                  calories: item.macros.calories,
                  proteinG: item.macros.proteinG,
                  carbsG: item.macros.carbsG,
                  fatsG: item.macros.fatsG,
                }}
                fallbackCategory={item.category}
                note={describeItemGuidance(item)}
              />
            </View>
          ))}
        </View>
      ) : targetChips ? (
        <View className="mt-2">
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Objetivo de la franja</Text>
          <View className="mt-1">
            <MacroChipRow
              calories={slot.targets.calories}
              proteinG={slot.targets.proteinG}
              carbsG={slot.targets.carbsG}
              fatsG={slot.targets.fatsG}
              size="sm"
            />
          </View>
        </View>
      ) : null}
      {/* Porciones prescritas: se suman a los alimentos fijos o al objetivo de macros. */}
      <PrescribedPortionChips className="mt-2" targets={slot.exchangeTargets} />
      {!hasItems && !targetChips && !hasPortions ? (
        // El empty-state solo aparece cuando la franja no prescribe NADA (ni items ni porciones).
        <Text className="mt-2 text-xs text-muted">Franja flexible sin alimentos prescritos.</Text>
      ) : null}
    </View>
  )
}

// ---------------------------------------------------------------------------
// History tab
// ---------------------------------------------------------------------------

function HistoryTab({
  chrome,
  /** Abre ese día en el tab "Hoy" en modo lectura (SPEC nutrition-week-view). */
  onOpenDay,
}: {
  chrome: ReactNode
  onOpenDay: (isoDate: string) => void
}) {
  // 4A-01: clearance de la cápsula + minimizado por scroll (ver TodayTab).
  const insets = useSafeAreaInsets()
  const onScrollChrome = useAlumnoScrollHandler()
  const [userId, setUserId] = useState<string | null>(null)
  const [page, setPage] = useState<NutritionHistoryPageReadModel | null>(null)
  const [items, setItems] = useState<NutritionHistoryDay[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [offline, setOffline] = useState(false)
  const [todayIso] = useLocalDay(TZ)

  const mountedRef = useRef(true)
  const controllerRef = useRef<AbortController | null>(null)
  const moreControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      controllerRef.current?.abort()
      moreControllerRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setUserId(data.session?.user.id ?? null)
    })
    return () => {
      active = false
    }
  }, [])

  const loadFirst = useCallback(
    async (force = false) => {
      if (!userId) return
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller

      if (!force) {
        const cached = await readNutritionV2Cache({
          userId,
          clientId: userId,
          kind: 'history',
          scopeKey: 'first-page',
          schema: NutritionHistoryPageReadModelSchema,
          allowStale: true,
        })
        if (mountedRef.current && cached) {
          setPage(cached.payload)
          setItems(cached.payload.items)
          // `stale` = TTL vencido, no conectividad (ver TodayTab): el banner
          // "Sin conexión" solo lo prende el catch del fetch.
          setLoading(false)
        }
      }

      try {
        const fresh = await getNutritionHistoryV2({ pageSize: 14, signal: controller.signal })
        if (!mountedRef.current) return
        setPage(fresh)
        setItems(fresh.items)
        setOffline(false)
        await writeNutritionV2Cache({ userId, clientId: userId, kind: 'history', scopeKey: 'first-page', payload: fresh })
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        if (mountedRef.current) setOffline(true)
      } finally {
        if (mountedRef.current) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [userId],
  )

  const loadMore = useCallback(async () => {
    if (loadingMore || !canLoadMoreHistory(page)) return
    const before = page ? nextHistoryCursor(page) : null
    if (!before) return
    setLoadingMore(true)
    moreControllerRef.current?.abort()
    const controller = new AbortController()
    moreControllerRef.current = controller
    try {
      const next = await getNutritionHistoryV2({ before, pageSize: 14, signal: controller.signal })
      if (!mountedRef.current) return
      setItems((current) => mergeHistoryPages(current, next.items))
      setPage(next)
      setOffline(false)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      if (mountedRef.current) setOffline(true)
    } finally {
      if (mountedRef.current) setLoadingMore(false)
    }
  }, [loadingMore, page])

  useEffect(() => {
    if (userId) void loadFirst()
  }, [loadFirst, userId])

  // SPEC nutrition-ui-poda #4: cards por SEMANA (no por día suelto) con un mini-strip Lu-Do
  // tappable — "la navegación al día ya existe" (mismo `onOpenDay` que usaba cada card diaria).
  // La semana EN CURSO se excluye a propósito: esa la ve el alumno en el tab Hoy (banner de
  // abajo). `buildNutritionWeek` es el MISMO helper puro que arma la tira de Hoy/Plan — ninguna
  // regla de "día con registro" (incluida la legacy) se reescribe acá para el conteo n/7.
  const currentWeekStartIso = useMemo(() => nutritionWeekStartIso(todayIso), [todayIso])
  const weeks = useMemo<NutritionHistoryWeek[]>(() => {
    const order: string[] = []
    const byWeek = new Map<string, NutritionHistoryDay[]>()
    for (const item of items) {
      const weekStartIso = nutritionWeekStartIso(item.localDate)
      if (!weekStartIso || weekStartIso === currentWeekStartIso) continue
      if (!byWeek.has(weekStartIso)) {
        byWeek.set(weekStartIso, [])
        order.push(weekStartIso)
      }
      byWeek.get(weekStartIso)!.push(item)
    }
    // Borde de paginacion (QA H3, paridad web `trimHistoryWeeksPage`): la semana mas VIEJA de lo
    // acumulado puede estar CORTADA por el limite de fechas de la ultima pagina — pintarla haria
    // mentir la pill "N/7". Mientras el servidor tenga mas paginas, esa cola se esconde; el
    // reagrupado de arriba la completa (y la muestra) apenas llegan sus filas por scroll o por el
    // backfill de abajo.
    const emitted = canLoadMoreHistory(page) && order.length > 0 ? order.slice(0, -1) : order
    return emitted.map((weekStartIso) => {
      const cells = buildNutritionWeek<NutritionWeekVariantLike, NutritionHistoryDay>({
        variants: [],
        history: byWeek.get(weekStartIso) ?? [],
        weekStartIso,
        todayIso,
      })
      const loggedCount = cells.filter((cell) => cell.state === 'past-logged').length
      // T2.7 F3: dias de la semana DENTRO del rango de energia ±10% — alimenta la pill de la
      // card y las barras de la tendencia (mismas cuentas que la web, helper compartido).
      const inRangeCount = countEnergyDaysInRange(byWeek.get(weekStartIso) ?? [])
      return { weekStartIso, cells, loggedCount, inRangeCount }
    })
  }, [items, currentWeekStartIso, todayIso, page])

  // Backfill acotado: si la PRIMERA página (14 días) cae entera dentro de la semana en curso
  // (p.ej. hoy es martes), la lista de semanas cerradas queda vacía y no hay overflow para que
  // `onEndReached` dispare solo. Pedimos más páginas hasta que aparezca una semana o el propio
  // cursor del servidor diga que no hay más (`canLoadMoreHistory`) — nunca un timer, nunca polling.
  useEffect(() => {
    if (loading || loadingMore) return
    if (weeks.length > 0) return
    if (!canLoadMoreHistory(page)) return
    void loadMore()
  }, [loading, loadingMore, weeks.length, page, loadMore])

  if (loading) {
    return (
      <View className="flex-1 gap-5 px-4">
        {chrome}
        <NutritionSkeleton variant="history" />
      </View>
    )
  }

  return (
    <FlashList
      data={weeks}
      keyExtractor={(week) => week.weekStartIso}
      onEndReached={() => void loadMore()}
      onEndReachedThreshold={0.4}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true)
        void loadFirst(true)
      }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + ALUMNO_TABBAR_CLEARANCE }}
      onScroll={onScrollChrome}
      scrollEventThrottle={16}
      ItemSeparatorComponent={() => <View className="h-3" />}
      ListHeaderComponent={
        // Historial no tiene tira de días propia (cada semana trae la suya dentro
        // de su card): el chrome simplemente scrollea con la lista.
        <View className="mb-3 gap-5">
          {chrome}
          <Text className="text-xs text-subtle">
            Semanas anteriores — la semana en curso vive en el tab Hoy
          </Text>
          {/* T2.7 F3 (catálogo Alumno 05 #3): el zoom-out ANTES del detalle. */}
          <HistoryTrendCard weeks={weeks} />
        </View>
      }
      ListEmptyComponent={
        <NutritionStatePanel
          icon={offline ? 'offline' : 'empty'}
          illustration={offline ? undefined : 'historial-vacio'}
          tone={offline ? 'warning' : 'neutral'}
          title={offline ? 'Sin conexión' : items.length > 0 ? 'Todavía no hay semanas cerradas' : 'Todavía no hay historial'}
          description={
            offline
              ? 'No pudimos cargar tu historial y no hay copia guardada en este dispositivo.'
              : items.length > 0
                ? 'Esta semana la ves en el tab Hoy. Las semanas anteriores aparecerán aquí a medida que pasen los días.'
                : 'Tus días aparecerán aquí después del primer registro o snapshot del plan.'
          }
        />
      }
      ListFooterComponent={
        loadingMore ? (
          <View className="items-center py-5">
            <Text className="text-sm text-muted">Cargando semanas anteriores…</Text>
          </View>
        ) : null
      }
      renderItem={({ item }) => <WeeklyHistoryCard week={item} onOpenDay={onOpenDay} />}
    />
  )
}

type NutritionHistoryWeek = {
  weekStartIso: string
  cells: NutritionWeekCell<NutritionWeekVariantLike, NutritionHistoryDay>[]
  loggedCount: number
  /** Dias de la semana dentro del rango de energia ±10% (T2.7 F3). */
  inRangeCount: number
}

/** Copy del chip de tendencia — la flecha sola es ambigua para un lector de pantalla. */
const TREND_LABEL = { up: 'tendencia ↑', down: 'tendencia ↓', flat: 'tendencia →' } as const

/**
 * Card "Últimas 4 semanas" (T2.7 F3, espejo del `HistoryTrendCard` web): barras = días en rango
 * de energía por semana, de la más vieja a la más reciente; el chip resume la dirección. Con
 * menos de 2 semanas cerradas no hay tendencia que afirmar y la card no se pinta.
 */
function HistoryTrendCard({ weeks }: { weeks: NutritionHistoryWeek[] }) {
  const { theme } = useTheme()
  // `weeks` llega de la más reciente a la más vieja; la lectura temporal va al revés.
  const oldestToNewest = [...weeks.slice(0, 4)].reverse()
  const trend = energyTrendDirection(oldestToNewest.map((week) => week.inRangeCount))
  if (trend == null) return null

  const rangeOf = (week: NutritionHistoryWeek) => {
    const first = week.cells[0]
    const last = week.cells[week.cells.length - 1]
    return first && last ? `${formatNutritionShortDate(first.isoDate)}–${formatNutritionShortDate(last.isoDate)}` : ''
  }

  return (
    <NutritionCard>
      <View className="flex-row flex-wrap items-baseline justify-between gap-2">
        <Text className="font-display text-base font-semibold text-strong">
          Últimas {oldestToNewest.length} semanas
        </Text>
        <View className={trend === 'up' ? 'rounded-pill bg-success-500/15 px-2.5 py-0.5' : 'rounded-pill bg-surface-sunken px-2.5 py-0.5'}>
          <Text className={trend === 'up' ? 'text-xs font-semibold text-success-700' : 'text-xs font-semibold text-muted'}>
            {TREND_LABEL[trend]}
          </Text>
        </View>
      </View>
      {/* Cada columna lleva su cifra y un track de fondo: sin ellos las barras eran rectangulos
          casi invisibles que no comunicaban la magnitud (QA F1-F3, hallazgo H4 — espejo web). */}
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={`Días en rango por semana: ${oldestToNewest.map((week) => `${week.inRangeCount} de 7`).join(', ')}`}
        className="mt-3 flex-row items-end gap-1.5"
      >
        {oldestToNewest.map((week) => {
          const ratio = week.inRangeCount / 7
          return (
            <View key={week.weekStartIso} className="flex-1 items-center gap-1">
              <Text className="text-[10px] font-semibold text-muted" style={{ fontVariant: ['tabular-nums'] }}>
                {week.inRangeCount}
              </Text>
              <View className="h-11 w-full overflow-hidden rounded-md bg-surface-sunken/60">
                <View
                  className="absolute inset-x-0 bottom-0 rounded-t-md"
                  style={{
                    height: `${Math.max(ratio * 100, 6)}%`,
                    // Hex de 8 digitos (#RRGGBBAA): success al 70% / 40% sin importar helpers.
                    backgroundColor:
                      week.inRangeCount >= 5 ? `${theme.success}B3` : week.inRangeCount >= 3 ? `${theme.success}66` : theme.muted,
                  }}
                />
              </View>
            </View>
          )
        })}
      </View>
      <View className="mt-1 flex-row items-baseline justify-between">
        <Text className="text-[10px] text-subtle">{rangeOf(oldestToNewest[0])}</Text>
        <Text className="text-[10px] text-subtle">{rangeOf(oldestToNewest[oldestToNewest.length - 1])}</Text>
      </View>
    </NutritionCard>
  )
}

function WeeklyHistoryCard({
  week,
  onOpenDay,
}: {
  week: NutritionHistoryWeek
  onOpenDay: (isoDate: string) => void
}) {
  const { theme } = useTheme()
  const total = week.cells.length
  const first = week.cells[0]
  const last = week.cells[total - 1]
  const rangeLabel =
    first && last ? `${formatNutritionShortDate(first.isoDate)} – ${formatNutritionShortDate(last.isoDate)}` : ''
  return (
    <NutritionCard>
      <View className="flex-row flex-wrap items-baseline justify-between gap-2">
        <Text className="font-display text-base font-semibold text-strong" numberOfLines={1}>
          {`Semana ${rangeLabel}`}
        </Text>
        {/* T2.7 F3 (catálogo Alumno 05): la métrica de la card es el RANGO, no el conteo de
            registros — los puntos del strip ya dicen qué días tienen registro. */}
        <View className={week.inRangeCount >= 5 ? 'rounded-pill bg-success-500/15 px-2.5 py-0.5' : 'rounded-pill bg-surface-sunken px-2.5 py-0.5'}>
          <Text
            className={week.inRangeCount >= 5 ? 'text-xs font-semibold text-success-700' : 'text-xs font-semibold text-muted'}
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {`${week.inRangeCount}/7 en rango`}
          </Text>
        </View>
      </View>
      {/* Mini-strip: MISMO `WeekDayNav` de Hoy/Plan — "la navegación al día ya existe", no se
          reinventa el punto de estado ni el toque. `selectedIso=""` porque acá nada está
          "seleccionado": es memoria, no una vista activa. */}
      <WeekDayNav
        cells={week.cells}
        selectedIso=""
        onSelect={(isoDate) => {
          void Haptics.selectionAsync()
          onOpenDay(isoDate)
        }}
        label={`Semana ${rangeLabel}`}
        className="mt-3"
      />
      <View className="mt-2 flex-row items-center gap-1">
        <Text className="text-xs text-subtle">Toca un día para ver qué comiste</Text>
        <ChevronRight color={theme.textSecondary} size={14} />
      </View>
    </NutritionCard>
  )
}
