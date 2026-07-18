import { StyleSheet, Text, View } from 'react-native'
import { Flame } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../context/ThemeContext'

interface Props {
  streak: number
}

const ORANGE = '#F59E0B'

export function StreakWidget({ streak }: Props) {
  const { theme } = useTheme()
  const pulse = streak >= 3
  const glow = streak >= 7

  return (
    <MotiView
      animate={pulse ? { scale: [1, 1.06, 1] } : { scale: 1 }}
      transition={
        pulse
          ? { type: 'timing', duration: 900, loop: true, repeatReverse: false }
          : { type: 'timing', duration: 300 }
      }
      style={[
        styles.wrap,
        {
          backgroundColor: ORANGE + '1A',
          borderColor: ORANGE + '40',
          borderRadius: theme.radius.lg,
          ...(glow
            ? {
                shadowColor: ORANGE,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.55,
                shadowRadius: 10,
                elevation: 6,
              }
            : {}),
        },
      ]}
    >
      <Flame size={14} color={ORANGE} strokeWidth={2.25} />
      {streak === 0 ? (
        <Text style={[styles.label, { color: ORANGE, fontFamily: theme.fontSans }]}>
          Empieza tu racha
        </Text>
      ) : (
        <>
          <Text style={[styles.value, { color: ORANGE, fontFamily: 'Archivo_700Bold' }]}>
            {streak}
          </Text>
          <Text style={[styles.label, { color: ORANGE, fontFamily: theme.fontSans }]}>
            {streak === 1 ? 'día' : 'días'}
          </Text>
        </>
      )}
    </MotiView>
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
