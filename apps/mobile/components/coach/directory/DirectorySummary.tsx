import { useEffect, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { AlertOctagon, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import type { DirectoryRiskFilter, DirectoryStats } from '../../../lib/clients-directory'
import { DANGER, EMBER, WARNING } from './directory-shared'

/**
 * DirectorySummary — "Resumen · hoy" (triage). Realización móvil del web `CoachWarRoom`:
 * 2 PulseCard jerárquicas (Riesgo / Atención, botón-filtro) + grilla de 4 MetricChip
 * (Total / Activos / On track / Sin plan). Cada tile filtra el directorio.
 */

// ─── Pulse card (prioridad: Riesgo / Atención) — botón-filtro jerárquico ───────
function PulseCard({
  label,
  value,
  hint,
  tone,
  icon: Icon,
  selected,
  onPress,
  testID,
}: {
  label: string
  value: number
  hint: string
  tone: 'danger' | 'warning'
  icon: typeof AlertOctagon
  selected: boolean
  onPress: () => void
  testID?: string
}) {
  const { theme } = useTheme()
  const color = tone === 'danger' ? DANGER : WARNING
  const fg = selected ? '#fff' : color
  return (
    <TouchableOpacity
      testID={testID}
      style={[
        pulseStyles.card,
        {
          backgroundColor: selected ? color : color + '1A',
          borderColor: selected ? color : theme.border,
        },
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={pulseStyles.top}>
        <View style={pulseStyles.labelRow}>
          <Icon size={14} color={fg} />
          <Text style={[pulseStyles.label, { color: fg }]}>{label}</Text>
        </View>
        {value > 0 ? <ChevronRight size={15} color={fg} /> : null}
      </View>
      <Text style={[pulseStyles.value, { color: selected ? '#fff' : value > 0 ? color : theme.mutedForeground }]}>{value}</Text>
      <Text numberOfLines={1} style={[pulseStyles.hint, { color: selected ? 'rgba(255,255,255,0.85)' : theme.mutedForeground }]}>{hint}</Text>
    </TouchableOpacity>
  )
}

// ─── Metric chip (Total / Activos / On track / Sin plan) ───────────────────────
function MetricChip({
  label,
  value,
  suffix,
  color,
  selected,
  onPress,
  testID,
}: {
  label: string
  value: number
  suffix?: string
  color: string
  selected: boolean
  onPress?: () => void
  testID?: string
}) {
  const { theme } = useTheme()
  return (
    <TouchableOpacity
      testID={testID}
      disabled={!onPress}
      onPress={onPress}
      activeOpacity={onPress ? 0.8 : 1}
      style={[
        chipStyles.chip,
        {
          backgroundColor: selected ? theme.foreground : theme.card,
          borderColor: selected ? theme.foreground : theme.border,
        },
      ]}
    >
      <Text numberOfLines={1} style={[chipStyles.value, { color: selected ? '#fff' : color }]}>
        {value}
        {suffix ?? ''}
      </Text>
      <Text numberOfLines={1} style={[chipStyles.label, { color: selected ? 'rgba(255,255,255,0.72)' : theme.mutedForeground }]}>{label}</Text>
    </TouchableOpacity>
  )
}

export function DirectorySummary({
  stats,
  riskFilter,
  onToggleRisk,
  onSetAllRisk,
  avgAdherence,
  nutritionLowCount,
}: {
  stats: DirectoryStats
  riskFilter: DirectoryRiskFilter
  onToggleRisk: (f: DirectoryRiskFilter) => void
  onSetAllRisk: () => void
  avgAdherence: number
  nutritionLowCount: number
}) {
  const { theme } = useTheme()
  // "Resumen · hoy" colapsable + persistente (espejo web `eva.dir.resumenOpen`).
  const [open, setOpen] = useState(true)
  useEffect(() => {
    AsyncStorage.getItem('eva.dir.resumenOpen').then((v) => { if (v === '0') setOpen(false) }).catch(() => {})
  }, [])
  const toggleOpen = () =>
    setOpen((o) => {
      const v = !o
      AsyncStorage.setItem('eva.dir.resumenOpen', v ? '1' : '0').catch(() => {})
      return v
    })

  // Pulso de prioridad (2 números jerárquicos) — botones-filtro de riesgo.
  const pulseTiles = [
    { key: 'urgent', label: 'Riesgo', value: stats.urgentCount, filter: 'urgent' as DirectoryRiskFilter, tone: 'danger' as const, icon: AlertOctagon, hint: stats.urgentCount ? (stats.urgentCount === 1 ? 'Necesita atención hoy' : 'Necesitan atención hoy') : 'Todo en orden' },
    { key: 'review', label: 'Atención', value: stats.reviewCount, filter: 'review' as DirectoryRiskFilter, tone: 'warning' as const, icon: AlertTriangle, hint: stats.reviewCount ? 'Para revisar pronto' : 'Sin pendientes' },
  ]
  // Métricas secundarias — grilla de 4 (1:1 web: Total · Activos · Adher.% · Nutri.).
  const metricTiles: { key: string; label: string; value: number; suffix?: string; color: string; selected: boolean; onPress?: () => void }[] = [
    { key: 'total', label: 'Total', value: stats.total, color: theme.foreground, selected: riskFilter === 'all', onPress: onSetAllRisk },
    { key: 'active', label: 'Activos', value: stats.active, color: theme.primary, selected: false },
    { key: 'adherence', label: 'Adher.', value: avgAdherence, suffix: '%', color: theme.foreground, selected: false },
    { key: 'nutrition', label: 'Nutri.', value: nutritionLowCount, color: EMBER, selected: riskFilter === 'nutrition_low', onPress: () => onToggleRisk('nutrition_low') },
  ]

  return (
    <View style={styles.summary}>
      <TouchableOpacity testID="directory-resumen-toggle" activeOpacity={0.7} onPress={toggleOpen} style={styles.eyebrowRow}>
        <Text style={[styles.eyebrow, { color: theme.mutedForeground }]}>Resumen · hoy</Text>
        {!open ? (
          <Text numberOfLines={1} style={[styles.collapsed, { color: theme.mutedForeground }]}>
            {stats.active} activos
            {stats.urgentCount > 0 ? (
              <Text style={{ color: DANGER, fontFamily: FONT.uiBold }}> · {stats.urgentCount} en riesgo</Text>
            ) : null}
            {` · ${avgAdherence}% adher.`}
          </Text>
        ) : null}
        <ChevronDown size={18} color={theme.mutedForeground} style={{ marginLeft: open ? 'auto' : 0, transform: [{ rotate: open ? '180deg' : '0deg' }] }} />
      </TouchableOpacity>

      {open ? (
        <>
          <View style={styles.pulseRow}>
            {pulseTiles.map((t) => (
              <PulseCard key={t.key} testID={`directory-pulse-${t.key}`} label={t.label} value={t.value} hint={t.hint} tone={t.tone} icon={t.icon}
                selected={riskFilter === t.filter} onPress={() => onToggleRisk(t.filter)} />
            ))}
          </View>
          <View style={styles.metricRow}>
            {metricTiles.map((t) => (
              <MetricChip key={t.key} testID={`directory-metric-${t.key}`} label={t.label} value={t.value} suffix={t.suffix} color={t.color}
                selected={t.selected} onPress={t.onPress} />
            ))}
          </View>
        </>
      ) : null}
    </View>
  )
}

const pulseStyles = StyleSheet.create({
  card: { flex: 1, minWidth: 0, gap: 5, padding: 14, borderRadius: 20, borderWidth: 1.5 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 11.5, fontFamily: FONT.uiExtra, letterSpacing: 0.23 },
  value: { fontSize: 30, lineHeight: 32, fontFamily: FONT.displayBlack, fontVariant: ['tabular-nums'] },
  hint: { fontSize: 11, fontFamily: FONT.uiSemibold },
})

const chipStyles = StyleSheet.create({
  chip: { flex: 1, minWidth: 0, gap: 1, paddingHorizontal: 8, paddingVertical: 9, borderRadius: 14, borderWidth: 1.5 },
  value: { fontSize: 15.5, lineHeight: 17, fontFamily: FONT.displayBlack, fontVariant: ['tabular-nums'] },
  label: { fontSize: 9.5, fontFamily: FONT.uiSemibold },
})

const styles = StyleSheet.create({
  summary: { paddingHorizontal: 16, paddingBottom: 12, gap: 8 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 2 },
  eyebrow: { fontSize: 11, fontFamily: FONT.uiExtra, textTransform: 'uppercase', letterSpacing: 0.88 },
  collapsed: { flex: 1, fontSize: 12, fontFamily: FONT.uiMedium },
  pulseRow: { flexDirection: 'row', gap: 8 },
  metricRow: { flexDirection: 'row', gap: 6 },
})
