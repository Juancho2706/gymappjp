import { useCallback, useEffect } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import Svg, { Circle, G } from 'react-native-svg'
import { MotiView } from 'moti'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { Image } from 'expo-image'
import { Check, ChevronDown, Dumbbell, MessageSquareText, SkipForward } from 'lucide-react-native'
import { FONT } from '../../../../lib/typography'
import { hexToRgba } from '../../../../lib/theme'
import { haptics } from '../../../../lib/haptics'
import type { RestTimerEngine, RestInterstitialHostControls } from '../timers'
import type { SessionExercise } from '../../../../lib/workout-session'
import type { ExecTheme } from './exec-theme'
import type { ExerciseListItem } from './ExerciseListV3'

/**
 * Interstitial de descanso V3 (E3.1) — traduccion RN de la pantalla "Descanso + plan" del mockup
 * concepto-a-v3-core. Es una PRESENTACION nueva del MISMO cronometro de descanso: consume el motor
 * (`RestTimerEngine`) que le pasa el `RestTimerHost`; NUNCA duplica la cuenta regresiva ni re-implementa
 * timers. Overlay fullscreen montado SOBRE el stepper (que sigue vivo debajo).
 *
 * Contiene: countdown gigante mm:ss (tabular) + anillo de progreso (Reanimated, decrece con el tiempo
 * restante del MISMO motor), botones -15s / Saltar / +15s (llaman `engine.adjust`/`engine.close`),
 * micro-celebracion "+1 serie" de la serie recien cerrada (spring; reduced-motion ⇒ fade), tarjeta
 * "SIGUIENTE" con mini-media estatica y prescripcion, mensaje del coach si el bloque siguiente lo tiene,
 * y un peek "Plan completo" arrastrable con estados hecho/ahora/pendiente. Boton minimizar → barra.
 *
 * Al llegar a 0 el motor dispara beep/vibracion segun prefs y el overlay se auto-cierra con una
 * transicion corta (el stepper ya quedo en el paso correcto por el auto-avance existente).
 */

export interface RestInterstitialData {
  /** Ejercicio/serie que retoma al terminar el descanso (para la tarjeta SIGUIENTE + mini-media). */
  next: { name: string; prescription: string; exercise: SessionExercise | null } | null
  /** Nota del coach del bloque siguiente (si la hay). */
  coachNote: string | null
  /** Filas del plan (reusa la derivacion de `ExerciseListV3`) para el peek. */
  planItems: ExerciseListItem[]
  /** Indice del paso actual (para resaltar "ahora" en el peek). */
  currentIndex: number
  /** Mostrar la micro-celebracion "+1 serie" (solo si el descanso siguio a cerrar una serie). */
  celebrate: boolean
  exec: ExecTheme
  reducedMotion: boolean
}

const RING_SIZE = 208
const RING_R = 92
const RING_C = 2 * Math.PI * RING_R
const AnimatedCircle = Animated.createAnimatedComponent(Circle)

