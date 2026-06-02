import { useEffect, useState } from 'react'
import { Alert, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ExternalLink, KeyRound, LogOut, User, UserCog } from 'lucide-react-native'
import { MotiView } from 'moti'
import { supabase } from '../../../lib/supabase'
import { getClientProfile } from '../../../lib/client'
import { clearBranding } from '../../../lib/branding'
import { useTheme } from '../../../context/ThemeContext'
import { Button, InfoRow, Section } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AppBackground } from '../../../components/AppBackground'

interface AlumnoDetail {
  fullName: string
  email: string
  phone: string | null
  goalWeightKg: number | null
  subscriptionStartDate: string | null
  coachTier: string | null
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
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  useEffect(() => {
    load()
  }, [])

  async function load() {
    setLoading(true)
    const client = await getClientProfile()
    if (!client) { setLoading(false); return }

    const [{ data: { user } }, { data }, { data: coachData }] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('clients').select('full_name, phone, goal_weight_kg, subscription_start_date').eq('id', client.id).maybeSingle(),
      supabase.from('coaches').select('subscription_tier').eq('id', client.coachId).maybeSingle(),
    ])

    setDetail({
      fullName: data?.full_name ?? client.fullName,
      email: user?.email ?? '',
      phone: data?.phone ?? null,
      goalWeightKg: data?.goal_weight_kg ?? null,
      subscriptionStartDate: data?.subscription_start_date ?? null,
      coachTier: (coachData as any)?.subscription_tier ?? null,
    })
    setLoading(false)
  }

  async function handleChangePassword() {
    if (newPassword.length < 8) {
      Alert.alert('Contraseña muy corta', 'Debe tener al menos 8 caracteres.')
      return
    }
    setChangingPassword(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setChangingPassword(false)
    if (error) {
      Alert.alert('Error', 'No se pudo cambiar la contraseña. Intenta de nuevo.')
    } else {
      Alert.alert('Listo', 'Contraseña actualizada correctamente.')
      setShowPasswordModal(false)
      setNewPassword('')
    }
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
      <AppBackground />
      {loading ? (
        <EvaLoaderScreen subtitle="Cargando perfil…" />
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

          <Section title="Cuenta">
            <TouchableOpacity
              style={[styles.actionRow, { borderBottomColor: theme.border }]}
              onPress={() => setShowPasswordModal(true)}
              activeOpacity={0.75}
            >
              <KeyRound size={16} color={theme.primary} strokeWidth={2} />
              <Text style={[styles.actionLabel, { color: theme.foreground, fontFamily: theme.fontSans }]}>
                Cambiar contraseña
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionRow}
              onPress={() => Linking.openURL('https://eva-app.cl/privacidad')}
              activeOpacity={0.75}
            >
              <ExternalLink size={16} color={theme.mutedForeground} strokeWidth={2} />
              <Text style={[styles.actionLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                Privacidad · Derechos ARCO
              </Text>
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

          {detail?.coachTier === 'free' && (
            <Text style={[styles.evaFooter, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              Potenciado por EVA
            </Text>
          )}
        </ScrollView>
      )}

      {showPasswordModal && (
        <View style={[StyleSheet.absoluteFill, styles.modalOverlay]}>
          <MotiView
            from={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', damping: 16 }}
            style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}
          >
            <Text style={[styles.modalTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
              Cambiar contraseña
            </Text>
            <TextInput
              style={[styles.modalInput, { borderColor: theme.border, color: theme.foreground, backgroundColor: theme.secondary, borderRadius: theme.radius.lg, fontFamily: theme.fontSans }]}
              placeholder="Nueva contraseña (mín. 8 caracteres)"
              placeholderTextColor={theme.mutedForeground}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              autoFocus
            />
            <View style={styles.modalButtons}>
              <Button label="Cancelar" variant="secondary" onPress={() => { setShowPasswordModal(false); setNewPassword('') }} style={{ flex: 1 }} />
              <Button label="Guardar" onPress={handleChangePassword} loading={changingPassword} style={{ flex: 1 }} />
            </View>
          </MotiView>
        </View>
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
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  actionLabel: { fontSize: 15 },
  evaFooter: { fontSize: 11, textAlign: 'center', letterSpacing: 1.2, paddingVertical: 8 },
  modalOverlay: { backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 100 },
  modalCard: { width: '100%', maxWidth: 400, borderWidth: 1, padding: 24, gap: 16 },
  modalTitle: { fontSize: 17 },
  modalInput: { borderWidth: 1, height: 48, paddingHorizontal: 16, fontSize: 15 },
  modalButtons: { flexDirection: 'row', gap: 10 },
})
