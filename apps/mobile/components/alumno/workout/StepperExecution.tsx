import { useEffect, useState, type ReactNode } from 'react'
import { AccessibilityInfo, Pressable, ScrollView, Text, View, type TextStyle } from 'react-native'
import { AnimatePresence, MotiView } from 'moti'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react-native'
import { EASE, useEvaMotion } from '../../../lib/motion'
import { haptics } from '../../../lib/haptics'
import { FONT } from '../../../lib/typography'

const ON_DARK = '#F4F6F8'
// Deshabilitado: text-on-dark-muted/30 en web (StepperExecution.tsx:213) → rgba(147,157,171,0.30).
const ON_DARK_DIM = 'rgba(147,157,171,0.30)'
// --sport-300 del theme (global.css:46 = 147 190 255 = #93BEFF); web usa text-[var(--sport-300)].
const SPORT_300 = '#93BEFF'

// Colores del rail (paridad web StepperExecution.tsx:131-136). RN no anima clases NativeWind, así que
// el fade `transition-colors` se hace con MotiView + valores resueltos de los tokens sport-*/white.
const RAIL_ACTIVE = '#5C9DFF' // --sport-400 (92 157 255)
const RAIL_DONE = 'rgba(38,128,255,0.6)' // --sport-500/60 (38 128 255 @ .6)
const RAIL_UPCOMING = 'rgba(255,255,255,0.15)' // bg-white/15

