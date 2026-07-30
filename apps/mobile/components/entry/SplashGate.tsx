import { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import * as SplashScreen from 'expo-splash-screen'
import { MotiView } from 'moti'
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { ENTRY_TOKENS, isCoachBrandingPresentationAllowed } from '../../lib/theme'
import { EASE } from '../../lib/motion'
import { FONT } from '../../lib/typography'
import { loadStoredBranding, type CoachBranding } from '../../lib/branding'
import { supabase } from '../../lib/supabase'
import { getCoachProfile } from '../../lib/coach'
import {
  ENTRY_ACCENT,
  EntryGrain,
  EntrySource,
  entryDarken,
  entryLighten,
  entrySolidHex,
} from './EntryBackground'
import { ENTRY_LIGHT, LightLayer } from './LightLayer'
import { EvaFigure, evaFigureHeight } from './EvaFigure'

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
 * → misma figura en JS → marca del coach, sin pantalla EVA intermedia. Por eso el crossfade
 * arranca apenas resuelven sesion+branding (AsyncStorage) y NO espera a `getCoachProfile()`,
 * que es RED: la marca no depende del rol, solo el destino.
 *
 * Cero red en el arranque: `loadStoredBranding()` lee AsyncStorage. Cache frio o tier sin
 * white-label (`isCoachBrandingPresentationAllowed`, gate real fuera de la UI) → capa EVA
 * y listo; el crossfade es una mejora, jamas un requisito para navegar.
 */

/** Hold de continuidad antes del crossfade (§2.3 / §4 R1). */
const HOLD_MS = 120
/** Crossfade de marca y luz, simultaneo y con la misma curva (§4 R2/R3). */
const XFADE_MS = 260
/** Variante reduce-motion: fade unico directo a la marca del coach, sin scale (§4 R2). */
const XFADE_REDUCED_MS = 160
/** El indicador de progreso solo se monta si el gate supera este umbral (§4 S4). */
const SLOW_GATE_MS = 600
/** Entrada de la firma (hairline + wordmark), curva y duracion de §4 S2. */
const SIGNATURE_MS = 360

/** Geometria del frame 01 (§3.1). El alto de la figura sale del aspecto 585:526. */
const FIGURE_SIZE = 150
const FIGURE_HEIGHT = evaFigureHeight(FIGURE_SIZE) // 135
const HAIRLINE_MARGIN_TOP = 16
const HAIRLINE_HEIGHT = 1
const HAIRLINE_MARGIN_BOTTOM = 13
const WORDMARK_LINE_HEIGHT = 13
const STACK_HEIGHT =
  FIGURE_HEIGHT + HAIRLINE_MARGIN_TOP + HAIRLINE_HEIGHT + HAIRLINE_MARGIN_BOTTOM + WORDMARK_LINE_HEIGHT

/** Loader morphbar (§3.1): pista 96x4, relleno 34 → recorrido 62. */
const MORPHBAR_WIDTH = 96
const MORPHBAR_FILL_WIDTH = 34
const MORPHBAR_TRAVEL = MORPHBAR_WIDTH - MORPHBAR_FILL_WIDTH

export interface SplashGateResult {
  /** Branding cacheado leido por el gate (AsyncStorage). El padre decide que hacer con el. */
  branding: CoachBranding | null
  /** El gate fallo (sin sesion utilizable). El padre cae a su ruta de escape. */
  failed?: boolean
}

/** Destino del retorno con sesion viva. */
type GateTarget = '/coach/home' | '/alumno/home'

/** La marca que se muestra en el crossfade. NO depende del rol: sale toda del branding. */
interface BrandedReturn {
  accent: string
  displayName: string
  greetingName: string | null
  logoUri: string | null
}

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

  const [branded, setBranded] = useState<BrandedReturn | null>(null)
  const [target, setTarget] = useState<GateTarget | null>(null)
  /** La firma EVA solo se monta si esta espera NO va a terminar en marca de coach. */
  const [evaSignature, setEvaSignature] = useState(false)
  const [slow, setSlow] = useState(false)
  const routed = useRef(false)
  const splashHidden = useRef(false)
  const t0 = useRef(Date.now())
  /** El gate ya sabe si habra marca de coach (aunque todavia no sepa el destino). */
  const decided = useRef(false)

  // El contenido se centra sobre el centro de la PANTALLA, no del body (§3.1): el splash
  // nativo centra en la ventana completa y la diferencia de ~8 pt se ve en el handoff.
  // El halo se ancla al centro OPTICO de la figura, no al del stack (§1.4).
  const figureCenterY = height / 2 - STACK_HEIGHT / 2 + FIGURE_HEIGHT / 2

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
  // mismo color y la misma figura en la misma posicion.
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
        const [sessionResult, storedBranding] = await Promise.all([
          supabase.auth.getSession(),
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

        // Gate real del white-label: vive en el payload de branding (tier), no en la UI.
        const allowed = storedBranding && isCoachBrandingPresentationAllowed(storedBranding)
        decided.current = true

        if (allowed && storedBranding) {
          const metadata = session.user.user_metadata as { full_name?: string; name?: string } | undefined
          const mark: BrandedReturn = {
            // Orden de resolucion del ACENTO (§2.4): accentDark → primaryColor → azul EVA.
            accent: entrySolidHex(storedBranding.accentDark ?? storedBranding.primaryColor, ENTRY_ACCENT),
            displayName: storedBranding.displayName,
            greetingName: firstName(metadata?.full_name ?? metadata?.name ?? null),
            // Orden de resolucion de la MARCA (§2.4): logoUrlDark → logoUrl → tile de iniciales.
            logoUri: storedBranding.logoUrlDark ?? storedBranding.logoUrl ?? null,
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
        }

        // Consulta de RED. Define el DESTINO, no la marca: por eso corre despues de haber
        // lanzado el crossfade y no antes.
        const coach = await getCoachProfile()
        if (!active || routed.current) return
        setTarget(coach ? '/coach/home' : '/alumno/home')
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

  // Navegar = tener destino. El crossfade solo puede RETENER lo que ya empezo (cortarlo a la
  // mitad se lee como parpadeo de marca); si el destino llega antes de que hubiera marca, no
  // hay nada que esperar y se corta.
  useEffect(() => {
    if (!target) return
    if (branded && !xfadeDone) return
    navigateRef.current(target)
  }, [branded, target, xfadeDone])

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

  // §4 S4 — morphbar. NUNCA `ActivityIndicator`.
  const loop = useSharedValue(0)
  useEffect(() => {
    if (!slow || reduced) return
    loop.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.bezier(0.4, 0, 0.2, 1) }),
      -1,
      false,
    )
    return () => cancelAnimation(loop)
  }, [loop, reduced, slow])

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
  const morphbarStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: interpolate(loop.value, [0, 0.45, 0.55, 1], [0, MORPHBAR_TRAVEL, MORPHBAR_TRAVEL, 0]) },
      { scaleX: interpolate(loop.value, [0, 0.45, 0.55, 1], [1, 0.6, 0.6, 1]) },
    ],
  }))

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

      {/* Capa 3 — marca EVA. La FIGURA no anima su entrada: el splash nativo ya la muestra
          y cualquier fade rompe el handoff pixel-identico (§3.1 + QA §7.1). El movimiento de
          S2 se aplica a la firma (hairline + wordmark), que el splash nativo NO tiene.
          La firma se mantiene MONTADA aunque este invisible: su alto es parte del stack que
          posiciona la figura (y el ancla del halo), asi que desmontarla haria saltar la
          figura justo en el handoff. */}
      <Animated.View pointerEvents="none" style={[styles.center, evaStyle]}>
        <EvaFigure size={FIGURE_SIZE} />
        <MotiView
          from={{ opacity: 0 }}
          animate={{ opacity: evaSignature ? 1 : 0 }}
          transition={{ type: 'timing', duration: reduced ? 0 : SIGNATURE_MS, easing: EASE.standard }}
          style={styles.signature}
        >
          <View style={styles.hairline} />
          <Text style={styles.wordmark}>EVA</Text>
        </MotiView>
      </Animated.View>

      {/* Capa 4 de §2.3 — marca del coach. Misma pieza para coach y alumno: solo cambia el
          origen de los datos (el alumno ve la marca de SU coach). */}
      {branded ? (
        <Animated.View pointerEvents="none" style={[styles.center, coachMarkStyle]}>
          {branded.logoUri ? (
            <Image
              source={{ uri: branded.logoUri }}
              style={styles.coachLogo}
              contentFit="contain"
              transition={0}
              cachePolicy="memory-disk"
            />
          ) : (
            <CoachInitialsTile accent={branded.accent} name={branded.displayName} />
          )}
          <Text style={styles.coachName} numberOfLines={1}>
            {branded.displayName}
          </Text>
          {/* El saludo SIEMPRE nombra a quien entra. Sin nombre a mano queda la marca sola:
              "Hola de nuevo" pelado bajo el nombre del coach se lee como si saludara AL
              COACH (QA-3 del owner) y en el retorno del alumno eso es directamente falso. */}
          {branded.greetingName ? (
            <Text style={styles.coachGreeting} numberOfLines={1}>
              {`Hola de nuevo, ${branded.greetingName}`}
            </Text>
          ) : null}
        </Animated.View>
      ) : null}

      {slow ? (
        <View pointerEvents="none" style={styles.morphbar}>
          {reduced ? (
            <View style={[styles.morphbarFill, styles.morphbarStatic]}>
              <MorphbarSheen />
            </View>
          ) : (
            <Animated.View style={[styles.morphbarFill, morphbarStyle]}>
              <MorphbarSheen />
            </Animated.View>
          )}
        </View>
      ) : null}
    </View>
  )
}

