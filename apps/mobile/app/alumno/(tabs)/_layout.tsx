import { Tabs } from 'expo-router'
import { Apple, CheckCircle, Dumbbell, Home, User } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'

export default function AlumnoTabsLayout() {
  const { theme } = useTheme()
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.mutedForeground,
        tabBarStyle: {
          backgroundColor: theme.card,
          borderTopColor: theme.border,
          height: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontFamily: 'Inter_500Medium',
          fontSize: 11,
          letterSpacing: 0.2,
        },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home size={size} color={color} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="workout"
        options={{
          title: 'Rutina',
          tabBarIcon: ({ color, size }) => <Dumbbell size={size} color={color} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="nutricion"
        options={{
          title: 'Nutricion',
          tabBarIcon: ({ color, size }) => <Apple size={size} color={color} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="check-in"
        options={{
          title: 'Check-in',
          tabBarIcon: ({ color, size }) => <CheckCircle size={size} color={color} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="perfil"
        options={{
          title: 'Perfil',
          tabBarIcon: ({ color, size }) => <User size={size} color={color} strokeWidth={2} />,
        }}
      />
    </Tabs>
  )
}
