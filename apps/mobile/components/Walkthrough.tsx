import { useEffect, useRef, useState } from 'react'
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Asset } from 'expo-asset'
import { Image } from 'expo-image'
import { ArrowRight } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useReducedMotion } from 'react-native-reanimated'
import { useTheme } from '../context/ThemeContext'
import { FONT, TYPE } from '../lib/typography'
import { markWalkthroughSeen } from '../lib/walkthrough'

/**
 * Walkthrough pre-login.
 *
 * Se muestra una sola vez antes del selector de rol. Las tres escenas usan
 * assets locales para que el recorrido funcione offline; importar el archivo
 * base permite que Metro elija el par @2x según la densidad del dispositivo.
 */

interface Slide {
  eyebrow: string
  title: string
  body: string
  image: number
  imageDescription: string
  haloClassName: 'bg-sport-100' | 'bg-ember-100' | 'bg-success-100'
  trophy?: boolean
}

const COACH_PLAN = require('../assets/onboarding/coach-plan.webp')
const ALUMNO_SCAN = require('../assets/onboarding/alumno-scan.webp')
const PROGRESO = require('../assets/onboarding/progreso.webp')
// Importar el asset base: Metro selecciona `@2x` según la densidad del dispositivo.
const TROPHY = require('../assets/stickers/logro.webp')

const SLIDES: Slide[] = [
  {
    eyebrow: 'PLAN PERSONAL',
    title: 'Tu coach marca el rumbo',
    body: 'Tu entrenamiento y nutrición, organizados para que sepas qué hacer cada día.',
    image: COACH_PLAN,
    imageDescription: 'Una coach organizando un plan de nutrición.',
    haloClassName: 'bg-sport-100',
  },
  {
    eyebrow: 'REGISTRO SIMPLE',
    title: 'Registrar se siente fácil',
    body: 'Guarda comidas, entrenamientos y check-ins sin perder el ritmo.',
    image: ALUMNO_SCAN,
    imageDescription: 'Una alumna registrando un alimento con su teléfono.',
    haloClassName: 'bg-ember-100',
  },
  {
    eyebrow: 'PROGRESO REAL',
    title: 'Tu avance toma forma',
    body: 'Cada registro se convierte en progreso que puedes ver y celebrar.',
    image: PROGRESO,
    imageDescription: 'Una alumna celebrando frente a una gráfica ascendente.',
    haloClassName: 'bg-success-100',
    trophy: true,
  },
]

const LOCAL_ASSETS = [COACH_PLAN, ALUMNO_SCAN, PROGRESO, TROPHY]

interface Props {
  /** Called after the flag is persisted (skip or finish) → parent shows selector. */
  onDone: () => void
}

