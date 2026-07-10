import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Image } from 'expo-image'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ArrowRight, Check, ChevronLeft, Eye, EyeOff, Lock, Mail, Sparkles } from 'lucide-react-native'
import { MotiView } from 'moti'
import * as Haptics from 'expo-haptics'
import { LoginSchema } from '@eva/schemas'
import { resolveBrandTheme, resolvePresetBranding } from '@eva/brand-kit'
import { isBrandingAllowed, type SubscriptionTier } from '@eva/tiers'
import { supabase } from '../../lib/supabase'
import { translateAuthError } from '../../lib/auth-errors'
import {
  GoogleSignInError,
  isGoogleSignInAvailable,
  resolveGoogleCoachDestination,
  signInWithGoogleCoach,
  signOutGoogleAndSupabase,
} from '../../lib/auth/google-signin'
import { useTheme } from '../../context/ThemeContext'
import { FONT, TYPE } from '../../lib/typography'
import { SHADOWS } from '../../lib/shadows'
import { AuthDivider, Card, GoogleSignInButton, Input } from '../../components'
import { EvaLoader } from '../../components/EvaLoader'

const REMEMBER_KEY = 'eva_remember_email'

// Fallback de marca EVA para el login (espejo de `BRAND_PRIMARY_COLOR` en
// apps/web/src/lib/brand-assets.ts): tier < Pro cae a este verde EVA.
const EVA_BRAND_COLOR = '#10B981'

// ── Layouts de login white-label (espejo de brand-composer.ts en web) ──
const LOGIN_LAYOUT_KEYS = ['clasico', 'hero', 'energia', 'minimal'] as const
type LoginLayoutKey = (typeof LOGIN_LAYOUT_KEYS)[number]
function resolveLoginLayout(value?: string | null): LoginLayoutKey {
  return value && (LOGIN_LAYOUT_KEYS as readonly string[]).includes(value)
    ? (value as LoginLayoutKey)
    : 'clasico'
}

/** Iniciales del nombre de marca para el brand-mark cuando no hay logo. */
function brandInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'EVA'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[1][0]).toUpperCase()
}

/** Oscurece un hex mezclandolo con negro (para el degradado del hero). */
function mixBlack(hex: string, amount: number): string {
  const h = hex.replace('#', '')
  const ch = (i: number) => Math.round((parseInt(h.slice(i, i + 2), 16) || 0) * (1 - amount))
  const to2 = (n: number) => n.toString(16).padStart(2, '0')
  return `#${to2(ch(0))}${to2(ch(2))}${to2(ch(4))}`
}

/**
 * rgba() a partir de un color solido `#rrggbb` (p.ej. el `accentText` CONTRAST-AWARE
 * del brand-kit) a una opacidad dada. Se usa para el texto "muted" del hero: en vez de
 * blanco a mano, deriva la version tenue del color legible que el brand-kit ya eligio
 * (blanco o casi-negro segun la luminancia del acento del coach).
 */
function withAlpha(hex: string, a: number): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16) || 0
  const g = parseInt(h.slice(2, 4), 16) || 0
  const b = parseInt(h.slice(4, 6), 16) || 0
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

