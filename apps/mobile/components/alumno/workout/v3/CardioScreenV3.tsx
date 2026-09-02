import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, Text, TouchableOpacity, View } from 'react-native'
import { MotiView } from 'moti'
import { HeartPulse, Pause, Play, Repeat, RotateCcw, Ruler, SkipForward, Timer, Watch, Zap } from 'lucide-react-native'
import {
  INTERVAL_PHASE_LABEL,
  buildIntervalSequence,
  buildTypedPayload,
  computeCardioProgress,
  createCardioElapsed,
  decideCardioAutolog,
  formatTypedObjective,
  intervalPhaseClosesRound,
  intervalPhaseTargetLabel,
  intervalRoundPrescribedSec,
  isManualPhase,
  mergeCardioCaptureValues,
  pauseCardioElapsed,
  readCardioElapsed,
  resetCardioElapsed,
  startCardioElapsed,
  type CardioSegmentReason,
  type IntervalConfig,
  type OptimisticLogPayload,
  type ReconciledSessionLog,
} from '@eva/workout-engine'
import {
  addSample,
  createZoneSession,
  hrToZone,
  updateOutOfZone,
  zoneSessionSummary,
  type HrMetadataV1,
  type HrToZoneProfile,
  type HrZone,
  type ZoneSessionState,
} from '@eva/cardio'
import { FONT, textStyle } from '../../../../lib/typography'
import { hexToRgba } from '../../../../lib/theme'
import { useTheme } from '../../../../context/ThemeContext'
import { haptics, timerHaptics } from '../../../../lib/haptics'
import { isBleAvailable, useBleHr } from '../../../../lib/ble-hr'
import { Sheet } from '../../../Sheet'
import { ConnectSensorSheet } from './ConnectSensorSheet'
import type { SessionBlock, SessionDraft, SessionExercise } from '../../../../lib/workout-session'
import { ActiveSetRow, SetRow } from '../SetRow'
import { ExerciseActionChips } from './exercise-actions'
import { JuicyButton } from './JuicyButton'
import { ProgressRing } from './ProgressRing'
import { TypedMediaV3, TypedInstructionsChip, hasExecMedia } from './TypedMediaV3'
import { useCountdown, useIntervalRunner, useStopwatch } from './timing'
import { useCardioLiveTimer, type CardioLiveControls, type CardioLiveSpec } from './use-cardio-live-timer'
import {
  PHASE_COLORS,
  cardioDetailLabel,
  cardioDistanceObjective,
  cardioObjective,
  cardioSequenceRemainingSec,
  cardioTimerMode,
  formatClock,
  zoneBpmRange,
  zoneRingColor,
} from './typed-screen-model'
import type { ExecTheme } from './exec-theme'

/**
 * Pantalla "Cardio" del ejecutor V3 (E3.4) — traducción de concepto-a-v31-cardio-wheel (identidad +
 * countdown de zona) y concepto-a-v32-momentos (intervalo en fase). IDENTIDAD arriba (nombre + chip
 * "Cardio · {detalle}" + mini-media). Según la prescripción:
 *  · countdown (duración) → anillo GRANDE en el COLOR DE LA ZONA objetivo (o acento si no hay zona),
 *    `computeCardioProgress` deriva el % que DRENA (`useCountdown`).
 *  · intervalos → fase actual GIGANTE con su tiempo (`useIntervalRunner`, mirror de `IntervalTimer`),
 *    colores FIJOS de fase (trabajo ámbar / recupera verde / warmup-cooldown neutro), "Luego: {fase}
 *    {tiempo}", barra segmentada "Intervalo N de M" y cue visual (flash) + háptico al cambiar de fase.
 *  · sin tiempo (distancia) → cronómetro count-up con la distancia como objetivo textual (`useStopwatch`).
 * La zona objetivo SIEMPRE visible con su rango bpm concreto si el perfil FC del alumno viajó
 * (`hrZones`); si no, solo "Z{n}". FC MANUAL (BLE = Ola 6): sub-chip honesto "Compara con tu reloj".
 * Captura post-esfuerzo por el keypad tipado EXISTENTE (`ActiveSetRow` cardio: min/metros/FC).
 *
 * BANDEJA/LOCKSCREEN (Android): cada hero espeja su cuenta como notificación ongoing con contador
 * NATIVO vía `useCardioLiveTimer` — el mismo mecanismo del descanso (`live-timer-notification.ts`),
 * con la identidad de cardio (id/canal propios) y la alerta puntual "¡Cardio completo!" para cuando la
 * app está en segundo plano. La notificación es SIEMPRE un espejo: se publica sólo en TRANSICIONES
 * (arrancar/reanudar/reiniciar/cambio de fase) y jamás participa de la cuenta, que sigue intacta en
 * `timing.ts`. Sin lib nativa o sin permiso ⇒ NO-OP y la pantalla funciona igual.
 *
 * CON SENSOR CONECTADO (specs/cardio-conectado · F1) el chip de BPM crece a un HUD: tiempo acumulado
 * EN la zona pedida, barra de 5 zonas (marcador vivo + objetivo), promedio/máximo del stream y aviso
 * háptico al salirse de zona ≥10 s sostenidos. Al cerrar la serie el resumen + la curva downsampleada
 * viajan como `metadata.hr` por el MISMO `buildTypedPayload` → `logSet` (motor intocable).
 */
/**
 * Fin de un TRAMO de cardio que el hero (countdown / intervalos / cronómetro) le avisa a la pantalla.
 * `closesRound` = el tramo completa la fila de captura activa (en continuo siempre; en intervalos,
 * sólo la última fase de la ronda). `prescribedSec` es el TOPE del reloj de pared: sin él, volver de
 * background con el timer ya vencido registraría el tiempo real (45 min de un bloque de 20); `null` ⇒
 * tramo sin duración prescrita (distancia / cronómetro), ahí el reloj de pared es la verdad.
 * `keepsRunning` = el timer sigue corriendo tras el corte (boundary de ronda de intervalos).
 * La decisión la toma el motor puro `decideCardioAutolog`.
 */
export interface CardioSegmentEvent {
  reason: CardioSegmentReason
  closesRound: boolean
  prescribedSec?: number | null
  keepsRunning?: boolean
}

/** Cue corto por zona (es-neutro) — respaldo del chip cuando no viaja el perfil FC (sin rango bpm). */
const ZONE_CUE: Record<number, string> = {
  1: 'Suave',
  2: 'Mantén el ritmo',
  3: 'Cómodo-duro',
  4: 'Fuerte',
  5: 'Máximo',
}

