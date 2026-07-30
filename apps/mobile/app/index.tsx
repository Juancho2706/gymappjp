import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'
import { BackHandler, Keyboard, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import { MotiView } from 'moti'
import {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { ForceScheme, useTheme } from '../context/ThemeContext'
import { CoachCodeSheet } from '../components/entry/CoachCodeSheet'
import { EntryGrain } from '../components/entry/EntryBackground'
import { EvaFigure } from '../components/entry/EvaFigure'
import { ENTRY_LIGHT, LightLayer } from '../components/entry/LightLayer'
import { ProductFragments } from '../components/entry/ProductFragments'
import { ROLE_CARD_GAP, RoleCard, type RoleKind } from '../components/entry/RoleCards'
import { RoleMorph, type MorphOrigin } from '../components/entry/RoleMorph'
import { SplashGate, type SplashGateResult } from '../components/entry/SplashGate'
import { EASE } from '../lib/motion'
import { ENTRY_TOKENS } from '../lib/theme'
import { FONT } from '../lib/typography'

type Phase = 'checking' | 'selector'

/**
 * Entrada dark v1 — frames 01/06 (`SplashGate`) y 02 (pantalla fusionada).
 * Normativa: `docs/specs/entrada-dark-v1/DESIGN-SPEC.md` §3.1, §3.2 y §4.
 *
 * La familia publica de entrada usa identidad EVA, NO el color del ultimo coach cacheado
 * (contrato negativo §2.4: el selector jamas se tiñe con la marca de un coach). El login
 * white-label recupera la marca despues de resolver el contexto correcto.
 *
 * Fase `checking` = `SplashGate`: la replica del splash ES el gate. Con sesion viva navega
 * el mismo (el retorno branded corre ANTES del `router.replace`); sin sesion devuelve el
 * branding cacheado y aqui se aplican los gates de siempre — `pick=1` → selector, branding
 * cacheado → login de alumno, y si no, la pantalla fusionada.
 *
 * El walkthrough de 3 slides fue RETIRADO (F3.7): la pantalla 02 no tiene nada que saltar
 * porque el CTA ya esta en pantalla. Con el se fueron `components/Walkthrough.tsx`,
 * `lib/walkthrough.ts` y las 3 ilustraciones `assets/onboarding/*.webp`, reemplazadas por
 * los fragmentos de producto dibujados (§5.2, cero bitmaps).
 */
export default function RoleSelectorRoute() {
  const router = useRouter()
  const { setBranding } = useTheme()
  const { pick } = useLocalSearchParams<{ pick?: string }>()
  const [phase, setPhase] = useState<Phase>('checking')
  const routed = useRef(false)

  const handleAnonymous = useCallback(
    ({ branding, failed }: SplashGateResult) => {
      if (routed.current) return
      if (failed || pick === '1') {
        setPhase('selector')
        return
      }
      if (branding?.coachId) {
        // Mantener memoria y caché alineadas antes de montar el login.
        setBranding(branding)
        routed.current = true
        router.replace('/(auth)/login?role=alumno&switch=1')
        return
      }
      setPhase('selector')
    },
    [pick, router, setBranding],
  )

  return (
    <ForceScheme scheme="dark" branded={false}>
      {phase === 'checking' ? <SplashGate onAnonymous={handleAnonymous} /> : <EntryScreen />}
    </ForceScheme>
  )
}

/** V1 — cascada de entrada: 7 pasos, 280 ms cada uno, stagger 70 ms (cierra en 700 ms). */
const STAGGER_MS = 70
const STEP_MS = 280
/** Reduce-motion: todos juntos, 1 solo fade, sin `translateY`. */
const REDUCED_MS = 200

function Reveal({
  step,
  reduced,
  style,
  children,
}: {
  step: number
  reduced: boolean
  style?: React.ComponentProps<typeof MotiView>['style']
  children: React.ReactNode
}) {
  return (
    <MotiView
      from={reduced ? { opacity: 0 } : { opacity: 0, translateY: 12 }}
      animate={reduced ? { opacity: 1 } : { opacity: 1, translateY: 0 }}
      transition={{
        type: 'timing',
        duration: reduced ? REDUCED_MS : STEP_MS,
        delay: reduced ? 0 : step * STAGGER_MS,
        easing: EASE.standard,
      }}
      style={style}
    >
      {children}
    </MotiView>
  )
}

/** A1 — la rampa no se reemplaza de golpe: se cruza en 200 ms al entrar al morph. */
const RAMP_MS = 200

/**
 * FRAME 02 — valor + rol en UNA sola pantalla: 0 slides, 0 swipes, 0 dots, 0 "Saltar".
 * Rol elegible a ~1.6 s del cold start.
 *
 * Los dos roles NO hacen lo mismo con el morph (decision del owner, 2026-07-30):
 *  - **coach** navega: el morph es transicion pura y `/(auth)/login?role=coach` es el destino.
 *  - **alumno** NO navega: la card se expande EN ESTA MISMA PANTALLA hasta ser el sheet que
 *    contiene el form del codigo (frame 4 del concepto C). El selector queda montado debajo
 *    —la atmosfera es continua por construccion— y el back revierte el morph.
 */
function EntryScreen() {
  const router = useRouter()
  const reduced = useReducedMotion()
  const insets = useSafeAreaInsets()
  const { height, fontScale } = useWindowDimensions()

  const containerRef = useRef<View>(null)
  const alumnoRef = useRef<View>(null)
  const coachRef = useRef<View>(null)
  /** Morph del coach: overlay de transicion, se limpia al volver del login. */
  const [coachMorph, setCoachMorph] = useState<MorphOrigin | null>(null)
  /** Sheet del alumno: el rect medido sobrevive al foco; el sheet ES la pantalla. */
  const [sheet, setSheet] = useState<MorphOrigin | null>(null)
  /** `false` = reproducir el recorrido invertido y desmontar al terminar. */
  const [sheetOpen, setSheetOpen] = useState(false)
  /** El recorrido de ida cerro: recien ahi el campo puede pedir el teclado. */
  const [sheetReady, setSheetReady] = useState(false)
  const navigating = useRef(false)

  // §3.2.6 — densidad: en 667 pt colapsa el TERCER fragmento (su copy se anexa al
  // segundo) y con fontScale > 1.15 los captions bajan a 1 linea. Los titulares, el
  // separador y las dos cards NUNCA se sacrifican: el CTA de rol jamas queda bajo el fold.
  const compact = height <= 667
  const bigText = fontScale > 1.15

  // Al volver del login el overlay de TRANSICION debe estar limpio (la pantalla 02 nunca
  // se desmonto, solo quedo debajo). El sheet del alumno NO se limpia: si el usuario vuelve
  // del login con el back, encuentra su sheet y su codigo donde los dejo — igual que antes
  // encontraba la pantalla `/alumno/codigo`.
  useFocusEffect(
    useCallback(() => {
      setCoachMorph(null)
      navigating.current = false
    }, []),
  )

  const commitCoach = useCallback(() => {
    if (navigating.current) return
    navigating.current = true
    router.push('/(auth)/login?role=coach')
  }, [router])

  const closeSheet = useCallback(() => {
    // El teclado se va con el morph, no despues: cerrarlo al desmontar el input haria
    // dos animaciones encadenadas.
    Keyboard.dismiss()
    setSheetReady(false)
    setSheetOpen(false)
  }, [])

  const startMorph = useCallback(
    (role: RoleKind, ref: RefObject<View | null>) => {
      if (navigating.current || coachMorph || sheet) return
      const openFallback = () => {
        if (role === 'coach') commitCoach()
        else router.push('/alumno/codigo')
      }
      const node = ref.current
      const container = containerRef.current
      if (!node || !container) {
        // Sin rect no hay morph posible: el alumno cae a la ruta del frame 04, que monta
        // el MISMO form. Nunca se queda sin camino.
        openFallback()
        return
      }
      // El origen del morph es el rect REAL de la card, no el 595/692 de la referencia:
      // con el layout colapsado o con fontScale alto las cards no estan donde el mockup.
      container.measureInWindow((containerX, containerY) => {
        node.measureInWindow((x, y, width, cardHeight) => {
          if (!width || !cardHeight) {
            openFallback()
            return
          }
          const origin = { x: x - containerX, y: y - containerY, width, height: cardHeight }
          if (role === 'coach') {
            setCoachMorph(origin)
            return
          }
          setSheet(origin)
          setSheetOpen(true)
        })
      })
    },
    [coachMorph, commitCoach, router, sheet],
  )

  // Back de Android mientras el sheet esta arriba: revierte el morph en vez de salir de la
  // app. En iOS el afordance es el grab del sheet (y el dim).
  //
  // Va por `useFocusEffect` y no por `useEffect`: los listeners de `BackHandler` son
  // GLOBALES y en LIFO, asi que uno vivo mientras esta pantalla no tiene el foco se comeria
  // el back del login que hay encima (el sheet sigue montado detras a proposito).
  useFocusEffect(
    useCallback(() => {
      if (!sheet) return
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        closeSheet()
        return true
      })
      return () => sub.remove()
    }, [closeSheet, sheet]),
  )

  // La rampa se enciende (alumno, pico .206) o se apaga (coach, minimo .052) durante el
  // mismo tramo del morph. Se CRUZAN opacidades, jamas se interpola el gradiente (§4 R3).
  const ramp = useSharedValue(0)
  const rampStyle = useAnimatedStyle(() => ({ opacity: ramp.value }))
  const rampSpec = coachMorph ? ENTRY_LIGHT.morphCoach : ENTRY_LIGHT.morphStudent
  // Con el sheet abierto la rampa se queda en el pico: la composicion NO abandono el frame
  // del morph (§3.3) — lo que en el mockup era "llegar a /alumno/codigo" ahora pasa dentro
  // de esta misma pantalla. Al cerrar vuelve a la del selector con los mismos 200 ms.
  const morphing = coachMorph !== null || (sheet !== null && sheetOpen)
  useEffect(() => {
    ramp.value = withTiming(morphing ? 1 : 0, {
      duration: reduced ? 0 : RAMP_MS,
      easing: EASE.standard,
    })
    return () => cancelAnimation(ramp)
  }, [morphing, ramp, reduced])

  return (
    <View ref={containerRef} collapsable={false} style={styles.root} testID="role-selector">
      <LightLayer spec={ENTRY_LIGHT.valueRole} />
      {/* Se monta mientras haya morph vivo — incluido el recorrido de VUELTA del sheet:
          desmontarla antes se comeria su propio fade de salida. */}
      {coachMorph || sheet ? <LightLayer spec={rampSpec} style={rampStyle} /> : null}
      {/* Capa 4 — el sello: UNA sola, encima de las atmosferas, debajo del contenido. */}
      <EntryGrain />

      <View
        style={[
          styles.body,
          { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 34) },
        ]}
      >
        <Reveal step={0} reduced={reduced}>
          <View style={styles.topbar}>
            <View style={styles.lockup}>
              <EvaFigure size={30} opacity={0.96} />
              <Text style={styles.wordmark}>EVA</Text>
            </View>
            <Text style={styles.lang}>ES</Text>
          </View>
          <Text style={styles.kicker}>Entrenamiento · Nutrición · Progreso</Text>
          <Text style={styles.hero}>{'Coach y alumno,\nun solo plan.'}</Text>
        </Reveal>

        <Reveal step={1} reduced={reduced}>
          <Text style={styles.heroSub}>
            Tu coach lo arma desde su panel. Tú lo entrenas y lo comes. Los dos miran exactamente los
            mismos números.
          </Text>
        </Reveal>

        {/* Cada fragmento entra como UN nodo (la miniatura es estatica dentro de su
            contenedor animado), pasos 2-4 de la cascada. */}
        <View style={styles.fragsWrap}>
          <ProductFragments
            collapse={compact}
            captionLines={bigText ? 1 : undefined}
            renderRow={(row, index) => (
              <Reveal key={`frag-${index}`} step={2 + index} reduced={reduced}>
                {row}
              </Reveal>
            )}
          />
        </View>

        <Reveal step={5} reduced={reduced} style={styles.sep}>
          <View style={styles.sepLine} />
          <Text style={styles.sepLabel}>Elige cómo entrar</Text>
          <View style={styles.sepLine} />
        </Reveal>

        <View style={styles.roles}>
          <Reveal step={5} reduced={reduced}>
            <View ref={alumnoRef} collapsable={false}>
              <RoleCard
                role="alumno"
                testID="role-alumno"
                accessibilityLabel="Entrar como alumno"
                accessibilityHint="Usa el código o enlace de tu coach"
                onPress={() => startMorph('alumno', alumnoRef)}
              />
            </View>
          </Reveal>
          <Reveal step={6} reduced={reduced}>
            <View ref={coachRef} collapsable={false}>
              <RoleCard
                role="coach"
                testID="role-coach"
                accessibilityLabel="Entrar como coach"
                accessibilityHint="Abre el acceso para gestionar alumnos y programas"
                onPress={() => startMorph('coach', coachRef)}
              />
            </View>
          </Reveal>
        </View>

        <Reveal step={6} reduced={reduced}>
          <Text style={styles.foot}>Solo define por dónde entras. Después inicias sesión.</Text>
        </Reveal>
      </View>

      {/* Frame 05 — coach: el morph es transicion, el destino es el login. */}
      {coachMorph ? <RoleMorph role="coach" origin={coachMorph} onCommit={commitCoach} /> : null}

      {/* Frame 4 del concepto C — alumno: el morph ES el destino. Cero navegacion. */}
      {sheet ? (
        <RoleMorph
          role="alumno"
          origin={sheet}
          open={sheetOpen}
          onCommit={() => setSheetReady(true)}
          onClosed={() => setSheet(null)}
          onRequestClose={closeSheet}
        >
          <CoachCodeSheet ready={sheetReady} onClose={closeSheet} />
        </RoleMorph>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ENTRY_TOKENS.canvasEntry },
  // Contenedor comun de todos los frames (§3): 24 de aire lateral, 34 abajo.
  body: { flex: 1, paddingHorizontal: 24 },

  topbar: {
    paddingTop: 8,
    marginBottom: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lockup: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  wordmark: {
    fontFamily: FONT.uiExtra,
    fontSize: 12.5,
    lineHeight: 15,
    // El tracking cuelga a la derecha; el paddingLeft del mismo valor recentra el bloque.
    letterSpacing: 3.75,
    paddingLeft: 3.75,
    textTransform: 'uppercase',
    color: 'rgba(244,246,248,0.72)',
  },
  lang: {
    fontFamily: FONT.uiExtra,
    fontSize: 10.5,
    lineHeight: 13,
    letterSpacing: 0.84,
    color: '#86919E',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
    overflow: 'hidden',
  },

  kicker: {
    fontFamily: FONT.uiExtra,
    fontSize: 10.5,
    lineHeight: 13,
    letterSpacing: 2.1,
    textTransform: 'uppercase',
    color: '#86919E',
    marginBottom: 11,
  },
  hero: {
    fontFamily: FONT.displayBlack,
    fontSize: 34,
    lineHeight: 35,
    letterSpacing: -1.19,
    color: '#F4F6F8',
    marginBottom: 11,
  },
  heroSub: {
    fontFamily: FONT.ui,
    fontSize: 13.5,
    lineHeight: 20,
    color: '#CDD3DB',
    maxWidth: 322,
    marginBottom: 18,
  },

  // `flexShrink` es el seguro del CTA: si el contenido no cabe (fontScale extremo), lo
  // que cede es el bloque de fragmentos, nunca las cards de rol.
  fragsWrap: { flexShrink: 1, marginBottom: 16 },

  sep: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  sepLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.07)' },
  sepLabel: {
    fontFamily: FONT.uiExtra,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: '#86919E',
  },

  roles: { marginTop: 'auto', gap: ROLE_CARD_GAP },

  foot: {
    marginTop: 13,
    textAlign: 'center',
    fontFamily: FONT.uiSemibold,
    fontSize: 11,
    lineHeight: 15,
    color: ENTRY_TOKENS.textFaint,
  },
})
