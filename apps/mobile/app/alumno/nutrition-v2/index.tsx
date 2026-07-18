import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, AppState, Pressable, RefreshControl, ScrollView, Share, Text, TextInput, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import { FlashList } from '@shopify/flash-list'
import { MotiView } from 'moti'
import { History, ListChecks, Utensils } from 'lucide-react-native'
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
} from '../../../components/nutrition-v2'
import { Sheet as ActionSheet } from '../../../components/Sheet'
import {
  PortionDayCoverageRow,
  PortionEquivalencesSheet,
  PortionSlotSection,
  PortionSnackbar,
  coverageViewFor,
  usePortionMarks,
} from '../../../components/alumno/nutrition-v2'
import type {
  PendingPortionMark,
  PendingPortionVoid,
  PortionCoverageView,
} from '../../../lib/nutrition-v2-portions'
import {
  NUTRITION_STRATEGIES,
  type NutritionSlotExchangeTargetRead,
  NutritionHistoryPageReadModelSchema,
  NutritionPlanReadModelSchema,
  NutritionTodayReadModelSchema,
  buildNutritionDayShareText,
  describeLegacyHistoryDay,
  energyGoalReached,
  firstNameFromFullName,
  formatNutritionAmount,
  formatNutritionCalories,
  type NutritionFoodRowModel,
  type NutritionHistoryDay,
  type NutritionHistoryPageReadModel,
  type NutritionIntakeReadItem,
  type NutritionMealSlotRead,
  type NutritionPlanReadModel,
  type NutritionTodayReadModel,
} from '@eva/nutrition-v2'
import { supabase } from '../../../lib/supabase'
import { formatNutritionShortDate } from '../../../lib/date-utils'
import { foodCategoryEmojiFromName } from '../../../lib/nutrition-v2-food-media'
import { isEnabled } from '../../../lib/flags'
import { useEntitlements } from '../../../lib/entitlements'
import { getNutritionHistoryV2, getNutritionPlanV2, getNutritionTodayV2 } from '../../../lib/nutrition-v2.api'
import {
  readNutritionV2Cache,
  writeNutritionV2Cache,
} from '../../../lib/nutrition-v2-cache'
import {
  flushNutritionV2MutationQueue,
  getNutritionV2QueueStatus,
} from '../../../lib/nutrition-v2-offline'
import {
  buildAteAsPrescribedMutation,
  buildEditIntakeCorrection,
  buildVoidIntakeCorrection,
  computeIntakeTotals,
  optimisticIntakeRow,
  type NutritionIntakeTotals,
} from '../../../lib/nutrition-v2-intake'
import {
  getStableDeviceId,
  newNutritionV2OperationId,
  submitCorrectIntake,
  submitRecordIntake,
} from '../../../lib/nutrition-v2-intake-runner'
import { useEvaMotion } from '../../../lib/motion'
import {
  decideDayCloseCelebration,
  decideEnergyGoalCelebration,
  decideMealLoggedCelebration,
  isNutritionDayComplete,
  type CelebrationDecision,
} from '../../../lib/nutrition-v2-celebrations'
import {
  claimDayCloseCelebration,
  claimEnergyGoalCelebration,
  claimMealLoggedCelebration,
} from '../../../lib/nutrition-v2-celebrations.storage'
import { useTheme } from '../../../context/ThemeContext'
import {
  canLoadMoreHistory,
  historyDayHasDetail,
  historyDayIsLegacy,
  mergeHistoryPages,
  nextHistoryCursor,
} from '../../../lib/nutrition-v2-history'

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
  addedBySlot: Record<string, NutritionFoodRowModel[]>
  addedUnassigned: NutritionFoodRowModel[]
  hiddenIds: string[]
}

const EMPTY_OVERLAY: OptimisticOverlay = { addedBySlot: {}, addedUnassigned: [], hiddenIds: [] }
// Constantes de referencia ESTABLE para props de cards memoizadas (hallazgo M3):
// `?? []` inline crearía un array nuevo por render y rompería React.memo.
const EMPTY_ROWS: NutritionFoodRowModel[] = []
const EMPTY_PORTION_MARKS: PendingPortionMark[] = []
const EMPTY_PORTION_VOIDS: PendingPortionVoid[] = []

