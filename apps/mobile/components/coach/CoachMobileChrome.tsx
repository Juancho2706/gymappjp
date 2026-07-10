import { useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BlurView } from 'expo-blur'
import { useRouter } from 'expo-router'
import {
  Activity,
  ClipboardCheck,
  CreditCard,
  Dumbbell,
  HeartPulse,
  Home,
  LifeBuoy,
  MoreHorizontal,
  Settings,
  Shield,
  UserRound,
  Users,
  Utensils,
  type LucideIcon,
} from 'lucide-react-native'
import { MotiView } from 'moti'
import {
  coachWorkspaceTypeFromKind,
  getVisibleNavItems,
  splitForSidebar,
  type NavModule,
} from '@eva/coach-nav'
import { useTheme } from '../../context/ThemeContext'
import { useWorkspace } from '../../lib/workspace'
import { useEntitlements } from '../../lib/entitlements'
import { Sheet } from '../Sheet'

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

/**
 * Descriptor mobile por KEY del registro (@eva/coach-nav resuelve el icono POR LADO: aca a
 * lucide-react-native; los rotulos son los del diseno). `tab` = nombre de la Tabs.Screen del
 * layout (navegable via el tabBar); sin `tab` => ruta de stack (solo alcanzable por el sheet "Mas"
 * con router.push). El icono visible se override por key aca (fidelidad de diseno) sin tocar el
 * registro compartido.
 */
type MobileNavRoute = { tab?: string; path: string; icon: LucideIcon; label: string }

const NAV_ROUTE: Record<string, MobileNavRoute> = {
  dashboard: { tab: 'home', path: '/coach/home', icon: Home, label: 'Inicio' },
  clients: { tab: 'clientes', path: '/coach/clientes', icon: Users, label: 'Alumnos' },
  programs: { tab: 'builder', path: '/coach/builder', icon: Dumbbell, label: 'Programas' },
  nutrition: { tab: 'nutricion', path: '/coach/nutricion', icon: Utensils, label: 'Nutrición' },
  options: { tab: 'settings', path: '/coach/settings', icon: Settings, label: 'Opciones' },
  settings_team: { tab: 'settings', path: '/coach/settings', icon: Settings, label: 'Opciones' },
  support: { tab: 'support', path: '/coach/support', icon: LifeBuoy, label: 'Soporte' },
  // Modulos toggleables + team viven fuera del Tabs (stack) => solo en el sheet "Mas".
  team: { path: '/coach/settings/team', icon: Shield, label: 'Equipo' },
  cardio: { path: '/coach/cardio', icon: HeartPulse, label: 'Cardio' },
  movement: { path: '/coach/movement', icon: Activity, label: 'Movimiento' },
  reactivate: { path: '/coach/reactivate', icon: CreditCard, label: 'Reactivar' },
}

/**
 * Overflow legacy solo-RN (aun no tienen entrada en el registro web): la web los pliega dentro del
 * hub "Opciones". En mobile se listan al final del sheet "Mas" para no perder acceso.
 */
type OverflowEntry = { key: string; path: string; icon: LucideIcon; label: string }
const LEGACY_OVERFLOW: OverflowEntry[] = [
  { key: 'subscription', path: '/coach/subscription', icon: CreditCard, label: 'Suscripción' },
  { key: 'check-ins', path: '/coach/check-ins', icon: ClipboardCheck, label: 'Check-ins' },
  { key: 'perfil', path: '/coach/perfil', icon: UserRound, label: 'Mi cuenta' },
]

function toOverflowEntry(item: NavModule): OverflowEntry {
  const r = NAV_ROUTE[item.key]
  return { key: item.key, path: r?.path ?? item.href, icon: r?.icon ?? MoreHorizontal, label: r?.label ?? item.label }
}

// Bar flotante: hasta 5 slots. Cuando hay overflow (siempre, por el legacy solo-RN) se reserva el
// ultimo slot para "Mas" => 4 tabs primarios + "Mas". Paridad con los tabs web md (grupo primario
// + grupo secundario "Mas"): los items secundarios (Soporte + modulos) y el 5º primario (Opciones)
// caen al sheet. El registro compartido decide QUE es visible; esto solo lo reparte bar/sheet.
const MAX_BAR_SLOTS = 5

