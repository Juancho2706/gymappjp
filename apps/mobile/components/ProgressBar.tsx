import { StyleSheet, Text, View } from 'react-native'
import type { DimensionValue, StyleProp, ViewStyle } from 'react-native'
import type { ReactNode } from 'react'
import { MotiView } from 'moti'
import { useTheme } from '../context/ThemeContext'

interface ProgressBarProps {
  /** Progress as a 0..1 fraction (mobile scale; clamped to [0,1]). */
  value: number
  /** Fill color. Defaults to the branded sport-500 accent. */
  color?: string
  /** Track (background) color override. Defaults to the DS `--track` token. */
  track?: string
  /** Bar thickness in px. */
  height?: number
  /** Optional label shown at the left of the header row. */
  label?: ReactNode
  /** Optional node shown at the right of the header row (e.g. "120 / 180 g"). */
  trailing?: ReactNode
  /** Optional style for the outer container. */
  style?: StyleProp<ViewStyle>
}

export function ProgressBar({ value, color, track, height = 8, label, trailing, style }: ProgressBarProps) {
  const { theme } = useTheme()
  const pct = `${Math.max(0, Math.min(1, value)) * 100}%` as DimensionValue
  const hasHeader = label != null || trailing != null

  return (
    <View style={[styles.container, style]}>
      {hasHeader && (
        <View style={styles.header}>
          {typeof label === 'string' || typeof label === 'number' ? (
            <Text className="text-[13px] text-body font-sans-semibold">{label}</Text>
          ) : (
            label ?? <View />
          )}
          {typeof trailing === 'string' || typeof trailing === 'number' ? (
            <Text className="text-[13px] text-strong font-sans-bold" style={styles.tnum}>
              {trailing}
            </Text>
          ) : (
            trailing ?? null
          )}
        </View>
      )}

      <View
        // DS `--track` token (light: ink-100, dark: white @ 10%) unless overridden.
        className={track ? 'w-full overflow-hidden' : 'w-full overflow-hidden bg-track dark:bg-track/10'}
        style={[styles.track, { height, borderRadius: 9999 }, track ? { backgroundColor: track } : null]}
      >
        <MotiView
          animate={{ width: pct }}
          transition={{ type: 'timing', duration: 320 }}
          style={{ height, borderRadius: 9999, backgroundColor: color ?? theme.primary }}
        />
      </View>
    </View>
  )
}

export { ProgressBar as Progress }

const styles = StyleSheet.create({
  container: { width: '100%' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  track: { width: '100%' },
  tnum: { fontVariant: ['tabular-nums'] },
})
