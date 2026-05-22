import type { ReactNode } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useRouter } from 'expo-router'
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  Layers,
  Receipt,
  Sparkles,
  TrendingUp,
  TriangleAlert,
  UserPlus,
  Users,
  Utensils,
  type LucideIcon,
} from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../context/ThemeContext'
import type {
  MobileActivityItem,
  MobileAgendaItem,
  MobileExpiringProgramItem,
  MobileKpiSummary,
  MobileRiskAlertItem,
} from '../../lib/coach-dashboard'
import type { CoachProfile } from '../../lib/coach'
import { getRecommendedTier, TIER_CONFIG } from '../../lib/coach-tiers'
import { NativeDialog } from '../NativeDialog'
import { Button } from '../Button'
import { useState } from 'react'

function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return `rgba(0,122,255,${alpha})`
  const r = Number.parseInt(clean.slice(0, 2), 16)
  const g = Number.parseInt(clean.slice(2, 4), 16)
  const b = Number.parseInt(clean.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

function formatCurrency(n: number): string {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(n)
}

export function MobileBillingBanners({ coach, activeClientCount }: { coach: CoachProfile; activeClientCount: number }) {
  const nowMs = Date.now()
  const currentPeriodEndMs = coach.currentPeriodEnd ? new Date(coach.currentPeriodEnd).getTime() : null
  const trialEndsAtMs = coach.trialEndsAt ? new Date(coach.trialEndsAt).getTime() : null
  const canceledGrace =
    coach.subscriptionStatus === 'canceled' &&
    currentPeriodEndMs != null &&
    currentPeriodEndMs > nowMs
  const blocked =
    coach.subscriptionStatus === 'canceled' &&
    currentPeriodEndMs != null &&
    currentPeriodEndMs <= nowMs
  const trialActive = trialEndsAtMs != null && trialEndsAtMs > nowMs

  if (blocked) {
    return (
      <MobileBanner tone="danger" icon={TriangleAlert}>
        <Text>Tu suscripcion esta cancelada. Reactiva para recuperar acceso.</Text>
      </MobileBanner>
    )
  }

  if (canceledGrace) {
    const days = Math.max(0, Math.ceil(((currentPeriodEndMs ?? nowMs) - nowMs) / 86400000))
    const showRec = days <= 7 && activeClientCount > 0
    const recTier = showRec ? getRecommendedTier(activeClientCount) : null
    const recConfig = recTier ? TIER_CONFIG[recTier] : null
    return (
      <MobileBanner tone="warn" icon={Clock}>
        <Text>
          Cancelaste tu plan. Acceso hasta por {days} dia{days === 1 ? '' : 's'}.
        </Text>
        {showRec && recConfig ? (
          <Text>
            Con {activeClientCount} alumnos: Plan {recConfig.label} hasta {recConfig.maxClients}.
          </Text>
        ) : null}
      </MobileBanner>
    )
  }

  if (trialActive) {
    const days = Math.max(0, Math.ceil(((trialEndsAtMs ?? nowMs) - nowMs) / 86400000))
    const showRec = days <= 7 && activeClientCount > 0
    const recTier = showRec ? getRecommendedTier(activeClientCount) : null
    const recConfig = recTier ? TIER_CONFIG[recTier] : null
    return (
      <MobileBanner tone="info" icon={Clock}>
        <Text>
          Periodo de prueba - {days} dia{days === 1 ? '' : 's'} restantes.
        </Text>
        {showRec && recConfig ? (
          <Text>
            Con {activeClientCount} alumnos: Plan {recConfig.label} hasta {recConfig.maxClients}.
          </Text>
        ) : null}
      </MobileBanner>
    )
  }

  return null
}

export function MobileTierUsageBanners({ coach, totalClients }: { coach: CoachProfile; totalClients: number }) {
  return (
    <View style={styles.tierStack}>
      {coach.subscriptionTier === 'free' ? <MobileFreeTierBanner totalClients={totalClients} /> : null}
      {coach.subscriptionTier === 'elite' && totalClients >= 48 ? <MobileGrowthUpgradeBanner totalClients={totalClients} /> : null}
    </View>
  )
}

function MobileFreeTierBanner({ totalClients }: { totalClients: number }) {
  const { theme } = useTheme()
  const max = TIER_CONFIG.free.maxClients
  const used = Math.min(totalClients, max)
  const pct = Math.round((used / max) * 100)
  const full = used >= max

  return (
    <View
      style={[
        styles.tierBanner,
        {
          borderColor: full ? 'rgba(245,158,11,0.32)' : theme.border,
          backgroundColor: full ? 'rgba(245,158,11,0.1)' : hexToRgba(theme.card === '#FFFFFF' ? '#FFFFFF' : '#000000', theme.card === '#FFFFFF' ? 0.62 : 0.34),
          borderRadius: theme.radius.xl,
        },
      ]}
    >
      <View style={styles.tierMain}>
        <Text style={[styles.tierTitle, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]}>
          {used}/{max} alumnos - Plan gratuito
        </Text>
        <View style={[styles.usageTrack, { backgroundColor: theme.muted }]}>
          <View
            style={[
              styles.usageFill,
              {
                width: `${pct}%`,
                backgroundColor: full ? '#F59E0B' : '#10B981',
              },
            ]}
          />
        </View>
      </View>
      <Text style={[styles.tierAction, { color: full ? '#F59E0B' : theme.primary, fontFamily: 'Inter_700Bold' }]}>
        {full ? 'Expandir limite' : 'Ver planes'}
      </Text>
    </View>
  )
}

function MobileGrowthUpgradeBanner({ totalClients }: { totalClients: number }) {
  const { theme } = useTheme()
  const max = TIER_CONFIG.elite.maxClients
  const pct = Math.round((Math.min(totalClients, max) / max) * 100)

  return (
    <View
      style={[
        styles.tierBanner,
        {
          borderColor: 'rgba(16,185,129,0.32)',
          backgroundColor: 'rgba(16,185,129,0.1)',
          borderRadius: theme.radius.xl,
        },
      ]}
    >
      <View style={styles.tierMain}>
        <Text style={[styles.tierTitle, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]}>
          {totalClients}/{max} alumnos - {pct}% de tu plan Elite
        </Text>
        <Text style={[styles.tierSubtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Hay un plan Growth para coaches con 60-120 alumnos.
        </Text>
      </View>
      <Text style={[styles.tierAction, { color: '#10B981', fontFamily: 'Inter_700Bold' }]}>
        Ver Growth
      </Text>
    </View>
  )
}

function MobileBanner({
  tone,
  icon: Icon,
  children,
}: {
  tone: 'info' | 'warn' | 'danger'
  icon: LucideIcon
  children: ReactNode
}) {
  const { theme } = useTheme()
  const toneColor = tone === 'danger' ? '#F43F5E' : tone === 'warn' ? '#F59E0B' : theme.primary
  return (
    <View
      style={[
        styles.banner,
        {
          borderColor: hexToRgba(toneColor, 0.32),
          backgroundColor: hexToRgba(toneColor, 0.1),
          borderRadius: theme.radius['2xl'],
        },
      ]}
    >
      <Icon size={18} color={toneColor} strokeWidth={2.2} />
      <View style={styles.bannerCopy}>
        <Text style={[styles.bannerText, { color: theme.foreground, fontFamily: theme.fontSans }]}>
          {children}
        </Text>
        <View style={[styles.bannerCta, { backgroundColor: toneColor }]}>
          <CreditCard size={13} color="#FFFFFF" strokeWidth={2.3} />
          <Text style={[styles.bannerCtaText, { fontFamily: 'Inter_700Bold' }]}>
            Revisar plan
          </Text>
        </View>
      </View>
    </View>
  )
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

export function MobileQuickActionsBar() {
  const router = useRouter()
  const { theme } = useTheme()
  const [modal, setModal] = useState<null | 'client' | 'program' | 'nutrition' | 'payment'>(null)

  return (
    <>
      <View style={styles.quickActions}>
        <QuickActionButton icon={UserPlus} label="+ Alumno" shortLabel="+" onPress={() => setModal('client')} />
        <QuickActionButton icon={Layers} label="+ Programa" shortLabel="+" onPress={() => router.push('/coach/(tabs)/builder')} />
        <QuickActionButton icon={Utensils} label="+ Nutricion" shortLabel="+" onPress={() => router.push('/coach/(tabs)/nutricion')} />
        <QuickActionButton icon={Receipt} label="+ Pago" shortLabel="+" onPress={() => setModal('payment')} />
      </View>

      <NativeDialog
        open={modal != null}
        title={modal === 'payment' ? 'Registrar pago' : modal === 'client' ? 'Agregar alumno' : 'Accion no disponible'}
        onClose={() => setModal(null)}
      >
        <View style={styles.placeholderDialog}>
          <Text style={[styles.placeholderText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            {modal === 'client'
              ? 'La accion visual ya esta en mobile. El alta real de alumno requiere el endpoint seguro equivalente al server action web.'
              : modal === 'payment'
                ? 'El registro rapido de pago se portara en la capa de modales/sheets para mantener validacion y refresco igual que web.'
                : 'Esta accion se conectara cuando exista la pantalla nativa correspondiente.'}
          </Text>
          <Button label="Entendido" size="md" onPress={() => setModal(null)} full />
        </View>
      </NativeDialog>
    </>
  )
}

function QuickActionButton({
  icon: Icon,
  label,
  shortLabel,
  onPress,
}: {
  icon: LucideIcon
  label: string
  shortLabel: string
  onPress: () => void
}) {
  const { theme } = useTheme()

  return (
    <TouchableOpacity
      activeOpacity={0.82}
      onPress={onPress}
      style={[
        styles.quickActionButton,
        {
          backgroundColor: theme.card === '#FFFFFF' ? 'rgba(255,255,255,0.95)' : 'rgba(18,18,18,0.68)',
          borderColor: theme.card === '#FFFFFF' ? 'rgba(0,0,0,0.11)' : theme.border,
          shadowColor: '#000',
        },
      ]}
    >
      <Icon size={16} color={theme.primary} strokeWidth={2.3} />
      <Text
        style={[styles.quickActionLabel, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        style={[styles.quickActionShort, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}
        numberOfLines={1}
      >
        {shortLabel}
      </Text>
    </TouchableOpacity>
  )
}

function useGlassStyle() {
  const { theme } = useTheme()
  return {
    backgroundColor: hexToRgba(theme.card === '#FFFFFF' ? '#FFFFFF' : '#000000', theme.card === '#FFFFFF' ? 0.72 : 0.42),
    borderColor: theme.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: theme.card === '#FFFFFF' ? 0.09 : 0.32,
    shadowRadius: 24,
    elevation: 6,
  }
}

export function MobileGreetingHeader({ coachName, pendingCount }: { coachName: string; pendingCount: number }) {
  const { theme } = useTheme()
  const firstName = coachName?.split(' ')[0] || 'Coach'
  const dateStr = new Intl.DateTimeFormat('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date())

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Buenos dias' : hour < 20 ? 'Buenas tardes' : 'Buenas noches'

  return (
    <View style={styles.greeting}>
      <Text style={[styles.eyebrow, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
        {dateStr}
      </Text>
      <Text style={[styles.greetingTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
        {greeting},{' '}
        <Text style={{ color: theme.primary }}>
          {firstName}
        </Text>
      </Text>
      <Text style={[styles.greetingSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
        {pendingCount > 0
          ? `Tienes ${pendingCount} pendiente${pendingCount === 1 ? '' : 's'} hoy.`
          : 'Todo al dia. Buen momento para planificar.'}
      </Text>
    </View>
  )
}

export function MobileKpiStrip({ kpi }: { kpi: MobileKpiSummary }) {
  return (
    <View style={styles.kpiGrid}>
      <MobileKpiTile
        label="Ingresos del mes"
        value={formatCurrency(kpi.mrrCurrentMonth)}
        hint={`Mes anterior: ${formatCurrency(kpi.mrrPreviousMonth)}`}
        icon={TrendingUp}
        deltaPct={kpi.mrrDeltaPct}
      />
      <MobileKpiTile label="Alumnos activos" value={String(kpi.totalClients)} icon={Users} />
      <MobileKpiTile
        label="En riesgo"
        value={String(kpi.riskCount)}
        hint={kpi.riskCount > 0 ? 'Requieren atencion inmediata' : 'Todos al dia'}
        icon={TriangleAlert}
      />
      <MobileKpiTile
        label="Adherencia"
        value={`${kpi.avgAdherence}%`}
        hint={`Nutricion: ${kpi.avgNutrition}%`}
        icon={Activity}
      />
    </View>
  )
}

function MobileKpiTile({
  label,
  value,
  hint,
  icon: Icon,
  deltaPct,
}: {
  label: string
  value: string
  hint?: string
  icon: LucideIcon
  deltaPct?: number
}) {
  const { theme } = useTheme()
  const glass = useGlassStyle()
  const hasDelta = typeof deltaPct === 'number'
  const up = hasDelta && deltaPct >= 0

  return (
    <MotiView
      from={{ opacity: 0, translateY: 14 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 320 }}
      style={[styles.kpiCard, glass, { borderRadius: theme.radius['2xl'] }]}
    >
      <View style={styles.kpiTop}>
        <Text style={[styles.kpiLabel, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]} numberOfLines={2}>
          {label}
        </Text>
        <Icon size={17} color={theme.primary} strokeWidth={2.2} />
      </View>
      <Text
        style={[styles.kpiValue, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      {hasDelta ? (
        <View style={[styles.deltaPill, { backgroundColor: up ? 'rgba(16,185,129,0.15)' : 'rgba(244,63,94,0.15)' }]}>
          {up ? <ArrowUpRight size={12} color="#10B981" /> : <ArrowDownRight size={12} color="#F43F5E" />}
          <Text style={[styles.deltaText, { color: up ? '#10B981' : '#F43F5E', fontFamily: 'Inter_700Bold' }]}>
            {Math.abs(deltaPct)}%
          </Text>
        </View>
      ) : null}
      {hint ? (
        <Text style={[styles.kpiHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>
          {hint}
        </Text>
      ) : null}
    </MotiView>
  )
}

export function MobileFocusList({ items }: { items: MobileRiskAlertItem[] }) {
  const router = useRouter()
  const { theme } = useTheme()
  const glass = useGlassStyle()

  return (
    <View style={[styles.panel, glass, { borderRadius: theme.radius['2xl'] }]}>
      <View style={styles.panelHeader}>
        <View style={styles.panelTitleRow}>
          <TriangleAlert size={17} color="#F59E0B" />
          <Text style={[styles.panelTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
            Focus list
          </Text>
        </View>
        <Text style={[styles.panelAction, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
          VER TODOS
        </Text>
      </View>

      {items.length === 0 ? (
        <EmptyPanel icon={<Sparkles size={24} color={theme.mutedForeground} />} title="Sin alumnos en riesgo" subtitle="Todos con check-in y ejercicio al dia." />
      ) : (
        <View style={styles.rows}>
          {items.map((item, index) => (
            <TouchableOpacity
              key={item.clientId}
              activeOpacity={0.78}
              onPress={() => router.push(`/coach/cliente/${item.clientId}`)}
              style={[styles.row, index < items.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
            >
              <View style={styles.rowCopy}>
                <Text style={[styles.rowTitle, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>
                  {item.clientName}
                </Text>
                <Text style={[styles.rowSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>
                  {item.label}
                </Text>
              </View>
              <View style={styles.rowRight}>
                <View style={styles.scorePill}>
                  <Text style={[styles.scoreText, { fontFamily: 'Inter_700Bold' }]}>{item.attentionScore}</Text>
                </View>
                <ChevronRight size={18} color={theme.mutedForeground} />
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  )
}

export function MobileNextBestAction({ hasRisk, hasAgenda }: { hasRisk: boolean; hasAgenda: boolean }) {
  const { theme } = useTheme()
  const glass = useGlassStyle()
  const title = hasRisk ? 'Revisa alumnos en riesgo' : hasAgenda ? 'Cierra pendientes de hoy' : 'Planifica el siguiente bloque'
  const description = hasRisk
    ? 'Prioriza el primer alumno con adherencia critica y deja una accion concreta.'
    : hasAgenda
      ? 'Tienes tareas abiertas para mantener continuidad operativa.'
      : 'Buen momento para preparar programas, nutricion o seguimiento.'

  return (
    <View style={[styles.nextCard, glass, { borderRadius: theme.radius['2xl'], backgroundColor: hexToRgba(theme.primary, 0.08) }]}>
      <View style={styles.panelTitleRow}>
        <Sparkles size={17} color={theme.primary} />
        <Text style={[styles.eyebrow, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
          PROXIMA ACCION
        </Text>
      </View>
      <Text style={[styles.nextTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
        {title}
      </Text>
      <Text style={[styles.nextDescription, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
        {description}
      </Text>
      <View style={[styles.ctaPill, { backgroundColor: theme.primary }]}>
        <Text style={[styles.ctaText, { fontFamily: 'Inter_700Bold' }]}>Abrir detalle</Text>
        <ArrowRight size={16} color="#FFFFFF" />
      </View>
    </View>
  )
}

export function MobileTodayAgenda({ items }: { items: MobileAgendaItem[] }) {
  const router = useRouter()
  const { theme } = useTheme()
  const glass = useGlassStyle()

  return (
    <View style={[styles.panel, glass, { borderRadius: theme.radius['2xl'] }]}>
      <View style={styles.panelHeader}>
        <View style={styles.panelTitleRow}>
          <CalendarClock size={17} color={theme.primary} />
          <Text style={[styles.panelTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
            Agenda de hoy
          </Text>
        </View>
        <Text style={[styles.panelCount, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          {items.length} pendientes
        </Text>
      </View>
      {items.length === 0 ? (
        <EmptyPanel icon={<CheckCircle2 size={25} color="#10B981" />} title="Todo cerrado" subtitle="Sin pendientes en el dia." />
      ) : (
        <View style={styles.rows}>
          {items.map((item, index) => (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.78}
              onPress={() => router.push(`/coach/cliente/${item.clientId}`)}
              style={[styles.row, index < items.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
            >
              <Text style={styles.kindIcon}>
                {item.kind === 'programa_vence' ? 'H' : item.kind === 'checkin_pendiente' ? 'C' : 'W'}
              </Text>
              <View style={styles.rowCopy}>
                <Text style={[styles.rowTitle, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>
                  {item.clientName}
                </Text>
                <Text style={[styles.rowSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>
                  {item.label}
                </Text>
              </View>
              <ChevronRight size={18} color={theme.mutedForeground} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  )
}

export function MobileExpiringPrograms({ items }: { items: MobileExpiringProgramItem[] }) {
  const { theme } = useTheme()
  const glass = useGlassStyle()

  return (
    <View style={[styles.panel, glass, { borderRadius: theme.radius['2xl'] }]}>
      <View style={styles.panelTitleRow}>
        <Clock size={17} color="#F59E0B" />
        <Text style={[styles.panelTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
          Programas por vencer
        </Text>
      </View>
      {items.length === 0 ? (
        <Text style={[styles.emptySub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Sin programas vencidos ni por vencer.
        </Text>
      ) : (
        <View style={styles.rows}>
          {items.slice(0, 4).map((item, index) => (
            <View key={item.id} style={[styles.row, index < items.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
              <View style={styles.rowCopy}>
                <Text style={[styles.rowTitle, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>
                  {item.clientName}
                </Text>
                <Text style={[styles.rowSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>
                  {item.name}
                </Text>
              </View>
              <View style={[styles.duePill, { backgroundColor: item.daysLeft <= 0 ? 'rgba(244,63,94,0.15)' : 'rgba(245,158,11,0.15)' }]}>
                <Text style={[styles.dueText, { color: item.daysLeft <= 0 ? '#F43F5E' : '#F59E0B', fontFamily: 'Inter_700Bold' }]}>
                  {item.daysLeft <= 0 ? 'Vencido' : `${item.daysLeft}d`}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

export function MobileActivityFeed({ items }: { items: MobileActivityItem[] }) {
  const router = useRouter()
  const { theme } = useTheme()
  const glass = useGlassStyle()

  return (
    <View style={[styles.panel, glass, { borderRadius: theme.radius['2xl'] }]}>
      <View style={styles.panelTitleRow}>
        <Activity size={17} color={theme.primary} />
        <Text style={[styles.panelTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
          Actividad reciente
        </Text>
      </View>
      {items.length === 0 ? (
        <Text style={[styles.emptySub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Sin actividad reciente.
        </Text>
      ) : (
        <View style={styles.rows}>
          {items.map((item, index) => (
            <TouchableOpacity
              key={item.id}
              activeOpacity={0.78}
              disabled={!item.clientId}
              onPress={() => item.clientId && router.push(`/coach/cliente/${item.clientId}`)}
              style={[styles.row, index < items.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}
            >
              <View style={[styles.activityIcon, { backgroundColor: hexToRgba(theme.primary, 0.11) }]}>
                <Activity size={16} color={theme.primary} />
              </View>
              <View style={styles.rowCopy}>
                <Text style={[styles.rowTitle, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={[styles.rowSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>
                  {item.subtitle}
                </Text>
              </View>
              <Text style={[styles.timeText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                {timeAgo(item.date)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  )
}

function EmptyPanel({ icon, title, subtitle }: { icon: ReactNode; title: string; subtitle: string }) {
  const { theme } = useTheme()
  return (
    <View style={styles.emptyPanel}>
      {icon}
      <Text style={[styles.emptyTitle, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]}>
        {title}
      </Text>
      <Text style={[styles.emptySub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
        {subtitle}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  greeting: {
    gap: 4,
  },
  banner: {
    borderWidth: 1,
    padding: 14,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  bannerCopy: {
    flex: 1,
    minWidth: 0,
    gap: 10,
  },
  bannerText: {
    fontSize: 13,
    lineHeight: 19,
  },
  bannerCta: {
    alignSelf: 'flex-start',
    minHeight: 32,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bannerCtaText: {
    color: '#FFFFFF',
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.7,
  },
  tierStack: {
    gap: 8,
  },
  tierBanner: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  tierMain: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  tierTitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  tierSubtitle: {
    fontSize: 11,
    lineHeight: 15,
  },
  tierAction: {
    flexShrink: 0,
    fontSize: 11,
  },
  usageTrack: {
    height: 6,
    width: '100%',
    borderRadius: 999,
    overflow: 'hidden',
  },
  usageFill: {
    height: '100%',
    borderRadius: 999,
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
  },
  quickActionButton: {
    minHeight: 40,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 7,
    elevation: 2,
  },
  quickActionLabel: {
    fontSize: 13,
  },
  quickActionShort: {
    display: 'none',
    fontSize: 13,
  },
  placeholderDialog: {
    gap: 16,
  },
  placeholderText: {
    fontSize: 14,
    lineHeight: 20,
  },
  eyebrow: {
    fontSize: 10,
    letterSpacing: 1.7,
    textTransform: 'uppercase',
  },
  greetingTitle: {
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.6,
  },
  greetingSub: {
    fontSize: 14,
    lineHeight: 20,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kpiCard: {
    width: '48.5%',
    minHeight: 142,
    borderWidth: 1,
    padding: 16,
    gap: 10,
    overflow: 'hidden',
  },
  kpiTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  kpiLabel: {
    flex: 1,
    fontSize: 10,
    lineHeight: 13,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  kpiValue: {
    fontSize: 27,
    lineHeight: 31,
  },
  deltaPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  deltaText: {
    fontSize: 11,
  },
  kpiHint: {
    marginTop: 'auto',
    fontSize: 11,
  },
  panel: {
    borderWidth: 1,
    padding: 16,
    gap: 14,
    overflow: 'hidden',
  },
  nextCard: {
    borderWidth: 1,
    padding: 16,
    gap: 12,
    overflow: 'hidden',
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  panelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  panelTitle: {
    fontSize: 18,
    letterSpacing: -0.2,
  },
  panelAction: {
    fontSize: 10,
    letterSpacing: 1,
  },
  panelCount: {
    fontSize: 12,
  },
  rows: {
    gap: 0,
  },
  row: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
  },
  rowCopy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  rowTitle: {
    fontSize: 14,
    lineHeight: 18,
  },
  rowSub: {
    fontSize: 12,
    lineHeight: 16,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  scorePill: {
    borderRadius: 999,
    backgroundColor: 'rgba(245,158,11,0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  scoreText: {
    color: '#F59E0B',
    fontSize: 11,
  },
  nextTitle: {
    fontSize: 21,
    lineHeight: 25,
    letterSpacing: -0.3,
  },
  nextDescription: {
    fontSize: 13,
    lineHeight: 19,
  },
  ctaPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  ctaText: {
    color: '#FFFFFF',
    fontSize: 13,
  },
  kindIcon: {
    width: 24,
    fontSize: 16,
    textAlign: 'center',
  },
  duePill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dueText: {
    fontSize: 11,
  },
  activityIcon: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timeText: {
    fontSize: 11,
  },
  emptyPanel: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 22,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 14,
  },
  emptySub: {
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
  },
})
