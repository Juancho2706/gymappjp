import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { MotiView } from 'moti'
import {
  Activity,
  Check,
  HeartPulse,
  LockKeyhole,
  Ruler,
  Utensils,
  type LucideIcon,
} from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Badge, Card, EmptyState } from '../../../components'
import type { BadgeTone } from '../../../components/Badge'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { RefreshPlanButton } from '../../../components/coach/RefreshPlanButton'
import { FONT, TYPE, textStyle } from '../../../lib/typography'
import { useWorkspace } from '../../../lib/workspace'
import {
  STATUS_LABELS,
  TIER_LABELS,
  getCoachBillingStatus,
  type CoachAddonView,
  type CoachBillingStatus,
} from '../../../lib/coach-subscription'
import type { SubscriptionTier } from '@eva/tiers'
import { MODULE_CATALOG, MODULE_CATALOG_KEYS, type ModuleKey } from '@eva/module-catalog'

// Pantalla SOLO-ESTADO: ni CTAs de pago, ni link-out a la web, ni precios (Apple 3.1.1 y política
// de pagos de Google prohíben dirigir a un mecanismo de compra externo desde la app). Lo que queda
// es lo permitido: qué plan tengo, hasta cuándo, qué módulos entran y cuántos alumnos caben, más
// "Actualizar estado" para reflejar en el acto un cambio hecho fuera del teléfono.
// Informe: docs/research/cta-pagos-externos-stores-2026-07-31.md

const ADDON_ICON: Record<ModuleKey, LucideIcon> = {
  cardio: HeartPulse,
  movement_assessment: Activity,
  body_composition: Ruler,
  nutrition_exchanges: Utensils,
}

function shortDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

const STATUS_TONE: Record<string, BadgeTone> = {
  active: 'success',
  trialing: 'success',
  canceled: 'danger',
  expired: 'danger',
  past_due: 'warning',
  pending_payment: 'warning',
  paused: 'warning',
}

/**
 * Estado por módulo. Decisión CEO 2026-07-17: los 4 módulos vienen INCLUIDOS con cualquier
 * plan pago (ya no se compran/activan/desactivan). Incluido = plan pago activo o fila
 * coach_addons viva (p. ej. cortesía de un coach free). Free sin cortesía => "Con plan pago".
 */
function addonBadge(
  row: CoachAddonView | undefined,
  hasPaidPlan: boolean,
): { label: string; tone: BadgeTone; icon: LucideIcon | null; lit: boolean } {
  const hasLiveRow = row !== undefined && row.status !== 'cancelled'
  if (hasPaidPlan || hasLiveRow) return { label: 'Incluido en tu plan', tone: 'success', icon: Check, lit: true }
  return { label: 'No incluido', tone: 'neutral', icon: LockKeyhole, lit: false }
}

/** Una fila paga (self_service) manda sobre la cortesía; solo grant => "Cortesía EVA". */
function addonForKey(addons: CoachAddonView[], key: ModuleKey): CoachAddonView | undefined {
  const live = addons.filter((a) => a.moduleKey === key && a.status !== 'cancelled')
  return live.find((a) => a.source === 'self_service') ?? live.find((a) => a.source === 'admin_grant')
}

