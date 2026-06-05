import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useTheme } from '../../../context/ThemeContext'

// ── Helpers de formato (compartidos por todas las tabs del detalle) ──────────
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short', year: 'numeric' })
}
export function formatCurrency(n: number): string {
  return `$${Math.round(n).toLocaleString('es-CL')}`
}
export function dayName(day: number): string {
  return ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'][day - 1] ?? `D${day}`
}
export function relativeDays(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso).getTime()
  if (!Number.isFinite(d)) return '—'
  const days = Math.floor((Date.now() - d) / 86400000)
  if (days <= 0) return 'Hoy'
  if (days === 1) return 'Ayer'
  if (days < 30) return `Hace ${days} días`
  const months = Math.floor(days / 30)
  if (months < 12) return `Hace ${months} mes${months === 1 ? '' : 'es'}`
  const years = Math.floor(months / 12)
  return `Hace ${years} año${years === 1 ? '' : 's'}`
}

// ── Primitivas de tarjeta ────────────────────────────────────────────────────
export function StatCard({ children, style }: { children: ReactNode; style?: any }) {
  const { theme } = useTheme()
  return (
    <View style={[s.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }, style]}>
      {children}
    </View>
  )
}

export function CardHeader({ icon: Icon, title, color, right }: { icon?: any; title: string; color?: string; right?: ReactNode }) {
  const { theme } = useTheme()
  return (
    <View style={s.headerRow}>
      <View style={s.titleRow}>
        {Icon ? <Icon size={15} color={color ?? theme.primary} /> : null}
        <Text style={[s.title, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>{title}</Text>
      </View>
      {right ?? null}
    </View>
  )
}

export function Pill({ label, color, tone }: { label: string; color?: string; tone?: 'warning' | 'danger' | 'success' }) {
  const { theme } = useTheme()
  const c = color ?? (tone === 'warning' ? '#F59E0B' : tone === 'danger' ? theme.destructive : tone === 'success' ? theme.success : theme.primary)
  return (
    <View style={[s.pill, { backgroundColor: c + '16', borderColor: c + '44', borderRadius: theme.radius.sm }]}>
      <Text style={[s.pillTxt, { color: c, fontFamily: 'Inter_700Bold' }]}>{label}</Text>
    </View>
  )
}

/** KPI box: valor grande + label + sub opcional. */
export function MetricBox({ value, label, sub, color, subColor }: { value: string; label: string; sub?: string; color?: string; subColor?: string }) {
  const { theme } = useTheme()
  return (
    <View style={[s.metric, { backgroundColor: theme.secondary, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
      <Text style={[s.metricVal, { color: color ?? theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]} numberOfLines={1}>{value}</Text>
      <Text style={[s.metricLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>{label}</Text>
      {sub ? <Text style={[s.metricSub, { color: subColor ?? theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>{sub}</Text> : null}
    </View>
  )
}

export const cd = StyleSheet.create({
  card: { padding: 18, borderWidth: 1, gap: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  title: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  big: { fontSize: 17, letterSpacing: -0.2 },
  sub: { fontSize: 13, lineHeight: 18 },
  empty: { fontSize: 13, lineHeight: 18 },
  pill: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  pillTxt: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.7 },
  metric: { flex: 1, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 8, gap: 2, alignItems: 'flex-start' },
  metricVal: { fontSize: 18, letterSpacing: -0.3 },
  metricLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  metricSub: { fontSize: 10 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 9 },
  rowTitle: { fontSize: 13, flexShrink: 1 },
  rowSub: { fontSize: 11, marginTop: 2 },
  rowMetric: { fontSize: 13 },
  grid2: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  listHeading: { fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' },
})

const s = cd

// Color por adherencia (compartido nutrición).
export function adherenceColor(pct: number, theme: any): string {
  if (pct >= 80) return theme.success
  if (pct >= 50) return '#F59E0B'
  if (pct > 0) return theme.destructive
  return theme.border
}
