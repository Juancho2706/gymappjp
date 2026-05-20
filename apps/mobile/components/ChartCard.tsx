import { StyleSheet, Text, View } from 'react-native'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'
import { Card } from './Card'

interface ChartCardProps {
  title: string
  subtitle?: string
  icon?: LucideIcon
  children: ReactNode
}

export function ChartCard({ title, subtitle, icon: Icon, children }: ChartCardProps) {
  const { theme } = useTheme()
  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        {Icon ? <Icon size={17} color={theme.primary} /> : null}
        <View style={styles.copy}>
          <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {children}
    </Card>
  )
}

const styles = StyleSheet.create({
  card: { gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  copy: { flex: 1, minWidth: 0 },
  title: { fontSize: 15, letterSpacing: -0.1 },
  subtitle: { fontSize: 12, marginTop: 2 },
})
