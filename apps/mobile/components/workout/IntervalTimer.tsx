import { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Circle, Svg } from 'react-native-svg'
import * as Haptics from 'expo-haptics'
import { Pause, Play, RotateCcw, SkipForward, X } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../context/ThemeContext'
import { INTERVAL_PHASE_LABEL, type IntervalPhase } from '../../lib/workout-exec'

interface IntervalTimerProps {
  phases: IntervalPhase[]
  onClose: () => void
}

const R = 48
const SW = 5
const SIZE = (R + SW) * 2
const CX = SIZE / 2
const CY = SIZE / 2
const CIRC = 2 * Math.PI * R

/** Color por fase — espejo de PHASE_COLOR web (sky/red/emerald). */
function phaseColor(kind: IntervalPhase['kind'], theme: any): string {
  switch (kind) {
    case 'work':
      return theme.destructive ?? '#EF4444'
    case 'recovery':
      return theme.success ?? '#10B981'
    case 'warmup':
    case 'cooldown':
    default:
      return theme.primary
  }
}

/**
 * Timer de intervalos (espejo de IntervalTimer web AC5): fases warmup/work/recovery/cooldown
 * con "intervalo N de M", vibración fuerte en cada cambio de fase + doble al terminar
 * (canal primario en RN — iOS no reproduce beep sin audio session). Mismo lenguaje visual
 * que RestTimer.
 */
export function IntervalTimer({ phases, onClose }: IntervalTimerProps) {
  const { theme } = useTheme()
  const [phaseIndex, setPhaseIndex] = useState(0)
  const [timeLeft, setTimeLeft] = useState(phases[0]?.durationSec ?? 0)
  const [isActive, setIsActive] = useState(true)
  const [finished, setFinished] = useState(false)
  const endTimeRef = useRef<number | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const phaseIndexRef = useRef(0)

  const phase = phases[phaseIndex] ?? null

  const buzz = useCallback((double = false) => {
    if (double) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {})
    }
  }, [])

  const advance = useCallback(() => {
    const next = phaseIndexRef.current + 1
    if (next >= phases.length) {
      buzz(true)
      setFinished(true)
      setIsActive(false)
      endTimeRef.current = null
      return
    }
    buzz(false)
    phaseIndexRef.current = next
    setPhaseIndex(next)
    setTimeLeft(phases[next].durationSec)
    endTimeRef.current = Date.now() + phases[next].durationSec * 1000
  }, [phases, buzz])

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (!isActive || finished) {
      if (!isActive) endTimeRef.current = null
      return
    }
    if (!endTimeRef.current) endTimeRef.current = Date.now() + timeLeft * 1000
    intervalRef.current = setInterval(() => {
      if (!endTimeRef.current) return
      const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
      setTimeLeft(remaining)
      if (remaining === 0) {
        clearInterval(intervalRef.current!)
        advance()
      }
    }, 250)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, finished, phaseIndex, advance])

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
    phaseIndexRef.current = 0
    setPhaseIndex(0)
    setTimeLeft(phases[0]?.durationSec ?? 0)
    setFinished(false)
    setIsActive(true)
    endTimeRef.current = Date.now() + (phases[0]?.durationSec ?? 0) * 1000
  }

  function skip() {
    if (intervalRef.current) clearInterval(intervalRef.current)
    advance()
  }

  function fmt(s: number) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    return `${m}:${sec.toString().padStart(2, '0')}`
  }

  const total = phase?.durationSec ?? 0
  const progress = total > 0 ? timeLeft / total : 0
  const dashOffset = CIRC * (1 - progress)
  const color = finished ? theme.success ?? '#10B981' : phase ? phaseColor(phase.kind, theme) : theme.primary

  return (
    <MotiView
      from={{ opacity: 0, translateY: -12 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'spring', damping: 18, stiffness: 200 }}
      style={[styles.card, { backgroundColor: theme.card, borderColor: color }]}
    >
      <View style={styles.ring}>
        <Svg width={SIZE} height={SIZE}>
          <Circle cx={CX} cy={CY} r={R} stroke={theme.border} strokeWidth={SW} fill="none" />
          <Circle
            cx={CX}
            cy={CY}
            r={R}
            stroke={color}
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
          <Text style={[styles.timeText, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
            {finished ? '✓' : fmt(timeLeft)}
          </Text>
          <Text style={[styles.ringLabel, { color, fontFamily: theme.fontSans }]}>
            {finished ? '¡Listo!' : phase ? INTERVAL_PHASE_LABEL[phase.kind] : ''}
          </Text>
        </View>
      </View>

      <View style={styles.right}>
        {phase && (phase.kind === 'work' || phase.kind === 'recovery') && phase.totalRepeats ? (
          <Text style={[styles.repeatText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Intervalo {phase.repeat} de {phase.totalRepeats}
          </Text>
        ) : null}
        <View style={styles.controls}>
          <TouchableOpacity style={[styles.iconBtn, { borderColor: theme.border }]} onPress={restart} activeOpacity={0.7}>
            <RotateCcw size={16} color={theme.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: color }]} onPress={toggle} activeOpacity={0.8} disabled={finished}>
            {isActive ? <Pause size={18} color="#fff" /> : <Play size={18} color="#fff" />}
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, { borderColor: theme.border }]} onPress={finished ? onClose : skip} activeOpacity={0.7}>
            {finished ? <X size={16} color={theme.mutedForeground} /> : <SkipForward size={16} color={theme.mutedForeground} />}
          </TouchableOpacity>
        </View>
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
  ringLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 2, textAlign: 'center' },
  right: { flex: 1, gap: 8, alignItems: 'center' },
  repeatText: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  iconBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  primaryBtn: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
})
