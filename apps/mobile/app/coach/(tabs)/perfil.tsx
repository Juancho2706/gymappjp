import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../../../lib/supabase'
import { getCoachProfile, CoachProfile } from '../../../lib/coach'
import { getCoachOrgContext, CoachOrgContext, orgRoleLabel } from '../../../lib/org'
import { useTheme } from '../../../context/ThemeContext'

const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  trial: 'Período de prueba',
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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const [coachData, orgData] = await Promise.all([getCoachProfile(), getCoachOrgContext()])
    setCoach(coachData)
    setOrg(orgData)

    if (coachData && !orgData.isOrgManaged) {
      const { data } = await supabase
        .from('coaches')
        .select('subscription_tier, current_period_end, trial_ends_at')
        .eq('id', coachData.id)
        .maybeSingle()
      if (data) {
        setSubscriptionDetails({
          tier: data.subscription_tier,
          currentPeriodEnd: data.current_period_end,
          trialEndsAt: data.trial_ends_at,
        })
      }
    }
    setLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    await AsyncStorage.removeItem('eva_user_role')
    router.replace('/')
  }

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
        <ActivityIndicator style={{ flex: 1 }} color={theme.primary} />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.pageTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
          Perfil
        </Text>

        <View
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
            <Text
              style={[styles.avatarText, { color: theme.primary, fontFamily: 'Montserrat_800ExtraBold' }]}
            >
              {coach?.fullName.charAt(0).toUpperCase() ?? '?'}
            </Text>
          </View>
          <Text
            style={[styles.heroName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}
          >
            {coach?.fullName ?? '—'}
          </Text>
          {coach?.brandName && (
            <Text style={[styles.heroBrand, { color: theme.foreground, fontFamily: theme.fontSans }]}>
              {coach.brandName}
            </Text>
          )}
          <Text style={[styles.heroSlug, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            @{coach?.slug ?? ''}
          </Text>
        </View>

        {org?.isOrgManaged && (
          <Section title="Organización" theme={theme}>
            <InfoRow label="Nombre" value={org.orgName ?? '—'} theme={theme} />
            <InfoRow label="Rol" value={orgRoleLabel(org.orgRole)} theme={theme} last />
          </Section>
        )}

        {!org?.isOrgManaged && coach && (
          <Section title="Suscripción" theme={theme}>
            <InfoRow
              label="Estado"
              value={STATUS_LABELS[coach.subscriptionStatus] ?? coach.subscriptionStatus}
              valueColor={coach.subscriptionStatus === 'active' ? theme.success : undefined}
              theme={theme}
            />
            {subscriptionDetails?.tier && (
              <InfoRow
                label="Plan"
                value={TIER_LABELS[subscriptionDetails.tier] ?? subscriptionDetails.tier}
                theme={theme}
              />
            )}
            {subscriptionDetails?.trialEndsAt && (
              <InfoRow
                label="Prueba hasta"
                value={formatDate(subscriptionDetails.trialEndsAt) ?? '—'}
                theme={theme}
              />
            )}
            {subscriptionDetails?.currentPeriodEnd && (
              <InfoRow
                label="Próxima renovación"
                value={formatDate(subscriptionDetails.currentPeriodEnd) ?? '—'}
                theme={theme}
              />
            )}
            <TouchableOpacity
              style={[styles.webLink, { borderTopColor: theme.border }]}
              activeOpacity={0.7}
            >
              <Text
                style={[styles.webLinkText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}
              >
                Gestionar suscripción →
              </Text>
              <Text
                style={[styles.webLinkHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}
              >
                eva-app.cl
              </Text>
            </TouchableOpacity>
          </Section>
        )}

        <Section title="Cuenta" theme={theme}>
          <InfoRow label="Alumnos máx." value={`${coach?.maxClients ?? '—'}`} theme={theme} last />
        </Section>

        <TouchableOpacity
          style={[
            styles.logoutBtn,
            {
              borderColor: theme.destructive,
              backgroundColor: theme.destructive + '0D',
              borderRadius: theme.radius.lg,
            },
          ]}
          onPress={handleLogout}
          activeOpacity={0.8}
        >
          <Text
            style={[styles.logoutText, { color: theme.destructive, fontFamily: 'Montserrat_700Bold' }]}
          >
            Cerrar sesión
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

function Section({ title, theme, children }: { title: string; theme: any; children: React.ReactNode }) {
  return (
    <View
      style={[
        styles.section,
        { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl },
      ]}
    >
      <Text
        style={[styles.sectionTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}
      >
        {title}
      </Text>
      {children}
    </View>
  )
}

function InfoRow({
  label, value, valueColor, theme, last,
}: {
  label: string
  value: string
  valueColor?: string
  theme: any
  last?: boolean
}) {
  return (
    <View
      style={[
        styles.infoRow,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border },
      ]}
    >
      <Text style={[styles.infoLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
        {label}
      </Text>
      <Text
        style={[
          styles.infoValue,
          { color: valueColor ?? theme.foreground, fontFamily: theme.fontSans },
        ]}
      >
        {value}
      </Text>
    </View>
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
  },
  avatarText: { fontSize: 30 },
  heroName: { fontSize: 19, letterSpacing: -0.3, marginTop: 4 },
  heroBrand: { fontSize: 14 },
  heroSlug: { fontSize: 12 },
  section: { borderWidth: 1, overflow: 'hidden' },
  sectionTitle: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  infoLabel: { fontSize: 14 },
  infoValue: { fontSize: 14, fontWeight: '500', textAlign: 'right', flexShrink: 1 },
  webLink: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  webLinkText: { fontSize: 13, letterSpacing: 0.3 },
  webLinkHint: { fontSize: 12 },
  logoutBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    marginTop: 8,
  },
  logoutText: { fontSize: 14, letterSpacing: 0.3 },
})
