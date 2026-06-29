import { useMemo, useState } from 'react'
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { Image } from 'expo-image'
import { Activity, CalendarDays, Check, Dumbbell, Flame, LayoutGrid, Pencil, Ruler } from 'lucide-react-native'
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
      <Text style={[styles.alertMsg, { color: theme.foreground, fontFamily: 'HankenGrotesk_600SemiBold' }]}>{message}</Text>
    </View>
  )
}

export function OverviewTab({
  data,
  reload,
  onOpenPhoto,
  onEditProgram,
}: {
  data: CoachClientDetailData
  reload: () => void
  onOpenPhoto: (photos: string[], index: number) => void
  onEditProgram: () => void
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
  // Δ peso 30d: peso actual − peso del check-in más viejo dentro de 30 días.
  const delta30 = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400000
    const within = [...checkIns].filter((c) => c.weight != null && new Date(c.date).getTime() >= cutoff).sort((a, b) => a.date.localeCompare(b.date))
    if (within.length < 2) return null
    return Math.round((Number(within[within.length - 1]!.weight) - Number(within[0]!.weight)) * 10) / 10
  }, [checkIns])

  const currentWeek = activeProgram ? resolveProgramWeek(activeProgram) : null
  const latestCheckIn = checkIns[0] ?? null

  const recentPhotos = useMemo(
    () => checkIns.filter((c) => c.front_photo_url).slice(0, 3),
    [checkIns]
  )

  if (!compliance) return null

  const workoutPct = Math.min(1, compliance.workoutsThisWeek / Math.max(1, compliance.workoutsTarget))
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

  return (
    <View style={{ gap: 14 }}>
      {topAlert ? <TopAlertBanner type={topAlert.type} message={topAlert.message} /> : null}
      {/* Compliance rings */}
      <StatCard>
        <CardHeader icon={Flame} title="Cumplimiento semanal" />
        <View style={styles.ringRow}>
          <Ring label="Entreno" hint={`${compliance.workoutsThisWeek}/${compliance.workoutsTarget}`} value={workoutPct} color={theme.primary} delta={compliance.workoutsThisWeek - compliance.workoutsPrevWeek} unit="" />
          <Ring label="Nutrición" hint={`${compliance.nutritionWeeklyAvgPct}%`} value={nutritionPct} color={compliance.nutritionWeeklyAvgPct >= 70 ? theme.success : compliance.nutritionWeeklyAvgPct >= 50 ? '#F59E0B' : theme.destructive} delta={compliance.nutritionWeeklyAvgPct - compliance.nutritionPrevWeeklyAvgPct} unit="pts" />
          <Ring label="Check-in" hint={`${compliance.checkInCompliancePercent}%`} value={checkPct} color={compliance.checkInCompliancePercent >= 70 ? theme.success : compliance.checkInCompliancePercent >= 40 ? '#F59E0B' : theme.destructive} delta={compliance.checkInCompliancePercent - compliance.checkInCompliancePercentWeekAgo} unit="pts" />
        </View>
      </StatCard>

      {/* Calendar heatmap 371d */}
      <StatCard>
        <CardHeader icon={CalendarDays} title="Actividad (último año)" />
        <CalendarHeatmap data={calendar} />
      </StatCard>

      {/* KPI grid */}
      <View style={cd.grid2}>
        <MetricBox value={`${bestStreak}d`} label="Mejor racha" color="#F59E0B" />
        <MetricBox value={String(sessions30d)} label="Sesiones 30d" />
        <MetricBox value={String(workoutDates371.length)} label="Entrenos (año)" />
        <MetricBox value={`${compliance.nutritionWeeklyAvgPct}%`} label="Adherencia" />
        <MetricBox value={delta30 != null ? `${delta30 > 0 ? '+' : ''}${delta30} kg` : '—'} label="Δ peso 30d" color={delta30 == null ? undefined : delta30 > 0 ? '#EF4444' : theme.success} />
        <MetricBox value={currentWeek && activeProgram ? `${currentWeek}/${activeProgram.weeks_to_repeat}` : '—'} label="Semana plan" />
        <MetricBox value={`${compliance.checkInCompliancePercent}%`} label="Regularidad" />
      </View>

      {/* Program summary */}
      {activeProgram ? (
        <TouchableOpacity activeOpacity={0.85} onPress={onEditProgram}>
          <StatCard>
            <CardHeader icon={LayoutGrid} title="Programa activo" />
            <Text numberOfLines={1} style={[cd.big, { color: theme.foreground, fontFamily: 'Archivo_700Bold' }]}>{activeProgram.name}</Text>
            <View style={cd.metaRow}>
              <Pill label={activeProgram.program_structure_type === 'cycle' ? 'Cíclico' : 'Semanal'} />
              {activeProgram.ab_mode ? <Pill label="A/B" tone="warning" /> : null}
              <Pill label={`${activeProgram.weeks_to_repeat} sem.`} />
              <Pill label={`${activeProgram.planCount} días`} />
            </View>
            {currentWeek ? (
              <View style={{ gap: 6 }}>
                <View style={styles.weekRow}>
                  <Text style={[styles.weekLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Progreso del ciclo</Text>
                  <Text style={[styles.weekVal, { color: theme.foreground, fontFamily: 'Archivo_800ExtraBold' }]}>{currentWeek}/{activeProgram.weeks_to_repeat}</Text>
                </View>
                <ProgressBar value={activeProgram.weeks_to_repeat > 0 ? currentWeek / activeProgram.weeks_to_repeat : 0} color={theme.primary} height={7} />
              </View>
            ) : null}
            {nextPlan ? (
              <View style={[styles.nextRow, { borderColor: theme.border }]}>
                <Dumbbell size={14} color={theme.primary} />
                <Text style={[styles.nextLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Próximo:</Text>
                <Text numberOfLines={1} style={[styles.nextVal, { color: theme.foreground, fontFamily: 'HankenGrotesk_600SemiBold' }]}>
                  {nextPlan.day_of_week ? dayName(nextPlan.day_of_week) : ''} · {nextPlan.title}
                </Text>
              </View>
            ) : null}
          </StatCard>
        </TouchableOpacity>
      ) : null}

      {/* Check-in snapshot */}
      {latestCheckIn ? <CheckInSnapshot checkIn={latestCheckIn} clientId={client!.id} reload={reload} onOpenPhoto={onOpenPhoto} /> : null}

      {/* Evolución de fotos */}
      {recentPhotos.length ? (
        <StatCard>
          <CardHeader icon={Activity} title="Evolución de fotos" />
          <View style={styles.photoRow}>
            {recentPhotos.map((c) => {
              const photos = [c.front_photo_url, c.back_photo_url].filter(Boolean) as string[]
              return (
                <TouchableOpacity key={c.id} activeOpacity={0.85} onPress={() => onOpenPhoto(photos, 0)} style={{ alignItems: 'center', gap: 4 }}>
                  <Image source={{ uri: c.front_photo_url! }} style={[styles.photo, { borderColor: theme.border }]} contentFit="cover" transition={150} />
                  <Text style={[styles.photoDate, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{formatDate(c.date)}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </StatCard>
      ) : null}

      {/* Biometría editable */}
      <BiometriaCard client={client!} currentWeight={currentWeight} reload={reload} />
    </View>
  )
}

function Ring({ label, hint, value, color, delta, unit }: { label: string; hint: string; value: number; color: string; delta?: number; unit?: string }) {
  const { theme } = useTheme()
  return (
    <View style={styles.ringItem}>
      <ComplianceRing value={value} label={label} color={color} size={68} />
      <Text style={[styles.ringHint, { color: theme.foreground, fontFamily: 'Archivo_700Bold' }]}>{hint}</Text>
      {delta != null && delta !== 0 ? (
        <Text style={[styles.ringDelta, { color: delta > 0 ? theme.success : theme.destructive, fontFamily: theme.fontSans }]}>
          {delta > 0 ? '↑' : '↓'}{Math.abs(delta)}{unit ? ` ${unit}` : ''}
        </Text>
      ) : null}
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
          <TouchableOpacity activeOpacity={0.85} onPress={() => onOpenPhoto(photos, 0)}>
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
        <TouchableOpacity onPress={() => setEditing((v) => !v)} hitSlop={8}><Pencil size={16} color={theme.primary} /></TouchableOpacity>
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
  ringItem: { flex: 1, alignItems: 'center', gap: 4 },
  ringHint: { fontSize: 13 },
  ringDelta: { fontSize: 10 },
  weekRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weekLabel: { fontSize: 12 },
  weekVal: { fontSize: 14 },
  nextRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10 },
  nextLabel: { fontSize: 12 },
  nextVal: { fontSize: 13, flex: 1 },
  photoRow: { flexDirection: 'row', gap: 10 },
  photo: { width: 84, height: 108, borderRadius: 10, borderWidth: 1 },
  photoDate: { fontSize: 10 },
  snapDate: { fontSize: 12 },
  snapRow: { flexDirection: 'row', gap: 12 },
  snapPhoto: { width: 88, height: 112, borderRadius: 12, borderWidth: 1 },
  snapMetrics: { flexDirection: 'row', gap: 8 },
})
