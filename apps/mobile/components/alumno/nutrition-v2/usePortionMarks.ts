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
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import * as Haptics from 'expo-haptics'
import type {
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
  queuedPortionOverlayFromMutations,
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
import { getNutritionV2QueuedMutations } from '../../../lib/nutrition-v2-offline'
import type { PortionSnackbarState } from './PortionSnackbar'

const SNACKBAR_MS = 5000
const RELOAD_DEBOUNCE_MS = 1200
const EMPTY_MARKS: PendingPortionMark[] = []
const EMPTY_VOIDS: PendingPortionVoid[] = []

interface MarkBucketsState {
  items: PendingPortionMark[]
  buckets: Record<string, PendingPortionMark[]>
}

interface VoidBucketsState {
  items: PendingPortionVoid[]
  buckets: Record<string, PendingPortionVoid[]>
}

function reduceMarkBuckets(
  state: MarkBucketsState,
  items: PendingPortionMark[],
): MarkBucketsState {
  return { items, buckets: stablePortionBuckets(state.buckets, items) }
}

function reduceVoidBuckets(
  state: VoidBucketsState,
  items: PendingPortionVoid[],
): VoidBucketsState {
  return { items, buckets: stablePortionBuckets(state.buckets, items) }
}

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

  const [{ items: marks, buckets: pendingBySlot }, dispatchMarks] = useReducer(
    reduceMarkBuckets,
    { items: EMPTY_MARKS, buckets: {} },
  )
  const [{ items: voids, buckets: voidsBySlot }, dispatchVoids] = useReducer(
    reduceVoidBuckets,
    { items: EMPTY_VOIDS, buckets: {} },
  )
  const [snackbar, setSnackbar] = useState<PortionSnackbarState | null>(null)

  const marksRef = useRef<PendingPortionMark[]>(EMPTY_MARKS)
  const voidsRef = useRef<PendingPortionVoid[]>(EMPTY_VOIDS)
  const modelRef = useRef(input.model)

  const mountedRef = useRef(true)
  const snackbarNonce = useRef(0)
  const snackbarTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const undoRequestedRef = useRef<Set<string>>(new Set())
  const markLocksRef = useRef<Set<string>>(new Set())
  const markLocksPendingReleaseRef = useRef<Map<string, string>>(new Map())
  const markRef = useRef<UsePortionMarksResult['mark']>(() => {})

  useEffect(() => {
    mountedRef.current = true
    const markLocks = markLocksRef.current
    const pendingReleases = markLocksPendingReleaseRef.current
    return () => {
      mountedRef.current = false
      if (snackbarTimer.current) clearTimeout(snackbarTimer.current)
      if (reloadTimer.current) clearTimeout(reloadTimer.current)
      markLocks.clear()
      pendingReleases.clear()
    }
  }, [])

  const commitMarks = useCallback((next: PendingPortionMark[]) => {
    marksRef.current = next
    dispatchMarks(next)
  }, [])

  const commitVoids = useCallback((next: PendingPortionVoid[]) => {
    voidsRef.current = next
    dispatchVoids(next)
  }, [])

  useEffect(() => {
    modelRef.current = input.model
  }, [input.model])

  const releaseMarkLock = useCallback((lockKey: string) => {
    markLocksRef.current.delete(lockKey)
    markLocksPendingReleaseRef.current.delete(lockKey)
  }, [])

  // A lock acquired before the async ordinal allocation remains active until React
  // has rendered the optimistic mark. A second gesture therefore cannot calculate
  // coverage from stale props or allocate another ordinal for the same group.
  useEffect(() => {
    const renderedKeys = new Set(marks.map((mark) => mark.idempotencyKey))
    for (const [lockKey, idempotencyKey] of markLocksPendingReleaseRef.current) {
      if (renderedKeys.has(idempotencyKey)) releaseMarkLock(lockKey)
    }
  }, [marks, releaseMarkLock])

  // Rebuild queued portion marks from the authoritative user-scoped queue. This
  // restores the pending segment/dot after an offline remount without trusting a
  // second local store or estimating derived coverage.
  useEffect(() => {
    commitMarks([])
    commitVoids([])
    undoRequestedRef.current.clear()
    markLocksRef.current.clear()
    markLocksPendingReleaseRef.current.clear()
    if (!userId) return
    let active = true
    void getNutritionV2QueuedMutations(userId)
      .then((queued) => {
        if (!active || !mountedRef.current) return
        const restored = queuedPortionOverlayFromMutations(queued, date)
        const existingMarks = new Set(marksRef.current.map((mark) => mark.idempotencyKey))
        const existingVoids = new Set(voidsRef.current.map((item) => item.idempotencyKey))
        commitMarks([
          ...marksRef.current,
          ...restored.marks.filter((mark) => !existingMarks.has(mark.idempotencyKey)),
        ])
        commitVoids([
          ...voidsRef.current,
          ...restored.voids.filter((item) => !existingVoids.has(item.idempotencyKey)),
        ])
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [commitMarks, commitVoids, date, userId])

  const active = useMemo(() => {
    const model = input.model
    if (!model) return false
    if (model.dayCoverage?.some((row) => row.prescribed > 0)) return true
    return model.mealSlots.some((slot) => (slot.exchangeTargets?.length ?? 0) > 0)
  }, [input.model])

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

  const showSnackbar = useCallback((
    next: Omit<PortionSnackbarState, 'nonce'>,
    timeoutMs: number = SNACKBAR_MS,
  ) => {
    snackbarNonce.current += 1
    setSnackbar({ ...next, nonce: snackbarNonce.current })
    if (snackbarTimer.current) clearTimeout(snackbarTimer.current)
    snackbarTimer.current = setTimeout(() => {
      if (mountedRef.current) setSnackbar(null)
    }, timeoutMs)
  }, [])

  const scheduleReload = useCallback(() => {
    if (reloadTimer.current) clearTimeout(reloadTimer.current)
    reloadTimer.current = setTimeout(() => {
      if (mountedRef.current) requestReload()
    }, RELOAD_DEBOUNCE_MS)
  }, [requestReload])

  const patchMark = useCallback((key: string, patch: Partial<PendingPortionMark>) => {
    commitMarks(
      marksRef.current.map((mark) =>
        mark.idempotencyKey === key ? { ...mark, ...patch } : mark,
      ),
    )
  }, [commitMarks])

  const removeMark = useCallback((key: string) => {
    commitMarks(marksRef.current.filter((mark) => mark.idempotencyKey !== key))
  }, [commitMarks])

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
      let pendingKey: string | null = null
      try {
        // M1: TODO deshacer incrementa el attempt del ordinal, también este.
        await registerPortionUndo({ userId, localDate: date, slotCode, groupCode })
        if (!mountedRef.current) return
        const payload = buildVoidIntakeCorrection({
          clientId: userId,
          deviceId,
          operationId: newNutritionV2OperationId(),
          localDate: date,
          timezone,
          entry,
          planVersionId: model.plan?.versionId ?? null,
          daySnapshotId: model.snapshotId ?? null,
          reason: 'Porción desmarcada por el alumno',
        })
        pendingKey = payload.idempotencyKey
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
        commitVoids([...voidsRef.current, pendingVoid])
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
        const outcome = await submitCorrectIntake(userId, payload)
        if (!mountedRef.current) return
        if (outcome.status === 'recorded') {
          commitVoids(
            voidsRef.current.map((item) =>
              item.idempotencyKey === payload.idempotencyKey
                ? { ...item, status: 'confirmed', confirmedAt: Date.now() }
                : item,
            ),
          )
          scheduleReload()
        } else if (outcome.status === 'queued') {
          commitVoids(
            voidsRef.current.map((item) =>
              item.idempotencyKey === payload.idempotencyKey ? { ...item, status: 'queued' } : item,
            ),
          )
          onQueuedChange?.()
        } else {
          commitVoids(
            voidsRef.current.filter((item) => item.idempotencyKey !== payload.idempotencyKey),
          )
          showSnackbar({
            message: PORTIONS_COPY.student.undoFailed,
            detail: outcome.error.message,
            tone: 'danger',
          })
        }
      } catch (error) {
        if (!mountedRef.current) return
        if (pendingKey) {
          commitVoids(
            voidsRef.current.filter((item) => item.idempotencyKey !== pendingKey),
          )
        }
        showSnackbar({
          message: PORTIONS_COPY.student.undoFailed,
          detail: error instanceof Error ? error.message : undefined,
          tone: 'danger',
        })
      }
    },
    [
      commitVoids,
      date,
      deviceId,
      onQueuedChange,
      scheduleReload,
      showSnackbar,
      timezone,
      userId,
    ],
  )

  // ── Deshacer por key (marca aún en el delta optimista). ──
  const undoByKey = useCallback(
    async (key: string): Promise<void> => {
      if (!userId) return
      try {
      const mark = marksRef.current.find((m) => m.idempotencyKey === key)
      if (!mark) {
        undoRequestedRef.current.delete(key)
        return
      }
      if (mark.status === 'inflight') {
        // La intencion no expira por tiempo: se consume apenas el record resuelva
        // como confirmado o encolado, aunque la red tarde mas que el snackbar.
        undoRequestedRef.current.add(key)
        return
      }
      undoRequestedRef.current.delete(key)
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
          timezone,
          // Entry sintetizada desde la marca (el read-model aún no la trae). Solo se
          // usan los campos que la corrección necesita.
          entry: {
            id: mark.entryId,
            occurredAt: mark.occurredAt,
            foodId: null,
            customName: null,
            quantity: mark.portions,
            unit: 'porción',
            mealSlot: mark.slotCode,
            prescriptionItemId: null,
            // buildVoidIntakeCorrection lee estos campos a nivel de entry (no del
            // snapshot). Sin ellos, queuedPortionOverlayFromMutations descarta el
            // void al remontar offline y la porción desmarcada reaparece.
            exchangeGroupCode: mark.groupCode,
            exchangePortions: mark.portions,
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
          showSnackbar({
            message: PORTIONS_COPY.student.undoFailed,
            detail: outcome.error.message,
            tone: 'danger',
          })
          requestReload()
        }
      }
      } catch (error) {
        undoRequestedRef.current.delete(key)
        if (!mountedRef.current) return
        showSnackbar({
          message: PORTIONS_COPY.student.undoFailed,
          detail: error instanceof Error ? error.message : undefined,
          tone: 'danger',
        })
        requestReload()
      }
    },
    [
      date,
      deviceId,
      onQueuedChange,
      removeMark,
      requestReload,
      scheduleReload,
      showSnackbar,
      timezone,
      userId,
    ],
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
      const lockKey = JSON.stringify([slotCode, target.groupCode])
      if (markLocksRef.current.has(lockKey)) return
      markLocksRef.current.add(lockKey)
      void Haptics.selectionAsync()
      void (async () => {
        let ordinal: number
        let attempt: number
        try {
          const allocation = await allocatePortionAttempt({
            userId,
            localDate: date,
            slotCode,
            groupCode: target.groupCode,
          })
          ordinal = allocation.ordinal
          attempt = allocation.attempt
          if (!mountedRef.current) {
            releaseMarkLock(lockKey)
            return
          }
        } catch (error) {
          releaseMarkLock(lockKey)
          if (!mountedRef.current) return
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
          showSnackbar(
            {
              message: PORTIONS_COPY.student.markFailed,
              detail: error instanceof Error ? error.message : undefined,
              tone: 'danger',
              actionLabel: PORTIONS_COPY.student.retry,
              onAction: () => markRef.current(slotCode, target, portions, completes),
            },
            6000,
          )
          return
        }
        const model = modelRef.current
        let mutation: ReturnType<typeof buildPortionMarkMutation>
        try {
          mutation = buildPortionMarkMutation({
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
        } catch (error) {
          await registerPortionUndo({
            userId,
            localDate: date,
            slotCode,
            groupCode: target.groupCode,
          }).catch(() => {})
          releaseMarkLock(lockKey)
          if (!mountedRef.current) return
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
          showSnackbar(
            {
              message: PORTIONS_COPY.student.markFailed,
              detail: error instanceof Error ? error.message : undefined,
              tone: 'danger',
              actionLabel: PORTIONS_COPY.student.retry,
              onAction: () => markRef.current(slotCode, target, portions, completes),
            },
            6000,
          )
          return
        }
        const { payload, idempotencyKey } = mutation
        if (!mountedRef.current) {
          releaseMarkLock(lockKey)
          return
        }
        const pendingMark: PendingPortionMark = {
          idempotencyKey,
          slotCode,
          groupCode: target.groupCode,
          portions,
          occurredAt: payload.occurredAt,
          ordinal,
          attempt,
          status: 'inflight',
          entryId: null,
          confirmedAt: null,
          createdAt: Date.now(),
        }
        markLocksPendingReleaseRef.current.set(lockKey, idempotencyKey)
        commitMarks([...marksRef.current, pendingMark])
        showSnackbar({
          message:
            portions === 0.5 ? PORTIONS_COPY.student.markedHalf : PORTIONS_COPY.student.marked,
          actionLabel: PORTIONS_COPY.student.undo,
          onAction: () => undoSmart(idempotencyKey, slotCode, target.groupCode),
        })
        if (completes) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)

        let outcome: Awaited<ReturnType<typeof submitRecordIntake>>
        try {
          outcome = await submitRecordIntake(userId, payload)
        } catch (error) {
          removeMark(idempotencyKey)
          releaseMarkLock(lockKey)
          const undoWasRequested = undoRequestedRef.current.delete(idempotencyKey)
          await registerPortionUndo({
            userId,
            localDate: date,
            slotCode,
            groupCode: target.groupCode,
          }).catch(() => {})
          if (!mountedRef.current || undoWasRequested) return
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
          showSnackbar(
            {
              message: PORTIONS_COPY.student.markFailed,
              detail: error instanceof Error ? error.message : undefined,
              tone: 'danger',
              actionLabel: PORTIONS_COPY.student.retry,
              onAction: () => markRef.current(slotCode, target, portions, completes),
            },
            6000,
          )
          return
        }
        if (!mountedRef.current) return
        if (outcome.status === 'recorded') {
          patchMark(idempotencyKey, {
            status: 'confirmed',
            entryId: outcome.id,
            confirmedAt: Date.now(),
          })
          scheduleReload()
          if (undoRequestedRef.current.has(idempotencyKey)) {
            void undoByKey(idempotencyKey)
          }
        } else if (outcome.status === 'queued') {
          patchMark(idempotencyKey, { status: 'queued' })
          onQueuedChange?.()
          if (undoRequestedRef.current.has(idempotencyKey)) {
            void undoByKey(idempotencyKey)
          } else if (outcome.reason === 'offline') {
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
          releaseMarkLock(lockKey)
          const undoWasRequested = undoRequestedRef.current.delete(idempotencyKey)
          await registerPortionUndo({
            userId,
            localDate: date,
            slotCode,
            groupCode: target.groupCode,
          })
          if (!mountedRef.current) return
          if (!undoWasRequested) {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
            showSnackbar(
              {
                message: PORTIONS_COPY.student.markFailed,
                tone: 'danger',
                actionLabel: PORTIONS_COPY.student.retry,
                onAction: () => markRef.current(slotCode, target, portions, completes),
              },
              6000,
            )
          }
        }
      })()
    },
    [
      date,
      commitMarks,
      deviceId,
      onQueuedChange,
      patchMark,
      releaseMarkLock,
      removeMark,
      scheduleReload,
      showSnackbar,
      timezone,
      undoByKey,
      undoSmart,
      userId,
    ],
  )

  useEffect(() => {
    markRef.current = mark
  }, [mark])

  // ── Reconciliación contra un read-model fresco (F1-front). ──
  const reconcile = useCallback(
    (fetchStartedAt: number) => {
      if (!userId) return
      void getQueuedPortionKeys(userId).then((queuedKeys) => {
        if (!mountedRef.current) return
        commitMarks(
          reconcilePendingPortionMarks(marksRef.current, { fetchStartedAt, queuedKeys }),
        )
        commitVoids(
          reconcilePendingPortionMarks(voidsRef.current, { fetchStartedAt, queuedKeys }),
        )
      })
    },
    [commitMarks, commitVoids, userId],
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
