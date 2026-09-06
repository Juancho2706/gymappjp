'use client'

import { useCallback, useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { toast } from 'sonner'
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Lock,
  Pencil,
  Plus,
  ScanBarcode,
  Share2,
  Star,
  Trash2,
  Utensils,
} from 'lucide-react'
import {
  buildNutritionDayShareText,
  bulkMarkCtaLabel,
  bulkMarkSlotState,
  computeSubstitutionEquivalence,
  consumedPrescriptionItemIds,
  convertQuantityBetweenUnits,
  firstNameFromFullName,
  foodUnitOptionsWithCurrent,
  formatItemQuantity,
  formatNutritionCalories,
  kcalBucket,
  prescribedItemImplausibleCopy,
  prescribedItemPlausibility,
  sortFoodsByFavoriteFirst,
  substituteFromOption,
  substitutionAttemptFromToday,
  swipeApplicableOptions,
  swipeOptionAt,
  type BulkMarkSlotState,
  type FoodCatalogItem,
  type ItemPlausibility,
  type NutritionIntakeReadItem,
  type NutritionTodayReadModel,
  type SubstitutionAnyOption,
  type SubstitutionEquivalence,
  type SubstitutionOptionsItem,
} from '@eva/nutrition-v2'
import { MacroChipRow, NutritionCard, NutritionMotionButton } from '@/components/nutrition-v2'
import { humanizeStudentWriteError } from '@/lib/student-access'
import { AuraHero } from './AuraHero'
import { ImplausibleIntakeDialog } from './ImplausibleIntakeDialog'
import { SubstitutionSheet } from './SubstitutionSheet'
import { SwipeToExchange } from './SwipeToExchange'
import { TodayModal } from './TodayModal'
import { NutritionFoodRow } from './NutritionFoodRow'
import { foodResultImage, resolveFoodImageUrl } from './food-result-image'
import {
  applyTodayOptimistic,
  buildBulkPrescribedPayloads,
  buildBulkUndoPayloads,
  buildCatalogIntakePayload,
  buildCorrectionPayload,
  buildOptimisticIntakeEntry,
  buildOptimisticSubstitutionEntry,
  buildPrescribedIntakePayload,
  buildVoidPayload,
  bumpPrescribedAttempt,
  catalogIntakeDefaults,
  catalogIntakeSubmission,
  consumedEntries,
  consumedEntryForItem,
  contextFromToday,
  estimateCatalogIntakeTotals,
  formatIntakeClock,
  loadPrescribedAttemptMap,
  mealSlotOptions,
  newIdempotencyKey,
  outOfPlanEntries,
  prescribedAttemptFor,
  prescribedAttemptKey,
  prescribedIntakeIdempotencyKey,
  resolveItemDisplayNote,
  savePrescribedAttemptMap,
  slotFreeEntries,
  slotPortionMarksTotal,
  type PrescribedAttemptMap,
  type TodayOptimisticAction,
} from './nutrition-today.logic'
import { usePortionMarks, type PortionMarksApi } from './PortionMarks'
import { PortionCoverageRow } from './PortionCoverageRow'
import { CoachNoteBand } from './CoachNoteBand'
import { PortionSlotSection } from './PortionSlotSection'
import { PortionEquivalencesSheet } from './PortionEquivalencesSheet'
import { formatPortionsEs, slotsWithPrescribedContent } from './portion-marks.logic'
// H12: TODO lo que esta pantalla habla con el servidor viaja por `nutrition-api.ts` (fetch al
// puente HTTP), nunca como server action directa — una server action en vuelo podía dejar el
// App Router sin navegación hasta recargar (H9/H11), y el flujo de "marcar" lo disparaba
// siempre. `fetch()` no toca el router: se puede navegar con la request aún en vuelo.
import {
  correctIntakeAction,
  fetchNutritionTodayAction,
  getFavoriteFoodIdsAction,
  listFavoriteFoodsAction,
  recordIntakeAction,
  recordSlotIntakeBatchAction,
  recordSubstitutionIntakeAction,
  searchFoodCatalogAction,
  toggleFavoriteFoodAction,
  voidIntakeAction,
  voidSlotIntakeBatchAction,
} from './nutrition-api'
import { useNavigationGate } from './navigation-gate'
import { readTodayCache, writeTodayCache } from './today-cache'
import {
  useCaptureNutritionItemImplausible,
  useCaptureStudentNutritionCorrection,
  useCaptureStudentNutritionIntake,
} from '@/lib/posthog/events'

// NOTA: `closeDayAction` (cierre manual del día) se retiró de la UI por decisión del CEO — los
// registros ya se guardan solos, la card "Cerrar mi día" confundía. El action y su RPC siguen
// VIVOS en `../_actions/intake.actions` como mecanismo interno para un cierre automático futuro;
// aquí simplemente ya no se invocan.
//
// El chip global "Ya registraste hoy" que colgaba de aquí se retiró (auditoría H2): lo dicen el
// anillo del héroe, el punto verde del selector semanal y el check de cada fila — afirmarlo una
// cuarta vez arriba de todo no agregaba ninguna decisión.

/**
 * Cuánto dura el acuse «Marcado» del CTA de la franja una vez que el refetch reconcilió. No es una
 * animación decorativa: es el único frame en que el alumno ve confirmado lo que tocó, porque justo
 * después el control se desmonta solo (la franja quedó completa).
 */
const BULK_MARKED_FLASH_MS = 1600

/** Franja e item prescrito tal como los trae el read model del Hoy. */
type TodaySlot = NutritionTodayReadModel['mealSlots'][number]
type PrescribedItem = TodaySlot['prescriptionItems'][number]

/**
 * Confirmación de "Lo comí" sobre umbral (SPEC cantidades-honestas §4.5): el gesto queda
 * congelado acá hasta que el alumno confirma. `item` = un click en el check; `bulk` = "Comí toda
 * esta comida" con al menos un elegible sospechoso.
 */
type ImplausibleIntakeConfirm =
  | { kind: 'item'; slot: TodaySlot; item: PrescribedItem; body: string }
  | { kind: 'bulk'; slot: TodaySlot; state: BulkMarkSlotState; body: string; names: string[] }

/**
 * Items (por id + motivo) que ya emitieron `nutrition_item_implausible` en esta sesión. A nivel
 * MÓDULO y no de estado: la métrica de W1.6 cuenta "cuántos avisos distintos vio un usuario", no
 * cuántas veces volvió a tocar el mismo item, y el componente se remonta con cada navegación.
 */
const IMPLAUSIBLE_EVENT_SENT = new Set<string>()

type DialogState =
  | { kind: 'none' }
  // `initialMealSlot`: preselección de franja al llegar desde el sheet de equivalencias.
  | { kind: 'register'; initialMealSlot?: string | null; initialQuery?: string }
  | { kind: 'edit'; entry: NutritionIntakeReadItem }
  | { kind: 'void'; entry: NutritionIntakeReadItem }
  // T2.4: confirmación de cantidad para los dos casos degradados de la equivalencia
  // (`needs-confirmation` por cantidad implausible, `unavailable` por falta de datos). El camino
  // normal NO abre diálogo: registra de un tap.
  | {
      kind: 'substitute'
      itemEntry: SubstitutionOptionsItem
      option: SubstitutionAnyOption
      equivalence: SubstitutionEquivalence
    }

