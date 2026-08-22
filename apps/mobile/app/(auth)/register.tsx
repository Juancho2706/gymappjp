import { useMemo, useRef, useState } from 'react'
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useRouter } from 'expo-router'
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronLeft,
  Lock,
  Mail,
  Store,
  User,
} from 'lucide-react-native'
import { MotiView } from 'moti'
import { RegisterCoachFreeSchema } from '@eva/schemas'
import { getTierCapabilities, getTierMaxClients, studentCountLabel, type SaleTier } from '@eva/tiers'
import { useTheme } from '../../context/ThemeContext'
import { AuthDivider, Button, Card, GoogleSignInButton, HapticPressable, Input } from '../../components'
import { toast } from '../../components/Toast'
import { ApiError, completeCoachOnboarding, registerCoachFree } from '../../lib/api'
import { rememberPendingSignup } from '../../lib/pending-signup'
import {
  GoogleSignInError,
  isGoogleSignInAvailable,
  resolveGoogleCoachDestination,
  signInWithGoogleCoach,
} from '../../lib/auth/google-signin'

type Step = 1 | 2

// Mobile registra SOLO tier free (endpoint register-coach-free). El wizard NO muestra selección de
// plan ni precios: las políticas de App Store (3.1.1) y Google Play prohíben CTA de pago externo
// dentro de la app, así que el registro móvil es siempre gratuito y el resumen solo informa estado.
const REGISTRABLE_TIER: SaleTier = 'free'

