import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Dimensions, Modal, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { useTheme } from '../../../../context/ThemeContext'
import { hexToRgba } from '../../../../lib/theme'
import { FONT } from '../../../../lib/typography'
import { resolveExecTheme, type ExecTheme } from './exec-theme'

/**
 * Espejo RN del "morph Impulso" (feature QA6, coreografía del jefe) — la transición del tap en
 * "Empezar entrenamiento" / day-card hacia el ejecutor V3. Reproduce la coreografía del contrato:
 *  (2) un clon del rect del trigger, con el color de MARCA del coach, se expande a pantalla completa
 *      (radius→0) en ~480ms con cubic-bezier(.22,1,.36,1);
 *  (3) desde ~300ms el sólido de marca cross-fadea al tono SPLASH (la misma fórmula del SessionIntro:
 *      radial de acento 0.52 sobre appBgSplash) y el logo del coach aparece al centro escalando 0.6→1
 *      hasta un círculo ~116px en la posición del avatar del splash;
 *  (4) si la carga tarda, "PREPARANDO TU SESIÓN" entra con fade a los ~900ms;
 *  (5) el router.push dispara al inicio de la fase 2 — el overlay vive en un `Modal` NATIVO que flota
 *      sobre la transición de navegación, y al desmontarse deja ver el SessionIntro SSR del ejecutor
 *      (handoff invisible: mismo fondo + mismo avatar).
 *
 * DELTA vs. web (anotado por contrato): el rect-morph exacto por-trigger es frágil en RN (medir cada
 * botón anidado), así que sólo los CTA "Empezar entrenamiento" (home/entreno) miden su rect real; las
 * day-cards caen a la versión digna simplificada — un origen sintético centrado-bajo (radial desde el
 * centro del CTA) con los MISMOS tiempos/curvas. La fase 1 (fade del texto del trigger + scale 1.02) se
 * omite: el overlay abre directo en fase 2. `prefers-reduced-motion` ⇒ crossfade simple sin expansión.
 *
 * Motor de guardado / navegación de destino: INTOCABLE. Esto es sólo presentación de la transición.
 */

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window')

// Tiempos de la coreografía (contrato).
const EXPAND_MS = 480
const CROSSFADE_DELAY = 300
const CROSSFADE_MS = 300
const PREP_DELAY = 900
const PREP_MS = 400
const NAV_AT_MS = 140 // router.push al inicio de la fase 2
const DISMISS_AT_MS = 820 // el destino ya montó su SessionIntro bajo el Modal → fade-out
const DISMISS_FADE_MS = 220
const SAFETY_MS = 2400 // red de seguridad: jamás dejar el overlay pegado

// Curva del contrato para la expansión del rect.
const EASE_MORPH = Easing.bezier(0.22, 1, 0.36, 1)

/** Rect del trigger en coordenadas de ventana (measureInWindow). */
export interface MorphOrigin {
  x: number
  y: number
  width: number
  height: number
  /** Radio de esquina del trigger (para arrancar el clon con el mismo border-radius). */
  radius?: number
}

interface StartMorphArgs {
  planId: string
  /** Rect medido del trigger; si falta, se sintetiza un origen centrado-bajo (day-cards). */
  origin?: MorphOrigin | null
  /** Params extra de la ruta (recuperar/fecha). */
  params?: Record<string, string>
}

interface SessionMorphContextValue {
  startMorph: (args: StartMorphArgs) => void
}

const SessionMorphContext = createContext<SessionMorphContextValue | null>(null)

/** Origen sintético (fallback): un rect chico en el centro-bajo, donde suelen vivir los CTA. */
function centeredOrigin(): MorphOrigin {
  const w = 96
  const h = 52
  return { x: SCREEN_W / 2 - w / 2, y: SCREEN_H * 0.6, width: w, height: h, radius: 16 }
}

interface ActiveMorph {
  nonce: number
  planId: string
  origin: MorphOrigin
  params?: Record<string, string>
}

