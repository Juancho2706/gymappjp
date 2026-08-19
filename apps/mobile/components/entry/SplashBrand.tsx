import { useEffect } from 'react'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { MotiView } from 'moti'
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { EASE } from '../../lib/motion'
import { ENTRY_TOKENS } from '../../lib/theme'
import { FONT } from '../../lib/typography'
import type { SplashBrandMark } from '../../context/DashboardReadyContext'
import { entryDarken, entryLighten } from './EntryBackground'
import { EvaFigure, evaFigureHeight } from './EvaFigure'
import {
  SplashSweepStreaks,
  useSplashSweepClock,
  useSplashSweepFigureStyle,
  useSplashSweepSignatureStyle,
} from './SplashGlide'
import { SPLASH_SWEEP_FIGURE_WIDTH } from './splash-sweep'
import { CircularBrandLogo } from '../CircularBrandLogo'

/**
 * Piezas de MARCA del splash — frames 01 y 06 de la entrada dark v1
 * (`docs/specs/entrada-dark-v1/DESIGN-SPEC.md` §3.1, §3.6, §4).
 *
 * Extraidas de `SplashGate` para que el overlay-loader del dashboard
 * (`DashboardSplashOverlay`) continue la MISMA composicion pixel a pixel en vez de
 * reimplementarla: dos copias del stack derivarian al primer retoque y el handoff se
 * leeria como un parpadeo de marca. Aca vive solo lo que se PINTA; el gate de sesion, las
 * capas de luz y el crossfade siguen en `SplashGate`.
 */

/** El indicador de progreso solo se monta si la espera supera este umbral (§4 S4). */
export const SPLASH_SLOW_MS = 600
/** Entrada de la firma EVA (hairline + wordmark), curva y duracion de §4 S2. */
export const SPLASH_SIGNATURE_MS = 360

/**
 * Geometria del frame 01 (§3.1). El alto de la figura sale del aspecto 585:526.
 * El numero vive en `splash-sweep` —modulo puro, sin `react-native`— porque el clamp de la
 * X inicial del barrido lo necesita y ese modulo tiene que poder cargar en Node.
 */
export const SPLASH_FIGURE_SIZE = SPLASH_SWEEP_FIGURE_WIDTH
const FIGURE_HEIGHT = evaFigureHeight(SPLASH_FIGURE_SIZE) // 135
const HAIRLINE_MARGIN_TOP = 16
const HAIRLINE_HEIGHT = 1
const HAIRLINE_MARGIN_BOTTOM = 13
const WORDMARK_LINE_HEIGHT = 13
const STACK_HEIGHT =
  FIGURE_HEIGHT + HAIRLINE_MARGIN_TOP + HAIRLINE_HEIGHT + HAIRLINE_MARGIN_BOTTOM + WORDMARK_LINE_HEIGHT

/**
 * Centro OPTICO de la figura sobre el alto de la PANTALLA (no del body): el splash nativo
 * centra en la ventana completa y la diferencia de ~8 pt se ve en el handoff (§1.4/§3.1).
 * Es el ancla del halo en el gate y en el overlay — la luz no puede saltar de sitio.
 */
export function splashFigureCenterY(screenHeight: number): number {
  return screenHeight / 2 - STACK_HEIGHT / 2 + FIGURE_HEIGHT / 2
}

/** Loader morphbar (§3.1): pista 96x4, relleno 34 → recorrido 62. */
const MORPHBAR_WIDTH = 96
const MORPHBAR_FILL_WIDTH = 34
const MORPHBAR_TRAVEL = MORPHBAR_WIDTH - MORPHBAR_FILL_WIDTH

/**
 * Marca EVA — figura + firma. Va DENTRO del contenedor centrado del consumidor (que es
 * quien anima su opacidad en el crossfade).
 *
 * COREOGRAFIA «GLIDE» (diseno del dueno, 18-08): la figura entra barriendo desde la
 * izquierda con tres estelas de velocidad y la firma entra deslizando desde la derecha; el
 * reloj y la matematica viven en `SplashGlide` / `splash-sweep`.
 *
 * **El sweep es OPT-IN y lo enciende `sweepStartedAt`.** Sin el —o sea: en el cold start
 * anonimo, en el camino branded y en cualquier frame anterior al veredicto del gate— esta
 * pieza pinta EXACTAMENTE lo de siempre: figura estatica centrada, replica pixel-identica
 * del splash nativo (§3.1), y firma con su fade por umbral (§4 S2). No es una variante
 * degradada: es el contrato de §3.1 intacto, y solo el camino sesion+EVA→dashboard lo
 * cambia. Ahi la figura no anima su entrada "por continuidad" sino que la reemplaza por el
 * gesto de marca, que es la decision explicita del dueno.
 *
 * Lo que NO se toca en ninguna rama: `SplashCoachMark`, el morphbar, el halo, el
 * `LightLayer`, el grano y el canvas.
 *
 * Dos detalles estructurales que sostienen el relevo gate → overlay:
 *  - La firma se mantiene MONTADA aunque este invisible: su alto es parte del
 *    `STACK_HEIGHT` que posiciona la figura (y con ella el ancla del halo). Desmontarla
 *    haria SALTAR la figura justo en el handoff.
 *  - Los dos `Animated.View` envuelven SIEMPRE, con o sin sweep. Son cajas neutras (el
 *    contenedor centra, ellas se ajustan al contenido: mismo box, misma altura de stack),
 *    y mantenerlas fijas evita que encender el sweep remonte la figura y la firma — un
 *    remonte ahi cuesta el `transition={0}` de la imagen y reinicia el fade de la firma.
 *
 * El fade-por-umbral de la firma se MULTIPLICA con el del sweep en dos nodos anidados (RN
 * compone opacidades por nodo, no por estilo).
 */
