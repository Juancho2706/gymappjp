import { useEffect, useState } from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { EASE } from '../../lib/motion'
import { ENTRY_TOKENS } from '../../lib/theme'
import {
  resolveSplashOverlayPhase,
  useDashboardReady,
  useEndSplashHandoff,
  useSplashHandoff,
  type SplashHandoff,
} from '../../context/DashboardReadyContext'
import { EntryGrain, EntrySource } from './EntryBackground'
import { ENTRY_LIGHT, LightLayer } from './LightLayer'
import { splashClockNow } from './splash-sweep'
import {
  SPLASH_SLOW_MS,
  SplashCoachMark,
  SplashEvaMark,
  SplashMorphbar,
  splashCenterStyle,
  splashFigureCenterY,
} from './SplashBrand'

/**
 * DashboardSplashOverlay — el splash de marca ES el loader del dashboard (QA-5).
 *
 * Vive en `app/_layout.tsx` como HERMANO del `Stack` (mismo patron que `Toaster` y
 * `BiometricLock`), no dentro de una ruta: por eso sobrevive al `router.replace` que
 * desmontaba al `SplashGate` y dejaba ver el skeleton intermedio.
 *
 * NO tiene gate propio ni vuelve a leer sesion/branding: recibe del gate el estado visual
 * exacto del ultimo frame (`SplashHandoff`) y lo CONTINUA. La composicion es la misma pieza
 * (`SplashBrand`) en el mismo encuadre, asi que el relevo no repinta ni parpadea:
 *   - con marca de coach → capa `returnCoach` + marca del coach, ya al final del crossfade
 *     (el gate solo navega con el crossfade cerrado, §2.3);
 *   - sin marca → capa `splash` EVA + figura (+ firma si ya estaba).
 *
 * Solo arma en cold start CON sesion, porque su unico emisor es el camino del gate que
 * rutea a un dashboard. Sin sesion (selector, login, `pick=1`) y en cualquier navegacion
 * posterior (deep link, cambio de tab) el handoff nunca existe y esto es `null`.
 *
 * Se retira cuando la home marca `ready` — su PRIMER load resuelto, con datos o con
 * error— o al vencer el tope de seguridad. El splash nunca puede tapar un estado terminal.
 */

/** Fade-out al soltar el dashboard. Misma curva que el crossfade de marca (§4 R2). */
const FADE_OUT_MS = 280
/** Tope de seguridad: pase lo que pase el splash se va. Espejo de `SLOW_GATE_MS`. */
const SAFETY_MS = 5000

export interface DashboardSplashOverlayProps {
  /**
   * Hay otra pantalla de arranque que reclama la interaccion (hoy: el bloqueo biometrico).
   * El overlay se retira: taparla dejaria al usuario mirando una marca muerta hasta el tope.
   */
  suppressed?: boolean
}

export function DashboardSplashOverlay({ suppressed = false }: DashboardSplashOverlayProps) {
  const handoff = useSplashHandoff()
  if (!handoff) return null
  return <SplashOverlay handoff={handoff} suppressed={suppressed} />
}

