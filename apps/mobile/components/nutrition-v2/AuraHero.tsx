/**
 * AuraHero (RN) — héroe del Hoy del alumno, espejo del web `AuraHero.tsx`.
 *
 * - Saludo contextual por hora.
 * - BANDA de energía con el rango ±10% sombreado (T2.7 F2, decisión D-A del owner: la banda
 *   del catálogo reemplaza al anillo grande; la meta es un rango, no un número que se falla).
 *   Relleno = `theme.primary` (white-label); la zona objetivo = success semántico fijo.
 * - "Aura"/glow detrás del bloque de energía: halo translúcido del primario cuya opacidad
 *   crece con el % (auraGlowAlpha).
 * - 3 mini-anillos de macro con la paleta categórica FIJA (T2.7 F1).
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
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import {
  auraGlowAlpha,
  energyBandGeometry,
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
  resolveNutritionMacroColors,
} from '../../lib/theme'
import { shadow } from '../../lib/shadows'
import { FONT, TYPE_SCALE } from '../../lib/typography'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

/**
 * El aura ahora vive detrás del BLOQUE de la banda (T2.7 F2): halo elíptico bajo, con el
 * gradiente cayendo a opacidad 0 en el borde para que se lea como luz y no como un disco.
 */
const GLOW_SIZE = 220
const MINI_SIZE = 74
const MINI_STROKE = 8

