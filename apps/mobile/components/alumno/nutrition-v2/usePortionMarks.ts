/**
 * usePortionMarks — orquestador del marcar/deshacer porciones del Hoy RN (SPEC
 * UX-b/UX-c). Mantiene el delta optimista SOLO-marcadas sobre el último read-model
 * (hallazgo F1-front), enruta cada marca por la MISMA cola offline del intake V2
 * (una entrada más de la cola, key `buildNutritionPortionIntakeKey` ordinal+attempt)
 * y aplica la semántica de deshacer del hallazgo M1:
 *
 *  - marca aún en la COLA → cancela la entrada local (sin void) PERO incrementa el
 *    contador `attempt` del ordinal igual (si ya había sincronizado sin que el
 *    device lo supiera, el próximo marcar no colisiona);
 *  - marca ya sincronizada → void por el camino de corrección existente (la
 *    correctora del RPC neutraliza `exchange_portions`).
 *
 * Fallo determinista (4xx) → revierte el segmento + snackbar `markFailed` con
 * reintento. Los buckets por franja usan referencias estables (hallazgo M3): las
 * franjas no afectadas por un tap conservan identidad de props y no re-renderizan.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert } from 'react-native'
import * as Haptics from 'expo-haptics'
import type {
  NutritionMealSlotRead,
  NutritionSlotExchangeTargetRead,
  NutritionTodayReadModel,
} from '@eva/nutrition-v2'
import { PORTIONS_COPY } from '../../../lib/nutrition-portions-copy'
import {
  allocatePortionAttempt,
  buildPortionMarkMutation,
  cancelQueuedPortionMark,
  getQueuedPortionKeys,
  pickLastSyntheticIntake,
  reconcilePendingPortionMarks,
  registerPortionUndo,
  stablePortionBuckets,
  type PendingPortionMark,
  type PendingPortionVoid,
} from '../../../lib/nutrition-v2-portions'
import { buildVoidIntakeCorrection } from '../../../lib/nutrition-v2-intake'
import {
  newNutritionV2OperationId,
  submitCorrectIntake,
  submitRecordIntake,
} from '../../../lib/nutrition-v2-intake-runner'
import type { PortionSnackbarState } from './PortionSnackbar'

const SNACKBAR_MS = 5000
const RELOAD_DEBOUNCE_MS = 1200
const EMPTY_MARKS: PendingPortionMark[] = []
const EMPTY_VOIDS: PendingPortionVoid[] = []

export interface UsePortionMarksInput {
  userId: string | null
  deviceId: string | null
  model: NutritionTodayReadModel | null
  date: string
  timezone: string
  /** Refresco del read-model (debounced internamente tras marcas confirmadas). */
  requestReload: () => void
  /** Notifica cambios en la cola offline (badge de pendientes). */
  onQueuedChange?: () => void
}

export interface UsePortionMarksResult {
  /** ¿El plan del día tiene capa de porciones? (sin targets ⇒ CERO UI). */
  active: boolean
  pendingBySlot: Record<string, PendingPortionMark[]>
  voidsBySlot: Record<string, PendingPortionVoid[]>
  pendingByGroup: Record<string, number>
  voidedByGroup: Record<string, number>
  snackbar: PortionSnackbarState | null
  dismissSnackbar: () => void
  mark: (
    slotCode: string,
    target: NutritionSlotExchangeTargetRead,
    portions: 1 | 0.5,
    completes: boolean,
  ) => void
  /** Reconciliación por idempotency key contra un fetch fresco (F1-front). */
  reconcile: (fetchStartedAt: number) => void
}

