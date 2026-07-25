import { useCallback, useEffect } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, G } from 'react-native-svg'
import { MotiView } from 'moti'
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated'
import { ChevronUp, Pause, Play, RotateCcw, Volume2, VolumeX, X } from 'lucide-react-native'
import { useEvaMotion } from '../../../../lib/motion'
import { textStyle, FONT } from '../../../../lib/typography'
import { SHADOWS } from '../../../../lib/shadows'
import {
  EMBER_200,
  EMBER_300,
  EMBER_500,
  INK_900,
  ON_DARK,
  ON_DARK_MUTED,
  TRACK_ON_DARK,
} from './timer-colors'
import type { RestTimerEngine } from './useRestTimerEngine'

/**
 * Descanso PROTAGONISTA (E2-09) — barra/overlay inferior con cuenta regresiva.
 * Port RN de la web Fase M `RestTimer.tsx`: anillo grande + tiempo mono gigante,
 * ±15s, pausa/reset/cerrar, mute, alarma al llegar a 0 (pulso ember), y beeps 3-2-1.
 *
 * REFACTOR E3.1: esta barra ya NO posee el cronometro — es PURA PRESENTACION. El motor
 * (cuenta endTime-based, alarma, notificaciones, controles) vive en `useRestTimerEngine`
 * y lo instancia el `RestTimerHost` UNA vez, pasandolo aqui por prop. Asi el interstitial
 * V3 y esta barra comparten EL MISMO cronometro (al minimizar/expandir no se re-monta el
 * motor). El comportamiento observable es identico al de Ola 2.
 */
interface RestTimerBarProps {
  /** Motor compartido (instanciado por el host). */
  engine: RestTimerEngine
  /** "Qué sigue" (próxima serie/ejercicio) mostrado en la barra. */
  nextLabel?: string
  /** Descanso de aproximación (warmup) vs efectivo — solo cambia la etiqueta. */
  warmup?: boolean
  /**
   * Si se pasa, la barra es el estado MINIMIZADO del interstitial V3: se muestra un boton
   * "expandir" que vuelve al overlay fullscreen. Fuera de V3 no se pasa (barra clasica).
   */
  onExpand?: () => void
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

export function RestTimerBar({ engine, nextLabel, warmup = false, onExpand }: RestTimerBarProps) {
  const insets = useSafeAreaInsets()
  const motion = useEvaMotion()

  const {
    timeLeft,
    totalSeconds,
    isActive,
    isAlarmRinging,
    muted,
    done,
    toggleTimer,
    resetTimer,
    adjust,
    toggleMute,
    stopAlarm,
    close: handleClose,
  } = engine

  // Tap-para-silenciar SOBRE la barra (paridad web `RestTimer.tsx:102-111`): mientras suena,
  // un toque detiene la alarma. El observador de pantalla del provider aporta la paridad completa
  // (silenciar tocando cualquier zona); este handler es el refuerzo directo sobre la barra.
  const handleBarTouchStart = useCallback(() => {
    if (isAlarmRinging) stopAlarm()
  }, [isAlarmRinging, stopAlarm])

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
                  {onExpand ? (
                    <UtilButton testID="rest-timer-expand" onPress={onExpand} label="Ver descanso completo">
                      <ChevronUp size={16} color={ON_DARK_MUTED} />
                    </UtilButton>
                  ) : null}
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
