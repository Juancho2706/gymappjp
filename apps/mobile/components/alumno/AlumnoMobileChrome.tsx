import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { TextStyle, ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BlurView } from 'expo-blur'
import { cssInterop } from 'nativewind'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { useRouter } from 'expo-router'
import {
  Apple,
  CheckCircle,
  ChevronRight,
  Dumbbell,
  History,
  Home,
  LogOut,
  MoreHorizontal,
  UserRound,
  type LucideIcon,
} from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { useEntitlements } from '../../lib/entitlements'
import { signOutAndCleanup } from '../../lib/auth-actions'
import { resetChromeScroll, useChromeMinimized } from '../../lib/alumno-chrome-scroll'
import { FONT } from '../../lib/typography'
import { SPRING, useEvaMotion } from '../../lib/motion'
import { shadow } from '../../lib/shadows'
import { Sheet } from '../Sheet'
import { NavIconRN, type NavConceptRN } from '../NavIconRN'

// Token DS `--cta-danger` (#D31E45, globals.css:472; MISMO valor en claro y oscuro).
// Web pinta "Cerrar sesión" con `text-destructive/80` (= cta-danger @80%,
// ClientNav.tsx:492); el icono hereda el mismo color. Literal citado (rampa fija DS,
// no white-label) porque NavIconRN toma `color` imperativo.
const CTA_DANGER = '#D31E45'
const CTA_DANGER_80 = CTA_DANGER + 'CC'

/**
 * AlumnoMobileChrome — floating navigation capsule for the alumno tree (E1-01).
 *
 * 1:1 re-skin of the web `ClientNav` MOBILE capsule
 * (`apps/web/src/components/client/ClientNav.tsx`, the `md:hidden` branch):
 *  - frosted floating capsule pinned above the home-indicator (not an
 *    edge-docked native tab bar), rounded 30, hairline border, layered shadow,
 *    blur backdrop tinted with the surface,
 *  - "4 primaries + Más" pattern: Inicio · Nutrición (if entitled) · Aprender ·
 *    Check-in + a Más button,
 *  - a spring-animated sliding pill behind the active tab (brand-tinted via the
 *    live white-label `--color-primary`),
 *  - hide-on-scroll: down past 80px minimizes (labels collapse, capsule
 *    narrows); up / near top reveals — fed by `lib/alumno-chrome-scroll`,
 *  - a rich "Más" bottom sheet (DS `Sheet`) with the same entries as web:
 *    Mi perfil (featured), Historial, Cerrar sesión.
 *
 * Deviations from web (documented):
 *  - Web fills the active glyph (fill-opacity .18); RN leans on the pill + brand
 *    color + a bolder stroke instead (lucide-react-native has no cheap
 *    per-glyph fill wash). The sliding pill IS the fill affordance.
 *  - "Instalar la app" (PwaNavButton) is intentionally omitted — this is the
 *    native app; there is no PWA install (research §chrome / transversal #7).
 *  - Colors come from NativeWind DS tokens (no `lib/theme` shim), so light/dark
 *    + white-label brand resolve at runtime.
 */

// Let NativeWind drive lucide icon color via className (text-primary/text-muted…),
// so the brand + dark-mode tokens flow without touching the frozen theme shim.
const NAV_ICONS: LucideIcon[] = [Home, Apple, Dumbbell, CheckCircle, MoreHorizontal, UserRound, History, LogOut]
for (const Icon of NAV_ICONS) {
  cssInterop(Icon, { className: { target: 'style', nativeStyleToProp: { color: true } } })
}

// Resorte del pill deslizante + inset de la capsula: token compartido `SPRING.ui`
// de @eva/brand-kit (damping 18 · stiffness 220 · mass 1) — mismo "resorte" que la
// PWA (var(--ease-spring)) para que el desliz al cambiar de tab sea 1:1 con la web.
const NAV_SPRING = SPRING.ui
const CAPSULE_PAD = 8
const CAPSULE_RADIUS = 30
const PILL_RADIUS = 22
const INSET_OPEN = 14
const INSET_MIN = 72

/** Bottom clearance the floating capsule needs (add safe-area-bottom on top).
 *  The tabs layout reserves this via `sceneStyle` so content is never hidden. */
export const ALUMNO_TABBAR_CLEARANCE = 88

// Micro tab label — intentionally below the DS type scale (mirrors web's 10px
// tab label); only the family is token-driven (Hanken, never Inter).
const LABEL_BASE: TextStyle = { fontSize: 10, lineHeight: 12, letterSpacing: 0.1, textAlign: 'center' }

