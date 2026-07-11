import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, G } from 'react-native-svg'
import { MotiView } from 'moti'
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated'
import { Pause, Play, RotateCcw, Volume2, VolumeX, X } from 'lucide-react-native'
import { useEvaMotion } from '../../../../lib/motion'
import { textStyle, FONT } from '../../../../lib/typography'
import { SHADOWS } from '../../../../lib/shadows'
import { haptics, timerHaptics } from '../../../../lib/haptics'
import {
  EMBER_200,
  EMBER_300,
  EMBER_500,
  INK_900,
  ON_DARK,
  ON_DARK_MUTED,
  TRACK_ON_DARK,
} from './timer-colors'
import { isRestTimerMuted, setRestTimerMuted, subscribeRestTimerPrefs } from './rest-timer-preferences'
import { playTimerCue } from './sound'
import { cancelRestEndNotification, scheduleRestEndNotification } from './rest-notification'

/**
 * Descanso PROTAGONISTA (E2-09) — barra/overlay inferior con cuenta regresiva.
 * Port RN de la web Fase M `RestTimer.tsx`: anillo grande + tiempo mono gigante,
 * ±15s, pausa/reset/cerrar, mute, alarma al llegar a 0 (háptica en loop + pulso
 * ember + cue de audio gateado), y beeps 3-2-1. Sin confetti (la web solo hace el
 * pulso ember al `done`; el confetti de PR vive a nivel ExecutorV2, no en la barra).
 *
 * Background-safe: la cuenta se calcula desde `endTimeRef` (Date.now() al montar),
 * NO acumulando ticks. Si el SO congela el JS en background, al volver a `active`
 * el tiempo se recalcula correcto (listener de AppState fuerza el recompute).
 * El wake-lock lo maneja el núcleo del ejecutor, no este componente.
 *
 * OMISIÓN CONOCIDA — Media Session / controles de lock-screen y auriculares:
 * la web (`RestTimer.tsx:269-290`) publica `MediaMetadata` mientras corre (title
 * "Descanso activo", artist "{M:SS} restantes", album "EVA Fitness", artwork icono
 * de marca) y registra handlers `pause`→pausa / `play`→reanuda para la pantalla de
 * bloqueo y los botones de auriculares. Este port NO lo replica: RN carecería de un
 * módulo nativo de "now playing" (no hay react-native-track-player / expo-music-control
 * en las deps), así que el descanso NO se puede pausar/reanudar desde la pantalla de
 * bloqueo ni desde los auriculares, ni se muestra metadata ahí. La cuenta en sí sí
 * sigue en background (notif local de fin, ver `rest-notification.ts`); lo omitido es
 * SOLO el control multimedia de lock-screen. Portarlo requeriría añadir un módulo
 * nativo con su config de build (fuera del alcance de esta unidad).
 */
interface RestTimerBarProps {
  initialSeconds: number
  /** "Qué sigue" (próxima serie/ejercicio) mostrado en la barra. */
  nextLabel?: string
  /** Descanso de aproximación (warmup) vs efectivo — solo cambia la etiqueta. */
  warmup?: boolean
  /** Arrancar corriendo (auto-timer) o montar en pausa. Default true. */
  autoStart?: boolean
  onClose: () => void
  /**
   * Registra en el provider el `stopAlarm` de esta barra mientras la alarma suena,
   * para que un toque en CUALQUIER parte de la pantalla del ejecutor la silencie —
   * paridad con el listener GLOBAL de `document` de la web (`RestTimer.tsx:102-111`).
   * El provider lo invoca desde su observador de responder de pantalla completa
   * (`onStartShouldSetResponderCapture`). Se registra al empezar a sonar y se limpia
   * al parar/desmontar. Opcional: si no se pasa, solo silencia el toque SOBRE la barra.
   */
  registerAlarmSilencer?: (silence: (() => void) | null) => void
}

const RING_R = 52
const RING_C = 2 * Math.PI * RING_R

