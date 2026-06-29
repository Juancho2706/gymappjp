import { Tabs } from 'expo-router'
import { View } from 'react-native'
import { useTheme } from '../../../context/ThemeContext'
import { CoachMobileTabBar } from '../../../components/coach/CoachMobileChrome'

export default function CoachTabsLayout() {
  const { theme } = useTheme()
  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {/* Sin barra superior global: cada screen renderiza su propio header (como el
          diseño). El dashboard usa <MobileGreetingHeader/> (fecha + Hola + acciones). */}
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
