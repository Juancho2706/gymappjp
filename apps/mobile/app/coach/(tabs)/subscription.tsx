import { useEffect, useState } from 'react'
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { MotiView } from 'moti'
import {
  Activity,
  Check,
  CreditCard,
  ExternalLink,
  Gift,
  HeartPulse,
  Lock,
  Receipt,
  Ruler,
  Utensils,
  type LucideIcon,
} from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Badge, Button, Card, EmptyState } from '../../../components'
import type { BadgeTone } from '../../../components/Badge'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { FONT, TYPE, textStyle } from '../../../lib/typography'
import { useWorkspace } from '../../../lib/workspace'
import {
  STATUS_LABELS,
  TIER_LABELS,
  getCoachBillingStatus,
  type CoachAddonView,
  type CoachBillingStatus,
} from '../../../lib/coach-subscription'
import {
  BILLING_CYCLE_CONFIG,
  getTierCapabilities,
  type SubscriptionTier,
} from '@eva/tiers'
import { MODULE_CATALOG, MODULE_CATALOG_KEYS, type ModuleKey } from '@eva/module-catalog'

// Acciones de cobro = WEB-ONLY (money-safety): la app abre el navegador externo a las URLs reales.
// Host canónico www (mismo que api.ts) → la sesión web del coach ya vive ahí (evita el hop apex→www).
const WEB = 'https://www.eva-app.cl'
const SUB_URL = `${WEB}/coach/subscription`
const CARD_URL = `${WEB}/coach/subscription/update-card`
const ADDONS_URL = `${WEB}/coach/subscription#addons`
const REACTIVATE_URL = `${WEB}/coach/reactivate`

// --text-on-dark (ink-50): literal DS neutral para íconos sobre superficie inversa (mismo que Button).
const ON_DARK = '#F4F6F8'

const ADDON_ICON: Record<ModuleKey, LucideIcon> = {
  cardio: HeartPulse,
  movement_assessment: Activity,
  body_composition: Ruler,
  nutrition_exchanges: Utensils,
}

// Marca legible del payment_method_id de MP ('debvisa' es id de máquina, no marca).
const MP_BRAND_LABEL: Record<string, string> = {
  visa: 'Visa', debvisa: 'Visa débito',
  master: 'Mastercard', debmaster: 'Mastercard débito',
  amex: 'American Express', diners: 'Diners',
  maestro: 'Maestro', magna: 'Magna', naranja: 'Naranja', cabal: 'Cabal',
}
function mpBrandLabel(pmid: string | null | undefined): string {
  if (!pmid) return ''
  return MP_BRAND_LABEL[pmid.toLowerCase()] ?? pmid.charAt(0).toUpperCase() + pmid.slice(1)
}

function openUrl(url: string) {
  Linking.openURL(url).catch(() => {})
}

/** CLP determinista ($9.990) — sin depender de Intl en Hermes. */
function clp(n: number): string {
  return '$' + Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}
function longDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
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

