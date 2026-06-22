import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Apple, ArrowRight, Bell, Check, ClipboardList, CreditCard, ExternalLink, HeartPulse, LayoutList, LogOut, Package, Palette, SlidersHorizontal, User, Users } from 'lucide-react-native'
import { MotiView } from 'moti'
import { supabase } from '../../../lib/supabase'
import { hasModule } from '../../../lib/entitlements'
import { getMyTeamOverview } from '../../../lib/team'
import { signOutAndCleanup } from '../../../lib/auth-actions'
import { getCoachProfile, CoachProfile } from '../../../lib/coach'
import { canUseBranding } from '../../../lib/coach-tiers'
import { getCoachOrgContext, CoachOrgContext, orgRoleLabel } from '../../../lib/org'
import { useTheme } from '../../../context/ThemeContext'
import type { Theme } from '../../../lib/theme'
import { Button, InfoRow, Section } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import * as Notifications from 'expo-notifications'
import { syncPushToken } from '../../../lib/push'

const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  trial: 'Periodo de prueba',
  past_due: 'Pago pendiente',
  canceled: 'Cancelado',
  inactive: 'Inactivo',
}

const TIER_LABELS: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  elite: 'Elite',
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function CoachPerfilScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const [coach, setCoach] = useState<CoachProfile | null>(null)
  const [org, setOrg] = useState<CoachOrgContext | null>(null)
  const [subscriptionDetails, setSubscriptionDetails] = useState<{
    tier: string | null
    currentPeriodEnd: string | null
    trialEndsAt: string | null
  } | null>(null)
  const [activeClientCount, setActiveClientCount] = useState<number | null>(null)
  const [pushEnabled, setPushEnabled] = useState(false)
  const [cardioEnabled, setCardioEnabled] = useState(false)
  const [movementEnabled, setMovementEnabled] = useState(false)
  const [hasTeam, setHasTeam] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load().catch(() => setLoading(false))
    // Reflejar el estado REAL del permiso del SO (no asumir off).
    Notifications.getPermissionsAsync().then(({ status }) => setPushEnabled(status === 'granted')).catch(() => {})
    // Mostrar accesos a módulos de pago según entitlement (gate real = server-side).
    hasModule('cardio').then(setCardioEnabled).catch(() => {})
    hasModule('movement_assessment').then(setMovementEnabled).catch(() => {})
    getMyTeamOverview().then((t) => setHasTeam(!!t)).catch(() => {})
  }, [])

  async function togglePush(value: boolean) {
    if (value && coach) {
      await syncPushToken(coach.id, supabase).catch(() => {})
      const { status } = await Notifications.getPermissionsAsync()
      setPushEnabled(status === 'granted')
    } else {
      // El permiso del SO se gestiona en Ajustes del teléfono; acá solo reflejamos.
      setPushEnabled(false)
    }
  }

  async function load() {
    setLoading(true)
    const [coachData, orgData] = await Promise.all([getCoachProfile(), getCoachOrgContext()])
    setCoach(coachData)
    setOrg(orgData)

    if (coachData) {
      const [{ data: subData }, { count }] = await Promise.all([
        orgData.isOrgManaged
          ? Promise.resolve({ data: null })
          : supabase
              .from('coaches')
              .select('subscription_tier, current_period_end, trial_ends_at')
              .eq('id', coachData.id)
              .maybeSingle(),
        supabase
          .from('clients')
          .select('*', { count: 'exact', head: true })
          .eq('coach_id', coachData.id)
          .eq('is_active', true),
      ])
      if (subData) {
        setSubscriptionDetails({
          tier: subData.subscription_tier,
          currentPeriodEnd: subData.current_period_end,
          trialEndsAt: subData.trial_ends_at,
        })
      }
      setActiveClientCount(count ?? 0)
    }
    setLoading(false)
  }

  async function handleLogout() {
    await signOutAndCleanup()
    await AsyncStorage.removeItem('eva_user_role')
    router.replace('/')
  }

  if (loading) {
    return (
      <SafeAreaView edges={[]} style={[styles.container, { backgroundColor: theme.background }]}>
        <AppBackground />
        <EvaLoaderScreen subtitle="Cargando perfil..." />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={[]} style={[styles.container, { backgroundColor: theme.background }]}>
      <AppBackground />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.pageTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
          Opciones
        </Text>

        <MotiView
          from={{ opacity: 0, translateY: 16 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 450 }}
          style={[
            styles.heroCard,
            { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl },
          ]}
        >
          <View
            style={[
              styles.avatar,
              {
                backgroundColor: theme.primary + '1A',
                borderColor: theme.primary + '33',
                borderRadius: theme.radius['2xl'],
              },
            ]}
          >
            {coach?.logoUrl ? (
              <Image source={{ uri: coach.logoUrl }} style={styles.avatarLogo} contentFit="cover" transition={150} />
            ) : (
              <User size={30} color={theme.primary} strokeWidth={1.75} />
            )}
          </View>
          <Text style={[styles.heroName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
            {coach?.fullName ?? '-'}
          </Text>
          {coach?.brandName ? (
            <Text style={[styles.heroBrand, { color: theme.foreground, fontFamily: theme.fontSans }]}>
              {coach.brandName}
            </Text>
          ) : null}
          <Text style={[styles.heroSlug, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            @{coach?.slug ?? ''}
          </Text>
        </MotiView>

        {org?.isOrgManaged ? (
          <Section title="Organizacion">
            <InfoRow label="Nombre" value={org.orgName ?? '-'} />
            <InfoRow label="Rol" value={orgRoleLabel(org.orgRole)} last />
          </Section>
        ) : null}

        {!org?.isOrgManaged && coach ? (
          <Section title="Suscripcion">
            <InfoRow
              label="Estado"
              value={STATUS_LABELS[coach.subscriptionStatus] ?? coach.subscriptionStatus}
              valueColor={coach.subscriptionStatus === 'active' ? theme.success : undefined}
            />
            {subscriptionDetails?.tier ? (
              <InfoRow label="Plan" value={TIER_LABELS[subscriptionDetails.tier] ?? subscriptionDetails.tier} />
            ) : null}
            {subscriptionDetails?.trialEndsAt ? (
              <InfoRow label="Prueba hasta" value={formatDate(subscriptionDetails.trialEndsAt) ?? '-'} />
            ) : null}
            {subscriptionDetails?.currentPeriodEnd ? (
              <InfoRow label="Proxima renovacion" value={formatDate(subscriptionDetails.currentPeriodEnd) ?? '-'} />
            ) : null}
            <TouchableOpacity
              style={[styles.webLink, { borderTopColor: theme.border }]}
              onPress={() => router.push('/coach/subscription')}
              activeOpacity={0.7}
            >
              <View style={styles.webLinkLeft}>
                <CreditCard size={16} color={theme.primary} />
                <Text style={[styles.webLinkText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>
                  Gestionar suscripcion
                </Text>
              </View>
              <ExternalLink size={16} color={theme.mutedForeground} />
            </TouchableOpacity>
          </Section>
        ) : null}

        <Section title="Alumnos">
          <InfoRow
            label="Activos"
            value={activeClientCount !== null ? String(activeClientCount) : '-'}
          />
          <InfoRow label="Límite" value={`${coach?.maxClients ?? '-'}`} last />
        </Section>

        <Section title="Notificaciones">
          <View style={[styles.notifRow, { borderColor: theme.border }]}>
            <Bell size={16} color={theme.primary} />
            <Text style={[styles.notifLabel, { color: theme.foreground, fontFamily: theme.fontSans }]}>
              Push notifications
            </Text>
            <Switch
              value={pushEnabled}
              onValueChange={togglePush}
              trackColor={{ false: theme.border, true: theme.primary + '88' }}
              thumbColor={pushEnabled ? theme.primary : theme.mutedForeground}
            />
          </View>
        </Section>

        <Section title="Cuenta">
          {cardioEnabled ? (
            <TouchableOpacity
              style={[styles.linkRow, { borderColor: theme.border }]}
              onPress={() => router.push('/coach/cardio')}
              activeOpacity={0.7}
            >
              <Text style={[styles.linkText, { color: theme.foreground, fontFamily: theme.fontSans }]}>
                Zonas de cardio
              </Text>
              <HeartPulse size={14} color={theme.mutedForeground} />
            </TouchableOpacity>
          ) : null}
          {movementEnabled ? (
            <TouchableOpacity
              style={[styles.linkRow, { borderColor: theme.border }]}
              onPress={() => router.push('/coach/movement')}
              activeOpacity={0.7}
            >
              <Text style={[styles.linkText, { color: theme.foreground, fontFamily: theme.fontSans }]}>
                Screening de movimiento
              </Text>
              <ClipboardList size={14} color={theme.mutedForeground} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.linkRow, { borderColor: theme.border }]}
            onPress={() => router.push('/coach/foods')}
            activeOpacity={0.7}
          >
            <Text style={[styles.linkText, { color: theme.foreground, fontFamily: theme.fontSans }]}>
              Mis alimentos
            </Text>
            <Apple size={14} color={theme.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.linkRow, { borderColor: theme.border }]}
            onPress={() => router.push('/change-password')}
            activeOpacity={0.7}
          >
            <Text style={[styles.linkText, { color: theme.foreground, fontFamily: theme.fontSans }]}>
              Cambiar contraseña
            </Text>
            <ExternalLink size={14} color={theme.mutedForeground} />
          </TouchableOpacity>
        </Section>

        {/* Upsell de Mi Marca para coach free (espejo web hub !canUseBranding).
            Coach con branding no ve nada nuevo: solo el link "Mi Marca" de abajo. */}
        {!org?.isOrgManaged && coach && !canUseBranding(coach.subscriptionTier) ? (
          <BrandingUpsellCard theme={theme} onUpgrade={() => router.push('/coach/subscription')} />
        ) : null}

        <Section title="Configuración">
          {!org?.isOrgManaged ? (
            <TouchableOpacity
              style={[styles.linkRow, { borderColor: theme.border }]}
              onPress={() => router.push('/coach/settings')}
              activeOpacity={0.7}
            >
              <Text style={[styles.linkText, { color: theme.foreground, fontFamily: theme.fontSans }]}>
                Mi Marca
              </Text>
              <Palette size={14} color={theme.mutedForeground} />
            </TouchableOpacity>
          ) : null}
          {hasTeam ? (
            <TouchableOpacity
              style={[styles.linkRow, { borderColor: theme.border }]}
              onPress={() => router.push('/coach/team')}
              activeOpacity={0.7}
            >
              <Text style={[styles.linkText, { color: theme.foreground, fontFamily: theme.fontSans }]}>
                Mi equipo
              </Text>
              <Users size={14} color={theme.mutedForeground} />
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.linkRow, { borderColor: theme.border }]}
            onPress={() => router.push('/coach/settings/areas')}
            activeOpacity={0.7}
          >
            <Text style={[styles.linkText, { color: theme.foreground, fontFamily: theme.fontSans }]}>
              Áreas del builder
            </Text>
            <LayoutList size={14} color={theme.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.linkRow, { borderColor: theme.border }]}
            onPress={() => router.push('/coach/settings/funciones')}
            activeOpacity={0.7}
          >
            <Text style={[styles.linkText, { color: theme.foreground, fontFamily: theme.fontSans }]}>
              Funciones
            </Text>
            <SlidersHorizontal size={14} color={theme.mutedForeground} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.linkRow, { borderColor: theme.border }]}
            onPress={() => router.push('/coach/settings/modules')}
            activeOpacity={0.7}
          >
            <Text style={[styles.linkText, { color: theme.foreground, fontFamily: theme.fontSans }]}>
              Módulos
            </Text>
            <Package size={14} color={theme.mutedForeground} />
          </TouchableOpacity>
        </Section>

        <Button
          label="Cerrar sesion"
          variant="destructive"
          leftIcon={LogOut}
          onPress={handleLogout}
          full
          style={{ marginTop: 8 }}
        />
      </ScrollView>
    </SafeAreaView>
  )
}

// Espejo del hero-upsell de la web (apps/web/.../coach/settings/page.tsx, rama !canUseBranding):
// before/after de la app, precio $19.990 ($15.992 anual −20%), 4 features y CTA a suscripción.
// Colores sky fijos (NO theme.primary) para igualar el accent de la web; #007AFF = "sin marca".
const SKY = '#0EA5E9' // sky-500
const SKY_LIGHT = '#38BDF8' // sky-400
const SYSTEM_BLUE = '#007AFF'

const UPSELL_FEATURES = [
  'Tu logo en la app del alumno',
  'Colores y nombre de tu marca',
  'Loader y pantalla de carga personalizados',
  'Hasta 10 alumnos activos',
]

function BrandingUpsellCard({ theme, onUpgrade }: { theme: Theme; onUpgrade: () => void }) {
  return (
    <Section title="Mi Marca">
      <View style={styles.upsellInner}>
        {/* Hero */}
        <View
          style={[
            styles.upsellHero,
            { borderColor: SKY + '33', backgroundColor: SKY + '14', borderRadius: theme.radius.lg },
          ]}
        >
          <View style={[styles.upsellHeroIcon, { backgroundColor: SKY + '26', borderColor: SKY + '33' }]}>
            <Palette size={22} color={SKY_LIGHT} strokeWidth={1.75} />
          </View>
          <Text style={[styles.upsellTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
            Mi Marca
          </Text>
          <Text style={[styles.upsellSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Tus alumnos entran a{' '}
            <Text style={{ color: theme.foreground, fontFamily: 'Montserrat_700Bold' }}>tu app</Text>
            {' '}— con tu logo, tus colores y tu nombre. Disponible en Starter.
          </Text>
        </View>

        {/* Before / after */}
        <View style={styles.upsellMockRow}>
          {/* Sin tu marca (ahora) */}
          <View style={[styles.upsellMock, { borderColor: theme.border, backgroundColor: theme.card, borderRadius: theme.radius.lg }]}>
            <View style={[styles.upsellMockBar, { backgroundColor: SYSTEM_BLUE }]}>
              <View style={styles.upsellMockAvatar}>
                <Text style={styles.upsellMockAvatarTxt}>E</Text>
              </View>
              <Text style={styles.upsellMockBarTxt} numberOfLines={1}>EVA Fitness</Text>
            </View>
            <View style={styles.upsellMockBody}>
              <View style={[styles.upsellMockLine, { width: '100%', backgroundColor: SYSTEM_BLUE + '26' }]} />
              <View style={[styles.upsellMockLine, { width: '75%', backgroundColor: theme.muted }]} />
              <View style={[styles.upsellMockLine, { width: '50%', backgroundColor: theme.muted }]} />
              <View style={[styles.upsellMockBtn, { backgroundColor: SYSTEM_BLUE + '1A', borderColor: SYSTEM_BLUE + '33' }]} />
              <View style={[styles.upsellMockBtn, { backgroundColor: theme.muted + '99', borderColor: 'transparent' }]} />
            </View>
            <Text style={[styles.upsellMockCaption, { color: theme.mutedForeground }]}>Sin tu marca (ahora)</Text>
          </View>

          {/* Con Starter */}
          <View style={[styles.upsellMock, { borderColor: SKY_LIGHT + '66', backgroundColor: theme.card, borderRadius: theme.radius.lg }]}>
            <View style={[styles.upsellMockBar, { backgroundColor: SKY }]}>
              <View style={styles.upsellMockAvatar}>
                <Text style={styles.upsellMockAvatarTxt}>T</Text>
              </View>
              <Text style={styles.upsellMockBarTxt} numberOfLines={1}>Tu Marca</Text>
            </View>
            <View style={styles.upsellMockBody}>
              <View style={[styles.upsellMockLine, { width: '100%', backgroundColor: SKY_LIGHT + '40' }]} />
              <View style={[styles.upsellMockLine, { width: '75%', backgroundColor: SKY_LIGHT + '26' }]} />
              <View style={[styles.upsellMockLine, { width: '50%', backgroundColor: theme.muted }]} />
              <View style={[styles.upsellMockBtn, { backgroundColor: SKY + '26', borderColor: SKY + '40' }]} />
              <View style={[styles.upsellMockBtn, { backgroundColor: theme.muted + '99', borderColor: 'transparent' }]} />
            </View>
            <Text style={[styles.upsellMockCaption, { color: SKY_LIGHT, fontFamily: 'Montserrat_700Bold' }]}>Con Starter ✓</Text>
          </View>
        </View>

        {/* Pricing + features + CTA */}
        <View style={[styles.upsellPricing, { borderColor: theme.border, backgroundColor: theme.card, borderRadius: theme.radius.lg }]}>
          <Text style={[styles.upsellEyebrow, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>
            DISPONIBLE EN STARTER
          </Text>
          <View style={styles.upsellPriceRow}>
            <Text style={[styles.upsellPrice, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>$19.990</Text>
            <Text style={[styles.upsellPriceUnit, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>/mes</Text>
            <Text style={[styles.upsellPriceUnit, { color: theme.mutedForeground + '99', fontFamily: theme.fontSans }]}>·</Text>
            <Text style={[styles.upsellPriceAnnual, { color: SKY_LIGHT, fontFamily: 'Montserrat_700Bold' }]}>$15.992/mes anual</Text>
            <View style={[styles.upsellBadge, { backgroundColor: SKY + '26' }]}>
              <Text style={[styles.upsellBadgeTxt, { color: SKY }]}>−20%</Text>
            </View>
          </View>

          <View style={styles.upsellFeatures}>
            {UPSELL_FEATURES.map((feat) => (
              <View key={feat} style={styles.upsellFeatureRow}>
                <Check size={16} color={SKY_LIGHT} strokeWidth={2.5} style={{ marginTop: 1 }} />
                <Text style={[styles.upsellFeatureTxt, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{feat}</Text>
              </View>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.upsellCta, { backgroundColor: SKY }]}
            onPress={onUpgrade}
            activeOpacity={0.85}
          >
            <Text style={styles.upsellCtaTxt}>Personalizá tu app con Starter</Text>
            <ArrowRight size={16} color="#fff" strokeWidth={2.5} />
          </TouchableOpacity>
          <Text style={[styles.upsellFinePrint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Sin permanencia · Cancelá cuando quieras
          </Text>
        </View>
      </View>
    </Section>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 40, gap: 16 },
  pageTitle: { fontSize: 28, letterSpacing: -0.5, paddingHorizontal: 4, marginBottom: 4 },
  heroCard: { padding: 24, borderWidth: 1, alignItems: 'center', gap: 6 },
  avatar: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    overflow: 'hidden',
  },
  avatarLogo: { width: 72, height: 72 },
  heroName: { fontSize: 19, letterSpacing: -0.3, marginTop: 4 },
  heroBrand: { fontSize: 14 },
  heroSlug: { fontSize: 12 },
  webLink: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  webLinkLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  webLinkText: { fontSize: 13, letterSpacing: 0.3 },
  notifRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  notifLabel: { flex: 1, fontSize: 14 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  linkText: { fontSize: 14 },
  // Branding upsell (espejo web hero-upsell)
  upsellInner: { padding: 16, gap: 14 },
  upsellHero: { padding: 16, borderWidth: 1, gap: 8 },
  upsellHeroIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  upsellTitle: { fontSize: 20, letterSpacing: -0.3 },
  upsellSub: { fontSize: 13, lineHeight: 19 },
  upsellMockRow: { flexDirection: 'row', gap: 12 },
  upsellMock: { flex: 1, borderWidth: 1, overflow: 'hidden' },
  upsellMockBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  upsellMockAvatar: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  upsellMockAvatarTxt: { color: '#fff', fontSize: 9, fontFamily: 'Montserrat_800ExtraBold' },
  upsellMockBarTxt: { flex: 1, color: '#fff', fontSize: 11, fontFamily: 'Montserrat_700Bold' },
  upsellMockBody: { padding: 10, gap: 7 },
  upsellMockLine: { height: 7, borderRadius: 99 },
  upsellMockBtn: { height: 26, borderRadius: 8, borderWidth: 1, marginTop: 2 },
  upsellMockCaption: { fontSize: 10, paddingHorizontal: 10, paddingBottom: 10 },
  upsellPricing: { padding: 16, borderWidth: 1, gap: 16 },
  upsellEyebrow: { fontSize: 10, letterSpacing: 0.8 },
  upsellPriceRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'baseline', gap: 6, marginTop: -8 },
  upsellPrice: { fontSize: 24, letterSpacing: -0.5 },
  upsellPriceUnit: { fontSize: 14 },
  upsellPriceAnnual: { fontSize: 14 },
  upsellBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  upsellBadgeTxt: { fontSize: 10, fontFamily: 'Montserrat_800ExtraBold' },
  upsellFeatures: { gap: 10 },
  upsellFeatureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  upsellFeatureTxt: { flex: 1, fontSize: 14, lineHeight: 19 },
  upsellCta: {
    height: 46,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  upsellCtaTxt: { color: '#fff', fontSize: 14, fontFamily: 'Montserrat_700Bold' },
  upsellFinePrint: { fontSize: 12, textAlign: 'center', marginTop: -8 },
})
