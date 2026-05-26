import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native'
import { useRouter } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import {
  Apple,
  Bell,
  ClipboardList,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  HelpCircle,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Moon,
  Settings,
  Sun,
  Users,
  type LucideIcon,
} from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../context/ThemeContext'
import { getCoachProfile, type CoachProfile } from '../../lib/coach'
import { supabase } from '../../lib/supabase'

type TabRoute = {
  key: string
  name: string
}

type NavMeta = {
  label: string
  shortLabel: string
  icon: LucideIcon
}

const NAV_META: Record<string, NavMeta> = {
  home: {
    label: 'Dashboard',
    shortLabel: 'Inicio',
    icon: LayoutDashboard,
  },
  clientes: {
    label: 'Alumnos',
    shortLabel: 'Alumnos',
    icon: Users,
  },
  builder: {
    label: 'Programas',
    shortLabel: 'Planes',
    icon: ClipboardList,
  },
  ejercicios: {
    label: 'Ejercicios',
    shortLabel: 'Ejer.',
    icon: Dumbbell,
  },
  nutricion: {
    label: 'Nutricion',
    shortLabel: 'Nutri',
    icon: Apple,
  },
  settings: {
    label: 'Mi Marca',
    shortLabel: 'Marca',
    icon: Settings,
  },
  subscription: {
    label: 'Suscripcion',
    shortLabel: 'Plan',
    icon: CreditCard,
  },
  support: {
    label: 'Soporte',
    shortLabel: 'Ayuda',
    icon: LifeBuoy,
  },
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return `rgba(0,122,255,${alpha})`
  const r = Number.parseInt(clean.slice(0, 2), 16)
  const g = Number.parseInt(clean.slice(2, 4), 16)
  const b = Number.parseInt(clean.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export function CoachMobileHeader() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colorScheme = useColorScheme()
  const { theme, branding, mode, toggleTheme } = useTheme()
  const [coach, setCoach] = useState<CoachProfile | null>(null)

  useEffect(() => {
    let mounted = true
    getCoachProfile().then((profile) => {
      if (mounted) setCoach(profile)
    })
    return () => {
      mounted = false
    }
  }, [])

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.replace('/')
  }

  const title = coach?.brandName || coach?.fullName || branding?.displayName || 'EVA'
  const resolvedScheme = mode === 'system' ? colorScheme : mode
  const ModeIcon = resolvedScheme === 'dark' ? Moon : Sun

  return (
    <View
      style={[
        styles.header,
        {
          paddingTop: insets.top + 8,
          backgroundColor: theme.card,
          borderBottomColor: theme.border,
        },
      ]}
    >
      <View style={styles.brandCluster}>
        <View
          style={[
            styles.brandMark,
            {
              backgroundColor: hexToRgba(theme.primary, 0.12),
              borderColor: hexToRgba(theme.primary, 0.22),
            },
          ]}
        >
          <Text style={[styles.brandMarkText, { color: theme.primary }]}>E</Text>
        </View>
        <Text
          numberOfLines={1}
          style={[styles.headerTitle, { color: theme.foreground, fontFamily: theme.fontDisplay }]}
        >
          {title}
        </Text>
      </View>

      <View style={styles.headerActions}>
        <TouchableOpacity
          activeOpacity={0.75}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Noticias"
        >
          <Bell size={20} color={theme.mutedForeground} strokeWidth={2.2} />
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.75}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Modo visual"
          onPress={toggleTheme}
        >
          <ModeIcon size={20} color={theme.mutedForeground} strokeWidth={2.2} />
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.75}
          style={styles.headerButton}
          accessibilityRole="button"
          accessibilityLabel="Cerrar sesion"
          onPress={handleSignOut}
        >
          <LogOut size={20} color={theme.mutedForeground} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>
    </View>
  )
}