/**
 * TabBar del coach — capsula flotante de vidrio esmerilado (1:1 con el kit). Los items ya NO son
 * hardcodeados: se derivan de `getVisibleNavItems(workspace, entitlements, subscriptionState)`
 * (@eva/coach-nav, el MISMO resolver que el sidebar web). Tabs gated por modulos (cardio/movement
 * solo entitled), tab unico "Reactivar" cuando la suscripcion esta bloqueada, hub "Opciones"
 * consolidado y sheet "Mas" con el overflow.
 */
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
  const isDark = mode !== 'light'
  const [barWidth, setBarWidth] = useState(0)
  const [masOpen, setMasOpen] = useState(false)

  const routes = state.routes
  const activeName = routes[state.index]?.name

  // ── Derivacion desde el registro compartido ────────────────────────────────
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

  // Suscripcion bloqueada: la barra colapsa a un unico CTA "Reactivar" (link-out lo maneja la
  // pantalla /coach/reactivate — money-safety: E7-12).
  if (blocked) {
    return (
      <ReactivateBar
        insets={insets}
        theme={theme}
        isDark={isDark}
        onPress={() => router.replace(NAV_ROUTE.reactivate.path as never)}
      />
    )
  }

  const { primary, secondary } = splitForSidebar(visible)
  const barCapable = primary.filter((p) => NAV_ROUTE[p.key]?.tab)
  const primaryNonTab = primary.filter((p) => !NAV_ROUTE[p.key]?.tab) // p. ej. "Equipo"

  const barSlots = MAX_BAR_SLOTS - 1 // se reserva 1 slot para "Mas"
  const barItems = barCapable.slice(0, barSlots)
  const overflow: OverflowEntry[] = [
    ...barCapable.slice(barSlots).map(toOverflowEntry),
    ...primaryNonTab.map(toOverflowEntry),
    ...secondary.map(toOverflowEntry),
    ...LEGACY_OVERFLOW,
  ]

  // slots del bar = tabs primarios + boton "Mas".
  const n = barItems.length + 1
  const activeIndex = barItems.findIndex((b) => NAV_ROUTE[b.key]?.tab === activeName)

  const innerW = Math.max(0, barWidth - 16)
  const slot = innerW / n
  const indicatorLeft = 8 + Math.max(0, activeIndex) * slot

  function goTab(item: NavModule) {
    const name = NAV_ROUTE[item.key]?.tab
    if (!name) return
    const route = routes.find((r) => r.name === name)
    if (!route) return
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
    if (activeName !== name && !event.defaultPrevented) navigation.navigate(name)
  }

  function goOverflow(entry: OverflowEntry) {
    setMasOpen(false)
    router.push(entry.path as never)
  }

  return (
    <>
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

          {barItems.map((item) => {
            const route = NAV_ROUTE[item.key]!
            const focused = route.tab === activeName
            const Icon = route.icon
            const color = focused ? theme.primary : theme.mutedForeground
            return (
              <TouchableOpacity
                key={item.key}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityState={focused ? { selected: true } : {}}
                accessibilityLabel={route.label}
                testID={`coach-tab-${item.key}`}
                onPress={() => goTab(item)}
                style={styles.tabBtn}
              >
                <View style={[styles.iconWrap, { transform: [{ translateY: focused ? -1 : 0 }] }]}>
                  <Icon
                    size={23}
                    color={color}
                    strokeWidth={focused ? 2.4 : 2.1}
                    fill={focused ? hexToRgba(theme.primary, 0.18) : 'transparent'}
                  />
                </View>
                <Text numberOfLines={1} style={[styles.tabLabel, { color, fontWeight: focused ? '800' : '600' }]}>
                  {route.label}
                </Text>
              </TouchableOpacity>
            )
          })}

          {/* Slot "Mas" — abre el sheet de overflow. */}
          <TouchableOpacity
            activeOpacity={0.82}
            accessibilityRole="button"
            accessibilityLabel="Más opciones"
            testID="coach-tab-mas"
            onPress={() => setMasOpen(true)}
            style={styles.tabBtn}
          >
            <View style={styles.iconWrap}>
              <MoreHorizontal size={23} color={theme.mutedForeground} strokeWidth={2.1} />
            </View>
            <Text numberOfLines={1} style={[styles.tabLabel, { color: theme.mutedForeground, fontWeight: '600' }]}>
              Más
            </Text>
          </TouchableOpacity>
        </BlurView>
      </View>

      <Sheet open={masOpen} onClose={() => setMasOpen(false)} title="Más" snapPoints={['55%']}>
        {overflow.map((entry) => {
          const Icon = entry.icon
          return (
            <TouchableOpacity
              key={entry.key}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={entry.label}
              testID={`coach-mas-${entry.key}`}
              onPress={() => goOverflow(entry)}
              style={[styles.overflowRow, { borderColor: hexToRgba(theme.foreground, 0.08) }]}
            >
              <View style={[styles.overflowIcon, { backgroundColor: hexToRgba(theme.primary, 0.1) }]}>
                <Icon size={20} color={theme.primary} strokeWidth={2.1} />
              </View>
              <Text style={[styles.overflowLabel, { color: theme.foreground }]}>{entry.label}</Text>
            </TouchableOpacity>
          )
        })}
      </Sheet>
    </>
  )
}

/** Barra colapsada a un unico CTA "Reactivar" (suscripcion bloqueada). */
function ReactivateBar({
  insets,
  theme,
  isDark,
  onPress,
}: {
  insets: { bottom: number }
  theme: ReturnType<typeof useTheme>['theme']
  isDark: boolean
  onPress: () => void
}) {
  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <BlurView
        intensity={isDark ? 30 : 50}
        tint={isDark ? 'dark' : 'light'}
        experimentalBlurMethod="dimezisBlurView"
        style={[
          styles.capsule,
          {
            bottom: insets.bottom + 8,
            backgroundColor: hexToRgba(isDark ? '#0E1117' : '#FFFFFF', isDark ? 0.62 : 0.74),
            borderColor: hexToRgba(theme.foreground, 0.09),
          },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel="Reactivar suscripción"
          testID="coach-tab-reactivate"
          onPress={onPress}
          style={[styles.reactivateBtn, { backgroundColor: theme.primary }]}
        >
          <CreditCard size={20} color={theme.primaryForeground} strokeWidth={2.3} />
          <Text style={[styles.reactivateLabel, { color: theme.primaryForeground }]}>Reactivar suscripción</Text>
        </TouchableOpacity>
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
  iconWrap: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontFamily: 'HankenGrotesk_600SemiBold',
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 0.1,
    textAlign: 'center',
  },
  reactivateBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 22,
    zIndex: 1,
  },
  reactivateLabel: {
    fontFamily: 'HankenGrotesk_600SemiBold',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  overflowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  overflowIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  overflowLabel: {
    fontFamily: 'HankenGrotesk_600SemiBold',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
})
