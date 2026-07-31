import { Tabs } from 'expo-router'
import { View } from 'react-native'
import { useTheme } from '../../../context/ThemeContext'
import { CoachMobileTabBar } from '../../../components/coach/CoachMobileChrome'
import { CoachTabbarScrollProvider } from '../../../components/coach/CoachTabbarScroll'

export default function CoachTabsLayout() {
  const { theme } = useTheme()

  // E7-12: el gate de suscripcion YA NO vive aca. Subio a `app/coach/_layout.tsx` porque este
  // layout solo cubre el grupo `(tabs)` (dejaba sin gate la ficha del alumno, program-builder,
  // nutrition-v2, cardio, settings/*, …) y ademas no se desmonta al cambiar de tab, asi que el
  // chequeo corria una sola vez por arranque. El de arriba es estado reactivo sobre TODO /coach.

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
          <Tabs.Screen name="subscription" options={{ title: 'Mi plan' }} />
          <Tabs.Screen name="check-ins" options={{ title: 'Check-ins' }} />
          <Tabs.Screen name="perfil" options={{ title: 'Mi cuenta' }} />
        </Tabs>
      </View>
    </CoachTabbarScrollProvider>
  )
}
