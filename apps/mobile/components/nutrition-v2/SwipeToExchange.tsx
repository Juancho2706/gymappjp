import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { AccessibilityInfo, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

/**
 * Deslizar la fila hacia la izquierda para cambiar el alimento (T2.5 F6). Espejo del web.
 *
 * El gesto solo aplica reemplazos del coach (ver `swipeApplicableOptions`); si el item no tiene
 * ninguno aplicable a ciegas, `onSwipe` abre el sheet en vez de escribir.
 *
 * `gesture-handler` y `reanimated` ya estaban instalados: cero dependencias nuevas.
 */

/** Desplazamiento en px a partir del cual el gesto cuenta como intención, no como roce. */
const TRIGGER_PX = 56

export function SwipeToExchange({
  enabled,
  onSwipe,
  children,
}: {
  enabled: boolean
  onSwipe: () => void
  children: ReactNode
}) {
  const translateX = useSharedValue(0)
  const [reduceMotion, setReduceMotion] = useState(false)

  useEffect(() => {
    let active = true
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduceMotion(value)
    })
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
    return () => {
      active = false
      sub.remove()
    }
  }, [])

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }))

  if (!enabled) return <>{children}</>

  // `activeOffsetX` deja que el scroll vertical de la lista gane: sin eso, arrastrar la pantalla
  // hacia abajo sobre una fila secuestraría el gesto.
  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-8, 8])
    .onUpdate((event) => {
      translateX.value = Math.min(0, Math.max(event.translationX, -(TRIGGER_PX + 24)))
    })
    .onEnd((event) => {
      const triggered = event.translationX <= -TRIGGER_PX
      // Con "reducir movimiento" vuelve seco; sin él, con resorte. El GESTO no se desactiva: es
      // una forma de operar la app, no un adorno.
      translateX.value = reduceMotion ? withTiming(0, { duration: 0 }) : withSpring(0)
      if (triggered) runOnJS(onSwipe)()
    })

  return (
    <View className="relative overflow-hidden">
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        className="absolute inset-y-0 right-0 flex-row items-center gap-1.5 pr-4"
      >
        <Text className="text-xs font-medium text-primary">⇄ Cambiar</Text>
      </View>
      <GestureDetector gesture={pan}>
        <Animated.View style={style} className="bg-surface-card">
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  )
}
