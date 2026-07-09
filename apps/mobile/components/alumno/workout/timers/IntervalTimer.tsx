import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Pause, Play, SkipForward, X } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { INTERVAL_PHASE_LABEL, type IntervalPhase, type IntervalPhaseKind } from '@eva/workout-engine'
import { TYPE, textStyle, FONT } from '../../../../lib/typography'
import { SHADOWS } from '../../../../lib/shadows'
import { haptics } from '../../../../lib/haptics'
import {
  AQUA_500,
  EMBER_500,
  INK_900,
  ON_DARK,
  ON_DARK_MUTED,
  SPORT_300,
  SUCCESS_500,
  TRACK_ON_DARK,
} from './timer-colors'
import { playTimerCue } from './sound'

/**
 * Timer de INTERVALOS (cardio/HYROX/fartlek) — port RN de la web `IntervalTimer.tsx`.
 * Consume la máquina de fases PURA del motor (`buildIntervalPhases` corre en el
 * provider; acá se recibe `phases`). Muestra fase (warmup/work/recovery/cooldown)
 * con "intervalo N de M", tiempo mono grande, barra de progreso de la fase, y
 * pausa/saltar-fase/cerrar. Cue de audio + háptica en cada cambio de fase (doble
 * al terminar). El wake-lock lo maneja el núcleo del ejecutor, no este componente.
 */
interface IntervalTimerProps {
  phases: IntervalPhase[]
  onClose: () => void
}

const PHASE_COLOR: Record<IntervalPhaseKind, string> = {
  warmup: SPORT_300,
  work: EMBER_500,
  recovery: AQUA_500,
  cooldown: SPORT_300,
}

function formatTime(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function IntervalTimer({ phases, onClose }: IntervalTimerProps) {
  const insets = useSafeAreaInsets()
  const [phaseIndex, setPhaseIndex] = useState(0)
  const [timeLeft, setTimeLeft] = useState(phases[0]?.durationSec ?? 0)
  const [isActive, setIsActive] = useState(true)
  const [finished, setFinished] = useState(false)
  const endTimeRef = useRef<number | null>(null)
  const phaseIndexRef = useRef(0)

  const phase = phases[phaseIndex] ?? null

  const cue = useCallback((double: boolean) => {
    void (double ? haptics.success() : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}))
    playTimerCue(double ? 'finish' : 'phase')
  }, [])

  const advance = useCallback(() => {
    const next = phaseIndexRef.current + 1
    if (next >= phases.length) {
      cue(true)
      setFinished(true)
      setIsActive(false)
      endTimeRef.current = null
      return
    }
    cue(false)
    phaseIndexRef.current = next
    setPhaseIndex(next)
    setTimeLeft(phases[next].durationSec)
    endTimeRef.current = Date.now() + phases[next].durationSec * 1000
  }, [phases, cue])

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    if (isActive && !finished) {
      if (!endTimeRef.current) endTimeRef.current = Date.now() + timeLeft * 1000
      interval = setInterval(() => {
        if (!endTimeRef.current) return
        const next = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
        setTimeLeft(next)
        if (next === 0) advance()
      }, 250)
    } else if (!isActive) {
      endTimeRef.current = null
    }
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, finished, phaseIndex, advance])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || !endTimeRef.current || finished) return
      const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
      setTimeLeft(remaining)
      if (remaining === 0) advance()
    })
    return () => sub.remove()
  }, [advance, finished])

  const toggle = useCallback(() => {
    void haptics.tap()
    setIsActive((v) => !v)
  }, [])

  const skip = useCallback(() => {
    void haptics.tap()
    advance()
  }, [advance])

  const progress = phase && phase.durationSec > 0 ? (phase.durationSec - timeLeft) / phase.durationSec : 0

  return (
    <View
      pointerEvents="box-none"
      style={[styles.anchor, { top: insets.top + 12, left: insets.left + 12, right: insets.right + 12 }]}
    >
      <View style={[styles.card, SHADOWS.dark.lg]} accessibilityRole="timer">
        <View style={styles.row}>
          <View style={styles.info}>
            {finished ? (
              <Text style={styles.finished}>¡Intervalos completados!</Text>
            ) : (
              <>
                <Text style={[styles.eyebrow, { color: phase ? PHASE_COLOR[phase.kind] : ON_DARK_MUTED }]}>
                  {phase ? INTERVAL_PHASE_LABEL[phase.kind] : ''}
                  {phase?.repeat != null && phase.totalRepeats != null ? (
                    <Text style={styles.repeat}> · intervalo {phase.repeat} de {phase.totalRepeats}</Text>
                  ) : null}
                </Text>
                <Text style={styles.bigTime}>{formatTime(timeLeft)}</Text>
              </>
            )}
          </View>
          <View style={styles.utilRow}>
            {!finished ? (
              <>
                <Pressable
                  testID="interval-timer-pause"
                  onPress={toggle}
                  accessibilityRole="button"
                  accessibilityLabel={isActive ? 'Pausar' : 'Reanudar'}
                  hitSlop={6}
                  style={styles.utilBtn}
                >
                  {isActive ? <Pause size={16} color={ON_DARK_MUTED} /> : <Play size={16} color={ON_DARK_MUTED} />}
                </Pressable>
                <Pressable
                  testID="interval-timer-skip"
                  onPress={skip}
                  accessibilityRole="button"
                  accessibilityLabel="Saltar fase"
                  hitSlop={6}
                  style={styles.utilBtn}
                >
                  <SkipForward size={16} color={ON_DARK_MUTED} />
                </Pressable>
              </>
            ) : null}
            <Pressable
              testID="interval-timer-close"
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cerrar timer"
              hitSlop={6}
              style={styles.utilBtn}
            >
              <X size={16} color={ON_DARK_MUTED} />
            </Pressable>
          </View>
        </View>
        {!finished && phase ? (
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                {
                  width: `${Math.max(0, Math.min(1, progress)) * 100}%`,
                  backgroundColor: phase.kind === 'work' ? EMBER_500 : SUCCESS_500,
                },
              ]}
            />
          </View>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', maxWidth: 360, alignSelf: 'flex-end', width: '100%' },
  card: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: TRACK_ON_DARK,
    backgroundColor: `${INK_900}F2`,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44 },
  info: { flexShrink: 1, minWidth: 0 },
  finished: { ...textStyle('sm', FONT.uiExtra), color: SUCCESS_500 },
  eyebrow: { ...TYPE.eyebrow },
  repeat: { ...textStyle('2xs', FONT.uiBold), color: ON_DARK_MUTED },
  bigTime: { ...textStyle('2xl', FONT.monoBold, { lh: 'tight' }), color: ON_DARK, marginTop: 2 },
  utilRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  utilBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  track: { marginTop: 6, height: 4, borderRadius: 999, backgroundColor: TRACK_ON_DARK, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
})
