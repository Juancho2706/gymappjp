import { useEffect, type ReactNode } from 'react'
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { MotiView } from 'moti'
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'
import { LinearGradient } from 'expo-linear-gradient'
import { Activity, Dumbbell, Flame, Heart, Star, Zap, type LucideIcon } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { EvaFigure, evaFigureHeight } from '../entry/EvaFigure'
import { CircularBrandLogo } from '../CircularBrandLogo'
import { hexToRgba } from '../../lib/theme'
import type { LoaderComposite, LoaderSymbol, LoaderVariant } from '../../lib/brand-loaders'

/**
 * Las 6 variantes white-label + el loader compuesto, en idioma RN.
 *
 * Traduccion 1:1 de `apps/web/src/components/loaders/{variants.tsx,loader-variants.module.css}`
 * usando SOLO libs ya instaladas (react-native-svg, moti/reanimated, expo-linear-gradient,
 * lucide-react-native) ⇒ cero modulos nativos nuevos ⇒ apto para OTA sobre el binario viejo.
 *
 * Deltas conscientes respecto de la web (no hay equivalente RN):
 *  - `drop-shadow(0 0 12px …)` del icono: se omite (filter no existe en RN).
 *  - `conic-gradient` del cometa: se aproxima con 6 arcos SVG de opacidad decreciente.
 *  - `bg-clip-text` del wordmark: el wordmark va en color solido `--foreground` (igual que web,
 *    que en las variantes tampoco usa el shimmer: ese es exclusivo de la rama EVA legacy).
 *
 * Reduced motion (espejo de css:152-163): TODO estatico; barra al 70%, ecualizador al 70%,
 * radar con UN anillo tenue, anillo de pulso al 30% de opacidad.
 */

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

export type LoaderVariantSize = 'md' | 'lg'

const BOX: Record<LoaderVariantSize, number> = { lg: 120, md: 92 }
const ICON: Record<LoaderVariantSize, number> = { lg: 48, md: 38 }
const WORD: Record<LoaderVariantSize, number> = { lg: 34, md: 26 }
const EQ_H: Record<LoaderVariantSize, number> = { lg: 56, md: 44 }
const CORE: Record<LoaderVariantSize, number> = { lg: 56, md: 44 }
const CORE_ICON: Record<LoaderVariantSize, number> = { lg: 28, md: 22 }
const ORBIT_ICON: Record<LoaderVariantSize, number> = { lg: 40, md: 32 }
/** Tamano del simbolo del compositor (web variants.tsx:192). */
const SYMBOL_PX: Record<LoaderVariantSize, number> = { lg: 52, md: 40 }

export type LoaderVariantProps = {
  /** Wordmark ya resuelto por el orquestador (loader_text o 'EVA'). */
  brandName?: string
  /** Logo del coach ya resuelto por modo (claro/oscuro). null ⇒ figura EVA. */
  logoUri?: string | null
  /** `loader_icon_mode !== 'none'`. */
  showIcon?: boolean
  subtitle?: string
  size?: LoaderVariantSize
  /** Ajuste del SO ya leido por el orquestador (una sola lectura por arbol). */
  reduceMotion?: boolean
}

/** "#rrggbb"/"rgba(...)" + alpha ⇒ literal rgba. Espejo de `rgba(var(--ld-rgb), a)` de la web. */
function alpha(color: string, a: number): string {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return hexToRgba(color, a)
  const m = color.match(/-?\d+(?:\.\d+)?/g)
  if (m && m.length >= 3) return `rgba(${m[0]}, ${m[1]}, ${m[2]}, ${a})`
  return color
}

/* ── piezas comunes ─────────────────────────────────────────────────────────── */

function Spin({
  duration,
  reverse = false,
  reduceMotion,
  style,
  children,
}: {
  duration: number
  reverse?: boolean
  reduceMotion: boolean
  style?: StyleProp<ViewStyle>
  children: ReactNode
}) {
  if (reduceMotion) return <View style={style}>{children}</View>
  return (
    <MotiView
      style={style}
      from={{ rotate: '0deg' }}
      animate={{ rotate: reverse ? '-360deg' : '360deg' }}
      transition={{ type: 'timing', duration, easing: Easing.linear, loop: true, repeatReverse: false }}
    >
      {children}
    </MotiView>
  )
}

