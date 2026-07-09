import { StyleSheet, View } from 'react-native'
import { Confetti } from 'react-native-fast-confetti'
import { useTheme } from '../../../context/ThemeContext'
import { useEvaMotion } from '../../../lib/motion'
import { EMBER_500 } from './types'

/**
 * DayCompleteConfetti (E4-17, gap 2.18) — celebración al completar la ÚLTIMA
 * comida del día, espejo del confetti 1×/fecha de la web `NutritionShell`. El
 * shell incrementa `tick` una vez por fecha completada; remontar por `key`
 * dispara la animación. Reduce-motion aware (no dispara). Overlay decorativo.
 */
export function DayCompleteConfetti({ tick }: { tick: number }) {
  const { theme } = useTheme()
  const motion = useEvaMotion()
  if (tick <= 0 || motion.reduced) return null
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Confetti key={tick} autoplay fadeOutOnEnd colors={[EMBER_500, theme.primary, '#F59E0B', theme.success]} />
    </View>
  )
}
