import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { MotiView } from 'moti'
import { AlertTriangle, Clock, FileText, Flame, MessageCircle, User } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Badge } from '../../../components'

export interface HeroChip { icon: any; label: string; value: string; color?: string }

export function ClientHero({
  name,
  email,
  statusLabel,
  statusTone,
  attention,
  trainingAge,
  streak,
  chips,
  onWhatsApp,
  onExportPdf,
  exporting,
}: {
  name: string
  email: string
  statusLabel: string
  statusTone: 'success' | 'muted'
  attention?: string | null
  trainingAge: string
  streak: number
  chips: HeroChip[]
  onWhatsApp: () => void
  onExportPdf: () => void
  exporting?: boolean
}) {
  const { theme } = useTheme()
  return (
    <MotiView
      from={{ opacity: 0, translateY: 12 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 360 }}
      style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}
    >
      <View style={styles.top}>
        <View style={[styles.avatar, { backgroundColor: theme.primary + '1A', borderColor: theme.primary + '33', borderRadius: theme.radius['2xl'] }]}>
          <User size={26} color={theme.primary} strokeWidth={1.75} />
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text numberOfLines={1} style={[styles.name, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{name}</Text>
          <Text numberOfLines={1} style={[styles.email, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{email}</Text>
          <View style={styles.metaRow}>
            <Badge label={statusLabel} tone={statusTone} />
            <View style={styles.metaItem}>
              <Clock size={11} color={theme.mutedForeground} />
              <Text style={[styles.metaTxt, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{trainingAge}</Text>
            </View>
            {streak > 0 ? (
              <View style={styles.metaItem}>
                <Flame size={11} color="#F59E0B" />
                <Text style={[styles.metaTxt, { color: '#F59E0B', fontFamily: 'Inter_700Bold' }]}>{streak}d racha</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      {attention ? (
        <View style={[styles.attention, { backgroundColor: theme.destructive + '14', borderColor: theme.destructive + '40' }]}>
          <AlertTriangle size={14} color={theme.destructive} />
          <Text style={[styles.attentionTxt, { color: theme.destructive, fontFamily: 'Inter_600SemiBold' }]}>{attention}</Text>
        </View>
      ) : null}

      <View style={styles.chips}>
        {chips.map((c, i) => {
          const Icon = c.icon
          return (
            <View key={i} style={[styles.chip, { backgroundColor: theme.secondary, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
              <Icon size={13} color={c.color ?? theme.primary} />
              <Text style={[styles.chipVal, { color: c.color ?? theme.foreground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={1}>{c.value}</Text>
              <Text style={[styles.chipLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>{c.label}</Text>
            </View>
          )
        })}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity activeOpacity={0.85} onPress={onWhatsApp} style={[styles.actionBtn, { backgroundColor: '#25D36618', borderColor: '#25D36644', borderRadius: theme.radius.lg }]}>
          <MessageCircle size={16} color="#25D366" />
          <Text style={[styles.actionTxt, { color: '#25D366', fontFamily: 'Inter_700Bold' }]}>WhatsApp</Text>
        </TouchableOpacity>
        <TouchableOpacity activeOpacity={0.85} onPress={onExportPdf} disabled={exporting} style={[styles.actionBtn, { backgroundColor: theme.primary + '18', borderColor: theme.primary + '44', borderRadius: theme.radius.lg, opacity: exporting ? 0.6 : 1 }]}>
          <FileText size={16} color={theme.primary} />
          <Text style={[styles.actionTxt, { color: theme.primary, fontFamily: 'Inter_700Bold' }]}>{exporting ? 'Generando…' : 'Export PDF'}</Text>
        </TouchableOpacity>
      </View>
    </MotiView>
  )
}

const styles = StyleSheet.create({
  card: { padding: 18, borderWidth: 1, gap: 14 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  name: { fontSize: 19, letterSpacing: -0.3 },
  email: { fontSize: 12.5 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaTxt: { fontSize: 11 },
  attention: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  attentionTxt: { fontSize: 12, flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { width: '47%', flexGrow: 1, borderWidth: 1, paddingVertical: 9, paddingHorizontal: 10, gap: 2, alignItems: 'flex-start' },
  chipVal: { fontSize: 15, letterSpacing: -0.2 },
  chipLabel: { fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.4 },
  actions: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 11, borderWidth: 1 },
  actionTxt: { fontSize: 13 },
})
