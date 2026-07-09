import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { MotiView } from 'moti'
import { Activity, Calendar, Download, Flame, Minus, MoreVertical, Target, TrendingDown, TrendingUp } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Badge, Card } from '../../../components'
import { GlowBorderCard } from '../../../components/GlowBorderCard'
import { Popover, PopoverDescription, PopoverTitle } from '../../../components/Popover'
import { HapticPressable } from '../../../components/HapticPressable'
import { FONT } from '../../../lib/typography'

// Neutrales de superficie inversa (fijos en light+dark porque la Card del hero es
// siempre una superficie ink oscura — mirror del token-contract §2/§3, mismo
// patron que StatCard/InfoTooltip). El acento de MARCA (theme.primary) SI viene
// del branding white-label.
const ON_DARK = '#F4F6F8' // ink-50
const ON_DARK_MUTED = '#939DAB'
const EMBER = '#FF8A5B' // ember-400 — flama de racha / subida de peso
const WARNING = '#F5A524' // warning-500 — plan bajo
// Iconos del TopBar (viven sobre la superficie clara de la app, no sobre el hero):
// texto-strong por esquema (lucide toma color prop, no clase) — mirror InfoTooltip.
const STRONG_ICON = { light: '#101828', dark: '#F4F6F8' } as const

export type HeroStatusLevel = 'ok' | 'attention' | 'urgent' | 'neutral'

const STATUS_TONE: Record<HeroStatusLevel, 'success' | 'warning' | 'danger' | 'neutral'> = {
  ok: 'success',
  attention: 'warning',
  urgent: 'danger',
  neutral: 'neutral',
}
// Anillo del avatar por nivel — tokens DS (className, brand/scheme-aware).
const RING_CLASS: Record<HeroStatusLevel, string> = {
  ok: 'bg-success-500',
  attention: 'bg-warning-500',
  urgent: 'bg-danger-500',
  neutral: 'bg-ink-500',
}

export interface HeroChips {
  weightValue: number | null
  weightDelta: number | null
  adherencePct: number
  workoutsThisWeek: number
  workoutsTarget: number
  mealsDone: number | null
  mealsTotal: number | null
  nutritionPct: number
}

export interface ClientHeroProps {
  name: string
  email: string
  eyebrow: string
  statusLabel: string
  statusLevel: HeroStatusLevel
  reasons?: string[]
  streak: number
  lastActivityLabel: string
  sinceLabel: string
  trainingAge: string
  chips: HeroChips
  onMore: () => void
}

function initialsOf(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?'
  )
}

export function ClientHero({
  name,
  email,
  eyebrow,
  statusLabel,
  statusLevel,
  reasons = [],
  streak,
  lastActivityLabel,
  sinceLabel,
  trainingAge,
  chips,
  onMore,
}: ClientHeroProps) {
  const { theme, resolvedScheme } = useTheme()
  const iconStrong = STRONG_ICON[resolvedScheme]

  return (
    <MotiView from={{ opacity: 0, translateY: 12 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 360 }} style={styles.root}>
      {/* TopBar: eyebrow "{PROGRAMA} · Semana {N}" + nombre · acciones */}
      <View style={styles.topbar}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} className="text-muted" style={styles.eyebrow}>{eyebrow}</Text>
          <Text numberOfLines={2} className="text-strong" style={styles.name}>{name}</Text>
        </View>
        <View style={styles.topActions}>
          {/* Export PDF — solo-visual (dossier = E5). Tap abre tooltip "Proximamente". */}
          <Popover
            side="bottom"
            width={220}
            trigger={
              <View className="rounded-control border border-default bg-surface-card" style={[styles.iconBtn, { opacity: 0.55 }]} testID="ficha-export-pdf">
                <Download size={18} color={iconStrong} strokeWidth={2} />
              </View>
            }
          >
            <PopoverTitle>Exportar PDF</PopoverTitle>
            <PopoverDescription>Próximamente. El dossier del alumno llega en una próxima versión.</PopoverDescription>
          </Popover>
          <HapticPressable onPress={onMore} accessibilityRole="button" accessibilityLabel="Más opciones" testID="ficha-more" className="rounded-control border border-default bg-surface-card" style={styles.iconBtn}>
            <MoreVertical size={18} color={iconStrong} strokeWidth={2} />
          </HapticPressable>
        </View>
      </View>

      {/* Hero inverso con marco animado de marca (GlowBorderCard). */}
      <GlowBorderCard>
        <Card variant="inverse" padding={20} radius="card" style={{ borderColor: 'transparent', gap: 0 }}>
          <View style={styles.identityRow}>
            <View className={RING_CLASS[statusLevel]} style={styles.ring}>
              <View className="bg-surface-inverse" style={[styles.ringInner, { borderColor: theme.card }]}>
                <Text className="font-display-bold text-sport-400" style={styles.initials}>{initialsOf(name)}</Text>
              </View>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
              <View style={styles.badgeRow}>
                <Badge tone={STATUS_TONE[statusLevel]} size="sm">{statusLabel}</Badge>
                {reasons.length > 0 ? (
                  <Text numberOfLines={2} style={[styles.reasons, { color: ON_DARK_MUTED }]}>{reasons.join(' · ')}</Text>
                ) : null}
              </View>
              <Text numberOfLines={1} style={[styles.email, { color: ON_DARK_MUTED }]}>{email}</Text>
              <View style={styles.metaRow}>
                <MetaItem icon={<Flame size={13} color={EMBER} />} text={`${streak} d de racha`} color={ON_DARK_MUTED} />
                <MetaItem icon={<Activity size={13} color={theme.primary} />} text={lastActivityLabel} color={ON_DARK_MUTED} />
                <MetaItem icon={<Calendar size={13} color={ON_DARK_MUTED} />} text={`Desde ${sinceLabel}`} color={ON_DARK_MUTED} />
                <MetaItem icon={<Target size={13} color={ON_DARK_MUTED} />} text={`~${trainingAge}`} color={ON_DARK_MUTED} />
              </View>
            </View>
          </View>

          {/* 4 chips 2×2 (el programa/semana vive en el eyebrow, no en un chip). */}
          <View style={styles.chipGrid}>
            <HeroChip label="Peso" value={chips.weightValue != null && chips.weightValue > 0 ? `${chips.weightValue} kg` : '—'} sub={<WeightDeltaSub delta={chips.weightDelta} />} />
            <HeroChip label="Adherencia" value={`${chips.adherencePct}%`} sub={<ChipBar value={chips.adherencePct} color={theme.primary} />} />
            <HeroChip label="Workouts" value={`${chips.workoutsThisWeek}/${chips.workoutsTarget}`} sub={<Text style={[styles.chipSub, { color: ON_DARK_MUTED }]}>esta semana</Text>} />
            <HeroChip
              label="Comidas hoy"
              value={chips.mealsDone != null && chips.mealsTotal != null ? `${chips.mealsDone}/${chips.mealsTotal}` : '—'}
              sub={<Text style={[styles.chipSub, { color: chips.nutritionPct >= 80 ? theme.success : WARNING }]}>{chips.nutritionPct}% plan</Text>}
            />
          </View>
        </Card>
      </GlowBorderCard>
    </MotiView>
  )
}

