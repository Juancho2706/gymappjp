import { StyleSheet, View } from 'react-native'
import type { DimensionValue } from 'react-native'
import { MotiView } from 'moti'
import { useTheme } from '../context/ThemeContext'

interface ProgressBarProps {
  value: number
  color?: string
  height?: number
}

export function ProgressBar({ value, color, height = 6 }: ProgressBarProps) {
  const { theme } = useTheme()
  const pct = `${Math.max(0, Math.min(1, value)) * 100}%` as DimensionValue

  return (
    <View style={[styles.track, { backgroundColor: theme.muted, height, borderRadius: height / 2 }]}>
      <MotiView
        animate={{ width: pct }}
        transition={{ type: 'timing', duration: 350 }}
        style={[styles.fill, { backgroundColor: color ?? theme.primary, height, borderRadius: height / 2 }]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  track: { overflow: 'hidden', width: '100%' },
  fill: {},
})
