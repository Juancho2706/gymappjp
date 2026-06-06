import { useEffect, useState } from 'react'
import {
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native'
import { useRouter } from 'expo-router'
import { Image } from 'expo-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BlurView } from 'expo-blur'
import {
  Apple,
  ClipboardList,
  CreditCard,
  Dumbbell,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  MoreHorizontal,
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
  'check-ins': {
    label: 'Check-ins',
    shortLabel: 'Check-ins',
    icon: ClipboardList,
  },
  perfil: {
    label: 'Mi cuenta',
    shortLabel: 'Cuenta',
    icon: Settings,
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
          {coach?.logoUrl ? (
            <Image source={{ uri: coach.logoUrl }} style={styles.brandLogo} contentFit="cover" transition={150} />
          ) : (
            <Text style={[styles.brandMarkText, { color: theme.primary }]}>{(title || 'E').charAt(0).toUpperCase()}</Text>
          )}
        </View>
        <Text
          numberOfLines={1}
          style={[styles.headerTitle, { color: theme.foreground, fontFamily: theme.fontDisplay }]}
        >
          {title}
        </Text>
      </View>

      <View style={styles.headerActions}>
        {/* O-F2/TX-3: el botón "Noticias" no tenía acción (botón muerto). Removido hasta
            que exista una pantalla de novedades. */}
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

// Primary thumb-zone tabs; the rest live behind "Más" (native pattern, no overflow scroll).
const PRIMARY_TABS = ['home', 'clientes', 'builder', 'nutricion']

export function CoachMobileTabBar({
  state,
  navigation,
}: {
  state: { index: number; routes: TabRoute[] }
  descriptors: Record<string, { options?: { title?: string; tabBarLabel?: unknown } }>
  navigation: any
}) {
  const insets = useSafeAreaInsets()
  const { theme, mode } = useTheme()
  const isDark = mode !== 'light'
  const [moreOpen, setMoreOpen] = useState(false)

  const routes = state.routes
  const activeName = routes[state.index]?.name
  const primary = PRIMARY_TABS
    .map((name) => routes.find((r) => r.name === name))
    .filter(Boolean) as TabRoute[]
  const overflow = routes.filter((r) => !PRIMARY_TABS.includes(r.name))
  const overflowActive = !PRIMARY_TABS.includes(activeName)

  function go(name: string) {
    setMoreOpen(false)
    const route = routes.find((r) => r.name === name)
    if (!route) return
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
    if (activeName !== name && !event.defaultPrevented) navigation.navigate(name)
  }

  function TabButton({ name, focused, icon: Icon, label, onPress }: { name: string; focused: boolean; icon: LucideIcon; label: string; onPress: () => void }) {
    return (
      <TouchableOpacity activeOpacity={0.82} accessibilityRole="button" accessibilityState={focused ? { selected: true } : {}} accessibilityLabel={label} onPress={onPress} style={styles.tabPressable}>
        <MotiView animate={{ scale: focused ? 1 : 0.96 }} transition={{ type: 'spring', damping: 16, stiffness: 230 }}
          style={[styles.tabItem, focused ? { backgroundColor: hexToRgba(theme.primary, 0.1) } : null]}>
          <Icon size={22} color={focused ? theme.primary : theme.mutedForeground} strokeWidth={focused ? 2.4 : 2.1} />
          <Text numberOfLines={1} style={[styles.tabLabel, { color: focused ? theme.primary : theme.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>{label}</Text>
        </MotiView>
      </TouchableOpacity>
    )
  }

  return (
    <>
      {/* Overflow ("Más") sheet */}
      {moreOpen && (
        <>
          <Pressable style={styles.backdrop} onPress={() => setMoreOpen(false)} />
          <MotiView
            from={{ opacity: 0, translateY: 16 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 180 }}
            style={[styles.morePanel, { bottom: insets.bottom + 64, backgroundColor: theme.card, borderColor: theme.border }]}
          >
            {overflow.map((r) => {
              const meta = NAV_META[r.name] ?? { label: r.name, shortLabel: r.name, icon: LayoutDashboard }
              const Icon = meta.icon
              const focused = activeName === r.name
              return (
                <TouchableOpacity key={r.key} activeOpacity={0.75} onPress={() => go(r.name)} style={styles.moreRow}>
                  <Icon size={19} color={focused ? theme.primary : theme.mutedForeground} strokeWidth={2.2} />
                  <Text style={[styles.moreRowText, { color: focused ? theme.primary : theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>{meta.label}</Text>
                </TouchableOpacity>
              )
            })}
          </MotiView>
        </>
      )}

      {/* Tab bar — blur on iOS/Android (key surface), home-indicator inset */}
      <BlurView intensity={isDark ? 32 : 48} tint={isDark ? 'dark' : 'light'} style={[styles.tabShell, { paddingBottom: insets.bottom, borderTopColor: theme.border }]}>
        <View style={styles.tabRow}>
          {primary.map((r) => {
            const meta = NAV_META[r.name] ?? { label: r.name, shortLabel: r.name, icon: LayoutDashboard }
            return <TabButton key={r.key} name={r.name} focused={activeName === r.name} icon={meta.icon} label={meta.shortLabel} onPress={() => go(r.name)} />
          })}
          <TabButton name="__more" focused={overflowActive} icon={MoreHorizontal} label="Más" onPress={() => setMoreOpen((o) => !o)} />
        </View>
      </BlurView>
    </>
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
    overflow: 'hidden',
  },
  brandLogo: { width: 32, height: 32 },
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
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabRow: {
    flexDirection: 'row',
    paddingHorizontal: 6,
    paddingTop: 8,
  },
  tabPressable: {
    flex: 1,
  },
  tabItem: {
    minHeight: 50,
    borderRadius: 14,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabLabel: {
    textAlign: 'center',
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0.2,
  },
  backdrop: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    zIndex: 40,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  morePanel: {
    position: 'absolute',
    right: 12,
    left: 12,
    zIndex: 50,
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 20,
  },
  moreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  moreRowText: {
    fontSize: 15,
  },
})
