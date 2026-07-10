import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, G } from 'react-native-svg'
import { MotiView } from 'moti'
import { Confetti } from 'react-native-fast-confetti'
import { Pause, Play, RotateCcw, Volume2, VolumeX, X } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useEvaMotion } from '../../../../lib/motion'
import { TYPE, textStyle, FONT } from '../../../../lib/typography'
import { SHADOWS } from '../../../../lib/shadows'
import { haptics } from '../../../../lib/haptics'
import {
  CONFETTI_COLORS,
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
import {
  cancelRestEndNotification,
  ensureRestNotifPermission,
  scheduleRestEndNotification,
} from './rest-notification'

/**
 * Descanso PROTAGONISTA (E2-09) — barra/overlay inferior con cuenta regresiva.
 * Port RN de la web Fase M `RestTimer.tsx`: anillo grande + tiempo mono gigante,
 * ±15s, pausa/reset/cerrar, mute, alarma al llegar a 0 (háptica en loop + pulso
 * ember + confetti + cue de audio gateado), y beeps 3-2-1.
 *
 * Background-safe: la cuenta se calcula desde `endTimeRef` (Date.now() al montar),
 * NO acumulando ticks. Si el SO congela el JS en background, al volver a `active`
 * el tiempo se recalcula correcto (listener de AppState fuerza el recompute).
 * El wake-lock lo maneja el núcleo del ejecutor, no este componente.
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
}

const RING_R = 52
const RING_C = 2 * Math.PI * RING_R

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function RestTimerBar({ initialSeconds, nextLabel, warmup = false, autoStart = true, onClose }: RestTimerBarProps) {
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

  // Permiso de notificaciones LAZY: la barra solo se monta al iniciar un descanso,
  // así que esto es "la primera vez que se usa el timer" (pedido de la Ronda 4).
  useEffect(() => {
    void ensureRestNotifPermission()
  }, [])

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

  const triggerAlarm = useCallback(() => {
    if (alarmRingingRef.current) return
    alarmRingingRef.current = true
    alarmCountRef.current = 1
    setIsAlarmRinging(true)
    setIsActive(false)
    endTimeRef.current = null

    // Cue HÁPTICO fuerte (primario, nunca se silencia) + audio gateado por mute.
    // El alarma llegó en foreground: cancela la notif local programada (evita el
    // beep duplicado al minimizar justo en el 0).
    void haptics.alarm()
    void cancelRestEndNotification()
    playTimerCue('alarm')

    // Recordatorio en loop: refuerzo háptico cada 3s hasta 5 veces (como web).
    alarmIntervalRef.current = setInterval(() => {
      alarmCountRef.current += 1
      if (alarmCountRef.current > 5) {
        stopAlarm()
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
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
      void haptics.select()
      playTimerCue('tick')
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

  const done = timeLeft === 0
  const frac = Math.max(0, Math.min(1, timeLeft / (totalSeconds || 1)))
  const dashoffset = RING_C * (1 - frac)

  const bottomOffset = insets.bottom + 88 // sobre el footer de Finalizar (≈ web +5.5rem)

  return (
    <>
      {done && !motion.reduced ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Confetti autoplay fadeOutOnEnd colors={[...CONFETTI_COLORS]} />
        </View>
      ) : null}

      <View
        pointerEvents="box-none"
        style={[styles.anchor, { bottom: bottomOffset, left: insets.left + 12, right: insets.right + 12 }]}
      >
        <MotiView
          style={[styles.bar, SHADOWS.dark.xl, done ? styles.barDone : styles.barIdle]}
          accessibilityRole="timer"
          // Entrada tipo bottom-sheet (espeja `springsSheet.enter` web: slide-up + fade).
          from={motion.reduced ? undefined : { opacity: 0, translateY: 40 }}
          animate={{ opacity: 1, translateY: 0 }}
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
                transition={{ type: 'timing', duration: 1100, loop: true }}
              />
            )
          ) : null}

          <View style={styles.row}>
            {/* Anillo grande + tiempo gigante */}
            <View style={styles.ringWrap}>
              <Svg width={96} height={96} viewBox="0 0 120 120">
                <G rotation={-90} origin="60, 60">
                  <Circle cx={60} cy={60} r={RING_R} strokeWidth={9} fill="none" stroke={TRACK_ON_DARK} />
                  <Circle
                    cx={60}
                    cy={60}
                    r={RING_R}
                    strokeWidth={9}
                    fill="none"
                    stroke={EMBER_500}
                    strokeLinecap="round"
                    strokeDasharray={RING_C}
                    strokeDashoffset={dashoffset}
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
                  style={styles.adjustBtn}
                >
                  <Text style={styles.adjustLabel}>−15s</Text>
                </Pressable>
                <Pressable
                  testID="rest-timer-add-15"
                  onPress={() => adjust(15)}
                  accessibilityRole="button"
                  accessibilityLabel="Sumar 15 segundos"
                  style={styles.adjustBtn}
                >
                  <Text style={styles.adjustLabel}>+15s</Text>
                </Pressable>
                <Pressable
                  testID="rest-timer-mute"
                  onPress={toggleMute}
                  accessibilityRole="button"
                  accessibilityState={{ selected: muted }}
                  accessibilityLabel={muted ? 'Activar sonido del descanso' : 'Silenciar descanso'}
                  style={[styles.muteBtn, muted ? styles.muteOff : styles.muteOn]}
                >
                  {muted ? <VolumeX size={16} color={ON_DARK_MUTED} /> : <Volume2 size={16} color={EMBER_200} />}
                </Pressable>
              </View>
            </View>
          </View>
        </MotiView>
      </View>
    </>
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
  bigTime: { ...textStyle('3xl', FONT.monoBold, { lh: 'tight' }), color: ON_DARK },
  info: { flex: 1, minWidth: 0 },
  infoTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  infoText: { flexShrink: 1, minWidth: 0 },
  eyebrow: { ...TYPE.eyebrow, color: EMBER_300 },
  subLine: { ...TYPE.label, color: ON_DARK, marginTop: 2 },
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
})
