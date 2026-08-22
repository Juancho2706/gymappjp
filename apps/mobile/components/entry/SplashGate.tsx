import { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { ENTRY_TOKENS, isCoachBrandingPresentationAllowed, resolveEffectiveCoachBrandTheme } from '../../lib/theme'
import { useTheme } from '../../context/ThemeContext'
import { EASE } from '../../lib/motion'
import { loadStoredBranding, type CoachBranding } from '../../lib/branding'
import { supabase } from '../../lib/supabase'
import { getCoachProfile } from '../../lib/coach'
import { beginSplashHandoff, type SplashBrandMark } from '../../context/DashboardReadyContext'
import { splashClockNow } from './splash-clock'
import { ENTRY_ACCENT, EntryGrain, EntrySource, entrySolidHex } from './EntryBackground'
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
 * SplashGate — frames 01 y 06 de la entrada dark v1.
 * Normativa: `docs/specs/entrada-dark-v1/DESIGN-SPEC.md` §1-§4.
 *
 * Es la replica JS del splash nativo Y el gate de sesion, en la misma pieza. Con sesion
 * viva NO hay selector ni pantalla de valor: la fase `checking` **es** el splash (§3.6).
 * Sustituye al `EvaLoaderScreen` "Preparando EVA…", que montaba dos `AppBackground`
 * Skia apilados en el peor momento del cold start (auditoria a1 §2.3).
 *
 * Composicion (§2.3, 4 nodos + crosshatch compartido):
 *   0 canvas `#07080C` — NO participa del crossfade: es identico en ambos estados, y por
 *     eso el cambio de marca se lee como reconocimiento y no como cambio de app.
 *   1 LightLayer EVA + su fuente puntual (respira)      → opacity 1→0
 *   2 LightLayer COACH + su fuente puntual              → opacity 0→1
 *   3 Marca EVA (figura + hairline + wordmark)          → opacity 1→0
 *   4 Marca COACH (logo/tile + nombre + saludo)         → opacity 0→1 + scale .955→1
 *   + crosshatch UNO solo, encima de las dos atmosferas, jamas cruzado.
 *
 * Timeline del retorno branded (§2.3, t0 = montaje de la replica):
 *   t0 hold de continuidad 120 ms · t0+120 crossfade 260 ms simultaneo (luz + marca)
 *   · el `router.replace` sale cuando el gate tiene target Y el crossfade cerro. Marca y
 *   destino se deciden en la MISMA continuacion (las dos esperan `getCoachProfile()`), asi
 *   que con marca permitida el cruce corre siempre: son ≤ 380 ms y es justo lo que el
 *   owner espera ver («EVA y luego mi marca»). Sin marca el destino navega en el acto.
 *
 * BUG 22-08 (owner: «el splash sigue siendo el de EVA» con marca cacheada y valida): el
 * hold de 120 ms se media desde t0, pero la marca recien se decide DESPUES de la red
 * (`getCoachProfile`, 200-800 ms) ⇒ la espera restante era siempre 0 y la marca entraba por
 * un `setTimeout(0)` mientras `setTarget` salia sincrono en la misma continuacion. React
 * pintaba primero el render con destino-y-sin-marca, el efecto de navegacion disparaba el
 * handoff con `mark: null` y marcaba `routed` — el timer llegaba tarde y se descartaba. El
 * crossfade nunca corria; el overlay del dashboard continuaba la firma EVA. Ahora: hold ya
 * vencido ⇒ `setBranded` SINCRONO (mismo batch que `setTarget`); hold pendiente ⇒ el efecto
 * de navegacion espera la marca (`pendingMark`) antes de salir.
 *
 * UNA sola identidad despues del splash nativo (QA-3 del owner: "veo 3 splashes"). La
 * firma EVA (hairline + wordmark) NO se monta por defecto: solo aparece cuando el veredicto
 * del gate dice que NO habra marca de coach —o cuando el propio gate se hace lento y la
 * espera se queda sin marca que mostrar—. Con branding cacheado el usuario ve figura nativa
 * → misma figura en JS → marca del coach, sin pantalla EVA intermedia. El veredicto de
 * MARCA no espera el select a `coaches` cuando no hay nada que validar: sin branding
 * guardado (el caso comun — coaches EVA y sus alumnos) sesion+AsyncStorage deciden y la
 * firma EVA aparece con su fade sin esperar los 600 ms del umbral lento. Solo la
 * validacion del branding cacheado (¿es MI marca? ¿su tier la permite?) espera a
 * `getCoachProfile()`; el destino siempre lo espera.
 *
 * QUIETUD (decision del dueno, 19-08): la coreografia «Glide» fue RETIRADA — la figura no
 * anima jamas, en ninguna rama. Vive a 180 pt (= `imageWidth` del splash nativo) en el
 * centro exacto de la pantalla, y toda la vida del arranque pasa alrededor de ella: firma
 * con fade, halo que respira, morphbar, y el crossfade branded. Ver `SplashBrand` §3.1.
 *
 * Cero red en el arranque: `loadStoredBranding()` lee AsyncStorage. Cache frio o tier sin
 * white-label (`isCoachBrandingPresentationAllowed`, gate real fuera de la UI) → capa EVA
 * y listo; el crossfade es una mejora, jamas un requisito para navegar.
 *
 * QUIEN LLENA ESA CACHE (importa para leer el sintoma "no me cambia a mi marca"):
 * `bootstrapOwnCoachBranding` cuando el COACH entra a su panel, `refreshClientCoachBranding`
 * cuando el ALUMNO entra al suyo, y el Guardar de Mi Marca. Consecuencia por diseño: el
 * PRIMER arranque despues de instalar o de cambiar de cuenta todavia no tiene nada guardado
 * ⇒ splash EVA puro. Desde el segundo cold start ya cruza a la marca. Tampoco cruza si el
 * coach apago «usar mis colores en mi panel» (`use_brand_colors_coach = false`: el bootstrap
 * limpia la cache a proposito) ni si la marca cacheada es de OTRO coach de este device.
 *
 * QA-5 — el gate ya NO es el ultimo frame de marca: con sesion viva publica su estado visual
 * exacto (`beginSplashHandoff`) ANTES del `router.replace`, y el `DashboardSplashOverlay` de
 * la raiz continua la MISMA composicion hasta que la home termina de cargar. La marca deja de
 * desmontarse en la navegacion (era lo que descubria el skeleton intermedio). El flujo SIN
 * sesion no cambia en nada: `onAnonymous` jamas toca el handoff.
 */

/** Hold de continuidad antes del crossfade (§2.3 / §4 R1). */
const HOLD_MS = 120
/** Crossfade de marca y luz, simultaneo y con la misma curva (§4 R2/R3). */
const XFADE_MS = 260
/** Variante reduce-motion: fade unico directo a la marca del coach, sin scale (§4 R2). */
const XFADE_REDUCED_MS = 160
/** El indicador de progreso solo se monta si el gate supera este umbral (§4 S4). */
const SLOW_GATE_MS = SPLASH_SLOW_MS

export interface SplashGateResult {
  /** Branding cacheado leido por el gate (AsyncStorage). El padre decide que hacer con el. */
  branding: CoachBranding | null
  /** El gate fallo (sin sesion utilizable). El padre cae a su ruta de escape. */
  failed?: boolean
}

/** Destino del retorno con sesion viva. */
type GateTarget = '/coach/home' | '/alumno/home'

export interface SplashGateProps {
  /**
   * Se llama SOLO cuando no hay sesion (o el gate fallo). Con sesion el gate navega el
   * mismo, porque el retorno branded tiene que correr ANTES del `router.replace`.
   */
  onAnonymous: (result: SplashGateResult) => void
  /**
   * El usuario pidio el selector a proposito (`/?pick=1`, escape "cambiar de cuenta" del
   * login). Con sesion viva el gate NO puede secuestrar la entrada: devuelve el control al
   * padre igual que si fuera anonimo, si no es imposible entrar con el otro rol.
   */
  forceSelector?: boolean
}

export function SplashGate({ onAnonymous, forceSelector = false }: SplashGateProps) {
  const router = useRouter()
  const reduced = useReducedMotion()
  const { width, height } = useWindowDimensions()
  const { setBranding } = useTheme()

  const [branded, setBranded] = useState<SplashBrandMark | null>(null)
  const [target, setTarget] = useState<GateTarget | null>(null)
  /** La firma EVA solo se monta si esta espera NO va a terminar en marca de coach. */
  const [evaSignature, setEvaSignature] = useState(false)
  const [slow, setSlow] = useState(false)
  const routed = useRef(false)
  const splashHidden = useRef(false)
  const t0 = useRef(splashClockNow())
  /** El gate ya sabe si habra marca de coach (aunque todavia no sepa el destino). */
  const decided = useRef(false)
  /** Hay una marca de coach programada (hold de continuidad en curso): navegar la esperaria. */
  const pendingMark = useRef(false)

  // El contenido se centra sobre el centro de la PANTALLA, no del body (§3.1): el splash
  // nativo centra en la ventana completa y la diferencia de ~8 pt se ve en el handoff.
  // El halo se ancla al centro OPTICO de la figura, no al del stack (§1.4).
  const figureCenterY = splashFigureCenterY(height)

  const navigate = useCallback(
    (to: GateTarget) => {
      if (routed.current) return
      routed.current = true
      router.replace(to)
    },
    [router],
  )

  // El gate corre UNA sola vez (deps `[]` reales). Los callbacks viajan por ref para que
  // un cambio de identidad del padre no reinicie `getSession()` ni corte el crossfade.
  const navigateRef = useRef(navigate)
  const onAnonymousRef = useRef(onAnonymous)
  useEffect(() => {
    navigateRef.current = navigate
    onAnonymousRef.current = onAnonymous
  }, [navigate, onAnonymous])

  // Bait-and-switch: el splash nativo se oculta recien cuando la replica JS ya tiene
  // layout. Android no tiene crossfade nativo, asi que la continuidad se fabrica con el
  // mismo color y la misma figura en la misma posicion: 180 pt (= `imageWidth` nativo) en
  // el centro real de la pantalla, quieta — la replica ES el nativo, pixel a pixel.
  const hideNativeSplash = useCallback(() => {
    if (splashHidden.current) return
    splashHidden.current = true
    void SplashScreen.hideAsync().catch(() => {
      splashHidden.current = false
    })
  }, [])

  // Gate: sesion y branding en PARALELO (§2.4, cero red).
  useEffect(() => {
    let active = true
    const timers: ReturnType<typeof setTimeout>[] = []

    timers.push(
      setTimeout(() => {
        if (!active) return
        setSlow(true)
        // Sin veredicto a los 600 ms la espera se quedo sin marca que mostrar: recien ahi
        // aparece la firma EVA. En el camino branded NUNCA se monta.
        if (!decided.current) setEvaSignature(true)
      }, SLOW_GATE_MS),
    )

    void (async () => {
      try {
        // ORDEN DE CREACION deliberado (revision adversarial 19-08): `getSession()` se
        // invoca ANTES que `getCoachProfile()`. Ambas pasan por el lock reentrante de
        // auth-js y las continuaciones se atienden en orden de llegada: si `getUser()` (la
        // primera sentencia de getCoachProfile) tomara el lock primero, `getSession()`
        // —una lectura local— quedaria encolada DETRAS de su round-trip de red y el
        // veredicto "temprano" resolveria a velocidad de red, que es exactamente lo que
        // este split quiere evitar.
        const sessionPromise = supabase.auth.getSession()
        // La consulta de RED arranca ya —define el destino y valida el branding cacheado—
        // pero NO gatea el veredicto de marca cuando no hay nada que validar (abajo). El
        // `.catch` neutraliza el unhandled rejection si esta funcion retorna temprano
        // (rama anonima / forceSelector / desmontaje) sin llegar a su `await`; el `await`
        // de abajo recibe el rechazo igual y cae en el catch del gate, como siempre.
        const coachPromise = getCoachProfile()
        coachPromise.catch(() => {})
        const [sessionResult, storedBranding] = await Promise.all([
          sessionPromise,
          loadStoredBranding(),
        ])
        if (!active || routed.current) return

        const session = sessionResult.data.session
        if (!session || forceSelector) {
          decided.current = true
          setEvaSignature(true)
          onAnonymousRef.current({ branding: storedBranding })
          return
        }

        // Veredicto TEMPRANO: sin branding guardado NO hay marca de coach posible —
        // `currentBranding` da null por sus dos ramas— asi que la espera es de EVA y lo
        // dice YA, sin pagar el select a `coaches`: la firma aparece con su fade a los
        // ~100-150 ms en vez de esperar el umbral lento de 600.
        if (!storedBranding) {
          decided.current = true
          setEvaSignature(true)
        }

        const ownCoach = await coachPromise
        if (!active || routed.current) return

        // La cache conserva los assets, pero el tier actual del coach decide si se presentan.
        // También evitamos reutilizar la marca de otro coach guardada en el device.
        const sameCoachBranding = ownCoach && storedBranding?.coachId === ownCoach.id
        const currentBranding = sameCoachBranding && storedBranding
          ? { ...storedBranding, subscriptionTier: ownCoach.subscriptionTier }
          : ownCoach
            ? null
            : storedBranding
        const allowed = currentBranding && isCoachBrandingPresentationAllowed(currentBranding)
        decided.current = true

        // El provider recibe el mismo veredicto antes de navegar: Free queda neutralizado
        // por resolveEffectiveCoachBrandPresentation, sin un frame personalizado stale.
        if (ownCoach) setBranding(currentBranding)

        if (allowed && currentBranding) {
          const metadata = session.user.user_metadata as { full_name?: string; name?: string } | undefined
          // El acento se resuelve con el MISMO motor que el tema de la app
          // (`resolveEffectiveCoachBrandTheme`): materializa el tema PRESET antes de leer el
          // color. Leer `primaryColor` crudo de la cache era un bug de white-label — el editor
          // de Mi Marca guarda el preset en `theme_preset_key` y deja `primary_color` como
          // estaba, asi que una marca rosa entraba al splash pintada de azul EVA.
          const effective = resolveEffectiveCoachBrandTheme(currentBranding)
          const mark: SplashBrandMark = {
            // Orden de resolucion del ACENTO (§2.4): accentDark → primaryColor → azul EVA.
            accent: entrySolidHex(effective.accentDark ?? effective.brandColor, ENTRY_ACCENT),
            displayName: currentBranding.displayName,
            greetingName: firstName(metadata?.full_name ?? metadata?.name ?? null),
            // Orden de resolucion de la MARCA (§2.4): logoUrlDark → logoUrl → tile de iniciales.
            logoUri: currentBranding.logoUrlDark ?? currentBranding.logoUrl ?? null,
          }
          // El hold de continuidad se respeta aunque todo conteste en 40 ms (§4 R1): el
          // crossfade nunca arranca antes de t0+120. Pero si el hold YA vencio (lo normal:
          // la red tardo mas que eso) la marca entra SINCRONA, en el mismo batch que el
          // `setTarget` de abajo — un `setTimeout(0)` aqui perdia la carrera contra el render
          // que navega (ver cabecera, BUG 22-08).
          const holdLeft = Math.max(0, HOLD_MS - (splashClockNow() - t0.current))
          if (holdLeft === 0) {
            setBranded(mark)
          } else {
            pendingMark.current = true
            timers.push(
              setTimeout(() => {
                pendingMark.current = false
                if (active && !routed.current) setBranded(mark)
              }, holdLeft),
            )
          }
        } else {
          // No hay marca de coach que mostrar: la espera es de EVA y lo dice.
          setEvaSignature(true)
        }

        // El destino si espero a la red (`getCoachProfile` define el rol), pero la marca ya
        // quedo lanzada arriba: ni el crossfade ni la firma dependen de este `setTarget`.
        setTarget(ownCoach ? '/coach/home' : '/alumno/home')
      } catch {
        if (active && !routed.current) onAnonymousRef.current({ branding: null, failed: true })
      }
    })()

    return () => {
      active = false
      timers.forEach(clearTimeout)
    }
  }, [forceSelector])

  // Crossfade del retorno branded. Arranca con la capa coach YA montada (por eso depende
  // del estado, no de un rAF): animar un nodo que aun no existe cuesta un frame vacio.
  const xfade = useSharedValue(0)
  const [xfadeDone, setXfadeDone] = useState(false)
  useEffect(() => {
    if (!branded) return
    const duration = reduced ? XFADE_REDUCED_MS : XFADE_MS
    xfade.value = withTiming(1, { duration, easing: EASE.standard })
    const timer = setTimeout(() => setXfadeDone(true), duration)
    return () => {
      clearTimeout(timer)
      cancelAnimation(xfade)
    }
  }, [branded, reduced, xfade])

  // §4 S3 — respiracion del halo: 1 solo nodo, solo `opacity`.
  const halo = useSharedValue(reduced ? 0.7 : 0.55)
  useEffect(() => {
    if (reduced) {
      halo.value = 0.7
      return
    }
    halo.value = withRepeat(withTiming(0.95, { duration: 2800, easing: EASE.inOut }), -1, true)
    return () => cancelAnimation(halo)
  }, [halo, reduced])

  // Navegar = tener destino. El crossfade RETIENE la salida mientras corre (cortarlo a la
  // mitad se lee como parpadeo de marca) y una marca programada (hold pendiente, ≤ 120 ms)
  // tambien: navegar antes la perderia para siempre (el overlay raiz hereda `mark: null`).
  // Sin marca decidida no hay nada que esperar y se sale en el acto.
  //
  // QA-5 — el handoff sale en la MISMA tanda que el `replace`: el overlay raiz monta con la
  // identidad de este frame (marca, firma, morphbar y la opacidad viva del halo) antes de que
  // el desmontaje del gate descubra nada. `beginSplashHandoff` es de un disparo, asi que
  // re-ejecutar este efecto (p.ej. cuando `slow` cambia) no lo repite.
  useEffect(() => {
    if (!target) return
    if (pendingMark.current) return
    if (branded && !xfadeDone) return
    beginSplashHandoff({
      mark: branded,
      signature: evaSignature,
      slow,
      halo: halo.value,
    })
    navigateRef.current(target)
  }, [branded, evaSignature, halo, slow, target, xfadeDone])

  const evaStyle = useAnimatedStyle(() => ({ opacity: 1 - xfade.value }))
  const coachStyle = useAnimatedStyle(() => ({ opacity: xfade.value }))
  const coachMarkStyle = useAnimatedStyle(() => ({
    opacity: xfade.value,
    transform: reduced ? [] : [{ scale: 0.955 + 0.045 * xfade.value }],
  }))
  // La respiracion y el crossfade se MULTIPLICAN en un solo `opacity`: apilarlos como dos
  // estilos separados haria que el ultimo pisara al otro (RN no compone opacidades de
  // estilo) y el halo de EVA se quedaria encendido durante el cruce.
  const evaHaloStyle = useAnimatedStyle(() => ({ opacity: (1 - xfade.value) * halo.value }))
  const coachHaloStyle = useAnimatedStyle(() => ({ opacity: xfade.value * halo.value }))

  return (
    <View style={styles.root} onLayout={hideNativeSplash} testID="splash-gate">
      {/* Capas 1-2 EVA. Se queda en la fila `splash` (frame 01) tambien durante el retorno:
          la diferencia con la fila `returnEva` es de 0.009 de alpha —imperceptible— y
          cambiarla en vuelo obligaria a una interpolacion A1 en el peor frame del arranque. */}
      <LightLayer spec={ENTRY_LIGHT.splash} style={evaStyle} />
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, evaHaloStyle]}>
        <EntrySource heat={ENTRY_LIGHT.splash.sourceHeat} cx={width / 2} cy={figureCenterY} />
      </Animated.View>

      {branded ? (
        <>
          <LightLayer spec={ENTRY_LIGHT.returnCoach} accent={branded.accent} style={coachStyle} />
          <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, coachHaloStyle]}>
            {/* El halo del coach ancla al centro optico del TILE (h/2 − 31), no al de la
                figura EVA (h/2): con el ancla comun la luz quedaba debajo del logo tras el
                cruce (revision adversarial 19-08). Los 31 pt de diferencia entre canales se
                funden en el crossfade — es una fuente difusa de 460 pt, no un punto. */}
            <EntrySource
              accent={branded.accent}
              heat={ENTRY_LIGHT.returnCoach.sourceHeat}
              cx={width / 2}
              cy={splashCoachSourceCenterY(height)}
            />
          </Animated.View>
        </>
      ) : null}

      {/* Capa 4 — el sello. UNA sola, compartida, blanca en los dos estados. */}
      <EntryGrain />

      {/* Capa 3 — marca EVA (`SplashBrand`, la MISMA pieza que continua el overlay-loader
          del dashboard). Su opacidad la manda el crossfade desde aca. */}
      <Animated.View pointerEvents="none" style={[splashCenterStyle, evaStyle]}>
        <SplashEvaMark signature={evaSignature} reduced={reduced} />
      </Animated.View>

      {/* Capa 4 de §2.3 — marca del coach. Misma pieza para coach y alumno: solo cambia el
          origen de los datos (el alumno ve la marca de SU coach). */}
      {branded ? (
        <Animated.View pointerEvents="none" style={[splashCenterStyle, coachMarkStyle]}>
          <SplashCoachMark mark={branded} />
        </Animated.View>
      ) : null}

      {slow ? <SplashMorphbar reduced={reduced} /> : null}
    </View>
  )
}

/**
 * Primer nombre, presentable. Los nombres guardados en MAYUSCULAS (o todo minusculas) se
 * normalizan; los que ya mezclan cajas se respetan tal cual ("McKenzie", "JuanPablo").
 */
function firstName(fullName: string | null): string | null {
  const first = (fullName ?? '').trim().split(/\s+/)[0]
  if (!first) return null
  const mixedCase = first !== first.toLocaleLowerCase('es') && first !== first.toLocaleUpperCase('es')
  if (mixedCase) return first
  return first.charAt(0).toLocaleUpperCase('es') + first.slice(1).toLocaleLowerCase('es')
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ENTRY_TOKENS.canvasEntry },
})