export default function SubscriptionScreen() {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  const ws = useWorkspace()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<CoachBillingStatus | null>(null)
  const [failed, setFailed] = useState(false)
  // Se incrementa tras "Actualizar estado": re-lee el estado sin volver a pasar por el loader.
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let mounted = true
    getCoachBillingStatus()
      .then((d) => { if (mounted) { setData(d); setFailed(false); setLoading(false) } })
      .catch(() => { if (mounted) { setFailed(true); setLoading(false) } })
    return () => { mounted = false }
  }, [reloadKey])

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={styles.root} className="bg-surface-app">
        <AppBackground />
        <EvaLoaderScreen subtitle="Cargando tu plan…" />
      </SafeAreaView>
    )
  }

  // Coach gestionado por org/team: sin billing propio → candado (espejo de la web, que redirige).
  const managed = data?.managed === true || ws.isManaged
  if (managed) {
    const managedBy = data?.managed ? data.managedBy : ws.kind === 'enterprise' ? 'org' : 'team'
    const name = ws.workspaces.find((w) => w.isActive)?.label ?? null
    return (
      <SafeAreaView edges={['top']} style={styles.root} className="bg-surface-app">
        <AppBackground />
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        >
          <Header />
          <Card variant="default" padding={16} radius="card" style={styles.lockCard}>
            <LockKeyhole size={18} color={theme.mutedForeground} />
            <Text style={[TYPE.caption, styles.flex1]} className="text-muted">
              {managedBy === 'org'
                ? name ? `Tu plan lo gestiona ${name}.` : 'Tu plan lo gestiona tu organización.'
                : name ? `Tu plan lo gestiona el equipo ${name}.` : 'Tu plan lo gestiona tu equipo.'}
            </Text>
          </Card>
        </ScrollView>
      </SafeAreaView>
    )
  }

  if (failed || !data || data.managed) {
    return (
      <SafeAreaView edges={['top']} style={styles.root} className="bg-surface-app">
        <AppBackground />
        <EmptyState
          icon={LockKeyhole}
          title="No se pudo cargar tu plan"
          subtitle="Vuelve a intentarlo en unos segundos."
        />
      </SafeAreaView>
    )
  }

  const { coach, addons, activeClientCount } = data
  const tier = coach.subscriptionTier as SubscriptionTier
  const status = coach.subscriptionStatus
  const tierLabel = TIER_LABELS[tier] ?? coach.subscriptionTier
  const statusLabel = STATUS_LABELS[status] ?? status
  const statusTone = STATUS_TONE[status] ?? 'neutral'
  // Plan pago con acceso (espejo del hasActivePaidPlan web): decide "Incluido en tu plan".
  const hasPaidPlan = tier !== 'free' && (status === 'active' || status === 'trialing')

  const periodDate = coach.currentPeriodEnd ? shortDate(coach.currentPeriodEnd) : null
  const periodLabel =
    status === 'trialing' ? 'Prueba hasta'
      : status === 'canceled' || status === 'expired' ? 'Acceso hasta'
        : 'Renovación'

  // Cupo de alumnos = estado del plan, no venta (permitido dentro de la app).
  const clientsLabel =
    coach.maxClients != null
      ? `Alumnos activos · ${activeClientCount} de ${coach.maxClients}`
      : `Alumnos activos · ${activeClientCount}`

  // Aviso de estado (dunning / cancelado / vencido) — informativo, sin acción de cobro.
  const notice: { tone: BadgeTone; text: string } | null =
    status === 'past_due' || status === 'paused'
      ? { tone: 'warning', text: 'Tu último pago no se procesó y tu plan quedó en pausa.' }
      : status === 'pending_payment'
        ? { tone: 'warning', text: 'Tu pago está siendo procesado. Puede tardar unos minutos en confirmarse.' }
        : status === 'canceled'
          ? { tone: 'info', text: 'Tu plan sigue activo hasta el fin del período pagado.' }
          : status === 'expired'
            ? { tone: 'danger', text: 'Tu plan venció y quedaste con acceso limitado.' }
            : null

  return (
    <SafeAreaView edges={['top']} style={styles.root} className="bg-surface-app">
      <AppBackground />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Header />

        {/* Plan actual — tarjeta inversa: tier grande + vigencia + cupo de alumnos */}
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 420 }}
        >
          <Card variant="inverse" padding={20} radius="card">
            <View style={styles.planRow}>
              <View style={styles.flex1}>
                <Text style={TYPE.eyebrow} className="text-sport-400">Plan actual</Text>
                <Text
                  style={[textStyle('2xl', FONT.displayBlack, { lh: 'tight', ls: 'tighter' }), styles.mt4]}
                  className="text-on-dark"
                >
                  {tierLabel}
                </Text>
                <Text style={[TYPE.caption, styles.mt6]} className="text-on-dark-muted">
                  {tier === 'free'
                    ? 'Gratis para siempre'
                    : periodDate ? `${periodLabel} · ${periodDate}` : ''}
                </Text>
                <Text style={[TYPE.caption, styles.mt2]} className="text-on-dark-muted">
                  {clientsLabel}
                </Text>
              </View>
              <View style={styles.planRight}>
                <Badge label={statusLabel} tone={statusTone} dot />
              </View>
            </View>
          </Card>
        </MotiView>

        {/* Revalida entitlements: un cambio de plan hecho fuera del teléfono se refleja al toque. */}
        <RefreshPlanButton full onRefreshed={() => setReloadKey((k) => k + 1)} />

        {/* Aviso de estado (dunning / cancelado / vencido) */}
        {notice ? (
          <Card variant="default" padding={16} radius="card" style={styles.gap10}>
            <View style={styles.iconRow}>
              <Badge label={statusLabel} tone={notice.tone} />
            </View>
            <Text style={TYPE.caption} className="text-muted">{notice.text}</Text>
          </Card>
        ) : null}

        {/* Módulos incluidos — informativo (CEO 2026-07-17): vienen con el plan pago, sin compra/baja */}
        <View style={styles.section}>
          <Text style={[TYPE.eyebrow, styles.sectionTitle]} className="text-muted">Módulos incluidos</Text>
          <Card variant="default" padding="none" radius="card">
            {MODULE_CATALOG_KEYS.map((key, i) => {
              const row = addonForKey(addons, key)
              const b = addonBadge(row, hasPaidPlan)
              const Icon = ADDON_ICON[key]
              const BadgeIcon = b.icon
              const badgeIconColor =
                b.tone === 'success' ? theme.success : b.tone === 'info' ? '#0EA5E9' : theme.mutedForeground
              return (
                <View key={key}>
                  {i > 0 ? <View style={styles.divider} className="bg-subtle" /> : null}
                  <View style={styles.addonRow}>
                    <View
                      style={styles.addonIcon}
                      className={b.lit ? 'bg-sport-100 dark:bg-sport-100/20' : 'bg-surface-sunken'}
                    >
                      <Icon size={18} color={b.lit ? theme.primary : theme.mutedForeground} />
                    </View>
                    <View style={styles.flex1}>
                      <Text style={textStyle('sm', FONT.uiBold)} className="text-strong">{MODULE_CATALOG[key].label}</Text>
                      <View style={styles.mt6}>
                        <Badge
                          label={b.label}
                          tone={b.tone}
                          icon={BadgeIcon ? <BadgeIcon size={12} color={badgeIconColor} /> : undefined}
                        />
                      </View>
                    </View>
                  </View>
                </View>
              )
            })}
          </Card>
          <Text style={TYPE.caption} className="text-muted">
            {hasPaidPlan
              ? 'Vienen incluidos en tu plan, sin costo extra. Úsalos desde Herramientas.'
              : 'No están incluidos en tu plan actual.'}
          </Text>
        </View>

        <Text style={[TYPE.caption, styles.note]} className="text-muted">
          ¿Dudas con tu plan? Escríbenos a contacto@eva-app.cl
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

function Header() {
  return (
    <View style={styles.header}>
      <Text style={textStyle('3xl', FONT.displayBlack, { lh: 'tight', ls: 'tighter' })} className="text-strong">
        Mi plan
      </Text>
      <Text style={[TYPE.caption, styles.mt4]} className="text-muted">Tu plan y uso</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 4, gap: 14 },
  header: { paddingHorizontal: 4, paddingTop: 20, paddingBottom: 2 },
  flex1: { flex: 1, minWidth: 0 },
  mt2: { marginTop: 2 },
  mt4: { marginTop: 4 },
  mt6: { marginTop: 6 },
  gap10: { gap: 10 },
  planRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  planRight: { alignItems: 'flex-end', gap: 8 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  section: { gap: 8 },
  sectionTitle: { paddingHorizontal: 4 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
  addonRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  addonIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  lockCard: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  note: { textAlign: 'center', paddingHorizontal: 12 },
})