/** Relleno del morphbar: gradiente horizontal que se apaga en los extremos (§3.1). */
function MorphbarSheen() {
  return (
    <LinearGradient
      colors={['rgba(127,176,255,0.25)', '#7FB0FF', 'rgba(127,176,255,0.25)'] as const}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={StyleSheet.absoluteFill}
    />
  )
}

/**
 * Tile de iniciales (§3.6) — el fallback cuando el coach no tiene logo. Gradiente a 160°
 * `lighten(accent,12%) → accent → darken(accent,28%)`, borde overlay y highlight interno:
 * nunca un color solido pelado.
 */
function CoachInitialsTile({ accent, name }: { accent: string; name: string }) {
  return (
    <View style={styles.coachTile}>
      <LinearGradient
        colors={[entryLighten(accent, 0.12), accent, entryDarken(accent, 0.28)] as const}
        locations={[0, 0.62, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.94, y: 0.34 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.coachTileInset} />
      <Text style={styles.coachInitials}>{initialsOf(name)}</Text>
      <View style={styles.coachTileBorder} />
    </View>
  )
}

/** 1-2 caracteres, mayusculas, primeras letras de las 2 primeras palabras (§2.4). */
function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'EVA'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0]}${words[1][0]}`.toUpperCase()
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
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  signature: { alignItems: 'center' },
  hairline: {
    width: 34,
    height: HAIRLINE_HEIGHT,
    marginTop: HAIRLINE_MARGIN_TOP,
    marginBottom: HAIRLINE_MARGIN_BOTTOM,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  wordmark: {
    fontFamily: FONT.uiExtra,
    fontSize: 11,
    lineHeight: WORDMARK_LINE_HEIGHT,
    // El tracking cuelga a la derecha; el paddingLeft del mismo valor recentra el bloque.
    letterSpacing: 4.84,
    paddingLeft: 4.84,
    textTransform: 'uppercase',
    color: 'rgba(244,246,248,0.55)',
  },
  coachLogo: { width: 96, height: 96, borderRadius: 28 },
  coachTile: {
    width: 96,
    height: 96,
    borderRadius: 28,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coachTileInset: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.28)',
  },
  coachTileBorder: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  coachInitials: {
    fontFamily: FONT.displayBlack,
    fontSize: 35,
    letterSpacing: -1.575,
    color: '#FFFFFF',
  },
  coachName: {
    marginTop: 19,
    fontFamily: FONT.displayBlack,
    fontSize: 19,
    lineHeight: 22,
    letterSpacing: -0.38,
    color: '#F4F6F8',
  },
  coachGreeting: {
    marginTop: 7,
    fontFamily: FONT.uiBold,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.65,
    textTransform: 'uppercase',
    color: ENTRY_TOKENS.textFaint,
  },
  morphbar: {
    position: 'absolute',
    bottom: 96,
    alignSelf: 'center',
    width: MORPHBAR_WIDTH,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.10)',
    overflow: 'hidden',
  },
  morphbarFill: {
    width: MORPHBAR_FILL_WIDTH,
    height: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  // reduce-motion: barra estatica al 40% de la pista, sin recorrido (§4 S4).
  morphbarStatic: { width: MORPHBAR_WIDTH * 0.4 },
})
