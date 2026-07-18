import { StyleSheet, Text, View } from 'react-native'
import type { ReactNode } from 'react'
import { useTheme } from '../context/ThemeContext'

interface ScreenHeaderProps {
  title: string
  subtitle?: string
  trailing?: ReactNode
  compact?: boolean
}

export function ScreenHeader({ title, subtitle, trailing, compact = false }: ScreenHeaderProps) {
  const { theme } = useTheme()
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <View style={styles.textWrap}>
        <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Archivo_900Black' }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[styles.subtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing ? <View>{trailing}</View> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 16,
    gap: 12,
  },
  wrapCompact: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 0,
  },
  textWrap: { flex: 1, minWidth: 0 },
  title: { fontSize: 21, letterSpacing: -0.42 },
  subtitle: { fontSize: 13, marginTop: 4, lineHeight: 18 },
})