type TabRoute = { key: string; name: string }

type TabDef = {
  /** expo-router route name. */
  name: string
  label: string
  icon: LucideIcon
  testID: string
  /** Silueta propia del CEO (NavIconRN). Si falta, se usa `icon` de lucide. */
  concept?: NavConceptRN
}

// The four thumb-zone primaries (web order). Nutrición is gated by the domain
// master switch (useEntitlements); the rest live behind "Más".
const PRIMARY_TABS: TabDef[] = [
  { name: 'home', label: 'Inicio', icon: Home, testID: 'tab-home', concept: 'home' },
  { name: 'nutricion', label: 'Nutrición', icon: Apple, testID: 'tab-nutricion', concept: 'nutricion' },
  { name: 'exercises', label: 'Aprender', icon: Dumbbell, testID: 'tab-exercises', concept: 'aprender' },
  { name: 'check-in', label: 'Check-in', icon: CheckCircle, testID: 'tab-check-in', concept: 'check-in' },
]

// Routes reached from the "Más" sheet — keep the Más tab lit while inside them
// (mirror of web `moreRoutes`, ClientNav.tsx:128-139: history + perfil + los
// items de módulo movimiento/bodycomp). `workout` is immersive and hides the
// chrome. Los slugs son los NOMBRES DE RUTA RN (== filename), no los del web:
// las pantallas viven en `movement.tsx`/`bodycomp.tsx` (el web usa `/movimiento`).
// 2R-1: movement/bodycomp ya viven DENTRO de `(tabs)` como rutas `href:null`
// (ver app/alumno/(tabs)/_layout.tsx), así que al entrar la cápsula persiste y
// estos slugs matchean el route activo del navigator → "Más" queda encendido,
// igual que el web.
const MORE_ROUTES = ['perfil', 'history', 'movement', 'bodycomp']

// 4A-01: rutas de la superficie Nutrición V2 (hub + registrar + scanner), ocultas
// dentro de (tabs) con href:null. En web viven bajo el layout c/[coach_slug] con
// la cápsula siempre montada y el ítem "Nutrición" activo (el nav marca activo por
// prefijo de ruta, ClientNav.tsx:120; nutrition-v2/page.tsx:62-100,
// scanner/page.tsx:49-66). Aquí se pliegan al tile `nutricion` para pill + tinte.
const NUTRICION_V2_ROUTES = ['nutrition-v2/index', 'nutrition-v2/add-food-v2', 'nutrition-v2/scanner']

