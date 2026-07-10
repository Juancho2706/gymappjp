import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MotiView } from 'moti'
import { BlurView } from 'expo-blur'
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'
import { Pause, Play, SkipForward, Sun, X } from 'lucide-react-native'
import { INTERVAL_PHASE_LABEL, type IntervalPhase, type IntervalPhaseKind } from '@eva/workout-engine'
import { useEvaMotion, EASE } from '../../../../lib/motion'
import { useTheme } from '../../../../context/ThemeContext'
import { textStyle, FONT } from '../../../../lib/typography'
import { SHADOWS } from '../../../../lib/shadows'
import { timerHaptics } from '../../../../lib/haptics'
import {
  AQUA_500,
  EMBER_300,
  EMBER_500,
  INK_900,
  ON_DARK,
  ON_DARK_MUTED,
  SPORT_300,
  SUCCESS_500,
  TRACK_ON_DARK,
  WARNING_500,
} from './timer-colors'
import { playTimerCue } from './sound'

/**
 * Timer de INTERVALOS (cardio/HYROX/fartlek) — port RN de la web `IntervalTimer.tsx`.
 * Consume la máquina de fases PURA del motor (`buildIntervalPhases` corre en el
 * provider; acá se recibe `phases`). Muestra fase (warmup/work/recovery/cooldown)
 * con "intervalo N de M", tiempo mono grande, barra de progreso de la fase, y
 * pausa/saltar-fase/cerrar. Cue de audio + háptica en cada cambio de fase (doble
 * al terminar).
 *
 * Wake-lock OPCIONAL con toggle (botón Sun): mantiene la pantalla encendida vía
 * `expo-keep-awake` (equivalente idiomático del `navigator.wakeLock` web — requiere
 * gesto del usuario, avisa del costo de batería y se libera al desmontar). En RN el
 * keep-awake no se suelta al ir a background (no hay que re-adquirir en foreground
 * como en el navegador), pero se re-asegura al volver a `active` por robustez.
 */
const KEEP_AWAKE_TAG = 'eva-interval-timer'

interface IntervalTimerProps {
  phases: IntervalPhase[]
  onClose: () => void
}

// Color de la ETIQUETA de fase (espeja web `PHASE_COLOR`): warmup/cooldown sport-300,
// work ember-300, recovery aqua-500. Ojo: la BARRA usa otro color (work ember-500,
// resto theme-primary) — no confundir con estos.
const PHASE_LABEL_COLOR: Record<IntervalPhaseKind, string> = {
  warmup: SPORT_300,
  work: EMBER_300,
  recovery: AQUA_500,
  cooldown: SPORT_300,
}

