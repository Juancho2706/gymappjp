import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState, Pressable, RefreshControl, ScrollView, Share, Text, TextInput, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { FlashList } from '@shopify/flash-list'
import { MotiView } from 'moti'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  History,
  Info,
  ListChecks,
  Pencil,
  Plus,
  ScanBarcode,
  Share2,
  Trash2,
  Utensils,
} from 'lucide-react-native'
import {
  AuraHero,
  FoodRow,
  MacroChipRow,
  NutritionCard,
  NutritionHeader,
  NutritionMotionButton,
  NutritionSkeleton,
  NutritionStatePanel,
  PlanVersionBadge,
  StrategyBadge,
  SyncOfflineState,
  CelebrationOverlay,
  type CelebrationInstance,
} from '../../../../components/nutrition-v2'
import { Sheet as ActionSheet } from '../../../../components/Sheet'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ALUMNO_TABBAR_CLEARANCE } from '../../../../components/alumno/AlumnoMobileChrome'
import { useAlumnoScrollHandler } from '../../../../lib/alumno-chrome-scroll'
import { NutritionDomainOff } from '../../../../components/alumno/nutrition'
import {
  PortionDayCoverageRow,
  PortionEquivalencesSheet,
  PortionSlotSection,
  PortionSnackbar,
  type PortionSnackbarState,
  coverageViewFor,
  usePortionMarks,
} from '../../../../components/alumno/nutrition-v2'
import type {
  PendingPortionMark,
  PendingPortionVoid,
  PortionCoverageView,
} from '../../../../lib/nutrition-v2-portions'
import {
  NUTRITION_MOTION,
  BULK_MARK_COMPLETE_LABEL,
  type BulkMarkSlotState,
  NUTRITION_ITEM_SUBSTITUTION_SELECT,
  NUTRITION_STRATEGIES,
  type NutritionSlotExchangeTargetRead,
  NutritionHistoryPageReadModelSchema,
  NutritionPlanReadModelSchema,
  NutritionTodayReadModelSchema,
  buildNutritionDayShareText,
  bulkMarkCtaLabel,
  bulkMarkSlotState,
  consumedPrescriptionItemIds,
  describeLegacyHistoryDay,
  energyGoalReached,
  firstNameFromFullName,
  formatNutritionAmount,
  formatNutritionCalories,
  mapNutritionItemSubstitutionRow,
  type NutritionFoodRowModel,
  type NutritionItemSubstitutionRead,
  type NutritionHistoryDay,
  type NutritionHistoryPageReadModel,
  type NutritionIntakeReadItem,
  type NutritionMealSlotRead,
  type NutritionPlanReadModel,
  type NutritionTodayReadModel,
} from '@eva/nutrition-v2'
import { supabase } from '../../../../lib/supabase'
import { humanizeStudentWriteError } from '../../../../lib/student-access-copy'
import { formatNutritionShortDate } from '../../../../lib/date-utils'
import { foodMediaThumbnailUrl } from '../../../../lib/nutrition-v2-food-media'
import { isEnabled } from '../../../../lib/flags'
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
  type NutritionV2QueuedMutation,
} from '../../../../lib/nutrition-v2-offline'
import {
  buildAteAsPrescribedMutation,
  buildEditIntakeCorrection,
  buildVoidIntakeCorrection,
  computeIntakeTotals,
  optimisticIntakeRow,
  type OptimisticNutritionFoodRowModel,
  type NutritionIntakeTotals,
} from '../../../../lib/nutrition-v2-intake'
import {
  getStableDeviceId,
  newNutritionV2OperationId,
  submitCorrectIntake,
  submitRecordIntake,
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
  historyDayHasDetail,
  historyDayIsLegacy,
  mergeHistoryPages,
  nextHistoryCursor,
} from '../../../../lib/nutrition-v2-history'

const TZ = 'America/Santiago'

