import { useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, Text, TouchableOpacity, View } from 'react-native'
import { MotiView } from 'moti'
import { HeartPulse, Pause, Play, Repeat, Ruler, Timer, Watch, Zap } from 'lucide-react-native'
import {
  INTERVAL_PHASE_LABEL,
  buildIntervalPhases,
  computeCardioProgress,
  formatTypedObjective,
  type IntervalConfig,
  type OptimisticLogPayload,
  type ReconciledSessionLog,
} from '@eva/workout-engine'
import { hrToZone, type HrToZoneProfile } from '@eva/cardio'
import { FONT, textStyle } from '../../../../lib/typography'
import { hexToRgba } from '../../../../lib/theme'
import { timerHaptics } from '../../../../lib/haptics'
import { isBleAvailable, useBleHr } from '../../../../lib/ble-hr'
import { Sheet } from '../../../Sheet'
import { ConnectSensorSheet } from './ConnectSensorSheet'
import type { SessionBlock, SessionDraft, SessionExercise } from '../../../../lib/workout-session'
import { ActiveSetRow, SetRow } from '../SetRow'
import { JuicyButton } from './JuicyButton'
import { ProgressRing } from './ProgressRing'
import { TypedMediaV3 } from './TypedMediaV3'
import { useCountdown, useIntervalRunner, useStopwatch } from './timing'
import {
  PHASE_COLORS,
  cardioDetailLabel,
  cardioDistanceObjective,
  cardioObjective,
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
 */
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
  onOpenTechnique,
  onOpenSet,
  onCommitSet,
  onRpeUpdate,
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

  // Semilla del keypad tipado: draft restaurado + (si aplica) el promedio del sensor en `actual_avg_hr`.
  // Solo se inyecta la FC del sensor si el campo aún está vacío — JAMÁS pisa lo que el alumno escribió.
  const captureSeed = useMemo(() => {
    const base =
      restoredDraft && restoredDraft.blockId === block.id && restoredDraft.setNumber === firstUnlogged
        ? restoredDraft.values
        : null
    if (seededAvg == null) return base
    if (base?.actual_avg_hr && base.actual_avg_hr.trim() !== '') return base
    return { ...(base ?? {}), actual_avg_hr: String(seededAvg) }
  }, [restoredDraft, block.id, firstUnlogged, seededAvg])

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
        onPress={() => onOpenSet(setNumber)}
        onRpeUpdate={onRpeUpdate}
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
        <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 11, paddingVertical: 5, backgroundColor: hexToRgba(chipColor, 0.14), borderColor: hexToRgba(chipColor, 0.32) }}>
          <HeartPulse size={13} color={chipColor} />
          <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: hexToRgba(chipColor, 0.95) }} numberOfLines={1}>
            Cardio · {cardioDetailLabel(block)}
          </Text>
        </View>
      </View>

      {/* Media del catálogo — mismo tratamiento que fuerza (precedencia + chip "Instrucciones" + audio en video). */}
      <View style={{ width: '100%', height: 150, borderRadius: 22, overflow: 'hidden', borderWidth: 2, borderColor: s.borderStrong, backgroundColor: s.surfaceRaised }}>
        <TypedMediaV3 exercise={exercise} exec={exec} accent={chipColor} IconFallback={HeartPulse} onOpenTechnique={onOpenTechnique} reducedMotion={reducedMotion} />
      </View>

      {/* Nota del coach (todos los tipos) — pill de acento bajo la identidad + sheet interna. */}
      {coachNote && (
        <Pressable
          testID="btn-cardio-note-v3"
          onPress={() => setNoteOpen(true)}
          hitSlop={6}
          style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1.5, borderColor: hexToRgba(exec.accent, 0.3), backgroundColor: hexToRgba(exec.accent, 0.1) }}
          accessibilityRole="button"
          accessibilityLabel="Ver la nota del coach"
        >
          <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: exec.accent }}>Nota del coach</Text>
        </Pressable>
      )}

      {/* HERO por modo */}
      {mode === 'interval' ? (
        <IntervalHero block={block} zoneColor={zoneColor} reducedMotion={reducedMotion} exec={exec} />
      ) : mode === 'countdown' ? (
        <CountdownHero
          durationSec={block.duration_sec as number}
          block={block}
          zoneColor={zoneColor}
          reducedMotion={reducedMotion}
          exec={exec}
        />
      ) : (
        <StopwatchHero distanceObjective={distanceObjective} zoneColor={zoneColor} reducedMotion={reducedMotion} exec={exec} />
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
        <View style={{ alignItems: 'center' }}>
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
        </View>
      )}

      {objectiveLine ? (
        <Text style={{ fontFamily: FONT.monoSemibold, fontSize: 13, color: hexToRgba(s.text, 0.82), textAlign: 'center', fontVariant: ['tabular-nums'] }}>
          {objectiveLine}
        </Text>
      ) : null}

      {/* Captura post-esfuerzo (min/metros/FC manual) */}
      {firstUnlogged != null && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontFamily: FONT.uiBold, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: s.textMuted }}>
            Registra tu esfuerzo{block.sets > 1 ? ` · serie ${firstUnlogged} de ${block.sets}` : ''}
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
            key={`${block.id}-${firstUnlogged}-${seededAvg != null ? 'hr' : 'x'}`}
            blockId={block.id}
            setNumber={firstUnlogged}
            typedMode="cardio"
            suggestedWeight={null}
            seedValues={captureSeed}
            header={{ exerciseName: exercise.name, objectiveLine }}
            onDraftChange={(values, fieldIndex) => onDraftChange(block.id, firstUnlogged as number, values, fieldIndex)}
            onCommit={onCommitSet}
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
        <Sheet open={noteOpen} onClose={() => setNoteOpen(false)} title="Nota del coach" nativeModal snapPoints={['35%']}>
          <View style={{ paddingVertical: 8 }}>
            <Text style={textStyle('md', FONT.ui, { lh: 'relaxed' })} className="text-body">{coachNote}</Text>
          </View>
        </Sheet>
      )}
    </View>
  )
}

