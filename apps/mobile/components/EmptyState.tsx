import { StyleSheet, Text, View } from 'react-native'
import type { LucideIcon } from 'lucide-react-native'
import type { ReactNode } from 'react'
import { useTheme } from '../context/ThemeContext'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  subtitle?: string
  action?: ReactNode
}

export function EmptyState({ icon: Icon, title, subtitle, action }: EmptyStateProps) {
  const { theme } = useTheme()
  return (
    <View style={styles.wrap}>
      {Icon ? (
        <View
          style={[
            styles.iconWrap,
            {
              backgroundColor: theme.primary + '12',
              borderColor: theme.primary + '33',
              borderRadius: theme.radius['2xl'],
            },
          ]}
        >
          <Icon size={28} color={theme.primary} strokeWidth={1.75} />
        </View>
      ) : null}
      <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={[styles.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          {subtitle}
        </Text>
      ) : null}
      {action}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  iconWrap: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginBottom: 4,
  },
  title: { fontSize: 17, letterSpacing: -0.2, textAlign: 'center' },
  sub: { fontSize: 13, lineHeight: 19, textAlign: 'center', maxWidth: 280 },
})
