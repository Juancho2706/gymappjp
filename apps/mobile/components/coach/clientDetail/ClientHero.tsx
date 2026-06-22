import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { MotiView } from 'moti'
import { Calendar, Download, Flame, MessageCircle, Minus, Target, TrendingDown, TrendingUp, Zap } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Badge } from '../../../components'

export interface HeroStat {
  label: string
  value: string
  /** sub-línea: delta de peso, barra de progreso, texto coloreado, etc. */
  sub?: HeroStatSub
  icon?: any
  iconColor?: string
}

type HeroStatSub =
  | { kind: 'weightDelta'; delta: number | null }
  | { kind: 'progress'; pct: number }
  | { kind: 'text'; text: string; color?: string }

function attentionBadge(score: number) {
  if (score >= 50) return { label: 'Urgente', color: '#F43F5E' }
  if (score >= 25) return { label: 'Revisar', color: '#F59E0B' }
  return { label: 'Estable', color: '#10B981' }
}

export function ClientHero({
  name,
  email,
  statusLabel,
  statusTone,
  attentionScore,
  lastActivityLabel,
  trainingAge,
  streak,
  clientSinceLabel,
  stats,
  onWhatsApp,
  hasPhone,
  onNutrition,
  onTraining,
  onExportPdf,
  exporting,
}: {
  name: string
  email: string
  statusLabel: string
  statusTone: 'success' | 'muted'
  attentionScore: number
  lastActivityLabel: string
  trainingAge: string
  streak: number
  clientSinceLabel: string
  stats: HeroStat[]
  onWhatsApp: () => void
  hasPhone: boolean
  onNutrition: () => void
  onTraining: () => void
  onExportPdf: () => void
  exporting?: boolean
}) {
  const { theme } = useTheme()
  const ab = attentionBadge(attentionScore)
  const initial = (name?.trim()?.[0] ?? '?').toUpperCase()

  return (
    <MotiView
      from={{ opacity: 0, translateY: 12 }}
      animate={{ opacity: 1, translateY: 0 }}
      transition={{ type: 'timing', duration: 360 }}
      style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}
    >
      {/* Última actividad — línea uppercase pequeña arriba del hero */}
      <Text style={[styles.lastActivity, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>
        ÚLTIMA ACTIVIDAD: <Text style={{ color: theme.foreground }}>{lastActivityLabel}</Text>
      </Text>

      <View style={styles.top}>
        <View style={[styles.avatar, { backgroundColor: theme.primary + '14', borderColor: theme.primary + '33', borderRadius: theme.radius['2xl'] }]}>
          <Text style={[styles.avatarInitial, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>{initial}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
          <View style={styles.nameRow}>
            <Text numberOfLines={1} style={[styles.name, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{name}</Text>
          </View>
          <View style={styles.badgeRow}>
            <Badge label={statusLabel} tone={statusTone} />
            <View style={[styles.scoreBadge, { backgroundColor: ab.color + '26', borderColor: ab.color + '4D' }]}>
              <Text style={[styles.scoreTxt, { color: ab.color, fontFamily: 'Inter_700Bold' }]}>Score: {attentionScore} · {ab.label}</Text>
            </View>
          </View>
          <Text numberOfLines={1} style={[styles.email, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{email}</Text>
          <View style={styles.metaRow}>
            <View style={styles.metaItem}>
              <Flame size={13} color="#F97316" />
              <Text style={[styles.metaTxt, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Racha: {streak} día{streak === 1 ? '' : 's'}</Text>
            </View>
            <View style={styles.metaItem}>
              <Calendar size={13} color={theme.mutedForeground} />
              <Text style={[styles.metaTxt, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Cliente desde: {clientSinceLabel}</Text>
            </View>
            <View style={styles.metaItem}>
              <Target size={13} color={theme.primary} />
              <Text style={[styles.metaTxt, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Edad entreno: ~{trainingAge}</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Acciones — WhatsApp / Nutrición / Entrenamiento / Exportar */}
      <View style={styles.actions}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onWhatsApp}
          disabled={!hasPhone}
          style={[styles.actionIcon, { backgroundColor: '#25D36618', borderColor: '#25D36644', borderRadius: theme.radius.lg, opacity: hasPhone ? 1 : 0.4 }]}
        >
          <MessageCircle size={18} color="#25D366" />
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onNutrition}
          style={[styles.actionBtn, { backgroundColor: theme.primary + '0D', borderColor: theme.primary + '33', borderRadius: theme.radius.lg }]}
        >
          <Text numberOfLines={1} style={[styles.actionTxt, { color: theme.primary, fontFamily: 'Inter_700Bold' }]}>Nutrición</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onTraining}
          style={[styles.actionBtnSolid, { backgroundColor: theme.primary, borderRadius: theme.radius.lg }, theme.shadowGlowBlue]}
        >
          <Zap size={15} color={theme.primaryForeground} />
          <Text numberOfLines={1} style={[styles.actionTxt, { color: theme.primaryForeground, fontFamily: 'Inter_700Bold' }]}>Entrenamiento</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onExportPdf}
          disabled={exporting}
          style={[styles.actionIcon, { backgroundColor: theme.background, borderColor: theme.primary + '4D', borderStyle: 'dashed', borderRadius: theme.radius.lg, opacity: exporting ? 0.6 : 1 }]}
        >
          <Download size={18} color={theme.foreground} />
        </TouchableOpacity>
      </View>

      {/* Stat chips — Peso / Adherencia / Workouts / Programa / Comidas hoy */}
      <View style={styles.chips}>
        {stats.map((s, i) => (
          <HeroStatChip key={i} stat={s} theme={theme} />
        ))}
      </View>
    </MotiView>
  )
}

function HeroStatChip({ stat, theme }: { stat: HeroStat; theme: ReturnType<typeof useTheme>['theme'] }) {
  const Icon = stat.icon
  return (
    <View style={[styles.chip, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
      <View style={styles.chipHead}>
        <Text style={[styles.chipLabel, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>{stat.label}</Text>
        {Icon ? <Icon size={12} color={stat.iconColor ?? theme.primary} /> : null}
      </View>
      <Text style={[styles.chipVal, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={1}>{stat.value}</Text>
      <View style={styles.chipSub}>
        <HeroSub sub={stat.sub} theme={theme} />
      </View>
    </View>
  )
}

function HeroSub({ sub, theme }: { sub?: HeroStatSub; theme: ReturnType<typeof useTheme>['theme'] }) {
  if (!sub) return null
  if (sub.kind === 'weightDelta') {
    const d = sub.delta
    if (d == null || d === 0) {
      return (
        <View style={styles.subRow}>
          <Minus size={11} color={theme.mutedForeground} />
          <Text style={[styles.subTxt, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>sin cambio</Text>
        </View>
      )
    }
    if (d > 0) {
      return (
        <View style={styles.subRow}>
          <TrendingUp size={11} color="#EF4444" />
          <Text style={[styles.subTxt, { color: '#EF4444', fontFamily: theme.fontSans }]}>+{Math.abs(d).toFixed(1)} kg</Text>
        </View>
      )
    }
    return (
      <View style={styles.subRow}>
        <TrendingDown size={11} color="#10B981" />
        <Text style={[styles.subTxt, { color: '#10B981', fontFamily: theme.fontSans }]}>{d.toFixed(1)} kg</Text>
      </View>
    )
  }
  if (sub.kind === 'progress') {
    const pct = Math.max(0, Math.min(100, sub.pct))
    return (
      <View style={[styles.track, { backgroundColor: theme.secondary }]}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: theme.primary }]} />
      </View>
    )
  }
  return (
    <Text style={[styles.subTxt, { color: sub.color ?? theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>{sub.text}</Text>
  )
}

const styles = StyleSheet.create({
  card: { padding: 18, borderWidth: 1, gap: 14, overflow: 'hidden' },
  lastActivity: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  avatarInitial: { fontSize: 30, letterSpacing: -0.5 },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  name: { fontSize: 21, letterSpacing: -0.5, textTransform: 'uppercase' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  scoreBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  scoreTxt: { fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase' },
  email: { fontSize: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaTxt: { fontSize: 11 },
  actions: { flexDirection: 'row', gap: 7, alignItems: 'stretch' },
  actionIcon: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 6, paddingVertical: 11, borderWidth: 1, minHeight: 46 },
  actionBtnSolid: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 6, paddingVertical: 11, minHeight: 46 },
  actionTxt: { fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', flexShrink: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { width: '47%', flexGrow: 1, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 12, gap: 4, minHeight: 72 },
  chipHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  chipLabel: { fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase', flexShrink: 1 },
  chipVal: { fontSize: 17, letterSpacing: -0.3 },
  chipSub: { minHeight: 12, justifyContent: 'center' },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  subTxt: { fontSize: 10 },
  track: { height: 5, borderRadius: 3, overflow: 'hidden', width: '100%', marginTop: 2 },
  fill: { height: '100%', borderRadius: 3 },
})

export type { HeroStatSub }
