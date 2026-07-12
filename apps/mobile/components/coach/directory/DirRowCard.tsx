import { memo, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Apple, MoreVertical } from 'lucide-react-native'
import { MotiView } from 'moti'
import { Badge } from '../../Badge'
import { ProgressRing } from '../../ProgressRing'
import { ClientActionsSheet } from './ClientActionsSheet'
import { FONT } from '../../../lib/typography'
import { shadow } from '../../../lib/shadows'
import type { DirectoryClient, PulseRow } from '../../../lib/clients-directory'
import { DANGER, SEV_HEX, WARNING, lastInfo, severityMeta, statusMeta } from './directory-shared'

/**
 * DirRowCard — fila del directorio (vista lista). Espejo 1:1 de web `DirRowCard`:
 * anillo de adherencia con inicial + dot de última actividad, nombre + badge de
 * severidad, línea meta (adherencia mono · lastLabel · nutrición si riesgo · estado).
 */
export const DirRowCard = memo(function DirRowCard({
  item,
  index,
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
  const [menu, setMenu] = useState(false)
  // 1:1 web: la adherencia SIEMPRE muestra un valor (0% sin pulse), el anillo se
  // colorea por ese valor (0 → danger) y el badge de severidad SOLO aparece con pulse.
  const adherence = pulse?.percentage ?? 0
  const sev = severityMeta(pulse?.attentionScore ?? 0)
  const ringColor = adherence >= 75 ? theme.primary : adherence >= 50 ? WARNING : DANGER
  // Sin fecha de entreno: label "—" + dot danger (1:1 web lastLabel(null)/lastDot(999)),
  // no el "Sin entrenos"/gris que devuelve lastInfo() para otros consumidores.
  const lastWorkout = pulse?.lastWorkoutDate
  const li = lastWorkout ? lastInfo(lastWorkout) : { label: '—', dot: DANGER }
  const nutritionPct = pulse?.nutritionPercentage ?? 0
  const nutriRisk = (pulse?.attentionFlags ?? []).includes('NUTRICION_RIESGO') || nutritionPct < 60
  const hasNutritionData = nutritionPct > 0
  const st = statusMeta(item)
  // Separador "·" = border-strong (mas fuerte que border), scheme-aware (1:1 web).
  const sepColor = theme.scheme === 'dark' ? 'rgba(255,255,255,0.22)' : '#A8B1BD'
  // Nutricion en riesgo = ember-700 scheme-aware (1:1 web text-[var(--ember-700)],
  // globals.css light :357 #C23E14 / dark :631 #FFB79E) — mismo patron que sepColor.
  const emberFg = theme.scheme === 'dark' ? '#FFB79E' : '#C23E14'

  return (
    <MotiView
      from={{ opacity: 0, translateY: 10 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 300, delay: Math.min(index * 40, 320) }}
    >
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
              <Badge tone={sev.tone} variant="soft" size="sm" icon={<sev.Icon size={11} color={SEV_HEX[sev.tone]} />}>{sev.label}</Badge>
            ) : null}
          </View>
          <View style={styles.metricsRow}>
            <Text style={[styles.metricStrong, { color: theme.foreground }]}>{adherence}%</Text>
            <Text style={[styles.dotSep, { color: sepColor }]}>·</Text>
            <Text style={[styles.metric, { color: theme.mutedForeground }]}>{li.label}</Text>
            {hasNutritionData && nutriRisk ? (
              <>
                <Text style={[styles.dotSep, { color: sepColor }]}>·</Text>
                <Apple size={12} color={emberFg} />
                <Text style={[styles.metricNutri, { color: emberFg }]}>{nutritionPct}%</Text>
              </>
            ) : null}
            {st.key !== 'active' ? (
              <View style={{ marginLeft: 2 }}>
                <Badge tone={st.tone} variant="soft" size="sm">{st.label}</Badge>
              </View>
            ) : null}
          </View>
        </View>

        <TouchableOpacity
          testID={`directory-row-menu-${item.id}`}
          accessibilityRole="button"
          accessibilityLabel={`Acciones de ${item.fullName}`}
          hitSlop={8}
          onPress={() => setMenu(true)}
          style={styles.menuBtn}
        >
          <MoreVertical size={18} color={theme.mutedForeground} />
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
    </MotiView>
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
  metricsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  metricStrong: { fontSize: 12, fontFamily: FONT.monoBold },
  metric: { fontSize: 12, fontFamily: FONT.uiMedium },
  metricNutri: { fontSize: 12, fontFamily: FONT.uiSemibold },
  dotSep: { fontSize: 12 },
  menuBtn: { padding: 2, marginRight: -2 },
})
