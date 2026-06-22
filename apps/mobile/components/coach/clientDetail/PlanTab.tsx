import { useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Image } from 'expo-image'
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { ChevronDown, ChevronUp, Dumbbell, LayoutGrid, Pencil, Target, Timer, Trash2 } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Button, EmptyState, NativeDialog, ProgressBar } from '../../../components'
import { StatCard, CardHeader, Pill, cd } from './shared'
import { supabase } from '../../../lib/supabase'
import { filterPlansForStructureView, resolveActiveWeekVariantForDisplay } from '../../../lib/program-week-variant'
import type { CoachClientDetailData, ProgramBlock, ProgramDay, ProgramPhase } from '../../../lib/coach-client-detail'

// Espejo del WEEKDAY_LONG de la web (ProgramTabB7): microciclo Lunes→Domingo.
const WEEKDAY_LONG = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

function resolveProgramWeek(program: NonNullable<CoachClientDetailData['activeProgram']>): number | null {
  if (!program.start_date) return null
  const start = new Date(`${program.start_date}T12:00:00`).getTime()
  if (!Number.isFinite(start)) return null
  const diffDays = Math.max(0, Math.floor((Date.now() - start) / 86400000))
  return Math.min(Math.max(1, Math.ceil((diffDays + 1) / 7)), Math.max(1, program.weeks_to_repeat))
}

// Días restantes hasta end_date (espejo de planDaysRemaining web). null = sin fecha fin.
function resolveDaysRemaining(program: NonNullable<CoachClientDetailData['activeProgram']>): number | null {
  if (!program.end_date) return null
  const end = new Date(`${program.end_date}T12:00:00`).getTime()
  if (!Number.isFinite(end)) return null
  return Math.max(0, Math.ceil((end - Date.now()) / 86400000))
}

// Grupos musculares únicos de los bloques (espejo de uniqueMuscleGroupsFromBlocks web).
function uniqueMuscleGroups(blocks: ProgramBlock[]): string[] {
  const seen: string[] = []
  for (const b of blocks) {
    const g = b.muscleGroup?.trim()
    if (g && !seen.includes(g)) seen.push(g)
  }
  return seen
}

