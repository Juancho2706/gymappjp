import { useEffect, useRef, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import * as Linking from 'expo-linking'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ArrowRight, Check, Eye, EyeOff, KeyRound, Lock, MailWarning } from 'lucide-react-native'
import { MotiView } from 'moti'
import { supabase } from '../../lib/supabase'
import { parseRecoveryLink, recoveryLinkFromParams, type RecoveryLink } from '../../lib/recovery-link'
import { useTheme } from '../../context/ThemeContext'
import { Button, Input, TopBar } from '../../components'
import { EvaLoaderScreen } from '../../components/EvaLoader'
import { passwordRejectionMessage } from '@eva/schemas'

/**
 * Cambio de contraseña por enlace de recuperación (W4.2 de `docs/specs/flujo-coach-nuevo`).
 *
 * REGLA DURA: el formulario NO se pinta porque «hay sesión». La ruta está reclamada con
 * `autoVerify` en las cuatro variantes de host (`app.json`), así que cualquiera con la app
 * instalada puede aterrizar acá; y con la sesión de coach viva `updateUser({ password })` le
 * cambiaría su propia clave sin pedirle la anterior. Lo único que habilita el formulario es
 * haber CANJEADO el token del enlace en ESTE montaje de la pantalla.
 *
 * Orden: leer la URL → canjear (`setSession` / `verifyOtp` / `exchangeCodeForSession`) → recién
 * ahí pintar el formulario. Sin token válido no hay formulario: hay explicación y salida
 * («Volver al login» + «Pedir un enlace nuevo»), nunca un `Alert` sin salida.
 */

type Phase = 'checking' | 'ready' | 'blocked' | 'saved'
/** Por qué no se puede cambiar la clave — cada motivo tiene su copy y su salida. */
type BlockedReason = 'expired' | 'invalid' | 'missing'

const BLOCKED_COPY: Record<BlockedReason, { title: string; body: string }> = {
  expired: {
    title: 'El enlace ya no sirve',
    body: 'Los enlaces para cambiar la contraseña duran poco y se usan una sola vez. Pide uno nuevo y ábrelo desde el correo más reciente.',
  },
  invalid: {
    title: 'Enlace no válido',
    body: 'Este enlace no sirve para cambiar la contraseña. Pide uno nuevo desde «Olvidé mi contraseña» y ábrelo directamente desde ese correo.',
  },
  missing: {
    title: 'Abre el enlace de tu correo',
    body: 'Para crear una contraseña nueva necesitamos el enlace que te enviamos por correo. Ábrelo desde ahí y esta pantalla se abrirá sola.',
  },
}

