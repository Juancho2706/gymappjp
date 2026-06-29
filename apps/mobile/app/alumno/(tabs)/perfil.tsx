import { useEffect, useState } from 'react'
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import type { ViewStyle } from 'react-native'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ExternalLink, Fingerprint, KeyRound, LogOut, Moon, Sun } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { MotiView } from 'moti'
import { supabase } from '../../../lib/supabase'
import { signOutAndCleanup } from '../../../lib/auth-actions'
import { authenticate, isBiometricAvailable, isBiometricLockEnabled, setBiometricLockEnabled } from '../../../lib/biometric'
import { getClientProfile } from '../../../lib/client'
import { clearBranding } from '../../../lib/branding'
import { useTheme } from '../../../context/ThemeContext'
import { Avatar, Button, Card, Input } from '../../../components'
import { ListRow } from '../../../components/ListRow'
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

// Cool-tinted DS elevation (rgba 13 18 28) — neutral shadow tint, not a token.
const SHADOW_SM: ViewStyle = {
  shadowColor: '#0D121C',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 3,
  elevation: 2,
}

/** True when the resolved surface reads as dark (perceived luminance). */
function isDarkHex(hex: string): boolean {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) || 0
  const g = parseInt(h.slice(2, 4), 16) || 0
  const b = parseInt(h.slice(4, 6), 16) || 0
  return (r * 299 + g * 587 + b * 114) / 1000 < 128
}

// Section heading — Archivo 800, sentence case (DS SectionTitle).
function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      className="font-display-bold text-strong"
      style={{ fontSize: 17, letterSpacing: -0.3, marginBottom: 10, marginLeft: 4 }}
    >
      {children}
    </Text>
  )
}

// 36px rounded tile that hosts a row icon (DS ListRow leading slot).
function IconTile({ Icon, tone = 'neutral' }: { Icon: LucideIcon; tone?: 'neutral' | 'sport' }) {
  const { theme } = useTheme()
  const bgClass = tone === 'sport' ? 'bg-sport-100' : 'bg-surface-sunken'
  const color = tone === 'sport' ? theme.primary : theme.foreground
  return (
    <View className={`items-center justify-center ${bgClass}`} style={{ width: 36, height: 36, borderRadius: 10 }}>
      <Icon size={18} color={color} strokeWidth={2} />
    </View>
  )
}

// Hairline divider between stacked rows inside a padding-none Card.
function RowDivider() {
  const { theme } = useTheme()
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: theme.border, marginHorizontal: 14 }} />
}

// label/value line for the "Informacion" card.
function InfoLine({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const { theme } = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 14,
        gap: 12,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: theme.border,
      }}
    >
      <Text className="font-sans text-muted" style={{ fontSize: 14 }}>
        {label}
      </Text>
      <Text className="font-sans-medium text-body" style={{ fontSize: 14, textAlign: 'right', flexShrink: 1 }} numberOfLines={2}>
        {value}
      </Text>
    </View>
  )
}

