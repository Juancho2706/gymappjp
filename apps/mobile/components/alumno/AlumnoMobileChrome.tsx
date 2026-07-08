import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import type { TextStyle, ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BlurView } from 'expo-blur'
import { cssInterop } from 'nativewind'
import Animated, {
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
import { shadow } from '../../lib/shadows'
import { Sheet } from '../Sheet'
import { ListRow } from '../ListRow'

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

const SPRING = { damping: 20, stiffness: 220, mass: 0.6 }
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
}

// The four thumb-zone primaries (web order). Nutrición is gated by the domain
// master switch (useEntitlements); the rest live behind "Más".
const PRIMARY_TABS: TabDef[] = [
  { name: 'home', label: 'Inicio', icon: Home, testID: 'tab-home' },
  { name: 'nutricion', label: 'Nutrición', icon: Apple, testID: 'tab-nutricion' },
  { name: 'exercises', label: 'Aprender', icon: Dumbbell, testID: 'tab-exercises' },
  { name: 'check-in', label: 'Check-in', icon: CheckCircle, testID: 'tab-check-in' },
]

// Routes reached from the "Más" sheet — keep the Más tab lit while inside them
// (mirror of web `moreRoutes`). `workout` is immersive and hides the chrome.
const MORE_ROUTES = ['perfil', 'history']

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
  const { resolvedScheme } = useTheme()
  const { nutritionEnabled } = useEntitlements()
  const minimized = useChromeMinimized()

  const router = useRouter()
  const [moreOpen, setMoreOpen] = useState(false)

  const activeName = state.routes[state.index]?.name

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

  // Reveal the capsule whenever the active tab changes.
  useEffect(() => {
    resetChromeScroll()
  }, [activeName])

  // Close the Más sheet on navigation (route change).
  useEffect(() => {
    setMoreOpen(false)
  }, [activeName])

  const capsuleInsetStyle = useAnimatedStyle(() => {
    const inset = withSpring(mini.value ? INSET_MIN : INSET_OPEN, SPRING)
    return { left: inset, right: inset }
  })

  const pillStyle = useAnimatedStyle(() => {
    const inner = rowW.value - CAPSULE_PAD * 2
    const w = tabCount > 0 ? inner / tabCount : 0
    const idx = activeIdx.value
    return {
      width: w,
      transform: [{ translateX: withSpring(CAPSULE_PAD + (idx < 0 ? 0 : idx) * w, SPRING) }],
      opacity: withTiming(idx < 0 ? 0 : 1, { duration: 160 }),
    }
  })

  function go(name: string) {
    setMoreOpen(false)
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
        {/* Shadow + surface backing on a plain View (className is safe here;
            the anchor above only carries the animated left/right insets). */}
        <View
          className="bg-surface-card/70"
          style={[{ borderRadius: CAPSULE_RADIUS }, shadow('lg', resolvedScheme)]}
        >
          <View className="overflow-hidden rounded-[30px] border border-subtle">
            <BlurView
              intensity={isDark ? 40 : 60}
              tint={isDark ? 'dark' : 'light'}
              style={StyleSheet.absoluteFill}
            />
            <View className="bg-surface-card/60" style={StyleSheet.absoluteFill} />

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
                  label={t.label}
                  testID={t.testID}
                  active={activeName === t.name}
                  mini={mini}
                  onPress={() => go(t.name)}
                />
              ))}
              <TabTile
                icon={MoreHorizontal}
                label="Más"
                testID="tab-mas"
                active={isMoreActive}
                mini={mini}
                onPress={() => setMoreOpen((o) => !o)}
              />
            </View>
          </View>
        </View>
      </Animated.View>

      {/* "Más" sheet — same entries as web (minus PWA install, N/A native). */}
      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="Más" snapPoints={['48%']}>
        <ListRow
          testID="mas-perfil"
          accessibilityLabel="Mi perfil"
          leading={
            <View className="h-9 w-9 items-center justify-center rounded-control bg-primary/[0.12]">
              <UserRound className="text-primary" size={18} strokeWidth={2.2} />
            </View>
          }
          title="Mi perfil"
          subtitle="Racha, módulos, cuenta y más"
          showChevron
          onPress={() => go('perfil')}
        />
        <ListRow
          testID="mas-historial"
          accessibilityLabel="Historial"
          leading={
            <View className="h-9 w-9 items-center justify-center rounded-control bg-surface-sunken">
              <History className="text-muted" size={18} strokeWidth={2.2} />
            </View>
          }
          title="Historial"
          showChevron
          onPress={() => go('history')}
        />

        <View className="mt-space-2 border-t border-subtle pt-space-3">
          <Pressable
            testID="mas-cerrar-sesion"
            accessibilityRole="button"
            accessibilityLabel="Cerrar sesión"
            onPress={handleSignOut}
            className="flex-row items-center gap-3 rounded-control px-space-4 py-space-3"
          >
            <LogOut className="text-danger-600" size={20} strokeWidth={2.2} />
            <Text className="font-sans-semibold text-[15px] text-danger-600">Cerrar sesión</Text>
          </Pressable>
        </View>
      </Sheet>
    </>
  )
}

function TabTile({
  icon: Icon,
  label,
  testID,
  active,
  mini,
  onPress,
}: {
  icon: LucideIcon
  label: string
  testID: string
  active: boolean
  mini: SharedValue<number>
  onPress: () => void
}) {
  const labelStyle = useAnimatedStyle(() => ({
    opacity: withTiming(mini.value ? 0 : 1, { duration: 200 }),
    maxHeight: withTiming(mini.value ? 0 : 14, { duration: 200 }),
  }))

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={active ? { selected: true } : {}}
      onPress={onPress}
      style={styles.tile}
    >
      <View style={{ transform: [{ translateY: active ? -1 : 0 }] }}>
        <Icon
          className={active ? 'text-primary' : 'text-muted'}
          size={22}
          strokeWidth={active ? 2.4 : 2.1}
        />
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
    </Pressable>
  )
}

const styles = StyleSheet.create({
  capsuleAnchor: {
    position: 'absolute',
    zIndex: 59,
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
    gap: 3,
    paddingVertical: 6,
  },
  labelWrap: {
    overflow: 'hidden',
    maxWidth: '100%',
  },
})
