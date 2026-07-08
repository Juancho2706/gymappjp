import { useState } from 'react'
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BlurView } from 'expo-blur'
import {
  Apple,
  BookOpen,
  CheckCircle,
  History,
  Home,
  MoreHorizontal,
  User,
  type LucideIcon,
} from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../context/ThemeContext'
import { useEntitlements } from '../../lib/entitlements'

type TabRoute = {
  key: string
  name: string
}

type NavMeta = {
  label: string
  shortLabel: string
  icon: LucideIcon
}

// Labels verbatim del design source (docs/design-source/ui_kits/eva-app): el alumno ve
// Inicio · Plan · Aprender · Check-in · Más. La nutrición se muestra como "Plan" (paridad web).
const NAV_META: Record<string, NavMeta> = {
  home: {
    label: 'Inicio',
    shortLabel: 'Inicio',
    icon: Home,
  },
  nutricion: {
    label: 'Plan',
    shortLabel: 'Plan',
    icon: Apple,
  },
  exercises: {
    label: 'Aprender',
    shortLabel: 'Aprender',
    icon: BookOpen,
  },
  'check-in': {
    label: 'Check-in',
    shortLabel: 'Check-in',
    icon: CheckCircle,
  },
  history: {
    label: 'Historial',
    shortLabel: 'Historial',
    icon: History,
  },
  perfil: {
    label: 'Perfil',
    shortLabel: 'Perfil',
    icon: User,
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

// Primary thumb-zone tabs; the rest live behind "Más" (native pattern, no overflow scroll).
const PRIMARY_TABS = ['home', 'nutricion', 'exercises', 'check-in']

// "workout" se registra en (tabs)/_layout con href:null (se accede desde el hero card del
// Home, no como tab). Lo excluimos del overflow por si el navigator lo expone en state.routes.
const HIDDEN_FROM_OVERFLOW = ['workout']

export function AlumnoMobileChrome({
  state,
  navigation,
}: {
  state: { index: number; routes: TabRoute[] }
  descriptors: Record<string, { options?: { title?: string; tabBarLabel?: unknown } }>
  navigation: any
}) {
  const insets = useSafeAreaInsets()
  const { theme, mode } = useTheme()
  const { nutritionEnabled } = useEntitlements()
  const isDark = mode !== 'light'
  const [moreOpen, setMoreOpen] = useState(false)

  // E0-C3: gate del tab "Plan" (nutrición) — si el coach apagó el dominio Nutrición para este
  // alumno (master switch feature-prefs, espejo del nav web /c), se OCULTA del nav (render-only;
  // la ruta sigue existiendo). Fail-open: nutritionEnabled default true (nada se oculta ante
  // config sin resolver / error de red).
  const hidden = nutritionEnabled ? HIDDEN_FROM_OVERFLOW : [...HIDDEN_FROM_OVERFLOW, 'nutricion']

  const routes = state.routes
  const activeName = routes[state.index]?.name
  const primary = PRIMARY_TABS
    .filter((name) => !hidden.includes(name))
    .map((name) => routes.find((r) => r.name === name))
    .filter(Boolean) as TabRoute[]
  const overflow = routes.filter(
    (r) => !PRIMARY_TABS.includes(r.name) && !hidden.includes(r.name),
  )
  const overflowActive = !PRIMARY_TABS.includes(activeName)

  function go(name: string) {
    setMoreOpen(false)
    const route = routes.find((r) => r.name === name)
    if (!route) return
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
    if (activeName !== name && !event.defaultPrevented) navigation.navigate(name)
  }

  function TabButton({ focused, icon: Icon, label, onPress }: { focused: boolean; icon: LucideIcon; label: string; onPress: () => void }) {
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
      {/* Overflow ("Más") sheet — espejo del docked bar del coach */}
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
              const meta = NAV_META[r.name] ?? { label: r.name, shortLabel: r.name, icon: Home }
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
            const meta = NAV_META[r.name] ?? { label: r.name, shortLabel: r.name, icon: Home }
            return <TabButton key={r.key} focused={activeName === r.name} icon={meta.icon} label={meta.shortLabel} onPress={() => go(r.name)} />
          })}
          <TabButton focused={overflowActive} icon={MoreHorizontal} label="Más" onPress={() => setMoreOpen((o) => !o)} />
        </View>
      </BlurView>
    </>
  )
}

const styles = StyleSheet.create({
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
