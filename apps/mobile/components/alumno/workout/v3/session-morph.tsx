import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { usePathname, useRouter } from 'expo-router'
import * as Sentry from '@sentry/react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import Svg, { Path } from 'react-native-svg'
import { Play } from 'lucide-react-native'
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { useTheme } from '../../../../context/ThemeContext'
import { FONT } from '../../../../lib/typography'
import { resolveExecTheme, type ExecTheme } from './exec-theme'

/**
 * Espejo RN del "DESPEGUE" (loader de lanzamiento del workout, diseño del CEO "Despegue Final") —
 * transcripción 1:1 del port web del jefe: `WorkoutLaunchMorph.tsx` (DespegueOverlay) + los @keyframes
 * `.exec-dsp*` de `apps/web/src/app/globals.css`. Al tocar "Empezar entrenamiento" / day-card:
 *  · una PÍLDORA de marca ("Empezar entrenamiento") morfea a burbuja, anticipa (squash) y DESPEGA con
 *    stretch + una estela que crece (keyframe exec-dsp-morph 0.95s cubic-bezier(.6,0,.75,.4));
 *  · el FONDO de marca sube con un wipe vertical cubriendo el dashboard (exec-dsp-wipe 0.6s@.6s);
 *  · 3 estelas de luz caen (exec-dsp-line);
 *  · el LOGO del coach ATERRIZA con rebote (exec-dsp-logoland 0.95s@1.1s) + una onda de impacto
 *    (exec-dsp-ring 0.55s@1.62s), y queda en "PREPARANDO TU SESIÓN" (exec-dsp-fadeup @1.9s) con 3 dots
 *    en LOOP infinito (exec-dsp-dot).
 *
 * Contrato del CEO: la animación SIEMPRE se completa (aunque el workout cargue antes) y luego ESPERA el
 * TAP del alumno para entrar a la pantalla de Inicio ("Día N + EMPEZAR"). NO hay auto-dismiss: el overlay
 * se despide sólo al tap, y sólo cuando ya está listo (animación terminada ~2.7s + escena del ejecutor
 * montada y cargada). El overlay vive en un `Modal` NATIVO que flota sobre la transición de navegación
 * (equivalente RN del portal-a-body + provider persistente del web), así sobrevive al `router.push`.
 *
 * Via-morph → el ExecutorV3 arranca DIRECTO en la fase 'start' (Inicio), saltando el SessionIntro (el
 * Despegue ES el splash): la marca viaja por `markMorphLaunch()`/`consumeMorphLaunch()` (equivalente RN
 * del sessionStorage 'eva:exec-v3-morph' del web). El ejecutor avisa "escena lista" con
 * `signalMorphSceneReady()` cuando termina de cargar → habilita el tap.
 *
 * White-label: TODO deriva de `exec.accent` (resolveExecTheme, primario del coach), jamás hardcodeado —
 * los tonos oscuros del fondo/logo/estelas se mezclan sobre el acento (`mixHex`, equivalente RN del
 * `color-mix(in srgb, var(--b) X%, …)` del web). Motor de guardado / navegación de destino: INTOCABLE.
 */

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')

// ── Tiempos de la coreografía (1:1 con el web). ──
/** Animación "arribada" (logo aterrizado + PREPARANDO visible). Tras esto se habilita el tap. */
const ANIM_DONE_MS = 2700
/** Reduced-motion: sin vuelo, la escena asienta rápido. */
const ANIM_DONE_REDUCED_MS = 500
/** Fallback: si el ejecutor nunca avisa "listo", habilitar el tap igual (no atrapar al alumno). */
const READY_FALLBACK_MS = 4600
/** Navegar cuando el wipe de marca YA cubrió todo (delay .6s + dur .6s ≈ 1.2s): así el swap de ruta
 *  (dashboard → ejecutor) queda oculto tras el azul opaco y no se ve el flash del contenido detrás. */
const NAV_AT_MS = 1300
/** Reduced-motion: sin wipe, navega antes (nada tapa el swap, pero el overlay opaco ya cubre). */
const NAV_AT_REDUCED_MS = 60
/** Fade de entrada del hint + fade de salida al tap. */
const HINT_FADE_MS = 350
const EXIT_MS = 320

// Curvas del contrato (mismos beziers que los @keyframes del web).
const BEZIER_MORPH = Easing.bezier(0.6, 0, 0.75, 0.4) // exec-dsp-morph
const BEZIER_LAND = Easing.bezier(0.5, 0, 0.6, 1) // exec-dsp-logoland
const BEZIER_WIPE = Easing.bezier(0.76, 0, 0.19, 1) // exec-dsp-wipe
const EASE = Easing.bezier(0.25, 0.1, 0.25, 1) // CSS `ease`
const EASE_OUT = Easing.out(Easing.ease) // CSS `ease-out`

// Burbuja objetivo del morph: 52px, radio 50% = 26.
const BUBBLE = 52
const BUBBLE_RADIUS = 26

// Breakpoints fraccionales de exec-dsp-morph (0/32/48/60/100%). Cada segmento eleva con su propio bezier
// (CSS aplica la timing-function ENTRE cada par de keyframes) → withSequence de 4 timings que aterrizan
// exactamente en estos puntos, luego interpolamos cada propiedad sobre el mismo dominio.
const MORPH_IN = [0, 0.32, 0.48, 0.6, 1]
// Breakpoints de exec-dsp-logoland (0/52/62/76/88/100%).
const LAND_IN = [0, 0.52, 0.62, 0.76, 0.88, 1]

/** Rect del trigger — se mantiene por compatibilidad de firma; el Despegue NO morfea desde el rect real
 *  (igual que el web: la píldora vive fija en `top: 64%`), así que el origin se ACEPTA pero se ignora. */