export function CoachMobileTabBar({
  state,
  descriptors,
  navigation,
}: {
  state: { index: number; routes: TabRoute[] }
  descriptors: Record<string, { options?: { title?: string; tabBarLabel?: unknown } }>
  navigation: any
}) {
  const insets = useSafeAreaInsets()
  const { theme } = useTheme()
  const scrollRef = useRef<ScrollView>(null)
  const pulse = useRef(new Animated.Value(0)).current
  const [viewportWidth, setViewportWidth] = useState(0)
  const [contentWidth, setContentWidth] = useState(0)
  const [scrollX, setScrollX] = useState(0)

  const canScrollLeft = scrollX > 4
  const canScrollRight = scrollX + viewportWidth < contentWidth - 4
  const routes = state.routes

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 850, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 850, useNativeDriver: true }),
      ])
    )
    loop.start()
    return () => loop.stop()
  }, [pulse])

  const arrowOffset = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 4],
  })

  const activeShadow = useMemo(
    () => ({
      shadowColor: theme.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: 0.22,
      shadowRadius: 14,
      elevation: 5,
    }),
    [theme.primary]
  )

  return (
    <View
      style={[
        styles.tabShell,
        {
          paddingBottom: insets.bottom,
          backgroundColor: theme.card,
          borderTopColor: theme.border,
        },
      ]}
    >
      {canScrollLeft && (
        <View
          pointerEvents="none"
          style={[
            styles.leftFade,
            {
              backgroundColor: theme.card,
            },
          ]}
        >
          <Animated.View style={{ transform: [{ translateX: Animated.multiply(arrowOffset, -1) }] }}>
            <ChevronLeft size={18} color={hexToRgba(theme.foreground, 0.55)} strokeWidth={2.4} />
          </Animated.View>
        </View>
      )}
      {canScrollRight && (
        <View
          pointerEvents="none"
          style={[
            styles.rightFade,
            {
              backgroundColor: theme.card,
            },
          ]}
        >
          <Animated.View style={{ transform: [{ translateX: arrowOffset }] }}>
            <ChevronRight size={18} color={hexToRgba(theme.foreground, 0.55)} strokeWidth={2.4} />
          </Animated.View>
        </View>
      )}

      <ScrollView
        ref={scrollRef}
        horizontal
        bounces
        showsHorizontalScrollIndicator={false}
        overScrollMode="never"
        scrollEventThrottle={16}
        contentContainerStyle={styles.tabScroller}
        onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
        onContentSizeChange={(width) => setContentWidth(width)}
        onScroll={(event) => setScrollX(event.nativeEvent.contentOffset.x)}
      >
        {routes.map((route, index) => {
          const focused = state.index === index
          const meta = NAV_META[route.name] ?? {
            label: descriptors[route.key]?.options?.title ?? route.name,
            shortLabel: descriptors[route.key]?.options?.tabBarLabel ?? route.name,
            icon: LayoutDashboard,
          }
          const Icon = meta.icon

          function onPress() {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            })
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name)
            }
          }

          return (
            <TouchableOpacity
              key={route.key}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={meta.label}
              onPress={onPress}
              style={styles.tabPressable}
            >
              <MotiView
                animate={{ scale: focused ? 1 : 0.98 }}
                transition={{ type: 'spring', damping: 16, stiffness: 230 }}
                style={[
                  styles.tabItem,
                  focused
                    ? [
                        {
                          backgroundColor: hexToRgba(theme.primary, 0.1),
                          borderColor: hexToRgba(theme.primary, 0.22),
                        },
                        activeShadow,
                      ]
                    : {
                        borderColor: 'transparent',
                        backgroundColor: 'transparent',
                      },
                ]}
              >
                <Icon
                  size={20}
                  color={focused ? theme.primary : theme.mutedForeground}
                  strokeWidth={focused ? 2.4 : 2.1}
                />
                <Text
                  numberOfLines={2}
                  style={[
                    styles.tabLabel,
                    {
                      color: focused ? theme.foreground : theme.mutedForeground,
                      fontFamily: 'Inter_600SemiBold',
                    },
                  ]}
                >
                  {meta.shortLabel}
                </Text>
              </MotiView>
            </TouchableOpacity>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    minHeight: 64,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  brandCluster: {
    minWidth: 0,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  brandMark: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandMarkText: {
    fontFamily: 'Montserrat_800ExtraBold',
    fontSize: 17,
    lineHeight: 20,
  },
  headerTitle: {
    maxWidth: 170,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerButton: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabShell: {
    position: 'relative',
    borderTopWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 18,
  },
  tabScroller: {
    paddingHorizontal: 4,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 2,
  },
  tabPressable: {
    minWidth: 58,
    maxWidth: 84,
    flexShrink: 0,
  },
  tabItem: {
    minHeight: 54,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 7,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  tabLabel: {
    maxWidth: 62,
    textAlign: 'center',
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0.2,
  },
  leftFade: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    zIndex: 2,
    width: 38,
    alignItems: 'flex-start',
    justifyContent: 'center',
    paddingLeft: 4,
    opacity: 0.92,
  },
  rightFade: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    zIndex: 2,
    width: 38,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 4,
    opacity: 0.92,
  },
})