export function SessionMorphProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const { theme, branding } = useTheme()
  const reducedMotion = useReducedMotion()
  const [active, setActive] = useState<ActiveMorph | null>(null)
  const busyRef = useRef(false)

  const exec = useMemo(
    () => resolveExecTheme(branding?.executorTheme, theme.primary, theme.primaryForeground),
    [branding?.executorTheme, theme.primary, theme.primaryForeground],
  )
  // El MISMO logo/inicial que mostrará el SessionIntro del ejecutor (ExecutorV3): handoff exacto.
  const coachLogoUrl = branding?.logoUrl ?? null
  const coachInitial = ((branding?.displayName?.trim() || 'Tu coach')[0] ?? 'E').toUpperCase()

  const startMorph = useCallback(
    ({ planId, origin, params }: StartMorphArgs) => {
      // Guard anti doble-tap: ignora taps mientras un morph está en vuelo.
      if (busyRef.current) return
      busyRef.current = true
      setActive({ nonce: Date.now(), planId, origin: origin ?? centeredOrigin(), params })
    },
    [],
  )

  const navigate = useCallback(() => {
    if (!active) return
    try {
      if (active.params && Object.keys(active.params).length > 0) {
        router.push({ pathname: '/alumno/workout/[planId]', params: { planId: active.planId, ...active.params } })
      } else {
        router.push(`/alumno/workout/${active.planId}`)
      }
    } catch {
      // Error de navegación: cierra el overlay (el guard se libera en onDone) — sin dejar al usuario pegado.
      setActive(null)
      busyRef.current = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, router])

  const handleDone = useCallback(() => {
    setActive(null)
    busyRef.current = false
  }, [])

  const value = useMemo(() => ({ startMorph }), [startMorph])

  return (
    <SessionMorphContext.Provider value={value}>
      {children}
      {active && (
        <SessionMorphOverlay
          key={active.nonce}
          exec={exec}
          coachLogoUrl={coachLogoUrl}
          coachInitial={coachInitial}
          origin={active.origin}
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
 * Helper para triggers: mide el rect en ventana de un `View` (ref) y llama `cb` con el origen. Si la
 * medición falla, llama `cb(null)` → el overlay usa el origen sintético centrado.
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

function SessionMorphOverlay({
  exec,
  coachLogoUrl,
  coachInitial,
  origin,
  reducedMotion,
  onNavigate,
  onDone,
}: {
  exec: ExecTheme
  coachLogoUrl: string | null
  coachInitial: string
  origin: MorphOrigin
  reducedMotion: boolean
  onNavigate: () => void
  onDone: () => void
}) {
  const s = exec.surface
  const originRadius = origin.radius ?? 16

  // Progreso de expansión del clon (rect → pantalla completa).
  const expand = useSharedValue(reducedMotion ? 1 : 0)
  // Crossfade del sólido de marca → tono splash.
  const splash = useSharedValue(reducedMotion ? 1 : 0)
  // Aparición del avatar (escala 0.6→1 + opacidad).
  const logo = useSharedValue(reducedMotion ? 1 : 0)
  // "PREPARANDO TU SESIÓN".
  const prep = useSharedValue(0)
  // Fade-out global del overlay para el handoff.
  const fade = useSharedValue(1)

  // Arranca la coreografía + programa navegación/handoff UNA vez, al montar el Modal. Callbacks vía ref
  // para no re-disparar el efecto si cambian de identidad.
  const navRef = useRef(onNavigate)
  const doneRef = useRef(onDone)
  navRef.current = onNavigate
  doneRef.current = onDone

  useEffect(() => {
    if (reducedMotion) {
      // Reduced-motion: crossfade simple, sin expansión ni escala.
      expand.value = 1
      splash.value = withTiming(1, { duration: 180 })
      logo.value = 1
    } else {
      expand.value = withTiming(1, { duration: EXPAND_MS, easing: EASE_MORPH })
      splash.value = withDelay(CROSSFADE_DELAY, withTiming(1, { duration: CROSSFADE_MS }))
      logo.value = withDelay(CROSSFADE_DELAY, withTiming(1, { duration: 420, easing: EASE_MORPH }))
      prep.value = withDelay(PREP_DELAY, withTiming(1, { duration: PREP_MS }))
    }

    const navDelay = reducedMotion ? 60 : NAV_AT_MS
    const dismissAt = reducedMotion ? 520 : DISMISS_AT_MS
    const timers: ReturnType<typeof setTimeout>[] = []
    // (5) router.push al inicio de la fase 2 — la navegación ocurre BAJO el Modal nativo.
    timers.push(setTimeout(() => navRef.current(), navDelay))
    timers.push(
      setTimeout(() => {
        // Fade-out del overlay → deja ver el SessionIntro del ejecutor ya montado debajo (handoff).
        fade.value = withTiming(0, { duration: DISMISS_FADE_MS }, (finished) => {
          if (finished) runOnJS(doneRef.current)()
        })
      }, dismissAt),
    )
    // Red de seguridad: si algo se atasca, desmonta igual.
    timers.push(setTimeout(() => doneRef.current(), SAFETY_MS))
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const cloneStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    left: interpolate(expand.value, [0, 1], [origin.x, 0]),
    top: interpolate(expand.value, [0, 1], [origin.y, 0]),
    width: interpolate(expand.value, [0, 1], [origin.width, SCREEN_W]),
    height: interpolate(expand.value, [0, 1], [origin.height, SCREEN_H]),
    borderRadius: interpolate(expand.value, [0, 1], [originRadius, 0]),
    backgroundColor: exec.accent,
    overflow: 'hidden',
  }))

  const splashStyle = useAnimatedStyle(() => ({ opacity: splash.value }))
  const logoWrapStyle = useAnimatedStyle(() => ({
    opacity: logo.value,
    transform: [{ scale: interpolate(logo.value, [0, 1], [0.6, 1]) }],
  }))
  const prepStyle = useAnimatedStyle(() => ({ opacity: prep.value }))
  const rootStyle = useAnimatedStyle(() => ({ opacity: fade.value }))

  return (
    <Modal transparent statusBarTranslucent animationType="none" visible onRequestClose={() => {}}>
      <Animated.View style={[StyleSheet.absoluteFill, rootStyle]} pointerEvents="none">
        {/* (2) Clon de marca que se expande desde el rect del trigger a pantalla completa. */}
        <Animated.View style={cloneStyle} />

        {/* (3) Tono SPLASH — misma fórmula que SessionIntro: base appBgSplash + radial de acento fake por
            capas. Crossfadea sobre el sólido de marca desde ~300ms. */}
        <Animated.View style={[StyleSheet.absoluteFill, splashStyle]}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: s.appBgSplash }]} />
          <LinearGradient
            colors={[hexToRgba(exec.accent, 0.52), hexToRgba(exec.accent, 0.12), s.appBgSplash]}
            locations={[0, 0.44, 1]}
            start={{ x: 0.5, y: -0.05 }}
            end={{ x: 0.5, y: 0.9 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>

        {/* Avatar del coach + "PREPARANDO" — centrados en la POSICIÓN del avatar del splash. */}
        <View style={styles.centerCol} pointerEvents="none">
          <Animated.View style={[styles.avatar, logoWrapStyle]}>
            {coachLogoUrl ? (
              <Image source={{ uri: coachLogoUrl }} alt="Logo del coach" style={{ width: '100%', height: '100%' }} contentFit="cover" />
            ) : (
              <LinearGradient
                colors={[exec.accent, hexToRgba(exec.accent, 0.5)]}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontFamily: FONT.displayBlack, fontSize: 42, letterSpacing: -1, color: exec.accentText }}>
                  {coachInitial}
                </Text>
              </LinearGradient>
            )}
          </Animated.View>

          <Animated.Text
            style={[
              {
                fontFamily: FONT.uiExtra,
                fontSize: 11,
                letterSpacing: 1.76, // .16em @ 11px
                textTransform: 'uppercase',
                color: hexToRgba(s.text, 0.75),
              },
              prepStyle,
            ]}
          >
            Preparando tu sesión
          </Animated.Text>
        </View>
      </Animated.View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  centerCol: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  avatar: {
    width: 116,
    height: 116,
    borderRadius: 58,
    overflow: 'hidden',
  },
})