function MetaItem({ icon, text, color }: { icon: ReactNode; text: string; color: string }) {
  return (
    <View style={styles.metaItem}>
      {icon}
      <Text style={[styles.metaTxt, { color }]}>{text}</Text>
    </View>
  )
}

function WeightDeltaSub({ delta }: { delta: number | null }) {
  const { theme } = useTheme()
  if (delta == null || delta === 0) {
    return (
      <View style={styles.subRow}>
        <Minus size={12} color={ON_DARK_MUTED} />
        <Text style={[styles.chipSub, { color: ON_DARK_MUTED }]}>sin cambio</Text>
      </View>
    )
  }
  const up = delta > 0
  const color = up ? EMBER : theme.success // subida = ember, bajada = success
  return (
    <View style={styles.subRow}>
      {up ? <TrendingUp size={12} color={color} /> : <TrendingDown size={12} color={color} />}
      <Text style={[styles.chipSub, { color }]}>{up ? '+' : ''}{delta} kg</Text>
    </View>
  )
}

function ChipBar({ value, color }: { value: number; color: string }) {
  const pct = Math.min(100, Math.max(0, value))
  return (
    <View style={styles.barTrack}>
      <View style={{ width: `${pct}%`, height: '100%', borderRadius: 99, backgroundColor: color }} />
    </View>
  )
}

function HeroChip({ label, value, sub }: { label: string; value: string; sub: ReactNode }) {
  return (
    <View style={styles.chip}>
      <Text numberOfLines={1} style={[styles.chipLabel, { color: ON_DARK_MUTED }]}>{label}</Text>
      <Text numberOfLines={1} style={[styles.chipVal, { color: ON_DARK }]}>{value}</Text>
      <View style={{ marginTop: 2 }}>{sub}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  topbar: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  eyebrow: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.4, fontFamily: FONT.uiBold },
  name: { fontSize: 25, letterSpacing: -0.6, marginTop: 2, fontFamily: FONT.displayBlack },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  identityRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  ring: { width: 64, height: 64, borderRadius: 32, padding: 2, flexShrink: 0 },
  ringInner: { flex: 1, borderRadius: 30, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 22, letterSpacing: -0.4 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  reasons: { flex: 1, minWidth: 0, fontSize: 11.5, fontFamily: FONT.ui },
  email: { fontSize: 12.5, fontFamily: FONT.ui },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 14, rowGap: 4, marginTop: 2 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaTxt: { fontSize: 11.5, fontFamily: FONT.ui },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  chip: { width: '47%', flexGrow: 1, backgroundColor: 'rgba(255,255,255,0.07)', borderColor: 'rgba(255,255,255,0.10)', borderWidth: 1, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 10 },
  chipLabel: { fontSize: 10, letterSpacing: 0.4, fontFamily: FONT.uiSemibold },
  chipVal: { fontSize: 16, letterSpacing: -0.2, marginTop: 3, fontFamily: FONT.displayBlack, fontVariant: ['tabular-nums'] },
  chipSub: { fontSize: 10.5, fontFamily: FONT.uiBold },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  barTrack: { height: 4, borderRadius: 99, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.14)', marginTop: 3 },
})
