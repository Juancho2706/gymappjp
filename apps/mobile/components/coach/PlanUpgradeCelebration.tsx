import { StyleSheet, Text, View } from 'react-native'
import { MotiView } from 'moti'
import { Check } from 'lucide-react-native'
import { Dialog } from '../Dialog'
import { Button } from '../Button'
import { EvaFigure } from '../entry/EvaFigure'
import { useTheme } from '../../context/ThemeContext'
import { useEvaMotion } from '../../lib/motion'
import { hexToRgba } from '../../lib/theme'
import { FONT, TYPE, textStyle } from '../../lib/typography'
import { EVA_BADGE_LABEL, showsEvaBadge, studentCountLabel, type SubscriptionTier } from '../../lib/coach-tiers'
import type { PlanChange } from '../../lib/plan-change'

/**
 * «Tu plan cambió» — acuse de recibo de un cambio que YA ocurrió afuera (embudo Free→Pro, W6.4).
 *
 * NO es una CTA: no hay precio, ni tier ajeno, ni botón que lleve a pagar. Se monta solo DESPUÉS de
 * que «Actualizar estado» (o el pull-to-refresh de Mi plan) revalidó entitlements y `detectPlanChange`
 * encontró un `tier_up`/`cap_up`. Por eso es idéntica en iOS y Android: es estado, no venta
 * (`docs/specs/embudo-free-pro/SPEC.md` §«Experiencia RN»).
 *
 * QA del owner (22-08, Android): los íconos de lucide (cotillón, personas, sello) se veían sueltos
 * y las líneas de texto no aparecían — el `body` centraba a sus hijos y las filas con `flex: 1`
 * colapsaban a ancho cero. Ahora el hero es la figura EVA sobre el color de marca con un check
 * grande encima, y las líneas son solo texto, centradas y a todo el ancho.
 *
 * Motion: escala + fade sobre el hero y las líneas, con las duraciones del DS (`useEvaMotion`,
 * token `slow` = 320 ms + escalonado ⇒ ≤600 ms de punta a punta). El hook central es el que respeta
 * «reducir movimiento» del SO en toda la app: con reduce-motion el contenido entra ya montado
 * (duración 0, sin transform) — la celebración no puede costarle un mareo a nadie.
 */

interface PlanUpgradeCelebrationProps {
  open: boolean
  /** El cambio detectado (`tier_up` | `cap_up`). `null` cuando no hay nada que celebrar. */
  change: PlanChange | null
  /** Tier NUEVO — decide si el sello «Hecho con EVA» dejó de aparecerle a los alumnos. */
  tier: SubscriptionTier
  onClose: () => void
}

const HERO_SIZE = 96
const CHECK_SIZE = 40

/** Entrada escalonada: cada hijo entra `index * 70 ms` después, tope 600 ms de punta a punta. */
function Reveal({
  index,
  reduced,
  duration,
  children,
  stretch,
}: {
  index: number
  reduced: boolean
  /** Ya viene resuelta por `useEvaMotion` (0 con reduce-motion). */
  duration: number
  children: React.ReactNode
  /** Las líneas de texto ocupan todo el ancho del diálogo; el hero no. */
  stretch?: boolean
}) {
  return (
    <MotiView
      from={reduced ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'timing', duration, delay: reduced ? 0 : index * 70 }}
      style={stretch ? styles.stretch : undefined}
    >
      {children}
    </MotiView>
  )
}

export function PlanUpgradeCelebration({ open, change, tier, onClose }: PlanUpgradeCelebrationProps) {
  const { theme } = useTheme()
  const motion = useEvaMotion()
  const reduced = motion.reduced
  const revealDuration = motion.duration('slow')

  const newMax = change?.to.maxClients ?? null
  const capLine =
    newMax != null
      ? `Tu cupo subió a ${studentCountLabel(newMax)}.`
      : 'Tu nuevo plan ya está activo en la app.'
  // El sello solo se menciona cuando DEJÓ de mostrarse (gancho de Pro, pricing-v3 D3).
  const badgeLine = showsEvaBadge(tier) ? null : `Sin el sello «${EVA_BADGE_LABEL}» en la app de tus alumnos.`

  return (
    <Dialog
      open={open}
      onClose={onClose}
      accessibilityLabel="Tu plan cambió"
      showCloseButton={false}
      footer={<Button label="Genial" variant="primary" full onPress={onClose} />}
    >
      <View style={styles.body}>
        <Reveal index={0} reduced={reduced} duration={revealDuration}>
          {/* Figura EVA sobre el color de marca (en white-label, el del coach) con el check encima:
              el hero dice «listo» sin un solo ícono genérico. */}
          <View style={styles.hero}>
            <View style={[styles.heroCircle, { backgroundColor: theme.primary }]}>
              <EvaFigure size={Math.round(HERO_SIZE * 0.56)} />
            </View>
            <View
              style={[
                styles.check,
                { backgroundColor: theme.success, borderColor: theme.card, shadowColor: hexToRgba(theme.success, 0.6) },
              ]}
            >
              <Check size={CHECK_SIZE * 0.6} strokeWidth={3} color="#FFFFFF" />
            </View>
          </View>
        </Reveal>

        <Reveal index={1} reduced={reduced} duration={revealDuration} stretch>
          <Text
            style={[textStyle('2xl', FONT.displayBlack, { lh: 'tight', ls: 'tighter' }), styles.center]}
            className="text-strong"
          >
            Tu plan cambió
          </Text>
        </Reveal>

        <Reveal index={2} reduced={reduced} duration={revealDuration} stretch>
          <Text style={[textStyle('md', FONT.uiBold), styles.center]} className="text-strong">
            {capLine}
          </Text>
        </Reveal>

        {badgeLine ? (
          <Reveal index={3} reduced={reduced} duration={revealDuration} stretch>
            <Text style={[TYPE.caption, styles.center]} className="text-muted">
              {badgeLine}
            </Text>
          </Reveal>
        ) : null}
      </View>
    </Dialog>
  )
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', gap: 12, paddingTop: 8, paddingHorizontal: 8 },
  stretch: { alignSelf: 'stretch' },
  hero: { width: HERO_SIZE + 8, height: HERO_SIZE + 8, alignItems: 'flex-start', justifyContent: 'flex-start' },
  heroCircle: {
    width: HERO_SIZE,
    height: HERO_SIZE,
    borderRadius: HERO_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: CHECK_SIZE,
    height: CHECK_SIZE,
    borderRadius: CHECK_SIZE / 2,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.5,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  center: { textAlign: 'center' },
})
