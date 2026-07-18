/**
 * CelebrationOverlay — overlay breve y NO bloqueante para las celebraciones de
 * hábito de Nutrición V2 (Tanda 10 MVP).
 *
 * - Badge (require local `.webp`) entrando con spring scale + burst de confeti
 *   liviano (8-12 Views animadas, implementación propia, sin librerías nuevas).
 * - Háptico suave acoplado al pop.
 * - Auto-dismiss (~1.2-1.8s) con cola de fade; `pointerEvents="box-none"` en el
 *   contenedor y `none` en el contenido → NUNCA bloquea el input de la pantalla.
 * - Reduced-motion (useEvaMotion): SOLO fade del badge, sin partículas ni scale.
 *   Toda la política vive en `celebrationAnimationPlan` (puro/testeable).
 */
import { useEffect, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { MotiView } from 'moti'
import { Image } from 'expo-image'
import {
  celebrationAnimationPlan,
  type CelebrationBadge,
  type CelebrationDecision,
} from '../../lib/nutrition-v2-celebrations'
import { DURATION, EASE, useEvaMotion } from '../../lib/motion'
import { useTheme } from '../../context/ThemeContext'
import { haptics } from '../../lib/haptics'

/** Instancia a mostrar. `nonce` fuerza re-mount aunque el badge se repita. */
export interface CelebrationInstance extends CelebrationDecision {
  nonce: number
}

const BADGE_SOURCES: Record<CelebrationBadge, ReturnType<typeof require>> = {
  'primer-registro': require('../../assets/badges/primer-registro.webp'),
  'dia-cerrado': require('../../assets/badges/dia-cerrado.webp'),
  'primer-escaneo': require('../../assets/badges/primer-escaneo.webp'),
}

const BADGE_SIZE = 132
const FADE_TAIL_MS = 220

interface ParticleSpec {
  id: number
  dx: number
  dy: number
  size: number
  color: string
  delay: number
  duration: number
}

function buildParticles(count: number, palette: readonly string[]): ParticleSpec[] {
  const specs: ParticleSpec[] = []
  for (let i = 0; i < count; i += 1) {
    // Ángulo repartido en el círculo + jitter determinista (sin depender de un
    // seed externo; la variación pseudo-aleatoria basta para un burst decorativo).
    const base = (i / count) * Math.PI * 2
    const jitter = (Math.sin(i * 12.9898) * 43758.5453) % 1
    const angle = base + jitter * 0.5
    const distance = 62 + ((i * 17) % 58) // 62-120px
    specs.push({
      id: i,
      dx: Math.cos(angle) * distance,
      // Ligero sesgo hacia abajo para dar sensación de gravedad al confeti.
      dy: Math.sin(angle) * distance + 18,
      size: 6 + ((i * 5) % 7), // 6-12px
      color: palette[i % palette.length] ?? palette[0]!,
      delay: (i % 4) * 24,
      duration: 620 + ((i * 31) % 260),
    })
  }
  return specs
}

function Particle({ spec, anchor }: { spec: ParticleSpec; anchor: number }) {
  return (
    <MotiView
      pointerEvents="none"
      from={{ opacity: 1, translateX: 0, translateY: 0, scale: 1 }}
      animate={{ opacity: 0, translateX: spec.dx, translateY: spec.dy, scale: 0.35 }}
      transition={{ type: 'timing', duration: spec.duration, delay: spec.delay, easing: EASE.out }}
      style={{
        position: 'absolute',
        top: anchor - spec.size / 2,
        left: anchor - spec.size / 2,
        width: spec.size,
        height: spec.size,
        borderRadius: spec.size / 2,
        backgroundColor: spec.color,
      }}
    />
  )
}

function CelebrationLayer({
  celebration,
  onDone,
}: {
  celebration: CelebrationInstance
  onDone: () => void
}) {
  const { reduced } = useEvaMotion()
  const { theme } = useTheme()
  const plan = useMemo(
    () => celebrationAnimationPlan(celebration.variant, reduced),
    [celebration.variant, reduced],
  )
  const [phase, setPhase] = useState<'in' | 'out'>('in')

  const particles = useMemo(
    () => (plan.confetti ? buildParticles(plan.particleCount, [theme.primary, theme.success, theme.warning]) : []),
    [plan.confetti, plan.particleCount, theme.primary, theme.success, theme.warning],
  )

  // Háptico suave acoplado al frame del pop (se mantiene bajo reduced-motion).
  useEffect(() => {
    if (!plan.haptic) return
    if (celebration.variant === 'full') void haptics.success()
    else void haptics.mealLogged()
    // Solo al montar la celebración (key=nonce garantiza un mount por instancia).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-dismiss con cola de fade, sin bloquear input en ningún momento.
  useEffect(() => {
    const outAt = Math.max(plan.visibleMs - FADE_TAIL_MS, 0)
    const outTimer = setTimeout(() => setPhase('out'), outAt)
    const doneTimer = setTimeout(onDone, plan.visibleMs)
    return () => {
      clearTimeout(outTimer)
      clearTimeout(doneTimer)
    }
  }, [plan.visibleMs, onDone])

  return (
    <MotiView
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
      from={{ opacity: 0 }}
      animate={{ opacity: phase === 'out' ? 0 : 1 }}
      transition={{ type: 'timing', duration: reduced ? 120 : 200, easing: EASE.out }}
    >
      <View pointerEvents="none" style={styles.center}>
        <View style={styles.stage}>
          {particles.map((spec) => (
            <Particle key={spec.id} spec={spec} anchor={BADGE_SIZE / 2} />
          ))}
          <MotiView
            from={plan.entrance === 'spring' ? { scale: 0.3, opacity: 0 } : { opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={
              plan.entrance === 'spring'
                ? { type: 'spring', damping: 12, stiffness: 180, mass: 1 }
                : { type: 'timing', duration: DURATION.base, easing: EASE.out }
            }
          >
            <Image
              source={BADGE_SOURCES[celebration.badge]}
              style={{ width: BADGE_SIZE, height: BADGE_SIZE }}
              contentFit="contain"
              accessibilityIgnoresInvertColors
            />
          </MotiView>
        </View>
      </View>
    </MotiView>
  )
}

/**
 * Monta la capa de celebración cuando `celebration` no es null. `key={nonce}`
 * fuerza una animación fresca por instancia (incluso si el badge se repite).
 */
export function CelebrationOverlay({
  celebration,
  onDone,
}: {
  celebration: CelebrationInstance | null
  onDone: () => void
}) {
  if (!celebration) return null
  return <CelebrationLayer key={celebration.nonce} celebration={celebration} onDone={onDone} />
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  stage: { width: BADGE_SIZE, height: BADGE_SIZE, alignItems: 'center', justifyContent: 'center' },
})
