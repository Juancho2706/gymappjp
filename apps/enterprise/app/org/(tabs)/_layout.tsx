import { Tabs } from 'expo-router'
import { StyleSheet, Text } from 'react-native'

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return (
    <Text style={[styles.icon, focused && styles.iconActive]}>{label}</Text>
  )
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarLabelStyle: styles.label,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: 'Resumen',
          tabBarIcon: ({ focused }) => (
            <TabIcon label="📊" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="coaches"
        options={{
          title: 'Coaches',
          tabBarIcon: ({ focused }) => (
            <TabIcon label="👥" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="clientes"
        options={{
          title: 'Clientes',
          tabBarIcon: ({ focused }) => (
            <TabIcon label="🏃" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="configuracion"
        options={{
          title: 'Config',
          tabBarIcon: ({ focused }) => (
            <TabIcon label="⚙️" focused={focused} />
          ),
        }}
      />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#fff',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    paddingBottom: 4,
    height: 60,
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
  },
  icon: {
    fontSize: 20,
  },
  iconActive: {},
})
