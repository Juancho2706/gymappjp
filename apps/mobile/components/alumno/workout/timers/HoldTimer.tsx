import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MotiView } from 'moti'
import Svg, { Circle, G } from 'react-native-svg'
import { Pause, Play, RotateCcw, X } from 'lucide-react-native'
import { useEvaMotion, EASE } from '../../../../lib/motion'
import { useTheme } from '../../../../context/ThemeContext'
import { TYPE, textStyle, FONT } from '../../../../lib/typography'
import { SHADOWS } from '../../../../lib/shadows'
import { haptics } from '../../../../lib/haptics'
import { EMBER_500, INK_900, ON_DARK, ON_DARK_MUTED, TRACK_ON_DARK } from './timer-colors'
import { playTimerCue } from './sound'

/**
 * Timer de HOLD (isométricos / movilidad / roller) — port RN de la web
 * `HoldTimer.tsx`. Cuenta regresiva con anillo compacto arriba, háptica + cue de
 * audio al llegar a 0, y botón Repetir (siguiente set o lado). Chrome oscuro fijo,
 * background-safe (endTime + AppState). Mismo lenguaje visual que RestTimerBar.
 *
 * Toast flotante top-anclado (espeja web `fixed top-[safe+6.25rem] left-3 right-3`):
 * entra deslizando -24px con fade en 200ms (respeta reduce-motion) y al llegar a 0
 * tiñe la tarjeta de ember al 15% (overlay), manteniendo el borde inverse constante.
 */
interface HoldTimerProps {
  initialSeconds: number
  label?: string
  onClose: () => void
}

function formatTime(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

const R = 18
const C = 2 * Math.PI * R

export function HoldTimer({ initialSeconds, label, onClose }: HoldTimerProps) {
  const insets = useSafeAreaInsets()
  const motion = useEvaMotion()
  const { theme } = useTheme()
  const [timeLeft, setTimeLeft] = useState(initialSeconds)
  const [isActive, setIsActive] = useState(true)
  const endTimeRef = useRef<number | null>(null)
  const firedRef = useRef(false)

  const triggerDone = useCallback(() => {
    if (firedRef.current) return
    firedRef.current = true
    void haptics.success()
    playTimerCue('done')
    setIsActive(false)
    endTimeRef.current = null
  }, [])

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    if (isActive && timeLeft > 0) {
      if (!endTimeRef.current) endTimeRef.current = Date.now() + timeLeft * 1000
      interval = setInterval(() => {
        if (!endTimeRef.current) return
        const next = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
        setTimeLeft(next)
        if (next === 0) triggerDone()
      }, 250)
    } else if (!isActive) {
      endTimeRef.current = null
    }
    return () => clearInterval(interval)
  }, [isActive, timeLeft, triggerDone])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active' || !endTimeRef.current) return
      const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
      setTimeLeft(remaining)
      if (remaining === 0) triggerDone()
    })
    return () => sub.remove()
  }, [triggerDone])

  const restart = useCallback(() => {
    void haptics.tap()
    firedRef.current = false
    endTimeRef.current = null
    setTimeLeft(initialSeconds)
    setIsActive(true)
  }, [initialSeconds])

  const toggle = useCallback(() => {
    void haptics.tap()
    setIsActive((v) => !v)
  }, [])

  const done = timeLeft === 0
  const frac = Math.max(0, Math.min(1, timeLeft / (initialSeconds || 1)))
  const dashoffset = C * (1 - frac)

  return (
    <View
      pointerEvents="box-none"
      style={[styles.anchor, { top: insets.top + 100, left: insets.left + 12, right: insets.right + 12 }]}
    >
      <MotiView
        style={[styles.card, SHADOWS.dark.lg, { borderRadius: theme.radius['2xl'] }]}
        accessibilityRole="timer"
        from={motion.reduced ? undefined : { opacity: 0, translateY: -24 }}
        animate={{ opacity: 1, translateY: 0 }}
        transition={{ type: 'timing', duration: motion.reduced ? 0 : 200, easing: EASE.out }}
      >
        {done ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.doneOverlay]} /> : null}
        <View style={styles.left}>
          <View style={styles.ringWrap}>
            <Svg width={44} height={44} viewBox="0 0 44 44">
              <G rotation={-90} origin="22, 22">
                <Circle cx={22} cy={22} r={R} strokeWidth={3} fill="none" stroke={TRACK_ON_DARK} />
                <Circle
                  cx={22}
                  cy={22}
                  r={R}
                  strokeWidth={3}
                  fill="none"
                  stroke={EMBER_500}
                  strokeLinecap="round"
                  strokeDasharray={C}
                  strokeDashoffset={dashoffset}
                />
              </G>
            </Svg>
            <View style={styles.ringCenter} pointerEvents="none">
              <Text style={styles.ringTime}>{formatTime(timeLeft)}</Text>
            </View>
          </View>
          <View style={styles.textCol}>
            <Text style={styles.eyebrow} numberOfLines={1}>
              {label || 'Hold'}
            </Text>
            <Text style={styles.subLine} numberOfLines={1}>
              {done ? '¡Listo! Cambia de lado o set' : 'Mantén la posición'}
            </Text>
          </View>
        </View>
        <View style={styles.utilRow}>
          <Pressable
            testID="hold-timer-pause"
            onPress={toggle}
            accessibilityRole="button"
            accessibilityLabel={isActive ? 'Pausar' : 'Reanudar'}
            hitSlop={6}
            style={styles.utilBtn}
          >
            {isActive ? <Pause size={16} color={ON_DARK_MUTED} /> : <Play size={16} color={ON_DARK_MUTED} />}
          </Pressable>
          <Pressable
            testID="hold-timer-restart"
            onPress={restart}
            accessibilityRole="button"
            accessibilityLabel="Repetir hold"
            hitSlop={6}
            style={styles.utilBtn}
          >
            <RotateCcw size={16} color={ON_DARK_MUTED} />
          </Pressable>
          <Pressable
            testID="hold-timer-close"
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cerrar timer"
            hitSlop={6}
            style={styles.utilBtn}
          >
            <X size={16} color={ON_DARK_MUTED} />
          </Pressable>
        </View>
      </MotiView>
    </View>
  )
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute' },
  card: {
    borderWidth: 1,
    borderColor: TRACK_ON_DARK,
    backgroundColor: `${INK_900}F2`,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    minHeight: 44,
  },
  doneOverlay: { backgroundColor: `${EMBER_500}26` }, // ember-500 @ 15% (espeja `bg-[var(--ember-500)]/15`)
  left: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  ringWrap: { width: 44, height: 44, position: 'relative' },
  ringCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  ringTime: { ...textStyle('2xs', FONT.monoBold), color: ON_DARK },
  textCol: { flexShrink: 1, minWidth: 0 },
  eyebrow: { ...TYPE.eyebrow, color: ON_DARK_MUTED },
  subLine: { ...textStyle('xs', FONT.uiBold), color: ON_DARK, marginTop: 1 },
  utilRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  utilBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
})
