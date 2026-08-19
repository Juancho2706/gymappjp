import { useEffect } from 'react'
import { StyleSheet, Text, View } from 'react-native'
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
import { EvaFigure } from './EvaFigure'
import {
  SPLASH_FIGURE_HEIGHT,
  SPLASH_FIGURE_SIZE,
  SPLASH_SIGNATURE_SLOT_OFFSET,
} from './splash-geometry'
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
 * Geometria del frame 01 (§3.1): vive en `splash-geometry` (modulo puro, sin
 * `react-native`) para que el test de paridad contra el `imageWidth` de `app.json` cargue
 * en Node. Re-exportada aca para los consumidores de la familia de entrada. El ancla de la
 * luz: `splashFigureCenterY` (= h/2, donde el nativo centra su imagen) para el canal EVA, y
 * `splashCoachSourceCenterY` (el centro optico del tile) para el canal del coach.
 */
export {
  SPLASH_FIGURE_SIZE,
  splashCoachSourceCenterY,
  splashFigureCenterY,
} from './splash-geometry'

const FIGURE_HEIGHT = SPLASH_FIGURE_HEIGHT // 162
const HAIRLINE_HEIGHT = 1
const HAIRLINE_MARGIN_BOTTOM = 13
const WORDMARK_LINE_HEIGHT = 13

/** Loader morphbar (§3.1): pista 96x4, relleno 34 → recorrido 62. */
const MORPHBAR_WIDTH = 96
const MORPHBAR_FILL_WIDTH = 34
const MORPHBAR_TRAVEL = MORPHBAR_WIDTH - MORPHBAR_FILL_WIDTH

/**
 * Marca EVA — figura + firma. Va DENTRO del contenedor centrado del consumidor (que es
 * quien anima su opacidad en el crossfade).
 *
 * QUIETUD (decision del dueno, 19-08, tras retirar la coreografia «Glide»): la figura NO
 * anima nunca. Es la unica hija en flujo del contenedor centrado, asi que queda en el
 * centro exacto de la pantalla — el mismo pixel y el mismo tamano (180 pt = `imageWidth`
 * nativo) donde el sistema operativo la dejo. La firma cuelga DEBAJO en posicion absoluta:
 * aparecer o desaparecer no la mueve un solo punto. La vida del splash viene del halo que
 * respira, del morphbar y —en el retorno branded— del crossfade a la marca del coach; la
 * figura es el ancla quieta de todo eso.
 *
 * Lo que NO se toca en ninguna rama: `SplashCoachMark`, el morphbar, el halo, el
 * `LightLayer`, el grano y el canvas.
 *
 * La firma se mantiene MONTADA aunque este invisible (opacity 0): desmontarla y remontarla
 * en el relevo gate → overlay reiniciaria su fade (MotiView monta desde `from`); por eso el
 * overlay hereda `initialSignature` y el arbol es identico en ambos lados.
 */
export function SplashEvaMark({
  signature,
  reduced,
  initialSignature = false,
}: {
  /** Estado destino de la firma. */
  signature: boolean
  reduced: boolean
  /**
   * Estado de la firma en el PRIMER frame. El overlay hereda el del gate: montar en 0 y
   * animar a 1 lo que ya estaba en pantalla seria un parpadeo.
   */
  initialSignature?: boolean
}) {
  return (
    <>
      <EvaFigure size={SPLASH_FIGURE_SIZE} />
      {/* Slot ABSOLUTO de la firma: nace en el centro de pantalla (top 50% del contenedor
          absoluteFill) y baja media figura + el margen — la figura jamas se recalcula por
          culpa de la firma. */}
      <View pointerEvents="none" style={styles.signatureSlot}>
        <MotiView
          from={{ opacity: initialSignature ? 1 : 0 }}
          animate={{ opacity: signature ? 1 : 0 }}
          transition={{ type: 'timing', duration: reduced ? 0 : SPLASH_SIGNATURE_MS, easing: EASE.standard }}
          style={styles.signature}
        >
          <View style={styles.hairline} />
          <Text style={styles.wordmark}>EVA</Text>
        </MotiView>
      </View>
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
  /**
   * La firma cuelga del centro de PANTALLA (el contenedor del consumidor es absoluteFill):
   * top 50% + media figura + los 16 pt de aire del frame 01. Ni aparecer ni desaparecer
   * tocan a la figura.
   */
  signatureSlot: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    marginTop: SPLASH_SIGNATURE_SLOT_OFFSET,
    alignItems: 'center',
  },
  signature: { alignItems: 'center' },
  hairline: {
    width: 34,
    height: HAIRLINE_HEIGHT,
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
