import { useEffect, useState, type ReactNode } from 'react'
import { Pressable, ScrollView, Text, View } from 'react-native'
import { MotiView } from 'moti'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { runOnJS } from 'react-native-reanimated'
import { CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react-native'
import { useEvaMotion } from '../../../lib/motion'
import { haptics } from '../../../lib/haptics'
import { TYPE } from '../../../lib/typography'

const ON_DARK = '#F4F6F8'
const ON_DARK_DIM = 'rgba(147,157,171,0.35)'
const SPORT_300 = '#8FC0FF'

/** Vista presentacional de un paso para el rail + nav (el card lo pinta `renderStep`). */
export interface StepperStepView {
  key: string
  /** Nombre(s) del ejercicio del paso (rail a11y). */
  title: string
  /** Sección del paso (eyebrow "Calentamiento / Bloque principal / …"). */
  sectionTitle: string
  /** Warmup/cooldown ⇒ eyebrow atenuado. */
  muted: boolean
  /** ¿El paso está completo? (color del segmento del rail). */
  complete: boolean
}

const SLIDE = 40

/**
 * Modo "Paso a paso" del ejecutor (E2-04) — piel RN del `StepperExecution` de web. Muestra UN paso a
 * la vez (un bloque suelto o una superserie completa) con: rail de segmentos tappables, botones
 * prev/next SIEMPRE presentes, swipe horizontal (gesture-handler Pan, sin trabar el scroll vertical) y
 * transición direccional (moti). El motor (logging/descanso/progresión/timers) vive en el card que
 * `renderStep` pinta — el MISMO componente que la lista clásica → una sola fuente de verdad.
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
  useEffect(() => {
    if (prevIndex !== idx) setPrevIndex(idx)
  }, [idx, prevIndex])

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

  // Swipe izquierda → siguiente; derecha → anterior. `activeOffsetX` deja vivo el scroll vertical.
  const pan = Gesture.Pan()
    .activeOffsetX([-24, 24])
    .failOffsetY([-16, 16])
    .onEnd((e) => {
      if (e.translationX < -60 || e.velocityX < -500) runOnJS(goNext)()
      else if (e.translationX > 60 || e.velocityX > 500) runOnJS(goPrev)()
    })

  if (!active) return null

  return (
    <View className="flex-1">
      {/* Chrome superior: prev/next SIEMPRE presentes + eyebrow de sección + "Ejercicio X de Y". */}
      <View className="flex-row items-center gap-2 px-4 pt-2">
        <NavButton testID="stepper-prev" disabled={idx === 0} onPress={goPrev}>
          <ChevronLeft size={20} color={idx === 0 ? ON_DARK_DIM : ON_DARK} />
        </NavButton>
        <View className="min-w-0 flex-1 items-center">
          <Text
            style={TYPE.eyebrow}
            className={active.muted ? 'text-on-dark-muted/60' : 'text-sport-300'}
            numberOfLines={1}
          >
            {active.sectionTitle}
          </Text>
          <Text style={TYPE.mono} className="text-[11px] text-on-dark-muted">
            <Text className="text-on-dark font-mono-bold">Ejercicio {idx + 1}</Text> de {total}
          </Text>
        </View>
        <NavButton testID="stepper-next" disabled={idx === total - 1} onPress={goNext}>
          <ChevronRight size={20} color={idx === total - 1 ? ON_DARK_DIM : ON_DARK} />
        </NavButton>
      </View>

      {/* Rail de progreso: segmentos tappables (salta a cualquier paso). */}
      <View className="mt-3 flex-row items-stretch gap-1 px-4">
        {steps.map((s, i) => {
          const state = i === idx ? 'active' : s.complete ? 'done' : 'upcoming'
          return (
            <Pressable
              key={s.key}
              testID={`stepper-rail-${i}`}
              onPress={() => goTo(i)}
              accessibilityRole="button"
              accessibilityLabel={`Ir al ejercicio ${i + 1} de ${total}`}
              accessibilityState={{ selected: i === idx }}
              className="-my-2 flex-1 justify-center py-2"
            >
              <View
                className={`h-1.5 w-full rounded-full ${
                  state === 'active' ? 'bg-sport-400' : state === 'done' ? 'bg-sport-500/60' : 'bg-white/15'
                }`}
              />
            </Pressable>
          )
        })}
      </View>

      {/* Pager: solo el paso actual, con swipe + transición direccional. */}
      <GestureDetector gesture={pan}>
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 160 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <MotiView
            key={active.key}
            from={motion.reduced ? { opacity: 0 } : { opacity: 0, translateX: direction > 0 ? SLIDE : -SLIDE }}
            animate={{ opacity: 1, translateX: 0 }}
            transition={{ type: 'timing', duration: motion.reduced ? 120 : 240 }}
          >
            {renderStep(idx)}
          </MotiView>

          {/* Pie: "Siguiente ejercicio" cuando el paso ya está completo (afirma el auto-avance). */}
          {active.complete && idx < total - 1 && (
            <Pressable
              testID="stepper-next-cta"
              onPress={goNext}
              className="mt-4 flex-row items-center justify-center gap-2 rounded-control border border-sport-500/40 bg-sport-500/[0.08] py-3"
              accessibilityRole="button"
              accessibilityLabel="Siguiente ejercicio"
            >
              <CheckCircle2 size={16} color={SPORT_300} />
              <Text style={TYPE.label} className="text-sport-300">Siguiente ejercicio</Text>
              <ChevronRight size={16} color={SPORT_300} />
            </Pressable>
          )}
        </ScrollView>
      </GestureDetector>
    </View>
  )
}

/** Botón prev/next — target ≥44px, deshabilitado en los extremos. */
function NavButton({
  children,
  testID,
  disabled,
  onPress,
}: {
  children: ReactNode
  testID: string
  disabled: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      className={`h-11 w-11 items-center justify-center rounded-control border ${
        disabled ? 'border-inverse/40' : 'border-inverse/50 bg-white/[0.06] active:opacity-80'
      }`}
      accessibilityRole="button"
    >
      {children}
    </Pressable>
  )
}
