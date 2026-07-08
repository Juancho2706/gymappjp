import { useMemo, useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ArrowRight, Check, Globe, Lock, Mail, Sparkles, Square, User } from 'lucide-react-native'
import { MotiView } from 'moti'
import { RegisterCoachFreeSchema } from '@eva/schemas'
import { useTheme } from '../../context/ThemeContext'
import { Button, Card, HapticPressable, Input, TopBar } from '../../components'
import { ApiError, registerCoachFree } from '../../lib/api'

type Step = 0 | 1 | 2

export default function RegisterScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const [step, setStep] = useState<Step>(0)
  const [fullName, setFullName] = useState('')
  const [brandName, setBrandName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [acceptLegal, setAcceptLegal] = useState(false)
  const [acceptHealthData, setAcceptHealthData] = useState(false)
  const [acceptMarketing, setAcceptMarketing] = useState(false)
  const [loading, setLoading] = useState(false)

  const canContinue = useMemo(() => {
    if (step === 0) return fullName.trim() && brandName.trim() && email.trim() && password.length >= 8
    if (step === 2) return acceptLegal && acceptHealthData
    return true
  }, [acceptHealthData, acceptLegal, brandName, email, fullName, password, step])

  function next() {
    if (step === 0 && !canContinue) {
      Alert.alert('Datos incompletos', 'Completa todos los campos. La contrasena debe tener al menos 8 caracteres.')
      return
    }
    setStep((s) => Math.min(2, s + 1) as Step)
  }

  async function handleCreate() {
    if (!acceptLegal || !acceptHealthData) {
      Alert.alert('Consentimiento requerido', 'Debes aceptar terminos y tratamiento de datos de salud para crear tu cuenta.')
      return
    }

    const parsed = RegisterCoachFreeSchema.safeParse({
      full_name: fullName.trim(),
      brand_name: brandName.trim(),
      email: email.trim().toLowerCase(),
      password,
    })
    if (!parsed.success) {
      Alert.alert('Datos inválidos', parsed.error.issues[0]?.message ?? 'Revisa los campos')
      return
    }

    setLoading(true)
    try {
      await registerCoachFree({
        fullName: parsed.data.full_name,
        brandName: parsed.data.brand_name,
        email: parsed.data.email,
        password: parsed.data.password,
        acceptLegal: true,
        acceptHealthData: true,
        acceptMarketing,
      })
      // E1-20: pantalla dedicada de "revisá tu email" (espejo web), en vez del Alert efímero.
      router.replace(`/(auth)/verify-email?email=${encodeURIComponent(parsed.data.email)}`)
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Intenta nuevamente.'
      Alert.alert('No se pudo crear la cuenta', message)
    } finally {
      setLoading(false)
    }
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
            <View className="flex-row items-center self-start rounded-control bg-sport-100" style={styles.stepPill}>
              <Sparkles size={13} color={theme.primary} />
              <Text className="text-sport-600 font-display-bold" style={styles.stepPillText}>
                Cuenta free
              </Text>
            </View>
            <Text className="text-strong font-display-bold" style={styles.title}>
              Crear cuenta coach
            </Text>
            <Text className="text-muted font-sans" style={styles.subtitle}>
              {step === 0 ? 'Datos basicos para tu marca.' : step === 1 ? 'Mobile v1 permite partir gratis.' : 'Confirma y revisa tu correo.'}
            </Text>

            {step === 0 ? (
              <View style={styles.form}>
                <Input label="Nombre" leftIcon={User} placeholder="Juan Perez" value={fullName} onChangeText={setFullName} autoComplete="name" />
                <Input label="Marca" leftIcon={Globe} placeholder="JP Fitness" value={brandName} onChangeText={setBrandName} />
                <Input label="Email" leftIcon={Mail} placeholder="coach@ejemplo.com" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
                <Input label="Contrasena" leftIcon={Lock} placeholder="Minimo 8 caracteres" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" error={password && password.length < 8 ? 'Minimo 8 caracteres' : null} />
                <Button label="Continuar" variant="sport" rightIcon={ArrowRight} onPress={next} disabled={!canContinue} full size="lg" />
              </View>
            ) : step === 1 ? (
              <View style={styles.form}>
                <Card variant="highlighted" padding={18} style={styles.planCard}>
                  <View style={styles.planTop}>
                    <Text className="text-strong font-display-black" style={styles.planName}>Free</Text>
                    <View className="bg-success-100 rounded-sm" style={styles.freeBadge}>
                      <Check size={13} color={theme.success} />
                      <Text className="text-success-600 font-display-bold" style={styles.freeText}>Incluido</Text>
                    </View>
                  </View>
                  <Text className="text-muted font-sans" style={styles.planMeta}>
                    Hasta 3 alumnos activos. Planes pagos se completan desde eva-app.cl.
                  </Text>
                </Card>
                <Button label="Elegir free" variant="sport" rightIcon={ArrowRight} onPress={next} full size="lg" />
              </View>
            ) : (
              <View style={styles.form}>
                <Card padding={18} style={styles.summaryCard}>
                  <SummaryRow label="Coach" value={fullName.trim()} />
                  <SummaryRow label="Marca" value={brandName.trim()} />
                  <SummaryRow label="Email" value={email.trim().toLowerCase()} />
                  <SummaryRow label="Plan" value="Free" last />
                </Card>
                <Card padding={14} style={styles.consentCard}>
                  <ConsentRow
                    checked={acceptLegal}
                    onPress={() => setAcceptLegal((v) => !v)}
                    label="Acepto terminos de servicio y politica de privacidad."
                  />
                  <ConsentRow
                    checked={acceptHealthData}
                    onPress={() => setAcceptHealthData((v) => !v)}
                    label="Acepto tratamiento de datos de salud para operar EVA."
                  />
                  <ConsentRow
                    checked={acceptMarketing}
                    onPress={() => setAcceptMarketing((v) => !v)}
                    label="Acepto recibir novedades y tips de producto."
                  />
                </Card>
                <Button
                  label="Crear cuenta"
                  variant="sport"
                  rightIcon={ArrowRight}
                  onPress={handleCreate}
                  loading={loading}
                  disabled={!canContinue}
                  full
                  size="lg"
                />
              </View>
            )}

            <Pressable onPress={() => router.replace('/(auth)/login?role=coach')} hitSlop={10}>
              <Text className="text-sport-600 font-sans-semibold" style={styles.loginLink}>
                Ya tengo cuenta
              </Text>
            </Pressable>
          </MotiView>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function ConsentRow({ checked, onPress, label }: { checked: boolean; onPress: () => void; label: string }) {
  const { theme } = useTheme()
  return (
    <HapticPressable onPress={onPress} style={styles.consentRow}>
      <View
        className="rounded-sm items-center justify-center"
        style={[
          styles.checkbox,
          {
            backgroundColor: checked ? theme.primary : 'transparent',
            borderColor: checked ? theme.primary : theme.border,
          },
        ]}
      >
        {checked ? <Check size={14} color={theme.primaryForeground} strokeWidth={2.5} /> : <Square size={14} color="transparent" />}
      </View>
      <Text className="text-body font-sans" style={styles.consentText}>
        {label}
      </Text>
    </HapticPressable>
  )
}

function SummaryRow({ label, value, last }: { label: string; value: string; last?: boolean }) {
  const { theme } = useTheme()
  return (
    <View style={[styles.summaryRow, !last && { borderBottomColor: theme.border }]}>
      <Text className="text-muted font-sans" style={styles.summaryLabel}>{label}</Text>
      <Text className="text-strong font-sans-semibold" style={styles.summaryValue} numberOfLines={1}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  kav: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 32 },
  content: { gap: 12 },
  stepPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, alignSelf: 'flex-start' },
  stepPillText: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { fontSize: 28, letterSpacing: -0.6 },
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
  summaryValue: { fontSize: 13, flexShrink: 1, textAlign: 'right' },
  consentCard: { gap: 12 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checkbox: { width: 22, height: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  consentText: { flex: 1, fontSize: 12, lineHeight: 17 },
  loginLink: { textAlign: 'center', fontSize: 13, marginTop: 8 },
})
