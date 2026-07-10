import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MotiView } from 'moti'
import { BlurView } from 'expo-blur'
import { Flag, Pause, Play, RotateCcw, X } from 'lucide-react-native'
import { useEvaMotion, EASE } from '../../../../lib/motion'
import { useTheme } from '../../../../context/ThemeContext'
import { textStyle, FONT } from '../../../../lib/typography'
import { SHADOWS } from '../../../../lib/shadows'
import { haptics } from '../../../../lib/haptics'
import { INK_900, ON_DARK, ON_DARK_MUTED, TRACK_ON_DARK } from './timer-colors'

/**
 * CRONÓMETRO count-up con vueltas — port RN de la web `Stopwatch.tsx`. Cardio
 * continuo / por distancia (bloques sin duración cronometrable). Background-safe:
 * el transcurrido se calcula desde `startRef` (Date.now()) + `accumulatedRef`, no
 * acumulando ticks; AppState fuerza el recompute al volver de background.
 *
 * Toast flotante top-anclado con entrada slide-down + fade (200ms, respeta
 * reduce-motion). No emite cue de audio ni háptica de EVENTO (nunca "termina"
 * solo); solo háptica ligera de feedback al pulsar sus botones (idiom RN).
 */
interface StopwatchTimerProps {
  onClose: () => void
}

function formatTime(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
    : `${m}:${String(sec).padStart(2, '0')}`
}

export function StopwatchTimer({ onClose }: StopwatchTimerProps) {
  const insets = useSafeAreaInsets()
  const motion = useEvaMotion()
  const { theme } = useTheme()
  const [elapsed, setElapsed] = useState(0)
  const [isActive, setIsActive] = useState(true)
  const [laps, setLaps] = useState<number[]>([])
  const startRef = useRef<number>(0)
  const accumulatedRef = useRef(0)
  const elapsedRef = useRef(0)

  const recompute = useCallback(() => {
    const next = accumulatedRef.current + Math.floor((Date.now() - startRef.current) / 1000)
    elapsedRef.current = next
    setElapsed(next)
  }, [])

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    if (isActive) {
      startRef.current = Date.now()
      interval = setInterval(recompute, 250)
    }
    return () => clearInterval(interval)
  }, [isActive, recompute])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active' && isActive) recompute()
    })
    return () => sub.remove()
  }, [isActive, recompute])

  const togglePause = useCallback(() => {
    void haptics.tap()
    if (isActive) accumulatedRef.current += Math.floor((Date.now() - startRef.current) / 1000)
    setIsActive((v) => !v)
  }, [isActive])

  const reset = useCallback(() => {
    void haptics.tap()
    accumulatedRef.current = 0
    startRef.current = Date.now()
    elapsedRef.current = 0
    setElapsed(0)
    setLaps([])
  }, [])

  const addLap = useCallback(() => {
    void haptics.select()
    setLaps((prev) => [elapsedRef.current, ...prev].slice(0, 5))
  }, [])

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
        {/* backdrop-blur-xl de la web: BlurView difumina el contenido detrás; el velo
            ink-900 @ 95% (mismo alfa que la web `/95`) va encima. Chrome siempre oscuro. */}
        <BlurView
          pointerEvents="none"
          intensity={20}
          tint="dark"
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
        />
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.veil]} />
        <View style={styles.row}>
          <View style={styles.info}>
            <Text style={styles.eyebrow}>Cronómetro</Text>
            <Text style={styles.bigTime}>{formatTime(elapsed)}</Text>
          </View>
          <View style={styles.utilRow}>
            <Pressable
              testID="stopwatch-lap"
              onPress={addLap}
              accessibilityRole="button"
              accessibilityLabel="Marcar vuelta"
              style={styles.utilBtn}
            >
              <Flag size={14} color={ON_DARK_MUTED} />
            </Pressable>
            <Pressable
              testID="stopwatch-pause"
              onPress={togglePause}
              accessibilityRole="button"
              accessibilityLabel={isActive ? 'Pausar' : 'Reanudar'}
              style={styles.utilBtn}
            >
              {isActive ? <Pause size={14} color={ON_DARK_MUTED} /> : <Play size={14} color={ON_DARK_MUTED} />}
            </Pressable>
            <Pressable
              testID="stopwatch-reset"
              onPress={reset}
              accessibilityRole="button"
              accessibilityLabel="Reiniciar"
              style={styles.utilBtn}
            >
              <RotateCcw size={14} color={ON_DARK_MUTED} />
            </Pressable>
            <Pressable
              testID="stopwatch-close"
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cerrar cronómetro"
              style={styles.utilBtn}
            >
              <X size={14} color={ON_DARK_MUTED} />
            </Pressable>
          </View>
        </View>
        {laps.length > 0 ? (
          <View style={styles.laps}>
            {laps.map((lap, i) => (
              <View key={`${lap}-${i}`} style={styles.lapChip}>
                <Text style={styles.lapText}>
                  V{laps.length - i}: {formatTime(lap)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </MotiView>
    </View>
  )
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute' },
  card: {
    borderWidth: 1,
    borderColor: TRACK_ON_DARK,
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  veil: { backgroundColor: `${INK_900}F2` }, // ink-900 @ 95% sobre el blur (espeja `bg-[var(--ink-900)]/95`)
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 44 },
  info: { flexShrink: 1, minWidth: 0 },
  // Web Stopwatch.tsx:70 `text-[10px] font-semibold uppercase tracking-wider` = 10px / peso 600 /
  // tracking 0.05em (=0.5pt a 10px). No usar TYPE.eyebrow (12px/700/0.12em).
  eyebrow: {
    fontSize: 10,
    lineHeight: 14,
    fontFamily: FONT.uiSemibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: ON_DARK_MUTED,
  },
  // Web Stopwatch.tsx:71 `text-2xl font-black tabular-nums` = 25px / peso 900. Archivo Black con
  // cifras tabulares para conservar el peso que ve el usuario (no mono/700).
  bigTime: {
    ...textStyle('2xl', FONT.displayBlack, { lh: 'tight' }),
    fontVariant: ['tabular-nums', 'lining-nums'],
    color: ON_DARK,
    marginTop: 2,
  },
  // Web Stopwatch.tsx:73 cluster `flex items-center gap-0.5` = 2px entre botones.
  utilRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: 2 },
  // Web Stopwatch.tsx:77/87/96/105 botones `h-11 w-11 md:h-8 md:w-8 rounded-full` = 44px móvil,
  // circulares. Icono en 14px. Antes 36px + hitSlop dejaba el círculo visible en 36px; ahora es 44px
  // y cumple el touch-target sin hitSlop. borderRadius 22 = diámetro/2.
  utilBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  laps: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  // Web Stopwatch.tsx:116 `rounded` = 4px (default Tailwind, no hay token de 4px en la escala RN).
  lapChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.06)' },
  // Web Stopwatch.tsx:116 `text-[10px] font-bold tabular-nums` = 10px / UI bold / cifras tabulares.
  lapText: {
    fontSize: 10,
    lineHeight: 14,
    fontFamily: FONT.uiBold,
    fontVariant: ['tabular-nums', 'lining-nums'],
    color: ON_DARK_MUTED,
  },
})
