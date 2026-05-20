import { StyleSheet, View } from 'react-native'
import type { DimensionValue, ViewStyle } from 'react-native'
import { MotiView } from 'moti'
import { useTheme } from '../context/ThemeContext'

interface SkeletonProps {
  width?: DimensionValue
  height?: number
  radius?: number
  style?: ViewStyle
}

export function Skeleton({ width = '100%', height = 16, radius, style }: SkeletonProps) {
  const { theme } = useTheme()
  return (
    <View
      style={[
        styles.wrap,
        {
          width,
          height,
          borderRadius: radius ?? theme.radius.md,
          backgroundColor: theme.muted,
        },
        style,
      ]}
    >
      <MotiView
        from={{ opacity: 0.35 }}
        animate={{ opacity: 0.85 }}
        transition={{ type: 'timing', duration: 900, loop: true }}
        style={[StyleSheet.absoluteFill, { backgroundColor: theme.primary + '10' }]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
})
