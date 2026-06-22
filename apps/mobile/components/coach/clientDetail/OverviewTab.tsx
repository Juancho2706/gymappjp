import { useMemo, useState } from 'react'
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { Image } from 'expo-image'
import {
  CalendarDays,
  Camera,
  CalendarRange,
  Check,
  Clock,
  Dumbbell,
  Flame,
  ListChecks,
  PieChart,
  Pencil,
  Ruler,
  Scale,
  Star,
} from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Button, ComplianceRing, ProgressBar } from '../../../components'
import { CalendarHeatmap } from '../charts/CalendarHeatmap'
import { StatCard, CardHeader, MetricBox, Pill, cd, formatDate, dayName } from './shared'
import {
  buildProfileActivityCalendar,
  longestActivityStreak,
} from '../../../lib/profile-analytics'
import { getProfileTopAlert, type ProfileAlertType } from '../../../lib/profile-top-alert'
import {
  markCoachCheckInReviewed,
  updateCoachClient,
  type CoachClientDetailData,
  type ProgramPhase,
} from '../../../lib/coach-client-detail'

function resolveProgramWeek(program: NonNullable<CoachClientDetailData['activeProgram']>): number | null {
  if (!program.start_date) return null
  const start = new Date(`${program.start_date}T12:00:00`).getTime()
  if (!Number.isFinite(start)) return null
  const diffDays = Math.max(0, Math.floor((Date.now() - start) / 86400000))
  return Math.min(Math.max(1, Math.ceil((diffDays + 1) / 7)), Math.max(1, program.weeks_to_repeat))
}