function SplashOverlay({ handoff, suppressed }: { handoff: SplashHandoff; suppressed: boolean }) {
  const reduced = useReducedMotion()
  const { width, height } = useWindowDimensions()
  const { ready } = useDashboardReady()
  const endHandoff = useEndSplashHandoff()
  const [timedOut, setTimedOut] = useState(false)
  // El gate ya podia traer el morphbar y la firma en pantalla: se heredan tal cual y, si
  // no estaban, aparecen con el MISMO umbral (§4 S4/S2) contado desde este montaje.
  const [slow, setSlow] = useState(handoff.slow)
  const [signature, setSignature] = useState(handoff.signature)
  // Origen del sweep «Glide». Espejo del cinturon del gate: si el handoff llegara sin
  // semilla en la rama EVA (`null`), el reloj se quedaria en 0 y la figura viviria FUERA de
  // cuadro hasta el tope de 5 s — un splash sin marca. Con el fallback, el peor caso es que
  // la escena arranque de cero aca. Se calcula una sola vez (inicializador perezoso): leer
  // el reloj en cada render moveria el origen y el barrido nunca avanzaria.
  const [sweepStartedAt] = useState(() => handoff.sweepStartedAt ?? splashClockNow())

  useEffect(() => {
    const timers = [setTimeout(() => setTimedOut(true), SAFETY_MS)]
    if (!handoff.slow) timers.push(setTimeout(() => setSlow(true), SPLASH_SLOW_MS))
    // La firma EVA solo tiene sentido cuando la espera NO tiene marca de coach que mostrar.
    if (!handoff.mark && !handoff.signature) {
      timers.push(setTimeout(() => setSignature(true), SPLASH_SLOW_MS))
    }
    return () => timers.forEach(clearTimeout)
  }, [handoff])

  const phase = resolveSplashOverlayPhase({ handoff, ready, timedOut, suppressed })

  const fade = useSharedValue(1)
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }))
  useEffect(() => {
    if (phase !== 'dismissing') return
    // reduce-motion: corte limpio, sin fade (§4 R2).
    if (reduced) {
      endHandoff()
      return
    }
    fade.value = withTiming(0, { duration: FADE_OUT_MS, easing: EASE.standard })
    const timer = setTimeout(endHandoff, FADE_OUT_MS)
    return () => {
      clearTimeout(timer)
      cancelAnimation(fade)
    }
  }, [endHandoff, fade, phase, reduced])

  // §4 S3 — respiracion del halo: 1 solo nodo, solo `opacity`. Arranca en la opacidad EXACTA
  // que tenia el gate (`handoff.halo`), asi la luz no da un salto de brillo en el relevo.
  const halo = useSharedValue(handoff.halo)
  useEffect(() => {
    if (reduced) return
    halo.value = withRepeat(withTiming(0.95, { duration: 2800, easing: EASE.inOut }), -1, true)
    return () => cancelAnimation(halo)
  }, [halo, reduced])
  const haloStyle = useAnimatedStyle(() => ({ opacity: halo.value }))

  const mark = handoff.mark
  // El halo se ancla al centro OPTICO de la figura, el MISMO que uso el gate (§1.4).
  const figureCenterY = splashFigureCenterY(height)

  return (
    // Bloquea el toque mientras esta arriba: debajo hay un dashboard a medio pintar.
    <Animated.View style={[styles.root, fadeStyle]} testID="dashboard-splash-overlay">
      {mark ? (
        <>
          <LightLayer spec={ENTRY_LIGHT.returnCoach} accent={mark.accent} />
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, haloStyle]}>
            <EntrySource
              accent={mark.accent}
              heat={ENTRY_LIGHT.returnCoach.sourceHeat}
              cx={width / 2}
              cy={figureCenterY}
            />
          </Animated.View>
        </>
      ) : (
        <>
          <LightLayer spec={ENTRY_LIGHT.splash} />
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, haloStyle]}>
            <EntrySource heat={ENTRY_LIGHT.splash.sourceHeat} cx={width / 2} cy={figureCenterY} />
          </Animated.View>
        </>
      )}

      {/* Capa 4 — el sello. UNA sola, blanca en los dos estados. */}
      <EntryGrain />

      <View pointerEvents="none" style={splashCenterStyle}>
        {mark ? (
          <SplashCoachMark mark={mark} />
        ) : (
          <SplashEvaMark
            signature={signature}
            initialSignature={handoff.signature}
            reduced={reduced}
            // El sweep «Glide» se CONTINUA, no se relanza: el overlay hereda el instante 0
            // del gate y calcula su propio `elapsed` al montar. Sin esto la figura volveria
            // a salir volando por la izquierda justo cuando el gate ya la habia asentado.
            sweepStartedAt={sweepStartedAt}
          />
        )}
      </View>

      {slow ? <SplashMorphbar reduced={reduced} /> : null}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: ENTRY_TOKENS.canvasEntry,
    // Android dibuja por elevacion ANTES que por orden de arbol: sin esto, cualquier card
    // elevada del dashboard de abajo asomaria por encima del splash.
    elevation: 24,
    zIndex: 24,
  },
})