// T2.7 F1: trio fijo de macros, identico en claro y oscuro (espejo de --color-macro-* web).
const MACRO_LABEL_CLASSES: Record<NutritionMacroKey, string> = {
  protein: 'text-macro-protein',
  carbs: 'text-macro-carbs',
  fats: 'text-macro-fats',
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
  /**
   * Racha honesta semanal (T2.7 F2, catálogo Hoy #7): días CERRADOS de esta semana dentro del
   * rango de energía. `null` = sin días evaluables — el chip no se pinta (espejo web).
   */
  weekInRangeCount?: number | null
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

/**
 * Relleno animado de la banda de energía. El ancho anima en PIXELES (reanimated no interpola
 * porcentajes): el track mide su ancho con onLayout y de ahí sale el destino del resorte.
 */
function BandFill({ trackWidth, fillPercent, color }: { trackWidth: number; fillPercent: number; color: string }) {
  const motion = useEvaMotion()
  const targetPx = (trackWidth * fillPercent) / 100
  const width = useSharedValue(0)
  useEffect(() => {
    width.value = motion.reduced
      ? targetPx
      : withSpring(targetPx, motion.spring('ui') as Parameters<typeof withSpring>[1])
    // `width` es estable; `motion.spring` cambia de identidad en cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetPx, motion.reduced])
  const animatedStyle = useAnimatedStyle(() => ({ width: width.value }))
  return <Animated.View style={[styles.bandFill, { backgroundColor: color }, animatedStyle]} />
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

export function AuraHero({ greetingName, calories, macros, weekInRangeCount = null }: Props) {
  const { theme } = useTheme()
  const motion = useEvaMotion()
  const { width } = useWindowDimensions()
  const expanded = width >= 640
  const [hour] = useState(() => new Date().getHours())
  const greeting = greetingForHour(hour, greetingName)
  // T2.7 F1: los macros ya no siguen la marca — trio fijo, sin dependencia del branding.
  const macroColors = useMemo(() => resolveNutritionMacroColors(), [])

  const { consumed, target } = calories
  const alpha = auraGlowAlpha(consumed, target)
  const hasTarget = target != null && target > 0
  // Riel de la banda (0..115% de la meta) con la zona objetivo ±10% adentro; null sin meta.
  const band = energyBandGeometry(consumed, target)
  const [bandWidth, setBandWidth] = useState(0)
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
          style={styles.greetingRow}
        >
          <View style={styles.greetingBlock}>
            <Text
              className="text-strong"
              style={[
                styles.greeting,
                { fontSize: expanded ? TYPE_SCALE['2xl'] : TYPE_SCALE.xl },
              ]}
              numberOfLines={1}
            >
              {greeting}
            </Text>
            <Text className="text-muted" style={styles.subtitle}>
              {hasTarget ? 'Tu energía de hoy' : 'Vas sumando tu día'}
            </Text>
          </View>
          {/* Racha honesta semanal (catálogo Hoy #7): "N de 7 en rango" — nunca un streak frágil
              que se rompe un martes. Solo se pinta con días evaluables. */}
          {weekInRangeCount != null ? (
            <View className="rounded-pill bg-success-500/15 px-2.5 py-1">
              <Text className="text-xs font-semibold text-success-700" style={styles.rangePill}>
                {weekInRangeCount} de 7 en rango
              </Text>
            </View>
          ) : null}
        </MotiView>

        {/* Banda de energía (T2.7 F2, D-A): riel 0→115% de la meta, zona ±10% sombreada. */}
        <View style={styles.bandStage}>
          {/* Aura/glow detrás del bloque — deriva del primario, intensidad ↑ con el %. */}
          <MotiView
            pointerEvents="none"
            from={motion.reduced ? undefined : { opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'timing', duration: motion.duration('slower') }}
            style={[styles.glow, { width: GLOW_SIZE, height: GLOW_SIZE }]}
          >
            {/*
              Gradiente radial de verdad, no un disco con sombra (en Android `elevation` dibuja un
              POLÍGONO gris). El halo va achatado con scaleY: luz ambiental detrás de la banda.
            */}
            <Svg width={GLOW_SIZE} height={GLOW_SIZE} style={styles.glowSquash}>
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

          <View style={styles.bandHead}>
            <Text className="text-muted" style={styles.bandLabel} numberOfLines={1}>
              {rangeLow != null && rangeHigh != null
                ? `ENERGÍA · RANGO ${new Intl.NumberFormat('es-CL').format(rangeLow)}–${new Intl.NumberFormat('es-CL').format(rangeHigh)}`
                : 'ENERGÍA'}
            </Text>
            <View style={styles.kcalRow}>
              <Text
                className="text-strong"
                style={[
                  styles.kcal,
                  {
                    fontSize: expanded ? TYPE_SCALE['4xl'] : TYPE_SCALE['3xl'],
                    lineHeight: expanded ? TYPE_SCALE['4xl'] : TYPE_SCALE['3xl'],
                  },
                ]}
              >
                <AnimatedKcal value={consumed} />
              </Text>
              <Text className="text-subtle" style={styles.kcalUnit}>
                kcal
              </Text>
            </View>
          </View>

          {band != null ? (
            <>
              <View
                accessible
                accessibilityRole="image"
                accessibilityLabel={energyAccessibilityLabel}
                onLayout={(event) => setBandWidth(event.nativeEvent.layout.width)}
                style={[styles.bandTrack, { backgroundColor: hexToRgba(theme.primary, ringTrackAlpha(theme.scheme)) }]}
              >
                {/* Zona objetivo ±10%: success SEMANTICO fijo (= --color-success), no white-label. */}
                <View
                  style={[
                    styles.bandZone,
                    {
                      left: `${band.zoneStartPercent}%`,
                      width: `${band.zoneEndPercent - band.zoneStartPercent}%`,
                    },
                  ]}
                />
                <BandFill trackWidth={bandWidth} fillPercent={band.fillPercent} color={theme.primary} />
              </View>
              {rangeLow != null && rangeHigh != null ? (
                <View style={styles.bandStatusRow}>
                  <Text className="text-subtle" style={styles.bandStatusHint}>
                    consumido
                  </Text>
                  <Text
                    className={
                      consumed > rangeHigh ? 'text-warning' : consumed >= rangeLow ? 'text-success' : 'text-primary'
                    }
                    style={styles.remaining}
                    numberOfLines={1}
                  >
                    {consumed < rangeLow
                      ? `faltan ~${formatNutritionCalories(rangeLow - consumed)} para tu rango`
                      : consumed <= rangeHigh
                        ? '✓ en tu rango de hoy'
                        : `+${formatNutritionCalories(consumed - rangeHigh)} sobre tu rango`}
                  </Text>
                </View>
              ) : null}
            </>
          ) : (
            <Text className="text-muted" style={styles.kcalHint}>
              Registra lo que comas para ver tu avance
            </Text>
          )}
        </View>

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
  greetingRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  greetingBlock: { flexShrink: 1, minWidth: 0 },
  rangePill: { fontFamily: FONT.uiSemibold, fontVariant: ['tabular-nums'] },
  bandStage: { marginTop: 18 },
  // Sin `shadowOffset`/`elevation`: el halo lo pinta el gradiente radial del SVG, no una sombra.
  glow: { position: 'absolute', alignSelf: 'center', top: -70, alignItems: 'center', justifyContent: 'center' },
  // Halo achatado: luz ambiental detras de la banda, no un disco que domina el bloque.
  glowSquash: { transform: [{ scaleY: 0.55 }] },
  center: { alignItems: 'center', justifyContent: 'center' },
  bandHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
  },
  bandLabel: {
    fontFamily: FONT.uiSemibold,
    fontSize: 11,
    letterSpacing: 0.8,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
    marginBottom: 4,
  },
  kcalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5, flexShrink: 0 },
  kcal: { fontFamily: FONT.display, fontVariant: ['tabular-nums'] },
  kcalUnit: { fontFamily: FONT.uiMedium, fontSize: TYPE_SCALE.xs },
  bandTrack: {
    marginTop: 10,
    height: 12,
    borderRadius: 999,
    overflow: 'hidden',
  },
  bandZone: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    // Success semantico fijo (--color-success-500 de global.css) al 30%, mismo velo que la web.
    backgroundColor: 'rgba(31, 184, 119, 0.3)',
  },
  bandFill: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    borderRadius: 999,
  },
  bandStatusRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 8,
  },
  bandStatusHint: { fontFamily: FONT.ui, fontSize: TYPE_SCALE.xs },
  kcalHint: { fontFamily: FONT.ui, fontSize: TYPE_SCALE.xs, marginTop: 8 },
  remaining: {
    fontFamily: FONT.uiSemibold,
    fontSize: TYPE_SCALE.sm,
    fontVariant: ['tabular-nums'],
    flexShrink: 1,
    textAlign: 'right',
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
