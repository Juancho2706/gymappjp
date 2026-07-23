import { useEffect, useMemo, useState } from 'react'
import { Modal, Pressable, Text, View } from 'react-native'
import { MotiView } from 'moti'
import { GitCommit, Minus, Plus, Timer, X } from 'lucide-react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  buildTypedPayload,
  type OptimisticLogPayload,
  type ReconciledSessionLog,
} from '@eva/workout-engine'
import { FONT, textStyle } from '../../../../lib/typography'
import { hexToRgba } from '../../../../lib/theme'
import { haptics } from '../../../../lib/haptics'
import type { SessionBlock, SessionExercise } from '../../../../lib/workout-session'
import { Sheet } from '../../../Sheet'
import { SetRow } from '../SetRow'
import { TypedKeypad } from '../TypedKeypad'
import { JuicyButton } from './JuicyButton'
import { SingleWheelPicker } from './DualWheelPicker'
import { TypedMediaV3 } from './TypedMediaV3'
import { useStopwatch } from './timing'
import { formatClock, rollerGoalLabel, rollerPassesTarget } from './typed-screen-model'
import type { ExecTheme } from './exec-theme'

const ROLLER_HINT_KEY = 'eva:roller-hint-v1'

const MEDIA_HEIGHT = 150

/**
 * Pantalla "Roller" del ejecutor V3 (E3.3) — traducción del `.a3b-roll` (concepto-a-v3-tipos): la más
 * simple. Media + objetivo, CONTADOR GIGANTE (salta con micro-spring al sumar; reduced-motion sin salto)
 * y un botón ENORME "+1 pasada" (juicy, tick háptico) con un −1 discreto para corregir. Cronómetro
 * OPCIONAL (`useStopwatch`, mirror de `StopwatchTimer`) como chip. Al confirmar: `reps_done` = contador
 * y `actual_duration_sec` = duración si corrió el timer, vía el flujo tipado EXISTENTE
 * (`buildTypedPayload('roller', …)` → `onCommitSet`). Cero teclado (pensada para usarse desde el suelo).
 */
