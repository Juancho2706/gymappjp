import { useState } from 'react'
import { Animated, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
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
// QA2 A4 — el backdrop y el borde inferior se pintaban SIEMPRE, así que mientras la tira NO
// estaba anclada se veía como una banda casi negra tapando el gradiente de la app (imagen 10
// del QA). Ahora ambos viven en una capa cuya opacidad la maneja `backdropProgress`
// (Animated.Value que la pantalla alimenta desde el onScroll que ya tenía): transparente lejos
// → superficie al anclarse. La capa se MONTA solo cerca del anclaje (`near`).
//
// QA device 2026-08-18 (Xiaomi/Android/dark) — el fondo se TRANSPARENTABA: anclada, se leía la
// fila de métricas ("Entreno / Nutrición / Check-In") atravesando las pastillas. Causa: la capa
// era `blur + tinte surface-app al 80%`, y ese 80% deja 20% de lo que scrollea por detrás A
// PROPÓSITO. En iOS el `UIVisualEffectView` difuminaba ese 20% hasta volverlo ilegible y el
// defecto no se notaba; en Android `EvaBlur` NO difumina (gatea `experimentalBlurMethod` por el
// crash-loop EVA-MOBILE-7) y solo suma un velo plano ⇒ el 20% pasaba nítido y legible.
// Decisión del dueño: la barra va SÓLIDA. El tinte es ahora `theme.background` (= token
// `--surface-app`, el mismo chrome que ya usan el SafeAreaView de la ficha y el degradé de fade)
// SIN alpha, y el blur se retira: bajo un relleno opaco es invisible y solo costaba montar/medir
// una BlurView por frame de scroll. La rampa de opacidad se conserva intacta, así que "sin fondo
// lejos → sólido al anclarse" sigue igual.
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
  /** 0 = lejos del anclaje (sin fondo) · 1 = anclada (superficie sólida del tema). */
  backdropProgress?: Animated.Value
}) {
  const { theme, resolvedScheme } = useTheme()
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
          {/* Superficie OPACA del chrome: `theme.background` = token `--surface-app`, que flipea
              por esquema (paper / #0A0D12) y NO es white-label —`applyEffectiveCoachBranding` y
              `effectiveBrandVars` solo tocan primary/accent—, así que la tira queda sólida y
              exactamente del mismo tono que el `bg-surface-app` de la pantalla con cualquier
              marca. Sin alpha y sin blur (ver cabecera). */}
          <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: theme.background }]} />
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