export interface MorphOrigin {
  x: number
  y: number
  width: number
  height: number
  radius?: number
}

interface StartMorphArgs {
  planId: string
  /** Rect medido del trigger (aceptado por compat; ignorado por la coreografía del Despegue). */
  origin?: MorphOrigin | null
  /** Params extra de la ruta (recuperar/fecha). */
  params?: Record<string, string>
  /** Etiqueta REAL del CTA tocado ('Continuar' | 'Ver registro' | 'Empezar entrenamiento'…) para que el
   *  clon de la píldora muestre el mismo texto (ilusión del swap sin costura). Fallback si no llega. */
  label?: string
}

interface SessionMorphContextValue {
  startMorph: (args: StartMorphArgs) => void
}

const SessionMorphContext = createContext<SessionMorphContextValue | null>(null)

// ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Puente módulo-nivel Despegue ↔ ExecutorV3 (equivalente RN del sessionStorage 'eva:exec-v3-morph' web).
// ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Ventana de validez de la marca via-morph: si el ejecutor no la consume en este lapso, se considera
 *  rancia (un aborto dejó basura global) y NO salta el SessionIntro. Espejo del TTL del fix web. */
const MORPH_LAUNCH_TTL_MS = 10000
/** Marca "llegué por el morph" como TIMESTAMP (o null): el ExecutorV3 la consume al montar y —si es
 *  reciente— salta DIRECTO a la fase 'start'. `markMorphLaunch`/`consumeMorphLaunch` son funciones a
 *  nivel MÓDULO, así que el `Date.now()` de la marca no cae en el lint react-compiler de los handlers. */
let pendingMorphLaunch: number | null = null
export function markMorphLaunch(): void {
  pendingMorphLaunch = Date.now()
}
/** Consume la marca (una sola vez). true ⇒ marca presente y con <TTL ⇒ arrancar en 'start' saltando el
 *  SessionIntro. SIEMPRE limpia la marca (aunque esté vencida), así una lectura tardía no la reusa. */
export function consumeMorphLaunch(): boolean {
  const ts = pendingMorphLaunch
  pendingMorphLaunch = null
  return ts != null && Date.now() - ts < MORPH_LAUNCH_TTL_MS
}
/** Limpia la marca sin consumirla como "vía-morph". Se llama al ABORTAR el Despegue antes de navegar
 *  (back de hardware / error de nav): si no, la marca queda rancia y la próxima entrada al ejecutor
 *  saltaría el SessionIntro (splash fantasma) — hallazgo confirmado en la auditoría. */
export function resetMorphLaunch(): void {
  pendingMorphLaunch = null
}

// Señal "escena del ejecutor lista" (via-morph): el ExecutorV3 la emite al terminar de cargar → el
// Despegue habilita el tap. Se guarda el estado por si el ejecutor avisa ANTES de que el overlay se
// suscriba (carrera de montaje): al suscribirse, si ya está listo, dispara de inmediato.
let morphSceneReady = false
let morphSceneReadyListener: (() => void) | null = null
/** Reinicia el estado de "listo" al arrancar un nuevo despegue. */
export function resetMorphScene(): void {
  morphSceneReady = false
}
/** El ExecutorV3 avisa que la escena de Inicio ya cargó (via-morph). */
export function signalMorphSceneReady(): void {
  morphSceneReady = true
  morphSceneReadyListener?.()
}
/** El overlay se suscribe; devuelve el unsubscribe. Dispara ya si la escena estaba lista. */
function subscribeMorphScene(fn: () => void): () => void {
  morphSceneReadyListener = fn
  if (morphSceneReady) fn()
  return () => {
    if (morphSceneReadyListener === fn) morphSceneReadyListener = null
  }
}

interface ActiveMorph {
  nonce: number
  planId: string
  /** Rect del trigger clickeado (real medido, o sintético si el caller no midió). */
  origin: MorphOrigin
  params?: Record<string, string>
  /** Etiqueta real del CTA tocado (para el clon de la píldora). */
  label?: string
}

/** Origen sintético (fallback digno): un rect tipo píldora centrado-bajo, donde suelen vivir los CTA.
 *  Sólo se usa si un caller no midió el rect real (measureMorphOrigin devolvió null). */
function syntheticOrigin(): MorphOrigin {
  const width = Math.min(260, SCREEN_W - 48)
  const height = 52
  return { x: SCREEN_W / 2 - width / 2, y: SCREEN_H * 0.62, width, height, radius: 16 }
}

