import { useState } from 'react'
import { Dimensions, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Apple, Dumbbell, Eye, MoreVertical, Pause, Play, Share2, Smartphone, Star, Trash2, KeyRound } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { Sparkline } from '../Sparkline'
import { ProgressRing } from '../ProgressRing'
import { Badge, type BadgeTone } from '../Badge'
import { Card } from '../Card'
import { FONT } from '../../lib/typography'
import { subscriptionDaysRemaining, type DirectoryClient, type PulseRow } from '../../lib/clients-directory'
import { DANGER, SUCCESS, WARNING } from './directory/directory-shared'

/** Altura fija de la card (modo cards) — usada por la animación de stack. */
export const CLIENT_CARD_HEIGHT = 362
const CONTENT_W = Dimensions.get('window').width - 32 - 28 // pantalla - margen lista - padding card

interface Props {
  client: DirectoryClient
  pulse?: PulseRow
  onPress: () => void
  onWhatsApp?: () => void
  onShareLogin: () => void
  onToggleStatus: () => void
  onResetPw: () => void
  onDelete: () => void
  onWorkout: () => void
  onNutrition: () => void
}

function lastLog(date: string | null): { label: string; days: number } {
  if (!date) return { label: 'Sin datos', days: 999 }
  const days = Math.floor((Date.now() - new Date(date).getTime()) / 86400000)
  if (days <= 0) return { label: 'Hoy', days: 0 }
  if (days === 1) return { label: 'Ayer', days: 1 }
  return { label: `Hace ${days}d`, days }
}

function attentionMeta(score: number, streak: number): { label: string; tone: BadgeTone } {
  if (score >= 50) return { label: 'Urgente', tone: 'danger' }
  if (score >= 25) return { label: 'Revisar', tone: 'warning' }
  if (score === 0 && streak > 10) return { label: 'Destacado', tone: 'ember' }
  return { label: 'On track', tone: 'success' }
}

