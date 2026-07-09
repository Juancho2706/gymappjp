import { useMemo, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
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
  Globe,
  Lock,
  Mail,
  Minus,
  Sparkles,
  Store,
  User,
} from 'lucide-react-native'
import { MotiView } from 'moti'
import { RegisterCoachFreeSchema } from '@eva/schemas'
import {
  BILLING_CYCLE_CONFIG,
  getDefaultBillingCycleForTier,
  getTierCapabilities,
  getTierPriceClp,
  SALE_TIERS,
  TIER_CONFIG,
  type SaleTier,
} from '@eva/tiers'
import { useTheme } from '../../context/ThemeContext'
import { AuthDivider, Button, Card, GoogleSignInButton, HapticPressable, Input } from '../../components'
import { toast } from '../../components/Toast'
import { ApiError, completeCoachOnboarding, registerCoachFree } from '../../lib/api'
import {
  GoogleSignInError,
  isGoogleSignInAvailable,
  resolveGoogleCoachDestination,
  signInWithGoogleCoach,
} from '../../lib/auth/google-signin'

type Step = 1 | 2 | 3

// Mobile v1 registra SOLO tier free (endpoint register-coach-free). Los planes pagos se
// completan en eva-app.cl (money-safety = web-only). El paso "Tu plan" replica el visual de
// radio-cards del web (delta §4.2) con free seleccionable y los pagos como referencia.
const REGISTRABLE_TIER: SaleTier = 'free'

