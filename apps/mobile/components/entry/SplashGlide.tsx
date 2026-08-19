import { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import {
  SPLASH_SWEEP_END_MS,
  SPLASH_SWEEP_STREAK_COLORS,
  SPLASH_SWEEP_STREAK_GAP_RATIO,
  SPLASH_SWEEP_STREAK_HEIGHT,
  SPLASH_SWEEP_STREAK_RADIUS,
  SPLASH_SWEEP_STREAK_WIDTH_RATIO,
  SPLASH_SWEEP_WINDOWS,
  splashSweepElapsedNow,
  splashSweepFigure,
  splashSweepStreakOpacity,
  splashSweepStreakX,
  splashSweepWordmark,
} from './splash-sweep'

/**
 * SplashGlide — capa Reanimated de la coreografia «Glide» (diseno del dueno, canvas
 * 1080x1920 reproducido a 2x). La matematica vive en `./splash-sweep`; aca solo esta el
 * cableado: un reloj compartido y los estilos derivados.
 *
 * Es la RAMA EVA del loader de arranque: la figura EVA entra barriendo desde la izquierda
 * con tres estelas de velocidad y la firma entra deslizando desde la derecha. La rama de
 * marca del COACH (`SplashCoachMark`) no participa: se mantiene identica a como estaba.
 * El morphbar, el halo, el `LightLayer`, el grano y el canvas `ENTRY_TOKENS.canvasEntry`
 * tampoco cambian — el sweep convive con el ambiente que ya existia.
 *
 * ── Cuando corre, y sobre todo cuando NO ────────────────────────────────────────────────
 * Solo en el camino **sesion viva + sin marca de coach** (el que rutea al dashboard EVA).
 * `SplashGate` siembra `sweepStartedAt` recien cuando ese veredicto sale del `Promise.all`;
 * hasta entonces —y para siempre en las otras dos ramas— el splash es la replica estatica
 * pixel-identica de §3.1 y nada de este archivo se aplica. No es prolijidad: con el sweep
 * atado al primer paint, la rama BRANDED mostraba la figura EVA volando con estelas cian
 * por encima del crossfade a la marca del coach (que cierra a ~380 ms, cuando la figura
 * todavia va llegando al centro a 550), y el cold start ANONIMO desmontaba el gate hacia el
 * selector a los ~100-600 ms cortando el barrido a mitad de vuelo, sin overlay que lo
 * continuara.
 *
 * ── Por que el reloj es tiempo REAL y no un progreso 0..1 ────────────────────────────────
 * El splash se pinta en DOS componentes distintos que se relevan sin repintar: `SplashGate`
 * (`app/index.tsx`, fase `checking`) y despues `DashboardSplashOverlay` (hermano del Stack
 * en `app/_layout.tsx`). Como el veredicto es lo que siembra el sweep Y lo que dispara el
 * `router.replace`, el gate suelta el control a los pocos ms de arrancar el barrido: casi
 * toda la escena se pinta en el overlay. Si el reloj fuera un progreso local, el overlay lo
 * reiniciaria y la figura volveria a salir volando por la izquierda ya empezado el arranque.
 *
 * Por eso el estado que viaja en `SplashHandoff` es el INSTANTE de arranque
 * (`sweepStartedAt`, `Date.now()`), exactamente el mismo patron con el que la firma ya
 * heredaba `initialSignature` y el halo su `halo`. Cada consumidor calcula su propio
 * `elapsed` al montar y sigue desde ahi con un `withTiming` LINEAL sobre el tiempo: la
 * coreografia entera es una funcion pura del reloj, asi que retomarla a mitad de camino
 * cae en el frame exacto.
 *
 * ── Relacion con el splash NATIVO ────────────────────────────────────────────────────────
 * `SplashScreen.preventAutoHideAsync()` corre en el modulo de `app/_layout.tsx` y
 * `hideAsync()` sale del `onLayout` de la raiz del gate: ese primer pase de layout es el
 * handoff nativo→JS, y sigue siendo pixel-identico (§3.1) porque en ese instante todavia no
 * hay sweep sembrado — la figura esta quieta, centrada y a 150 pt, exactamente donde la
 * dejo el nativo.
 *
 * El barrido empieza despues, cuando el veredicto ya salio. Eso implica un BLINK
 * deliberado: la figura, que estaba centrada, salta fuera de cuadro y vuelve a entrar
 * volando. Es la decision del dueno («sweep fiel»): el gesto de marca completo vale mas que
 * un empalme invisible, y la alternativa —arrancar el barrido a mitad de camino desde donde
 * estaba la figura— convierte el diseno en otra cosa. Los 75 ms de HOLD (autoral 0.15) que
 * la escena tiene antes de mover nada le dan al blink su unico respiro.
 */

/**
 * Reloj del sweep, en ms reales desde `startedAt`. Un solo shared value alimenta figura,
 * estelas y firma: tres `withTiming` separados derivarian entre si y ademas cortarian mal
 * al retomar en el overlay.
 *
 * `reduced` = corte limpio (§4 R2): el reloj se planta en el final, el consumidor no aplica
 * ningun estilo animado y el resultado es EXACTAMENTE el splash de siempre.
 */
export function useSplashSweepClock(startedAt: number | null, reduced: boolean): SharedValue<number> {
  // `useSharedValue` solo usa el argumento en el PRIMER render: el overlay nace ya con el
  // tiempo heredado del gate, sin un frame en la posicion inicial.
  const clock = useSharedValue(reduced ? SPLASH_SWEEP_END_MS : splashSweepElapsedNow(startedAt))

  useEffect(() => {
    if (reduced) {
      clock.value = SPLASH_SWEEP_END_MS
      return
    }
    // Sin primer layout todavia no hay sweep: la figura espera fuera de cuadro.
    if (startedAt == null) return
    const elapsed = splashSweepElapsedNow(startedAt)
    if (elapsed >= SPLASH_SWEEP_END_MS) {
      clock.value = SPLASH_SWEEP_END_MS
      return
    }
    // Asignacion directa primero (define el punto de partida en el hilo de UI) y recien
    // despues la animacion: `withTiming` toma como origen el valor vigente.
    clock.value = elapsed
    clock.value = withTiming(SPLASH_SWEEP_END_MS, {
      // LINEAL a proposito: la curva no vive aca sino dentro de cada canal
      // (`splash-sweep.ts`). Este timing solo transporta el tiempo.
      duration: SPLASH_SWEEP_END_MS - elapsed,
      easing: Easing.linear,
    })
    return () => cancelAnimation(clock)
  }, [clock, reduced, startedAt])

  return clock
}

/** Transform de la FIGURA. El orden translate → rotate → scale calca el del canvas. */
export function useSplashSweepFigureStyle(clock: SharedValue<number>, width: number) {
  return useAnimatedStyle(() => {
    const figure = splashSweepFigure(clock.value, width)
    return {
      transform: [
        { translateX: figure.translateX },
        { rotate: `${figure.rotation}deg` },
        { scale: figure.scale },
      ],
    }
  })
}

/**
 * Entrada de la FIRMA. Devuelve opacidad ADEMAS del transform: el consumidor la anida sobre
 * el fade-por-umbral de siempre (dos nodos, dos opacidades — RN las compone por nodo, no
 * por estilo), asi el camino branded sigue sin firma visible.
 */
export function useSplashSweepSignatureStyle(clock: SharedValue<number>, width: number) {
  return useAnimatedStyle(() => {
    const wordmark = splashSweepWordmark(clock.value, width)
    return { opacity: wordmark.opacity, transform: [{ translateX: wordmark.translateX }] }
  })
}

export interface SplashSweepStreaksProps {
  clock: SharedValue<number>
  /**
   * Mismo origen del reloj que alimenta a `clock`. Se pasa aparte porque leer un
   * `SharedValue` en fase de render esta prohibido, y aca hace falta saber en tiempo de JS
   * cuanto le queda de vida a la estela.
   */
  startedAt: number | null
  /** Ancho de la PANTALLA: todas las longitudes del canvas son razones sobre el. */
  width: number
  /** Alto de la PANTALLA: fija la separacion vertical entre estelas. */
  height: number
  /**
   * Centro OPTICO de la figura en coordenadas de pantalla (`splashFigureCenterY`). Las
   * estelas se anclan al MISMO punto que el halo: si se anclaran al centro del stack
   * quedarian ~7 pt bajo la figura y se leerian como subrayado, no como velocidad.
   */
  centerY: number
}

/**
 * Las 3 estelas de velocidad. Van DETRAS de la figura (primer hijo del contenedor centrado,
 * y sin `elevation`: en Android la elevacion manda sobre el orden del arbol, asi que la
 * ausencia de elevacion aca es intencional).
 *
 * Se DESMONTAN al cerrar su ventana (`streakOut.end`, 750 ms). Su opacidad ya es 0 desde
 * ahi, pero el settle se estira hasta 1750 ms y el overlay puede seguir arriba mucho mas:
 * dejarlas montadas serian 3 mappers de Reanimated recalculando `translateX` por frame para
 * pintar nada, justo mientras el dashboard de abajo pelea por su primer render.
 */
export function SplashSweepStreaks({ clock, startedAt, width, height, centerY }: SplashSweepStreaksProps) {
  const [alive, setAlive] = useState(
    () => splashSweepElapsedNow(startedAt) < SPLASH_SWEEP_WINDOWS.streakOut.end,
  )
  useEffect(() => {
    if (!alive) return
    const remaining = SPLASH_SWEEP_WINDOWS.streakOut.end - splashSweepElapsedNow(startedAt)
    if (remaining <= 0) {
      setAlive(false)
      return
    }
    const timer = setTimeout(() => setAlive(false), remaining)
    return () => clearTimeout(timer)
  }, [alive, startedAt])

  const streakWidth = SPLASH_SWEEP_STREAK_WIDTH_RATIO * width
  const gap = SPLASH_SWEEP_STREAK_GAP_RATIO * height
  if (!alive) return null
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {SPLASH_SWEEP_STREAK_COLORS.map((colors, index) => (
        <SplashSweepStreak
          key={index}
          clock={clock}
          colors={colors}
          index={index}
          screenWidth={width}
          left={(width - streakWidth) / 2}
          top={centerY + (index - 1) * gap - SPLASH_SWEEP_STREAK_HEIGHT / 2}
          streakWidth={streakWidth}
        />
      ))}
    </View>
  )
}

function SplashSweepStreak({
  clock,
  colors,
  index,
  screenWidth,
  left,
  top,
  streakWidth,
}: {
  clock: SharedValue<number>
  colors: readonly [string, string]
  index: number
  screenWidth: number
  left: number
  top: number
  streakWidth: number
}) {
  const style = useAnimatedStyle(() => ({
    opacity: splashSweepStreakOpacity(clock.value),
    transform: [{ translateX: splashSweepStreakX(clock.value, screenWidth, index) }],
  }))
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.streak,
        { left, top, width: streakWidth },
        style,
      ]}
    >
      {/* Degradado horizontal transparente → color: la cola se disuelve, la cabeza acompana
          a la figura. `expo-linear-gradient` YA es dependencia del splash (el sheen del
          morphbar y el tile de iniciales lo usan): cero librerias nuevas. */}
      <LinearGradient
        colors={[colors[0], colors[1]] as const}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  streak: {
    position: 'absolute',
    height: SPLASH_SWEEP_STREAK_HEIGHT,
    borderRadius: SPLASH_SWEEP_STREAK_RADIUS,
    overflow: 'hidden',
  },
})