export function usePortionMarks(input: UsePortionMarksInput): UsePortionMarksResult {
  const { userId, deviceId, date, timezone, requestReload, onQueuedChange } = input

  const [marks, setMarks] = useState<PendingPortionMark[]>(EMPTY_MARKS)
  const [voids, setVoids] = useState<PendingPortionVoid[]>(EMPTY_VOIDS)
  const [snackbar, setSnackbar] = useState<PortionSnackbarState | null>(null)

  const marksRef = useRef(marks)
  marksRef.current = marks
  const voidsRef = useRef(voids)
  voidsRef.current = voids
  const modelRef = useRef(input.model)
  modelRef.current = input.model

  const mountedRef = useRef(true)
  const snackbarNonce = useRef(0)
  const snackbarTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const marksBucketsRef = useRef<Record<string, PendingPortionMark[]>>({})
  const voidsBucketsRef = useRef<Record<string, PendingPortionVoid[]>>({})

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      if (snackbarTimer.current) clearTimeout(snackbarTimer.current)
      if (reloadTimer.current) clearTimeout(reloadTimer.current)
    }
  }, [])

  const active = useMemo(() => {
    const model = input.model
    if (!model) return false
    if ((model.dayCoverage?.length ?? 0) > 0) return true
    return model.mealSlots.some((slot) => (slot.exchangeTargets?.length ?? 0) > 0)
  }, [input.model])

  const pendingBySlot = useMemo(() => {
    const buckets = stablePortionBuckets(marksBucketsRef.current, marks)
    marksBucketsRef.current = buckets
    return buckets
  }, [marks])

  const voidsBySlot = useMemo(() => {
    const buckets = stablePortionBuckets(voidsBucketsRef.current, voids)
    voidsBucketsRef.current = buckets
    return buckets
  }, [voids])

  const pendingByGroup = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const mark of marks) totals[mark.groupCode] = (totals[mark.groupCode] ?? 0) + mark.portions
    return totals
  }, [marks])

  const voidedByGroup = useMemo(() => {
    const totals: Record<string, number> = {}
    for (const item of voids) totals[item.groupCode] = (totals[item.groupCode] ?? 0) + item.portions
    return totals
  }, [voids])

  const dismissSnackbar = useCallback(() => {
    if (snackbarTimer.current) clearTimeout(snackbarTimer.current)
    setSnackbar(null)
  }, [])

  const showSnackbar = useCallback((next: Omit<PortionSnackbarState, 'nonce'>) => {
    snackbarNonce.current += 1
    setSnackbar({ ...next, nonce: snackbarNonce.current })
    if (snackbarTimer.current) clearTimeout(snackbarTimer.current)
    snackbarTimer.current = setTimeout(() => {
      if (mountedRef.current) setSnackbar(null)
    }, SNACKBAR_MS)
  }, [])

  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current)
    reloadTimer.current = setTimeout(() => {
      if (mountedRef.current) requestReload()
    }, RELOAD_DEBOUNCE_MS)
  }, [requestReload])

  const patchMark = useCallback((key: string, patch: Partial<PendingPortionMark>) => {
    setMarks((prev) =>
      prev.map((mark) => (mark.idempotencyKey === key ? { ...mark, ...patch } : mark)),
    )
  }, [])

  const removeMark = useCallback((key: string) => {
    setMarks((prev) => prev.filter((mark) => mark.idempotencyKey !== key))
  }, [])

  // ── Deshacer de una marca YA reflejada por el read-model (void del último
  // intake sintético del grupo en la franja — camino de corrección existente). ──
  const undoFromModel = useCallback(
    async (slotCode: string, groupCode: string) => {
      const model = modelRef.current
      if (!model || !userId || !deviceId) return
      const slot = model.mealSlots.find((s) => s.code === slotCode)
      const entry = slot ? pickLastSyntheticIntake(slot.intakeItems, groupCode) : null
      if (!entry) return
      const portions = entry.exchangePortions ?? entry.quantity
      // M1: TODO deshacer incrementa el attempt del ordinal, también este.
      await registerPortionUndo({ userId, localDate: date, slotCode, groupCode })
      const payload = buildVoidIntakeCorrection({
        clientId: userId,
        deviceId,
        operationId: newNutritionV2OperationId(),
        localDate: date,
        occurredAt: new Date().toISOString(),
        timezone,
        entry,
        planVersionId: model.plan?.versionId ?? null,
        daySnapshotId: model.snapshotId ?? null,
        reason: 'Porción desmarcada por el alumno',
      })
      const pendingVoid: PendingPortionVoid = {
        entryId: entry.id,
        idempotencyKey: payload.idempotencyKey,
        slotCode,
        groupCode,
        portions,
        status: 'inflight',
        confirmedAt: null,
        createdAt: Date.now(),
      }
      setVoids((prev) => [...prev, pendingVoid])
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      const outcome = await submitCorrectIntake(userId, payload)
      if (!mountedRef.current) return
      if (outcome.status === 'recorded') {
        setVoids((prev) =>
          prev.map((item) =>
            item.idempotencyKey === payload.idempotencyKey
              ? { ...item, status: 'confirmed', confirmedAt: Date.now() }
              : item,
          ),
        )
        scheduleReload()
      } else if (outcome.status === 'queued') {
        setVoids((prev) =>
          prev.map((item) =>
            item.idempotencyKey === payload.idempotencyKey ? { ...item, status: 'queued' } : item,
          ),
        )
        onQueuedChange?.()
      } else {
        setVoids((prev) => prev.filter((item) => item.idempotencyKey !== payload.idempotencyKey))
        Alert.alert('No se pudo deshacer', outcome.error.message)
      }
    },
    [date, deviceId, onQueuedChange, scheduleReload, timezone, userId],
  )

  // ── Deshacer por key (marca aún en el delta optimista). ──
  const undoByKey = useCallback(
    async (key: string, retriesLeft = 4): Promise<void> => {
      if (!userId) return
      const mark = marksRef.current.find((m) => m.idempotencyKey === key)
      if (!mark) return
      if (mark.status === 'inflight') {
        // El outcome del record está por resolverse; reintento corto.
        if (retriesLeft > 0) {
          setTimeout(() => void undoByKey(key, retriesLeft - 1), 400)
        }
        return
      }
      if (mark.status === 'queued') {
        const removed = await cancelQueuedPortionMark(userId, key)
        // M1: el attempt del ordinal se incrementa AUNQUE solo se haya cancelado la cola.
        await registerPortionUndo({
          userId,
          localDate: date,
          slotCode: mark.slotCode,
          groupCode: mark.groupCode,
        })
        if (!mountedRef.current) return
        removeMark(key)
        onQueuedChange?.()
        if (!removed) {
          // Un flush la envió antes de cancelar: el intake existe server-side.
          // Refresco para que aparezca en el read-model (y se pueda deshacer con void).
          requestReload()
        }
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        return
      }
      // 'confirmed': el servidor la tiene pero este read-model aún no ⇒ el delta la
      // aporta. Quitarla del delta + void online; sin void-delta (el modelo actual
      // no la cuenta — evitar doble descuento).
      await registerPortionUndo({
        userId,
        localDate: date,
        slotCode: mark.slotCode,
        groupCode: mark.groupCode,
      })
      if (!mountedRef.current) return
      removeMark(key)
      if (mark.entryId && deviceId) {
        const model = modelRef.current
        const payload = buildVoidIntakeCorrection({
          clientId: userId,
          deviceId,
          operationId: newNutritionV2OperationId(),
          localDate: date,
          occurredAt: new Date().toISOString(),
          timezone,
          // Entry sintetizada desde la marca (el read-model aún no la trae). Solo se
          // usan los campos que la corrección necesita.
          entry: {
            id: mark.entryId,
            foodId: null,
            customName: null,
            quantity: mark.portions,
            unit: 'porción',
            mealSlot: mark.slotCode,
            prescriptionItemId: null,
            snapshot: {
              name: 'Porción marcada',
              brand: null,
              calories: 0,
              proteinG: 0,
              carbsG: 0,
              fatsG: 0,
              fiberG: 0,
              servingSize: null,
              servingUnit: 'porción',
            },
          } as never,
          planVersionId: model?.plan?.versionId ?? null,
          daySnapshotId: model?.snapshotId ?? null,
          reason: 'Porción desmarcada por el alumno',
        })
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        const outcome = await submitCorrectIntake(userId, payload)
        if (!mountedRef.current) return
        if (outcome.status === 'recorded') {
          scheduleReload()
        } else if (outcome.status === 'queued') {
          onQueuedChange?.()
        } else {
          Alert.alert('No se pudo deshacer', outcome.error.message)
          requestReload()
        }
      }
    },
    [date, deviceId, onQueuedChange, removeMark, requestReload, scheduleReload, timezone, userId],
  )

  const undoSmart = useCallback(
    (key: string, slotCode: string, groupCode: string) => {
      if (marksRef.current.some((m) => m.idempotencyKey === key)) {
        void undoByKey(key)
      } else {
        void undoFromModel(slotCode, groupCode)
      }
    },
    [undoByKey, undoFromModel],
  )

  // ── Marcar (SPEC criterio 4): intake sintético optimista por la cola existente. ──
  const mark = useCallback(
    (
      slotCode: string,
      target: NutritionSlotExchangeTargetRead,
      portions: 1 | 0.5,
      completes: boolean,
    ) => {
      if (!userId || !deviceId) return
      void Haptics.selectionAsync()
      void (async () => {
        const { ordinal, attempt } = await allocatePortionAttempt({
          userId,
          localDate: date,
          slotCode,
          groupCode: target.groupCode,
        })
        const model = modelRef.current
        const { payload, idempotencyKey } = buildPortionMarkMutation({
          clientId: userId,
          deviceId,
          localDate: date,
          occurredAt: new Date().toISOString(),
          timezone,
          slotCode,
          planVersionId: model?.plan?.versionId ?? null,
          daySnapshotId: model?.snapshotId ?? null,
          target,
          portions,
          ordinal,
          attempt,
        })
        if (!mountedRef.current) return
        const pendingMark: PendingPortionMark = {
          idempotencyKey,
          slotCode,
          groupCode: target.groupCode,
          portions,
          ordinal,
          attempt,
          status: 'inflight',
          entryId: null,
          confirmedAt: null,
          createdAt: Date.now(),
        }
        setMarks((prev) => [...prev, pendingMark])
        showSnackbar({
          message:
            portions === 0.5 ? PORTIONS_COPY.student.markedHalf : PORTIONS_COPY.student.marked,
          actionLabel: PORTIONS_COPY.student.undo,
          onAction: () => undoSmart(idempotencyKey, slotCode, target.groupCode),
        })
        if (completes) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)

        const outcome = await submitRecordIntake(userId, payload)
        if (!mountedRef.current) return
        if (outcome.status === 'recorded') {
          patchMark(idempotencyKey, {
            status: 'confirmed',
            entryId: outcome.id,
            confirmedAt: Date.now(),
          })
          scheduleReload()
        } else if (outcome.status === 'queued') {
          patchMark(idempotencyKey, { status: 'queued' })
          onQueuedChange?.()
          if (outcome.reason === 'offline') {
            showSnackbar({
              message:
                portions === 0.5 ? PORTIONS_COPY.student.markedHalf : PORTIONS_COPY.student.marked,
              detail: PORTIONS_COPY.student.offline,
              actionLabel: PORTIONS_COPY.student.undo,
              onAction: () => undoSmart(idempotencyKey, slotCode, target.groupCode),
            })
          }
        } else {
          // 4xx determinista: revertir el segmento + rollback del ordinal (attempt++)
          // + snackbar de reintento (SPEC UX-c).
          removeMark(idempotencyKey)
          await registerPortionUndo({
            userId,
            localDate: date,
            slotCode,
            groupCode: target.groupCode,
          })
          if (!mountedRef.current) return
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
          showSnackbar({
            message: PORTIONS_COPY.student.markFailed,
            tone: 'danger',
            actionLabel: 'Reintentar',
            onAction: () => mark(slotCode, target, portions, completes),
          })
        }
      })()
    },
    [
      date,
      deviceId,
      onQueuedChange,
      patchMark,
      removeMark,
      scheduleReload,
      showSnackbar,
      timezone,
      undoSmart,
      userId,
    ],
  )

  // ── Reconciliación contra un read-model fresco (F1-front). ──
  const reconcile = useCallback(
    (fetchStartedAt: number) => {
      if (!userId) return
      void getQueuedPortionKeys(userId).then((queuedKeys) => {
        if (!mountedRef.current) return
        setMarks((prev) => reconcilePendingPortionMarks(prev, { fetchStartedAt, queuedKeys }))
        setVoids((prev) => reconcilePendingPortionMarks(prev, { fetchStartedAt, queuedKeys }))
      })
    },
    [userId],
  )

  return {
    active,
    pendingBySlot,
    voidsBySlot,
    pendingByGroup,
    voidedByGroup,
    snackbar,
    dismissSnackbar,
    mark,
    reconcile,
  }
}
