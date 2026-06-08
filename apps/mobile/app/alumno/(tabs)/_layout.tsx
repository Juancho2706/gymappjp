import { useEffect, useRef } from 'react'
import { AppState } from 'react-native'
import { Tabs, useRouter } from 'expo-router'
import { Apple, BookOpen, CheckCircle, History, Home, User } from 'lucide-react-native'
import { supabase } from '../../../lib/supabase'
import { flushLogQueue, flushNutritionQueue, getPendingLogCount, getPendingNutritionCount } from '../../../lib/offline-cache'
import { getClientProfile } from '../../../lib/client'
import { sessionFlags } from '../../../lib/session-flags'
import { useTheme } from '../../../context/ThemeContext'

export default function AlumnoTabsLayout() {
  const { theme } = useTheme()
  const router = useRouter()
  const appState = useRef(AppState.currentState)

  // Ola 0: gate de acceso a nivel navegación (cubre TODAS las tabs, no solo Home).
  // Alumno pausado/archivado → /alumno/suspended. Cambio de clave forzado → /change-password.
  useEffect(() => {
    let mounted = true
    getClientProfile()
      .then((c) => {
        if (!mounted || !c) return
        if (c.blocked) router.replace('/alumno/suspended')
        else if (c.forcePasswordChange && !sessionFlags.pwChanged) router.replace('/change-password')
      })
      .catch(() => {})
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        const [pendingNutrition, pendingWorkout] = await Promise.all([
          getPendingNutritionCount(),
          getPendingLogCount(),
        ])
        if (pendingNutrition > 0) flushNutritionQueue(supabase)
        if (pendingWorkout > 0) flushLogQueue(supabase)
      }
      appState.current = nextState
    })
    return () => sub.remove()
  }, [])
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.mutedForeground,
        tabBarStyle: {
          backgroundColor: theme.card,
          borderTopColor: theme.border,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontFamily: 'Inter_500Medium',
          fontSize: 11,
          letterSpacing: 0.2,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Inicio',
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="nutricion"
        options={{
          title: 'Nutrición',
          tabBarIcon: ({ color, size }) => <Apple size={size} color={color} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="exercises"
        options={{
          title: 'Aprender',
          tabBarIcon: ({ color, size }) => <BookOpen size={size} color={color} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="check-in"
        options={{
          title: 'Check-in',
          tabBarIcon: ({ color, size }) => <CheckCircle size={size} color={color} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'Historial',
          tabBarIcon: ({ color, size }) => <History size={size} color={color} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => <User size={size} color={color} strokeWidth={2} />,
        }}
      />
      {/* Workout se accede desde hero card del Home, no como tab directo */}
      <Tabs.Screen
        name="workout"
        options={{ href: null }}
      />
    </Tabs>
  )
}