export function SessionMorphProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const { theme, branding } = useTheme()
  const reducedMotion = useReducedMotion()
  const [active, setActive] = useState<ActiveMorph | null>(null)
  const busyRef = useRef(false)
  // Ruta desde la que se lanzó el Despegue + si ya navegamos fuera → para detectar el "atrás" del
  // teléfono (volver al dashboard) y no dejar el overlay pegado. `pathnameRef` evita meter pathname en
  // las deps de startMorph (que debe ser estable).
  const pathnameRef = useRef(pathname)
  pathnameRef.current = pathname
  const startPathRef = useRef<string | null>(null)
  const leftRouteRef = useRef(false)

  const exec = useMemo(
    () => resolveExecTheme(branding?.executorTheme, theme.primary, theme.primaryForeground),
    [branding?.executorTheme, theme.primary, theme.primaryForeground],
  )
  // El MISMO logo/inicial que mostrará el SessionStart del ejecutor: handoff exacto.
  const coachLogoUrl = branding?.logoUrl ?? null
  const coachInitial = ((branding?.displayName?.trim() || 'Tu coach')[0] ?? 'E').toUpperCase()

  const startMorph = useCallback(({ planId, origin, params, label }: StartMorphArgs) => {
    // Guard anti doble-tap: ignora taps mientras un morph está en vuelo.
    if (busyRef.current) return
    busyRef.current = true
    // Rastro de telemetría: inicio del Despegue (para correlacionar abortos/carreras en device).
    try {
      Sentry.addBreadcrumb({ category: 'exec-v3', level: 'info', message: 'Despegue: startMorph', data: { planId } })
    } catch {
      // Sentry no inicializado / versión sin API → no-op silencioso.
    }
    // Marca via-morph + resetea la señal de "listo" ANTES de montar el ejecutor (se consume al montar).
    resetMorphScene()
    markMorphLaunch()
    // Ancla la ruta de lanzamiento para detectar el "atrás" (volver a ella tras haber navegado).
    startPathRef.current = pathnameRef.current
    leftRouteRef.current = false
    // El morph NACE del componente clickeado: usa el rect real medido; si el caller no midió, cae al
    // origen sintético centrado-bajo.
    setActive({ nonce: Date.now(), planId, origin: origin ?? syntheticOrigin(), params, label })
  }, [])

  const navigate = useCallback(() => {
    if (!active) return
    try {
      if (active.params && Object.keys(active.params).length > 0) {
        router.push({ pathname: '/alumno/workout/[planId]', params: { planId: active.planId, ...active.params } })
      } else {
        router.push(`/alumno/workout/${active.planId}`)
      }
    } catch (err) {
      // Error de navegación: cierra el overlay y LIMPIA la marca via-morph (nadie la va a consumir; si no,
      // quedaría rancia y saltaría el SessionIntro en la próxima entrada). Sin dejar al usuario pegado.
      resetMorphLaunch()
      try {
        Sentry.captureException(err, { tags: { area: 'exec-v3-despegue' }, extra: { planId: active.planId } })
      } catch {
        // Sentry no inicializado → no-op silencioso.
      }
      setActive(null)
      busyRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, router])

  const handleDone = useCallback(() => {
    // Si el overlay muere SIN haber navegado (back de hardware / onRequestClose antes del push ~1300ms),
    // el ExecutorV3 nunca montó ni consumió la marca → quedaría rancia y la próxima entrada saltaría el
    // SessionIntro (splash fantasma). Limpiarla en el aborto. Si ya navegamos (leftRoute=true), el
    // ejecutor la consumió y este reset es no-op inofensivo.
    if (!leftRouteRef.current) resetMorphLaunch()
    setActive(null)
    busyRef.current = false
  }, [])

  // Back del teléfono / gesto: si tras lanzar el Despegue navegamos fuera (a la ruta del ejecutor) y
  // luego VOLVEMOS a la ruta de lanzamiento (el alumno tocó "atrás"), el overlay debe irse — no quedar
  // pegado sobre el dashboard. Espejo del web (pathname regresó al startPath estando ya fuera → clearAll).
  useEffect(() => {
    if (!active) return
    if (pathname !== startPathRef.current) {
      leftRouteRef.current = true
      return
    }
    if (leftRouteRef.current) handleDone()
  }, [pathname, active, handleDone])

  const value = useMemo(() => ({ startMorph }), [startMorph])

  return (
    <SessionMorphContext.Provider value={value}>
      {children}
      {active && (
        <DespegueOverlay
          key={active.nonce}
          exec={exec}
          origin={active.origin}
          planId={active.planId}
          label={active.label}
          coachLogoUrl={coachLogoUrl}
          coachInitial={coachInitial}
          reducedMotion={reducedMotion}
          onNavigate={navigate}
          onDone={handleDone}
        />
      )}
    </SessionMorphContext.Provider>
  )
}

/**
 * Hook de acceso. Si no hay provider montado (fail-safe), cae a un `router.push` plano para que ninguna
 * pantalla trigger se rompa por falta de contexto.
 */
export function useSessionMorph(): SessionMorphContextValue {
  const ctx = useContext(SessionMorphContext)
  const router = useRouter()
  const fallback = useMemo<SessionMorphContextValue>(
    () => ({
      startMorph: ({ planId, params }) => {
        if (params && Object.keys(params).length > 0) {
          router.push({ pathname: '/alumno/workout/[planId]', params: { planId, ...params } })
        } else {
          router.push(`/alumno/workout/${planId}`)
        }
      },
    }),
    [router],
  )
  return ctx ?? fallback
}

/**
 * Helper para triggers: mide el rect en ventana de un `View` (ref) y llama `cb` con el origen. El
 * Despegue ignora el origin (la píldora vive fija), pero se conserva por compatibilidad con los callers.
 */
export function measureMorphOrigin(
  node: { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null,
  radius: number,
  cb: (origin: MorphOrigin | null) => void,
) {
  if (!node?.measureInWindow) {
    cb(null)
    return
  }
  try {
    node.measureInWindow((x, y, width, height) => {
      if (width > 0 && height > 0) cb({ x, y, width, height, radius })
      else cb(null)
    })
  } catch {
    cb(null)
  }
}

/** Ventana que el trigger real permanece OCULTO tras lanzar el Despegue: cubre el morph + wipe + nav
 *  (~1,3s) con margen, para que NO se vea la caja del botón/card detrás del clon que colapsa. */
const TRIGGER_HIDE_MS = 1500

/**
 * Hook para los triggers (CTA "Empezar entrenamiento" / day-cards): al lanzar el Despegue, el componente
 * real clickeado debe quedar INVISIBLE POR COMPLETO (no sólo su texto/icono — la CAJA de color también,
 * si no al colapsar el clon a burbuja se ven los bordes del botón/card detrás; bug QA del CEO). Espejo
 * del `visibility:hidden` del web. Durante 0–~1,2s la ruta aún no navegó y el fondo de marca todavía no
 * hizo el wipe, así que el dashboard (y el trigger) se ven tras el Modal transparente → hay que ocultarlo.
 * Devuelve `hidden` (aplicar a la opacidad del View medible del trigger) y `hide()` (llamar al tocar).
 */
export function useTriggerMorphHide(): { hidden: boolean; hide: () => void } {
  const [hidden, setHidden] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hide = useCallback(() => {
    setHidden(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    // Restaura tras la ventana: para entonces la ruta ya navegó y el ejecutor cubre el dashboard.
    timerRef.current = setTimeout(() => setHidden(false), TRIGGER_HIDE_MS)
  }, [])
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])
  return { hidden, hide }
}

