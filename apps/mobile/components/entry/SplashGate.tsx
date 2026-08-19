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
import { ENTRY_TOKENS, isCoachBrandingPresentationAllowed } from '../../lib/theme'
import { useTheme } from '../../context/ThemeContext'
import { EASE } from '../../lib/motion'
import { loadStoredBranding, type CoachBranding } from '../../lib/branding'
import { supabase } from '../../lib/supabase'
import { getCoachProfile } from '../../lib/coach'
import { beginSplashHandoff, type SplashBrandMark } from '../../context/DashboardReadyContext'
import { splashClockNow, splashSweepSeed } from './splash-sweep'
import { ENTRY_ACCENT, EntryGrain, EntrySource, entrySolidHex } from './EntryBackground'
import { ENTRY_LIGHT, LightLayer } from './LightLayer'
import {
  SPLASH_SLOW_MS,
  SplashCoachMark,
  SplashEvaMark,
  SplashMorphbar,
  splashCenterStyle,
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
 *   · el `router.replace` sale cuando el gate tiene target Y el crossfade cerro. Si el
 *   target ya estaba resuelto antes de t0+120 se salta el crossfade y se navega directo:
 *   la animacion jamas retiene la navegacion.
 *
 * UNA sola identidad despues del splash nativo (QA-3 del owner: "veo 3 splashes"). La
 * firma EVA (hairline + wordmark) NO se monta por defecto: solo aparece cuando el veredicto
 * del gate dice que NO habra marca de coach —o cuando el propio gate se hace lento y la
 * espera se queda sin marca que mostrar—. Con branding cacheado el usuario ve figura nativa
 * → misma figura en JS → marca del coach, sin pantalla EVA intermedia. El veredicto de
 * MARCA no espera el select a `coaches` cuando no hay nada que validar: sin branding
 * guardado (el caso comun — coaches EVA y sus alumnos) sesion+AsyncStorage deciden y ahi
 * mismo arranca el Glide. Solo la validacion del branding cacheado (¿es MI marca? ¿su tier
 * la permite?) espera a `getCoachProfile()`; el destino siempre lo espera. Y si la espera
 * igual se hizo lenta, `splashSweepSeed` garantiza que el sweep NO se siembra: el contrato
 * duro no es "el veredicto llega rapido" sino "jamas sweep sobre un look viejo".
 *
 * Cero red en el arranque: `loadStoredBranding()` lee AsyncStorage. Cache frio o tier sin
 * white-label (`isCoachBrandingPresentationAllowed`, gate real fuera de la UI) → capa EVA
 * y listo; el crossfade es una mejora, jamas un requisito para navegar.
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
  /**
   * Espejo de `slow` legible dentro del closure del gate: el efecto corre UNA vez (deps
   * `[]` reales) y su `slow` capturado seria siempre `false`. Lo consume el veredicto
   * tardio para decidir si todavia tiene sentido sembrar el sweep.
   */
  const slowRef = useRef(false)
  /**
   * Instante 0 de la coreografia «Glide» (`SplashGlide`), o `null` = sin sweep.
   *
   * Se siembra en el veredicto **sesion viva + sin marca de coach**, el unico camino que
   * sigue hacia el dashboard EVA con el overlay continuando la escena. Ese veredicto tiene
   * DOS momentos posibles, y AMBOS pasan por `splashSweepSeed` (semilla previa gana; espera
   * ya lenta NO siembra — relanzar la escena sobre la firma visible era la inconsistencia
   * del QA en device 19-08):
   *  - **temprano**: no hay branding guardado, asi que no puede haber marca —
   *    `currentBranding` da null por sus dos ramas. Es el caso comun (coaches EVA y sus
   *    alumnos): sesion+AsyncStorage deciden sin esperar el select a `coaches`, y en el
   *    caso tipico el sweep arranca antes del umbral `slow` — nativo → barrido con loader,
   *    sin look viejo intermedio.
   *  - **tardio** (tras `getCoachProfile()`, red): habia branding guardado que validar y
   *    resulto no presentable.
   * En las otras dos ramas queda `null` para siempre, por composicion:
   *  - **branded**: el crossfade a la marca del coach cierra a ~380 ms (hold 120 + xfade
   *    260) y la figura del sweep recien aterriza a los 550 → se veria la figura EVA
   *    volando con estelas cian POR ENCIMA de la marca del coach. El dueno decidio «Glide
   *    solo, sin marca de coach».
   *  - **anonimo** (primera instalacion): el gate se desmonta hacia el selector apenas
   *    resuelve —~100 ms con cache tibia, hasta 600 sin ella— y no hay overlay que continue
   *    nada: el barrido se cortaria a mitad de vuelo.
   *
   * Sembrar en el veredicto tiene un costo asumido: la figura ya estaba centrada y salta
   * fuera de cuadro para entrar barriendo. Ese blink es la decision «sweep fiel» del dueno;
   * con el veredicto temprano dura ~1 frame y se funde con el handoff nativo→JS.
   */
  const [sweepStartedAt, setSweepStartedAt] = useState<number | null>(null)
  const routed = useRef(false)
  const splashHidden = useRef(false)
  const t0 = useRef(splashClockNow())
  /** El gate ya sabe si habra marca de coach (aunque todavia no sepa el destino). */
  const decided = useRef(false)

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
  // mismo color y la misma figura en la misma posicion. Sigue siendo cierto CON el Glide:
  // en este instante todavia no hay veredicto, o sea que no hay sweep sembrado y la figura
  // esta quieta y centrada exactamente donde la dejo el nativo.
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
    // El espejo se resetea con cada corrida del efecto (p. ej. `forceSelector` cambia):
    // heredar el `true` de una corrida anterior suprimiria una semilla legitima.
    slowRef.current = false
    const timers: ReturnType<typeof setTimeout>[] = []

    timers.push(
      setTimeout(() => {
        if (!active) return
        slowRef.current = true
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

        // Veredicto TEMPRANO: sin branding guardado NO hay marca de coach posible, asi que
        // este ya es el camino del Glide sin esperar el select a `coaches`. No es "cero
        // red" garantizado —`getSession()` puede traer un refresh de token— pero si el
        // camino mas corto que existe; y si aun asi la espera ya se hizo lenta,
        // `splashSweepSeed` NO siembra: mejor el pre-Glide integro que relanzar la escena
        // sobre la firma ya visible (la secuencia del QA en device 19-08). El guard vive
        // en las DOS ramas del veredicto a proposito: dos usuarios con la misma espera en
        // pantalla no pueden recibir trato distinto segun que hubiera en AsyncStorage.
        if (!storedBranding) {
          decided.current = true
          setEvaSignature(true)
          const wasSlow = slowRef.current
          const now = splashClockNow()
          setSweepStartedAt(prev => splashSweepSeed(prev, wasSlow, now))
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
          const mark: SplashBrandMark = {
            // Orden de resolucion del ACENTO (§2.4): accentDark → primaryColor → azul EVA.
            accent: entrySolidHex(currentBranding.accentDark ?? currentBranding.primaryColor, ENTRY_ACCENT),
            displayName: currentBranding.displayName,
            greetingName: firstName(metadata?.full_name ?? metadata?.name ?? null),
            // Orden de resolucion de la MARCA (§2.4): logoUrlDark → logoUrl → tile de iniciales.
            logoUri: currentBranding.logoUrlDark ?? currentBranding.logoUrl ?? null,
          }
          // El hold de continuidad se respeta aunque AsyncStorage conteste en 40 ms (§4 R1):
          // el crossfade nunca arranca antes de t0+120.
          timers.push(
            setTimeout(
              () => {
                if (active && !routed.current) setBranded(mark)
              },
              Math.max(0, HOLD_MS - (Date.now() - t0.current)),
            ),
          )
        } else {
          // No hay marca de coach que mostrar: la espera es de EVA y lo dice.
          setEvaSignature(true)
          // Veredicto TARDIO del camino Glide: habia branding guardado que validar y no se
          // presenta. La MISMA regla que arriba (`splashSweepSeed`): la semilla temprana
          // gana si existe, y una espera que ya se hizo lenta se queda en el pre-Glide
          // integro en vez de relanzar la escena sobre la firma ya visible. `slow` y el
          // reloj se leen FUERA del updater: los updaters de estado deben ser puros.
          const wasSlow = slowRef.current
          const now = splashClockNow()
          setSweepStartedAt(prev => splashSweepSeed(prev, wasSlow, now))
        }

        // El destino si espero a la red (`getCoachProfile` define el rol), pero la marca ya
        // quedo lanzada arriba: el crossfade o el sweep no dependen de este `setTarget`.
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

  // Navegar = tener destino. El crossfade solo puede RETENER lo que ya empezo (cortarlo a la
  // mitad se lee como parpadeo de marca); si el destino llega antes de que hubiera marca, no
  // hay nada que esperar y se corta.
  //
  // QA-5 — el handoff sale en la MISMA tanda que el `replace`: el overlay raiz monta con la
  // identidad de este frame (marca, firma, morphbar y la opacidad viva del halo) antes de que
  // el desmontaje del gate descubra nada. `beginSplashHandoff` es de un disparo, asi que
  // re-ejecutar este efecto (p.ej. cuando `slow` cambia) no lo repite.
  useEffect(() => {
    if (!target) return
    if (branded && !xfadeDone) return
    // `sweepStartedAt` viaja con el resto del estado visual: el overlay RETOMA la
    // coreografia en el ms exacto en vez de relanzarla (la figura volveria a salir volando
    // por la izquierda a mitad del arranque). `null` tambien es informacion, no un hueco:
    // rama branded (el overlay pinta la marca del coach), veredicto lento que decidio
    // quedarse en el pre-Glide (`splashSweepSeed`), o el borde PRE-existente en que el
    // `setTimeout` del hold branded pierde contra este efecto y el handoff sale sin marca.
    // En los tres casos la respuesta correcta del overlay es la misma: replica estatica.
    // Por eso NO hay fallback `?? splashClockNow()`: inventar una semilla aca relanzaria en
    // el overlay, post-navegacion, la escena que el gate suprimio a proposito — y sin
    // semilla la figura NO queda escondida: `SplashEvaMark` ni aplica el estilo animado y
    // pinta la replica estatica de §3.1.
    beginSplashHandoff({
      mark: branded,
      signature: evaSignature,
      slow,
      halo: halo.value,
      sweepStartedAt: branded ? null : sweepStartedAt,
    })
    navigateRef.current(target)
  }, [branded, evaSignature, halo, slow, sweepStartedAt, target, xfadeDone])

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
            {/* El halo del coach se ancla al MISMO centro que el de EVA: la luz no salta
                de sitio durante el cruce, solo cambia de canal. */}
            <EntrySource
              accent={branded.accent}
              heat={ENTRY_LIGHT.returnCoach.sourceHeat}
              cx={width / 2}
              cy={figureCenterY}
            />
          </Animated.View>
        </>
      ) : null}

      {/* Capa 4 — el sello. UNA sola, compartida, blanca en los dos estados. */}
      <EntryGrain />

      {/* Capa 3 — marca EVA (`SplashBrand`, la MISMA pieza que continua el overlay-loader
          del dashboard). Su opacidad la manda el crossfade desde aca. */}
      <Animated.View pointerEvents="none" style={[splashCenterStyle, evaStyle]}>
        <SplashEvaMark signature={evaSignature} reduced={reduced} sweepStartedAt={sweepStartedAt} />
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
