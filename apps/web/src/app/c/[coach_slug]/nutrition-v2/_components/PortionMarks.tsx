'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { useCaptureStudentNutritionIntake } from '@/lib/posthog/events'
import {
  markPortionIntakeAction,
  undoPortionIntakeAction,
} from './nutrition-api'
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
 * - Ráfagas (P1-4): marcar el día entero son decenas de taps. Ni el `router.refresh()` ni el
 *   snackbar van por marca — uno solo agrupa la ráfaga (contador + Deshacer del lote) y la
 *   reconciliación con el server se dispara UNA vez, tras la inactividad.
 */

/** Id único del snackbar de porciones: cada marca ACTUALIZA este mismo toast, no apila otro. */
const MARK_TOAST_ID = 'nutrition-v2-portion-mark'

/** Vida del snackbar agrupado; sonner reinicia la cuenta con cada actualización de la ráfaga. */
const MARK_TOAST_MS = 5000

/**
 * Inactividad tras la última marca antes de reconciliar con el server. El delta optimista ya
 * cubre chips y "Porciones de hoy", así que refrescar por marca solo costaba: 18 taps eran 18
 * refetch RSC completos y 18 de los 30 cargos por minuto del rate limit de intake — el alumno
 * podía autobloquearse haciendo exactamente lo que la pantalla le pide.
 */
const PORTION_REFRESH_DEBOUNCE_MS = 4000

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

/**
 * Payload CONGELADO del gesto: se arma una sola vez y el reintento reenvía este mismo objeto, así
 * la idempotency key del server (que sale de ordinal + attempt) no puede cambiar entre intentos.
 */
type MarkRequest = Parameters<typeof markPortionIntakeAction>[0]

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

/**
 * Copy del snackbar AGRUPADO. Los dos casos de una sola marca conservan el copy canónico de
 * `PORTIONS_COPY.student` (tabla UX-d); el plural se compone con el MISMO formateador es-CL de
 * la capa ("1,5 porciones marcadas", "3 porciones marcadas"), sin inventar cifras ni jerga.
 */
function markedBurstMessage(totalPortions: number): string {
  if (totalPortions === 0.5) return PORTIONS_COPY.student.markedHalf
  if (totalPortions === 1) return PORTIONS_COPY.student.marked
  return `${portionsCountLabelEs(totalPortions)} marcadas`
}

