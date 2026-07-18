import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Check, X } from 'lucide-react-native'
import { FONT } from '../../../lib/typography'
import type { DirectoryProgramFilter, DirectoryRiskFilter, StatusFilter } from '../../../lib/clients-directory'

/**
 * DirectoryFilterSheet — bottom-sheet de filtros con 3 grupos (Estado · Riesgo ·
 * Programa), espejo del `DirectoryActionBar` web (SheetCheckRow + footer "Ver
 * resultados"). Riesgo y Programa escriben el mismo `riskFilter` (modelo combinado
 * de RN); Estado escribe `statusFilter`. Toggle: reclick vuelve al valor neutro.
 */

const STATUS_ROWS: { v: StatusFilter; l: string }[] = [
  { v: 'active', l: 'Activo' },
  { v: 'paused', l: 'Pausado' },
  { v: 'pending_sync', l: 'Pendiente sync' },
  { v: 'archived', l: 'Archivados' },
]
const RISK_ROWS: { v: DirectoryRiskFilter; l: string }[] = [
  { v: 'urgent', l: 'Atención urgente' },
  { v: 'review', l: 'En riesgo' },
  { v: 'on_track', l: 'On track' },
  { v: 'nutrition_low', l: 'Nutrición baja (<60%)' },
]
const PROGRAM_ROWS: { v: DirectoryProgramFilter; l: string }[] = [
  { v: 'with_program', l: 'Con programa' },
  { v: 'no_program', l: 'Sin programa' },
  { v: 'expired_program', l: 'Vencido' },
]

function CheckRow({
  label,
  active,
  badge,
  onPress,
  theme,
  testID,
}: {
  label: string
  active: boolean
  badge?: number
  onPress: () => void
  theme: any
  testID?: string
}) {
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: active }}
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.row, { backgroundColor: active ? theme.muted : 'transparent' }]}
    >
      <View style={{ width: 18 }}>{active ? <Check size={15} className="text-sport-600" /> : null}</View>
      <Text style={[styles.rowLabel, { color: theme.foreground, fontFamily: active ? FONT.uiBold : FONT.uiMedium }]}>
        {label}
      </Text>
      {badge != null && badge > 0 ? (
        <View className="bg-surface-sunken" style={styles.badge}>
          <Text className="text-subtle" style={styles.badgeTxt}>{badge}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  )
}

export function DirectoryFilterSheet({
  visible,
  onClose,
  theme,
  statusFilter,
  onStatusChange,
  riskFilter,
  onRiskChange,
  programFilter,
  onProgramChange,
  archivedCount = 0,
}: {
  visible: boolean
  onClose: () => void
  theme: any
  statusFilter: StatusFilter
  onStatusChange: (v: StatusFilter) => void
  riskFilter: DirectoryRiskFilter
  onRiskChange: (v: DirectoryRiskFilter) => void
  programFilter: DirectoryProgramFilter
  onProgramChange: (v: DirectoryProgramFilter) => void
  archivedCount?: number
}) {
  const { height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View accessibilityViewIsModal accessibilityLabel="Filtros" style={[styles.sheet, { backgroundColor: theme.card, maxHeight: Math.min(height * 0.85, 620), paddingBottom: 28 + insets.bottom }]}>
        <View style={[styles.handle, { backgroundColor: theme.border }]} />
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cerrar filtros" onPress={onClose} style={[styles.closeBtn, { backgroundColor: theme.muted, borderColor: theme.border }]}>
          <X size={16} className="text-strong" />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.foreground }]}>Filtros</Text>

        <ScrollView style={styles.contentScroll} showsVerticalScrollIndicator={false}>
          <Text className="text-subtle" style={styles.groupLabel}>Estado</Text>
          {STATUS_ROWS.map((it) => (
            <CheckRow
              key={it.v}
              testID={`directory-filter-estado-${it.v}`}
              theme={theme}
              label={it.l}
              badge={it.v === 'archived' ? archivedCount : undefined}
              active={statusFilter === it.v}
              onPress={() => onStatusChange(statusFilter === it.v ? 'any' : it.v)}
            />
          ))}

          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <Text className="text-subtle" style={styles.groupLabel}>Riesgo</Text>
          {RISK_ROWS.map((it) => (
            <CheckRow
              key={it.v}
              testID={`directory-filter-riesgo-${it.v}`}
              theme={theme}
              label={it.l}
              active={riskFilter === it.v}
              onPress={() => onRiskChange(riskFilter === it.v ? 'all' : it.v)}
            />
          ))}

          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <Text className="text-subtle" style={styles.groupLabel}>Programa</Text>
          {PROGRAM_ROWS.map((it) => (
            <CheckRow
              key={it.v}
              testID={`directory-filter-programa-${it.v}`}
              theme={theme}
              label={it.l}
              active={programFilter === it.v}
              onPress={() => onProgramChange(programFilter === it.v ? 'all' : it.v)}
            />
          ))}
        </ScrollView>

        <TouchableOpacity
          testID="directory-filter-apply"
          accessibilityRole="button"
          className="bg-cta-fill"
          style={styles.footerBtn}
          onPress={onClose}
          activeOpacity={0.9}
        >
          <Text className="text-text-on-sport" style={styles.footerBtnTxt}>Ver resultados</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  closeBtn: { position: 'absolute', right: 16, top: 12, zIndex: 2, width: 32, height: 32, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, marginBottom: 6, paddingHorizontal: 4, fontFamily: FONT.displayBold, letterSpacing: -0.36 },
  contentScroll: { flexShrink: 1 },
  groupLabel: { fontSize: 10.5, fontFamily: FONT.uiBold, textTransform: 'uppercase', letterSpacing: 0.63, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  rowLabel: { flex: 1, fontSize: 13.5 },
  badge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  badgeTxt: { fontSize: 11, fontFamily: FONT.uiBold },
  divider: { height: StyleSheet.hairlineWidth, marginVertical: 6, marginHorizontal: 4 },
  footerBtn: { marginTop: 12, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  footerBtnTxt: { fontSize: 15, fontFamily: FONT.uiBold },
})