// ── color-mix(in srgb, A p%, B) = A*p + B*(1-p) — mezcla RN sobre el acento (tonos oscuros de marca). ──
function toChannels(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16) || 0, parseInt(h.slice(2, 4), 16) || 0, parseInt(h.slice(4, 6), 16) || 0]
}
function toHex2(n: number): string {
  return Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
}
function mixHex(a: string, pct: number, b: string): string {
  const p = Math.max(0, Math.min(1, pct / 100))
  const [ar, ag, ab] = toChannels(a)
  const [br, bg, bb] = toChannels(b)
  return `#${toHex2(ar * p + br * (1 - p))}${toHex2(ag * p + bg * (1 - p))}${toHex2(ab * p + bb * (1 - p))}`
}

// ── Cresta de AGUA sobre el borde del wipe (espejo del `.exec-dsp-wave` web). ──
// El borde superior de la pintura de marca que sube no es un corte recto: se le monta una cresta
// ondulada (SVG) que deriva en X para dar sensación de agua. La cresta es hija del fondo → sube con el
// wipe; cuando el wipe completa (bgTY=0) queda arriba fuera de pantalla (recortada por overflow:hidden).
const WAVE_TILE = 160 // periodo de la ola (px) — al derivar un tile completo, el loop es sin costura
const WAVE_H = 30
const WAVE_W = SCREEN_W + WAVE_TILE * 2 // ancho extra a cada lado para cubrir la deriva ±160
/** Path de la cresta: dos jorobas por tile (mismos control-points que el mask SVG del web), relleno
 *  hacia abajo hasta y=WAVE_H, repetido a lo ancho. */
function buildWavePath(): string {
  let d = 'M 0 15'
  for (let x = 0; x <= WAVE_W; x += WAVE_TILE) {
    d += ` C ${x + 28} 4 ${x + 52} 4 ${x + 80} 14 C ${x + 108} 24 ${x + 132} 24 ${x + 160} 13`
  }
  d += ` L ${WAVE_W + WAVE_TILE} ${WAVE_H} L 0 ${WAVE_H} Z`
  return d
}
const WAVE_PATH = buildWavePath()

/** Una capa de cresta de ola: SVG relleno de color de marca, anclada en el borde del fondo (topOffset,
 *  con solape hacia el relleno) que DERIVA en X (translateX en loop) para simular agua. */
function WaveCrest({
  color,
  opacity,
  durationMs,
  reverse,
  topOffset,
}: {
  color: string
  opacity: number
  durationMs: number
  reverse: boolean
  topOffset: number
}) {
  const x = useSharedValue(0)
  useEffect(() => {
    // Deriva de UN tile (160px) en loop lineal: como el patrón se repite cada 160px, el salto al reiniciar
    // es invisible (posición 160 == posición 0 desplazada un periodo). Con un pequeño delay: un loop de
    // delay cero puede arrancar antes de que el nodo del Modal se adjunte y quedar descartado (ola quieta);
    // el delay lo empuja tras el attach y es invisible (la cresta recién se ve al subir el wipe ~600ms).
    x.value = withDelay(
      120,
      withRepeat(withTiming(reverse ? -WAVE_TILE : WAVE_TILE, { duration: durationMs, easing: Easing.linear }), -1),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }))
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', top: topOffset, left: -WAVE_TILE, width: WAVE_W, height: WAVE_H, opacity }, style]}
    >
      <Svg width={WAVE_W} height={WAVE_H}>
        <Path d={WAVE_PATH} fill={color} />
      </Svg>
    </Animated.View>
  )
}

/** Estela de luz que cae (exec-dsp-line): translateY -140%→260% del alto propio, opacidad .7→0. */
function FallLine({
  leftPct,
  height,
  durationMs,
  delayMs,
  color,
}: {
  leftPct: number
  height: number
  durationMs: number
  delayMs: number
  color: string
}) {
  const p = useSharedValue(0)
  useEffect(() => {
    p.value = withDelay(delayMs, withTiming(1, { duration: durationMs, easing: EASE }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(p.value, [0, 1], [0.7, 0], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(p.value, [0, 1], [-1.4 * height, 2.6 * height], Extrapolation.CLAMP) }],
  }))
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', top: 0, left: `${leftPct}%`, width: 2, height }, style]}
    >
      <LinearGradient
        colors={['rgba(255,255,255,0)', color]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
    </Animated.View>
  )
}

