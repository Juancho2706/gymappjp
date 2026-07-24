/**
 * AuraHero (RN) — héroe del Hoy del alumno, espejo del web `AuraHero.tsx`.
 *
 * - Saludo contextual por hora.
 * - Anillo principal de energía (react-native-svg) animado con un resorte de
 *   reanimated al montar/cambiar; trazo = `theme.primary` (white-label).
 * - "Aura"/glow detrás del anillo: halo translúcido del primario cuya opacidad
 *   crece con el % (auraGlowAlpha) + shadowColor del primario (iOS) / elevation
 *   con halo (Android).
 * - 3 mini-anillos de macro: ember/aqua fijos y sport desde la marca efectiva.
 * - Respeta reduce-motion (estado final directo, sin resorte) vía useEvaMotion.
 *
 * La celebración de la meta de energía la dispara el contenedor (TodayTab) sobre
 * el CelebrationOverlay ya existente — este componente es solo el hero visual.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { MotiView } from 'moti'
import Animated, {
  runOnJS,
  useAnimatedProps,
  useAnimatedReaction,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import {
  auraGlowAlpha,
  energyProgressRatio,
  formatNutritionCalories,
  greetingForHour,
  NUTRITION_MACROS,
  type NutritionMacroKey,
} from '@eva/nutrition-v2'
import { useTheme } from '../../context/ThemeContext'
import { useEvaMotion } from '../../lib/motion'
import {
  hexToRgba,
  resolveEffectiveCoachBrandTheme,
  resolveNutritionMacroColors,
} from '../../lib/theme'
import { shadow } from '../../lib/shadows'
import { FONT, TYPE_SCALE } from '../../lib/typography'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

const MAIN_SIZE = 216
const MAIN_STROKE = 16
const MINI_SIZE = 74
const MINI_STROKE = 8

const MACRO_LABEL_CLASSES: Record<NutritionMacroKey, string> = {
  protein: 'text-ember-700 dark:text-ember-300',
  carbs: 'text-sport-700 dark:text-sport-300',
  // El DS no define aqua-300; aqua-700 ya cambia al foreground legible bajo `.dark`.
  fats: 'text-aqua-700',
}

interface MacroValue {
  consumed: number
  target: number | null
}

interface Props {
  greetingName?: string | null
  calories: { consumed: number; target: number | null }
  macros: { protein: MacroValue; carbs: MacroValue; fats: MacroValue }
}

/** Anillo SVG genérico con relleno animado (resorte) y contenido centrado. */
function AuraRing({
  size,
  stroke,
  ratio,
  color,
  trackColor,
  accessibilityLabel,
  children,
}: {
  size: number
  stroke: number
  ratio: number
  color: string
  trackColor: string
  accessibilityLabel: string
  children?: ReactNode
}) {
  const motion = useEvaMotion()
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clamped = Math.max(0, Math.min(ratio, 1))
  const target = c * (1 - clamped)

  const offset = useSharedValue(c)
  useEffect(() => {
    offset.value = motion.reduced
      ? target
      : withSpring(target, motion.spring('ui') as Parameters<typeof withSpring>[1])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, motion.reduced])
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value }))

  return (
    <View
      accessible
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="image"
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        {children}
      </View>
    </View>
  )
}

function MacroMiniRing({
  macro,
  value,
  color,
}: {
  macro: NutritionMacroKey
  value: MacroValue
  color: string
}) {
  const meta = NUTRITION_MACROS[macro]
  const ratio = energyProgressRatio(value.consumed, value.target)
  const hasTarget = value.target != null && value.target > 0
  const accessibilityLabel = hasTarget
    ? `${meta.label}: ${Math.round(value.consumed)} de ${Math.round(value.target as number)} g`
    : `${meta.label}: ${Math.round(value.consumed)} g`

  return (
    <View style={styles.miniWrap}>
      <AuraRing
        accessibilityLabel={accessibilityLabel}
        size={MINI_SIZE}
        stroke={MINI_STROKE}
        ratio={ratio}
        color={color}
        trackColor={hexToRgba(color, 0.16)}
      >
        <Text className="text-text-strong" style={styles.miniValue}>
          {Math.round(value.consumed)}
        </Text>
        {hasTarget ? (
          <Text className="text-text-subtle" style={styles.miniTarget}>
            / {Math.round(value.target as number)}
          </Text>
        ) : null}
      </AuraRing>
      <Text accessible={false} className={MACRO_LABEL_CLASSES[macro]} style={styles.miniLabel}>
        {meta.shortLabel}
      </Text>
    </View>
  )
}