// Light / dark appearance toggle — wired to the existing ThemeContext.toggleTheme
// (no new state; the resolved scheme is derived from the active surface).
function AppearanceToggle() {
  const { theme, toggleTheme } = useTheme()
  const cur = isDarkHex(theme.background) ? 'dark' : 'light'
  const opts: [string, string, LucideIcon][] = [
    ['light', 'Claro', Sun],
    ['dark', 'Oscuro', Moon],
  ]
  return (
    <Card padding="sm">
      <View
        className="bg-surface-sunken rounded-control"
        style={{ flexDirection: 'row', gap: 6, padding: 4 }}
        accessibilityRole="tablist"
      >
        {opts.map(([val, label, Icon]) => {
          const active = cur === val
          return (
            <Pressable
              key={val}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={label}
              onPress={() => {
                if (!active) toggleTheme()
              }}
              style={[
                {
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  height: 46,
                  borderRadius: 10,
                },
                active ? { backgroundColor: theme.card, ...SHADOW_SM } : null,
              ]}
            >
              <Icon size={18} color={active ? theme.foreground : theme.mutedForeground} strokeWidth={2.2} />
              <Text
                className={active ? 'text-strong' : 'text-muted'}
                style={{ fontSize: 14.5, fontFamily: 'HankenGrotesk_700Bold' }}
              >
                {label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </Card>
  )
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
    load().catch(() => setLoading(false))
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
    await signOutAndCleanup()
    await AsyncStorage.removeItem('eva_user_role')
    await clearBranding()
    setBranding(null)
    router.replace('/')
  }

  const [bioAvailable, setBioAvailable] = useState(false)
  const [bioEnabled, setBioEnabled] = useState(false)
  useEffect(() => {
    isBiometricAvailable().then(setBioAvailable).catch(() => {})
    isBiometricLockEnabled().then(setBioEnabled).catch(() => {})
  }, [])
  async function toggleBio(next: boolean) {
    if (next) {
      const ok = await authenticate('Confirmá para activar el bloqueo')
      if (!ok) return
    }
    await setBiometricLockEnabled(next)
    setBioEnabled(next)
  }

  const hasExtras = detail?.phone || detail?.goalWeightKg != null || detail?.subscriptionStartDate

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <AppBackground />
      {loading ? (
        <EvaLoaderScreen subtitle="Cargando perfil…" />
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text className="font-display-black text-strong" style={styles.pageTitle}>
            Mi perfil
          </Text>

          {/* Hero — inverse identity card (DS) */}
          <MotiView
            from={{ opacity: 0, translateY: 16 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 450 }}
          >
            <Card variant="inverse" padding="lg" style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
              <Avatar name={detail?.fullName ?? ''} size="xl" ring="sport" />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text className="font-display-black text-on-dark" style={{ fontSize: 22, letterSpacing: -0.4 }} numberOfLines={1}>
                  {detail?.fullName ?? '-'}
                </Text>
                {detail?.email ? (
                  <Text className="font-sans text-on-dark-muted" style={{ fontSize: 13, marginTop: 2 }} numberOfLines={1}>
                    {detail.email}
                  </Text>
                ) : null}
                {branding ? (
                  <Text className="font-sans-medium text-on-dark-muted" style={{ fontSize: 13, marginTop: 2 }} numberOfLines={1}>
                    Coach: {branding.displayName}
                  </Text>
                ) : null}
              </View>
            </Card>
          </MotiView>

          {/* Informacion */}
          <View>
            <SectionLabel>Informacion</SectionLabel>
            <Card padding="none">
              {detail?.phone ? (
                <InfoLine
                  label="Telefono"
                  value={detail.phone}
                  last={detail.goalWeightKg == null && !detail.subscriptionStartDate}
                />
              ) : null}
              {detail?.goalWeightKg != null ? (
                <InfoLine
                  label="Peso objetivo"
                  value={`${detail.goalWeightKg} kg`}
                  last={!detail.subscriptionStartDate}
                />
              ) : null}
              {detail?.subscriptionStartDate ? (
                <InfoLine label="Miembro desde" value={formatDate(detail.subscriptionStartDate) ?? '-'} last />
              ) : null}
              {!hasExtras ? (
                <View style={{ paddingHorizontal: 16, paddingVertical: 14 }}>
                  <Text className="font-sans text-muted" style={{ fontSize: 14 }}>
                    Sin datos adicionales
                  </Text>
                </View>
              ) : null}
            </Card>
          </View>

          {/* Apariencia — light/dark toggle */}
          <View>
            <SectionLabel>Apariencia</SectionLabel>
            <AppearanceToggle />
          </View>

          {/* Cuenta */}
          <View>
            <SectionLabel>Cuenta</SectionLabel>
            <Card padding="none">
              <ListRow
                leading={<IconTile Icon={KeyRound} tone="sport" />}
                title="Cambiar contraseña"
                showChevron
                onPress={() => setShowPasswordModal(true)}
              />
              <RowDivider />
              <ListRow
                leading={<IconTile Icon={ExternalLink} />}
                title="Privacidad · Derechos ARCO"
                showChevron
                onPress={() => Linking.openURL('https://eva-app.cl/privacidad')}
              />
            </Card>
          </View>

          {/* Seguridad — biometric lock (only when device supports it) */}
          {bioAvailable ? (
            <View>
              <SectionLabel>Seguridad</SectionLabel>
              <Card padding="none">
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                  }}
                >
                  <IconTile Icon={Fingerprint} tone="sport" />
                  <Text className="font-sans-bold text-strong" style={{ flex: 1, fontSize: 15 }}>
                    Bloqueo con Face ID / huella
                  </Text>
                  <Switch
                    value={bioEnabled}
                    onValueChange={toggleBio}
                    trackColor={{ true: theme.primary, false: theme.muted }}
                    ios_backgroundColor={theme.muted}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </Card>
            </View>
          ) : null}

          <Button
            label="Cerrar sesion"
            variant="destructive"
            leftIcon={LogOut}
            onPress={handleLogout}
            full
            style={{ marginTop: 8 }}
          />

          {detail?.coachTier === 'free' && (
            <Text className="font-sans text-muted" style={styles.evaFooter}>
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
            style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}
          >
            <Text className="font-display-bold text-strong" style={{ fontSize: 18, letterSpacing: -0.3 }}>
              Cambiar contraseña
            </Text>
            <Input
              placeholder="Nueva contraseña (mín. 8 caracteres)"
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
  scroll: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40, gap: 18 },
  pageTitle: { fontSize: 28, letterSpacing: -0.8, marginLeft: 4, marginBottom: 2 },
  evaFooter: { fontSize: 11, textAlign: 'center', letterSpacing: 1.2, paddingVertical: 8 },
  modalOverlay: { backgroundColor: 'rgba(11,14,19,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 100 },
  modalCard: { width: '100%', maxWidth: 400, padding: 24, gap: 16, borderWidth: 1, borderRadius: 22 },
  modalButtons: { flexDirection: 'row', gap: 10 },
})