// Alto del peek visible cuando esta colapsado (handle + encabezado).
const PEEK_VISIBLE = 66
// Alto total del sheet del plan.
const SHEET_HEIGHT = 340

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function RestInterstitialV3({
  engine,
  host,
  data,
}: {
  engine: RestTimerEngine
  host: RestInterstitialHostControls
  data: RestInterstitialData
}) {
  const insets = useSafeAreaInsets()
  const { height: winH } = useWindowDimensions()
  const { exec, reducedMotion } = data
  const s = exec.surface
  const { timeLeft, totalSeconds, done } = engine

  // Auto-cierre al llegar a 0: el motor ya emitio beep/vibracion; damos una transicion corta y cerramos
  // (el stepper quedo en el paso correcto por el auto-avance). Reduced-motion ⇒ cierre casi inmediato.
  useEffect(() => {
    if (!done) return
    const delay = reducedMotion ? 240 : 820
    const t = setTimeout(() => engine.close(), delay)
    return () => clearTimeout(t)
  }, [done, reducedMotion, engine])

  // Anillo: fraccion restante del MISMO motor. Barrido suave entre ticks (paridad RestTimerBar).
  const frac = Math.max(0, Math.min(1, timeLeft / (totalSeconds || 1)))
  const dashoffset = RING_C * (1 - frac)
  const animatedOffset = useSharedValue(dashoffset)
  useEffect(() => {
    animatedOffset.value = reducedMotion
      ? dashoffset
      : withTiming(dashoffset, { duration: 500, easing: Easing.linear })
  }, [dashoffset, reducedMotion, animatedOffset])
  const ringProps = useAnimatedProps(() => ({ strokeDashoffset: animatedOffset.value }))

  // ── Peek "Plan completo": sheet arrastrable (colapsado ↔ expandido). ──
  const collapsedY = SHEET_HEIGHT - PEEK_VISIBLE
  const sheetY = useSharedValue(collapsedY)
  const startY = useSharedValue(collapsedY)
  const snapTo = useCallback(
    (open: boolean) => {
      const target = open ? 0 : collapsedY
      sheetY.value = reducedMotion ? target : withSpring(target, { damping: 24, stiffness: 220, mass: 0.9 })
    },
    [collapsedY, reducedMotion, sheetY],
  )
  const buzz = useCallback(() => { void haptics.tap() }, [])
  const pan = Gesture.Pan()
    .onStart(() => {
      startY.value = sheetY.value
    })
    .onUpdate((e) => {
      const next = startY.value + e.translationY
      sheetY.value = next < 0 ? 0 : next > collapsedY ? collapsedY : next
    })
    .onEnd((e) => {
      const shouldOpen = e.velocityY < -300 || (e.velocityY <= 300 && sheetY.value < collapsedY / 2)
      const target = shouldOpen ? 0 : collapsedY
      sheetY.value = reducedMotion ? target : withSpring(target, { damping: 24, stiffness: 220, mass: 0.9, velocity: e.velocityY })
      runOnJS(buzz)()
    })
  const sheetStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sheetY.value }] }))

  const toggleSheet = useCallback(() => {
    void haptics.tap()
    // Alterna segun donde este mas cerca.
    snapTo(sheetY.value > collapsedY / 2)
  }, [collapsedY, snapTo, sheetY])

  const handleSkip = useCallback(() => {
    void haptics.tap()
    engine.close()
  }, [engine])

  const handleMinimize = useCallback(() => {
    void haptics.tap()
    host.minimize()
  }, [host])

  const next = data.next
  const nextMedia = next?.exercise ?? null

  return (
    <MotiView
      style={[StyleSheet.absoluteFill, { backgroundColor: s.appBg }]}
      from={reducedMotion ? undefined : { opacity: 0, scale: 1.03 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={reducedMotion ? undefined : { opacity: 0, scale: 1.02 }}
      transition={reducedMotion ? { type: 'timing', duration: 0 } : { type: 'timing', duration: 260, easing: Easing.out(Easing.cubic) }}
      pointerEvents="auto"
    >
      <View style={{ flex: 1, paddingTop: insets.top + 8, paddingHorizontal: 18 }}>
        {/* Barra superior: minimizar. */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <Pressable
            testID="rest-interstitial-minimize"
            onPress={handleMinimize}
            hitSlop={10}
            style={{ height: 40, width: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: s.surface, borderWidth: 1.5, borderColor: s.borderStrong }}
            accessibilityRole="button"
            accessibilityLabel="Minimizar el descanso"
          >
            <ChevronDown size={20} color={s.textMuted} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ alignItems: 'center', paddingBottom: PEEK_VISIBLE + 24, gap: 14 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Micro-celebracion "+1 serie". */}
          {data.celebrate && !done && (
            <MotiView
              from={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8, translateY: -6 }}
              animate={{ opacity: 1, scale: 1, translateY: 0 }}
              transition={reducedMotion ? { type: 'timing', duration: 160 } : { type: 'spring', damping: 12, stiffness: 220, mass: 0.7 }}
              style={{ alignItems: 'center', gap: 6 }}
            >
              <Text style={{ fontFamily: FONT.uiExtra, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: exec.accent }}>
                Serie cerrada
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 999, borderWidth: 2, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: hexToRgba(exec.accent, 0.14), borderColor: hexToRgba(exec.accent, 0.34) }}>
                <View style={{ height: 22, width: 22, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: exec.accent }}>
                  <Check size={13} color={exec.accentText} strokeWidth={3} />
                </View>
                <Text style={{ fontFamily: FONT.uiBold, fontSize: 13, color: s.text }}>+1 serie · vas volando</Text>
              </View>
            </MotiView>
          )}

          {/* Countdown gigante + anillo. */}
          <View style={{ width: RING_SIZE, height: RING_SIZE, alignItems: 'center', justifyContent: 'center' }}>
            <Svg width={RING_SIZE} height={RING_SIZE} viewBox="0 0 208 208" style={StyleSheet.absoluteFill}>
              <G rotation={-90} origin="104, 104">
                <Circle cx={104} cy={104} r={RING_R} strokeWidth={14} fill="none" stroke={s.border} />
                <AnimatedCircle
                  cx={104}
                  cy={104}
                  r={RING_R}
                  strokeWidth={14}
                  fill="none"
                  stroke={done ? exec.celebration : exec.accent}
                  strokeLinecap="round"
                  strokeDasharray={RING_C}
                  animatedProps={ringProps}
                />
              </G>
            </Svg>
            <View style={{ alignItems: 'center' }} pointerEvents="none">
              <Text
                accessibilityRole="timer"
                style={{ fontFamily: FONT.displayBlack, fontSize: 56, lineHeight: 58, letterSpacing: -2, color: s.text, fontVariant: ['tabular-nums', 'lining-nums'] }}
              >
                {formatTime(timeLeft)}
              </Text>
              <Text style={{ fontFamily: FONT.uiBold, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: s.textMuted, marginTop: 4 }}>
                {done ? '¡A entrenar!' : 'Descanso'}
              </Text>
            </View>
          </View>

          {/* -15s / Saltar / +15s. */}
          <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
            <RestButton testID="rest-interstitial-sub-15" label="−15s" onPress={() => engine.adjust(-15)} exec={exec} accessibilityLabel="Restar 15 segundos" />
            <RestButton testID="rest-interstitial-skip" label="Saltar" onPress={handleSkip} exec={exec} primary icon={<SkipForward size={16} color={exec.accentText} strokeWidth={2.6} />} accessibilityLabel="Saltar el descanso" />
            <RestButton testID="rest-interstitial-add-15" label="+15s" onPress={() => engine.adjust(15)} exec={exec} accessibilityLabel="Sumar 15 segundos" />
          </View>

          {/* Tarjeta SIGUIENTE + mini-media estatica. */}
          {next && (
            <View style={{ width: '100%', flexDirection: 'row', gap: 12, alignItems: 'center', backgroundColor: s.surface, borderWidth: 2, borderColor: s.borderStrong, borderRadius: 18, padding: 11 }}>
              <View style={{ width: 58, height: 58, borderRadius: 12, overflow: 'hidden', borderWidth: 1.5, borderColor: s.borderStrong, backgroundColor: s.surfaceRaised, alignItems: 'center', justifyContent: 'center' }}>
                {nextMedia?.gif_url ? (
                  <Image source={{ uri: nextMedia.gif_url }} alt={next.name} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                ) : (
                  <Dumbbell size={24} color={hexToRgba(exec.accent, 0.5)} strokeWidth={1.8} />
                )}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ fontFamily: FONT.uiExtra, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: exec.accent }}>Siguiente</Text>
                <Text style={{ fontFamily: FONT.displayBold, fontSize: 16, letterSpacing: -0.2, color: s.text, marginTop: 3 }} numberOfLines={1}>{next.name}</Text>
                <Text style={{ fontFamily: FONT.monoSemibold, fontSize: 12, color: s.textMuted, marginTop: 2, fontVariant: ['tabular-nums'] }} numberOfLines={1}>{next.prescription}</Text>
              </View>
            </View>
          )}

          {/* Nota del coach del bloque siguiente. */}
          {data.coachNote && (
            <View style={{ width: '100%', flexDirection: 'row', gap: 10, backgroundColor: hexToRgba(exec.accent, 0.08), borderWidth: 1.5, borderColor: hexToRgba(exec.accent, 0.22), borderRadius: 16, padding: 12 }}>
              <MessageSquareText size={16} color={exec.accent} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontFamily: FONT.ui, fontSize: 13, lineHeight: 19, color: s.text }}>{data.coachNote}</Text>
            </View>
          )}
        </ScrollView>
      </View>

      {/* Peek "Plan completo" arrastrable. */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: SHEET_HEIGHT,
            backgroundColor: s.surface,
            borderTopWidth: 2,
            borderTopColor: s.borderStrong,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingHorizontal: 16,
            paddingBottom: insets.bottom + 12,
            maxHeight: winH * 0.7,
          },
          sheetStyle,
        ]}
      >
        <GestureDetector gesture={pan}>
          <Pressable
            testID="rest-interstitial-plan-handle"
            onPress={toggleSheet}
            style={{ paddingTop: 8, paddingBottom: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Ver el plan completo"
          >
            <View style={{ width: 40, height: 5, borderRadius: 999, backgroundColor: s.borderStrong, alignSelf: 'center', marginBottom: 10 }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontFamily: FONT.displayBold, fontSize: 15, letterSpacing: -0.2, color: s.text }}>Plan completo</Text>
              <Text style={{ fontFamily: FONT.monoBold, fontSize: 12, color: s.textMuted, fontVariant: ['tabular-nums'] }}>
                {data.planItems.filter((it) => it.complete).length} / {data.planItems.length}
              </Text>
            </View>
          </Pressable>
        </GestureDetector>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingTop: 6, paddingBottom: 8 }}>
          {data.planItems.map((item) => {
            const isNow = item.index === data.currentIndex
            const state: 'done' | 'now' | 'todo' = item.complete ? 'done' : isNow ? 'now' : 'todo'
            return (
              <View
                key={item.key}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopWidth: 1.5, borderTopColor: s.borderSubtle, ...(isNow ? { backgroundColor: hexToRgba(exec.accent, 0.1), borderRadius: 12, marginHorizontal: -6, paddingHorizontal: 10 } : null) }}
              >
                <PlanStateSquare state={state} exec={exec} />
                <Text style={{ flex: 1, fontFamily: FONT.uiBold, fontSize: 13, color: isNow ? s.text : hexToRgba(s.text, 0.85) }} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text
                  style={{
                    fontFamily: FONT.uiBold,
                    fontSize: 11,
                    fontVariant: ['tabular-nums'],
                    color: state === 'todo' ? s.textDim : exec.accent,
                  }}
                >
                  {state === 'done' ? `✓ ${item.doneSets}/${item.totalSets}` : state === 'now' ? 'ahora' : 'pendiente'}
                </Text>
              </View>
            )
          })}
        </ScrollView>
      </Animated.View>
    </MotiView>
  )
}