export function SplashEvaMark({
  signature,
  reduced,
  initialSignature = false,
  sweepStartedAt = null,
}: {
  /** Estado destino de la firma. */
  signature: boolean
  reduced: boolean
  /**
   * Estado de la firma en el PRIMER frame. El overlay hereda el del gate: montar en 0 y
   * animar a 1 lo que ya estaba en pantalla seria un parpadeo.
   */
  initialSignature?: boolean
  /**
   * `Date.now()` del VEREDICTO del gate (sesion viva y sin marca de coach) = instante 0 de
   * la coreografia. El overlay lo hereda por `SplashHandoff` y RETOMA el sweep donde iba,
   * igual que hace con `initialSignature` y con la opacidad del halo.
   *
   * `null` = no hay sweep en este frame: el gate todavia no dictamino, o dictamino una rama
   * que no lo lleva (branded, anonimo). Se pinta la replica estatica de §3.1.
   */
  sweepStartedAt?: number | null
}) {
  const { width, height } = useWindowDimensions()
  // Los hooks corren SIEMPRE (regla de hooks); lo que decide si el sweep se ve es si el
  // estilo se aplica. Con `reduced` el reloj queda plantado al final (§4 R2) y con
  // `sweepStartedAt == null` ni siquiera hay coreografia que mostrar: en los dos casos el
  // resultado es el splash de siempre, sin una sola diferencia de pixel.
  const clock = useSplashSweepClock(sweepStartedAt, reduced)
  const figureStyle = useSplashSweepFigureStyle(clock, width)
  const signatureStyle = useSplashSweepSignatureStyle(clock, width)
  const swept = !reduced && sweepStartedAt != null

  return (
    <>
      {/* Estelas primero = detras de la figura. Absolutas: no participan del stack, asi que
          `STACK_HEIGHT` (y el ancla del halo) siguen valiendo lo mismo. */}
      {swept ? (
        <SplashSweepStreaks
          clock={clock}
          startedAt={sweepStartedAt}
          width={width}
          height={height}
          centerY={splashFigureCenterY(height)}
        />
      ) : null}
      <Animated.View style={swept ? figureStyle : undefined}>
        <EvaFigure size={SPLASH_FIGURE_SIZE} />
      </Animated.View>
      <Animated.View style={swept ? signatureStyle : undefined}>
        <MotiView
          from={{ opacity: initialSignature ? 1 : 0 }}
          animate={{ opacity: signature ? 1 : 0 }}
          transition={{ type: 'timing', duration: reduced ? 0 : SPLASH_SIGNATURE_MS, easing: EASE.standard }}
          style={styles.signature}
        >
          <View style={styles.hairline} />
          <Text style={styles.wordmark}>EVA</Text>
        </MotiView>
      </Animated.View>
    </>
  )
}

/**
 * Marca del coach (§2.3 capa 4). Misma pieza para coach y alumno: solo cambia el origen de
 * los datos (el alumno ve la marca de SU coach). El logo va con `cachePolicy="memory-disk"`
 * y `transition={0}` — remontarla en el overlay lee del cache de memoria, sin flash.
 */
export function SplashCoachMark({ mark }: { mark: SplashBrandMark }) {
  return (
    <>
      {mark.logoUri ? (
        <CircularBrandLogo uri={mark.logoUri} size={96} backgroundColor="#0B0E13" padding={8} transition={0} />
      ) : (
        <CoachInitialsTile accent={mark.accent} name={mark.displayName} />
      )}
      <Text style={styles.coachName} numberOfLines={1}>
        {mark.displayName}
      </Text>
      {/* El saludo SIEMPRE nombra a quien entra. Sin nombre a mano queda la marca sola:
          "Hola de nuevo" pelado bajo el nombre del coach se lee como si saludara AL COACH
          (QA-3 del owner) y en el retorno del alumno eso es directamente falso. */}
      {mark.greetingName ? (
        <Text style={styles.coachGreeting} numberOfLines={1}>
          {`Hola de nuevo, ${mark.greetingName}`}
        </Text>
      ) : null}
    </>
  )
}

