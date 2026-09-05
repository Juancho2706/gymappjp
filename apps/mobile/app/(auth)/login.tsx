import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ArrowRight, Check, ChevronLeft, Eye, EyeOff, Info, Lock, Mail } from 'lucide-react-native'
import { MotiView } from 'moti'
import * as Haptics from 'expo-haptics'
import { LoginSchema } from '@eva/schemas'
import { resolveBrandTheme, resolvePresetBranding } from '@eva/brand-kit'
import { isBrandingAllowed, showsEvaBadge, type SubscriptionTier } from '@eva/tiers'
import { supabase } from '../../lib/supabase'
import { ApiError, validateStudentWorkspace } from '../../lib/api'
import { translateAuthError } from '../../lib/auth-errors'
import { getStudentAccountStatus } from '../../lib/student-account-status'
import { coachAccountLoginMessage } from '../../lib/student-login-notice'
import {
  GoogleSignInError,
  cleanupGoogleOrphanAuthUser,
  isGoogleSignInAvailable,
  resolveGoogleCoachDestination,
  signInWithGoogleCoach,
  signOutGoogleAndSupabase,
} from '../../lib/auth/google-signin'
import { ForceScheme, useTheme } from '../../context/ThemeContext'
import { FONT, TYPE } from '../../lib/typography'
import { SHADOWS } from '../../lib/shadows'
import { ENTRY_TOKENS } from '../../lib/theme'
import { GoogleSignInButton, Input } from '../../components'
import { EvaLoader, EvaLoaderScreen } from '../../components/EvaLoader'
import { EntryGrain } from '../../components/entry/EntryBackground'
import { EvaFigure } from '../../components/entry/EvaFigure'
import { ENTRY_LIGHT, LightLayer } from '../../components/entry/LightLayer'
import { CircularBrandLogo } from '../../components/CircularBrandLogo'
import { EvaBadge } from '../../components/brand/EvaBadge'

const REMEMBER_KEY = 'eva_remember_email'

