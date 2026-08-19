/**
 * Coreografia «Glide» del splash EVA — matematica PURA, sin React ni Reanimated.
 *
 * Vive separada de `SplashGlide.tsx` por dos razones concretas:
 *  1. Se puede TESTEAR sin renderizar (el `include` de `vitest.config.ts` no cubre
 *     `apps/mobile`, asi que el test vive en `tests/mobile-splash-sweep.test.ts` — mismo
 *     patron que `tour-geometry.ts`). Un modulo que importa `react-native` no carga en Node.
 *  2. Todas las funciones estan marcadas `'worklet'`: el plugin de Reanimated las
 *     workletiza y `useAnimatedStyle` puede llamarlas directo en el hilo de UI. Cero
 *     `setState` por frame.
 *
 * ORIGEN (la verdad del diseno): la escena `GlideSplash` del canvas 1080x1920 disenado por
 * el dueno. Ahi los tiempos son AUTORALES (segundos del canvas) y la escena activa se
 * reproduce a **2x**: 3.5 s autorales = 1.75 s reales. Por eso cada ventana de aca es
 * `autoral / 2 * 1000` ms, y cada longitud es una RAZON sobre el canvas que se multiplica
 * por el ancho (o alto) real de la pantalla — un telefono de 390 pt no es un canvas de 1080.
 *
 * El reloj (`tMs`) es tiempo REAL transcurrido desde el instante en que el gate SEMBRO el
 * sweep, no un progreso 0..1: asi el overlay del dashboard puede RETOMAR la coreografia a
 * mitad de camino con solo saber en que instante arranco (`SplashHandoff.sweepStartedAt`).
 *
 * DONDE se siembra ese instante importa tanto como la matematica: es el VEREDICTO del gate
 * —sesion viva Y sin marca de coach, o sea el unico camino que termina en el dashboard
 * EVA—, no el primer paint. Sembrarlo en el primer paint hacia volar la figura EVA con sus
 * estelas por encima del crossfade a la marca del coach, y cortaba el barrido por la mitad
 * en el cold start anonimo (el gate se desmonta hacia el selector a los ~100-600 ms y ahi
 * no hay overlay que lo continue). Ver `SplashGate`.
 */

/** El canvas autoral se reproduce a 2x. Unica constante que traduce diseno → app. */
export const SPLASH_SWEEP_RATE = 2
/** Largo autoral de la escena (`authoredTotal` del canvas), en segundos. */
export const SPLASH_SWEEP_AUTHORED_S = 3.5

/** Autoral (s) → real (ms). `splashSweepMs(1.1)` = 550. */
export function splashSweepMs(authoredSeconds: number): number {
  'worklet'
  return (authoredSeconds / SPLASH_SWEEP_RATE) * 1000
}

/**
 * Fin del reloj = fin de la escena autoral. El tramo 550→1750 ms es SOLO el settle
 * (escala 1→1.02 lineal), que en la app se corta cuando el dashboard esta listo: por eso
 * "respira lento" y casi nunca se lo ve terminar.
 */
export const SPLASH_SWEEP_END_MS = splashSweepMs(SPLASH_SWEEP_AUTHORED_S) // 1750

/** Ventanas reales (ms) de cada canal. Los comentarios llevan el tiempo AUTORAL de origen. */
export const SPLASH_SWEEP_WINDOWS = Object.freeze({
  /** Figura: x + rotacion, easeOutExpo. Autoral 0.15 → 1.10. */
  figure: Object.freeze({ start: splashSweepMs(0.15), end: splashSweepMs(1.1) }), // 75 → 550
  /** Estelas: fade-in. Autoral 0.2, dur 0.2. */
  streakIn: Object.freeze({ start: splashSweepMs(0.2), end: splashSweepMs(0.4) }), // 100 → 200
  /** Estelas: fade-out. Autoral 0.95, dur 0.55. */
  streakOut: Object.freeze({ start: splashSweepMs(0.95), end: splashSweepMs(1.5) }), // 475 → 750
  /** Firma: deslizamiento desde la derecha, easeOutExpo. Autoral 0.4 → 1.35. */
  wordmarkX: Object.freeze({ start: splashSweepMs(0.4), end: splashSweepMs(1.35) }), // 200 → 675
  /** Firma: fade-in. Autoral 0.4, dur 0.55. */
  wordmarkOpacity: Object.freeze({ start: splashSweepMs(0.4), end: splashSweepMs(0.95) }), // 200 → 475
  /** Settle: escala lineal hasta el final de la escena. Autoral 1.1 → 3.5. */
  settle: Object.freeze({ start: splashSweepMs(1.1), end: SPLASH_SWEEP_END_MS }), // 550 → 1750
})