export function TodayExperience({
  today: serverToday,
  clientId,
  scanHref,
  clientName,
  substitutionOptionsByItem = {},
  visibleNotes = null,
  weekInRangeCount = null,
}: {
  today: NutritionTodayReadModel
  clientId: string
  scanHref: string
  /** Nombre completo del alumno para el saludo del héroe (opcional; sin él, saludo sin nombre). */
  clientName?: string | null
  /**
   * Reemplazos autorizados por el coach (F-02), agrupados por `prescriptionItemId`. El server los
   * lee RLS-scoped de la versión vigente; aquí solo se muestran bajo el item. Vacío ⇒ sin reemplazos.
   */
  substitutionOptionsByItem?: Record<string, SubstitutionOptionsItem>
  /**
   * Nota visible del coach (SPEC ola 3 punto 2): antes solo vivía en el tab "Plan", que el alumno
   * abre menos — sube al Hoy en una card colapsable bajo el héroe. `null`/vacío ⇒ no se pinta nada.
   */
  visibleNotes?: string | null
  /** Racha honesta semanal (T2.7 F2): días de la semana en curso dentro del rango; `null` = sin chip. */
  weekInRangeCount?: number | null
}) {
  const [isPending, startTransition] = useTransition()
  /**
   * Base del read model en estado CLIENTE + capa optimista (F7 · H2) encima: cada mutación
   * aplica su delta antes de esperar la server action; al confirmar, `syncTodayFromServer`
   * trae la verdad por una server action de LECTURA y la vuelca en `baseToday` — y si la
   * acción falla, la transición termina sin sync y la pantalla REVIERTE sola a la base.
   *
   * Por qué NO `router.refresh()` (QA T2.7 F4, hallazgo H9): un refresh del router en vuelo
   * que un click de navegación descarta deja al App Router suspendido en una promesa huérfana
   * y los tabs dejan de navegar hasta recargar la página (bugs abiertos de Next:
   * vercel/next.js#86055/#86151/#45830 — reproducido determinísticamente con "Retirar
   * registro" → click a Historial). Ninguna mutación de esta pantalla encola acciones del
   * router; el costo asumido es que el strip semanal RSC no refresca en caliente (H5).
   */
  // Base inicial: la última verdad conocida POR PESTAÑA si existe (H10 — al volver de Plan/
  // Historial el `serverToday` puede llegar del cache stale del router, sin la mutación recién
  // hecha); si no hay, el payload del servidor.
  const [baseToday, setBaseToday] = useState(
    () => readTodayCache(clientId, serverToday.localDate) ?? serverToday,
  )
  const [today, applyTodayDelta] = useOptimistic(baseToday, applyTodayOptimistic)
  /** Solo la lectura MÁS RECIENTE puede escribir la base (dos syncs en vuelo no conmutan). */
  const todaySyncSeqRef = useRef(0)

  /**
   * Reconcilia `baseToday` con el servidor tras una mutación CONFIRMADA. Si la lectura falla
   * (red), los deltas confirmados se aplican a la base directamente: el servidor ya escribió,
   * revertir la pantalla sería mentir. Todo lo que adopta la base pasa también al cache por
   * pestaña (H10) para sobrevivir el próximo cambio de tab.
   */
  async function syncTodayFromServer(confirmedDeltas: TodayOptimisticAction[]) {
    const seq = ++todaySyncSeqRef.current
    try {
      const res = await fetchNutritionTodayAction({ clientId, date: serverToday.localDate })
      if (res.ok) {
        if (seq === todaySyncSeqRef.current) {
          writeTodayCache(clientId, res.today)
          setBaseToday(res.today)
        }
        return
      }
    } catch {
      // Lectura caída: cae al commit local de abajo.
    }
    if (seq === todaySyncSeqRef.current && confirmedDeltas.length > 0) {
      setBaseToday((prev) => {
        const next = confirmedDeltas.reduce(applyTodayOptimistic, prev)
        // Efecto colateral idempotente (StrictMode puede repetirlo sin daño): la base y el
        // cache por pestaña no pueden divergir o el próximo cambio de tab pierde el commit.
        writeTodayCache(clientId, next)
        return next
      })
    }
  }

  // Cambio de payload RSC (navegación de vuelta, refresh externo): si hay verdad por pestaña se
  // prefiere ésa y se reconcilia con la action de lectura — el payload puede ser MÁS viejo que
  // la última mutación (cache del router) o más nuevo (otro dispositivo); la lectura decide.
  useEffect(() => {
    const cached = readTodayCache(clientId, serverToday.localDate)
    if (cached) {
      setBaseToday(cached)
      void syncTodayFromServer([])
    } else {
      setBaseToday(serverToday)
    }
    // syncTodayFromServer es estable de facto (deps: clientId + serverToday.localDate, ya acá).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, serverToday])

  // Compuerta de navegación (H9): mientras una server action esté en vuelo, los clicks a links
  // internos se difieren y se despachan al drenar la cola — jamás se descarta una acción.
  const router = useRouter()
  useNavigationGate(useCallback((href: string) => router.push(href), [router]))
  const [busyId, setBusyId] = useState<string | null>(null)
  /**
   * Franja cuyo registro en bloque acaba de RECONCILIAR con el servidor (acuse «Marcado»).
   *
   * Sin esto el CTA desaparecía en el mismo frame del tap —el delta optimista ya deja la franja
   * `complete` y `BulkMarkControl` devolvía null— y durante el ~1 s del refetch el alumno se
   * quedaba sin ninguna respuesta a lo que acababa de tocar: el triple tap reportado. Ahora el
   * control se queda montado, deshabilitado y en su estado de guardado hasta que la verdad del
   * servidor llega, y recién ahí acusa «Marcado» antes de desmontarse.
   */
  const [markedSlotId, setMarkedSlotId] = useState<string | null>(null)
  const markedSlotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  function clearSlotMarked() {
    if (markedSlotTimerRef.current !== null) {
      clearTimeout(markedSlotTimerRef.current)
      markedSlotTimerRef.current = null
    }
    setMarkedSlotId(null)
  }
  function flashSlotMarked(slotId: string) {
    if (markedSlotTimerRef.current !== null) clearTimeout(markedSlotTimerRef.current)
    setMarkedSlotId(slotId)
    markedSlotTimerRef.current = setTimeout(() => {
      markedSlotTimerRef.current = null
      setMarkedSlotId(null)
    }, BULK_MARKED_FLASH_MS)
  }
  // Al desmontar no queda ningún timer vivo apuntando a un setState de esta pantalla.
  useEffect(
    () => () => {
      if (markedSlotTimerRef.current !== null) clearTimeout(markedSlotTimerRef.current)
    },
    [],
  )
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogState>({ kind: 'none' })
  /**
   * T2.5: item cuyo sheet de intercambio está abierto. Estado propio y no parte de `DialogState`
   * porque los dos pueden convivir: elegir dentro del sheet una opción que exige confirmar abre el
   * diálogo ENCIMA, y cancelar tiene que devolver a la lista, no a la pantalla.
   */
  const [exchange, setExchange] = useState<{
    itemEntry: SubstitutionOptionsItem
    consumedFoodId: string | null
  } | null>(null)
  /**
   * Cuántos swipes lleva cada item, para que el siguiente ofrezca la siguiente opción. Es un ref
   * y no estado: cambiarlo no tiene que repintar la lista entera, y el ciclo es efímero por
   * definición — se reinicia con la pantalla, igual que la intención del alumno.
   */
  const swipeCycleRef = useRef<Record<string, number>>({})
  /**
   * Attempts del camino PRESCRITO (NUT-003). La clave del "Lo comí" ya no es un uuid por gesto
   * sino la intención (día + item), así que un doble toque —o el mismo toque desde una pestaña con
   * el read-model viejo— colapsa en el RPC. El attempt sube SOLO al retirar un registro del item:
   * sin eso la clave chocaría con la entry retirada y el item quedaría inconsumible el resto del
   * día. Persistido, porque deshacer y recargar antes de volver a marcar es un camino real.
   */
  const attemptStorage = typeof window !== 'undefined' ? window.localStorage : null
  const prescribedAttemptsRef = useRef<PrescribedAttemptMap | null>(null)
  if (prescribedAttemptsRef.current === null) {
    prescribedAttemptsRef.current = loadPrescribedAttemptMap(
      attemptStorage,
      clientId,
      serverToday.localDate,
    )
  }
  const captureIntake = useCaptureStudentNutritionIntake()
  const captureCorrection = useCaptureStudentNutritionCorrection()
  const captureImplausible = useCaptureNutritionItemImplausible()
  /** Confirmación de "Lo comí" sobre umbral (SPEC cantidades-honestas §4.5): gesto en pausa. */
  const [implausibleConfirm, setImplausibleConfirm] = useState<ImplausibleIntakeConfirm | null>(null)

  const ctx = useMemo(() => contextFromToday(today, clientId), [today, clientId])

  /** Attempt vigente del item para armar su clave (1 = todavía no se retiró nada suyo hoy). */
  function prescribedAttempt(prescriptionItemId: string): number {
    return prescribedAttemptFor(
      prescribedAttemptsRef.current ?? {},
      prescribedAttemptKey(ctx.date, prescriptionItemId),
    )
  }

  /**
   * Quema la clave del item tras retirar uno de sus registros: el próximo "Lo comí" usa una clave
   * nueva en vez de rebotar contra el short-circuit del RPC (que no mira `entry_status`).
   */
  function burnPrescribedAttempt(prescriptionItemId: string | null | undefined) {
    if (!prescriptionItemId) return
    const key = prescribedAttemptKey(ctx.date, prescriptionItemId)
    prescribedAttemptsRef.current = bumpPrescribedAttempt(prescribedAttemptsRef.current ?? {}, key)
    savePrescribedAttemptMap(attemptStorage, clientId, prescribedAttemptsRef.current)
  }
  const entries = useMemo(() => consumedEntries(today), [today])
  const slotOptions = useMemo(() => mealSlotOptions(today), [today])
  // "Fuera del plan" (auditoría H4): lo que no calza en ninguna franja renderizada. El set de
  // franjas mostradas se deriva del MISMO filtro que `PrescribedSection` usa para sus cards, así
  // ningún registro desaparece en silencio si su franja no tiene card.
  const renderedSlotCodes = useMemo(
    () => new Set(slotsWithPrescribedContent(today).map((slot) => slot.code)),
    [today],
  )
  const outOfPlan = useMemo(() => outOfPlanEntries(today, renderedSlotCodes), [today, renderedSlotCodes])

  // Capa de porciones (SPEC UX-b): invisible si el plan no tiene targets (Q1) — el
  // hook no agrega UI ni estado visible sin `dayCoverage`/`exchangeTargets`.
  const portionsApi = usePortionMarks({
    today,
    clientId,
    // Mismo motivo que arriba (H9): la reconciliación de la ráfaga de porciones tampoco puede
    // encolar `router.refresh()`; lee el today fresco y lo vuelca en la base.
    refreshToday: () => syncTodayFromServer([]),
  })
  const [portionSheet, setPortionSheet] = useState<{ slotCode: string; groupCode: string } | null>(null)
  const portionSheetSlot = portionSheet
    ? today.mealSlots.find((slot) => slot.code === portionSheet.slotCode) ?? null
    : null

  function runMutation(
    id: string,
    action: () => Promise<{ ok: boolean; error?: string }>,
    onSuccess?: () => void,
    optimistic?: TodayOptimisticAction,
  ) {
    setError(null)
    setBusyId(id)
    startTransition(async () => {
      // El delta se pinta ANTES de esperar al servidor; si la acción falla, la transición
      // termina sin refresh y `useOptimistic` revierte sola al último estado del servidor.
      if (optimistic) applyTodayDelta(optimistic)
      try {
        const res = await action()
        if (!res.ok) {
          // Fallo honesto del server (rate limit, scope, validacion, RPC): NO se cierra el
          // dialogo ni se refresca — el estado optimista jamas se confirma y el error se
          // muestra DENTRO del dialogo (ver DialogError), no en un banner tapado por el sheet.
          // COACH_ACCOUNT_PAUSED (gate de suscripcion del coach) llega como codigo => copy humano.
          setError(humanizeStudentWriteError(res.error, 'No se pudo completar la acción.'))
          return
        }
        onSuccess?.()
        await syncTodayFromServer(optimistic ? [optimistic] : [])
      } catch {
        // La server action lanzo (red caida, timeout de rate-limit, excepcion del server):
        // sin este catch el error se tragaba en silencio y el registro se perdia sin aviso.
        setError('No pudimos guardar tu registro. Revisa tu conexión e inténtalo de nuevo.')
      } finally {
        setBusyId(null)
      }
    })
  }

  /** El "Lo comí" de siempre, ya confirmado si hacía falta (§4.5: el diálogo no toca el payload). */
  function runEatPrescribed(slot: TodaySlot, item: PrescribedItem) {
    const payload = buildPrescribedIntakePayload({
      context: ctx,
      slot,
      item,
      idempotencyKey: prescribedIntakeIdempotencyKey({
        localDate: ctx.date,
        prescriptionItemId: item.id,
        attempt: prescribedAttempt(item.id),
      }),
    })
    runMutation(
      `eat:${item.id}`,
      () => recordIntakeAction({ payload }),
      () => captureIntake('item_tap'),
      {
        kind: 'add',
        slotCode: slot.code,
        entry: buildOptimisticIntakeEntry({
          payload,
          // Totales = los macros prescritos que la fila ya muestra (el snapshot va
          // normalizado per-unidad justamente para que el RPC reconstruya este número).
          totals: {
            calories: item.macros.calories ?? 0,
            proteinG: item.macros.proteinG ?? 0,
            carbsG: item.macros.carbsG ?? 0,
            fatsG: item.macros.fatsG ?? 0,
            fiberG: item.macros.fiberG ?? 0,
          },
          media: item.media ?? null,
          category: item.category ?? null,
        }),
      },
    )
  }

  /**
   * `nutrition_item_implausible` (W1.6) al MOSTRAR la confirmación, una vez por (item, motivo) y
   * sesión. Viajan metadatos: superficie, unidad, motivo y TRAMO de kcal — nunca la cifra ni el
   * nombre del alimento (Ley 21.719, regla del módulo de eventos).
   */
  function captureImplausibleOnce(item: PrescribedItem, assessment: ItemPlausibility) {
    const reason = assessment.reasons[0]
    if (!reason) return
    const key = `${item.id}:${reason}`
    if (IMPLAUSIBLE_EVENT_SENT.has(key)) return
    IMPLAUSIBLE_EVENT_SENT.add(key)
    captureImplausible({
      surface: 'today',
      unit: item.unit,
      reason,
      kcalBucket: kcalBucket(assessment.calories),
    })
  }

  /**
   * SPEC §4.5: entre el click y las 4.470 kcal del "Huevo revuelto 30 un" no había nada. Si el
   * item pasa el umbral se abre la confirmación; si no, el flujo corre igual que siempre. Avisa,
   * no bloquea, y confirmar no cambia ni el payload ni la idempotency key.
   */
  function handleEat(slot: TodaySlot, item: PrescribedItem) {
    const assessment = prescribedItemPlausibility(item)
    if (!assessment.implausible) {
      runEatPrescribed(slot, item)
      return
    }
    captureImplausibleOnce(item, assessment)
    setImplausibleConfirm({
      kind: 'item',
      slot,
      item,
      body: prescribedItemImplausibleCopy(item, assessment),
    })
  }

  /**
   * Mismo guard para la franja entera: si ALGÚN elegible pasa el umbral se pregunta UNA sola vez
   * por la comida. Con un solo sospechoso el cuerpo es su propia explicación; con varios, el
   * conteo más la lista corta de nombres.
   */
  function handleBulkEat(slot: TodaySlot, state: BulkMarkSlotState) {
    if (state.eligible.length === 0) return
    const flagged = state.eligible
      .map((item) => ({ item, assessment: prescribedItemPlausibility(item) }))
      .filter(({ assessment }) => assessment.implausible)
    if (flagged.length === 0) {
      runBulkEat(slot, state)
      return
    }
    for (const { item, assessment } of flagged) captureImplausibleOnce(item, assessment)
    setImplausibleConfirm({
      kind: 'bulk',
      slot,
      state,
      body:
        flagged.length === 1
          ? prescribedItemImplausibleCopy(flagged[0].item, flagged[0].assessment)
          : `${flagged.length} ítems de esta comida suman más de lo habitual.`,
      names:
        flagged.length === 1
          ? []
          : flagged.map(
              ({ item, assessment }) =>
                `${item.name ?? 'Alimento prescrito'} · ${formatNutritionCalories(assessment.calories)}`,
            ),
    })
  }

  // Bulk-mark de una franja: registra los elegibles (el helper puro decide cuáles = requeridos no
  // consumidos), 1 request y 1 cargo de rate-limit. Éxito → toast con "Deshacer" (anula los N ids
  // creados por el camino de void). Estado parcial → aviso honesto de cuántos quedaron.
  function runBulkEat(slot: TodaySlot, state: BulkMarkSlotState) {
    if (state.eligible.length === 0) return
    const id = `bulk:${slot.id}`
    const payloads = buildBulkPrescribedPayloads({
      context: ctx,
      slot,
      items: state.eligible,
      attempts: prescribedAttemptsRef.current ?? {},
    })
    // Delta optimista (H2): una entry por item elegible, alineada 1:1 con `payloads`.
    const optimisticEntries = state.eligible.map((item, index) =>
      buildOptimisticIntakeEntry({
        payload: payloads[index],
        totals: {
          calories: item.macros.calories ?? 0,
          proteinG: item.macros.proteinG ?? 0,
          carbsG: item.macros.carbsG ?? 0,
          fatsG: item.macros.fatsG ?? 0,
          fiberG: item.macros.fiberG ?? 0,
        },
        media: item.media ?? null,
        category: item.category ?? null,
      }),
    )
    const bulkDeltas: TodayOptimisticAction[] = optimisticEntries.map((entry) => ({
      kind: 'add',
      slotCode: slot.code,
      entry,
    }))
    setError(null)
    setBusyId(id)
    startTransition(async () => {
      for (const delta of bulkDeltas) {
        applyTodayDelta(delta)
      }
      try {
        const res = await recordSlotIntakeBatchAction({ payloads })
        if (!res.ok) {
          setError(humanizeStudentWriteError(res.error, 'No se pudo registrar la comida.'))
          return
        }
        captureIntake('bulk_slot')
        await syncTodayFromServer(bulkDeltas)
        if (res.failed > 0) {
          toast.warning(
            `Registré ${res.ids.length} de ${payloads.length} en ${slot.name}. Quedaron ${res.failed} sin registrar.`,
          )
          return
        }
        // Recién acá el servidor es la verdad de la pantalla: el CTA acusa «Marcado» y se va.
        flashSlotMarked(slot.id)
        toast.success(`Registraste tu ${slot.name} 🎉`, {
          duration: 6000,
          action: { label: 'Deshacer', onClick: () => handleBulkUndo(slot.name, payloads, res.ids) },
        })
      } catch {
        setError('No pudimos registrar tu comida. Revisa tu conexión e inténtalo de nuevo.')
      } finally {
        setBusyId(null)
      }
    })
  }

  function handleBulkUndo(
    slotName: string,
    payloads: ReturnType<typeof buildBulkPrescribedPayloads>,
    createdIds: string[],
  ) {
    const undo = buildBulkUndoPayloads(payloads, createdIds)
    if (undo.length === 0) return
    const undoDeltas: TodayOptimisticAction[] = undo.map((payload) => ({
      kind: 'void',
      entryId: payload.entryId,
    }))
    // El acuse «Marcado» no puede sobrevivir al deshacer: el CTA vuelve, y volvería deshabilitado.
    clearSlotMarked()
    startTransition(async () => {
      for (const delta of undoDeltas) {
        applyTodayDelta(delta)
      }
      try {
        const res = await voidSlotIntakeBatchAction({ payloads: undo })
        if (res.ok) {
          // `undo[i]` ↔ `payloads[i]` (mismo emparejado por índice que buildBulkUndoPayloads).
          for (let i = 0; i < undo.length; i += 1) {
            burnPrescribedAttempt(payloads[i].prescriptionItemId)
          }
          await syncTodayFromServer(undoDeltas)
          toast.success(`Deshice el registro de ${slotName}.`)
        } else {
          toast.error('No se pudo deshacer. Retira los registros uno por uno en "Consumido hoy".')
        }
      } catch {
        toast.error('No se pudo deshacer. Intenta de nuevo.')
      }
    })
  }

  /**
   * Registrar un reemplazo AUTORIZADO (T2.4). Un tap = un gesto: el cliente manda la intención
   * (qué item, qué reemplazo, qué intento) y el servidor resuelve alimento, cantidad, franja y
   * versión desde la fila autorizada. Ya no pasa por el registro libre ni pide `canRegisterFreely`.
   *
   * `attempt` sale del read-model que la pantalla ya tiene: cuenta los registros de HOY de ese ítem
   * en cualquier estado. Así dos taps seguidos comparten clave (una sola entry) y, en cambio,
   * deshacer y volver a registrar produce una clave nueva — si contara solo los activos, el
   * short-circuit del servidor devolvería el id de la entry retirada y el ítem quedaría
   * inconsumible el resto del día.
   */
  function handleSubstitute(
    itemEntry: SubstitutionOptionsItem,
    option: SubstitutionAnyOption,
    quantity: number | null,
  ) {
    // T2.5: la opción del grupo no tiene fila, así que viaja como `groupFoodId`. Los dos caminos
    // son excluyentes en el contrato y el servidor los valida por separado.
    const isGroupOption = option.substitutionId === null
    const id = `subst:${option.substitutionId ?? `gf-${option.foodId}`}`
    const occurredAt = new Date().toISOString()
    // Delta optimista (H2): la MISMA equivalencia que la UI mostró al elegir. El servidor puede
    // corregir la cantidad (fijada por el coach) y el refresh trae la verdad — y el toast avisa.
    const optimisticEntry = buildOptimisticSubstitutionEntry({
      prescriptionItemId: itemEntry.prescriptionItemId,
      mealSlot: itemEntry.mealSlotCode ?? null,
      foodId: option.foodId,
      equivalence: computeSubstitutionEquivalence({
        item: itemEntry.item,
        substitute: substituteFromOption(option),
      }),
      quantity,
      occurredAt,
    })
    const substituteDelta: TodayOptimisticAction = {
      kind: 'substitute',
      prescriptionItemId: itemEntry.prescriptionItemId,
      slotCode: itemEntry.mealSlotCode ?? null,
      entry: optimisticEntry,
    }
    setError(null)
    setBusyId(id)
    startTransition(async () => {
      applyTodayDelta(substituteDelta)
      try {
        const res = await recordSubstitutionIntakeAction({
          payload: {
            clientId,
            localDate: today.localDate,
            occurredAt,
            timezone: today.timezone,
            prescriptionItemId: itemEntry.prescriptionItemId,
            ...(isGroupOption
              ? { groupFoodId: option.foodId }
              : { substitutionId: option.substitutionId }),
            attempt: substitutionAttemptFromToday(today, itemEntry.prescriptionItemId),
            quantity,
          },
        })
        if (!res.ok) {
          setError(humanizeStudentWriteError(res.error, 'No se pudo registrar el reemplazo.'))
          return
        }
        closeDialog()
        // El sheet también se cierra: quedarse en la lista después de registrar invitaría a
        // registrar dos veces sin ver el resultado.
        setExchange(null)
        captureIntake('substitution')
        await syncTodayFromServer([substituteDelta])
        // El reemplazo no viaja con medida casera (la resuelve `substituteNaturalUnit`), asi que
        // `formatItemQuantity` sin par es «{cantidad} {unidad}» — pero con el plural de «porción».
        const label = formatItemQuantity({ quantity: res.quantity, unit: res.unit })
        toast.success(
          res.mode === 'correct'
            ? `Cambiamos tu registro por el reemplazo · ${label}`
            : `Registraste el reemplazo · ${label}`,
          {
            duration: 6000,
            action: {
              label: 'Deshacer',
              onClick: () => handleSubstitutionUndo(res.id, itemEntry.prescriptionItemId),
            },
          },
        )
        // Copy honesto: el alumno pidió una cantidad y el plan de su coach no la permitía.
        if (res.quantityOverridden) {
          toast.info(`Tu coach fijó la cantidad de este reemplazo: ${label}.`)
        }
      } catch {
        setError('No pudimos registrar el reemplazo. Revisa tu conexión e inténtalo de nuevo.')
      } finally {
        setBusyId(null)
      }
    })
  }

  /**
   * Deslizar la fila (T2.5 F6). Aplica de un gesto el reemplazo del coach que toque en el ciclo;
   * si el item no tiene ninguno aplicable a ciegas, **abre el sheet** en vez de escribir — elegir
   * entre los cientos del grupo es una decisión que se toma mirando, no deslizando.
   */
  function handleSwipeExchange(
    itemEntry: SubstitutionOptionsItem,
    consumedFoodId: string | null,
  ) {
    const options = swipeApplicableOptions({ entry: itemEntry, consumedFoodId })
    const cycle = swipeCycleRef.current[itemEntry.prescriptionItemId] ?? 0
    const option = swipeOptionAt(options, cycle)
    if (!option) {
      setExchange({ itemEntry, consumedFoodId })
      return
    }
    // El swipe siguiente ofrece la opción siguiente: deslizar de nuevo es cambiar de opinión,
    // no repetir el mismo registro.
    swipeCycleRef.current[itemEntry.prescriptionItemId] = cycle + 1
    handleSubstitute(itemEntry, option, null)
  }

  /**
   * Deshacer del toast: mismo camino de retiro que el resto (append-only, nada se borra).
   * Si el reemplazo CORRIGIÓ un "Lo comí" previo, la clave prescrita de ese registro quedó quemada
   * (`corrected`), así que retirarlo devuelve el item a la fila y hay que estrenar clave.
   */
  function handleSubstitutionUndo(entryId: string, prescriptionItemId: string) {
    const undoDelta: TodayOptimisticAction = { kind: 'void', entryId }
    startTransition(async () => {
      applyTodayDelta(undoDelta)
      try {
        const res = await voidIntakeAction({
          payload: {
            clientId,
            entryId,
            reason: 'Deshice la sustitución',
            idempotencyKey: newIdempotencyKey('void'),
          },
        })
        if (res.ok) {
          burnPrescribedAttempt(prescriptionItemId)
          await syncTodayFromServer([undoDelta])
          toast.success('Deshice el reemplazo.')
        } else {
          toast.error('No se pudo deshacer. Retíralo desde la fila del alimento.')
        }
      } catch {
        toast.error('No se pudo deshacer. Intenta de nuevo.')
      }
    })
  }

  // Abrir/cerrar limpia el error para que no arrastre un mensaje viejo dentro del nuevo dialogo.
  const openDialog = (next: DialogState) => {
    if (next.kind === 'edit' || next.kind === 'void') captureCorrection('opened')
    setError(null)
    setDialog(next)
  }
  const closeDialog = () => {
    setError(null)
    setDialog({ kind: 'none' })
  }

  // Compartir: arma un TEXTO resumen del dia (mismo helper puro que RN → microcopy 1:1) y lo
  // comparte por Web Share API; si no existe (desktop), cae al portapapeles + toast. Solo datos
  // del propio alumno (fecha, kcal/meta, macros, lo consumido) — sin datos privados del coach.
  const handleShare = async () => {
    const text = buildNutritionDayShareText({
      localDate: today.localDate,
      planName: today.plan?.name ?? null,
      consumed: {
        calories: today.consumed.calories,
        proteinG: today.consumed.proteinG,
        carbsG: today.consumed.carbsG,
        fatsG: today.consumed.fatsG,
      },
      targets: {
        calories: today.targets.calories,
        proteinG: today.targets.proteinG,
        carbsG: today.targets.carbsG,
        fatsG: today.targets.fatsG,
      },
      items: entries.map((entry) => ({ name: entry.snapshot.name, quantity: entry.quantity, unit: entry.unit })),
    })
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share({ title: 'Mi día de nutrición', text })
        return
      }
    } catch (shareError) {
      // El usuario canceló el diálogo nativo de compartir: no es un error que mostrar.
      if (shareError instanceof DOMException && shareError.name === 'AbortError') return
      // Cualquier otro fallo del share nativo cae al portapapeles abajo.
    }
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Resumen copiado. Pégalo donde quieras compartirlo.')
    } catch {
      toast.error('No se pudo compartir. Intenta de nuevo.')
    }
  }

  return (
    <div className="space-y-5">
      {/* Auditoría H2/H3: fuera el chip "Ya registraste hoy" (lo dicen el anillo, la lista y el
          punto verde del selector) y el `StrategyBadge` (vocabulario del coach que ahora vive
          solo en el tab Plan) — cero afirmaciones sin decisión asociada arriba del héroe. */}
      <AuraHero
        greetingName={firstNameFromFullName(clientName)}
        weekInRangeCount={weekInRangeCount}
        dateKey={today.localDate}
        calories={{ consumed: today.consumed.calories, target: today.targets.calories }}
        macros={{
          protein: { consumed: today.consumed.proteinG, target: today.targets.proteinG },
          carbs: { consumed: today.consumed.carbsG, target: today.targets.carbsG },
          fats: { consumed: today.consumed.fatsG, target: today.targets.fatsG },
        }}
      />

      {/* Nota visible del coach (SPEC ola 3 punto 2): sube al Hoy, card colapsable. */}
      {visibleNotes ? <CoachNoteCard note={visibleNotes} /> : null}

      {/* Fila secundaria compacta de porciones — el héroe único son los anillos. */}
      <PortionCoverageRow items={portionsApi.dayCoverage} />

      {error ? (
        <div
          aria-live="assertive"
          className="flex items-start gap-2 rounded-card border border-rose-300/60 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-700/50 dark:bg-rose-950/30 dark:text-rose-300"
          role="alert"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* CTA principal unico.
          NUT-009: con "Solo alimentos prescritos" (canRegisterFreely = false) el registro libre y
          el escáner NO se muestran — antes se ofrecían igual y el alumno rompía la regla del coach
          sin enterarse. La UI nunca autoriza: el guard real vive en la action y en el RPC; esto es
          coherencia visual + copy honesto de por qué no está el botón. */}
      <div className="flex flex-wrap gap-2">
        {today.permissions.canRegisterFreely ? (
          <>
            <NutritionMotionButton onClick={() => openDialog({ kind: 'register' })}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Registrar alimento
            </NutritionMotionButton>
            <Link
              href={scanHref}
              className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border-default bg-surface-card px-4 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken"
            >
              <ScanBarcode className="h-4 w-4" aria-hidden="true" />
              Escanear
            </Link>
          </>
        ) : (
          <p className="flex items-start gap-2 rounded-card border border-border-subtle bg-surface-sunken px-3 py-2 text-sm text-muted">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Tu coach dejó el plan en solo alimentos prescritos: marca lo que comiste del plan.</span>
          </p>
        )}
        <button
          type="button"
          onClick={() => void handleShare()}
          className="inline-flex min-h-11 items-center gap-2 rounded-control border border-border-default bg-surface-card px-4 text-sm font-semibold text-strong transition-colors hover:bg-surface-sunken"
        >
          <Share2 className="h-4 w-4" aria-hidden="true" />
          Compartir
        </button>
      </div>

      {/* Prescripcion del dia con "Lo comi" por item */}
      <PrescribedSection
        today={today}
        busyId={busyId}
        markedSlotId={markedSlotId}
        portionsApi={portionsApi}
        substitutionOptionsByItem={substitutionOptionsByItem}
        onOpenPortionSheet={(slotCode, groupCode) => setPortionSheet({ slotCode, groupCode })}
        onBulkEat={handleBulkEat}
        onEat={handleEat}
        onEdit={(entry) => openDialog({ kind: 'edit', entry })}
        onVoid={(entry) => openDialog({ kind: 'void', entry })}
        onOpenExchange={(itemEntry, consumedFoodId) =>
          setExchange({ itemEntry, consumedFoodId })
        }
        onSwipeExchange={handleSwipeExchange}
      />

      {/* "Fuera del plan" (auditoría H4): reemplaza a "Consumido hoy". Lo prescrito ya se ve arriba
          en su propia fila (check + hora); acá SOLO lo que no calza en ninguna franja mostrada —
          alimentos libres sin franja y registros de franjas sin card. Sin registros, no se pinta
          nada (el estado vacío ya lo cubren las franjas de arriba; repetirlo era el eco). */}
      {outOfPlan.length > 0 ? (
        <section aria-label="Fuera del plan" className="space-y-3">
          <div className="flex items-center gap-2">
            <Utensils className="h-4 w-4 text-primary dark:text-primary" aria-hidden="true" />
            <h2 className="font-display text-lg font-semibold text-strong">Fuera del plan ({outOfPlan.length})</h2>
          </div>
          <NutritionCard>
            <div className="divide-y divide-border-subtle">
              {outOfPlan.map((entry) => (
                <NutritionFoodRow
                  key={entry.id}
                  name={entry.snapshot.name}
                  detail={entry.snapshot.brand}
                  quantityLabel={formatItemQuantity({
                    quantity: entry.quantity,
                    unit: entry.unit,
                    householdLabel: entry.householdLabel,
                    householdGrams: entry.householdGrams,
                  })}
                  calories={entry.totals.calories}
                  proteinG={entry.totals.proteinG}
                  carbsG={entry.totals.carbsG}
                  fatsG={entry.totals.fatsG}
                  imageUrl={resolveFoodImageUrl(entry.media ?? null, SUPABASE_BASE)}
                  category={entry.category ?? undefined}
                  statusLabel={entry.status === 'corrected' ? 'Corregido' : null}
                  actions={
                    <div className="flex items-center gap-1">
                      {/* NUT-009: "Editar cantidad" solo se ofrece si el plan lo permite. La regla
                          gobierna los registros ligados a un item PRESCRITO (es "ajustar la
                          cantidad prescrita"); un alimento libre ya registrado se corrige siempre.
                          "Retirar registro" NUNCA se esconde: dejar al alumno con un registro
                          erróneo imborrable sería peor que la regla que protege. */}
                      {entry.prescriptionItemId === null || today.permissions.canAdjustPrescribedQuantity ? (
                        <IconButton
                          label="Editar cantidad"
                          onClick={() => openDialog({ kind: 'edit', entry })}
                          disabled={busyId !== null}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </IconButton>
                      ) : null}
                      <IconButton
                        label="Retirar registro"
                        tone="danger"
                        onClick={() => openDialog({ kind: 'void', entry })}
                        disabled={busyId !== null}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </IconButton>
                    </div>
                  }
                />
              ))}
            </div>
          </NutritionCard>
        </section>
      ) : null}

      {dialog.kind === 'register' ? (
        <RegisterFoodDialog
          clientId={clientId}
          slotOptions={slotOptions}
          error={error}
          initialMealSlot={dialog.initialMealSlot ?? null}
          initialQuery={dialog.initialQuery}
          portionDupWarning={portionsApi.dupWarningFor}
          onClose={closeDialog}
          onSubmit={(food, quantity, unit, mealSlotCode) => {
            const payload = buildCatalogIntakePayload({
              context: ctx,
              food,
              quantity,
              unit,
              mealSlotCode,
              idempotencyKey: newIdempotencyKey('intake'),
            })
            runMutation(
              'register',
              () => recordIntakeAction({ payload }),
              () => {
                captureIntake('free_search')
                closeDialog()
              },
              {
                kind: 'add',
                slotCode: mealSlotCode,
                entry: buildOptimisticIntakeEntry({
                  payload,
                  // La MISMA estimación que el formulario ya muestra (NUT-017): el número
                  // optimista y el que persiste el RPC salen de la misma función pura.
                  totals: estimateCatalogIntakeTotals({ food, quantity, unit }),
                }),
              },
            )
          }}
          submitting={isPending && busyId === 'register'}
        />
      ) : null}

      {/* T2.5: el sheet de intercambio. Vive fuera de `DialogState` a propósito — al elegir una
          opción que exige confirmar la cantidad, el diálogo se abre ENCIMA y el sheet queda
          detrás, así cancelar vuelve a la lista y no a la pantalla. */}
      <SubstitutionSheet
        open={exchange !== null}
        onClose={() => setExchange(null)}
        entry={exchange?.itemEntry ?? null}
        clientId={clientId}
        localDate={today.localDate}
        consumedFoodId={exchange?.consumedFoodId ?? null}
        busyId={busyId}
        isPending={isPending}
        onPick={(itemEntry, option, equivalence) => {
          // Camino normal: un tap registra. Los dos casos degradados de la equivalencia
          // (cantidad implausible o sin datos para calcularla) piden confirmar la cantidad
          // antes de escribir — nunca se inventa un número a espaldas del alumno.
          if (equivalence.requiresConfirmation) {
            openDialog({ kind: 'substitute', itemEntry, option, equivalence })
            return
          }
          handleSubstitute(itemEntry, option, null)
        }}
      />

      {dialog.kind === 'substitute' ? (
        <SubstitutionConfirmDialog
          itemEntry={dialog.itemEntry}
          option={dialog.option}
          equivalence={dialog.equivalence}
          error={error}
          onClose={closeDialog}
          submitting={
            isPending &&
            busyId === `subst:${dialog.option.substitutionId ?? `gf-${dialog.option.foodId}`}`
          }
          onSubmit={(quantity) => handleSubstitute(dialog.itemEntry, dialog.option, quantity)}
        />
      ) : null}

      {dialog.kind === 'edit' ? (
        <EditQuantityDialog
          entry={dialog.entry}
          error={error}
          onClose={closeDialog}
          submitting={isPending && busyId === `edit:${dialog.entry.id}`}
          onSubmit={(newQuantity, reason) => {
            runMutation(
              `edit:${dialog.entry.id}`,
              () =>
                correctIntakeAction({
                  payload: buildCorrectionPayload({
                    context: ctx,
                    entry: dialog.entry,
                    newQuantity,
                    reason,
                    idempotencyKey: newIdempotencyKey('correction'),
                  }),
                }),
              () => {
                captureCorrection('saved')
                closeDialog()
              },
              { kind: 'edit', entryId: dialog.entry.id, quantity: newQuantity },
            )
          }}
        />
      ) : null}

      {dialog.kind === 'void' ? (
        <VoidEntryDialog
          entry={dialog.entry}
          error={error}
          onClose={closeDialog}
          submitting={isPending && busyId === `void:${dialog.entry.id}`}
          onSubmit={(reason) => {
            runMutation(
              `void:${dialog.entry.id}`,
              () =>
                voidIntakeAction({
                  payload: buildVoidPayload({
                    context: ctx,
                    entry: dialog.entry,
                    reason,
                    idempotencyKey: newIdempotencyKey('void'),
                  }),
                }),
              () => {
                captureCorrection('voided')
                // Retirar un registro prescrito QUEMA su clave: el próximo "Lo comí" del item
                // necesita una nueva o el RPC devolvería el id de esta entry retirada.
                burnPrescribedAttempt(dialog.entry.prescriptionItemId)
                closeDialog()
              },
              { kind: 'void', entryId: dialog.entry.id },
            )
          }}
        />
      ) : null}

      {/* Cantidades honestas W1.5: confirmación de "Lo comí" cuando el item (o algún elegible del
          bulk) pasa el umbral. Confirmar corre el flujo intacto; cancelar no registra nada. */}
      {implausibleConfirm !== null ? (
        <ImplausibleIntakeDialog
          title={implausibleConfirm.kind === 'bulk' ? '¿Registrar la comida igual?' : '¿Registrar este ítem igual?'}
          body={implausibleConfirm.body}
          items={implausibleConfirm.kind === 'bulk' ? implausibleConfirm.names : undefined}
          onClose={() => setImplausibleConfirm(null)}
          onConfirm={() => {
            const confirm = implausibleConfirm
            setImplausibleConfirm(null)
            if (confirm.kind === 'item') runEatPrescribed(confirm.slot, confirm.item)
            else runBulkEat(confirm.slot, confirm.state)
          }}
        />
      ) : null}

      {/* Sheet de equivalencias (botón [Equivalencias] o long-press del chip). */}
      <PortionEquivalencesSheet
        api={portionsApi}
        exchangeFoods={today.exchangeFoods}
        initialGroupCode={portionSheet?.groupCode ?? null}
        onClose={() => setPortionSheet(null)}
        onRegister={
          today.permissions.canRegisterFreely
            ? (slotCode) => {
                setPortionSheet(null)
                openDialog({ kind: 'register', initialMealSlot: slotCode })
              }
            : null
        }
        slot={portionSheetSlot}
      />
    </div>
  )
}

