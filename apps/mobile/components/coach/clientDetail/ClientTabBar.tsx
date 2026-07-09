import { useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { MotiView } from 'moti'
import { ChevronRight } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useTheme } from '../../../context/ThemeContext'

export type ClientTab = 'overview' | 'progreso' | 'analisis' | 'plan' | 'nutricion' | 'facturacion'

export interface TabItem {
  value: ClientTab
  label: string
  icon?: any
  badge?: number | '!' | null
}

// Port fiel del ProfileTabNav web (coach-ficha.jsx): fila horizontal de pills
// label-only (sin iconos). Activa = fondo marca (bg-sport-500) texto on-sport;
// inactiva = superficie con borde. Full-bleed contra el gutter. Fade + chevron
// animado a la derecha cuando las pills desbordan y no se llego al final.
// El comportamiento sticky lo maneja el ScrollView de la pantalla.
export function ClientTabBar({ items, value, onChange }: { items: TabItem[]; value: ClientTab; onChange: (v: ClientTab) => void }) {
  const { theme } = useTheme()
  const [viewW, setViewW] = useState(0)
  const [contentW, setContentW] = useState(0)
  const [scrollX, setScrollX] = useState(0)

  const canScrollRight = contentW > viewW + 4 && scrollX + viewW < contentW - 4

  const onLayout = (e: LayoutChangeEvent) => setViewW(e.nativeEvent.layout.width)
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setScrollX(e.nativeEvent.contentOffset.x)

  return (
    <View className="bg-surface-app border-b border-subtle" style={styles.wrap}>
      <View style={styles.inner}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          onLayout={onLayout}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onContentSizeChange={(w) => setContentW(w)}
        >
          {items.map((it) => {
            const on = it.value === value
            const attention = it.badge === '!'
            const badgeBgClass = attention ? 'bg-danger-500' : on ? 'bg-white/25' : 'bg-surface-sunken'
            return (
              <TouchableOpacity
                key={it.value}
                activeOpacity={0.8}
                onPress={() => { onChange(it.value); Haptics.selectionAsync().catch(() => {}) }}
                testID={`ficha-tab-${it.value}`}
                className={`rounded-pill border-[1.5px] ${on ? 'bg-sport-500 border-sport-500' : 'bg-surface-card border-default'}`}
                style={styles.tab}
              >
                <Text className={`font-sans-bold ${on ? 'text-on-sport' : 'text-muted'}`} style={styles.label}>
                  {it.label}
                </Text>
                {it.badge != null && it.badge !== 0 ? (
                  <View className={`rounded-pill ${badgeBgClass}`} style={styles.badge}>
                    <Text className={`font-sans-extra ${attention || on ? 'text-white' : 'text-muted'}`} style={styles.badgeTxt}>
                      {attention ? '!' : String(it.badge)}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {/* Fade + chevron: solo cuando hay overflow a la derecha. */}
        {canScrollRight ? (
          <View pointerEvents="none" style={styles.fade}>
            <LinearGradient
              colors={['transparent', theme.background]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={StyleSheet.absoluteFill}
            />
            <MotiView from={{ translateX: 0 }} animate={{ translateX: 4 }} transition={{ loop: true, type: 'timing', duration: 1100, repeatReverse: true }} style={styles.chevron}>
              <ChevronRight size={16} color={theme.mutedForeground} />
            </MotiView>
          </View>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: -16 },
  inner: { position: 'relative' },
  scroll: { gap: 6, paddingHorizontal: 16, paddingVertical: 10 },
  tab: { height: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14 },
  label: { fontSize: 13.5 },
  badge: { minWidth: 18, height: 18, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  badgeTxt: { fontSize: 11 },
  fade: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 56, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 4 },
  chevron: { },
})