/**
 * Geometria, en RAZONES sobre el canvas 1080x1920. Nada de pixeles absolutos: el mismo
 * gesto tiene que leerse igual en un iPhone SE y en una tablet.
 */
/** La figura entra desde `-780/1080` del ancho. */
export const SPLASH_SWEEP_FIGURE_FROM_X_RATIO = -780 / 1080
/** ...con `-9°` de inclinacion que se endereza en el camino. */
export const SPLASH_SWEEP_FIGURE_FROM_ROTATION = -9

/**
 * Medidas de la figura del frame 01 (§3.1). Viven ACA y no en `SplashBrand` por una razon
 * de dependencia: el clamp de abajo las necesita y este modulo tiene que cargar en Node
 * (`SplashBrand` importa `react-native`). `SPLASH_FIGURE_SIZE` las re-exporta, asi que el
 * numero sigue siendo UNO solo.
 */
export const SPLASH_SWEEP_FIGURE_WIDTH = 150
/** Alto derivado del aspecto real del asset (585:526), igual que `evaFigureHeight`. */
export const SPLASH_SWEEP_FIGURE_HEIGHT = Math.round((SPLASH_SWEEP_FIGURE_WIDTH * 526) / 585) // 135

/**
 * Semi-ancho de la caja de la figura YA INCLINADA `-9°`: `(w·cos + h·sin) / 2`.
 * Rotar alrededor del centro ensancha la caja ~9.7 pt por lado (84.7 en vez de 75): medir
 * con el ancho pelado deja la ESQUINA superior asomando aunque el rectangulo recto ya
 * hubiera salido.
 */
export const SPLASH_SWEEP_FIGURE_HALF_EXTENT =
  (SPLASH_SWEEP_FIGURE_WIDTH * Math.cos((Math.abs(SPLASH_SWEEP_FIGURE_FROM_ROTATION) * Math.PI) / 180) +
    SPLASH_SWEEP_FIGURE_HEIGHT * Math.sin((Math.abs(SPLASH_SWEEP_FIGURE_FROM_ROTATION) * Math.PI) / 180)) /
  2

/**
 * X de PARTIDA de la figura, en pt. Es la razon del canvas… salvo cuando esa razon no
 * alcanza para sacarla de cuadro.
 *
 * El canvas autoral mide 1080 de ancho y la figura 150 pt fijos: la razon `-780/1080` es
 * suficiente en un telefono de 390 pt (−281.7 contra los −279.7 que hacen falta), pero en
 * uno de 320 pt da −231.1 contra −244.7 y deja ~14 pt de figura pegados al borde izquierdo
 * durante el hold — un tarugo blanco parado en el margen, no una figura que llega volando.
 * Por eso se toma el MAXIMO desplazamiento de los dos: el diseno manda mientras cubra, y el
 * piso geometrico manda cuando el diseno se queda corto.
 *
 * Fuera de cuadro = el borde derecho de la caja rotada queda en 0 o a la izquierda:
 * `W/2 + translateX + halfExtent ≤ 0`.
 */
