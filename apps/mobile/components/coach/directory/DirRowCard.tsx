import { memo, useMemo, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { AlertOctagon, AlertTriangle, Apple, Check, MoreVertical, type LucideIcon } from 'lucide-react-native'
import { ProgressRing } from '../../ProgressRing'
import { ClientActionsSheet } from './ClientActionsSheet'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import { shadow } from '../../../lib/shadows'
import { resolveSportRamp } from '../../../lib/theme'
import type { DirectoryClient, PulseRow } from '../../../lib/clients-directory'
import { DANGER, WARNING, lastInfo } from './directory-shared'

function severityMeta(score: number): { label: string; Icon: LucideIcon; bg: string; fg: string } {
  if (score >= 50) return { label: 'Riesgo', Icon: AlertOctagon, bg: 'bg-danger-100 dark:bg-danger-100/[0.18]', fg: 'text-danger-700' }
  if (score >= 25) return { label: 'Atención', Icon: AlertTriangle, bg: 'bg-warning-100 dark:bg-warning-100/[0.18]', fg: 'text-warning-700' }
  return { label: 'On track', Icon: Check, bg: 'bg-success-100 dark:bg-success-100/[0.18]', fg: 'text-success-700' }
}

function statusMeta(item: DirectoryClient): { key: string; label: string; bg: string; fg: string } {
  if (item.isArchived) return { key: 'archived', label: 'Archivado', bg: 'bg-surface-sunken', fg: 'text-subtle' }
  if (!item.isActive) return { key: 'paused', label: 'Pausado', bg: 'bg-ink-100', fg: 'text-ink-600' }
  if (item.forcePwChange) return { key: 'pending_sync', label: 'Pend. sync', bg: 'bg-info-100 dark:bg-info-100/[0.18]', fg: 'text-info-700' }
  return { key: 'active', label: 'Activo', bg: 'bg-success-100 dark:bg-success-100/[0.18]', fg: 'text-success-700' }
}

/**
 * DirRowCard — fila del directorio (vista lista). Espejo 1:1 de web `DirRowCard`:
 * anillo de adherencia con inicial + dot de última actividad, nombre + badge de
 * severidad, línea meta (adherencia mono · lastLabel · nutrición si riesgo · estado).
 */
export const DirRowCard = memo(function DirRowCard({
  item,
  theme,
  pulse,
  onOpen,
  onWhatsApp,
  onEdit,
  onShare,
  onWorkout,
  onNutrition,
  onReset,
  onToggle,
  onArchive,
  onDelete,
}: {
  item: DirectoryClient
  index: number
  theme: any
  pulse?: PulseRow
  onOpen: (c: DirectoryClient) => void
  onWhatsApp?: (c: DirectoryClient) => void
  onEdit?: (c: DirectoryClient) => void
  onShare?: (c: DirectoryClient) => void
  onWorkout?: (c: DirectoryClient) => void
  onNutrition?: (c: DirectoryClient) => void
  onReset?: (c: DirectoryClient) => void
  onToggle?: (c: DirectoryClient) => void
  onArchive?: (c: DirectoryClient) => void
  onDelete?: (c: DirectoryClient) => void
}) {
  const { branding } = useTheme()
  const [menu, setMenu] = useState(false)
  const sport500 = useMemo(() => resolveSportRamp(branding?.primaryColor).sport500, [branding?.primaryColor])
  // 1:1 web: la adherencia SIEMPRE muestra un valor (0% sin pulse), el anillo se
  // colorea por ese valor (0 → danger) y el badge de severidad SOLO aparece con pulse.
  const adherence = pulse?.percentage ?? 0
  const sev = severityMeta(pulse?.attentionScore ?? 0)
  const ringColor = adherence >= 75 ? sport500 : adherence >= 50 ? WARNING : DANGER
  // Sin fecha de entreno: label "—" + dot danger (1:1 web lastLabel(null)/lastDot(999)),
  // no el "Sin entrenos"/gris que devuelve lastInfo() para otros consumidores.
  const lastWorkout = pulse?.lastWorkoutDate
  const li = lastWorkout ? lastInfo(lastWorkout) : { label: '—', dot: DANGER }
  const nutritionPct = pulse?.nutritionPercentage ?? 0
  const nutriRisk = (pulse?.attentionFlags ?? []).includes('NUTRICION_RIESGO') || nutritionPct < 60
  const hasNutritionData = nutritionPct > 0
  const st = statusMeta(item)

  return (
    <View>
      <TouchableOpacity
        testID={`directory-row-${item.id}`}
        style={[styles.card, shadow('xs', theme.scheme), { backgroundColor: theme.card, borderColor: theme.border }]}
        onPress={() => onOpen(item)}
        activeOpacity={0.75}
      >
        {/* Anillo de adherencia con inicial + dot de última actividad */}
        <View style={styles.ringWrap}>
          <ProgressRing
            value={adherence}
            size={50}
            stroke={5}
            color={ringColor}
            showValue={false}
            label={
              <Text style={{ fontSize: 18, fontFamily: FONT.displayBlack, color: theme.foreground }}>
                {(item.fullName?.[0] ?? '?').toUpperCase()}
              </Text>
            }
          />
          <View style={[styles.lastDot, { backgroundColor: li.dot, borderColor: theme.card }]} />
        </View>

        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: theme.foreground }]} numberOfLines={1}>{item.fullName}</Text>
            {pulse ? (
              <View className={`${sev.bg} rounded-pill`} style={styles.severityPill}>
                <sev.Icon size={11} className={sev.fg} />
                <Text className={sev.fg} style={styles.severityText}>{sev.label}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.metricsRow}>
            <Text style={[styles.metricStrong, { color: theme.foreground }]}>{adherence}%</Text>
            <Text style={[styles.dotSep, { color: theme.ink300 }]}>·</Text>
            <Text style={[styles.metric, { color: theme.mutedForeground }]}>{li.label}</Text>
            {hasNutritionData && nutriRisk ? (
              <>
                <Text style={[styles.dotSep, { color: theme.ink300 }]}>·</Text>
                <View style={styles.nutritionMetric}>
                  <Apple size={12} className="text-ember-700" />
                  <Text className="text-ember-700" style={styles.metricNutri}>{nutritionPct}%</Text>
                </View>
              </>
            ) : null}
            {st.key !== 'active' ? (
              <View className={`${st.bg} rounded-pill`} style={styles.statusPill}>
                <Text className={st.fg} style={styles.statusText}>{st.label}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <TouchableOpacity
          testID={`directory-row-menu-${item.id}`}
          accessibilityRole="button"
          accessibilityLabel={`Acciones de ${item.fullName}`}
          hitSlop={8}
          onPress={(event) => { event.stopPropagation(); setMenu(true) }}
          style={styles.menuBtn}
        >
          <MoreVertical size={18} className="text-ink-700" />
        </TouchableOpacity>
      </TouchableOpacity>

      <ClientActionsSheet
        visible={menu}
        client={item}
        theme={theme}
        onClose={() => setMenu(false)}
        onProfile={() => onOpen(item)}
        onWhatsApp={onWhatsApp ? () => onWhatsApp(item) : undefined}
        onEdit={onEdit ? () => onEdit(item) : undefined}
        onShare={() => onShare?.(item)}
        onWorkout={() => onWorkout?.(item)}
        onNutrition={() => onNutrition?.(item)}
        onReset={() => onReset?.(item)}
        onToggle={() => onToggle?.(item)}
        onArchive={onArchive ? () => onArchive(item) : undefined}
        onDelete={() => onDelete?.(item)}
      />
    </View>
  )
})

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderWidth: 1,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  ringWrap: { position: 'relative', flexShrink: 0 },
  lastDot: { position: 'absolute', bottom: -1, right: -1, width: 13, height: 13, borderRadius: 7, borderWidth: 2 },
  info: { flex: 1, gap: 4, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  name: { fontSize: 15.5, fontFamily: FONT.displayBlack, letterSpacing: -0.39, flexShrink: 1 },
  severityPill: { height: 19, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, flexShrink: 0 },
  severityText: { fontSize: 10.5, fontFamily: FONT.uiBold },
  metricsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  metricStrong: { fontSize: 12, fontFamily: FONT.monoBold },
  metric: { fontSize: 12, fontFamily: FONT.ui },
  nutritionMetric: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metricNutri: { fontSize: 12, fontFamily: FONT.uiSemibold },
  dotSep: { fontSize: 12 },
  statusPill: { paddingHorizontal: 6, paddingVertical: 1 },
  statusText: { fontSize: 10.5, fontFamily: FONT.uiBold },
  menuBtn: { width: 36, height: 36, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
})