export default function RegisterScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [fullName, setFullName] = useState('')
  const [brandName, setBrandName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Para subir la contraseña por encima del teclado al enfocarla (Android edge-to-edge).
  const scrollRef = useRef<ScrollView>(null)
  const [acceptLegal, setAcceptLegal] = useState(false)
  const [acceptHealthData, setAcceptHealthData] = useState(false)
  const [acceptMarketing, setAcceptMarketing] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Onboarding Google: cuando el coach entra por Google sin fila `coaches`, el auth user YA existe
  // (signInWithIdToken). En este modo NO pedimos email/password (los toma la sesión) — solo la marca.
  const [googleMode, setGoogleMode] = useState(false)
  const showGoogle = isGoogleSignInAvailable()

  const pwdChecks = useMemo(
    () => [password.length >= 8, /\d/.test(password), /[a-zA-Z]/.test(password)],
    [password],
  )
  const pwdScore = pwdChecks.filter(Boolean).length
  const caps = useMemo(() => getTierCapabilities(REGISTRABLE_TIER), [])

  const canContinueStep1 = googleMode
    ? fullName.trim().length >= 2 && brandName.trim().length >= 2
    : fullName.trim().length >= 2 &&
      brandName.trim().length >= 2 &&
      email.trim().length > 0 &&
      password.length >= 8
  const canSubmit = acceptLegal && acceptHealthData

  // ── Google Sign-In nativo (coach) — espejo del GoogleSignInButton web (intent=register) ──
  async function handleGoogleRegister() {
    setGoogleLoading(true)
    setError(null)
    try {
      const result = await signInWithGoogleCoach()
      const dest = await resolveGoogleCoachDestination('register')
      if (dest.kind === 'home') {
        // Coach ya existente: entra directo (no re-registrar).
        router.replace('/coach/home')
        return
      }
      // Sin fila coaches → completar alta con la marca. Prefill del nombre que reporta Google.
      if (result.fullName && !fullName.trim()) setFullName(result.fullName)
      if (result.email) setEmail(result.email)
      setGoogleMode(true)
      setStep(1)
    } catch (err) {
      if (err instanceof GoogleSignInError && err.code === 'cancelled') return
      setError(err instanceof GoogleSignInError ? err.message : 'No se pudo continuar con Google.')
    } finally {
      setGoogleLoading(false)
    }
  }

  function goNext() {
    setError(null)
    if (step === 1) {
      if (!canContinueStep1) {
        setError('Completa tus datos antes de continuar. La contraseña necesita al menos 8 caracteres.')
        return
      }
      setStep(2)
    }
  }

  function goBack() {
    setError(null)
    if (step === 1) {
      router.replace('/(auth)/login?role=coach')
      return
    }
    setStep(1)
  }

  async function handleCreate() {
    if (!canSubmit) {
      setError('Debes aceptar los términos y el tratamiento de datos de salud para crear tu cuenta.')
      return
    }

    // ── Modo Google: el auth user ya existe; solo materializamos la fila `coaches` (free) ──
    if (googleMode) {
      if (fullName.trim().length < 2 || brandName.trim().length < 2) {
        setError('Ingresa tu nombre y el de tu marca (mínimo 2 caracteres).')
        return
      }
      setError(null)
      setLoading(true)
      try {
        await completeCoachOnboarding({
          fullName: fullName.trim(),
          brandName: brandName.trim(),
          acceptLegal: true,
          acceptHealthData: true,
          acceptMarketing,
        })
        await AsyncStorage.setItem('eva_user_role', 'coach')
        router.replace('/coach/home')
      } catch (err) {
        const message = err instanceof ApiError ? err.message : 'Intenta nuevamente en unos momentos.'
        setError(message)
        toast.error('No se pudo crear la cuenta', { description: message })
      } finally {
        setLoading(false)
      }
      return
    }

    const parsed = RegisterCoachFreeSchema.safeParse({
      full_name: fullName.trim(),
      brand_name: brandName.trim(),
      email: email.trim().toLowerCase(),
      password,
    })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa los campos del formulario.')
      return
    }

    setError(null)
    setLoading(true)
    try {
      const created = await registerCoachFree({
        fullName: parsed.data.full_name,
        brandName: parsed.data.brand_name,
        email: parsed.data.email,
        password: parsed.data.password,
        acceptLegal: true,
        acceptHealthData: true,
        acceptMarketing,
      })
      // El `uid` es la llave del reenvio del correo de confirmacion en la pantalla siguiente (no hay
      // sesion hasta que el coach confirma). Espejo del `?uid=` del registro web. Si el server es
      // anterior a W4 no viene y la pantalla degrada sola.
      const uidParam = created.uid ? `&uid=${encodeURIComponent(created.uid)}` : ''
      // Solo en memoria: la pantalla siguiente entra sola al panel apenas el correo esté confirmado.
      rememberPendingSignup(parsed.data.email, parsed.data.password)
      router.replace(`/(auth)/verify-email?email=${encodeURIComponent(parsed.data.email)}${uidParam}`)
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Intenta nuevamente en unos momentos.'
      setError(message)
      toast.error('No se pudo crear la cuenta', { description: message })
    } finally {
      setLoading(false)
    }
  }

  const stepLabel = ['Tu cuenta', 'Confirmar'][step - 1]

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      {/* `padding` también en Android: con edge-to-edge (SDK 54) `adjustResize` ya no encoge la
          ventana y el teclado tapaba la contraseña (QA del owner 22-08). */}
      <KeyboardAvoidingView behavior="padding" style={styles.kav}>
        {/* Wizard header — back + "Paso X de 2" + barras de progreso */}
        <View style={styles.header}>
          <Pressable
            onPress={goBack}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Atras"
            testID="register-back"
            className="items-center justify-center rounded-control bg-surface-sunken"
            style={styles.backBtn}
          >
            <ChevronLeft size={20} color={theme.text} />
          </Pressable>
          <View style={styles.headerProgress}>
            <View style={styles.headerLabels}>
              <Text className="text-strong font-display-bold" style={styles.stepCount}>
                Paso {step} de 2
              </Text>
              <Text className="text-subtle font-sans" style={styles.stepName}>
                {stepLabel}
              </Text>
            </View>
            <View style={styles.progressRow}>
              {[1, 2].map((s) => (
                <View
                  key={s}
                  className={step >= s ? 'bg-sport-500' : 'bg-surface-sunken'}
                  style={styles.progressBar}
                />
              ))}
            </View>
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <MotiView
            key={step}
            from={{ opacity: 0, translateY: 16 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 380 }}
            style={styles.content}
          >
            {/* P0 focus-hop: slot SIEMPRE montado. Antes el banner era un hermano
                condicional insertado ANTES de los inputs → al aparecer/desaparecer
                cambiaba la forma del árbol y remontaba los inputs (rompía el foco).
                Ahora el View del slot es estable; solo su contenido interno varía. */}
            <View>
              {error ? (
                <View className="rounded-control bg-danger-100" style={styles.errorBanner} testID="register-error">
                  <Text className="text-danger-600 font-sans-semibold" style={styles.errorText}>
                    {error}
                  </Text>
                </View>
              ) : null}
            </View>

            {step === 1 ? (
              <View style={styles.form}>
                <View style={styles.heading}>
                  <Text className="text-strong font-display-black" style={styles.title}>
                    Crea tu cuenta de coach
                  </Text>
                  <Text className="text-muted font-sans" style={styles.subtitle}>
                    Tu marca, tus alumnos, tu negocio — en una sola app.
                  </Text>
                </View>

                <Input
                  label="Nombre completo"
                  leftIcon={User}
                  placeholder="Juan Perez"
                  value={fullName}
                  onChangeText={setFullName}
                  autoComplete="name"
                  editable={!loading}
                  testID="register-fullname-input"
                />
                <Input
                  label="Nombre de tu marca"
                  leftIcon={Store}
                  placeholder="Ej: JotaP Fitness"
                  value={brandName}
                  onChangeText={setBrandName}
                  editable={!loading}
                  hint="Tu enlace para alumnos se genera con un código único en tu panel."
                  testID="register-brand-input"
                />
                {googleMode ? (
                  <View
                    className="rounded-control bg-success-100 flex-row items-center"
                    style={{ gap: 8, paddingHorizontal: 14, paddingVertical: 11 }}
                    testID="register-google-connected"
                  >
                    <CheckCircle2 size={16} color={theme.success} />
                    <Text className="text-success-600 font-sans-semibold" style={{ fontSize: 12.5, flex: 1 }} numberOfLines={1}>
                      Conectado con Google{email ? ` · ${email}` : ''}
                    </Text>
                  </View>
                ) : (
                  <>
                    <Input
                      label="Email"
                      leftIcon={Mail}
                      placeholder="coach@ejemplo.com"
                      value={email}
                      onChangeText={setEmail}
                      autoCapitalize="none"
                      keyboardType="email-address"
                      autoComplete="email"
                      editable={!loading}
                      testID="register-email-input"
                    />
                    <View>
                      <Input
                        label="Contraseña"
                        leftIcon={Lock}
                        placeholder="Mínimo 8 caracteres"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                        autoComplete="new-password"
                        editable={!loading}
                        testID="register-password-input"
                        // Último campo del paso: al enfocarlo, el scroll lo sube por encima del
                        // teclado (cinturón del KeyboardAvoidingView en Android).
                        onFocus={() => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120)}
                      />
                      {password.length > 0 ? (
                        <View style={styles.pwdMeter}>
                          <View style={styles.pwdBars}>
                            {[0, 1, 2].map((i) => (
                              <View
                                key={i}
                                className={
                                  i < pwdScore
                                    ? pwdScore === 3
                                      ? 'bg-success-500'
                                      : pwdScore === 2
                                        ? 'bg-warning-500'
                                        : 'bg-danger-500'
                                    : 'bg-surface-sunken'
                                }
                                style={styles.pwdBar}
                              />
                            ))}
                          </View>
                          <Text className="text-muted font-sans" style={styles.pwdHint}>
                            {pwdScore === 3 ? 'Contraseña segura' : '8+ caracteres con letras y números.'}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                  </>
                )}

                <Button
                  label="Continuar"
                  variant="sport"
                  rightIcon={ArrowRight}
                  onPress={goNext}
                  disabled={!canContinueStep1}
                  full
                  size="lg"
                  testID="register-continue"
                />

                {showGoogle && !googleMode ? (
                  <View style={{ gap: 14 }}>
                    <AuthDivider />
                    <GoogleSignInButton
                      intent="register"
                      onPress={handleGoogleRegister}
                      loading={googleLoading}
                      disabled={loading}
                    />
                  </View>
                ) : null}

                <Pressable onPress={() => router.replace('/(auth)/login?role=coach')} hitSlop={8} testID="register-login-link">
                  <Text className="font-sans" style={styles.loginLine}>
                    <Text className="text-muted">¿Ya tienes cuenta? </Text>
                    <Text className="text-sport-600 font-sans-bold">Inicia sesión</Text>
                  </Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.form}>
                <View style={styles.heading}>
                  <Text className="text-strong font-display-black" style={styles.title}>
                    Tu plan gratuito
                  </Text>
                  <Text className="text-muted font-sans" style={styles.subtitle}>
                    Revisa y confirma. Sin tarjeta de crédito.
                  </Text>
                </View>

                <Card variant="default" padding={16} style={styles.summaryCard}>
                  <SummaryRow label="Coach" value={fullName.trim()} />
                  <SummaryRow label="Marca" value={brandName.trim()} />
                  <SummaryRow label="Email" value={email.trim().toLowerCase()} />
                  <SummaryRow label="Plan" value="Gratis" />
                  <SummaryRow label="Cupo" value={studentCountLabel(getTierMaxClients(REGISTRABLE_TIER))} />
                  {/* Nutricion base (V2) viene incluida en TODOS los planes, Free incluido:
                      la superficie no tiene gate de tier. `caps.canUseNutrition` solo gatea
                      la compra del add-on en billing, por eso esta fila no lo consulta. */}
                  <SummaryRow label="Nutrición" value="Incluida" tone="success" />
                  <SummaryRow
                    label="Tu marca (white-label)"
                    value={caps.canUseBranding ? 'Incluida' : 'No incluida'}
                    tone={caps.canUseBranding ? 'success' : 'warning'}
                    last
                  />
                </Card>

                <Card variant="default" padding={14} style={styles.consentCard}>
                  <ConsentRow
                    checked={acceptLegal}
                    onPress={() => setAcceptLegal((v) => !v)}
                    label="Acepto los términos de servicio y la política de privacidad."
                    required
                    testID="register-consent-legal"
                  />
                  <ConsentRow
                    checked={acceptHealthData}
                    onPress={() => setAcceptHealthData((v) => !v)}
                    label="Acepto el tratamiento de datos de salud de mis alumnos para prestar el servicio, conforme a la Ley 21.719."
                    required
                    testID="register-consent-health"
                  />
                  <ConsentRow
                    checked={acceptMarketing}
                    onPress={() => setAcceptMarketing((v) => !v)}
                    label="Quiero recibir novedades, ofertas y consejos de EVA por email."
                    testID="register-consent-marketing"
                  />
                </Card>

                <Button
                  label="Empezar gratis"
                  variant="sport"
                  rightIcon={ArrowRight}
                  onPress={handleCreate}
                  loading={loading}
                  disabled={!canSubmit}
                  full
                  size="lg"
                  testID="register-submit"
                />

                <View style={styles.secureNote}>
                  <CheckCircle2 size={14} color={theme.success} />
                  <Text className="text-muted font-sans" style={styles.secureText}>
                    Registro seguro · Acceso inmediato · Sin tarjeta.
                  </Text>
                </View>
              </View>
            )}
          </MotiView>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function ConsentRow({
  checked,
  onPress,
  label,
  required,
  testID,
}: {
  checked: boolean
  onPress: () => void
  label: string
  required?: boolean
  testID?: string
}) {
  const { theme } = useTheme()
  return (
    <HapticPressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      testID={testID}
      style={styles.consentRow}
    >
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
        {checked ? <Check size={14} color={theme.primaryForeground} strokeWidth={2.5} /> : null}
      </View>
      <Text className="text-body font-sans" style={styles.consentText}>
        {label}
        {required ? <Text className="text-danger-600"> *</Text> : null}
      </Text>
    </HapticPressable>
  )
}

