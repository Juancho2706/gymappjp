import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { Pause, Play, RotateCcw, X } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../context/ThemeContext'

interface StopwatchProps {
  onClose: () => void
}

/**
 * Cronómetro de conteo ascendente (espejo de Stopwatch web AC5) — para bloques cardio
 * prescritos por distancia (sin duración cronometrable). Mismo lenguaje visual que RestTimer.
 */
export function Stopwatch({ onClose }: StopwatchProps) {
  const { theme } = useTheme()
  const [elapsed, setElapsed] = useState(0)
  const [isActive, setIsActive] = useState(true)
  const startRef = useRef<number>(Date.now())
  const baseRef = useRef<number>(0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current)
    if (!isActive) return
    startRef.current = Date.now()
    intervalRef.current = setInterval(() => {
      setElapsed(baseRef.current + Math.floor((Date.now() - startRef.current) / 1000))
    }, 250)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [isActive])

  function toggle() {
    setIsActive((prev) => {
      if (prev) {
        baseRef.current = baseRef.current + Math.floor((Date.now() - startRef.current) / 1000)
        if (intervalRef.current) clearInterval(intervalRef.current)
      }
      return !prev
    })
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
  }

  function reset() {
    baseRef.current = 0
    startRef.current = Date.now()
    setElapsed(0)
    setIsActive(true)
  }

  function fmt(s: number) {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    return `${m}:${String(sec).padStart(2, '0')}`
  }

  return (
    <MotiView
      from={{ opacity: 0, translateY: -12 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'spring', damping: 18, stiffness: 200 }}
      style={[styles.card, { backgroundColor: theme.card, borderColor: theme.primary }]}
    >
      <View style={styles.timeWrap}>
        <Text style={[styles.timeText, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>{fmt(elapsed)}</Text>
        <Text style={[styles.label, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>cronómetro</Text>
      </View>
      <View style={styles.controls}>
        <TouchableOpacity style={[styles.iconBtn, { borderColor: theme.border }]} onPress={reset} activeOpacity={0.7}>
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
  timeWrap: { alignItems: 'center', justifyContent: 'center', minWidth: 110 },
  timeText: { fontSize: 30, letterSpacing: -0.5 },
  label: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 2 },
  controls: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  iconBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  primaryBtn: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
})
