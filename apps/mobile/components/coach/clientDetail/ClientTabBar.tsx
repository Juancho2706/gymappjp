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
          const color = on ? theme.primary : theme.mutedForeground
          return (
            <TouchableOpacity
              key={it.value}
              activeOpacity={0.8}
              onPress={() => { onChange(it.value); Haptics.selectionAsync().catch(() => {}) }}
              style={styles.tab}
            >
              <Icon size={14} color={color} strokeWidth={2.1} />
              <Text style={[styles.label, { color, fontFamily: 'Inter_700Bold' }]}>
                {it.label}
              </Text>
              {it.badge != null && it.badge !== 0 ? (
                <View
                  style={[
                    styles.badge,
                    attention
                      ? { backgroundColor: '#F59E0B22', borderColor: '#F59E0B59' }
                      : { backgroundColor: theme.primary + '1F', borderColor: theme.primary + '40' },
                  ]}
                >
                  <Text style={[styles.badgeTxt, { color: attention ? '#D97706' : theme.primary, fontFamily: 'Inter_700Bold' }]}>
                    {attention ? '!' : String(it.badge)}
                  </Text>
                </View>
              ) : null}
              {on ? <View style={[styles.indicator, { backgroundColor: theme.primary }]} /> : null}
            </TouchableOpacity>
          )
        })}
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { borderBottomWidth: StyleSheet.hairlineWidth, marginHorizontal: -16 },
  scroll: { paddingHorizontal: 12 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 13, position: 'relative' },
  label: { fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase' },
  badge: { minWidth: 18, height: 18, borderRadius: 6, borderWidth: 1, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  badgeTxt: { fontSize: 9 },
  indicator: { position: 'absolute', left: 8, right: 8, bottom: 0, height: 2.5, borderRadius: 2 },
})
