import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { AlertTriangle, ArrowRightLeft, CalendarSearch, ChevronLeft, ChevronRight, Dumbbell, Moon, StickyNote } from 'lucide-react-native'
import Svg, { Circle, Line, Polygon, Polyline, Text as SvgText } from 'react-native-svg'
import { useTheme } from '../../../context/ThemeContext'
import { Button, EmptyState, Sheet } from '../../../components'
import { EvaLoader } from '../../../components/EvaLoader'
import { InfoTooltip } from '../../InfoTooltip'
import { PHASE_COLORS } from '../ProgramConfigSheet'
import { WeeklyPRBanner } from './WeeklyPRBanner'
import { StatCard } from './shared'
import {
  detectVolumeImbalances,
  strengthTrendDeltaKg,
  type ExerciseStrengthSeries,
  type SessionTonnagePoint,
} from '../../../lib/profile-analytics'
import type { ClientDayDetail, CoachClientDetailData, MuscleVolumeEntry, WorkoutDaySet } from '../../../lib/coach-client-detail'
import {
  filterTrainingStrengthSeries,
  isValidIsoYmd,
  selectTrainingRadarRows,
  trainingProgressionLabel,
} from '../../../lib/coach-client-detail-logic'
import { FONT } from '../../../lib/typography'
import { getTodayInSantiago } from '../../../lib/date-utils'

const GLOSSARY = {
  e1rm: { title: '1RM estimado', content: '1RM estimado por fórmula Epley a partir de tus series.' },
  volumen: { title: 'Volumen', content: 'Suma de peso × reps por grupo muscular.' },
  tonelaje: { title: 'Tonelaje', content: 'Volumen de carga = suma de peso × reps.' },
  rpe: { title: 'RPE', content: 'Esfuerzo percibido, escala 6-10; 10 = máximo.' },
  rir: { title: 'RIR', content: 'Reps en reserva: cuántas te quedaban antes del fallo; 0 = al fallo.' },
} as const

type GlossaryKey = keyof typeof GLOSSARY

function SectionTitle({ children, info, right }: { children: string; info?: GlossaryKey; right?: ReactNode }) {
  return (
    <View style={styles.sectionTitleRow}>
      <View style={styles.sectionTitleCopy}>
        <Text className="text-strong" style={styles.sectionTitle}>{children}</Text>
        {info ? <InfoTooltip title={GLOSSARY[info].title} content={GLOSSARY[info].content} size={14} /> : null}
      </View>
      {right}
    </View>
  )
}

