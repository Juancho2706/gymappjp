import { useEffect, useState } from 'react'
import {
  Linking,
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
  MoreHorizontal,
  Moon,
  Sun,
  LogOut,
  Building2,
  type LucideIcon,
} from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../context/ThemeContext'
import { getCoachProfile, type CoachProfile } from '../../lib/coach'
import { supabase } from '../../lib/supabase'
import { signOutAndCleanup } from '../../lib/auth-actions'
import {
  getVisibleNavItems,
  splitNavItems,
  MOBILE_PRIMARY_KEYS,
  type NavModule,
} from '../../lib/coach-nav'
import { useCoachNavContext } from '../../lib/use-coach-nav-context'
import { NewsBell } from './NewsBell'
import { CoachWorkspaceSwitcher } from './CoachWorkspaceSwitcher'

type TabRoute = { key: string; name: string }

/**
 * Rutas del registro nav (coach-nav) que NO son screens de la tab-group `(tabs)`, sino rutas
 * hermanas (router.push) o links externos. El bottom bar navega a estas vía router/Linking en
 * vez de `navigation.navigate(<tab>)`.
 */
const PUSH_ROUTES: Record<string, string> = {
  cardio: '/coach/cardio',
  movimiento: '/coach/movement',
  team: '/coach/team',
}
// "Reactivar" → la gestión de pago vive en la web (mobile es display-only para billing).
const REACTIVATE_URL = 'https://eva-app.cl/coach/reactivate'
// "Panel empresa" → el panel org admin (/org/[slug]) es web-only; el coach org_owner/org_admin
// lo abre en el navegador (espejo del link de CoachSidebar web).
const ORG_PANEL_BASE_URL = 'https://eva-app.cl/org'

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return `rgba(0,122,255,${alpha})`
  const r = Number.parseInt(clean.slice(0, 2), 16)
  const g = Number.parseInt(clean.slice(2, 4), 16)
  const b = Number.parseInt(clean.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

// ─────────────────────────────────────── HEADER ───────────────────────────────────────
export function CoachMobileHeader() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const colorScheme = useColorScheme()
  const { theme, branding, mode, toggleTheme } = useTheme()
  const [coach, setCoach] = useState<CoachProfile | null>(null)
  // Slug de la org cuando el coach es org_owner/org_admin (gate del link "Panel empresa",
  // espejo de CoachSidebar web: enterpriseContext && orgRole in {org_owner,org_admin}).
  const [orgPanelSlug, setOrgPanelSlug] = useState<string | null>(null)
  const nav = useCoachNavContext()

  useEffect(() => {
    let mounted = true
    getCoachProfile().then((profile) => {
      if (mounted) setCoach(profile)
    })
    return () => {
      mounted = false
    }
  }, [])

  // Acceso "Panel empresa": leer org_id/org_role del JWT (app_metadata, NUNCA del body) y, si el
  // rol es admin, resolver el slug de la org. El panel org vive en la web → se abre vía Linking.
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const meta = session?.user?.app_metadata as Record<string, string> | undefined
        const orgId = meta?.org_id ?? null
        const orgRole = meta?.org_role ?? null
        if (!orgId || (orgRole !== 'org_owner' && orgRole !== 'org_admin')) {
          if (mounted) setOrgPanelSlug(null)
          return
        }
        const { data } = await supabase
          .from('organizations')
          .select('slug')
          .eq('id', orgId)
          .maybeSingle()
        if (mounted) setOrgPanelSlug((data as { slug?: string | null } | null)?.slug ?? null)
      } catch {
        if (mounted) setOrgPanelSlug(null)
      }
    })()
    return () => {
      mounted = false
    }
  }, [])

  async function handleSignOut() {
    await signOutAndCleanup()
    router.replace('/')
  }

  function openOrgPanel() {
    if (!orgPanelSlug) return
    Linking.openURL(`${ORG_PANEL_BASE_URL}/${orgPanelSlug}`).catch(() => {})
  }

  const title = coach?.brandName || coach?.fullName || branding?.displayName || 'EVA'
  const resolvedScheme = mode === 'system' ? colorScheme : mode
  const ModeIcon = resolvedScheme === 'dark' ? Moon : Sun

  return (
    <View
      style={[
        styles.header,
        { paddingTop: insets.top + 8, backgroundColor: theme.card, borderBottomColor: theme.border },
      ]}
    >
      <View style={styles.brandCluster}>
        <View
          style={[
            styles.brandMark,
            { backgroundColor: hexToRgba(theme.primary, 0.12), borderColor: hexToRgba(theme.primary, 0.22) },
          ]}
        >
          {coach?.logoUrl ? (
            <Image source={{ uri: coach.logoUrl }} style={styles.brandLogo} contentFit="cover" transition={150} />
          ) : (
            <Text style={[styles.brandMarkText, { color: theme.primary }]}>{(title || 'E').charAt(0).toUpperCase()}</Text>
          )}
        </View>
        <Text numberOfLines={1} style={[styles.headerTitle, { color: theme.foreground, fontFamily: theme.fontDisplay }]}>
          {title}
        </Text>
      </View>

      <View style={styles.headerActions}>
        {/* Cambiador de workspace (oculto con <=1 workspace, igual que web). */}
        <CoachWorkspaceSwitcher
          workspaces={nav.workspaces}
          currentKey={nav.activeWorkspaceKey}
          onSelect={nav.selectWorkspace}
        />
        {/* "Panel empresa": solo org_owner/org_admin; abre /org/[slug] en la web (espejo del
            link primario de CoachSidebar). El panel org no existe en mobile. */}
        {orgPanelSlug && (
          <TouchableOpacity
            activeOpacity={0.75}
            style={[
              styles.orgPanelButton,
              {
                backgroundColor: hexToRgba(theme.primary, 0.1),
                borderColor: hexToRgba(theme.primary, 0.22),
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Panel empresa"
            onPress={openOrgPanel}
          >
            <Building2 size={18} color={theme.primary} strokeWidth={2.2} />
          </TouchableOpacity>
        )}
        {/* Campana de novedades — espejo de NewsBellButton (web). */}
        <NewsBell />
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

// ─────────────────────────────────────── TAB BAR ──────────────────────────────────────
export function CoachMobileTabBar({
  state,
  navigation,
}: {
  state: { index: number; routes: TabRoute[] }
  descriptors: Record<string, { options?: { title?: string; tabBarLabel?: unknown } }>
  navigation: any
}) {
  const insets = useSafeAreaInsets()
  const router = useRouter()
  const { theme, mode } = useTheme()
  const isDark = mode !== 'light'
  const [moreOpen, setMoreOpen] = useState(false)
  const nav = useCoachNavContext()

  const routes = state.routes
  const activeName = routes[state.index]?.name

  // Items visibles del registro (espejo EXACTO de getVisibleNavItems). Status bloqueado ⇒ [Reactivar].
  const visible = getVisibleNavItems({
    activeWorkspaceType: nav.activeWorkspaceType,
    subscriptionStatus: nav.subscriptionStatus,
    enabledModules: nav.enabledModules,
    disabledDomains: nav.disabledDomains,
  })
  // Paridad estructural con web (core/modules). El bottom bar mobile es plano [...core, ...modules]
  // — no renderiza el divisor "MÓDULOS" (eso es solo desktop). Se computa para mantener el espejo
  // de splitNavItems vivo y anti-drift.
  const { modules: moduleNavItems } = splitNavItems(visible)
  void moduleNavItems

  const blocked = visible.length === 1 && visible[0].key === 'reactivate'

  // Primarios por key (espejo de MOBILE_PRIMARY_KEYS); el resto va a "Más".
  const primaryKeys = new Set<string>(MOBILE_PRIMARY_KEYS)
  const primary = MOBILE_PRIMARY_KEYS
    .map((k) => visible.find((i) => i.key === k))
    .filter((i): i is NavModule => i != null)
  const overflow = visible.filter((i) => !primaryKeys.has(i.key))
  const hasOverflow = overflow.length > 0

  const isItemActive = (item: NavModule): boolean => {
    // Para tabs registrados, comparar contra el screen activo; para push-routes no hay "activo".
    return activeName === item.route
  }
  const overflowActive = overflow.some(isItemActive)

  function goToItem(item: NavModule) {
    setMoreOpen(false)
    if (item.key === 'reactivate') {
      Linking.openURL(REACTIVATE_URL).catch(() => {})
      return
    }
    const pushHref = PUSH_ROUTES[item.route]
    if (pushHref) {
      router.push(pushHref as any)
      return
    }
    // Tab registrado.
    const route = routes.find((r) => r.name === item.route)
    if (!route) {
      router.push(`/coach/${item.route}` as any)
      return
    }
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
    if (activeName !== item.route && !event.defaultPrevented) navigation.navigate(item.route)
  }

  function TabButton({
    focused,
    icon: Icon,
    label,
    onPress,
    accessibilityLabel,
  }: {
    focused: boolean
    icon: LucideIcon
    label: string
    onPress: () => void
    accessibilityLabel: string
  }) {
    return (
      <TouchableOpacity
        activeOpacity={0.82}
        accessibilityRole="button"
        accessibilityState={focused ? { selected: true } : {}}
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={styles.tabPressable}
      >
        <MotiView
          animate={{ scale: focused ? 1 : 0.96 }}
          transition={{ type: 'spring', damping: 16, stiffness: 230 }}
          style={[styles.tabItem, focused ? { backgroundColor: hexToRgba(theme.primary, 0.1) } : null]}
        >
          <Icon size={22} color={focused ? theme.primary : theme.mutedForeground} strokeWidth={focused ? 2.4 : 2.1} />
          <Text
            numberOfLines={1}
            style={[styles.tabLabel, { color: focused ? theme.primary : theme.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}
          >
            {label}
          </Text>
        </MotiView>
      </TouchableOpacity>
    )
  }

  // Estado bloqueado: única tile "Reactivar" (espejo del colapso a [Reactivar] de la web).
  if (blocked) {
    const item = visible[0]
    return (
      <BlurView
        intensity={isDark ? 32 : 48}
        tint={isDark ? 'dark' : 'light'}
        style={[styles.tabShell, { paddingBottom: insets.bottom, borderTopColor: theme.border }]}
      >
        <View style={styles.tabRow}>
          <TabButton
            focused={false}
            icon={item.icon}
            label={item.shortLabel}
            accessibilityLabel={item.label}
            onPress={() => goToItem(item)}
          />
        </View>
      </BlurView>
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
            <Text style={[styles.moreHeading, { color: theme.mutedForeground }]}>MÁS</Text>
            {overflow.map((item) => {
              const Icon = item.icon
              const focused = isItemActive(item)
              return (
                <TouchableOpacity
                  key={item.key}
                  activeOpacity={0.75}
                  onPress={() => goToItem(item)}
                  style={styles.moreRow}
                  accessibilityRole="button"
                  accessibilityLabel={item.label}
                >
                  <Icon size={19} color={focused ? theme.primary : theme.mutedForeground} strokeWidth={2.2} />
                  <Text
                    style={[styles.moreRowText, { color: focused ? theme.primary : theme.foreground, fontFamily: 'Inter_600SemiBold' }]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </MotiView>
        </>
      )}

      {/* Tab bar — blur surface, home-indicator inset */}
      <BlurView
        intensity={isDark ? 32 : 48}
        tint={isDark ? 'dark' : 'light'}
        style={[styles.tabShell, { paddingBottom: insets.bottom, borderTopColor: theme.border }]}
      >
        <View style={styles.tabRow}>
          {primary.map((item) => (
            <TabButton
              key={item.key}
              focused={isItemActive(item)}
              icon={item.icon}
              label={item.shortLabel}
              accessibilityLabel={item.label}
              onPress={() => goToItem(item)}
            />
          ))}
          {hasOverflow && (
            <TabButton
              focused={overflowActive || moreOpen}
              icon={MoreHorizontal}
              label="Más"
              accessibilityLabel="Más opciones de navegación"
              onPress={() => setMoreOpen((o) => !o)}
            />
          )}
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
  brandCluster: { minWidth: 0, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
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
  brandMarkText: { fontFamily: 'Montserrat_800ExtraBold', fontSize: 17, lineHeight: 20 },
  headerTitle: { maxWidth: 150, fontSize: 16, lineHeight: 20, fontWeight: '700' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerButton: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  orgPanelButton: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabShell: { borderTopWidth: StyleSheet.hairlineWidth },
  tabRow: { flexDirection: 'row', paddingHorizontal: 6, paddingTop: 8 },
  tabPressable: { flex: 1 },
  tabItem: {
    minHeight: 50,
    borderRadius: 14,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabLabel: { textAlign: 'center', fontSize: 10, lineHeight: 12, letterSpacing: 0.2 },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
  moreHeading: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
  },
  moreRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  moreRowText: { fontSize: 15 },
})