function formatTime(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function IntervalTimer({ phases, onClose }: IntervalTimerProps) {
  const insets = useSafeAreaInsets()
  const motion = useEvaMotion()
  const { theme } = useTheme()
  const [phaseIndex, setPhaseIndex] = useState(0)
  const [timeLeft, setTimeLeft] = useState(phases[0]?.durationSec ?? 0)
  const [isActive, setIsActive] = useState(true)
  const [finished, setFinished] = useState(false)
  const [wakeLockOn, setWakeLockOn] = useState(false)
  const endTimeRef = useRef<number | null>(null)
  const phaseIndexRef = useRef(0)
  const wakeLockOnRef = useRef(false)

  const phase = phases[phaseIndex] ?? null

  const cue = useCallback((double: boolean) => {
    // Web IntervalTimer.tsx:45 triggerHaptic(double ? [200,100,200,100,400] : [200,100,200]):
    // fin-de-intervalos y cambio-de-fase son patrones DISTINTOS. En Android replicamos los ms
    // exactos (antes fin colapsaba con fin-de-hold en el mismo notificationAsync); en iOS, tap
    // fijo idiomático por evento (igual que la web, que ahí no diferencia por patrón).
    if (double) timerHaptics.intervalFinish()
    else timerHaptics.intervalPhase()
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

  // Wake-lock con toggle (gesto del usuario). Se re-asegura al volver a foreground
  // (paridad con la re-adquisición web en `visibilitychange`) y se libera al desmontar.
  const toggleWakeLock = useCallback(() => {
    const next = !wakeLockOnRef.current
    wakeLockOnRef.current = next
    setWakeLockOn(next)
    if (next) void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {})
    else void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {})
  }, [])

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return
      if (wakeLockOnRef.current) void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {})
      if (!endTimeRef.current || finished) return
      const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
      setTimeLeft(remaining)
      if (remaining === 0) advance()
    })
    return () => sub.remove()
  }, [advance, finished])

  // Libera el keep-awake si el timer se desmonta con la pantalla aún forzada.
  useEffect(
    () => () => {
      if (wakeLockOnRef.current) void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {})
    },
    [],
  )

  // Paridad estricta con la web (`IntervalTimer.tsx:159-177`): pausa/saltar/wake-lock NO emiten
  // háptica en su onClick — la web solo dispara háptica en el EVENTO de cambio/fin de fase (`cue`).
  // Se retira el `haptics.tap()` que RN había añadido en estos controles para no divergir.
  const toggle = useCallback(() => {
    setIsActive((v) => !v)
  }, [])

  const skip = useCallback(() => {
    advance()
  }, [advance])

  const progress = phase && phase.durationSec > 0 ? (phase.durationSec - timeLeft) / phase.durationSec : 0

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
        // Salida (espeja `exit={reducedMotion ? undefined : { y: -24, opacity: 0 }}` web
        // `IntervalTimer.tsx:123`): al cerrar, la tarjeta se desliza -24px con fade en 200ms en vez de
        // desaparecer de golpe. Lo anima el <AnimatePresence> de moti en `TimerProvider`. Bajo
        // reduce-motion se omite (paridad `exit=undefined` web).
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
        <View style={styles.row}>
          <View style={styles.info}>
            {finished ? (
              <Text style={styles.finished}>¡Intervalos completados!</Text>
            ) : (
              <>
                <Text style={[styles.eyebrow, { color: phase ? PHASE_LABEL_COLOR[phase.kind] : ON_DARK_MUTED }]}>
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
            <Pressable
              testID="interval-timer-wakelock"
              onPress={toggleWakeLock}
              accessibilityRole="button"
              accessibilityLabel="Mantener pantalla encendida"
              accessibilityState={{ selected: wakeLockOn }}
              style={[styles.utilBtn, wakeLockOn ? styles.wakeOn : null]}
            >
              <Sun size={14} color={wakeLockOn ? WARNING_500 : ON_DARK_MUTED} />
            </Pressable>
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
                  {isActive ? <Pause size={14} color={ON_DARK_MUTED} /> : <Play size={14} color={ON_DARK_MUTED} />}
                </Pressable>
                <Pressable
                  testID="interval-timer-skip"
                  onPress={skip}
                  accessibilityRole="button"
                  accessibilityLabel="Saltar fase"
                  hitSlop={6}
                  style={styles.utilBtn}
                >
                  <SkipForward size={14} color={ON_DARK_MUTED} />
                </Pressable>
              </>
            ) : null}
            <Pressable
              testID="interval-timer-close"
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cerrar timer"
              style={styles.utilBtn}
            >
              <X size={14} color={ON_DARK_MUTED} />
            </Pressable>
          </View>
        </View>
        {!finished && phase ? (
          <View style={styles.track}>
            {/* Web IntervalTimer.tsx:195 el relleno lleva `transition-all duration-300 ease-linear`
                y su width se recalcula por-segundo, llenándose de forma FLUIDA. Esa micro-animación es
                CSS puro y NO está gateada por `useReducedMotion` en la web (reduce-motion solo apaga la
                ENTRADA del contenedor, línea 121/123), así que la barra sigue llenándose 300ms incluso
                con reduce-motion activo. MotiView interpola el width con duración fija 300ms lineal para
                espejarlo, en vez de saltar a escalones cada tick. */}
            <MotiView
              style={[styles.fill, { backgroundColor: phase.kind === 'work' ? EMBER_500 : theme.primary }]}
              animate={{ width: `${Math.max(0, Math.min(1, progress)) * 100}%` }}
              transition={{ type: 'timing', duration: 300, easing: EASE.linear }}
            />
          </View>
        ) : null}
        {wakeLockOn ? (
          <Text style={styles.batteryNote}>Pantalla siempre encendida activa — consume más batería.</Text>
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
  finished: { ...textStyle('sm', FONT.uiBold), color: SUCCESS_500 },
  // Web IntervalTimer.tsx:133 `text-[10px] font-black uppercase tracking-widest` = 10px / peso 900
  // (Archivo Black) / tracking 0.1em (=1pt a 10px). El color por fase se aplica inline.
  eyebrow: {
    fontSize: 10,
    lineHeight: 14,
    fontFamily: FONT.displayBlack,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  // Web IntervalTimer.tsx:136 span `font-bold` hereda los 10px del label (no 12px).
  repeat: { fontSize: 10, fontFamily: FONT.uiBold, color: ON_DARK_MUTED },
  // Web IntervalTimer.tsx:139 `text-2xl font-black tabular-nums` = 25px / peso 900. Usa Archivo
  // Black con cifras tabulares para conservar el peso que ve el usuario (no mono/700).
  bigTime: {
    ...textStyle('2xl', FONT.displayBlack, { lh: 'tight' }),
    fontVariant: ['tabular-nums', 'lining-nums'],
    color: ON_DARK,
    marginTop: 2,
  },
  // Web IntervalTimer.tsx:145 cluster `flex items-center gap-0.5` = 2px entre botones.
  utilRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 0, gap: 2 },
  // Web IntervalTimer.tsx:149/162/171/183 botones `h-11 w-11 md:h-8 md:w-8 rounded-full` = 44px móvil,
  // circulares. El pill ámbar del wake-lock (styles.wakeOn) hereda estos 44px. Icono en 14px. Antes
  // 36px + hitSlop dejaba el círculo/pill visible en 36px; ahora es 44px y cumple el touch-target sin
  // hitSlop. borderRadius 22 = diámetro/2.
  utilBtn: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  wakeOn: { backgroundColor: `${WARNING_500}1A` }, // warning-500 @ 10% (espeja `bg-[var(--warning-500)]/10`)
  track: { marginTop: 6, height: 4, borderRadius: 999, backgroundColor: TRACK_ON_DARK, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 999 },
  // Web IntervalTimer.tsx:204 `text-[9px]` = 9px (sin token en la escala; 3xs=11 era ~22% mayor).
  batteryNote: { fontSize: 9, lineHeight: 13, fontFamily: FONT.ui, color: ON_DARK_MUTED, marginTop: 4 },
})
