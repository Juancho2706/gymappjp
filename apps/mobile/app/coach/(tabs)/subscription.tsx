import { useEffect, useState } from 'react'
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { CalendarClock, CreditCard, ExternalLink, Gift, Layers, Lock, Receipt, Users } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Badge, Button, ProgressBar, ScreenHeader } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import {
  MODULE_LABELS,
  STATUS_LABELS,
  TIER_LABELS,
  getCoachSubscriptionOverview,
  type CoachSubscriptionOverview,
} from '../../../lib/coach-subscription'

const MANAGE_URL = 'https://eva-app.cl/coach/subscription'

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
}

function formatClp(n: number | null | undefined): string {
  if (n == null) return '—'
  return '$' + Math.round(n).toLocaleString('es-CL')
}

const EVENT_STATUS_LABELS: Record<string, string> = {
  approved: 'Aprobado',
  authorized: 'Autorizado',
  pending: 'Pendiente',
  rejected: 'Rechazado',
  cancelled: 'Cancelado',
  refunded: 'Reembolsado',
}

export default function SubscriptionScreen() {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<CoachSubscriptionOverview | null>(null)

  useEffect(() => {
    getCoachSubscriptionOverview().then((d) => { setData(d); setLoading(false) })
  }, [])

  if (loading) {
    return (
      <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: theme.background }]}>
        <AppBackground />
        <ScreenHeader title="Suscripción" subtitle="Cargando..." />
        <EvaLoaderScreen subtitle="Cargando tu plan…" />
      </SafeAreaView>
    )
  }

  if (!data) {
    return (
      <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: theme.background }]}>
        <AppBackground />
        <ScreenHeader title="Suscripción" />
        <Text style={[styles.empty, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>No se pudo cargar tu plan.</Text>
      </SafeAreaView>
    )
  }

  const { profile, orgManaged, orgName, clientCount, card, addons, events, billing } = data
  const tierLabel = TIER_LABELS[profile.subscriptionTier] ?? profile.subscriptionTier
  const statusLabel = STATUS_LABELS[profile.subscriptionStatus] ?? profile.subscriptionStatus
  const statusActive = profile.subscriptionStatus === 'active' || profile.subscriptionStatus === 'trialing'
  const max = profile.maxClients ?? 0
  const usage = max > 0 ? clientCount / max : 0
  // SU-F1: etiquetar cada estado (antes "canceled" mostraba "Próxima renovación" engañoso).
  const renewLabel =
    profile.subscriptionStatus === 'trialing' ? 'Prueba hasta'
      : profile.subscriptionStatus === 'canceled' ? 'Acceso hasta'
        : 'Próxima renovación'
  const renewDate = profile.subscriptionStatus === 'trialing' ? profile.trialEndsAt : profile.currentPeriodEnd

  return (
    <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: theme.background }]}>
      <AppBackground />
      <ScreenHeader title="Suscripción" subtitle="Tu plan y uso" />

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]} showsVerticalScrollIndicator={false}>
        {/* Plan */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
          <Text style={[styles.cardLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>PLAN ACTUAL</Text>
          <View style={styles.planRow}>
            <Text style={[styles.planTier, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>{tierLabel}</Text>
            <Badge label={statusLabel} tone={statusActive ? 'success' : 'muted'} />
          </View>
        </View>

        {/* Usage */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl, gap: 12 }]}>
          <View style={styles.iconRow}>
            <Users size={16} color={theme.primary} />
            <Text style={[styles.cardLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>ALUMNOS</Text>
          </View>
          <Text style={[styles.usageBig, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
            {clientCount}{max > 0 ? ` / ${max}` : ''}
          </Text>
          {max > 0 ? <ProgressBar value={usage} /> : (
            <Text style={[styles.usageSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Alumnos ilimitados</Text>
          )}
        </View>

        {/* Renewal */}
        <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl, gap: 8 }]}>
          <View style={styles.iconRow}>
            <CalendarClock size={16} color={theme.primary} />
            <Text style={[styles.cardLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{renewLabel.toUpperCase()}</Text>
          </View>
          <Text style={[styles.usageBig, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{formatDate(renewDate)}</Text>
        </View>

        {/* Facturación (total compuesto congelado del último cobro) */}
        {billing ? (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl, gap: 10 }]}>
            <View style={styles.iconRow}>
              <Receipt size={16} color={theme.primary} />
              <Text style={[styles.cardLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>FACTURACIÓN</Text>
            </View>
            <BreakdownRow theme={theme} label="Plan base" value={formatClp(billing.baseClp)} />
            {billing.addonsClp > 0 ? <BreakdownRow theme={theme} label="Módulos" value={formatClp(billing.addonsClp)} /> : null}
            {billing.discountClp && billing.discountClp > 0 ? (
              <BreakdownRow theme={theme} label={`Descuento${billing.couponCode ? ` (${billing.couponCode})` : ''}`} value={`- ${formatClp(billing.discountClp)}`} />
            ) : null}
            <View style={[styles.breakdownDivider, { backgroundColor: theme.border }]} />
            <BreakdownRow theme={theme} label="Total" value={formatClp(billing.totalClp)} strong />
          </View>
        ) : null}

        {/* Add-ons / módulos activos */}
        {addons.length > 0 ? (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl, gap: 12 }]}>
            <View style={styles.iconRow}>
              <Layers size={16} color={theme.primary} />
              <Text style={[styles.cardLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>MÓDULOS ACTIVOS</Text>
            </View>
            {addons.map((a) => {
              const courtesy = a.source === 'admin_grant'
              return (
                <View key={a.moduleKey} style={styles.addonRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.addonName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
                      {MODULE_LABELS[a.moduleKey] ?? a.moduleKey}
                    </Text>
                    <Text style={[styles.addonMeta, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                      {a.status === 'cancel_pending' ? 'Se desactiva al fin del ciclo' : courtesy ? 'Cortesía' : `${formatClp(a.priceClp)} / mes`}
                    </Text>
                  </View>
                  {courtesy ? (
                    <View style={[styles.courtesyBadge, { borderColor: theme.primary }]}>
                      <Gift size={11} color={theme.primary} />
                      <Text style={[styles.courtesyText, { color: theme.primary, fontFamily: 'Inter_600SemiBold' }]}>Cortesía EVA</Text>
                    </View>
                  ) : (
                    <Badge label={a.status === 'cancel_pending' ? 'Por vencer' : 'Activo'} tone={a.status === 'cancel_pending' ? 'muted' : 'success'} />
                  )}
                </View>
              )
            })}
          </View>
        ) : null}

        {/* Tarjeta en archivo */}
        {card.last4 ? (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl, gap: 8 }]}>
            <View style={styles.iconRow}>
              <CreditCard size={16} color={theme.primary} />
              <Text style={[styles.cardLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>TARJETA</Text>
            </View>
            <Text style={[styles.usageBig, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
              {card.brand ? `${card.brand} ` : ''}•••• {card.last4}
            </Text>
          </View>
        ) : null}

        {/* Historial de pagos */}
        {events.length > 0 ? (
          <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl, gap: 10 }]}>
            <View style={styles.iconRow}>
              <Receipt size={16} color={theme.primary} />
              <Text style={[styles.cardLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>HISTORIAL DE PAGOS</Text>
            </View>
            {events.map((e) => (
              <View key={e.id} style={styles.eventRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.eventDate, { color: theme.foreground, fontFamily: theme.fontSans }]}>{formatDate(e.createdAt)}</Text>
                  <Text style={[styles.eventStatus, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                    {(e.providerStatus && (EVENT_STATUS_LABELS[e.providerStatus] ?? e.providerStatus)) || e.provider || '—'}
                  </Text>
                </View>
                <Text style={[styles.eventAmount, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{formatClp(e.amountClp)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {orgManaged ? (
          <View style={[styles.lockCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
            <Lock size={18} color={theme.mutedForeground} />
            <Text style={[styles.lockText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              {orgName ? `Tu plan lo gestiona ${orgName}.` : 'Tu plan lo gestiona tu organización.'}
            </Text>
          </View>
        ) : (
          <>
            <Button label="Gestionar plan en la web" leftIcon={ExternalLink} onPress={() => Linking.openURL(MANAGE_URL).catch(() => {})} full />
            <Text style={[styles.note, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              Los pagos y cambios de plan se gestionan desde la web por seguridad.
            </Text>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function BreakdownRow({ theme, label, value, strong }: { theme: any; label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.breakdownRow}>
      <Text style={[styles.breakdownLabel, { color: strong ? theme.foreground : theme.mutedForeground, fontFamily: strong ? 'Montserrat_700Bold' : theme.fontSans }]}>{label}</Text>
      <Text style={[styles.breakdownValue, { color: theme.foreground, fontFamily: strong ? 'Montserrat_800ExtraBold' : 'Montserrat_700Bold', fontSize: strong ? 18 : 14 }]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 4, gap: 14 },
  card: { padding: 18, borderWidth: 1 },
  cardLabel: { fontSize: 11, letterSpacing: 1, textTransform: 'uppercase' },
  planRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  planTier: { fontSize: 26, letterSpacing: -0.5 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  usageBig: { fontSize: 20, letterSpacing: -0.3 },
  usageSub: { fontSize: 13 },
  lockCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderWidth: 1 },
  lockText: { fontSize: 13, flex: 1, lineHeight: 18 },
  note: { fontSize: 12, lineHeight: 17, textAlign: 'center', paddingHorizontal: 12 },
  empty: { textAlign: 'center', marginTop: 40, fontSize: 14 },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  breakdownLabel: { fontSize: 13 },
  breakdownValue: { letterSpacing: -0.3 },
  breakdownDivider: { height: 1, marginVertical: 2 },
  addonRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addonName: { fontSize: 14 },
  addonMeta: { fontSize: 12, marginTop: 1 },
  courtesyBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  courtesyText: { fontSize: 11 },
  eventRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  eventDate: { fontSize: 13 },
  eventStatus: { fontSize: 11, marginTop: 1 },
  eventAmount: { fontSize: 14, letterSpacing: -0.3 },
})
