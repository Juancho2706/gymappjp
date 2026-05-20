import { useEffect, useState } from 'react'
import { ActivityIndicator, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { LogOut, User, UserCog } from 'lucide-react-native'
import { MotiView } from 'moti'
import { supabase } from '../../../lib/supabase'
import { getClientProfile } from '../../../lib/client'
import { clearBranding } from '../../../lib/branding'
import { useTheme } from '../../../context/ThemeContext'
import { Button, InfoRow, Section } from '../../../components'

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

  const hasExtras = detail?.phone || detail?.goalWeightKg != null || detail?.subscriptionStartDate

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={theme.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.pageTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
            Mi perfil
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
              {detail?.fullName ?? '-'}
            </Text>
            <Text style={[styles.heroEmail, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              {detail?.email ?? ''}
            </Text>
          </MotiView>

          {branding ? (
            <Section title="Mi coach">
              <View style={styles.coachRow}>
                <UserCog size={16} color={theme.primary} />
                <InfoRow label="Coach" value={branding.displayName} last />
              </View>
            </Section>
          ) : null}

          <Section title="Informacion">
            {detail?.phone ? <InfoRow label="Telefono" value={detail.phone} /> : null}
            {detail?.goalWeightKg != null ? (
              <InfoRow label="Peso objetivo" value={`${detail.goalWeightKg} kg`} />
            ) : null}
            {detail?.subscriptionStartDate ? (
              <InfoRow label="Miembro desde" value={formatDate(detail.subscriptionStartDate) ?? '-'} last />
            ) : null}
            {!hasExtras ? (
              <View style={styles.emptySection}>
                <Text style={[styles.emptySectionText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                  Sin datos adicionales
                </Text>
              </View>
            ) : null}
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
      )}
    </SafeAreaView>
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
  heroName: { fontSize: 19, letterSpacing: -0.3, marginTop: 4 },
  heroEmail: { fontSize: 13 },
  coachRow: { flexDirection: 'row', alignItems: 'center', paddingLeft: 16 },
  emptySection: { paddingHorizontal: 16, paddingVertical: 14 },
  emptySectionText: { fontSize: 14 },
})
