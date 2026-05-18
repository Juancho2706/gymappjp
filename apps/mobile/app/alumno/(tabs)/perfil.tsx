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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={theme.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.pageTitle, { color: theme.text }]}>Mi perfil</Text>

          {/* Avatar + name */}
          <View style={[styles.heroCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <View style={[styles.avatar, { backgroundColor: theme.primary + '22' }]}>
              <Text style={[styles.avatarText, { color: theme.primary }]}>
                {detail?.fullName.charAt(0).toUpperCase() ?? '?'}
              </Text>
            </View>
            <Text style={[styles.heroName, { color: theme.text }]}>{detail?.fullName ?? '—'}</Text>
            <Text style={[styles.heroEmail, { color: theme.muted }]}>{detail?.email ?? ''}</Text>
          </View>

          {/* Coach branding */}
          {branding && (
            <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
              <Text style={[styles.sectionTitle, { color: theme.muted }]}>Mi coach</Text>
              <InfoRow label="Coach" value={branding.displayName} theme={theme} last />
            </View>
          )}

          {/* Personal info */}
          <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.sectionTitle, { color: theme.muted }]}>Información</Text>
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
            {!detail?.phone && detail?.goalWeightKg == null && !detail?.subscriptionStartDate && (
              <View style={styles.emptySection}>
                <Text style={[styles.emptySectionText, { color: theme.muted }]}>
                  Sin datos adicionales
                </Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={[styles.logoutBtn, { borderColor: theme.destructive }]}
            onPress={handleLogout}
          >
            <Text style={[styles.logoutText, { color: theme.destructive }]}>Cerrar sesión</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

function InfoRow({ label, value, theme, last }: { label: string; value: string; theme: any; last?: boolean }) {
  return (
    <View style={[styles.infoRow, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.border }]}>
      <Text style={[styles.infoLabel, { color: theme.muted }]}>{label}</Text>
      <Text style={[styles.infoValue, { color: theme.text }]}>{value}</Text>
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
  heroEmail: { fontSize: 13 },
  section: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  sectionTitle: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13 },
  infoLabel: { fontSize: 14 },
  infoValue: { fontSize: 14, fontWeight: '500' },
  emptySection: { paddingHorizontal: 16, paddingVertical: 13 },
  emptySectionText: { fontSize: 14 },
  logoutBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', borderWidth: 1.5, marginTop: 8 },
  logoutText: { fontSize: 15, fontWeight: '600' },
})