export default function LoginScreen() {
  const { role, switch: canSwitch } = useLocalSearchParams<{ role: 'coach' | 'alumno'; switch?: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { theme, branding, resolvedScheme } = useTheme()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [remember, setRemember] = useState(true)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Ref para el enfoque encadenado email → contraseña (returnKeyType="next").
  const passwordRef = useRef<TextInput>(null)

  const isAlumno = role === 'alumno'
  // Google login SOLO coach (alumno DIFERIDO por CEO) y solo si hay webClientId (fail-closed).
  const showGoogle = !isAlumno && isGoogleSignInAvailable()

  useEffect(() => {
    AsyncStorage.getItem(REMEMBER_KEY).then((v) => {
      if (v) setEmail(v)
    })
  }, [])

  // ── Theming white-label del login (gate Pro+ como web) ──
  // Tier < Pro => branding EVA conservando el nombre (isBrandingAllowed). El preset curado
  // (theme_preset_key) override color/color2/acento ANTES de derivar el tema (paridad web).
  const brandName = branding?.displayName ?? 'tu coach'
  const brandingAllowed = branding?.subscriptionTier
    ? isBrandingAllowed(branding.subscriptionTier as SubscriptionTier)
    : false

  const preset = resolvePresetBranding({
    theme_preset_key: branding?.themePresetKey ?? null,
    primary_color: branding?.primaryColor ?? null,
    brand_secondary_color: branding?.brandSecondaryColor ?? null,
    accent_light: branding?.accentLight ?? null,
    accent_dark: branding?.accentDark ?? null,
    neutral_tint: branding?.neutralTint ?? null,
    brand_font_key: branding?.brandFontKey ?? null,
    loader_variant: branding?.loaderVariant ?? null,
  })

  const brandColor = brandingAllowed
    ? preset.primary_color || branding?.primaryColor || EVA_BRAND_COLOR
    : EVA_BRAND_COLOR
  const bt = resolveBrandTheme({
    brandColor,
    accentLight: brandingAllowed ? preset.accent_light : null,
    accentDark: brandingAllowed ? preset.accent_dark : null,
    secondaryLight: brandingAllowed ? preset.brand_secondary_color : null,
    secondaryDark: brandingAllowed ? preset.brand_secondary_color : null,
    neutralTint: brandingAllowed ? preset.neutral_tint ?? false : false,
  })[resolvedScheme]

  const loginAccent = bt.accent
  const loginAccentText = bt.accentText
  // Hero brandeado: el texto usa el accentText CONTRAST-AWARE del brand-kit, NO blanco fijo.
  // - Marca oscura => accentText blanco => se conserva la profundidad (oscurecido) del degradado.
  // - Marca clara  => accentText casi-negro => el degradado NO debe oscurecerse (romperia el
  //   texto negro sobre el acento ya de por si claro): se aplana para que el negro mantenga su
  //   contraste nativo (pickOnColor garantiza el maximo posible sobre el acento plano).
  const heroTextLight = loginAccentText.toLowerCase() === '#ffffff'
  const heroTextMuted = withAlpha(loginAccentText, 0.92)
  const logoUrl = brandingAllowed
    ? (resolvedScheme === 'dark' && branding?.logoUrlDark) || branding?.logoUrl || null
    : null
  const initials = brandInitials(brandName === 'tu coach' ? 'EVA' : brandName)
  const tagline = branding?.welcomeMessage?.trim() || 'Tu plataforma de entrenamiento personalizado'
  const layout = brandingAllowed ? resolveLoginLayout(branding?.loginLayoutKey) : 'clasico'

  async function handleLogin() {
    setLoading(true)
    setError(null)
    const parsed = LoginSchema.safeParse({ email: email.trim(), password })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      setLoading(false)
      return
    }
    const { error: signInError } = await supabase.auth.signInWithPassword(parsed.data)
    if (signInError) {
      setError(translateAuthError(signInError.message))
      setLoading(false)
      return
    }

    // E1-17 — validacion de workspace/coach (espejo de clientLoginAction en web): el email
    // autenticado debe pertenecer al coach cuyo branding se cargo (standalone) o a un coach de
    // su misma org (enterprise). Evita entrar "brandeado por X" con la cuenta de otro coach.
    if (isAlumno) {
      const workspaceError = await validateAlumnoWorkspace(branding?.coachId ?? null)
      if (workspaceError) {
        setError(workspaceError)
        setLoading(false)
        return
      }
    }

    if (remember) await AsyncStorage.setItem(REMEMBER_KEY, email.trim())
    else await AsyncStorage.removeItem(REMEMBER_KEY)
    await AsyncStorage.setItem('eva_user_role', role ?? 'coach')
    router.replace(isAlumno ? '/alumno/home' : '/coach/home')
  }

  // ── Google Sign-In nativo (coach) — espejo del GoogleSignInButton web (intent=login) ──
  async function handleGoogleCoach() {
    setGoogleLoading(true)
    setError(null)
    try {
      await signInWithGoogleCoach()
      const dest = await resolveGoogleCoachDestination('login')
      if (dest.kind === 'home') {
        await AsyncStorage.setItem('eva_user_role', 'coach')
        router.replace('/coach/home')
        return
      }
      // Google válido pero sin cuenta coach: cortamos la sesión (como web → /login?error=no_google_account).
      await signOutGoogleAndSupabase()
      setError('No hay una cuenta de coach vinculada a este Google. Registrate primero.')
    } catch (err) {
      // Cancelar no es un error para el usuario.
      if (err instanceof GoogleSignInError && err.code === 'cancelled') return
      setError(err instanceof GoogleSignInError ? err.message : 'No se pudo iniciar sesión con Google.')
    } finally {
      setGoogleLoading(false)
    }
  }

  // ── Bloque de campos (compartido coach/alumno) ──
  function renderFields(accent: string, accentText: string, submitLabel: string) {
    // Android (HyperOS/MIUI/Samsung): el autofill del OEM roba el foco al tocar el
    // email y lo salta al campo de contraseña, cerrando el teclado (bug P0 en Xiaomi
    // 14T). `importantForAutofill="no"` + `autoComplete="off"` desactivan el servicio
    // de autofill SOLO en Android; iOS conserva la semántica de autocompletado.
    const isAndroid = Platform.OS === 'android'
    return (
      <View style={{ gap: 14 }}>
        <Input
          label="Email"
          leftIcon={Mail}
          placeholder="tu@email.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete={isAndroid ? 'off' : 'email'}
          importantForAutofill={isAndroid ? 'no' : undefined}
          returnKeyType="next"
          submitBehavior="submit"
          onSubmitEditing={() => passwordRef.current?.focus()}
          editable={!loading}
          testID="login-email-input"
        />

        <Input
          ref={passwordRef}
          label="Contraseña"
          leftIcon={Lock}
          rightIcon={showPwd ? EyeOff : Eye}
          onRightIconPress={() => setShowPwd((s) => !s)}
          rightIconLabel={showPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          placeholder="••••••••"
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPwd}
          autoComplete={isAndroid ? 'off' : 'password'}
          importantForAutofill={isAndroid ? 'no' : undefined}
          returnKeyType="done"
          onSubmitEditing={handleLogin}
          editable={!loading}
          testID="login-password-input"
          trailingLabel={
            <Text
              onPress={() => router.push('/(auth)/forgot-password')}
              className="font-sans-semibold"
              style={{ fontSize: 12, color: accent }}
              testID="login-forgot-link"
            >
              ¿Olvidaste tu contraseña?
            </Text>
          }
        />

        {/* Remember me — solo coach (web alumno no lo tiene) */}
        {!isAlumno ? (
          <Pressable
            onPress={() => setRemember((r) => !r)}
            className="flex-row items-center"
            style={{ gap: 8 }}
          >
            <View
              className="items-center justify-center"
              style={{
                width: 20,
                height: 20,
                borderRadius: 6,
                borderWidth: 1.5,
                borderColor: remember ? accent : theme.border,
                backgroundColor: remember ? accent : 'transparent',
              }}
            >
              {remember ? <Check size={13} color={accentText} strokeWidth={3} /> : null}
            </View>
            <Text className="text-muted font-sans" style={{ fontSize: 13 }}>
              Recordarme
            </Text>
          </Pressable>
        ) : null}

        {error ? (
          <View
            className="rounded-control bg-danger-100"
            style={{ paddingHorizontal: 14, paddingVertical: 11 }}
            testID="login-error"
          >
            <Text className="text-danger-600 font-sans-semibold" style={{ fontSize: 13, lineHeight: 18 }}>
              {error}
            </Text>
          </View>
        ) : null}

        <BrandSubmit
          label={submitLabel}
          accent={accent}
          accentText={accentText}
          loading={loading}
          onPress={handleLogin}
        />
      </View>
    )
  }

  const poweredBy = (
    <View style={styles.poweredBy}>
      <Text className="text-subtle font-sans" style={{ fontSize: 11 }}>
        con tecnología de{' '}
      </Text>
      <Text className="text-muted font-sans-bold" style={{ fontSize: 11, letterSpacing: 0.2 }}>
        EVA
      </Text>
    </View>
  )

  // ════════════════ COACH — login generico (sin marca de coach) ════════════════
  if (!isAlumno) {
    return (
      <View className="flex-1 bg-surface-app">
        <LinearGradient
          colors={[theme.primary + '24', theme.primary + '0A', 'transparent']}
          locations={[0, 0.4, 0.75]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              justifyContent: 'center',
              paddingHorizontal: 24,
              paddingTop: insets.top + 24,
              paddingBottom: insets.bottom + 24,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <MotiView
              from={{ opacity: 0, translateY: 20 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 500 }}
              style={{ marginBottom: 24, gap: 8 }}
            >
              <View
                className="flex-row items-center self-start rounded-pill bg-surface-card border border-subtle"
                style={{ gap: 6, paddingHorizontal: 12, paddingVertical: 6 }}
              >
                <Sparkles size={12} color={theme.primary} strokeWidth={2.25} />
                <Text className="text-muted font-sans-medium" style={{ fontSize: 11, letterSpacing: 0.3 }}>
                  Panel del coach
                </Text>
              </View>
              <Text className="text-strong font-display-black" style={{ fontSize: 30, letterSpacing: -0.6, lineHeight: 34 }}>
                Bienvenido de vuelta
              </Text>
              <Text className="text-muted font-sans" style={{ fontSize: 14, lineHeight: 20 }}>
                Ingresá tus credenciales para acceder al panel
              </Text>
            </MotiView>

            <MotiView
              from={{ opacity: 0, translateY: 20 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 500, delay: 120 }}
            >
              <Card variant="default" padding={20} radius="card">
                {renderFields(theme.primary, theme.primaryForeground, 'Ingresar al panel')}
                {showGoogle ? (
                  <View style={{ gap: 14, marginTop: 16 }}>
                    <AuthDivider />
                    <GoogleSignInButton intent="login" onPress={handleGoogleCoach} loading={googleLoading} disabled={loading} />
                  </View>
                ) : null}
              </Card>
            </MotiView>

            <MotiView
              from={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ type: 'timing', duration: 600, delay: 360 }}
              style={{ marginTop: 28, alignItems: 'center', gap: 10 }}
            >
              <Text
                onPress={() => router.push('/(auth)/register')}
                className="text-sport-600 font-sans-semibold"
                style={{ fontSize: 13 }}
                testID="login-coach-register-link"
              >
                Crear cuenta nueva
              </Text>
              <Text className="text-subtle font-sans" style={{ fontSize: 12, letterSpacing: 0.3 }}>
                eva-app.cl
              </Text>
            </MotiView>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    )
  }

  // ════════════════ ALUMNO — login white-label brandeado ════════════════
  const fields = renderFields(loginAccent, loginAccentText, `Entrar a ${brandName}`)
  const displayFont = FONT.displayBlack

  // ── Hero de marca (logo/iniciales + brand_name + tagline) por layout ──
  const heroClasico = (
    <MotiView
      from={{ opacity: 0, translateY: 16 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 500 }}
      style={{ overflow: 'hidden', paddingHorizontal: 28, paddingBottom: 64, paddingTop: insets.top + 40 }}
    >
      <LinearGradient
        colors={heroTextLight
          ? [loginAccent, mixBlack(loginAccent, 0.22), mixBlack(loginAccent, 0.42)]
          : [loginAccent, mixBlack(loginAccent, 0.05), mixBlack(loginAccent, 0.1)]}
        locations={[0, 0.58, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['rgba(255,255,255,0.18)', 'transparent']}
        start={{ x: 0.2, y: 0 }}
        end={{ x: 0.8, y: 0.6 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <View style={{ alignItems: 'center' }} testID="login-brand-hero">
        <BrandMark px={76} glass logoUrl={logoUrl} initials={initials} accent={loginAccent} accentText={loginAccentText} />
        <Text style={[styles.heroTitleSm, { color: loginAccentText, fontFamily: displayFont }]}>{brandName}</Text>
        <Text style={[styles.heroTagline, { color: heroTextMuted }]}>{tagline}</Text>
      </View>
    </MotiView>
  )

  const heroBig = (
    <MotiView
      from={{ opacity: 0, translateY: 16 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 500 }}
      style={{ alignItems: 'center', paddingHorizontal: 28, paddingTop: insets.top + 48, paddingBottom: 36 }}
      testID="login-brand-hero"
    >
      <LinearGradient
        colors={[loginAccent + '2E', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <BrandMark px={116} logoUrl={logoUrl} initials={initials} accent={loginAccent} />
      <Text className="text-strong" style={[styles.heroTitleSm, { fontFamily: displayFont }]}>{brandName}</Text>
      <Text className="text-muted" style={styles.heroTagline}>{tagline}</Text>
    </MotiView>
  )

  const heroEnergia = (
    <MotiView
      from={{ opacity: 0, translateY: 16 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 500 }}
      style={{ alignItems: 'center', paddingHorizontal: 28, paddingTop: insets.top + 48, paddingBottom: 36 }}
      testID="login-brand-hero"
    >
      <LinearGradient
        colors={[loginAccent + '24', 'transparent']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <EvaLoader size="lg" />
      <Text className="text-muted" style={[styles.heroTagline, { marginTop: 24 }]}>{tagline}</Text>
    </MotiView>
  )

  let body: React.ReactNode
  if (layout === 'minimal') {
    body = (
      <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 26, paddingTop: insets.top + 40, paddingBottom: 24, gap: 4 }}>
        <MotiView
          from={{ opacity: 0, translateY: 16 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 500 }}
          style={{ marginBottom: 28 }}
          testID="login-brand-hero"
        >
          {logoUrl ? (
            <View style={{ marginBottom: 20 }}>
              <BrandMark px={56} logoUrl={logoUrl} initials={initials} accent={loginAccent} />
            </View>
          ) : null}
          <Text className="text-strong" style={{ fontFamily: displayFont, fontSize: 34, lineHeight: 36, letterSpacing: -1 }}>
            {brandName}
          </Text>
          <Text className="text-muted font-sans" style={{ fontSize: 14, lineHeight: 20, marginTop: 8, maxWidth: 300 }}>
            {tagline}
          </Text>
        </MotiView>
        <MotiView
          from={{ opacity: 0, translateY: 16 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 500, delay: 120 }}
        >
          {fields}
          {poweredBy}
        </MotiView>
      </View>
    )
  } else {
    const hero = layout === 'hero' ? heroBig : layout === 'energia' ? heroEnergia : heroClasico
    const overlap = layout === 'clasico'
    body = (
      <View style={{ flex: 1 }}>
        {hero}
        <MotiView
          from={{ opacity: 0, translateY: 20 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 500, delay: 140 }}
          className={layout === 'clasico' ? 'bg-surface-app' : 'bg-surface-card border-t border-subtle'}
          style={[
            {
              flex: 1,
              borderTopLeftRadius: 26,
              borderTopRightRadius: 26,
              paddingHorizontal: 24,
              paddingTop: overlap ? 26 : 24,
              paddingBottom: insets.bottom + 24,
            },
            overlap ? { marginTop: -26 } : null,
            layout !== 'clasico' ? SHADOWS[resolvedScheme].lg : null,
          ]}
        >
          <Text className="text-muted font-sans" style={{ textAlign: 'center', fontSize: 13, marginBottom: 18 }}>
            Iniciá sesión para entrenar con{' '}
            <Text className="text-strong font-sans-bold">{brandName}</Text>
          </Text>
          {fields}
          {poweredBy}
        </MotiView>
      </View>
    )
  }

  return (
    <View className="flex-1 bg-surface-app">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {body}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Flujo inteligente: si el arranque saltó directo acá por el coach cacheado
          (`?switch=1`), un escape discreto de vuelta al selector de rol. `?pick=1`
          fuerza el selector en index (evita el auto-salto de vuelta al login). */}
      {canSwitch === '1' ? (
        <Pressable
          testID="login-role-switch"
          accessibilityRole="button"
          hitSlop={10}
          onPress={() => router.replace('/?pick=1')}
          className="bg-surface-card border border-subtle rounded-pill flex-row items-center"
          style={[
            { position: 'absolute', top: insets.top + 10, left: 20, gap: 4, paddingLeft: 10, paddingRight: 14, paddingVertical: 8 },
            SHADOWS[resolvedScheme].sm,
          ]}
        >
          <ChevronLeft size={16} color={theme.mutedForeground} strokeWidth={2.25} />
          <Text className="text-body font-sans-semibold" style={{ fontSize: 12 }}>Elegir otro rol</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

/**
 * E1-17 — Verifica que el alumno autenticado pertenezca al coach del branding cargado.
 * Espejo de `clientLoginAction` (web): match standalone (coach_id) o enterprise (org membership).
 * Devuelve un mensaje de error (y hace signOut) si no hay acceso; null si el workspace es valido.
 *
 * Nota RN: sin service-role, la rama enterprise se resuelve bajo RLS del alumno (best-effort). Un
 * alumno standalone (caso comun) se valida por `coach_id`. Si el alumno enterprise no puede leer
 * `organization_members` bajo RLS, se le niega el acceso por el slug de OTRO coach de su org.
 */
async function validateAlumnoWorkspace(coachId: string | null): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    await supabase.auth.signOut()
    return 'No se pudo obtener la sesión.'
  }

  const { data: client } = await supabase
    .from('clients')
    .select('id, coach_id, org_id, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (!client) {
    await supabase.auth.signOut()
    return 'No tienes acceso a esta plataforma.'
  }

  let matched = !!coachId && client.coach_id === coachId
  if (!matched && client.org_id && coachId) {
    const { data: member } = await supabase
      .from('organization_members')
      .select('id')
      .eq('org_id', client.org_id)
      .eq('coach_id', coachId)
      .eq('status', 'active')
      .is('deleted_at', null)
      .maybeSingle()
    matched = !!member
  }

  if (!matched) {
    await supabase.auth.signOut()
    return 'No tienes acceso a esta plataforma.'
  }

  if (client.is_active === false) {
    await supabase.auth.signOut()
    return 'Tu cuenta ha sido pausada. Contacta a tu coach para más información.'
  }

  return null
}

/** Brand-mark reutilizable (logo del coach o iniciales). `glass` = sobre el hero oscuro. */
function BrandMark({
  px,
  glass,
  logoUrl,
  initials,
  accent,
  accentText = '#FFFFFF',
}: {
  px: number
  glass?: boolean
  logoUrl: string | null
  initials: string
  accent: string
  /** Texto/tinte legible del hero (accentText del brand-kit) — el frost glass y las
   *  iniciales se derivan de aca para no asumir blanco sobre una marca clara. */
  accentText?: string
}) {
  const radius = Math.round(px * 0.2)
  if (logoUrl) {
    return (
      <View
        className={glass ? '' : 'bg-surface-sunken border border-subtle'}
        style={{
          width: px,
          height: px,
          borderRadius: radius,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          ...(glass
            ? { backgroundColor: withAlpha(accentText, 0.16), borderWidth: 1, borderColor: withAlpha(accentText, 0.28) }
            : null),
        }}
      >
        <Image
          source={{ uri: logoUrl }}
          style={{ width: px, height: px, padding: Math.round(px * 0.16) }}
          contentFit="contain"
          transition={150}
        />
      </View>
    )
  }
  return (
    <View
      style={{
        width: px,
        height: px,
        borderRadius: radius,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: glass ? withAlpha(accentText, 0.16) : accent + '1F',
        borderWidth: 1,
        borderColor: glass ? withAlpha(accentText, 0.28) : accent + '40',
      }}
    >
      <Text style={{ fontFamily: FONT.displayBlack, fontSize: Math.round(px * 0.36), color: glass ? accentText : accent }}>
        {initials}
      </Text>
    </View>
  )
}

/** Boton de submit del login coloreado por el acento (mirror del boton inline de web). */
function BrandSubmit({
  label,
  accent,
  accentText,
  loading,
  onPress,
}: {
  label: string
  accent: string
  accentText: string
  loading: boolean
  onPress: () => void
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: loading, busy: loading }}
      disabled={loading}
      testID="login-submit"
      onPressIn={() => {
        if (!loading) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      }}
      onPress={onPress}
      style={{ marginTop: 4 }}
    >
      {({ pressed }) => (
        <MotiView
          animate={{ scale: pressed && !loading ? 0.98 : 1 }}
          transition={{ type: 'spring', damping: 16, stiffness: 220 }}
          style={{
            height: 52,
            borderRadius: 14,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            backgroundColor: accent,
            opacity: loading ? 0.65 : 1,
          }}
        >
          {loading ? (
            <>
              <ActivityIndicator color={accentText} />
              <Text style={[TYPE.title, { fontSize: 16, lineHeight: 16, color: accentText }]}>Ingresando…</Text>
            </>
          ) : (
            <>
              <Text style={[TYPE.title, { fontSize: 16, lineHeight: 16, color: accentText }]} numberOfLines={1}>
                {label}
              </Text>
              <ArrowRight size={18} color={accentText} />
            </>
          )}
        </MotiView>
      )}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  heroTitleSm: { fontSize: 27, lineHeight: 30, letterSpacing: -0.6, marginTop: 16, textAlign: 'center' },
  heroTagline: { fontSize: 14, lineHeight: 20, marginTop: 6, textAlign: 'center', maxWidth: 300, fontFamily: FONT.ui },
  poweredBy: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 18 },
})
