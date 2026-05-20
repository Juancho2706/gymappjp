import { useEffect, useState } from 'react'
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { CreditCard, ExternalLink, LogOut, User } from 'lucide-react-native'
import { MotiView } from 'moti'
import { supabase } from '../../../lib/supabase'
import { getCoachProfile, CoachProfile } from '../../../lib/coach'
import { getCoachOrgContext, CoachOrgContext, orgRoleLabel } from '../../../lib/org'
import { useTheme } from '../../../context/ThemeContext'
import { Button, InfoRow, Section } from '../../../components'

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
            <User size={30} color={theme.primary} strokeWidth={1.75} />
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
            <View style={[styles.webLink, { borderTopColor: theme.border }]}>
              <View style={styles.webLinkLeft}>
                <CreditCard size={16} color={theme.primary} />
                <Text style={[styles.webLinkText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>
                  Gestionar suscripcion
                </Text>
              </View>
              <ExternalLink size={16} color={theme.mutedForeground} />
            </View>
          </Section>
        ) : null}

        <Section title="Cuenta">
          <InfoRow label="Alumnos max." value={`${coach?.maxClients ?? '-'}`} last />
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
})
