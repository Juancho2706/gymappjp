import { useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BlurView } from 'expo-blur'
import {
  Dumbbell,
  Home,
  Settings,
  Users,
  Utensils,
  type LucideIcon,
} from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../context/ThemeContext'

type TabRoute = {
  key: string
  name: string
}

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return `rgba(0,122,255,${alpha})`
  const r = Number.parseInt(clean.slice(0, 2), 16)
  const g = Number.parseInt(clean.slice(2, 4), 16)
  const b = Number.parseInt(clean.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// EVA TabBar — cápsula flotante de vidrio esmerilado (1:1 con docs/design-source
// components/navigation/TabBar.jsx → `floating`). Decisión del DS: la navegación
// del coach y del alumno es SIEMPRE flotante. Items exactos del index.html del kit:
// Inicio · Alumnos · Programas · Nutrición · Opciones (icons house/users/dumbbell/
// utensils/settings, size 23). El resto de screens (ejercicios/soporte/suscripción/
// check-ins/perfil) viven detrás de "Opciones" — no en la barra.
const TABS: Array<{ name: string; label: string; icon: LucideIcon }> = [
  { name: 'home', label: 'Inicio', icon: Home },
  { name: 'clientes', label: 'Alumnos', icon: Users },
  { name: 'builder', label: 'Programas', icon: Dumbbell },
  { name: 'nutricion', label: 'Nutrición', icon: Utensils },
  { name: 'settings', label: 'Opciones', icon: Settings },
]

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
  const isDark = mode !== 'light'
  const [barWidth, setBarWidth] = useState(0)

  const routes = state.routes
  const activeName = routes[state.index]?.name
  const activeIndex = TABS.findIndex((t) => t.name === activeName)
  const n = TABS.length

  // padding 8 a cada lado → ancho interno = barWidth - 16; cada slot = innerW / n.
  const innerW = Math.max(0, barWidth - 16)
  const slot = innerW / n
  const indicatorLeft = 8 + Math.max(0, activeIndex) * slot

  function go(name: string) {
    const route = routes.find((r) => r.name === name)
    if (!route) return
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
    if (activeName !== name && !event.defaultPrevented) navigation.navigate(name)
  }

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <BlurView
        intensity={isDark ? 30 : 50}
        tint={isDark ? 'dark' : 'light'}
        experimentalBlurMethod="dimezisBlurView"
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
        style={[
          styles.capsule,
          {
            bottom: insets.bottom + 8,
            backgroundColor: hexToRgba(isDark ? '#0E1117' : '#FFFFFF', isDark ? 0.62 : 0.74),
            borderColor: hexToRgba(theme.foreground, 0.09),
          },
        ]}
      >
        {/* indicador brand-tinted que se desliza detrás del tab activo */}
        {activeIndex >= 0 && slot > 0 ? (
          <MotiView
            animate={{ left: indicatorLeft }}
            transition={{ type: 'spring', damping: 18, stiffness: 200 }}
            style={{
              position: 'absolute',
              top: 8,
              bottom: 8,
              width: slot,
              borderRadius: 22,
              backgroundColor: hexToRgba(theme.primary, 0.15),
              borderWidth: 1,
              borderColor: hexToRgba(theme.primary, 0.24),
            }}
          />
        ) : null}

        {TABS.map((t) => {
          const focused = activeName === t.name
          const Icon = t.icon
          const color = focused ? theme.primary : theme.mutedForeground
          return (
            <TouchableOpacity
              key={t.name}
              activeOpacity={0.82}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              accessibilityLabel={t.label}
              onPress={() => go(t.name)}
              style={styles.tabBtn}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: [{ translateY: focused ? -1 : 0 }],
                }}
              >
                <Icon
                  size={23}
                  color={color}
                  strokeWidth={focused ? 2.4 : 2.1}
                  fill={focused ? hexToRgba(theme.primary, 0.18) : 'transparent'}
                />
              </View>
              <Text numberOfLines={1} style={[styles.tabLabel, { color, fontWeight: focused ? '800' : '600' }]}>
                {t.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </BlurView>
    </View>
  )
}

const styles = StyleSheet.create({
  capsule: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'stretch',
    padding: 8,
    borderRadius: 30,
    borderWidth: 1,
    overflow: 'hidden',
    // 0 14px 36px rgba(13,18,28,0.24) + capa corta (sombra DS cool-tinted)
    shadowColor: '#0D121C',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.24,
    shadowRadius: 28,
    elevation: 18,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 6,
    zIndex: 1,
  },
  tabLabel: {
    fontFamily: 'HankenGrotesk_600SemiBold',
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0.1,
    textAlign: 'center',
  },
})