// Anillo animable: espeja el `transition: stroke-dashoffset 0.5s linear` de la web
// (`RestTimer.tsx:353`) para que el arco decrezca suave entre ticks de 500ms en vez
// de saltar. Bajo reduce-motion se fija sin animar (paridad con `transition:none`).
const AnimatedCircle = Animated.createAnimatedComponent(Circle)

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function RestTimerBar({
  initialSeconds,
  nextLabel,
  warmup = false,
  autoStart = true,
  onClose,
  registerAlarmSilencer,
}: RestTimerBarProps) {
  const insets = useSafeAreaInsets()
  const motion = useEvaMotion()

  const [timeLeft, setTimeLeft] = useState(initialSeconds)
  const [totalSeconds, setTotalSeconds] = useState(initialSeconds)
  const [isActive, setIsActive] = useState(autoStart)
  const [isAlarmRinging, setIsAlarmRinging] = useState(false)
  const [muted, setMuted] = useState(isRestTimerMuted())

  const endTimeRef = useRef<number | null>(null)
  const timeLeftRef = useRef(initialSeconds)
  const isActiveRef = useRef(autoStart)
  const alarmIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const alarmCountRef = useRef(0)
  const alarmRingingRef = useRef(false)
  const lastBeepRef = useRef<number | null>(null)

  useEffect(() => {
    isActiveRef.current = isActive
  }, [isActive])

  // Sincroniza el mute con la preferencia global (panel de ajustes ↔ barra).
  useEffect(() => {
    const unsub = subscribeRestTimerPrefs(() => setMuted(isRestTimerMuted()))
    return unsub
  }, [])

  // Permiso de notificaciones: la barra NUNCA promptea al montar (paridad con la
  // web `RestTimer.tsx:132-148`, que solo consulta `Notification.permission` y calla
  // sin permiso — "cero prompts nuevos en medio del entreno"). El único prompt vive
  // tras el botón "Activar permisos" del panel de ajustes (`WorkoutSettingsSheet`).
  // Si ya está concedido, la notif de background se programa en el handler de AppState.

  const stopAlarm = useCallback(() => {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current)
      alarmIntervalRef.current = null
    }
    alarmRingingRef.current = false
    alarmCountRef.current = 0
    setIsAlarmRinging(false)
  }, [])

  // Limpieza dura al desmontar: corta el loop de alarma y cancela cualquier
  // notificación de fin programada (descanso saltado / cerrado no debe sonar luego).
  useEffect(() => () => {
    if (alarmIntervalRef.current) clearInterval(alarmIntervalRef.current)
    void cancelRestEndNotification()
  }, [])

  // Silenciar-alarma-en-cualquier-lado (paridad web `RestTimer.tsx:102-111`): mientras
  // suena, la web añade un listener GLOBAL en `document` que cualquier click/touchstart
  // (en cualquier zona) detiene. Aquí registramos `stopAlarm` en el provider SOLO mientras
  // `isAlarmRinging`, gateado igual que el efecto web (add al empezar / remove al parar),
  // y el observador de pantalla del provider lo invoca ante cualquier toque. Al desmontar
  // limpiamos el registro (equiv. del cleanup `removeEventListener` web).
  useEffect(() => {
    if (!registerAlarmSilencer) return
    registerAlarmSilencer(isAlarmRinging ? stopAlarm : null)
    return () => registerAlarmSilencer(null)
  }, [isAlarmRinging, stopAlarm, registerAlarmSilencer])

  const triggerAlarm = useCallback(() => {
    if (alarmRingingRef.current) return
    alarmRingingRef.current = true
    alarmCountRef.current = 1
    setIsAlarmRinging(true)
    setIsActive(false)
    endTimeRef.current = null

    // Cue HÁPTICO fuerte (primario, nunca se silencia) + audio gateado por mute.
    // Patrón EXACTO de la web (`RestTimer.tsx:128,150`: `triggerHaptic([200,100,200,100,400])`)
    // vía `timerHaptics.restAlarm` — en Android emite esos ms exactos (antes `alarm()` daba
    // Heavy+Success+Heavy, un patrón distinto). El alarma llegó en foreground: cancela la notif
    // local programada (evita el beep duplicado al minimizar justo en el 0).
    timerHaptics.restAlarm()
    void cancelRestEndNotification()
    playTimerCue('alarm')

    // Recordatorio en loop: refuerzo háptico cada 3s hasta 5 veces (como web, que repite el
    // MISMO patrón `[200,100,200,100,400]` en cada iteración — `RestTimer.tsx:128`).
    alarmIntervalRef.current = setInterval(() => {
      alarmCountRef.current += 1
      if (alarmCountRef.current > 5) {
        stopAlarm()
      } else {
        timerHaptics.restAlarm()
        playTimerCue('alarm')
      }
    }, 3000)
  }, [stopAlarm])

  // Cuenta regresiva basada en endTime (resiste throttling de background).
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined
    if (isActive && timeLeft > 0) {
      if (!endTimeRef.current) endTimeRef.current = Date.now() + timeLeft * 1000
      interval = setInterval(() => {
        if (!endTimeRef.current) return
        const next = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
        timeLeftRef.current = next
        setTimeLeft(next)
        if (next === 0) triggerAlarm()
      }, 500)
    } else if (timeLeft === 0 && isActive) {
      triggerAlarm()
    } else if (!isActive) {
      endTimeRef.current = null
    }
    return () => clearInterval(interval)
  }, [isActive, timeLeft, triggerAlarm])

  // Beeps/hápticos suaves 3-2-1 en los últimos 3s (el 0 lo cubre la alarma).
  useEffect(() => {
    if (!isActive) return
    if (timeLeft > 0 && timeLeft <= 3 && lastBeepRef.current !== timeLeft) {
      lastBeepRef.current = timeLeft
      // Paridad de contrato con la web (`RestTimer.tsx:207-213`): en los últimos 3s tanto el beep
      // COMO la háptica están AMBOS dentro del guard `if (!mutedRef.current)`. Con mute activo el
      // countdown 3-2-1 queda totalmente silencioso Y sin háptica (antes RN vibraba igual). La
      // alarma FINAL sí conserva háptica con mute en ambos lados; el 3-2-1 no.
      if (!isRestTimerMuted()) {
        void haptics.select()
        playTimerCue('tick')
      }
    }
  }, [timeLeft, isActive])

  // AppState: al IRSE a background con el descanso corriendo, programa una
  // notificación local que dispare al terminar (el JS se congela; el SO la
  // entrega). Al VOLVER a foreground, cancela esa notif (el cue lo da el timer
  // in-app) y recomputa desde endTime (corrige el tiempo congelado).
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void cancelRestEndNotification()
        if (!endTimeRef.current) return
        const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
        timeLeftRef.current = remaining
        setTimeLeft(remaining)
        if (remaining === 0) triggerAlarm()
      } else {
        // background / inactive: si corre, agenda el cue nativo de fin.
        if (!isActiveRef.current || !endTimeRef.current) return
        const remaining = Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
        if (remaining > 0) void scheduleRestEndNotification(remaining)
      }
    })
    return () => sub.remove()
  }, [triggerAlarm])

  const toggleTimer = useCallback(() => {
    void haptics.tap()
    setIsActive((a) => !a)
  }, [])

  const resetTimer = useCallback(() => {
    stopAlarm()
    void cancelRestEndNotification()
    void haptics.tap()
    setTimeLeft(initialSeconds)
    setTotalSeconds(initialSeconds)
    timeLeftRef.current = initialSeconds
    lastBeepRef.current = null
    endTimeRef.current = null
    setIsActive(true)
  }, [initialSeconds, stopAlarm])

  // ±15s al vuelo. Reanuda si veníamos del 0 (alarma); mantiene pausa si pausado.
  const adjust = useCallback(
    (delta: number) => {
      void haptics.select()
      const prev = timeLeftRef.current
      const next = Math.max(0, prev + delta)
      timeLeftRef.current = next
      setTimeLeft(next)
      setTotalSeconds((t) => (next > t ? next : t))
      if (next <= 3) lastBeepRef.current = null

      if (next === 0) {
        endTimeRef.current = null
      } else if (prev === 0) {
        stopAlarm()
        setIsActive(true)
        endTimeRef.current = Date.now() + next * 1000
      } else if (isActiveRef.current) {
        endTimeRef.current = Date.now() + next * 1000
      } else {
        endTimeRef.current = null
      }
    },
    [stopAlarm],
  )

  const toggleMute = useCallback(() => {
    void haptics.tap()
    setRestTimerMuted(!isRestTimerMuted())
  }, [])

  const handleClose = useCallback(() => {
    stopAlarm()
    void cancelRestEndNotification()
    onClose()
  }, [onClose, stopAlarm])

  // Tap-para-silenciar SOBRE la barra (paridad web `RestTimer.tsx:102-111`: mientras
  // suena, un `click`/`touchstart` detiene la alarma). `onTouchStart` corre al iniciar
  // el gesto aunque el toque caiga sobre un botón interno (pausa/±15s/mute), así el toque
  // detiene la alarma y además ejecuta su acción. La paridad COMPLETA con el listener
  // global de `document` de la web (silenciar tocando la fila de serie, el fondo o
  // cualquier zona fuera de la barra) la aporta el observador de pantalla del provider
  // (`onStartShouldSetResponderCapture` en `TimerProvider`, alimentado por
  // `registerAlarmSilencer`); este handler local queda como refuerzo directo sobre la barra.
  const handleBarTouchStart = useCallback(() => {
    if (alarmRingingRef.current) stopAlarm()
  }, [stopAlarm])

  const done = timeLeft === 0
  const frac = Math.max(0, Math.min(1, timeLeft / (totalSeconds || 1)))
  const dashoffset = RING_C * (1 - frac)

  // Barrido suave del anillo (espeja `stroke-dashoffset 0.5s linear` web): anima el
  // offset entre ticks de 500ms; bajo reduce-motion se fija sin transición.
  const animatedOffset = useSharedValue(dashoffset)
  useEffect(() => {
    animatedOffset.value = motion.reduced
      ? dashoffset
      : withTiming(dashoffset, { duration: 500, easing: Easing.linear })
  }, [dashoffset, motion.reduced, animatedOffset])
  const ringAnimatedProps = useAnimatedProps(() => ({ strokeDashoffset: animatedOffset.value }))

  const bottomOffset = insets.bottom + 88 // sobre el footer de Finalizar (≈ web +5.5rem)

  return (
    <View
      pointerEvents="box-none"
      style={[styles.anchor, { bottom: bottomOffset, left: insets.left + 12, right: insets.right + 12 }]}
    >
        <MotiView
          style={[styles.bar, SHADOWS.dark.xl, done ? styles.barDone : styles.barIdle]}
          onTouchStart={handleBarTouchStart}
          accessibilityRole="timer"
          // Entrada tipo bottom-sheet (espeja `springsSheet.enter` web: slide-up + fade).
          from={motion.reduced ? undefined : { opacity: 0, translateY: 40 }}
          animate={{ opacity: 1, translateY: 0 }}
          // Salida (espeja `exit={{ y:40, opacity:0 }}` web `RestTimer.tsx:307`): al cerrar/saltar
          // el descanso la barra se desliza hacia abajo y se desvanece en vez de desaparecer de golpe.
          // Requiere el <AnimatePresence> de moti en `TimerProvider` (envuelve el overlay de timers).
          // Bajo reduce-motion se omite (paridad `exit=undefined` web).
          exit={motion.reduced ? undefined : { opacity: 0, translateY: 40 }}
          transition={
            motion.reduced
              ? { type: 'timing', duration: 0 }
              : { type: 'spring', stiffness: 320, damping: 34, mass: 0.9 }
          }
        >
          {/* Pulso ember al llegar a 0. */}
          {done ? (
            motion.reduced ? (
              <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.pulseStatic]} />
            ) : (
              <MotiView
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, styles.pulse]}
                from={{ opacity: 0.2 }}
                animate={{ opacity: 0.5 }}
                // Ritmo del pulso = paridad exacta con la web (`RestTimer.tsx:325-326`): opacity
                // [0.2,0.5,0.2] con `duration:1.1, ease:'easeInOut'` → ciclo COMPLETO 0.2→0.5→0.2 en 1.1s.
                // Con `loop:true` Moti hace ping-pong (reverse), así cada MEDIO ciclo (0.2→0.5) dura
                // `duration`; por eso 550ms para que el ciclo completo iguale los 1.1s web (antes 1100ms
                // daba ~2200ms, el doble de lento). Easing inOut para el mismo perfil que easeInOut.
                transition={{ type: 'timing', duration: 550, easing: Easing.inOut(Easing.ease), loop: true }}
              />
            )
          ) : null}

          <View style={styles.row}>
            {/* Anillo grande + tiempo gigante */}
            <View style={styles.ringWrap}>
              <Svg width={96} height={96} viewBox="0 0 120 120">
                <G rotation={-90} origin="60, 60">
                  <Circle cx={60} cy={60} r={RING_R} strokeWidth={9} fill="none" stroke={TRACK_ON_DARK} />
                  <AnimatedCircle
                    cx={60}
                    cy={60}
                    r={RING_R}
                    strokeWidth={9}
                    fill="none"
                    stroke={EMBER_500}
                    strokeLinecap="round"
                    strokeDasharray={RING_C}
                    animatedProps={ringAnimatedProps}
                  />
                </G>
              </Svg>
              <View style={styles.ringCenter} pointerEvents="none">
                <Text style={styles.bigTime}>{formatTime(timeLeft)}</Text>
              </View>
            </View>

            {/* Info + controles */}
            <View style={styles.info}>
              <View style={styles.infoTop}>
                <View style={styles.infoText}>
                  <Text style={styles.eyebrow}>{warmup ? 'Aproximación' : 'Descanso'}</Text>
                  <Text style={styles.subLine} numberOfLines={1}>
                    {done ? (
                      '¡A entrenar!'
                    ) : nextLabel ? (
                      <>
                        Sigue · <Text style={styles.subLineMuted}>{nextLabel}</Text>
                      </>
                    ) : (
                      'Recupérate'
                    )}
                  </Text>
                </View>
                <View style={styles.utilRow}>
                  <UtilButton testID="rest-timer-pause" onPress={toggleTimer} label={isActive ? 'Pausar' : 'Reanudar'}>
                    {isActive ? <Pause size={16} color={ON_DARK_MUTED} /> : <Play size={16} color={ON_DARK_MUTED} />}
                  </UtilButton>
                  <UtilButton testID="rest-timer-reset" onPress={resetTimer} label="Reiniciar descanso">
                    <RotateCcw size={16} color={ON_DARK_MUTED} />
                  </UtilButton>
                  <UtilButton testID="rest-timer-close" onPress={handleClose} label="Cerrar descanso">
                    <X size={16} color={ON_DARK_MUTED} />
                  </UtilButton>
                </View>
              </View>

              {/* ±15s + mute */}
              <View style={styles.adjustRow}>
                <Pressable
                  testID="rest-timer-sub-15"
                  onPress={() => adjust(-15)}
                  accessibilityRole="button"
                  accessibilityLabel="Restar 15 segundos"
                  // Micro-escala al presionar (espeja `active:scale-95` web `RestTimer.tsx:396`).
                  style={({ pressed }) => [styles.adjustBtn, pressed && styles.pressedScale]}
                >
                  <Text style={styles.adjustLabel}>−15s</Text>
                </Pressable>
                <Pressable
                  testID="rest-timer-add-15"
                  onPress={() => adjust(15)}
                  accessibilityRole="button"
                  accessibilityLabel="Sumar 15 segundos"
                  // Micro-escala al presionar (espeja `active:scale-95` web `RestTimer.tsx:404`).
                  style={({ pressed }) => [styles.adjustBtn, pressed && styles.pressedScale]}
                >
                  <Text style={styles.adjustLabel}>+15s</Text>
                </Pressable>
                <Pressable
                  testID="rest-timer-mute"
                  onPress={toggleMute}
                  accessibilityRole="button"
                  accessibilityState={{ selected: muted }}
                  accessibilityLabel={muted ? 'Activar sonido del descanso' : 'Silenciar descanso'}
                  // Micro-escala al presionar (espeja `active:scale-95` web `RestTimer.tsx:414`).
                  style={({ pressed }) => [
                    styles.muteBtn,
                    muted ? styles.muteOff : styles.muteOn,
                    pressed && styles.pressedScale,
                  ]}
                >
                  {muted ? <VolumeX size={16} color={ON_DARK_MUTED} /> : <Volume2 size={16} color={EMBER_200} />}
                </Pressable>
              </View>
            </View>
          </View>
        </MotiView>
    </View>
  )
}

