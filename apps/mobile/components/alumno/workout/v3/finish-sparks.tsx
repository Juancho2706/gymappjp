import { useEffect, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import type { ExecTheme } from './exec-theme'

/**
 * Chispas de IGNICIÓN del CTA "Finalizar entrenamiento": one-shot al completar TODAS las series de la
 * sesión. Se monta sólo en la transición de armado y el host lo desmonta al terminar (`onDone`), así que
 * nada queda animando en loop detrás del botón.
 *
 * Partículas propias con Reanimated (sin dependencia nueva — misma técnica que `PrCelebration`): salen
 * radialmente del centro del botón con translate + scale a 0 + fade. `pointerEvents="none"` en todos los
 * niveles: la capa jamás intercepta el tap del CTA que está celebrando.
 *
 * reduced-motion se resuelve en el host (no se monta el componente).
 */

const SPARK_COUNT = 8
const SPARK_MS = 800

interface SparkSeed {
  angle: number
  dist: number
  size: number
  color: string
}

/**
 * Abanico radial completo (360°) con jitter para que no se lea como una rejilla. Colores: el oro del PR y
 * el token de celebración del tema del ejecutor + blanco, sin hex nuevos.
 */
function makeSeeds(exec: ExecTheme): SparkSeed[] {
  const tints = [exec.pr, exec.celebration, '#ffffff']
  return Array.from({ length: SPARK_COUNT }).map((_, i) => ({
    angle: (Math.PI * 2 * i) / SPARK_COUNT + (Math.random() - 0.5) * 0.45,
    dist: 52 + Math.random() * 34,
    size: 5 + Math.random() * 3,
    color: tints[i % tints.length],
  }))
}

function Spark({ seed }: { seed: SparkSeed }) {
  const t = useSharedValue(0)
  useEffect(() => {
    t.value = withTiming(1, { duration: SPARK_MS, easing: Easing.out(Easing.cubic) })
  }, [t])
  const style = useAnimatedStyle(() => {
    const p = t.value
    return {
      // Entrada casi instantánea y salida larga: la chispa "estalla" y se apaga alejándose.
      opacity: p < 0.12 ? p / 0.12 : 1 - (p - 0.12) / 0.88,
      transform: [
        { translateX: Math.cos(seed.angle) * seed.dist * p },
        { translateY: Math.sin(seed.angle) * seed.dist * p },
        { scale: 1 - 0.85 * p },
      ],
    }
  })
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', width: seed.size, height: seed.size, borderRadius: 999, backgroundColor: seed.color },
        style,
      ]}
    />
  )
}

export function FinishSparks({ exec, onDone }: { exec: ExecTheme; onDone: () => void }) {
  // Semillas fijas por montaje (el host remonta con `key={nonce}` si volviera a armarse).
  const seeds = useMemo(() => makeSeeds(exec), [exec])

  useEffect(() => {
    const id = setTimeout(onDone, SPARK_MS + 80)
    return () => clearTimeout(id)
  }, [onDone])

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {/* Emisor puntual en el centro del botón (caja 0×0: las partículas se posicionan por transform). */}
      <View pointerEvents="none" style={styles.emitter}>
        {seeds.map((seed, i) => (
          <Spark key={i} seed={seed} />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  emitter: { position: 'absolute', top: '50%', left: '50%', width: 0, height: 0 },
})
