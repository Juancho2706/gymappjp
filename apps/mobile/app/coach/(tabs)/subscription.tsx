import { useEffect, useState } from 'react'
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { MotiView } from 'moti'
import { ExternalLink, Lock, Users } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Badge, Button, Card, EmptyState, ProgressBar } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { FONT, TYPE, textStyle } from '../../../lib/typography'
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
      <SafeAreaView edges={[]} style={styles.root} className="bg-surface-app">
        <AppBackground />
        <EvaLoaderScreen subtitle="Cargando tu plan…" />
      </SafeAreaView>
    )
  }

  if (!data) {
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

  const { profile, orgManaged, orgName, clientCount } = data
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
    <SafeAreaView edges={[]} style={styles.root} className="bg-surface-app">
      <AppBackground />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Encabezado (DS: Archivo display, NO Montserrat) */}
        <View style={styles.header}>
          <Text style={textStyle('3xl', FONT.displayBlack, { lh: 'tight', ls: 'tighter' })} className="text-strong">
            Suscripción
          </Text>
          <Text style={[TYPE.caption, styles.headerSub]} className="text-muted">
            Tu plan y uso
          </Text>
        </View>

        {/* Plan actual — tarjeta inversa (paridad web: eyebrow sport + tier grande + fecha inline) */}
        <MotiView
          from={{ opacity: 0, translateY: 12 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 420 }}
        >
          <Card variant="inverse" padding={20} radius="card">
            <View style={styles.planRow}>
              <View style={styles.planTextCol}>
                <Text style={TYPE.eyebrow} className="text-sport-400">Plan actual</Text>
                <Text
                  style={[textStyle('2xl', FONT.displayBlack, { lh: 'tight', ls: 'tighter' }), styles.tier]}
                  className="text-on-dark"
                >
                  {tierLabel}
                </Text>
                <Text style={[TYPE.caption, styles.planSub]} className="text-on-dark-muted">
                  {`${renewLabel} · ${formatDate(renewDate)}`}
                </Text>
              </View>
              <Badge label={statusLabel} tone={statusActive ? 'success' : 'muted'} />
            </View>
          </Card>
        </MotiView>

        {/* Alumnos — uso vs cupo */}
        <Card variant="default" padding={18} radius="card" style={styles.gap12}>
          <View style={styles.iconRow}>
            <Users size={16} color={theme.primary} />
            <Text style={TYPE.eyebrow} className="text-muted">Alumnos</Text>
          </View>
          <Text style={[textStyle('2xl', FONT.mono, { ls: 'tight' }), styles.tnum]} className="text-strong">
            {clientCount}{max > 0 ? ` / ${max}` : ''}
          </Text>
          {max > 0 ? (
            <ProgressBar value={usage} />
          ) : (
            <Text style={TYPE.caption} className="text-muted">Alumnos ilimitados</Text>
          )}
        </Card>

        {/* Gestión (cobros/cambios = web-only por seguridad) */}
        {orgManaged ? (
          <Card variant="default" padding={14} radius="lg" style={styles.lockCard}>
            <Lock size={18} color={theme.mutedForeground} />
            <Text style={[TYPE.caption, styles.lockText]} className="text-muted">
              {orgName ? `Tu plan lo gestiona ${orgName}.` : 'Tu plan lo gestiona tu organización.'}
            </Text>
          </Card>
        ) : (
          <>
            <Button
              label="Gestionar plan en la web"
              variant="primary"
              leftIcon={ExternalLink}
              onPress={() => Linking.openURL(MANAGE_URL).catch(() => {})}
              full
            />
            <Text style={[TYPE.caption, styles.note]} className="text-muted">
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
  header: { paddingHorizontal: 4, paddingTop: 20, paddingBottom: 2 },
  headerSub: { marginTop: 4 },
  gap12: { gap: 12 },
  planRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  planTextCol: { flex: 1, minWidth: 0 },
  tier: { marginTop: 4 },
  planSub: { marginTop: 6 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  tnum: { fontVariant: ['tabular-nums'] },
  lockCard: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lockText: { flex: 1 },
  note: { textAlign: 'center', paddingHorizontal: 12 },
})
