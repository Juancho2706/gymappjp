import { Tabs } from 'expo-router'
import { useTheme } from '../../../context/ThemeContext'

export default function CoachTabsLayout() {
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
      <Tabs.Screen name="clientes" options={{ title: 'Clientes' }} />
      <Tabs.Screen name="builder" options={{ title: 'Builder' }} />
      <Tabs.Screen name="nutricion" options={{ title: 'Nutrición' }} />
      <Tabs.Screen name="check-ins" options={{ title: 'Check-ins' }} />
      <Tabs.Screen name="perfil" options={{ title: 'Perfil' }} />
    </Tabs>
  )
}
