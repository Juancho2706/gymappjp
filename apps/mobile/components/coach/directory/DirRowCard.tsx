import { memo, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Apple, MoreVertical } from 'lucide-react-native'
import { MotiView } from 'moti'
import { Badge } from '../../Badge'
import { ProgressRing } from '../../ProgressRing'
import { ClientActionsSheet } from './ClientActionsSheet'
import { FONT } from '../../../lib/typography'
import type { DirectoryClient, PulseRow } from '../../../lib/clients-directory'
import { DANGER, EMBER, SEV_HEX, WARNING, lastInfo, severityMeta, statusMeta } from './directory-shared'

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
  onShare,
  onWorkout,
  onNutrition,
  onReset,
  onToggle,
  onDelete,
}: {
  item: DirectoryClient
  index: number
  theme: any
  pulse?: PulseRow
  onOpen: (c: DirectoryClient) => void
  onWhatsApp?: (c: DirectoryClient) => void
  onShare?: (c: DirectoryClient) => void
  onWorkout?: (c: DirectoryClient) => void
  onNutrition?: (c: DirectoryClient) => void
  onReset?: (c: DirectoryClient) => void
  onToggle?: (c: DirectoryClient) => void
  onDelete?: (c: DirectoryClient) => void
}) {
  const [menu, setMenu] = useState(false)
  const adherence = pulse?.percentage ?? null
  const score = pulse?.attentionScore ?? item.attentionScore
  const sev = severityMeta(score)
  const ringColor = adherence == null ? theme.border : adherence >= 75 ? theme.primary : adherence >= 50 ? WARNING : DANGER
  const li = lastInfo(pulse?.lastWorkoutDate ?? item.lastWorkoutDate)
  const nutri = pulse?.nutritionPercentage ?? 0
  const nutriRisk = (pulse?.attentionFlags?.includes('NUTRICION_RIESGO') ?? false) || (nutri > 0 && nutri < 60)
  const st = statusMeta(item)
  // Separador "·" = border-strong (mas fuerte que border), scheme-aware (1:1 web).
  const sepColor = theme.scheme === 'dark' ? 'rgba(255,255,255,0.22)' : '#A8B1BD'

  return (
    <MotiView
      from={{ opacity: 0, translateY: 10 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 300, delay: Math.min(index * 40, 320) }}
    >
      <TouchableOpacity
        testID={`directory-row-${item.id}`}
        style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
        onPress={() => onOpen(item)}
        activeOpacity={0.75}
      >
        {/* Anillo de adherencia con inicial + dot de última actividad */}
        <View style={styles.ringWrap}>
          <ProgressRing
            value={adherence ?? 0}
            size={50}
            stroke={5}
            color={ringColor}
            showValue={false}
            label={
              <Text style={{ fontSize: 18, fontFamily: FONT.displayBlack, color: theme.foreground }}>
                {item.fullName.charAt(0).toUpperCase()}
              </Text>
            }
          />
          <View style={[styles.lastDot, { backgroundColor: li.dot, borderColor: theme.card }]} />
        </View>

        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: theme.foreground }]} numberOfLines={1}>{item.fullName}</Text>
            <Badge tone={sev.tone} variant="soft" size="sm" icon={<sev.Icon size={11} color={SEV_HEX[sev.tone]} />}>{sev.label}</Badge>
          </View>
          <View style={styles.metricsRow}>
            {adherence != null ? (
              <Text style={[styles.metricStrong, { color: theme.foreground }]}>{adherence}%</Text>
            ) : null}
            {adherence != null ? <Text style={[styles.dotSep, { color: sepColor }]}>·</Text> : null}
            <Text style={[styles.metric, { color: theme.mutedForeground }]}>{li.label}</Text>
            {nutriRisk ? (
              <>
                <Text style={[styles.dotSep, { color: sepColor }]}>·</Text>
                <Apple size={12} color={EMBER} />
                <Text style={[styles.metric, { color: EMBER }]}>{nutri}%</Text>
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
        onShare={() => onShare?.(item)}
        onWorkout={() => onWorkout?.(item)}
        onNutrition={() => onNutrition?.(item)}
        onReset={() => onReset?.(item)}
        onToggle={() => onToggle?.(item)}
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
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 7, minWidth: 0 },
  name: { fontSize: 15.5, fontFamily: FONT.displayBlack, letterSpacing: -0.155, flexShrink: 1 },
  metricsRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flexWrap: 'wrap' },
  metricStrong: { fontSize: 12, fontFamily: FONT.monoBold },
  metric: { fontSize: 12, fontFamily: FONT.uiMedium },
  dotSep: { fontSize: 12 },
  menuBtn: { padding: 2, marginRight: -2 },
})