// ─── Hero: countdown (duración) — anillo en color de zona que DRENA ──────────────────────────────
function CountdownHero({
  durationSec,
  block,
  zoneColor,
  reducedMotion,
  exec,
}: {
  durationSec: number
  block: SessionBlock
  zoneColor: string
  reducedMotion: boolean
  exec: ExecTheme
}) {
  const s = exec.surface
  const countdown = useCountdown(durationSec, () => timerHaptics.holdDone(), true)
  const progress = computeCardioProgress(cardioObjective(block), { elapsed_sec: durationSec - countdown.remaining })
  const fill = progress ? 1 - progress.pct : countdown.remaining / (durationSec || 1)

  const distObj = cardioDistanceObjective(block)

  return (
    <View style={{ alignItems: 'center', gap: 12 }}>
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
      <PauseButton running={countdown.running} onToggle={countdown.toggle} exec={exec} reducedMotion={reducedMotion} />
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
}: {
  block: SessionBlock
  zoneColor: string
  reducedMotion: boolean
  exec: ExecTheme
}) {
  const s = exec.surface
  const phases = useMemo(
    () => buildIntervalPhases((block.interval_config ?? {}) as IntervalConfig, block.sets || 1),
    [block.interval_config, block.sets],
  )
  const [flash, setFlash] = useState(0)
  const runner = useIntervalRunner(phases, {
    onPhaseChange: () => { setFlash((f) => f + 1); timerHaptics.intervalPhase() },
    onFinish: () => { setFlash((f) => f + 1); timerHaptics.intervalFinish() },
  })

  const phase = runner.phase
  const phaseColor = phase ? PHASE_COLORS[phase.kind] : zoneColor
  const totalIntervals = phases.filter((p) => p.kind === 'work').length
  const currentInterval = phase?.repeat ?? (runner.finished ? totalIntervals : 1)
  const nextPhase = phases[runner.phaseIndex + 1] ?? null
  const nextPhaseColor = nextPhase ? PHASE_COLORS[nextPhase.kind] : zoneColor
  // Duraciones de fase derivadas de la prescripción (chips honestos: trabajo / recupera) — D1.
  const workPhase = phases.find((p) => p.kind === 'work') ?? null
  const recoveryPhase = phases.find((p) => p.kind === 'recovery') ?? null

  return (
    <View style={{ alignItems: 'center', gap: 12 }}>
      <ProgressRing
        size={224}
        strokeWidth={22}
        fill={phase && phase.durationSec > 0 ? runner.remaining / phase.durationSec : runner.finished ? 0 : 1}
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
              <Text style={{ fontFamily: FONT.displayBlack, fontSize: 15, letterSpacing: 3, textTransform: 'uppercase', color: phaseColor }}>
                {phase ? INTERVAL_PHASE_LABEL[phase.kind] : ''}
              </Text>
              <MotiView
                from={{ scale: 1 }}
                animate={{ scale: reducedMotion ? 1 : 1.02 }}
                transition={{ type: 'timing', duration: 1400, loop: !reducedMotion, repeatReverse: true }}
              >
                <Text style={{ fontFamily: FONT.displayBlack, fontSize: 56, letterSpacing: -2, lineHeight: 58, color: s.text, fontVariant: ['tabular-nums'] }}>
                  {formatClock(runner.remaining)}
                </Text>
              </MotiView>
              <Text style={{ fontFamily: FONT.uiBold, fontSize: 10, letterSpacing: 1.5, color: s.textMuted, textTransform: 'uppercase', marginTop: 4 }}>Restante en fase</Text>
            </>
          )}
        </View>
      </ProgressRing>

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
            <Text style={{ color: s.text, fontVariant: ['tabular-nums'] }}>{formatClock(nextPhase.durationSec)}</Text>
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
            <MetricChipRN icon={<Zap size={16} color={PHASE_COLORS.work} />} value={formatClock(workPhase.durationSec)} label="Trabajo" wide={!recoveryPhase} />
          ) : null}
          {recoveryPhase ? (
            <MetricChipRN icon={<Repeat size={16} color={PHASE_COLORS.recovery} />} value={formatClock(recoveryPhase.durationSec)} label="Recupera" wide={!workPhase} />
          ) : null}
        </CardioChipsRow>
      )}

      {!runner.finished && <PauseButton running={runner.running} onToggle={runner.toggle} exec={exec} reducedMotion={reducedMotion} />}
    </View>
  )
}