export function splashSweepFigureFromX(width: number): number {
  'worklet'
  const authored = SPLASH_SWEEP_FIGURE_FROM_X_RATIO * width
  const offscreen = -(width / 2 + SPLASH_SWEEP_FIGURE_HALF_EXTENT)
  return authored <= offscreen ? authored : offscreen
}
/** Settle: 1 → 1.02. Imperceptible por frame, pero saca a la figura del estado "poster". */
export const SPLASH_SWEEP_SETTLE_SCALE = 1.02
/** La firma entra desde `+560/1080` del ancho (lado opuesto a la figura). */
export const SPLASH_SWEEP_WORDMARK_FROM_X_RATIO = 560 / 1080
/** Largo de cada estela. */
export const SPLASH_SWEEP_STREAK_WIDTH_RATIO = 620 / 1080
/** Alto de la estela en pt (el canvas usa 5 px sobre 1920; 3 dp es el equivalente optico). */
export const SPLASH_SWEEP_STREAK_HEIGHT = 3
export const SPLASH_SWEEP_STREAK_RADIUS = 2
/** Retraso de la estela 0 respecto de la figura. */
export const SPLASH_SWEEP_STREAK_LAG_RATIO = 360 / 1080
/** Retraso adicional por estela (0, 1, 2) — abre el abanico. */
export const SPLASH_SWEEP_STREAK_STEP_RATIO = 60 / 1080
/** Separacion vertical entre estelas, sobre el ALTO (el canvas la mide en 1920). */
export const SPLASH_SWEEP_STREAK_GAP_RATIO = 96 / 1920

/**
 * Colores de las estelas (identidad EVA, NO white-label: esta es la rama EVA del loader y
 * la del coach ni se toca). Cada estela es un degradado horizontal transparente → color;
 * el extremo transparente usa el MISMO RGB con alpha 0 y no la palabra `transparent`, que
 * es `rgba(0,0,0,0)` y al interpolar deja una franja negra sucia sobre el canvas.
 */
export const SPLASH_SWEEP_STREAK_COLORS: readonly (readonly [string, string])[] = Object.freeze([
  Object.freeze(['rgba(0,229,255,0)', 'rgba(0,229,255,0.55)'] as const),
  Object.freeze(['rgba(0,122,255,0)', 'rgba(0,122,255,0.75)'] as const),
  Object.freeze(['rgba(0,229,255,0)', 'rgba(0,229,255,0.55)'] as const),
])

/** Progreso 0..1 dentro de una ventana `[start, end]`, con clamp en los dos extremos. */
export function splashSweepProgress(tMs: number, start: number, end: number): number {
  'worklet'
  if (end <= start) return tMs >= end ? 1 : 0
  const p = (tMs - start) / (end - start)
  if (p <= 0) return 0
  if (p >= 1) return 1
  return p
}

/**
 * easeOutExpo. Es EXACTAMENTE `Easing.out(Easing.exp)` de Reanimated
 * (`1 - exp(1-t)` con `exp(t) = 2^(10(t-1))` ⇒ `1 - 2^(-10t)`), escrito a mano para no
 * depender de que el plugin logre capturar dentro de un worklet una `EasingFunction`
 * construida en scope de modulo.
 */
export function splashSweepEaseOutExpo(p: number): number {
  'worklet'
  if (p >= 1) return 1
  if (p <= 0) return 0
  return 1 - Math.pow(2, -10 * p)
}

/** easeInOutSine — la curva por defecto de `MOTION.tween` en el canvas (los fades). */
export function splashSweepEaseInOutSine(p: number): number {
  'worklet'
  if (p <= 0) return 0
  if (p >= 1) return 1
  return -(Math.cos(Math.PI * p) - 1) / 2
}

/**
 * Milisegundos transcurridos desde el arranque del sweep, acotados al largo de la escena.
 * `startedAt == null` = el gate todavia NO dio su veredicto (o dio uno que no lleva sweep:
 * branded / anonimo) ⇒ 0. Ese 0 no se pinta como "figura fuera de cuadro": el consumidor
 * ni siquiera aplica el estilo animado y queda la replica estatica de §3.1.
 */
export function splashSweepElapsed(startedAt: number | null, now: number): number {
  'worklet'
  if (startedAt == null) return 0
  const elapsed = now - startedAt
  if (elapsed <= 0) return 0
  if (elapsed >= SPLASH_SWEEP_END_MS) return SPLASH_SWEEP_END_MS
  return elapsed
}

/**
 * Reloj del arranque, aislado en un helper con nombre.
 *
 * Existe por `react-hooks/purity`: leer `Date.now()` en fase de render esta prohibido —con
 * razon, en general—, pero las semillas de un `useRef` / `useSharedValue` son estables DE
 * HECHO (esos hooks solo consumen su argumento en el primer render). La regla no puede
 * saberlo; cruzando el limite de modulo la lectura queda declarada como lo que es: una
 * marca de tiempo deliberada y de un solo uso, no un calculo de render.
 */
