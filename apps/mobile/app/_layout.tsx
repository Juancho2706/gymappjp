import 'react-native-gesture-handler'
import { useEffect, useRef, useState } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
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
import type { Session } from '@supabase/supabase-js'
import { MotiView } from 'moti'
import { supabase } from '../lib/supabase'
import { ThemeProvider } from '../context/ThemeContext'
import { configurePushHandler, setupAndroidChannel, syncPushToken } from '../lib/push'
import { EvaSplash } from '../components/EvaSplash'

SplashScreen.preventAutoHideAsync()

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

  return <Stack screenOptions={{ headerShown: false }} />
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Montserrat_600SemiBold,
    Montserrat_700Bold,
    Montserrat_800ExtraBold,
  })
  const [splashDone, setSplashDone] = useState(false)

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync()
  }, [fontsLoaded])

  if (!fontsLoaded) return null

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
    </GestureHandlerRootView>
  )
}
