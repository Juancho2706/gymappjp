import React, { useState } from 'react'
import { Dimensions, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { Apple, Calendar, Dumbbell, Eye, MoreHorizontal, Pause, Play, Smartphone, Star, Trash2, KeyRound } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { Sparkline } from '../Sparkline'
import { subscriptionDaysRemaining, type DirectoryClient, type PulseRow } from '../../lib/clients-directory'

/** Altura fija de la card (modo cards) — usada por la animación de stack. */
export const CLIENT_CARD_HEIGHT = 382
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
  const size = 72, stroke = 6, r = (size - stroke) / 2, circ = 2 * Math.PI * r
  const dash = (Math.min(100, Math.max(0, pct)) / 100) * circ
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={theme.border} strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      <Text style={{ fontSize: 22, fontFamily: 'Montserrat_800ExtraBold', color: theme.foreground }}>{initial}</Text>
    </View>
  )
}

// 1:1 web ClientCardV2AttentionBadge: copy verbatim + estrella en "Destacado".
function attentionMeta(score: number, streak: number): { label: string; color: string; star?: boolean } {
  if (score >= 50) return { label: 'Atención urgente', color: '#EF4444' }
  if (score >= 25) return { label: 'Revisar', color: '#F59E0B' }
  if (score === 0 && streak > 10) return { label: 'Destacado', color: '#10B981', star: true }
  return { label: 'On track', color: '#10B981' }
}

