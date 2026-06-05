import { useState } from 'react'
import { Dimensions, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { Apple, Dumbbell, Eye, MoreVertical, Pause, Play, Share2, Smartphone, Star, Trash2, KeyRound } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { Sparkline } from '../Sparkline'
import { subscriptionDaysRemaining, type DirectoryClient, type PulseRow } from '../../lib/clients-directory'

/** Altura fija de la card (modo cards) — usada por la animación de stack. */
export const CLIENT_CARD_HEIGHT = 326
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

function AdherenceRing({ pct, initial, color, theme }: { pct: number; initial: string; color: string; theme: any }) {
  const size = 60, stroke = 5, r = (size - stroke) / 2, circ = 2 * Math.PI * r
  const dash = (Math.min(100, Math.max(0, pct)) / 100) * circ
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={theme.border} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      <Text style={{ fontSize: 20, fontFamily: 'Montserrat_800ExtraBold', color: theme.foreground }}>{initial}</Text>
    </View>
  )
}

function attentionMeta(score: number, streak: number): { label: string; color: string } {
  if (score >= 50) return { label: 'Urgente', color: '#EF4444' }
  if (score >= 25) return { label: 'Revisar', color: '#F59E0B' }
  if (score === 0 && streak > 10) return { label: 'Destacado', color: '#F59E0B' }
  return { label: 'On track', color: '#10B981' }
}