export function CardioScreenV3({
  block,
  exercise,
  blockLogs,
  restoredDraft,
  reducedMotion = false,
  exec,
  hrZones,
  hrProfile,
  substitution = null,
  canSubstitute = false,
  onOpenSubstitute,
  onUndoSubstitution,
  skipped = false,
  skipReason = null,
  canSkip = false,
  onOpenSkip,
  onOpenTechnique,
  onOpenSet,
  onCommitSet,
  onDraftChange,
  recentSet,
  syncErrors,
  onRetrySet,
}: {
  block: SessionBlock
  exercise: SessionExercise
  blockLogs: ReconciledSessionLog[]
  restoredDraft: SessionDraft | null
  reducedMotion?: boolean
  exec: ExecTheme
  hrZones?: import('@eva/cardio').HrZoneRange[] | null
  /** Perfil FC del alumno (FCmax + FC reposo) para clasificar el BPM en vivo del sensor BLE (E6.1). */
  hrProfile?: HrToZoneProfile | null
  /** Sustitución de HOY (mockup 3: ya no es exclusiva de fuerza). */
  substitution?: { name: string; prescribedName: string } | null
  canSubstitute?: boolean
  onOpenSubstitute?: () => void
  onUndoSubstitution?: () => void
  /** El alumno declaró OMITIDO este bloque: se retira la captura y queda el badge. */
  skipped?: boolean
  skipReason?: string | null
  canSkip?: boolean
  onOpenSkip?: () => void
  onOpenTechnique: () => void
  onOpenSet: (setNumber: number) => void
  onCommitSet: (payload: OptimisticLogPayload) => void
  onRpeUpdate?: (payload: OptimisticLogPayload) => void
  onDraftChange: (blockId: string, setNumber: number, values: Record<string, string>, fieldIndex: number) => void
  recentSet?: { blockId: string; setNumber: number; pr: boolean } | null
  syncErrors?: Record<string, string>
  onRetrySet?: (blockId: string, setNumber: number) => void
}) {
  const s = exec.surface
  const mode = cardioTimerMode(block)
  const isInterval = mode === 'interval'
  // Logo del coach para el ícono grande de la notificación viva — MISMO criterio que el descanso
  // (`RestTimerHost`): `logoUrlDark` en tema oscuro (la bandeja de Android sigue el tema del sistema)
  // y `logoUrl` en claro. Sale del branding runtime ya hidratado: cero fetches nuevos. Sin marca queda
  // `undefined` y la notificación se ve exactamente como antes.
  const { branding, resolvedScheme } = useTheme()
  const coachLogoUrl =
    (resolvedScheme === 'dark' ? branding?.logoUrlDark ?? branding?.logoUrl : branding?.logoUrl) ?? undefined
  // Chip/mini-media del cardio: continuo = MARCA del coach; intervalos = ámbar z4 (token FIJO). Nunca
  // un naranja hardcodeado fuera de contrato (D4).
  const chipColor = isInterval ? PHASE_COLORS.work : exec.accent
  const zoneColor = zoneRingColor(block.hr_zone, exec.accent)
  const bpmRange = zoneBpmRange(block.hr_zone, hrZones)
  const objectiveLine = formatTypedObjective(block, 'cardio')
  const distanceObjective = cardioDistanceObjective(block)
  // Nota del coach (todos los tipos): pill de acento + sheet interna (patrón autocontenido de movilidad).
  const [noteOpen, setNoteOpen] = useState(false)
  const coachNote = block.notes?.trim() ? block.notes.trim() : null

  // ── BLE Heart Rate en vivo (E6.1) ─────────────────────────────────────────────────────────────
  // El sensor solo ALIMENTA la UI (chip BPM + zona en vivo) y auto-rellena `actual_avg_hr` al cerrar
  // el bloque; el motor de guardado (flujo tipado) queda intacto. Todo el módulo degrada honesto:
  // sin backend BLE nativo (Expo Go) el botón "Conectar sensor" NO aparece.
  const bleSupported = isBleAvailable()
  const ble = useBleHr()
  const [sensorSheetOpen, setSensorSheetOpen] = useState(false)
  const streaming = ble.state.status === 'streaming'
  const liveBpm = streaming ? ble.state.bpm : null
  const liveZone = liveBpm != null && hrProfile ? hrToZone(liveBpm, hrProfile) : null

  // ── HUD conectado (specs/cardio-conectado · F1) ───────────────────────────────────────────────
  // El acumulador es PURO (`@eva/cardio/zone-session`): cada muestra del sensor entra UNA sola vez
  // (guard por `lastSampleAtMs`) y de ahí salen el tiempo en la zona pedida, el max/avg y la curva que
  // se persiste al cerrar la serie. Acá no se calcula nada de zonas a mano — se clasifica con el MISMO
  // `hrToZone` de la prescripción (cero drift).
  const targetZone: HrZone | null =
    block.hr_zone != null && block.hr_zone >= 1 && block.hr_zone <= 5 ? (block.hr_zone as HrZone) : null
  // Estado primero (init lazy) y ref espejo desde el estado: leer un ref durante render viola
  // react-hooks/refs; ambos parten del MISMO valor y el efecto de abajo los mantiene en sincronía.
  const [zoneSession, setZoneSession] = useState<ZoneSessionState>(() => createZoneSession(targetZone))
  const zoneSessionRef = useRef<ZoneSessionState>(zoneSession)
  // Marca de la última muestra YA integrada: el efecto puede re-correr por otras dependencias y una
  // muestra contada dos veces inflaría el tiempo en zona.
  const lastSampleRef = useRef<number | null>(null)
  // El timer vive DENTRO de cada hero (countdown/intervalos/cronómetro); el HUD solo necesita saber si
  // corre para NO vibrar en pausa. Ref (no estado): no repinta nada al pausar.
  const timerRunningRef = useRef(true)
  // Reloj de PARED del tramo de cardio en curso (hallazgo E): lo que termina en la caja MIN. Vive en
  // el motor puro `cardio-autolog` (compartido con la web) y se arranca/pausa con el MISMO aviso que
  // ya publicaban los heroes, así el botón "Pausar" de la notificación también queda cubierto.
  const elapsedRef = useRef(createCardioElapsed())
  const handleTimerRunning = useCallback((running: boolean) => {
    timerRunningRef.current = running
    const now = Date.now()
    elapsedRef.current = running
      ? startCardioElapsed(elapsedRef.current, now)
      : pauseCardioElapsed(elapsedRef.current, now)
  }, [])

  useEffect(() => {
    if (!streaming) return
    const bpm = ble.state.bpm
    const atMs = ble.state.lastSampleAtMs
    if (bpm == null || atMs == null || lastSampleRef.current === atMs) return
    lastSampleRef.current = atMs
    let next = addSample(zoneSessionRef.current, bpm, atMs, hrProfile ?? null)
    if (targetZone != null && hrProfile) {
      const paused = !timerRunningRef.current
      // En pausa el aviso se REARMA (se trata como "en zona"): el alumno detuvo el bloque a propósito,
      // no está fallando la prescripción. Fuera de pausa dispara una vez por tramo (debounce 10 s).
      const inTarget = paused || hrToZone(bpm, hrProfile)?.zone === targetZone
      const upd = updateOutOfZone(next, inTarget, atMs)
      next = upd.state
      // Aviso sutil de "te saliste de zona": mismo helper háptico del resto del ejecutor. reduced-motion
      // ⇒ sin vibración (el HUD sigue mostrando el dato).
      if (upd.fire && !paused && !reducedMotion) haptics.warning()
    }
    zoneSessionRef.current = next
    setZoneSession(next)
  }, [ble.state.bpm, ble.state.lastSampleAtMs, streaming, hrProfile, targetZone, reducedMotion])

  /**
   * `metadata.hr` de la serie que se está cerrando (resumen + curva downsampleada ≤360 puntos). null
   * sin una sola muestra ⇒ el ctx no gana la key y `buildTypedPayload` devuelve el payload byte-idéntico
   * al de siempre. Identidad ESTABLE (lee el ref) para no repintar la fila de captura con cada muestra.
   */
  const hrMetadataForCommit = useCallback((): HrMetadataV1 | null => {
    const st = zoneSessionRef.current
    return st.count > 0 ? zoneSessionSummary(st) : null
  }, [])

  const handleCommitSet = useCallback(
    (payload: OptimisticLogPayload) => {
      // Serie cerrada ⇒ el acumulador arranca limpio: cada serie del bloque persiste SU propia curva.
      const fresh = createZoneSession(targetZone)
      zoneSessionRef.current = fresh
      lastSampleRef.current = null
      setZoneSession(fresh)
      onCommitSet(payload)
    },
    [onCommitSet, targetZone],
  )

  // Congela el promedio de la sesión de stream para auto-rellenar `actual_avg_hr` una vez, al cerrar
  // el bloque (transición streaming → detenido). El athlete captura el esfuerzo DESPUÉS de detener,
  // así el prellenado no pisa nada ya escrito y sigue siendo editable antes de confirmar.
  const lastAvgRef = useRef<number | null>(null)
  useEffect(() => {
    if (ble.state.avgHr != null) lastAvgRef.current = ble.state.avgHr
  }, [ble.state.avgHr])
  const [seededAvg, setSeededAvg] = useState<number | null>(null)
  const prevStreamingRef = useRef(false)
  useEffect(() => {
    if (prevStreamingRef.current && !streaming && lastAvgRef.current != null) {
      setSeededAvg(lastAvgRef.current)
    }
    prevStreamingRef.current = streaming
  }, [streaming])

  const loggedSetNumbers = useMemo(
    () => new Set(blockLogs.filter((l) => l.set_number >= 1 && l.set_number <= block.sets).map((l) => l.set_number)),
    [blockLogs, block.sets],
  )
  let firstUnlogged: number | null = null
  for (let i = 1; i <= block.sets; i += 1) {
    if (!loggedSetNumbers.has(i)) { firstUnlogged = i; break }
  }
  // Bloque OMITIDO ⇒ no hay serie activa: se retira la captura post-esfuerzo (el hero de tiempo/zona
  // se conserva: sigue siendo la ficha del ejercicio). Queda el historial de lo YA registrado.
  const activeSet = skipped ? null : firstUnlogged

  // ── Auto-registro del cardio cronometrado (hallazgo E) ──────────────────────────────────────────
  // Regla del owner: el timer/intervalo que TERMINA SOLO rellena los minutos, ENVÍA la serie y deja
  // que el auto-avance de `ExecutorV3` mueva a la ronda/ejercicio siguiente; si el alumno PAUSA o
  // SALTA antes, los minutos caen en la caja y NADA más (decide él). La decisión y la aritmética son
  // del motor puro `cardio-autolog`, el MISMO que usa la web: acá sólo se despacha.
  const sentSetsRef = useRef<Set<number>>(new Set())
  // Espejo de lo último que el alumno tipeó en la fila: sembrar la caja MIN la remonta, así que sin
  // esto se perderían METROS/FC a medio escribir (y el commit automático iría sin ellos).
  const draftValuesRef = useRef<Record<string, string>>({})
  const [minSeed, setMinSeed] = useState<{ values: Record<string, string>; nonce: number } | null>(null)

  // Ronda nueva ⇒ acumulador limpio y sin semilla heredada. Si el reloj del tramo sigue CORRIENDO no
  // se toca: es el boundary de una ronda de intervalos (la secuencia ya no se remonta) y `handleSegment`
  // reinició el tramo en el instante exacto del corte — pisarlo acá dejaría la ronda siguiente en 0.
  useEffect(() => {
    if (elapsedRef.current.startedAtMs == null) elapsedRef.current = resetCardioElapsed()
    draftValuesRef.current = {}
    setMinSeed(null)
  }, [activeSet])

  // Envío FALLIDO (la fila vuelve a estar sin registrar): se purga del anti-doble-envío para que el
  // auto-registro pueda reintentarla en el próximo fin natural de tramo.
  useEffect(() => {
    if (!syncErrors) return
    for (const setNumber of Array.from(sentSetsRef.current)) {
      if (syncErrors[`${block.id}:${setNumber}`]) sentSetsRef.current.delete(setNumber)
    }
  }, [syncErrors, block.id])

  // Draft restaurado de la fila ACTIVA (resiliencia): base de la semilla Y del payload del auto-envío.
  const restoredDraftValues = useMemo(
    () =>
      restoredDraft && restoredDraft.blockId === block.id && restoredDraft.setNumber === activeSet
        ? restoredDraft.values
        : null,
    [restoredDraft, block.id, activeSet],
  )

  const handleSegment = useCallback(
    ({ reason, closesRound, prescribedSec, keepsRunning }: CardioSegmentEvent) => {
      const now = Date.now()
      // Sólo la PAUSA detiene el reloj: saltar o avanzar de fase deja la secuencia corriendo, y el
      // vencimiento se lee en vivo (reloj de pared ⇒ correcto aunque la app haya estado en background).
      const stopped = reason === 'paused' ? pauseCardioElapsed(elapsedRef.current, now) : elapsedRef.current
      const elapsedSec = readCardioElapsed(stopped, now)
      const decision = decideCardioAutolog({ reason, elapsedSec, closesRound, prescribedSec })
      // Cierre de ronda con la secuencia AÚN corriendo: el tramo siguiente arranca a contar en el mismo
      // instante del corte (antes ese reinicio lo daba el remonte del hero, que rompía la secuencia).
      const cleared = decision.resetElapsed ? resetCardioElapsed() : stopped
      elapsedRef.current = decision.resetElapsed && keepsRunning ? startCardioElapsed(cleared, now) : cleared
      if (decision.fillSeconds == null || activeSet == null) return
      // MISMA mezcla que la semilla de la fila (`captureSeed`): draft restaurado ∪ lo tipeado ∪ FC del
      // sensor ∪ los minutos del timer. Armar el payload sólo con `draftValuesRef` perdía los metros del
      // draft restaurado (y la FC sembrada) cuando el alumno no había vuelto a escribir en esa ronda.
      const values = mergeCardioCaptureValues({
        restored: restoredDraftValues,
        typed: draftValuesRef.current,
        minSec: decision.fillSeconds,
        seededAvgHr: seededAvg,
      })
      // Anti-doble-envío: una fila se auto-registra UNA vez (el alumno siempre puede corregirla).
      if (!decision.submit || sentSetsRef.current.has(activeSet)) {
        setMinSeed({ values, nonce: now })
        return
      }
      sentSetsRef.current.add(activeSet)
      const hrMetadata = hrMetadataForCommit()
      const payload = buildTypedPayload('cardio', values, block.id, activeSet, {
        distanceUnit: block.distance_unit ?? null,
        cardioModality: exercise.cardio_modality ?? null,
        ...(hrMetadata ? { hrMetadata } : {}),
      })
      // MISMO camino del botón ✓: resetea el acumulador de zona FC y delega en `onCommitSet`.
      handleCommitSet(payload)
    },
    [
      activeSet,
      block.id,
      block.distance_unit,
      exercise.cardio_modality,
      hrMetadataForCommit,
      handleCommitSet,
      restoredDraftValues,
      seededAvg,
    ],
  )

  // Semilla del keypad tipado al MONTAR la fila: draft restaurado + (si aplica) el promedio del sensor
  // en `actual_avg_hr` (sólo si está vacío: JAMÁS pisa lo que el alumno escribió). La mezcla la hace el
  // motor (`mergeCardioCaptureValues`), la misma que arma el payload del auto-envío: una sola regla de
  // precedencia para los dos caminos. Los minutos del timer NO entran acá — llegan por `typedSeedPatch`
  // (sin remontar la fila, así el keypad abierto no se cierra a mitad de escritura).
  const captureSeed = useMemo(
    () =>
      mergeCardioCaptureValues({
        restored: restoredDraftValues,
        // Snapshot de la última siembra (ya trae lo tipeado + los minutos): si la fila se remonta por
        // otra razón — la FC del sensor cambia la key — no se pierde lo que el timer había volcado.
        typed: minSeed?.values ?? null,
        seededAvgHr: seededAvg,
      }),
    [restoredDraftValues, seededAvg, minSeed],
  )

  const loggedRows = Array.from({ length: block.sets }).map((_, i) => {
    const setNumber = i + 1
    const log = blockLogs.find((l) => l.set_number === setNumber)
    if (!log) return null
    const isRecent = recentSet?.blockId === block.id && recentSet?.setNumber === setNumber
    return (
      <SetRow
        key={setNumber}
        setNumber={setNumber}
        log={log}
        isActive={false}
        typedMode="cardio"
        cardioModality={exercise.cardio_modality ?? null}
        onPress={() => onOpenSet(setNumber)}
        settle={isRecent}
        pr={isRecent && !!recentSet?.pr}
        syncError={syncErrors?.[`${block.id}:${setNumber}`] ?? null}
        onRetry={() => onRetrySet?.(block.id, setNumber)}
      />
    )
  })

  return (
    <View style={{ gap: 12 }}>
      {/* IDENTIDAD: nombre + chip */}
      <View style={{ gap: 8 }}>
        <Text style={{ fontFamily: FONT.displayBlack, fontSize: 26, letterSpacing: -0.5, lineHeight: 28, color: s.text }} numberOfLines={2}>
          {exercise.name}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 11, paddingVertical: 5, backgroundColor: hexToRgba(chipColor, 0.14), borderColor: hexToRgba(chipColor, 0.32) }}>
            <HeartPulse size={13} color={chipColor} />
            <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: hexToRgba(chipColor, 0.95) }} numberOfLines={1}>
              Cardio · {cardioDetailLabel(block)}
            </Text>
          </View>
          {/* Cambiar / Omitir + badges de estado — misma fila compartida que la pantalla de fuerza. */}
          <ExerciseActionChips
            exec={exec}
            exerciseName={exercise.name}
            substituted={!!substitution}
            canSubstitute={canSubstitute}
            onOpenSubstitute={onOpenSubstitute}
            onUndoSubstitution={onUndoSubstitution}
            skipped={skipped}
            skipReason={skipReason}
            canSkip={canSkip}
            onOpenSkip={onOpenSkip}
          />
        </View>
      </View>

      {/* Media del catálogo — chips "Instrucciones" + "Nota del coach" DENTRO de la media (overlay
          superior-izquierdo), precedencia + audio en video (QA4). */}
      {hasExecMedia(exercise) ? (
        <View style={{ width: '100%', height: 150, borderRadius: 22, overflow: 'hidden', borderWidth: 2, borderColor: s.borderStrong, backgroundColor: s.surfaceRaised }}>
          <TypedMediaV3 exercise={exercise} exec={exec} accent={chipColor} coachNote={coachNote} IconFallback={HeartPulse} onOpenTechnique={onOpenTechnique} onOpenNote={() => setNoteOpen(true)} reducedMotion={reducedMotion} />
        </View>
      ) : (
        <TypedInstructionsChip exercise={exercise} accent={chipColor} coachNote={coachNote} onOpenTechnique={onOpenTechnique} onOpenNote={() => setNoteOpen(true)} reducedMotion={reducedMotion} />
      )}

      {/* HERO por modo */}
      {/* `key` por RONDA en countdown y cronómetro: al cerrarse una fila el hero se remonta ⇒ la ronda
          siguiente arranca en su valor prescrito y DETENIDA (regla "nada corre solo", QA4 h8a). Es el
          equivalente al `resetKey` del countdown web.
          INTERVALOS NO: `buildIntervalSequence` es la secuencia de TODAS las rondas (warmup una vez,
          repeats × sets works, cooldown al final), así que remontarla en cada cierre de fila la devolvía
          a la fase 0 — calentamiento repetido por ronda, cooldown inalcanzable y minutos inflados. La
          fila se cierra en el boundary (`resetElapsed` del motor deja el acumulador limpio) y la
          secuencia sigue de corrido. */}
      {mode === 'interval' ? (
        <IntervalHero block={block} zoneColor={zoneColor} reducedMotion={reducedMotion} exec={exec} onRunningChange={handleTimerRunning} onSegment={handleSegment} largeIconUrl={coachLogoUrl} />
      ) : mode === 'countdown' ? (
        <CountdownHero
          key={`hero-${activeSet ?? 'x'}`}
          durationSec={block.duration_sec as number}
          block={block}
          exerciseName={exercise.name}
          zoneColor={zoneColor}
          reducedMotion={reducedMotion}
          exec={exec}
          onRunningChange={handleTimerRunning}
          onSegment={handleSegment}
          largeIconUrl={coachLogoUrl}
        />
      ) : (
        <StopwatchHero key={`hero-${activeSet ?? 'x'}`} distanceObjective={distanceObjective} zoneColor={zoneColor} reducedMotion={reducedMotion} exec={exec} onRunningChange={handleTimerRunning} onSegment={handleSegment} largeIconUrl={coachLogoUrl} />
      )}

      {/* Zona objetivo SIEMPRE visible + sub-chip honesto */}
      {block.hr_zone != null && (
        <View style={{ alignItems: 'center', gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 999, borderWidth: 2, paddingHorizontal: 18, paddingVertical: 10, backgroundColor: hexToRgba(zoneColor, 0.16), borderColor: hexToRgba(zoneColor, 0.4) }}>
            {/* Punto de zona con halo (4px) + pulso sereno (encoge+desvanece), como el mockup (D15). */}
            <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
              <View style={{ position: 'absolute', width: 20, height: 20, borderRadius: 10, backgroundColor: hexToRgba(zoneColor, 0.25) }} />
              <MotiView
                from={{ opacity: 1, scale: 1 }}
                animate={{ opacity: reducedMotion ? 1 : 0.4, scale: reducedMotion ? 1 : 0.7 }}
                transition={{ type: 'timing', duration: 900, loop: !reducedMotion, repeatReverse: true }}
                style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: zoneColor }}
              />
            </View>
            <Text style={{ fontFamily: FONT.displayBlack, fontSize: 16, color: zoneColor }}>Z{block.hr_zone}</Text>
            {bpmRange ? (
              <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 13, color: hexToRgba(s.text, 0.75), fontVariant: ['tabular-nums'] }}>
                {bpmRange.minBpm}–{bpmRange.maxBpm} bpm
              </Text>
            ) : (
              <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 13, color: '#cbd5c9' }}>
                {ZONE_CUE[block.hr_zone] ?? ''}
              </Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Watch size={12} color={s.textDim} />
            <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 11, color: s.textDim }}>Compara con tu reloj o pulsómetro</Text>
          </View>
        </View>
      )}

      {/* Sensor BLE (E6.1): chip BPM VIVO con zona en vivo mientras hay stream; botón discreto si no.
          Todo el bloque solo aparece cuando hay backend BLE nativo (oculto en Expo Go). */}
      {bleSupported && (
        <View style={{ alignItems: 'center', gap: 10 }}>
          {liveBpm != null ? (
            <TouchableOpacity
              testID="chip-bpm-vivo"
              activeOpacity={0.85}
              onPress={() => setSensorSheetOpen(true)}
              accessibilityRole="button"
              accessibilityLabel={`Frecuencia cardiaca en vivo: ${liveBpm} pulsaciones por minuto`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 999, borderWidth: 2, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: hexToRgba('#f87171', 0.14), borderColor: hexToRgba('#f87171', 0.4) }}
            >
              <MotiView
                from={{ scale: 1, opacity: 0.9 }}
                animate={{ scale: reducedMotion ? 1 : 1.35, opacity: reducedMotion ? 0.9 : 0.5 }}
                transition={{ type: 'timing', duration: 700, loop: !reducedMotion, repeatReverse: true }}
                style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: '#f87171' }}
              />
              <Text style={{ fontFamily: FONT.displayBlack, fontSize: 22, color: '#f87171', fontVariant: ['tabular-nums'] }}>
                {liveBpm}
                <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: hexToRgba(s.text, 0.7) }}> bpm</Text>
              </Text>
              {liveZone ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginLeft: 2, paddingLeft: 10, borderLeftWidth: 1.5, borderLeftColor: hexToRgba(s.text, 0.15) }}>
                  <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: zoneRingColor(liveZone.zone, exec.accent) }} />
                  <Text style={{ fontFamily: FONT.displayBlack, fontSize: 14, color: zoneRingColor(liveZone.zone, exec.accent) }}>Z{liveZone.zone}</Text>
                </View>
              ) : null}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              testID="btn-connect-sensor"
              activeOpacity={0.75}
              onPress={() => setSensorSheetOpen(true)}
              accessibilityRole="button"
              accessibilityLabel="Conectar sensor de pulso"
              style={{ flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 7, borderColor: s.border, backgroundColor: s.surfaceRaised }}
            >
              <HeartPulse size={13} color={s.textMuted} />
              <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: s.textMuted }}>Conectar sensor de pulso</Text>
            </TouchableOpacity>
          )}

          {/* HUD conectado: SOLO con stream activo y perfil FC del alumno. Sin perfil no hay zona que
              mostrar (el chip de bpm crudo de arriba es toda la verdad disponible). */}
          {streaming && hrProfile ? (
            <HrHud
              session={zoneSession}
              targetZone={targetZone}
              liveZone={liveZone?.zone ?? null}
              avgHr={ble.state.avgHr}
              maxHr={ble.state.maxHr}
              exec={exec}
            />
          ) : null}
        </View>
      )}

      {objectiveLine ? (
        <Text style={{ fontFamily: FONT.monoSemibold, fontSize: 13, color: hexToRgba(s.text, 0.82), textAlign: 'center', fontVariant: ['tabular-nums'] }}>
          {objectiveLine}
        </Text>
      ) : null}

      {/* Captura post-esfuerzo (min/metros/FC manual) */}
      {activeSet != null && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontFamily: FONT.uiBold, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: s.textMuted }}>
            Registra tu esfuerzo{block.sets > 1 ? ` · serie ${activeSet} de ${block.sets}` : ''}
          </Text>
          {seededAvg != null ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <HeartPulse size={12} color="#f87171" />
              <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 11, color: s.textMuted }}>
                FC promedio del sensor: <Text style={{ fontFamily: FONT.uiBold, color: hexToRgba(s.text, 0.8) }}>{seededAvg} bpm</Text> · editable
              </Text>
            </View>
          ) : null}
          <ActiveSetRow
            // La semilla de MIN ya NO viaja en la `key` (remontar cerraba el keypad a mitad de escritura
            // cuando llegaba un "Pausar" desde la notificación): entra por `typedSeedPatch`, que escribe
            // el valor por el mismo camino que una edición del alumno.
            key={`${block.id}-${activeSet}-${seededAvg != null ? 'hr' : 'x'}`}
            blockId={block.id}
            setNumber={activeSet}
            typedMode="cardio"
            // Unidad de captura = unidad PRESCRITA (G3): con "5 km" la caja se llama "Km" y el motor
            // guarda 5000 en `actual_distance_m`. Sin prescripción en km ⇒ "Metros" como siempre.
            distanceUnit={block.distance_unit ?? null}
            // Ejes por MODALIDAD (Fase C · G6): elíptica ⇒ Min · FC; cuerda ⇒ Saltos; escaladora ⇒
            // Pisos; HIIT ⇒ Reps (todo a `reps_done`). Sin modalidad ⇒ Min · Distancia · FC de siempre.
            cardioModality={exercise.cardio_modality ?? null}
            suggestedWeight={null}
            seedValues={captureSeed}
            // Minutos medidos por el timer (hallazgo E): se setean SIN desmontar la fila.
            typedSeedPatch={minSeed}
            header={{ exerciseName: exercise.name, objectiveLine }}
            // FC del bloque (specs/cardio-conectado F1): la fila pide el resumen al confirmar y lo pasa
            // como `ctx.hrMetadata` a `buildTypedPayload` → `workout_logs.metadata.hr`. Sin stream (o sin
            // una sola muestra) devuelve null y el payload queda byte-idéntico al de siempre.
            getHrMetadata={hrMetadataForCommit}
            onDraftChange={(values, fieldIndex) => {
              // Espejo para el auto-registro (hallazgo E): lo tipeado viaja en la semilla y en el commit.
              draftValuesRef.current = values
              onDraftChange(block.id, activeSet as number, values, fieldIndex)
            }}
            onCommit={handleCommitSet}
          />
        </View>
      )}

      {loggedRows.some(Boolean) && <View style={{ gap: 6 }}>{loggedRows}</View>}

      {bleSupported && (
        <ConnectSensorSheet
          open={sensorSheetOpen}
          onClose={() => setSensorSheetOpen(false)}
          ble={ble}
          exec={exec}
          reducedMotion={reducedMotion}
        />
      )}

      {coachNote && (
        <Sheet open={noteOpen} onClose={() => setNoteOpen(false)} title="Nota del coach" forceDark nativeModal snapPoints={['35%']}>
          <View style={{ paddingVertical: 8 }}>
            <Text style={textStyle('md', FONT.ui, { lh: 'relaxed' })} className="text-body">{coachNote}</Text>
          </View>
        </Sheet>
      )}
    </View>
  )
}

