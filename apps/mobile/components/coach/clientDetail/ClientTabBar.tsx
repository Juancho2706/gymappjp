import { useState } from 'react'
import { Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
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
//
// QA2 A4 — el backdrop (blur + tinte `surface-app` al 80%) y el borde inferior se pintaban
// SIEMPRE, así que mientras la tira NO estaba anclada se veía como una banda casi negra
// tapando el gradiente de la app (imagen 10 del QA). Ahora ambos viven en una capa cuya
// opacidad la maneja `backdropProgress` (Animated.Value que la pantalla alimenta desde el
// onScroll que ya tenía): transparente lejos → superficie al anclarse. La capa se MONTA solo
// cerca del anclaje (`near`): en Android `dimezisBlurView` es caro y tenerlo vivo durante
// todo el scroll agregaba jank.
export function ClientTabBar({
  items,
  value,
  onChange,
  stuck = false,
  near = true,
  backdropProgress,
}: {
  items: TabItem[]
  value: ClientTab
  onChange: (v: ClientTab) => void
  stuck?: boolean
  /** ¿La tira está lo bastante cerca del anclaje para que el backdrop aporte? */
  near?: boolean
  /** 0 = lejos del anclaje (sin fondo) · 1 = anclada (fondo glass del tema). */
  backdropProgress?: Animated.Value
}) {
  const { theme, resolvedScheme } = useTheme()
  const isDark = resolvedScheme === 'dark'
  const [viewW, setViewW] = useState(0)
  const [contentW, setContentW] = useState(0)
  /** Boolean de borde (no la posición cruda): solo flipea al llegar/salir del final. */
  const [atEnd, setAtEnd] = useState(false)
  const [hintDismissed, setHintDismissed] = useState(false)
  const reducedMotion = useReducedMotion()
  const canScrollRight = contentW > viewW + 4 && !atEnd

  // Sin `backdropProgress` (uso fuera de la ficha) el backdrop queda opaco como antes.
  // `useState` con inicializador lazy (no `useRef().current`): el valor SÍ participa del
  // render y `react-hooks/refs` prohíbe leer un ref en render.
  const [fallbackProgress] = useState(() => new Animated.Value(1))
  const progress = backdropProgress ?? fallbackProgress
  const showBackdrop = backdropProgress ? near || stuck : true

  // Nota: NO se guarda la posición horizontal en state. Antes cada evento de scroll de la
  // tira (throttle 16ms) hacía `setScrollX` → re-render completo del componente (BlurView +
  // gradiente + MotiView) a ~60fps, y esa era la fricción al deslizarla (QA2 A4).
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent
    const end = contentOffset.x + layoutMeasurement.width >= contentSize.width - 4
    setAtEnd((current) => (current === end ? current : end))
    if (contentOffset.x > 10 && !hintDismissed) setHintDismissed(true)
  }

  return (
    <View style={[styles.wrap, stuck ? shadow('sm', resolvedScheme) : null]}>
      {showBackdrop ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: progress }]}>
          {/* Glass: surface-app 80% + blur (1:1 con el contenedor sticky web). */}
          <BlurView
            intensity={isDark ? 20 : 30}
            tint={isDark ? 'dark' : 'light'}
            experimentalBlurMethod="dimezisBlurView"
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
          />
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: hexToRgba(theme.background, 0.8) }]} />
          {/* Hairline inferior DENTRO de la capa: se desvanece junto al fondo. */}
          <View pointerEvents="none" className={stuck ? 'border-b border-default' : 'border-b border-subtle'} style={StyleSheet.absoluteFill} />
        </Animated.View>
      ) : null}
      <View style={styles.inner}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          onLayout={(e) => setViewW(e.nativeEvent.layout.width)}
          onScroll={onScroll}
          // 64ms alcanza para el fade/chevron (ya no se re-renderiza por posición) y baja la
          // presión de eventos JS sobre el gesto horizontal.
          scrollEventThrottle={64}
          onContentSizeChange={(w) => setContentW(w)}
          // A4: el padre es un ScrollView vertical CON sticky header. Sin estos flags un
          // arrastre con la menor componente vertical se lo llevaba el padre y la tira
          // "no respondía": lock direccional (iOS) + scroll anidado (Android).
          directionalLockEnabled
          nestedScrollEnabled
          overScrollMode="never"
          keyboardShouldPersistTaps="handled"
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
                // hitSlop vertical: los chips miden 38px dentro de una tira de 54px; sin esto
                // un tap algo alto o bajo caía fuera del pill (QA2 A4).
                hitSlop={{ top: 8, bottom: 8, left: 2, right: 2 }}
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
              colors={[hexToRgba(theme.background, 0), theme.background]}
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
