import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Move, Pause, Play, RotateCcw } from 'lucide-react-native'
import {
  formatTypedObjective,
  type OptimisticLogPayload,
  type ReconciledSessionLog,
} from '@eva/workout-engine'
import { FONT, textStyle } from '../../../../lib/typography'
import { hexToRgba } from '../../../../lib/theme'
import { timerHaptics } from '../../../../lib/haptics'
import type { SessionBlock, SessionDraft, SessionExercise } from '../../../../lib/workout-session'
import { Sheet } from '../../../Sheet'
import { ActiveSetRow, SetRow } from '../SetRow'
import { JuicyButton } from './JuicyButton'
import { ProgressRing } from './ProgressRing'
import { TypedMediaV3, TypedInstructionsChip, hasExecMedia } from './TypedMediaV3'
import { useCountdown } from './timing'
import { formatClock, holdSeedValues, mobilitySides, sideLabel } from './typed-screen-model'
import type { ExecTheme } from './exec-theme'

const MEDIA_HEIGHT = 150

/**
 * Pantalla "Movilidad" del ejecutor V3 (E3.2) — traducción del `.a3b-mob` (concepto-a-v3-tipos): tono
 * CALMO (acento recovery, sombras suaves, sin latidos), media serena arriba, indicador de LADO grande y
 * un anillo de hold sereno. Los bloques `per_side` secuencian ambos lados con el mismo motor de cuenta
 * (`useCountdown`, mirror de `HoldTimer`): al llegar a 0 el lado 1 → háptico suave + transición
 * automática al lado 2 (eyes-free). Al completar la secuencia se prellenan los DOS campos del keypad
 * tipado con lo cronometrado (editable antes de confirmar). El guardado sigue el flujo tipado EXISTENTE
 * (`ActiveSetRow` typed con `sideMode` → `buildTypedPayload` escribe `metadata {left,right}` + suma).
 */
