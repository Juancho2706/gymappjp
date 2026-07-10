import { useEffect } from 'react'
import { Tabs, useRouter } from 'expo-router'
import { View } from 'react-native'
import { useTheme } from '../../../context/ThemeContext'
import { CoachMobileTabBar } from '../../../components/coach/CoachMobileChrome'
import { getCoachProfile } from '../../../lib/coach'
import { resolveReactivateRequired } from '../../../lib/workspace'

export default function CoachTabsLayout() {
  const { theme } = useTheme()
  const router = useRouter()

  // E7-12: gate de suscripcion a nivel navegacion (cubre TODAS las tabs, espejo del middleware web
  // resolveCoachSubscriptionRedirect + del guard alumno->suspended). Un coach sin acceso EFECTIVO
  // (cancelado con gracia vencida / expired / dunning fuera de gracia) va a /coach/reactivate, que
  // vive FUERA de este grupo (tabs) => sin loop de redireccion. `resolveReactivateRequired` respeta la
  // gracia hasta current_period_end y NUNCA gatea a managed (org/team).
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
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Sin barra superior global: cada screen renderiza su propio header (como el
          diseño). El dashboard usa <MobileGreetingHeader/> (fecha + Hola + acciones).
          El SET de Tabs.Screen es fijo (expo-router necesita los archivos), pero QUE tabs se
          muestran los deriva CoachMobileTabBar de getVisibleNavItems (@eva/coach-nav): gating por
          módulos + workspace + estado de suscripción, hub Opciones, Reactivar y sheet "Más". */}
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
        <Tabs.Screen name="nutricion" options={{ title: 'Nutricion' }} />
        {/* Orden del overflow "Más" alineado al blueprint Fase 2: Opciones + Soporte
            primero; los screens legacy solo-RN (Suscripcion/Check-ins/Mi cuenta) van al
            final (parity debt: web pliega Suscripcion dentro de Opciones). */}
        <Tabs.Screen name="settings" options={{ title: 'Opciones' }} />
        <Tabs.Screen name="support" options={{ title: 'Soporte' }} />
        <Tabs.Screen name="subscription" options={{ title: 'Suscripcion' }} />
        <Tabs.Screen name="check-ins" options={{ title: 'Check-ins' }} />
        <Tabs.Screen name="perfil" options={{ title: 'Mi cuenta' }} />
      </Tabs>
    </View>
  )
}
