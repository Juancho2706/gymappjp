import { useRef, useState } from 'react'
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowRight, Activity, Dumbbell, KeyRound, Utensils } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../context/ThemeContext'
import { Button } from './Button'
import { TYPE } from '../lib/typography'
import { shadow } from '../lib/shadows'
import { markWalkthroughSeen } from '../lib/walkthrough'

/**
 * Walkthrough — pre-login onboarding carousel (E1-22 / SPEC Goal 7).
 *
 * Shown ONCE on the first cold start (gated by the `walkthrough_seen` flag in
 * `lib/walkthrough.ts`), before the role selector. Deep-link launches never
 * reach here (see `app/+native-intent.ts`). EVA DS: superficie limpia clara
 * (bg-surface-app, dark-aware), hero en tile sport suave, paginación de
 * píldoras sport, "Saltar" discreto + CTA final. Micro-transiciones por página.
 *
 * Slide copy APROBADO por CEO 2026-07-08 (4 slides).
 */

interface Slide {
  icon: LucideIcon
  title: string
  body: string
}

const SLIDES: Slide[] = [
  {
    icon: Dumbbell,
    // copy aprobado CEO 2026-07-08
    title: 'Bienvenido a EVA',
    body: 'Tu entrenamiento, en tu bolsillo. Todo lo que arma tu coach, siempre contigo.',
  },
  {
    icon: Activity,
    // copy aprobado CEO 2026-07-08
    title: 'Entrena guiado',
    body: 'Rutinas, timers y tu progreso en vivo. Cada serie registrada al instante.',
  },
  {
    icon: Utensils,
    // copy aprobado CEO 2026-07-08
    title: 'Nutricion y check-in',
    body: 'Tu plan de comidas, adherencia y check-ins semanales, todo en un lugar.',
  },
  {
    icon: KeyRound,
    // copy aprobado CEO 2026-07-08
    title: 'Empieza con tu codigo',
    body: 'Tu coach te dio un codigo o un link. Ingresalo y accede a tu plan.',
  },
]

interface Props {
  /** Called after the flag is persisted (skip or finish) → parent shows selector. */
  onDone: () => void
}

export function Walkthrough({ onDone }: Props) {
  const { theme, mode } = useTheme()
  const scheme = mode === 'light' ? 'light' : 'dark'
  const { width } = useWindowDimensions()
  const scrollRef = useRef<ScrollView>(null)
  const [index, setIndex] = useState(0)
  const isLast = index === SLIDES.length - 1

  async function finish() {
    await markWalkthroughSeen()
    onDone()
  }

  function goNext() {
    if (isLast) {
      void finish()
      return
    }
    scrollRef.current?.scrollTo({ x: (index + 1) * width, animated: true })
  }

  function onMomentumEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.round(e.nativeEvent.contentOffset.x / width)
    if (next !== index) setIndex(next)
  }

  return (
    <View className="bg-surface-app" style={{ flex: 1 }}>
      <SafeAreaView style={{ flex: 1 }}>
        {/* Skip — top right, hidden on the last slide (CTA becomes "Empezar"). */}
        <View style={{ height: 44, justifyContent: 'center', alignItems: 'flex-end', paddingHorizontal: 20 }}>
          {!isLast ? (
            <Pressable
              testID="walkthrough-skip"
              accessibilityRole="button"
              hitSlop={12}
              onPress={() => void finish()}
              style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingVertical: 6, paddingHorizontal: 4 })}
            >
              <Text className="text-muted" style={TYPE.label}>Saltar</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Paged carousel */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumEnd}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
        >
          {SLIDES.map((slide, i) => {
            const Icon = slide.icon
            const active = i === index
            return (
              <View
                key={slide.title}
                testID={`walkthrough-slide-${i}`}
                style={{ width, paddingHorizontal: 32, alignItems: 'center', justifyContent: 'center', flex: 1 }}
              >
                {/* Micro-transición: fade+slide suave según la página activa. */}
                <MotiView
                  animate={{ opacity: active ? 1 : 0.35, translateY: active ? 0 : 14 }}
                  transition={{ type: 'timing', duration: 360 }}
                  style={{ alignItems: 'center' }}
                >
                  <View
                    className="bg-sport-100"
                    style={{
                      width: 96,
                      height: 96,
                      borderRadius: theme.radius['3xl'],
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginBottom: 32,
                      ...shadow('md', scheme),
                    }}
                  >
                    <Icon size={46} color={theme.primary} strokeWidth={1.75} />
                  </View>
                  <Text className="text-strong" style={[TYPE.h1, { textAlign: 'center' }]}>{slide.title}</Text>
                  <Text className="text-muted" style={[TYPE.body, { textAlign: 'center', marginTop: 14, maxWidth: 320 }]}>
                    {slide.body}
                  </Text>
                </MotiView>
              </View>
            )
          })}
        </ScrollView>

        {/* Footer: pill pagination + CTA */}
        <View style={{ paddingHorizontal: 24, paddingBottom: 24, gap: 24 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
            {SLIDES.map((s, i) => (
              <MotiView
                key={s.title}
                animate={{ width: i === index ? 24 : 8, opacity: i === index ? 1 : 0.4 }}
                transition={{ type: 'timing', duration: 240 }}
                className={i === index ? 'bg-sport-500' : 'bg-ink-300'}
                style={{ height: 8, borderRadius: 9999 }}
              />
            ))}
          </View>
          <Button
            testID={isLast ? 'walkthrough-cta' : 'walkthrough-next'}
            label={isLast ? 'Empezar' : 'Siguiente'}
            variant="sport"
            size="lg"
            rightIcon={ArrowRight}
            full
            onPress={goNext}
          />
        </View>
      </SafeAreaView>
    </View>
  )
}
