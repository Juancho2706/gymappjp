import { useCallback, useEffect, useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Move } from 'lucide-react-native'
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
import { TypedMediaV3 } from './TypedMediaV3'
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
  // lado; `ready` = secuencia terminada → aparece la fila de captura seedada. Sin hold prescrito
  // (holdSec<=0) o sin serie activa se salta directo a `ready` (captura manual).
  const [sideIdx, setSideIdx] = useState(0)
  const [timed, setTimed] = useState<{ left?: number; right?: number; single?: number }>({})
  const [ready, setReady] = useState(holdSec <= 0)
  const [seedNonce, setSeedNonce] = useState(0)

  // Reinicia la secuencia al cambiar de serie activa.
  useEffect(() => {
    setSideIdx(0)
    setTimed({})
    setReady(holdSec <= 0)
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
      if (sideIdx + 1 < sides.length) {
        setSideIdx((i) => i + 1)
        countdown.restart(holdSec)
      } else {
        setReady(true)
        setSeedNonce((n) => n + 1)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentSide, sideIdx, sides.length, holdSec],
  )

  const countdown = useCountdown(holdSec, () => finishSide(holdSec), holdSec > 0)

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
      <View style={{ width: '100%', height: MEDIA_HEIGHT, borderRadius: 22, overflow: 'hidden', borderWidth: 2, borderColor: '#2a333a', backgroundColor: s.surfaceRaised }}>
        <TypedMediaV3 exercise={exercise} exec={exec} accent={accent} coachNote={coachNote} IconFallback={Move} onOpenTechnique={onOpenTechnique} onOpenNote={() => setNoteOpen(true)} reducedMotion={reducedMotion} />
      </View>

      {objectiveLine ? (
        <Text style={{ fontFamily: FONT.monoSemibold, fontSize: 13, color: hexToRgba(s.text, 0.82), textAlign: 'center', fontVariant: ['tabular-nums'] }}>
          {objectiveLine}
        </Text>
      ) : null}

      {firstUnlogged == null ? (
        // Todas las series completas: solo los chips (editables).
        <View style={{ width: '100%', gap: 6 }}>{loggedRows}</View>
      ) : !ready && holdSec > 0 ? (
        // ── Secuencia de hold (anillo sereno + lado) ──
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 999, borderWidth: 2, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: hexToRgba(accent, 0.15), borderColor: hexToRgba(accent, 0.36) }}>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: accent }} />
            <Text style={{ fontFamily: FONT.displayBlack, fontSize: 19, letterSpacing: -0.2, color: hexToRgba(accent, 0.95) }}>
              {sideLabel(currentSide)}
            </Text>
          </View>

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

          {perSide && sideIdx + 1 < sides.length ? (
            <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: '#6f7c82' }}>
              luego: <Text style={{ color: '#9fb2b9' }}>{sideLabel(sides[sideIdx + 1])}</Text>
            </Text>
          ) : null}

          <View style={{ width: '100%', gap: 8 }}>
            <JuicyButton
              testID="btn-mobility-side-done-v3"
              label={perSide && sideIdx + 1 < sides.length ? 'Listo este lado' : 'Listo'}
              onPress={() => finishSide(Math.max(0, holdSec - countdown.remaining) || holdSec)}
              exec={{ ...exec, accent, accentText: '#08222b' }}
              height={58}
              reducedMotion={reducedMotion}
              accessibilityLabel={perSide && sideIdx + 1 < sides.length ? 'Terminé este lado, pasar al otro' : 'Terminé el hold'}
            />
            <Pressable
              testID="btn-mobility-manual-v3"
              onPress={() => { setReady(true); setSeedNonce((n) => n + 1) }}
              hitSlop={8}
              style={{ alignSelf: 'center', minHeight: 36, justifyContent: 'center' }}
              accessibilityRole="button"
              accessibilityLabel="Registrar el hold a mano"
            >
              <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 12, color: s.textMuted }}>Registrar a mano</Text>
            </Pressable>
          </View>
        </>
      ) : (
        // ── Captura tipada (prefill de lo cronometrado, editable) ──
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
          {loggedRows.some(Boolean) && <View style={{ gap: 6 }}>{loggedRows}</View>}
        </View>
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