export function AnalisisTab({
  data,
  selectedDate,
  onSelectDate,
  dayDetail,
  dayLoading,
  dayError,
  onRetryDay,
}: {
  data: CoachClientDetailData
  selectedDate: string
  onSelectDate: (date: string) => void
  dayDetail: ClientDayDetail | null
  dayLoading: boolean
  dayError: string | null
  onRetryDay: () => void
}) {
  const { strengthCards, tonnageSeries, weeklyPRs, muscleVolume, hasTrained, workoutDates371 } = data
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null)

  const muscleOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const series of strengthCards) {
      if (series.muscleGroup && series.muscleGroup !== '—' && series.series.length > 0) {
        counts.set(series.muscleGroup, (counts.get(series.muscleGroup) ?? 0) + 1)
      }
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([group, count]) => ({ group, count }))
  }, [strengthCards])

  const visibleStrength = useMemo(
    () => filterTrainingStrengthSeries(strengthCards, selectedMuscle),
    [selectedMuscle, strengthCards],
  )

  const radarRows = useMemo(() => selectTrainingRadarRows(muscleVolume), [muscleVolume])
  const imbalances = useMemo(() => detectVolumeImbalances(muscleVolume), [muscleVolume])
  const tonnageBars = useMemo(() => tonnageSeries.slice(-7), [tonnageSeries])

  if (!hasTrained) {
    return <EmptyState icon={Dumbbell} title="Sin entrenamientos" subtitle="Este alumno aún no registra entrenamientos." />
  }

  return (
    <View style={styles.root}>
      <WeeklyPRBanner prs={weeklyPRs} />

      {strengthCards.length ? (
        <View style={styles.sectionBlock}>
          <SectionTitle info="e1rm">Fuerza — 1RM estimado (Epley)</SectionTitle>
          {muscleOptions.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterStrip}>
              <MuscleFilterChip label={`Todos · ${strengthCards.length}`} active={!selectedMuscle} onPress={() => setSelectedMuscle(null)} />
              {muscleOptions.map(({ group, count }) => (
                <MuscleFilterChip
                  key={group}
                  label={`${group} · ${count}`}
                  active={selectedMuscle === group}
                  onPress={() => setSelectedMuscle((current) => current === group ? null : group)}
                />
              ))}
            </ScrollView>
          ) : null}
          {visibleStrength.length ? (
            <View style={styles.strengthGrid}>
              {Array.from({ length: Math.ceil(visibleStrength.length / 2) }, (_, rowIndex) => {
                const row = visibleStrength.slice(rowIndex * 2, rowIndex * 2 + 2)
                return (
                  <View key={row[0]!.exerciseId} style={styles.strengthRow}>
                    {row.map((series) => <StrengthSparkCard key={series.exerciseId} series={series} />)}
                    {row.length === 1 ? <View style={styles.strengthCell} /> : null}
                  </View>
                )
              })}
            </View>
          ) : (
            <StatCard><Text className="text-muted" style={styles.emptyCopy}>Sin series de fuerza para este grupo.</Text></StatCard>
          )}
        </View>
      ) : null}

      {radarRows.length >= 3 ? (
        <StatCard>
          <SectionTitle info="volumen">Balance muscular · 30 días</SectionTitle>
          <TrainingRadar rows={radarRows} />
          {imbalances[0] ? (
            <View className="bg-warning-100 dark:bg-warning-100/[0.18]" style={styles.imbalanceBanner}>
              <AlertTriangle size={16} className="text-warning-600" />
              <Text className="text-warning-700" style={styles.imbalanceCopy}>
                Posible desequilibrio: {imbalances[0].stronger} ~{imbalances[0].ratio}× más volumen que {imbalances[0].weaker}
              </Text>
            </View>
          ) : null}
        </StatCard>
      ) : null}

      {tonnageBars.length ? (
        <StatCard>
          <SectionTitle info="tonelaje">Tonelaje por sesión · 7 días</SectionTitle>
          <TonnageBars rows={tonnageBars} />
        </StatCard>
      ) : null}

      <SessionHistory
        workoutDates={workoutDates371}
        selectedDate={selectedDate}
        onSelectDate={onSelectDate}
        dayDetail={dayDetail}
        loading={dayLoading}
        error={dayError}
        onRetry={onRetryDay}
      />
    </View>
  )
}

function MuscleFilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      className={active ? 'border-sport-500 bg-sport-500' : 'border-subtle bg-surface-sunken'}
      style={styles.filterChip}
    >
      <Text className={active ? 'text-white' : 'text-muted'} style={styles.filterChipText}>{label}</Text>
    </TouchableOpacity>
  )
}

function StrengthSparkCard({ series }: { series: ExerciseStrengthSeries }) {
  const { theme } = useTheme()
  const values = series.series.map((point) => point.oneRm)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const points = values.map((value, index) => ({
    x: values.length > 1 ? (index / (values.length - 1)) * 100 : 50,
    y: 100 - ((value - min) / span) * 76 - 8,
  }))
  const line = points.map((point) => `${point.x},${point.y}`).join(' ')
  const area = `0,100 ${line} 100,100`
  const peak = points[values.indexOf(max)]!
  const latest = series.series[series.series.length - 1]!
  const delta = strengthTrendDeltaKg(series.series)
  const deltaTone = delta == null ? theme.mutedForeground : delta >= 0 ? theme.success : theme.destructive

  return (
    <View style={styles.strengthCell}>
      <StatCard style={styles.strengthCard}>
        <Text className="text-strong" style={styles.strengthName} numberOfLines={1}>{series.exerciseName}</Text>
        <Text className="text-muted" style={styles.strengthMuscle} numberOfLines={1}>{series.muscleGroup}</Text>
        <View style={styles.oneRmRow}>
          <Text className="text-strong" style={styles.oneRmValue}>{latest.oneRm}</Text>
          <Text className="text-muted" style={styles.oneRmUnit}>kg 1RM</Text>
        </View>
        <Text style={[styles.strengthDelta, { color: deltaTone }]}>
          {delta == null ? 'Sin cambio en el periodo' : `${delta >= 0 ? '+' : ''}${delta} kg período`}
        </Text>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`Tendencia de ${series.exerciseName}. Último 1RM ${latest.oneRm} kg; pico ${max} kg.`}
        >
          <Svg viewBox="0 0 100 100" width="100%" height={46} preserveAspectRatio="none">
            <Polygon points={area} fill={theme.primary} opacity={0.16} />
            {values.length > 1 ? <Polyline points={line} fill="none" stroke={theme.primary} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" /> : null}
            <Circle cx={peak.x} cy={peak.y} r={2.6} fill={PHASE_COLORS[4]} />
          </Svg>
        </View>
        <Text className="text-muted" style={styles.strengthLatest}>Última: {latest.weightKg} kg × {latest.reps}</Text>
      </StatCard>
    </View>
  )
}