// ─── Hero: cronómetro count-up (distancia como objetivo textual) ─────────────────────────────────
function StopwatchHero({
  distanceObjective,
  zoneColor,
  reducedMotion,
  exec,
}: {
  distanceObjective: string | null
  zoneColor: string
  reducedMotion: boolean
  exec: ExecTheme
}) {
  const s = exec.surface
  const stopwatch = useStopwatch(true)
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
      <PauseButton running={stopwatch.running} onToggle={stopwatch.toggle} exec={exec} reducedMotion={reducedMotion} />
    </View>
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
        <Text style={{ fontFamily: FONT.uiBold, fontSize: 9, letterSpacing: 0.7, textTransform: 'uppercase', color: '#7f7f8c', marginTop: 2 }}>
          {label}
        </Text>
      </View>
    </View>
  )
}

function PauseButton({
  running,
  onToggle,
  exec,
  reducedMotion,
}: {
  running: boolean
  onToggle: () => void
  exec: ExecTheme
  reducedMotion: boolean
}) {
  return (
    <View style={{ width: '100%' }}>
      <JuicyButton
        testID="btn-cardio-pause-v3"
        label={running ? 'Pausar' : 'Reanudar'}
        icon={running ? <Pause size={18} color={exec.accentText} fill={exec.accentText} /> : <Play size={18} color={exec.accentText} fill={exec.accentText} />}
        onPress={onToggle}
        exec={exec}
        height={56}
        reducedMotion={reducedMotion}
        accessibilityLabel={running ? 'Pausar el temporizador' : 'Reanudar el temporizador'}
      />
    </View>
  )
}
