import { useCallback, useEffect, useRef, useState } from 'react'
import { Linking, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { MotiView } from 'moti'
import { Activity, Check, Globe, HeartPulse, LockKeyhole, RotateCcw, Ruler, Utensils, type LucideIcon } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Badge, Button, Card, EmptyState } from '../../../components'
import type { BadgeTone } from '../../../components/Badge'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { toast } from '../../../components/Toast'
import { RefreshPlanButton, refreshCoachPlan } from '../../../components/coach/RefreshPlanButton'
import { ClientCapMeter } from '../../../components/coach/ClientCapMeter'
import { hexToRgba } from '../../../lib/theme'
import { PlanUpgradeCelebration } from '../../../components/coach/PlanUpgradeCelebration'
import { FONT, TYPE, textStyle } from '../../../lib/typography'
import { useWorkspace } from '../../../lib/workspace'
import { hasEffectiveAccess } from '../../../lib/workspace-core'
import {
  detectPlanChange,
  formatUpdatedAgo,
  planCaption,
  type PlanChange,
  type PlanSnapshot,
} from '../../../lib/plan-change'
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
 * Estado por módulo. Decisión CEO 2026-07-17 + Pricing v2 P3: los 4 módulos vienen INCLUIDOS para
 * TODO coach con suscripción vigente — FREE INCLUIDO. Incluido = acceso efectivo (ver
 * `hasModuleAccess` más abajo) o fila `coach_addons` viva (cortesía admin de un coach sin acceso).
 * Sin acceso efectivo y sin cortesía => "No incluido".
 */