function DespegueOverlay({
  exec,
  origin,
  planId,
  label,
  coachLogoUrl,
  coachInitial,
  reducedMotion,
  onNavigate,
  onDone,
}: {
  exec: ExecTheme
  origin: MorphOrigin
  planId: string
  label?: string
  coachLogoUrl: string | null
  coachInitial: string
  reducedMotion: boolean
  onNavigate: () => void
  onDone: () => void
}) {
  const insets = useSafeAreaInsets()
  const b = exec.accent
  // Etiqueta real del CTA tocado (o fallback): el clon muestra el MISMO texto que el botón, para que el
  // swap sea sin costura (el diseño se apoya en la ilusión de que el botón se transforma en la burbuja).
  const labelText = label ?? 'Empezar entrenamiento'
  // La píldora nace del rect REAL del trigger (measureInWindow): arranca en su tamaño/posición/radio y
  // COLAPSA hacia su propio centro (cx, cy) → burbuja de 52. Sólo el CTA ancho muestra la etiqueta.
  const rectW = origin.width
  const rectH = origin.height
  const rectRadius = origin.radius ?? 14
  const cx = origin.x + rectW / 2
  const cy = origin.y + rectH / 2
  const wideEnough = rectW >= 150
  // Tonos derivados del acento (mismas mezclas que el web).
  const bgTop = mixHex(b, 44, '#050a1c')
  const bgMid = mixHex(b, 20, '#050a18')
  const bgBottom = '#04060d'
  const waveFoam = mixHex(b, 30, '#0a1330') // 2a cresta más clara (espuma), desfasada
  const trailColor = mixHex(b, 55, '#ffffff')
  const lineColor = mixHex(b, 40, '#ffffff')
  const logoGradA = mixHex(b, 88, '#7aa0ff')
  const logoGradB = mixHex(b, 55, '#000000')
  const ringColor = mixHex(b, 45, '#ffffff')
  const prepColor = mixHex(b, 18, '#ffffff')
  const dotColor = mixHex(b, 45, '#ffffff')
  const readyColor = mixHex(b, 6, '#ffffff') // "LISTO": casi blanco, máximo contraste al quedar listo

  // Shared values de la coreografía.
  const morph = useSharedValue(0) // píldora morph+despegue
  const labelFade = useSharedValue(1) // label del clon (fade a 0 al colapsar a burbuja)
  const trail = useSharedValue(0) // estela de la píldora
  const bgTY = useSharedValue(reducedMotion ? 0 : SCREEN_H) // wipe del fondo (100% → 0)
  const land = useSharedValue(reducedMotion ? 1 : 0) // aterrizaje del logo
  const logoOpacity = useSharedValue(reducedMotion ? 0 : 1) // reduced: fade-in; vuelo: siempre visible
  const ringScale = useSharedValue(0.5)
  const ringOpacity = useSharedValue(0)
  const prep = useSharedValue(0) // "PREPARANDO TU SESIÓN"
  const d0 = useSharedValue(0.2)
  const d1 = useSharedValue(0.2)
  const d2 = useSharedValue(0.2)
  const hint = useSharedValue(0) // hint "TOCA PARA COMENZAR"
  const fade = useSharedValue(1) // fade-out global al tap
  // Percepción del "listo": los dots se desvanecen, "PREPARANDO…" cruza a "LISTO" y el hint se vuelve
  // prominente. `readyProg` 0→1 al quedar listo; `pulse` late el hint en loop (sólo con movimiento).
  const readyProg = useSharedValue(0)
  const pulse = useSharedValue(1)

  // Estado tap-driven.
  const [animDone, setAnimDone] = useState(false)
  const [sceneReady, setSceneReady] = useState(false)
  const [forceReady, setForceReady] = useState(false)
  const ready = animDone && (sceneReady || forceReady)

  const navRef = useRef(onNavigate)
  const doneRef = useRef(onDone)
  navRef.current = onNavigate
  doneRef.current = onDone

  // Suscripción a "escena lista" del ejecutor (via-morph).
  useEffect(() => subscribeMorphScene(() => setSceneReady(true)), [])

  // Lanzamiento de la píldora (morph desde el rect + label fade + estela). Se dispara desde el onLayout
  // de la píldora (garantiza que el nodo YA está montado y medido en el Modal antes de animar; si se
  // dispara en el useEffect de montaje el clon queda congelado y no despega). Guard → una sola vez.
  const pillLaunchedRef = useRef(false)
  const launchPill = useCallback(() => {
    if (pillLaunchedRef.current || reducedMotion) return
    pillLaunchedRef.current = true
    // exec-dsp-morph 0.95s cubic-bezier(.6,0,.75,.4) — segmentos 0→32→48→60→100% (304/152/114/380ms).
    morph.value = withSequence(
      withTiming(0.32, { duration: 304, easing: BEZIER_MORPH }),
      withTiming(0.48, { duration: 152, easing: BEZIER_MORPH }),
      withTiming(0.6, { duration: 114, easing: BEZIER_MORPH }),
      withTiming(1, { duration: 380, easing: BEZIER_MORPH }),
    )
    // exec-dsp-labelfade 0.26s ease → opacity 1→0.
    labelFade.value = withTiming(0, { duration: 260, easing: EASE })
    // exec-dsp-trail 0.5s ease-out 0.5s.
    trail.value = withDelay(500, withTiming(1, { duration: 500, easing: EASE_OUT }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion])

  // Arranca el resto de la coreografía + navegación + habilitación del tap, una vez al montar el Modal.
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    if (reducedMotion) {
      // Reduced-motion: sin vuelo — fondo asentado, logo con fade, PREPARANDO con fade, dots estáticos.
      bgTY.value = 0
      land.value = 1
      logoOpacity.value = withDelay(150, withTiming(1, { duration: 400, easing: EASE }))
      prep.value = withDelay(300, withTiming(1, { duration: 400, easing: EASE }))
      d0.value = 0.7
      d1.value = 0.7
      d2.value = 0.7
    } else {
      // La píldora (morph + label fade + estela) se dispara aparte, en su onLayout (`launchPill`), NO
      // aquí: si se lanza antes de que el nodo esté montado/medido dentro del Modal, el clon queda
      // CONGELADO en su rect y no despega (bug QA). Espejo del callback-ref `runPillMorph` del web.
      // exec-dsp-wipe 0.6s cubic-bezier(.76,0,.19,1) 0.6s → translateY 100%→0.
      bgTY.value = withDelay(600, withTiming(0, { duration: 600, easing: BEZIER_WIPE }))
      // exec-dsp-logoland 0.95s cubic-bezier(.5,0,.6,1) 1.1s — segmentos 0→52→62→76→88→100%; el tramo
      // 52→62% usa ease-out (override per-keyframe del CSS).
      land.value = withDelay(
        1100,
        withSequence(
          withTiming(0.52, { duration: 494, easing: BEZIER_LAND }),
          withTiming(0.62, { duration: 95, easing: EASE_OUT }),
          withTiming(0.76, { duration: 133, easing: BEZIER_LAND }),
          withTiming(0.88, { duration: 114, easing: BEZIER_LAND }),
          withTiming(1, { duration: 114, easing: BEZIER_LAND }),
        ),
      )
      // exec-dsp-fadeup 0.5s ease 1.9s → opacity 0→1, translateY 16→0.
      prep.value = withDelay(1900, withTiming(1, { duration: 500, easing: EASE }))
      // exec-dsp-dot 1.1s ease infinite (0.2↔1), stagger .2s → LOOP. Con un pequeño delay base (120ms):
      // un withRepeat de delay CERO puede arrancar antes de que el nodo del Modal se adjunte y quedar
      // descartado (los dots congelados en 0.2); el delay lo empuja tras el attach y es invisible (el
      // bloque PREPARANDO no aparece hasta 1900ms). El stagger de 200ms se preserva (120/320/520).
      const mkDot = () =>
        withRepeat(
          withSequence(withTiming(1, { duration: 550, easing: EASE }), withTiming(0.2, { duration: 550, easing: EASE })),
          -1,
        )
      d0.value = withDelay(120, mkDot())
      d1.value = withDelay(320, mkDot())
      d2.value = withDelay(520, mkDot())
      // exec-dsp-ring 0.55s ease-out 1.62s — scale .5→2.4, opacity .8→0 (invisible hasta el impacto).
      timers.push(
        setTimeout(() => {
          ringScale.value = withTiming(2.4, { duration: 550, easing: EASE_OUT })
          ringOpacity.value = withSequence(
            withTiming(0.8, { duration: 0 }),
            withTiming(0, { duration: 550, easing: EASE_OUT }),
          )
        }, 1620),
      )
    }

    // Navegación DESPUÉS de que el wipe de marca cubrió todo (~1,3s): el swap de ruta (dashboard →
    // ejecutor) queda oculto tras el azul opaco. La ruta carga DETRÁS; el ejecutor arranca en 'start'.
    timers.push(setTimeout(() => navRef.current(), reducedMotion ? NAV_AT_REDUCED_MS : NAV_AT_MS))
    // La animación SIEMPRE corre completa: a los ANIM_DONE habilitamos el tap (si la escena ya cargó).
    timers.push(setTimeout(() => setAnimDone(true), reducedMotion ? ANIM_DONE_REDUCED_MS : ANIM_DONE_MS))
    // Fallback: habilita el tap pase lo que pase (no atrapar al alumno).
    timers.push(setTimeout(() => setForceReady(true), READY_FALLBACK_MS))
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Hint "TOCA PARA COMENZAR" + percepción del listo — al quedar listo: dots se desvanecen,
  // "PREPARANDO…" cruza a "LISTO" y el hint entra prominente con un pulso sutil en loop. Los fades
  // corren siempre; el pulso sólo con movimiento permitido (reduced-motion = sin pulso, sólo fades).
  useEffect(() => {
    hint.value = withTiming(ready ? 1 : 0, { duration: HINT_FADE_MS, easing: EASE })
    readyProg.value = withTiming(ready ? 1 : 0, { duration: HINT_FADE_MS, easing: EASE })
    if (ready && !reducedMotion) {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.06, { duration: 620, easing: EASE }),
          withTiming(1, { duration: 620, easing: EASE }),
        ),
        -1,
      )
    } else {
      pulse.value = withTiming(1, { duration: HINT_FADE_MS, easing: EASE })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  // Telemetría: el fallback habilitó el tap SIN que el ejecutor avisara "escena lista" (sceneReady=false).
  // Señal de que la escena tardó más que READY_FALLBACK_MS (device lento / carga colgada) — no atrapa al
  // alumno (el tap ya está), pero deja rastro para diagnosticar.
  useEffect(() => {
    if (forceReady && !sceneReady) {
      try {
        Sentry.captureMessage('exec-v3-despegue-force-ready-sin-escena', {
          level: 'warning',
          extra: { planId },
        })
      } catch {
        // Sentry no inicializado → no-op silencioso.
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceReady])

  const dismiss = useCallback(() => {
    if (!ready) return
    fade.value = withTiming(0, { duration: EXIT_MS, easing: EASE }, (finished) => {
      if (finished) runOnJS(doneRef.current)()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready])

  // ── Estilos animados. ──
  const rootStyle = useAnimatedStyle(() => ({ opacity: fade.value }))
  const bgStyle = useAnimatedStyle(() => ({ transform: [{ translateY: bgTY.value }] }))
  const pillStyle = useAnimatedStyle(() => {
    // width rect→52, height rect→52, radius rect→26; centrado en (cx,cy) vía translate(-w/2,-h/2) que
    // NO se escala (traslaciones fuera del scale, igual que el web `translate(-50%,-50%)`); luego la
    // anticipación (squash) y el despegue (stretch) suman translateY sobre ese centro.
    const w = interpolate(morph.value, MORPH_IN, [rectW, BUBBLE, BUBBLE, BUBBLE, BUBBLE], Extrapolation.CLAMP)
    const h = interpolate(morph.value, MORPH_IN, [rectH, BUBBLE, BUBBLE, BUBBLE, BUBBLE], Extrapolation.CLAMP)
    const ty = interpolate(morph.value, MORPH_IN, [0, 0, 18, -60, -780], Extrapolation.CLAMP)
    return {
      width: w,
      height: h,
      borderRadius: interpolate(morph.value, MORPH_IN, [rectRadius, BUBBLE_RADIUS, BUBBLE_RADIUS, BUBBLE_RADIUS, BUBBLE_RADIUS], Extrapolation.CLAMP),
      transform: [
        { translateX: -w / 2 },
        { translateY: -h / 2 + ty },
        { scaleX: interpolate(morph.value, MORPH_IN, [1, 1, 1.18, 0.9, 0.82], Extrapolation.CLAMP) },
        { scaleY: interpolate(morph.value, MORPH_IN, [1, 1, 0.78, 1.3, 1.4], Extrapolation.CLAMP) },
      ],
    }
  })
  const labelStyle = useAnimatedStyle(() => ({ opacity: labelFade.value }))
  const trailStyle = useAnimatedStyle(() => ({
    height: interpolate(trail.value, [0, 0.3, 1], [0, 36, 120], Extrapolation.CLAMP),
    opacity: interpolate(trail.value, [0, 0.3, 1], [0, 0.9, 0], Extrapolation.CLAMP),
  }))
  const logoStyle = useAnimatedStyle(() => ({
    opacity: logoOpacity.value,
    transform: [
      { translateY: interpolate(land.value, LAND_IN, [-620, 0, 0, -18, 0, 0], Extrapolation.CLAMP) },
      { scaleX: interpolate(land.value, LAND_IN, [1, 1, 1.14, 0.96, 1.04, 1], Extrapolation.CLAMP) },
      { scaleY: interpolate(land.value, LAND_IN, [1, 1, 0.86, 1.06, 0.97, 1], Extrapolation.CLAMP) },
    ],
  }))
  const ringStyle = useAnimatedStyle(() => ({ opacity: ringOpacity.value, transform: [{ scale: ringScale.value }] }))
  const prepStyle = useAnimatedStyle(() => ({
    opacity: prep.value,
    transform: [{ translateY: reducedMotion ? 0 : interpolate(prep.value, [0, 1], [16, 0], Extrapolation.CLAMP) }],
  }))
  const dot0Style = useAnimatedStyle(() => ({ opacity: d0.value }))
  const dot1Style = useAnimatedStyle(() => ({ opacity: d1.value }))
  const dot2Style = useAnimatedStyle(() => ({ opacity: d2.value }))
  // "PREPARANDO TU SESIÓN" ↔ "LISTO" (crossfade) + dots que se apagan al quedar listo.
  const prepLabelStyle = useAnimatedStyle(() => ({ opacity: 1 - readyProg.value }))
  const readyLabelStyle = useAnimatedStyle(() => ({ opacity: readyProg.value }))
  const dotsWrapStyle = useAnimatedStyle(() => ({ opacity: 1 - readyProg.value }))
  const hintStyle = useAnimatedStyle(() => ({ opacity: hint.value, transform: [{ scale: pulse.value }] }))

  return (
    <Modal
      transparent
      statusBarTranslucent
      animationType="none"
      visible
      // Back de hardware (Android) sobre el Modal: desmonta el overlay para que NO quede pegado sobre el
      // dashboard/ejecutor. Escape-hatch — funciona aun durante la ceremonia (los taps sí se bloquean).
      onRequestClose={() => doneRef.current()}
    >
      <Animated.View style={[StyleSheet.absoluteFill, styles.root, rootStyle]}>
        {/* Fondo de marca que sube (wipe) + estelas de luz. */}
        <Animated.View style={[StyleSheet.absoluteFill, bgStyle]} pointerEvents="none">
          <View style={[StyleSheet.absoluteFill, { backgroundColor: bgBottom }]} />
          <LinearGradient
            colors={[bgTop, bgMid, bgBottom]}
            locations={[0, 0.45, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          {!reducedMotion && (
            <>
              {/* Cresta de AGUA en el borde superior del fondo (sube con el wipe): la pintura no corta
                  recta, ondula como agua. Dos capas al mismo alto (espuma más clara detrás + cresta de
                  marca al frente) derivando en X a distinta velocidad/sentido: la espuma asoma por donde
                  su fase queda más alta que la cresta de marca = sensación de agua con profundidad. */}
              <WaveCrest color={waveFoam} opacity={0.7} durationMs={2100} reverse topOffset={-26} />
              <WaveCrest color={bgTop} opacity={1} durationMs={3200} reverse={false} topOffset={-26} />
              <FallLine leftPct={22} height={120} durationMs={700} delayMs={950} color={lineColor} />
              <FallLine leftPct={58} height={180} durationMs={800} delayMs={1050} color={lineColor} />
              <FallLine leftPct={80} height={90} durationMs={650} delayMs={1150} color={lineColor} />
            </>
          )}
        </Animated.View>

        {/* Píldora = clon del trigger real (posición/tamaño del rect medido); morfea y despega (oculta en
            reduced-motion). Ancla en el CENTRO del rect (cx, cy); pillStyle centra con translate(-w/2,-h/2). */}
        {!reducedMotion && (
          <Animated.View
            pointerEvents="none"
            onLayout={launchPill}
            style={[
              styles.pill,
              { top: cy, left: cx, backgroundColor: b, shadowColor: b },
              pillStyle,
            ]}
          >
            {wideEnough && (
              <Animated.View style={[styles.pillLabel, labelStyle]}>
                <Play size={15} color="#ffffff" fill="#ffffff" />
                <Text style={styles.pillLabelText} numberOfLines={1}>
                  {labelText}
                </Text>
              </Animated.View>
            )}
            {/* Estela: hija de la píldora (top 100%), crece hacia abajo mientras despega. */}
            <Animated.View style={[styles.trail, trailStyle]}>
              <LinearGradient
                colors={[trailColor, 'rgba(255,255,255,0)']}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
            </Animated.View>
          </Animated.View>
        )}

        {/* Centro: logo del coach que aterriza + "PREPARANDO TU SESIÓN" con dots. */}
        <View style={styles.center} pointerEvents="none">
          <View style={styles.logoWrap}>
            {!reducedMotion && (
              <Animated.View style={[styles.ring, { borderColor: ringColor }, ringStyle]} />
            )}
            <Animated.View style={[styles.logo, { shadowColor: b }, logoStyle]}>
              {/* Anillo de marca SIEMPRE detrás: el logo "respira" (se ve el borde de marca alrededor),
                  como el web `.exec-dsp-logo` background + `.exec-dsp-logo-img` padding:20 + contain. */}
              <LinearGradient
                colors={[logoGradA, logoGradB]}
                start={{ x: 0.15, y: 0 }}
                end={{ x: 0.85, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              {coachLogoUrl ? (
                <Image source={{ uri: coachLogoUrl }} alt="Logo del coach" style={styles.logoImg} contentFit="contain" />
              ) : coachInitial ? (
                <Text style={styles.logoInitial}>{coachInitial}</Text>
              ) : (
                <Play size={36} color="#ffffff" fill="#ffffff" />
              )}
            </Animated.View>
          </View>
          <Animated.View style={[styles.prep, prepStyle]}>
            {/* Crossfade PREPARANDO → LISTO: "PREPARANDO…" queda en flujo (define el ancho) y "LISTO"
                se superpone absoluto encima; al quedar listo el primero se desvanece y el segundo entra. */}
            <View style={styles.prepTextStack}>
              <Animated.Text style={[styles.prepText, { color: prepColor }, prepLabelStyle]}>
                PREPARANDO TU SESIÓN
              </Animated.Text>
              <Animated.Text style={[styles.prepText, styles.readyText, { color: readyColor }, readyLabelStyle]}>
                LISTO
              </Animated.Text>
            </View>
            <Animated.View style={[styles.dots, dotsWrapStyle]}>
              <Animated.View style={[styles.dot, { backgroundColor: dotColor }, dot0Style]} />
              <Animated.View style={[styles.dot, { backgroundColor: dotColor }, dot1Style]} />
              <Animated.View style={[styles.dot, { backgroundColor: dotColor }, dot2Style]} />
            </Animated.View>
          </Animated.View>
        </View>

        {/* Hint "TOCA PARA COMENZAR" — respeta el safe-area inferior (no pisa el gesto de home del iPhone). */}
        <Animated.View
          style={[styles.hintWrap, { bottom: insets.bottom + 24 }, hintStyle]}
          pointerEvents="none"
        >
          <Text style={styles.hintText}>TOCA PARA COMENZAR</Text>
        </Animated.View>

        {/* Capa de tap SIEMPRE presente (top del stack): CAPTURA todos los toques durante la ceremonia
            para que NO se pueda skipear clickeando la pantalla ni pasen al botón EMPEZAR de atrás
            (`dismiss` es no-op hasta `ready`, así sólo bloquea el pass-through). Al estar listo, el tap
            avanza a Inicio. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={dismiss}
          accessibilityRole={ready ? 'button' : undefined}
          accessibilityLabel={ready ? 'Comenzar entrenamiento' : undefined}
          accessibilityElementsHidden={!ready}
          importantForAccessibility={ready ? 'yes' : 'no-hide-descendants'}
        />
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden' },
  pill: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.55,
    shadowRadius: 26,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  // Fila del label centrada por el `alignItems/justifyContent: center` de la píldora (no `absolute`:
  // en RN un hijo absoluto sin offsets se ancla arriba-izquierda, no en la posición estática centrada
  // como en el web). El ancho de la píldora es explícito/animado, así que el label no lo reflowea; al
  // encogerse a burbuja el label rebasa simétrico pero ya está en opacity 0 (labelfade 260ms).
  pillLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  pillLabelText: {
    fontFamily: FONT.uiExtra,
    fontSize: 15,
    color: '#ffffff',
  },
  trail: {
    position: 'absolute',
    top: '100%',
    left: '50%',
    width: 6,
    marginLeft: -3,
    borderRadius: 3,
    overflow: 'hidden',
  },
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 48,
  },
  logoWrap: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  ring: {
    position: 'absolute',
    width: 128,
    height: 128,
    borderRadius: 64,
    borderWidth: 2,
  },
  logo: {
    width: 112,
    height: 112,
    borderRadius: 56,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.45,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 18 },
    elevation: 16,
  },
  // Logo ~72 dentro del círculo de 112 (contain): deja ~20px de anillo de marca alrededor (el logo
  // "respira", como el padding:20 del web). Centrado por el logo (alignItems/justifyContent: center).
  logoImg: { width: 72, height: 72 },
  logoInitial: { fontFamily: FONT.displayBlack, fontSize: 44, color: '#ffffff' },
  prep: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  // Pila de textos PREPARANDO/LISTO: el primero define el ancho (en flujo), el segundo se superpone.
  prepTextStack: { position: 'relative', justifyContent: 'center' },
  prepText: { fontFamily: FONT.uiExtra, fontSize: 11, letterSpacing: 2.86 },
  // "LISTO" superpuesto sobre "PREPARANDO…" (misma línea), anclado a la izquierda para crossfade en sitio.
  readyText: { position: 'absolute', left: 0, top: 0 },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  hintWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  // Prominente (tamaño/peso/contraste): al quedar listo es la llamada a la acción principal del Despegue.
  hintText: {
    fontFamily: FONT.uiExtra,
    fontSize: 13,
    letterSpacing: 2.2,
    color: 'rgba(255,255,255,0.92)',
  },
})