export function PlanTab({ data, onEdit }: { data: CoachClientDetailData; onEdit: () => void }) {
  const { theme } = useTheme()
  const program = data.activeProgram
  const sheetRef = useRef<BottomSheetModal>(null)
  const [selected, setSelected] = useState<ProgramBlock | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  // Días eliminados localmente (sin prop reload disponible): optimistic remove tras borrar.
  const [deletedPlanIds, setDeletedPlanIds] = useState<Set<string>>(() => new Set())
  const [pendingDelete, setPendingDelete] = useState<ProgramDay | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const todayDow = new Date().getDay() === 0 ? 7 : new Date().getDay()

  const structure = (program?.program_structure_type as 'weekly' | 'cycle' | null) || 'weekly'
  const isWeekly = structure === 'weekly'
  const abMode = !!program?.ab_mode
  const currentWeek = program ? resolveProgramWeek(program) : null
  const activeVariant = resolveActiveWeekVariantForDisplay(program ?? undefined, currentWeek)
  const plansView = useMemo(
    () =>
      filterPlansForStructureView(program?.workoutPlans, structure, { abMode, activeVariant }).filter(
        (p) => !deletedPlanIds.has(p.id)
      ),
    [program?.workoutPlans, structure, abMode, activeVariant, deletedPlanIds]
  )

  // Mapa día-de-semana → plan (primer plan de cada día), para el grid L–D.
  const planByDow = useMemo(() => {
    const m = new Map<number, ProgramDay>()
    for (const p of plansView) {
      const d = Number(p.day_of_week)
      if (!m.has(d)) m.set(d, p)
    }
    return m
  }, [plansView])

  if (!program) {
    return <EmptyState icon={Dumbbell} title="Sin programa activo" subtitle="Este alumno no tiene un programa asignado." />
  }

  const weeksRepeat = Math.max(1, Number(program.weeks_to_repeat) || 1)
  const hasSchedule = !!(program.start_date && program.end_date)
  const daysRemaining = resolveDaysRemaining(program)
  const weekProgressPct = currentWeek && weeksRepeat > 0 ? Math.min(1, currentWeek / weeksRepeat) : 0

  function openBlock(block: ProgramBlock) {
    setSelected(block)
    sheetRef.current?.present()
  }
  function toggle(id: string) {
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    setDeleteError(null)
    const { error } = await supabase.from('workout_plans').delete().eq('id', pendingDelete.id)
    setDeleting(false)
    if (error) {
      setDeleteError(error.message)
      return
    }
    setDeletedPlanIds((prev) => new Set(prev).add(pendingDelete.id))
    setPendingDelete(null)
  }

  return (
    <View style={{ gap: 14 }}>
      {/* Header del programa — nombre + badges + progreso (espejo del GlassCard header web) */}
      <StatCard>
        <View style={styles.headerTop}>
          <Text numberOfLines={2} style={[styles.programName, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>{program.name}</Text>
          <TouchableOpacity onPress={onEdit} style={[styles.editChip, { borderColor: theme.primary + '4D' }]} hitSlop={6} activeOpacity={0.8}>
            <Pencil size={13} color={theme.primary} />
            <Text style={[styles.editChipTxt, { color: theme.primary, fontFamily: 'Inter_700Bold' }]}>Editar en builder</Text>
          </TouchableOpacity>
        </View>
        <View style={cd.metaRow}>
          <Pill label={isWeekly ? 'Semanal' : 'Cíclico'} />
          {abMode ? <Pill label={`Variante ${activeVariant} · esta semana`} tone="warning" /> : null}
          <Pill label={`${weeksRepeat} sem. ciclo`} color={theme.mutedForeground} />
          {program.cycle_length ? <Pill label={`${program.cycle_length} días / ciclo`} color={theme.mutedForeground} /> : null}
        </View>
        {program.phases.length > 0 ? (
          <ProgramPhasesBar phases={program.phases} currentWeek={currentWeek} />
        ) : null}
        {hasSchedule && currentWeek ? (
          <View style={{ gap: 6 }}>
            <View style={styles.weekRow}>
              <Text style={[styles.weekLabel, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>Semana {currentWeek} / {weeksRepeat}</Text>
              <Text style={[styles.weekLabel, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{daysRemaining != null && daysRemaining > 0 ? `${daysRemaining} d restantes` : 'En curso'}</Text>
            </View>
            <ProgressBar value={weekProgressPct} color={theme.primary} height={6} />
          </View>
        ) : (
          <Text style={[styles.noSchedule, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>Sin fechas inicio/fin en el programa · progreso por semanas no disponible</Text>
        )}
      </StatCard>

      {/* Microciclo (L–D) o Días del programa (cíclico) */}
      <StatCard>
        <CardHeader icon={LayoutGrid} title={isWeekly ? 'Microciclo (L–D)' : 'Días del programa'} />
        {isWeekly ? (
          <View style={styles.grid}>
            {Array.from({ length: 7 }, (_, i) => {
              const dow = i + 1
              const plan = planByDow.get(dow)
              return (
                <DayCard
                  key={plan?.id ?? `rest-${dow}`}
                  plan={plan}
                  label={WEEKDAY_LONG[dow - 1] ?? `Día ${dow}`}
                  isToday={dow === todayDow}
                  open={!!plan && expanded.has(plan.id)}
                  onToggle={() => plan && toggle(plan.id)}
                  onBlock={openBlock}
                  onDelete={plan ? () => { setDeleteError(null); setPendingDelete(plan) } : undefined}
                />
              )
            })}
          </View>
        ) : plansView.length === 0 ? (
          <Text style={[cd.empty, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>No hay días con ejercicios en este programa (revisa variantes de semana en el builder).</Text>
        ) : (
          <View style={styles.grid}>
            {plansView.map((plan) => (
              <DayCard
                key={plan.id}
                plan={plan}
                label={`Día ${plan.day_of_week}`}
                isToday={false}
                open={expanded.has(plan.id)}
                onToggle={() => toggle(plan.id)}
                onBlock={openBlock}
                onDelete={() => { setDeleteError(null); setPendingDelete(plan) }}
              />
            ))}
          </View>
        )}
      </StatCard>

      <Button label="Editar en el builder" variant="outline" leftIcon={Pencil} onPress={onEdit} full />

      {/* Confirmación de borrado — diálogo branded (espejo del AlertDialog web) */}
      <NativeDialog open={!!pendingDelete} title="Eliminar rutina" onClose={() => !deleting && setPendingDelete(null)}>
        <Text style={[styles.dialogBody, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          ¿Eliminar <Text style={{ color: theme.foreground, fontFamily: 'Inter_700Bold' }}>“{pendingDelete?.title || 'Entrenamiento'}”</Text>? Esta acción no se puede deshacer.
        </Text>
        {deleteError ? <Text style={[styles.dialogErr, { color: theme.destructive, fontFamily: theme.fontSans }]}>{deleteError}</Text> : null}
        <View style={styles.dialogActions}>
          <Button label="Cancelar" variant="secondary" onPress={() => setPendingDelete(null)} disabled={deleting} style={{ flex: 1 }} />
          <Button label={deleting ? 'Eliminando...' : 'Eliminar'} variant="destructive" loading={deleting} onPress={confirmDelete} style={{ flex: 1 }} />
        </View>
      </NativeDialog>

      <BottomSheetModal ref={sheetRef} index={0} snapPoints={['70%']} enableDynamicSizing={false} enablePanDownToClose
        backgroundStyle={{ backgroundColor: theme.card }} handleIndicatorStyle={{ backgroundColor: theme.mutedForeground }}>
        <BottomSheetScrollView contentContainerStyle={styles.sheet}>
          {selected ? <ExerciseDetail block={selected} /> : null}
        </BottomSheetScrollView>
      </BottomSheetModal>
    </View>
  )
}

// Barra de fases del programa (espejo de ProgramPhasesBar web): segmentos por fase,
// ancho proporcional a semanas, fase actual resaltada en theme.primary.
function ProgramPhasesBar({ phases, currentWeek }: { phases: ProgramPhase[]; currentWeek: number | null }) {
  const { theme } = useTheme()
  if (!phases?.length) return null
  const total = phases.reduce((s, p) => s + Math.max(1, p.weeks), 0) || 1
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

function DayCard({ plan, label, isToday, open, onToggle, onBlock, onDelete }: {
  plan: ProgramDay | undefined
  label: string
  isToday: boolean
  open: boolean
  onToggle: () => void
  onBlock: (b: ProgramBlock) => void
  onDelete?: () => void
}) {
  const { theme } = useTheme()
  const blocks = plan?.blocks ?? []
  const isRest = !plan || blocks.length === 0
  const groups = uniqueMuscleGroups(blocks)

  return (
    <View
      style={[
        styles.dayCard,
        {
          backgroundColor: isRest ? theme.muted + '33' : theme.secondary + '33',
          borderColor: isToday ? theme.primary + '80' : theme.border,
          borderStyle: isRest ? 'dashed' : 'solid',
          borderRadius: theme.radius.lg,
        },
        isToday && { borderWidth: 2 },
      ]}
    >
      <View style={styles.dayHeadRow}>
        <Text style={[styles.dayLabel, { color: isToday ? theme.primary : theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
          {label}{isToday ? ' · Hoy' : ''}
        </Text>
        {plan && onDelete ? (
          <TouchableOpacity onPress={onDelete} hitSlop={8} activeOpacity={0.7} style={styles.delBtn}>
            <Trash2 size={13} color={theme.mutedForeground} />
          </TouchableOpacity>
        ) : null}
      </View>

      {isRest ? (
        <Text style={[styles.restTxt, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>Descanso</Text>
      ) : (
        <>
          <Text numberOfLines={2} style={[styles.dayTitle, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]}>{plan!.title || 'Entrenamiento'}</Text>
          <Text style={[styles.dayMeta, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>
            {blocks.length} ej. · {groups.slice(0, 3).join(', ')}{groups.length > 3 ? '…' : ''}
          </Text>
          <TouchableOpacity onPress={onToggle} activeOpacity={0.8} style={[styles.exToggle, { borderColor: theme.border, backgroundColor: theme.background + '80' }]}>
            <Text style={[styles.exToggleTxt, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]}>Ejercicios</Text>
            {open ? <ChevronUp size={14} color={theme.foreground} /> : <ChevronDown size={14} color={theme.foreground} />}
          </TouchableOpacity>
          {open ? (
            <View style={[styles.exList, { borderTopColor: theme.border }]}>
              {blocks.map((block) => (
                <TouchableOpacity key={block.id} onPress={() => onBlock(block)} activeOpacity={0.7} style={styles.exItem}>
                  <Text numberOfLines={1} style={[styles.exItemTxt, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]}>{block.exerciseName}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </>
      )}
    </View>
  )
}

function ExerciseDetail({ block }: { block: ProgramBlock }) {
  const { theme } = useTheme()
  // Prescripción (espejo del Sheet web): series × reps, tempo, RIR, descanso, obj. peso, notas.
  const rows: { icon?: any; iconColor?: string; text: string }[] = [
    { icon: Dumbbell, iconColor: theme.primary, text: `${block.sets ?? '—'} × ${block.reps ?? '—'}` },
    block.tempo ? { icon: Timer, iconColor: '#F59E0B', text: `Tempo ${block.tempo}` } : null,
    block.rir != null ? { text: `RIR ${block.rir}` } : null,
    block.rest_time ? { text: `Descanso ${block.rest_time}` } : null,
    block.target_weight_kg != null ? { text: `Obj. peso ${block.target_weight_kg} kg` } : null,
  ].filter(Boolean) as { icon?: any; iconColor?: string; text: string }[]

  return (
    <View style={{ gap: 14 }}>
      <Text style={[styles.sheetTitle, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>{block.exerciseName || 'Ejercicio'}</Text>
      {block.muscleGroup ? (
        <View style={[styles.muscleChip, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
          <Target size={12} color={theme.mutedForeground} />
          <Text style={[styles.muscleChipTxt, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{block.muscleGroup}</Text>
        </View>
      ) : null}
      {block.gifUrl ? (
        <Image source={{ uri: block.gifUrl }} style={[styles.gif, { backgroundColor: theme.secondary, borderColor: theme.border }]} contentFit="contain" transition={150} />
      ) : null}
      <View style={[styles.prescriptionCard, { backgroundColor: theme.secondary, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
        <Text style={[styles.prescriptionLabel, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>Prescripción</Text>
        <View style={{ gap: 8 }}>
          {rows.map((r, i) => (
            <View key={i} style={styles.prescriptionRow}>
              {r.icon ? <r.icon size={14} color={r.iconColor ?? theme.mutedForeground} /> : null}
              <Text style={[styles.prescriptionTxt, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>{r.text}</Text>
            </View>
          ))}
        </View>
        {block.notes ? (
          <Text style={[styles.notesTxt, { color: theme.mutedForeground, borderTopColor: theme.border, fontFamily: theme.fontSans }]}>{block.notes}</Text>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  headerTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  programName: { fontSize: 19, letterSpacing: -0.3, flex: 1, textTransform: 'uppercase' },
  editChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  editChipTxt: { fontSize: 11 },
  weekRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weekLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
  noSchedule: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
  phasesTrack: { flexDirection: 'row', height: 6, borderRadius: 999, overflow: 'hidden', borderWidth: 1 },
  phaseLabel: { fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.5 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dayCard: { width: '48%', flexGrow: 1, borderWidth: 1, padding: 12, gap: 6, minHeight: 72 },
  dayHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  dayLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.9, flex: 1 },
  delBtn: { padding: 2 },
  restTxt: { fontSize: 12 },
  dayTitle: { fontSize: 12, textTransform: 'uppercase', letterSpacing: -0.2 },
  dayMeta: { fontSize: 10 },
  exToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderRadius: 9, paddingHorizontal: 9, paddingVertical: 7, marginTop: 2 },
  exToggleTxt: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
  exList: { marginTop: 4, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 4, gap: 2 },
  exItem: { paddingHorizontal: 6, paddingVertical: 6 },
  exItemTxt: { fontSize: 11 },

  dialogBody: { fontSize: 14, lineHeight: 20 },
  dialogErr: { fontSize: 13 },
  dialogActions: { flexDirection: 'row', gap: 10 },

  sheet: { paddingHorizontal: 18, paddingBottom: 40 },
  sheetTitle: { fontSize: 20, letterSpacing: -0.4 },
  muscleChip: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, marginTop: -8 },
  muscleChipTxt: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
  gif: { width: '100%', height: 220, borderRadius: 14, borderWidth: 1 },
  prescriptionCard: { borderWidth: 1, padding: 14, gap: 10 },
  prescriptionLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 },
  prescriptionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  prescriptionTxt: { fontSize: 13 },
  notesTxt: { fontSize: 13, lineHeight: 19, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, marginTop: 2 },
})
