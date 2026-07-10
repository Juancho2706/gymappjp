import { useEffect, useState } from 'react'
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { MotiView } from 'moti'
import { AlertTriangle, ExternalLink, Users } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { Badge, Button, Card } from '../../components'
import { EvaLoaderScreen } from '../../components/EvaLoader'
import { AppBackground } from '../../components/AppBackground'
import { FONT, TYPE, textStyle } from '../../lib/typography'
import { signOutAndCleanup } from '../../lib/auth-actions'
import { useWorkspace } from '../../lib/workspace'
import {
  STATUS_LABELS,
  TIER_LABELS,
  getCoachSubscriptionOverview,
  type CoachSubscriptionOverview,
} from '../../lib/coach-subscription'

// MONEY-SAFETY: la reactivacion (pago) es SIEMPRE link-out al navegador — jamas se procesa in-app.
// Mismo host que el resto del billing mobile (subscription tab): apex 307 -> www, inocuo en browser.
const REACTIVATE_URL = 'https://eva-app.cl/coach/reactivate'

// DS warning-700 (status token, NO white-label): el theme JS no expone `warning`, se resuelve por
// scheme igual que en `alumno/suspended.tsx` (var(--warning-700) flipea en dark).
const WARNING_700 = { light: '#8F5A05', dark: '#FFD489' } as const

/** Copy del titular segun el estado crudo (paridad con los estados que fuerzan el gate). */
function headlineFor(status: string): { title: string; body: string } {
  switch (status) {
    case 'canceled':
      return { title: 'Tu plan está cancelado', body: 'Tu acceso al panel terminó. Reactiva un plan para volver a gestionar tu marca, tus alumnos y tus rutinas.' }
    case 'paused':
      return { title: 'Tu plan está pausado', body: 'Tu suscripción quedó en pausa. Reactívala para recuperar el acceso completo al panel.' }
    case 'past_due':
      return { title: 'Tu pago quedó pendiente', body: 'No pudimos completar el cobro de tu suscripción. Regulariza el pago para mantener el acceso.' }
    case 'expired':
      return { title: 'Tu plan venció', body: 'Tu suscripción venció. Elige un plan para recuperar el acceso al panel.' }
    default:
      return { title: 'Reactiva tu plan', body: 'Tu suscripción está inactiva. Elige un plan para recuperar el acceso al panel.' }
  }
}

/**
 * E7-12 — muro de reactivación del coach. Aterrizás acá cuando el guard de acceso (tabs layout)
 * detecta que perdiste acceso EFECTIVO (`resolveReactivateRequired`). Es un DISPLAY: mensaje según el
 * estado (`useWorkspace().subscriptionState`) + resumen del plan anterior + botón que abre la
 * reactivación en la web (link-out, money-safety). Espejo mobile de /coach/reactivate.
 */
export default function CoachReactivateScreen() {
  const { theme, resolvedScheme } = useTheme()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { subscriptionState } = useWorkspace()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<CoachSubscriptionOverview | null>(null)

  useEffect(() => {
    let mounted = true
    getCoachSubscriptionOverview()
      .then((d) => { if (mounted) { setData(d); setLoading(false) } })
      .catch(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  async function handleLogout() {
    await signOutAndCleanup()
    router.replace('/')
  }

  if (loading) {
    return (
      <SafeAreaView edges={[]} style={styles.root} className="bg-surface-app">
        <AppBackground />
        <EvaLoaderScreen subtitle="Cargando tu plan…" />
      </SafeAreaView>
    )
  }

  // El estado del overview es la fuente rica; el del workspace es el gate. Priorizamos el crudo real.
  const status = data?.profile.subscriptionStatus || subscriptionState
  const { title, body } = headlineFor(status)
  const tierLabel = data ? (TIER_LABELS[data.profile.subscriptionTier] ?? data.profile.subscriptionTier) : null
  const statusLabel = STATUS_LABELS[status] ?? status
  const clientCount = data?.clientCount ?? 0

  return (
    <SafeAreaView edges={['top']} style={styles.root} className="bg-surface-app" testID="coach-reactivate">
      <AppBackground />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <MotiView from={{ opacity: 0, translateY: 12 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 420 }}>
          <View className="bg-warning-100" style={styles.iconWrap}>
            <AlertTriangle size={30} color={WARNING_700[resolvedScheme]} strokeWidth={1.9} />
          </View>

          <Text style={textStyle('3xl', FONT.displayBlack, { lh: 'tight', ls: 'tighter' })} className="text-strong">
            {title}
          </Text>
          <Text style={[TYPE.body, styles.body]} className="text-muted">
            {body}
          </Text>
        </MotiView>

        {/* Resumen del plan anterior */}
        <Card variant="inverse" padding={20} radius="card" style={styles.gap4}>
          <View style={styles.planRow}>
            <View style={styles.planTextCol}>
              <Text style={TYPE.eyebrow} className="text-sport-400">Plan anterior</Text>
              <Text
                style={[textStyle('2xl', FONT.displayBlack, { lh: 'tight', ls: 'tighter' }), styles.tier]}
                className="text-on-dark"
              >
                {tierLabel ?? '—'}
              </Text>
            </View>
            <Badge label={statusLabel} tone="warning" />
          </View>
        </Card>

        <Card variant="default" padding={16} radius="card" style={styles.iconRow}>
          <Users size={16} color={theme.primary} />
          <Text style={TYPE.caption} className="text-muted">
            {clientCount > 0
              ? `Tus ${clientCount} alumno${clientCount !== 1 ? 's' : ''} quedan en pausa hasta que reactives.`
              : 'Sin un plan activo no puedes gestionar alumnos ni rutinas.'}
          </Text>
        </Card>

        <View style={styles.actions}>
          <Button
            testID="reactivate-cta"
            label="Reactivar plan en la web"
            variant="primary"
            leftIcon={ExternalLink}
            onPress={() => Linking.openURL(REACTIVATE_URL).catch(() => {})}
            full
            size="lg"
          />
          <Text style={[TYPE.caption, styles.note]} className="text-muted">
            Los pagos y cambios de plan se gestionan desde la web por seguridad.
          </Text>
          <Button testID="reactivate-logout" label="Cerrar sesión" variant="ghost" onPress={handleLogout} full />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 24, gap: 16 },
  iconWrap: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  body: { marginTop: 10, lineHeight: 23 },
  gap4: { marginTop: 4 },
  planRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  planTextCol: { flex: 1, minWidth: 0 },
  tier: { marginTop: 4 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actions: { marginTop: 8, gap: 12 },
  note: { textAlign: 'center', paddingHorizontal: 12 },
})
