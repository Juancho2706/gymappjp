import { StyleSheet, Text, View } from 'react-native'
import { Flame } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'

interface StreakCounterProps {
  days: number
}

export function StreakCounter({ days }: StreakCounterProps) {
  const { theme } = useTheme()
  const orange = '#F59E0B'
  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: orange + '1A',
          borderColor: orange + '40',
          borderRadius: theme.radius.lg,
        },
      ]}
    >
      <Flame size={14} color={orange} strokeWidth={2.25} />
      <Text style={[styles.value, { color: orange, fontFamily: 'Montserrat_700Bold' }]}>
        {days}
      </Text>
      <Text style={[styles.label, { color: orange, fontFamily: theme.fontSans }]}>
        {days === 1 ? 'día' : 'días'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  value: { fontSize: 14, letterSpacing: -0.2 },
  label: { fontSize: 12 },
})