const ABS_CENTER: ViewStyle = { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' }

function LoaderIcon({ logoUri, px, reduceMotion }: { logoUri?: string | null; px: number; reduceMotion: boolean }) {
  const { resolvedScheme, theme } = useTheme()
  const height = logoUri ? px : evaFigureHeight(px)
  const content = logoUri ? (
    <CircularBrandLogo uri={logoUri} size={px} backgroundColor={theme.card} padding={Math.round(px * 0.08)} />
  ) : (
    // El asset EVA es blanco puro: sobre tema claro se tiñe con la tinta del tema.
    <EvaFigure size={px} style={resolvedScheme === 'dark' ? null : { tintColor: theme.foreground }} />
  )
  const box: ViewStyle = { width: px, height, alignItems: 'center', justifyContent: 'center' }
  if (reduceMotion) return <View style={box}>{content}</View>
  return (
    <MotiView
      style={box}
      from={{ translateY: 0 }}
      animate={{ translateY: -4 }}
      transition={{ type: 'timing', duration: 1400, easing: Easing.inOut(Easing.ease), loop: true, repeatReverse: true }}
    >
      {content}
    </MotiView>
  )
}

function Wordmark({ text, size }: { text?: string; size: LoaderVariantSize }) {
  const { theme } = useTheme()
  const fs = WORD[size]
  return (
    <Text
      numberOfLines={1}
      style={{
        fontSize: fs,
        lineHeight: fs * 1.08,
        color: theme.foreground,
        // Slot display: `lib/brand-fonts.ts` lo re-mapea a la fuente de marca en el arranque.
        fontFamily: 'Archivo_800ExtraBold',
        letterSpacing: -fs * 0.04,
      }}
    >
      {(text?.trim() || 'EVA').toUpperCase()}
    </Text>
  )
}

function Caption({ subtitle }: { subtitle?: string }) {
  const { theme } = useTheme()
  if (!subtitle) return null
  return (
    <Text style={{ fontSize: 12.5, color: theme.mutedForeground, fontFamily: theme.fontSans, maxWidth: 288, textAlign: 'center' }}>
      {subtitle}
    </Text>
  )
}

function BrandBar({ color, reduceMotion }: { color: string; reduceMotion: boolean }) {
  return (
    <View style={{ width: 200, height: 3, borderRadius: 99, backgroundColor: alpha(color, 0.12), overflow: 'hidden' }}>
      {reduceMotion ? (
        <View style={{ width: 140, height: 3, borderRadius: 99, backgroundColor: color }} />
      ) : (
        <MotiView
          style={{ height: 3, borderRadius: 99, backgroundColor: color }}
          from={{ width: 16 }}
          animate={{ width: 200 }}
          transition={{ type: 'timing', duration: 2600, easing: Easing.inOut(Easing.ease), loop: true, repeatReverse: false }}
        />
      )}
    </View>
  )
}

function Wrap({ children }: { children: ReactNode }) {
  return (
    <View style={styles.wrap} accessibilityRole="progressbar" accessibilityLabel="Cargando">
      {children}
    </View>
  )
}

function Box({ size, children }: { size: LoaderVariantSize; children: ReactNode }) {
  const b = BOX[size]
  return <View style={{ width: b, height: b, alignItems: 'center', justifyContent: 'center' }}>{children}</View>
}

/* ── 01 · progreso ──────────────────────────────────────────────────────────── */
function ProgresoLoader({ brandName, logoUri, showIcon, subtitle, size = 'lg', reduceMotion = false }: LoaderVariantProps) {
  const { theme } = useTheme()
  const b = BOX[size]
  return (
    <Wrap>
      <Box size={size}>
        <Spin duration={7000} reduceMotion={reduceMotion} style={ABS_CENTER}>
          <Svg width={b} height={b} viewBox="0 0 120 120">
            <Circle cx={60} cy={60} r={54} fill="none" stroke={alpha(theme.primary, 0.18)} strokeWidth={1.5} strokeDasharray="2 7" strokeLinecap="round" />
          </Svg>
        </Spin>
        {showIcon ? <LoaderIcon logoUri={logoUri} px={ICON[size]} reduceMotion={reduceMotion} /> : null}
      </Box>
      <View style={{ alignItems: 'center', gap: 12 }}>
        <Wordmark text={brandName} size={size} />
        <BrandBar color={theme.primary} reduceMotion={reduceMotion} />
        <Caption subtitle={subtitle} />
      </View>
    </Wrap>
  )
}

/* ── 02 · anillo ────────────────────────────────────────────────────────────── */
function AnilloLoader({ brandName, logoUri, showIcon, subtitle, size = 'lg', reduceMotion = false }: LoaderVariantProps) {
  const { theme } = useTheme()
  const b = BOX[size]
  const offset = useSharedValue(360)
  useEffect(() => {
    if (reduceMotion) {
      offset.value = 110
      return
    }
    offset.value = withRepeat(
      withSequence(
        withTiming(110, { duration: 800, easing: Easing.inOut(Easing.ease) }),
        withTiming(360, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
    )
  }, [reduceMotion, offset])
  const animatedProps = useAnimatedProps(() => ({ strokeDashoffset: offset.value }))

  return (
    <Wrap>
      <Box size={size}>
        <Spin duration={1200} reduceMotion={reduceMotion} style={ABS_CENTER}>
          <Svg width={b} height={b} viewBox="0 0 120 120">
            <Circle cx={60} cy={60} r={50} fill="none" stroke={alpha(theme.primary, 0.12)} strokeWidth={5} />
            <AnimatedCircle
              cx={60}
              cy={60}
              r={50}
              fill="none"
              stroke={theme.primary}
              strokeWidth={5}
              strokeLinecap="round"
              strokeDasharray={314}
              animatedProps={animatedProps}
            />
          </Svg>
        </Spin>
        {showIcon ? <LoaderIcon logoUri={logoUri} px={ICON[size]} reduceMotion={reduceMotion} /> : null}
      </Box>
      <Wordmark text={brandName} size={size} />
      <Caption subtitle={subtitle} />
    </Wrap>
  )
}

/* ── 03 · radar ─────────────────────────────────────────────────────────────── */
const PING_DELAYS = [0, 730, 1460]
function RadarLoader({ brandName, logoUri, showIcon, subtitle, size = 'lg', reduceMotion = false }: LoaderVariantProps) {
  const { theme } = useTheme()
  const b = BOX[size]
  const core = CORE[size]
  const ring: ViewStyle = { position: 'absolute', width: b, height: b, borderRadius: b / 2, borderWidth: 2, borderColor: theme.primary }
  return (
    <Wrap>
      <Box size={size}>
        {reduceMotion ? (
          // Estatico: un solo anillo tenue centrado (css:161).
          <View style={[ring, { opacity: 0.25 }]} />
        ) : (
          PING_DELAYS.map((delay, i) => (
            <MotiView
              key={i}
              style={ring}
              from={{ scale: 0.45, opacity: 0.9 }}
              animate={{ scale: 1.7, opacity: 0 }}
              transition={{ type: 'timing', duration: 2200, delay, easing: Easing.out(Easing.ease), loop: true, repeatReverse: false }}
            />
          ))
        )}
        <View
          style={{
            width: core,
            height: core,
            borderRadius: core / 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: alpha(theme.primary, 0.12),
            borderWidth: 1,
            borderColor: alpha(theme.primary, 0.4),
          }}
        >
          {showIcon ? <LoaderIcon logoUri={logoUri} px={CORE_ICON[size]} reduceMotion={reduceMotion} /> : null}
        </View>
      </Box>
      <Wordmark text={brandName} size={size} />
      <Caption subtitle={subtitle} />
    </Wrap>
  )
}

/* ── 04 · cometa ────────────────────────────────────────────────────────────── */
// RN no tiene conic-gradient ni mask CSS: la cola se aproxima con 6 arcos SVG de opacidad
// decreciente sobre el mismo anillo, rotando como bloque (mismo periodo que la web, 1s).
const COMET_R = 57
const COMET_C = 2 * Math.PI * COMET_R
const COMET_SEG = COMET_C / 6
const COMET_OPACITY = [1, 0.72, 0.5, 0.32, 0.18, 0.07]
function CometaLoader({ brandName, logoUri, showIcon, subtitle, size = 'lg', reduceMotion = false }: LoaderVariantProps) {
  const { theme } = useTheme()
  const b = BOX[size]
  return (
    <Wrap>
      <Box size={size}>
        <Spin duration={1000} reduceMotion={reduceMotion} style={ABS_CENTER}>
          <Svg width={b} height={b} viewBox="0 0 120 120">
            {COMET_OPACITY.map((op, i) => (
              <Circle
                key={i}
                cx={60}
                cy={60}
                r={COMET_R}
                fill="none"
                stroke={theme.primary}
                strokeOpacity={op}
                strokeWidth={6}
                strokeDasharray={`${COMET_SEG + 1} ${COMET_C - COMET_SEG - 1}`}
                strokeDashoffset={-i * COMET_SEG}
              />
            ))}
          </Svg>
        </Spin>
        {showIcon ? <LoaderIcon logoUri={logoUri} px={ICON[size]} reduceMotion={reduceMotion} /> : null}
      </Box>
      <Wordmark text={brandName} size={size} />
      <Caption subtitle={subtitle} />
    </Wrap>
  )
}

/* ── 05 · ritmo (unica sin icono) ───────────────────────────────────────────── */
const EQ_DELAYS = [0, 180, 360, 540, 720]
function RitmoLoader({ brandName, subtitle, size = 'lg', reduceMotion = false }: LoaderVariantProps) {
  const { theme } = useTheme()
  const h = EQ_H[size]
  const colors: [string, string] = [theme.primary, alpha(theme.primary, 0.4)]
  return (
    <Wrap>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 7, height: h }}>
        {EQ_DELAYS.map((delay, i) =>
          reduceMotion ? (
            <View key={i} style={{ width: 7, height: h * 0.7, borderRadius: 4, overflow: 'hidden' }}>
              <LinearGradient colors={colors} style={{ flex: 1 }} />
            </View>
          ) : (
            <MotiView
              key={i}
              style={{ width: 7, borderRadius: 4, overflow: 'hidden' }}
              from={{ height: h * 0.28 }}
              animate={{ height: h }}
              transition={{ type: 'timing', duration: 500, delay, easing: Easing.inOut(Easing.ease), loop: true, repeatReverse: true }}
            >
              <LinearGradient colors={colors} style={{ flex: 1 }} />
            </MotiView>
          ),
        )}
      </View>
      <Wordmark text={brandName} size={size} />
      <Caption subtitle={subtitle} />
    </Wrap>
  )
}

/* ── 06 · orbitas ───────────────────────────────────────────────────────────── */
function OrbitasLoader({ brandName, logoUri, showIcon, subtitle, size = 'lg', reduceMotion = false }: LoaderVariantProps) {
  const { theme } = useTheme()
  const b = BOX[size]
  return (
    <Wrap>
      <Box size={size}>
        <Spin duration={1500} reduceMotion={reduceMotion} style={ABS_CENTER}>
          <Svg width={b} height={b} viewBox="0 0 120 120">
            <Circle cx={60} cy={60} r={52} fill="none" stroke={theme.primary} strokeWidth={3.5} strokeLinecap="round" strokeDasharray="82 245" />
          </Svg>
        </Spin>
        <Spin duration={2100} reverse reduceMotion={reduceMotion} style={ABS_CENTER}>
          <Svg width={b} height={b} viewBox="0 0 120 120">
            <Circle cx={60} cy={60} r={40} fill="none" stroke={alpha(theme.primary, 0.45)} strokeWidth={3.5} strokeLinecap="round" strokeDasharray="63 188" />
          </Svg>
        </Spin>
        {showIcon ? <LoaderIcon logoUri={logoUri} px={ORBIT_ICON[size]} reduceMotion={reduceMotion} /> : null}
      </Box>
      <Wordmark text={brandName} size={size} />
      <Caption subtitle={subtitle} />
    </Wrap>
  )
}

const REGISTRY: Record<Exclude<LoaderVariant, 'eva'>, (p: LoaderVariantProps) => React.ReactElement> = {
  progreso: ProgresoLoader,
  anillo: AnilloLoader,
  radar: RadarLoader,
  cometa: CometaLoader,
  ritmo: RitmoLoader,
  orbitas: OrbitasLoader,
}

/** Renderiza la variante elegida. 'eva' lo maneja el caller (BrandedLoader). */
export function LoaderVariantView({ variant, ...props }: LoaderVariantProps & { variant: Exclude<LoaderVariant, 'eva'> }) {
  const Cmp = REGISTRY[variant]
  return <Cmp {...props} />
}

/* ── Compositor "Crear el mio" (simbolo x animacion x texto) ────────────────── */

const SYMBOL_ICONS: Record<Exclude<LoaderSymbol, 'logo' | 'initial'>, LucideIcon> = {
  dumbbell: Dumbbell,
  flame: Flame,
  bolt: Zap,
  heart: Heart,
  activity: Activity,
  star: Star,
}

function CompositeSymbol({
  symbol,
  logoUri,
  evaFallback,
  initial,
  px,
  color,
}: {
  symbol: LoaderSymbol
  logoUri?: string | null
  /** `loader_icon_mode !== 'none'`: 'logo' sin logo del coach cae al icono EVA (paridad web). */
  evaFallback: boolean
  initial: string
  px: number
  color: string
}) {
  const { resolvedScheme, theme } = useTheme()
  if (symbol === 'logo' && logoUri) {
    return <CircularBrandLogo uri={logoUri} size={px} backgroundColor={theme.card} padding={Math.round(px * 0.08)} />
  }
  if (symbol === 'logo' && evaFallback) {
    return <EvaFigure size={px} style={resolvedScheme === 'dark' ? null : { tintColor: theme.foreground }} />
  }
  // Sin icono disponible, 'logo' cae a la inicial de la marca.
  if (symbol === 'initial' || symbol === 'logo') {
    return (
      <Text style={{ fontSize: px * 0.82, lineHeight: px * 0.92, color, fontFamily: 'Archivo_800ExtraBold', letterSpacing: -px * 0.033 }}>
        {initial}
      </Text>
    )
  }
  const Icon = SYMBOL_ICONS[symbol]
  return <Icon size={px} color={color} strokeWidth={2.2} />
}

function Breath({ reduceMotion, children }: { reduceMotion: boolean; children: ReactNode }) {
  if (reduceMotion) return <View style={styles.center}>{children}</View>
  return (
    <MotiView
      style={styles.center}
      from={{ scale: 0.94 }}
      animate={{ scale: 1.08 }}
      transition={{ type: 'timing', duration: 1600, easing: Easing.inOut(Easing.ease), loop: true, repeatReverse: true }}
    >
      {children}
    </MotiView>
  )
}

export type CompositeLoaderProps = {
  config: LoaderComposite
  brandName?: string
  logoUri?: string | null
  showIcon?: boolean
  subtitle?: string
  size?: LoaderVariantSize
  reduceMotion?: boolean
}

/** Loader compuesto por el coach (loader_config). PRECEDE a `loader_variant`. */
export function CompositeLoaderView({ config, brandName, logoUri, showIcon = true, subtitle, size = 'lg', reduceMotion = false }: CompositeLoaderProps) {
  const { theme } = useTheme()
  const word = (config.text?.trim() || brandName?.trim() || 'EVA').toUpperCase()
  const px = SYMBOL_PX[size]
  const b = BOX[size]
  const symbol = (
    <CompositeSymbol
      symbol={config.symbol}
      logoUri={logoUri}
      evaFallback={showIcon}
      initial={word.charAt(0)}
      px={px}
      color={theme.primary}
    />
  )
  const pulseRing: ViewStyle = {
    position: 'absolute',
    width: b,
    height: b,
    borderRadius: b / 2,
    borderWidth: 2,
    borderColor: theme.primary,
  }

  let animatedBox: React.ReactElement
  switch (config.animation) {
    case 'orbita':
      animatedBox = (
        <Box size={size}>
          <View
            style={{
              position: 'absolute',
              top: 6,
              left: 6,
              right: 6,
              bottom: 6,
              borderRadius: (b - 12) / 2,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: alpha(theme.primary, 0.22),
            }}
          />
          <Spin duration={2400} reduceMotion={reduceMotion} style={StyleSheet.absoluteFillObject}>
            <View
              style={{
                position: 'absolute',
                top: -3,
                left: '50%',
                marginLeft: -5,
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: theme.primary,
              }}
            />
          </Spin>
          {symbol}
        </Box>
      )
      break
    case 'barra':
      animatedBox = (
        <View style={{ alignItems: 'center', gap: 16 }}>
          <Breath reduceMotion={reduceMotion}>{symbol}</Breath>
          <BrandBar color={theme.primary} reduceMotion={reduceMotion} />
        </View>
      )
      break
    case 'respiracion':
      animatedBox = (
        <Box size={size}>
          <Breath reduceMotion={reduceMotion}>{symbol}</Breath>
        </Box>
      )
      break
    case 'pulso':
    default:
      animatedBox = (
        <Box size={size}>
          {reduceMotion ? (
            <View style={[pulseRing, { opacity: 0.3 }]} />
          ) : (
            <MotiView
              style={pulseRing}
              from={{ scale: 0.6, opacity: 0.7 }}
              animate={{ scale: 1.35, opacity: 0 }}
              transition={{ type: 'timing', duration: 1800, easing: Easing.out(Easing.ease), loop: true, repeatReverse: false }}
            />
          )}
          {reduceMotion ? (
            <View style={styles.center}>{symbol}</View>
          ) : (
            <MotiView
              style={styles.center}
              from={{ scale: 0.92, opacity: 0.85 }}
              animate={{ scale: 1.06, opacity: 1 }}
              transition={{ type: 'timing', duration: 900, easing: Easing.inOut(Easing.ease), loop: true, repeatReverse: true }}
            >
              {symbol}
            </MotiView>
          )}
        </Box>
      )
      break
  }

  return (
    <Wrap>
      {animatedBox}
      <Wordmark text={word} size={size} />
      <Caption subtitle={subtitle} />
    </Wrap>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', gap: 20 },
  center: { alignItems: 'center', justifyContent: 'center' },
})
