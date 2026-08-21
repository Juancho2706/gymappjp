import { useCallback, useEffect, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { MotiView } from 'moti'
import { AlertTriangle, Sparkles, Users } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Badge, Button, Card } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { ReactivateArchivePanel } from '../../../components/coach/ReactivateArchivePanel'
import { RefreshPlanButton } from '../../../components/coach/RefreshPlanButton'
import { useCoachTabbarScroll } from '../../../components/coach/CoachTabbarScroll'
import { FONT, TYPE, textStyle } from '../../../lib/typography'
import { signOutAndCleanup } from '../../../lib/auth-actions'
import { useWorkspace } from '../../../lib/workspace'
import { refreshEntitlements } from '../../../lib/entitlements'
import { refreshCoachAccess } from '../../../lib/coach-access'
import {
  freeClientLimitFor,
  STATUS_LABELS,
  TIER_LABELS,
  activateFreePlan,
  getCoachSubscriptionOverview,
  type CoachSubscriptionOverview,
} from '../../../lib/coach-subscription'

// DS warning-700 (status token, NO white-label): el theme JS no expone `warning`, se resuelve por
// scheme igual que en `alumno/suspended.tsx` (var(--warning-700) flipea en dark).
const WARNING_700 = { light: '#8F5A05', dark: '#FFD489' } as const

/**
 * E7-12 — muro del coach sin plan activo. Aterrizás acá cuando el guard de acceso
 * (`app/coach/_layout.tsx`) detecta que perdiste acceso EFECTIVO (`resolveReactivateRequired`).
 *
 * Muro NEUTRO: la app no puede ofrecer ni insinuar dónde pagar (Apple 3.1.1 y política de pagos de
 * Google prohíben CTAs a un mecanismo de compra externo), así que acá no hay link-out, ni precios,
 * ni "reactiva en la web". Ver docs/research/cta-pagos-externos-stores-2026-07-31.md.
 *
 * Lo que SÍ queda son las salidas que viven dentro de la app:
 *  - ACTUALIZAR ESTADO: revalida entitlements; si el plan volvió, el guard suelta al toque.
 *  - VOLVER A FREE: no cobra nada — es la salida gratuita. El cupo comunicado es el de ESTE coach:
 *    Pricing v3 pone el grandfather en la COLUMNA `coaches.max_clients`, así que si el coach ya
 *    está en free manda su columna; si viene de un plan pago vencido se proyecta con la escalera
 *    (`freeClientLimitFor(created_at)`: pre-v2 3 · v2 2 · v3 1). Si está sobre el cupo, el panel de
 *    archivado lo deja bajar primero (el endpoint revalida server-side de todos modos).
 *  - CERRAR SESIÓN.
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
      // el coach está bloqueado y lo devolvería a este muro. Los entitlements también cambian
      // (en Free los 4 módulos dejan de venir incluidos), así que se revalidan en el mismo acto
      // para no aterrizar en un dashboard que ofrece lo que ya no hay.
      await refreshCoachAccess(true)
      await Promise.all([workspace.refresh(), refreshEntitlements().catch(() => {})])
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
  const tierLabel = data ? (TIER_LABELS[data.profile.subscriptionTier] ?? data.profile.subscriptionTier) : null
  const statusLabel = STATUS_LABELS[status] ?? status
  const clientCount = data?.clientCount ?? 0

  // La salida gratuita es exclusiva del coach STANDALONE: en org/team el plan lo paga la
  // organización y este muro ni siquiera debería aparecer (el guard nunca gatea a managed).
  const canGoFree = workspace.kind === 'standalone' && !data?.orgManaged
  // Cupo free de ESTE coach. Pricing v3 (owner 2026-08-21): el grandfather vive en la COLUMNA
  // `coaches.max_clients` (backfill por USO del día D), no en la fecha de alta — así que si el coach
  // YA está en free, su columna manda y un free viejo con 3 alumnos sigue leyendo «hasta 3».
  // Si viene de un plan PAGO vencido, su columna es la del plan pago (25/60) y usarla acá le
  // prometería un Free que no existe: ahí se proyecta con la escalera (pre-v2 3 · v2 2 · v3 1),
  // exactamente lo que activate-free escribirá. Sin perfil cargado, fail-safe generoso; solo
  // display — el endpoint revalida el cupo antes de bajar a nadie.
  const coachProfile = data?.profile ?? null
  const freeLimit =
    coachProfile && coachProfile.subscriptionTier === 'free' && typeof coachProfile.maxClients === 'number'
      ? coachProfile.maxClients
      : freeClientLimitFor(coachProfile?.createdAt)
  const overFreeLimit = clientCount > freeLimit

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
            Tu plan está inactivo
          </Text>
          <Text style={[TYPE.body, styles.body]} className="text-muted">
            Tus datos y tus alumnos se conservan tal cual los dejaste.
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

        {/* Salida gratuita. Sobre cupo: primero archivar/eliminar hasta ≤ el cupo free del coach. */}
        {canGoFree && overFreeLimit ? (
          <ReactivateArchivePanel
            clients={data?.activeClients ?? []}
            activeClientCount={clientCount}
            freeLimit={freeLimit}
            workspace={{ kind: workspace.kind, teamId: workspace.teamId, orgId: workspace.orgId }}
            onChanged={() => { void Promise.all([load(), refreshCoachAccess(true)]) }}
          />
        ) : null}

        {canGoFree && !overFreeLimit ? (
          <Card variant="default" padding={16} radius="card" style={styles.freeCard}>
            <View style={styles.headerRow}>
              <Sparkles size={16} color={theme.primary} />
              <Text style={textStyle('md', FONT.uiBold)} className="text-strong">Continuar con el plan gratuito</Text>
            </View>
            <Text style={TYPE.caption} className="text-muted">
              {/* Límite del COACH (grandfather P2): un coach viejo ve 3, uno nuevo 2. */}
              Sigue usando EVA sin pagar, con hasta {freeLimit} alumno{freeLimit !== 1 ? 's' : ''} activo{freeLimit !== 1 ? 's' : ''}. Tus datos quedan intactos.
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
          {/* Si el plan volvió fuera del teléfono, esto lo refleja al toque y el guard suelta. */}
          <RefreshPlanButton variant="primary" size="lg" full onRefreshed={() => { void load() }} />
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
})