function RestButton({
  label,
  onPress,
  exec,
  primary = false,
  icon,
  testID,
  accessibilityLabel,
}: {
  label: string
  onPress: () => void
  exec: ExecTheme
  primary?: boolean
  icon?: React.ReactNode
  testID?: string
  accessibilityLabel?: string
}) {
  const s = exec.surface
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => ({
        flex: 1,
        height: 54,
        borderRadius: 15,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderWidth: 2,
        backgroundColor: primary ? exec.accent : s.surfaceRaised,
        borderColor: primary ? hexToRgba(exec.accent, 0.6) : s.borderStrong,
        transform: [{ scale: pressed ? 0.96 : 1 }],
      })}
    >
      {icon}
      <Text style={{ fontFamily: FONT.uiExtra, fontSize: 15, color: primary ? exec.accentText : s.text, fontVariant: ['tabular-nums'] }}>{label}</Text>
    </Pressable>
  )
}

function PlanStateSquare({ state, exec }: { state: 'done' | 'now' | 'todo'; exec: ExecTheme }) {
  const s = exec.surface
  if (state === 'done') {
    return (
      <View style={{ width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: exec.accent }}>
        <Check size={12} color={exec.accentText} strokeWidth={3} />
      </View>
    )
  }
  if (state === 'now') {
    return (
      <View style={{ width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: hexToRgba(exec.accent, 0.25), borderWidth: 2, borderColor: exec.accent }}>
        <View style={{ width: 7, height: 7, borderRadius: 999, backgroundColor: exec.accent }} />
      </View>
    )
  }
  return <View style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: s.surfaceRaised, borderWidth: 2, borderColor: s.borderStrong }} />
}
