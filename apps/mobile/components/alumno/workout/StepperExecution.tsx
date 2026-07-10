import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { AccessibilityInfo, Pressable, ScrollView, Text, View, type TextStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
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
import { FONT } from '../../../lib/typography'
import { hexToRgba, resolveSportRamp } from '../../../lib/theme'
import { useTheme } from '../../../context/ThemeContext'

const ON_DARK = '#F4F6F8'
// Deshabilitado: text-on-dark-muted/30 en web (StepperExecution.tsx:213) → rgba(147,157,171,0.30).
const ON_DARK_DIM = 'rgba(147,157,171,0.30)'

// Rail "upcoming": web usa `bg-white/15` (StepperExecution.tsx:135) — blanco, NO la rampa sport, así
// que no reacciona al white-label. Los estados active/done SÍ leen `--sport-400`/`--sport-500` y se
// resuelven en runtime vía el theme context (ver `sport400`/`railDone` abajo). RN no anima clases
// NativeWind, así que el fade `transition-colors` se hace con MotiView sobre backgroundColor.
const RAIL_UPCOMING = 'rgba(255,255,255,0.15)' // bg-white/15

// Clearance del contenido para dejar libre la barra fija "Finalizar" — paridad web `pb-32` = 128px
// (StepperExecution.tsx:90). En RN la barra (`.exec-finish-bar`, ExecutorV2 FINISH_BAR_H=88) se
// extiende ADEMÁS hasta el safe-area inferior, por lo que se suma `insets.bottom` (concepto sin
// equivalente en web); 128 + inset mantiene el mismo respiro visual (~40px sobre la barra de 88).
const FINISH_BAR_CLEARANCE = 128

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
  const insets = useSafeAreaInsets()
  // Colores sport resueltos en RUNTIME desde el mismo `deriveSportTokens` que alimenta las vars
  // `--color-sport-*` de NativeWind (ThemeContext → brandVars). Así los props de color imperativos
  // (backgroundColor del rail MotiView, `color` de los iconos lucide) siguen el override white-label
  // igual que el `currentColor`/`var(--sport-*)` del web (StepperExecution.tsx:131-134,177,179-180),
  // en vez de quedar clavados en el azul EVA mientras las clases `text-sport-*`/`bg-sport-*` sí cambian.
  const { branding } = useTheme()
  const { sport300, sport400, sport500 } = useMemo(
    () => resolveSportRamp(branding?.primaryColor),
    [branding?.primaryColor],
  )
  // Rail active → --sport-400; rail done → --sport-500/60 (web StepperExecution.tsx:132,134).
  const railDone = useMemo(() => hexToRgba(sport500, 0.6), [sport500])
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

  // Navegación PURA de índice — paridad web `goPrev`/`goNext` (StepperExecution.tsx:64-69) y el rail
  // `onIndexChange(i)` (:123). SPEC §3: «NO dispara toast ni háptico DENTRO del pager; StepperExecution
  // es puramente navegación de índice» (derivada de :46-49). Se retiran los `haptics.tap()` que RN había
  // añadido en prev/next/segmento del rail: el web no vibra al navegar y toda la háptica real vive en el
  // card que `renderStep` pinta y en el orquestador, FUERA del pager.
  const goPrev = () => {
    if (idx > 0) onIndexChange(idx - 1)
  }
  const goNext = () => {
    if (idx < total - 1) onIndexChange(idx + 1)
  }
  const goTo = (i: number) => onIndexChange(i)

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
    // Semántica de agrupación del carrusel — paridad web `<section aria-roledescription="carrusel de
    // ejercicios" aria-label="Ejercicios de la rutina">` (StepperExecution.tsx:87-91). `aria-roledescription`
    // no tiene equivalente directo en RN; `accessibilityRole="adjustable"` es lo más cercano (el paso se
    // ajusta con swipe/rail). SIN `accessible={true}` para no colapsar el foco de los hijos (nav, rail,
    // card): así el lector expone la etiqueta del grupo pero sigue enfocando cada control por separado.
    <View
      className="w-full flex-1 self-center"
      style={{ maxWidth: 768 }}
      accessibilityRole="adjustable"
      accessibilityLabel="Ejercicios de la rutina"
    >
      {/* Chrome, rail, paso y pie viven DENTRO del scroll y se desplazan CON el contenido — paridad web:
          los cuatro son hijos del mismo `<section className="…px-4 py-4 pb-32">` en flujo normal de
          página, sin `sticky`/`fixed` (StepperExecution.tsx:87-182). Al hacer scroll de un ejercicio
          largo, chrome y rail salen de vista igual que en web (antes quedaban pinned arriba).
          El `paddingTop:16` del contenedor da el hueco superior de 16px (web `py-4`, :90); el
          `GestureDetector`/arrastre elástico (`dragStyle`) envuelve SOLO el card del paso — no
          chrome/rail/pie — igual que el `drag` del web va SÓLO en el `motion.div` del pager
          (:145-152): un pan sobre el chrome, rail o pie NO navega (paridad estricta). */}
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: FINISH_BAR_CLEARANCE + insets.bottom }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Chrome superior: prev/next SIEMPRE presentes + eyebrow de sección + "Ejercicio X de Y". */}
        <View className="flex-row items-center gap-2">
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

        {/* Rail de progreso: segmentos tappables (salta a cualquier paso, incluso a editar).
            Etiqueta de grupo — paridad web `<div role="group" aria-label="Progreso de ejercicios">`
            (StepperExecution.tsx:116). SIN `accessible={true}` para no colapsar el foco de los
            segmentos hijos (cada uno anuncia "Ir al ejercicio X de Y"). */}
        <View
          className="mt-3 flex-row items-stretch gap-1"
          accessibilityLabel="Progreso de ejercicios"
        >
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
                {/* `transition-colors` del web → fade de backgroundColor con moti. active/done leen la
                    rampa sport resuelta en runtime (white-label aware); upcoming es blanco/15. */}
                <MotiView
                  className="h-1.5 w-full rounded-full"
                  animate={{ backgroundColor: state === 'active' ? sport400 : state === 'done' ? railDone : RAIL_UPCOMING }}
                  transition={{ type: 'timing', duration: 150, easing: EASE.out }}
                />
              </Pressable>
            )
          })}
        </View>

        {/* Pager: solo el paso actual, con arrastre en vivo + transición direccional enter/exit.
            `mt-4` = separación rail→paso del web (`mb-4` del rail, StepperExecution.tsx:116).
            El `GestureDetector` envuelve SOLO este card (no el ScrollView completo) — paridad web:
            el `drag='x'` va únicamente en el `motion.div` del pager (StepperExecution.tsx:145-152), así
            que un pan que empieza en el chrome/rail/pie NO navega. `activeOffsetX`/`failOffsetY` ceden
            el eje vertical al scroll del ScrollView externo.
            `overflow-hidden` clipa el translateX ±48 del slide/drag — el equivalente RN más cercano a
            `overflow-x-clip` del web (:146): RN no tiene overflow por-eje, pero como este contenedor
            abraza la altura natural del card, el recorte VERTICAL es un no-op (nada del card lo excede;
            keypad/sheets/popovers se portalan FUERA de este árbol, ExecutorV2), quedando SOLO el
            recorte horizontal del deslizamiento, tal como el web. El scroll vertical sigue vivo en el
            ScrollView externo. */}
        <GestureDetector gesture={pan}>
          <Animated.View style={dragStyle} className="mt-4 overflow-hidden">
            {/* `initial={false}` suprime la variante `enter` en el PRIMER montaje — paridad web
                `<AnimatePresence … initial={false}>` (:154): al entrar al modo Pasos el paso aparece ya
                en su sitio, sin fade/slide-in; sólo los CAMBIOS de paso posteriores animan. */}
            <AnimatePresence exitBeforeEnter initial={false}>
              <MotiView
                key={active.key}
                from={motion.reduced ? { opacity: 0 } : { opacity: 0, translateX: direction > 0 ? SLIDE : -SLIDE }}
                animate={{ opacity: 1, translateX: 0 }}
                exit={motion.reduced ? { opacity: 0 } : { opacity: 0, translateX: direction > 0 ? -SLIDE : SLIDE }}
                // reduced-motion: crossfade puro SIN curva custom (`Easing.linear`) — paridad web, cuya
                // rama reduce-motion es `{ duration: 0.12 }` sin `ease` (StepperExecution.tsx:162). Normal:
                // curva direccional `dirSlide`.
                transition={{ type: 'timing', duration: motion.reduced ? 120 : 260, easing: motion.reduced ? Easing.linear : DIR_SLIDE }}
                accessibilityLabel={`Ejercicio ${idx + 1} de ${total}`}
              >
                {renderStep(idx)}
              </MotiView>
            </AnimatePresence>
          </Animated.View>
        </GestureDetector>

        {/* Pie: "Siguiente ejercicio" cuando el paso ya está completo (afirma el auto-avance). */}
        {active.complete && idx < total - 1 && (
          <Pressable
            testID="stepper-next-cta"
            onPress={goNext}
            className="mt-4 flex-row items-center justify-center gap-2 rounded-control border border-sport-500/40 bg-sport-500/[0.08] py-3 active:bg-sport-500/[0.16]"
            accessibilityRole="button"
            accessibilityLabel="Siguiente ejercicio"
          >
            {/* Iconos: `--sport-300` resuelto en runtime (paridad web currentColor→text-[var(--sport-300)],
                StepperExecution.tsx:177,179-180), igual que el texto/borde/fondo sport-* del botón. */}
            <CheckCircle2 size={16} color={sport300} />
            <Text style={{ fontFamily: FONT.uiBold, fontSize: 14 }} className="text-sport-300">Siguiente ejercicio</Text>
            <ChevronRight size={16} color={sport300} />
          </Pressable>
        )}
      </ScrollView>
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
        disabled ? '' : 'bg-white/[0.06] active:scale-95'
      }`}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
    >
      {children}
    </Pressable>
  )
}
