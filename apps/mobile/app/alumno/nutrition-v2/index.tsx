import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, AppState, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native'
import { useFocusEffect, useRouter } from 'expo-router'
import * as Haptics from 'expo-haptics'
import {
  FoodRow,
  MacroBudget,
  NutritionCard,
  NutritionHeader,
  NutritionMotionButton,
  NutritionSkeleton,
  NutritionStatePanel,
  PlanVersionBadge,
  StrategyBadge,
  SyncOfflineState,
} from '../../../components/nutrition-v2'
import { Sheet as ActionSheet } from '../../../components/Sheet'
import {
  NutritionTodayReadModelSchema,
  createNutritionMacroValue,
  formatNutritionCalories,
  type NutritionFoodRowModel,
  type NutritionIntakeReadItem,
  type NutritionMealSlotRead,
  type NutritionTodayReadModel,
} from '@eva/nutrition-v2'
import { supabase } from '../../../lib/supabase'
import { isEnabled } from '../../../lib/flags'
import { useEntitlements } from '../../../lib/entitlements'
import { getNutritionTodayV2 } from '../../../lib/nutrition-v2.api'
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

export default function StudentNutritionV2Screen() {
  const router = useRouter()
  const entitlements = useEntitlements()
  const [userId, setUserId] = useState<string | null>(null)
  const [deviceId, setDeviceId] = useState<string | null>(null)
  const [model, setModel] = useState<NutritionTodayReadModel | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [offline, setOffline] = useState(false)
  const [pending, setPending] = useState(0)
  const [overlay, setOverlay] = useState<OptimisticOverlay>(EMPTY_OVERLAY)
  const [actionEntry, setActionEntry] = useState<NutritionIntakeReadItem | null>(null)
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
    void supabase.auth.getSession().then(({ data }) => {
      if (active) setUserId(data.session?.user.id ?? null)
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
      const fresh = await getNutritionTodayV2({ date, signal: controller.signal })
      if (!mountedRef.current) return
      setModel(fresh)
      setOffline(false)
      setOverlay(EMPTY_OVERLAY)
      await writeNutritionV2Cache({ userId, clientId: userId, kind: 'today', scopeKey: date, payload: fresh })
      if (!mountedRef.current) return
      const flushed = await flushNutritionV2MutationQueue(userId)
      if (mountedRef.current) setPending(flushed.pending)
      if (flushed.sent > 0 && mountedRef.current) {
        // Server truth changed after replay: refetch once so consumed reflects flushed writes.
        const replayed = await getNutritionTodayV2({ date }).catch(() => null)
        if (replayed && mountedRef.current) {
          setModel(replayed)
          setOverlay(EMPTY_OVERLAY)
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
    [addRow, date, deviceId, load, markRowOffline, model, refreshPending, removeRow, userId],
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
          title="Nutrición V2 no está habilitada"
          description="Esta pantalla solo se abre para scopes canary autorizados desde el servidor."
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

  const hiddenSet = new Set(overlay.hiddenIds)
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
        <NutritionHeader
          eyebrow="Canary privado"
          title="Nutrición"
          description="Tu consumo real frente al snapshot del día."
          actions={
            <SyncOfflineState
              state={offline ? 'offline' : pending > 0 ? 'pending' : 'synced'}
              label={pending > 0 ? `${pending} pendiente${pending === 1 ? '' : 's'}` : undefined}
            />
          }
        />

        {model.plan ? (
          <View className="flex-row flex-wrap gap-2">
            <StrategyBadge strategy={model.plan.strategy} />
            <PlanVersionBadge
              version={model.plan.versionNumber}
              status={model.plan.status}
              effectiveLabel={`desde ${model.plan.effectiveFrom}`}
            />
          </View>
        ) : null}

        <MacroBudget
          calories={{ consumed: consumed.calories, target: model.targets.calories ?? 0 }}
          macros={[
            createNutritionMacroValue('protein', { consumed: consumed.proteinG, target: model.targets.proteinG ?? 0 }),
            createNutritionMacroValue('carbs', { consumed: consumed.carbsG, target: model.targets.carbsG ?? 0 }),
            createNutritionMacroValue('fats', { consumed: consumed.fatsG, target: model.targets.fatsG ?? 0 }),
          ]}
        />

        {model.mealSlots.length > 0 ? (
          model.mealSlots.map((slot) => (
            <TodaySlotCard
              key={slot.id}
              slot={slot}
              addedRows={overlay.addedBySlot[slot.code] ?? []}
              hiddenSet={hiddenSet}
              onAte={onAtePrescribed}
              onRegister={() => onRegister(slot)}
              onEntryAction={setActionEntry}
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

        {!model.plan ? (
          <NutritionStatePanel
            title="Tu plan V2 todavía no está publicado"
            description="Puedes registrar alimentos libremente; cuando tu coach publique el plan verás las franjas prescritas."
          />
        ) : null}

        <Text className="text-center text-xs text-text-muted">
          Snapshot {model.localDate} · {model.timezone}
        </Text>
      </ScrollView>

      <EntryActionSheet
        entry={actionEntry}
        onClose={() => setActionEntry(null)}
        onEdit={onEditEntry}
        onVoid={onVoidEntry}
      />
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

function TodaySlotCard({
  slot,
  addedRows,
  hiddenSet,
  onAte,
  onRegister,
  onEntryAction,
}: {
  slot: NutritionMealSlotRead
  addedRows: NutritionFoodRowModel[]
  hiddenSet: Set<string>
  onAte: (slot: NutritionMealSlotRead, item: NutritionMealSlotRead['prescriptionItems'][number]) => void
  onRegister: () => void
  onEntryAction: (entry: NutritionIntakeReadItem) => void
}) {
  const activeEntries = slot.intakeItems.filter((e) => !hiddenSet.has(e.id))
  const entriesById = new Map(activeEntries.map((e) => [e.id, e]))
  const consumedRows: NutritionFoodRowModel[] = [...activeEntries.map(intakeToRow), ...addedRows]
  const subtotal = consumedRows.reduce((sum, row) => sum + (row.calories ?? 0), 0)
  const badge = consumedRows.length > 0
    ? { label: 'Consumido', tone: 'text-success-700' }
    : slot.prescriptionItems.length > 0
      ? { label: 'Esperado', tone: 'text-ember-700' }
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

      {consumedRows.length > 0 ? (
        <View className="mt-3">
          <Text className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-subtle">Consumido</Text>
          {consumedRows.map((row, index) => {
            const entry = entriesById.get(row.id)
            return (
              <View key={row.id} className={index > 0 ? 'border-t border-border-subtle' : undefined}>
                <FoodRow
                  food={row}
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
        <NutritionMotionButton accessibilityLabel={`Registrar en ${slot.name}`} tone="neutral" onPress={onRegister}>
          + Registrar en {slot.name}
        </NutritionMotionButton>
      </View>
    </NutritionCard>
  )
}

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
                    className={`min-h-12 flex-1 items-center justify-center rounded-control border ${active ? 'border-ember-500 bg-ember-100' : 'border-border-default bg-surface-app'}`}
                  >
                    <Text className={`text-sm font-semibold ${active ? 'text-ember-700' : 'text-text-muted'}`}>{value}</Text>
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