/**
 * §4 S4 — morphbar. NUNCA `ActivityIndicator`. El loop vive dentro: montarla ES arrancarla,
 * asi que el consumidor solo decide CUANDO aparece.
 */
export function SplashMorphbar({ reduced }: { reduced: boolean }) {
  const loop = useSharedValue(0)
  useEffect(() => {
    if (reduced) return
    loop.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.bezier(0.4, 0, 0.2, 1) }),
      -1,
      false,
    )
    return () => cancelAnimation(loop)
  }, [loop, reduced])

  const morphbarStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(loop.value, [0, 0.45, 0.55, 1], [0, MORPHBAR_TRAVEL, MORPHBAR_TRAVEL, 0]) },
      { scaleX: interpolate(loop.value, [0, 0.45, 0.55, 1], [1, 0.6, 0.6, 1]) },
    ],
  }))

  return (
    <View pointerEvents="none" style={styles.morphbar}>
      {reduced ? (
        <View style={[styles.morphbarFill, styles.morphbarStatic]}>
          <MorphbarSheen />
        </View>
      ) : (
        <Animated.View style={[styles.morphbarFill, morphbarStyle]}>
          <MorphbarSheen />
        </Animated.View>
      )}
    </View>
  )
}

/** Relleno del morphbar: gradiente horizontal que se apaga en los extremos (§3.1). */
function MorphbarSheen() {
  return (
    <LinearGradient
      colors={['rgba(127,176,255,0.25)', '#7FB0FF', 'rgba(127,176,255,0.25)'] as const}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={StyleSheet.absoluteFill}
    />
  )
}

/**
 * Tile de iniciales (§3.6) — el fallback cuando el coach no tiene logo. Gradiente a 160°
 * `lighten(accent,12%) → accent → darken(accent,28%)`, borde overlay y highlight interno:
 * nunca un color solido pelado.
 */
function CoachInitialsTile({ accent, name }: { accent: string; name: string }) {
  return (
    <View style={styles.coachTile}>
      <LinearGradient
        colors={[entryLighten(accent, 0.12), accent, entryDarken(accent, 0.28)] as const}
        locations={[0, 0.62, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.94, y: 0.34 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.coachTileInset} />
      <Text style={styles.coachInitials}>{initialsOf(name)}</Text>
      <View style={styles.coachTileBorder} />
    </View>
  )
}

/** 1-2 caracteres, mayusculas, primeras letras de las 2 primeras palabras (§2.4). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'EVA'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0]}${words[1][0]}`.toUpperCase()
}

const styles = StyleSheet.create({
  /** Contenedor centrado compartido: la marca se centra sobre la PANTALLA completa. */
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signature: { alignItems: 'center' },
  hairline: {
    width: 34,
    height: HAIRLINE_HEIGHT,
    marginTop: HAIRLINE_MARGIN_TOP,
    marginBottom: HAIRLINE_MARGIN_BOTTOM,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  wordmark: {
    fontFamily: FONT.uiExtra,
    fontSize: 11,
    lineHeight: WORDMARK_LINE_HEIGHT,
    // El tracking cuelga a la derecha; el paddingLeft del mismo valor recentra el bloque.
    letterSpacing: 4.84,
    paddingLeft: 4.84,
    textTransform: 'uppercase',
    color: 'rgba(244,246,248,0.55)',
  },
  coachTile: {
    width: 96,
    height: 96,
    borderRadius: 48,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachTileInset: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  coachTileBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 48,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  coachInitials: {
    fontFamily: FONT.displayBlack,
    fontSize: 35,
    letterSpacing: -1.575,
    color: '#FFFFFF',
  },
  coachName: {
    marginTop: 19,
    fontFamily: FONT.displayBlack,
    fontSize: 19,
    lineHeight: 22,
    letterSpacing: -0.38,
    color: '#F4F6F8',
  },
  coachGreeting: {
    marginTop: 7,
    fontFamily: FONT.uiBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.65,
    textTransform: 'uppercase',
    color: ENTRY_TOKENS.textFaint,
  },
  morphbar: {
    position: 'absolute',
    bottom: 96,
    alignSelf: 'center',
    width: MORPHBAR_WIDTH,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  morphbarFill: {
    width: MORPHBAR_FILL_WIDTH,
    height: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  // reduce-motion: barra estatica al 40% de la pista, sin recorrido (§4 S4).
  morphbarStatic: { width: MORPHBAR_WIDTH * 0.4 },
})

/** Contenedor centrado de la marca. Lo comparten el gate y el overlay: mismo encuadre. */
export const splashCenterStyle = styles.center
