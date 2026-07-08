import 'react-native-gesture-handler'
import '../global.css'
import { useEffect, useRef, useState } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as Linking from 'expo-linking'
import * as Notifications from 'expo-notifications'
import * as SplashScreen from 'expo-splash-screen'
import { useFonts } from 'expo-font'
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter'
import {
  Montserrat_600SemiBold,
  Montserrat_700Bold,
  Montserrat_800ExtraBold,
} from '@expo-google-fonts/montserrat'
// EVA Design System families (token-contract.md D3): Archivo (display),
// Hanken Grotesk (UI/body), JetBrains Mono (metrics/timers).
import {
  Archivo_400Regular,
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
  Archivo_800ExtraBold,
  Archivo_900Black,
} from '@expo-google-fonts/archivo'
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
  HankenGrotesk_800ExtraBold,
} from '@expo-google-fonts/hanken-grotesk'
import {
  JetBrainsMono_400Regular,
  JetBrainsMono_500Medium,
  JetBrainsMono_700Bold,
} from '@expo-google-fonts/jetbrains-mono'
import type { Session } from '@supabase/supabase-js'
import { ReducedMotionConfig, ReduceMotion } from 'react-native-reanimated'
import { MotiView } from 'moti'
import * as Sentry from '@sentry/react-native'
import type { ErrorBoundaryProps } from 'expo-router'
import { supabase } from '../lib/supabase'
import { ThemeProvider } from '../context/ThemeContext'
import { configurePushHandler, setupAndroidChannel, syncPushToken } from '../lib/push'
import { EvaSplash } from '../components/EvaSplash'
import { AppErrorBoundary } from '../components/AppErrorBoundary'
import { BiometricLock } from '../components/BiometricLock'
import { isBiometricLockEnabled } from '../lib/biometric'
import { checkForOtaUpdate } from '../lib/ota'
import { AppState } from 'react-native'

SplashScreen.preventAutoHideAsync()

// Telemetría de errores (E0-G1 / G11 §1.8). Gateado por env: sin DSN es no-op TOTAL
// (cero llamadas de red, cero riesgo de crash). El DSN se inyecta vía EAS build
// (EXPO_PUBLIC_SENTRY_DSN); sin él la app corre exactamente igual que hoy.
const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    debug: false,
    enabled: !__DEV__,
    tracesSampleRate: 0,
  })
}

// Expo Router: fallback global ante un throw no atrapado (en vez de pantalla blanca).
// Envolvemos el boundary de marca para reportar el error a Sentry (si hay DSN).
function ReportingErrorBoundary(props: ErrorBoundaryProps) {
  useEffect(() => {
    if (SENTRY_DSN && props.error) Sentry.captureException(props.error)
  }, [props.error])
  return <AppErrorBoundary {...props} />
}
export { ReportingErrorBoundary as ErrorBoundary }

configurePushHandler()

function RootLayoutNav() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const router = useRouter()
  const segments = useSegments()
  const syncedUserId = useRef<string | null>(null)
  const responseListener = useRef<Notifications.EventSubscription | null>(null)

  // Process deep link URL: parse auth hash tokens for password recovery
  function processDeepLink(url: string) {
    const hash = url.split('#')[1]
    if (!hash) return
    const params = new URLSearchParams(hash)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const type = params.get('type')
    if (accessToken && refreshToken) {
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken }).then(() => {
        if (type === 'recovery') router.replace('/(auth)/reset-password')
      })
    }
  }

  useEffect(() => {
    setupAndroidChannel()

    // Notification tap handler
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, string> | undefined
      if (data?.screen) router.push(data.screen as any)
    })

    // Deep link: app opened from cold start via URL
    Linking.getInitialURL().then((url) => { if (url) processDeepLink(url) })

    // Deep link: app already running, receives URL
    const linkSub = Linking.addEventListener('url', ({ url }) => processDeepLink(url))

    return () => {
      responseListener.current?.remove()
      linkSub.remove()
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  // OTA en foreground (E0-G6): chequea al abrir y al volver de background.
  // No-op en __DEV__; throttled a 1 check/hora dentro de lib/ota.ts.
  useEffect(() => {
    checkForOtaUpdate()
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') checkForOtaUpdate()
    })
    return () => sub.remove()
  }, [])

  useEffect(() => {
    if (session === undefined) return
    const section = segments[0]
    const subroute = (segments as string[])[1]
    const isProtected =
      section === 'coach' ||
      (section === 'alumno' && subroute !== 'codigo')
    if (!session && isProtected) {
      // Race-safe: signInWithPassword may have stored the session in supabase
      // before our onAuthStateChange listener updated React state.
      supabase.auth.getSession().then(({ data }) => {
        if (!data.session) router.replace('/')
      })
    }
  }, [session, segments])

  // Sync push token once per session
  useEffect(() => {
    if (!session?.user.id) { syncedUserId.current = null; return }
    if (syncedUserId.current === session.user.id) return
    syncedUserId.current = session.user.id
    syncPushToken(session.user.id, supabase)
  }, [session?.user.id])

  // Ola 0: bloqueo biométrico opt-in. Si hay sesión y el usuario lo activó, bloquear al
  // entrar y al volver de background. Siempre con escape a contraseña (BiometricLock).
  const [locked, setLocked] = useState(false)
  useEffect(() => {
    if (!session?.user.id) { setLocked(false); return }
    isBiometricLockEnabled().then((on) => { if (on) setLocked(true) }).catch(() => {})
  }, [session?.user.id])
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && session?.user.id) {
        isBiometricLockEnabled().then((on) => { if (on) setLocked(true) }).catch(() => {})
      }
    })
    return () => sub.remove()
  }, [session?.user.id])

  return (
    <>
      <Stack screenOptions={{ headerShown: false }} />
      {locked && session ? <BiometricLock onUnlock={() => setLocked(false)} /> : null}
    </>
  )
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    // Legacy (still used by un-migrated screens)
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
    // EVA Design System
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    Archivo_800ExtraBold,
    Archivo_900Black,
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
    HankenGrotesk_800ExtraBold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_700Bold,
  })
  const [splashDone, setSplashDone] = useState(false)

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync()
  }, [fontsLoaded])

  if (!fontsLoaded) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ReducedMotionConfig mode={ReduceMotion.System} />
      <SafeAreaProvider>
        <BottomSheetModalProvider>
          <ThemeProvider>
            <StatusBar style="light" />
            <MotiView
              from={{ opacity: 0 }}
              animate={{ opacity: splashDone ? 1 : 0 }}
              transition={{ type: 'timing', duration: 300 }}
              style={{ flex: 1 }}
            >
              <RootLayoutNav />
            </MotiView>
            {!splashDone && <EvaSplash onFinish={() => setSplashDone(true)} />}
          </ThemeProvider>
        </BottomSheetModalProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
