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
      // Only fetch billing details if not org-managed
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
        <Text style={[styles.pageTitle, { color: theme.text }]}>Perfil</Text>

        {/* Coach hero */}
        <View style={[styles.heroCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <View style={[styles.avatar, { backgroundColor: theme.primary + '22' }]}>
            <Text style={[styles.avatarText, { color: theme.primary }]}>
              {coach?.fullName.charAt(0).toUpperCase() ?? '?'}
            </Text>
          </View>
          <Text style={[styles.heroName, { color: theme.text }]}>{coach?.fullName ?? '—'}</Text>
          <Text style={[styles.heroBrand, { color: theme.muted }]}>{coach?.brandName ?? ''}</Text>
          <Text style={[styles.heroSlug, { color: theme.muted }]}>@{coach?.slug ?? ''}</Text>
        </View>

        {/* Org section (org-managed coaches) */}
        {org?.isOrgManaged && (
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.muted }]}>Organización</Text>
            <InfoRow label="Nombre" value={org.orgName ?? '—'} theme={theme} />
            <InfoRow label="Rol" value={orgRoleLabel(org.orgRole)} theme={theme} last />
          </View>
        )}

        {/* Subscription (standalone coaches only) */}
        {!org?.isOrgManaged && coach && (
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.muted }]}>Suscripción</Text>
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
              onPress={() => { /* open eva-app.cl/coach/settings in browser */ }}
            >
              <Text style={[styles.webLinkText, { color: theme.primary }]}>
                Gestionar suscripción →
              </Text>
              <Text style={[styles.webLinkHint, { color: theme.muted }]}>eva-app.cl</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Account */}
        <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
          <Text style={[styles.sectionTitle, { color: theme.muted }]}>Cuenta</Text>
          <InfoRow label="Clientes máx." value={`${coach?.maxClients ?? '—'}`} theme={theme} last />
        </View>

        <TouchableOpacity
          style={[styles.logoutBtn, { borderColor: theme.destructive }]}
          onPress={handleLogout}
        >
          <Text style={[styles.logoutText, { color: theme.destructive }]}>Cerrar sesión</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
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
    <View style={[styles.infoRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}>
      <Text style={[styles.infoLabel, { color: theme.muted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: valueColor ?? theme.text }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 16 },
  pageTitle: { fontSize: 24, fontWeight: '700', paddingHorizontal: 4 },
  heroCard: { borderRadius: 16, padding: 20, borderWidth: 1, alignItems: 'center', gap: 6 },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: 28, fontWeight: '700' },
  heroName: { fontSize: 18, fontWeight: '700' },
  heroBrand: { fontSize: 14 },
  heroSlug: { fontSize: 12 },
  section: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  sectionTitle: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13 },
  infoLabel: { fontSize: 14 },
  infoValue: { fontSize: 14, fontWeight: '500' },
  webLink: { paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  webLinkText: { fontSize: 14, fontWeight: '500' },
  webLinkHint: { fontSize: 12 },
  logoutBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, marginTop: 8 },
  logoutText: { fontSize: 15, fontWeight: '600' },
})
