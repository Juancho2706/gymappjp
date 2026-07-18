import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MotiView } from 'moti'
import Animated, { useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated'
import { BlurView } from 'expo-blur'
import Svg, { Circle, G } from 'react-native-svg'
import { Pause, Play, RotateCcw, X } from 'lucide-react-native'
import { useEvaMotion, EASE } from '../../../../lib/motion'
import { useTheme } from '../../../../context/ThemeContext'
import { textStyle, FONT } from '../../../../lib/typography'
import { SHADOWS } from '../../../../lib/shadows'
import { timerHaptics } from '../../../../lib/haptics'
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

// Espeja web HoldTimer.tsx:85-93: el círculo de progreso es un <circle> con
// `transition-all duration-300 ease-linear`, así que strokeDashoffset se INTERPOLA
// 300ms lineal entre los valores por-segundo (el anillo drena de forma fluida, no a
// escalones). Reanimated anima la prop nativa de SVG por el mismo camino.
const AnimatedCircle = Animated.createAnimatedComponent(Circle)

const R = 18
// Espeja la matemática de la web (HoldTimer.tsx:66,90-91): strokeDasharray fija en 176
// (mayor que la circunferencia real 2π·18≈113.1), por lo que el anillo se ve LLENO desde
// pct=100 hasta ~pct=64.3 y recién ahí empieza a vaciarse. Reproducir la curva exacta que
// ve el usuario en la web, no la circunferencia geométrica.
const DASH = 176

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
    // Web HoldTimer.tsx:34 dispara triggerHaptic([200,100,400]); en Android replicamos
    // el patrón exacto (en iOS, tap fijo — igual que la web).
    timerHaptics.holdDone()
    // Web HoldTimer.tsx:33 dispara `playTimerSound(readRestTimerSound(), readRestTimerVolume())`
    // SIN leer ningún flag de mute: `readRestTimerMuted` se consume SOLO en la barra de descanso
    // (RestTimer.tsx:14,61), así que mutear el rest-timer NO silencia el beep de fin de hold en web
    // (sólo lo gatea el volumen 0–1). Para espejarlo, `force: true` omite el gate de mute de
    // `playTimerCue` (que sí aplica al 'alarm'/'tick' del rest-timer). La háptica ya sonó arriba.
    playTimerCue('done', { force: true })
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

  // Paridad estricta con la web (`HoldTimer.tsx:107-125`): los controles de pausa/repetir
  // NO emiten háptica en su onClick — la web solo dispara háptica en el EVENTO de fin
  // (`triggerDone`). Se retira el `haptics.tap()` que RN había añadido para no divergir.
  const restart = useCallback(() => {
    firedRef.current = false
    endTimeRef.current = null
    setTimeLeft(initialSeconds)
    setIsActive(true)
  }, [initialSeconds])

  const toggle = useCallback(() => {
    setIsActive((v) => !v)
  }, [])

  const done = timeLeft === 0
  const pct = (timeLeft / (initialSeconds || 1)) * 100
  const dashoffset = DASH - (DASH * Math.min(100, pct)) / 100

  // Interpola strokeDashoffset 300ms lineal (espeja `transition-all duration-300 ease-linear`
  // de la web, `HoldTimer.tsx:92`). Esa micro-animación del anillo es CSS puro y NO está gateada
  // por `useReducedMotion` en la web (reduce-motion solo apaga la ENTRADA del contenedor, línea
  // 71/73), así que el drenado sigue animando 300ms incluso con reduce-motion activo — se mantiene
  // fijo aquí para no saltar por escalones per-segundo.
  const dashSV = useSharedValue(dashoffset)
  useEffect(() => {
    dashSV.value = withTiming(dashoffset, { duration: 300, easing: EASE.linear })
  }, [dashoffset, dashSV])
  const progressProps = useAnimatedProps(() => ({ strokeDashoffset: dashSV.value }))

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
        // Salida — DIVERGENCIA CONSCIENTE, favorable a RN (no un espejo del comportamiento REAL del web).
        // El web DECLARA `exit={reducedMotion ? undefined : { y: -24, opacity: 0 }}` (HoldTimer.tsx:73)
        // pero NUNCA lo reproduce: su <AnimatePresence> vive DENTRO del componente (HoldTimer.tsx:69) y el
        // provider lo monta con `&&` (WorkoutTimerProvider.tsx:132-134); al cerrar hace `setActive(null)`
        // (:120), desmontando el motion.div JUNTO con su AnimatePresence. framer-motion no puede animar el
        // exit de un hijo que se desmonta a la vez que su propio AnimatePresence, así que en web la tarjeta
        // desaparece de golpe (bug latente del web). RN honra la INTENCIÓN del SPEC (sección 1: exit -24px +
        // fade 200ms) subiendo el <AnimatePresence> de moti al overlay estable del `TimerProvider`
        // (key='timer-overlay' → solo la transición activo↔null dispara exit). Bajo reduce-motion se omite.
        exit={motion.reduced ? undefined : { opacity: 0, translateY: -24 }}
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
        {done ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.doneOverlay]} /> : null}
        <View style={styles.left}>
          <View style={styles.ringWrap}>
            <Svg width={44} height={44} viewBox="0 0 44 44">
              <G rotation={-90} origin="22, 22">
                <Circle cx={22} cy={22} r={R} strokeWidth={3} fill="none" stroke={TRACK_ON_DARK} />
                {/* Web HoldTimer.tsx:85-93: el <circle> de progreso NO declara strokeLinecap,
                    así que usa el default SVG 'butt' (extremos planos). No añadir 'round' aquí
                    para no redondear el borde delantero/trasero del arco mientras drena. */}
                <AnimatedCircle
                  cx={22}
                  cy={22}
                  r={R}
                  strokeWidth={3}
                  fill="none"
                  stroke={EMBER_500}
                  strokeDasharray={DASH}
                  animatedProps={progressProps}
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
            style={({ pressed }) => [styles.utilBtn, pressed && styles.utilBtnPressed]}
          >
            {isActive ? <Pause size={14} color={ON_DARK_MUTED} /> : <Play size={14} color={ON_DARK_MUTED} />}
          </Pressable>
          <Pressable
            testID="hold-timer-restart"
            onPress={restart}
            accessibilityRole="button"
            accessibilityLabel="Repetir hold"
            style={({ pressed }) => [styles.utilBtn, pressed && styles.utilBtnPressed]}
          >
            <RotateCcw size={14} color={ON_DARK_MUTED} />
          </Pressable>
          <Pressable
            testID="hold-timer-close"
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cerrar timer"
            style={({ pressed }) => [styles.utilBtn, pressed && styles.utilBtnPressed]}
          >
            <X size={14} color={ON_DARK_MUTED} />
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
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    minHeight: 44,
  },
  veil: { backgroundColor: `${INK_900}F2` }, // ink-900 @ 95% sobre el blur (espeja `bg-[var(--ink-900)]/95`)
  doneOverlay: { backgroundColor: `${EMBER_500}26` }, // ember-500 @ 15% (espeja `bg-[var(--ember-500)]/15`)
  left: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  ringWrap: { width: 44, height: 44, position: 'relative' },
  ringCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  // Web HoldTimer.tsx:95 `text-xs font-bold tabular-nums text-on-dark` = 13px, fuente UI (body)
  // en negrita con cifras tabulares, NO monoespaciada. Espeja el mismo tratamiento que el
  // bigTime de Interval/Stopwatch (displayBlack/uiBold + fontVariant tabular), y la subLine
  // hermana que usa FONT.uiBold. `tabular-nums`+`lining-nums` alinea los dígitos del countdown.
  ringTime: {
    ...textStyle('xs', FONT.uiBold),
    fontVariant: ['tabular-nums', 'lining-nums'],
    color: ON_DARK,
  },
  textCol: { flexShrink: 1, minWidth: 0 },
  // Web HoldTimer.tsx:98 `text-[10px] font-semibold uppercase tracking-wider` = 10px / peso 600 /
  // tracking 0.05em (=0.5pt a 10px). No usar TYPE.eyebrow (12px/700/0.12em).
  eyebrow: {
    fontSize: 10,
    lineHeight: 14,
    fontFamily: FONT.uiSemibold,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: ON_DARK_MUTED,
  },
  subLine: { ...textStyle('xs', FONT.uiBold), color: ON_DARK, marginTop: 1 },
  // Web HoldTimer.tsx:106 cluster `flex items-center gap-0.5` = 2px entre botones.
  utilRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: 2 },
  // Web HoldTimer.tsx:110,119,129 botones `h-11 w-11 md:h-8 md:w-8 rounded-full` = 44px en móvil
  // (h-11/w-11), circulares. Antes 36px + hitSlop dejaba el círculo visible (highlight/pressed)
  // en 36px; ahora el círculo visible es 44px y ya cumple el touch-target sin hitSlop. El icono
  // sigue en 14px (w-3.5 h-3.5). borderRadius 22 = diámetro/2 → círculo perfecto.
  utilBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  // Feedback táctil de pulsación: espeja el `active:scale-[0.97]` del primitivo web `Button`
  // (button.tsx:14, aplicado a los tres botones ghost/icon de la fila). En touch `:active` da un
  // micro-encogido al presionar Pausar/Repetir/Cerrar; RN lo reproduce con `pressed && scale 0.97`.
  // (La otra mitad `hover:bg-white/10` es sólo desktop y se omite correctamente.)
  utilBtnPressed: { transform: [{ scale: 0.97 }] },
})