function addonBadge(
  row: CoachAddonView | undefined,
  hasModuleAccess: boolean,
): { label: string; tone: BadgeTone; icon: LucideIcon | null; lit: boolean } {
  const hasLiveRow = row !== undefined && row.status !== 'cancelled'
  if (hasModuleAccess || hasLiveRow) return { label: 'Incluido en tu plan', tone: 'success', icon: Check, lit: true }
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
  const [refreshing, setRefreshing] = useState(false)
  /** Momento del último refresco OK; alimenta «Actualizado hace X» (null hasta el primero). */
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null)
  /** Reloj de pantalla: hace envejecer «hace X» sin re-leer la red mientras la vista está abierta. */
  const [now, setNow] = useState(() => Date.now())
  /** Cambio detectado tras refrescar: monta la celebración. `null` = nada que celebrar. */
  const [celebration, setCelebration] = useState<PlanChange | null>(null)
  /** Foto del plan de la ÚLTIMA lectura, para comparar contra la siguiente (W6.4). */
  const snapshotRef = useRef<PlanSnapshot | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => () => { mountedRef.current = false }, [])

  /** Guarda el estado leído y, si se pidió, compara contra la foto anterior. */
  const applyStatus = useCallback((next: CoachBillingStatus, detectChange: boolean) => {
    const prev = snapshotRef.current
    const nextSnapshot: PlanSnapshot | null = next.managed
      ? null
      : { tier: next.coach.subscriptionTier, maxClients: next.coach.maxClients }
    snapshotRef.current = nextSnapshot
    setData(next)
    setFailed(false)
    if (!detectChange || !prev || !nextSnapshot) return
    const change = detectPlanChange(prev, nextSnapshot)
    if (change.kind !== 'none') setCelebration(change)
  }, [])

  /** Re-lee el estado rico del bridge tras revalidar entitlements y celebra si el plan subió. */
  const reloadStatus = useCallback(async () => {
    const next = await getCoachBillingStatus()
    if (!mountedRef.current) return
    applyStatus(next, true)
    setRefreshedAt(Date.now())
  }, [applyStatus])

  /**
   * Pull-to-refresh: corre EXACTAMENTE la rutina del botón «Actualizar estado»
   * (`refreshCoachPlan`) y después re-lee esta pantalla. El spinner del RefreshControl es el acuse
   * de recibo del camino feliz, así que acá no va toast de éxito (el botón sí lo muestra); el de
   * error sí, porque un pull que no hizo nada es indistinguible de uno que sí.
   */
  const onPullRefresh = useCallback(() => {
    if (refreshing) return
    setRefreshing(true)
    void (async () => {
      try {
        await refreshCoachPlan()
        await reloadStatus()
      } catch {
        toast.error('No pudimos actualizar tu estado. Inténtalo de nuevo.')
      } finally {
        if (mountedRef.current) setRefreshing(false)
      }
    })()
  }, [refreshing, reloadStatus])

  useEffect(() => {
    let mounted = true
    getCoachBillingStatus()
      .then((d) => { if (mounted) { applyStatus(d, false); setLoading(false) } })
      .catch(() => { if (mounted) { setFailed(true); setLoading(false) } })
    return () => { mounted = false }
  }, [applyStatus])

  // «Actualizado hace X» envejece cada 30 s sin depender de una re-lectura de red.
  useEffect(() => {
    if (refreshedAt == null) return
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [refreshedAt])

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
        {/* El error también se sale con un gesto: sin el `ScrollView` + `RefreshControl`, el
            pull-to-refresh que SÍ existe cuando la pantalla carga desaparecía justo cuando el coach
            más lo necesita, y la única salida era cambiar de tab y volver. */}
        <ScrollView
          contentContainerStyle={[styles.scroll, styles.failScroll, { paddingBottom: insets.bottom + 100 }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onPullRefresh}
              tintColor={theme.primary}
              colors={[theme.primary]}
            />
          }
        >
          <EmptyState
            icon={LockKeyhole}
            title="No se pudo cargar tu plan"
            subtitle="Vuelve a intentarlo en unos segundos."
            action={
              <Button
                testID="subscription-retry"
                label="Reintentar"
                variant="secondary"
                leftIcon={RotateCcw}
                loading={refreshing}
                disabled={refreshing}
                onPress={onPullRefresh}
              />
            }
          />
        </ScrollView>
      </SafeAreaView>
    )
  }

  const { coach, addons, activeClientCount } = data
  const tier = coach.subscriptionTier as SubscriptionTier
  const status = coach.subscriptionStatus
  const tierLabel = TIER_LABELS[tier] ?? coach.subscriptionTier
  const statusLabel = STATUS_LABELS[status] ?? status
  const statusTone = STATUS_TONE[status] ?? 'neutral'
  /**
   * ¿Los 4 módulos vienen incluidos? Espejo de `hasPaidModuleAccess`
   * (`apps/web/src/services/entitlements.service.ts:73`), que desde Pricing v2 P3 NO mira el tier:
   * cualquier coach con suscripción vigente los deriva, free incluido. El predicado viejo
   * (`tier !== 'free' && (active|trialing)`) mentía por partida doble — le pintaba «No incluido»
   * con candado a un free ACTIVO al que el server sí se los da, y también a un pro `canceled`
   * dentro de su período pagado. `hasEffectiveAccess` (lib/workspace-core, espejo exacto de
   * `lib/coach-subscription-gate.ts`) es la misma señal de "activo" que usa el server.
   */
  const hasModuleAccess = hasEffectiveAccess(status, coach.currentPeriodEnd)

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

  // Android puede decir UNA línea sin link sobre dónde se cambia el plan; iOS, nada (SPEC §1-3).
  const platformPlanCaption = planCaption(Platform.OS)
  const updatedAgo = formatUpdatedAgo(refreshedAt, now)

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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onPullRefresh}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
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
                {/* Medidor de cupo: el número deja de ser texto suelto y se ve. `onDark` porque la
                    card es inversa (superficie oscura fija) — sin él, el anillo pinta su «x/N» con
                    `theme.foreground`, que en tema CLARO es tinta oscura y ahí no se lee. El label
                    visible es esta línea, no el del medidor (`showLabel` es false en `ring`). Sin
                    cupo conocido (columna null) no hay denominador que medir ⇒ solo el texto. */}
                <View style={[styles.meterRow, styles.mt10]}>
                  {coach.maxClients != null ? (
                    // El anillo es DECORATIVO acá: el texto de al lado ya dice «Alumnos activos ·
                    // x de N». Sin esto el lector anuncia el cupo dos veces seguidas.
                    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                      <ClientCapMeter active={activeClientCount} max={coach.maxClients} variant="ring" onDark />
                    </View>
                  ) : null}
                  {/* Una sola línea (QA owner 22-08: «1 de / 25» partido): si no cabe, se achica. */}
                  <Text
                    style={[TYPE.caption, styles.flex1]}
                    className="text-on-dark-muted"
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.8}
                  >
                    {clientsLabel}
                  </Text>
                </View>
              </View>
              <View style={styles.planRight}>
                <Badge label={statusLabel} tone={statusTone} dot />
              </View>
            </View>
          </Card>
        </MotiView>

        {/* Android: única línea admitida sobre dónde se cambia el plan (texto plano, sin link). */}
        {platformPlanCaption ? (
          // Callout en vez de una línea gris (QA owner 22-08): más visible, pero sigue siendo texto
          // plano sin link ni botón — el literal sale de `lib/client-cap.ts`, única fuente.
          <View
            accessibilityRole="text"
            style={[
              styles.storeCallout,
              { backgroundColor: hexToRgba(theme.primary, 0.12), borderColor: hexToRgba(theme.primary, 0.35) },
            ]}
          >
            <Globe size={18} strokeWidth={2.2} color={theme.primary} />
            <Text style={[textStyle('sm', FONT.uiBold), styles.flex1]} className="text-strong">
              {platformPlanCaption}
            </Text>
          </View>
        ) : null}

        {/* Revalida entitlements: un cambio de plan hecho fuera del teléfono se refleja al toque. */}
        <View style={styles.refreshBlock}>
          <RefreshPlanButton full onRefreshed={() => { void reloadStatus() }} />
          {updatedAgo ? (
            <Text style={[TYPE.caption, styles.note]} className="text-subtle">{updatedAgo}</Text>
          ) : null}
        </View>

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
              const b = addonBadge(row, hasModuleAccess)
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
            {hasModuleAccess
              ? 'Vienen incluidos en tu plan, sin costo extra. Úsalos desde Herramientas.'
              : 'Se activan solos cuando tu suscripción vuelve a estar vigente.'}
          </Text>
        </View>

        {/* `mailto:` NO es una superficie de pago: es soporte. Permitido en ambas tiendas. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Escribir a contacto@eva-app.cl"
          hitSlop={8}
          onPress={() => {
            void Linking.openURL(
              'mailto:contacto@eva-app.cl?subject=' + encodeURIComponent('Dudas con mi cuenta EVA'),
            ).catch(() => toast.error('No pudimos abrir tu app de correo.'))
          }}
        >
          <Text style={[TYPE.caption, styles.note]} className="text-muted">
            ¿Dudas con tu cuenta? Escríbenos a{' '}
            <Text style={textStyle('xs', FONT.uiBold)} className="text-sport-600">contacto@eva-app.cl</Text>
          </Text>
        </Pressable>
      </ScrollView>

      {/* Acuse de recibo de un cambio hecho AFUERA (no es venta): se monta solo tras un refresh. */}
      <PlanUpgradeCelebration
        open={celebration !== null}
        change={celebration}
        tier={tier}
        onClose={() => setCelebration(null)}
      />
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
  failScroll: { flexGrow: 1, justifyContent: 'center' },
  header: { paddingHorizontal: 4, paddingTop: 20, paddingBottom: 2 },
  flex1: { flex: 1, minWidth: 0 },
  mt4: { marginTop: 4 },
  mt6: { marginTop: 6 },
  mt10: { marginTop: 10 },
  gap10: { gap: 10 },
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  refreshBlock: { gap: 6 },
  storeCallout: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
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
