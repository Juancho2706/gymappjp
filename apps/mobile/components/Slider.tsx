import { useEffect, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import type { LayoutChangeEvent, ViewStyle } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { useTheme } from '../context/ThemeContext'
import { SHADOWS } from '../lib/shadows'
import { FONT, textStyle } from '../lib/typography'
import { haptics } from '../lib/haptics'

/**
 * EVA Slider — primitiva DS de rango discreto (RN port del `<input type="range">`
 * de la web, p.ej. el "Nivel de energía" del check-in con `accentColor` de marca).
 *
 * - track + fill (color de marca `theme.primary` runtime) + thumb 28px blanco.
 * - arrastre con gesture-handler Pan + reanimated en UI thread (sin deps nativas
 *   nuevas); tambien acepta tap-to-set (Pan con distancia 0).
 * - steps discretos (min/max/step); haptics.select() en cada cambio de step.
 * - value label opcional a la derecha (mismo layout que la web).
 * - accesible: role "adjustable" + acciones increment/decrement.
 * - light/dark: track neutro low-contrast como el `Switch`.
 */

const THUMB = 28
const TRACK_H = 6

interface SliderProps {
  value: number
  onValueChange: (next: number) => void
  min?: number
  max?: number
  step?: number
  /** Etiqueta a la izquierda (ej. "Nivel de energía"). */
  label?: string
  /** Muestra el valor a la derecha; recibe el value y devuelve el nodo (ej. `${v}/10`). */
  renderValue?: (value: number) => React.ReactNode
  disabled?: boolean
  testID?: string
  style?: ViewStyle
}

const clampW = (v: number, lo: number, hi: number): number => {
  'worklet'
  return Math.min(Math.max(v, lo), hi)
}

export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 10,
  step = 1,
  label,
  renderValue,
  disabled,
  testID,
  style,
}: SliderProps) {
  const { theme, resolvedScheme } = useTheme()
  const [trackW, setTrackW] = useState(0)

  const range = Math.max(max - min, 1)
  // Ancho recorrible por el thumb (el track menos el propio thumb).
  const usable = useSharedValue(0)
  const thumbX = useSharedValue(0)
  const lastValue = useSharedValue(value)
  const dragging = useSharedValue(false)

  const posFor = (v: number, w: number) => (w > 0 ? ((v - min) / range) * (w - THUMB) : 0)

  // Sync desde la prop (cambios externos) cuando no se esta arrastrando.
  useEffect(() => {
    lastValue.value = value
    if (!dragging.value && trackW > 0) {
      thumbX.value = withTiming(posFor(value, trackW), { duration: 140 })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, trackW])

  function onLayout(e: LayoutChangeEvent) {
    const w = e.nativeEvent.layout.width
    setTrackW(w)
    usable.value = Math.max(w - THUMB, 0)
    thumbX.value = posFor(value, w)
  }

  function emit(v: number) {
    haptics.select()
    onValueChange(v)
  }

  const applyX = (x: number) => {
    'worklet'
    const u = usable.value
    const left = clampW(x - THUMB / 2, 0, u)
    thumbX.value = left
    const frac = u > 0 ? left / u : 0
    const raw = min + frac * range
    const snapped = clampW(Math.round((raw - min) / step) * step + min, min, max)
    if (snapped !== lastValue.value) {
      lastValue.value = snapped
      runOnJS(emit)(snapped)
    }
  }

  const pan = Gesture.Pan()
    .minDistance(0)
    .enabled(!disabled)
    .onBegin((e) => {
      dragging.value = true
      applyX(e.x)
    })
    .onUpdate((e) => {
      applyX(e.x)
    })
    .onFinalize(() => {
      dragging.value = false
      // Reasentar el thumb al step confirmado (por si quedo entre medias).
      const u = usable.value
      thumbX.value = withTiming(u > 0 ? ((lastValue.value - min) / range) * u : 0, { duration: 120 })
    })

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: thumbX.value }] }))
  const fillStyle = useAnimatedStyle(() => ({ width: thumbX.value + THUMB / 2 }))

  const offTrack = resolvedScheme === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)'

  function nudge(delta: number) {
    const next = clampW(Math.round((value - min) / step) * step + min + delta * step, min, max)
    if (next !== value) emit(next)
  }

  return (
    <View style={style} testID={testID}>
      {(label || renderValue) && (
        <View style={styles.head}>
          {label ? (
            <Text className="text-strong" style={textStyle('xs', FONT.uiSemibold)}>
              {label}
            </Text>
          ) : (
            <View />
          )}
          {renderValue ? renderValue(value) : null}
        </View>
      )}

      <GestureDetector gesture={pan}>
        <View
          style={styles.hitArea}
          onLayout={onLayout}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ min, max, now: value }}
          accessibilityState={{ disabled: !!disabled }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) => {
            if (disabled) return
            if (e.nativeEvent.actionName === 'increment') nudge(1)
            else if (e.nativeEvent.actionName === 'decrement') nudge(-1)
          }}
          testID={testID ? `${testID}-track` : undefined}
        >
          <View style={[styles.track, { backgroundColor: offTrack }]}>
            <Animated.View style={[styles.fill, { backgroundColor: theme.primary }, fillStyle]} />
          </View>
          <Animated.View
            style={[
              styles.thumb,
              { backgroundColor: '#FFFFFF', borderColor: theme.primary, opacity: disabled ? 0.5 : 1 },
              SHADOWS[resolvedScheme].sm,
              thumbStyle,
            ]}
          />
        </View>
      </GestureDetector>
    </View>
  )
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  hitArea: { height: THUMB, justifyContent: 'center' },
  track: { height: TRACK_H, borderRadius: 999, overflow: 'hidden' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 999 },
  thumb: {
    position: 'absolute',
    left: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    borderWidth: 2,
  },
})
