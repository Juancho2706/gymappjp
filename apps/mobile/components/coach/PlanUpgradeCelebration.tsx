import { StyleSheet, Text, View } from 'react-native'
import { MotiView } from 'moti'
import { BadgeCheck, PartyPopper, Users } from 'lucide-react-native'
import { Dialog } from '../Dialog'
import { Button } from '../Button'
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
 * Motion: escala + fade sobre el ícono y las líneas, con las duraciones del DS (`useEvaMotion`,
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

/** Entrada escalonada: cada hijo entra `index * 70 ms` después, tope 600 ms de punta a punta. */
function Reveal({
  index,
  reduced,
  duration,
  children,
}: {
  index: number
  reduced: boolean
  /** Ya viene resuelta por `useEvaMotion` (0 con reduce-motion). */
  duration: number
  children: React.ReactNode
}) {
  return (
    <MotiView
      from={reduced ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'timing', duration, delay: reduced ? 0 : index * 70 }}
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
          {/* Halo desde `theme.primary`: en white-label el ícono tiene que salir con la marca DEL
              COACH, y `bg-sport-100` es la rampa fija de EVA. */}
          <View style={[styles.badge, { backgroundColor: hexToRgba(theme.primary, 0.12) }]}>
            <PartyPopper size={30} strokeWidth={2} color={theme.primary} />
          </View>
        </Reveal>

        <Reveal index={1} reduced={reduced} duration={revealDuration}>
          <Text
            style={[textStyle('2xl', FONT.displayBlack, { lh: 'tight', ls: 'tighter' }), styles.center]}
            className="text-strong"
          >
            Tu plan cambió
          </Text>
        </Reveal>

        <Reveal index={2} reduced={reduced} duration={revealDuration}>
          <View style={styles.line}>
            <Users size={17} strokeWidth={2.2} color={theme.primary} />
            <Text style={[textStyle('sm', FONT.uiBold), styles.flex1]} className="text-strong">
              {capLine}
            </Text>
          </View>
        </Reveal>

        {badgeLine ? (
          <Reveal index={3} reduced={reduced} duration={revealDuration}>
            <View style={styles.line}>
              <BadgeCheck size={17} strokeWidth={2.2} color={theme.success} />
              <Text style={[TYPE.caption, styles.flex1]} className="text-muted">
                {badgeLine}
              </Text>
            </View>
          </Reveal>
        ) : null}
      </View>
    </Dialog>
  )
}

const styles = StyleSheet.create({
  body: { alignItems: 'center', gap: 12, paddingTop: 8 },
  badge: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, paddingHorizontal: 4 },
  flex1: { flex: 1, minWidth: 0 },
})