export function AlumnoMobileChrome({
  state,
  navigation,
}: {
  state: { index: number; routes: TabRoute[] }
  descriptors?: Record<string, unknown>
  // react-navigation's NavigationHelpers (emit/navigate); typed loose like the
  // Tabs `tabBar` contract to avoid re-declaring the full generic helper type.
  navigation: any
}) {
  const insets = useSafeAreaInsets()
  const { resolvedScheme, theme } = useTheme()
  const { nutritionEnabled } = useEntitlements()
  const minimized = useChromeMinimized()

  const router = useRouter()
  const [moreOpen, setMoreOpen] = useState(false)

  const rawActiveName = state.routes[state.index]?.name
  // 4A-01: dentro de la superficie V2 (`nutrition-v2/*`) el tile "Nutrición" queda
  // encendido, igual que el ítem del ClientNav web dentro de /nutrition-v2*.
  const activeName = NUTRICION_V2_ROUTES.includes(rawActiveName ?? '') ? 'nutricion' : rawActiveName

  // Primary tiles present in the capsule (Nutrición hidden if the coach turned
  // the domain off for this alumno — fail-open default true).
  const tiles = PRIMARY_TABS.filter((t) => t.name !== 'nutricion' || nutritionEnabled)
  const tabCount = tiles.length + 1 // + Más

  const isMoreActive = MORE_ROUTES.includes(activeName ?? '') || moreOpen
  const activeIndex = isMoreActive
    ? tiles.length
    : tiles.findIndex((t) => t.name === activeName)

  // ---- reanimated drivers ----
  const rowW = useSharedValue(0)
  const mini = useSharedValue(minimized ? 1 : 0)
  const activeIdx = useSharedValue(activeIndex)

  useEffect(() => {
    mini.value = minimized ? 1 : 0
  }, [minimized, mini])
  useEffect(() => {
    activeIdx.value = activeIndex
  }, [activeIndex, activeIdx])

  // Reveal the capsule whenever the active route changes (ruta REAL: dentro de la
  // superficie V2 el alias del tile no cambia, pero hub→scanner sí debe revelar).
  useEffect(() => {
    resetChromeScroll()
  }, [rawActiveName])

  // Close the Más sheet on navigation (route change).
  useEffect(() => {
    setMoreOpen(false)
  }, [rawActiveName])

  const capsuleInsetStyle = useAnimatedStyle(() => {
    const inset = withSpring(mini.value ? INSET_MIN : INSET_OPEN, NAV_SPRING)
    return { left: inset, right: inset }
  })

  const pillStyle = useAnimatedStyle(() => {
    const inner = rowW.value - CAPSULE_PAD * 2
    const w = tabCount > 0 ? inner / tabCount : 0
    const idx = activeIdx.value
    return {
      width: w,
      transform: [{ translateX: withSpring(CAPSULE_PAD + (idx < 0 ? 0 : idx) * w, NAV_SPRING) }],
      opacity: withTiming(idx < 0 ? 0 : 1, { duration: 160 }),
    }
  })

  function go(name: string) {
    setMoreOpen(false)
    // 4A-01: tap en "Nutrición" estando dentro de la superficie V2 — desde una ruta
    // secundaria (scanner / registrar) vuelve al hub (espejo web: el nav lleva a
    // /nutrition → redirect → /nutrition-v2); desde el hub es no-op (convención de
    // tab activo; evita rebotar por el gate de `nutricion` y remontar la pantalla).
    if (name === 'nutricion' && rawActiveName && NUTRICION_V2_ROUTES.includes(rawActiveName)) {
      if (rawActiveName !== 'nutrition-v2/index') navigation.navigate('nutrition-v2/index')
      return
    }
    const route = state.routes.find((r) => r.name === name)
    if (!route) return
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
    if (activeName !== name && !event.defaultPrevented) navigation.navigate(name)
  }

  async function handleSignOut() {
    setMoreOpen(false)
    await signOutAndCleanup()
    router.replace('/')
  }

  // Immersive workout execution hides the whole chrome (parity with web).
  if (activeName === 'workout') return null

  const isDark = resolvedScheme === 'dark'

  return (
    <>
      <Animated.View
        pointerEvents="box-none"
        style={[styles.capsuleAnchor, { bottom: insets.bottom + 16 }, capsuleInsetStyle]}
      >
        {/* Capsula flotante 1:1 con web/coach: UN solo material esmerilado. El
            BlurView frostea el CONTENIDO real que scrollea por debajo — es el
            equivalente del `backdropFilter` del web (`ClientNav.tsx:479-482`), que
            usa UNA sola capa translucida, NUNCA un backing/velo opaco. P0-1 (franja
            blanca en dark): antes se apilaba un `<View bg-surface-card/70>` (70%
            opaco) ENCIMA del blur que, sumado al borde, se leia como slab claro; se
            elimino para dejar el BlurView como superficie translucida unica (== la
            capa unica del web). Borde = hairline `border-subtle` (dark = blanco@7%
            ~= el text-strong@9% del web `:482`, translucido, no un canto opaco). */}
        <View
          className="overflow-hidden rounded-[30px] border border-subtle"
          style={[styles.capsuleShell, shadow('md', resolvedScheme)]}
        >
          {/* QA-8: en Android, expo-blur SIN `experimentalBlurMethod` NO difumina —
              pinta un velo de color plano (tint@intensity), por eso la capsula se
              leia como pastilla opaca oscura en vez de vidrio esmerilado. Con
              `dimezisBlurView` Android hace blur REAL del contenido que scrollea por
              debajo, == el `backdropFilter: blur(26px)` del web (ClientNav.tsx:480).
              iOS lo ignora (usa su blur nativo). */}
          <BlurView
            intensity={isDark ? 40 : 60}
            tint={isDark ? 'dark' : 'light'}
            experimentalBlurMethod="dimezisBlurView"
            style={StyleSheet.absoluteFill}
          />

          <View
            style={styles.row}
            onLayout={(e) => {
              rowW.value = e.nativeEvent.layout.width
            }}
          >
            {/* Sliding pill behind the active tab (brand-tinted). The animated
                view owns position/size; the inner plain View carries color. */}
            <Animated.View pointerEvents="none" style={[styles.pill, pillStyle]}>
              <View
                className="border border-primary/[0.24] bg-primary/[0.15]"
                style={{ flex: 1, borderRadius: PILL_RADIUS }}
              />
            </Animated.View>

            {tiles.map((t) => (
              <TabTile
                key={t.name}
                icon={t.icon}
                concept={t.concept}
                label={t.label}
                testID={t.testID}
                active={activeName === t.name}
                activeColor={theme.primary}
                inactiveColor={theme.mutedForeground}
                mini={mini}
                onPress={() => go(t.name)}
              />
            ))}
            {/* "Más" abre (nunca togglea): un toggle `!o` hacia que el 2º tap
                cerrara el sheet recien abierto — se leia como "necesita muchos
                taps / abre y cierra al instante". El cierre lo maneja el Sheet
                (backdrop / swipe / boton X) y el cambio de ruta. */}
            <TabTile
              icon={MoreHorizontal}
              concept="mas"
              label="Más"
              testID="tab-mas"
              active={isMoreActive}
              activeColor={theme.primary}
              inactiveColor={theme.mutedForeground}
              mini={mini}
              onPress={() => setMoreOpen(true)}
            />
          </View>
        </View>
      </Animated.View>

      {/* "Más" sheet — same entries as web (minus PWA install, N/A native).
          QA-12 (ronda 7): `nativeModal` renderiza vía `<Modal>` RN en vez de @gorhom. El menú "Más" NO abría
          al PRIMER tap desde Home (sí tras visitar otra tab): el hosting-container de @gorhom siembra su alto
          en -999 hasta un commit de `.modify()` (reanimated 4 / Fabric) que sólo propaga tras un re-layout
          (navegación) → el primer `present()` resolvía los snap points contra -999 y el sheet montaba
          fuera de pantalla. El `<Modal>` nativo no depende de ese alto medido — abre siempre al primer tap.
          Ver docs de la prop `nativeModal` en Sheet.tsx. `snapPoints={['48%']}` pasa a ser el tope de max-height. */}
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Más" nativeModal snapPoints={['48%']}>
        {/* Fila "Mi perfil" — espejo web ClientNav.tsx:429-451: min-h 52, reposo
            `bg-surface-sunken`, activo = tinte primary 10% bg / 20% border (activeBgStyle
            :112-115) + titulo 14 bold text-strong, subtitulo 12 muted, chip 36 primary
            12% con glyph 18 primary, ChevronRight 18 muted. */}
        <Pressable
          testID="mas-perfil"
          accessibilityRole="button"
          accessibilityLabel="Mi perfil"
          onPress={() => go('perfil')}
          className={`flex-row items-center rounded-control border ${
            activeName === 'perfil' ? 'border-primary/[0.20] bg-primary/[0.10]' : 'border-transparent bg-surface-sunken'
          }`}
          style={{ minHeight: 52, gap: 12, paddingHorizontal: 12, paddingVertical: 10 }}
        >
          <View className="h-9 w-9 items-center justify-center rounded-control bg-primary/[0.12]">
            <NavIconRN concept="perfil" size={18} color={theme.primary} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text className="text-strong" style={{ fontFamily: FONT.uiBold, fontSize: 14 }}>Mi perfil</Text>
            <Text className="text-muted" style={{ fontFamily: FONT.ui, fontSize: 12 }}>Racha, módulos, cuenta y más</Text>
          </View>
          <ChevronRight className="text-muted" size={18} strokeWidth={2} />
        </Pressable>

        {/* Fila "Historial" — espejo web ClientNav.tsx:459-477: glyph 20 INLINE (sin chip),
            label 14 semibold; inactivo text-muted, activo text-strong + tinte primary. */}
        <Pressable
          testID="mas-historial"
          accessibilityRole="button"
          accessibilityLabel="Historial"
          onPress={() => go('history')}
          className={`flex-row items-center rounded-control border ${
            activeName === 'history' ? 'border-primary/[0.20] bg-primary/[0.10]' : 'border-transparent'
          }`}
          style={{ minHeight: 44, gap: 12, paddingHorizontal: 12, paddingVertical: 10 }}
        >
          <NavIconRN concept="historial" size={20} color={activeName === 'history' ? theme.primary : theme.mutedForeground} />
          <Text
            numberOfLines={1}
            className={activeName === 'history' ? 'text-strong' : 'text-muted'}
            style={{ fontFamily: FONT.uiSemibold, fontSize: 14 }}
          >
            Historial
          </Text>
        </Pressable>

        {/* "Cerrar sesión" — web ClientNav.tsx:488-496: `text-destructive/80` (cta-danger
            @80%, MISMO hue en ambos esquemas) 14 semibold, glyph 20 heredando el color. */}
        <View className="mt-space-2 border-t border-subtle pt-space-3">
          <Pressable
            testID="mas-cerrar-sesion"
            accessibilityRole="button"
            accessibilityLabel="Cerrar sesión"
            onPress={handleSignOut}
            className="flex-row items-center rounded-control"
            style={{ minHeight: 44, gap: 12, paddingHorizontal: 12, paddingVertical: 10 }}
          >
            <NavIconRN concept="cerrar-sesion" size={20} color={CTA_DANGER_80} />
            <Text numberOfLines={1} style={{ fontFamily: FONT.uiSemibold, fontSize: 14, color: CTA_DANGER_80 }}>Cerrar sesión</Text>
          </Pressable>
        </View>
      </Sheet>
    </>
  )
}

