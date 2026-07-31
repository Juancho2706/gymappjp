import { useCallback, useEffect, useState } from 'react'
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { MotiView } from 'moti'
import { AlertTriangle, ExternalLink, Sparkles, Users } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Badge, Button, Card } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { ReactivateArchivePanel } from '../../../components/coach/ReactivateArchivePanel'
import { useCoachTabbarScroll } from '../../../components/coach/CoachTabbarScroll'
import { FONT, TYPE, textStyle } from '../../../lib/typography'
import { signOutAndCleanup } from '../../../lib/auth-actions'
import { useWorkspace } from '../../../lib/workspace'
import { refreshCoachAccess } from '../../../lib/coach-access'
import {
  FREE_CLIENT_LIMIT,
  STATUS_LABELS,
  TIER_LABELS,
  activateFreePlan,
  getCoachSubscriptionOverview,
  type CoachSubscriptionOverview,
} from '../../../lib/coach-subscription'

// MONEY-SAFETY: la reactivacion (pago) es SIEMPRE link-out al navegador — jamas se procesa in-app.
// Mismo host que el resto del billing mobile (subscription tab): apex 307 -> www, inocuo en browser.
// La bajada a Free NO pasa por aca: no cobra nada, asi que vive in-app (ver `handleActivateFree`).
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
 * E7-12 — muro de reactivación del coach. Aterrizás acá cuando el guard de acceso
 * (`app/coach/_layout.tsx`) detecta que perdiste acceso EFECTIVO (`resolveReactivateRequired`).
 *
 * Ofrece las DOS salidas de la web, no solo una:
 *  - PAGAR: link-out al navegador (money-safety, sin excepciones).
 *  - VOLVER A FREE: in-app. No cobra nada — es la salida gratuita. Antes solo existía en web, así
 *    que un coach vencido con teléfono y sin computador quedaba encerrado: o pagaba, o nada.
 *    Si está sobre el cupo de Free, el panel de archivado lo deja bajar a ≤ FREE_CLIENT_LIMIT
 *    primero (el endpoint revalida el cupo server-side de todos modos).
 */
export default function CoachReactivateScreen() {
  const { theme, resolvedScheme } = useTheme()
  const { onScroll } = useCoachTabbarScroll()
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const workspace = useWorkspace()
  const { subscriptionState } = workspace
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<CoachSubscriptionOverview | null>(null)
  const [activatingFree, setActivatingFree] = useState(false)
  const [freeError, setFreeError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const d = await getCoachSubscriptionOverview().catch(() => null)
    setData(d)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleLogout() {
    await signOutAndCleanup()
    router.replace('/')
  }

  async function handleActivateFree() {
    setActivatingFree(true)
    setFreeError(null)
    try {
      await activateFreePlan()
      // El guard vive en `coach-access`: sin este refresh forzado el layout seguiría creyendo que
      // el coach está bloqueado y lo devolvería a este muro.
      await refreshCoachAccess(true)
      await workspace.refresh()
      router.replace('/coach/home')
    } catch (err) {
      setFreeError(err instanceof Error ? err.message : 'No se pudo activar el plan gratuito.')
      setActivatingFree(false)
      void load()
    }
  }

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={styles.root} className="bg-surface-app">
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

  // La salida gratuita es exclusiva del coach STANDALONE: en org/team el plan lo paga la
  // organización y este muro ni siquiera debería aparecer (el guard nunca gatea a managed).
  const canGoFree = workspace.kind === 'standalone' && !data?.orgManaged
  const overFreeLimit = clientCount > FREE_CLIENT_LIMIT

  return (
    <SafeAreaView edges={['top']} style={styles.root} className="bg-surface-app" testID="coach-reactivate">
      <AppBackground />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
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
          <Text style={[TYPE.caption, styles.flexText]} className="text-muted">
            {clientCount > 0
              ? `Tienes ${clientCount} alumno${clientCount !== 1 ? 's' : ''} activo${clientCount !== 1 ? 's' : ''}. Sin plan no puedes gestionarlos.`
              : 'Sin un plan activo no puedes gestionar alumnos ni rutinas.'}
          </Text>
        </Card>

        {/* Salida gratuita. Sobre cupo: primero archivar/eliminar hasta ≤ FREE_CLIENT_LIMIT. */}
        {canGoFree && overFreeLimit ? (
          <ReactivateArchivePanel
            clients={data?.activeClients ?? []}
            activeClientCount={clientCount}
            freeLimit={FREE_CLIENT_LIMIT}
            workspace={{ kind: workspace.kind, teamId: workspace.teamId, orgId: workspace.orgId }}
            onChanged={() => { void load() }}
          />
        ) : null}

        {canGoFree && !overFreeLimit ? (
          <Card variant="default" padding={16} radius="card" style={styles.freeCard}>
            <View style={styles.headerRow}>
              <Sparkles size={16} color={theme.primary} />
              <Text style={textStyle('md', FONT.uiBold)} className="text-strong">Continuar con el plan gratuito</Text>
            </View>
            <Text style={TYPE.caption} className="text-muted">
              Sigue usando EVA sin pagar, con hasta {FREE_CLIENT_LIMIT} alumnos activos. Puedes volver a un plan
              pago cuando quieras; tus datos quedan intactos.
            </Text>
            {freeError ? (
              <View className="bg-danger-100" style={styles.errorBox}>
                <Text style={TYPE.caption} className="text-strong">{freeError}</Text>
              </View>
            ) : null}
            <Button
              testID="reactivate-free"
              label="Continuar gratis"
              variant="secondary"
              loading={activatingFree}
              disabled={activatingFree}
              onPress={handleActivateFree}
              full
            />
          </Card>
        ) : null}

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
  flexText: { flex: 1, minWidth: 0 },
  freeCard: { gap: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorBox: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  actions: { marginTop: 8, gap: 12 },
  note: { textAlign: 'center', paddingHorizontal: 12 },
})
