import { useEffect } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BlurView } from 'expo-blur'
import { useRouter } from 'expo-router'
import { Dumbbell, Home, LayoutDashboard, Settings, Shield, Users, Utensils, type LucideIcon } from 'lucide-react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated'
import { SPRING, deriveSportTokens } from '@eva/brand-kit'
import { coachWorkspaceTypeFromKind, getVisibleNavItems, type NavModule } from '@eva/coach-nav'
import { useTheme } from '../../context/ThemeContext'
import { useWorkspace } from '../../lib/workspace'
import { useEntitlements } from '../../lib/entitlements'
import { NavIconRN, type NavConceptRN } from '../NavIconRN'
import { resetCoachTabbarScroll, useCoachTabbarMinimized } from './CoachTabbarScroll'

type TabRoute = { key: string; name: string }
// `concept` cablea la silueta propia del CEO (NavIconRN); si falta, se usa `icon` de lucide.
type MobileNavRoute = { tab?: string; path: string; icon: LucideIcon; label: string; concept?: NavConceptRN }

const NAV_ROUTE: Record<string, MobileNavRoute> = {
  dashboard: { tab: 'home', path: '/coach/home', icon: Home, label: 'Inicio', concept: 'home' },
  clients: { tab: 'clientes', path: '/coach/clientes', icon: Users, label: 'Alumnos', concept: 'alumnos' },
  programs: { tab: 'builder', path: '/coach/builder', icon: Dumbbell, label: 'Programas', concept: 'programas' },
  nutrition: { tab: 'nutricion', path: '/coach/nutricion', icon: Utensils, label: 'Nutrición', concept: 'nutricion' },
  options: { tab: 'settings', path: '/coach/settings', icon: Settings, label: 'Opciones', concept: 'ajustes' },
  settings_team: { tab: 'settings', path: '/coach/settings', icon: Settings, label: 'Opciones', concept: 'ajustes' },
  team: { tab: 'team', path: '/coach/team', icon: Shield, label: 'Equipo', concept: 'equipo' },
  reactivate: { tab: 'reactivate', path: '/coach/reactivate', icon: LayoutDashboard, label: 'Reactivar' },
}

// Orden verbatim del responsive web; despues de filtrar permisos toma hasta cinco
// accesos directos y nunca reserva un slot artificial para "Mas".
const MOBILE_TAB_KEYS = ['dashboard', 'clients', 'programs', 'nutrition', 'options', 'settings_team', 'team', 'reactivate'] as const

