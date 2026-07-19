'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  buildNutritionPortionIntakeKey,
  type NutritionDayCoverageRead,
  type NutritionMealSlotRead,
  type NutritionSlotExchangeTargetRead,
  type NutritionTodayReadModel,
} from '@eva/nutrition-v2'
import { PORTIONS_COPY } from '@/lib/nutrition-portions-copy'
import { humanizeStudentWriteError } from '@/lib/student-access'
import {
  markPortionIntakeAction,
  undoPortionIntakeAction,
} from '../_actions/intake.actions'
import {
  activeSyntheticMarks,
  attemptFor,
  bumpAttempt,
  collectTodayIntakeIds,
  dayCoverageWithPending,
  dupPortionInfo,
  effectiveTargetCoverage,
  getOrCreateNutritionDeviceId,
  loadPortionAttemptMap,
  nextMarkForTarget,
  nextPortionOrdinal,
  pendingInCell,
  pendingPortionsSum,
  portionAttemptKey,
  portionsCountLabelEs,
  reconcilePendingMarks,
  savePortionAttemptMap,
  splitRetryCopy,
  type EffectivePortionCoverage,
  type PendingPortionMark,
  type PortionAttemptMap,
} from './portion-marks.logic'

/**
 * Estado del marcar-porción del alumno web (SPEC UX-b/UX-c, hallazgos F1-front/B2/M1).
 *
 * - Delta optimista SOLO de `marcadas`: cada tap agrega una marca pendiente que suma
 *   sobre el último read-model; al llegar un fetch nuevo, las confirmadas salen del
 *   delta (reconciliación por entryId del server action). El segmento nunca salta
 *   hacia atrás; las `derivadas` jamás se estiman en cliente.
 * - Idempotencia: key canónica `buildNutritionPortionIntakeKey` con ordinal (índice
 *   del evento de marcado en la celda) y attempt (contador local persistido que sube
 *   con cada deshacer del ordinal — re-marcar tras deshacer = intake NUEVO).
 * - Deshacer: void del último intake sintético del gesto (snackbar 5 s). Si la marca
 *   sigue en vuelo, el deshacer queda pedido y se ejecuta apenas confirme.
 */

/** Registro interno del gesto (sobrevive a la reconciliación para el deshacer). */
interface MarkRecord {
  key: string
  slotCode: string
  groupCode: string
  ordinal: number
  portions: number
  entryId: string | null
}

interface MarkInput {
  slot: NutritionMealSlotRead
  target: NutritionSlotExchangeTargetRead
  portions: 0.5 | 1
}

export interface PortionMarksApi {
  /** Cobertura efectiva (server + delta optimista) de un target de la franja. */
  coverageFor: (slotCode: string, target: NutritionSlotExchangeTargetRead) => EffectivePortionCoverage
  /** True si hay una marca EN VUELO (sin confirmar) en esa celda (estilo pending). */
  hasInFlight: (slotCode: string, groupCode: string) => boolean
  /** Cobertura del día con delta optimista (fila "Porciones de hoy"). */
  dayCoverage: NutritionDayCoverageRead[]
  /** Marca `portions` en la celda (mismo camino para tap, sheet y extra confirmado). */
  mark: (input: MarkInput) => void
  /** Aviso anti-duplicado para "Registrar alimento" (null si no aplica). */
  dupWarningFor: (foodId: string, mealSlotCode: string | null) => string | null
  /** Qué haría el próximo tap sobre el target (para decidir confirmación de exceso). */
  nextMarkFor: (
    slotCode: string,
    target: NutritionSlotExchangeTargetRead,
  ) => { extra: boolean; portions: 0.5 | 1 }
}

