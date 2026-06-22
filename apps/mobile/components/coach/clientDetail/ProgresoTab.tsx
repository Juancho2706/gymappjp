import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { Image } from 'expo-image'
import { Activity, ArrowRightLeft, Camera, Scale, Target, Zap } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { EmptyState } from '../../../components'
import { updateCoachClient } from '../../../lib/coach-client-detail'
import { AreaTrend, type AreaPoint } from '../charts/AreaTrend'
import { RadialGauge } from '../charts/RadialGauge'
import { StatCard, CardHeader, MetricBox, Pill, cd, formatDate } from './shared'
import {
  linearRegressionKgPerDay,
  bmiFromMetric,
  bmiCategory,
  avgEnergySince,
  energyColorHex,
} from '../../../lib/profile-analytics'
import type { CoachClientDetailData, CheckInEntry } from '../../../lib/coach-client-detail'

// Escala IMC espejo de la web (rango 16–36, marcas 18.5/25/30).
const BMI_MIN = 16
const BMI_MAX = 36
const BMI_SEGMENTS = [
  { upTo: 18.5, color: '#38BDF8' }, // Bajo peso (sky-400)
  { upTo: 25, color: '#10B981' }, // Normal (emerald-500)
  { upTo: 30, color: '#F59E0B' }, // Sobrepeso (amber-500)
  { upTo: 36, color: '#F43F5E' }, // Obesidad (rose-500)
]
const BMI_TICKS = ['16', '18.5', '25', '30', '36']