// ─── HUD conectado (F1): tiempo en zona + barra de zonas + avg/max del stream ────────────────────

/** Duración hablada para lectores de pantalla ("3 minutos y 20 segundos"); "3:20" se leería como hora. */
function spokenDuration(totalSec: number): string {
  const total = Math.max(0, Math.round(totalSec))
  const min = Math.floor(total / 60)
  const sec = total % 60
  if (min <= 0) return `${sec} segundo${sec === 1 ? '' : 's'}`
  if (sec === 0) return `${min} minuto${min === 1 ? '' : 's'}`
  return `${min} minuto${min === 1 ? '' : 's'} y ${sec} segundo${sec === 1 ? '' : 's'}`
}

/**
 * HUD del bloque cardio con sensor conectado (specs/cardio-conectado F1): cuánto llevas EN la zona
 * pedida, dónde estás en las 5 zonas y el promedio/máximo de la sesión de stream. Todo sale del
 * acumulador puro (`zone-session`) y del estado del controlador BLE — nada se estima acá.
 *
 * Degradación: sin zona prescrita no hay fila de tiempo-en-zona ni objetivo marcado en la barra (solo
 * el marcador vivo); sin perfil FC este HUD ni se monta (lo decide el padre).
 */
function HrHud({
  session,
  targetZone,
  liveZone,
  avgHr,
  maxHr,
  exec,
}: {
  session: ZoneSessionState
  targetZone: HrZone | null
  liveZone: HrZone | null
  avgHr: number | null
  maxHr: number | null
  exec: ExecTheme
}) {
  const s = exec.surface
  const inTargetSec = Math.round(session.inTargetSec)
  const targetColor = zoneRingColor(targetZone, exec.accent)
  const hasStats = (avgHr != null && avgHr > 0) || (maxHr != null && maxHr > 0)

  return (
    <View
      testID="hr-hud-v3"
      style={{ width: '100%', gap: 10, borderRadius: 16, borderWidth: 1.5, borderColor: s.borderSubtle, backgroundColor: s.surfaceSunken, paddingHorizontal: 12, paddingVertical: 10 }}
    >
      {targetZone != null ? (
        <View
          accessibilityRole="text"
          accessibilityLabel={`Llevas ${spokenDuration(inTargetSec)} en la zona ${targetZone}`}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 }}
        >
          <Timer size={14} color={targetColor} />
          <Text style={{ fontFamily: FONT.displayBlack, fontSize: 19, color: targetColor, fontVariant: ['tabular-nums'] }}>
            {formatClock(inTargetSec)}
          </Text>
          <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: hexToRgba(s.text, 0.75) }}>en Z{targetZone}</Text>
        </View>
      ) : null}

      <ZoneBar liveZone={liveZone} targetZone={targetZone} exec={exec} />

      {hasStats ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          {avgHr != null && avgHr > 0 ? <HudStat label="Promedio" value={avgHr} exec={exec} /> : null}
          {maxHr != null && maxHr > 0 ? <HudStat label="Máximo" value={maxHr} exec={exec} /> : null}
        </View>
      ) : null}
    </View>
  )
}