export function ClientCard({ client, pulse, onPress, onWhatsApp, onShareLogin, onToggleStatus, onResetPw, onDelete, onWorkout, onNutrition }: Props) {
  const { theme } = useTheme()
  const [menu, setMenu] = useState(false)
  const adherence = pulse?.percentage ?? 0
  const ringColor = adherence > 80 ? SUCCESS : adherence > 50 ? WARNING : DANGER
  const att = attentionMeta(pulse?.attentionScore ?? client.attentionScore, pulse?.streak ?? 0)
  const ll = lastLog(pulse?.lastWorkoutDate ?? client.lastWorkoutDate)
  const llDot = ll.days < 3 ? SUCCESS : ll.days < 7 ? WARNING : DANGER
  const stars = pulse?.latestEnergyLevel != null ? Math.min(5, Math.max(0, Math.round(pulse.latestEnergyLevel / 2))) : 0
  const weightVals = (pulse?.weightHistory30d ?? []).map((d) => d.value)
  const nutri = pulse?.nutritionPercentage ?? 0
  const nutriRisk = pulse?.attentionFlags?.includes('NUTRICION_RIESGO') ?? false
  const subDays = subscriptionDaysRemaining(client.subscriptionStartDate)
  const weekCur = pulse?.planCurrentWeek, weekTot = pulse?.planTotalWeeks

  const menuItems = [
    { key: 'share', icon: Share2, label: 'Compartir acceso', on: () => { setMenu(false); onShareLogin() } },
    { key: 'toggle', icon: client.isActive ? Pause : Play, label: client.isActive ? 'Pausar alumno' : 'Activar alumno', on: () => { setMenu(false); onToggleStatus() } },
    { key: 'reset', icon: KeyRound, label: 'Reset contraseña', on: () => { setMenu(false); onResetPw() } },
    { key: 'delete', icon: Trash2, label: 'Eliminar', on: () => { setMenu(false); onDelete() }, danger: true },
  ]

  return (
    <Card padding={14} radius="card" style={{ ...styles.card, height: CLIENT_CARD_HEIGHT }}>
      {/* Header */}
      <View style={styles.headerRow}>
        <ProgressRing
          value={adherence}
          size={56}
          stroke={5}
          color={ringColor}
          showValue={false}
          label={
            <Text style={{ fontSize: 20, fontFamily: FONT.displayBlack, color: theme.foreground }}>
              {(client.fullName?.[0] ?? '?').toUpperCase()}
            </Text>
          }
        />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.nameRow}>
            <Text numberOfLines={1} style={[styles.name, { color: theme.foreground, fontFamily: FONT.displayBold }]} onPress={onPress} testID="client-card-name">{client.fullName}</Text>
            <Badge tone={att.tone} variant="soft" size="sm">{att.label}</Badge>
          </View>
          <Text numberOfLines={1} style={[styles.email, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>{client.email}</Text>
        </View>
        <TouchableOpacity testID="client-card-menu" onPress={() => setMenu(true)} hitSlop={8} style={styles.menuBtn}><MoreVertical size={20} color={theme.mutedForeground} /></TouchableOpacity>
      </View>

      {/* Mini-stats */}
      <View style={styles.statsRow}>
        <Mini theme={theme} label="Adherencia" value={`${adherence}%`} />
        <Mini theme={theme} label="Peso hoy" value={pulse?.currentWeight != null ? `${pulse.currentWeight}` : '—'} sub={pulse?.weightDelta7d != null ? `${pulse.weightDelta7d > 0 ? '↑' : pulse.weightDelta7d < 0 ? '↓' : ''}${Math.abs(pulse.weightDelta7d)} 7d` : undefined} />
        <View style={[styles.mini, { borderColor: theme.border }]}>
          <Text style={[styles.miniLabel, { color: theme.mutedForeground }]}>Energía</Text>
          <View style={{ flexDirection: 'row', gap: 1, marginTop: 2 }}>
            {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={11} color={WARNING} fill={i <= stars ? WARNING : 'transparent'} />)}
          </View>
        </View>
        <View style={[styles.mini, { borderColor: theme.border }]}>
          <Text style={[styles.miniLabel, { color: theme.mutedForeground }]}>Último log</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: llDot }} />
            <Text style={[styles.miniVal, { color: theme.foreground }]}>{ll.label}</Text>
          </View>
        </View>
      </View>

      {/* Sparklines */}
      <View style={styles.sparkRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sparkLabel, { color: theme.mutedForeground }]}>Peso (30d)</Text>
          {weightVals.length >= 2 ? <Sparkline values={weightVals} width={CONTENT_W / 2 - 6} height={28} color={theme.cyan} /> : <Text style={[styles.sparkEmpty, { color: theme.mutedForeground }]}>Sin datos</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sparkLabel, { color: theme.mutedForeground }]}>Adherencia (4 sem)</Text>
          {(pulse?.adherenceHistory4w?.length ?? 0) >= 2 ? <Sparkline values={pulse!.adherenceHistory4w} width={CONTENT_W / 2 - 6} height={28} color={SUCCESS} /> : <Text style={[styles.sparkEmpty, { color: theme.mutedForeground }]}>Sin datos</Text>}
        </View>
      </View>

      {/* Programa (con barra de progreso de semanas) */}
      {client.activeProgramName ? (
        <View style={[styles.block, { backgroundColor: theme.primary + '10', borderColor: theme.primary + '22' }]}>
          <View style={styles.blockTop}>
            <Dumbbell size={12} color={theme.primary} />
            <Text numberOfLines={1} style={[styles.blockName, { color: theme.foreground }]}>{client.activeProgramName}</Text>
            <Text style={[styles.blockDim, { color: theme.foreground }]}>Sem {weekCur ?? '—'}/{weekTot ?? '—'}</Text>
          </View>
          <Bar value={weekTot && weekTot > 0 ? Math.min(1, (weekCur ?? 0) / weekTot) : 0} color={theme.primary} theme={theme} />
        </View>
      ) : (
        <View style={[styles.metaPill, { borderColor: theme.border, borderStyle: 'dashed' }]}>
          <Text style={[styles.metaDim, { color: theme.mutedForeground }]}>Sin programa</Text>
        </View>
      )}

      {/* Nutrición (barra de adherencia) */}
      {nutri > 0 ? (
        <View style={[styles.block, { backgroundColor: (nutriRisk ? DANGER : SUCCESS) + '12', borderColor: (nutriRisk ? DANGER : SUCCESS) + '28' }]}>
          <View style={styles.blockTop}>
            <Apple size={12} color={nutriRisk ? DANGER : SUCCESS} />
            <Text numberOfLines={1} style={[styles.blockName, { color: nutriRisk ? DANGER : theme.foreground }]}>{nutriRisk ? 'Baja adherencia nutricional' : 'Nutrición'}</Text>
            <Text style={[styles.blockDim, { color: nutriRisk ? DANGER : theme.foreground }]}>{nutri}%</Text>
          </View>
          <Bar value={Math.min(1, nutri / 100)} color={nutriRisk ? DANGER : SUCCESS} theme={theme} />
        </View>
      ) : null}

      {subDays != null ? (
        <Text style={[styles.subTxt, { color: subDays <= 5 ? DANGER : theme.mutedForeground }]}>Suscripción: {subDays > 0 ? `${subDays}d restantes` : 'vencida'}</Text>
      ) : null}

      {/* Footer actions */}
      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        {onWhatsApp ? <FootBtn testID="client-card-whatsapp" theme={theme} icon={Smartphone} label="WA" color={SUCCESS} onPress={onWhatsApp} /> : null}
        <FootBtn testID="client-card-profile" theme={theme} icon={Eye} label="Perfil" onPress={onPress} />
        <FootBtn testID="client-card-workout" theme={theme} icon={Dumbbell} label="Entreno" onPress={onWorkout} />
        <FootBtn testID="client-card-nutrition" theme={theme} icon={Apple} label="Nutri" onPress={onNutrition} />
      </View>

      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenu(false)}>
          <View style={[styles.menuCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {menuItems.map((it) => {
              const Icon = it.icon
              const c = it.danger ? theme.destructive : theme.foreground
              return (
                <TouchableOpacity key={it.key} testID={`client-card-action-${it.key}`} onPress={it.on} activeOpacity={0.8} style={styles.menuItem}>
                  <Icon size={17} color={c} />
                  <Text style={[styles.menuItemTxt, { color: c, fontFamily: FONT.uiSemibold }]}>{it.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </Pressable>
      </Modal>
    </Card>
  )
}

function Bar({ value, color, theme }: { value: number; color: string; theme: any }) {
  return (
    <View style={[styles.barTrack, { backgroundColor: theme.muted }]}>
      <View style={{ height: '100%', borderRadius: 99, width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`, backgroundColor: color }} />
    </View>
  )
}

function Mini({ theme, label, value, sub }: { theme: any; label: string; value: string; sub?: string }) {
  return (
    <View style={[styles.mini, { borderColor: theme.border }]}>
      <Text style={[styles.miniLabel, { color: theme.mutedForeground }]}>{label}</Text>
      <Text style={[styles.miniVal, { color: theme.foreground }]} numberOfLines={1}>{value}</Text>
      {sub ? <Text style={[styles.miniSub, { color: theme.mutedForeground }]} numberOfLines={1}>{sub}</Text> : null}
    </View>
  )
}

function FootBtn({ theme, icon: Icon, label, color, onPress, testID }: { theme: any; icon: any; label: string; color?: string; onPress: () => void; testID?: string }) {
  return (
    <TouchableOpacity testID={testID} onPress={onPress} activeOpacity={0.8} style={[styles.footBtn, { borderColor: theme.border, backgroundColor: color ? color + '14' : 'transparent' }]}>
      <Icon size={14} color={color ?? theme.foreground} />
      <Text style={[styles.footTxt, { color: color ?? theme.foreground, fontFamily: FONT.uiBold }]}>{label}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: { gap: 9, overflow: 'hidden' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 15, flexShrink: 1, letterSpacing: -0.2 },
  email: { fontSize: 11, marginTop: 1 },
  menuBtn: { padding: 2 },
  statsRow: { flexDirection: 'row', gap: 6 },
  mini: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 6, gap: 1 },
  miniLabel: { fontSize: 8, fontFamily: FONT.uiBold, textTransform: 'uppercase', letterSpacing: 0.4 },
  miniVal: { fontSize: 14, fontFamily: FONT.displayBold },
  miniSub: { fontSize: 9 },
  sparkRow: { flexDirection: 'row', gap: 10 },
  sparkLabel: { fontSize: 8, fontFamily: FONT.uiBold, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  sparkEmpty: { fontSize: 10, height: 28, textAlignVertical: 'center' },
  metaPill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  metaDim: { fontSize: 10, marginLeft: 'auto', fontFamily: FONT.uiSemibold },
  block: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, gap: 5 },
  blockTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  blockName: { fontSize: 11.5, fontFamily: FONT.uiSemibold, flexShrink: 1 },
  blockDim: { fontSize: 10.5, marginLeft: 'auto', fontFamily: FONT.displayBold },
  barTrack: { height: 5, borderRadius: 99, overflow: 'hidden' },
  subTxt: { fontSize: 10, fontFamily: FONT.uiSemibold, textTransform: 'uppercase', letterSpacing: 0.3 },
  footer: { flexDirection: 'row', gap: 6, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 9, marginTop: 'auto' },
  footBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderRadius: 10, paddingVertical: 8 },
  footTxt: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  menuCard: { width: '100%', maxWidth: 280, borderWidth: 1, borderRadius: 14, paddingVertical: 6 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  menuItemTxt: { fontSize: 14 },
})
