import { useEffect, useMemo, useRef, useState } from 'react'
import { Text, View } from 'react-native'
import { Move } from 'lucide-react-native'
import {
  formatTypedObjective,
  type OptimisticLogPayload,
  type ReconciledSessionLog,
} from '@eva/workout-engine'
import { FONT, textStyle } from '../../../../lib/typography'
import { hexToRgba } from '../../../../lib/theme'
import type { SessionBlock, SessionDraft, SessionExercise } from '../../../../lib/workout-session'
import { parseRestTime, useWorkoutTimers } from '../timers'
import { Sheet } from '../../../Sheet'
import { ActiveSetRow, SetRow } from '../SetRow'
import { ExerciseActionChips } from './exercise-actions'
import { HoldModuleV3 } from './HoldModuleV3'
import { RestOfferV3 } from './RestOfferV3'
import { TypedMediaV3, TypedInstructionsChip, hasExecMedia } from './TypedMediaV3'
import type { HoldModuleStatus } from './use-hold-module'
import type { ExecTheme } from './exec-theme'

const MEDIA_HEIGHT = 150

/**
 * Pantalla "Movilidad" del ejecutor V3 (E3.2) — tono CALMO (acento recovery, sombras suaves, sin
 * latidos), media serena arriba, indicador de LADO grande y un anillo de hold sereno.
 *
 * Tren «cuenta atrás en pantalla» (W3.14): el anillo es ahora el `HoldModuleV3` (214 px, V1) y a 0 la
 * serie **se guarda sola** (V2) — el payload lo arma el motor con `metadata.hold_source = 'timer'`.
 * La fila de captura tipada sigue SIEMPRE visible (QA4 h8b): corriendo se DESHABILITA, no se oculta
 * (R8); «Listo» antes de 0 guarda lo transcurrido con `'manual'` (A2/R22) y «Listo» desde idle sólo
 * siembra el objetivo (CA-90). Tras guardar, con la preferencia «Pasar solo al descanso» APAGADA nada
 * arranca solo (V3): aparece «Descansar N s» / «Siguiente serie» (R24); con la preferencia ENCENDIDA
 * el orquestador arranca el descanso como siempre. Los bloques `per_side` recorren izquierdo →
 * derecho dentro del módulo (lado 2 armado con `prime`, arranca solo sólo en foreground, R6/R27).
 */