/**
 * Nota visible del coach, en una card colapsable bajo el héroe (SPEC ola 3 punto 2). Abierta por
 * defecto: es la única voz humana del módulo y el punto de subirla al Hoy es que se LEA sin abrir
 * el tab Plan; "colapsable" es para que el alumno la repliegue una vez leída, no para esconderla.
 */
function CoachNoteCard({ note }: { note: string }) {
  const [open, setOpen] = useState(true)
  return (
    <NutritionCard>
      <button
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 text-left"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide text-subtle">Nota de tu coach</span>
        {open ? (
          <ChevronUp className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        ) : (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        )}
      </button>
      {open ? <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-body">{note}</p> : null}
    </NutritionCard>
  )
}

/**
 * Alerta de error DENTRO de un dialogo/sheet. Vive en el mismo contexto de apilamiento que el
 * sheet (por encima del nav flotante), asi que el fallo del server SIEMPRE se ve — a diferencia
 * del banner global de la pantalla, que quedaba tapado por el overlay del dialogo.
 */
function DialogError({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div
      aria-live="assertive"
      className="mb-4 flex items-start gap-2 rounded-card border border-rose-300/60 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-700/50 dark:bg-rose-950/30 dark:text-rose-300"
      role="alert"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </div>
  )
}

/** Miniatura de un resultado de busqueda: foto real del producto o icono de categoria (respaldo). */
function FoodResultThumb({ imageUrl, iconUrl, alt }: { imageUrl: string | null; iconUrl: string; alt: string }) {
  return (
    <span className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-control border border-border-subtle bg-surface-sunken">
      {imageUrl ? (
        <Image alt={alt} src={imageUrl} width={44} height={44} unoptimized loading="lazy" className="h-11 w-11 object-cover" />
      ) : (
        <span className="absolute inset-0 grid place-items-center bg-primary/10">
          <Image alt="" aria-hidden="true" src={iconUrl} width={24} height={24} unoptimized loading="lazy" className="h-6 w-6 object-contain" />
        </span>
      )}
    </span>
  )
}

/** Estrella para marcar/desmarcar un alimento como favorito del alumno. */
function FavoriteStarButton({
  active,
  busy,
  onClick,
}: {
  active: boolean
  busy: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={active ? 'Quitar de favoritos' : 'Agregar a favoritos'}
      aria-pressed={active}
      disabled={busy}
      onClick={onClick}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-muted transition-colors hover:bg-surface-sunken hover:text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    >
      <Star
        className={active ? 'h-5 w-5 fill-amber-400 text-amber-400' : 'h-5 w-5'}
        aria-hidden="true"
      />
    </button>
  )
}

/**
 * Fila de un alimento del catálogo (resultado de búsqueda o favorito): toca la fila para
 * elegirlo, o la estrella para marcarlo como favorito. Miniatura idéntica a la del resto
 * de la experiencia (foto del producto o icono de categoría de respaldo).
 */
function CatalogPickRow({
  food,
  isFavorite,
  favBusy,
  onSelect,
  onToggleFavorite,
}: {
  food: FoodCatalogItem
  isFavorite: boolean
  favBusy: boolean
  onSelect: (food: FoodCatalogItem) => void
  onToggleFavorite: (food: FoodCatalogItem) => void
}) {
  const image = foodResultImage(food, SUPABASE_BASE)
  const meta = [food.brand, food.category].filter(Boolean).join(' · ')
  return (
    <li className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onSelect(food)}
        className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <FoodResultThumb imageUrl={image.imageUrl} iconUrl={image.iconUrl} alt={food.name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-strong">{food.name}</span>
          {meta ? <span className="block truncate text-xs text-muted">{meta}</span> : null}
          <span className="mt-1 block">
            <MacroChipRow
              calories={food.calories}
              proteinG={food.proteinG}
              carbsG={food.carbsG}
              fatsG={food.fatsG}
              per={`/ 100 ${food.servingUnit === 'ml' ? 'ml' : 'g'}`}
              size="sm"
            />
          </span>
        </span>
      </button>
      <FavoriteStarButton active={isFavorite} busy={favBusy} onClick={() => onToggleFavorite(food)} />
    </li>
  )
}

/**
 * Checkbox de registro del item prescrito (T2.7 F2, decisión D-C): el check ES el registro —
 * tap en vacío registra el consumo, tap en marcado abre "Retirar registro" (el diálogo con
 * motivo de siempre; des-registrar nunca es un tap accidental). El área táctil es de 44px
 * aunque la caja visible mida 22 (el tamaño del catálogo).
 * El testid `nutrition-v2-lo-comi` vive SOLO en el estado pendiente: el spec E2E lo usa como
 * señal de "hay prescripción sin registrar", igual que con el botón viejo.
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
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={checked ? `Retirar registro de ${name}` : `Registrar ${name}`}
      // El botón queda deshabilitado desde el tap hasta que el refetch reconcilia (`busyId` se
      // suelta recién después del sync), así que el estado de guardado tiene que ser AUDIBLE
      // además de visible: el pulso del cuadro no le dice nada a un lector de pantalla.
      aria-busy={pending}
      title={pending ? 'Guardando…' : undefined}
      data-testid={checked ? 'nutrition-v2-registrado' : 'nutrition-v2-lo-comi'}
      disabled={disabled}
      onClick={onToggle}
      className="group inline-flex h-11 w-8 items-center justify-center focus-visible:outline-none disabled:opacity-60"
    >
      <span
        className={`grid h-[22px] w-[22px] place-items-center rounded-md border-2 transition-colors group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-1 ${
          checked
            ? 'border-transparent bg-success text-white'
            : 'border-border-default bg-surface-card group-hover:border-primary/60'
        } ${pending ? 'animate-pulse' : ''}`}
      >
        {checked ? <Check className="h-3.5 w-3.5" aria-hidden="true" strokeWidth={3} /> : null}
      </span>
    </button>
  )
}

function IconButton({
  label,
  onClick,
  disabled,
  tone = 'neutral',
  children,
}: {
  label: string
  onClick: () => void
  disabled?: boolean
  tone?: 'neutral' | 'danger'
  children: React.ReactNode
}) {
  return (
    <button
      aria-label={label}
      className={
        tone === 'danger'
          ? 'inline-flex h-10 w-10 items-center justify-center rounded-control text-rose-600 hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 dark:text-rose-300 dark:hover:bg-rose-950/30'
          : 'inline-flex h-10 w-10 items-center justify-center rounded-control text-muted hover:bg-surface-sunken hover:text-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'
      }
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

function PrescribedSection({
  today,
  busyId,
  markedSlotId,
  portionsApi,
  substitutionOptionsByItem,
  onOpenPortionSheet,
  onBulkEat,
  onEat,
  onEdit,
  onVoid,
  onOpenExchange,
  onSwipeExchange,
}: {
  today: NutritionTodayReadModel
  /**
   * Id de la MUTACIÓN en vuelo (null = ninguna). Los `disabled` de esta sección miran esto y NO
   * `isPending` del transition: la transición sigue pendiente durante el `router.refresh()`
   * posterior, y un refresh lento (o colgado, visto en previews) dejaba TODOS los checkboxes y
   * acciones muertos sin feedback — el "no puedo marcar la 2ª comida" reportado por QA.
   */
  busyId: string | null
  /** Franja con el acuse «Marcado» vivo (registro en bloque ya reconciliado con el servidor). */
  markedSlotId: string | null
  portionsApi: PortionMarksApi
  substitutionOptionsByItem: Record<string, SubstitutionOptionsItem>
  onOpenPortionSheet: (slotCode: string, groupCode: string) => void
  /** T2.5: abre el sheet de intercambio de ese item (dos bloques: coach y grupo). */
  onOpenExchange: (itemEntry: SubstitutionOptionsItem, consumedFoodId: string | null) => void
  /** T2.5 F6: deslizar la fila. Aplica el primer reemplazo del coach, o abre el sheet. */
  onSwipeExchange: (itemEntry: SubstitutionOptionsItem, consumedFoodId: string | null) => void
  onBulkEat: (slot: NutritionTodayReadModel['mealSlots'][number], state: BulkMarkSlotState) => void
  onEat: (
    slot: NutritionTodayReadModel['mealSlots'][number],
    item: NutritionTodayReadModel['mealSlots'][number]['prescriptionItems'][number],
  ) => void
  /** Abre "Editar cantidad" para un registro ya hecho (prescrito consumido o libre de la franja). */
  onEdit: (entry: NutritionIntakeReadItem) => void
  /** Abre "Retirar registro" para un registro ya hecho. */
  onVoid: (entry: NutritionIntakeReadItem) => void
}) {
  // Franjas con items fijos O con targets de porciones (Q2: una franja
  // solo-porciones también aparece). Plan sin porciones ⇒ filtro idéntico al previo.
  const slotsWithPrescription = slotsWithPrescribedContent(today)
  if (slotsWithPrescription.length === 0) return null
  // Set de items prescritos ya consumidos: una sola verdad para las filas Y el estado del bulk.
  const consumedIds = consumedPrescriptionItemIds(today)

  return (
    <section aria-label="Tu plan de hoy" className="space-y-3">
      <h2 className="font-display text-lg font-semibold text-strong">Tu plan de hoy</h2>
      {slotsWithPrescription.map((slot) => {
        const bulk = bulkMarkSlotState(today, slot, consumedIds)
        const freeEntries = slotFreeEntries(slot)
        const portionMarksTotal = slotPortionMarksTotal(slot)
        return (
          <NutritionCard key={slot.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <h3 className="font-display text-base font-semibold text-strong">{slot.name}</h3>
                {slot.startTime ? <span className="font-mono text-xs text-muted">{slot.startTime}</span> : null}
              </div>
              {/* El estado de la franja vive SOLO acá ("1 de 3" → "Completa") — auditoría H2. */}
              {bulk.requiredTotal > 0 ? (
                <MealProgressMeter consumed={bulk.requiredConsumed} total={bulk.requiredTotal} />
              ) : null}
            </div>
            {/* Nota del coach de la franja (SPEC nutrition-coach-notes N3): banda 💬 bajo el
                título. Viaja congelada en el snapshot del publish; sin nota ⇒ cero render. */}
            <CoachNoteBand className="mt-2" note={slot.instructions} />
            <div className="mt-3 divide-y divide-border-subtle">
              {slot.prescriptionItems.map((item) => {
                // El registro consumido se pinta EN la fila del item (check + hora): auditoría
                // H4 — muere la fila duplicada que antes vivía en "Consumido hoy".
                const consumedEntry = consumedEntryForItem(slot, item.id)
                // Reemplazos autorizados del item (T2.4): traen los macros VIGENTES del sustituto,
                // no los `snapshot_*` congelados. Cuando existen, la fila estructurada reemplaza al
                // texto legado "Alternativas: …" congelado en `notes` (resolveItemDisplayNote).
                const substitutionEntry = substitutionOptionsByItem[item.id]
                const substitutionCount = substitutionEntry?.options.length ?? 0
                // Estado "sustituido": lo dice el propio read-model (`source`), que la RPC emite
                // desde `intake_source_v2`. Cero heurísticas por nombre.
                const isSubstituted = consumedEntry?.source === 'substitution'
                const row = consumedEntry
                  ? {
                      name: consumedEntry.snapshot.name,
                      detail: consumedEntry.snapshot.brand,
                      // W2.3: el par casero viaja congelado en el registro (join al item prescrito).
                      quantityLabel: formatItemQuantity({
                        quantity: consumedEntry.quantity,
                        unit: consumedEntry.unit,
                        householdLabel: consumedEntry.householdLabel,
                        householdGrams: consumedEntry.householdGrams,
                      }),
                      calories: consumedEntry.totals.calories,
                      proteinG: consumedEntry.totals.proteinG,
                      carbsG: consumedEntry.totals.carbsG,
                      fatsG: consumedEntry.totals.fatsG,
                      imageUrl: resolveFoodImageUrl(consumedEntry.media ?? item.media ?? null, SUPABASE_BASE),
                      category: consumedEntry.category ?? item.category ?? undefined,
                    }
                  : {
                      name: item.name ?? 'Alimento prescrito',
                      detail: item.brand,
                      quantityLabel: `${formatItemQuantity({
                        quantity: item.quantity,
                        unit: item.unit,
                        householdLabel: item.householdLabel,
                        householdGrams: item.householdGrams,
                      })}${item.optional ? ' · opcional' : ''}`,
                      calories: item.macros.calories,
                      proteinG: item.macros.proteinG,
                      carbsG: item.macros.carbsG,
                      fatsG: item.macros.fatsG,
                      imageUrl: resolveFoodImageUrl(item.media ?? null, SUPABASE_BASE),
                      category: item.category ?? undefined,
                    }
                const consumedFoodId = consumedEntry?.foodId ?? null
                return (
                  <div key={item.id}>
                    <SwipeToExchange
                      enabled={substitutionEntry !== undefined && busyId === null}
                      label={`Cambiar ${row.name}`}
                      onSwipe={() => {
                        if (substitutionEntry) onSwipeExchange(substitutionEntry, consumedFoodId)
                      }}
                    >
                    <NutritionFoodRow
                      name={row.name}
                      detail={row.detail}
                      quantityLabel={row.quantityLabel}
                      calories={row.calories}
                      proteinG={row.proteinG}
                      carbsG={row.carbsG}
                      fatsG={row.fatsG}
                      imageUrl={row.imageUrl}
                      category={row.category}
                      statusLabel={isSubstituted ? '⇄ Sustituido' : null}
                      replacedLabel={
                        isSubstituted
                          ? `${item.name ?? 'Alimento prescrito'} · ${formatItemQuantity({
                              quantity: item.quantity,
                              unit: item.unit,
                              householdLabel: item.householdLabel,
                              householdGrams: item.householdGrams,
                            })}`
                          : null
                      }
                      note={resolveItemDisplayNote(item.notes, substitutionCount > 0)}
                      // T2.7 F2 (D-C): el CHECK es el registro — muere el botón "Lo comí". Tap en
                      // vacío = registra; tap en marcado = abre "Retirar registro" (mismo diálogo
                      // con motivo de siempre: des-registrar no es silencioso ni accidental).
                      leading={
                        <EatCheckbox
                          checked={consumedEntry != null}
                          name={row.name}
                          disabled={busyId !== null}
                          pending={busyId === `eat:${item.id}`}
                          onToggle={() => {
                            if (consumedEntry) onVoid(consumedEntry)
                            else onEat(slot, item)
                          }}
                        />
                      }
                      actions={
                        consumedEntry ? (
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
                              {formatIntakeClock(consumedEntry.occurredAt, today.timezone)}
                            </span>
                            {/* NUT-009: el lápiz solo si el plan permite ajustar la cantidad prescrita. */}
                            {today.permissions.canAdjustPrescribedQuantity ? (
                              <IconButton label="Editar cantidad" onClick={() => onEdit(consumedEntry)} disabled={busyId !== null}>
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                              </IconButton>
                            ) : null}
                            <IconButton label="Retirar registro" tone="danger" onClick={() => onVoid(consumedEntry)} disabled={busyId !== null}>
                              <Trash2 className="h-4 w-4" aria-hidden="true" />
                            </IconButton>
                          </div>
                        ) : null
                      }
                    />
                    </SwipeToExchange>
                    {/* Los reemplazos se ofrecen SIEMPRE, también sobre un item ya registrado:
                        ahí el servidor corrige en vez de duplicar (D3), que es lo que permite
                        cambiar de opinión. Solo se esconde la que ya está registrada — ofrecer
                        "cambiar a lo mismo" no es una decisión. */}
                    <ItemExchangeTrigger
                      entry={substitutionEntry}
                      isPending={busyId !== null}
                      consumedFoodId={consumedFoodId}
                      onOpen={onOpenExchange}
                    />
                  </div>
                )
              })}
              {/* Registros libres de la franja (SPEC ola 3 punto 1): filas dentro de la MISMA card,
                  con las mismas acciones de editar/retirar que antes vivían en "Consumido hoy". */}
              {freeEntries.map((entry) => (
                <NutritionFoodRow
                  key={entry.id}
                  name={entry.snapshot.name}
                  detail={entry.snapshot.brand}
                  quantityLabel={formatItemQuantity({
                    quantity: entry.quantity,
                    unit: entry.unit,
                    householdLabel: entry.householdLabel,
                    householdGrams: entry.householdGrams,
                  })}
                  calories={entry.totals.calories}
                  proteinG={entry.totals.proteinG}
                  carbsG={entry.totals.carbsG}
                  fatsG={entry.totals.fatsG}
                  imageUrl={resolveFoodImageUrl(entry.media ?? null, SUPABASE_BASE)}
                  category={entry.category ?? undefined}
                  statusLabel={entry.status === 'corrected' ? 'Corregido' : null}
                  actions={
                    <div className="flex items-center gap-1">
                      {entry.prescriptionItemId === null || today.permissions.canAdjustPrescribedQuantity ? (
                        <IconButton label="Editar cantidad" onClick={() => onEdit(entry)} disabled={busyId !== null}>
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </IconButton>
                      ) : null}
                      <IconButton label="Retirar registro" tone="danger" onClick={() => onVoid(entry)} disabled={busyId !== null}>
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </IconButton>
                    </div>
                  }
                />
              ))}
            </div>
            {/* Marcas de porción (SPEC ola 3 punto 1): una sola línea por franja, nunca una fila
                por marca — auditoría §2.2 ("4 superficies para el mismo contador"). */}
            {portionMarksTotal > 0 ? (
              <p className="mt-2 text-xs font-medium tabular-nums text-muted">
                Porciones marcadas: {formatPortionsEs(portionMarksTotal)}
              </p>
            ) : null}
            {/* Registro en bloque de la franja ("Comí toda esta comida") — thumb-zone bajo los items. */}
            <BulkMarkControl
              state={bulk}
              pending={busyId === `bulk:${slot.id}`}
              justMarked={markedSlotId === slot.id}
              onEat={() => onBulkEat(slot, bulk)}
            />
            {/* Porciones de la franja (SPEC UX-b): sección hermana de los items. */}
            <PortionSlotSection
              api={portionsApi}
              exchangeFoods={today.exchangeFoods}
              onOpenSheet={onOpenPortionSheet}
              slot={slot}
            />
          </NutritionCard>
        )
      })}
    </section>
  )
}

/**
 * Afordancia de intercambio bajo un item prescrito (T2.5). Antes acá vivían las pills, una por
 * reemplazo del coach: servían a 15 items en toda la base y no tenían dónde poner los 832 que solo
 * tienen grupo. Ahora es UN control que abre el sheet.
 *
 * Sin equivalentes ⇒ no renderiza nada (D2: el ítem queda fijo, y el copy honesto de por qué vive
 * dentro del sheet, no acá). Alineado bajo el texto del item (la miniatura ocupa h-11 + gap-3 ≈
 * pl-14) para colgar de forma natural de su fila.
 */
function ItemExchangeTrigger({
  entry,
  isPending,
  consumedFoodId,
  onOpen,
}: {
  entry: SubstitutionOptionsItem | undefined
  isPending: boolean
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
    <div className="pb-3 pl-14">
      <button
        type="button"
        disabled={isPending}
        onClick={() => onOpen(entry, consumedFoodId)}
        aria-label={`Cambiar ${entry.item.name ?? 'este alimento'}: ${total} equivalentes`}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-pill border border-border-subtle bg-surface-sunken px-2.5 py-1 text-xs font-medium text-body transition-colors hover:border-primary/40 hover:text-strong disabled:opacity-60"
      >
        <span aria-hidden="true">⇄</span>
        <span>
          {total} {total === 1 ? 'equivalente' : 'equivalentes'}
        </span>
      </button>
    </div>
  )
}

/**
 * Confirmación de cantidad para los dos casos degradados de la equivalencia (T2.4):
 *
 *  - `needs-confirmation`: el cálculo dio una cantidad por encima del tope de plausibilidad
 *    (p. ej. reemplazar 100 g de pechuga por espinaca da ~715 g). El número es correcto, pero
 *    registrarlo de un tap sería registrar un absurdo sin que nadie lo mire.
 *  - `unavailable`: no hay con qué calcular (el sustituto no tiene calorías vigentes, o el ítem no
 *    tiene las suyas congeladas). Se prellena con la porción DEL SUSTITUTO, nunca con la cantidad
 *    del ítem: "300 g de café" o "1 un de leche" no significan nada.
 */
function SubstitutionConfirmDialog({
  itemEntry,
  option,
  equivalence,
  error,
  submitting,
  onClose,
  onSubmit,
}: {
  itemEntry: SubstitutionOptionsItem
  option: SubstitutionAnyOption
  equivalence: SubstitutionEquivalence
  error: string | null
  submitting: boolean
  onClose: () => void
  onSubmit: (quantity: number) => void
}) {
  const [quantity, setQuantity] = useState(String(equivalence.quantity))
  const quantityNumber = Number(quantity)
  const step = equivalence.unit === 'g' || equivalence.unit === 'ml' ? 10 : 0.5
  const adjustQuantity = (delta: number) => {
    const base =
      Number.isFinite(quantityNumber) && quantityNumber > 0 ? quantityNumber : equivalence.quantity
    setQuantity(String(Math.max(step, Math.round((base + delta) * 10) / 10)))
  }
  const name = option.food?.name ?? option.customName ?? option.frozen.name ?? 'Reemplazo'
  const canSubmit = Number.isFinite(quantityNumber) && quantityNumber > 0

  return (
    <TodayModal
      title="Confirma la cantidad"
      description={`${name} en lugar de ${itemEntry.item.name ?? 'tu alimento'} (${formatItemQuantity({
        quantity: itemEntry.item.quantity,
        unit: itemEntry.item.unit,
      })})`}
      open
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <NutritionMotionButton tone="neutral" onClick={onClose}>
            Cancelar
          </NutritionMotionButton>
          <NutritionMotionButton
            disabled={!canSubmit}
            pending={submitting}
            onClick={() => canSubmit && onSubmit(quantityNumber)}
          >
            Registrar
          </NutritionMotionButton>
        </div>
      }
    >
      <div className="space-y-4">
        <DialogError message={error} />
        <p className="rounded-card border border-border-subtle bg-surface-sunken px-3 py-2 text-xs text-muted">
          {equivalence.kind === 'unavailable'
            ? 'No pudimos calcular la equivalencia con los datos de este alimento. Revisa la cantidad antes de registrar.'
            : 'La equivalencia en calorías da una cantidad alta. Revísala antes de registrar.'}
        </p>
        <div>
          <span className="mb-1 block text-xs font-semibold text-muted">Cantidad ({equivalence.unit})</span>
          <div className="flex items-stretch gap-2">
            <button
              type="button"
              aria-label={`Restar ${step} ${equivalence.unit}`}
              onClick={() => adjustQuantity(-step)}
              className="min-h-12 w-12 shrink-0 rounded-control border border-border-default bg-surface-app text-lg font-bold text-strong transition-colors hover:bg-surface-sunken"
            >
              −
            </button>
            <input
              inputMode="decimal"
              aria-label={`Cantidad en ${equivalence.unit}`}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value.replace(/[^0-9.]/g, ''))}
              className="min-h-12 w-full rounded-control border border-border-default bg-surface-app px-3 text-center text-base font-semibold tabular-nums text-strong outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              aria-label={`Sumar ${step} ${equivalence.unit}`}
              onClick={() => adjustQuantity(step)}
              className="min-h-12 w-12 shrink-0 rounded-control border border-border-default bg-surface-app text-lg font-bold text-strong transition-colors hover:bg-surface-sunken"
            >
              ＋
            </button>
          </div>
        </div>
      </div>
    </TodayModal>
  )
}

