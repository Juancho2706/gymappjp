import { Tabs } from 'expo-router'
import { View } from 'react-native'
import { useTheme } from '../../../context/ThemeContext'
import { CoachMobileHeader, CoachMobileTabBar } from '../../../components/coach/CoachMobileChrome'

export default function CoachTabsLayout() {
  const { theme } = useTheme()
  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <CoachMobileHeader />
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
        <Tabs.Screen name="settings" options={{ title: 'Mi Marca' }} />
        <Tabs.Screen name="subscription" options={{ title: 'Suscripcion' }} />
        <Tabs.Screen name="support" options={{ title: 'Soporte' }} />
      </Tabs>
    </View>
  )
}