export const ClientCard = React.memo(function ClientCard({ client, pulse, onPress, onWhatsApp, onShareLogin, onToggleStatus, onResetPw, onDelete, onWorkout, onNutrition }: Props) {
  const { theme } = useTheme()
  const [menu, setMenu] = useState(false)
  const adherence = pulse?.percentage ?? 0
  const ringColor = adherence > 80 ? '#10B981' : adherence > 50 ? '#F59E0B' : '#EF4444'
  const att = attentionMeta(pulse?.attentionScore ?? client.attentionScore, pulse?.streak ?? 0)
  const ll = lastLog(pulse?.lastWorkoutDate ?? client.lastWorkoutDate)
  const llDot = ll.days < 3 ? '#10B981' : ll.days < 7 ? '#F59E0B' : '#EF4444'
  const stars = pulse?.latestEnergyLevel != null ? Math.min(5, Math.max(0, Math.round(pulse.latestEnergyLevel / 2))) : 0
  const weightVals = (pulse?.weightHistory30d ?? []).map((d) => d.value)
  const weightDelta = pulse?.weightDelta7d
  const nutri = pulse?.nutritionPercentage ?? 0
  const hasNutritionData = nutri > 0
  const nutriRisk = pulse?.attentionFlags?.includes('NUTRICION_RIESGO') ?? false
  const subDays = subscriptionDaysRemaining(client.subscriptionStartDate)
  const weekCur = pulse?.planCurrentWeek, weekTot = pulse?.planTotalWeeks

  // 1:1 web DropdownMenu: Ver perfil · WhatsApp (si hay teléfono) · Entrenamiento · Nutrición.
  const menuItems = [
    { icon: Eye, label: 'Ver perfil', on: () => { setMenu(false); onPress() } },
    ...(onWhatsApp ? [{ icon: Smartphone, label: 'Enviar WhatsApp', on: () => { setMenu(false); onWhatsApp() } }] : []),
    { icon: Dumbbell, label: 'Entrenamiento', on: () => { setMenu(false); onWorkout() } },
    { icon: Apple, label: 'Nutrición', on: () => { setMenu(false); onNutrition() } },
  ]

  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, height: CLIENT_CARD_HEIGHT }]}>
      {/* Header: ring + nombre/badge + acciones inline (reset · pausa · eliminar · menú) */}
      <View style={styles.headerRow}>
        <View style={{ position: 'relative' }}>
          <AdherenceRing pct={adherence} initial={(client.fullName?.[0] ?? '?').toUpperCase()} color={ringColor} theme={theme} />
          {/* Badge circular rojo "!" sobre el ring cuando hay riesgo nutricional (1:1 web). */}
          {nutriRisk && hasNutritionData ? (
            <View style={styles.riskBadge}>
              <Text style={styles.riskBadgeTxt}>!</Text>
            </View>
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.nameRow}>
            <Text numberOfLines={1} style={[styles.name, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]} onPress={onPress}>{client.fullName}</Text>
            <View style={[styles.badge, { backgroundColor: att.color + '22', borderColor: att.color + '44' }]}>
              {att.star ? <Star size={9} color="#F59E0B" fill="#F59E0B" /> : null}
              <Text style={[styles.badgeT, { color: att.color }]}>{att.label}</Text>
            </View>
          </View>
          <Text numberOfLines={1} style={[styles.email, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{client.email}</Text>
        </View>
      </View>

      {/* Acciones inline visibles en el header (1:1 web: reset llave indigo · pausa ámbar · eliminar rojo · menú) */}
      <View style={styles.headerActions}>
        <TouchableOpacity onPress={onResetPw} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Restablecer contraseña" hitSlop={{ top: 4, bottom: 4, left: 3, right: 3 }} style={[styles.hAct, { backgroundColor: '#6366F11A' }]}>
          <KeyRound size={17} color="#6366F1" />
        </TouchableOpacity>
        <TouchableOpacity onPress={onToggleStatus} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={client.isActive ? 'Pausar alumno' : 'Reactivar alumno'} hitSlop={{ top: 4, bottom: 4, left: 3, right: 3 }} style={[styles.hAct, { backgroundColor: (client.isActive ? '#F59E0B' : '#10B981') + '1A' }]}>
          {client.isActive ? <Pause size={17} color="#F59E0B" /> : <Play size={17} color="#10B981" />}
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Eliminar alumno" hitSlop={{ top: 4, bottom: 4, left: 3, right: 3 }} style={[styles.hAct, { backgroundColor: theme.destructive + '1A', borderColor: theme.destructive + '4D', borderWidth: 1 }]}>
          <Trash2 size={17} color={theme.destructive} />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setMenu(true)} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Más opciones" hitSlop={{ top: 4, bottom: 4, left: 3, right: 3 }} style={[styles.hAct, { backgroundColor: theme.secondary, borderColor: theme.border, borderWidth: 1 }]}>
          <MoreHorizontal size={17} color={theme.foreground} />
        </TouchableOpacity>
      </View>

      {/* Mini-stats (1:1 web grid: Adherencia · Peso hoy · Energía · Último log) */}
      <View style={styles.statsRow}>
        <View style={[styles.mini, { borderColor: theme.border }]}>
          <Text style={[styles.miniLabel, { color: theme.mutedForeground }]}>Adherencia</Text>
          <Text style={[styles.miniVal, { color: theme.foreground }]} numberOfLines={1}>{adherence}%</Text>
          <View style={[styles.miniBar, { backgroundColor: theme.muted }]}>
            <View style={{ height: '100%', borderRadius: 99, width: `${Math.min(100, adherence)}%`, backgroundColor: theme.primary }} />
          </View>
        </View>
        <Mini theme={theme} label="Peso hoy" value={pulse?.currentWeight != null ? `${pulse.currentWeight} kg` : '—'} sub={weightDelta != null ? `${weightDelta > 0 ? '↑' : weightDelta < 0 ? '↓' : ''}${Math.abs(weightDelta)} (7d)` : ''} />
        <View style={[styles.mini, { borderColor: theme.border }]}>
          <Text style={[styles.miniLabel, { color: theme.mutedForeground }]}>Energía</Text>
          <View style={{ flexDirection: 'row', gap: 1, marginTop: 2 }}>
            {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={11} color={i <= stars ? '#F59E0B' : theme.mutedForeground} fill={i <= stars ? '#F59E0B' : 'transparent'} />)}
          </View>
        </View>
        <View style={[styles.mini, { borderColor: theme.border }]}>
          <Text style={[styles.miniLabel, { color: theme.mutedForeground }]}>Último log</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: llDot }} />
            <Text style={[styles.miniVal2, { color: theme.foreground }]}>{ll.label}</Text>
          </View>
        </View>
      </View>

      {/* Sparklines (1:1 web: Peso 30d · Adherencia 4 sem) */}
      <View style={styles.sparkRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sparkLabel, { color: theme.mutedForeground }]}>Peso (30d)</Text>
          {weightVals.length >= 2 ? <Sparkline values={weightVals} width={CONTENT_W / 2 - 6} height={28} color="#007AFF" /> : <Text style={[styles.sparkEmpty, { color: theme.mutedForeground }]}>Sin datos</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.sparkLabel, { color: theme.mutedForeground }]}>Adherencia (4 sem)</Text>
          {(pulse?.adherenceHistory4w?.length ?? 0) >= 2 ? <Sparkline values={pulse!.adherenceHistory4w} width={CONTENT_W / 2 - 6} height={28} color="#10B981" /> : <Text style={[styles.sparkEmpty, { color: theme.mutedForeground }]}>Sin datos</Text>}
        </View>
      </View>

      {/* Nutrición (barra de adherencia) — 1:1 web: solo si hay datos */}
      {hasNutritionData ? (
        <View style={[styles.block, { backgroundColor: (nutriRisk ? '#EF4444' : '#10B981') + '12', borderColor: (nutriRisk ? '#EF4444' : '#10B981') + '28' }]}>
          <View style={styles.blockTop}>
            <Apple size={14} color={nutriRisk ? '#EF4444' : '#10B981'} />
            <Text numberOfLines={1} style={[styles.blockName, { color: nutriRisk ? '#EF4444' : theme.mutedForeground }]}>{nutriRisk ? 'Baja adherencia nutricional' : 'Nutrición'}</Text>
            <Text style={[styles.blockDim, { color: nutriRisk ? '#EF4444' : theme.foreground }]}>{nutri}%</Text>
          </View>
          <Bar value={Math.min(1, nutri / 100)} color={nutriRisk ? '#EF4444' : '#10B981'} theme={theme} />
        </View>
      ) : null}

      {/* Programa (1:1 web: con barra de semanas, o "Sin programa asignado") */}
      {client.activeProgramName ? (
        <View style={[styles.block, { backgroundColor: theme.primary + '0D', borderColor: theme.primary + '26' }]}>
          <View style={styles.blockTop}>
            <Calendar size={14} color={theme.primary} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.blockKicker, { color: theme.primary }]}>Programa</Text>
              <Text numberOfLines={1} style={[styles.blockName, { color: theme.foreground }]}>{client.activeProgramName}</Text>
            </View>
            <Text style={[styles.blockDim, { color: theme.foreground }]}>Sem {weekCur ?? '—'}/{weekTot ?? '—'}</Text>
          </View>
          <Bar value={weekTot && weekTot > 0 ? Math.min(1, (weekCur ?? 0) / weekTot) : 0} color={theme.primary} theme={theme} />
          <Text style={[styles.blockMeta, { color: theme.mutedForeground }]}>
            {client.planDaysRemaining != null ? `${client.planDaysRemaining > 0 ? client.planDaysRemaining : 0} días restantes` : 'Sin fechas de programa'}{weekTot ? ` · ${weekTot} semanas totales` : ''}
          </Text>
        </View>
      ) : (
        <View style={[styles.metaPill, { borderColor: theme.border, borderStyle: 'dashed' }]}>
          <Text style={[styles.metaDim, { color: theme.mutedForeground }]}>Sin programa asignado</Text>
        </View>
      )}

      {subDays != null ? (
        <Text style={[styles.subTxt, { color: theme.mutedForeground }]}>
          Suscripción: <Text style={{ color: subDays <= 5 ? '#EF4444' : theme.primary }}>{subDays > 0 ? `${subDays} días` : 'Vencida'}</Text>
        </Text>
      ) : null}

      {/* Footer actions (1:1 web: WA · Perfil · Workout · Nutri) */}
      <View style={[styles.footer, { borderTopColor: theme.border }]}>
        {onWhatsApp ? <FootBtn theme={theme} icon={Smartphone} label="WA" a11yLabel="Enviar WhatsApp" color="#10B981" filled onPress={onWhatsApp} /> : null}
        <FootBtn theme={theme} icon={Eye} label="Perfil" a11yLabel="Ver perfil" onPress={onPress} />
        <FootBtn theme={theme} icon={Dumbbell} label="Workout" a11yLabel="Entrenamiento" onPress={onWorkout} />
        <FootBtn theme={theme} icon={Apple} label="Nutri" a11yLabel="Nutrición" onPress={onNutrition} />
      </View>

      <Modal visible={menu} transparent animationType="fade" onRequestClose={() => setMenu(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenu(false)}>
          <View style={[styles.menuCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {menuItems.map((it) => {
              const Icon = it.icon
              return (
                <TouchableOpacity key={it.label} onPress={it.on} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={it.label} style={styles.menuItem}>
                  <Icon size={17} color={theme.foreground} />
                  <Text style={[styles.menuItemTxt, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>{it.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  )
})

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

function FootBtn({ theme, icon: Icon, label, a11yLabel, color, filled, onPress }: { theme: any; icon: any; label: string; a11yLabel?: string; color?: string; filled?: boolean; onPress: () => void }) {
  const fg = filled ? '#fff' : (color ?? theme.foreground)
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel={a11yLabel ?? label} hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }} style={[styles.footBtn, filled && color ? { backgroundColor: color } : { borderColor: theme.border, backgroundColor: theme.secondary }]}>
      <Icon size={14} color={fg} />
      <Text style={[styles.footTxt, { color: fg, fontFamily: 'Inter_700Bold' }]}>{label}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 18, padding: 14, gap: 9, overflow: 'hidden' },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 15, flexShrink: 1, textTransform: 'uppercase', letterSpacing: -0.4 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3, borderWidth: 1, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1.5 },
  badgeT: { fontSize: 8.5, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.4 },
  email: { fontSize: 11, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.4 },
  riskBadge: { position: 'absolute', top: -3, right: -3, minWidth: 19, height: 19, borderRadius: 10, backgroundColor: '#EF4444', borderWidth: 1, borderColor: '#B91C1C', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  riskBadgeTxt: { color: '#fff', fontSize: 11, fontFamily: 'Inter_700Bold', lineHeight: 13 },
  headerActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 6 },
  hAct: { width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  statsRow: { flexDirection: 'row', gap: 6 },
  mini: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 6, gap: 1 },
  miniLabel: { fontSize: 8, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.4 },
  miniVal: { fontSize: 16, fontFamily: 'Montserrat_800ExtraBold' },
  miniVal2: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  miniSub: { fontSize: 9 },
  miniBar: { height: 4, borderRadius: 99, overflow: 'hidden', marginTop: 4 },
  sparkRow: { flexDirection: 'row', gap: 10 },
  sparkLabel: { fontSize: 8, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 },
  sparkEmpty: { fontSize: 9, height: 28, textAlignVertical: 'center', textTransform: 'uppercase', letterSpacing: 0.6, fontFamily: 'Inter_700Bold' },
  metaPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, opacity: 0.7 },
  metaDim: { fontSize: 9, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.6 },
  block: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, gap: 5 },
  blockTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  blockKicker: { fontSize: 8, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.5 },
  blockName: { fontSize: 11.5, fontFamily: 'Inter_700Bold', flexShrink: 1 },
  blockDim: { fontSize: 10.5, marginLeft: 'auto', fontFamily: 'Inter_700Bold' },
  blockMeta: { fontSize: 9.5 },
  barTrack: { height: 6, borderRadius: 99, overflow: 'hidden' },
  subTxt: { fontSize: 9, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.4 },
  footer: { flexDirection: 'row', gap: 6, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 9, marginTop: 'auto' },
  footBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderWidth: 1, borderRadius: 10, paddingVertical: 9, borderColor: 'transparent' },
  footTxt: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.4 },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  menuCard: { width: '100%', maxWidth: 280, borderWidth: 1, borderRadius: 14, paddingVertical: 6 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13 },
  menuItemTxt: { fontSize: 14 },
})