export default function ResetPasswordScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const params = useLocalSearchParams()
  // Snapshot de los params del primer render: `useLocalSearchParams` devuelve un objeto nuevo en
  // cada render y el canje debe correr UNA vez, no en cada re-render del formulario.
  const paramsRef = useRef(params)
  const [phase, setPhase] = useState<Phase>('checking')
  const [blockedReason, setBlockedReason] = useState<BlockedReason>('missing')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const passwordError = password.length > 0 && password.length < 8 ? 'Mínimo 8 caracteres' : null
  const confirmError = confirm.length > 0 && password !== confirm ? 'Las contraseñas no coinciden' : null

  // ── Canje del token ANTES de pintar nada editable ──
  useEffect(() => {
    let active = true
    // El enlace más RECIENTE manda. `getInitialURL()` devuelve la URL que abrió el proceso, que
    // puede ser vieja si la app ya venía corriendo; el evento `url` siempre es más nuevo. Con el
    // número de corrida, un canje que arrancó antes no puede pisar el estado del que arrancó
    // después, gane la carrera de red quien la gane.
    let run = 0

    function block(reason: BlockedReason, forRun: number) {
      if (!active || forRun !== run) return
      setBlockedReason(reason)
      setPhase('blocked')
    }

    /** Devuelve `true` cuando el enlace traía algo que atender (válido o roto). */
    async function handle(link: RecoveryLink): Promise<boolean> {
      if (link.kind === 'none') return false
      const forRun = ++run
      if (link.kind === 'error') {
        block(link.reason, forRun)
        return true
      }
      if (active) setPhase('checking')
      const ok = await redeemRecovery(link)
      if (!active || forRun !== run) return true
      // Un canje que falla es, en la práctica, un enlace vencido/ya usado (o un `code` PKCE
      // emitido en otro dispositivo, que este no puede canjear porque no tiene el verifier).
      if (ok) setPhase('ready')
      else block('expired', forRun)
      return true
    }

    // La app ya abierta puede recibir el enlace por evento (warm start): se sigue escuchando
    // incluso después de haber bloqueado, para que un enlace que llega tarde igual entre.
    const sub = Linking.addEventListener('url', ({ url }) => {
      void handle(parseRecoveryLink(url))
    })

    void (async () => {
      // 1) Lo que el router ya parseó (App Link con `token_hash`/`code` en la query).
      if (await handle(recoveryLinkFromParams(paramsRef.current))) return
      // 2) La URL cruda: es el ÚNICO lugar donde vive el fragmento (`#access_token=…`) del
      //    flujo implícito, que el router no convierte en params.
      let initialUrl: string | null = null
      try {
        initialUrl = await Linking.getInitialURL()
      } catch {
        initialUrl = null
      }
      // Si el evento `url` ya trajo un enlace mientras esperábamos, esa URL es la nueva y la de
      // arranque no se vuelve a mirar.
      if (!active || run > 0) return
      if (await handle(parseRecoveryLink(initialUrl))) return
      block('missing', ++run)
    })()

    return () => {
      active = false
      sub.remove()
    }
  }, [])

  async function handleSave() {
    if (phase !== 'ready') return
    if (password.length < 8 || password !== confirm) return

    setSaveError(null)
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      // Rechazo de la contraseña (filtrada/débil/igual a la anterior): el formulario se queda
      // en pantalla con lo escrito, culpar al enlace acá deja al usuario pidiendo resets eternos.
      const rejection = passwordRejectionMessage(error)
      if (rejection) {
        setSaveError(rejection)
        return
      }
      // Sesión de recuperación caída mientras escribía: ahí sí es el enlace, y hay salida.
      const status = (error as { status?: number }).status
      if (status === 401 || status === 403 || /session|jwt|token|expired/i.test(error.message ?? '')) {
        setBlockedReason('expired')
        setPhase('blocked')
        return
      }
      setSaveError('No pudimos guardar la contraseña. Revisa tu conexión e inténtalo otra vez.')
      return
    }

    setPhase('saved')
  }

  async function handleContinue() {
    const role = await AsyncStorage.getItem('eva_user_role')
    // Sin rol cacheado (alta nueva, app recién instalada) NO se adivina «alumno»: el selector de
    // rol de la raíz manda a cada uno a su entrada.
    if (role === 'coach') router.replace('/coach/home')
    else if (role === 'alumno') router.replace('/alumno/home')
    else router.replace('/')
  }

  async function handleBackToLogin() {
    const role = await AsyncStorage.getItem('eva_user_role')
    if (role === 'coach') router.replace('/(auth)/login?role=coach')
    else if (role === 'alumno') router.replace('/(auth)/login?role=alumno')
    else router.replace('/')
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <TopBar showBrand back />

        {phase === 'checking' ? (
          <View style={styles.inner} testID="reset-password-checking">
            <EvaLoaderScreen subtitle="Comprobando tu enlace…" />
          </View>
        ) : phase === 'blocked' ? (
          <MotiView
            from={{ opacity: 0, translateY: 20 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 400 }}
            style={styles.inner}
            testID="reset-password-blocked"
          >
            <View className="bg-danger-100" style={[styles.heroIcon, { borderRadius: theme.radius['2xl'] }]}>
              <MailWarning size={26} color={theme.destructive} strokeWidth={1.75} />
            </View>
            <Text className="text-strong font-display-black" style={styles.title}>
              {BLOCKED_COPY[blockedReason].title}
            </Text>
            <Text className="text-muted font-sans" style={styles.subtitle}>
              {BLOCKED_COPY[blockedReason].body}
            </Text>
            <View style={styles.form}>
              <Button
                testID="reset-password-request-new"
                label="Pedir un enlace nuevo"
                variant="sport"
                rightIcon={ArrowRight}
                onPress={() => router.replace('/(auth)/forgot-password')}
                full
                size="lg"
              />
              <Button
                testID="reset-password-back-to-login"
                label="Volver al login"
                variant="secondary"
                onPress={handleBackToLogin}
                full
                size="lg"
              />
            </View>
          </MotiView>
        ) : phase === 'saved' ? (
          <MotiView
            from={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', damping: 14 }}
            style={styles.inner}
          >
            <View className="bg-success-100" style={[styles.successIcon, { borderRadius: theme.radius['2xl'] }]}>
              <Check size={30} color={theme.success} strokeWidth={1.75} />
            </View>
            <Text className="text-strong font-display-black" style={styles.title}>
              Contraseña actualizada
            </Text>
            <Text className="text-muted font-sans" style={styles.subtitle}>
              Ya puedes volver a EVA con tu nueva contraseña.
            </Text>
            <Button
              testID="reset-password-continue"
              label="Continuar"
              variant="sport"
              rightIcon={ArrowRight}
              onPress={handleContinue}
              full
              size="lg"
              style={{ marginTop: 20 }}
            />
          </MotiView>
        ) : (
          <MotiView
            from={{ opacity: 0, translateY: 20 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 500 }}
            style={styles.inner}
          >
            <View className="bg-sport-100" style={[styles.heroIcon, { borderRadius: theme.radius['2xl'] }]}>
              <KeyRound size={26} color={theme.primary} strokeWidth={1.75} />
            </View>
            <Text className="text-strong font-display-black" style={styles.title}>
              Nueva contraseña
            </Text>
            <Text className="text-muted font-sans" style={styles.subtitle}>
              Elige una contraseña segura de al menos 8 caracteres.
            </Text>

            <View style={styles.form}>
              <PasswordInput
                testID="reset-password-input"
                label="Nueva contraseña"
                value={password}
                onChangeText={setPassword}
                visible={showPassword}
                onToggleVisible={() => setShowPassword((v) => !v)}
                error={passwordError}
                autoFocus
              />
              <PasswordInput
                testID="reset-password-confirm"
                label="Confirmar contraseña"
                value={confirm}
                onChangeText={setConfirm}
                visible={showConfirm}
                onToggleVisible={() => setShowConfirm((v) => !v)}
                error={confirmError}
              />
              {saveError ? (
                <View
                  className="rounded-control bg-danger-100"
                  style={styles.errorBox}
                  testID="reset-password-error"
                >
                  <Text className="text-danger-600 font-sans-semibold" style={styles.errorText}>
                    {saveError}
                  </Text>
                </View>
              ) : null}
              <Button
                testID="reset-password-submit"
                label="Guardar contraseña"
                variant="sport"
                rightIcon={ArrowRight}
                onPress={handleSave}
                loading={loading}
                disabled={password.length < 8 || password !== confirm}
                full
                size="lg"
              />
            </View>
          </MotiView>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

/**
 * Canje del token de recuperación. Cada forma tiene su método; ninguna acepta «ya había sesión»
 * como sustituto. Un `false` acá NUNCA pinta el formulario.
 */
async function redeemRecovery(link: RecoveryLink): Promise<boolean> {
  try {
    if (link.kind === 'tokens') {
      const { error } = await supabase.auth.setSession({
        access_token: link.accessToken,
        refresh_token: link.refreshToken,
      })
      return !error
    }
    if (link.kind === 'token_hash') {
      const { error } = await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: 'recovery' })
      return !error
    }
    if (link.kind === 'code') {
      const { error } = await supabase.auth.exchangeCodeForSession(link.code)
      return !error
    }
  } catch {
    return false
  }
  return false
}

function PasswordInput({
  label,
  value,
  onChangeText,
  visible,
  onToggleVisible,
  error,
  autoFocus,
  testID,
}: {
  label: string
  value: string
  onChangeText: (value: string) => void
  visible: boolean
  onToggleVisible: () => void
  error: string | null
  autoFocus?: boolean
  testID?: string
}) {
  const { theme } = useTheme()
  const Icon = visible ? EyeOff : Eye

  return (
    <Input
      testID={testID}
      label={label}
      leftIcon={Lock}
      placeholder="••••••••"
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoComplete="new-password"
      error={error}
      autoFocus={autoFocus}
      trailingLabel={
        <Pressable onPress={onToggleVisible} hitSlop={10}>
          <Icon size={18} color={theme.mutedForeground} />
        </Pressable>
      }
    />
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  kav: { flex: 1, paddingHorizontal: 24, paddingBottom: 24 },
  inner: { flex: 1, justifyContent: 'center', gap: 12 },
  heroIcon: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  successIcon: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  title: { fontSize: 26, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  form: { gap: 16, marginTop: 16 },
  errorBox: { paddingHorizontal: 14, paddingVertical: 11 },
  errorText: { fontSize: 13, lineHeight: 18 },
})
