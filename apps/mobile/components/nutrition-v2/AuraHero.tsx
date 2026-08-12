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
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Stop } from 'react-native-svg'
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
/**
 * El aura desborda apenas el anillo: con el gradiente cayendo a opacidad 0 en el borde, el halo
 * muere ANTES del recorte y se lee como luz alrededor del número, no como un disco de color.
 * `ringStage` no recorta, así que sobresalir es seguro.
 */
const GLOW_SIZE = Math.round(MAIN_SIZE * 1.04)
const MINI_SIZE = 74
const MINI_STROKE = 8

const MACRO_LABEL_CLASSES: Record<NutritionMacroKey, string> = {
  protein: 'text-ember-700 dark:text-ember-300',
  carbs: 'text-sport-700 dark:text-sport-300',
  // El DS no define aqua-300; aqua-700 ya cambia al foreground legible bajo `.dark`.
  fats: 'text-aqua-700',
}

/**
 * Alpha del track (anillo de fondo). En dark el alpha bajo del light mezcla el
 * color con la superficie oscura y ensucia el tono (marrón/verdoso); se sube
 * para que el aro se lea como una versión tenue del mismo color, no como barro.
 */
function ringTrackAlpha(scheme: 'light' | 'dark'): number {
  return scheme === 'dark' ? 0.24 : 0.16
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
  zoneColor,
  accessibilityLabel,
  children,
}: {
  size: number
  stroke: number
  ratio: number
  color: string
  trackColor: string
  /** Banda ±10% (T1.4): pinta el tramo final del riel [90%→100%] como zona objetivo. */
  zoneColor?: string
  accessibilityLabel: string
  children?: ReactNode
}) {
  const motion = useEvaMotion()
  // Id propio por anillo: el héroe monta CUATRO (energía + 3 macros) y un id repetido haría que
  // todos pintaran con el degradado del primero que se montó.
  // `useId` devuelve algo tipo `:r3:` y los dos puntos rompen la referencia `url(#id)` del SVG.
  const gradientId = `ring${useId().replace(/[^a-zA-Z0-9]/g, '')}`
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
        <Defs>
          {/*
            El trazo va con un degradado suave del propio color en vez de plano: el arco recibe algo
            de luz de un lado y se apaga del otro, que es lo que hace que se lea como un anillo y no
            como una cinta recortada. Dos paradas del MISMO color (una aclarada) — no entra ningun
            color ajeno, asi que el anillo sigue siendo el color que le corresponde.
          */}
          <LinearGradient id={`${gradientId}-stroke`} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0.72} />
            <Stop offset="0.5" stopColor={color} stopOpacity={1} />
            <Stop offset="1" stopColor={color} stopOpacity={0.88} />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={trackColor} strokeWidth={stroke} fill="none" />
        {zoneColor ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={zoneColor}
            // Mas fina que el trazo y con las puntas redondeadas: sin esto el arco de la zona salia
            // del mismo grosor que el anillo y con los dos extremos cortados EN ESCUADRA, justo al
            // lado de un trazo de progreso que si es redondeado. Ese corte era la "linea tosca".
            strokeWidth={Math.max(stroke - 5, 3)}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${c * 0.1} ${c}`}
            strokeDashoffset={-c * 0.9}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        ) : null}
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={`url(#${gradientId}-stroke)`}
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
  const { theme } = useTheme()
  const meta = NUTRITION_MACROS[macro]
  const ratio = energyProgressRatio(value.consumed, value.target)
  const hasTarget = value.target != null && value.target > 0
  const accessibilityLabel = hasTarget
    ? `${meta.label}: ${Math.round(value.consumed)} de ${Math.round(value.target as number)} g`
    : `${meta.label}: ${Math.round(value.consumed)} g, sin meta`

  return (
    <View style={styles.miniWrap}>
      <AuraRing
        accessibilityLabel={accessibilityLabel}
        size={MINI_SIZE}
        stroke={MINI_STROKE}
        ratio={ratio}
        color={color}
        trackColor={hexToRgba(color, ringTrackAlpha(theme.scheme))}
      >
        <Text className="text-strong" style={styles.miniValue}>
          {Math.round(value.consumed)}
        </Text>
        {/* Sin meta el denominador se mantiene ("/ —") para no romper la simetría de los 3 anillos. */}
        <Text className="text-subtle" style={styles.miniTarget} numberOfLines={1}>
          {hasTarget ? `/ ${Math.round(value.target as number)}` : '/ —'}
        </Text>
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
  // Banda ±10% (T1.4, paridad exacta con web AuraHero): la meta es un RANGO, no un numero que
  // se falla. Bajo el rango (marca) / en rango (success fijo) / sobre el rango (ambar, nunca rojo).
  const rangeLow = hasTarget ? Math.round((target as number) * 0.9) : null
  const rangeHigh = hasTarget ? Math.round((target as number) * 1.1) : null
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
        className="overflow-hidden rounded-card border border-subtle bg-surface-card"
        style={{ padding: expanded ? 24 : 20 }}
      >
        <MotiView
          from={motion.reduced ? undefined : { opacity: 0, translateY: 6 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: motion.duration('slow'), delay: motion.reduced ? 0 : 50 }}
        >
          <Text
            className="text-strong"
            style={[
              styles.greeting,
              { fontSize: expanded ? TYPE_SCALE['2xl'] : TYPE_SCALE.xl },
            ]}
          >
            {greeting}
          </Text>
          <Text className="text-muted" style={styles.subtitle}>
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
            style={[styles.glow, { width: GLOW_SIZE, height: GLOW_SIZE }]}
          >
            {/*
              Gradiente radial de verdad, no un disco con sombra. Antes eran dos capas que en
              Android salían mal: un `backgroundColor` con alpha —un disco PLANO, sin difuminado,
              con borde duro— y un `elevation: 10` que ignora `shadowColor`/`shadowOpacity`/
              `shadowRadius` (props de iOS) y dibuja su propia sombra aproximando la silueta con un
              POLÍGONO. De ahí el octágono gris que se veía dentro del anillo. El gradiente resuelve
              las dos cosas y se ve idéntico en las dos plataformas.
            */}
            <Svg width={GLOW_SIZE} height={GLOW_SIZE}>
              <Defs>
                <RadialGradient id="aura-glow" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor={theme.primary} stopOpacity={alpha} />
                  <Stop offset="0.45" stopColor={theme.primary} stopOpacity={alpha * 0.72} />
                  <Stop offset="0.78" stopColor={theme.primary} stopOpacity={alpha * 0.28} />
                  <Stop offset="1" stopColor={theme.primary} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle cx={GLOW_SIZE / 2} cy={GLOW_SIZE / 2} r={GLOW_SIZE / 2} fill="url(#aura-glow)" />
            </Svg>
          </MotiView>
          <AuraRing
            accessibilityLabel={energyAccessibilityLabel}
            size={MAIN_SIZE}
            stroke={MAIN_STROKE}
            ratio={ratio}
            color={theme.primary}
            trackColor={hexToRgba(theme.primary, ringTrackAlpha(theme.scheme))}
            // Zona objetivo de la banda ±10%: success SEMANTICO fijo (= --color-success de
            // global.css), nunca white-label — espejo del arco de la web.
            zoneColor={hasTarget ? 'rgba(31, 184, 119, 0.35)' : undefined}
          >
            <Text
              className="text-strong"
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
            <Text className="text-subtle" style={styles.kcalUnit}>
              kcal
            </Text>
            {hasTarget ? (
              <Text className="text-muted" style={styles.kcalTarget}>
                de{' '}
                <Text className="text-body" style={styles.kcalTargetValue}>
                  {formatNutritionCalories(target as number)}
                </Text>
              </Text>
            ) : (
              <Text className="text-muted" style={styles.kcalHint}>
                Registra lo que comas para ver tu avance
              </Text>
            )}
          </AuraRing>
        </View>

        {rangeLow != null && rangeHigh != null ? (
          <Text
            className={
              consumed > rangeHigh ? 'text-warning' : consumed >= rangeLow ? 'text-success' : 'text-primary'
            }
            style={styles.remaining}
          >
            {consumed < rangeLow
              ? `faltan ~${formatNutritionCalories(rangeLow - consumed)} para tu rango`
              : consumed <= rangeHigh
                ? '✓ en tu rango de hoy'
                : `+${formatNutritionCalories(consumed - rangeHigh)} sobre tu rango`}
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
  // Sin `shadowOffset`/`elevation`: el halo lo pinta el gradiente radial del SVG, no una sombra.
  glow: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
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
  // `lineHeight` NO puede ser menor que el fontSize: con la fuente custom Android calcula una caja
  // de una sola linea y recorta el wrap ("/ 290" quedaba en "/"). Alto natural + numberOfLines={1}
  // en el Text: el denominador nunca envuelve.
  miniTarget: { fontFamily: FONT.ui, fontSize: 10, fontVariant: ['tabular-nums'], lineHeight: 13 },
  miniLabel: { fontFamily: FONT.uiSemibold, fontSize: TYPE_SCALE.xs, marginTop: 2 },
})
