import { useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import type { LayoutChangeEvent, NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { BlurView } from 'expo-blur'
import { MotiView } from 'moti'
import { ChevronRight } from 'lucide-react-native'
import * as Haptics from 'expo-haptics'
import { useTheme } from '../../../context/ThemeContext'
import { useReducedMotion } from 'react-native-reanimated'
import { hexToRgba } from '../../../lib/theme'
import { shadow } from '../../../lib/shadows'

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
export function ClientTabBar({ items, value, onChange, stuck = false }: { items: TabItem[]; value: ClientTab; onChange: (v: ClientTab) => void; stuck?: boolean }) {
  const { theme, resolvedScheme } = useTheme()
  const isDark = resolvedScheme === 'dark'
  const [viewW, setViewW] = useState(0)
  const [contentW, setContentW] = useState(0)
  const [scrollX, setScrollX] = useState(0)
  const [hintDismissed, setHintDismissed] = useState(false)
  const reducedMotion = useReducedMotion()

  const canScrollRight = contentW > viewW + 4 && scrollX + viewW < contentW - 4

  const onLayout = (e: LayoutChangeEvent) => setViewW(e.nativeEvent.layout.width)
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x
    setScrollX(x)
    if (x > 10) setHintDismissed(true)
  }

  return (
    <View className={`border-b ${stuck ? 'border-default' : 'border-subtle'}`} style={[styles.wrap, stuck ? shadow('sm', resolvedScheme) : null]}>
      {/* Glass: surface-app 80% + backdrop-blur 12px (1:1 con el contenedor sticky web). */}
      <BlurView
        intensity={isDark ? 20 : 30}
        tint={isDark ? 'dark' : 'light'}
        experimentalBlurMethod="dimezisBlurView"
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: hexToRgba(theme.background, 0.8) }]} />
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
            {!hintDismissed ? (
              <MotiView from={{ translateX: 0 }} animate={{ translateX: reducedMotion ? 0 : 4 }} transition={{ loop: !reducedMotion, type: 'timing', duration: 1100, repeatReverse: true }} style={styles.chevron}>
                <ChevronRight size={16} color={theme.mutedForeground} />
              </MotiView>
            ) : null}
          </View>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: -16 },
  inner: { position: 'relative' },
  scroll: { gap: 6, paddingHorizontal: 20, paddingVertical: 8 },
  tab: { height: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14 },
  label: { fontSize: 13.5 },
  badge: { minWidth: 18, height: 18, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
  badgeTxt: { fontSize: 11 },
  fade: { position: 'absolute', right: 0, top: 0, bottom: 0, width: 64, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 4 },
  chevron: { },
})