function TopAlertBanner({ type, message }: { type: ProfileAlertType; message: string }) {
  const { theme } = useTheme()
  const color = type === 'danger' ? theme.destructive : type === 'warning' ? '#F59E0B' : type === 'success' ? '#10B981' : theme.primary
  return (
    <View style={[styles.alertBanner, { backgroundColor: color + '14', borderColor: color + '40' }]}>
      <View style={[styles.alertDot, { backgroundColor: color }]} />
      <Text style={[styles.alertMsg, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>{message}</Text>
    </View>
  )
}

export function OverviewTab({
  data,
  reload,
  onOpenPhoto,
  onEditProgram,
  onViewNutrition,
}: {
  data: CoachClientDetailData
  reload: () => void
  onOpenPhoto: (photos: string[], index: number) => void
  onEditProgram: () => void
  onViewNutrition?: () => void
}) {
  const { theme } = useTheme()
  const { client, compliance, activeProgram, checkIns, workoutDates371, sessions30d } = data

  const calendar = useMemo(
    () => buildProfileActivityCalendar(workoutDates371, checkIns.map((c) => c.date)),
    [workoutDates371, checkIns]
  )
  const bestStreak = useMemo(() => longestActivityStreak(calendar), [calendar])

  const weightsAsc = [...checkIns].reverse().map((c) => c.weight).filter((w): w is number => w != null)
  const currentWeight = weightsAsc.length ? weightsAsc[weightsAsc.length - 1] : null
  // Var. semanal: peso más reciente − peso del check-in inmediatamente anterior (con peso).
  const weeklyDelta = useMemo(() => {
    const ws = [...checkIns].filter((c) => c.weight != null).sort((a, b) => a.date.localeCompare(b.date))
    if (ws.length < 2) return null
    return Math.round((Number(ws[ws.length - 1]!.weight) - Number(ws[ws.length - 2]!.weight)) * 10) / 10
  }, [checkIns])
  // Δ peso 30d (espejo web B3): peso más reciente − baseline, donde baseline = primer
  // check-in (orden descendente) con fecha <= hace 30 días (peso de ~hace 30d), NO el
  // check-in más viejo dentro de los últimos 30 días.
  const delta30 = useMemo(() => {
    const withWeight = [...checkIns].filter((c) => c.weight != null)
    if (withWeight.length < 2) return null
    const desc = withWeight.sort((a, b) => b.date.localeCompare(a.date))
    const cutoff = Date.now() - 30 * 86400000
    const latest = desc[0]?.weight
    const baseline = desc.find((c) => new Date(c.date).getTime() <= cutoff)?.weight
    if (latest == null || baseline == null) return null
    return Math.round((Number(latest) - Number(baseline)) * 10) / 10
  }, [checkIns])

  const currentWeek = activeProgram ? resolveProgramWeek(activeProgram) : null
  const latestCheckIn = checkIns[0] ?? null

  // Evolución visual (último mes): fotos frontales de check-ins de los últimos 30 días.
  const recentPhotos = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400000
    return checkIns.filter((c) => c.front_photo_url && new Date(c.date).getTime() >= cutoff).slice(0, 3)
  }, [checkIns])

  if (!compliance) return null

  const workoutPct = Math.min(1, compliance.workoutsThisWeek / Math.max(1, compliance.workoutsTarget))
  const workoutPctInt = Math.round(workoutPct * 100)
  // Delta de adherencia entreno (espejo web B3): workoutPct − prevWorkoutPct (ambos clampados).
  const prevWorkoutPctInt = Math.round(Math.min(1, compliance.workoutsPrevWeek / Math.max(1, compliance.workoutsTarget)) * 100)
  const workoutDelta = workoutPctInt - prevWorkoutPctInt
  const nutritionPct = Math.min(1, compliance.nutritionWeeklyAvgPct / 100)
  const checkPct = Math.min(1, compliance.checkInCompliancePercent / 100)

  // Próximo entreno (por día de semana).
  const todayDow = new Date().getDay() === 0 ? 7 : new Date().getDay()
  const nextPlan = useMemo(() => {
    const plans = (activeProgram?.workoutPlans ?? []).filter((p) => p.day_of_week != null)
    if (!plans.length) return null
    const sorted = [...plans].sort((a, b) => (a.day_of_week! - b.day_of_week!))
    return sorted.find((p) => p.day_of_week! >= todayDow) ?? sorted[0]
  }, [activeProgram, todayDow])

  // A-F5: banner de triage (motor de 7 reglas portado).
  const planDaysRemaining = activeProgram?.end_date
    ? Math.ceil((new Date(`${activeProgram.end_date}T23:59:59`).getTime() - Date.now()) / 86400000)
    : undefined
  const lastWorkoutDate = workoutDates371.length ? workoutDates371[workoutDates371.length - 1] : null
  const topAlert = getProfileTopAlert({
    checkIns,
    compliance: { nutritionCompliancePercent: compliance.nutritionWeeklyAvgPct, planDaysRemaining, currentStreak: bestStreak },
    lastWorkoutDate,
    oneRMDelta: null,
  })

  // Señal de nutrición — espejo de la web (>= 60% = en track).
  const nutritionAtRisk = compliance.nutritionWeeklyAvgPct < 60
  const daysLeft = Math.max(0, planDaysRemaining ?? 0)
  const planTot = activeProgram ? Math.max(1, activeProgram.weeks_to_repeat) : 1

  return (
    <View style={{ gap: 14 }}>
      {topAlert ? <TopAlertBanner type={topAlert.type} message={topAlert.message} /> : null}

      {/* Cumplimiento semanal */}
      <StatCard>
        <CardHeader icon={Flame} title="Cumplimiento semanal" />
        <View style={styles.ringRow}>
          <Ring
            label="Entrenamientos"
            hint={`${compliance.workoutsThisWeek}/${compliance.workoutsTarget}`}
            value={workoutPct}
            color={theme.primary}
            delta={workoutDelta}
          />
          <Ring
            label="Nutrición (7d)"
            hint={`${compliance.nutritionWeeklyAvgPct}%`}
            value={nutritionPct}
            color={compliance.nutritionWeeklyAvgPct >= 70 ? theme.success : compliance.nutritionWeeklyAvgPct >= 50 ? '#F59E0B' : theme.destructive}
            delta={compliance.nutritionWeeklyAvgPct - compliance.nutritionPrevWeeklyAvgPct}
            linkLabel={onViewNutrition ? 'Ver nutrición →' : undefined}
            onPress={onViewNutrition}
          />
          <Ring
            label="Check-in"
            hint={`${compliance.checkInCompliancePercent}%`}
            value={checkPct}
            color={compliance.checkInCompliancePercent >= 70 ? theme.success : compliance.checkInCompliancePercent >= 40 ? '#F59E0B' : theme.destructive}
            delta={compliance.checkInCompliancePercent - compliance.checkInCompliancePercentWeekAgo}
          />
        </View>
      </StatCard>

      {/* KPI grid (5 KPIs, espejo de la web) */}
      <View style={cd.grid2}>
        <KpiBox icon={Star} label="Mejor racha" value={`${bestStreak} día${bestStreak === 1 ? '' : 's'}`} hint="histórico" />
        <KpiBox icon={Dumbbell} label="Sesiones" value={String(sessions30d)} hint="últimos 30 días" />
        <KpiBox icon={PieChart} label="Adherencia entreno" value={`${workoutPctInt}%`} hint={workoutDelta >= 0 ? `+${workoutDelta}% vs sem. ant.` : `${workoutDelta}% vs sem. ant.`} />
        <KpiBox icon={Scale} label="Δ Peso (30d)" value={delta30 != null ? `${delta30 > 0 ? '+' : ''}${delta30} kg` : '—'} hint="check-ins" />
        <KpiBox icon={CalendarRange} label="Sem. programa" value={currentWeek && activeProgram ? `${currentWeek} / ${activeProgram.weeks_to_repeat}` : '—'} hint="ciclo activo" />
      </View>

      {/* Métricas clave */}
      <StatCard>
        <CardHeader icon={Scale} title="Métricas clave" />
        <View style={styles.keyRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.keyLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Peso actual</Text>
            <Text style={[styles.keyBig, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>
              {currentWeight != null ? `${currentWeight}` : '—'}
              {currentWeight != null ? <Text style={[styles.keyUnit, { color: theme.mutedForeground }]}> kg</Text> : null}
            </Text>
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={[styles.keyLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Var. semanal</Text>
            <Text style={[styles.keyDelta, { color: weeklyDelta == null ? theme.mutedForeground : weeklyDelta > 0 ? '#EF4444' : weeklyDelta < 0 ? theme.success : theme.mutedForeground, fontFamily: 'Montserrat_800ExtraBold' }]}>
              {weeklyDelta == null ? '—' : `${weeklyDelta > 0 ? '↑ +' : weeklyDelta < 0 ? '↓ ' : ''}${weeklyDelta} kg`}
            </Text>
          </View>
        </View>
      </StatCard>

      {/* Calendar heatmap 371d (extra mobile, se conserva) */}
      <StatCard>
        <CardHeader icon={CalendarDays} title="Actividad (último año)" />
        <CalendarHeatmap data={calendar} />
      </StatCard>

      {/* Programa */}
      {activeProgram ? (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onEditProgram}
          accessibilityRole="button"
          accessibilityLabel={`Editar programa ${activeProgram.name}`}
        >
          <StatCard>
            <CardHeader icon={ListChecks} title={activeProgram.name} />
            {activeProgram.phases.length > 0 ? (
              <View style={{ paddingBottom: 2 }}>
                <ProgramPhasesBar phases={activeProgram.phases} currentWeek={currentWeek} />
              </View>
            ) : null}
            {currentWeek ? (
              <View style={{ gap: 6 }}>
                <View style={styles.weekRow}>
                  <Text style={[styles.weekLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Semana ciclo</Text>
                  <Text style={[styles.weekVal, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>{currentWeek} / {planTot}</Text>
                </View>
                <ProgressBar value={planTot > 0 ? currentWeek / planTot : 0} color={theme.primary} height={7} />
              </View>
            ) : null}

            <View style={styles.trackRow}>
              <View style={styles.trackLeft}>
                <Clock size={13} color={theme.primary} />
                <Text style={[styles.trackTxt, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                  <Text style={{ color: theme.foreground }}>{daysLeft}</Text> días restantes
                </Text>
              </View>
              <View style={styles.trackLeft}>
                <View style={[styles.dot, { backgroundColor: daysLeft > 0 ? '#10B981' : '#F59E0B' }]} />
                <Text style={[styles.trackBadge, { color: daysLeft > 0 ? '#10B981' : '#F59E0B', fontFamily: 'Inter_700Bold' }]}>
                  {daysLeft > 0 ? 'En track' : 'Ciclo vencido'}
                </Text>
              </View>
            </View>

            {/* Señal de nutrición — separada del entreno. */}
            <View style={[styles.nutSignal, { borderColor: (nutritionAtRisk ? theme.destructive : '#10B981') + '40', backgroundColor: (nutritionAtRisk ? theme.destructive : '#10B981') + '0D' }]}>
              <View style={styles.trackLeft}>
                <View style={[styles.dot, { backgroundColor: nutritionAtRisk ? theme.destructive : '#10B981' }]} />
                <Text style={[styles.trackBadge, { color: nutritionAtRisk ? theme.destructive : '#10B981', fontFamily: 'Inter_700Bold' }]}>
                  {nutritionAtRisk ? 'Nutrición en riesgo' : 'Nutrición en track'}
                </Text>
              </View>
              {onViewNutrition ? (
                <Text style={[styles.nutLink, { color: theme.primary, fontFamily: 'Inter_700Bold' }]}>Ver nutrición →</Text>
              ) : null}
            </View>

            {nextPlan ? (
              <View style={[styles.nextBox, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
                <View style={styles.trackLeft}>
                  <Dumbbell size={13} color={theme.primary} />
                  <Text style={[styles.nextHead, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>Próximo entrenamiento</Text>
                </View>
                <Text numberOfLines={1} style={[styles.nextTitle, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>{nextPlan.title}</Text>
                <View style={styles.nextMeta}>
                  <View style={styles.trackLeft}>
                    <CalendarDays size={13} color={theme.mutedForeground} />
                    <Text style={[styles.nextMetaTxt, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                      {nextPlan.day_of_week ? dayName(nextPlan.day_of_week) : ''}
                    </Text>
                    {nextPlan.day_of_week === todayDow ? (
                      <Text style={[styles.todayBadge, { color: theme.primary, fontFamily: 'Inter_700Bold' }]}>· Hoy</Text>
                    ) : null}
                  </View>
                  <Text style={[styles.nextMetaTxt, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                    {nextPlan.blocks.length} ejercicio{nextPlan.blocks.length === 1 ? '' : 's'}
                  </Text>
                </View>
              </View>
            ) : null}
          </StatCard>
        </TouchableOpacity>
      ) : (
        <StatCard>
          <View style={styles.emptyRow}>
            <ListChecks size={15} color={theme.mutedForeground} />
            <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>Sin programa activo asignado.</Text>
          </View>
        </StatCard>
      )}

      {/* Check-in snapshot */}
      {latestCheckIn ? <CheckInSnapshot checkIn={latestCheckIn} clientId={client!.id} reload={reload} onOpenPhoto={onOpenPhoto} /> : null}

      {/* Evolución visual (último mes) */}
      <StatCard>
        <CardHeader icon={Camera} title="Evolución visual (último mes)" />
        {recentPhotos.length ? (
          <View style={styles.photoGrid}>
            {recentPhotos.map((c) => {
              const photos = [c.front_photo_url, c.back_photo_url].filter(Boolean) as string[]
              return (
                <TouchableOpacity
                  key={c.id}
                  activeOpacity={0.85}
                  onPress={() => onOpenPhoto(photos, 0)}
                  style={styles.photoCell}
                  accessibilityRole="button"
                  accessibilityLabel={`Ver foto de check-in del ${formatDate(c.date)}`}
                >
                  <Image source={{ uri: c.front_photo_url! }} style={[styles.photo, { borderColor: theme.border }]} contentFit="cover" transition={150} />
                  <Text style={[styles.photoDate, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{formatDate(c.date)}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        ) : (
          <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Sin fotos recientes de check-in.</Text>
        )}
      </StatCard>

      {/* Biometría editable */}
      <BiometriaCard client={client!} currentWeight={currentWeight} reload={reload} />
    </View>
  )
}

function Ring({ label, hint, value, color, delta, linkLabel, onPress }: { label: string; hint: string; value: number; color: string; delta?: number; linkLabel?: string; onPress?: () => void }) {
  const { theme } = useTheme()
  const d = delta ?? 0
  const Wrapper: any = onPress ? TouchableOpacity : View
  return (
    <Wrapper
      style={styles.ringItem}
      {...(onPress
        ? { activeOpacity: 0.85, onPress, accessibilityRole: 'button', accessibilityLabel: `${label}: ${hint}. Ver nutrición` }
        : {})}
    >
      <ComplianceRing value={value} label={label} color={color} size={68} />
      <Text style={[styles.ringHint, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{hint}</Text>
      <Text style={[styles.ringDelta, { color: d > 0 ? theme.success : d < 0 ? theme.destructive : theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>
        {d > 0 ? '↑' : d < 0 ? '↓' : '—'} vs sem. anterior{d !== 0 ? ` (${d > 0 ? '+' : ''}${d} pts)` : ''}
      </Text>
      {linkLabel ? (
        <Text style={[styles.ringLink, { color: theme.primary, fontFamily: 'Inter_700Bold' }]}>{linkLabel}</Text>
      ) : null}
    </Wrapper>
  )
}

// Barra de fases del programa (espejo de ProgramPhasesBar web): segmentos por fase,
// ancho proporcional a semanas, fase actual resaltada en theme.primary.
function ProgramPhasesBar({ phases, currentWeek }: { phases: ProgramPhase[]; currentWeek: number | null }) {
  const { theme } = useTheme()
  if (!phases?.length) return null
  const total = phases.reduce((s, p) => s + Math.max(1, p.weeks), 0) || 1
  // Índice de la fase activa: primera fase cuya semana acumulada cubre currentWeek.
  let activeIdx = -1
  if (currentWeek != null && currentWeek > 0) {
    let acc = 0
    for (let i = 0; i < phases.length; i++) {
      acc += Math.max(1, phases[i]!.weeks)
      if (currentWeek <= acc) { activeIdx = i; break }
    }
    if (activeIdx === -1) activeIdx = phases.length - 1
  }
  const activePhase = activeIdx >= 0 ? phases[activeIdx] : null
  return (
    <View style={{ gap: 5 }}>
      <View style={[styles.phasesTrack, { backgroundColor: theme.muted, borderColor: theme.border }]}>
        {phases.map((p, i) => {
          const width = (Math.max(1, p.weeks) / total) * 100
          const isActive = i === activeIdx
          return (
            <View
              key={`${p.name}-${i}`}
              style={{ width: `${width}%`, height: '100%', backgroundColor: isActive ? theme.primary : (p.color || '#6366F1'), opacity: isActive || activeIdx < 0 ? 1 : 0.55 }}
            />
          )
        })}
      </View>
      {activePhase ? (
        <Text style={[styles.phaseLabel, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]} numberOfLines={1}>
          {activePhase.name} · {activePhase.weeks} sem.
        </Text>
      ) : null}
    </View>
  )
}

function KpiBox({ icon: Icon, label, value, hint }: { icon: any; label: string; value: string; hint: string }) {
  const { theme } = useTheme()
  return (
    <View style={[styles.kpi, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
      <View style={styles.kpiHead}>
        <Icon size={13} color={theme.primary} />
        <Text style={[styles.kpiLabel, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={[styles.kpiVal, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]} numberOfLines={1}>{value}</Text>
      <Text style={[styles.kpiHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>{hint}</Text>
    </View>
  )
}

function CheckInSnapshot({ checkIn, clientId, reload, onOpenPhoto }: { checkIn: CoachClientDetailData['checkIns'][number]; clientId: string; reload: () => void; onOpenPhoto: (photos: string[], index: number) => void }) {
  const { theme } = useTheme()
  const photos = [checkIn.front_photo_url, checkIn.back_photo_url].filter(Boolean) as string[]
  async function review() {
    const r = await markCoachCheckInReviewed(clientId, checkIn.id)
    if (!r.ok) Alert.alert('Error', r.error ?? 'No se pudo marcar.')
    else reload()
  }
  return (
    <StatCard>
      <CardHeader icon={Check} title="Último check-in" right={
        <Text style={[styles.snapDate, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{formatDate(checkIn.date)}</Text>
      } />
      <View style={styles.snapRow}>
        {checkIn.front_photo_url ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => onOpenPhoto(photos, 0)}
            accessibilityRole="button"
            accessibilityLabel="Ver foto del último check-in"
          >
            <Image source={{ uri: checkIn.front_photo_url }} style={[styles.snapPhoto, { borderColor: theme.border }]} contentFit="cover" transition={150} />
          </TouchableOpacity>
        ) : null}
        <View style={{ flex: 1, gap: 8 }}>
          <View style={styles.snapMetrics}>
            {checkIn.weight != null ? <MetricBox value={`${checkIn.weight} kg`} label="Peso" /> : null}
            {checkIn.energy_level != null ? <MetricBox value={`${checkIn.energy_level}/10`} label="Energía" /> : null}
          </View>
          {checkIn.reviewed_at ? (
            <Pill label="Revisado" tone="success" />
          ) : (
            <Button label="Marcar revisado" variant="outline" onPress={review} />
          )}
        </View>
      </View>
      {checkIn.notes ? <Text style={[cd.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{checkIn.notes}</Text> : null}
    </StatCard>
  )
}

function BiometriaCard({ client, currentWeight, reload }: { client: NonNullable<CoachClientDetailData['client']>; currentWeight: number | null; reload: () => void }) {
  const { theme } = useTheme()
  const [editing, setEditing] = useState(false)
  const [height, setHeight] = useState(client.height_cm != null ? String(client.height_cm) : '')
  const [initial, setInitial] = useState(client.initial_weight_kg != null ? String(client.initial_weight_kg) : '')
  const [goal, setGoal] = useState(client.goal_weight_kg != null ? String(client.goal_weight_kg) : '')
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const r = await updateCoachClient(client.id, {
      height_cm: height.trim() ? Number(height.replace(',', '.')) : null,
      initial_weight_kg: initial.trim() ? Number(initial.replace(',', '.')) : null,
      goal_weight_kg: goal.trim() ? Number(goal.replace(',', '.')) : null,
    })
    setSaving(false)
    if (!r.ok) { Alert.alert('Error', r.error ?? 'No se pudo guardar.'); return }
    setEditing(false)
    reload()
  }

  return (
    <StatCard>
      <CardHeader icon={Ruler} title="Biometría" right={
        <TouchableOpacity
          onPress={() => setEditing((v) => !v)}
          hitSlop={14}
          accessibilityRole="button"
          accessibilityLabel={editing ? 'Cerrar edición de biometría' : 'Editar biometría'}
          style={{ minWidth: 44, minHeight: 44, alignItems: 'flex-end', justifyContent: 'center' }}
        >
          <Pencil size={16} color={theme.primary} />
        </TouchableOpacity>
      } />
      {editing ? (
        <View style={{ gap: 10 }}>
          <BioField label="Altura (cm)" value={height} onChangeText={setHeight} placeholder="175" />
          <BioField label="Peso inicial (kg)" value={initial} onChangeText={setInitial} placeholder="80" />
          <BioField label="Peso objetivo (kg)" value={goal} onChangeText={setGoal} placeholder="75" />
          <Button label={saving ? 'Guardando…' : 'Guardar'} onPress={save} disabled={saving} full />
        </View>
      ) : (
        <View style={cd.grid2}>
          <MetricBox value={client.height_cm != null ? `${client.height_cm} cm` : '—'} label="Altura" />
          <MetricBox value={client.initial_weight_kg != null ? `${client.initial_weight_kg} kg` : '—'} label="Peso inicial" />
          <MetricBox value={currentWeight != null ? `${currentWeight} kg` : '—'} label="Peso actual" />
          <MetricBox value={client.goal_weight_kg != null ? `${client.goal_weight_kg} kg` : '—'} label="Objetivo" color={theme.primary} />
        </View>
      )}
    </StatCard>
  )
}

function BioField({ label, value, onChangeText, placeholder }: { label: string; value: string; onChangeText: (t: string) => void; placeholder: string }) {
  const { theme } = useTheme()
  return (
    <View style={{ gap: 5 }}>
      <Text style={{ fontSize: 12, color: theme.mutedForeground, fontFamily: theme.fontSans }}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor={theme.mutedForeground}
        style={{ height: 44, borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius.lg, backgroundColor: theme.secondary, color: theme.foreground, paddingHorizontal: 12, fontFamily: theme.fontSans }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  alertBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11 },
  alertDot: { width: 8, height: 8, borderRadius: 4 },
  alertMsg: { fontSize: 12.5, flex: 1, lineHeight: 17 },
  ringRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, paddingTop: 4 },
  ringItem: { flex: 1, alignItems: 'center', gap: 3 },
  ringHint: { fontSize: 13 },
  ringDelta: { fontSize: 9, textAlign: 'center' },
  ringLink: { fontSize: 9.5 },
  // KPI
  kpi: { width: '31%', flexGrow: 1, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 10, gap: 3 },
  kpiHead: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  kpiLabel: { fontSize: 8.5, textTransform: 'uppercase', letterSpacing: 0.5, flexShrink: 1 },
  kpiVal: { fontSize: 19, letterSpacing: -0.4 },
  kpiHint: { fontSize: 9.5 },
  // Métricas clave
  keyRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 12 },
  keyLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 3 },
  keyBig: { fontSize: 32, letterSpacing: -1 },
  keyUnit: { fontSize: 16 },
  keyDelta: { fontSize: 22, letterSpacing: -0.5 },
  // Programa
  phasesTrack: { flexDirection: 'row', height: 6, borderRadius: 999, overflow: 'hidden', borderWidth: 1 },
  phaseLabel: { fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.5 },
  weekRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weekLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
  weekVal: { fontSize: 13 },
  trackRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  trackLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  trackTxt: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 },
  trackBadge: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.7 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  nutSignal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  nutLink: { fontSize: 11 },
  nextBox: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
  nextHead: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.8 },
  nextTitle: { fontSize: 14, letterSpacing: -0.2 },
  nextMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 },
  nextMetaTxt: { fontSize: 11.5 },
  todayBadge: { fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.6 },
  emptyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  // Fotos
  photoGrid: { flexDirection: 'row', gap: 10 },
  photoCell: { flex: 1, alignItems: 'center', gap: 4 },
  photo: { width: '100%', aspectRatio: 3 / 4, borderRadius: 10, borderWidth: 1 },
  photoDate: { fontSize: 10 },
  // Snapshot
  snapDate: { fontSize: 12 },
  snapRow: { flexDirection: 'row', gap: 12 },
  snapPhoto: { width: 88, height: 112, borderRadius: 12, borderWidth: 1 },
  snapMetrics: { flexDirection: 'row', gap: 8 },
})