function TabTile({
  icon: Icon,
  concept,
  label,
  testID,
  active,
  activeColor,
  inactiveColor,
  mini,
  onPress,
}: {
  icon: LucideIcon
  concept?: NavConceptRN
  label: string
  testID: string
  active: boolean
  activeColor: string
  inactiveColor: string
  mini: SharedValue<number>
  onPress: () => void
}) {
  const motion = useEvaMotion()
  // var(--dur-base) = 220ms + var(--ease-out) del web (ClientNav.tsx:292).
  const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1)
  const labelStyle = useAnimatedStyle(() => ({
    opacity: withTiming(mini.value ? 0 : 1, { duration: 220, easing: EASE_OUT }),
    maxHeight: withTiming(mini.value ? 0 : 14, { duration: 220, easing: EASE_OUT }),
  }))
  // Estado minimizado del tile: web anima gap 3→0 y padding vertical 6→5
  // (ClientNav.tsx:259-260, transition var(--dur-base)); antes RN los dejaba
  // estaticos → capsula minimizada ~4px mas alta que la web.
  const tileAnim = useAnimatedStyle(() => ({
    gap: withTiming(mini.value ? 0 : 3, { duration: 220, easing: EASE_OUT }),
    paddingVertical: withTiming(mini.value ? 5 : 6, { duration: 220, easing: EASE_OUT }),
  }))
  // Press feedback scale(0.96) 130ms ease-out (web `.eva-tabbar-press:active`,
  // globals.css:167-173), anulado bajo reduced-motion (globals.css:178-185).
  const pressed = useSharedValue(0)
  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: motion.reduced ? 1 : withTiming(pressed.value ? 0.96 : 1, { duration: 130, easing: EASE_OUT }) }],
  }))

  return (
    <AnimatedPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active ? { selected: true } : {}}
      onPress={onPress}
      onPressIn={() => {
        pressed.value = 1
      }}
      onPressOut={() => {
        pressed.value = 0
      }}
      hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
      style={[styles.tile, tileAnim, pressStyle]}
    >
      <View style={{ transform: [{ translateY: active ? -1 : 0 }] }}>
        {concept ? (
          <NavIconRN concept={concept} size={22} color={active ? activeColor : inactiveColor} />
        ) : (
          <Icon
            className={active ? 'text-primary' : 'text-muted'}
            size={22}
            strokeWidth={active ? 2.4 : 2.1}
          />
        )}
      </View>
      <Animated.View style={[styles.labelWrap, labelStyle]}>
        <Text
          numberOfLines={1}
          className={active ? 'text-primary' : 'text-muted'}
          style={[LABEL_BASE, { fontFamily: active ? FONT.uiExtra : FONT.uiSemibold }]}
        >
          {label}
        </Text>
      </Animated.View>
    </AnimatedPressable>
  )
}

// Pressable animable (scale de press + metricas del estado minimizado).
const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

const styles = StyleSheet.create({
  capsuleAnchor: {
    position: 'absolute',
    zIndex: 59,
  } as ViewStyle,
  capsuleShell: {
    borderRadius: CAPSULE_RADIUS,
  } as ViewStyle,
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    padding: CAPSULE_PAD,
    position: 'relative',
  },
  pill: {
    position: 'absolute',
    top: CAPSULE_PAD,
    bottom: CAPSULE_PAD,
    left: 0,
    borderRadius: PILL_RADIUS,
  },
  tile: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    // gap/paddingVertical los anima `tileAnim` (minimizado 3→0 / 6→5, web
    // ClientNav.tsx:259-260).
    // Above the absolutely-positioned sliding pill so taps always hit the tile.
    zIndex: 1,
  },
  labelWrap: {
    overflow: 'hidden',
    maxWidth: '100%',
  },
})
