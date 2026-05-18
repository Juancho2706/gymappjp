import { Tabs } from 'expo-router'
import { useTheme } from '../../../context/ThemeContext'

export default function AlumnoTabsLayout() {
  const { theme } = useTheme()
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.muted,
        tabBarStyle: { backgroundColor: theme.card, borderTopColor: theme.border },
      }}
    >
      <Tabs.Screen name="workout" options={{ title: 'Workout' }} />
      <Tabs.Screen name="nutricion" options={{ title: 'Nutrición' }} />
      <Tabs.Screen name="check-in" options={{ title: 'Check-in' }} />
      <Tabs.Screen name="perfil" options={{ title: 'Perfil' }} />
    </Tabs>
  )
}
