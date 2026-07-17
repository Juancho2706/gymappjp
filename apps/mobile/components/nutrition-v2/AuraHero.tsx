/**
 * AuraHero (RN) — héroe del Hoy del alumno, espejo del web `AuraHero.tsx`.
 *
 * - Saludo contextual por hora.
 * - Anillo principal de energía (react-native-svg) animado con un resorte de
 *   reanimated al montar/cambiar; trazo = `theme.primary` (white-label).
 * - "Aura"/glow detrás del anillo: halo translúcido del primario cuya opacidad
 *   crece con el % (auraGlowAlpha) + shadowColor del primario (iOS) / elevation
 *   con halo (Android).
 * - 3 mini-anillos de macro con su paleta categórica FIJA (MACRO_COLORS).
 * - Respeta reduce-motion (estado final directo, sin resorte) vía useEvaMotion.
 *
 * La celebración de la meta de energía la dispara el contenedor (TodayTab) sobre
 * el CelebrationOverlay ya existente — este componente es solo el hero visual.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { MotiView } from 'moti'
import Animated, { useAnimatedProps, useSharedValue, withSpring } from 'react-native-reanimated'
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
import { hexToRgba } from '../../lib/theme'
import { MACRO_COLORS } from '../MacroRingSummary'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

const MAIN_SIZE = 208
const MAIN_STROKE = 15
const MINI_SIZE = 74
const MINI_STROKE = 7

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
  children,
}: {
  size: number
  stroke: number
  ratio: number
  color: string
  trackColor: string
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
    <View style={{ width: size, height: size }}>
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

function MacroMiniRing({ macro, value }: { macro: NutritionMacroKey; value: MacroValue }) {
  const { theme } = useTheme()
  const meta = NUTRITION_MACROS[macro]
  const color = MACRO_COLORS[macro]
  const ratio = energyProgressRatio(value.consumed, value.target)
  const hasTarget = value.target != null && value.target > 0

  return (
    <View style={styles.miniWrap}>
      <AuraRing size={MINI_SIZE} stroke={MINI_STROKE} ratio={ratio} color={color} trackColor={hexToRgba(color, 0.16)}>
        <Text style={[styles.miniValue, { color: theme.foreground, fontFamily: 'Archivo_800ExtraBold' }]}>
          {Math.round(value.consumed)}
        </Text>
        {hasTarget ? (
          <Text style={[styles.miniTarget, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            / {Math.round(value.target as number)}
          </Text>
        ) : null}
      </AuraRing>
      <Text style={[styles.miniLabel, { color, fontFamily: 'HankenGrotesk_700Bold' }]}>{meta.shortLabel}</Text>
    </View>
  )
}

export function AuraHero({ greetingName, calories, macros }: Props) {
  const { theme } = useTheme()
  const motion = useEvaMotion()
  const [hour] = useState(() => new Date().getHours())
  const greeting = greetingForHour(hour, greetingName)

  const { consumed, target } = calories
  const ratio = energyProgressRatio(consumed, target)
  const alpha = auraGlowAlpha(consumed, target)
  const hasTarget = target != null && target > 0
  const remaining = hasTarget ? Math.max((target as number) - consumed, 0) : null

  return (
    <MotiView
      accessibilityLabel="Resumen de energía de hoy"
      from={motion.reduced ? undefined : { opacity: 0, translateY: 8 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: motion.duration('base') }}
      style={[
        styles.card,
        { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.card },
      ]}
    >
      <Text style={[styles.greeting, { color: theme.foreground, fontFamily: theme.fontDisplay }]}>{greeting}</Text>
      <Text style={[styles.subtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
        {hasTarget ? 'Tu energía de hoy' : 'Vas sumando tu día'}
      </Text>

      <View style={styles.ringStage}>
        {/* Aura/glow detrás del anillo — deriva del primario, intensidad ↑ con el %. */}
        <MotiView
          pointerEvents="none"
          from={motion.reduced ? undefined : { opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'timing', duration: motion.duration('slow') }}
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
          size={MAIN_SIZE}
          stroke={MAIN_STROKE}
          ratio={ratio}
          color={theme.primary}
          trackColor={hexToRgba(theme.primary, 0.13)}
        >
          <Text style={[styles.kcal, { color: theme.foreground, fontFamily: 'Archivo_800ExtraBold' }]}>
            {new Intl.NumberFormat('es-CL').format(Math.max(Math.round(consumed), 0))}
          </Text>
          <Text style={[styles.kcalUnit, { color: theme.mutedForeground, fontFamily: 'HankenGrotesk_700Bold' }]}>
            kcal
          </Text>
          {hasTarget ? (
            <Text style={[styles.kcalTarget, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              de {formatNutritionCalories(target as number)}
            </Text>
          ) : (
            <Text style={[styles.kcalHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              Registra lo que comas para ver tu avance
            </Text>
          )}
        </AuraRing>
      </View>

      {remaining != null ? (
        <Text style={[styles.remaining, { color: theme.primary, fontFamily: 'Archivo_800ExtraBold' }]}>
          {remaining > 0 ? `${formatNutritionCalories(remaining)} restantes` : 'Meta de energía cumplida'}
        </Text>
      ) : null}

      <View style={[styles.miniRow, { borderTopColor: theme.border }]}>
        <MacroMiniRing macro="protein" value={macros.protein} />
        <MacroMiniRing macro="carbs" value={macros.carbs} />
        <MacroMiniRing macro="fats" value={macros.fats} />
      </View>
    </MotiView>
  )
}

const styles = StyleSheet.create({
  card: { padding: 18, borderWidth: 1, gap: 4 },
  greeting: { fontSize: 20, letterSpacing: -0.4 },
  subtitle: { fontSize: 13, marginTop: 2 },
  ringStage: { alignItems: 'center', justifyContent: 'center', marginTop: 14 },
  glow: { position: 'absolute', borderRadius: 999, shadowOffset: { width: 0, height: 0 } },
  center: { alignItems: 'center', justifyContent: 'center' },
  kcal: { fontSize: 42, letterSpacing: -1.5, fontVariant: ['tabular-nums'], lineHeight: 46 },
  kcalUnit: { fontSize: 12, marginTop: 2 },
  kcalTarget: { fontSize: 12, marginTop: 6 },
  kcalHint: { fontSize: 11, marginTop: 6, textAlign: 'center', maxWidth: 150 },
  remaining: { fontSize: 14, textAlign: 'center', marginTop: 12, fontVariant: ['tabular-nums'] },
  miniRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
  },
  miniWrap: { alignItems: 'center', gap: 6 },
  miniValue: { fontSize: 15, letterSpacing: -0.3, lineHeight: 17 },
  miniTarget: { fontSize: 10, lineHeight: 12 },
  miniLabel: { fontSize: 12, letterSpacing: 0.5, marginTop: 2 },
})