export function RollerScreenV3({
  block,
  exercise,
  blockLogs,
  reducedMotion = false,
  exec,
  onOpenTechnique,
  onOpenSet,
  onCommitSet,
  recentSet,
  syncErrors,
  onRetrySet,
}: {
  block: SessionBlock
  exercise: SessionExercise
  blockLogs: ReconciledSessionLog[]
  reducedMotion?: boolean
  exec: ExecTheme
  onOpenTechnique: () => void
  onOpenSet: (setNumber: number) => void
  onCommitSet: (payload: OptimisticLogPayload) => void
  recentSet?: { blockId: string; setNumber: number; pr: boolean } | null
  syncErrors?: Record<string, string>
  onRetrySet?: (blockId: string, setNumber: number) => void
}) {
  const s = exec.surface
  const accent = exec.recovery
  const target = rollerPassesTarget(block)
  const goal = rollerGoalLabel(block)
  // Nota del coach (todos los tipos): pill de acento recovery + sheet interna (patrón de movilidad).
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

  const [count, setCount] = useState(0)
  const [bump, setBump] = useState(0) // nonce del micro-spring del contador
  const stopwatch = useStopwatch(false)

  // Reinicia contador + cronómetro al cambiar de serie activa.
  useEffect(() => {
    setCount(0)
    stopwatch.reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstUnlogged])

  const inc = () => { setCount((c) => c + 1); setBump((b) => b + 1); haptics.tap() }
  const dec = () => { setCount((c) => Math.max(0, c - 1)); haptics.tap() }

  // Edición directa del número (QA4 · como los tiles de fuerza): tap = teclado, mantener = rueda. Reusa el
  // TypedKeypad (Modal) y la rueda del ejecutor en modo de UN valor. NO cambia el commit (buildTypedPayload).
  const [kpOpen, setKpOpen] = useState(false)
  const [kpValue, setKpValue] = useState('')
  const [wheelOpen, setWheelOpen] = useState(false)
  const openNumberKeypad = () => { setKpValue(count > 0 ? String(count) : ''); setKpOpen(true) }
  const commitKeypad = () => {
    const n = Math.max(0, Math.round(Number(kpValue.replace(',', '.')) || 0))
    setCount(n); setBump((b) => b + 1); setKpOpen(false)
  }
  const applyWheel = (v: number) => { setCount(Math.max(0, Math.round(v))); setBump((b) => b + 1); setWheelOpen(false) }

  // Avisito descartable la primera vez (carril propio del roller en AsyncStorage; se persiste al mostrarse).
  const [hintShow, setHintShow] = useState(false)
  useEffect(() => {
    let alive = true
    AsyncStorage.getItem(ROLLER_HINT_KEY)
      .then((raw) => {
        if (alive && raw == null) {
          setHintShow(true)
          AsyncStorage.setItem(ROLLER_HINT_KEY, '1').catch(() => {})
        }
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const confirm = () => {
    if (firstUnlogged == null) return
    const values: Record<string, string> = { reps_done: String(count) }
    if (stopwatch.started && stopwatch.elapsed > 0) values.actual_duration_sec = String(stopwatch.elapsed)
    haptics.setDone()
    onCommitSet(buildTypedPayload('roller', values, block.id, firstUnlogged, block.side_mode ?? null))
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
        typedMode="roller"
        onPress={() => onOpenSet(setNumber)}
        settle={isRecent}
        pr={isRecent && !!recentSet?.pr}
        syncError={syncErrors?.[`${block.id}:${setNumber}`] ?? null}
        onRetry={() => onRetrySet?.(block.id, setNumber)}
      />
    )
  })

  return (
    <View style={{ gap: 12, alignItems: 'center' }}>
      {/* Nombre + chip Roller + músculo */}
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Text style={{ fontFamily: FONT.displayBlack, fontSize: 26, letterSpacing: -0.5, lineHeight: 30, color: '#eef4f6', textAlign: 'center' }}>
          {exercise.name}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 11, paddingVertical: 5, backgroundColor: hexToRgba(accent, 0.14), borderColor: hexToRgba(accent, 0.32) }}>
            <GitCommit size={13} color={accent} />
            <Text style={{ fontFamily: FONT.uiBold, fontSize: 12, color: hexToRgba(accent, 0.92) }}>Roller</Text>
          </View>
          {exercise.muscle_group ? (
            <View style={{ borderRadius: 999, borderWidth: 1.5, paddingHorizontal: 11, paddingVertical: 5, backgroundColor: s.surface, borderColor: s.borderStrong }}>
              <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 12, color: s.textMuted }}>{exercise.muscle_group}</Text>
            </View>
          ) : null}
        </View>
      </View>

      {/* Media — chips "Instrucciones" + "Nota del coach" DENTRO de la media (overlay superior-izquierdo).
          Sin pill "En loop" superpuesta (QA4). */}
      <View style={{ width: '100%', height: MEDIA_HEIGHT, borderRadius: 22, overflow: 'hidden', borderWidth: 2, borderColor: '#2a333a', backgroundColor: s.surfaceRaised }}>
        <TypedMediaV3 exercise={exercise} exec={exec} accent={accent} coachNote={coachNote} IconFallback={GitCommit} onOpenTechnique={onOpenTechnique} onOpenNote={() => setNoteOpen(true)} reducedMotion={reducedMotion} />
      </View>

      {firstUnlogged == null ? (
        <View style={{ width: '100%', gap: 6 }}>{loggedRows}</View>
      ) : (
        <>
          <Text style={{ fontFamily: FONT.uiBold, fontSize: 13, color: hexToRgba(s.text, 0.8), textAlign: 'center', fontVariant: ['tabular-nums'] }}>
            Objetivo: <Text style={{ color: s.text }}>{goal}</Text>
            {block.sets > 1 ? <Text style={{ color: s.textMuted }}>{'  ·  '}Serie {firstUnlogged} de {block.sets}</Text> : null}
          </Text>

          {/* Contador gigante EDITABLE (QA4): tap = teclado · mantener = rueda + avisito descartable. */}
          <View style={{ alignItems: 'center', gap: 2 }}>
            <MotiView
              key={bump}
              from={reducedMotion ? { scale: 1 } : { scale: 1.12 }}
              animate={{ scale: 1 }}
              transition={reducedMotion ? { type: 'timing', duration: 0 } : { type: 'spring', stiffness: 420, damping: 16 }}
            >
              <Pressable
                testID="btn-roller-number-v3"
                onPress={openNumberKeypad}
                onLongPress={() => { haptics.tap(); setWheelOpen(true) }}
                delayLongPress={400}
                accessibilityRole="button"
                accessibilityLabel={`${count} pasadas, toca para escribir`}
                accessibilityHint="Mantén presionado para abrir la rueda de valores"
              >
                <Text style={{ fontFamily: FONT.displayBlack, fontSize: 116, letterSpacing: -5, lineHeight: 116, color: '#eef4f6', fontVariant: ['tabular-nums'] }}>
                  {count}
                </Text>
              </Pressable>
            </MotiView>
            {target != null && (
              <Text style={{ fontFamily: FONT.uiBold, fontSize: 14, color: s.textMuted, fontVariant: ['tabular-nums'] }}>de {target}</Text>
            )}
            <Text style={{ fontFamily: FONT.uiBold, fontSize: 11, letterSpacing: 2, color: s.textDim, textTransform: 'uppercase', marginTop: 2 }}>Pasadas</Text>
            {hintShow && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: s.border, backgroundColor: s.surface }}>
                <Text style={{ fontFamily: FONT.uiSemibold, fontSize: 11, color: s.textMuted }}>
                  Tocá el número para escribirlo · mantené para la rueda
                </Text>
                <Pressable onPress={() => setHintShow(false)} hitSlop={8} accessibilityRole="button" accessibilityLabel="Entendido, ocultar aviso">
                  <X size={13} color={s.textMuted} />
                </Pressable>
              </View>
            )}
          </View>

          {/* Fila de DOS botones (GOTCHA repo: jamás dos w-full en fila → cada uno flex-1): +1 héroe
              (juicy, más alto) + −1 destructivo rojo (ghost) para corregir. */}
          <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ flex: 1 }}>
              <JuicyButton
                testID="btn-roller-inc-v3"
                label="+1 pasada"
                icon={<Plus size={20} color="#08222b" strokeWidth={3} />}
                onPress={inc}
                exec={{ ...exec, accent, accentText: '#08222b' }}
                height={72}
                fontSize={22}
                breathing
                reducedMotion={reducedMotion}
                accessibilityLabel="Sumar una pasada"
              />
            </View>
            {/* −1 destructivo rojo (juicy-ghost): borde 2px rojo 55%, fondo rojo 14%, texto rojo, sombra
                dura roja inferior; se hunde al presionar. El héroe sigue siendo el +1 (más alto). */}
            <View style={{ flex: 1, height: 64 }}>
              <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 4, height: 60, borderRadius: 16, backgroundColor: '#7a2222' }} />
              <Pressable
                testID="btn-roller-dec-v3"
                onPress={dec}
                disabled={count === 0}
                style={({ pressed }) => ({
                  height: 60,
                  borderRadius: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  borderWidth: 2,
                  borderColor: hexToRgba('#f87171', 0.55),
                  backgroundColor: hexToRgba('#f87171', 0.14),
                  opacity: count === 0 ? 0.4 : 1,
                  transform: [{ translateY: pressed && count > 0 ? 4 : 0 }],
                })}
                accessibilityRole="button"
                accessibilityLabel="Restar una pasada"
              >
                <Minus size={20} color="#f87171" strokeWidth={3} />
                <Text style={{ fontFamily: FONT.uiExtra, fontSize: 16, letterSpacing: 0.3, color: '#f87171' }}>−1 pasada</Text>
              </Pressable>
            </View>
          </View>

          {/* Cronómetro opcional + Completar */}
          <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable
              testID="btn-roller-timer-v3"
              onPress={stopwatch.toggle}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1.5, borderColor: stopwatch.running ? hexToRgba(accent, 0.4) : s.borderStrong, backgroundColor: stopwatch.running ? hexToRgba(accent, 0.12) : s.surface }}
              accessibilityRole="button"
              accessibilityLabel={stopwatch.running ? 'Pausar el cronómetro' : stopwatch.started ? 'Reanudar el cronómetro' : 'Iniciar cronómetro opcional'}
            >
              <Timer size={16} color={stopwatch.running ? accent : s.textMuted} />
              <Text style={{ fontFamily: FONT.monoBold, fontSize: 14, color: stopwatch.started ? s.text : s.textMuted, fontVariant: ['tabular-nums'] }}>
                {stopwatch.started ? formatClock(stopwatch.elapsed) : 'Cronómetro'}
              </Text>
              {!stopwatch.started && (
                <Text style={{ fontFamily: FONT.uiBold, fontSize: 9, letterSpacing: 0.8, color: s.textDim, textTransform: 'uppercase' }}>Opcional</Text>
              )}
            </Pressable>
            <Pressable
              testID="btn-roller-complete-v3"
              onPress={confirm}
              style={{ flex: 1, height: 54, borderRadius: 15, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#2f2f3a', backgroundColor: '#1c1c24' }}
              accessibilityRole="button"
              accessibilityLabel={`Completar la serie ${firstUnlogged} del roller`}
            >
              <Text style={{ fontFamily: FONT.uiExtra, fontSize: 16, letterSpacing: 0.3, color: '#e8e8ee' }}>Completar</Text>
            </Pressable>
          </View>

          {loggedRows.some(Boolean) && <View style={{ width: '100%', gap: 6 }}>{loggedRows}</View>}

          {/* Teclado numérico (Modal) del número — un solo campo "Pasadas" (entero). Reusa TypedKeypad. */}
          <Modal transparent visible={kpOpen} animationType="fade" onRequestClose={() => setKpOpen(false)}>
            <View style={{ flex: 1 }}>
              <Pressable
                style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' }}
                onPress={() => setKpOpen(false)}
                accessibilityRole="button"
                accessibilityLabel="Cerrar teclado"
              />
              <TypedKeypad
                mode="integer"
                unit="pasadas"
                value={kpValue}
                onChange={setKpValue}
                onNext={commitKeypad}
                onDone={commitKeypad}
                onClose={() => setKpOpen(false)}
                header={{ exerciseName: exercise.name, objectiveLine: goal }}
              />
            </View>
          </Modal>

          {/* Rueda de pasadas (mantener el número) — rueda del ejecutor en modo de UN valor. */}
          <SingleWheelPicker
            open={wheelOpen}
            onClose={() => setWheelOpen(false)}
            value={count}
            step={1}
            max={100}
            label="Pasadas"
            title="Pasadas"
            subtitle={target != null ? `Objetivo: ${target}${block.side_mode === 'per_side' ? ' por lado' : ''}` : exercise.name}
            exec={{ ...exec, accent, accentText: '#08222b' }}
            reducedMotion={reducedMotion}
            onDone={applyWheel}
          />
        </>
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