/** Estado por add-on (espejo EXACTO de CoachAddonView del web §F5.1). */
function addonBadge(
  key: ModuleKey,
  row: CoachAddonView | undefined,
  canUseNutrition: boolean,
): { label: string; tone: BadgeTone; icon: LucideIcon | null; lit: boolean } {
  const isCourtesy = row?.source === 'admin_grant'
  const isActive = row?.status === 'active' && row.source === 'self_service'
  const isCancelPendingCharged =
    row?.status === 'cancel_pending' && row.source === 'self_service' && row.firstChargedAt !== null
  const isCommitted =
    row?.status === 'cancel_pending' && row.source === 'self_service' && row.firstChargedAt === null
  const requiresNutritionTier = key === 'nutrition_exchanges' && !canUseNutrition

  if (isCourtesy) return { label: 'Activo sin costo', tone: 'info', icon: Gift, lit: true }
  if (isActive) return { label: 'Activo', tone: 'success', icon: Check, lit: true }
  if (isCancelPendingCharged)
    return {
      label: `Se desactiva el ${row?.expiresAt ? longDate(row.expiresAt) : 'fin del período'}`,
      tone: 'warning',
      icon: null,
      lit: false,
    }
  if (isCommitted) return { label: 'Baja programada', tone: 'warning', icon: null, lit: false }
  if (requiresNutritionTier) return { label: 'Requiere plan Pro+', tone: 'neutral', icon: Lock, lit: false }
  return { label: `${clp(MODULE_CATALOG[key].priceClp)}/mes`, tone: 'neutral', icon: null, lit: false }
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

  useEffect(() => {
    let mounted = true
    getCoachBillingStatus()
      .then((d) => { if (mounted) { setData(d); setLoading(false) } })
      .catch(() => { if (mounted) { setFailed(true); setLoading(false) } })
    return () => { mounted = false }
  }, [])

  if (loading) {
    return (
      <SafeAreaView edges={[]} style={styles.root} className="bg-surface-app">
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
      <SafeAreaView edges={[]} style={styles.root} className="bg-surface-app">
        <AppBackground />
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
        >
          <Header />
          <Card variant="default" padding={16} radius="card" style={styles.lockCard}>
            <Lock size={18} color={theme.mutedForeground} />
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
      <SafeAreaView edges={[]} style={styles.root} className="bg-surface-app">
        <AppBackground />
        <EmptyState
          icon={Lock}
          title="No se pudo cargar tu plan"
          subtitle="Vuelve a intentarlo en unos segundos."
        />
      </SafeAreaView>
    )
  }

  const { coach, addons, events, billing, activeCoupon, changeCardEnabled } = data
  const tier = coach.subscriptionTier as SubscriptionTier
  const status = coach.subscriptionStatus
  const tierLabel = TIER_LABELS[tier] ?? coach.subscriptionTier
  const statusLabel = STATUS_LABELS[status] ?? status
  const statusTone = STATUS_TONE[status] ?? 'neutral'
  const canUseNutrition = getTierCapabilities(tier).canUseNutrition
  const cycleLabel = BILLING_CYCLE_CONFIG[coach.billingCycle]?.label.toLowerCase() ?? ''

  const isActive = status === 'active'
  const total = billing.totalClp
  const periodDate = coach.currentPeriodEnd ? shortDate(coach.currentPeriodEnd) : null
  const periodLabel =
    status === 'trialing' ? 'Prueba hasta'
      : status === 'canceled' || status === 'expired' ? 'Acceso hasta'
        : 'Próximo cobro'

  // Aviso de estado (dunning / cancelado / vencido) — link-out a la acción web real.
  const notice: { tone: BadgeTone; text: string; cta: string; url: string } | null =
    status === 'past_due' || status === 'paused'
      ? { tone: 'warning', text: 'Tu último pago no se procesó. Actualiza tu medio de pago para no perder el acceso.', cta: 'Actualizar pago en la web', url: CARD_URL }
      : status === 'pending_payment'
        ? { tone: 'warning', text: 'Tu pago está siendo procesado. Puede tardar unos minutos en confirmarse.', cta: 'Ver en la web', url: SUB_URL }
        : status === 'canceled'
          ? { tone: 'info', text: 'Tu plan sigue activo hasta el fin del período pagado. Puedes reactivarlo cuando quieras.', cta: 'Reactivar en la web', url: REACTIVATE_URL }
          : status === 'expired'
            ? { tone: 'danger', text: 'Tu plan venció. Reactívalo para recuperar el acceso completo.', cta: 'Reactivar en la web', url: REACTIVATE_URL }
            : null

  const showCard =
    changeCardEnabled && ['active', 'trialing', 'paused', 'past_due'].includes(status)

  return (
    <SafeAreaView edges={[]} style={styles.root} className="bg-surface-app">
      <AppBackground />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Header />

        {/* Plan actual — tarjeta inversa: tier grande + total compuesto + desglose + tarjeta */}
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
              </View>
              <View style={styles.planRight}>
                <Badge label={statusLabel} tone={statusTone} dot />
                {total > 0 ? (
                  <View style={styles.totalCol}>
                    <Text style={[textStyle('2xl', FONT.mono, { ls: 'tight' }), styles.tnum]} className="text-sport-400">
                      {clp(total)}
                    </Text>
                    {cycleLabel ? (
                      <Text style={TYPE.caption} className="text-on-dark-muted">{`/ ${cycleLabel}`}</Text>
                    ) : null}
                  </View>
                ) : null}
              </View>
            </View>

            {/* Desglose (base + módulos + cupón) — solo activo. La UI NUNCA calcula precios. */}
            {isActive ? (
              <View style={styles.breakdown}>
                <Row label={`Plan ${tierLabel}`} value={clp(billing.baseClp)} />
                {billing.addonsClp > 0 ? <Row label="Módulos" value={clp(billing.addonsClp)} /> : null}
                {activeCoupon && billing.discountClp > 0 ? (
                  <Row
                    label={`Cupón${activeCoupon.code ? ` ${activeCoupon.code}` : ''}`}
                    value={`−${clp(billing.discountClp)}`}
                    positive
                  />
                ) : null}
              </View>
            ) : null}

            {/* Tarjeta en archivo (brand ···· last4) + cambiar (link-out) */}
            {showCard ? (
              <View style={styles.cardRow}>
                <CreditCard size={18} color={ON_DARK} />
                <Text style={[TYPE.caption, styles.flex1]} className="text-on-dark" numberOfLines={1}>
                  {coach.cardLast4
                    ? `${coach.cardBrand ? mpBrandLabel(coach.cardBrand) + ' ' : ''}···· ${coach.cardLast4}`
                    : 'Sin tarjeta registrada'}
                </Text>
                <Text
                  onPress={() => openUrl(CARD_URL)}
                  style={[TYPE.caption, styles.cardCta]}
                  className="text-sport-400"
                >
                  Cambiar
                </Text>
              </View>
            ) : null}
          </Card>
        </MotiView>

        {/* Aviso de estado (dunning / cancelado / vencido) */}
        {notice ? (
          <Card variant="default" padding={16} radius="card" style={styles.gap10}>
            <View style={styles.iconRow}>
              <Badge label={statusLabel} tone={notice.tone} />
            </View>
            <Text style={TYPE.caption} className="text-muted">{notice.text}</Text>
            <Button
              label={notice.cta}
              variant="secondary"
              leftIcon={ExternalLink}
              onPress={() => openUrl(notice.url)}
              full
            />
          </Card>
        ) : null}

        {/* Módulos add-on — display de estados (incl. Cortesía EVA); compra/baja = web-only */}
        <View style={styles.section}>
          <Text style={[TYPE.eyebrow, styles.sectionTitle]} className="text-muted">Módulos add-on</Text>
          <Card variant="default" padding="none" radius="card">
            {MODULE_CATALOG_KEYS.map((key, i) => {
              const row = addonForKey(addons, key)
              const b = addonBadge(key, row, canUseNutrition)
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
          <Button
            label="Gestionar módulos en la web"
            variant="ghost"
            leftIcon={ExternalLink}
            onPress={() => openUrl(ADDONS_URL)}
            full
          />
        </View>

        {/* Historial de pagos */}
        <View style={styles.section}>
          <Text style={[TYPE.eyebrow, styles.sectionTitle]} className="text-muted">Historial de pagos</Text>
          {events.length === 0 ? (
            <Card variant="default" padding={16} radius="card">
              <Text style={TYPE.caption} className="text-muted">
                Aún no hay movimientos de suscripción registrados.
              </Text>
            </Card>
          ) : (
            <Card variant="default" padding="none" radius="card">
              {events.map((e, i) => (
                <View key={e.id}>
                  {i > 0 ? <View style={styles.divider} className="bg-subtle" /> : null}
                  <View style={styles.eventRow}>
                    <View style={styles.eventIcon} className="bg-success-100 dark:bg-success-100/[0.18]">
                      <Receipt size={15} color={theme.success} />
                    </View>
                    <View style={styles.flex1}>
                      <Text style={TYPE.caption} className="text-strong">
                        {shortDate(e.createdAt)}
                        {e.providerStatus ? <Text className="text-muted">{` · ${e.providerStatus}`}</Text> : null}
                      </Text>
                      <Text style={[textStyle('2xs', FONT.mono), styles.mt2]} className="text-muted">
                        {e.providerCheckoutId ? `${e.provider} · ${e.providerCheckoutId}` : e.provider}
                      </Text>
                    </View>
                    <Text style={[textStyle('sm', FONT.mono), styles.tnum]} className="text-strong">
                      {e.amountClp != null ? clp(e.amountClp) : '—'}
                    </Text>
                  </View>
                </View>
              ))}
            </Card>
          )}
        </View>

        {/* Gestión (cobros/cambios = web-only por seguridad) */}
        <Button
          label="Gestionar plan en la web"
          variant="primary"
          leftIcon={ExternalLink}
          onPress={() => openUrl(SUB_URL)}
          full
        />
        <Text style={[TYPE.caption, styles.note]} className="text-muted">
          Los pagos y cambios de plan se gestionan desde la web por seguridad.
        </Text>
      </ScrollView>
    </SafeAreaView>
  )
}

function Header() {
  return (
    <View style={styles.header}>
      <Text style={textStyle('3xl', FONT.displayBlack, { lh: 'tight', ls: 'tighter' })} className="text-strong">
        Suscripción
      </Text>
      <Text style={[TYPE.caption, styles.mt4]} className="text-muted">Tu plan y uso</Text>
    </View>
  )
}

// Verde legible sobre la superficie inversa (paridad con el emerald-400 del desglose web).
const ON_DARK_POSITIVE = '#34D399'

function Row({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <View style={styles.breakdownRow}>
      <Text style={TYPE.caption} className="text-on-dark-muted">{label}</Text>
      {positive ? (
        <Text style={[textStyle('sm', FONT.mono), styles.tnum, { color: ON_DARK_POSITIVE }]}>{value}</Text>
      ) : (
        <Text style={[textStyle('sm', FONT.mono), styles.tnum]} className="text-on-dark">{value}</Text>
      )}
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
  totalCol: { alignItems: 'flex-end' },
  tnum: { fontVariant: ['tabular-nums'] },
  breakdown: { marginTop: 14, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.14)', gap: 6 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.06)' },
  cardCta: { fontFamily: FONT.uiBold },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  section: { gap: 8 },
  sectionTitle: { paddingHorizontal: 4 },
  divider: { height: StyleSheet.hairlineWidth, marginHorizontal: 14 },
  addonRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  addonIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  eventIcon: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  lockCard: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  note: { textAlign: 'center', paddingHorizontal: 12 },
})