export default function RegisterScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [fullName, setFullName] = useState('')
  const [brandName, setBrandName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [tier, setTier] = useState<SaleTier>('free')
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
        setError('Completa tus datos antes de continuar. La contrasena necesita al menos 8 caracteres.')
        return
      }
      setStep(2)
      return
    }
    if (step === 2) {
      setStep(3)
    }
  }

  function goBack() {
    setError(null)
    if (step === 1) {
      router.replace('/(auth)/login?role=coach')
      return
    }
    setStep((s) => (s === 3 ? 2 : 1) as Step)
  }

  function selectTier(next: SaleTier) {
    if (next !== REGISTRABLE_TIER) {
      toast.info('Disponible en eva-app.cl', {
        description: 'La app crea tu cuenta gratis. Los planes pagos se activan en la web.',
      })
      return
    }
    setTier(next)
  }

  async function handleCreate() {
    if (!canSubmit) {
      setError('Debes aceptar los terminos y el tratamiento de datos de salud para crear tu cuenta.')
      return
    }

    // ── Modo Google: el auth user ya existe; solo materializamos la fila `coaches` (free) ──
    if (googleMode) {
      if (fullName.trim().length < 2 || brandName.trim().length < 2) {
        setError('Ingresa tu nombre y el de tu marca (minimo 2 caracteres).')
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
      await registerCoachFree({
        fullName: parsed.data.full_name,
        brandName: parsed.data.brand_name,
        email: parsed.data.email,
        password: parsed.data.password,
        acceptLegal: true,
        acceptHealthData: true,
        acceptMarketing,
      })
      router.replace(`/(auth)/verify-email?email=${encodeURIComponent(parsed.data.email)}`)
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Intenta nuevamente en unos momentos.'
      setError(message)
      toast.error('No se pudo crear la cuenta', { description: message })
    } finally {
      setLoading(false)
    }
  }

  const stepLabel = ['Tu cuenta', 'Tu plan', 'Confirmar'][step - 1]

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.kav}>
        {/* Wizard header — back + "Paso X de 3" + barras de progreso (espejo web) */}
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
                Paso {step} de 3
              </Text>
              <Text className="text-subtle font-sans" style={styles.stepName}>
                {stepLabel}
              </Text>
            </View>
            <View style={styles.progressRow}>
              {[1, 2, 3].map((s) => (
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
                  <View className="flex-row items-center self-start rounded-pill bg-sport-100" style={styles.pill}>
                    <Sparkles size={12} color={theme.primary} strokeWidth={2.25} />
                    <Text className="text-sport-600 font-display-bold" style={styles.pillText}>
                      Cuenta coach
                    </Text>
                  </View>
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
                  hint="Tu enlace para alumnos se genera con un codigo unico en tu panel."
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
                        label="Contrasena"
                        leftIcon={Lock}
                        placeholder="Minimo 8 caracteres"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                        autoComplete="new-password"
                        editable={!loading}
                        testID="register-password-input"
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
                            {pwdScore === 3 ? 'Contrasena segura' : '8+ caracteres con letras y numeros.'}
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
                    <Text className="text-muted">Ya tienes cuenta? </Text>
                    <Text className="text-sport-600 font-sans-bold">Inicia sesion</Text>
                  </Text>
                </Pressable>
              </View>
            ) : step === 2 ? (
              <View style={styles.form}>
                <View style={styles.heading}>
                  <Text className="text-strong font-display-black" style={styles.title}>
                    Elige tu plan
                  </Text>
                  <Text className="text-muted font-sans" style={styles.subtitle}>
                    Empieza gratis desde la app. Los planes pagos se activan en eva-app.cl.
                  </Text>
                </View>

                <View style={styles.tierGroup}>
                  {SALE_TIERS.map((key) => (
                    <TierCard
                      key={key}
                      tierKey={key}
                      selected={tier === key}
                      registrable={key === REGISTRABLE_TIER}
                      onPress={() => selectTier(key)}
                    />
                  ))}
                </View>

                <Button
                  label="Continuar"
                  variant="sport"
                  rightIcon={ArrowRight}
                  onPress={goNext}
                  full
                  size="lg"
                  testID="register-continue"
                />
              </View>
            ) : (
              <View style={styles.form}>
                <View style={styles.heading}>
                  <Text className="text-strong font-display-black" style={styles.title}>
                    Tu plan gratuito
                  </Text>
                  <Text className="text-muted font-sans" style={styles.subtitle}>
                    Revisa y confirma. Sin tarjeta de credito.
                  </Text>
                </View>

                <Card variant="default" padding={16} style={styles.summaryCard}>
                  <SummaryRow label="Coach" value={fullName.trim()} />
                  <SummaryRow label="Marca" value={brandName.trim()} />
                  <SummaryRow label="Email" value={email.trim().toLowerCase()} />
                  <SummaryRow label="Plan" value={TIER_CONFIG[tier].label} />
                  <SummaryRow label="Alumnos" value={`Hasta ${TIER_CONFIG[tier].maxClients}`} />
                  <SummaryRow
                    label="Nutricion"
                    value={caps.canUseNutrition ? 'Incluida' : 'No incluida'}
                    tone={caps.canUseNutrition ? 'success' : 'warning'}
                  />
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
                    label="Acepto los terminos de servicio y la politica de privacidad."
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

/** Radio-card de plan (espejo del radiogroup web §4.2). Solo `free` es registrable en mobile. */
function TierCard({
  tierKey,
  selected,
  registrable,
  onPress,
}: {
  tierKey: SaleTier
  selected: boolean
  registrable: boolean
  onPress: () => void
}) {
  const { theme } = useTheme()
  const cfg = TIER_CONFIG[tierKey]
  const caps = getTierCapabilities(tierKey)
  const isFree = tierKey === 'free'
  const isPopular = tierKey === 'pro'
  const cycle = getDefaultBillingCycleForTier(tierKey)
  const price = getTierPriceClp(tierKey, cycle)
  const cycleLabel = BILLING_CYCLE_CONFIG[cycle].label.toLowerCase()

  const features = [
    { label: `Hasta ${cfg.maxClients} alumnos`, included: true },
    { label: 'Planes de nutricion', included: caps.canUseNutrition },
    { label: 'Branding personalizado', included: caps.canUseBranding },
  ]

  return (
    <HapticPressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      testID={`register-tier-${tierKey}`}
      className={
        selected
          ? 'rounded-card border-[1.5px] border-sport-500 bg-sport-100'
          : 'rounded-card border-[1.5px] border-subtle bg-surface-card'
      }
      style={[styles.tierCard, !registrable && !selected ? styles.tierDisabled : null]}
    >
      <View style={styles.tierTop}>
        {/* Indicador de radio */}
        <View
          className={selected ? 'border-sport-500 bg-sport-500' : 'border-default'}
          style={styles.radioOuter}
        >
          {selected ? <View style={[styles.radioInner, { backgroundColor: theme.primaryForeground }]} /> : null}
        </View>

        <View style={styles.tierBody}>
          <View style={styles.tierNameRow}>
            <Text className="text-strong font-display-black" style={styles.tierName}>
              {cfg.label}
            </Text>
            {isFree ? (
              <View className="rounded-pill bg-success-100" style={styles.tierBadge}>
                <Text className="text-success-600 font-display-bold" style={styles.tierBadgeText}>
                  Gratis para siempre
                </Text>
              </View>
            ) : null}
            {isPopular ? (
              <View className="rounded-pill bg-sport-500" style={styles.tierBadge}>
                <Text className="text-on-sport font-display-bold" style={styles.tierBadgeText}>
                  Mas popular
                </Text>
              </View>
            ) : null}
            {!registrable ? (
              <View className="rounded-pill bg-surface-sunken" style={styles.tierBadge}>
                <Text className="text-muted font-sans-semibold" style={styles.tierBadgeText}>
                  En eva-app.cl
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.tierPriceRow}>
            {isFree ? (
              <>
                <Text className="text-success-600 font-display-black" style={styles.tierPrice}>
                  $0
                </Text>
                <Text className="text-muted font-sans-semibold" style={styles.tierPriceMeta}>
                  · Sin tarjeta
                </Text>
              </>
            ) : (
              <>
                <Text className="text-strong font-display-black" style={styles.tierPrice}>
                  ${price.toLocaleString('es-CL')}
                </Text>
                <Text className="text-muted font-sans" style={styles.tierPriceMeta}>
                  CLP / {cycleLabel}
                </Text>
              </>
            )}
          </View>

          <View style={styles.tierFeatures}>
            {features.map((f) => (
              <View key={f.label} style={styles.tierFeatureRow}>
                {f.included ? (
                  <Check size={14} color={theme.primary} strokeWidth={2.5} />
                ) : (
                  <Minus size={14} color={theme.muted} strokeWidth={2.5} />
                )}
                <Text
                  className={f.included ? 'text-body font-sans' : 'text-subtle font-sans'}
                  style={[styles.tierFeatureText, !f.included && styles.tierFeatureStrike]}
                >
                  {f.label}
                </Text>
              </View>
            ))}
          </View>
        </View>
      </View>
    </HapticPressable>
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
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 6, paddingBottom: 32 },
  content: { gap: 16 },
  heading: { gap: 6 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, marginBottom: 2 },
  pillText: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4 },
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
  tierGroup: { gap: 10 },
  tierCard: { padding: 16 },
  tierDisabled: { opacity: 0.6 },
  tierTop: { flexDirection: 'row', gap: 12 },
  radioOuter: { width: 20, height: 20, borderRadius: 999, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  radioInner: { width: 8, height: 8, borderRadius: 999 },
  tierBody: { flex: 1, gap: 4 },
  tierNameRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  tierName: { fontSize: 15, letterSpacing: -0.2 },
  tierBadge: { paddingHorizontal: 6, paddingVertical: 2 },
  tierBadgeText: { fontSize: 10, letterSpacing: 0.2 },
  tierPriceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 2 },
  tierPrice: { fontSize: 20 },
  tierPriceMeta: { fontSize: 12 },
  tierFeatures: { marginTop: 8, gap: 4 },
  tierFeatureRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tierFeatureText: { fontSize: 12.5, flex: 1 },
  tierFeatureStrike: { textDecorationLine: 'line-through' },
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