// Resorte compartido SPRING.ui de @eva/brand-kit (damping 18 / stiffness 220 /
// mass 1) — MISMO resorte que la capsula del alumno (AlumnoMobileChrome) y que la
// PWA (var(--ease-spring)), para que el achicar/agrandar al scrollear y el desliz
// del indicador se sientan 1:1 con el alumno. El ancho de la barra vive en un
// shared value (cero setState en el path animado) → el spring nunca se reinicia
// contra un blanco movil (era el rebote irregular reportado por el CEO).
const NAV_SPRING = SPRING.ui
const CAPSULE_PAD = 8
const INSET_OPEN = 14
const INSET_MIN = 72
const LABEL_H = 14

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return `rgba(0,122,255,${alpha})`
  const r = Number.parseInt(clean.slice(0, 2), 16)
  const g = Number.parseInt(clean.slice(2, 4), 16)
  const b = Number.parseInt(clean.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export function CoachMobileTabBar({
  state,
  navigation,
}: {
  state: { index: number; routes: TabRoute[] }
  descriptors?: Record<string, { options?: { title?: string; tabBarLabel?: unknown } }>
  navigation: any
}) {
  const insets = useSafeAreaInsets()
  const { theme, mode } = useTheme()
  const router = useRouter()
  const { kind, subscriptionState } = useWorkspace()
  const { hasModule, nutritionEnabled } = useEntitlements()
  const minimized = useCoachTabbarMinimized()
  const isDark = mode !== 'light'

  const routes = state.routes
  const activeName = routes[state.index]?.name

  // Revelar la capsula al cambiar de tab (misma semantica que el alumno).
  useEffect(() => {
    resetCoachTabbarScroll()
  }, [activeName])

  const visible = getVisibleNavItems({
    activeWorkspaceType: coachWorkspaceTypeFromKind(kind),
    subscriptionStatus: subscriptionState,
    enabledModules: {
      cardio: hasModule('cardio'),
      movement_assessment: hasModule('movement_assessment'),
    },
    disabledDomains: nutritionEnabled ? undefined : new Set(['nutrition']),
  })

  const blocked = visible.length === 1 && visible[0].key === 'reactivate'

  // ---- drivers Reanimated (declarados antes de cualquier return para no romper
  // el orden de hooks; el caso `blocked` renderiza ReactivateTabBar, que tiene los
  // suyos). ----
  const barW = useSharedValue(0)
  const mini = useSharedValue(minimized ? 1 : 0)

  const byKey = new Map(visible.map((item) => [item.key, item]))
  const barItems = MOBILE_TAB_KEYS
    .map((key) => byKey.get(key))
    .filter((item): item is NavModule => !!item && !!NAV_ROUTE[item.key])
    .slice(0, 5)

  const n = barItems.length || 1
  const activeIndex = barItems.findIndex((item) => NAV_ROUTE[item.key]?.tab === activeName)
  const activeIdx = useSharedValue(activeIndex)
  const sport = deriveSportTokens(theme.primary)
  const activeColor = isDark ? sport.dark['600'] : sport.ramp['600']

  useEffect(() => {
    mini.value = minimized ? 1 : 0
  }, [minimized, mini])
  useEffect(() => {
    activeIdx.value = activeIndex
  }, [activeIndex, activeIdx])

  const capsuleInsetStyle = useAnimatedStyle(() => {
    const inset = withSpring(mini.value ? INSET_MIN : INSET_OPEN, NAV_SPRING)
    return { left: inset, right: inset }
  })

  const indicatorStyle = useAnimatedStyle(() => {
    const inner = barW.value - CAPSULE_PAD * 2
    const w = n > 0 ? inner / n : 0
    const idx = activeIdx.value
    return {
      width: w,
      transform: [{ translateX: withSpring(CAPSULE_PAD + (idx < 0 ? 0 : idx) * w, NAV_SPRING) }],
      opacity: withTiming(idx < 0 ? 0 : 1, { duration: 160 }),
    }
  })

  if (blocked) {
    return (
      <ReactivateTabBar
        minimized={minimized}
        bottom={insets.bottom + 16}
        isDark={isDark}
        theme={theme}
        onPress={() => router.replace('/coach/reactivate')}
      />
    )
  }

  function goTab(item: NavModule) {
    const mobileRoute = NAV_ROUTE[item.key]
    const name = mobileRoute?.tab
    if (!name) {
      if (mobileRoute?.path) router.push(mobileRoute.path as never)
      return
    }
    const route = routes.find((candidate) => candidate.name === name)
    if (!route) return
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
    if (activeName !== name && !event.defaultPrevented) navigation.navigate(name)
  }

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View
        onLayout={(event) => {
          barW.value = event.nativeEvent.layout.width
        }}
        style={[
          styles.capsule,
          {
            bottom: insets.bottom + 16,
            backgroundColor: hexToRgba(theme.card, 0.74),
            borderColor: hexToRgba(theme.foreground, 0.09),
          },
          capsuleInsetStyle,
        ]}
      >
        <BlurView
          intensity={isDark ? 30 : 50}
          tint={isDark ? 'dark' : 'light'}
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
        />

        <Animated.View
          pointerEvents="none"
          style={[
            styles.indicator,
            {
              left: 0,
              backgroundColor: hexToRgba(theme.primary, 0.15),
              borderColor: hexToRgba(theme.primary, 0.24),
            },
            indicatorStyle,
          ]}
        />

        {barItems.map((item) => {
          const route = NAV_ROUTE[item.key]!
          const focused = route.tab === activeName
          return (
            <CoachTabTile
              key={item.key}
              testID={`coach-tab-${item.key}`}
              icon={route.icon}
              concept={route.concept}
              label={route.label}
              focused={focused}
              activeColor={activeColor}
              inactiveColor={theme.ink400}
              mini={mini}
              onPress={() => goTab(item)}
            />
          )
        })}
      </Animated.View>
    </View>
  )
}

