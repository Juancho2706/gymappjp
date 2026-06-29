import { StyleSheet, Text, View } from 'react-native'
import type { ViewStyle } from 'react-native'
import { useTheme } from '../context/ThemeContext'
import { HapticPressable } from './HapticPressable'

/**
 * EVA SegmentedControl (RN port) — iOS-style single-select segmented tabs.
 *
 * Design (token-contract / SegmentedControl.prompt.md):
 *  - Track: `surface-sunken` fill, radius `--radius-md` (14), inset padding 3, no border.
 *  - Active segment lifts onto a `surface-card` pill (radius 11 = md − 3) with a
 *    cool-tinted `shadow-sm`; label = `text-strong` @700.
 *  - Inactive label = `text-muted` @600. UI font = Hanken Grotesk.
 *
 * Colors come from the DS-aligned `theme` (surface-card / surface-sunken /
 * text-strong / text-muted resolve light↔dark at runtime) — no hardcoded hex.
 * Best for 2–4 short options.
 */
export interface SegmentedTabItem<T extends string> {
  value: T
  label: string
}

interface SegmentedTabsProps<T extends string> {
  items: SegmentedTabItem<T>[]
  value: T
  onChange: (value: T) => void
  /** Control height + label size. `sm` 34px · `md` 42px (default). */
  size?: 'sm' | 'md'
}

// DS `--shadow-sm` (cool-tinted rgba 13 18 28) — lift for the active pill.
const SHADOW_SM: ViewStyle = {
  shadowColor: '#0D121C',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.05,
  shadowRadius: 2,
  elevation: 1,
}

const SIZE: Record<'sm' | 'md', { height: number; fontSize: number }> = {
  sm: { height: 34, fontSize: 13 },
  md: { height: 42, fontSize: 14 },
}

export function SegmentedTabs<T extends string>({ items, value, onChange, size = 'md' }: SegmentedTabsProps<T>) {
  const { theme } = useTheme()
  const sz = SIZE[size]

  return (
    <View style={[styles.track, { backgroundColor: theme.secondary }]}>
      {items.map((item) => {
        const active = item.value === value
        return (
          <HapticPressable
            key={item.value}
            onPress={() => onChange(item.value)}
            style={[
              styles.item,
              { height: sz.height, backgroundColor: active ? theme.card : 'transparent' },
              active ? SHADOW_SM : null,
            ]}
          >
            <Text
              numberOfLines={1}
              style={{
                color: active ? theme.foreground : theme.mutedForeground,
                fontFamily: active ? 'HankenGrotesk_700Bold' : 'HankenGrotesk_600SemiBold',
                fontSize: sz.fontSize,
              }}
            >
              {item.label}
            </Text>
          </HapticPressable>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  // Track: surface-sunken, --radius-md (14), inset padding 3, gap 2, full width.
  track: {
    width: '100%',
    flexDirection: 'row',
    gap: 2,
    padding: 3,
    borderRadius: 14,
  },
  // Segment: equal width, radius = --radius-md − 3 (11).
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    paddingHorizontal: 8,
  },
})