function TodayTab() {
  const router = useRouter()
  const entitlements = useEntitlements()
  const [userId, setUserId] = useState<string | null>(null)
  const [clientName, setClientName] = useState<string | null>(null)
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [model, setModel] = useState<NutritionTodayReadModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [offline, setOffline] = useState(false)
  const [pending, setPending] = useState(0)
  const [overlay, setOverlay] = useState<OptimisticOverlay>(EMPTY_OVERLAY)
  const [actionEntry, setActionEntry] = useState<NutritionIntakeReadItem | null>(null)
  const [celebration, setCelebration] = useState<CelebrationInstance | null>(null)
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
      const fetchStartedAt = Date.now()
      const fresh = await getNutritionTodayV2({ date, signal: controller.signal })
      if (!mountedRef.current) return
      setModel(fresh)
      setOffline(false)
      setOverlay(EMPTY_OVERLAY)
      portionsReconcile.current(fetchStartedAt)
      await writeNutritionV2Cache({ userId, clientId: userId, kind: 'today', scopeKey: date, payload: fresh })
      if (!mountedRef.current) return
      const flushed = await flushNutritionV2MutationQueue(userId)
      if (mountedRef.current) setPending(flushed.pending)
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

  const addRow = useCallback((slotCode: string | null, row: NutritionFoodRowModel) => {
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
    const patch = (rows: NutritionFoodRowModel[]) => rows.map((r) => (r.id === id ? { ...r, status: 'offline' as const } : r))
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
        void load(true)
      } else if (outcome.status === 'queued') {
        markRowOffline(slot.code, tempId)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        await refreshPending()
      } else {
        removeRow(slot.code, tempId)
        Alert.alert('No se pudo registrar', outcome.error.message)
      }
    },
    [addRow, date, deviceId, fireCelebration, load, markRowOffline, model, refreshPending, removeRow, userId],
  )

  const onVoidEntry = useCallback(
    async (entry: NutritionIntakeReadItem) => {
      if (!userId || !deviceId) return
      setActionEntry(null)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
      setHidden(entry.id, true)
      const payload = buildVoidIntakeCorrection({
        clientId: userId,
        deviceId,
        operationId: newNutritionV2OperationId(),
        localDate: date,
        occurredAt: new Date().toISOString(),
        timezone: TZ,
        entry,
        planVersionId: model?.plan?.versionId ?? null,
        daySnapshotId: model?.snapshotId ?? null,
      })
      const outcome = await submitCorrectIntake(userId, payload)
      if (!mountedRef.current) return
      if (outcome.status === 'recorded') {
        void load(true)
      } else if (outcome.status === 'queued') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        await refreshPending()
      } else {
        setHidden(entry.id, false)
        Alert.alert('No se pudo retirar', outcome.error.message)
      }
    },
    [date, deviceId, load, model, refreshPending, setHidden, userId],
  )

  const onEditEntry = useCallback(
    async (entry: NutritionIntakeReadItem, quantity: number, unit: string) => {
      if (!userId || !deviceId) return
      setActionEntry(null)
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      const operationId = newNutritionV2OperationId()
      const tempId = `opt-${operationId}`
      const totals = computeIntakeTotals(quantity, unit, {
        calories: entry.snapshot.calories,
        proteinG: entry.snapshot.proteinG,
        carbsG: entry.snapshot.carbsG,
        fatsG: entry.snapshot.fatsG,
        fiberG: entry.snapshot.fiberG,
        servingSize: entry.snapshot.servingSize,
      })
      setHidden(entry.id, true)
      addRow(entry.mealSlot, optimisticIntakeRow({
        id: tempId,
        name: entry.snapshot.name,
        brand: entry.snapshot.brand,
        quantity,
        unit,
        status: 'pending',
        totals,
      }))
      let payload
      try {
        payload = buildEditIntakeCorrection({
          clientId: userId,
          deviceId,
          operationId,
          localDate: date,
          occurredAt: new Date().toISOString(),
          timezone: TZ,
          entry,
          quantity,
          unit,
          planVersionId: model?.plan?.versionId ?? null,
          daySnapshotId: model?.snapshotId ?? null,
        })
      } catch {
        setHidden(entry.id, false)
        removeRow(entry.mealSlot, tempId)
        return
      }
      const outcome = await submitCorrectIntake(userId, payload)
      if (!mountedRef.current) return
      if (outcome.status === 'recorded') {
        void load(true)
      } else if (outcome.status === 'queued') {
        markRowOffline(entry.mealSlot, tempId)
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
        await refreshPending()
      } else {
        setHidden(entry.id, false)
        removeRow(entry.mealSlot, tempId)
        Alert.alert('No se pudo editar', outcome.error.message)
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

  // Compartir: arma un TEXTO resumen del día (mismo helper puro que la web → microcopy 1:1) y lo
  // comparte con el Share nativo. Toma la instantánea del servidor (`model`) para que macros e
  // ítems sean coherentes entre sí; solo datos del propio alumno, sin datos privados del coach.
  const onShareDay = useCallback(async () => {
    if (!model) return
    // Mismo conjunto y orden que "Consumido hoy" de la web (`consumedEntries`): por hora asc.
    const items = [...model.mealSlots.flatMap((slot) => slot.intakeItems), ...model.unassignedIntake]
      .slice()
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
      .map((entry) => ({
        name: entry.snapshot.name,
        quantity: entry.quantity,
        unit: entry.unit,
      }))
    const text = buildNutritionDayShareText({
      localDate: model.localDate,
      planName: model.plan?.name ?? null,
      consumed: {
        calories: model.consumed.calories,
        proteinG: model.consumed.proteinG,
        carbsG: model.consumed.carbsG,
        fatsG: model.consumed.fatsG,
      },
      targets: {
        calories: model.targets.calories,
        proteinG: model.targets.proteinG,
        carbsG: model.targets.carbsG,
        fatsG: model.targets.fatsG,
      },
      items,
    })
    try {
      await Share.share({ message: text })
    } catch {
      // El usuario canceló el diálogo de compartir o el share nativo falló: sin acción.
    }
  }, [model])

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

  const unassignedRows: NutritionFoodRowModel[] = [
    ...model.unassignedIntake.filter((e) => !hiddenSet.has(e.id)).map(intakeToRow),
    ...overlay.addedUnassigned,
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
        <View className="flex-row items-center justify-between gap-3">
          <Text className="min-w-0 flex-1 text-sm text-text-muted">Tu consumo real frente al snapshot del día.</Text>
          <SyncOfflineState
            state={offline ? 'offline' : pending > 0 ? 'pending' : 'synced'}
            label={pending > 0 ? `${pending} pendiente${pending === 1 ? '' : 's'}` : undefined}
          />
        </View>

        {model.plan ? (
          <View className="flex-row flex-wrap gap-2">
            <StrategyBadge strategy={model.plan.strategy} />
            <PlanVersionBadge
              version={model.plan.versionNumber}
              status={model.plan.status}
              effectiveLabel={`desde ${formatNutritionShortDate(model.plan.effectiveFrom)}`}
            />
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

        {model.mealSlots.length > 0 ? (
          model.mealSlots.map((slot) => (
            <TodaySlotCard
              key={slot.id}
              slot={slot}
              addedRows={overlay.addedBySlot[slot.code] ?? EMPTY_ROWS}
              hiddenSet={hiddenSet}
              onAte={onAtePrescribed}
              onRegisterSlot={onRegister}
              onEntryAction={setActionEntry}
              portionPending={portions.pendingBySlot[slot.code] ?? EMPTY_PORTION_MARKS}
              portionVoids={portions.voidsBySlot[slot.code] ?? EMPTY_PORTION_VOIDS}
              onMarkPortion={portions.mark}
              onOpenEquivalences={onOpenEquivalences}
            />
          ))
        ) : (
          <NutritionStatePanel
            icon="empty"
            title="Sin franjas para hoy"
            description="Tu plan puede ser flexible o aún sin estructura diaria. Registra lo que comes cuando quieras."
          />
        )}

        {unassignedRows.length > 0 ? (
          <UnassignedCard
            entries={model.unassignedIntake.filter((e) => !hiddenSet.has(e.id))}
            addedRows={overlay.addedUnassigned}
            onEntryAction={setActionEntry}
          />
        ) : null}

        <NutritionMotionButton accessibilityLabel="Registrar un alimento libre" onPress={() => onRegister()}>
          + Registrar alimento
        </NutritionMotionButton>

        <NutritionMotionButton accessibilityLabel="Compartir mi día" tone="neutral" onPress={() => void onShareDay()}>
          Compartir mi día
        </NutritionMotionButton>

        {!model.plan ? (
          <NutritionStatePanel
            title="Aún no hay comidas prescritas para hoy"
            description="Puedes registrar lo que comas libremente. Si tu coach acaba de publicar un plan nuevo, las comidas prescritas aparecen a partir de mañana."
          />
        ) : null}

        <Text className="text-center text-xs text-text-muted">
          Registro del día · {formatNutritionShortDate(model.localDate, { relative: true })}
        </Text>
      </ScrollView>

      <EntryActionSheet
        entry={actionEntry}
        onClose={() => setActionEntry(null)}
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
      <CelebrationOverlay celebration={celebration} onDone={() => setCelebration(null)} />
    </>
  )
}

function intakeToRow(entry: NutritionIntakeReadItem): NutritionFoodRowModel {
  return {
    id: entry.id,
    name: entry.snapshot.name,
    detail: entry.snapshot.brand,
    quantityLabel: `${entry.quantity} ${entry.unit}`,
    calories: entry.totals.calories,
    proteinG: entry.totals.proteinG,
    carbsG: entry.totals.carbsG,
    fatsG: entry.totals.fatsG,
    status: entry.status === 'corrected' ? 'corrected' : 'default',
  }
}

// Memoizada (hallazgo M3): marcar una porción solo cambia `portionPending`/`portionVoids`
// de SU franja (buckets con referencia estable), así las demás cards no re-renderizan.
const TodaySlotCard = memo(function TodaySlotCard({
  slot,
  addedRows,
  hiddenSet,
  onAte,
  onRegisterSlot,
  onEntryAction,
  portionPending,
  portionVoids,
  onMarkPortion,
  onOpenEquivalences,
}: {
  slot: NutritionMealSlotRead
  addedRows: NutritionFoodRowModel[]
  hiddenSet: Set<string>
  onAte: (slot: NutritionMealSlotRead, item: NutritionMealSlotRead['prescriptionItems'][number]) => void
  onRegisterSlot: (slot: NutritionMealSlotRead) => void
  onEntryAction: (entry: NutritionIntakeReadItem) => void
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
  const activeEntries = slot.intakeItems.filter((e) => !hiddenSet.has(e.id))
  const entriesById = new Map(activeEntries.map((e) => [e.id, e]))
  const consumedRows: NutritionFoodRowModel[] = [...activeEntries.map(intakeToRow), ...addedRows]
  const subtotal = consumedRows.reduce((sum, row) => sum + (row.calories ?? 0), 0)
  const badge = consumedRows.length > 0
    ? { label: 'Consumido', tone: 'text-success-700' }
    : slot.prescriptionItems.length > 0
      ? { label: 'Esperado', tone: 'text-primary' }
      : { label: 'Sin registros', tone: 'text-text-muted' }

  return (
    <NutritionCard>
      <View className="flex-row flex-wrap items-start justify-between gap-2">
        <View className="min-w-0 flex-1">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="font-display text-lg font-semibold text-text-strong">{slot.name}</Text>
            <Text className={`text-[10px] font-semibold uppercase tracking-wide ${badge.tone}`}>{badge.label}</Text>
          </View>
          {slot.startTime ? <Text className="mt-1 text-xs text-text-muted">{slot.startTime}</Text> : null}
        </View>
        {consumedRows.length > 0 ? (
          <Text className="font-mono text-sm font-semibold text-text-strong">{formatNutritionCalories(subtotal)}</Text>
        ) : null}
      </View>

      {slot.prescriptionItems.length > 0 ? (
        <View className="mt-3">
          <Text className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-subtle">Prescrito</Text>
          {slot.prescriptionItems.map((item, index) => (
            <View key={item.id} className={index > 0 ? 'border-t border-border-subtle' : undefined}>
              <FoodRow
                food={{
                  id: item.id,
                  name: item.name ?? 'Alimento prescrito',
                  detail: item.brand,
                  quantityLabel: `${item.quantity} ${item.unit}`,
                  calories: item.macros.calories,
                  proteinG: item.macros.proteinG,
                  carbsG: item.macros.carbsG,
                  fatsG: item.macros.fatsG,
                }}
                fallbackEmoji={foodCategoryEmojiFromName(item.name)}
                actions={
                  <NutritionMotionButton
                    accessibilityLabel={`Comí ${item.name ?? 'lo prescrito'}`}
                    tone="nutrition"
                    onPress={() => onAte(slot, item)}
                  >
                    Comí
                  </NutritionMotionButton>
                }
              />
            </View>
          ))}
        </View>
      ) : null}

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

      {consumedRows.length > 0 ? (
        <View className="mt-3">
          <Text className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-subtle">Consumido</Text>
          {consumedRows.map((row, index) => {
            const entry = entriesById.get(row.id)
            return (
              <View key={row.id} className={index > 0 ? 'border-t border-border-subtle' : undefined}>
                <FoodRow
                  food={row}
                  fallbackEmoji={foodCategoryEmojiFromName(row.name)}
                  actions={
                    entry ? (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Opciones de ${row.name}`}
                        hitSlop={8}
                        onPress={() => onEntryAction(entry)}
                        className="min-h-11 items-center justify-center rounded-control border border-border-subtle px-3"
                      >
                        <Text className="text-xs font-semibold text-text-body">Editar</Text>
                      </Pressable>
                    ) : undefined
                  }
                />
              </View>
            )
          })}
        </View>
      ) : null}

      <View className="mt-3">
        <NutritionMotionButton
          accessibilityLabel={`Registrar en ${slot.name}`}
          tone="neutral"
          onPress={() => onRegisterSlot(slot)}
        >
          + Registrar en {slot.name}
        </NutritionMotionButton>
      </View>
    </NutritionCard>
  )
})

function UnassignedCard({
  entries,
  addedRows,
  onEntryAction,
}: {
  entries: NutritionIntakeReadItem[]
  addedRows: NutritionFoodRowModel[]
  onEntryAction: (entry: NutritionIntakeReadItem) => void
}) {
  const entriesById = new Map(entries.map((e) => [e.id, e]))
  const rows: NutritionFoodRowModel[] = [...entries.map(intakeToRow), ...addedRows]
  return (
    <NutritionCard>
      <Text className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-subtle">Sin franja</Text>
      {rows.map((row, index) => {
        const entry = entriesById.get(row.id)
        return (
          <View key={row.id} className={index > 0 ? 'border-t border-border-subtle' : undefined}>
            <FoodRow
              food={row}
              fallbackEmoji={foodCategoryEmojiFromName(row.name)}
              actions={
                entry ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Opciones de ${row.name}`}
                    hitSlop={8}
                    onPress={() => onEntryAction(entry)}
                    className="min-h-11 items-center justify-center rounded-control border border-border-subtle px-3"
                  >
                    <Text className="text-xs font-semibold text-text-body">Editar</Text>
                  </Pressable>
                ) : undefined
              }
            />
          </View>
        )
      })}
    </NutritionCard>
  )
}

function EntryActionSheet({
  entry,
  onClose,
  onEdit,
  onVoid,
}: {
  entry: NutritionIntakeReadItem | null
  onClose: () => void
  onEdit: (entry: NutritionIntakeReadItem, quantity: number, unit: string) => void
  onVoid: (entry: NutritionIntakeReadItem) => void
}) {
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('g')

  useEffect(() => {
    if (entry) {
      setQuantity(String(entry.quantity))
      setUnit(entry.unit)
    }
  }, [entry])

  const parsed = Number(quantity.replace(',', '.'))
  const valid = Number.isFinite(parsed) && parsed > 0
  const units = entry?.snapshot.servingUnit === 'ml' ? ['ml', 'un'] : ['g', 'un']

  return (
    <ActionSheet
      open={entry != null}
      onClose={onClose}
      nativeModal
      title={entry?.snapshot.name ?? 'Registro'}
      snapPoints={['55%']}
      accessibilityLabel="Opciones del registro consumido"
    >
      {entry ? (
        <View className="gap-4">
          <Text className="text-sm leading-5 text-text-muted">
            Ajusta la cantidad o retira este registro. La corrección conserva el historial original.
          </Text>
          <View className="flex-row items-center gap-2">
            <TextInput
              accessibilityLabel="Nueva cantidad"
              className="min-h-12 w-28 rounded-control border border-border-default bg-surface-app px-3 text-lg text-text-strong"
              inputMode="decimal"
              keyboardType="decimal-pad"
              onChangeText={setQuantity}
              selectTextOnFocus
              value={quantity}
            />
            <View className="flex-1 flex-row gap-2">
              {units.map((value) => {
                const active = unit === value
                return (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Unidad ${value}`}
                    onPress={() => {
                      void Haptics.selectionAsync()
                      setUnit(value)
                    }}
                    className={`min-h-12 flex-1 items-center justify-center rounded-control border ${active ? 'border-primary bg-primary/10' : 'border-border-default bg-surface-app'}`}
                  >
                    <Text className={`text-sm font-semibold ${active ? 'text-primary' : 'text-text-muted'}`}>{value}</Text>
                  </Pressable>
                )
              })}
            </View>
          </View>
          <NutritionMotionButton
            accessibilityLabel="Guardar cambios del registro"
            disabled={!valid}
            onPress={() => {
              if (valid) onEdit(entry, parsed, unit)
            }}
          >
            Guardar cambios
          </NutritionMotionButton>
          <NutritionMotionButton
            accessibilityLabel="Retirar este registro"
            tone="danger"
            onPress={() => onVoid(entry)}
          >
            Retirar registro
          </NutritionMotionButton>
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
  const entitlements = useEntitlements()
  const enabled = entitlements.ready && isEnabled('nutritionV2Student')
  const { reduced, duration } = useEvaMotion()
  const [tab, setTab] = useState<NutritionV2Tab>('today')

  if (!entitlements.ready) {
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

  return (
    <View className="flex-1 bg-surface-app">
      <View className="gap-4 px-4 pb-3 pt-5">
        <NutritionHeader
          eyebrow="Vista previa"
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
      <ScrollView className="flex-1" contentContainerClassName="px-4 pb-12 pt-2" refreshControl={refreshControl}>
        <NutritionStatePanel
          icon={offline ? 'offline' : 'empty'}
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
    <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pb-12 pt-2" refreshControl={refreshControl}>
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
                    quantityLabel: `${item.quantity} ${item.unit}${item.optional ? ' · opcional' : ''}`,
                    calories: item.macros.calories,
                    proteinG: item.macros.proteinG,
                    carbsG: item.macros.carbsG,
                    fatsG: item.macros.fatsG,
                  }}
                  fallbackEmoji={foodCategoryEmojiFromName(item.name)}
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
      contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 48 }}
      ItemSeparatorComponent={() => <View className="h-3" />}
      ListEmptyComponent={
        <NutritionStatePanel
          icon={offline ? 'offline' : 'empty'}
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
              <FoodRow food={historyEntryToRow(entry)} fallbackEmoji={foodCategoryEmojiFromName(entry.snapshot.name)} />
            </View>
          ))}
        </View>
      ))}
      {unassigned.length > 0 ? (
        <View>
          <Text className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-subtle">Sin franja</Text>
          {unassigned.map((entry, index) => (
            <View key={entry.id} className={index > 0 ? 'border-t border-border-subtle' : undefined}>
              <FoodRow food={historyEntryToRow(entry)} fallbackEmoji={foodCategoryEmojiFromName(entry.snapshot.name)} />
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
