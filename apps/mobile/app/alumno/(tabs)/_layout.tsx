import { useEffect, useRef } from 'react'
import { AppState, View } from 'react-native'
import { Tabs, useRouter } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { flushLogQueue, flushNutritionQueue, getPendingLogCount, getPendingNutritionCount } from '../../../lib/offline-cache'
import { getClientProfile } from '../../../lib/client'
import { sessionFlags } from '../../../lib/session-flags'
import { AlumnoMobileChrome } from '../../../components/alumno/AlumnoMobileChrome'

export default function AlumnoTabsLayout() {
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

  // Capsula flotante DS (E1-01, espejo del ClientNav mobile web): Inicio ·
  // Nutrición · Aprender · Check-in + "Más" (Historial, Perfil). El tabBar es
  // absoluto/flotante (altura 0 en el flujo). El web fija la nav (position:fixed,
  // ClientNav.tsx:471-474) y el CONTENIDO scrollea POR DETRAS: el clearance vive
  // como padding-bottom del contenedor scrolleable, NO recortando el viewport.
  // Aqui espejamos eso: la escena ocupa TODA la altura y cada pantalla reserva
  // `insets.bottom + ALUMNO_TABBAR_CLEARANCE` en el contentContainer de su scroll
  // (ver ALUMNO_TABBAR_CLEARANCE). El branding activo lo resuelve la chrome via
  // tokens NativeWind.
  return (
    <View className="flex-1 bg-surface-app">
      <Tabs
        tabBar={(props) => <AlumnoMobileChrome {...props} />}
        screenOptions={{
          headerShown: false,
          // QA-8 (banda negra): antes la escena llevaba `paddingBottom = inset +
          // clearance`, que RECORTABA el viewport de la escena — el contenedor
          // full-bleed de cada pantalla (View bg-surface-app + <AppBackground/>
          // absoluteFill: home.tsx:344-345) terminaba SECO en la linea de recorte y
          // dejaba abajo una franja de la escena transparente que revelaba el root
          // <View bg-surface-app> PLANO (sin el glow/grilla del AppBackground), leido
          // como una banda negra solida bajo la capsula. Sin paddingBottom la escena
          // ocupa todo el alto: el AppBackground cubre el viewport completo y el
          // contenido scrollea POR DETRAS de la capsula (1:1 web). El clearance se
          // reserva en el contentContainer de cada scroll de las 6 tabs
          // (paddingBottom = insets.bottom + ALUMNO_TABBAR_CLEARANCE via
          // useSafeAreaInsets, inset-aware — NO en sceneStyle, que recortaria el
          // viewport y reviviria la banda negra), asi el ultimo item nunca queda
          // tapado por la capsula. `backgroundColor: transparent` deja al
          // <View bg-surface-app> pintar hasta el borde fisico inferior (SDK54
          // edge-to-edge), evitando el fondo gris claro del DefaultTheme.
          sceneStyle: {
            backgroundColor: 'transparent',
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