/**
 * Medidor compacto de progreso de la franja: barra + "consumidos/total" de items requeridos.
 * Al completar, muta a un chip esmeralda "Completa". La barra anima el ancho (respeta
 * reduced-motion). Solo lectura — la acción vive en el control de abajo.
 */
function MealProgressMeter({ consumed, total }: { consumed: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((consumed / total) * 100)) : 0
  const complete = total > 0 && consumed >= total
  return (
    <span
      aria-label={`${consumed} de ${total} registrados`}
      className={`inline-flex items-center gap-2 rounded-pill border px-2.5 py-1 text-xs font-semibold ${
        complete
          ? 'border-emerald-300/70 bg-emerald-50 text-emerald-800 dark:border-emerald-700/50 dark:bg-emerald-950/30 dark:text-emerald-300'
          : 'border-border-default bg-surface-sunken text-muted'
      }`}
    >
      {complete ? (
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <span
          aria-hidden="true"
          className="relative block h-1.5 w-12 overflow-hidden rounded-full bg-border-default"
        >
          <span
            className="absolute inset-y-0 left-0 rounded-full bg-emerald-500 transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${pct}%` }}
          />
        </span>
      )}
      <span className="tabular-nums">{complete ? 'Completa' : `${consumed}/${total}`}</span>
    </span>
  )
}