/** Barra de las 5 zonas: segmento LLENO en la zona viva, contorno en la zona objetivo. */
function ZoneBar({
  liveZone,
  targetZone,
  exec,
}: {
  liveZone: HrZone | null
  targetZone: HrZone | null
  exec: ExecTheme
}) {
  const s = exec.surface
  const label = liveZone != null
    ? `Zonas de frecuencia cardiaca. Estás en la zona ${liveZone}${targetZone != null ? `, objetivo zona ${targetZone}` : ''}`
    : `Zonas de frecuencia cardiaca${targetZone != null ? `, objetivo zona ${targetZone}` : ''}`
  return (
    <View
      testID="hr-zonebar-v3"
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5 }}
    >
      {([1, 2, 3, 4, 5] as HrZone[]).map((z) => {
        const color = zoneRingColor(z, exec.accent)
        const live = liveZone === z
        const target = targetZone === z
        return (
          <View key={z} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            {/* Halo del segmento vivo (mismo recurso que la barra de intervalos: padding + fondo translúcido). */}
            <View style={{ width: '100%', padding: live ? 3 : 0, borderRadius: live ? 8 : 5, backgroundColor: live ? hexToRgba(color, 0.22) : 'transparent' }}>
              <View
                style={{
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: live ? color : hexToRgba(color, 0.28),
                  borderWidth: target ? 2 : 0,
                  borderColor: target ? hexToRgba(color, 0.95) : 'transparent',
                }}
              />
            </View>
            <Text style={{ fontFamily: FONT.uiBold, fontSize: 9, color: live ? color : target ? hexToRgba(color, 0.85) : s.textDim }}>
              Z{z}
            </Text>
          </View>
        )
      })}
    </View>
  )
}