export function ProgresoTab({ data, onOpenPhoto, onReload }: { data: CoachClientDetailData; onOpenPhoto: (photos: string[], index: number) => void; onReload?: () => void }) {
  const { theme } = useTheme()
  const { client, checkIns } = data
  const [activeIdx, setActiveIdx] = useState<number | null>(null)

  const series = useMemo(
    () => [...checkIns].filter((c) => c.weight != null).sort((a, b) => a.date.localeCompare(b.date)),
    [checkIns]
  )
  const points: AreaPoint[] = useMemo(
    () => series.map((c, i) => ({ i, y: Number(c.weight), label: formatDate(c.date) })),
    [series]
  )

  const initial = client?.initial_weight_kg ?? (series.length ? Number(series[0]!.weight) : null)
  const actual = series.length ? Number(series[series.length - 1]!.weight) : null
  const cambio = initial != null && actual != null ? Math.round((actual - initial) * 10) / 10 : null
  const slopePerDay = useMemo(() => linearRegressionKgPerDay(checkIns.map((c) => ({ created_at: c.created_at ?? c.date, weight: c.weight }))), [checkIns])
  const ritmo30 = Math.round(slopePerDay * 30 * 10) / 10
  const proyeccion4w = actual != null ? Math.round((actual + slopePerDay * 28) * 10) / 10 : null

  const bmi = actual != null && client?.height_cm != null ? bmiFromMetric(actual, client.height_cm) : null
  const energy7d = useMemo(() => avgEnergySince(checkIns.map((c) => ({ created_at: c.created_at ?? c.date, energy_level: c.energy_level })), new Date(Date.now() - 7 * 86400000)), [checkIns])

  const active = activeIdx != null && activeIdx >= 0 && activeIdx < series.length ? series[activeIdx] : null

  if (checkIns.length === 0) {
    return <EmptyState icon={Activity} title="Sin progreso" subtitle="Este alumno aún no registra check-ins." />
  }

  return (
    <View style={{ gap: 14 }}>
      {/* Peso y tendencia */}
      {points.length >= 2 ? (
        <StatCard>
          <CardHeader icon={Scale} title="Peso y tendencia" right={
            client?.goal_weight_kg != null ? <Pill label={`Objetivo ${client.goal_weight_kg} kg`} /> : null
          } />
          <AreaTrend
            points={points}
            color={theme.primary}
            suffix=" kg"
            decimals={1}
            referenceY={client?.goal_weight_kg ?? null}
            onActiveIndex={setActiveIdx}
          />
          {active ? (
            <View style={[styles.tooltip, { backgroundColor: theme.secondary, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
              {active.front_photo_url ? (
                <Image source={{ uri: active.front_photo_url }} style={[styles.tipPhoto, { borderColor: theme.border }]} contentFit="cover" />
              ) : null}
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[styles.tipDate, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{formatDate(active.date)}</Text>
                <Text style={[styles.tipMeta, { color: theme.primary, fontFamily: 'Inter_700Bold' }]}>
                  {active.weight} kg{active.energy_level != null ? ` · Energía ${active.energy_level}/10` : ''}
                </Text>
                {active.notes ? <Text numberOfLines={2} style={[styles.tipMeta, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{active.notes}</Text> : null}
              </View>
            </View>
          ) : (
            <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Tocá la gráfica para ver cada check-in.</Text>
          )}
        </StatCard>
      ) : null}

      {/* Peso objetivo (inline editor) — paridad con el header del Panel de Progreso (web) */}
      <GoalWeightEditor clientId={client?.id ?? ''} current={client?.goal_weight_kg ?? null} onSaved={onReload} />

      {/* Stats de composición */}
      <View style={cd.grid2}>
        <MetricBox value={initial != null ? `${Number(initial).toFixed(1)} kg` : '—'} label="Peso inicial" />
        <MetricBox value={actual != null ? `${actual.toFixed(1)} kg` : '—'} label="Peso actual" />
        <MetricBox value={cambio != null ? `${cambio > 0 ? '+' : ''}${cambio.toFixed(1)} kg` : '—'} label="Cambio total" color={cambio == null ? undefined : cambio > 0 ? '#EF4444' : theme.success} />
        <MetricBox value={`${ritmo30 >= 0 ? '+' : ''}${ritmo30.toFixed(2)} kg/mes`} label="Ritmo (30d)" sub="Regresión reciente" color={ritmo30 > 0 ? '#EF4444' : ritmo30 < 0 ? theme.success : undefined} />
        <MetricBox value={proyeccion4w != null && series.length >= 2 ? `${proyeccion4w.toFixed(1)} kg` : '—'} label="Proyección 4 sem" sub="Si continúa la tendencia" />
      </View>

      {/* IMC */}
      {bmi != null ? (
        <StatCard>
          <CardHeader icon={Scale} title="IMC" />
          <Text style={[styles.bmiValue, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>{bmi.toFixed(1)}</Text>
          <Text style={[styles.bmiCat, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{bmiCategory(bmi)}</Text>
          <BmiBar bmi={bmi} />
        </StatCard>
      ) : null}

      {/* Gauge energía 7d */}
      {energy7d != null ? (
        <StatCard>
          <CardHeader icon={Zap} title="Energía media (7 días)" />
          <View style={{ alignItems: 'center' }}>
            <RadialGauge value={energy7d} max={10} label="de 10" display={energy7d.toFixed(1)} color={energyColorHex(Math.round(energy7d))} />
          </View>
        </StatCard>
      ) : null}

      {/* Comparativa fotos */}
      <PhotoComparator checkIns={checkIns} onOpenPhoto={onOpenPhoto} />

      {/* Línea de tiempo de check-ins */}
      <CheckInTimeline checkIns={checkIns} onOpenPhoto={onOpenPhoto} />
    </View>
  )
}

// Render acotado: hasta TIMELINE_PAGE check-ins de golpe (evita el pico de
// memoria/jank de montar 200 <Image> al abrir Progreso). "Ver más" expande
// en bloques del mismo tamaño.
const TIMELINE_PAGE = 40

function CheckInTimeline({ checkIns, onOpenPhoto }: { checkIns: CheckInEntry[]; onOpenPhoto: (photos: string[], index: number) => void }) {
  const { theme } = useTheme()
  const [visible, setVisible] = useState(TIMELINE_PAGE)
  const shown = checkIns.slice(0, visible)
  const remaining = checkIns.length - shown.length

  return (
    <View style={{ gap: 10 }}>
      <Text style={[cd.listHeading, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Línea de tiempo de check-ins</Text>
      {shown.map((c) => (
        <CheckInRow key={c.id} c={c} onOpenPhoto={onOpenPhoto} />
      ))}
      {remaining > 0 ? (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setVisible((v) => v + TIMELINE_PAGE)}
          accessibilityRole="button"
          accessibilityLabel={`Ver más check-ins, ${remaining} restantes`}
          style={[styles.moreBtn, { borderColor: theme.border, backgroundColor: theme.secondary, borderRadius: theme.radius.lg }]}
        >
          <Text style={[styles.moreBtnTxt, { color: theme.primary, fontFamily: 'Inter_700Bold' }]}>
            Ver más ({remaining})
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}

function GoalWeightEditor({ clientId, current, onSaved }: { clientId: string; current: number | null; onSaved?: () => void }) {
  const { theme } = useTheme()
  const [value, setValue] = useState(current != null ? String(current) : '')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!clientId) return
    const n = parseFloat(value)
    const newVal = Number.isFinite(n) && n > 0 ? n : null
    setSaving(true)
    const r = await updateCoachClient(clientId, { goal_weight_kg: newVal })
    setSaving(false)
    if (r.ok) onSaved?.()
  }

  return (
    <StatCard>
      <CardHeader icon={Target} title="Peso objetivo" />
      <View style={styles.goalRow}>
        <TextInput
          value={value}
          onChangeText={setValue}
          keyboardType="decimal-pad"
          placeholder="—"
          placeholderTextColor={theme.mutedForeground}
          style={[styles.goalInput, { borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}
        />
        <Text style={[styles.goalUnit, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>kg</Text>
        <TouchableOpacity activeOpacity={0.85} onPress={save} disabled={saving} style={[styles.goalBtn, { backgroundColor: theme.primary, opacity: saving ? 0.6 : 1, borderRadius: theme.radius.lg }]}>
          <Text style={[styles.goalBtnTxt, { color: theme.primaryForeground, fontFamily: 'Inter_700Bold' }]}>{saving ? '…' : 'Guardar'}</Text>
        </TouchableOpacity>
      </View>
    </StatCard>
  )
}

function BmiBar({ bmi }: { bmi: number }) {
  const { theme } = useTheme()
  const pct = Math.max(0, Math.min(1, (bmi - BMI_MIN) / (BMI_MAX - BMI_MIN)))
  return (
    <View style={{ gap: 8, marginTop: 6 }}>
      <View style={styles.bmiTrack}>
        {BMI_SEGMENTS.map((seg, i) => {
          const lo = i === 0 ? BMI_MIN : BMI_SEGMENTS[i - 1]!.upTo
          const w = ((seg.upTo - lo) / (BMI_MAX - BMI_MIN)) * 100
          return <View key={i} style={{ width: `${w}%`, backgroundColor: seg.color }} />
        })}
        <View style={[styles.bmiMarker, { left: `${pct * 100}%` }]} />
      </View>
      <View style={styles.bmiLabels}>
        {BMI_TICKS.map((t) => (
          <Text key={t} style={[styles.bmiLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{t}</Text>
        ))}
      </View>
    </View>
  )
}

function PhotoComparator({ checkIns, onOpenPhoto }: { checkIns: CheckInEntry[]; onOpenPhoto: (photos: string[], index: number) => void }) {
  const { theme } = useTheme()
  const withPhoto = useMemo(
    () => [...checkIns].filter((c) => c.front_photo_url).sort((a, b) => a.date.localeCompare(b.date)),
    [checkIns]
  )
  const [aIdx, setAIdx] = useState(0)
  const [bIdx, setBIdx] = useState(() => Math.max(0, withPhoto.length - 1))

  if (withPhoto.length < 2) return null
  const a = withPhoto[Math.min(aIdx, withPhoto.length - 1)]!
  const b = withPhoto[Math.min(bIdx, withPhoto.length - 1)]!
  const sameSel = a.id === b.id
  const dW = a.weight != null && b.weight != null ? Math.round((Number(b.weight) - Number(a.weight)) * 10) / 10 : null
  const dE = a.energy_level != null && b.energy_level != null ? b.energy_level - a.energy_level : null

  return (
    <StatCard>
      <CardHeader icon={Camera} title="Comparativa fotos" />

      {/* Selector: Check-in base */}
      <Text style={[styles.selLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Check-in base</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
        {withPhoto.map((c, i) => (
          <SelChip key={`a${c.id}`} label={`${formatDate(c.date)} · ${c.weight != null ? `${c.weight} kg` : '—'}`} on={i === aIdx} onPress={() => setAIdx(i)} />
        ))}
      </ScrollView>

      {/* Selector: Comparar con */}
      <Text style={[styles.selLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Comparar con</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
        {withPhoto.map((c, i) => (
          <SelChip key={`b${c.id}`} label={`${formatDate(c.date)} · ${c.weight != null ? `${c.weight} kg` : '—'}`} on={i === bIdx} onPress={() => setBIdx(i)} />
        ))}
      </ScrollView>

      <View style={styles.compRow}>
        <CompCol label="Antes" c={a} onOpen={() => onOpenPhoto([a.front_photo_url!], 0)} />
        <CompCol label="Después" c={b} onOpen={() => onOpenPhoto([b.front_photo_url!], 0)} />
      </View>

      {!sameSel ? (
        <View style={[styles.deltaBox, { borderColor: theme.border, backgroundColor: theme.secondary, borderRadius: theme.radius.lg }]}>
          <Text style={[styles.deltaHead, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>Deltas entre selección</Text>
          <View style={cd.grid2}>
            {dW != null ? <MetricBox value={`${dW > 0 ? '+' : ''}${dW} kg`} label="Δ peso" color={dW > 0 ? '#EF4444' : theme.success} /> : null}
            {dE != null ? <MetricBox value={`${dE > 0 ? '+' : ''}${dE}`} label="Δ energía" color={dE >= 0 ? theme.success : '#EF4444'} /> : null}
          </View>
        </View>
      ) : null}

      <TouchableOpacity
        activeOpacity={0.85}
        disabled={sameSel || !a.front_photo_url || !b.front_photo_url}
        onPress={() => onOpenPhoto([a.front_photo_url!, b.front_photo_url!], 0)}
        style={[styles.openBtn, { backgroundColor: theme.primary, opacity: sameSel ? 0.5 : 1, borderRadius: theme.radius.lg }]}
      >
        <ArrowRightLeft size={15} color={theme.primaryForeground} />
        <Text style={[styles.openBtnTxt, { color: theme.primaryForeground, fontFamily: 'Inter_700Bold' }]}>Abrir comparativa</Text>
      </TouchableOpacity>
    </StatCard>
  )
}

function CompCol({ label, c, onOpen }: { label: string; c: CheckInEntry; onOpen: () => void }) {
  const { theme } = useTheme()
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
      <Text style={[styles.compLabel, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{label}</Text>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`Ampliar foto ${label} del ${formatDate(c.date)}`}
      >
        <Image source={{ uri: c.front_photo_url! }} style={[styles.compPhoto, { borderColor: theme.border }]} contentFit="cover" transition={150} />
      </TouchableOpacity>
      <Text style={[styles.compMeta, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{c.weight != null ? `${c.weight} kg` : '—'}</Text>
      <Text style={[styles.compMeta, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{formatDate(c.date)}</Text>
    </View>
  )
}

function SelChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { theme } = useTheme()
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[styles.selChip, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary + '1A' : 'transparent' }]}>
      <Text style={{ fontSize: 11.5, fontFamily: 'Inter_600SemiBold', color: on ? theme.primary : theme.mutedForeground }}>{label}</Text>
    </TouchableOpacity>
  )
}

function CheckInRow({ c, onOpenPhoto }: { c: CheckInEntry; onOpenPhoto: (photos: string[], index: number) => void }) {
  const { theme } = useTheme()
  const photos = [c.front_photo_url, c.back_photo_url].filter(Boolean) as string[]
  return (
    <View style={[styles.ciCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
      <View style={cd.headerRow}>
        <Text style={[styles.ciDate, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{formatDate(c.date)}</Text>
        {c.weight != null ? <Text style={[styles.ciWeight, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>{c.weight} kg</Text> : null}
      </View>
      {c.energy_level != null ? (
        <View style={styles.ciEnergyRow}>
          <Text style={[styles.ciEnergyLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Energía</Text>
          <View style={[styles.ciEnergyTrack, { backgroundColor: theme.muted }]}>
            <View style={{ width: `${(c.energy_level / 10) * 100}%`, height: '100%', borderRadius: 99, backgroundColor: energyColorHex(c.energy_level) }} />
          </View>
          <Text style={[styles.ciEnergyVal, { color: theme.foreground, fontFamily: theme.fontSans }]}>{c.energy_level}/10</Text>
        </View>
      ) : null}
      {c.notes ? <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{c.notes}</Text> : null}
      {photos.length ? (
        <View style={styles.ciPhotos}>
          {photos.map((p, i) => (
            <TouchableOpacity
              key={i}
              activeOpacity={0.85}
              onPress={() => onOpenPhoto(photos, i)}
              accessibilityRole="button"
              accessibilityLabel={`Ampliar foto ${i === 0 ? 'frontal' : 'posterior'} del check-in ${formatDate(c.date)}`}
            >
              <Image source={{ uri: p }} style={styles.ciPhoto} contentFit="cover" transition={150} />
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  tooltip: { flexDirection: 'row', gap: 10, borderWidth: 1, padding: 10 },
  tipPhoto: { width: 48, height: 60, borderRadius: 8, borderWidth: 1 },
  tipDate: { fontSize: 13 },
  tipMeta: { fontSize: 12 },
  bmiValue: { fontSize: 30, letterSpacing: -0.5 },
  bmiCat: { fontSize: 12, marginTop: -2 },
  bmiTrack: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', position: 'relative' },
  bmiMarker: { position: 'absolute', top: -4, width: 5, height: 20, borderRadius: 3, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#0F172A', marginLeft: -2.5 },
  bmiLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  bmiLabel: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 },
  selLabel: { fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 4 },
  compRow: { flexDirection: 'row', gap: 14, marginTop: 6 },
  compLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
  compPhoto: { width: 120, height: 150, borderRadius: 12, borderWidth: 1 },
  compMeta: { fontSize: 12 },
  deltaBox: { borderWidth: 1, padding: 12, gap: 8, marginTop: 4 },
  deltaHead: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8 },
  openBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, marginTop: 4 },
  openBtnTxt: { fontSize: 13 },
  chipScroll: { gap: 6 },
  selChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  ciCard: { borderWidth: 1, padding: 14, gap: 8 },
  ciDate: { fontSize: 14 },
  ciWeight: { fontSize: 15 },
  ciEnergyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ciEnergyLabel: { fontSize: 12, width: 54 },
  ciEnergyTrack: { flex: 1, height: 6, borderRadius: 99, overflow: 'hidden' },
  ciEnergyVal: { fontSize: 12, width: 38, textAlign: 'right' },
  ciPhotos: { flexDirection: 'row', gap: 8, marginTop: 2 },
  ciPhoto: { width: 64, height: 80, borderRadius: 10 },
  moreBtn: { borderWidth: 1, paddingVertical: 13, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  moreBtnTxt: { fontSize: 13 },
  goalRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  goalInput: { flex: 1, height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 16, textAlign: 'center' },
  goalUnit: { fontSize: 13 },
  goalBtn: { paddingHorizontal: 16, paddingVertical: 13 },
  goalBtnTxt: { fontSize: 13 },
})
