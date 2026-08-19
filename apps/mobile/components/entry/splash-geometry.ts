/**
 * Geometria del splash — matematica PURA, sin React ni react-native, importable en Node.
 *
 * Existe para que la paridad con el splash NATIVO tenga un guard ejecutable
 * (`tests/mobile-splash-geometry.test.ts` la contrasta contra el `imageWidth` real de
 * `app.json`): la leccion del QA 19-08 es que este numero vivio meses desalineado (JS 150,
 * nativo 180) sin que ningun gate lo cazara, y el logo se achicaba un 20% en el handoff.
 */

/** Aspecto real del asset `eva-icon.png`: 585 / 526. */
export const EVA_FIGURE_RATIO = 585 / 526

/** Alto que le corresponde a un ancho dado. 180 → 162, 30 → 27, 22 → 20. */
export function evaFigureHeight(size: number): number {
  return Math.round((size * 526) / 585)
}

/**
 * **180 = el `imageWidth` del splash nativo en `app.json`** — la razon de ser del numero es
 * la PARIDAD con lo que el sistema operativo ya pinto. Ojo con el contrato real de
 * expo-splash-screen: `imageWidth` es el LADO de una caja CUADRADA contain-fit (iOS arma un
 * imageView de 180x180 pt; Android compone el drawable en `180 * densidad`), no un ancho
 * garantizado. La igualdad «ancho visible = imageWidth» vale porque `eva-icon.png` es
 * APAISADO (585x526): si el asset cambiara a cuadrado o vertical, el nativo pintaria menos
 * de 180 de ancho y esta constante deberia pasar a `min(180, 180 * ratio)`.
 */
export const SPLASH_FIGURE_SIZE = 180
export const SPLASH_FIGURE_HEIGHT = evaFigureHeight(SPLASH_FIGURE_SIZE) // 162

export const SPLASH_HAIRLINE_MARGIN_TOP = 16

/**
 * Centro OPTICO de la figura = centro real de la PANTALLA, porque ahi centra su imagen el
 * splash nativo (constraints centerX/centerY en iOS, canvas centrado en Android). La figura
 * es lo UNICO que participa del centrado; la firma cuelga debajo en un slot absoluto.
 */
export function splashFigureCenterY(screenHeight: number): number {
  return screenHeight / 2
}

/**
 * Distancia del centro de pantalla al TOP del slot de la firma: media figura + el aire del
 * frame 01. Si `SPLASH_FIGURE_SIZE` cambia y este offset no, la firma se despega o se
 * encima — el test de geometria fija la relacion.
 */
export const SPLASH_SIGNATURE_SLOT_OFFSET = SPLASH_FIGURE_HEIGHT / 2 + SPLASH_HAIRLINE_MARGIN_TOP // 97

/** Medidas del bloque de marca del coach (§3.6): tile + nombre + saludo, en flujo centrado. */
const COACH_TILE = 96
const COACH_NAME_MARGIN_TOP = 19
const COACH_NAME_LINE_HEIGHT = 22
const COACH_GREETING_MARGIN_TOP = 7
const COACH_GREETING_LINE_HEIGHT = 14
const COACH_STACK_HEIGHT =
  COACH_TILE + COACH_NAME_MARGIN_TOP + COACH_NAME_LINE_HEIGHT + COACH_GREETING_MARGIN_TOP + COACH_GREETING_LINE_HEIGHT // 158

/**
 * Centro OPTICO del logo/tile del coach en el retorno branded: el bloque (tile + nombre +
 * saludo) se centra como stack, asi que el tile queda ARRIBA del centro de pantalla. La
 * fuente de luz del canal coach ancla ACA y no en `splashFigureCenterY`: con el ancla en
 * h/2 la luz quedaba ~31 pt debajo del logo durante y despues del crossfade (hallazgo de la
 * revision adversarial 19-08). Sin saludo (greetingName null) el bloque mide 21 pt menos y
 * el centro real sube ~10 pt — irrelevante para una fuente difusa de 460 pt.
 */
export function splashCoachSourceCenterY(screenHeight: number): number {
  return screenHeight / 2 - COACH_STACK_HEIGHT / 2 + COACH_TILE / 2 // h/2 - 31
}
