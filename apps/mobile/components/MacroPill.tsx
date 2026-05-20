import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../context/ThemeContext'

interface MacroPillProps {
  label: string
  value: number
  color?: string
  unit?: string
}

export function MacroPill({ label, value, color, unit }: MacroPillProps) {
  const { theme } = useTheme()
  const c = color ?? theme.primary
  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: c + '15',
          borderColor: c + '40',
          borderRadius: theme.radius.md,
        },
      ]}
    >
      <Text style={[styles.value, { color: c, fontFamily: 'Montserrat_700Bold' }]}>
        {value}
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </Text>
      <Text style={[styles.label, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
        {label}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: 'center',
    minWidth: 60,
    gap: 2,
  },
  value: { fontSize: 16 },
  unit: { fontSize: 11, fontWeight: '500' },
  label: { fontSize: 10, letterSpacing: 0.3, textTransform: 'uppercase' },
})
