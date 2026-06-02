import { useEffect, useState } from 'react'
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { CalendarClock, ExternalLink, Lock, Users } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Badge, Button, ProgressBar, ScreenHeader } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import {
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
        <ScreenHeader title="Suscripción" subtitle="Cargando..." />
        <EvaLoaderScreen subtitle="Cargando tu plan…" />
      </SafeAreaView>
    )
  }

  if (!data) {
    return (
      <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: theme.background }]}>
        <ScreenHeader title="Suscripción" />
        <Text style={[styles.empty, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>No se pudo cargar tu plan.</Text>
      </SafeAreaView>
    )
  }

  const { profile, orgManaged, orgName, clientCount } = data
  const tierLabel = TIER_LABELS[profile.subscriptionTier] ?? profile.subscriptionTier
  const statusLabel = STATUS_LABELS[profile.subscriptionStatus] ?? profile.subscriptionStatus
  const statusActive = profile.subscriptionStatus === 'active' || profile.subscriptionStatus === 'trialing'
  const max = profile.maxClients ?? 0
  const usage = max > 0 ? clientCount / max : 0
  const renewLabel = profile.subscriptionStatus === 'trialing' ? 'Prueba hasta' : 'Próxima renovación'
  const renewDate = profile.subscriptionStatus === 'trialing' ? profile.trialEndsAt : profile.currentPeriodEnd

  return (
    <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: theme.background }]}>
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
})