export function splashClockNow(): number {
  return Date.now()
}

/** `splashSweepElapsed` contra el reloj del sistema. Ver `splashClockNow`. */
export function splashSweepElapsedNow(startedAt: number | null): number {
  return splashSweepElapsed(startedAt, splashClockNow())
}

export interface SplashSweepFigure {
  /** Desplazamiento horizontal en pt (negativo = fuera de cuadro por la izquierda). */
  translateX: number
  /** Grados. Negativo = inclinada "hacia atras" en el sentido de la marcha. */
  rotation: number
  /** Escala del settle. */
  scale: number
}

/** Canal de la FIGURA: entrada easeOutExpo + settle lineal encadenado. */
export function splashSweepFigure(tMs: number, width: number): SplashSweepFigure {
  'worklet'
  const enter = splashSweepEaseOutExpo(
    splashSweepProgress(tMs, SPLASH_SWEEP_WINDOWS.figure.start, SPLASH_SWEEP_WINDOWS.figure.end),
  )
  const settle = splashSweepProgress(
    tMs,
    SPLASH_SWEEP_WINDOWS.settle.start,
    SPLASH_SWEEP_WINDOWS.settle.end,
  )
  return {
    translateX: splashSweepFigureFromX(width) * (1 - enter),
    rotation: SPLASH_SWEEP_FIGURE_FROM_ROTATION * (1 - enter),
    scale: 1 + (SPLASH_SWEEP_SETTLE_SCALE - 1) * settle,
  }
}

export interface SplashSweepWordmark {
  translateX: number
  opacity: number
}

/**
 * Canal de la FIRMA (hairline + "EVA"). Reemplaza el fade-por-umbral SOLO en el camino
 * animado: el consumidor MULTIPLICA esta opacidad por la del umbral de siempre, asi que
 * cuando el gate decide que no hay firma que mostrar (camino branded) el producto es 0 y
 * la rama del coach queda tal cual estaba.
 */
export function splashSweepWordmark(tMs: number, width: number): SplashSweepWordmark {
  'worklet'
  const enter = splashSweepEaseOutExpo(
    splashSweepProgress(tMs, SPLASH_SWEEP_WINDOWS.wordmarkX.start, SPLASH_SWEEP_WINDOWS.wordmarkX.end),
  )
  const fade = splashSweepEaseInOutSine(
    splashSweepProgress(
      tMs,
      SPLASH_SWEEP_WINDOWS.wordmarkOpacity.start,
      SPLASH_SWEEP_WINDOWS.wordmarkOpacity.end,
    ),
  )
  return {
    translateX: SPLASH_SWEEP_WORDMARK_FROM_X_RATIO * width * (1 - enter),
    opacity: fade,
  }
}

/** Opacidad comun de las 3 estelas: fade-in corto por delante, fade-out largo por detras. */
export function splashSweepStreakOpacity(tMs: number): number {
  'worklet'
  const fadeIn = splashSweepEaseInOutSine(
    splashSweepProgress(tMs, SPLASH_SWEEP_WINDOWS.streakIn.start, SPLASH_SWEEP_WINDOWS.streakIn.end),
  )
  const fadeOut = splashSweepEaseInOutSine(
    splashSweepProgress(tMs, SPLASH_SWEEP_WINDOWS.streakOut.start, SPLASH_SWEEP_WINDOWS.streakOut.end),
  )
  return fadeIn * (1 - fadeOut)
}

/**
 * X de la estela `index` (0..2): sigue a la figura con un desfase creciente. Es lo que
 * convierte tres barras en "velocidad" y no en tres barras.
 */
export function splashSweepStreakX(tMs: number, width: number, index: number): number {
  'worklet'
  const lag = (SPLASH_SWEEP_STREAK_LAG_RATIO + index * SPLASH_SWEEP_STREAK_STEP_RATIO) * width
  return splashSweepFigure(tMs, width).translateX - lag
}