function CoachTabTile({
  testID,
  icon: Icon,
  concept,
  label,
  focused,
  activeColor,
  inactiveColor,
  mini,
  onPress,
}: {
  testID: string
  icon: LucideIcon
  concept?: NavConceptRN
  label: string
  focused: boolean
  activeColor: string
  inactiveColor: string
  mini: SharedValue<number>
  onPress: () => void
}) {
  const color = focused ? activeColor : inactiveColor
  const labelStyle = useAnimatedStyle(() => ({
    opacity: withTiming(mini.value ? 0 : 1, { duration: 200 }),
    maxHeight: withTiming(mini.value ? 0 : LABEL_H, { duration: 200 }),
  }))
  return (
    <TouchableOpacity
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={label}
      testID={testID}
      onPress={onPress}
      style={styles.tabButton}
    >
      <View style={[styles.iconWrap, { transform: [{ translateY: focused ? -1 : 0 }] }]}>
        {concept ? (
          <NavIconRN concept={concept} size={24} color={color} />
        ) : (
          <Icon
            size={24}
            color={color}
            strokeWidth={2}
            fill={focused ? hexToRgba(activeColor, 0.18) : 'transparent'}
          />
        )}
      </View>
      <Animated.View style={[styles.labelClip, labelStyle]}>
        <Text numberOfLines={1} style={[styles.tabLabel, { color, fontWeight: focused ? '800' : '600' }]}>
          {label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  )
}

function ReactivateTabBar({ minimized, bottom, isDark, theme, onPress }: {
  minimized: boolean
  bottom: number
  isDark: boolean
  theme: ReturnType<typeof useTheme>['theme']
  onPress: () => void
}) {
  const sport = deriveSportTokens(theme.primary)
  const color = isDark ? sport.dark['600'] : sport.ramp['600']
  const mini = useSharedValue(minimized ? 1 : 0)
  useEffect(() => {
    mini.value = minimized ? 1 : 0
  }, [minimized, mini])

  const insetStyle = useAnimatedStyle(() => {
    const inset = withSpring(mini.value ? INSET_MIN : INSET_OPEN, NAV_SPRING)
    return { left: inset, right: inset }
  })
  const labelStyle = useAnimatedStyle(() => ({
    opacity: withTiming(mini.value ? 0 : 1, { duration: 200 }),
    maxHeight: withTiming(mini.value ? 0 : LABEL_H, { duration: 200 }),
  }))

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[
          styles.capsule,
          { bottom, backgroundColor: hexToRgba(theme.card, 0.74), borderColor: hexToRgba(theme.foreground, 0.09) },
          insetStyle,
        ]}
      >
        <BlurView intensity={isDark ? 30 : 50} tint={isDark ? 'dark' : 'light'} experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
        <View style={[styles.indicator, { left: 8, right: 8, backgroundColor: hexToRgba(theme.primary, 0.15), borderColor: hexToRgba(theme.primary, 0.24) }]} />
        <TouchableOpacity
          activeOpacity={0.82}
          accessibilityRole="button"
          accessibilityState={{ selected: true }}
          accessibilityLabel="Reactivar"
          testID="coach-tab-reactivate"
          onPress={onPress}
          style={styles.tabButton}
        >
          <LayoutDashboard size={24} color={color} strokeWidth={2} fill={hexToRgba(color, 0.18)} />
          <Animated.View style={[styles.labelClip, labelStyle]}>
            <Text style={[styles.tabLabel, { color, fontWeight: '800' }]}>Reactivar</Text>
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  )
}

const styles = StyleSheet.create({
  capsule: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'stretch',
    padding: CAPSULE_PAD,
    borderRadius: 30,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#0D121C',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.24,
    shadowRadius: 28,
    elevation: 18,
  },
  indicator: {
    position: 'absolute',
    top: 8,
    bottom: 8,
    borderRadius: 22,
    borderWidth: 1,
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 6,
    zIndex: 1,
  },
  iconWrap: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  labelClip: { overflow: 'hidden' },
  tabLabel: {
    fontFamily: 'HankenGrotesk_600SemiBold',
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0.1,
    textAlign: 'center',
  },
})