// Fallback de marca EVA para el login (espejo de `BRAND_PRIMARY_COLOR` en
// apps/web/src/lib/brand-assets.ts): tier < Pro cae a este azul EVA, el MISMO valor que el token
// `--color-sport-600` de `global.css` (rgb 20 98 220) que ya pinta tabs y botones adentro de la
// app. Estuvo en verde `#10B981`, y por eso una cuenta sin marca propia abria en verde para
// despues verse azul por dentro.
const EVA_BRAND_COLOR = '#1462DC'

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
  const { role, switch: canSwitch, email: emailParam } = useLocalSearchParams<{ role: 'coach' | 'alumno'; switch?: string; email?: string }>()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { theme, branding, resolvedScheme } = useTheme()
  // `email` por param: viene de la pantalla de verificación cuando no pudo entrar sola.
  const [email, setEmail] = useState(typeof emailParam === 'string' ? emailParam : '')
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
    if (typeof emailParam === 'string' && emailParam) return
    AsyncStorage.getItem(REMEMBER_KEY).then((v) => {
      if (v) setEmail(v)
    })
  }, [emailParam])

  useEffect(() => {
    if (isAlumno && !branding?.coachId) {
      router.replace('/alumno/codigo')
    }
  }, [branding?.coachId, isAlumno, router])

  // ── Theming white-label del login (mismo gate que web) ──
  // Pricing v3 (owner 2026-08-21): el white-label está en TODOS los planes vendidos, así que un
  // free abre su login con su marca. `isBrandingAllowed` NO se borra: sigue siendo el fail-closed
  // para tier inválido, caché vieja del device ⇒ branding EVA conservando el
  // nombre. El preset curado (theme_preset_key) override color/color2/acento ANTES de derivar el
  // tema (paridad web). Lo que paga Pro acá es sacarse el sello «Hecho con EVA» (`showsEvaBadge`).
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

  if (isAlumno && !branding?.coachId) {
    return (
      <View className="bg-surface-app" style={{ flex: 1 }}>
        <EvaLoaderScreen subtitle="Buscando a tu coach…" />
      </View>
    )
  }

  async function handleLogin() {
    setError(null)
    if (isAlumno && !branding?.coachId) {
      setError('Primero ingresa el código o enlace de tu coach.')
      return
    }

    setLoading(true)
    const parsed = LoginSchema.safeParse({ email: email.trim(), password })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      setLoading(false)
      return
    }
    // Snapshot de la sesión que ya vivía en el teléfono ANTES de pisarla (Bug C): un deep link
    // puede depositar a un coach logueado en la puerta del alumno, y si el intento falla más
    // abajo el `signOut` mataba una sesión que este formulario nunca creó. Con `prior` guardado,
    // los caminos de error la RESTAURAN en vez de cerrarla.
    const prior = (await supabase.auth.getSession()).data.session

    /** Deshace lo que hizo ESTE intento: restaura la sesión previa, o cierra la recién creada. */
    const undoSignIn = async () => {
      if (prior) {
        // El signOut local NO revoca el refresh token en el server, así que la sesión previa
        // sigue siendo canjeable: volver a montarla es suficiente.
        await supabase.auth
          .setSession({ access_token: prior.access_token, refresh_token: prior.refresh_token })
          .catch(() => {})
        return
      }
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    }

    const { error: signInError } = await supabase.auth.signInWithPassword(parsed.data)
    if (signInError) {
      setError(translateAuthError(signInError.message))
      setLoading(false)
      return
    }

    let forcePasswordChange = false
    if (isAlumno) {
      try {
        const validation = await validateStudentWorkspace(branding!.coachId)
        forcePasswordChange = validation.forcePasswordChange
      } catch (validationError) {
        const apiError = validationError instanceof ApiError ? validationError : null
        // Cuenta pausada o archivada: mismo destino que cuando el bloqueo aparece con la app ya
        // abierta (`clearBlockedStudentSession`) — se cachea el estado server-verified CON la sesión
        // todavía viva, se limpia todo y se aterriza en /alumno/suspended. Un texto de error en el
        // login dejaba al alumno sin explicación ni contacto.
        if (apiError?.code === 'ACCOUNT_PAUSED') {
          await getStudentAccountStatus().catch(() => {})
          // Cierre LOCAL, no `signOutAndCleanup` (W4.1): ese helper cierra con scope GLOBAL
          // (`lib/auth-actions.ts:69`) porque sirve al logout DELIBERADO, donde revocar el
          // refresh token en todos los dispositivos es la política segura del teléfono perdido.
          // Este es el camino de ERROR: una cuenta pausada no es un logout deliberado y no puede
          // echar al usuario de sus otras sesiones. La limpieza por-usuario que importa acá no se
          // pierde: el estado server-verified ya quedó cacheado arriba y el janitor de
          // `registerSessionCacheJanitor` borra la nutrición V2 del usuario saliente con el
          // `SIGNED_OUT` que dispara este mismo signOut.
          await undoSignIn()
          setLoading(false)
          router.replace('/alumno/suspended')
          return
        }
        // VTA-3.12 (espejo RN del `coach_account` web): un ACCESS_DENIED puede ser un extraño…
        // o el propio COACH entrando con SU cuenta por el código de sus alumnos. Se resuelve ACÁ,
        // con la sesión todavía viva (después de `undoSignIn` ya no hay a quién preguntarle) y
        // solo en el camino de error: el login feliz no paga ninguna consulta extra.
        const coachAccountNotice =
          apiError?.code === 'ACCESS_DENIED' ? await resolveCoachAccountNotice() : null

        // Un scope denegado o un token confirmado como inválido no debe dejar sesión viva —
        // pero equivocarse de login (credenciales de coach en la puerta del alumno) tampoco
        // puede revocarle el refresh token en TODOS sus dispositivos: scope local (W4.1).
        if (
          apiError?.status === 403 ||
          apiError?.code === 'INVALID_TOKEN'
        ) {
          await undoSignIn()
        } else if (prior) {
          // Los demás errores (red, validación caída) no cierran nada: la sesión recién creada
          // queda viva para reintentar. Pero si el teléfono YA tenía una sesión ajena, el intento
          // fallido tampoco puede quedarse con su lugar.
          await undoSignIn()
        }
        setError(coachAccountNotice ?? studentWorkspaceErrorCopy(apiError))
        setLoading(false)
        return
      }
    }

    if (remember) await AsyncStorage.setItem(REMEMBER_KEY, email.trim())
    else await AsyncStorage.removeItem(REMEMBER_KEY)
    await AsyncStorage.setItem('eva_user_role', role ?? 'coach')
    router.replace(
      isAlumno
        ? forcePasswordChange
          ? '/change-password'
          : '/alumno/home'
        : '/coach/home',
    )
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
      // Google válido pero sin cuenta coach: el auth user que Google acaba de crear no le sirve a
      // nadie (es el alumno que se equivocó de puerta) y, si se queda, le «ocupa» el correo a su
      // coach. El servidor lo borra si es un huérfano demostrable — ANTES de cortar la sesión, que
      // es la credencial de la llamada. Después, como web → /login?error=no_google_account.
      await cleanupGoogleOrphanAuthUser()
      await signOutGoogleAndSupabase()
      setError('No hay una cuenta de coach con este Google. Si eres alumno, entra con el código de tu coach; si eres coach, regístrate primero.')
    } catch (err) {
      // Cancelar no es un error para el usuario.
      if (err instanceof GoogleSignInError && err.code === 'cancelled') return
      setError(err instanceof GoogleSignInError ? err.message : 'No se pudo iniciar sesión con Google.')
    } finally {
      setGoogleLoading(false)
    }
  }

  // ── Bloque de campos (compartido coach/alumno) ──
  // Los placeholders se parametrizan por modo: coach usa los del panel web
  // ("coach@eva.app" / "Tu contraseña"); el default = los del alumno white-label,
  // así el árbol del alumno NO cambia visualmente.
  function renderFields(
    accent: string,
    accentText: string,
    submitLabel: string,
    opts?: { emailPlaceholder?: string; passwordPlaceholder?: string },
  ) {
    const emailPlaceholder = opts?.emailPlaceholder ?? 'tu@email.com'
    const passwordPlaceholder = opts?.passwordPlaceholder ?? '••••••••'
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
          placeholder={emailPlaceholder}
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
          placeholder={passwordPlaceholder}
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

  // Sello «Hecho con EVA» al pie del formulario del ALUMNO (Pricing v3, D3=A, owner 2026-08-21).
  // Reemplaza al «con tecnología de EVA» que se pintaba para TODO tier: ahora es el gancho de Pro
  // — free lo lleva, pro/elite no. Un solo sello (nada de doble firma) y sobre la
  // superficie neutra de la hoja, nunca sobre el color de marca. El gate es `showsEvaBadge`,
  // FAIL-OPEN a propósito: tier CORRUPTO ⇒ se muestra. Pero «todavía no sé el tier» no es lo
  // mismo que «tier corrupto»: `branding` llega async desde ThemeContext (AsyncStorage) y en los
  // primeros frames es `null` — evaluarlo como 'free' pintaba el sello un instante a los alumnos
  // de un coach PRO (regresión 21-08). Sin branding resuelto no hay sello: el login genérico de
  // EVA tampoco lo necesita (sería EVA firmándose a sí misma).
  const poweredBy = branding && showsEvaBadge((branding.subscriptionTier ?? 'free') as SubscriptionTier) ? (
    <EvaBadge medium="student_login" testID="login-eva-badge" style={styles.poweredBy} />
  ) : null

  // ════════════════ COACH — identidad EVA dark (frame 05) ════════════════
  // El coach que entra a su panel ES la marca; su branding se aplica DESPUES del login
  // (aqui todavia no hay `coachId`). Por eso el sheet es identidad EVA pura, `cta-fill`
  // #1A6BE6, sin white-label: la transicion a su panel brandeado ocurre en el frame 07.
  // CERO cambios de logica auth respecto de la version clara: mismos estados, mismos
  // handlers, mismos testIDs. Solo cambia la piel.
  if (!isAlumno) {
    return (
      <ForceScheme scheme="dark" branded={false}>
        <View style={coach.root}>
          <LightLayer spec={ENTRY_LIGHT.morphCoach} />
          <EntryGrain />
          {/* El sheet CRECE, no se desplaza: el contenido se comprime dentro y el CTA
              queda siempre visible (§3.5). */}
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
            <ScrollView
              contentContainerStyle={[
                coach.scroll,
                { paddingTop: insets.top + 18, paddingBottom: Math.max(insets.bottom, 34) },
              ]}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <MotiView
                from={{ opacity: 0, translateY: 12 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: 'timing', duration: 260 }}
              >
                <View style={coach.grab} />
                <View style={coach.eyebrowRow}>
                  <EvaFigure size={22} opacity={0.82} />
                  <Text style={coach.eyebrow}>Panel de coach</Text>
                </View>
                <Text style={coach.title}>Entra a tu panel</Text>
                <Text style={coach.subtitle}>Con la misma cuenta que usas en la web.</Text>
              </MotiView>

              <MotiView
                from={{ opacity: 0, translateY: 12 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: 'timing', duration: 260, delay: 60 }}
              >
                <View style={[coach.field, coach.fieldIdle, { marginBottom: 10 }]}>
                  <View pointerEvents="none" style={coach.fieldInset} />
                  <Mail size={19} color="#79838E" strokeWidth={2} />
                  <TextInput
                    value={email}
                    onChangeText={setEmail}
                    editable={!loading}
                    placeholder="coach@correo.com"
                    placeholderTextColor="#79838E"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete={Platform.OS === 'android' ? 'off' : 'email'}
                    importantForAutofill={Platform.OS === 'android' ? 'no' : undefined}
                    returnKeyType="next"
                    submitBehavior="submit"
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    selectionColor={ENTRY_TOKENS.luxSoft}
                    accessibilityLabel="Email"
                    style={coach.input}
                    testID="login-email-input"
                  />
                </View>

                <View style={[coach.field, coach.fieldIdle, { marginBottom: 8 }]}>
                  <View pointerEvents="none" style={coach.fieldInset} />
                  <Lock size={19} color="#9CC4FF" strokeWidth={2} />
                  <TextInput
                    ref={passwordRef}
                    value={password}
                    onChangeText={setPassword}
                    editable={!loading}
                    placeholder="••••••••"
                    placeholderTextColor="#79838E"
                    secureTextEntry={!showPwd}
                    autoCapitalize="none"
                    autoComplete={Platform.OS === 'android' ? 'off' : 'password'}
                    importantForAutofill={Platform.OS === 'android' ? 'no' : undefined}
                    returnKeyType="done"
                    onSubmitEditing={handleLogin}
                    selectionColor={ENTRY_TOKENS.luxSoft}
                    accessibilityLabel="Contraseña"
                    style={[coach.input, showPwd ? null : coach.inputSecure]}
                    testID="login-password-input"
                  />
                  {/* El ojito ya existe en el repo (PR #154): se reusa el mismo par de
                      iconos y el mismo estado, no se redibuja. */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={showPwd ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    onPress={() => setShowPwd((s) => !s)}
                    hitSlop={10}
                  >
                    {showPwd ? (
                      <EyeOff size={19} color="#79838E" strokeWidth={2} />
                    ) : (
                      <Eye size={19} color="#79838E" strokeWidth={2} />
                    )}
                  </Pressable>
                </View>

                <Text
                  onPress={() => router.push('/(auth)/forgot-password')}
                  style={coach.forgot}
                  testID="login-forgot-link"
                >
                  Olvidé mi contraseña
                </Text>

                <Pressable onPress={() => setRemember((r) => !r)} style={coach.rememberRow}>
                  <View style={[coach.checkbox, remember ? coach.checkboxOn : null]}>
                    {remember ? <Check size={13} color="#FFFFFF" strokeWidth={3} /> : null}
                  </View>
                  <Text style={coach.rememberLabel}>Recordarme</Text>
                </Pressable>

                {error ? (
                  <View style={coach.errorBox} testID="login-error">
                    <Text style={coach.errorText}>{error}</Text>
                  </View>
                ) : null}

                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ disabled: loading, busy: loading }}
                  disabled={loading}
                  testID="login-submit"
                  onPressIn={() => {
                    if (!loading) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
                  }}
                  onPress={handleLogin}
                  style={coach.ctaWrap}
                >
                  <View style={[coach.cta, loading ? { opacity: 0.65 } : null]}>
                    <View pointerEvents="none" style={coach.ctaInset} />
                    {loading ? <ActivityIndicator color="#FFFFFF" /> : null}
                    <Text style={coach.ctaLabel}>{loading ? 'Ingresando…' : 'Entrar'}</Text>
                  </View>
                </Pressable>

                {showGoogle ? (
                  <View style={{ gap: 14, marginTop: 16 }}>
                    <View style={coach.orsep}>
                      <View style={coach.orsepLine} />
                      <Text style={coach.orsepLabel}>o</Text>
                      <View style={coach.orsepLine} />
                    </View>
                    <GoogleSignInButton
                      intent="login"
                      onPress={handleGoogleCoach}
                      loading={googleLoading}
                      disabled={loading}
                    />
                  </View>
                ) : null}

                <Text
                  onPress={() => router.push('/(auth)/register')}
                  style={coach.registerRow}
                  testID="login-coach-register-link"
                >
                  ¿Aún no tienes cuenta de coach?{'\n'}
                  <Text style={coach.registerLink}>Créala en 1 minuto</Text>
                </Text>
              </MotiView>

              <MotiView
                from={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ type: 'timing', duration: 260, delay: 120 }}
                style={coach.noteWrap}
              >
                <View style={coach.note}>
                  <LinearGradient
                    colors={['rgba(255,255,255,0.045)', 'rgba(255,255,255,0.015)'] as const}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                    style={StyleSheet.absoluteFill}
                  />
                  <View pointerEvents="none" style={coach.noteInset} />
                  <Info size={17} color={ENTRY_TOKENS.textFaint} strokeWidth={2} />
                  <Text style={coach.noteText}>
                    Tus alumnos no entran por acá: ellos usan{' '}
                    <Text style={coach.noteStrong}>Soy alumno</Text> con tu código.
                  </Text>
                </View>
              </MotiView>
            </ScrollView>
          </KeyboardAvoidingView>
        </View>
      </ForceScheme>
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
            Inicia sesión para entrenar con{' '}
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
 * VTA-3.12 — ¿la sesión recién abierta es la de un COACH? La fila `coaches` se lee con la sesión
 * del propio usuario (`coaches` tiene policy self), nunca con service role, y solo se pregunta en
 * el camino de error del login de alumno.
 *
 * Devuelve `null` ante cualquier duda (sin sesión, sin fila, error de red): un fallo acá jamás
 * puede empeorar el mensaje — se cae al copy genérico de siempre.
 */
async function resolveCoachAccountNotice(): Promise<string | null> {
  try {
    const { data } = await supabase.auth.getSession()
    const userId = data.session?.user?.id
    if (!userId) return null
    const { data: coach } = await supabase
      .from('coaches')
      .select('persona')
      .eq('id', userId)
      .maybeSingle()
    if (!coach) return null
    return coachAccountLoginMessage((coach as { persona?: string | null }).persona ?? null)
  } catch {
    return null
  }
}

function studentWorkspaceErrorCopy(error: ApiError | null): string {
  switch (error?.code) {
    case 'ACCESS_DENIED':
      return 'Esta cuenta no pertenece a la plataforma de este coach.'
    case 'ACCOUNT_PAUSED':
      return 'Tu cuenta ha sido pausada. Contacta a tu coach para más información.'
    case 'INVALID_TOKEN':
    case 'MISSING_TOKEN':
      return 'Tu sesión no pudo validarse. Vuelve a intentarlo.'
    case 'VALIDATION_UNAVAILABLE':
      return 'No pudimos verificar tu acceso ahora. Comprueba tu conexión e inténtalo otra vez.'
    case 'VALIDATION_ERROR':
      return 'No pudimos identificar la plataforma de tu coach. Vuelve a ingresar su código.'
    default:
      return 'No pudimos verificar tu acceso. Inténtalo otra vez.'
  }
}

/** Brand-mark reutilizable (logo del coach o iniciales). `glass` = sobre el hero oscuro. */
function BrandMark({
  px,
  glass,
  logoUrl,
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
  const { theme, resolvedScheme } = useTheme()
  const radius = Math.round(px / 2)
  if (logoUrl) {
    return (
      <CircularBrandLogo
        uri={logoUrl}
        size={px}
        padding={Math.round(px * 0.16)}
        backgroundColor={glass ? withAlpha(accentText, 0.16) : theme.card}
        style={glass ? { borderWidth: 1, borderColor: withAlpha(accentText, 0.28) } : undefined}
      />
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
      <EvaFigure
        size={Math.max(20, Math.round(px * 0.58))}
        style={resolvedScheme === 'light' ? { tintColor: theme.foreground } : undefined}
      />
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
  // Sello «Hecho con EVA» al pie del form del alumno: el EvaBadge ya se auto-centra
  // (`alignSelf: 'center'`), acá solo queda el aire respecto del último campo.
  poweredBy: { marginTop: 18 },
})

/**
 * Piel dark del login de COACH — frame 05 de la entrada dark v1
 * (`docs/specs/entrada-dark-v1/DESIGN-SPEC.md` §3.5). Estilos LOCALES a esta rama: el
 * arbol del alumno (white-label claro) no toca ni uno de estos valores.
 */
const coach = StyleSheet.create({
  root: { flex: 1, backgroundColor: ENTRY_TOKENS.canvasEntry },
  scroll: { flexGrow: 1, paddingHorizontal: 22 },
  grab: {
    width: 42,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignSelf: 'center',
    marginBottom: 24,
  },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 16 },
  eyebrow: {
    fontFamily: FONT.uiExtra,
    fontSize: 9.5,
    lineHeight: 12,
    letterSpacing: 1.52,
    textTransform: 'uppercase',
    color: ENTRY_TOKENS.textFaint,
  },
  title: {
    fontFamily: FONT.displayBlack,
    fontSize: 25,
    lineHeight: 27,
    letterSpacing: -0.7,
    color: '#F4F6F8',
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: FONT.uiSemibold,
    fontSize: 13,
    lineHeight: 19,
    color: '#86919E',
    marginBottom: 20,
  },

  field: {
    height: 56,
    borderRadius: 14,
    backgroundColor: '#1F262F',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  fieldIdle: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.13)' },
  fieldInset: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.045)',
  },
  input: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    fontFamily: FONT.ui,
    fontSize: 14.5,
    color: '#F4F6F8',
  },
  inputSecure: { fontSize: 17, letterSpacing: 5.1 },

  forgot: {
    textAlign: 'right',
    fontFamily: FONT.uiBold,
    fontSize: 11.5,
    lineHeight: 16,
    color: ENTRY_TOKENS.luxSoft,
    marginBottom: 18,
  },
  rememberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { backgroundColor: ENTRY_TOKENS.lux, borderColor: ENTRY_TOKENS.lux },
  rememberLabel: { fontFamily: FONT.uiSemibold, fontSize: 13, lineHeight: 17, color: '#98A2B0' },

  errorBox: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,120,120,0.35)',
    backgroundColor: 'rgba(255,120,120,0.10)',
    paddingHorizontal: 14,
    paddingVertical: 11,
    marginBottom: 14,
  },
  errorText: { fontFamily: FONT.uiSemibold, fontSize: 13, lineHeight: 18, color: '#FFB4A8' },

  ctaWrap: { marginTop: 2 },
  cta: {
    height: 56,
    borderRadius: 14,
    overflow: 'hidden',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: ENTRY_TOKENS.lux,
    shadowColor: ENTRY_TOKENS.lux,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  ctaInset: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  ctaLabel: {
    fontFamily: FONT.displayBlack,
    fontSize: 16,
    lineHeight: 20,
    letterSpacing: -0.16,
    color: '#FFFFFF',
  },

  orsep: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  orsepLine: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.07)' },
  orsepLabel: {
    fontFamily: FONT.uiExtra,
    fontSize: 10.5,
    lineHeight: 13,
    letterSpacing: 1.575,
    textTransform: 'uppercase',
    color: ENTRY_TOKENS.textGhost,
  },

  registerRow: {
    marginTop: 16,
    textAlign: 'center',
    fontFamily: FONT.uiSemibold,
    fontSize: 11.5,
    lineHeight: 17,
    color: ENTRY_TOKENS.textFaint,
  },
  registerLink: { fontFamily: FONT.uiExtra, color: ENTRY_TOKENS.luxSoft },

  noteWrap: { marginTop: 'auto', paddingTop: 24 },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  noteInset: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  noteText: {
    flex: 1,
    fontFamily: FONT.uiSemibold,
    fontSize: 11.5,
    lineHeight: 17,
    color: '#86919E',
  },
  noteStrong: { fontFamily: FONT.uiExtra, color: '#CDD3DB' },
})
