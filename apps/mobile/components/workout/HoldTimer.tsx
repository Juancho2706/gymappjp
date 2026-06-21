import { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Circle, Svg } from 'react-native-svg'
import * as Haptics from 'expo-haptics'
import { Pause, Play, RotateCcw, X } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../context/ThemeContext'

interface HoldTimerProps {
  duration: number
  /** "Hold" (movilidad) / "Roller" — etiqueta bajo el contador. */
  label?: string
  onComplete: () => void
  onClose: () => void
}

const R = 48
const SW = 5
const SIZE = (R + SW) * 2
const CX = SIZE / 2
const CY = SIZE / 2
const CIRC = 2 * Math.PI * R

/**
 * Timer de hold (movilidad/roller — espejo de HoldTimer web AC5). Cuenta regresiva con
 * vibración fuerte al llegar a 0 (iOS no reproduce beep sin gesto/audio session, así que
 * el canal primario en RN es háptico) + botón Repetir para el siguiente set o lado.
 * Mismo lenguaje visual que RestTimer.
 */
export function HoldTimer({ duration, label, onComplete, onClose }: HoldTimerProps) {
  const { theme } = useTheme()
  const [timeLeft, setTimeLeft] = useState(duration)
  const [isActive, setIsActive] = useState(true)
  const endTimeRef = useRef<number | null>(Date.now() + duration * 1000)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const firedRef = useRef(false)

  useEffect(() => {
    firedRef.current = false
    setTimeLeft(duration)
    setIsActive(true)
    endTimeRef.current = Date.now() + duration * 1000
  }, [duration])

  const triggerDone = useCallback(() => {
    if (firedRef.current) return
    firedRef.current = true
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    setIsActive(false)
    endTimeRef.current = null
    onComplete()
  }, [onComplete])

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (!isActive) {
      endTimeRef.current = null
      return
    }
    if (!endTimeRef.current) endTimeRef.current = Date.now() + timeLeft * 1000
    intervalRef.current = setInterval(() => {
      if (!endTimeRef.current) return
      const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
      setTimeLeft(remaining)
      if (remaining === 0) {
        clearInterval(intervalRef.current!)
        triggerDone()
      }
    }, 250)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, triggerDone])

  function toggle() {
    setIsActive((prev) => {
      if (prev) {
        if (intervalRef.current) clearInterval(intervalRef.current)
        endTimeRef.current = null
      } else {
        endTimeRef.current = Date.now() + timeLeft * 1000
      }
      return !prev
    })
  }

  function restart() {
    if (intervalRef.current) clearInterval(intervalRef.current)
    firedRef.current = false
    endTimeRef.current = Date.now() + duration * 1000
    setTimeLeft(duration)
    setIsActive(true)
  }

  function fmt(s: number) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const progress = duration > 0 ? timeLeft / duration : 0
  const dashOffset = CIRC * (1 - progress)
  const done = timeLeft === 0

  return (
    <MotiView
      from={{ opacity: 0, translateY: -12 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'spring', damping: 18, stiffness: 200 }}
      style={[styles.card, { backgroundColor: theme.card, borderColor: done ? theme.primary : theme.border }]}
    >
      <View style={styles.ring}>
        <Svg width={SIZE} height={SIZE}>
          <Circle cx={CX} cy={CY} r={R} stroke={theme.border} strokeWidth={SW} fill="none" />
          <Circle
            cx={CX}
            cy={CY}
            r={R}
            stroke={theme.primary}
            strokeWidth={SW}
            fill="none"
            strokeDasharray={CIRC}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            rotation={-90}
            origin={`${CX}, ${CY}`}
          />
        </Svg>
        <View style={styles.ringCenter}>
          <Text style={[styles.timeText, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{fmt(timeLeft)}</Text>
          <Text style={[styles.ringLabel, { color: done ? theme.primary : theme.mutedForeground, fontFamily: theme.fontSans }]}>
            {done ? '¡Listo!' : (label ?? 'hold')}
          </Text>
        </View>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity style={[styles.iconBtn, { borderColor: theme.border }]} onPress={restart} activeOpacity={0.7}>
          <RotateCcw size={16} color={theme.mutedForeground} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: theme.primary }]} onPress={toggle} activeOpacity={0.8}>
          {isActive ? <Pause size={18} color="#fff" /> : <Play size={18} color="#fff" />}
        </TouchableOpacity>
        <TouchableOpacity style={[styles.iconBtn, { borderColor: theme.border }]} onPress={onClose} activeOpacity={0.7}>
          <X size={16} color={theme.mutedForeground} />
        </TouchableOpacity>
      </View>
    </MotiView>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  ring: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  timeText: { fontSize: 22, letterSpacing: -0.5 },
  ringLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 2 },
  controls: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  iconBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  primaryBtn: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
})
