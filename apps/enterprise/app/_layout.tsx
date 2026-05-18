import { useEffect, useRef, useState } from 'react'
import { Stack, router } from 'expo-router'
import { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { getOrgAdminContext } from '../lib/org-admin'
import { OrgProvider } from '../context/OrgContext'

export default function RootLayout() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const didCheck = useRef(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session === undefined) return

    if (!session) {
      setIsAuthorized(false)
      router.replace('/(auth)/login')
      return
    }

    if (didCheck.current) return
    didCheck.current = true

    getOrgAdminContext().then((ctx) => {
      if (!ctx) {
        supabase.auth.signOut()
        router.replace('/(auth)/login')
        return
      }
      setIsAuthorized(true)
      router.replace('/org')
    })
  }, [session])

  return (
    <OrgProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="org" />
      </Stack>
    </OrgProvider>
  )
}
