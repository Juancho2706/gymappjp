import { useEffect } from 'react'
import { Tabs, useRouter } from 'expo-router'
import { View } from 'react-native'
import { useTheme } from '../../../context/ThemeContext'
import { CoachMobileTabBar } from '../../../components/coach/CoachMobileChrome'
import { CoachTabbarScrollProvider } from '../../../components/coach/CoachTabbarScroll'
import { getCoachProfile } from '../../../lib/coach'
import { resolveReactivateRequired } from '../../../lib/workspace'

export default function CoachTabsLayout() {
  const { theme } = useTheme()
  const router = useRouter()

  // E7-12: gate de suscripcion a nivel navegacion (cubre TODAS las tabs, espejo del middleware web
  // resolveCoachSubscriptionRedirect + del guard alumno->suspended). Un coach sin acceso EFECTIVO
  // (cancelado con gracia vencida / expired / dunning fuera de gracia) va a /coach/reactivate.
  // Esa ruta vive en tabs para conservar la cápsula web; reemplazar por la ruta ya activa es no-op,
  // así que no genera loop. `resolveReactivateRequired` respeta la gracia hasta current_period_end
  // y NUNCA gatea a managed (org/team).
  useEffect(() => {
    let mounted = true
    getCoachProfile()
      .then((c) => {
        if (!mounted || !c) return
        if (resolveReactivateRequired(c.subscriptionStatus, c.currentPeriodEnd)) {
          router.replace('/coach/reactivate')
        }
      })
      .catch(() => {})
    return () => { mounted = false }
  }, [])

  return (
    <CoachTabbarScrollProvider>
      <View style={{ flex: 1, backgroundColor: theme.background }}>
        {/* Sin barra superior global: cada screen renderiza su propio header. El dashboard
            usa <MobileGreetingHeader/>. El set de Tabs.Screen es fijo porque Expo Router
            necesita los archivos; CoachMobileTabBar deriva hasta cinco accesos directos de
            getVisibleNavItems, respetando workspace, módulos y suscripción como la web. */}
        <Tabs
          tabBar={(props) => <CoachMobileTabBar {...props} />}
          screenOptions={{
            headerShown: false,
            sceneStyle: { backgroundColor: theme.background },
          }}
        >
          <Tabs.Screen name="home" options={{ title: 'Dashboard' }} />
          <Tabs.Screen name="clientes" options={{ title: 'Alumnos' }} />
          <Tabs.Screen name="builder" options={{ title: 'Programas' }} />
          <Tabs.Screen name="ejercicios" options={{ title: 'Ejercicios' }} />
          <Tabs.Screen name="nutricion" options={{ title: 'Nutrición' }} />
          <Tabs.Screen name="settings" options={{ title: 'Opciones' }} />
          <Tabs.Screen name="team" options={{ title: 'Equipo' }} />
          <Tabs.Screen name="reactivate" options={{ title: 'Reactivar' }} />
          <Tabs.Screen name="support" options={{ title: 'Soporte' }} />
          <Tabs.Screen name="subscription" options={{ title: 'Suscripción' }} />
          <Tabs.Screen name="check-ins" options={{ title: 'Check-ins' }} />
          <Tabs.Screen name="perfil" options={{ title: 'Mi cuenta' }} />
        </Tabs>
      </View>
    </CoachTabbarScrollProvider>
  )
}
