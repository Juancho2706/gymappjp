import { useEffect, useRef, useState } from 'react'
import { Stack, useRouter, useSegments } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import * as Notifications from 'expo-notifications'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { ThemeProvider } from '../context/ThemeContext'
import { configurePushHandler, setupAndroidChannel, syncPushToken } from '../lib/push'

configurePushHandler()

function RootLayoutNav() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const router = useRouter()
  const segments = useSegments()
  const syncedUserId = useRef<string | null>(null)
  const responseListener = useRef<Notifications.EventSubscription | null>(null)

  useEffect(() => {
    setupAndroidChannel()

    // Navigate to screen embedded in notification data on tap
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as Record<string, string> | undefined
      if (data?.screen) router.push(data.screen as any)
    })

    return () => {
      responseListener.current?.remove()
    }
  }, [])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setSession(s))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session === undefined) return
    const isProtected = segments[0] === 'coach' || segments[0] === 'alumno'
    if (!session && isProtected) router.replace('/')
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
  return (
    <ThemeProvider>
      <StatusBar style="auto" />
      <RootLayoutNav />
    </ThemeProvider>
  )
}
