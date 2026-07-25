import { useEffect, useMemo } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { MotiView } from 'moti'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { ArrowUp, Medal } from 'lucide-react-native'
import { formatWeightEsCl, type PrBest, type PrKind } from '@eva/workout-engine'
import { FONT } from '../../../../lib/typography'
import { hexToRgba } from '../../../../lib/theme'
import type { ExecTheme } from './exec-theme'

/**
 * PR en vivo (E4.2) — banner-card dorado inline + micro-confeti, traducción RN de la pantalla "PR en vivo"
 * del mockup concepto-a-v3-momentos (`.a3e-prbanner` + `.a3e-prev`), espejo fiel del web `PrCelebration`.
 * SIN modal, `pointerEvents="none"`: se monta SOBRE el ejecutor (que sigue vivo debajo) y auto-desaparece
 * (~1,5s, lo gobierna `useCelebrations`). El borde dorado de la fila también vive en las pantallas de
 * fuerza (reusa `recentSet`); este overlay aporta la TARJETA rectangular "¡PR! Nuevo récord / {kg} kg —
 * tu mejor marca" (medalla dorada) + el chip "Anterior {prev} kg · Superado" tachado con flecha arriba.
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
  prevBest,
  kind,
  reducedMotion,
  nonce,
}: {
  exec: ExecTheme
  /** Peso de la serie récord (kg). */
  weightKg: number
  /** Mejor marca histórica superada (chip "Anterior" tachado). */
  prevBest: PrBest
  /** Eje del récord — matiza el rótulo (peso vs 1RM). */
  kind: PrKind
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

      {/* Tarjeta "¡PR!" (banner rect + chip Anterior) — entra con rebote (reduced-motion ⇒ fade). */}
      <MotiView
        from={reducedMotion ? { opacity: 0 } : { opacity: 0, translateY: -14, scale: 0.9 }}
        animate={{ opacity: 1, translateY: 0, scale: 1 }}
        exit={reducedMotion ? { opacity: 0 } : { opacity: 0, translateY: -8, scale: 0.95 }}
        transition={
          reducedMotion
            ? { type: 'timing', duration: 160 }
            : { type: 'spring', damping: 13, stiffness: 220, mass: 0.7 }
        }
        style={styles.card}
      >
        <View style={[styles.banner, { backgroundColor: hexToRgba(gold, 0.18), borderColor: hexToRgba(gold, 0.55) }]}>
          <View style={[styles.medal, { backgroundColor: gold }]}>
            <Medal size={17} color="#3a2a06" strokeWidth={2.6} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.kicker, { color: gold }]} numberOfLines={1}>
              ¡PR! {kind === 'e1rm' ? 'Mejor 1RM' : 'Nuevo récord'}
            </Text>
            <Text style={styles.value} numberOfLines={1}>
              {formatWeightEsCl(weightKg)} kg <Text style={styles.valueSmall}>— tu mejor marca</Text>
            </Text>
          </View>
        </View>

        {/* Chip "Anterior 60 kg · Superado" (tachado con flecha arriba). */}
        <View style={styles.prev}>
          <Text style={styles.prevLbl}>Anterior</Text>
          <Text style={[styles.prevVal, { textDecorationColor: hexToRgba(gold, 0.7) }]}>
            {formatWeightEsCl(prevBest.weightKg)} kg
          </Text>
          <View style={{ flex: 1 }} />
          <ArrowUp size={14} color={gold} strokeWidth={3} />
          <Text style={[styles.prevSup, { color: gold }]}>Superado</Text>
        </View>
      </MotiView>
    </MotiView>
  )
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'flex-start' },
  emitter: { position: 'absolute', top: 22, left: '50%', width: 0, height: 0 },
  // Contenedor de la tarjeta (banner + chip anterior), ancho acotado como el card del mockup.
  card: { width: 300, maxWidth: '90%', gap: 8 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderRadius: 15,
    borderWidth: 2,
    paddingHorizontal: 14,
    paddingVertical: 11,
    // Halo dorado sutil bajo la tarjeta.
    shadowColor: '#f5c451',
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  medal: {
    height: 34,
    width: 34,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kicker: { fontFamily: FONT.uiExtra, fontSize: 10, letterSpacing: 1.6, textTransform: 'uppercase' },
  value: { fontFamily: FONT.displayBlack, fontSize: 16, letterSpacing: -0.3, color: '#fff8e6', marginTop: 1, fontVariant: ['tabular-nums'] },
  valueSmall: { fontFamily: FONT.uiBold, fontSize: 12, color: '#d9c489' },
  // Chip "Anterior · Superado" (dashed dorado apagado).
  prev: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#34343f',
    backgroundColor: '#1b1b23',
  },
  prevLbl: { fontFamily: FONT.uiSemibold, fontSize: 12, color: '#8f8f9c' },
  prevVal: { fontFamily: FONT.uiBold, fontSize: 14, color: '#7f7f8c', textDecorationLine: 'line-through', fontVariant: ['tabular-nums'] },
  prevSup: { fontFamily: FONT.uiExtra, fontSize: 11, letterSpacing: 0.5, textTransform: 'uppercase' },
})
