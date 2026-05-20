import { StyleSheet, Text, View } from 'react-native'
import type { ViewStyle } from 'react-native'
import { useTheme } from '../context/ThemeContext'

type Tone = 'primary' | 'success' | 'destructive' | 'muted' | 'cyan'
type Size = 'sm' | 'md'

interface BadgeProps {
  label: string
  tone?: Tone
  size?: Size
  toneColor?: string
  style?: ViewStyle
}

export function Badge({ label, tone = 'primary', size = 'sm', toneColor, style }: BadgeProps) {
  const { theme } = useTheme()
  const color = toneColor ?? mapToneColor(tone, theme)
  const sz =
    size === 'md'
      ? { paddingHorizontal: 10, paddingVertical: 5, fontSize: 12 }
      : { paddingHorizontal: 8, paddingVertical: 3, fontSize: 11 }

  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: color + '22',
          borderRadius: theme.radius.sm,
          paddingHorizontal: sz.paddingHorizontal,
          paddingVertical: sz.paddingVertical,
        },
        style,
      ]}
    >
      <Text
        style={[
          styles.label,
          { color, fontSize: sz.fontSize, fontFamily: 'Montserrat_700Bold' },
        ]}
      >
        {label}
      </Text>
    </View>
  )
}

function mapToneColor(tone: Tone, theme: ReturnType<typeof useTheme>['theme']): string {
  switch (tone) {
    case 'primary': return theme.primary
    case 'success': return theme.success
    case 'destructive': return theme.destructive
    case 'muted': return theme.mutedForeground
    case 'cyan': return theme.cyan
  }
}

const styles = StyleSheet.create({
  base: { alignSelf: 'flex-start' },
  label: { letterSpacing: 0.3 },
})