export function Walkthrough({ onDone }: Props) {
  const { theme } = useTheme()
  const { width, height, fontScale } = useWindowDimensions()
  const reduceMotion = useReducedMotion()
  const scrollRef = useRef<ScrollView>(null)
  const [index, setIndex] = useState(0)
  const isLast = index === SLIDES.length - 1
  const compact = width <= 360 || height <= 640
  const textIsLarge = fontScale > 1.15
  const pagePadding = compact ? 20 : 28
  const stageHeight = compact ? Math.min(210, height * 0.37) : Math.min(300, height * 0.36)

  useEffect(() => {
    void Asset.loadAsync(LOCAL_ASSETS).catch(() => {
      // Los assets son locales. Si el preload falla, expo-image aún intenta
      // resolverlos al montar cada escena y el usuario puede continuar.
    })
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ x: index * width, animated: false })
  }, [index, width])

  async function finish() {
    await markWalkthroughSeen()
    onDone()
  }

  function goNext() {
    if (isLast) {
      void finish()
      return
    }
    scrollRef.current?.scrollTo({
      x: (index + 1) * width,
      animated: !reduceMotion,
    })
    if (reduceMotion) setIndex(index + 1)
  }

  function onMomentumEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const next = Math.max(0, Math.min(SLIDES.length - 1, Math.round(event.nativeEvent.contentOffset.x / width)))
    if (next !== index) setIndex(next)
  }

  return (
    <View className="bg-surface-app" style={styles.root}>
      <SafeAreaView style={styles.root}>
        <View style={[styles.topBar, { paddingHorizontal: pagePadding }]}>
          <Text
            accessibilityRole="header"
            className="text-primary"
            style={styles.wordmark}
          >
            EVA
          </Text>
          {!isLast ? (
            <Pressable
              testID="walkthrough-skip"
              accessibilityRole="button"
              accessibilityLabel="Saltar introducción"
              hitSlop={8}
              onPress={() => void finish()}
              style={styles.skip}
            >
              {/* css-interop descarta `style` cuando es función (auditoría a1
                  §2.1): styles.skip es estático, pressed via children-as-function
                  aplicado al Text (el pressed original solo tocaba opacity). */}
              {({ pressed }) => (
                <Text className="text-muted" style={[TYPE.label, pressed ? styles.pressed : null]}>
                  Saltar
                </Text>
              )}
            </Pressable>
          ) : (
            <View style={styles.skipPlaceholder} />
          )}
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          bounces={false}
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={onMomentumEnd}
          scrollEventThrottle={16}
          style={styles.carousel}
          accessibilityLabel="Introducción a EVA"
          accessibilityValue={{ text: `Pantalla ${index + 1} de ${SLIDES.length}` }}
        >
          {SLIDES.map((slide, slideIndex) => {
            const active = slideIndex === index
            return (
              <View
                key={slide.title}
                testID={`walkthrough-slide-${slideIndex}`}
                style={{ width }}
                accessibilityElementsHidden={!active}
                importantForAccessibility={active ? 'yes' : 'no-hide-descendants'}
              >
                <ScrollView
                  nestedScrollEnabled
                  bounces={false}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={[
                    styles.slideScroll,
                    {
                      paddingHorizontal: pagePadding,
                      paddingBottom: compact ? 12 : 20,
                    },
                  ]}
                >
                  <MotiView
                    accessible
                    accessibilityLabel={`${slideIndex + 1} de ${SLIDES.length}. ${slide.title}. ${slide.body} ${slide.imageDescription}`}
                    animate={{
                      opacity: active || reduceMotion ? 1 : 0.5,
                      translateY: active || reduceMotion ? 0 : 12,
                    }}
                    transition={{
                      type: 'timing',
                      duration: reduceMotion ? 0 : 320,
                    }}
                    style={styles.scene}
                  >
                    <View
                      className="bg-surface-card border border-subtle"
                      style={[
                        styles.stage,
                        {
                          height: stageHeight,
                          borderRadius: theme.radius['2xl'],
                        },
                      ]}
                    >
                      <View
                        className={slide.haloClassName}
                        style={[
                          styles.halo,
                          {
                            width: stageHeight * 0.92,
                            height: stageHeight * 0.92,
                            borderRadius: stageHeight,
                          },
                        ]}
                      />
                      <View className="bg-ember-100" style={styles.cornerAccent} />

                      <Text
                        accessible={false}
                        className="text-subtle"
                        style={styles.sceneNumber}
                      >
                        {String(slideIndex + 1).padStart(2, '0')} / {String(SLIDES.length).padStart(2, '0')}
                      </Text>

                      <Image
                        alt=""
                        accessible={false}
                        accessibilityIgnoresInvertColors
                        source={slide.image}
                        contentFit="contain"
                        transition={reduceMotion ? 0 : 180}
                        style={[
                          styles.illustration,
                          {
                            width: Math.min(width - pagePadding * 2, 360),
                            height: stageHeight * 1.28,
                          },
                        ]}
                      />

                      {slide.trophy ? (
                        <MotiView
                          accessible={false}
                          animate={{
                            opacity: active ? 1 : 0,
                            scale: active || reduceMotion ? 1 : 0.86,
                            rotate: reduceMotion ? '-8deg' : active ? '-8deg' : '-16deg',
                          }}
                          transition={{ type: 'timing', duration: reduceMotion ? 0 : 360, delay: reduceMotion ? 0 : 120 }}
                          style={[styles.trophyBadge, compact ? styles.trophyBadgeCompact : null]}
                        >
                          <Image
                            alt=""
                            accessible={false}
                            accessibilityIgnoresInvertColors
                            source={TROPHY}
                            contentFit="contain"
                            transition={0}
                            style={styles.trophy}
                          />
                        </MotiView>
                      ) : null}
                    </View>

                    <View style={[styles.copy, textIsLarge ? styles.copyLargeText : null]}>
                      <Text className="text-primary" style={TYPE.eyebrow}>{slide.eyebrow}</Text>
                      <Text className="text-strong" style={[TYPE.h2, styles.title]}>{slide.title}</Text>
                      <Text className="text-muted" style={[TYPE.body, styles.body]}>{slide.body}</Text>
                    </View>
                  </MotiView>
                </ScrollView>
              </View>
            )
          })}
        </ScrollView>

        <View style={[styles.footer, { paddingHorizontal: pagePadding, paddingBottom: compact ? 14 : 20 }]}>
          <View
            accessible
            accessibilityLiveRegion="polite"
            accessibilityLabel={`Pantalla ${index + 1} de ${SLIDES.length}`}
            style={styles.progressRow}
          >
            <Text accessible={false} className="text-strong" style={styles.progressCurrent}>
              {String(index + 1).padStart(2, '0')}
            </Text>
            <View accessible={false} className="bg-ink-100" style={styles.progressTrack}>
              <MotiView
                className="bg-sport-500"
                animate={{ width: 72 * ((index + 1) / SLIDES.length) }}
                transition={{ type: 'timing', duration: reduceMotion ? 0 : 240 }}
                style={styles.progressFill}
              />
            </View>
            <Text accessible={false} className="text-subtle" style={styles.progressTotal}>
              {String(SLIDES.length).padStart(2, '0')}
            </Text>
          </View>

          {/* css-interop DESCARTA `style` cuando es función en un componente con
              className (auditoría a1 §2.1): el layout se pierde y el CTA cae a
              columna. La superficie vive en esta View interna con style ESTÁTICO
              y el feedback de press llega por children-as-function. */}
          <Pressable
            testID={isLast ? 'walkthrough-cta' : 'walkthrough-next'}
            accessibilityRole="button"
            accessibilityLabel={isLast ? 'Empezar en EVA' : `Ir a la pantalla ${index + 2} de ${SLIDES.length}`}
            onPress={goNext}
          >
            {({ pressed }) => (
              <View
                className="bg-cta-fill"
                style={[
                  styles.primaryAction,
                  { borderRadius: theme.radius.control, opacity: pressed ? 0.86 : 1 },
                ]}
              >
                <Text className="text-on-sport" style={styles.primaryActionLabel}>
                  {isLast ? 'Empezar' : 'Siguiente'}
                </Text>
                <ArrowRight size={20} color={theme.primaryForeground} strokeWidth={2.25} />
              </View>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topBar: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wordmark: {
    fontFamily: FONT.displayBlack,
    fontSize: 22,
    lineHeight: 24,
    letterSpacing: -1.25,
  },
  skip: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 12,
  },
  skipPlaceholder: {
    width: 48,
    height: 48,
  },
  pressed: {
    opacity: 0.62,
  },
  carousel: {
    flex: 1,
  },
  slideScroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  scene: {
    width: '100%',
    alignItems: 'stretch',
  },
  stage: {
    width: '100%',
    minHeight: 188,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    bottom: '-38%',
    alignSelf: 'center',
    opacity: 0.72,
  },
  cornerAccent: {
    position: 'absolute',
    top: -42,
    right: -24,
    width: 116,
    height: 116,
    borderRadius: 58,
    opacity: 0.5,
  },
  sceneNumber: {
    position: 'absolute',
    top: 16,
    left: 18,
    zIndex: 2,
    fontFamily: FONT.monoBold,
    fontSize: 11,
    lineHeight: 15,
    letterSpacing: 0.7,
  },
  illustration: {
    position: 'absolute',
    bottom: -22,
  },
  trophyBadge: {
    position: 'absolute',
    zIndex: 3,
    top: 28,
    right: 24,
    width: 54,
    height: 54,
  },
  trophyBadgeCompact: {
    top: 22,
    right: 16,
    width: 46,
    height: 46,
  },
  trophy: {
    width: '100%',
    height: '100%',
  },
  copy: {
    alignItems: 'center',
    paddingTop: 22,
  },
  copyLargeText: {
    paddingTop: 18,
  },
  title: {
    marginTop: 7,
    textAlign: 'center',
  },
  body: {
    maxWidth: 350,
    marginTop: 10,
    textAlign: 'center',
  },
  footer: {
    gap: 14,
    paddingTop: 8,
  },
  progressRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  progressCurrent: {
    minWidth: 20,
    fontFamily: FONT.monoBold,
    fontSize: 12,
    lineHeight: 16,
    textAlign: 'right',
  },
  progressTrack: {
    width: 72,
    height: 3,
    overflow: 'hidden',
    borderRadius: 999,
  },
  progressFill: {
    height: 3,
    borderRadius: 999,
  },
  progressTotal: {
    minWidth: 20,
    fontFamily: FONT.monoMedium,
    fontSize: 12,
    lineHeight: 16,
  },
  primaryAction: {
    minHeight: 56,
    paddingHorizontal: 22,
    paddingVertical: 15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primaryActionLabel: {
    fontFamily: FONT.uiBold,
    fontSize: 17,
    lineHeight: 22,
    letterSpacing: -0.17,
  },
})