export function usePortionMarks({
  today,
  clientId,
}: {
  today: NutritionTodayReadModel
  clientId: string
}): PortionMarksApi {
  const router = useRouter()
  const localDate = today.localDate

  const storage = typeof window !== 'undefined' ? window.localStorage : null
  const [deviceId] = useState(() => getOrCreateNutritionDeviceId(storage))
  const [pending, setPending] = useState<PendingPortionMark[]>([])
  const attemptMapRef = useRef<PortionAttemptMap | null>(null)
  if (attemptMapRef.current === null) {
    attemptMapRef.current = loadPortionAttemptMap(storage, clientId, localDate)
  }
  // Fuente de verdad SÍNCRONA del delta (dos taps en el mismo frame no comparten
  // ordinal); el estado `pending` es su espejo para re-render. Toda mutación pasa
  // por los helpers de abajo, que actualizan ref + estado juntos.
  const pendingRef = useRef<PendingPortionMark[]>([])
  /** Gestos vivos por key: el deshacer necesita el entryId aunque ya se reconcilió. */
  const marksRef = useRef<Map<string, MarkRecord>>(new Map())
  /** Deshacer pedido mientras la marca estaba en vuelo (se ejecuta al confirmar). */
  const undoRequestedRef = useRef<Set<string>>(new Set())

  const commitPending = useCallback((next: PendingPortionMark[]) => {
    pendingRef.current = next
    setPending(next)
  }, [])

  // Reconciliación F1-front: al llegar un read-model nuevo, las marcas confirmadas
  // que ya aparecen en él salen del delta (nunca se restan dos veces).
  const todayIds = useMemo(() => collectTodayIntakeIds(today), [today])
  useEffect(() => {
    commitPending(reconcilePendingMarks(pendingRef.current, todayIds))
  }, [todayIds, commitPending])

  const removePending = useCallback(
    (key: string) => {
      commitPending(pendingRef.current.filter((m) => m.key !== key))
    },
    [commitPending],
  )

  const doUndo = useCallback(
    async (key: string) => {
      const record = marksRef.current.get(key)
      if (!record || !record.entryId) return
      try {
        const res = await undoPortionIntakeAction({ clientId, entryId: record.entryId })
        if (!res.ok) {
          toast.error(humanizeStudentWriteError(res.error, PORTIONS_COPY.student.undoFailed))
          return
        }
        // El attempt del ordinal sube en CADA deshacer (B2/M1): re-marcar después
        // produce una key NUEVA que jamás colisiona con el intake anulado.
        const aKey = portionAttemptKey(localDate, record.slotCode, record.groupCode, record.ordinal)
        attemptMapRef.current = bumpAttempt(attemptMapRef.current ?? {}, aKey)
        savePortionAttemptMap(storage, clientId, attemptMapRef.current)
        marksRef.current.delete(key)
        removePending(key)
        router.refresh()
      } catch {
        toast.error(PORTIONS_COPY.student.undoFailedOffline)
      }
    },
    [clientId, localDate, removePending, router, storage],
  )

  const requestUndo = useCallback(
    (key: string) => {
      const record = marksRef.current.get(key)
      if (!record) return
      if (!record.entryId) {
        // Marca aún en vuelo: se anota el deseo y se deshace apenas confirme (así el
        // gesto nunca "gana" al deshacer del alumno).
        undoRequestedRef.current.add(key)
        return
      }
      void doUndo(key)
    },
    [doUndo],
  )

  const mark = useCallback(
    (input: MarkInput) => {
      // Función interna nombrada: el "Reintentar" del toast re-ejecuta el MISMO gesto
      // (recomputa ordinal/attempt sobre el estado actual ⇒ misma key ⇒ dedup).
      function runMark({ slot, target, portions }: MarkInput): void {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        // Web PWA sin cola offline: honesto y sin optimismo fantasma (UX-c).
        toast(PORTIONS_COPY.student.offline)
        return
      }
      const slotCode = slot.code
      const groupCode = target.groupCode
      const activeCount = activeSyntheticMarks(slot.intakeItems, groupCode).length
      const cellPending = pendingInCell(pendingRef.current, slotCode, groupCode)
      const ordinal = nextPortionOrdinal(activeCount, cellPending.length)
      const aKey = portionAttemptKey(localDate, slotCode, groupCode, ordinal)
      const attempt = attemptFor(attemptMapRef.current ?? {}, aKey)
      const key = buildNutritionPortionIntakeKey({
        clientId,
        deviceId,
        localDate,
        slotCode,
        groupCode,
        ordinal,
        attempt,
      })

      const record: MarkRecord = { key, slotCode, groupCode, ordinal, portions, entryId: null }
      marksRef.current.set(key, record)
      commitPending([
        ...pendingRef.current,
        {
          key,
          slotCode,
          groupCode,
          groupName: target.groupName,
          portions,
          ordinal,
          attempt,
          entryId: null,
        },
      ])

      const retryCopy = splitRetryCopy(PORTIONS_COPY.student.markFailed)
      const onFailure = (message: string) => {
        marksRef.current.delete(key)
        undoRequestedRef.current.delete(key)
        removePending(key)
        toast.error(message, {
          duration: 6000,
          // Reintento del MISMO gesto: recomputa ordinal/attempt sobre el estado
          // actual (sin la marca fallida) ⇒ misma key ⇒ dedup si el server sí guardó.
          action: { label: retryCopy.retryLabel, onClick: () => runMark({ slot, target, portions }) },
        })
      }

      void markPortionIntakeAction({
        clientId,
        localDate,
        timezone: today.timezone,
        slotCode,
        groupCode,
        groupName: target.groupName,
        portions,
        ordinal,
        attempt,
        deviceId,
        ref: {
          calories: target.ref.calories,
          proteinG: target.ref.proteinG,
          carbsG: target.ref.carbsG,
          fatsG: target.ref.fatsG,
        },
      })
        .then((res) => {
          if (!res.ok) {
            onFailure(humanizeStudentWriteError(res.error, retryCopy.message))
            return
          }
          const entryId = res.data.entryId
          record.entryId = entryId
          commitPending(pendingRef.current.map((m) => (m.key === key ? { ...m, entryId } : m)))
          if (undoRequestedRef.current.has(key)) {
            undoRequestedRef.current.delete(key)
            void doUndo(key)
            return
          }
          toast(portions === 0.5 ? PORTIONS_COPY.student.markedHalf : PORTIONS_COPY.student.marked, {
            duration: 5000,
            action: { label: PORTIONS_COPY.student.undo, onClick: () => requestUndo(key) },
          })
          router.refresh()
        })
        .catch(() => {
          const offline = typeof navigator !== 'undefined' && navigator.onLine === false
          onFailure(offline ? PORTIONS_COPY.student.offline : retryCopy.message)
        })
      }
      runMark(input)
    },
    [clientId, commitPending, deviceId, doUndo, localDate, removePending, requestUndo, router, today.timezone],
  )

  const coverageFor = useCallback(
    (slotCode: string, target: NutritionSlotExchangeTargetRead): EffectivePortionCoverage =>
      effectiveTargetCoverage(
        target,
        pendingPortionsSum(pendingInCell(pending, slotCode, target.groupCode)),
      ),
    [pending],
  )

  const hasInFlight = useCallback(
    (slotCode: string, groupCode: string): boolean =>
      pendingInCell(pending, slotCode, groupCode).some((m) => m.entryId === null),
    [pending],
  )

  const dayCoverage = useMemo(
    () => dayCoverageWithPending(today.dayCoverage, pending),
    [today.dayCoverage, pending],
  )

  const dupWarningFor = useCallback(
    (foodId: string, mealSlotCode: string | null): string | null => {
      const info = dupPortionInfo({ foodId, mealSlotCode, today, pending })
      if (!info) return null
      return PORTIONS_COPY.student.dupWarning(portionsCountLabelEs(info.marcadas), info.groupName)
    },
    [today, pending],
  )

  const nextMarkFor = useCallback(
    (slotCode: string, target: NutritionSlotExchangeTargetRead) =>
      nextMarkForTarget(target.portions, coverageFor(slotCode, target).coverage),
    [coverageFor],
  )

  return { coverageFor, hasInFlight, dayCoverage, mark, dupWarningFor, nextMarkFor }
}