/**
 * Control de registro en bloque de una franja. Estados (del helper puro):
 *  - none-required → nada (la franja no tiene items requeridos).
 *  - complete      → nada (auditoría H1: el chip "Completa" del medidor de arriba, en la MISMA
 *                    card, ya dice esto — el banner "Comida completa" era la MISMA afirmación
 *                    dos veces a ~200 px de distancia).
 *  - all-open      → CTA "Comí toda esta comida · N kcal".
 *  - partial       → CTA "Comer lo que falta (N) · M kcal".
 *
 * Los dos casos que devolvían null se SUSPENDEN mientras el registro en bloque está en vuelo o
 * acaba de reconciliar: el delta optimista deja la franja `complete` en el frame del tap, así que
 * desmontarse ahí era dejar al alumno sin respuesta durante el ~1 s del refetch — y volver a
 * tocar. El estado de guardado y el check son los de `NutritionMotionButton`; acá no nace ningún
 * spinner nuevo.
 */
function BulkMarkControl({
  state,
  pending,
  justMarked,
  onEat,
}: {
  state: BulkMarkSlotState
  pending: boolean
  /** Acuse posterior al refetch: el CTA sigue montado y deshabilitado, con el check «Marcado». */
  justMarked: boolean
  onEat: () => void
}) {
  const settled = state.status === 'none-required' || state.status === 'complete'
  if (settled && !pending && !justMarked) return null
  return (
    <NutritionMotionButton
      type="button"
      data-testid="nutrition-v2-bulk-eat"
      tone="success"
      className="mt-3 w-full"
      pending={pending}
      success={justMarked}
      disabled={justMarked}
      aria-busy={pending}
      onClick={onEat}
    >
      {pending ? (
        // `bulkMarkCtaLabel` ya devuelve null acá (la franja quedó `complete` por el delta
        // optimista), así que el copy honesto del intervalo es el estado, no la acción.
        <span>Guardando…</span>
      ) : justMarked ? (
        <span>Marcado</span>
      ) : (
        <>
          <Utensils className="h-4 w-4" aria-hidden="true" />
          <span>{bulkMarkCtaLabel(state)}</span>
          {state.eligibleKcal > 0 ? (
            <span className="font-normal opacity-85">· {Math.round(state.eligibleKcal)} kcal</span>
          ) : null}
        </>
      )}
    </NutritionMotionButton>
  )
}