function TrainingRadar({ rows }: { rows: MuscleVolumeEntry[] }) {
  const { theme } = useTheme()
  const center = 50
  const radius = 38
  const max = Math.max(...rows.map((row) => row.volume), 1)
  const point = (index: number, r: number) => {
    const angle = (Math.PI * 2 * index) / rows.length - Math.PI / 2
    return { x: center + Math.cos(angle) * r, y: center + Math.sin(angle) * r }
  }
  const dataPoints = rows.map((row, index) => point(index, radius * (row.volume / max)))
  const accessibleCopy = rows.map((row) => `${row.muscleGroup}: ${Math.round(row.volume)}`).join(', ')

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`Balance muscular de 30 días. ${accessibleCopy}.`} style={styles.radarWrap}>
      <View style={styles.radarCanvas}>
        <Svg viewBox="0 0 100 100" width="100%" height="100%">
          {[0.25, 0.5, 0.75, 1].map((ring) => (
            <Polygon key={ring} points={rows.map((_, index) => { const p = point(index, radius * ring); return `${p.x},${p.y}` }).join(' ')} fill="none" stroke={theme.border} strokeWidth={0.5} />
          ))}
          {rows.map((_, index) => { const p = point(index, radius); return <Line key={index} x1={center} y1={center} x2={p.x} y2={p.y} stroke={theme.border} strokeWidth={0.5} /> })}
          <Polygon points={dataPoints.map((p) => `${p.x},${p.y}`).join(' ')} fill={theme.primary} fillOpacity={0.2} stroke={theme.primary} strokeWidth={1.5} />
          {rows.map((row, index) => {
            const p = point(index, radius + 7)
            const label = row.muscleGroup.length > 10 ? `${row.muscleGroup.slice(0, 9)}…` : row.muscleGroup
            return <SvgText key={row.muscleGroup} x={p.x} y={p.y} fill={theme.mutedForeground} fontSize={4.4} fontWeight="700" textAnchor="middle" alignmentBaseline="middle">{label}</SvgText>
          })}
        </Svg>
      </View>
    </View>
  )
}

function TonnageBars({ rows }: { rows: SessionTonnagePoint[] }) {
  const { theme } = useTheme()
  const max = Math.max(...rows.map((row) => row.tonnage), 1)
  const average = Math.round(rows.reduce((sum, row) => sum + row.tonnage, 0) / rows.length)
  const averageTop = Math.max(0, Math.min(100, 100 - (average / max) * 100))
  const initials = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

  return (
    <View>
      <View style={styles.tonnageChart}>
        <View style={[styles.averageLine, { top: `${averageTop}%`, borderTopColor: theme.mutedForeground }]} />
        <View style={styles.tonnageColumns}>
          {rows.map((row, index) => {
            const day = new Date(`${row.dateKey}T12:00:00Z`).getUTCDay()
            const last = index === rows.length - 1
            return (
              <View
                key={row.dateKey}
                accessible
                accessibilityLabel={`${row.label}: ${row.tonnage.toLocaleString('es-CL')} kilogramos-repetición`}
                style={styles.tonnageColumn}
              >
                <View style={[styles.tonnageBar, { height: `${Math.max(2, (row.tonnage / max) * 100)}%`, backgroundColor: last ? theme.primary : theme.borderDefault }]} />
                <Text className="text-muted" style={styles.tonnageDay}>{initials[day]}</Text>
              </View>
            )
          })}
        </View>
      </View>
      <View style={styles.averageLegend}>
        <View style={[styles.averageLegendLine, { borderTopColor: theme.mutedForeground }]} />
        <Text className="text-muted" style={styles.averageLegendText}>Media móvil 7 ses.</Text>
      </View>
    </View>
  )
}

