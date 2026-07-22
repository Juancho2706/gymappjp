import { useEffect, useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { MotiView } from 'moti'
import { GitCommit, Minus, Timer } from 'lucide-react-native'
import {
  buildTypedPayload,
  type OptimisticLogPayload,
  type ReconciledSessionLog,
} from '@eva/workout-engine'
import { FONT } from '../../../../lib/typography'
import { hexToRgba } from '../../../../lib/theme'
import { haptics } from '../../../../lib/haptics'
import type { SessionBlock, SessionExercise } from '../../../../lib/workout-session'
import { SetRow } from '../SetRow'
import { JuicyButton } from './JuicyButton'
import { TypedMediaV3 } from './TypedMediaV3'
import { useStopwatch } from './timing'
import { formatClock, rollerGoalLabel, rollerPassesTarget } from './typed-screen-model'
import type { ExecTheme } from './exec-theme'

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

      {/* Media */}
      <View style={{ width: '100%', height: MEDIA_HEIGHT, borderRadius: 22, overflow: 'hidden', borderWidth: 2, borderColor: '#2a333a', backgroundColor: s.surfaceRaised }}>
        <TypedMediaV3 exercise={exercise} exec={exec} accent={accent} IconFallback={GitCommit} onOpenTechnique={onOpenTechnique} />
        <View
          pointerEvents="none"
          style={{ position: 'absolute', top: 10, left: 12, zIndex: 3, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 }}
        >
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accent }} />
          <Text style={{ fontFamily: FONT.uiBold, fontSize: 11, letterSpacing: 0.4, color: '#cfcfd8', textTransform: 'uppercase' }}>En loop</Text>
        </View>
      </View>

      {firstUnlogged == null ? (
        <View style={{ width: '100%', gap: 6 }}>{loggedRows}</View>
      ) : (
        <>
          <Text style={{ fontFamily: FONT.uiBold, fontSize: 13, color: hexToRgba(s.text, 0.8), textAlign: 'center', fontVariant: ['tabular-nums'] }}>
            Objetivo: <Text style={{ color: s.text }}>{goal}</Text>
            {block.sets > 1 ? <Text style={{ color: s.textMuted }}>{'  ·  '}Serie {firstUnlogged} de {block.sets}</Text> : null}
          </Text>

          {/* Contador gigante */}
          <View style={{ alignItems: 'center', gap: 2 }}>
            <MotiView
              key={bump}
              from={reducedMotion ? { scale: 1 } : { scale: 1.12 }}
              animate={{ scale: 1 }}
              transition={reducedMotion ? { type: 'timing', duration: 0 } : { type: 'spring', stiffness: 420, damping: 16 }}
            >
              <Text style={{ fontFamily: FONT.displayBlack, fontSize: 116, letterSpacing: -5, lineHeight: 116, color: '#eef4f6', fontVariant: ['tabular-nums'] }}>
                {count}
              </Text>
            </MotiView>
            {target != null && (
              <Text style={{ fontFamily: FONT.uiBold, fontSize: 14, color: s.textMuted, fontVariant: ['tabular-nums'] }}>de {target}</Text>
            )}
            <Text style={{ fontFamily: FONT.uiBold, fontSize: 11, letterSpacing: 2, color: s.textDim, textTransform: 'uppercase', marginTop: 2 }}>Pasadas</Text>
          </View>

          {/* +1 gigante + -1 discreto */}
          <View style={{ width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Pressable
              testID="btn-roller-dec-v3"
              onPress={dec}
              disabled={count === 0}
              hitSlop={8}
              style={{ width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: s.borderStrong, backgroundColor: s.surface, opacity: count === 0 ? 0.4 : 1 }}
              accessibilityRole="button"
              accessibilityLabel="Restar una pasada"
            >
              <Minus size={22} color={s.textMuted} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <JuicyButton
                testID="btn-roller-inc-v3"
                label="+1 pasada"
                onPress={inc}
                exec={{ ...exec, accent, accentText: '#08222b' }}
                height={72}
                fontSize={22}
                breathing
                reducedMotion={reducedMotion}
                accessibilityLabel="Sumar una pasada"
              />
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
        </>
      )}
    </View>
  )
}