function todayInSantiago(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

interface OptimisticOverlay {
  addedBySlot: Record<string, OptimisticNutritionFoodRowModel[]>
  addedUnassigned: OptimisticNutritionFoodRowModel[]
  hiddenIds: string[]
}

type EntryCorrectionAction = {
  kind: 'edit' | 'void'
  entry: NutritionIntakeReadItem
}

const EMPTY_OVERLAY: OptimisticOverlay = { addedBySlot: {}, addedUnassigned: [], hiddenIds: [] }
// Constantes de referencia ESTABLE para props de cards memoizadas (hallazgo M3):
// `?? []` inline crearía un array nuevo por render y rompería React.memo.
const EMPTY_PORTION_MARKS: PendingPortionMark[] = []
const EMPTY_PORTION_VOIDS: PendingPortionVoid[] = []
// Referencia estable para el lookup de reemplazos por item (F-02): `?? []` inline rompería memo.
const EMPTY_SUBSTITUTIONS: NutritionItemSubstitutionRead[] = []

/**
 * Reconstruye la representación optimista de records/correcciones normales desde
 * la cola autoritativa. Las marcas sintéticas de porciones tienen su propio lente
 * (`usePortionMarks`) y se excluyen para no mostrarlas como alimentos consumidos.
 */
function queuedIntakeOverlay(
  queued: ReadonlyArray<NutritionV2QueuedMutation>,
  localDate: string,
): OptimisticOverlay {
  const records: NutritionV2QueuedMutation[] = []
  const corrections = new Map<string, NutritionV2QueuedMutation>()

  for (const item of queued) {
    if (item.payload.localDate !== localDate) continue
    if (item.action === 'correct') corrections.set(item.payload.correctsEntryId, item)
    else if (!item.payload.snapshot.exchangeGroupCode) records.push(item)
  }

  const overlay: OptimisticOverlay = { addedBySlot: {}, addedUnassigned: [], hiddenIds: [] }
  const append = (item: NutritionV2QueuedMutation) => {
    const payload = item.payload
    const totals = computeIntakeTotals(payload.quantity, payload.unit, payload.snapshot)
    const row = optimisticIntakeRow({
      id: `queued-${item.idempotencyKey}`,
      name: payload.snapshot.name,
      brand: payload.snapshot.brand,
      quantity: payload.quantity,
      unit: payload.unit,
      status: 'offline',
      totals,
    })
    if (payload.mealSlot) {
      overlay.addedBySlot[payload.mealSlot] = [...(overlay.addedBySlot[payload.mealSlot] ?? []), row]
    } else {
      overlay.addedUnassigned.push(row)
    }
  }

  records.forEach(append)
  for (const [correctsEntryId, item] of corrections) {
    overlay.hiddenIds.push(correctsEntryId)
    // El void conserva auditoría con una corrección de aporte cero, pero no se
    // representa como una fila consumida. Una edición sí muestra su reemplazo.
    if (item.payload.note !== 'Registro retirado' && !item.payload.snapshot.exchangeGroupCode) append(item)
  }
  return overlay
}

function TodayTab() {
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
    ReadonlyMap<string, NutritionItemSubstitutionRead[]>
  >(() => new Map())
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
  const date = useMemo(todayInSantiago, [])
  const enabled = entitlements.ready && isEnabled('nutritionV2Student')

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
        setOffline(cached.stale)
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

  useFocusEffect(
    useCallback(() => {
      if (userId && enabled) void load(true)
    }, [enabled, load, userId]),
  )

  useEffect(() => {
    if (!userId || !enabled) return
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void load(true)
    })
    return () => subscription.remove()
  }, [enabled, load, userId])

  // Una edición/retiro/alta aceptada offline debe sobrevivir remount, focus y
  // reinicio. La cola es la única fuente persistida; no duplicamos estado local.
  useEffect(() => {
    if (!userId || !enabled) return
    let active = true
    void getNutritionV2QueuedMutations(userId)
      .then((queued) => {
        if (active && mountedRef.current) setOverlay(queuedIntakeOverlay(queued, date))
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [date, enabled, model, pending, userId])

  // Reemplazos autorizados (F-02): UN select directo RLS-scoped por versión publicada del plan del
  // Today, agrupado por item. Best-effort: cualquier error o falta de versión deja el mapa vacío
  // (la UI simplemente no muestra la línea de reemplazos). No toca el hot-path del read-model.
  const planVersionId = model?.plan?.versionId ?? null
  useEffect(() => {
    if (!planVersionId || !enabled) {
      setSubstitutionsByItemId((prev) => (prev.size === 0 ? prev : new Map()))
      return
    }
    setSubstitutionsByItemId((prev) => (prev.size === 0 ? prev : new Map()))
    let active = true
    void (async () => {
      const { data, error } = await supabase
        .from('nutrition_item_substitutions_v2')
        .select(NUTRITION_ITEM_SUBSTITUTION_SELECT)
        .eq('version_id', planVersionId)
        .order('order_index', { ascending: true })
      if (!active || !mountedRef.current) return
      if (error || !data) {
        setSubstitutionsByItemId((prev) => (prev.size === 0 ? prev : new Map()))
        return
      }
      const grouped = new Map<string, NutritionItemSubstitutionRead[]>()
      for (const row of data as Parameters<typeof mapNutritionItemSubstitutionRow>[0][]) {
        const mapped = mapNutritionItemSubstitutionRow(row)
        const bucket = grouped.get(mapped.prescriptionItemId) ?? []
        bucket.push(mapped)
        grouped.set(mapped.prescriptionItemId, bucket)
      }
      setSubstitutionsByItemId(grouped)
    })()
    return () => {
      active = false
    }
  }, [planVersionId, enabled])

  const refreshPending = useCallback(async () => {
    if (!userId) return
    const q = await getNutritionV2QueueStatus(userId)
    if (mountedRef.current) setPending(q.pending)
  }, [userId])

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
  // Set de items prescritos ya consumidos (misma verdad que la web): alimenta el medidor de
  // progreso por franja y el estado del control de registro en bloque. Deriva del snapshot del
  // servidor (`model`), no del overlay optimista, así se estabiliza tras cada `load(true)`.
  const consumedIds = useMemo(
    () => (model ? consumedPrescriptionItemIds(model) : new Set<string>()),
    [model],
  )

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

  const markRowOffline = useCallback((slotCode: string | null, id: string) => {
    const patch = (rows: OptimisticNutritionFoodRowModel[]) => rows.map((r) => (r.id === id ? { ...r, status: 'offline' as const } : r))
    setOverlay((prev) =>
      slotCode
        ? { ...prev, addedBySlot: { ...prev.addedBySlot, [slotCode]: patch(prev.addedBySlot[slotCode] ?? []) } }
        : { ...prev, addedUnassigned: patch(prev.addedUnassigned) },
    )
  }, [])

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
      const operationId = newNutritionV2OperationId()
      const tempId = `opt-${operationId}`
      const totals: NutritionIntakeTotals = computeIntakeTotals(item.quantity, item.unit, {
        calories: item.macros.calories,
        proteinG: item.macros.proteinG,
        carbsG: item.macros.carbsG,
        fatsG: item.macros.fatsG,
        fiberG: item.macros.fiberG,
        servingSize: null,
      })
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
      setEatingId((cur) => (cur === item.id ? null : cur))
      if (outcome.status === 'recorded') {
        void (async () => {
          const claimed = await claimMealLoggedCelebration(userId, date)
          const decision = decideMealLoggedCelebration(!claimed)
          if (decision && mountedRef.current) fireCelebration(decision)
        })()
        void load(true)
      } else if (outcome.status === 'queued') {
        markRowOffline(slot.code, tempId)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        await refreshPending()
      } else {
        removeRow(slot.code, tempId)
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
        const payload = buildVoidIntakeCorrection({
          clientId: userId,
          deviceId,
          operationId: newNutritionV2OperationId(),
          localDate: date,
          timezone: TZ,
          entry,
          planVersionId: model?.plan?.versionId ?? null,
          daySnapshotId: model?.snapshotId ?? null,
          reason,
        })
        setHidden(entry.id, true)
        const outcome = await submitCorrectIntake(userId, payload)
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
    [date, deviceId, load, model, refreshPending, setHidden, userId],
  )

  // ── Snackbar del bulk-mark (mismo componente que porciones, estado propio) ──
  const dismissBulkSnackbar = useCallback(() => {
    if (bulkSnackbarTimer.current) clearTimeout(bulkSnackbarTimer.current)
    setBulkSnackbar(null)
  }, [])

  const showBulkSnackbar = useCallback((next: Omit<PortionSnackbarState, 'nonce'>) => {
    bulkSnackbarNonce.current += 1
    setBulkSnackbar({ ...next, nonce: bulkSnackbarNonce.current })
    if (bulkSnackbarTimer.current) clearTimeout(bulkSnackbarTimer.current)
    bulkSnackbarTimer.current = setTimeout(() => {
      if (mountedRef.current) setBulkSnackbar(null)
    }, 6000)
  }, [])

  useEffect(
    () => () => {
      if (bulkSnackbarTimer.current) clearTimeout(bulkSnackbarTimer.current)
    },
    [],
  )

  // Deshacer una tanda: anula (corrección de aporte CERO) cada registro creado por el bulk, vía el
  // MISMO runner de void del "Retirar" individual. Recibe entries sintetizados con el id REAL
  // devuelto por el servidor (correctsEntryId), así no depende del refetch para poder deshacer.
  const onBulkUndo = useCallback(
    async (slotName: string, entries: NutritionIntakeReadItem[]) => {
      if (!userId || !deviceId || entries.length === 0) return
      dismissBulkSnackbar()
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      let undone = 0
      let queued = 0
      for (const entry of entries) {
        setHidden(entry.id, true)
        const payload = buildVoidIntakeCorrection({
          clientId: userId,
          deviceId,
          operationId: newNutritionV2OperationId(),
          localDate: date,
          timezone: TZ,
          entry,
          planVersionId: model?.plan?.versionId ?? null,
          daySnapshotId: model?.snapshotId ?? null,
          reason: 'Deshacer registro de la comida',
        })
        const outcome = await submitCorrectIntake(userId, payload)
        if (!mountedRef.current) return
        if (outcome.status === 'recorded') undone += 1
        else if (outcome.status === 'queued') queued += 1
        else {
          setHidden(entry.id, false)
        }
      }
      if (!mountedRef.current) return
      if (undone > 0) void load(true)
      if (queued > 0) await refreshPending()
      if (undone === 0 && queued === 0) {
        showBulkSnackbar({
          message: 'No se pudo deshacer. Retira los registros uno por uno en la comida.',
          tone: 'danger',
        })
      } else {
        showBulkSnackbar({ message: `Deshice el registro de ${slotName}.` })
      }
    },
    [date, deviceId, dismissBulkSnackbar, load, model, refreshPending, setHidden, showBulkSnackbar, userId],
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
      const nowIso = new Date().toISOString()

      for (const item of eligible) {
        const operationId = newNutritionV2OperationId()
        const tempId = `opt-${operationId}`
        const totals: NutritionIntakeTotals = computeIntakeTotals(item.quantity, item.unit, {
          calories: item.macros.calories,
          proteinG: item.macros.proteinG,
          carbsG: item.macros.carbsG,
          fatsG: item.macros.fatsG,
          fiberG: item.macros.fiberG,
          servingSize: null,
        })
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
          markRowOffline(slot.code, tempId)
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

      // Feedback + "Deshacer" transitorio.
      if (recorded === 0 && queued === 0) {
        showBulkSnackbar({ message: `No se pudo registrar tu ${slot.name}.`, tone: 'danger' })
        return
      }
      if (recorded === 0 && queued > 0) {
        showBulkSnackbar({
          message: `Guardé tu ${slot.name} sin conexión.`,
          detail: 'Se registrará cuando vuelvas a tener internet.',
        })
        return
      }
      const leftover = eligible.length - recorded - queued
      showBulkSnackbar({
        message: `Registraste tu ${slot.name}`,
        detail: leftover > 0 ? `Registré ${recorded} de ${eligible.length}. Quedaron ${leftover}.` : null,
        actionLabel: undoEntries.length > 0 ? 'Deshacer' : null,
        onAction: undoEntries.length > 0 ? () => void onBulkUndo(slot.name, undoEntries) : null,
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
          markRowOffline(entry.mealSlot, tempId)
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
    (slot?: NutritionMealSlotRead) => {
      router.push({
        pathname: '/alumno/nutrition-v2/add-food-v2',
        params: slot ? { slot: slot.code, slotName: slot.name } : {},
      })
    },
    [router],
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

  // 4A-02: sin plan vigente publicado, la vista Hoy COMPLETA se reemplaza por el panel
  // sin-plan con los copys exactos de la web (page.tsx:153-162). Con `livePlan` aún
  // desconocido (offline sin cache del plan) se muestra la vista normal — adaptación
  // offline-first documentada: la web nunca renderiza sin resolver el plan.
  if (livePlan && !livePlan.plan) {
    return (
      <ScrollView
        className="flex-1 bg-surface-app"
        contentContainerClassName="px-4 pt-5"
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
          />
        }
      >
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

  // 4A-02: copia RN de slotsWithPrescribedContent (web portion-marks.logic.ts:357-363):
  // solo franjas con items fijos O con targets de porciones aparecen en "Tu plan de hoy".
  const slotsWithPrescription = model.mealSlots.filter(
    (slot) => slot.prescriptionItems.length > 0 || (slot.exchangeTargets?.length ?? 0) > 0,
  )

  // 4A-02: "Consumido hoy" agregado (web TodayExperience.tsx:274-323): TODOS los registros
  // activos del día (franjas + sin franja) ordenados por hora (consumedEntries,
  // nutrition-today.logic.ts:55-59) + las filas optimistas de la cola offline nativa al final.
  const consumedRows: Array<{ row: NutritionFoodRowModel; entry: NutritionIntakeReadItem | null }> = [
    ...[...model.mealSlots.flatMap((slot) => slot.intakeItems), ...model.unassignedIntake]
      .filter((entry) => !hiddenSet.has(entry.id))
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
      .map((entry) => ({ row: intakeToRow(entry), entry })),
    ...Object.values(overlay.addedBySlot)
      .flat()
      .map((row) => ({ row, entry: null })),
    ...overlay.addedUnassigned.map((row) => ({ row, entry: null })),
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
        contentContainerClassName="gap-5 px-4 pt-5"
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
          />
        }
      >
        {showTodayPlanLag ? (
          // Banner de lag del plan (web page.tsx:172-177): Info muted sobre superficie hundida.
          <View className="flex-row items-start gap-2 rounded-control border border-border-subtle bg-surface-sunken px-4 py-3">
            <Info color={theme.textSecondary} size={16} style={{ marginTop: 2 }} />
            <Text className="min-w-0 flex-1 text-sm leading-5 text-text-body">{lagMessage}</Text>
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

        {model.plan || model.snapshotId ? (
          // Fila de badges + chip "Día registrado" (web TodayExperience.tsx:185-200).
          <View className="flex-row flex-wrap items-center gap-2">
            {model.plan ? <StrategyBadge strategy={model.plan.strategy} /> : null}
            {model.plan ? (
              <PlanVersionBadge
                version={model.plan.versionNumber}
                status={model.plan.status}
                effectiveLabel={`desde ${formatNutritionShortDate(model.plan.effectiveFrom)}`}
              />
            ) : null}
            {model.snapshotId ? (
              // Chip esmeralda del canvas web → tono success del kit RN (contrato white-label).
              <View className="flex-row items-center gap-1.5 rounded-pill border border-success-500/30 bg-success-500/10 px-2.5 py-1">
                <CheckCircle2 color={theme.success} size={14} />
                <Text className="text-xs font-semibold text-success-700">Día registrado</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <AuraHero
          greetingName={firstNameFromFullName(clientName)}
          calories={{ consumed: consumed.calories, target: model.targets.calories }}
          macros={{
            protein: { consumed: consumed.proteinG, target: model.targets.proteinG },
            carbs: { consumed: consumed.carbsG, target: model.targets.carbsG },
            fats: { consumed: consumed.fatsG, target: model.targets.fatsG },
          }}
        />

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

        {/* Fila de CTAs (web TodayExperience.tsx:228-248): Registrar + Escanear + Compartir. */}
        <View className="flex-row flex-wrap gap-2">
          <TodayCta Icon={Plus} label="Registrar alimento" tone="nutrition" onPress={() => onRegister()} />
          <TodayCta
            Icon={ScanBarcode}
            label="Escanear"
            tone="neutral"
            onPress={() => router.push('/alumno/nutrition-v2/scanner')}
          />
          <TodayCta Icon={Share2} label="Compartir" tone="neutral" onPress={() => void onShareDay()} />
        </View>

        {slotsWithPrescription.length > 0 ? (
          // "Tu plan de hoy" (web TodayExperience.tsx:561-640): sin sección si no hay franjas
          // con prescripción (PrescribedSection retorna null, TodayExperience.tsx:582).
          <View accessibilityLabel="Tu plan de hoy" className="gap-3">
            <Text className="font-display text-lg font-semibold text-text-strong">Tu plan de hoy</Text>
            {slotsWithPrescription.map((slot) => (
              <TodaySlotCard
                key={slot.id}
                slot={slot}
                today={model}
                consumedIds={consumedIds}
                substitutionsByItemId={substitutionsByItemId}
                eatingId={eatingId}
                onAte={onAtePrescribed}
                onBulkAte={onBulkAte}
                bulkBusy={bulkBusySlot === slot.code}
                portionPending={portions.pendingBySlot[slot.code] ?? EMPTY_PORTION_MARKS}
                portionVoids={portions.voidsBySlot[slot.code] ?? EMPTY_PORTION_VOIDS}
                onMarkPortion={portions.mark}
                onOpenEquivalences={onOpenEquivalences}
              />
            ))}
          </View>
        ) : null}

        {/* "Consumido hoy" agregado (web TodayExperience.tsx:274-323). */}
        <View accessibilityLabel="Consumido hoy" className="gap-3">
          <View className="flex-row items-center gap-2">
            <Utensils color={theme.primary} size={16} />
            <Text className="font-display text-lg font-semibold text-text-strong">Consumido hoy</Text>
          </View>
          {consumedRows.length === 0 ? (
            <NutritionStatePanel
              icon="empty"
              title="Todavía no registras alimentos"
              description="Marca lo que comiste del plan o agrega un alimento libre para llenar tu presupuesto del día."
            />
          ) : (
            <NutritionCard>
              {consumedRows.map(({ row, entry }, index) => (
                <View key={row.id} className={index > 0 ? 'border-t border-border-subtle' : undefined}>
                  <FoodRow
                    food={row}
                    fallbackCategory={entry?.category}
                    actions={
                      entry ? (
                        // Icon-buttons lápiz/papelera: cada uno abre su corrección dedicada,
                        // igual que EditQuantityDialog/VoidEntryDialog en web (4A-06).
                        <View className="flex-row items-center gap-1">
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
                      ) : undefined
                    }
                  />
                </View>
              ))}
            </NutritionCard>
          )}
        </View>
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
      <PortionEquivalencesSheet
        open={equivOpen}
        targets={equivTargets}
        exchangeFoods={model.exchangeFoods ?? []}
        views={equivViews}
        onClose={() => setEquivOpen(null)}
        onMark={onSheetMark}
        onRegister={onSheetRegister}
      />
      <PortionSnackbar state={portions.snackbar} onDismiss={portions.dismissSnackbar} />
      <PortionSnackbar state={bulkSnackbar} onDismiss={dismissBulkSnackbar} />
      <CelebrationOverlay celebration={celebration} onDone={() => setCelebration(null)} />
    </>
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
// (web: border-border-default bg-surface-card text-strong). El NutritionMotionButton del kit
// RN renderiza children dentro de <Text> y no admite ícono, así que la fila se arma local
// con la misma motion de presión (NUTRITION_MOTION.press) y háptica del kit.
function TodayCta({
  Icon,
  label,
  tone,
  onPress,
}: {
  Icon: typeof Plus
  label: string
  tone: 'nutrition' | 'neutral'
  onPress: () => void
}) {
  const { theme } = useTheme()
  const { reduced, duration } = useEvaMotion()
  const [pressed, setPressed] = useState(false)
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
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
          className={`min-h-11 flex-row items-center justify-center gap-2 rounded-control border px-4 ${
            tone === 'nutrition' ? 'border-primary bg-primary' : 'border-border-default bg-surface-card'
          }`}
          style={shadow('sm', theme.scheme)}
        >
          <Icon
            className={tone === 'nutrition' ? 'text-white' : undefined}
            color={tone === 'nutrition' ? undefined : theme.foreground}
            size={16}
          />
          <Text className={`text-sm font-semibold ${tone === 'nutrition' ? 'text-white' : 'text-text-strong'}`}>
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
    snapshot: {
      name: item.name ?? 'Alimento prescrito',
      brand: item.brand,
      calories: item.macros.calories,
      proteinG: item.macros.proteinG,
      carbsG: item.macros.carbsG,
      fatsG: item.macros.fatsG,
      fiberG: item.macros.fiberG,
      servingSize: null,
      servingUnit: item.unit,
    },
    totals: { calories: 0, proteinG: 0, carbsG: 0, fatsG: 0, fiberG: 0 },
  }
}

// 4A-02: card de franja de "Tu plan de hoy" 1:1 con la web. Conserva la jerarquía compacta
// del rediseño y suma progreso, bulk-mark y reemplazos estructurados. Memoizada: marcar una
// porción solo cambia `portionPending`/`portionVoids` de SU franja.
const TodaySlotCard = memo(function TodaySlotCard({
  slot,
  today,
  consumedIds,
  substitutionsByItemId,
  eatingId,
  onAte,
  onBulkAte,
  bulkBusy,
  portionPending,
  portionVoids,
  onMarkPortion,
  onOpenEquivalences,
}: {
  slot: NutritionMealSlotRead
  today: NutritionTodayReadModel
  consumedIds: Set<string>
  substitutionsByItemId: ReadonlyMap<string, NutritionItemSubstitutionRead[]>
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
}) {
  const { theme } = useTheme()
  const bulk = bulkMarkSlotState(today, slot, consumedIds)
  return (
    <NutritionCard>
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text className="font-display text-base font-semibold text-text-strong">{slot.name}</Text>
        {slot.startTime ? <Text className="font-mono text-xs text-text-muted">{slot.startTime}</Text> : null}
      </View>

      {bulk.requiredTotal > 0 ? (
        <View className="mt-2">
          <MealProgressMeter consumed={bulk.requiredConsumed} total={bulk.requiredTotal} />
        </View>
      ) : null}

      {slot.prescriptionItems.length > 0 ? (
        <View className="mt-3">
          {slot.prescriptionItems.map((item, index) => {
            const subs = substitutionsByItemId.get(item.id) ?? EMPTY_SUBSTITUTIONS
            const consumed = consumedIds.has(item.id)
            const rawNote = item.notes?.trim() || null
            const displayNote = subs.length > 0 && rawNote?.startsWith('Alternativas:') ? null : rawNote
            return (
              <View key={item.id} className={index > 0 ? 'border-t border-border-subtle' : undefined}>
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
                  note={displayNote}
                  actions={
                    consumed ? (
                      // Estado "Registrado" (web TodayExperience.tsx:608-611): check esmeralda
                      // del canvas web → tono success del kit RN (contrato white-label).
                      <View className="flex-row items-center gap-1">
                        <CheckCircle2 color={theme.success} size={16} />
                        <Text className="text-xs font-semibold text-success-700">Registrado</Text>
                      </View>
                    ) : (
                      <NutritionMotionButton
                        accessibilityLabel={`Lo comí: ${item.name ?? 'alimento prescrito'}`}
                        tone="success"
                        pending={eatingId === item.id}
                        onPress={() => onAte(slot, item)}
                      >
                        Lo comí
                      </NutritionMotionButton>
                    )
                  }
                />
                <ItemSubstitutionsHint substitutions={subs} />
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
        complete ? 'border-success-500/30 bg-success-500/10' : 'border-border-subtle bg-surface-sunken'
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
      <Text className={`font-mono text-[11px] font-semibold ${complete ? 'text-success-700' : 'text-text-muted'}`}>
        {complete ? 'Completa' : `${consumed}/${total}`}
      </Text>
    </View>
  )
}

/**
 * Reemplazos autorizados por el coach (F-02), alineados con la fila web: título + pills
 * individuales con kcal congelada. Solo lectura; el registro interactivo es un fast-follow.
 */
function ItemSubstitutionsHint({ substitutions }: { substitutions: NutritionItemSubstitutionRead[] }) {
  if (substitutions.length === 0) return null
  return (
    <View className="pb-3 pl-14">
      <Text className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle">Puedes reemplazar por</Text>
      <View accessibilityLabel="Reemplazos autorizados por tu coach" className="mt-1 flex-row flex-wrap gap-1.5">
        {substitutions.map((sub) => (
          <View
            key={sub.id}
            className="flex-row items-center gap-1 rounded-pill border border-border-subtle bg-surface-sunken px-2.5 py-1"
          >
            <Text className="text-xs font-medium text-text-body">{sub.name}</Text>
            {sub.macros.calories != null ? (
              <Text className="font-mono text-xs text-text-muted">· {formatNutritionCalories(sub.macros.calories)}</Text>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  )
}

/**
 * Control de registro en bloque de una franja. Estados (del helper puro compartido):
 *  - none-required → nada (la franja no tiene items requeridos; p. ej. solo-porciones).
 *  - complete      → banner "Comida completa" (sin acción).
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
  const { theme } = useTheme()
  if (state.status === 'none-required') return null
  if (state.status === 'complete') {
    return (
      <View className="mt-3 flex-row items-center justify-center gap-2 rounded-control border border-success-500/30 bg-success-500/10 px-4 py-2.5">
        <Check color={theme.success} size={16} />
        <Text className="text-sm font-semibold text-success-700">{BULK_MARK_COMPLETE_LABEL}</Text>
      </View>
    )
  }
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
  const [reason, setReason] = useState('')
  const entry = action?.entry ?? null

  useEffect(() => {
    setQuantity(entry ? String(entry.quantity) : '')
    setReason('')
  }, [action, entry])

  const parsed = Number(quantity.replace(',', '.'))
  const validQuantity = Number.isFinite(parsed) && parsed > 0
  const validReason = reason.trim().length >= 3 && reason.trim().length <= 1000
  const canSubmit = validReason && (action?.kind === 'void' || validQuantity)
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
            if (!canSubmit) return
            if (action.kind === 'edit') onEdit(entry, parsed, reason.trim())
            else onVoid(entry, reason.trim())
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
      snapPoints={[action?.kind === 'edit' ? '72%' : '62%']}
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
              <Text className="mb-1 text-xs font-semibold text-text-muted">Nueva cantidad ({entry.unit})</Text>
              <TextInput
                accessibilityLabel={`Nueva cantidad en ${entry.unit}`}
                accessibilityHint="Ingresa un número mayor que cero"
                className="min-h-12 w-full rounded-control border border-border-default bg-surface-app px-3 text-base text-text-strong"
                editable={!pending}
                inputMode="decimal"
                keyboardType="decimal-pad"
                onChangeText={(value) => setQuantity(value.replace(/[^0-9.,]/g, ''))}
                selectTextOnFocus
                value={quantity}
              />
            </View>
          ) : (
            <Text className="text-sm leading-5 text-text-body">
              El registro dejará de contar en tu día, pero se conserva en el historial para tu coach.
            </Text>
          )}

          <View>
            <Text className="mb-1 text-xs font-semibold text-text-muted">
              {action.kind === 'edit' ? 'Motivo del cambio' : 'Motivo'}
            </Text>
            <TextInput
              accessibilityLabel={action.kind === 'edit' ? 'Motivo del cambio' : 'Motivo del retiro'}
              accessibilityHint="Escribe al menos tres caracteres"
              className="min-h-12 w-full rounded-control border border-border-default bg-surface-app px-3 text-base text-text-strong"
              editable={!pending}
              maxLength={1000}
              onChangeText={setReason}
              placeholder={action.kind === 'edit' ? 'Ej: comí un poco menos' : 'Ej: lo registré por error'}
              placeholderTextColor={theme.mutedForeground}
              returnKeyType="done"
              value={reason}
            />
            <Text className="mt-1 text-[11px] leading-4 text-text-subtle">
              {action.kind === 'edit'
                ? 'Mínimo 3 caracteres. Se conserva el registro original.'
                : 'Mínimo 3 caracteres.'}
            </Text>
          </View>
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
type DayDetailState = { loading: boolean; model: NutritionTodayReadModel | null; offline: boolean }

export default function StudentNutritionV2Screen() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const entitlements = useEntitlements()
  const enabled = entitlements.ready && isEnabled('nutritionV2Student')
  const { reduced, duration } = useEvaMotion()
  const [tab, setTab] = useState<NutritionV2Tab>('today')

  // 4A-01: gate del flag, espejo EXACTO de la ruta web /nutrition-v2
  // (nutrition-v2/page.tsx:48-56): con `nutritionV2Student` OFF la web hace
  // `redirect(`${base}/nutrition`)`; aquí replaza al tab `nutricion` (V1) al ganar
  // foco. Sin loop posible: el gate del tab solo redirige V1→V2 con el MISMO flag ON.
  const fallbackToV1 = entitlements.ready && !isEnabled('nutritionV2Student')
  useFocusEffect(
    useCallback(() => {
      if (fallbackToV1) router.replace('/alumno/nutricion')
    }, [fallbackToV1, router]),
  )

  if (!entitlements.ready || !enabled) {
    // Pre-hidratación de entitlements o transición del replace a V1: skeleton
    // neutro (la web no pinta contenido en ninguno de los dos casos).
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

  return (
    <View className="flex-1 bg-surface-app">
      <View
        className="gap-4 px-4 pb-3"
        style={{ paddingTop: insets.top + 20 }}
      >
        {/* Header 1:1 web (nutrition-v2/page.tsx:62-65): título "Nutrición" +
            descripción, SIN eyebrow. Adaptación documentada: la web muestra
            flecha de volver (`backHref={base}/dashboard`, NutritionV2Kit.tsx:122-150)
            porque /nutrition-v2 es una página; aquí la superficie ES el tab
            Nutrición y los tabs RN no tienen back — la flecha se omite. */}
        <NutritionHeader
          title="Nutrición"
          description="Prescripción, consumo real e historial en una sola experiencia."
        />
        <NutritionTabBar value={tab} onChange={setTab} />
      </View>
      <MotiView
        key={tab}
        className="flex-1"
        from={reduced ? undefined : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ type: 'timing', duration: duration('base') }}
      >
        {tab === 'today' ? <TodayTab /> : null}
        {tab === 'plan' ? <PlanTab /> : null}
        {tab === 'history' ? <HistoryTab /> : null}
      </MotiView>
    </View>
  )
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
      className="flex-row gap-1 rounded-control border border-border-subtle bg-surface-card p-1"
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
            className={`min-h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-control ${active ? 'bg-primary' : ''}`}
          >
            <Icon color={active ? '#FFFFFF' : theme.textSecondary} size={16} />
            <Text className={`text-sm font-semibold ${active ? 'text-white' : 'text-text-muted'}`}>{label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Plan tab
// ---------------------------------------------------------------------------

function PlanTab() {
  // 4A-01: clearance de la cápsula + minimizado por scroll (ver TodayTab).
  const insets = useSafeAreaInsets()
  const onScrollChrome = useAlumnoScrollHandler()
  const [userId, setUserId] = useState<string | null>(null)
  const [plan, setPlan] = useState<NutritionPlanReadModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [offline, setOffline] = useState(false)
  const date = useMemo(todayInSantiago, [])

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
          setOffline(cached.stale)
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

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true)
        void load(true)
      }}
    />
  )

  if (loading) {
    return (
      <View className="flex-1 px-4 pt-2">
        <NutritionSkeleton variant="today" />
      </View>
    )
  }

  if (!plan?.plan) {
    return (
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-4 pt-2"
        contentContainerStyle={{ paddingBottom: insets.bottom + ALUMNO_TABBAR_CLEARANCE }}
        onScroll={onScrollChrome}
        scrollEventThrottle={16}
        refreshControl={refreshControl}
      >
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
  const defaultVariant = plan.dayVariants.find((variant) => variant.isDefault) ?? plan.dayVariants[0] ?? null

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-4 px-4 pt-2"
      contentContainerStyle={{ paddingBottom: insets.bottom + ALUMNO_TABBAR_CLEARANCE }}
      onScroll={onScrollChrome}
      scrollEventThrottle={16}
      refreshControl={refreshControl}
    >
      {offline ? (
        <View className="items-end">
          <SyncOfflineState state="offline" />
        </View>
      ) : null}

      <NutritionCard>
        <View className="flex-row flex-wrap items-center gap-2">
          <StrategyBadge strategy={summary.strategy} />
          <PlanVersionBadge version={summary.versionNumber} status={summary.status} />
        </View>
        <Text className="mt-3 font-display text-2xl font-bold text-text-strong">{summary.name}</Text>
        <Text className="mt-1 text-xs text-text-muted">
          Vigente desde {formatNutritionShortDate(summary.effectiveFrom)}
          {summary.effectiveTo ? ` hasta ${formatNutritionShortDate(summary.effectiveTo)}` : ' · versión actual'}
        </Text>
        <Text className="mt-2 text-xs leading-4 text-text-subtle">{NUTRITION_STRATEGIES[summary.strategy].description}</Text>
      </NutritionCard>

      {defaultVariant ? <PlanObjectives targets={defaultVariant.targets} /> : null}

      <PlanRulesCard permissions={plan.permissions} />

      {plan.visibleNotes ? (
        <NutritionCard tone="info">
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle">Protocolo</Text>
          <Text className="mt-1 text-sm leading-5 text-text-body">{plan.visibleNotes}</Text>
        </NutritionCard>
      ) : null}

      {plan.dayVariants.map((variant) => (
        <PlanVariantCard key={variant.id} variant={variant} />
      ))}

      <Text className="text-center text-xs text-text-muted">Actualizado {formatNutritionShortDate(plan.asOfDate, { relative: true })}</Text>
    </ScrollView>
  )
}

function PlanObjectives({ targets }: { targets: PlanVariant['targets'] }) {
  const rows: { label: string; value: string }[] = []
  if (targets.calories != null) rows.push({ label: 'Energía', value: formatNutritionCalories(targets.calories) })
  if (targets.proteinG != null) rows.push({ label: 'Proteína', value: formatNutritionAmount(targets.proteinG, 'g') })
  if (targets.carbsG != null) rows.push({ label: 'Carbohidratos', value: formatNutritionAmount(targets.carbsG, 'g') })
  if (targets.fatsG != null) rows.push({ label: 'Grasas', value: formatNutritionAmount(targets.fatsG, 'g') })
  if (targets.fiberG != null) rows.push({ label: 'Fibra', value: formatNutritionAmount(targets.fiberG, 'g') })
  if (rows.length === 0) return null
  return (
    <NutritionCard>
      <Text className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle">Objetivos diarios</Text>
      <View className="mt-3 flex-row flex-wrap gap-y-3">
        {rows.map((row) => (
          <View key={row.label} className="min-w-[30%] flex-1 pr-2">
            <Text className="font-display text-lg font-bold text-text-strong">{row.value}</Text>
            <Text className="text-xs text-text-muted">{row.label}</Text>
          </View>
        ))}
      </View>
    </NutritionCard>
  )
}

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
  if (permissions.canSubstitute) chips.push('Intercambios permitidos')
  if (permissions.canMoveMealSlot) chips.push('Puedes mover comidas de franja')
  if (permissions.canSkipOptionalItems) chips.push('Puedes omitir opcionales')
  return (
    <NutritionCard>
      <Text className="text-[11px] font-semibold uppercase tracking-wide text-text-subtle">Reglas del plan</Text>
      <View className="mt-3 flex-row flex-wrap gap-2">
        {chips.map((chip) => (
          <View key={chip} className="rounded-pill border border-border-subtle bg-surface-sunken px-2.5 py-1">
            <Text className="text-xs font-medium text-text-body">{chip}</Text>
          </View>
        ))}
      </View>
    </NutritionCard>
  )
}

function PlanVariantCard({ variant }: { variant: PlanVariant }) {
  return (
    <NutritionCard>
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text className="font-display text-lg font-semibold text-text-strong">{variant.label}</Text>
        {variant.isDefault ? (
          <View className="rounded-pill border border-primary/30 bg-primary/10 px-2 py-0.5">
            <Text className="text-[10px] font-semibold text-primary">Por defecto</Text>
          </View>
        ) : null}
      </View>
      <Text className="mt-1 text-xs text-text-muted">
        {variant.mealSlots.length} franja{variant.mealSlots.length === 1 ? '' : 's'}
        {variant.targets.calories != null ? ` · ${formatNutritionCalories(variant.targets.calories)}` : ''}
      </Text>
      {variant.mealSlots.map((slot) => (
        <View key={slot.id} className="mt-3">
          <View className="flex-row items-center justify-between gap-2">
            <Text className="text-sm font-semibold text-text-strong">{slot.name}</Text>
            {slot.startTime ? <Text className="text-xs text-text-muted">{slot.startTime}</Text> : null}
          </View>
          {slot.instructions ? <Text className="mt-0.5 text-xs leading-4 text-text-subtle">{slot.instructions}</Text> : null}
          {slot.prescriptionItems.length > 0 ? (
            slot.prescriptionItems.map((item, index) => (
              <View key={item.id} className={index > 0 ? 'border-t border-border-subtle' : undefined}>
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
                />
              </View>
            ))
          ) : (
            <Text className="py-2 text-xs text-text-muted">Franja flexible sin alimentos prescritos.</Text>
          )}
        </View>
      ))}
    </NutritionCard>
  )
}

// ---------------------------------------------------------------------------
// History tab
// ---------------------------------------------------------------------------

function HistoryTab() {
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
  const [expanded, setExpanded] = useState<string | null>(null)
  const [details, setDetails] = useState<Record<string, DayDetailState>>({})

  const mountedRef = useRef(true)
  const controllerRef = useRef<AbortController | null>(null)
  const moreControllerRef = useRef<AbortController | null>(null)
  const detailControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      controllerRef.current?.abort()
      moreControllerRef.current?.abort()
      detailControllerRef.current?.abort()
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
          setOffline(cached.stale)
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

  const toggleDay = useCallback(
    async (day: NutritionHistoryDay) => {
      const localDate = day.localDate
      if (expanded === localDate) {
        setExpanded(null)
        return
      }
      void Haptics.selectionAsync()
      setExpanded(localDate)
      if (!historyDayHasDetail(day) || details[localDate]?.model || details[localDate]?.loading) return
      if (!userId) return
      setDetails((prev) => ({ ...prev, [localDate]: { loading: true, model: null, offline: false } }))
      detailControllerRef.current?.abort()
      const controller = new AbortController()
      detailControllerRef.current = controller
      const scopeKey = `history-day:${localDate}`

      const cached = await readNutritionV2Cache({
        userId,
        clientId: userId,
        kind: 'today',
        scopeKey,
        schema: NutritionTodayReadModelSchema,
        allowStale: true,
      })
      if (mountedRef.current && cached) {
        setDetails((prev) => ({ ...prev, [localDate]: { loading: true, model: cached.payload, offline: cached.stale } }))
      }

      try {
        const model = await getNutritionTodayV2({ date: localDate, signal: controller.signal })
        if (!mountedRef.current) return
        setDetails((prev) => ({ ...prev, [localDate]: { loading: false, model, offline: false } }))
        await writeNutritionV2Cache({ userId, clientId: userId, kind: 'today', scopeKey, payload: model })
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
        if (!mountedRef.current) return
        setDetails((prev) => ({
          ...prev,
          [localDate]: { loading: false, model: prev[localDate]?.model ?? null, offline: true },
        }))
      }
    },
    [details, expanded, userId],
  )

  useEffect(() => {
    if (userId) void loadFirst()
  }, [loadFirst, userId])

  if (loading) {
    return (
      <View className="flex-1 px-4 pt-2">
        <NutritionSkeleton variant="history" />
      </View>
    )
  }

  return (
    <FlashList
      data={items}
      keyExtractor={(item) => item.localDate}
      onEndReached={() => void loadMore()}
      onEndReachedThreshold={0.4}
      refreshing={refreshing}
      onRefresh={() => {
        setRefreshing(true)
        void loadFirst(true)
      }}
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + ALUMNO_TABBAR_CLEARANCE }}
      onScroll={onScrollChrome}
      scrollEventThrottle={16}
      ItemSeparatorComponent={() => <View className="h-3" />}
      ListEmptyComponent={
        <NutritionStatePanel
          icon={offline ? 'offline' : 'empty'}
          illustration={offline ? undefined : 'historial-vacio'}
          tone={offline ? 'warning' : 'neutral'}
          title={offline ? 'Sin conexión' : 'Todavía no hay historial'}
          description={
            offline
              ? 'No pudimos cargar tu historial y no hay copia guardada en este dispositivo.'
              : 'Tus días aparecerán aquí después del primer registro o snapshot del plan.'
          }
        />
      }
      ListFooterComponent={
        loadingMore ? (
          <View className="items-center py-5">
            <Text className="text-sm text-text-muted">Cargando días anteriores…</Text>
          </View>
        ) : !canLoadMoreHistory(page) && items.length > 0 ? (
          <View className="items-center py-5">
            <Text className="text-xs text-text-subtle">No hay más días.</Text>
          </View>
        ) : null
      }
      renderItem={({ item }) => (
        <HistoryDayCard
          day={item}
          expanded={expanded === item.localDate}
          detail={details[item.localDate] ?? null}
          onToggle={() => void toggleDay(item)}
        />
      )}
    />
  )
}

function HistoryDayCard({
  day,
  expanded,
  detail,
  onToggle,
}: {
  day: NutritionHistoryDay
  expanded: boolean
  detail: DayDetailState | null
  onToggle: () => void
}) {
  const hasDetail = historyDayHasDetail(day)
  const legacy = historyDayIsLegacy(day)
  const legacyInfo = describeLegacyHistoryDay(day)
  const showLegacyMacros = legacyInfo.legacyOnly && legacyInfo.hasMacros && legacyInfo.consumed != null
  const legacyHasContent = showLegacyMacros || legacyInfo.completionCount > 0 || legacyInfo.mealsLabel != null
  const accessibilitySummary = legacyInfo.legacyOnly
    ? showLegacyMacros && legacyInfo.consumed
      ? `Historial anterior, ${formatNutritionCalories(legacyInfo.consumed.calories)}.`
      : legacyInfo.completionCount > 0
        ? `Historial anterior, ${legacyInfo.completionsLabel}.`
        : 'Registrado en el sistema anterior.'
    : `${day.activeEntryCount} registros, ${formatNutritionCalories(day.consumed.calories)} consumidas.`
  return (
    <NutritionCard>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded, disabled: !hasDetail }}
        accessibilityLabel={`Día ${formatNutritionShortDate(day.localDate, { relative: true })}. ${accessibilitySummary}`}
        disabled={!hasDetail}
        onPress={onToggle}
      >
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1">
            <View className="flex-row flex-wrap items-center gap-2">
              <Text className="font-display text-lg font-semibold text-text-strong">
                {formatNutritionShortDate(day.localDate, { relative: true })}
              </Text>
              {day.strategy ? <StrategyBadge compact strategy={day.strategy} /> : null}
              {legacy ? (
                <View className="rounded-pill border border-warning-500/40 bg-warning-500/10 px-2 py-0.5">
                  <Text className="text-[10px] font-semibold text-warning-700">Historial anterior</Text>
                </View>
              ) : null}
            </View>
            {showLegacyMacros && legacyInfo.consumed ? (
              <View className="mt-1">
                <MacroChipRow
                  calories={legacyInfo.consumed.calories}
                  proteinG={legacyInfo.consumed.proteinG}
                  carbsG={legacyInfo.consumed.carbsG}
                  fatsG={legacyInfo.consumed.fatsG}
                  size="sm"
                />
              </View>
            ) : (
              <Text className="mt-1 text-xs text-text-muted">
                {legacyInfo.legacyOnly
                  ? legacyInfo.completionCount > 0
                    ? legacyInfo.completionsLabel
                    : 'Registrado en el sistema anterior'
                  : `${day.activeEntryCount} registro${day.activeEntryCount === 1 ? '' : 's'}${
                      day.correctionCount > 0
                        ? ` · ${day.correctionCount} corrección${day.correctionCount === 1 ? '' : 'es'}`
                        : ''
                    }${day.lastRecordedAt ? ` · último ${formatClock(day.lastRecordedAt)}` : ''}`}
              </Text>
            )}
            {legacy && !legacyInfo.legacyOnly && legacyInfo.secondaryLabel ? (
              <Text className="mt-1 text-[11px] text-text-subtle">{legacyInfo.secondaryLabel}</Text>
            ) : null}
            {legacy && legacyInfo.mealsLabel ? (
              <Text numberOfLines={2} className="mt-1 text-[11px] text-text-subtle">
                {legacyInfo.mealsLabel}
              </Text>
            ) : null}
          </View>
          {!legacyInfo.legacyOnly ? (
            <View className="items-end">
              <Text className="font-mono text-sm font-semibold text-text-strong">{formatNutritionCalories(day.consumed.calories)}</Text>
              <Text className="text-[10px] text-text-subtle">de {formatNutritionCalories(day.targets.calories ?? 0)}</Text>
            </View>
          ) : null}
        </View>

        {!legacyInfo.legacyOnly ? (
          <View className="mt-3 flex-row flex-wrap gap-x-4 gap-y-1">
            <HistoryMacro label="P" consumed={day.consumed.proteinG} target={day.targets.proteinG} />
            <HistoryMacro label="C" consumed={day.consumed.carbsG} target={day.targets.carbsG} />
            <HistoryMacro label="G" consumed={day.consumed.fatsG} target={day.targets.fatsG} />
          </View>
        ) : null}

        {hasDetail ? (
          <Text className="mt-2 text-xs font-semibold text-primary">{expanded ? 'Ocultar detalle' : 'Ver detalle'}</Text>
        ) : legacy && !legacyHasContent ? (
          <Text className="mt-2 text-xs text-text-subtle">Este día proviene del historial anterior y no tiene detalle por alimento.</Text>
        ) : null}
      </Pressable>

      {expanded && hasDetail ? (
        <View className="mt-3 border-t border-border-subtle pt-3">
          {detail?.loading && !detail.model ? (
            <Text className="py-2 text-sm text-text-muted">Cargando detalle del día…</Text>
          ) : detail?.model ? (
            <HistoryDayDetail model={detail.model} offline={detail.offline} />
          ) : (
            <Text className="py-2 text-sm text-warning-700">No pudimos cargar el detalle. Reintenta abriendo el día.</Text>
          )}
        </View>
      ) : null}
    </NutritionCard>
  )
}

function HistoryMacro({ label, consumed, target }: { label: string; consumed: number; target: number | null }) {
  return (
    <Text className="font-mono text-xs text-text-muted">
      <Text className="font-semibold text-text-body">{label}</Text> {Math.round(consumed)}
      {target != null ? `/${Math.round(target)}` : ''} g
    </Text>
  )
}

function HistoryDayDetail({ model, offline }: { model: NutritionTodayReadModel; offline: boolean }) {
  const slotsWithIntake = model.mealSlots
    .map((slot) => ({ slot, entries: slot.intakeItems.filter((entry) => entry.status !== 'voided') }))
    .filter((group) => group.entries.length > 0)
  const unassigned = model.unassignedIntake.filter((entry) => entry.status !== 'voided')

  if (slotsWithIntake.length === 0 && unassigned.length === 0) {
    return <Text className="py-2 text-sm text-text-muted">Sin registros de alimentos este día.</Text>
  }

  return (
    <View className="gap-3">
      {offline ? (
        <View className="items-start">
          <SyncOfflineState state="offline" label="Detalle guardado" />
        </View>
      ) : null}
      {slotsWithIntake.map(({ slot, entries }) => (
        <View key={slot.id}>
          <Text className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-subtle">{slot.name}</Text>
          {entries.map((entry, index) => (
            <View key={entry.id} className={index > 0 ? 'border-t border-border-subtle' : undefined}>
              <FoodRow food={historyEntryToRow(entry)} fallbackCategory={entry.category} />
            </View>
          ))}
        </View>
      ))}
      {unassigned.length > 0 ? (
        <View>
          <Text className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-subtle">Sin franja</Text>
          {unassigned.map((entry, index) => (
            <View key={entry.id} className={index > 0 ? 'border-t border-border-subtle' : undefined}>
              <FoodRow food={historyEntryToRow(entry)} fallbackCategory={entry.category} />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

function historyEntryToRow(entry: NutritionIntakeReadItem): NutritionFoodRowModel {
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

function formatClock(iso: string): string {
  try {
    return new Intl.DateTimeFormat('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
  } catch {
    return ''
  }
}