export function MobilityScreenV3({
  block,
  exercise,
  blockLogs,
  restoredDraft,
  reducedMotion = false,
  exec,
  autoRestEnabled = true,
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
  /**
   * Preferencia «Pasar solo al descanso» (D5). ON ⇒ el orquestador arranca el descanso al guardar y
   * esta pantalla no pinta nada; OFF ⇒ tras guardar se ofrece «Descansar N s» / «Siguiente serie».
   */
  autoRestEnabled?: boolean
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
  onDraftChange: (blockId: string, setNumber: number, values: Record<string, string>, fieldIndex: number) => void
  recentSet?: { blockId: string; setNumber: number; pr: boolean } | null
  syncErrors?: Record<string, string>
  onRetrySet?: (blockId: string, setNumber: number) => void
}) {
  const s = exec.surface
  const accent = exec.recovery // tono calmo (aqua en EVA; primario en coach)
  const sideMode = block.side_mode ?? null
  const perSide = sideMode === 'per_side'
  const holdSec = block.duration_sec ?? 0
  const restSec = parseRestTime(block.rest_time)
  const timers = useWorkoutTimers()
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
  // Bloque OMITIDO ⇒ no hay serie activa: se retiran el anillo de hold y la fila de captura. El
  // historial de lo YA registrado antes de omitir se conserva.
  const activeSet = skipped ? null : firstUnlogged

  // ── Puente módulo ↔ fila de captura ─────────────────────────────────────────────────────────────
  // `seedPatch`: lo cronometrado cae en la caja del lado apenas se cierra (por nonce, sin remontar la
  // fila). `captureRef`: lo que el alumno tiene tipeado AHORA, base de la mezcla del auto-envío.
  // `restOffer`: tras guardar con la preferencia OFF, el par «Descansar N s» / «Siguiente serie».
  const [seedPatch, setSeedPatch] = useState<{ values: Record<string, string>; nonce: number } | null>(null)
  const [holdStatus, setHoldStatus] = useState<HoldModuleStatus>('idle')
  const [restOffer, setRestOffer] = useState<{ setNumber: number; seconds: number } | null>(null)
  const captureRef = useRef<Record<string, string>>({})
  useEffect(() => {
    captureRef.current = {}
    setSeedPatch(null)
  }, [activeSet, holdSec])

  // Un solo camino de commit para el reloj y para la fila: el orquestador guarda (y con la
  // preferencia ON arranca el descanso); con la preferencia OFF esta pantalla ofrece el par R24.
  const commitSet = (payload: OptimisticLogPayload) => {
    onCommitSet(payload)
    if (!autoRestEnabled) setRestOffer({ setNumber: payload.setNumber, seconds: restSec })
  }
  const startOfferedRest = () => {
    if (!restOffer) return
    // El MISMO `startRest` que arma el orquestador con la preferencia ON (contexto «Serie N de M»).
    timers.startRest(restOffer.seconds, {
      autoStart: true,
      label: exercise.name,
      setIndex: restOffer.setNumber,
      setTotal: block.sets,
      countKind: 'serie',
    })
    setRestOffer(null)
  }

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

  const running = holdStatus === 'running'

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
          {activeSet != null && block.sets > 1 && (
            <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: s.textMuted, fontVariant: ['tabular-nums'] }}>
              Serie {activeSet} de {block.sets}
            </Text>
          )}
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

      {/* Media serena — chips "Instrucciones" + "Nota del coach" DENTRO de la media (overlay superior-
          izquierdo). Sin pill "Mantén" superpuesta (QA4). El video NUNCA se colapsa (V1). */}
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

      {/* ── Módulo de hold (anillo 214 + lado + CTAs) — GUÍA que ahora guarda sola a 0. Predicado R29:
             sólo con `duration_sec > 0`; sin duración la fila manual de siempre queda tal cual. ── */}
      {activeSet != null && holdSec > 0 && (
        <HoldModuleV3
          kind="mobility"
          size="solo214"
          blockId={block.id}
          setNumber={activeSet}
          prescribedSec={holdSec}
          sideMode={sideMode}
          context="solo"
          closesRound={false}
          resetKey={`${block.id}:${activeSet}:1`}
          exec={exec}
          accent={accent}
          accentText="#08222b"
          reducedMotion={reducedMotion}
          getCaptureValues={() => captureRef.current}
          onSeed={(values, nonce) => setSeedPatch({ values, nonce })}
          onCommit={(payload) => commitSet(payload)}
          onStatusChange={setHoldStatus}
          testIDPrefix="hold-mobility"
        />
      )}

      {/* R24: con la preferencia APAGADA, tras guardar el alumno elige descansar o seguir. */}
      {restOffer && !autoRestEnabled ? (
        <RestOfferV3
          seconds={restOffer.seconds}
          exec={{ ...exec, accent, accentText: '#08222b' }}
          reducedMotion={reducedMotion}
          onRest={startOfferedRest}
          onNext={() => setRestOffer(null)}
          testIDPrefix="rest-offer-mobility"
        />
      ) : null}

      {/* ── Captura tipada — SIEMPRE visible mientras haya serie activa (prefill de lo cronometrado,
             editable). Corriendo se DESHABILITA, no se oculta (R8). ── */}
      {activeSet != null && (
        <View style={{ width: '100%', gap: 10, opacity: running ? 0.55 : 1 }} pointerEvents={running ? 'none' : 'auto'}>
          <Text style={{ fontFamily: FONT.uiBold, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase', color: s.textMuted }}>
            {perSide ? 'Hold por lado (segundos)' : 'Hold registrado (segundos)'}
          </Text>
          <ActiveSetRow
            key={`${block.id}-${activeSet}`}
            blockId={block.id}
            setNumber={activeSet}
            typedMode="mobility"
            sideMode={sideMode}
            suggestedWeight={null}
            seedValues={
              restoredDraft && restoredDraft.blockId === block.id && restoredDraft.setNumber === activeSet
                ? restoredDraft.values
                : null
            }
            typedSeedPatch={seedPatch}
            header={{ exerciseName: exercise.name, objectiveLine }}
            onDraftChange={(values, fieldIndex) => {
              captureRef.current = values
              onDraftChange(block.id, activeSet as number, values, fieldIndex)
            }}
            onCommit={commitSet}
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