export function ClientCard({ client, pulse, onPress, onWhatsApp, onShareLogin, onToggleStatus, onResetPw, onDelete, onWorkout, onNutrition }: Props) {
  const { theme } = useTheme()
  const [menu, setMenu] = useState(false)
  const adherence = pulse?.percentage ?? 0
  const ringColor = adherence > 80 ? '#10B981' : adherence > 50 ? '#F59E0B' : '#EF4444'
  const att = attentionMeta(pulse?.attentionScore ?? client.attentionScore, pulse?.streak ?? 0)
  const ll = lastLog(pulse?.lastWorkoutDate ?? client.lastWorkoutDate)
  const llDot = ll.days < 3 ? '#10B981' : ll.days < 7 ? '#F59E0B' : '#EF4444'
  const stars = pulse?.latestEnergyLevel != null ? Math.min(5, Math.max(0, Math.round(pulse.latestEnergyLevel / 2))) : 0
  const weightVals = (pulse?.weightHistory30d ?? []).map((d) => d.value)
  const nutri = pulse?.nutritionPercentage ?? 0
  const nutriRisk = pulse?.attentionFlags?.includes('NUTRICION_RIESGO') ?? false
  const subDays = subscriptionDaysRemaining(client.subscriptionStartDate)
  const weekCur = pulse?.planCurrentWeek, weekTot = pulse?.planTotalWeeks

  const menuItems = [
    { icon: Share2, label: 'Compartir acceso', on: () => { setMenu(false); onShareLogin() } },
    { icon: client.isActive ? Pause : Play, label: client.isActive ? 'Pausar alumno' : 'Activar alumno', on: () => { setMenu(false); onToggleStatus() } },
    { icon: KeyRound, label: 'Reset contraseña', on: () => { setMenu(false); onResetPw() } },
    { icon: Trash2, label: 'Eliminar', on: () => { setMenu(false); onDelete() }, danger: true },
  ]

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, height: CLIENT_CARD_HEIGHT }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <AdherenceRing pct={adherence} initial={(client.fullName?.[0] ?? '?').toUpperCase()} color={ringColor} theme={theme} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.nameRow}>
            <Text numberOfLines={1} style={[styles.name, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]} onPress={onPress}>{client.fullName}</Text>
            <View style={[styles.badge, { backgroundColor: att.color + '22', borderColor: att.color + '44' }]}><Text style={[styles.badgeT, { color: att.color }]}>{att.label}</Text></View>
          </View>
          <Text numberOfLines={1} style={[styles.email, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{client.email}</Text>
        </View>
        <TouchableOpacity onPress={() => setMenu(true)} hitSlop={8} style={styles.menuBtn}><MoreVertical size={20} color={theme.foreground} /></TouchableOpacity>
      </View>

      {/* Mini-stats */}
      <View style={styles.statsRow}>
        <Mini theme={theme} label="Adherencia" value={`${adherence}%`} />
        <Mini theme={theme} label="Peso hoy" value={pulse?.currentWeight != null ? `${pulse.currentWeight}` : '—'} sub={pulse?.weightDelta7d != null ? `${pulse.weightDelta7d > 0 ? '↑' : pulse.weightDelta7d < 0 ? '↓' : ''}${Math.abs(pulse.weightDelta7d)} 7d` : undefined} />
        <View style={[styles.mini, { borderColor: theme.border }]}>
          <Text style={[styles.miniLabel, { color: theme.mutedForeground }]}>Energía</Text>
          <View style={{ flexDirection: 'row', gap: 1, marginTop: 2 }}>
            {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={11} color="#F59E0B" fill={i <= stars ? '#F59E0B' : 'transparent'} />)}
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
          {weightVals.length >= 2 ? <Sparkline values={weightVals} width={CONTENT_W / 2 - 6} height={28} color="#3B82F6" /> : <Text style={[styles.sparkEmpty, { color: theme.mutedForeground }]}>Sin datos</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sparkLabel, { color: theme.mutedForeground }]}>Adherencia (4 sem)</Text>
          {(pulse?.adherenceHistory4w?.length ?? 0) >= 2 ? <Sparkline values={pulse!.adherenceHistory4w} width={CONTENT_W / 2 - 6} height={28} color="#10B981" filled={false} /> : <Text style={[styles.sparkEmpty, { color: theme.mutedForeground }]}>Sin datos</Text>}
        </View>
      </View>

      {/* Programa + nutrición */}
      <View style={styles.metaRow}>
        {client.activeProgramName ? (
          <View style={[styles.metaPill, { backgroundColor: theme.primary + '14', borderColor: theme.primary + '22' }]}>
            <Dumbbell size={12} color={theme.primary} />
            <Text numberOfLines={1} style={[styles.metaText, { color: theme.foreground }]}>{client.activeProgramName}</Text>
            <Text style={[styles.metaDim, { color: theme.mutedForeground }]}>Sem {weekCur ?? '—'}/{weekTot ?? '—'} · {client.planDaysRemaining != null ? `${Math.max(0, client.planDaysRemaining)}d` : '—'}</Text>
          </View>
        ) : (
          <View style={[styles.metaPill, { borderColor: theme.border, borderStyle: 'dashed' }]}>
            <Text style={[styles.metaDim, { color: theme.mutedForeground }]}>Sin programa</Text>
          </View>
        )}
      </View>
      <View style={styles.subRow}>
        {nutri > 0 ? <Text style={[styles.subTxt, { color: nutriRisk ? '#EF4444' : theme.mutedForeground }]}>🍎 Nutri {nutri}%{nutriRisk ? ' ⚠' : ''}</Text> : null}
        {subDays != null ? <Text style={[styles.subTxt, { color: subDays <= 5 ? '#EF4444' : theme.mutedForeground }]}>Suscripción: {subDays > 0 ? `${subDays}d` : 'vencida'}</Text> : null}
      </View>

      {/* Footer actions */}
      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        {onWhatsApp ? <FootBtn theme={theme} icon={Smartphone} label="WA" color="#10B981" onPress={onWhatsApp} /> : null}
        <FootBtn theme={theme} icon={Eye} label="Perfil" onPress={onPress} />
        <FootBtn theme={theme} icon={Dumbbell} label="Entreno" onPress={onWorkout} />
        <FootBtn theme={theme} icon={Apple} label="Nutri" onPress={onNutrition} />
      </View>

      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenu(false)}>
          <View style={[styles.menuCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {menuItems.map((it) => {
              const Icon = it.icon
              const c = it.danger ? theme.destructive : theme.foreground
              return (
                <TouchableOpacity key={it.label} onPress={it.on} activeOpacity={0.8} style={styles.menuItem}>
                  <Icon size={17} color={c} />
                  <Text style={[styles.menuItemTxt, { color: c, fontFamily: 'Inter_600SemiBold' }]}>{it.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </Pressable>
      </Modal>
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

function FootBtn({ theme, icon: Icon, label, color, onPress }: { theme: any; icon: any; label: string; color?: string; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[styles.footBtn, { borderColor: theme.border, backgroundColor: color ? color + '14' : 'transparent' }]}>
      <Icon size={14} color={color ?? theme.foreground} />
      <Text style={[styles.footTxt, { color: color ?? theme.foreground, fontFamily: 'Inter_700Bold' }]}>{label}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 9, overflow: 'hidden' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 15, flexShrink: 1 },
  badge: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 },
  badgeT: { fontSize: 8.5, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.4 },
  email: { fontSize: 11, marginTop: 1 },
  menuBtn: { padding: 2 },
  statsRow: { flexDirection: 'row', gap: 6 },
  mini: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 6, gap: 1 },
  miniLabel: { fontSize: 8, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.4 },
  miniVal: { fontSize: 14, fontFamily: 'Montserrat_700Bold' },
  miniSub: { fontSize: 9 },
  sparkRow: { flexDirection: 'row', gap: 10 },
  sparkLabel: { fontSize: 8, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  sparkEmpty: { fontSize: 10, height: 28, textAlignVertical: 'center' },
  metaRow: { flexDirection: 'row' },
  metaPill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  metaText: { fontSize: 12, fontFamily: 'Inter_600SemiBold', flexShrink: 1 },
  metaDim: { fontSize: 10, marginLeft: 'auto', fontFamily: 'Inter_600SemiBold' },
  subRow: { flexDirection: 'row', gap: 12 },
  subTxt: { fontSize: 10, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.3 },
  footer: { flexDirection: 'row', gap: 6, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 9, marginTop: 'auto' },
  footBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderRadius: 10, paddingVertical: 8 },
  footTxt: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  menuCard: { width: '100%', maxWidth: 280, borderWidth: 1, borderRadius: 14, paddingVertical: 6 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  menuItemTxt: { fontSize: 14 },
})
