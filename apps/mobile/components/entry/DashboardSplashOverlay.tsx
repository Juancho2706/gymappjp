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
  markSplashHandoffPainted,
  resolveSplashOverlayPhase,
  useDashboardReady,
  useEndSplashHandoff,
  useSplashHandoff,
  useSplashHandoffPainted,
  type SplashHandoff,
} from '../../context/DashboardReadyContext'
import { EntryGrain, EntrySource } from './EntryBackground'
import { ENTRY_LIGHT, LightLayer } from './LightLayer'
import {
  SPLASH_SLOW_MS,
  SplashCoachMark,
  SplashEvaMark,
  SplashMorphbar,
  splashCenterStyle,
  splashCoachSourceCenterY,
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
 *
 * RELEVO EN DOS TIEMPOS (video del owner 22-08: el logo quedaba vacio ~3 frames): monta
 * INVISIBLE (`revealed` 0) encima del gate, que sigue pintando debajo; cuando su copia del
 * logo ya esta en pantalla (`onDisplay`) —o al montar si no hay logo, o al vencer
 * `PAINT_SAFETY_MS`— marca `painted`, se destapa (pixel-identico a lo que tapa) y recien
 * entonces el gate navega. Remontar una `Image` de expo-image en Android cuesta 2-3
 * frames aunque este en cache de memoria: por eso no alcanza con montar en el mismo commit.
 */

/** Fade-out al soltar el dashboard. Misma curva que el crossfade de marca (§4 R2). */
const FADE_OUT_MS = 280
/** Tope de seguridad: pase lo que pase el splash se va. Espejo de `SLOW_GATE_MS`. */
const SAFETY_MS = 5000
/** Si el logo no avisa `onDisplay` (error de red, asset roto) el relevo sigue igual. */
const PAINT_SAFETY_MS = 350

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
  const painted = useSplashHandoffPainted()
  useEffect(() => {
    const timers = [setTimeout(() => setTimedOut(true), SAFETY_MS)]
    // Sin logo remoto no hay nada que esperar: el primer commit YA es el frame completo.
    // Con logo, `onDisplay` avisa; el tope cubre un asset roto o sin red.
    if (!handoff.mark?.logoUri) markSplashHandoffPainted()
    timers.push(setTimeout(markSplashHandoffPainted, PAINT_SAFETY_MS))
    if (!handoff.slow) timers.push(setTimeout(() => setSlow(true), SPLASH_SLOW_MS))
    // La firma EVA solo tiene sentido cuando la espera NO tiene marca de coach que mostrar.
    if (!handoff.mark && !handoff.signature) {
      timers.push(setTimeout(() => setSignature(true), SPLASH_SLOW_MS))
    }
    return () => timers.forEach(clearTimeout)
  }, [handoff])

  const phase = resolveSplashOverlayPhase({ handoff, ready, timedOut, suppressed })

  // `revealed` vive en el MISMO estilo animado que el fade: un `opacity` estatico en el root
  // lo pisaria la prop animada (Reanimated aplica sus props encima de los estilos planos).
  const revealed = useSharedValue(0)
  useEffect(() => {
    if (painted) revealed.value = 1
  }, [painted, revealed])
  const fade = useSharedValue(1)
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value * revealed.value }))
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
            {/* Mismo ancla que el gate: el centro optico del TILE del coach, no el de la
                figura EVA — la luz continua exactamente donde el gate la dejo. */}
            <EntrySource
              accent={mark.accent}
              heat={ENTRY_LIGHT.returnCoach.sourceHeat}
              cx={width / 2}
              cy={splashCoachSourceCenterY(height)}
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
          <SplashCoachMark mark={mark} onLogoDisplay={markSplashHandoffPainted} />
        ) : (
          <SplashEvaMark signature={signature} initialSignature={handoff.signature} reduced={reduced} />
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
