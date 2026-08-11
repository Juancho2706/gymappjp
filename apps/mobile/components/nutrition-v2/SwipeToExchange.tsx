import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { AccessibilityInfo, Text, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import {
  NUTRITION_SWIPE_HINT_BACK_MS,
  NUTRITION_SWIPE_HINT_DELAY_MS,
  NUTRITION_SWIPE_HINT_HOLD_MS,
  NUTRITION_SWIPE_HINT_OUT_MS,
  NUTRITION_SWIPE_HINT_PEEK_PX,
  NUTRITION_SWIPE_HINT_SEEN_VALUE,
  NUTRITION_SWIPE_HINT_STORAGE_KEY,
  shouldPlaySwipeHint,
} from '@eva/nutrition-v2'

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

/**
 * D5 del QA: nadie descubre el gesto. La PRIMERA fila intercambiable que se monta se asoma una
 * vez y vuelve. Este flag de módulo es el que hace que sea UNA fila y no todas: vive lo que vive
 * el proceso, y la persistencia de "ya la vio" va a `AsyncStorage`.
 */
let hintClaimedThisSession = false

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
  // `null` = todavía no sabemos qué prefiere el sistema. La lectura es asíncrona y la pista NO
  // puede arrancar antes de la respuesta: si asumiéramos `false`, quien tiene "reducir
  // movimiento" activado vería justo la animación que pidió no ver.
  const [reduceMotion, setReduceMotion] = useState<boolean | null>(null)
  const claimedByThisRow = useRef(false)

  useEffect(() => {
    let active = true
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduceMotion(value)
      })
      .catch(() => {
        if (active) setReduceMotion(false)
      })
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
    return () => {
      active = false
      sub.remove()
    }
  }, [])

  useEffect(() => {
    if (reduceMotion === null) return
    let cancelled = false
    // La lectura de `AsyncStorage` es asíncrona, así que la decisión se toma cuando vuelve. El
    // flag de sesión se reclama recién ahí: dos filas que arranquen a la vez resuelven en el
    // orden en que el storage les responde y solo la primera se queda con la pista.
    void AsyncStorage.getItem(NUTRITION_SWIPE_HINT_STORAGE_KEY)
      .catch(() => null)
      .then((stored) => {
        if (cancelled) return
        const play = shouldPlaySwipeHint({
          enabled,
          reduceMotion,
          alreadySeen: stored === NUTRITION_SWIPE_HINT_SEEN_VALUE,
          claimedBySibling: hintClaimedThisSession && !claimedByThisRow.current,
        })
        if (!play) return

        hintClaimedThisSession = true
        claimedByThisRow.current = true
        void AsyncStorage.setItem(
          NUTRITION_SWIPE_HINT_STORAGE_KEY,
          NUTRITION_SWIPE_HINT_SEEN_VALUE,
        ).catch(() => {})

        translateX.value = withDelay(
          NUTRITION_SWIPE_HINT_DELAY_MS,
          withSequence(
            withTiming(-NUTRITION_SWIPE_HINT_PEEK_PX, { duration: NUTRITION_SWIPE_HINT_OUT_MS }),
            withDelay(NUTRITION_SWIPE_HINT_HOLD_MS, withTiming(0, { duration: NUTRITION_SWIPE_HINT_BACK_MS })),
          ),
        )
      })
    return () => {
      cancelled = true
    }
  }, [enabled, reduceMotion, translateX])

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }))

  if (!enabled) return <>{children}</>

  // `activeOffsetX` deja que el scroll vertical de la lista gane: sin eso, arrastrar la pantalla
  // hacia abajo sobre una fila secuestraría el gesto.
  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-8, 8])
    .onBegin(() => {
      // Si la pista está corriendo, el dedo manda: cortarla evita que la animación y el gesto se
      // peleen por el mismo `translateX`.
      cancelAnimation(translateX)
    })
    .onUpdate((event) => {
      translateX.value = Math.min(0, Math.max(event.translationX, -(TRIGGER_PX + 24)))
    })
    .onEnd((event) => {
      const triggered = event.translationX <= -TRIGGER_PX
      // Con "reducir movimiento" vuelve seco; sin él, con resorte. El GESTO no se desactiva: es
      // una forma de operar la app, no un adorno.
      translateX.value = reduceMotion === true ? withTiming(0, { duration: 0 }) : withSpring(0)
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