/** Base publica de Storage para resolver la foto del producto (client-side, NEXT_PUBLIC). */
const SUPABASE_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL ?? null

function RegisterFoodDialog({
  clientId,
  slotOptions,
  error,
  initialMealSlot = null,
  initialQuery,
  portionDupWarning,
  onClose,
  onSubmit,
  submitting,
}: {
  clientId: string
  slotOptions: Array<{ code: string; label: string }>
  error: string | null
  /** Franja preseleccionada (llegada desde el sheet de equivalencias de porciones). */
  initialMealSlot?: string | null
  /** Busqueda precargada (llegada desde una pill de reemplazo autorizado, T1.6). */
  initialQuery?: string
  /** Aviso anti-duplicado de porciones (SPEC R5.b): null si no aplica. */
  portionDupWarning?: (foodId: string, mealSlotCode: string | null) => string | null
  onClose: () => void
  onSubmit: (food: FoodCatalogItem, quantity: number, unit: string, mealSlotCode: string | null) => void
  submitting: boolean
}) {
  // El dialogo se monta al abrir (render condicional), asi que el estado inicial aplica siempre;
  // con initialQuery el live search dispara solo y los resultados aparecen sin tipear.
  const [query, setQuery] = useState(initialQuery ?? '')
  const [results, setResults] = useState<FoodCatalogItem[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [selected, setSelected] = useState<FoodCatalogItem | null>(null)
  const [quantity, setQuantity] = useState('')
  const [unit, setUnit] = useState('')
  const [mealSlot, setMealSlot] = useState<string>(initialMealSlot ?? '')
  // Favoritos: ids para la estrella + orden, y foods hidratados para el acceso rápido.
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const [favoriteFoods, setFavoriteFoods] = useState<FoodCatalogItem[]>([])
  const [favBusyId, setFavBusyId] = useState<string | null>(null)
  // El modal enfoca este input al abrir (en vez del panel) para escribir sin un tap extra.
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    let active = true
    void getFavoriteFoodIdsAction({ clientId }).then((res) => {
      if (active && res.ok) setFavoriteIds(new Set(res.ids))
    }).catch(() => {
      // best-effort: sin red o respuesta no-RSC no rompe nada (EVA-NEXTJS-19)
    })
    void listFavoriteFoodsAction({ clientId }).then((res) => {
      if (active && res.ok) setFavoriteFoods(res.items)
    }).catch(() => {
      // best-effort: sin red o respuesta no-RSC no rompe nada (EVA-NEXTJS-19)
    })
    return () => {
      active = false
    }
  }, [clientId])

  // Toggle optimista con rollback: la marca aparece al instante; si el server falla, revierte
  // el id y la lista de favoritos y avisa. Reusa la tabla V1 vía la action V2 (allergy-safe).
  const toggleFavorite = (food: FoodCatalogItem) => {
    const wasFav = favoriteIds.has(food.id)
    setFavoriteIds((prev) => {
      const next = new Set(prev)
      if (wasFav) next.delete(food.id)
      else next.add(food.id)
      return next
    })
    setFavoriteFoods((prev) => {
      if (wasFav) return prev.filter((f) => f.id !== food.id)
      return prev.some((f) => f.id === food.id) ? prev : [food, ...prev]
    })
    setFavBusyId(food.id)
    void toggleFavoriteFoodAction({ clientId, foodId: food.id }).then((res) => {
      setFavBusyId((cur) => (cur === food.id ? null : cur))
      if (!res.ok) {
        setFavoriteIds((prev) => {
          const next = new Set(prev)
          if (wasFav) next.add(food.id)
          else next.delete(food.id)
          return next
        })
        setFavoriteFoods((prev) => {
          if (wasFav) return prev.some((f) => f.id === food.id) ? prev : [food, ...prev]
          return prev.filter((f) => f.id !== food.id)
        })
        toast.error(humanizeStudentWriteError(res.error))
      }
    }).catch(() => {
      // Espejo del camino de fallo de arriba: liberar el busy y revertir el optimismo (EVA-NEXTJS-19).
      setFavBusyId((cur) => (cur === food.id ? null : cur))
      setFavoriteIds((prev) => {
        const next = new Set(prev)
        if (wasFav) next.add(food.id)
        else next.delete(food.id)
        return next
      })
      setFavoriteFoods((prev) => {
        if (wasFav) return prev.some((f) => f.id === food.id) ? prev : [food, ...prev]
        return prev.filter((f) => f.id !== food.id)
      })
      toast.error(humanizeStudentWriteError(undefined))
    })
  }

  // Favoritos PRIMERO en los resultados (reordena client-side, sin tocar el RPC de búsqueda).
  const orderedResults = useMemo(() => sortFoodsByFavoriteFirst(results, favoriteIds), [results, favoriteIds])
  // Paridad con RN: al borrar la búsqueda (<2 chars) se limpian los resultados y reaparece "Tus favoritos".
  useEffect(() => {
    if (query.trim().length < 2) setResults([])
  }, [query])
  const showFavoritesShortcut = query.trim().length < 2 && results.length === 0 && favoriteFoods.length > 0

  // Live search (T1.3, paridad con RN — decision ya tomada alla): debounce de 300ms sobre el
  // input, sin boton "Buscar". Las server actions no exponen AbortController; el guard de
  // secuencia cumple el mismo rol — una respuesta vieja jamas pisa a la busqueda vigente.
  const searchSeqRef = useRef(0)
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 2) {
      searchSeqRef.current += 1
      setSearching(false)
      setSearchError(null)
      return
    }
    const seq = ++searchSeqRef.current
    setSearching(true)
    setSearchError(null)
    const timer = setTimeout(() => {
      void searchFoodCatalogAction({ clientId, query: trimmed }).then((res) => {
        if (searchSeqRef.current !== seq) return
        setSearching(false)
        if (!res.ok) {
          setSearchError(res.error)
          return
        }
        setResults(res.result.items)
        if (res.result.items.length === 0) setSearchError('Sin resultados en el catálogo local.')
      }).catch(() => {
        // Espejo del camino de fallo de arriba: liberar el loading y avisar (EVA-NEXTJS-19).
        if (searchSeqRef.current !== seq) return
        setSearching(false)
        setSearchError(humanizeStudentWriteError(undefined))
      })
    }, 300)
    return () => clearTimeout(timer)
  }, [query, clientId])

  const selectFood = (food: FoodCatalogItem) => {
    setSelected(food)
    // Unidad y cantidad iniciales del alimento (W2.1): la medida casera gana cuando existe
    // («1 huevo»), y la cantidad acompaña — precargar la porcion con `casera` o `un` escribiria
    // «100 huevos». La UI ya no propaga 'unidad' ni el texto libre del catalogo (NUT-017).
    const defaults = catalogIntakeDefaults(food)
    setQuantity(String(defaults.quantity))
    setUnit(defaults.unit)
  }

  // Opciones del alimento + la unidad vigente si quedo fuera del set: cada una rotulada con sus
  // gramos («huevo · 61 g»), que es lo que vuelve imposible confundir una medida con una porcion.
  const unitOptions = useMemo(
    () => (selected ? foodUnitOptionsWithCurrent(selected, unit) : []),
    [selected, unit],
  )

  /**
   * Cambio de unidad: CONVIERTE la cantidad en vez de conservar el numero (NUT-017). Dejar "100"
   * y pasar de g a unidad persistia 100 x macros — hasta 15.500 kcal en un solo registro. Si la
   * conversion no es representable (alimento sin porcion), se limpia el campo para que el alumno
   * vuelva a indicar cuanto comio. `convertQuantityBetweenUnits` entiende ademas `casera`
   * (2 huevos ⇔ 122 g), que `convertIntakeQuantity` no conoce por no ser persistible.
   */
  const changeUnit = (nextUnit: string) => {
    setUnit(nextUnit)
    if (!selected || unit === nextUnit) return
    const converted = convertQuantityBetweenUnits({
      quantity: Number(quantity),
      from: unit,
      to: nextUnit,
      servingSize: selected.servingSize,
      householdGrams: selected.householdGrams,
    })
    setQuantity(converted === null ? '' : String(converted))
  }

  const quantityNumber = Number(quantity)
  // Lo que realmente se persiste: `casera` se traduce a gramos + magnitud ANTES de salir de la
  // pantalla (SPEC §5.3), porque el contrato de intake no la acepta. `null` = no hay gramaje
  // casero con que traducir ⇒ no se puede registrar.
  const submission = useMemo(
    () =>
      selected && Number.isFinite(quantityNumber) && quantityNumber > 0
        ? catalogIntakeSubmission({ food: selected, quantity: quantityNumber, unit })
        : null,
    [quantityNumber, selected, unit],
  )
  const canSubmit = selected !== null && submission !== null && submission.unit.trim().length > 0

  // Total ESTIMADO con la MISMA formula del servidor: un x100 se vuelve obvio ANTES de guardar.
  const estimatedTotals = useMemo(() => {
    if (!selected || !Number.isFinite(quantityNumber) || quantityNumber <= 0) return null
    return estimateCatalogIntakeTotals({ food: selected, quantity: quantityNumber, unit })
  }, [quantityNumber, selected, unit])

  // Aviso anti-duplicado (no bloqueante): el alimento elegido pertenece a un grupo con
  // porciones YA marcadas en la franja seleccionada ⇒ inline, sin frenar el registro.
  const dupWarningMessage =
    selected && portionDupWarning
      ? portionDupWarning(selected.id, mealSlot === '' ? null : mealSlot)
      : null

  return (
    <TodayModal
      title="Registrar alimento"
      description="Busca en el catálogo local y elige cuánto comiste."
      open
      onClose={onClose}
      initialFocusRef={searchInputRef}
      footer={
        selected ? (
          <div className="flex items-center justify-between gap-2">
            <NutritionMotionButton tone="neutral" onClick={() => setSelected(null)}>
              Cambiar alimento
            </NutritionMotionButton>
            <NutritionMotionButton
              disabled={!canSubmit}
              pending={submitting}
              onClick={() => {
                if (selected && submission) {
                  // Sale en g/ml: la medida casera es interfaz, la verdad persistida son gramos.
                  onSubmit(selected, submission.quantity, submission.unit.trim(), mealSlot === '' ? null : mealSlot)
                }
              }}
            >
              Registrar
            </NutritionMotionButton>
          </div>
        ) : null
      }
    >
      <DialogError message={error} />
      {selected ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-card border border-border-subtle bg-surface-sunken p-3">
            {(() => {
              const image = foodResultImage(selected, SUPABASE_BASE)
              return <FoodResultThumb imageUrl={image.imageUrl} iconUrl={image.iconUrl} alt={selected.name} />
            })()}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-strong">{selected.name}</p>
              <p className="mt-0.5 truncate text-xs text-muted">
                {[selected.brand, selected.category].filter(Boolean).join(' · ') || 'Sin marca'}
              </p>
              <span className="mt-1.5 block">
                <MacroChipRow
                  calories={selected.calories}
                  proteinG={selected.proteinG}
                  carbsG={selected.carbsG}
                  fatsG={selected.fatsG}
                  per={`por ${selected.servingSize} ${selected.servingUnit}`}
                  size="sm"
                />
              </span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted">Cantidad</span>
              <input
                inputMode="decimal"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value.replace(/[^0-9.]/g, ''))}
                className="min-h-12 w-full rounded-control border border-border-default bg-surface-app px-3 text-base text-strong outline-none focus:ring-2 focus:ring-ring"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-muted">Unidad</span>
              <select
                value={unit}
                onChange={(event) => changeUnit(event.target.value)}
                className="min-h-12 w-full rounded-control border border-border-default bg-surface-app px-3 text-base text-strong outline-none focus:ring-2 focus:ring-ring"
              >
                {unitOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {estimatedTotals && submission ? (
            <div aria-live="polite" className="rounded-control border border-border-subtle bg-surface-sunken px-3 py-2">
              <p className="text-xs font-semibold text-muted">Total estimado</p>
              <span className="mt-1 block">
                <MacroChipRow
                  calories={estimatedTotals.calories}
                  proteinG={estimatedTotals.proteinG}
                  carbsG={estimatedTotals.carbsG}
                  fatsG={estimatedTotals.fatsG}
                  // El rotulo dice lo que se va a GUARDAR: «por 2 huevos (122 g)» con medida
                  // casera, «por 122 g» sin ella (W2.3, `formatItemQuantity`).
                  per={`por ${formatItemQuantity({
                    quantity: submission.quantity,
                    unit: submission.unit,
                    householdLabel: selected.householdLabel,
                    householdGrams: selected.householdGrams,
                  })}`}
                  size="sm"
                />
              </span>
            </div>
          ) : null}
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-muted">Franja (opcional)</span>
            <select
              value={mealSlot}
              onChange={(event) => setMealSlot(event.target.value)}
              className="min-h-12 w-full rounded-control border border-border-default bg-surface-app px-3 text-base text-strong outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="">Sin franja</option>
              {slotOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          {dupWarningMessage ? (
            <p
              aria-live="polite"
              className="rounded-control border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-300"
            >
              {dupWarningMessage}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          <form onSubmit={(event) => event.preventDefault()}>
            <input
              ref={searchInputRef}
              aria-label="Buscar alimento"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ej: pechuga de pollo"
              className="min-h-12 w-full rounded-control border border-border-default bg-surface-app px-3 text-base text-strong outline-none focus:ring-2 focus:ring-ring"
            />
          </form>
          <div aria-live="polite" className="min-h-5">
            {searching ? (
              <p className="text-xs text-muted">Buscando…</p>
            ) : searchError ? (
              <p className="text-sm text-amber-700 dark:text-amber-300">{searchError}</p>
            ) : null}
          </div>

          {showFavoritesShortcut ? (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden="true" />
                Tus favoritos
              </div>
              <ul className="divide-y divide-border-subtle">
                {favoriteFoods.map((food) => (
                  <CatalogPickRow
                    key={food.id}
                    food={food}
                    isFavorite={favoriteIds.has(food.id)}
                    favBusy={favBusyId === food.id}
                    onSelect={selectFood}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </ul>
            </div>
          ) : null}

          {orderedResults.length > 0 ? (
            <ul className="divide-y divide-border-subtle">
              {orderedResults.map((food) => (
                <CatalogPickRow
                  key={food.id}
                  food={food}
                  isFavorite={favoriteIds.has(food.id)}
                  favBusy={favBusyId === food.id}
                  onSelect={selectFood}
                  onToggleFavorite={toggleFavorite}
                />
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </TodayModal>
  )
}

/**
 * T1.2 (nutrition-flows-redesign): la razon deja de ser un interrogatorio. Chips de 1 tap con la
 * primera preseleccionada — el server sigue exigiendo >=3 caracteres y el texto del chip los cumple,
 * asi que la validacion del RPC no se toca. "Otro motivo" abre el campo libre (ahi si, minimo 3).
 * La correccion es camino principal (evidencia: ~1 de cada 5 registros se corrige), no excepcion.
 */
const EDIT_REASON_CHIPS = ['Me equivoqué de cantidad', 'Comí menos', 'Comí más'] as const
const VOID_REASON_CHIPS = ['Lo registré por error', 'No lo comí', 'Registro duplicado'] as const
const OTHER_REASON = '__otro__'

function ReasonChips({
  label,
  options,
  value,
  customText,
  onSelect,
  onCustomChange,
}: {
  label: string
  options: readonly string[]
  value: string
  customText: string
  onSelect: (next: string) => void
  onCustomChange: (text: string) => void
}) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold text-muted">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {[...options, OTHER_REASON].map((option) => {
          const selected = value === option
          const text = option === OTHER_REASON ? 'Otro motivo' : option
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onSelect(option)}
              className={`min-h-9 rounded-full border px-3 text-xs font-semibold transition-colors ${
                selected
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border-default bg-surface-app text-body hover:bg-surface-sunken'
              }`}
            >
              {text}
            </button>
          )
        })}
      </div>
      {value === OTHER_REASON ? (
        <input
          value={customText}
          onChange={(event) => onCustomChange(event.target.value)}
          placeholder="Cuéntale a tu coach (mínimo 3 caracteres)"
          autoFocus
          className="mt-2 min-h-12 w-full rounded-control border border-border-default bg-surface-app px-3 text-base text-strong outline-none focus:ring-2 focus:ring-ring"
        />
      ) : null}
    </div>
  )
}

/** Chip elegido o texto libre; null si "Otro motivo" quedo bajo el minimo del server. */
function resolveReason(value: string, customText: string): string | null {
  if (value !== OTHER_REASON) return value
  const trimmed = customText.trim()
  return trimmed.length >= 3 ? trimmed : null
}

function EditQuantityDialog({
  entry,
  error,
  onClose,
  onSubmit,
  submitting,
}: {
  entry: NutritionIntakeReadItem
  error: string | null
  onClose: () => void
  onSubmit: (newQuantity: number, reason: string) => void
  submitting: boolean
}) {
  const [quantity, setQuantity] = useState(String(entry.quantity))
  const [reasonChoice, setReasonChoice] = useState<string>(EDIT_REASON_CHIPS[0])
  const [customReason, setCustomReason] = useState('')
  const quantityNumber = Number(quantity)
  // Paso hibrido, misma regla del builder: gramos/ml en saltos de 10, unidades contadas de a 0.5.
  const step = entry.unit === 'g' || entry.unit === 'ml' ? 10 : 0.5
  const adjustQuantity = (delta: number) => {
    const base = Number.isFinite(quantityNumber) && quantityNumber > 0 ? quantityNumber : entry.quantity
    const next = Math.max(step, Math.round((base + delta) * 10) / 10)
    setQuantity(String(next))
  }
  const reason = resolveReason(reasonChoice, customReason)
  const canSubmit = Number.isFinite(quantityNumber) && quantityNumber > 0 && reason !== null

  return (
    <TodayModal
      title="Editar cantidad"
      description={`${entry.snapshot.name} · registrado como ${formatItemQuantity({
        quantity: entry.quantity,
        unit: entry.unit,
        householdLabel: entry.householdLabel,
        householdGrams: entry.householdGrams,
      })}`}
      open
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <NutritionMotionButton tone="neutral" onClick={onClose}>
            Cancelar
          </NutritionMotionButton>
          <NutritionMotionButton
            disabled={!canSubmit}
            pending={submitting}
            onClick={() => canSubmit && reason !== null && onSubmit(quantityNumber, reason)}
          >
            Guardar corrección
          </NutritionMotionButton>
        </div>
      }
    >
      <div className="space-y-4">
        <DialogError message={error} />
        <div>
          <span className="mb-1 block text-xs font-semibold text-muted">Nueva cantidad ({entry.unit})</span>
          <div className="flex items-stretch gap-2">
            <button
              type="button"
              aria-label={`Restar ${step} ${entry.unit}`}
              onClick={() => adjustQuantity(-step)}
              className="min-h-12 w-12 shrink-0 rounded-control border border-border-default bg-surface-app text-lg font-bold text-strong transition-colors hover:bg-surface-sunken"
            >
              −
            </button>
            <input
              inputMode="decimal"
              aria-label={`Nueva cantidad en ${entry.unit}`}
              value={quantity}
              onChange={(event) => setQuantity(event.target.value.replace(/[^0-9.]/g, ''))}
              className="min-h-12 w-full rounded-control border border-border-default bg-surface-app px-3 text-center text-base font-semibold tabular-nums text-strong outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="button"
              aria-label={`Sumar ${step} ${entry.unit}`}
              onClick={() => adjustQuantity(step)}
              className="min-h-12 w-12 shrink-0 rounded-control border border-border-default bg-surface-app text-lg font-bold text-strong transition-colors hover:bg-surface-sunken"
            >
              ＋
            </button>
          </div>
        </div>
        <ReasonChips
          label="¿Por qué? (opcional)"
          options={EDIT_REASON_CHIPS}
          value={reasonChoice}
          customText={customReason}
          onSelect={setReasonChoice}
          onCustomChange={setCustomReason}
        />
        <p className="text-[11px] text-subtle">Se conserva el registro original para tu coach.</p>
      </div>
    </TodayModal>
  )
}

function VoidEntryDialog({
  entry,
  error,
  onClose,
  onSubmit,
  submitting,
}: {
  entry: NutritionIntakeReadItem
  error: string | null
  onClose: () => void
  onSubmit: (reason: string) => void
  submitting: boolean
}) {
  const [reasonChoice, setReasonChoice] = useState<string>(VOID_REASON_CHIPS[0])
  const [customReason, setCustomReason] = useState('')
  const reason = resolveReason(reasonChoice, customReason)
  const canSubmit = reason !== null

  return (
    <TodayModal
      title="Retirar registro"
      description={`${entry.snapshot.name} · ${formatItemQuantity({
        quantity: entry.quantity,
        unit: entry.unit,
        householdLabel: entry.householdLabel,
        householdGrams: entry.householdGrams,
      })}`}
      open
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <NutritionMotionButton tone="neutral" onClick={onClose}>
            Cancelar
          </NutritionMotionButton>
          <NutritionMotionButton
            tone="danger"
            disabled={!canSubmit}
            pending={submitting}
            onClick={() => canSubmit && reason !== null && onSubmit(reason)}
          >
            Retirar registro
          </NutritionMotionButton>
        </div>
      }
    >
      <div className="space-y-3">
        <DialogError message={error} />
        <p className="text-sm text-body">
          El registro dejará de contar en tu día, pero se conserva en el historial para tu coach.
        </p>
        <ReasonChips
          label="¿Por qué? (opcional)"
          options={VOID_REASON_CHIPS}
          value={reasonChoice}
          customText={customReason}
          onSelect={setReasonChoice}
          onCustomChange={setCustomReason}
        />
      </div>
    </TodayModal>
  )
}
