import { useEffect, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BlurView } from 'expo-blur'
import { useRouter } from 'expo-router'
import { Dumbbell, Home, LayoutDashboard, Settings, Shield, Users, Utensils, type LucideIcon } from 'lucide-react-native'
import { MotiView } from 'moti'
import { deriveSportTokens } from '@eva/brand-kit'
import { coachWorkspaceTypeFromKind, getVisibleNavItems, type NavModule } from '@eva/coach-nav'
import { useTheme } from '../../context/ThemeContext'
import { useWorkspace } from '../../lib/workspace'
import { useEntitlements } from '../../lib/entitlements'
import { useCoachTabbarScroll } from './CoachTabbarScroll'

type TabRoute = { key: string; name: string }
type MobileNavRoute = { tab?: string; path: string; icon: LucideIcon; label: string }

const NAV_ROUTE: Record<string, MobileNavRoute> = {
  dashboard: { tab: 'home', path: '/coach/home', icon: Home, label: 'Inicio' },
  clients: { tab: 'clientes', path: '/coach/clientes', icon: Users, label: 'Alumnos' },
  programs: { tab: 'builder', path: '/coach/builder', icon: Dumbbell, label: 'Programas' },
  nutrition: { tab: 'nutricion', path: '/coach/nutricion', icon: Utensils, label: 'Nutrición' },
  options: { tab: 'settings', path: '/coach/settings', icon: Settings, label: 'Opciones' },
  settings_team: { tab: 'settings', path: '/coach/settings', icon: Settings, label: 'Opciones' },
  team: { tab: 'team', path: '/coach/team', icon: Shield, label: 'Equipo' },
  reactivate: { tab: 'reactivate', path: '/coach/reactivate', icon: LayoutDashboard, label: 'Reactivar' },
}

// Orden verbatim del responsive web; después de filtrar permisos toma hasta cinco
// accesos directos y nunca reserva un slot artificial para “Más”.
const MOBILE_TAB_KEYS = ['dashboard', 'clients', 'programs', 'nutrition', 'options', 'settings_team', 'team', 'reactivate'] as const

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
  const { minimized, reset } = useCoachTabbarScroll()
  const [barWidth, setBarWidth] = useState(0)
  const isDark = mode !== 'light'

  const routes = state.routes
  const activeName = routes[state.index]?.name
  useEffect(() => reset(), [activeName, reset])

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

  const byKey = new Map(visible.map((item) => [item.key, item]))
  const barItems = MOBILE_TAB_KEYS
    .map((key) => byKey.get(key))
    .filter((item): item is NavModule => !!item && !!NAV_ROUTE[item.key])
    .slice(0, 5)

  const n = barItems.length || 1
  const activeIndex = barItems.findIndex((item) => NAV_ROUTE[item.key]?.tab === activeName)
  const innerWidth = Math.max(0, barWidth - 16)
  const slotWidth = innerWidth / n
  const indicatorLeft = 8 + Math.max(0, activeIndex) * slotWidth
  const sport = deriveSportTokens(theme.primary)
  const activeColor = isDark ? sport.dark['600'] : sport.ramp['600']

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
      <MotiView
        animate={{ left: minimized ? 72 : 14, right: minimized ? 72 : 14 }}
        transition={{ type: 'spring', damping: 18, stiffness: 200 }}
        onLayout={(event) => setBarWidth(event.nativeEvent.layout.width)}
        style={[
          styles.capsule,
          {
            bottom: insets.bottom + 16,
            backgroundColor: hexToRgba(theme.card, 0.74),
            borderColor: hexToRgba(theme.foreground, 0.09),
          },
        ]}
      >
        <BlurView
          intensity={isDark ? 30 : 50}
          tint={isDark ? 'dark' : 'light'}
          experimentalBlurMethod="dimezisBlurView"
          style={StyleSheet.absoluteFill}
        />

        {activeIndex >= 0 && slotWidth > 0 ? (
          <MotiView
            animate={{ left: indicatorLeft }}
            transition={{ type: 'spring', damping: 18, stiffness: 200 }}
            style={[
              styles.indicator,
              {
                width: slotWidth,
                backgroundColor: hexToRgba(theme.primary, 0.15),
                borderColor: hexToRgba(theme.primary, 0.24),
              },
            ]}
          />
        ) : null}

        {barItems.map((item) => {
          const route = NAV_ROUTE[item.key]!
          const focused = route.tab === activeName
          const Icon = route.icon
          const color = focused ? activeColor : theme.ink400
          return (
            <TouchableOpacity
              key={item.key}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={route.label}
              testID={`coach-tab-${item.key}`}
              onPress={() => goTab(item)}
              style={[styles.tabButton, { gap: minimized ? 0 : 3, paddingVertical: minimized ? 5 : 6 }]}
            >
              <View style={[styles.iconWrap, { transform: [{ translateY: focused ? -1 : 0 }] }]}>
                <Icon
                  size={24}
                  color={color}
                  strokeWidth={2}
                  fill={focused ? hexToRgba(activeColor, 0.18) : 'transparent'}
                />
              </View>
              <MotiView
                animate={{ height: minimized ? 0 : 14, opacity: minimized ? 0 : 1 }}
                transition={{ type: 'timing', duration: 180 }}
                style={styles.labelClip}
              >
                <Text numberOfLines={1} style={[styles.tabLabel, { color, fontWeight: focused ? '800' : '600' }]}>
                  {route.label}
                </Text>
              </MotiView>
            </TouchableOpacity>
          )
        })}
      </MotiView>
    </View>
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
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <MotiView
        animate={{ left: minimized ? 72 : 14, right: minimized ? 72 : 14 }}
        transition={{ type: 'spring', damping: 18, stiffness: 200 }}
        style={[
          styles.capsule,
          { bottom, backgroundColor: hexToRgba(theme.card, 0.74), borderColor: hexToRgba(theme.foreground, 0.09) },
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
          style={[styles.tabButton, { gap: minimized ? 0 : 3, paddingVertical: minimized ? 5 : 6 }]}
        >
          <LayoutDashboard size={24} color={color} strokeWidth={2} fill={hexToRgba(color, 0.18)} />
          <MotiView animate={{ height: minimized ? 0 : 14, opacity: minimized ? 0 : 1 }} transition={{ type: 'timing', duration: 180 }} style={styles.labelClip}>
            <Text style={[styles.tabLabel, { color, fontWeight: '800' }]}>Reactivar</Text>
          </MotiView>
        </TouchableOpacity>
      </MotiView>
    </View>
  )
}

const styles = StyleSheet.create({
  capsule: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'stretch',
    padding: 8,
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
