import { useEffect, useRef } from 'react'
import { AppState, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Tabs, useRouter } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { flushLogQueue, flushNutritionQueue, getPendingLogCount, getPendingNutritionCount } from '../../../lib/offline-cache'
import { getClientProfile } from '../../../lib/client'
import { sessionFlags } from '../../../lib/session-flags'
import { AlumnoMobileChrome, ALUMNO_TABBAR_CLEARANCE } from '../../../components/alumno/AlumnoMobileChrome'

export default function AlumnoTabsLayout() {
  const router = useRouter()
  const insets = useSafeAreaInsets()
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

  // Capsula flotante DS (E1-01, espejo del ClientNav mobile web): Inicio ·
  // Nutrición · Aprender · Check-in + "Más" (Historial, Perfil). El tabBar es
  // absoluto/flotante (altura 0 en el flujo), asi que reservamos el espacio
  // inferior via sceneStyle para que el contenido nunca quede tapado por la
  // capsula. El branding activo lo resuelve la chrome via tokens NativeWind.
  return (
    <View className="flex-1 bg-surface-app">
      <Tabs
        tabBar={(props) => <AlumnoMobileChrome {...props} />}
        screenOptions={{
          headerShown: false,
          // P0-1 (b) edge-to-edge: sin backgroundColor la escena cae al fondo gris
          // claro del DefaultTheme de react-navigation y tapa el bg-surface-app en
          // dark (franja clara detras/bajo la capsula flotante). Transparente => el
          // <View bg-surface-app> pinta hasta el borde fisico inferior (SDK54 dibuja
          // edge-to-edge), 1:1 con el web donde el body surface-app cubre el viewport
          // bajo la capsula fija (ClientNav.tsx:471-474). El coach fija theme.background
          // via el shim imperativo; el alumno difiere al View de tokens NativeWind.
          sceneStyle: {
            backgroundColor: 'transparent',
            paddingBottom: insets.bottom + ALUMNO_TABBAR_CLEARANCE,
          },
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
