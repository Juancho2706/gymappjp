import { useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import { MotiView } from 'moti'
import { HeartPulse, Pause, Play, Watch } from 'lucide-react-native'
import {
  INTERVAL_PHASE_LABEL,
  buildIntervalPhases,
  computeCardioProgress,
  formatTypedObjective,
  type IntervalConfig,
  type OptimisticLogPayload,
  type ReconciledSessionLog,
} from '@eva/workout-engine'
import { FONT } from '../../../../lib/typography'
import { hexToRgba } from '../../../../lib/theme'
import { timerHaptics } from '../../../../lib/haptics'
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
export function CardioScreenV3({
  block,
  exercise,
  blockLogs,
  restoredDraft,
  reducedMotion = false,
  exec,
  hrZones,
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
  const zoneColor = zoneRingColor(block.hr_zone, exec.accent)
  const bpmRange = zoneBpmRange(block.hr_zone, hrZones)
  const objectiveLine = formatTypedObjective(block, 'cardio')
  const distanceObjective = cardioDistanceObjective(block)

  const loggedSetNumbers = useMemo(
    () => new Set(blockLogs.filter((l) => l.set_number >= 1 && l.set_number <= block.sets).map((l) => l.set_number)),
    [blockLogs, block.sets],
  )
  let firstUnlogged: number | null = null
  for (let i = 1; i <= block.sets; i += 1) {
    if (!loggedSetNumbers.has(i)) { firstUnlogged = i; break }
  }

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
      {/* IDENTIDAD: nombre + chip + mini-media */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, minWidth: 0, gap: 8, paddingTop: 2 }}>
          <Text style={{ fontFamily: FONT.displayBlack, fontSize: 26, letterSpacing: -0.5, lineHeight: 28, color: s.text }} numberOfLines={2}>
            {exercise.name}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 11, paddingVertical: 5, backgroundColor: hexToRgba('#FF6A3D', 0.14), borderColor: hexToRgba('#FF6A3D', 0.32) }}>
            <HeartPulse size={13} color="#FF6A3D" />
            <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: hexToRgba('#FF6A3D', 0.95) }} numberOfLines={1}>
              Cardio · {cardioDetailLabel(block)}
            </Text>
          </View>
        </View>
        <View style={{ width: 84, height: 84, borderRadius: 18, overflow: 'hidden', borderWidth: 2, borderColor: s.borderStrong, backgroundColor: s.surfaceRaised }}>
          <TypedMediaV3 exercise={exercise} exec={exec} accent="#FF6A3D" IconFallback={HeartPulse} onOpenTechnique={onOpenTechnique} />
        </View>
      </View>

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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: 999, borderWidth: 2, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: hexToRgba(zoneColor, 0.16), borderColor: hexToRgba(zoneColor, 0.4) }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: zoneColor }} />
            <Text style={{ fontFamily: FONT.displayBlack, fontSize: 16, color: zoneColor }}>Z{block.hr_zone}</Text>
            {bpmRange && (
              <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 13, color: hexToRgba(s.text, 0.75), fontVariant: ['tabular-nums'] }}>
                {bpmRange.minBpm}–{bpmRange.maxBpm} bpm
              </Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Watch size={12} color={s.textDim} />
            <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 11, color: s.textDim }}>Compara con tu reloj o pulsómetro</Text>
          </View>
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
          <ActiveSetRow
            key={`${block.id}-${firstUnlogged}`}
            blockId={block.id}
            setNumber={firstUnlogged}
            typedMode="cardio"
            suggestedWeight={null}
            seedValues={
              restoredDraft && restoredDraft.blockId === block.id && restoredDraft.setNumber === firstUnlogged
                ? restoredDraft.values
                : null
            }
            header={{ exerciseName: exercise.name, objectiveLine }}
            onDraftChange={(values, fieldIndex) => onDraftChange(block.id, firstUnlogged as number, values, fieldIndex)}
            onCommit={onCommitSet}
          />
        </View>
      )}

      {loggedRows.some(Boolean) && <View style={{ gap: 6 }}>{loggedRows}</View>}
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

  return (
    <View style={{ alignItems: 'center', gap: 12 }}>
      <ProgressRing size={196} strokeWidth={13} fill={fill} color={zoneColor} trackColor="#26262f" reducedMotion={reducedMotion}>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontFamily: FONT.displayBlack, fontSize: 52, letterSpacing: -2, lineHeight: 54, color: s.text, fontVariant: ['tabular-nums'] }}>
            {formatClock(countdown.remaining)}
          </Text>
          <Text style={{ fontFamily: FONT.uiBold, fontSize: 11, letterSpacing: 2, color: s.textMuted, textTransform: 'uppercase', marginTop: 6 }}>Restante</Text>
        </View>
      </ProgressRing>
      <PauseButton running={countdown.running} onToggle={countdown.toggle} exec={exec} reducedMotion={reducedMotion} />
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

  return (
    <View style={{ alignItems: 'center', gap: 12 }}>
      <ProgressRing
        size={224}
        strokeWidth={15}
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
              <Text style={{ fontFamily: FONT.displayBlack, fontSize: 56, letterSpacing: -2, lineHeight: 58, color: s.text, fontVariant: ['tabular-nums'] }}>
                {formatClock(runner.remaining)}
              </Text>
              <Text style={{ fontFamily: FONT.uiBold, fontSize: 10, letterSpacing: 1.5, color: s.textMuted, textTransform: 'uppercase', marginTop: 4 }}>Restante en fase</Text>
            </>
          )}
        </View>
      </ProgressRing>

      {nextPhase && !runner.finished ? (
        <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: s.textDim }}>
          Luego: <Text style={{ color: s.textMuted }}>{INTERVAL_PHASE_LABEL[nextPhase.kind]}</Text>{' '}
          <Text style={{ color: s.textMuted, fontVariant: ['tabular-nums'] }}>{formatClock(nextPhase.durationSec)}</Text>
        </Text>
      ) : null}

      {/* Barra segmentada de intervalos */}
      {totalIntervals > 0 && (
        <View style={{ width: '100%', gap: 7 }}>
          <View style={{ flexDirection: 'row', gap: 5 }}>
            {Array.from({ length: totalIntervals }).map((_, i) => {
              const idx = i + 1
              const filled = idx < currentInterval || runner.finished
              const cur = idx === currentInterval && !runner.finished
              return (
                <View
                  key={i}
                  style={{ flex: 1, height: 10, borderRadius: 4, backgroundColor: filled || cur ? PHASE_COLORS.work : '#26262f', opacity: cur ? 1 : filled ? 0.8 : 1 }}
                />
              )
            })}
          </View>
          <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: s.textMuted, fontVariant: ['tabular-nums'] }}>
            Intervalo <Text style={{ color: PHASE_COLORS.work }}>{Math.min(currentInterval, totalIntervals)} de {totalIntervals}</Text>
          </Text>
        </View>
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
      <ProgressRing size={196} strokeWidth={13} fill={stopwatch.running ? 1 : 0.001} color={zoneColor} trackColor="#26262f" reducedMotion={reducedMotion}>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontFamily: FONT.displayBlack, fontSize: 52, letterSpacing: -2, lineHeight: 54, color: s.text, fontVariant: ['tabular-nums'] }}>
            {formatClock(stopwatch.elapsed)}
          </Text>
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
