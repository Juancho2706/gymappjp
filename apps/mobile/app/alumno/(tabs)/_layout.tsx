import { useEffect, useRef } from 'react'
import { AppState, View } from 'react-native'
import { Tabs, useRouter } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { flushLogQueue, flushNutritionQueue, getPendingLogCount, getPendingNutritionCount } from '../../../lib/offline-cache'
import { getClientProfile } from '../../../lib/client'
import { sessionFlags } from '../../../lib/session-flags'
import { useTheme } from '../../../context/ThemeContext'
import { AlumnoMobileChrome } from '../../../components/alumno/AlumnoMobileChrome'

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

  // 6→4+Más: barra docked DS (espejo del coach). Inicio · Plan · Aprender · Check-in + "Más"
  // (Historial, Perfil). El tint activo / inactivo lo resuelve la chrome desde theme.primary.
  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Tabs
        tabBar={(props) => <AlumnoMobileChrome {...props} />}
        screenOptions={{
          headerShown: false,
          sceneStyle: { backgroundColor: theme.background },
        }}
      >
        <Tabs.Screen name="home" options={{ title: 'Inicio' }} />
        <Tabs.Screen name="nutricion" options={{ title: 'Nutrición' }} />
        <Tabs.Screen name="exercises" options={{ title: 'Aprender' }} />
        <Tabs.Screen name="check-in" options={{ title: 'Check-in' }} />
        <Tabs.Screen name="history" options={{ title: 'Historial' }} />
        <Tabs.Screen name="perfil" options={{ title: 'Perfil' }} />
        {/* Workout se accede desde hero card del Home, no como tab directo */}
        <Tabs.Screen name="workout" options={{ href: null }} />
      </Tabs>
    </View>
  )
}