function SummaryRow({
  label,
  value,
  tone,
  last,
}: {
  label: string
  value: string
  tone?: 'success' | 'warning'
  last?: boolean
}) {
  const { theme } = useTheme()
  const valueClass =
    tone === 'success' ? 'text-success-600' : tone === 'warning' ? 'text-warning-700' : 'text-strong'
  return (
    <View style={[styles.summaryRow, !last && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Text className="text-muted font-sans" style={styles.summaryLabel}>
        {label}
      </Text>
      <Text className={`${valueClass} font-sans-semibold`} style={styles.summaryValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  kav: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 24, paddingTop: 8, paddingBottom: 10 },
  backBtn: { width: 38, height: 38 },
  headerProgress: { flex: 1, gap: 6 },
  headerLabels: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  stepCount: { fontSize: 12.5 },
  stepName: { fontSize: 12 },
  progressRow: { flexDirection: 'row', gap: 4 },
  progressBar: { flex: 1, height: 4, borderRadius: 999 },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 6, paddingBottom: 160 },
  content: { gap: 16 },
  heading: { gap: 6 },
  title: { fontSize: 26, letterSpacing: -0.6, lineHeight: 30 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  form: { gap: 16 },
  errorBanner: { paddingHorizontal: 14, paddingVertical: 11 },
  errorText: { fontSize: 13, lineHeight: 18 },
  pwdMeter: { marginTop: 8, gap: 6 },
  pwdBars: { flexDirection: 'row', gap: 4 },
  pwdBar: { flex: 1, height: 4, borderRadius: 999 },
  pwdHint: { fontSize: 11 },
  loginLine: { textAlign: 'center', fontSize: 13, marginTop: 2 },
  summaryCard: { gap: 0 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 11 },
  summaryLabel: { fontSize: 13 },
  summaryValue: { fontSize: 13, flexShrink: 1, textAlign: 'right' },
  consentCard: { gap: 14 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checkbox: { width: 22, height: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  consentText: { flex: 1, fontSize: 12.5, lineHeight: 18 },
  secureNote: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 },
  secureText: { fontSize: 12 },
})