/** Stat compacto del HUD (promedio / máximo de la sesión de stream). */
function HudStat({ label, value, exec }: { label: string; value: number; exec: ExecTheme }) {
  const s = exec.surface
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5 }}>
      <Text style={{ fontFamily: FONT.uiBold, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: s.textDim }}>
        {label}
      </Text>
      <Text style={{ fontFamily: FONT.displayBlack, fontSize: 15, color: hexToRgba(s.text, 0.9), fontVariant: ['tabular-nums'] }}>
        {value}
      </Text>
      <Text style={{ fontFamily: FONT.uiBold, fontSize: 10, color: s.textDim }}>bpm</Text>
    </View>
  )
}

// ─── Hero: countdown (duración) — anillo en color de zona que DRENA ──────────────────────────────
function CountdownHero({
  durationSec,
  block,
  exerciseName,
  zoneColor,
  reducedMotion,
  exec,
  onRunningChange,
  onSegment,
  largeIconUrl,
}: {
  durationSec: number
  block: SessionBlock
  /** Nombre real del ejercicio: titula el contador vivo de la bandeja ("Cardio · Trote suave"). */
  exerciseName: string
  zoneColor: string
  reducedMotion: boolean
  exec: ExecTheme
  /** Avisa al HUD si el conteo corre (el aviso háptico de fuera-de-zona jamás suena en pausa). */
  onRunningChange?: (running: boolean) => void
  /**
   * Fin de un TRAMO de cardio (hallazgo E): `expired` ⇒ la pantalla rellena MIN, envía la serie y deja
   * avanzar al ejecutor; `paused`/`skipped` ⇒ sólo rellena. La decisión la toma el motor puro.
   */
  onSegment?: (e: CardioSegmentEvent) => void
  /** Logo del coach para el ícono grande de la notificación (unificado con el descanso). */
  largeIconUrl?: string
}) {
  const s = exec.surface
  // QA4 h8a: NO auto-arranca (paridad web: `useExecCountdown(durationSec, { autoStart: false })`).
  // `onSegment` por ref: el `onDone` de `useCountdown` se congela en el primer render del hero.
  const onSegmentRef = useRef(onSegment)
  useEffect(() => { onSegmentRef.current = onSegment })
  const countdown = useCountdown(
    durationSec,
    () => {
      timerHaptics.holdDone()
      // Fin natural del bloque continuo: cierra la ronda ⇒ auto-registro (hallazgo E). `prescribedSec`
      // es el TOPE: volver de background con el timer ya vencido registra los minutos PRESCRITOS, no
      // los 45 de reloj de pared que estuvo el teléfono bloqueado.
      onSegmentRef.current?.({ reason: 'expired', closesRound: true, prescribedSec: durationSec })
    },
    false,
  )
  useEffect(() => {
    onRunningChange?.(countdown.running)
  }, [countdown.running, onRunningChange])

  /** Pausa (botón de pantalla o de la notificación): vuelca los minutos SIN enviar ni avanzar. */
  const handleToggle = () => {
    if (countdown.running) onSegment?.({ reason: 'paused', closesRound: false, prescribedSec: durationSec })
    countdown.toggle()
  }
  const progress = computeCardioProgress(cardioObjective(block), { elapsed_sec: durationSec - countdown.remaining })
  const fill = progress ? 1 - progress.pct : countdown.remaining / (durationSec || 1)

  const distObj = cardioDistanceObjective(block)

  // ── Espejo en bandeja/lockscreen ──────────────────────────────────────────────────────────────
  // `restartTick` existe porque reiniciar CORRIENDO no cambia `running` y sí devuelve `remaining` al
  // objetivo: sin este contador la clave de transición no se movería y la bandeja quedaría mintiendo.
  const [restartTick, setRestartTick] = useState(0)
  // Función simple (sin useCallback): el React Compiler infiere `countdown` completo como dep y
  // rechaza la memo manual por [countdown.restart]; la identidad da igual (RingRestart es trivial).
  const handleRestart = () => {
    // "Reiniciar" limpia el acumulador y NO reescribe la caja; `restart` deja el reloj corriendo.
    onSegment?.({ reason: 'restart', closesRound: false })
    setRestartTick((t) => t + 1)
    countdown.restart(durationSec)
  }
  const liveSpec = useMemo<CardioLiveSpec | null>(() => {
    // En 0 o sin arrancar nunca ⇒ sin espejo (el hook limpia contador vivo y aviso final).
    if (countdown.remaining <= 0) return null
    if (!countdown.running && !countdown.started) return null
    // PAUSADO es una transición real, no la ausencia de una: la notificación se convierte en la ficha
    // estática "Cardio en pausa · [Reanudar]" (por eso el estado viaja en la key).
    const paused = !countdown.running
    return {
      key: `cardio-countdown:${restartTick}:${paused ? 'p' : 'r'}`,
      mode: 'countdown',
      direction: 'down',
      paused,
      seconds: countdown.remaining,
      title: `Cardio · ${exerciseName}`,
      body: block.hr_zone != null ? `Zona ${block.hr_zone} objetivo` : 'Mantén el ritmo',
      color: zoneColor,
      largeIconUrl,
      // El bloque termina cuando termina esta cuenta: el aviso final va al mismo instante.
      endNotifSeconds: countdown.remaining,
    }
  }, [
    countdown.running,
    countdown.started,
    countdown.remaining,
    restartTick,
    exerciseName,
    block.hr_zone,
    zoneColor,
    largeIconUrl,
  ])
  // Controles para el drenaje de los botones de la notificación. SIN `useMemo` a propósito: el hook
  // los guarda en un ref que refresca en cada render, así que su identidad es irrelevante (y memoizar
  // por propiedades sueltas rompe la compilación del React Compiler).
  // `adoptExact` sobre `restart`: el ÚNICO camino de `useCountdown` para fijar un restante exacto al
  // adoptar lo que dejó un botón. Es seguro acá porque el anillo se deriva de `durationSec` (prop), no
  // del `target` interno del hook. `restart` deja CORRIENDO, así que el destino "pausa" se completa con
  // un `toggle` inmediato: React colapsa ambos setState en un render y el `toggle` de `timing.ts` es
  // funcional, por lo que el orden se respeta. Ver la cabecera de `use-cardio-live-timer`.
  const liveControls: CardioLiveControls = {
    running: countdown.running,
    // El "Pausar" de la notificación entra por el MISMO camino que el botón de pantalla (caso (b)).
    toggle: handleToggle,
    adoptExact: (seconds, running) => {
      if (!running && countdown.running) onSegment?.({ reason: 'paused', closesRound: false, prescribedSec: durationSec })
      countdown.restart(seconds)
      if (!running) countdown.toggle()
    },
  }
  useCardioLiveTimer(liveSpec, liveControls)

  return (
    <View style={{ alignItems: 'center', gap: 12 }}>
      <View style={{ width: '100%', alignItems: 'center', justifyContent: 'center' }}>
        <ProgressRing size={196} strokeWidth={22} fill={fill} color={zoneColor} trackColor="#26262f" reducedMotion={reducedMotion}>
          <View style={{ alignItems: 'center' }}>
            <MotiView
              from={{ scale: 1 }}
              animate={{ scale: reducedMotion ? 1 : 1.02 }}
              transition={{ type: 'timing', duration: 1400, loop: !reducedMotion, repeatReverse: true }}
            >
              <Text style={{ fontFamily: FONT.displayBlack, fontSize: 54, letterSpacing: -2, lineHeight: 56, color: s.text, fontVariant: ['tabular-nums'] }}>
                {formatClock(countdown.remaining)}
              </Text>
            </MotiView>
            <Text style={{ fontFamily: FONT.uiBold, fontSize: 11, letterSpacing: 2, color: s.textMuted, textTransform: 'uppercase', marginTop: 6 }}>Restante</Text>
          </View>
        </ProgressRing>
        <RingRestart onPress={handleRestart} />
      </View>
      <PauseButton running={countdown.running} started={countdown.started} onToggle={handleToggle} exec={exec} reducedMotion={reducedMotion} />
      {/* Chips de métricas: SOLO objetivos derivables de la prescripción (nada inventado). */}
      <CardioChipsRow>
        <MetricChipRN icon={<Timer size={16} color={hexToRgba(exec.accent, 0.85)} />} value={formatClock(durationSec)} label="Objetivo" wide={distObj == null} />
        {distObj ? <MetricChipRN icon={<Ruler size={16} color={hexToRgba(exec.accent, 0.85)} />} value={distObj} label="Distancia" /> : null}
      </CardioChipsRow>
    </View>
  )
}

