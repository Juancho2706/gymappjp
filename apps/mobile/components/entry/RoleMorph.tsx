import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { MotiView } from 'moti'
import Animated, {
  cancelAnimation,
  interpolate,
  interpolateColor,
  runOnJS,
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
 * hijos tambien son absolutos** — no hay cascada de Yoga, ni hermanos ni hijos se re-miden,
 * y Reanimated aplica el estilo en el hilo UI.
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
 * DOS usos, un solo motor:
 *  - **coach** (frame 05): sin `children`. El recorrido termina y `onCommit` navega al login.
 *  - **alumno** (frame 4 del concepto C): con `children` = el `sheetlg` (§3.3). El sheet ES
 *    el destino, no hay navegacion: `onCommit` solo avisa que el recorrido cerro. Al pasar
 *    `open` a `false` el morph se reproduce INVERTIDO con la misma curva y duracion (§4.2
 *    "Back": nunca salta al origen) y avisa por `onClosed` para que el call site desmonte.
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
/** M4 — entrada del contenido de sheet. */
const CONTENT_IN_MS = 200
/** M4 — su delay: lo que entra arranca despues de que lo que sale ya se fue. */
const CONTENT_IN_DELAY_MS = 60
/** M5 — dim del fondo. */
const DIM_MS = 200
/** Offset del sheet bajo el status bar: 126 − 59 de la referencia (§3.3). */
export const ROLE_SHEET_TOP_OFFSET = 67
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
  /** `false` = reproducir el recorrido invertido. Default `true` (ida al montar). */
  open?: boolean
  /** Fin del recorrido de IDA. Coach: navegar. Alumno: el sheet ya es la pantalla. */
  onCommit: () => void
  /** Fin del recorrido de VUELTA: el call site desmonta el overlay. */
  onClosed?: () => void
  /** Si se pasa, el dim cierra al toque; sin esto el dim solo absorbe taps. */
  onRequestClose?: () => void
  /** `sheetlg` (§3.3): el contenido de PANTALLA del sheet. Sin el, el morph solo transiciona. */
  children?: ReactNode
}

export function RoleMorph({
  role,
  origin,
  open = true,
  onCommit,
  onClosed,
  onRequestClose,
  children,
}: RoleMorphProps) {
  const reduced = useReducedMotion()
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()

  const targetTop = insets.top + ROLE_SHEET_TOP_OFFSET
  const targetHeight = Math.max(height - targetTop, 0)

  const progress = useSharedValue(reduced ? 1 : 0)
  // Degradacion M6: sin recorrido, el sheet aparece ya en el destino con un fade plano.
  const fade = useSharedValue(reduced ? 0 : 1)

  // Los callbacks se leen por ref: re-armar el recorrido por identidad del callback lo
  // reiniciaria a mitad de camino.
  const commitRef = useRef(onCommit)
  const closedRef = useRef(onClosed)
  useEffect(() => {
    commitRef.current = onCommit
    closedRef.current = onClosed
  })

  const settle = useCallback((didOpen: boolean) => {
    if (didOpen) commitRef.current()
    else closedRef.current?.()
  }, [])

  useEffect(() => {
    const duration = reduced ? CROSSFADE_MS : MORPH_MS
    const done = (finished?: boolean) => {
      'worklet'
      // Interrumpido (back a mitad del recorrido) → no hay commit ni cierre: manda el
      // gesto nuevo, que ya arranco desde el valor actual.
      if (finished) runOnJS(settle)(open)
    }
    if (reduced) {
      fade.value = withTiming(open ? 1 : 0, { duration, easing: EASE.standard }, done)
    } else {
      progress.value = withTiming(open ? 1 : 0, { duration, easing: EASE.standard }, done)
    }
    return () => {
      cancelAnimation(progress)
      cancelAnimation(fade)
    }
  }, [fade, open, progress, reduced, settle])

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
    // `box-none`: el que absorbe los taps es el dim (full-bleed), asi el sheet de arriba
    // si recibe los suyos. Con `box-only` el form del sheet quedaba muerto.
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {/* M5 — dim: UNA capa, sin scale ni blur. El fondo NO se desmonta detras. */}
      <MotiView
        from={{ opacity: reduced ? 1 : 0 }}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ type: 'timing', duration: reduced ? 0 : DIM_MS, easing: EASE.standard }}
        style={styles.dim}
      >
        {onRequestClose ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cerrar y volver a elegir cómo entrar"
            onPress={onRequestClose}
            style={StyleSheet.absoluteFill}
          />
        ) : null}
      </MotiView>
      <Animated.View
        // Con contenido el sheet es una superficie modal: el selector de atras no debe
        // quedar navegable por lector de pantalla mientras esta arriba.
        accessibilityViewIsModal={children != null}
        style={[styles.sheet, { borderColor: ROLE_CARD_FLAT[role].border }, sheetStyle]}
      >
        {/* M3 — el contenido de la card se desvanece SIN moverse: el movimiento lo hace
            el contenedor. En reduce-motion se corta de entrada. */}
        <MotiView
          pointerEvents="none"
          from={{ opacity: reduced ? 0 : 1 }}
          animate={{ opacity: open ? 0 : 1 }}
          transition={
            open
              ? { type: 'timing', duration: reduced ? 0 : CARD_OUT_MS, easing: EASE.accelerate }
              : {
                  type: 'timing',
                  duration: reduced ? 0 : CONTENT_IN_MS,
                  delay: reduced ? 0 : CONTENT_IN_DELAY_MS,
                  easing: EASE.standard,
                }
          }
          style={styles.sheetCardContent}
        >
          <RoleCardContent role={role} />
        </MotiView>

        {/* M4 — `sheetlg`: entra 200 ms con delay 60 (asimetrico contra los 120 de M3).
            Va en una caja de tamaño FIJO (el del sheet ya terminado), no `inset:0`: si su
            ancho/alto siguieran al contenedor animado, todo el form se re-mediria 60 veces
            por segundo — exactamente el relayout que §4.2 evita para sostener el morph. */}
        {children ? (
          <MotiView
            pointerEvents={open ? 'auto' : 'none'}
            from={{ opacity: reduced ? 1 : 0 }}
            animate={{ opacity: open ? 1 : 0 }}
            transition={
              open
                ? {
                    type: 'timing',
                    duration: reduced ? 0 : CONTENT_IN_MS,
                    delay: reduced ? 0 : CONTENT_IN_DELAY_MS,
                    easing: EASE.standard,
                  }
                : { type: 'timing', duration: reduced ? 0 : CARD_OUT_MS, easing: EASE.accelerate }
            }
            style={[styles.sheetScreenContent, { width, height: targetHeight }]}
          >
            {children}
          </MotiView>
        ) : null}
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
  sheetScreenContent: { position: 'absolute', top: 0, left: 0 },
})
