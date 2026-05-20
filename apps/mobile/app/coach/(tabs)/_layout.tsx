import { Tabs } from 'expo-router'
import { Apple, CheckCircle, Dumbbell, User, Users } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'

export default function CoachTabsLayout() {
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
        name="clientes"
        options={{
          title: 'Alumnos',
          tabBarIcon: ({ color, size }) => <Users size={size} color={color} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="builder"
        options={{
          title: 'Programas',
          tabBarIcon: ({ color, size }) => <Dumbbell size={size} color={color} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="nutricion"
        options={{
          title: 'Nutrición',
          tabBarIcon: ({ color, size }) => <Apple size={size} color={color} strokeWidth={2} />,
        }}
      />
      <Tabs.Screen
        name="check-ins"
        options={{
          title: 'Check-ins',
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
