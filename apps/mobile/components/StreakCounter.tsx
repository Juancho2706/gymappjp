import { StyleSheet, Text, View } from 'react-native'
import { Flame } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../context/ThemeContext'
import { useEvaMotion } from '../lib/motion'

interface StreakCounterProps {
  days: number
}

export function StreakCounter({ days }: StreakCounterProps) {
  const { theme } = useTheme()
  const motion = useEvaMotion()
  const orange = '#F59E0B'
  // Deleite: la llama "late" cuando hay racha activa (loop sutil). Reduce-motion → estática.
  const animate = days > 0 && !motion.reduced
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
      <MotiView
        from={{ scale: 1 }}
        animate={{ scale: animate ? 1.12 : 1 }}
        transition={animate ? { loop: true, type: 'timing', duration: 900 } : { type: 'timing', duration: 0 }}
      >
        <Flame size={14} color={orange} strokeWidth={2.25} />
      </MotiView>
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
