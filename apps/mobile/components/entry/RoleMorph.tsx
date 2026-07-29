import { useEffect } from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MotiView } from 'moti'
import Animated, {
  cancelAnimation,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { EASE } from '../../lib/motion'
import { ENTRY_TOKENS } from '../../lib/theme'
import {
  ROLE_CARD_FLAT,
  ROLE_CARD_RADIUS,
  ROLE_SHEET_BACKGROUND,
  RoleCardContent,
  type RoleKind,
} from './RoleCards'

/**
 * RoleMorph — el morph generico de los frames 03 y 05.
 * Normativa: `docs/specs/entrada-dark-v1/DESIGN-SPEC.md` §3.3 / §3.5 / §4.1 (M1-M6) / §4.2.
 *
 * Es la UNICA transicion de la familia donde se anima layout (f1 §5 lo prohibe en el resto).
 * Por que es seguro: el nodo que morfea es `position:'absolute'` con `zIndex 4` y **sus
 * hijos tambien son absolutos con `inset:0`** — no hay cascada de Yoga, ni hermanos ni
 * hijos se re-miden, y Reanimated aplica el estilo en el hilo UI.
 *
 * Geometria (§4.2), medida en la referencia 390x844:
 *   alumno  top 595 → 126 · left/right 24 → 0 · bottom 163 → 0 · recorrido 469 pt
 *   coach   top 692 → 126 · left/right 24 → 0 · bottom  66 → 0 · recorrido 566 pt
 *   radios 20/20/20/20 → 28/28/0/0 · fondo `#12203A`/`#151A21` → `#0F131A`
 *   **misma duracion (260 ms), NO misma velocidad**: distancias distintas con igual
 *   duracion se perciben como un mismo sistema (f1 §1).
 *
 * El origen NO se hardcodea: llega medido de la card real (`measure`), asi la pieza
 * funciona igual en 390x844 que en una pantalla compacta con el layout colapsado.
 * El destino se deriva del safe area (`insets.top + 67` = los 126 pt de la referencia,
 * donde el status bar mide 59).
 *
 * Degradacion (M6): con reduce-motion —o si el device no sostiene 60 fps— el morph se
 * reemplaza por un cross-fade plano de 160 ms con el dim instantaneo. Es preferible
 * perder el efecto que perder los frames.
 */

/** M1/M2 — duracion del morph. */
const MORPH_MS = 260
/** M6 — degradacion a cross-fade plano. */
const CROSSFADE_MS = 160
/** M3 — salida del contenido de card (timing asimetrico: sale mas rapido de lo que entra). */
const CARD_OUT_MS = 120
/** M5 — dim del fondo. */
const DIM_MS = 200
/** Offset del sheet bajo el status bar: 126 − 59 de la referencia (§3.3). */
const SHEET_TOP_OFFSET = 67
/** Radio del sheet destino (`--r-sheet`). */
const SHEET_RADIUS = 28

export interface MorphOrigin {
  /** Rect de la card en coordenadas del contenedor del overlay. */
  x: number
  y: number
  width: number
  height: number
}

export interface RoleMorphProps {
  role: RoleKind
  origin: MorphOrigin
  /** Se llama al terminar el recorrido: es el momento de navegar, nunca antes. */
  onCommit: () => void
}

export function RoleMorph({ role, origin, onCommit }: RoleMorphProps) {
  const reduced = useReducedMotion()
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()

  const targetTop = insets.top + SHEET_TOP_OFFSET
  const targetHeight = Math.max(height - targetTop, 0)

  const progress = useSharedValue(reduced ? 1 : 0)
  // Degradacion M6: sin recorrido, el sheet aparece ya en el destino con un fade plano.
  const fade = useSharedValue(reduced ? 0 : 1)

  useEffect(() => {
    const duration = reduced ? CROSSFADE_MS : MORPH_MS
    if (reduced) {
      fade.value = withTiming(1, { duration, easing: EASE.standard })
    } else {
      progress.value = withTiming(1, { duration, easing: EASE.standard })
    }
    const timer = setTimeout(onCommit, duration)
    return () => {
      clearTimeout(timer)
      cancelAnimation(progress)
      cancelAnimation(fade)
    }
    // El morph corre UNA sola vez por gesto: re-armarlo por identidad del callback
    // reiniciaria el recorrido a mitad de camino.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const sheetStyle = useAnimatedStyle(() => {
    const t = progress.value
    return {
      opacity: fade.value,
      top: interpolate(t, [0, 1], [origin.y, targetTop]),
      left: interpolate(t, [0, 1], [origin.x, 0]),
      width: interpolate(t, [0, 1], [origin.width, width]),
      height: interpolate(t, [0, 1], [origin.height, targetHeight]),
      borderTopLeftRadius: interpolate(t, [0, 1], [ROLE_CARD_RADIUS, SHEET_RADIUS]),
      borderTopRightRadius: interpolate(t, [0, 1], [ROLE_CARD_RADIUS, SHEET_RADIUS]),
      borderBottomLeftRadius: interpolate(t, [0, 1], [ROLE_CARD_RADIUS, 0]),
      borderBottomRightRadius: interpolate(t, [0, 1], [ROLE_CARD_RADIUS, 0]),
      // RN no interpola gradientes: la card cambia su pila glass por su color plano
      // equivalente al arrancar el morph (§4.2) y este solido si se interpola.
      backgroundColor: interpolateColor(
        t,
        [0, 1],
        [ROLE_CARD_FLAT[role].background, ROLE_SHEET_BACKGROUND],
      ),
    }
  })

  return (
    <View pointerEvents="box-only" style={StyleSheet.absoluteFill}>
      {/* M5 — dim: UNA capa, sin scale ni blur. El fondo NO se desmonta detras. */}
      <MotiView
        from={{ opacity: reduced ? 1 : 0 }}
        animate={{ opacity: 1 }}
        transition={{ type: 'timing', duration: reduced ? 0 : DIM_MS, easing: EASE.standard }}
        style={styles.dim}
      />
      <Animated.View
        style={[styles.sheet, { borderColor: ROLE_CARD_FLAT[role].border }, sheetStyle]}
      >
        {/* M3 — el contenido de la card se desvanece SIN moverse: el movimiento lo hace
            el contenedor. En reduce-motion se corta de entrada. */}
        <MotiView
          pointerEvents="none"
          from={{ opacity: reduced ? 0 : 1 }}
          animate={{ opacity: 0 }}
          transition={{ type: 'timing', duration: reduced ? 0 : CARD_OUT_MS, easing: EASE.accelerate }}
          style={styles.sheetCardContent}
        >
          <RoleCardContent role={role} />
        </MotiView>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  // rgba(7,8,12,.58) — el canvas de la entrada con alpha, no un negro cualquiera.
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(7,8,12,0.58)', zIndex: 3 },
  sheet: {
    position: 'absolute',
    zIndex: 4,
    borderWidth: 1,
    overflow: 'hidden',
    backgroundColor: ENTRY_TOKENS.canvasEntry,
  },
  sheetCardContent: { ...StyleSheet.absoluteFillObject, justifyContent: 'center' },
})