// ─── Hero: intervalos — fase gigante con color FIJO + barra segmentada + cue ─────────────────────
function IntervalHero({
  block,
  zoneColor,
  reducedMotion,
  exec,
  onRunningChange,
  onSegment,
  largeIconUrl,
}: {
  block: SessionBlock
  zoneColor: string
  reducedMotion: boolean
  exec: ExecTheme
  /** Avisa al HUD si el runner corre (el aviso háptico de fuera-de-zona jamás suena en pausa). */
  onRunningChange?: (running: boolean) => void
  /**
   * Fin de un TRAMO de cardio (hallazgo E): `expired`/`manual-next` que CIERRA la ronda ⇒ la pantalla
   * rellena MIN, envía la serie y deja avanzar al ejecutor; `paused`/`skipped` ⇒ sólo rellena.
   */
  onSegment?: (e: CardioSegmentEvent) => void
  /** Logo del coach para el ícono grande de la notificación (unificado con el descanso). */
  largeIconUrl?: string
}) {
  const s = exec.surface
  // Fase D (G2/RF7): secuencia COMPLETA — incluye las fases por distancia (avance manual) además de
  // las cronometrables. Espejo exacto del `IntervalFace` web.
  const phases = useMemo(
    () => buildIntervalSequence((block.interval_config ?? {}) as IntervalConfig, block.sets || 1),
    [block.interval_config, block.sets],
  )
  const [flash, setFlash] = useState(0)
  // Fases `work` por ronda de captura: `buildIntervalSequence` numera 1..(repeats × sets) y las filas
  // son `block.sets`, así que la ronda de una fase es `ceil(repeat / repeats)` (motor `cardio-autolog`).
  const repeatsPerRound = ((block.interval_config ?? null) as IntervalConfig | null)?.repeats ?? 1
  const totalRounds = block.sets || 1
  const runner = useIntervalRunner(phases, {
    onPhaseChange: () => { setFlash((f) => f + 1); timerHaptics.intervalPhase() },
    onFinish: () => { setFlash((f) => f + 1); timerHaptics.intervalFinish() },
    // Sólo la fase que CIERRA la ronda registra la fila; las intermedias no ensucian la caja.
    // `prescribedSec` = suma de las fases de ESA ronda (tope del reloj de pared); `keepsRunning` =
    // quedan fases por delante, así que el tramo siguiente arranca a contar en el instante del corte.
    onSegmentEnd: ({ reason, phaseIndex }) =>
      onSegment?.({
        reason,
        closesRound: intervalPhaseClosesRound(phases, phaseIndex, repeatsPerRound, totalRounds),
        prescribedSec: intervalRoundPrescribedSec(phases, phaseIndex, repeatsPerRound, totalRounds),
        keepsRunning: phaseIndex < phases.length - 1,
      }),
  })
  useEffect(() => {
    onRunningChange?.(runner.running)
  }, [runner.running, onRunningChange])

  /** Tope de la ronda EN CURSO (para las pausas): la del índice activo. */
  const roundPrescribedSec = intervalRoundPrescribedSec(phases, runner.phaseIndex, repeatsPerRound, totalRounds)

  /** Pausa (botón de pantalla o de la notificación): vuelca los minutos SIN enviar ni avanzar. */
  const handleToggle = () => {
    if (runner.running) onSegment?.({ reason: 'paused', closesRound: false, prescribedSec: roundPrescribedSec })
    runner.toggle()
  }

  /**
   * CTA "Fase siguiente" (fase por DISTANCIA): el reloj de pared del tramo arranca con este PRIMER
   * GESTO — se avisa ANTES de avanzar porque el runner emite el fin del tramo en la misma llamada (los
   * `setState` de `next()` recién se ven en el render siguiente). Consecuencia deliberada ("nada corre
   * solo al montar", QA4 h8a): en una secuencia que EMPIEZA por distancia la ronda 1 cierra con 0 s ⇒
   * el motor no la registra y el alumno la captura a mano. Misma regla en la web.
   */
  const handleNext = () => {
    onRunningChange?.(true)
    runner.next()
  }

  const phase = runner.phase
  const phaseColor = phase ? PHASE_COLORS[phase.kind] : zoneColor
  const manual = !runner.finished && runner.isManual
  const totalIntervals = phases.filter((p) => p.kind === 'work').length
  const currentInterval = phase?.repeat ?? (runner.finished ? totalIntervals : 1)
  const nextPhase = phases[runner.phaseIndex + 1] ?? null
  const nextPhaseColor = nextPhase ? PHASE_COLORS[nextPhase.kind] : zoneColor
  // Duraciones de fase derivadas de la prescripción (chips honestos: trabajo / recupera) — D1.
  const workPhase = phases.find((p) => p.kind === 'work') ?? null
  const recoveryPhase = phases.find((p) => p.kind === 'recovery') ?? null

  // ── Espejo en bandeja/lockscreen ──────────────────────────────────────────────────────────────
  // La clave de transición lleva el índice de fase: cada cambio de fase re-publica la MISMA
  // notificación (mismo id ⇒ se actualiza en sitio) con el fin de la fase nueva. `restartTick` cubre
  // el reinicio desde la fase 0 estando ya en la fase 0 y corriendo (el índice no se movería).
  const [restartTick, setRestartTick] = useState(0)
  // Función simple (sin useCallback): mismo criterio que CountdownHero — el Compiler infiere
  // `runner` completo y rechaza la memo manual por [runner.restart].
  const handleRestart = () => {
    // "Reiniciar" limpia el acumulador y NO reescribe la caja; `restart` deja la secuencia corriendo.
    onSegment?.({ reason: 'restart', closesRound: false })
    setRestartTick((t) => t + 1)
    runner.restart()
  }
  const liveSpec = useMemo<CardioLiveSpec | null>(() => {
    // Terminado, sin arrancar nunca, o en una fase por DISTANCIA ⇒ no hay cuenta que espejar (una
    // fase manual dura lo que el alumno tarde: un cronómetro ahí sería mentira).
    if (runner.finished || runner.isManual || !phase) return null
    if (!runner.running && !runner.started) return null
    // PAUSADO ⇒ ficha estática con [Reanudar] (la pausa es una transición, por eso viaja en la key).
    const paused = !runner.running
    return {
      key: `cardio-interval:${restartTick}:${runner.phaseIndex}:${paused ? 'p' : 'r'}`,
      mode: 'interval',
      direction: 'down',
      paused,
      seconds: runner.remaining,
      title: `Cardio · fase ${runner.phaseIndex + 1} de ${phases.length}`,
      body: INTERVAL_PHASE_LABEL[phase.kind],
      color: phaseColor,
      largeIconUrl,
      phaseIndex: runner.phaseIndex,
      phaseCount: phases.length,
      // El aviso final es el de la SECUENCIA completa (null si queda alguna fase manual por delante).
      endNotifSeconds: cardioSequenceRemainingSec(phases, runner.phaseIndex, runner.remaining),
    }
  }, [
    runner.running,
    runner.started,
    runner.finished,
    runner.isManual,
    runner.phaseIndex,
    runner.remaining,
    phase,
    phases,
    phaseColor,
    restartTick,
    largeIconUrl,
  ])
  // `adoptRemaining` (NO `restart`, que vuelve a la fase 0) re-ancla el restante de la fase EN CURSO:
  // con eso pausar/reanudar desde la notificación es exacto y el rato pausado ya no se cuenta como
  // corrido. "Fase siguiente" sigue aplicándose con `skip`.
  // Objeto sin memoizar: el hook lo guarda en un ref que refresca en cada render (ver CountdownHero).
  const liveControls: CardioLiveControls = {
    running: runner.running,
    // Pausar desde la notificación entra por el MISMO camino que el botón de pantalla (caso (b));
    // "Fase siguiente" ya viaja por `skip`, que emite `skipped` desde el corredor.
    toggle: handleToggle,
    adoptExact: (seconds, running) => {
      if (!running && runner.running) onSegment?.({ reason: 'paused', closesRound: false, prescribedSec: roundPrescribedSec })
      runner.adoptRemaining(seconds, running)
    },
    skipPhase: runner.skip,
  }
  useCardioLiveTimer(liveSpec, liveControls)

  return (
    <View style={{ alignItems: 'center', gap: 12 }}>
      {/* QA5 h3: fila relativa que centra el anillo y ancla el chip "Reiniciar" a un costado. */}
      <View style={{ width: '100%', alignItems: 'center', justifyContent: 'center' }}>
      <ProgressRing
        size={224}
        strokeWidth={22}
        // Fase manual (por distancia): anillo LLENO y estático — no hay cuenta que drenar.
        fill={manual ? 1 : phase && phase.durationSec > 0 ? runner.remaining / phase.durationSec : runner.finished ? 0 : 1}
        color={phaseColor}
        trackColor="#26262f"
        reducedMotion={reducedMotion}
      >
        {/* Flash suave al cambiar de fase (cue visual). reduced-motion ⇒ sin flash. */}
        {!reducedMotion && (
          <MotiView
            key={flash}
            pointerEvents="none"
            from={{ opacity: 0.35 }}
            animate={{ opacity: 0 }}
            transition={{ type: 'timing', duration: 500 }}
            style={{ position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: phaseColor }}
          />
        )}
        <View style={{ alignItems: 'center' }}>
          {runner.finished ? (
            <Text style={{ fontFamily: FONT.displayBlack, fontSize: 22, color: '#4ade80', textAlign: 'center' }}>¡Intervalos{'\n'}completados!</Text>
          ) : (
            <>
              {/* QA5 h1: fase acotada dentro del anillo — sin chocar el trazo (≥10px de aire). */}
              <Text numberOfLines={1} style={{ fontFamily: FONT.displayBlack, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', color: phaseColor, maxWidth: 150, textAlign: 'center' }}>
                {phase ? INTERVAL_PHASE_LABEL[phase.kind] : ''}
              </Text>
              <MotiView
                from={{ scale: 1 }}
                animate={{ scale: reducedMotion ? 1 : 1.02 }}
                transition={{ type: 'timing', duration: 1400, loop: !reducedMotion, repeatReverse: true }}
              >
                {/* Fase por distancia ⇒ el número grande ES el objetivo del tramo ("400 m"). */}
                <Text numberOfLines={1} style={{ fontFamily: FONT.displayBlack, fontSize: manual ? 44 : 56, letterSpacing: -2, lineHeight: manual ? 48 : 58, color: s.text, fontVariant: ['tabular-nums'] }}>
                  {manual ? intervalPhaseTargetLabel(phase) : formatClock(runner.remaining)}
                </Text>
              </MotiView>
              <Text numberOfLines={1} style={{ fontFamily: FONT.uiBold, fontSize: 10, letterSpacing: 1.2, color: s.textMuted, textTransform: 'uppercase', marginTop: 4, maxWidth: 150, textAlign: 'center' }}>
                {manual ? 'Avanza al terminar' : 'Restante en fase'}
              </Text>
            </>
          )}
        </View>
      </ProgressRing>
        {/* Reinicia los intervalos desde la primera fase (mecanismo `restart` del runner). */}
        <RingRestart onPress={handleRestart} />
      </View>

      {nextPhase && !runner.finished ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            alignSelf: 'center',
            paddingHorizontal: 14,
            paddingVertical: 7,
            borderRadius: 999,
            backgroundColor: hexToRgba(nextPhaseColor, 0.12),
            borderWidth: 1.5,
            borderColor: hexToRgba(nextPhaseColor, 0.3),
          }}
        >
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: nextPhaseColor }} />
          <Text style={{ fontFamily: FONT.uiBold, fontSize: 13, color: hexToRgba(nextPhaseColor, 0.9) }}>
            Luego: <Text style={{ color: s.text }}>{INTERVAL_PHASE_LABEL[nextPhase.kind]}</Text>{' '}
            <Text style={{ color: s.text, fontVariant: ['tabular-nums'] }}>
              {isManualPhase(nextPhase) ? intervalPhaseTargetLabel(nextPhase) : formatClock(nextPhase.durationSec)}
            </Text>
          </Text>
        </View>
      ) : null}

      {/* Barra segmentada de intervalos */}
      {totalIntervals > 0 && (
        <View style={{ width: '100%', gap: 7 }}>
          <View style={{ flexDirection: 'row', gap: 5, alignItems: 'center' }}>
            {Array.from({ length: totalIntervals }).map((_, i) => {
              const idx = i + 1
              const filled = idx < currentInterval || runner.finished
              const cur = idx === currentInterval && !runner.finished
              // Segmento actual con halo (3px translucido) como el mockup (D16); el resto sin marco.
              return (
                <View
                  key={i}
                  style={{ flex: 1, padding: cur ? 3 : 0, borderRadius: cur ? 7 : 4, backgroundColor: cur ? hexToRgba(PHASE_COLORS.work, 0.22) : 'transparent' }}
                >
                  <View
                    style={{ height: 10, borderRadius: 4, backgroundColor: filled || cur ? PHASE_COLORS.work : '#26262f', opacity: cur ? 1 : filled ? 0.8 : 1 }}
                  />
                </View>
              )
            })}
          </View>
          <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: s.textMuted, fontVariant: ['tabular-nums'] }}>
            Intervalo <Text style={{ color: PHASE_COLORS.work }}>{Math.min(currentInterval, totalIntervals)} de {totalIntervals}</Text>
          </Text>
        </View>
      )}

      {/* Chips de fase: duraciones derivadas de la prescripción (trabajo ámbar / recupera verde). */}
      {(workPhase || recoveryPhase) && (
        <CardioChipsRow>
          {workPhase ? (
            <MetricChipRN
              icon={isManualPhase(workPhase) ? <Ruler size={16} color={PHASE_COLORS.work} /> : <Zap size={16} color={PHASE_COLORS.work} />}
              value={isManualPhase(workPhase) ? intervalPhaseTargetLabel(workPhase) : formatClock(workPhase.durationSec)}
              label="Trabajo"
              wide={!recoveryPhase}
            />
          ) : null}
          {recoveryPhase ? (
            <MetricChipRN
              icon={isManualPhase(recoveryPhase) ? <Ruler size={16} color={PHASE_COLORS.recovery} /> : <Repeat size={16} color={PHASE_COLORS.recovery} />}
              value={isManualPhase(recoveryPhase) ? intervalPhaseTargetLabel(recoveryPhase) : formatClock(recoveryPhase.durationSec)}
              label="Recupera"
              wide={!workPhase}
            />
          ) : null}
        </CardioChipsRow>
      )}

      {/* Fase D: en una fase por DISTANCIA no hay conteo que pausar — el CTA es el avance explícito
          del alumno ("Fase siguiente"), que además deja corriendo la recuperación por tiempo. */}
      {!runner.finished && (manual ? (
        <View style={{ width: '100%' }}>
          <JuicyButton
            testID="btn-cardio-nextphase-v3"
            label="Fase siguiente"
            icon={<SkipForward size={18} color={exec.accentText} fill={exec.accentText} />}
            onPress={handleNext}
            exec={exec}
            height={56}
            reducedMotion={reducedMotion}
            accessibilityLabel={intervalPhaseTargetLabel(phase) ? `Fase siguiente — terminé los ${intervalPhaseTargetLabel(phase)}` : 'Fase siguiente'}
          />
        </View>
      ) : (
        <PauseButton running={runner.running} started={runner.started} onToggle={handleToggle} exec={exec} reducedMotion={reducedMotion} />
      ))}
    </View>
  )
}

