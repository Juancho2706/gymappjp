import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import * as Haptics from 'expo-haptics'

export type ClientTab = 'overview' | 'progreso' | 'analisis' | 'plan' | 'nutricion' | 'facturacion'

export interface TabItem {
  value: ClientTab
  label: string
  icon: any
  badge?: number | '!' | null
}

// Faithful port of the web ficha tab nav (coach-ficha.jsx): a horizontal row of
// pills — active fills with the white-label brand (bg-sport-500), inactive is a
// bordered surface card. Sticky behaviour is owned by the screen ScrollView.
export function ClientTabBar({ items, value, onChange }: { items: TabItem[]; value: ClientTab; onChange: (v: ClientTab) => void }) {
  return (
    <View className="bg-surface-app border-b border-subtle" style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {items.map((it) => {
          const on = it.value === value
          const attention = it.badge === '!'
          const badgeBgClass = attention
            ? 'bg-danger-500'
            : on
              ? 'bg-white/25'
              : 'bg-surface-sunken'
          return (
            <TouchableOpacity
              key={it.value}
              activeOpacity={0.8}
              onPress={() => { onChange(it.value); Haptics.selectionAsync().catch(() => {}) }}
              className={`rounded-pill border-[1.5px] ${on ? 'bg-sport-500 border-transparent' : 'bg-surface-card border-default'}`}
              style={styles.tab}
            >
              <Text className={`font-sans-bold ${on ? 'text-white' : 'text-muted'}`} style={styles.label}>
                {it.label}
              </Text>
              {it.badge != null && it.badge !== 0 ? (
                <View className={`rounded-pill ${badgeBgClass}`} style={styles.badge}>
                  <Text className={`font-sans-bold ${attention || on ? 'text-white' : 'text-muted'}`} style={styles.badgeTxt}>
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
  wrap: { marginHorizontal: -16 },
  scroll: { gap: 6, paddingHorizontal: 16, paddingVertical: 10 },
  tab: { height: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14 },
  label: { fontSize: 13.5 },
  badge: { minWidth: 18, height: 18, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  badgeTxt: { fontSize: 11 },
})