export function MobilityScreenV3({
  block,
  exercise,
  blockLogs,
  restoredDraft,
  reducedMotion = false,
  exec,
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
  onOpenTechnique: () => void
  onOpenSet: (setNumber: number) => void
  onCommitSet: (payload: OptimisticLogPayload) => void
  onDraftChange: (blockId: string, setNumber: number, values: Record<string, string>, fieldIndex: number) => void
  recentSet?: { blockId: string; setNumber: number; pr: boolean } | null
  syncErrors?: Record<string, string>
  onRetrySet?: (blockId: string, setNumber: number) => void
}) {
  const s = exec.surface
  const accent = exec.recovery // tono calmo (aqua en EVA; primario en coach)
  const sideMode = block.side_mode ?? null
  const perSide = sideMode === 'per_side'
  const sides = useMemo(() => mobilitySides(sideMode), [sideMode])
  const holdSec = block.duration_sec ?? 0
  const [noteOpen, setNoteOpen] = useState(false)
  const coachNote = block.notes?.trim() ? block.notes.trim() : null

  const loggedSetNumbers = useMemo(
    () => new Set(blockLogs.filter((l) => l.set_number >= 1 && l.set_number <= block.sets).map((l) => l.set_number)),
    [blockLogs, block.sets],
  )
  let firstUnlogged: number | null = null
  for (let i = 1; i <= block.sets; i += 1) {
    if (!loggedSetNumbers.has(i)) { firstUnlogged = i; break }
  }

  // Secuencia de lados de la serie ACTIVA. `sideIdx` recorre `sides`; `timed` acumula los segundos por
  // lado; `seedNonce` remonta la fila de captura cada vez que hay prefill nuevo. QA4 h8b: la fila de
  // captura y el historial se muestran SIEMPRE (paridad web) — el anillo es la GUÍA, las filas son el
  // registro; ya no hay flag que esconda una cosa detrás de la otra.
  const [sideIdx, setSideIdx] = useState(0)
  const [timed, setTimed] = useState<{ left?: number; right?: number; single?: number }>({})
  const [seedNonce, setSeedNonce] = useState(0)

  // Reinicia la secuencia al cambiar de serie activa.
  useEffect(() => {
    setSideIdx(0)
    setTimed({})
    setSeedNonce((n) => n + 1)
  }, [firstUnlogged, holdSec])

  const currentSide = sides[sideIdx] ?? 'single'

  // Registra el hold del lado actual y avanza (o abre la captura si era el último).
  const finishSide = useCallback(
    (heldSec: number) => {
      timerHaptics.holdDone()
      setTimed((t) => ({
        ...t,
        ...(currentSide === 'left' ? { left: heldSec } : currentSide === 'right' ? { right: heldSec } : { single: heldSec }),
      }))
      // El nonce sube en CADA lado (no solo en el último): lo cronometrado cae en la caja apenas se
      // cierra el lado, igual que el `hpNonce` de la web (`recordSide`).
      setSeedNonce((n) => n + 1)
      if (sideIdx + 1 < sides.length) {
        setSideIdx((i) => i + 1)
        // El lado 2 SÍ auto-arranca (eyes-free, paridad web `autoStart: perSide && side === 'right'`).
        countdown.restart(holdSec)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentSide, sideIdx, sides.length, holdSec],
  )

  // QA4 h8a: el primer lado lo inicia el ALUMNO (paridad web). Nada corre solo al abrir la pantalla.
  const countdown = useCountdown(holdSec, () => finishSide(holdSec), false)

  const seedValues = useMemo(() => holdSeedValues(sideMode, timed), [sideMode, timed])
  const objectiveLine = formatTypedObjective(block, 'mobility')

  // Filas de series ya registradas (chips editables). Movilidad = sin RPE/RIR (no se pasa onRpeUpdate).
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
        typedMode="mobility"
        onPress={() => onOpenSet(setNumber)}
        settle={isRecent}
        pr={isRecent && !!recentSet?.pr}
        syncError={syncErrors?.[`${block.id}:${setNumber}`] ?? null}
        onRetry={() => onRetrySet?.(block.id, setNumber)}
      />
    )
  })

  return (
    <View style={{ gap: 14, alignItems: 'center' }}>
      {/* Nombre + chip Movilidad + "Serie N de M" */}
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Text style={{ fontFamily: FONT.displayBlack, fontSize: 26, letterSpacing: -0.5, lineHeight: 30, color: '#eef4f6', textAlign: 'center' }}>
          {exercise.name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 11, paddingVertical: 5, backgroundColor: hexToRgba(accent, 0.14), borderColor: hexToRgba(accent, 0.32) }}>
            <Move size={13} color={accent} />
            <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: hexToRgba(accent, 0.92) }}>
              Movilidad{exercise.muscle_group ? ` · ${exercise.muscle_group}` : ''}
            </Text>
          </View>
          {firstUnlogged != null && block.sets > 1 && (
            <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: s.textMuted, fontVariant: ['tabular-nums'] }}>
              Serie {firstUnlogged} de {block.sets}
            </Text>
          )}
        </View>
      </View>

      {/* Media serena — chips "Instrucciones" + "Nota del coach" DENTRO de la media (overlay superior-
          izquierdo). Sin pill "Mantén" superpuesta (QA4). */}
      {hasExecMedia(exercise) ? (
        <View style={{ width: '100%', height: MEDIA_HEIGHT, borderRadius: 22, overflow: 'hidden', borderWidth: 2, borderColor: '#2a333a', backgroundColor: s.surfaceRaised }}>
          <TypedMediaV3 exercise={exercise} exec={exec} accent={accent} coachNote={coachNote} IconFallback={Move} onOpenTechnique={onOpenTechnique} onOpenNote={() => setNoteOpen(true)} reducedMotion={reducedMotion} />
        </View>
      ) : (
        <TypedInstructionsChip exercise={exercise} accent={accent} coachNote={coachNote} onOpenTechnique={onOpenTechnique} onOpenNote={() => setNoteOpen(true)} reducedMotion={reducedMotion} />
      )}

      {objectiveLine ? (
        <Text style={{ fontFamily: FONT.monoSemibold, fontSize: 13, color: hexToRgba(s.text, 0.82), textAlign: 'center', fontVariant: ['tabular-nums'] }}>
          {objectiveLine}
        </Text>
      ) : null}

      {/* ── Secuencia de hold (anillo sereno + lado) — GUÍA. Convive con la fila de registro de abajo
             (QA4 h8b, paridad web): el anillo nunca se desmonta por registrar. ── */}
      {firstUnlogged != null && holdSec > 0 && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 999, borderWidth: 2, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: hexToRgba(accent, 0.15), borderColor: hexToRgba(accent, 0.36) }}>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: accent }} />
            <Text style={{ fontFamily: FONT.displayBlack, fontSize: 19, letterSpacing: -0.2, color: hexToRgba(accent, 0.95) }}>
              {sideLabel(currentSide)}
            </Text>
          </View>

          {/* QA5 h3: fila relativa que centra el anillo y ancla el chip "Reiniciar" a un costado. */}
          <View style={{ width: '100%', alignItems: 'center', justifyContent: 'center' }}>
            <ProgressRing
              size={214}
              strokeWidth={23}
              fill={countdown.remaining / (holdSec || 1)}
              color={accent}
              trackColor="#262c31"
              reducedMotion={reducedMotion}
            >
              <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                {/* Sólo el número en el centro (QA4 · decisión CEO): "Sostén" se removió; el estado (lado) va
                    en la pastilla de arriba y el texto guía "luego: …" de abajo. */}
                <Text style={{ fontFamily: FONT.displayBlack, fontSize: 60, letterSpacing: -2, lineHeight: 62, color: '#eef4f6', fontVariant: ['tabular-nums'] }}>
                  {formatClock(countdown.remaining)}
                </Text>
              </View>
            </ProgressRing>
            {/* Reinicia el hold del lado actual a su valor prescrito (mecanismo `restart` del hook). */}
            <Pressable
              testID="btn-mobility-restart-v3"
              onPress={() => countdown.restart(holdSec)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Reiniciar el contador"
              style={{ position: 'absolute', right: 4, top: 0, bottom: 0, justifyContent: 'center' }}
            >
              <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#2f2f3a', backgroundColor: '#1c1c24' }}>
                <RotateCcw size={16} color="#b7b7c2" />
              </View>
            </Pressable>
          </View>

          {perSide && sideIdx + 1 < sides.length ? (
            <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: '#6f7c82' }}>
              luego: <Text style={{ color: '#9fb2b9' }}>{sideLabel(sides[sideIdx + 1])}</Text>
            </Text>
          ) : null}

          {/* CTAs APILADOS (nunca dos w-full en fila): control del contador arriba, cierre del lado
              abajo. Sólo UNO es juicy a la vez — antes de arrancar manda "Iniciar hold"; con el hold
              corriendo manda "Listo este lado" y el control pasa a secundario. */}
          <View style={{ width: '100%', gap: 8 }}>
            {countdown.running || countdown.started ? (
              <Pressable
                testID="btn-mobility-play-v3"
                onPress={countdown.toggle}
                style={{ width: '100%', height: 52, borderRadius: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderWidth: 2, borderColor: '#2f2f3a', backgroundColor: '#1c1c24' }}
                accessibilityRole="button"
                accessibilityLabel={countdown.running ? 'Pausar el hold' : 'Reanudar el hold'}
              >
                {countdown.running ? <Pause size={17} color="#e8e8ee" fill="#e8e8ee" /> : <Play size={17} color="#e8e8ee" fill="#e8e8ee" />}
                <Text style={{ fontFamily: FONT.uiExtra, fontSize: 16, letterSpacing: 0.3, color: '#e8e8ee' }}>
                  {countdown.running ? 'Pausar' : 'Reanudar'}
                </Text>
              </Pressable>
            ) : (
              <JuicyButton
                testID="btn-mobility-play-v3"
                label="Iniciar hold"
                icon={<Play size={18} color="#08222b" fill="#08222b" />}
                onPress={countdown.toggle}
                exec={{ ...exec, accent, accentText: '#08222b' }}
                height={52}
                reducedMotion={reducedMotion}
                accessibilityLabel="Iniciar el hold"
              />
            )}
            {countdown.running || countdown.started ? (
              <JuicyButton
                testID="btn-mobility-side-done-v3"
                label={perSide && sideIdx + 1 < sides.length ? 'Listo este lado' : 'Listo'}
                onPress={() => finishSide(Math.max(0, holdSec - countdown.remaining) || holdSec)}
                exec={{ ...exec, accent, accentText: '#08222b' }}
                height={58}
                reducedMotion={reducedMotion}
                accessibilityLabel={perSide && sideIdx + 1 < sides.length ? 'Terminé este lado, pasar al otro' : 'Terminé el hold'}
              />
            ) : (
              <Pressable
                testID="btn-mobility-side-done-v3"
                onPress={() => finishSide(Math.max(0, holdSec - countdown.remaining) || holdSec)}
                style={{ width: '100%', height: 52, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#2f2f3a', backgroundColor: '#1c1c24' }}
                accessibilityRole="button"
                accessibilityLabel={perSide && sideIdx + 1 < sides.length ? 'Terminé este lado, pasar al otro' : 'Terminé el hold'}
              >
                <Text style={{ fontFamily: FONT.uiExtra, fontSize: 16, letterSpacing: 0.3, color: '#e8e8ee' }}>
                  {perSide && sideIdx + 1 < sides.length ? 'Listo este lado' : 'Listo'}
                </Text>
              </Pressable>
            )}
          </View>
        </>
      )}

      {/* ── Captura tipada — SIEMPRE visible mientras haya serie activa (prefill de lo cronometrado,
             editable). Con hold prescrito convive con el anillo de arriba. ── */}
      {firstUnlogged != null && (
        <View style={{ width: '100%', gap: 10 }}>
          <Text style={{ fontFamily: FONT.uiBold, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: s.textMuted }}>
            {perSide ? 'Hold por lado (segundos)' : 'Hold registrado (segundos)'}
          </Text>
          <ActiveSetRow
            key={`${block.id}-${firstUnlogged}-${seedNonce}`}
            blockId={block.id}
            setNumber={firstUnlogged}
            typedMode="mobility"
            sideMode={sideMode}
            suggestedWeight={null}
            seedValues={
              Object.keys(seedValues).length > 0
                ? seedValues
                : restoredDraft && restoredDraft.blockId === block.id && restoredDraft.setNumber === firstUnlogged
                  ? restoredDraft.values
                  : null
            }
            header={{ exerciseName: exercise.name, objectiveLine }}
            onDraftChange={(values, fieldIndex) => onDraftChange(block.id, firstUnlogged as number, values, fieldIndex)}
            onCommit={onCommitSet}
          />
        </View>
      )}

      {/* Historial de series ya registradas — SIEMPRE (antes vivía escondido tras el flag). */}
      {loggedRows.some(Boolean) && <View style={{ width: '100%', gap: 6 }}>{loggedRows}</View>}

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
