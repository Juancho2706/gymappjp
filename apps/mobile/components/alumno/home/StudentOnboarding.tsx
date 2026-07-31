import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Image } from 'expo-image'
import { CalendarCheck, Dumbbell, Sparkles } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useReducedMotion } from 'react-native-reanimated'
import { useTheme } from '../../../context/ThemeContext'

/**
 * Onboarding corto del alumno — PRIMERA entrada al dashboard (post-login). No es el
 * wizard de intake (`app/alumno/onboarding.tsx`, datos del alumno) ni el walkthrough
 * pre-login (retirado): son 3 slides que explican el producto y se ven UNA sola vez.
 *
 * Contrato con la home: el overlay se resuelve SIEMPRE (visto o recién cerrado) vía
 * `onResolved`, y la home recién ahí habilita el WelcomeModal del coach — así encadenan
 * onboarding → welcome modal en vez de solaparse.
 */
const STORAGE_KEY = 'eva_student_onboarding_v1'

type SlideKey = 'marca' | 'entrena' | 'habitos'

export function StudentOnboarding({ onResolved }: { onResolved: () => void }) {
  const { theme, branding, resolvedScheme } = useTheme()
  // Mismo hook que el resto del repo (EvaLoader, entrada): Reanimated ya sigue el
  // ajuste del SO vía <ReducedMotionConfig>.
  const reduceMotion = useReducedMotion()
  const { width: winWidth } = useWindowDimensions()
  const scrollRef = useRef<ScrollView>(null)
  const [index, setIndex] = useState(0)
  // 'checking' = aún no sabemos si ya lo vio ⇒ NO se monta ni un frame del overlay.
  const [phase, setPhase] = useState<'checking' | 'showing'>('checking')

  // `onResolved` puede cambiar de identidad en cada render de la home; el efecto de
  // arranque debe correr UNA vez, así que se lee por ref.
  const resolvedRef = useRef(onResolved)
  resolvedRef.current = onResolved

  useEffect(() => {
    let alive = true
    AsyncStorage.getItem(STORAGE_KEY)
      .then((seen) => {
        if (!alive) return
        if (seen === 'true') resolvedRef.current()
        else setPhase('showing')
      })
      .catch(() => {
        // Sin storage legible preferimos NO bloquear el viaje: se resuelve y sigue el
        // welcome modal del coach.
        if (alive) resolvedRef.current()
      })
    return () => { alive = false }
  }, [])

  const cardWidth = Math.min(winWidth - 32, 440)

  const finish = useCallback(async () => {
    setPhase('checking')
    resolvedRef.current()
    await AsyncStorage.setItem(STORAGE_KEY, 'true').catch(() => {})
  }, [])

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const next = Math.round(e.nativeEvent.contentOffset.x / Math.max(1, cardWidth))
      setIndex(Math.min(SLIDES.length - 1, Math.max(0, next)))
    },
    [cardWidth],
  )

  function goNext() {
    if (index >= SLIDES.length - 1) { void finish(); return }
    const next = index + 1
    setIndex(next)
    scrollRef.current?.scrollTo({ x: next * cardWidth, animated: !reduceMotion })
  }

  if (phase !== 'showing') return null

  const brandName = branding?.displayName?.trim() || 'EVA'
  const logoUri =
    (resolvedScheme === 'dark' ? branding?.logoUrlDark || branding?.logoUrl : branding?.logoUrl) || null
  const isLast = index === SLIDES.length - 1
  const spring = reduceMotion
    ? ({ type: 'timing', duration: 1 } as const)
    : ({ type: 'spring', damping: 22, stiffness: 160 } as const)

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => void finish()}
    >
      <View style={styles.overlay}>
        <MotiView
          from={{ opacity: 0, translateY: reduceMotion ? 0 : 24, scale: reduceMotion ? 1 : 0.97 }}
          animate={{ opacity: 1, translateY: 0, scale: 1 }}
          transition={spring}
          style={[
            styles.card,
            {
              width: cardWidth,
              backgroundColor: theme.card,
              borderColor: theme.border,
              borderRadius: theme.radius['2xl'],
            },
          ]}
        >
          <View style={styles.header}>
            <TouchableOpacity
              onPress={() => void finish()}
              activeOpacity={0.75}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Saltar la introducción"
              testID="student-onboarding-skip"
            >
              <Text style={[styles.skip, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                Saltar
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={onMomentumEnd}
            style={{ width: cardWidth }}
          >
            {SLIDES.map((slide, i) => (
              <View key={slide.key} style={[styles.slide, { width: cardWidth }]}>
                <MotiView
                  animate={{ scale: index === i ? 1 : 0.9, opacity: index === i ? 1 : 0.55 }}
                  transition={spring}
                  style={[
                    styles.iconWrap,
                    { backgroundColor: theme.secondary, borderRadius: theme.radius.xl },
                  ]}
                >
                  {slide.key === 'marca' && logoUri ? (
                    <Image source={{ uri: logoUri }} style={styles.logo} contentFit="contain" transition={150} />
                  ) : (
                    // Lucide en RN ignora className salvo registro cssInterop: el color va
                    // imperativo desde el tema runtime.
                    <slide.Icon size={34} color={theme.primary} strokeWidth={1.8} />
                  )}
                </MotiView>

                <Text
                  style={[styles.title, { color: theme.foreground, fontFamily: 'Archivo_800ExtraBold' }]}
                >
                  {slide.key === 'marca' ? `Bienvenido/a a ${brandName}` : slide.title}
                </Text>
                <Text style={[styles.body, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                  {slide.body}
                </Text>
              </View>
            ))}
          </ScrollView>

          <View style={styles.footer}>
            <View style={styles.dots} accessibilityRole="tablist">
              {SLIDES.map((slide, i) => (
                <MotiView
                  key={slide.key}
                  animate={{
                    width: index === i ? 20 : 6,
                    opacity: index === i ? 1 : 0.35,
                  }}
                  transition={spring}
                  style={[styles.dot, { backgroundColor: index === i ? theme.primary : theme.mutedForeground }]}
                />
              ))}
            </View>

            <TouchableOpacity
              style={[styles.cta, { backgroundColor: theme.primary, borderRadius: theme.radius.lg }]}
              onPress={goNext}
              activeOpacity={0.85}
              accessibilityRole="button"
              testID="student-onboarding-next"
            >
              <Text style={[styles.ctaText, { color: theme.primaryForeground, fontFamily: 'Archivo_700Bold' }]}>
                {isLast ? 'Empezar' : 'Siguiente'}
              </Text>
            </TouchableOpacity>
          </View>
        </MotiView>
      </View>
    </Modal>
  )
}

const SLIDES: { key: SlideKey; Icon: typeof Dumbbell; title: string; body: string }[] = [
  {
    key: 'marca',
    Icon: Sparkles,
    // El título real se arma con la marca del coach (branding runtime).
    title: 'Bienvenido/a',
    body: 'Tu entrenamiento y tu nutrición, en un solo lugar.',
  },
  {
    key: 'entrena',
    Icon: Dumbbell,
    title: 'Tu día de entrenamiento',
    body: 'Tocá EMPEZAR y registrá tus series. Tu coach ve tu progreso.',
  },
  {
    key: 'habitos',
    Icon: CalendarCheck,
    title: 'Hábitos y check-in',
    body: 'Registrá tu nutrición cada día y hacé tu check-in periódico. Tu coach ajusta tu plan con lo que registrás.',
  },
]

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: { maxWidth: 440, borderWidth: 1, overflow: 'hidden' },
  header: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 20, paddingTop: 16 },
  skip: { fontSize: 13, letterSpacing: 0.2 },
  slide: { paddingHorizontal: 28, paddingTop: 12, paddingBottom: 8, alignItems: 'center', gap: 14 },
  iconWrap: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 46, height: 46 },
  title: { fontSize: 21, lineHeight: 27, letterSpacing: -0.4, textAlign: 'center' },
  body: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  footer: { padding: 20, paddingTop: 16, gap: 16, alignItems: 'center' },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 6 },
  dot: { height: 6, borderRadius: 3 },
  cta: { alignSelf: 'stretch', paddingVertical: 14, alignItems: 'center' },
  ctaText: { fontSize: 15 },
})