// Eyebrow de sección: web usa el literal `text-[10px] tracking-widest` (StepperExecution.tsx:100), no
// el rol DS (que es 12px). Se mirror 1:1 el valor literal del web. tracking-widest = 0.1em × 10 = 1pt.
const EYEBROW_STYLE: TextStyle = { fontFamily: FONT.uiBold, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' }
// Contador "Ejercicio X de Y": web `font-mono text-[11px] tabular-nums` (StepperExecution.tsx:106).
const COUNTER_STYLE: TextStyle = { fontFamily: FONT.mono, fontSize: 11, fontVariant: ['tabular-nums', 'lining-nums'] }

// Curva direccional del deslizamiento — paridad web `easings.dirSlide = [0.16,1,0.3,1]`
// (animation-presets.ts:32; el `EASE.out` del DS es [0.22,1,0.36,1], NO sirve aquí).
const DIR_SLIDE = Easing.bezier(0.16, 1, 0.3, 1)

/** Vista presentacional de un paso para el rail + nav (el card lo pinta `renderStep`). */
export interface StepperStepView {
  key: string
  /** Tipo de paso — bloque suelto o superserie (espejo del contrato web, StepperExecution.tsx:13). */
  kind: 'single' | 'superset'
  /** Nombre(s) del ejercicio del paso (rail a11y + anuncio de cambio de paso). */
  title: string
  /** Sección del paso (eyebrow "Calentamiento / Bloque principal / …"). */
  sectionTitle: string
  /** Warmup/cooldown ⇒ eyebrow atenuado. */
  muted: boolean
  /** ¿El paso está completo? (color del segmento del rail). */
  complete: boolean
}

// Umbrales de swipe (paridad web StepperExecution.tsx:35-36, patrón DayNavigator).
const SWIPE_OFFSET = 60
const SWIPE_VELOCITY = 400
// Deslizamiento direccional del paso (px) — paridad web (SLIDE=48, StepperExecution.tsx:38).
const SLIDE = 48
// Elasticidad del arrastre en vivo — paridad web `dragElastic={0.12}` (StepperExecution.tsx:150).
const DRAG_ELASTIC = 0.12

/**
 * Modo "Paso a paso" del ejecutor (E2-04) — piel RN del `StepperExecution` de web. Muestra UN paso a
 * la vez (un bloque suelto o una superserie completa) con: rail de segmentos tappables, botones
 * prev/next SIEMPRE presentes, swipe horizontal (gesture-handler Pan con arrastre elástico en vivo, sin
 * trabar el scroll vertical), transición direccional enter/exit (moti + AnimatePresence) y anuncio a11y
 * del cambio de paso. El motor (logging/descanso/progresión/timers) vive en el card que `renderStep`
 * pinta — el MISMO componente que la lista clásica → una sola fuente de verdad.
 */
export function StepperExecution({
  steps,
  currentIndex,
  onIndexChange,
  renderStep,
}: {
  steps: StepperStepView[]
  currentIndex: number
  onIndexChange: (index: number) => void
  renderStep: (index: number) => ReactNode
}) {
  const motion = useEvaMotion()
  const total = steps.length
  const idx = Math.max(0, Math.min(currentIndex, total - 1))
  const active = steps[idx]

  // Dirección del deslizamiento (derivada del paso anterior, para swipe/rail/auto-avance).
  const [prevIndex, setPrevIndex] = useState(idx)
  const direction = idx >= prevIndex ? 1 : -1
  // Al cambiar de paso: sincroniza la dirección y ANUNCIA el cambio a lectores de pantalla (AC-A7,
  // paridad web `<p aria-live="polite">Ejercicio X de Y: título</p>`, StepperExecution.tsx:184-187).
  useEffect(() => {
    if (prevIndex !== idx) {
      setPrevIndex(idx)
      const step = steps[idx]
      if (step) AccessibilityInfo.announceForAccessibility(`Ejercicio ${idx + 1} de ${total}: ${step.title}`)
    }
  }, [idx, prevIndex, steps, total])

  const goPrev = () => {
    if (idx > 0) {
      haptics.tap()
      onIndexChange(idx - 1)
    }
  }
  const goNext = () => {
    if (idx < total - 1) {
      haptics.tap()
      onIndexChange(idx + 1)
    }
  }
  const goTo = (i: number) => {
    haptics.tap()
    onIndexChange(i)
  }

  // Arrastre elástico en vivo del paso (paridad web `drag='x' dragSnapToOrigin dragElastic=0.12`,
  // StepperExecution.tsx:148-151): el paso sigue al dedo al 12% y rebota al soltar; el cambio real de
  // paso lo decide el umbral en `onEnd`. Con reduce-motion el gesto se desactiva (`drag={false}`, :148).
  const dragX = useSharedValue(0)
  const dragStyle = useAnimatedStyle(() => ({ transform: [{ translateX: dragX.value }] }))
  const pan = Gesture.Pan()
    .enabled(!motion.reduced)
    .activeOffsetX([-24, 24])
    .failOffsetY([-16, 16])
    .onUpdate((e) => {
      dragX.value = e.translationX * DRAG_ELASTIC
    })
    .onEnd((e) => {
      dragX.value = withSpring(0, { damping: 22, stiffness: 240 })
      if (e.translationX < -SWIPE_OFFSET || e.velocityX < -SWIPE_VELOCITY) runOnJS(goNext)()
      else if (e.translationX > SWIPE_OFFSET || e.velocityX > SWIPE_VELOCITY) runOnJS(goPrev)()
    })

  if (!active) return null

  return (
    // `max-w-3xl` (768px) centrado — paridad web `mx-auto w-full max-w-3xl` (StepperExecution.tsx:90);
    // en tablet el paso no se estira a todo el ancho.
    <View className="w-full flex-1 self-center" style={{ maxWidth: 768 }}>
      {/* Chrome superior: prev/next SIEMPRE presentes + eyebrow de sección + "Ejercicio X de Y". */}
      <View className="flex-row items-center gap-2 px-4 pt-2">
        <NavButton testID="stepper-prev" disabled={idx === 0} onPress={goPrev} accessibilityLabel="Ejercicio anterior">
          <ChevronLeft size={20} color={idx === 0 ? ON_DARK_DIM : ON_DARK} />
        </NavButton>
        <View className="min-w-0 flex-1 items-center">
          <Text
            style={EYEBROW_STYLE}
            className={active.muted ? 'text-on-dark-muted/60' : 'text-sport-300'}
            numberOfLines={1}
          >
            {active.sectionTitle}
          </Text>
          <Text style={COUNTER_STYLE} className="text-on-dark-muted" numberOfLines={1}>
            <Text className="text-on-dark font-mono-bold">Ejercicio {idx + 1}</Text> de {total}
          </Text>
        </View>
        <NavButton testID="stepper-next" disabled={idx === total - 1} onPress={goNext} accessibilityLabel="Ejercicio siguiente">
          <ChevronRight size={20} color={idx === total - 1 ? ON_DARK_DIM : ON_DARK} />
        </NavButton>
      </View>

      {/* Rail de progreso: segmentos tappables (salta a cualquier paso, incluso a editar). */}
      <View className="mt-3 flex-row items-stretch gap-1 px-4">
        {steps.map((s, i) => {
          const state = i === idx ? 'active' : s.complete ? 'done' : 'upcoming'
          return (
            <Pressable
              key={s.key}
              testID={`stepper-rail-${i}`}
              onPress={() => goTo(i)}
              accessibilityRole="button"
              accessibilityLabel={`Ir al ejercicio ${i + 1} de ${total}: ${s.title}`}
              accessibilityState={{ selected: i === idx }}
              className="-my-2 flex-1 justify-center py-2"
            >
              {/* `transition-colors` del web → fade de backgroundColor con moti. */}
              <MotiView
                className="h-1.5 w-full rounded-full"
                animate={{ backgroundColor: state === 'active' ? RAIL_ACTIVE : state === 'done' ? RAIL_DONE : RAIL_UPCOMING }}
                transition={{ type: 'timing', duration: 150, easing: EASE.out }}
              />
            </Pressable>
          )
        })}
      </View>

      {/* Pager: solo el paso actual, con arrastre en vivo + transición direccional enter/exit. */}
      <GestureDetector gesture={pan}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 160 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={dragStyle}>
            <AnimatePresence exitBeforeEnter>
              <MotiView
                key={active.key}
                from={motion.reduced ? { opacity: 0 } : { opacity: 0, translateX: direction > 0 ? SLIDE : -SLIDE }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={motion.reduced ? { opacity: 0 } : { opacity: 0, translateX: direction > 0 ? -SLIDE : SLIDE }}
                transition={{ type: 'timing', duration: motion.reduced ? 120 : 260, easing: motion.reduced ? EASE.out : DIR_SLIDE }}
                accessibilityLabel={`Ejercicio ${idx + 1} de ${total}`}
              >
                {renderStep(idx)}
              </MotiView>
            </AnimatePresence>
          </Animated.View>

          {/* Pie: "Siguiente ejercicio" cuando el paso ya está completo (afirma el auto-avance). */}
          {active.complete && idx < total - 1 && (
            <Pressable
              testID="stepper-next-cta"
              onPress={goNext}
              className="mt-4 flex-row items-center justify-center gap-2 rounded-control border border-sport-500/40 bg-sport-500/[0.08] py-3 active:bg-sport-500/[0.16]"
              accessibilityRole="button"
              accessibilityLabel="Siguiente ejercicio"
            >
              <CheckCircle2 size={16} color={SPORT_300} />
              <Text style={{ fontFamily: FONT.uiBold, fontSize: 14 }} className="text-sport-300">Siguiente ejercicio</Text>
              <ChevronRight size={16} color={SPORT_300} />
            </Pressable>
          )}
        </ScrollView>
      </GestureDetector>
    </View>
  )
}

/** Botón prev/next — target ≥44px, deshabilitado en los extremos (mismo borde en ambos estados). */
function NavButton({
  children,
  testID,
  disabled,
  onPress,
  accessibilityLabel,
}: {
  children: ReactNode
  testID: string
  disabled: boolean
  onPress: () => void
  accessibilityLabel: string
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      className={`h-11 w-11 items-center justify-center rounded-control border border-inverse/10 ${
        disabled ? '' : 'bg-white/[0.06] active:opacity-80'
      }`}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
    >
      {children}
    </Pressable>
  )
}
