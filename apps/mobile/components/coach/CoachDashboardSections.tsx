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
  Sparkles,
  TrendingUp,
  TriangleAlert,
  Users,
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

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'ahora'
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
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
