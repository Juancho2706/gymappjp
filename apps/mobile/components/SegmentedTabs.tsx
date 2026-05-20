import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../context/ThemeContext'
import { HapticPressable } from './HapticPressable'

export interface SegmentedTabItem<T extends string> {
  value: T
  label: string
}

interface SegmentedTabsProps<T extends string> {
  items: SegmentedTabItem<T>[]
  value: T
  onChange: (value: T) => void
}

export function SegmentedTabs<T extends string>({ items, value, onChange }: SegmentedTabsProps<T>) {
  const { theme } = useTheme()
  return (
    <View style={[styles.wrap, { backgroundColor: theme.secondary, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
      {items.map((item) => {
        const active = item.value === value
        return (
          <HapticPressable
            key={item.value}
            onPress={() => onChange(item.value)}
            style={[
              styles.item,
              {
                backgroundColor: active ? theme.primary : 'transparent',
                borderRadius: theme.radius.lg,
              },
            ]}
          >
            <Text
              style={[
                styles.label,
                {
                  color: active ? theme.primaryForeground : theme.mutedForeground,
                  fontFamily: 'Montserrat_700Bold',
                },
              ]}
              numberOfLines={1}
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
  wrap: { borderWidth: 1, padding: 4, flexDirection: 'row', gap: 4 },
  item: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  label: { fontSize: 12, letterSpacing: 0.2 },
})