function UtilButton({
  children,
  onPress,
  label,
  testID,
}: {
  children: React.ReactNode
  onPress: () => void
  label: string
  testID: string
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      style={styles.utilBtn}
    >
      {children}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', maxWidth: 460, alignSelf: 'center', width: '100%' },
  bar: {
    borderRadius: 28,
    borderWidth: 1,
    backgroundColor: `${INK_900}F2`, // ink-900 @ ~95%
    overflow: 'hidden',
    padding: 14,
  },
  barIdle: { borderColor: TRACK_ON_DARK },
  barDone: { borderColor: `${EMBER_500}99` },
  pulse: { backgroundColor: `${EMBER_500}33` },
  pulseStatic: { backgroundColor: `${EMBER_500}26` },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  ringWrap: { width: 96, height: 96, position: 'relative' },
  ringCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  // Web `RestTimer.tsx:357` usa `.eva-metric text-[1.75rem] leading-none`; `.eva-metric`
  // (globals.css:1272-1277) = `font-family: var(--font-display); font-weight: 800;
  // font-variant-numeric: tabular-nums; letter-spacing: -0.01em`. Es decir el contador se
  // pinta en la fuente DISPLAY (Archivo ExtraBold), NO monoespaciada → aquí `FONT.displayBold`
  // (Archivo_800ExtraBold, typography.ts:38) para igualar el typeface. Se conserva
  // `tabular-nums` (eva-metric lo usa para que los dígitos no salten de ancho al descontar,
  // 1:11 → 1:09) y se añade letterSpacing -0.28 (−0.01em · 28px). Fijo a 28 (no '3xl'=31).
  bigTime: {
    fontFamily: FONT.displayBold,
    fontSize: 28,
    lineHeight: 28,
    letterSpacing: -0.28,
    fontVariant: ['tabular-nums', 'lining-nums'],
    color: ON_DARK,
  },
  info: { flex: 1, minWidth: 0 },
  infoTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  infoText: { flexShrink: 1, minWidth: 0 },
  // Web `RestTimer.tsx:367`: `text-[10px] font-bold uppercase tracking-[0.14em]` = 10px, ls 10·0.14=1.4.
  eyebrow: {
    fontFamily: FONT.uiBold,
    fontSize: 10,
    lineHeight: 14,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: EMBER_300,
  },
  // Web `RestTimer.tsx:370`: `text-[13px] font-semibold` = 13px ('xs'), semibold.
  subLine: { ...textStyle('xs', FONT.uiSemibold), color: ON_DARK, marginTop: 2 },
  subLineMuted: { color: ON_DARK_MUTED }, // el "qué sigue" en tono atenuado (espeja `text-on-dark-muted` web)
  utilRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  utilBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  adjustRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  adjustBtn: {
    flex: 1,
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: TRACK_ON_DARK,
    backgroundColor: 'rgba(255,255,255,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  adjustLabel: { ...textStyle('sm', FONT.uiBold), color: ON_DARK },
  muteBtn: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  muteOn: { borderColor: `${EMBER_500}4D`, backgroundColor: `${EMBER_500}1F` },
  muteOff: { borderColor: TRACK_ON_DARK, backgroundColor: 'rgba(255,255,255,0.03)' },
  // Espeja `active:scale-95` web: micro-escala al presionar en ±15s y mute (los utilitarios
  // pausa/reset/cerrar NO llevan escala en la web — solo hover).
  pressedScale: { transform: [{ scale: 0.95 }] },
})