// ─── Hero: cronómetro count-up (distancia como objetivo textual) ─────────────────────────────────
function StopwatchHero({
  distanceObjective,
  zoneColor,
  reducedMotion,
  exec,
  onRunningChange,
  onSegment,
  largeIconUrl,
}: {
  distanceObjective: string | null
  zoneColor: string
  reducedMotion: boolean
  exec: ExecTheme
  /** Avisa al HUD si el cronómetro corre (el aviso háptico de fuera-de-zona jamás suena en pausa). */
  onRunningChange?: (running: boolean) => void
  /**
   * Fin de un TRAMO de cardio (hallazgo E). Un bloque por distancia NUNCA vence solo (no hay 0 al que
   * llegar): acá sólo existe la pausa, que rellena los minutos sin enviar nada.
   */
  onSegment?: (e: CardioSegmentEvent) => void
  /** Logo del coach para el ícono grande de la notificación (unificado con el descanso). */
  largeIconUrl?: string
}) {
  const s = exec.surface
  // QA4 h8a: el cronómetro NO corre solo — el alumno lo arranca con el botón de abajo.
  const stopwatch = useStopwatch(false)
  useEffect(() => {
    onRunningChange?.(stopwatch.running)
  }, [stopwatch.running, onRunningChange])

  /** Pausa (botón de pantalla o de la notificación): vuelca los minutos SIN enviar ni avanzar. */
  const handleToggle = () => {
    if (stopwatch.running) onSegment?.({ reason: 'paused', closesRound: false })
    stopwatch.toggle()
  }

  // ── Espejo en bandeja/lockscreen ──────────────────────────────────────────────────────────────
  // Cronómetro ASCENDENTE: el instante de inicio absoluto es "ahora menos lo transcurrido", así el
  // contador nativo retoma exactamente donde va la pantalla al reanudar. Sin aviso final: un bloque
  // por distancia no tiene instante de término que programar (lo cierra el alumno).
  const liveSpec = useMemo<CardioLiveSpec | null>(() => {
    if (!stopwatch.running && !stopwatch.started) return null
    const paused = !stopwatch.running
    return {
      key: `cardio-stopwatch:${paused ? 'p' : 'r'}`,
      mode: 'stopwatch',
      direction: 'up',
      paused,
      seconds: stopwatch.elapsed,
      title: 'Cardio en curso',
      body: 'Tiempo transcurrido',
      color: zoneColor,
      largeIconUrl,
      endNotifSeconds: null,
    }
  }, [stopwatch.running, stopwatch.started, stopwatch.elapsed, zoneColor, largeIconUrl])
  // `adopt` fija el acumulador de `useStopwatch` en lo TRANSCURRIDO que congeló/re-ancló el handler:
  // pausar y reanudar desde la notificación ya no arrastran el rato detenido como tiempo corrido.
  // Objeto sin memoizar: el hook lo guarda en un ref que refresca en cada render (ver CountdownHero).
  const liveControls: CardioLiveControls = {
    running: stopwatch.running,
    toggle: handleToggle,
    adoptExact: (seconds, running) => {
      if (!running && stopwatch.running) onSegment?.({ reason: 'paused', closesRound: false })
      stopwatch.adopt(seconds, running)
    },
  }
  useCardioLiveTimer(liveSpec, liveControls)

  return (
    <View style={{ alignItems: 'center', gap: 12 }}>
      <ProgressRing size={196} strokeWidth={22} fill={stopwatch.running ? 1 : 0.001} color={zoneColor} trackColor="#26262f" reducedMotion={reducedMotion}>
        <View style={{ alignItems: 'center' }}>
          <MotiView
            from={{ scale: 1 }}
            animate={{ scale: reducedMotion ? 1 : 1.02 }}
            transition={{ type: 'timing', duration: 1400, loop: !reducedMotion, repeatReverse: true }}
          >
            <Text style={{ fontFamily: FONT.displayBlack, fontSize: 54, letterSpacing: -2, lineHeight: 56, color: s.text, fontVariant: ['tabular-nums'] }}>
              {formatClock(stopwatch.elapsed)}
            </Text>
          </MotiView>
          <Text style={{ fontFamily: FONT.uiBold, fontSize: 11, letterSpacing: 2, color: s.textMuted, textTransform: 'uppercase', marginTop: 6 }}>Transcurrido</Text>
        </View>
      </ProgressRing>
      {distanceObjective ? (
        <Text style={{ fontFamily: FONT.uiBold, fontSize: 13, color: hexToRgba(s.text, 0.8) }}>
          Objetivo: <Text style={{ color: s.text }}>{distanceObjective}</Text>
        </Text>
      ) : null}
      <PauseButton running={stopwatch.running} started={stopwatch.started} onToggle={handleToggle} exec={exec} reducedMotion={reducedMotion} />
    </View>
  )
}

