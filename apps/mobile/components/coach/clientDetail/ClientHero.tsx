import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { MotiView } from 'moti'
import { AlertTriangle, Clock, FileText, Flame, MessageCircle } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Avatar, Badge, Card } from '../../../components'

export interface HeroChip { icon: any; label: string; value: string; color?: string }

// Fixed inverse-surface neutrals (token-contract §2/§3 — same in light & dark,
// since the hero Card is always a dark ink surface). Mirrors StatCard internals.
const TEXT_ON_DARK = '#F4F6F8' // ink-50
const TEXT_ON_DARK_MUTED = '#939DAB'
const DANGER_ON_DARK = '#FF9CB0' // danger-700 (dark) — legible on the ink hero
const FLAME = '#F5A524' // warning-500 (streak)

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
    >
      <Card variant="inverse" padding={18} radius="card" style={styles.card}>
        <View style={styles.top}>
          <Avatar name={name} size="lg" ring="sport" />
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Text numberOfLines={1} style={[styles.name, { color: TEXT_ON_DARK }]}>{name}</Text>
            <Text numberOfLines={1} style={[styles.email, { color: TEXT_ON_DARK_MUTED }]}>{email}</Text>
            <View style={styles.metaRow}>
              <Badge label={statusLabel} tone={statusTone === 'success' ? 'success' : 'neutral'} />
              <View style={styles.metaItem}>
                <Clock size={11} color={TEXT_ON_DARK_MUTED} />
                <Text style={[styles.metaTxt, { color: TEXT_ON_DARK_MUTED }]}>{trainingAge}</Text>
              </View>
              {streak > 0 ? (
                <View style={styles.metaItem}>
                  <Flame size={11} color={FLAME} />
                  <Text style={[styles.metaTxt, { color: FLAME, fontFamily: 'HankenGrotesk_700Bold' }]}>{streak}d racha</Text>
                </View>
              ) : null}
            </View>
          </View>
        </View>

        {attention ? (
          <View style={styles.attention}>
            <AlertTriangle size={14} color={DANGER_ON_DARK} />
            <Text style={[styles.attentionTxt, { color: DANGER_ON_DARK }]}>{attention}</Text>
          </View>
        ) : null}

        <View style={styles.chips}>
          {chips.map((c, i) => {
            const Icon = c.icon
            return (
              <View key={i} className="border border-inverse rounded-md" style={styles.chip}>
                <View style={styles.chipTop}>
                  <Icon size={13} color={c.color ?? theme.primary} />
                  <Text style={[styles.chipLabel, { color: TEXT_ON_DARK_MUTED }]} numberOfLines={1}>{c.label}</Text>
                </View>
                <Text style={[styles.chipVal, { color: c.color ?? TEXT_ON_DARK }]} numberOfLines={1}>{c.value}</Text>
              </View>
            )
          })}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity activeOpacity={0.85} onPress={onWhatsApp} style={[styles.actionBtn, { backgroundColor: '#25D36622', borderColor: '#25D36655' }]}>
            <MessageCircle size={16} color="#25D366" />
            <Text style={[styles.actionTxt, { color: '#25D366' }]}>WhatsApp</Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={0.85} onPress={onExportPdf} disabled={exporting} style={[styles.actionBtn, { backgroundColor: theme.primary + '26', borderColor: theme.primary + '55', opacity: exporting ? 0.6 : 1 }]}>
            <FileText size={16} color={theme.primary} />
            <Text style={[styles.actionTxt, { color: theme.primary }]}>{exporting ? 'Generando…' : 'Export PDF'}</Text>
          </TouchableOpacity>
        </View>
      </Card>
    </MotiView>
  )
}

const styles = StyleSheet.create({
  card: { gap: 14 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  name: { fontSize: 19, letterSpacing: -0.3, fontFamily: 'Archivo_800ExtraBold' },
  email: { fontSize: 12.5, fontFamily: 'HankenGrotesk_400Regular' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaTxt: { fontSize: 11, fontFamily: 'HankenGrotesk_400Regular' },
  attention: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: 'rgba(244,54,90,0.14)', borderColor: 'rgba(244,54,90,0.40)' },
  attentionTxt: { fontSize: 12, flex: 1, fontFamily: 'HankenGrotesk_600SemiBold' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { width: '47%', flexGrow: 1, backgroundColor: 'rgba(255,255,255,0.07)', paddingVertical: 9, paddingHorizontal: 10, gap: 3, alignItems: 'flex-start' },
  chipTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chipLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4, fontFamily: 'HankenGrotesk_600SemiBold' },
  chipVal: { fontSize: 16, letterSpacing: -0.2, fontFamily: 'Archivo_900Black', fontVariant: ['tabular-nums'] },
  actions: { flexDirection: 'row', gap: 10 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 11, borderWidth: 1, borderRadius: 14 },
  actionTxt: { fontSize: 13, fontFamily: 'HankenGrotesk_700Bold' },
})
