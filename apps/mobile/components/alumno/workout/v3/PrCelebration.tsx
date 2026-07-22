import { useEffect, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { MotiView } from 'moti'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { Medal } from 'lucide-react-native'
import { formatWeightEsCl } from '@eva/workout-engine'
import { FONT } from '../../../../lib/typography'
import { hexToRgba } from '../../../../lib/theme'
import type { ExecTheme } from './exec-theme'

/**
 * PR en vivo (E4.2) — toast dorado inline + micro-confeti, traducción RN de la pantalla "PR en vivo" del
 * mockup concepto-a-v3-momentos. SIN modal, `pointerEvents="none"`: se monta SOBRE el ejecutor (que sigue
 * vivo debajo) y auto-desaparece (~1,5s, lo gobierna `useCelebrations`). El borde dorado de la fila y el
 * chip "Anterior" tachado viven en las pantallas de fuerza (reusan `recentSet`); este overlay aporta el
 * banner "¡PR! {kg} kg — tu mejor marca" con medalla y una ÚNICA oleada de confeti dorado.
 *
 * Confeti: partículas propias Reanimated (sin dependencia nueva — `react-native-fast-confetti` NO está
 * instalado). Pocas (9), una sola oleada, sin loop. reduced-motion ⇒ sin partículas, solo el banner en fade.
 */

const PARTICLE_COUNT = 9
const CONFETTI_MS = 1150
// Matices del oro del PR (token `exec.pr`) — variación sutil para que el confeti no se lea plano.
const GOLD_TINTS = ['#f5c451', '#ffd97a', '#e6a92f']

interface ParticleSeed {
  angle: number
  dist: number
  drift: number
  size: number
  rot: number
  color: string
}

/** Genera la dispersión de la oleada una sola vez (por `nonce`, vía el remount que hace el host). */
function makeSeeds(): ParticleSeed[] {
  return Array.from({ length: PARTICLE_COUNT }).map((_, i) => {
    // Abanico hacia arriba (−200°..−340°, es decir cono superior) + algo de aleatoriedad.
    const spread = (-Math.PI * 0.15) - Math.random() * Math.PI * 0.7
    const angle = spread - Math.PI * 0.15
    return {
      angle,
      dist: 60 + Math.random() * 70,
      drift: (Math.random() - 0.5) * 40,
      size: 6 + Math.random() * 5,
      rot: (Math.random() - 0.5) * 540,
      color: GOLD_TINTS[i % GOLD_TINTS.length],
    }
  })
}

function ConfettiParticle({ seed }: { seed: ParticleSeed }) {
  const t = useSharedValue(0)
  useEffect(() => {
    t.value = withTiming(1, { duration: CONFETTI_MS, easing: Easing.out(Easing.quad) })
  }, [t])
  const style = useAnimatedStyle(() => {
    const p = t.value
    const x = Math.cos(seed.angle) * seed.dist * p + seed.drift * p
    // Gravedad: sube por el impulso inicial y cae con p² (se acentúa al final).
    const y = Math.sin(seed.angle) * seed.dist * p + 150 * p * p
    const opacity = p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85
    return {
      opacity,
      transform: [
        { translateX: x },
        { translateY: y },
        { rotate: `${seed.rot * p}deg` },
        { scale: 1 - 0.35 * p },
      ],
    }
  })
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', width: seed.size, height: seed.size * 0.6, borderRadius: 2, backgroundColor: seed.color },
        style,
      ]}
    />
  )
}

export function PrCelebration({
  exec,
  weightKg,
  reducedMotion,
  nonce,
}: {
  exec: ExecTheme
  /** Peso de la serie récord (kg). */
  weightKg: number
  reducedMotion: boolean
  /** Cambia por cada PR — el host remonta el componente para reiniciar el confeti. */
  nonce: number
}) {
  const gold = exec.pr
  // Semillas fijas por montaje (el host da `key={nonce}` ⇒ remonta y regenera). `nonce` en deps para el linter.
  const seeds = useMemo(() => makeSeeds(), [])
  void nonce

  return (
    <MotiView
      pointerEvents="none"
      style={styles.wrap}
      // El grupo entra sólido y sólo el hijo `banner` anima su entrada; en el desmonte (AnimatePresence del
      // host) el grupo se va en fade — reduced-motion incluido (una duración corta, sin transform).
      from={{ opacity: reducedMotion ? 0 : 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ type: 'timing', duration: reducedMotion ? 140 : 200 }}
    >
      {/* Emisor del confeti: centrado bajo el banner; una sola oleada hacia arriba. */}
      {!reducedMotion && (
        <View pointerEvents="none" style={styles.emitter}>
          {seeds.map((seed, i) => (
            <ConfettiParticle key={i} seed={seed} />
          ))}
        </View>
      )}

      {/* Banner "¡PR!" con medalla — entra con rebote (reduced-motion ⇒ fade). */}
      <MotiView
        from={reducedMotion ? { opacity: 0 } : { opacity: 0, translateY: -14, scale: 0.9 }}
        animate={{ opacity: 1, translateY: 0, scale: 1 }}
        exit={reducedMotion ? { opacity: 0 } : { opacity: 0, translateY: -8, scale: 0.95 }}
        transition={
          reducedMotion
            ? { type: 'timing', duration: 160 }
            : { type: 'spring', damping: 13, stiffness: 220, mass: 0.7 }
        }
        style={[
          styles.banner,
          { backgroundColor: hexToRgba(gold, 0.16), borderColor: hexToRgba(gold, 0.5) },
        ]}
      >
        <View style={[styles.medal, { backgroundColor: gold }]}>
          <Medal size={16} color="#3a2a06" strokeWidth={2.6} />
        </View>
        <View style={{ minWidth: 0 }}>
          <Text style={[styles.title, { color: gold }]} numberOfLines={1}>
            ¡PR! {formatWeightEsCl(weightKg)} kg
          </Text>
          <Text style={[styles.sub, { color: hexToRgba('#ffffff', 0.75) }]} numberOfLines={1}>
            tu mejor marca
          </Text>
        </View>
      </MotiView>
    </MotiView>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'flex-start' },
  emitter: { position: 'absolute', top: 22, left: '50%', width: 0, height: 0 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 999,
    borderWidth: 2,
    paddingLeft: 8,
    paddingRight: 18,
    paddingVertical: 7,
    // Halo dorado sutil bajo el pill.
    shadowColor: '#f5c451',
    shadowOpacity: 0.5,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  medal: {
    height: 30,
    width: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: FONT.displayBlack, fontSize: 16, letterSpacing: -0.2, fontVariant: ['tabular-nums'] },
  sub: { fontFamily: FONT.uiBold, fontSize: 11, letterSpacing: 0.3, textTransform: 'uppercase', marginTop: 1 },
})
