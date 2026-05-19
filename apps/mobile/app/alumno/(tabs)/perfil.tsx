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
import { getClientProfile } from '../../../lib/client'
import { clearBranding } from '../../../lib/branding'
import { useTheme } from '../../../context/ThemeContext'

interface AlumnoDetail {
  fullName: string
  email: string
  phone: string | null
  goalWeightKg: number | null
  subscriptionStartDate: string | null
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function AlumnoPerfilScreen() {
  const { theme, branding, setBranding } = useTheme()
  const router = useRouter()
  const [detail, setDetail] = useState<AlumnoDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const client = await getClientProfile()
    if (!client) { setLoading(false); return }

    const { data: { user } } = await supabase.auth.getUser()
    const { data } = await supabase
      .from('clients')
      .select('full_name, phone, goal_weight_kg, subscription_start_date')
      .eq('id', client.id)
      .maybeSingle()

    setDetail({
      fullName: data?.full_name ?? client.fullName,
      email: user?.email ?? '',
      phone: data?.phone ?? null,
      goalWeightKg: data?.goal_weight_kg ?? null,
      subscriptionStartDate: data?.subscription_start_date ?? null,
    })
    setLoading(false)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    await AsyncStorage.removeItem('eva_user_role')
    await clearBranding()
    setBranding(null)
    router.replace('/')
  }

  const hasExtras =
    detail?.phone || detail?.goalWeightKg != null || detail?.subscriptionStartDate

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={theme.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text
            style={[styles.pageTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}
          >
            Mi perfil
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
                {detail?.fullName.charAt(0).toUpperCase() ?? '?'}
              </Text>
            </View>
            <Text
              style={[styles.heroName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}
            >
              {detail?.fullName ?? '—'}
            </Text>
            <Text
              style={[styles.heroEmail, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}
            >
              {detail?.email ?? ''}
            </Text>
          </View>

          {branding && (
            <Section title="Mi coach" theme={theme}>
              <InfoRow label="Coach" value={branding.displayName} theme={theme} last />
            </Section>
          )}

          <Section title="Información" theme={theme}>
            {detail?.phone && <InfoRow label="Teléfono" value={detail.phone} theme={theme} />}
            {detail?.goalWeightKg != null && (
              <InfoRow label="Peso objetivo" value={`${detail.goalWeightKg} kg`} theme={theme} />
            )}
            {detail?.subscriptionStartDate && (
              <InfoRow
                label="Miembro desde"
                value={formatDate(detail.subscriptionStartDate) ?? '—'}
                theme={theme}
                last
              />
            )}
            {!hasExtras && (
              <View style={styles.emptySection}>
                <Text
                  style={[styles.emptySectionText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}
                >
                  Sin datos adicionales
                </Text>
              </View>
            )}
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
      )}
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
  label, value, theme, last,
}: { label: string; value: string; theme: any; last?: boolean }) {
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
      <Text style={[styles.infoValue, { color: theme.foreground, fontFamily: theme.fontSans }]}>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 24, paddingBottom: 40, gap: 16 },
  pageTitle: { fontSize: 28, letterSpacing: -0.5, paddingHorizontal: 4, marginBottom: 4 },
  heroCard: { padding: 24, borderWidth: 1, alignItems: 'center', gap: 8 },
  avatar: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  avatarText: { fontSize: 30 },
  heroName: { fontSize: 19, letterSpacing: -0.3, marginTop: 4 },
  heroEmail: { fontSize: 13 },
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
  emptySection: { paddingHorizontal: 16, paddingVertical: 14 },
  emptySectionText: { fontSize: 14 },
  logoutBtn: {
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    marginTop: 8,
  },
  logoutText: { fontSize: 14, letterSpacing: 0.3 },
})
