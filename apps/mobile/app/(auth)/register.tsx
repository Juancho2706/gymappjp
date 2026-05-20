import { useMemo, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { ArrowRight, Check, Globe, Lock, Mail, Sparkles, User } from 'lucide-react-native'
import { MotiView } from 'moti'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'
import { Button, Card, Input, TopBar } from '../../components'

const RESERVED_SLUGS = new Set([
  'admin', 'api', 'coach', 'coaches', 'register', 'login', 'logout', 'pricing',
  'about', 'contact', 'eva', 'antigravity', 'soporte', 'help', 'blog', 'app',
  'www', 'mail', 'support', 'dashboard', 'settings', 'subscription',
])

type Step = 0 | 1 | 2

export default function RegisterScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const [step, setStep] = useState<Step>(0)
  const [fullName, setFullName] = useState('')
  const [brandName, setBrandName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const canContinue = useMemo(() => {
    if (step === 0) return fullName.trim() && brandName.trim() && email.trim() && password.length >= 8
    return true
  }, [brandName, email, fullName, password, step])

  function next() {
    if (step === 0 && !canContinue) {
      Alert.alert('Datos incompletos', 'Completa todos los campos. La contrasena debe tener al menos 8 caracteres.')
      return
    }
    setStep((s) => Math.min(2, s + 1) as Step)
  }

  async function handleCreate() {
    setLoading(true)
    const emailSan = email.trim().toLowerCase()
    const slug = makeSlug(brandName)

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: emailSan,
      password,
      options: { data: { full_name: fullName.trim(), role: 'coach' } },
    })

    if (authError || !authData.user) {
      setLoading(false)
      Alert.alert('No se pudo crear la cuenta', authError?.message ?? 'Intenta nuevamente.')
      return
    }

    const { error: coachError } = await supabase.from('coaches').insert({
      id: authData.user.id,
      full_name: fullName.trim(),
      brand_name: brandName.trim(),
      slug,
      primary_color: '#10B981',
      subscription_status: 'pending_email',
      subscription_tier: 'free',
      billing_cycle: 'monthly',
      payment_provider: 'admin',
      max_clients: 3,
      health_data_consent_at: new Date().toISOString(),
      marketing_consent: false,
      trial_used_email: emailSan,
    })

    setLoading(false)

    if (coachError) {
      Alert.alert('Cuenta creada, falta perfil', 'Confirma tu correo y completa el perfil desde eva-app.cl.')
      router.replace('/(auth)/login?role=coach')
      return
    }

    Alert.alert('Revisa tu correo', 'Confirma tu email para activar tu cuenta free.', [
      { text: 'OK', onPress: () => router.replace('/(auth)/login?role=coach') },
    ])
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav}>
        <TopBar showBrand back />
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <MotiView
            key={step}
            from={{ opacity: 0, translateY: 18 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 420 }}
            style={styles.content}
          >
            <View style={[styles.stepPill, { backgroundColor: theme.primary + '12', borderColor: theme.primary + '30', borderRadius: theme.radius.lg }]}>
              <Sparkles size={13} color={theme.primary} />
              <Text style={[styles.stepPillText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>
                Cuenta free
              </Text>
            </View>
            <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
              Crear cuenta coach
            </Text>
            <Text style={[styles.subtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              {step === 0 ? 'Datos basicos para tu marca.' : step === 1 ? 'Mobile v1 permite partir gratis.' : 'Confirma y revisa tu correo.'}
            </Text>

            {step === 0 ? (
              <View style={styles.form}>
                <Input label="Nombre" leftIcon={User} placeholder="Juan Perez" value={fullName} onChangeText={setFullName} autoComplete="name" />
                <Input label="Marca" leftIcon={Globe} placeholder="JP Fitness" value={brandName} onChangeText={setBrandName} />
                <Input label="Email" leftIcon={Mail} placeholder="coach@ejemplo.com" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
                <Input label="Contrasena" leftIcon={Lock} placeholder="Minimo 8 caracteres" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" error={password && password.length < 8 ? 'Minimo 8 caracteres' : null} />
                <Button label="Continuar" rightIcon={ArrowRight} onPress={next} disabled={!canContinue} full size="lg" />
              </View>
            ) : step === 1 ? (
              <View style={styles.form}>
                <Card variant="highlighted" padding={18} style={styles.planCard}>
                  <View style={styles.planTop}>
                    <Text style={[styles.planName, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>Free</Text>
                    <View style={[styles.freeBadge, { backgroundColor: theme.success + '18', borderRadius: theme.radius.sm }]}>
                      <Check size={13} color={theme.success} />
                      <Text style={[styles.freeText, { color: theme.success, fontFamily: 'Montserrat_700Bold' }]}>Incluido</Text>
                    </View>
                  </View>
                  <Text style={[styles.planMeta, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                    Hasta 3 alumnos activos. Planes pagos se completan desde eva-app.cl.
                  </Text>
                </Card>
                <Button label="Elegir free" rightIcon={ArrowRight} onPress={next} full size="lg" />
              </View>
            ) : (
              <View style={styles.form}>
                <Card padding={18} style={styles.summaryCard}>
                  <SummaryRow label="Coach" value={fullName.trim()} />
                  <SummaryRow label="Marca" value={brandName.trim()} />
                  <SummaryRow label="Email" value={email.trim().toLowerCase()} />
                  <SummaryRow label="Plan" value="Free" last />
                </Card>
                <Button label="Crear cuenta" rightIcon={ArrowRight} onPress={handleCreate} loading={loading} full size="lg" />
              </View>
            )}

            <Pressable onPress={() => router.replace('/(auth)/login?role=coach')} hitSlop={10}>
              <Text style={[styles.loginLink, { color: theme.primary, fontFamily: theme.fontSans }]}>
                Ya tengo cuenta
              </Text>
            </Pressable>
          </MotiView>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function SummaryRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const { theme } = useTheme()
  return (
    <View style={[styles.summaryRow, !last && { borderBottomColor: theme.border }]}>
      <Text style={[styles.summaryLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color: theme.foreground, fontFamily: theme.fontSans }]} numberOfLines={1}>{value}</Text>
    </View>
  )
}

function makeSlug(value: string): string {
  const base = value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  const slug = base || `coach-${Math.random().toString(36).slice(2, 8)}`
  return RESERVED_SLUGS.has(slug) ? `${slug}-${Math.random().toString(36).slice(2, 8)}` : slug
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  kav: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 32 },
  content: { gap: 12 },
  stepPill: { borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  stepPillText: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: 28, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  form: { gap: 16, marginTop: 16 },
  planCard: { gap: 10 },
  planTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  planName: { fontSize: 22 },
  freeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4 },
  freeText: { fontSize: 11, letterSpacing: 0.3 },
  planMeta: { fontSize: 13, lineHeight: 19 },
  summaryCard: { paddingTop: 4, paddingBottom: 4 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  summaryLabel: { fontSize: 13 },
  summaryValue: { fontSize: 13, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  loginLink: { textAlign: 'center', fontSize: 13, fontWeight: '600', marginTop: 8 },
})
