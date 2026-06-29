import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Image } from 'expo-image'
import { Activity, GitCompare, Scale, TrendingUp, Zap } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { EmptyState } from '../../../components'
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

const BMI_MIN = 15
const BMI_MAX = 40
const BMI_SEGMENTS = [
  { upTo: 18.5, color: '#3B82F6' },
  { upTo: 25, color: '#10B981' },
  { upTo: 30, color: '#F59E0B' },
  { upTo: 40, color: '#EF4444' },
]

export function ProgresoTab({ data, onOpenPhoto }: { data: CoachClientDetailData; onOpenPhoto: (photos: string[], index: number) => void }) {
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
      {/* AreaChart de peso */}
      {points.length >= 2 ? (
        <StatCard>
          <CardHeader icon={Scale} title="Evolución de peso" right={
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
                <Text style={[styles.tipDate, { color: theme.foreground, fontFamily: 'Archivo_700Bold' }]}>{formatDate(active.date)}</Text>
                <Text style={[styles.tipMeta, { color: theme.primary, fontFamily: 'HankenGrotesk_700Bold' }]}>
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

      {/* Stats de composición */}
      <View style={cd.grid2}>
        <MetricBox value={initial != null ? `${initial} kg` : '—'} label="Peso inicial" />
        <MetricBox value={actual != null ? `${actual} kg` : '—'} label="Peso actual" />
        <MetricBox value={cambio != null ? `${cambio > 0 ? '+' : ''}${cambio} kg` : '—'} label="Cambio total" color={cambio == null ? undefined : cambio > 0 ? '#EF4444' : theme.success} />
        <MetricBox value={`${ritmo30 > 0 ? '+' : ''}${ritmo30} kg`} label="Ritmo 30d" color={ritmo30 > 0 ? '#EF4444' : ritmo30 < 0 ? theme.success : undefined} />
        <MetricBox value={proyeccion4w != null ? `${proyeccion4w} kg` : '—'} label="Proyección 4 sem" sub="regresión lineal" />
      </View>

      {/* IMC */}
      {bmi != null ? (
        <StatCard>
          <CardHeader icon={TrendingUp} title="Índice de masa corporal" right={<Pill label={bmiCategory(bmi)} />} />
          <Text style={[styles.bmiValue, { color: theme.foreground, fontFamily: 'Archivo_800ExtraBold' }]}>{bmi.toFixed(1)}</Text>
          <BmiBar bmi={bmi} />
        </StatCard>
      ) : null}

      {/* Gauge energía 7d */}
      {energy7d != null ? (
        <StatCard>
          <CardHeader icon={Zap} title="Energía promedio (7d)" />
          <View style={{ alignItems: 'center' }}>
            <RadialGauge value={energy7d} max={10} label="de 10" display={energy7d.toFixed(1)} color={energyColorHex(Math.round(energy7d))} />
          </View>
        </StatCard>
      ) : null}

      {/* Comparador de fotos */}
      <PhotoComparator checkIns={checkIns} onOpenPhoto={onOpenPhoto} />

      {/* Timeline de check-ins */}
      <View style={{ gap: 10 }}>
        <Text style={[cd.listHeading, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Historial de check-ins</Text>
        {checkIns.map((c) => (
          <CheckInRow key={c.id} c={c} onOpenPhoto={onOpenPhoto} />
        ))}
      </View>
    </View>
  )
}

function BmiBar({ bmi }: { bmi: number }) {
  const { theme } = useTheme()
  const pct = Math.max(0, Math.min(1, (bmi - BMI_MIN) / (BMI_MAX - BMI_MIN)))
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.bmiTrack}>
        {BMI_SEGMENTS.map((seg, i) => {
          const lo = i === 0 ? BMI_MIN : BMI_SEGMENTS[i - 1]!.upTo
          const w = ((seg.upTo - lo) / (BMI_MAX - BMI_MIN)) * 100
          return <View key={i} style={{ width: `${w}%`, backgroundColor: seg.color }} />
        })}
        <View style={[styles.bmiMarker, { left: `${pct * 100}%` }]} />
      </View>
      <View style={styles.bmiLabels}>
        <Text style={[styles.bmiLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Bajo</Text>
        <Text style={[styles.bmiLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Normal</Text>
        <Text style={[styles.bmiLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Sobre</Text>
        <Text style={[styles.bmiLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Obes.</Text>
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
  const dW = a.weight != null && b.weight != null ? Math.round((Number(b.weight) - Number(a.weight)) * 10) / 10 : null
  const dE = a.energy_level != null && b.energy_level != null ? b.energy_level - a.energy_level : null

  return (
    <StatCard>
      <CardHeader icon={GitCompare} title="Comparador antes / después" />
      <View style={styles.compRow}>
        <CompCol label="Antes" c={a} onOpen={() => onOpenPhoto([a.front_photo_url!], 0)} />
        <CompCol label="Después" c={b} onOpen={() => onOpenPhoto([b.front_photo_url!], 0)} />
      </View>
      <View style={cd.grid2}>
        {dW != null ? <MetricBox value={`${dW > 0 ? '+' : ''}${dW} kg`} label="Δ peso" color={dW > 0 ? '#EF4444' : theme.success} /> : null}
        {dE != null ? <MetricBox value={`${dE > 0 ? '+' : ''}${dE}`} label="Δ energía" color={dE >= 0 ? theme.success : '#EF4444'} /> : null}
      </View>
      <Text style={[styles.compHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Antes</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
        {withPhoto.map((c, i) => (
          <SelChip key={`a${c.id}`} label={formatDate(c.date)} on={i === aIdx} onPress={() => setAIdx(i)} />
        ))}
      </ScrollView>
      <Text style={[styles.compHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Después</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
        {withPhoto.map((c, i) => (
          <SelChip key={`b${c.id}`} label={formatDate(c.date)} on={i === bIdx} onPress={() => setBIdx(i)} />
        ))}
      </ScrollView>
    </StatCard>
  )
}

function CompCol({ label, c, onOpen }: { label: string; c: CheckInEntry; onOpen: () => void }) {
  const { theme } = useTheme()
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 6 }}>
      <Text style={[styles.compLabel, { color: theme.mutedForeground, fontFamily: 'HankenGrotesk_700Bold' }]}>{label}</Text>
      <TouchableOpacity activeOpacity={0.85} onPress={onOpen}>
        <Image source={{ uri: c.front_photo_url! }} style={[styles.compPhoto, { borderColor: theme.border }]} contentFit="cover" transition={150} />
      </TouchableOpacity>
      <Text style={[styles.compMeta, { color: theme.foreground, fontFamily: 'Archivo_700Bold' }]}>{c.weight != null ? `${c.weight} kg` : '—'}</Text>
      <Text style={[styles.compMeta, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{formatDate(c.date)}</Text>
    </View>
  )
}

function SelChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { theme } = useTheme()
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[styles.selChip, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary + '1A' : 'transparent' }]}>
      <Text style={{ fontSize: 11.5, fontFamily: 'HankenGrotesk_600SemiBold', color: on ? theme.primary : theme.mutedForeground }}>{label}</Text>
    </TouchableOpacity>
  )
}

function CheckInRow({ c, onOpenPhoto }: { c: CheckInEntry; onOpenPhoto: (photos: string[], index: number) => void }) {
  const { theme } = useTheme()
  const photos = [c.front_photo_url, c.back_photo_url].filter(Boolean) as string[]
  return (
    <View style={[styles.ciCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
      <View style={cd.headerRow}>
        <Text style={[styles.ciDate, { color: theme.foreground, fontFamily: 'Archivo_700Bold' }]}>{formatDate(c.date)}</Text>
        {c.weight != null ? <Text style={[styles.ciWeight, { color: theme.primary, fontFamily: 'Archivo_700Bold' }]}>{c.weight} kg</Text> : null}
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
            <TouchableOpacity key={i} activeOpacity={0.85} onPress={() => onOpenPhoto(photos, i)}>
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
  bmiTrack: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', position: 'relative' },
  bmiMarker: { position: 'absolute', top: -4, width: 5, height: 20, borderRadius: 3, backgroundColor: '#FFFFFF', borderWidth: 1.5, borderColor: '#0F172A', marginLeft: -2.5 },
  bmiLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  bmiLabel: { fontSize: 9.5 },
  compRow: { flexDirection: 'row', gap: 14 },
  compLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
  compPhoto: { width: 120, height: 150, borderRadius: 12, borderWidth: 1 },
  compMeta: { fontSize: 12 },
  compHint: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 4 },
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
})