// ─── Chip lateral "Reiniciar" del anillo (QA5 h3) — glass 32px anclado a un costado del anillo; reinicia
//     el timer del ejercicio actual a su valor prescrito (mecanismo `restart` — NO toca el guardado). ──
function RingRestart({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      testID="btn-cardio-restart-v3"
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Reiniciar el contador"
      style={{ position: 'absolute', right: 4, top: 0, bottom: 0, justifyContent: 'center' }}
    >
      <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#2f2f3a', backgroundColor: '#1c1c24' }}>
        <RotateCcw size={16} color="#b7b7c2" />
      </View>
    </Pressable>
  )
}

// ─── Grilla de chips de métricas (D1) — look .a3a-cchip. SOLO datos derivables HOY; nada inventado. ──
function CardioChipsRow({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, width: '100%' }}>{children}</View>
}

function MetricChipRN({
  icon,
  value,
  label,
  wide,
}: {
  icon: React.ReactNode
  value: string
  label: string
  wide?: boolean
}) {
  return (
    <View
      style={{
        flexGrow: 1,
        flexBasis: wide ? '100%' : '46%',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        backgroundColor: '#1a1a22',
        borderWidth: 1.5,
        borderColor: '#2a2a34',
        borderRadius: 14,
        paddingHorizontal: 11,
        paddingVertical: 9,
      }}
    >
      <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>{icon}</View>
      <View style={{ minWidth: 0, flexShrink: 1 }}>
        <Text style={{ fontFamily: FONT.displayBlack, fontSize: 15, color: '#eef4f6', fontVariant: ['tabular-nums'] }} numberOfLines={1}>
          {value}
        </Text>
        <Text style={{ fontFamily: FONT.uiBold, fontSize: 9, letterSpacing: 0.7, textTransform: 'uppercase', color: '#7f7f8c', marginTop: 4 }}>
          {label}
        </Text>
      </View>
    </View>
  )
}

/**
 * Botón de arranque/pausa del hero. QA4 h8a: tres estados (nunca arrancó ⇒ "Iniciar"), porque ahora
 * ningún timer auto-arranca y el alumno necesita una affordance clara de partida.
 */
function PauseButton({
  running,
  started = true,
  onToggle,
  exec,
  reducedMotion,
}: {
  running: boolean
  started?: boolean
  onToggle: () => void
  exec: ExecTheme
  reducedMotion: boolean
}) {
  const label = running ? 'Pausar' : started ? 'Reanudar' : 'Iniciar'
  return (
    <View style={{ width: '100%' }}>
      <JuicyButton
        testID="btn-cardio-pause-v3"
        label={label}
        icon={running ? <Pause size={18} color={exec.accentText} fill={exec.accentText} /> : <Play size={18} color={exec.accentText} fill={exec.accentText} />}
        onPress={onToggle}
        exec={exec}
        height={56}
        reducedMotion={reducedMotion}
        accessibilityLabel={running ? 'Pausar el temporizador' : started ? 'Reanudar el temporizador' : 'Iniciar el temporizador'}
      />
    </View>
  )
}