/** Número de kcal con resorte, estático cuando el sistema reduce movimiento. */
function AnimatedKcal({ value }: { value: number }) {
  const motion = useEvaMotion()
  const rounded = Math.max(Math.round(value), 0)
  const animatedValue = useSharedValue(motion.reduced ? rounded : 0)
  const [display, setDisplay] = useState(motion.reduced ? rounded : 0)

  useAnimatedReaction(
    () => Math.max(Math.round(animatedValue.value), 0),
    (next, previous) => {
      if (next !== previous) runOnJS(setDisplay)(next)
    },
    [],
  )

  useEffect(() => {
    if (motion.reduced) {
      animatedValue.value = rounded
      setDisplay(rounded)
      return
    }
    animatedValue.value = withSpring(rounded, motion.spring('ui') as Parameters<typeof withSpring>[1])
    // `animatedValue` es estable; `motion.spring` cambia de identidad en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rounded, motion.reduced])

  return <>{new Intl.NumberFormat('es-CL').format(display)}</>
}

export function AuraHero({ greetingName, calories, macros }: Props) {
  const { theme, branding } = useTheme()
  const motion = useEvaMotion()
  const { width } = useWindowDimensions()
  const expanded = width >= 640
  const [hour] = useState(() => new Date().getHours())
  const greeting = greetingForHour(hour, greetingName)
  const effectiveBrand = useMemo(() => resolveEffectiveCoachBrandTheme(branding), [branding])
  const macroColors = useMemo(
    () => resolveNutritionMacroColors(effectiveBrand.brandColor),
    [effectiveBrand.brandColor],
  )

  const { consumed, target } = calories
  const ratio = energyProgressRatio(consumed, target)
  const alpha = auraGlowAlpha(consumed, target)
  const hasTarget = target != null && target > 0
  const remaining = hasTarget ? Math.max((target as number) - consumed, 0) : null
  const energyAccessibilityLabel = hasTarget
    ? `${Math.round(consumed)} de ${Math.round(target as number)} kcal`
    : `${Math.round(consumed)} kcal consumidas`

  return (
    <MotiView
      className="bg-surface-card"
      from={motion.reduced ? undefined : { opacity: 0, translateY: 8 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: motion.duration('slower') }}
      style={[{ borderRadius: theme.radius.card }, shadow('sm', theme.scheme)]}
    >
      <View
        className="overflow-hidden rounded-card border border-border-subtle bg-surface-card"
        style={{ padding: expanded ? 24 : 20 }}
      >
        <MotiView
          from={motion.reduced ? undefined : { opacity: 0, translateY: 6 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: motion.duration('slow'), delay: motion.reduced ? 0 : 50 }}
        >
          <Text
            className="text-text-strong"
            style={[
              styles.greeting,
              { fontSize: expanded ? TYPE_SCALE['2xl'] : TYPE_SCALE.xl },
            ]}
          >
            {greeting}
          </Text>
          <Text className="text-text-muted" style={styles.subtitle}>
            {hasTarget ? 'Tu energía de hoy' : 'Vas sumando tu día'}
          </Text>
        </MotiView>

        <View style={styles.ringStage}>
          {/* Aura/glow detrás del anillo — deriva del primario, intensidad ↑ con el %. */}
          <MotiView
            pointerEvents="none"
            from={motion.reduced ? undefined : { opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'timing', duration: motion.duration('slower') }}
            style={[
              styles.glow,
              {
                width: MAIN_SIZE * 0.9,
                height: MAIN_SIZE * 0.9,
                backgroundColor: hexToRgba(theme.primary, alpha),
                shadowColor: theme.primary,
                shadowOpacity: 0.15 + ratio * 0.35,
                shadowRadius: 26,
                elevation: 10,
              },
            ]}
          />
          <AuraRing
            accessibilityLabel={energyAccessibilityLabel}
            size={MAIN_SIZE}
            stroke={MAIN_STROKE}
            ratio={ratio}
            color={theme.primary}
            trackColor={hexToRgba(theme.primary, 0.13)}
          >
            <Text
              className="text-text-strong"
              style={[
                styles.kcal,
                {
                  fontSize: expanded ? TYPE_SCALE['5xl'] : TYPE_SCALE['4xl'],
                  lineHeight: expanded ? TYPE_SCALE['5xl'] : TYPE_SCALE['4xl'],
                },
              ]}
            >
              <AnimatedKcal value={consumed} />
            </Text>
            <Text className="text-text-subtle" style={styles.kcalUnit}>
              kcal
            </Text>
            {hasTarget ? (
              <Text className="text-text-muted" style={styles.kcalTarget}>
                de{' '}
                <Text className="text-text-body" style={styles.kcalTargetValue}>
                  {formatNutritionCalories(target as number)}
                </Text>
              </Text>
            ) : (
              <Text className="text-text-muted" style={styles.kcalHint}>
                Registra lo que comas para ver tu avance
              </Text>
            )}
          </AuraRing>
        </View>

        {remaining != null ? (
          <Text className="text-primary" style={styles.remaining}>
            {remaining > 0 ? `${formatNutritionCalories(remaining)} restantes` : 'Meta de energía cumplida'}
          </Text>
        ) : null}

        <MotiView
          from={motion.reduced ? undefined : { opacity: 0, translateY: 6 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: motion.duration('slow'), delay: motion.reduced ? 0 : 120 }}
          style={[styles.miniRow, { borderTopColor: theme.border }]}
        >
          <MacroMiniRing macro="protein" value={macros.protein} color={macroColors.protein} />
          <MacroMiniRing macro="carbs" value={macros.carbs} color={macroColors.carbs} />
          <MacroMiniRing macro="fats" value={macros.fats} color={macroColors.fats} />
        </MotiView>
      </View>
    </MotiView>
  )
}

const styles = StyleSheet.create({
  greeting: { fontFamily: FONT.display, letterSpacing: TYPE_SCALE.xl * -0.015 },
  subtitle: { fontFamily: FONT.ui, fontSize: TYPE_SCALE.sm, marginTop: 2 },
  ringStage: { alignItems: 'center', justifyContent: 'center', marginTop: 20 },
  glow: { position: 'absolute', borderRadius: 999, shadowOffset: { width: 0, height: 0 } },
  center: { alignItems: 'center', justifyContent: 'center' },
  kcal: { fontFamily: FONT.display, fontVariant: ['tabular-nums'] },
  kcalUnit: { fontFamily: FONT.uiMedium, fontSize: TYPE_SCALE.xs, marginTop: 4 },
  kcalTarget: { fontFamily: FONT.ui, fontSize: TYPE_SCALE.xs, marginTop: 8 },
  kcalTargetValue: { fontFamily: FONT.uiSemibold, fontVariant: ['tabular-nums'] },
  kcalHint: { fontFamily: FONT.ui, fontSize: TYPE_SCALE.xs, marginTop: 8, textAlign: 'center', maxWidth: 160 },
  remaining: {
    fontFamily: FONT.uiSemibold,
    fontSize: TYPE_SCALE.sm,
    textAlign: 'center',
    marginTop: 12,
    fontVariant: ['tabular-nums'],
  },
  miniRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
  },
  miniWrap: { flex: 1, alignItems: 'center', gap: 6 },
  miniValue: { fontFamily: FONT.uiBold, fontSize: TYPE_SCALE.sm, fontVariant: ['tabular-nums'], lineHeight: TYPE_SCALE.sm },
  miniTarget: { fontFamily: FONT.ui, fontSize: 10, fontVariant: ['tabular-nums'], lineHeight: 10 },
  miniLabel: { fontFamily: FONT.uiSemibold, fontSize: TYPE_SCALE.xs, marginTop: 2 },
})
