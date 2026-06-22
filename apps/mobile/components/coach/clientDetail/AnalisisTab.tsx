import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { AlertTriangle, BarChart3, Calendar, ChevronLeft, ChevronRight, Clock, Dumbbell, Minus, Star, Target, TrendingDown, TrendingUp } from 'lucide-react-native'
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler'
import * as Haptics from 'expo-haptics'
import { useTheme } from '../../../context/ThemeContext'
import { EmptyState, ProgressBar } from '../../../components'
import { EvaLoader } from '../../../components/EvaLoader'
import { AreaTrend, type AreaPoint } from '../charts/AreaTrend'
import { BarComposed, type BarComposedPoint } from '../charts/BarComposed'
import { MuscleRadar } from '../charts/MuscleRadar'
import { WeeklyPRBanner } from './WeeklyPRBanner'
import { StatCard, CardHeader, Pill, cd, formatDate } from './shared'
import {
  detectVolumeImbalances,
  strengthTrendDeltaKg,
  maxOneRMIndex,
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
  const maxSets = Math.max(1, ...muscleVolumeReps.map((r) => r.sets))

  const tonnagePoints: BarComposedPoint[] = tonnageSeries.map((p, i) => ({ i, bar: p.tonnage, avg: p.movingAvg ?? p.tonnage, label: p.label }))

  // ¿Hay datos con peso? Si no, caemos a volumen por series (calistenia/cardio).
  const hasWeighted = strengthCards.length > 0 || muscleVolume.length > 0

  // Filtro por grupo muscular (espejo de la web). Las tarjetas vienen precomputadas (top key-lifts),
  // así que los chips se arman desde sus grupos; "Todos" = todas las tarjetas.
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null)
  const muscleGroupOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of strengthCards) {
      const mg = s.muscleGroup
      if (mg && mg !== '—') counts.set(mg, (counts.get(mg) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([group, count]) => ({ group, count }))
  }, [strengthCards])
  const filteredStrengthCards = useMemo(
    () => (selectedMuscle ? strengthCards.filter((s) => s.muscleGroup === selectedMuscle) : strengthCards),
    [selectedMuscle, strengthCards]
  )

  if (!hasTrained) {
    return <EmptyState icon={Dumbbell} title="Sin entrenamientos" subtitle="Este alumno aún no registra entrenamientos." />
  }

  return (
    <View style={{ gap: 14 }}>
      <WeeklyPRBanner prs={prs} />

      {/* Fuerza — 1RM estimado (Epley) */}
      {strengthCards.length ? (
        <View style={{ gap: 12 }}>
          <View style={styles.sectionHead}>
            <Dumbbell size={16} color={theme.primary} />
            <Text style={[styles.sectionTitle, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>Fuerza — 1RM estimado (Epley)</Text>
          </View>

          {muscleGroupOptions.length > 1 ? (
            <View style={styles.chipRow}>
              <TouchableOpacity
                onPress={() => setSelectedMuscle(null)}
                activeOpacity={0.8}
                style={[styles.filterChip, { borderColor: !selectedMuscle ? 'transparent' : theme.border, backgroundColor: !selectedMuscle ? theme.primary : theme.secondary, borderRadius: theme.radius.lg }]}
              >
                <Text style={[styles.filterChipTxt, { color: !selectedMuscle ? theme.primaryForeground : theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>Todos</Text>
              </TouchableOpacity>
              {muscleGroupOptions.map(({ group, count }) => {
                const isActive = selectedMuscle === group
                return (
                  <TouchableOpacity
                    key={group}
                    onPress={() => setSelectedMuscle(isActive ? null : group)}
                    activeOpacity={0.8}
                    style={[styles.filterChip, { borderColor: isActive ? 'transparent' : theme.border, backgroundColor: isActive ? theme.primary : theme.secondary, borderRadius: theme.radius.lg }]}
                  >
                    <Text style={[styles.filterChipTxt, { color: isActive ? theme.primaryForeground : theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
                      {group} <Text style={{ opacity: 0.6 }}>({count})</Text>
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          ) : null}

          {filteredStrengthCards.map((s) => <StrengthCard key={s.exerciseId} series={s} />)}
        </View>
      ) : null}

      {/* Balance muscular (30d) — radar + desbalances dentro de la card */}
      {muscleVolume.length >= 3 ? (
        <StatCard>
          <CardHeader icon={Target} title="Balance muscular (30d)" />
          <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Volumen relativo por grupo (normalizado al máximo del periodo).</Text>
          <MuscleRadar rows={muscleVolume} />
          {imbalances.length ? (
            <View style={{ gap: 8 }}>
              {imbalances.slice(0, 2).map((im, i) => (
                <View key={i} style={[styles.alert, { backgroundColor: '#F59E0B14', borderColor: '#F59E0B40' }]}>
                  <AlertTriangle size={14} color="#F59E0B" />
                  <Text style={[styles.alertTxt, { color: '#F59E0B', fontFamily: 'Inter_600SemiBold' }]}>
                    Posible desequilibrio: {im.stronger} ~{im.ratio}× más volumen que {im.weaker}.
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </StatCard>
      ) : null}

      {/* Tonelaje por día */}
      {hasWeighted && tonnagePoints.length >= 1 ? (
        <StatCard>
          <CardHeader icon={BarChart3} title="Tonelaje por día" />
          <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Σ (peso × reps) agrupado por fecha de registro.</Text>
          <BarComposed points={tonnagePoints} barColor={theme.primary} lineColor={theme.primary} suffix=" kg" />
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

      {/* Historial de entrenamientos (todo el año) */}
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
  const latest = series.series[series.series.length - 1]
  const delta = strengthTrendDeltaKg(series.series)
  const peakIdx = maxOneRMIndex(series.series)
  const peak = series.series[peakIdx]
  const points: AreaPoint[] = series.series.map((p, i) => ({ i, y: p.oneRm, label: p.label }))
  const sel = active != null && active >= 0 && active < series.series.length ? series.series[active] : null

  return (
    <StatCard>
      <View style={styles.strHead}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={2} style={[styles.strName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{series.exerciseName}</Text>
          <Text style={[styles.strMuscle, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{series.muscleGroup}</Text>
        </View>
        <Dumbbell size={16} color={theme.primary} style={{ opacity: 0.8 }} />
      </View>

      {/* 1RM grande + "1RM est." */}
      <View style={styles.strBigRow}>
        <Text style={[styles.strBig, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>
          {latest?.oneRm ?? '—'}<Text style={[styles.strBigUnit, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}> kg</Text>
        </Text>
        <Text style={[styles.strEst, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>1RM est.</Text>
      </View>

      {/* Delta del periodo */}
      <View style={styles.strDeltaRow}>
        {delta == null || delta === 0 ? (
          <>
            <Minus size={14} color={theme.mutedForeground} />
            <Text style={[styles.strDelta, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>Sin cambio en el periodo</Text>
          </>
        ) : delta > 0 ? (
          <>
            <TrendingUp size={14} color={theme.success} />
            <Text style={[styles.strDelta, { color: theme.success, fontFamily: 'Inter_700Bold' }]}>+{delta} kg en el periodo</Text>
          </>
        ) : (
          <>
            <TrendingDown size={14} color={theme.destructive} />
            <Text style={[styles.strDelta, { color: theme.destructive, fontFamily: 'Inter_700Bold' }]}>{delta} kg en el periodo</Text>
          </>
        )}
      </View>

      {points.length >= 2 ? (
        <AreaTrend points={points} color={theme.primary} suffix=" kg" decimals={1} height={140} onActiveIndex={setActive} />
      ) : (
        <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Necesita más sesiones para graficar.</Text>
      )}
      {sel ? (
        <Text style={[cd.sub, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>
          {sel.label} · {sel.weightKg} kg × {sel.reps} → 1RM {sel.oneRm} kg
        </Text>
      ) : null}

      {/* Footer: Pico + Última */}
      <View style={[styles.strFooter, { borderTopColor: theme.border }]}>
        {peak ? (
          <View style={styles.strFooterItem}>
            <Star size={12} color="#F59E0B" />
            <Text style={[styles.strFooterTxt, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>Pico {peak.oneRm} kg ({peak.label})</Text>
          </View>
        ) : null}
        {latest ? (
          <Text style={[styles.strFooterMuted, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>Última: {latest.weightKg} kg × {latest.reps}</Text>
        ) : null}
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
  const recent = sessions.slice(0, 10)

  return (
    <GestureDetector gesture={swipe}>
      <View style={{ gap: 12 }}>
        <StatCard>
          <CardHeader icon={Clock} title="Historial de entrenamientos" right={
            <Text style={[cd.rowSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Últimas {recent.length} sesiones registradas</Text>
          } />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
            {recent.map((d) => {
              const date = new Date(`${d}T12:00:00`)
              const on = d === selectedDate
              const dayName = date.toLocaleDateString('es-ES', { weekday: 'short' })
              const month = date.toLocaleDateString('es-ES', { month: 'short' })
              return (
                <TouchableOpacity key={d} activeOpacity={0.82} onPress={() => onSelectDate(d)}
                  style={[styles.chip, { backgroundColor: on ? theme.primary : theme.secondary, borderColor: on ? theme.primary : theme.border, borderRadius: theme.radius.lg }]}>
                  <Text style={[styles.chipDow, { color: on ? theme.primaryForeground : theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{dayName}</Text>
                  <Text style={[styles.chipNum, { color: on ? theme.primaryForeground : theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>{date.getDate()}</Text>
                  <Text style={[styles.chipMonth, { color: on ? theme.primaryForeground : theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{month}</Text>
                </TouchableOpacity>
              )
            })}
          </ScrollView>

          {/* Buscar sesión por fecha (navegador de fechas) */}
          <View style={[styles.searchRow, { borderTopColor: theme.border }]}>
            <View style={styles.searchLabelRow}>
              <Calendar size={12} color={theme.mutedForeground} />
              <Text style={[styles.searchLabel, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>Buscar sesión por fecha</Text>
            </View>
            <View style={styles.navRow}>
              <TouchableOpacity onPress={() => go(-1)} disabled={sidx <= 0} hitSlop={8}><ChevronLeft size={22} color={sidx <= 0 ? theme.muted : theme.foreground} /></TouchableOpacity>
              <Text style={[styles.navDate, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{formatDate(selectedDate)}</Text>
              <TouchableOpacity onPress={() => go(1)} disabled={sidx < 0 || sidx >= sessions.length - 1} hitSlop={8}><ChevronRight size={22} color={sidx < 0 || sidx >= sessions.length - 1 ? theme.muted : theme.foreground} /></TouchableOpacity>
            </View>
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
  const totalSets = detail.workoutSets.length
  const totalTonnage = detail.workoutSets.reduce((sum, s) => sum + (s.weightKg ?? 0) * (s.repsDone ?? 0), 0)

  if (!detail.workoutSets.length) {
    return (
      <StatCard><Text style={[cd.empty, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Sin entrenamiento registrado para este día.</Text></StatCard>
    )
  }

  return (
    <StatCard>
      {/* Barra de meta de sesión (pills) */}
      <View style={cd.metaRow}>
        <Pill label={`${grouped.length} ejercicio${grouped.length !== 1 ? 's' : ''}`} color={theme.mutedForeground} />
        <Pill label={`${totalSets} sets`} color={theme.mutedForeground} />
        {totalTonnage > 0 ? <Pill label={`${Math.round(totalTonnage).toLocaleString('es-CL')} kg·rep`} /> : null}
      </View>

      {grouped.map(([name, g], gi) => {
        const sorted = [...g.sets].sort((a, b) => (a.setNumber ?? 0) - (b.setNumber ?? 0))
        return (
          <View key={name} style={[styles.exCard, { borderColor: theme.border, backgroundColor: theme.secondary + '1A', borderRadius: theme.radius.lg }]}>
            <View style={[styles.exCardHead, { borderBottomColor: theme.border }]}>
              <View style={styles.exCardHeadLeft}>
                <View style={[styles.exIdx, { backgroundColor: theme.primary }]}>
                  <Text style={[styles.exIdxTxt, { color: theme.primaryForeground, fontFamily: 'Inter_700Bold' }]}>{gi + 1}</Text>
                </View>
                <Text numberOfLines={1} style={[styles.exName, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]}>{name}</Text>
              </View>
              {g.muscle ? <Text style={[styles.exMuscle, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{g.muscle}</Text> : null}
            </View>
            <View style={styles.setRows}>
              {sorted.map((set, i) => (
                <View key={i} style={styles.setRow}>
                  <Text style={[styles.setNum, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>#{set.setNumber ?? i + 1}</Text>
                  <Text style={[styles.setVal, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]}>{set.weightKg ?? '—'}<Text style={{ color: theme.mutedForeground }}> kg</Text></Text>
                  <Text style={[styles.setX, { color: theme.mutedForeground }]}>×</Text>
                  <Text style={[styles.setVal, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]}>{set.repsDone ?? '—'}<Text style={{ color: theme.mutedForeground }}> reps</Text></Text>
                  {set.rpe != null ? (
                    <View style={[styles.rpePill, { backgroundColor: '#F59E0B1A', borderColor: '#F59E0B33' }]}>
                      <Text style={[styles.rpeTxt, { color: '#F59E0B', fontFamily: 'Inter_700Bold' }]}>RPE {set.rpe}</Text>
                    </View>
                  ) : null}
                </View>
              ))}
            </View>
          </View>
        )
      })}
    </StatCard>
  )
}

const styles = StyleSheet.create({
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filterChip: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  filterChipTxt: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 },

  alert: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },
  alertTxt: { fontSize: 12, flex: 1 },

  // Strength card
  strHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  strName: { fontSize: 13, textTransform: 'uppercase', letterSpacing: -0.2 },
  strMuscle: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 2 },
  strBigRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' },
  strBig: { fontSize: 28, letterSpacing: -0.5 },
  strBigUnit: { fontSize: 13 },
  strEst: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8, paddingBottom: 4 },
  strDeltaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  strDelta: { fontSize: 11 },
  strFooter: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 14, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, marginTop: 2 },
  strFooterItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  strFooterTxt: { fontSize: 11 },
  strFooterMuted: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 },

  // History strip
  strip: { gap: 8, paddingTop: 2 },
  chip: { width: 52, paddingVertical: 9, paddingHorizontal: 2, alignItems: 'center', gap: 1, borderWidth: 1 },
  chipDow: { fontSize: 8, textTransform: 'capitalize', letterSpacing: 0.5 },
  chipNum: { fontSize: 17, lineHeight: 20 },
  chipMonth: { fontSize: 8, textTransform: 'uppercase' },
  searchRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 8 },
  searchLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  searchLabel: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8 },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 2 },
  navDate: { fontSize: 14, textTransform: 'capitalize' },

  // Session detail
  exCard: { borderWidth: 1, overflow: 'hidden' },
  exCardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  exCardHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  exIdx: { width: 20, height: 20, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  exIdxTxt: { fontSize: 10 },
  exName: { fontSize: 12, textTransform: 'uppercase', letterSpacing: -0.2, flex: 1 },
  exMuscle: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8 },
  setRows: { paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  setNum: { fontSize: 10, width: 28 },
  setVal: { fontSize: 12 },
  setX: { fontSize: 12 },
  rpePill: { marginLeft: 'auto', borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  rpeTxt: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5 },
})
