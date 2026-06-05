import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { useTheme } from '../../../context/ThemeContext'

export type ClientTab = 'overview' | 'progreso' | 'analisis' | 'plan' | 'nutricion' | 'facturacion'

export interface TabItem {
  value: ClientTab
  label: string
  icon: any
  badge?: number | '!' | null
}

export function ClientTabBar({ items, value, onChange }: { items: TabItem[]; value: ClientTab; onChange: (v: ClientTab) => void }) {
  const { theme } = useTheme()
  return (
    <View style={[styles.wrap, { backgroundColor: theme.background, borderBottomColor: theme.border }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {items.map((it) => {
          const on = it.value === value
          const Icon = it.icon
          const attention = it.badge === '!'
          const badgeColor = attention ? theme.destructive : theme.primary
          return (
            <TouchableOpacity
              key={it.value}
              activeOpacity={0.8}
              onPress={() => { onChange(it.value); Haptics.selectionAsync().catch(() => {}) }}
              style={[
                styles.tab,
                {
                  backgroundColor: on ? theme.primary : theme.secondary,
                  borderColor: on ? theme.primary : theme.border,
                  borderRadius: theme.radius.lg,
                },
              ]}
            >
              <Icon size={15} color={on ? theme.primaryForeground : theme.mutedForeground} strokeWidth={2.1} />
              <Text style={[styles.label, { color: on ? theme.primaryForeground : theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                {it.label}
              </Text>
              {it.badge != null && it.badge !== 0 ? (
                <View style={[styles.badge, { backgroundColor: on ? theme.primaryForeground : badgeColor }]}>
                  <Text style={[styles.badgeTxt, { color: on ? theme.primary : '#FFFFFF', fontFamily: 'Inter_700Bold' }]}>
                    {attention ? '!' : String(it.badge)}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: StyleSheet.hairlineWidth, marginHorizontal: -16 },
  scroll: { gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 8, borderWidth: 1 },
  label: { fontSize: 13 },
  badge: { minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
  badgeTxt: { fontSize: 9.5 },
})