export function usePortionMarks({
  today,
  clientId,
  refreshToday,
}: {
  today: NutritionTodayReadModel
  clientId: string
  /**
   * Reconciliación con el server SIN `router.refresh()` (QA T2.7 F4, H9): un refresh del router
   * descartado por una navegación deja los tabs muertos hasta recargar. El caller lee el today
   * fresco por server action y lo vuelca en su estado base; este hook solo decide CUÁNDO.
   */
  refreshToday: () => Promise<void> | void
}): PortionMarksApi {
  const captureIntake = useCaptureStudentNutritionIntake()
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
  /** Marcas confirmadas que cuenta el snackbar vivo (se vacía cuando el snackbar se cierra). */
  const burstRef = useRef<Array<{ key: string; portions: number }>>([])
  /** Timer de la reconciliación debounced (una sola por ráfaga de marcas). */
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const commitPending = useCallback((next: PendingPortionMark[]) => {
    // Cinturón de la reconciliación: si el delta no cambió (misma referencia — ver
    // reconcilePendingMarks), no se agenda ningún setState. Un setPending incondicional acá
    // re-renderizaba en cada replay optimista y sostenía la tormenta que dejaba al App Router
    // sin navegación (T2.7, "marco → tabs muertos").
    if (next === pendingRef.current) return
    pendingRef.current = next
    setPending(next)
  }, [])

  const clearBurst = useCallback(() => {
    burstRef.current = []
  }, [])

  const cancelScheduledRefresh = useCallback(() => {
    if (refreshTimerRef.current !== null) {
      clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = null
    }
  }, [])

  /**
   * Reconciliación con el server: UNA por ráfaga, tras `PORTION_REFRESH_DEBOUNCE_MS` sin marcar
   * (cerrar el sheet y quedarse en la pantalla cae dentro de esa ventana). Cada marca nueva
   * reprograma el timer, así que marcar el día entero cuesta un solo refetch.
   */
  const scheduleRefresh = useCallback(() => {
    cancelScheduledRefresh()
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null
      void refreshToday()
    }, PORTION_REFRESH_DEBOUNCE_MS)
  }, [cancelScheduledRefresh, refreshToday])

  // Al desmontar se CANCELA el refresh pendiente: dispararlo después refrescaría la pantalla a la
  // que navegó el alumno, no ésta. Nada queda a medias — las marcas ya están guardadas en el
  // server, así que la próxima carga las lee del read-model sin depender de este timer.
  useEffect(
    () => () => {
      cancelScheduledRefresh()
    },
    [cancelScheduledRefresh],
  )

  // Reconciliación F1-front: al llegar un read-model nuevo, las marcas confirmadas
  // que ya aparecen en él salen del delta (nunca se restan dos veces).
  const todayIds = useMemo(() => collectTodayIntakeIds(today), [today])
  useEffect(() => {
    commitPending(reconcilePendingMarks(pendingRef.current, todayIds))
  }, [todayIds, commitPending])

  /**
   * Delta que se PINTA: la misma reconciliación pura, aplicada en render. El efecto de arriba
   * poda el estado un frame después, así que sin esto el frame en que llega el read-model nuevo
   * pinta server + delta (doble conteo). Con la reconciliación agrupada ese parpadeo sería el de
   * la ráfaga completa (12/6 y un "+6" fantasma), no el de una marca.
   */
  const visiblePending = useMemo(() => reconcilePendingMarks(pending, todayIds), [pending, todayIds])

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
        burstRef.current = burstRef.current.filter((m) => m.key !== key)
        // Mismo refresh debounced que la marca: deshacer un lote no dispara N refetch.
        scheduleRefresh()
      } catch {
        toast.error(PORTIONS_COPY.student.undoFailedOffline)
      }
    },
    [clientId, localDate, removePending, scheduleRefresh, storage],
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

  /**
   * "Deshacer" del snackbar agrupado: revierte TODAS las marcas que el contador muestra, en
   * orden inverso al marcado. Cada una se deshace por su propio camino idempotente
   * (`requestUndo`), así que una marca aún en vuelo se deshace apenas confirme.
   */
  const undoBurst = useCallback(() => {
    const keys = burstRef.current.map((m) => m.key).reverse()
    burstRef.current = []
    for (const key of keys) requestUndo(key)
  }, [requestUndo])

  const mark = useCallback(
    (input: MarkInput) => {
      /**
       * Envía un gesto YA construido. El "Reintentar" del toast reenvía EXACTAMENTE este payload
       * —misma key, mismo ordinal, mismo attempt— en vez de recalcularlos sobre el estado del
       * momento: si el servidor sí había guardado pero la respuesta se perdió, y entremedio entró
       * un refresh o una marca vecina, un ordinal recalculado producía una key NUEVA y la misma
       * porción entraba dos veces.
       */
      function submitMark(key: string, request: MarkRequest): void {
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
          // Web PWA sin cola offline: honesto y sin optimismo fantasma (UX-c).
          toast(PORTIONS_COPY.student.offline)
          return
        }
        const { slotCode, groupCode, ordinal, attempt, portions } = request

        const record: MarkRecord = { key, slotCode, groupCode, ordinal, portions, entryId: null }
        marksRef.current.set(key, record)
        commitPending([
          ...pendingRef.current,
          {
            key,
            slotCode,
            groupCode,
            groupName: request.groupName,
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
            // Reintento del MISMO gesto: reenvía el payload congelado ⇒ misma key ⇒ dedup si
            // el server sí guardó.
            action: { label: retryCopy.retryLabel, onClick: () => submitMark(key, request) },
          })
        }

        void markPortionIntakeAction(request)
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
            captureIntake('portion_chip')
            // Snackbar AGRUPADO: una sola pastilla que se ACTUALIZA con el total de la ráfaga
            // ("3 porciones marcadas · Deshacer") en vez de apilar una por marca tapando la franja
            // siguiente. Su "Deshacer" revierte el lote completo, que es lo que el contador promete.
            burstRef.current = [...burstRef.current, { key, portions }]
            const burstPortions = burstRef.current.reduce((sum, m) => sum + m.portions, 0)
            toast(markedBurstMessage(burstPortions), {
              id: MARK_TOAST_ID,
              duration: MARK_TOAST_MS,
              action: { label: PORTIONS_COPY.student.undo, onClick: () => undoBurst() },
              onAutoClose: clearBurst,
              onDismiss: clearBurst,
            })
            scheduleRefresh()
          })
          .catch(() => {
            const offline = typeof navigator !== 'undefined' && navigator.onLine === false
            onFailure(offline ? PORTIONS_COPY.student.offline : retryCopy.message)
          })
      }

      /** Congela el gesto: ordinal y attempt se resuelven UNA vez, acá. */
      function runMark({ slot, target, portions }: MarkInput): void {
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
        submitMark(key, {
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
      }
      runMark(input)
    },
    [
      captureIntake,
      clearBurst,
      clientId,
      commitPending,
      deviceId,
      doUndo,
      localDate,
      removePending,
      scheduleRefresh,
      today.timezone,
      undoBurst,
    ],
  )

  const coverageFor = useCallback(
    (slotCode: string, target: NutritionSlotExchangeTargetRead): EffectivePortionCoverage =>
      effectiveTargetCoverage(
        target,
        pendingPortionsSum(pendingInCell(visiblePending, slotCode, target.groupCode)),
      ),
    [visiblePending],
  )

  const hasInFlight = useCallback(
    (slotCode: string, groupCode: string): boolean =>
      pendingInCell(visiblePending, slotCode, groupCode).some((m) => m.entryId === null),
    [visiblePending],
  )

  const dayCoverage = useMemo(
    () => dayCoverageWithPending(today.dayCoverage, visiblePending),
    [today.dayCoverage, visiblePending],
  )

  const dupWarningFor = useCallback(
    (foodId: string, mealSlotCode: string | null): string | null => {
      const info = dupPortionInfo({ foodId, mealSlotCode, today, pending: visiblePending })
      if (!info) return null
      return PORTIONS_COPY.student.dupWarning(portionsCountLabelEs(info.marcadas), info.groupName)
    },
    [today, visiblePending],
  )

  const nextMarkFor = useCallback(
    (slotCode: string, target: NutritionSlotExchangeTargetRead) =>
      nextMarkForTarget(target.portions, coverageFor(slotCode, target).coverage),
    [coverageFor],
  )

  return { coverageFor, hasInFlight, dayCoverage, mark, dupWarningFor, nextMarkFor }
}
