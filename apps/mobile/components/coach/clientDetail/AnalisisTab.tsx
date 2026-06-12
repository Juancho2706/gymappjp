import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Activity, AlertTriangle, BarChart3, ChevronLeft, ChevronRight, Dumbbell, Radar, TrendingUp } from 'lucide-react-native'
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler'
import * as Haptics from 'expo-haptics'
import { useTheme } from '../../../context/ThemeContext'
import { EmptyState, ProgressBar } from '../../../components'
import { EvaLoader } from '../../../components/EvaLoader'
import { AreaTrend, type AreaPoint } from '../charts/AreaTrend'
import { BarComposed, type BarComposedPoint } from '../charts/BarComposed'
import { MuscleRadar } from '../charts/MuscleRadar'
import { WeeklyPRBanner } from './WeeklyPRBanner'
import { StatCard, CardHeader, MetricBox, Pill, cd, formatDate } from './shared'
import {
  findWeeklyWeightPRs,
  selectStrengthCardExercises,
  strengthTrendDeltaKg,
  maxOneRMIndex,
  buildDailyTonnageSeries,
  detectVolumeImbalances,
  type ExerciseStrengthSeries,
} from '../../../lib/profile-analytics'
import type { ClientDayDetail, CoachClientDetailData } from '../../../lib/coach-client-detail'