const CALENDAR_WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function calendarMonthStart(iso: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(iso)
  return match ? `${match[1]}-${match[2]}-01` : `${getTodayInSantiago().iso.slice(0, 7)}-01`
}

function shiftCalendarMonth(monthIso: string, delta: number): string {
  const [year, month] = monthIso.split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1 + delta, 1)).toISOString().slice(0, 10)
}

function calendarMonthCells(monthIso: string): Array<{ iso: string; day: number; inMonth: boolean }> {
  const [year, month] = monthIso.split('-').map(Number)
  const first = new Date(Date.UTC(year!, month! - 1, 1))
  const mondayOffset = (first.getUTCDay() + 6) % 7
  const firstCell = Date.UTC(year!, month! - 1, 1 - mondayOffset)
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstCell + index * 86_400_000)
    return {
      iso: date.toISOString().slice(0, 10),
      day: date.getUTCDate(),
      inMonth: date.getUTCMonth() === month! - 1,
    }
  })
}

function calendarMonthTitle(monthIso: string): string {
  const [year, month] = monthIso.split('-').map(Number)
  const text = new Date(Date.UTC(year!, month! - 1, 1)).toLocaleDateString('es-CL', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function SessionHistory({ workoutDates, selectedDate, onSelectDate, dayDetail, loading, error, onRetry }: {
  workoutDates: string[]
  selectedDate: string
  onSelectDate: (date: string) => void
  dayDetail: ClientDayDetail | null
  loading: boolean
  error: string | null
  onRetry: () => void
}) {
  const { theme } = useTheme()
  const [dateOpen, setDateOpen] = useState(false)
  const [dateInput, setDateInput] = useState(selectedDate)
  const [calendarMonth, setCalendarMonth] = useState(() => calendarMonthStart(selectedDate))
  const [historyRequested, setHistoryRequested] = useState(false)
  const autoSelected = useRef(false)
  const sessions = useMemo(() => [...new Set(workoutDates)].sort((a, b) => b.localeCompare(a)), [workoutDates])
  const recent = sessions.slice(0, 10)

  useEffect(() => {
    if (autoSelected.current || sessions.length === 0) return
    autoSelected.current = true
    setHistoryRequested(true)
    if (!sessions.includes(selectedDate)) onSelectDate(sessions[0]!)
  }, [onSelectDate, selectedDate, sessions])

  function openDate() {
    setDateInput(selectedDate)
    setCalendarMonth(calendarMonthStart(selectedDate))
    setDateOpen(true)
  }

  function applyDate() {
    if (!isValidIsoYmd(dateInput)) return
    onSelectDate(dateInput)
    setHistoryRequested(true)
    setDateOpen(false)
  }

  const calendarCells = calendarMonthCells(calendarMonth)
  const todayIso = getTodayInSantiago().iso

  return (
    <View style={styles.sectionBlock}>
      <SectionTitle
        right={
          <TouchableOpacity
            onPress={openDate}
            accessibilityRole="button"
            accessibilityLabel={`Buscar sesión por fecha. Fecha actual ${selectedDate}`}
            className="border border-subtle bg-surface-card"
            style={styles.dateButton}
          >
            <CalendarSearch size={15} color={theme.mutedForeground} />
            <Text className="text-strong" style={styles.dateButtonText}>{selectedDate}</Text>
          </TouchableOpacity>
        }
      >Historial de sesiones</SectionTitle>

      {recent.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.sessionStrip}>
          {recent.map((date) => <SessionChip key={date} date={date} selected={date === selectedDate} onPress={() => { setHistoryRequested(true); onSelectDate(date) }} />)}
        </ScrollView>
      ) : (
        <StatCard><Text className="text-muted" style={styles.emptyCopy}>Sin sesiones registradas aún.</Text></StatCard>
      )}

      {historyRequested && error ? (
        <StatCard>
          <View style={styles.sessionEmpty}>
            <AlertTriangle size={24} color={theme.destructive} />
            <Text className="text-danger-600" style={styles.sessionEmptyText}>{error}</Text>
            <Button label="Reintentar" variant="secondary" onPress={onRetry} />
          </View>
        </StatCard>
      ) : historyRequested && (loading || dayDetail?.date !== selectedDate) ? (
        <StatCard><EvaLoader size="sm" subtitle="Cargando sesión…" /></StatCard>
      ) : historyRequested && dayDetail?.workoutSets.length ? (
        <SessionDetail detail={dayDetail} />
      ) : historyRequested ? (
        <StatCard>
          <View style={styles.sessionEmpty}>
            <Moon size={24} color={theme.mutedForeground} />
            <Text className="text-muted" style={styles.sessionEmptyText}>Sin entrenamiento registrado para este día</Text>
          </View>
        </StatCard>
      ) : null}

      <Sheet
        open={dateOpen}
        onClose={() => setDateOpen(false)}
        title="Buscar sesión por fecha"
        nativeModal
        snapPoints={['72%']}
        footer={<Button label="Ver fecha" variant="sport" onPress={applyDate} full />}
      >
        <View style={styles.calendarHeader}>
          <TouchableOpacity
            onPress={() => setCalendarMonth((month) => shiftCalendarMonth(month, -1))}
            accessibilityRole="button"
            accessibilityLabel="Mes anterior"
            className="items-center justify-center rounded-control border border-subtle bg-surface-sunken"
            style={styles.calendarNav}
          >
            <ChevronLeft size={18} color={theme.mutedForeground} />
          </TouchableOpacity>
          <Text className="text-strong" style={styles.calendarTitle}>{calendarMonthTitle(calendarMonth)}</Text>
          <TouchableOpacity
            onPress={() => setCalendarMonth((month) => shiftCalendarMonth(month, 1))}
            accessibilityRole="button"
            accessibilityLabel="Mes siguiente"
            className="items-center justify-center rounded-control border border-subtle bg-surface-sunken"
            style={styles.calendarNav}
          >
            <ChevronRight size={18} color={theme.mutedForeground} />
          </TouchableOpacity>
        </View>
        <View style={styles.calendarGrid}>
          {CALENDAR_WEEKDAYS.map((weekday) => (
            <Text key={weekday} className="text-muted" style={styles.calendarWeekday}>{weekday}</Text>
          ))}
          {calendarCells.map((cell) => {
            const selected = cell.iso === dateInput
            const today = cell.iso === todayIso
            const shell = selected
              ? 'border-sport-500 bg-sport-500'
              : today
                ? 'border-sport-500 bg-sport-100 dark:bg-sport-100/20'
                : 'border-transparent bg-surface-card'
            const textTone = selected ? 'text-on-sport' : cell.inMonth ? 'text-strong' : 'text-subtle'
            const spoken = new Date(`${cell.iso}T12:00:00Z`).toLocaleDateString('es-CL', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
            })
            return (
              <TouchableOpacity
                key={cell.iso}
                onPress={() => {
                  setDateInput(cell.iso)
                  if (!cell.inMonth) setCalendarMonth(calendarMonthStart(cell.iso))
                }}
                accessibilityRole="button"
                accessibilityLabel={spoken}
                accessibilityState={{ selected }}
                className={`items-center justify-center rounded-pill border ${shell}`}
                style={styles.calendarCell}
              >
                <Text className={textTone} style={[styles.calendarDay, !cell.inMonth && !selected ? styles.calendarOutsideDay : null]}>{cell.day}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
        <Text className="text-muted" style={styles.calendarSelection}>Fecha seleccionada · {dateInput}</Text>
      </Sheet>
    </View>
  )
}

function SessionChip({ date, selected, onPress }: { date: string; selected: boolean; onPress: () => void }) {
  const day = new Date(`${date}T12:00:00Z`)
  const dayNumber = String(day.getUTCDate()).padStart(2, '0')
  const month = day.toLocaleDateString('es-ES', { month: 'short', timeZone: 'UTC' })
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.82}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${dayNumber} ${month}, sesión registrada`}
      className={selected ? 'border-sport-500 bg-sport-100 dark:bg-sport-100/20' : 'border-subtle bg-surface-sunken'}
      style={styles.sessionChip}
    >
      <Text className={selected ? 'text-sport-700' : 'text-strong'} style={styles.sessionDay}>{dayNumber}</Text>
      <Text className={selected ? 'text-sport-700' : 'text-muted'} style={styles.sessionMonth}>{month}</Text>
      <View className="bg-success-500" style={styles.sessionDot} />
    </TouchableOpacity>
  )
}

function SessionDetail({ detail }: { detail: ClientDayDetail }) {
  const { theme } = useTheme()
  const groups = useMemo(() => {
    const map = new Map<string, { muscle: string | null; sets: WorkoutDaySet[] }>()
    for (const set of detail.workoutSets) {
      if (!map.has(set.exerciseName)) map.set(set.exerciseName, { muscle: set.muscleGroup, sets: [] })
      map.get(set.exerciseName)!.sets.push(set)
    }
    return [...map.entries()].map(([name, group]) => ({ name, ...group, sets: [...group.sets].sort((a, b) => (a.setNumber ?? 0) - (b.setNumber ?? 0)) }))
  }, [detail.workoutSets])
  const title = detail.workoutSets[0]?.planTitle || 'Sesión'

  return (
    <StatCard>
      <View style={styles.sessionHeader}>
        <Text className="text-strong" style={styles.sessionTitle}>{title}</Text>
        <Text className="text-muted" style={styles.sessionCount}>{groups.length} ej. · {detail.workoutSets.length} sets</Text>
      </View>
      {groups.map((group, index) => <ExerciseSession key={group.name} name={group.name} muscle={group.muscle} sets={group.sets} last={index === groups.length - 1} />)}
      <View className="border-t border-subtle" style={styles.jargonRow}>
        <Text className="text-muted" style={styles.jargonText}>
          <Text className="text-strong">Meta</Text> = prescrito · color del peso: los que <Text className="text-success-600">superan</Text> / <Text className="text-warning-600">no alcanzan</Text> la meta.
        </Text>
        <View style={styles.glossaryLine}>
          <Text className="text-muted" style={styles.jargonText}><Text className="text-strong">RPE</Text> = esfuerzo percibido 6-10 (10 = al fallo).</Text>
          <InfoTooltip title={GLOSSARY.rpe.title} content={GLOSSARY.rpe.content} size={12} />
        </View>
        <View style={styles.glossaryLine}>
          <Text className="text-muted" style={styles.jargonText}><Text className="text-strong">RIR</Text> = reps en reserva (0 = al fallo).</Text>
          <InfoTooltip title={GLOSSARY.rir.title} content={GLOSSARY.rir.content} size={12} />
        </View>
      </View>
    </StatCard>
  )
}

function ExerciseSession({ name, muscle, sets, last }: { name: string; muscle: string | null; sets: WorkoutDaySet[]; last: boolean }) {
  const substituted = sets.find((set) => set.substitutedExerciseName)?.substitutedExerciseName
  const first = sets[0]!
  const progression = trainingProgressionLabel(first.progressionMode, first.progressionValue)
  const metaParts = [
    first.blockTargetWeightKg != null ? `${first.blockTargetWeightKg}kg` : null,
    first.blockReps ? `×${first.blockReps}` : null,
    first.blockSets != null ? `· ${first.blockSets} series` : null,
    first.blockRir ? `· RIR ${first.blockRir}` : null,
    first.blockTempo ? `· tempo ${first.blockTempo}` : null,
  ].filter((part): part is string => Boolean(part))

  return (
    <View className={last ? undefined : 'border-b border-subtle'} style={[styles.exerciseSession, last ? null : styles.exerciseDivider]}>
      <View style={styles.exerciseNameRow}>
        <Text className="text-strong" style={styles.exerciseName}>{name}</Text>
        {muscle ? <Text className="text-muted" style={styles.exerciseMuscle}>{muscle}</Text> : null}
      </View>
      {substituted ? (
        <View className="border border-warning-600/25 bg-warning-600/[0.08]" style={styles.substitutionBanner}>
          <ArrowRightLeft size={13} className="text-warning-600" />
          <Text className="text-strong" style={styles.substitutionCopy}>
            Hizo <Text style={styles.bold}>{substituted}</Text> · sustituyó <Text style={styles.semibold}>{name}</Text> <Text className="text-muted">(máquina ocupada)</Text>
          </Text>
        </View>
      ) : null}
      {metaParts.length || progression ? (
        <View style={styles.metaLine}>
          {metaParts.length ? <Text className="text-muted" style={styles.metaText}><Text style={styles.metaKicker}>META</Text> {metaParts.join(' ')}</Text> : null}
          {progression ? <View className="border border-subtle bg-surface-sunken" style={styles.progressionBadge}><Text className="text-muted" style={styles.progressionText}>{progression}</Text></View> : null}
        </View>
      ) : null}
      <View style={styles.setWrap}>
        {sets.map((set, index) => {
          const target = set.targetWeightKg ?? set.blockTargetWeightKg
          const comparison = target != null && set.weightKg != null ? Math.sign(set.weightKg - target) : 0
          const weightTone = comparison > 0 ? 'text-success-600' : comparison < 0 ? 'text-warning-600' : 'text-strong'
          return (
            <View key={`${set.setNumber ?? index}-${index}`} className="border border-subtle bg-surface-sunken" style={styles.setPill}>
              <Text className="text-strong" style={styles.setText}>
                {set.setNumber ?? index + 1}: <Text className={weightTone}>{set.weightKg != null ? `${set.weightKg}kg` : 'PC'}</Text> × {set.repsDone ?? '—'}{set.rpe != null ? ` · RPE ${set.rpe}` : ''}{set.rir != null ? ` · RIR ${set.rir}` : ''}
              </Text>
            </View>
          )
        })}
      </View>
      {sets.some((set) => set.note) ? (
        <View style={styles.notesBlock}>
          {sets.filter((set) => set.note).map((set, index) => (
            <View key={`${set.setNumber ?? index}-note`} style={styles.noteRow}>
              <StickyNote size={12} className="text-warning-600" />
              <Text className="text-muted" style={styles.noteText}><Text className="text-strong" style={styles.semibold}>Serie {set.setNumber ?? index + 1}:</Text> {set.note}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { gap: 20 },
  sectionBlock: { gap: 12 },
  sectionTitleRow: { minHeight: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sectionTitleCopy: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  sectionTitle: { flexShrink: 1, fontSize: 17, lineHeight: 22, letterSpacing: -0.34, fontFamily: FONT.displayBold },
  filterStrip: { gap: 6, paddingBottom: 2 },
  filterChip: { height: 32, justifyContent: 'center', borderWidth: 1.5, borderRadius: 999, paddingHorizontal: 12 },
  filterChipText: { fontSize: 12.5, fontFamily: FONT.uiBold },
  strengthGrid: { gap: 10 },
  strengthRow: { flexDirection: 'row', gap: 10 },
  strengthCell: { flex: 1, minWidth: 0 },
  strengthCard: { flex: 1, gap: 0 },
  strengthName: { fontSize: 13, lineHeight: 16, fontFamily: FONT.uiBold },
  strengthMuscle: { marginBottom: 6, fontSize: 11, fontFamily: FONT.ui },
  oneRmRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  oneRmValue: { fontSize: 20, lineHeight: 23, fontFamily: FONT.displayBlack, fontVariant: ['tabular-nums'] },
  oneRmUnit: { fontSize: 10.5, fontFamily: FONT.ui },
  strengthDelta: { marginBottom: 6, fontSize: 11, fontFamily: FONT.uiBold },
  strengthLatest: { marginTop: 4, fontSize: 10, fontFamily: FONT.ui },
  emptyCopy: { textAlign: 'center', fontSize: 13, fontFamily: FONT.ui },
  radarWrap: { alignItems: 'center' },
  radarCanvas: { width: '100%', maxWidth: 280, aspectRatio: 1 },
  imbalanceBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9 },
  imbalanceCopy: { flex: 1, fontSize: 12, lineHeight: 16, fontFamily: FONT.uiSemibold },
  tonnageChart: { height: 90, position: 'relative' },
  tonnageColumns: { height: 90, flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  tonnageColumn: { flex: 1, height: 90, alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  tonnageBar: { width: '100%', minHeight: 2, borderRadius: 4 },
  tonnageDay: { height: 12, fontSize: 10, lineHeight: 12, fontFamily: FONT.uiBold },
  averageLine: { position: 'absolute', zIndex: 2, left: 0, right: 0, borderTopWidth: 1.5, borderStyle: 'dashed' },
  averageLegend: { marginTop: 2, flexDirection: 'row', alignItems: 'center', gap: 6 },
  averageLegendLine: { width: 14, borderTopWidth: 1.5, borderStyle: 'dashed' },
  averageLegendText: { fontSize: 11, fontFamily: FONT.ui },
  dateButton: { height: 32, flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 12, paddingHorizontal: 8 },
  dateButtonText: { fontSize: 12, fontFamily: FONT.uiMedium, fontVariant: ['tabular-nums'] },
  sessionStrip: { gap: 8, paddingBottom: 2 },
  sessionChip: { width: 58, alignItems: 'center', gap: 2, borderWidth: 1.5, borderRadius: 12, paddingVertical: 8 },
  sessionDay: { fontSize: 16, lineHeight: 17, fontFamily: FONT.displayBlack, fontVariant: ['tabular-nums'] },
  sessionMonth: { fontSize: 9.5, lineHeight: 11, fontFamily: FONT.ui, textTransform: 'uppercase' },
  sessionDot: { width: 6, height: 6, borderRadius: 3 },
  sessionEmpty: { alignItems: 'center', gap: 7, paddingVertical: 12 },
  sessionEmptyText: { textAlign: 'center', fontSize: 13.5, fontFamily: FONT.ui },
  calendarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  calendarNav: { width: 40, height: 40 },
  calendarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontFamily: FONT.displayBold },
  calendarGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calendarWeekday: { width: '14.2857%', paddingVertical: 5, textAlign: 'center', fontSize: 10, fontFamily: FONT.uiBold, textTransform: 'uppercase' },
  calendarCell: { width: '14.2857%', aspectRatio: 1, maxHeight: 42 },
  calendarDay: { fontSize: 13, fontFamily: FONT.uiSemibold, fontVariant: ['tabular-nums'] },
  calendarOutsideDay: { opacity: 0.55 },
  calendarSelection: { textAlign: 'center', fontSize: 11, fontFamily: FONT.uiMedium, fontVariant: ['tabular-nums'] },
  sessionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 2 },
  sessionTitle: { flex: 1, fontSize: 14.5, fontFamily: FONT.uiExtra },
  sessionCount: { fontSize: 11.5, fontFamily: FONT.ui },
  exerciseSession: { gap: 6, paddingVertical: 4 },
  exerciseDivider: { paddingBottom: 12, marginBottom: 8 },
  exerciseNameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  exerciseName: { fontSize: 13, fontFamily: FONT.uiBold },
  exerciseMuscle: { fontSize: 11, fontFamily: FONT.ui },
  substitutionBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  substitutionCopy: { flex: 1, fontSize: 11, lineHeight: 15, fontFamily: FONT.ui },
  bold: { fontFamily: FONT.uiBold },
  semibold: { fontFamily: FONT.uiSemibold },
  metaLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  metaText: { fontSize: 10.5, lineHeight: 14, fontFamily: FONT.ui },
  metaKicker: { fontSize: 9, letterSpacing: 1.1, fontFamily: FONT.ui },
  progressionBadge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  progressionText: { fontSize: 10, fontFamily: FONT.ui },
  setWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  setPill: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4 },
  setText: { fontSize: 11.5, lineHeight: 15, fontFamily: FONT.mono },
  notesBlock: { gap: 4 },
  noteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  noteText: { flex: 1, fontSize: 11, lineHeight: 15, fontFamily: FONT.ui },
  jargonRow: { marginTop: 4, paddingTop: 8, gap: 4 },
  jargonText: { fontSize: 10, lineHeight: 14, fontFamily: FONT.ui },
  glossaryLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
})