export function AnalisisTab({
  data,
  selectedDate,
  onSelectDate,
  dayDetail,
  dayLoading,
}: {
  data: CoachClientDetailData
  selectedDate: string
  onSelectDate: (date: string) => void
  dayDetail: ClientDayDetail | null
  dayLoading: boolean
}) {
  const { theme } = useTheme()
  // Análisis ya AGREGADO en DB (RPC): PRs semanales, fuerza por ejercicio y tonelaje
  // vienen precomputados en `data` — ya no se iteran logs crudos en el cliente.
  const { strengthCards, tonnageSeries, weeklyPRs: prs, muscleVolume, muscleVolumeReps, hasTrained, workoutDates371 } = data

  const imbalances = useMemo(() => detectVolumeImbalances(muscleVolume), [muscleVolume])
  const maxVolume = Math.max(1, ...muscleVolume.map((r) => r.volume))
  const maxSets = Math.max(1, ...muscleVolumeReps.map((r) => r.sets))

  const tonnagePoints: BarComposedPoint[] = tonnageSeries.map((p, i) => ({ i, bar: p.tonnage, avg: p.movingAvg ?? p.tonnage, label: p.label }))

  // ¿Hay datos con peso? Si no, caemos a volumen por series (calistenia/cardio).
  const hasWeighted = strengthCards.length > 0 || muscleVolume.length > 0

  if (!hasTrained) {
    return <EmptyState icon={Dumbbell} title="Sin entrenamientos" subtitle="Este alumno aún no registra entrenamientos." />
  }

  return (
    <View style={{ gap: 14 }}>
      <WeeklyPRBanner prs={prs} />

      {/* Strength cards por ejercicio (solo con peso) */}
      {strengthCards.length ? (
        <View style={{ gap: 12 }}>
          <Text style={[cd.listHeading, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Fuerza por ejercicio (1RM estimado)</Text>
          {strengthCards.map((s) => <StrengthCard key={s.exerciseId} series={s} />)}
        </View>
      ) : null}

      {/* Radar muscular 30d (con peso) */}
      {muscleVolume.length >= 3 ? (
        <StatCard>
          <CardHeader icon={Radar} title="Balance muscular (30d)" />
          <MuscleRadar rows={muscleVolume} />
        </StatCard>
      ) : null}

      {/* Volumen por grupo (con peso) + alertas de desbalance */}
      {muscleVolume.length ? (
        <StatCard>
          <CardHeader icon={BarChart3} title="Volumen por grupo (30d)" />
          {muscleVolume.slice(0, 7).map((row) => (
            <View key={row.muscleGroup} style={{ gap: 6 }}>
              <View style={cd.row}>
                <Text style={[cd.rowTitle, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>{row.muscleGroup}</Text>
                <Text style={[cd.rowSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{Math.round(row.volume).toLocaleString('es-CL')}</Text>
              </View>
              <ProgressBar value={row.volume / maxVolume} color={theme.primary} height={6} />
            </View>
          ))}
          {imbalances.map((im, i) => (
            <View key={i} style={[styles.alert, { backgroundColor: '#F59E0B14', borderColor: '#F59E0B40' }]}>
              <AlertTriangle size={14} color="#F59E0B" />
              <Text style={[styles.alertTxt, { color: '#F59E0B', fontFamily: 'Inter_600SemiBold' }]}>
                {im.stronger} entrena {im.ratio}× más volumen que {im.weaker}.
              </Text>
            </View>
          ))}
        </StatCard>
      ) : null}

      {/* Tonelaje (con peso) */}
      {hasWeighted && tonnagePoints.length >= 1 ? (
        <StatCard>
          <CardHeader icon={TrendingUp} title="Tonelaje diario + media móvil 7" />
          <BarComposed points={tonnagePoints} barColor={theme.primary} lineColor="#F59E0B" suffix=" kg" />
          <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Barras = tonelaje del día · Línea = media móvil de 7 sesiones.</Text>
        </StatCard>
      ) : null}

      {/* Volumen por SERIES — fallback sin peso (calistenia/cardio) */}
      {!hasWeighted && muscleVolumeReps.length ? (
        <StatCard>
          <CardHeader icon={BarChart3} title="Volumen por grupo · series (30d)" />
          {muscleVolumeReps.slice(0, 7).map((row) => (
            <View key={row.muscleGroup} style={{ gap: 6 }}>
              <View style={cd.row}>
                <Text style={[cd.rowTitle, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>{row.muscleGroup}</Text>
                <Text style={[cd.rowSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{row.sets} series · {row.reps} reps</Text>
              </View>
              <ProgressBar value={row.sets / maxSets} color={theme.primary} height={6} />
            </View>
          ))}
          <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Este alumno entrena sin carga registrada — se mide por series y reps.</Text>
        </StatCard>
      ) : null}

      {/* Historial de sesiones (todo el año) */}
      <SessionHistory
        workoutDates={workoutDates371}
        selectedDate={selectedDate}
        onSelectDate={onSelectDate}
        dayDetail={dayDetail}
        loading={dayLoading}
      />
    </View>
  )
}

function StrengthCard({ series }: { series: ExerciseStrengthSeries }) {
  const { theme } = useTheme()
  const [active, setActive] = useState<number | null>(null)
  const trend = strengthTrendDeltaKg(series.series)
  const peakIdx = maxOneRMIndex(series.series)
  const peak = series.series[peakIdx]
  const points: AreaPoint[] = series.series.map((p, i) => ({ i, y: p.oneRm, label: p.label }))
  const sel = active != null && active >= 0 && active < series.series.length ? series.series[active] : null

  return (
    <StatCard>
      <CardHeader icon={Dumbbell} title={series.exerciseName} right={
        trend != null ? <Pill label={`${trend > 0 ? '▲ +' : trend < 0 ? '▼ ' : ''}${trend} kg`} tone={trend > 0 ? 'success' : trend < 0 ? 'danger' : undefined} /> : null
      } />
      {points.length >= 2 ? (
        <AreaTrend points={points} color="#06B6D4" suffix=" kg" decimals={1} height={150} onActiveIndex={setActive} />
      ) : (
        <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Necesita más sesiones para graficar.</Text>
      )}
      {sel ? (
        <Text style={[cd.sub, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>
          {sel.label} · {sel.weightKg} kg × {sel.reps} → 1RM {sel.oneRm} kg
        </Text>
      ) : null}
      <View style={cd.grid2}>
        {peak ? <MetricBox value={`${peak.oneRm} kg`} label="Pico 1RM" sub={peak.label} color="#06B6D4" /> : null}
        <MetricBox value={`${series.series.length}`} label="Sesiones" />
        <MetricBox value={`${Math.round(series.totalVolume).toLocaleString('es-CL')}`} label="Volumen total" />
      </View>
    </StatCard>
  )
}

function SessionHistory({ workoutDates, selectedDate, onSelectDate, dayDetail, loading }: {
  workoutDates: string[]
  selectedDate: string
  onSelectDate: (date: string) => void
  dayDetail: ClientDayDetail | null
  loading: boolean
}) {
  const { theme } = useTheme()
  // Días con entreno, más reciente primero (todo el año).
  const sessions = useMemo(
    () => [...new Set(workoutDates)].sort((a, b) => b.localeCompare(a)),
    [workoutDates]
  )
  const sidx = sessions.findIndex((d) => d === selectedDate)
  // go(1) = ir a sesión más vieja (index+1); go(-1) = más reciente.
  const go = (delta: 1 | -1) => {
    const ni = sidx + delta
    if (ni < 0 || ni >= sessions.length) return
    onSelectDate(sessions[ni]!)
    Haptics.selectionAsync().catch(() => {})
  }
  const swipe = Gesture.Race(
    Gesture.Fling().direction(Directions.LEFT).runOnJS(true).onEnd(() => go(1)),
    Gesture.Fling().direction(Directions.RIGHT).runOnJS(true).onEnd(() => go(-1))
  )

  if (sessions.length === 0) return null

  return (
    <GestureDetector gesture={swipe}>
      <View style={{ gap: 12 }}>
        <StatCard>
          <CardHeader icon={Activity} title="Historial de sesiones" right={
            <Text style={[cd.rowSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{sessions.length} sesiones</Text>
          } />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
            {sessions.map((d) => {
              const date = new Date(`${d}T12:00:00`)
              const on = d === selectedDate
              return (
                <TouchableOpacity key={d} activeOpacity={0.82} onPress={() => onSelectDate(d)}
                  style={[styles.chip, { backgroundColor: on ? theme.primary : theme.secondary, borderColor: on ? theme.primary : theme.border, borderRadius: theme.radius.lg }]}>
                  <Text style={[styles.chipDow, { color: on ? theme.primaryForeground : theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{date.toLocaleDateString('es-CL', { weekday: 'short' }).slice(0, 3)}</Text>
                  <Text style={[styles.chipNum, { color: on ? theme.primaryForeground : theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>{date.getDate()}</Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
          <View style={styles.navRow}>
            <TouchableOpacity onPress={() => go(-1)} disabled={sidx <= 0} hitSlop={8}><ChevronLeft size={22} color={sidx <= 0 ? theme.muted : theme.foreground} /></TouchableOpacity>
            <Text style={[styles.navDate, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{formatDate(selectedDate)}</Text>
            <TouchableOpacity onPress={() => go(1)} disabled={sidx < 0 || sidx >= sessions.length - 1} hitSlop={8}><ChevronRight size={22} color={sidx < 0 || sidx >= sessions.length - 1 ? theme.muted : theme.foreground} /></TouchableOpacity>
          </View>
        </StatCard>

        {loading ? (
          <View style={{ paddingVertical: 24 }}><EvaLoader size="sm" subtitle="Cargando sesión…" /></View>
        ) : dayDetail ? <SessionDetail detail={dayDetail} /> : null}
      </View>
    </GestureDetector>
  )
}

function SessionDetail({ detail }: { detail: ClientDayDetail }) {
  const { theme } = useTheme()
  const grouped = useMemo(() => {
    const map = new Map<string, { muscle: string | null; sets: typeof detail.workoutSets }>()
    for (const set of detail.workoutSets) {
      const key = set.exerciseName
      if (!map.has(key)) map.set(key, { muscle: set.muscleGroup, sets: [] })
      map.get(key)!.sets.push(set)
    }
    return [...map.entries()]
  }, [detail])
  const totalTonnage = detail.workoutSets.reduce((sum, s) => sum + (s.weightKg ?? 0) * (s.repsDone ?? 0), 0)

  if (!detail.workoutSets.length) {
    return (
      <StatCard><Text style={[cd.empty, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Sin sets registrados este día.</Text></StatCard>
    )
  }

  return (
    <StatCard>
      <CardHeader icon={Dumbbell} title="Detalle de la sesión" right={<Pill label={`${Math.round(totalTonnage).toLocaleString('es-CL')} kg`} />} />
      {grouped.map(([name, g], gi) => (
        <View key={name} style={[gi < grouped.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 8 }]}>
          <Text numberOfLines={1} style={[cd.rowTitle, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>{name}</Text>
          <Text style={[cd.rowSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{g.muscle ?? 'Sin grupo'}</Text>
          <View style={styles.setWrap}>
            {g.sets.map((set, i) => (
              <View key={i} style={[styles.setPill, { backgroundColor: theme.secondary, borderColor: theme.border }]}>
                <Text style={[styles.setTxt, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                  {set.weightKg ?? 0}×{set.repsDone ?? 0}{set.rpe != null ? ` · RPE ${set.rpe}` : ''}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ))}
    </StatCard>
  )
}

const styles = StyleSheet.create({
  alert: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  alertTxt: { fontSize: 12, flex: 1 },
  strip: { gap: 8, paddingTop: 2 },
  chip: { width: 50, paddingVertical: 8, alignItems: 'center', gap: 2, borderWidth: 1 },
  chipDow: { fontSize: 10, textTransform: 'uppercase' },
  chipNum: { fontSize: 17, lineHeight: 20 },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 4 },
  navDate: { fontSize: 14, textTransform: 'capitalize' },
  setWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  setPill: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  setTxt: { fontSize: 12 },
})
