import { useMemo, useRef, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Image } from 'expo-image'
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { ChevronDown, Dumbbell, LayoutGrid, Moon, Pencil } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Button, EmptyState, ProgressBar } from '../../../components'
import { StatCard, CardHeader, Pill, cd, dayName } from './shared'
import { filterPlansForStructureView, resolveActiveWeekVariantForDisplay } from '../../../lib/program-week-variant'
import type { CoachClientDetailData, ProgramBlock, ProgramDay } from '../../../lib/coach-client-detail'

function resolveProgramWeek(program: NonNullable<CoachClientDetailData['activeProgram']>): number | null {
  if (!program.start_date) return null
  const start = new Date(`${program.start_date}T12:00:00`).getTime()
  if (!Number.isFinite(start)) return null
  const diffDays = Math.max(0, Math.floor((Date.now() - start) / 86400000))
  return Math.min(Math.max(1, Math.ceil((diffDays + 1) / 7)), Math.max(1, program.weeks_to_repeat))
}

export function PlanTab({ data, onEdit }: { data: CoachClientDetailData; onEdit: () => void }) {
  const { theme } = useTheme()
  const program = data.activeProgram
  const sheetRef = useRef<BottomSheetModal>(null)
  const [selected, setSelected] = useState<ProgramBlock | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const todayDow = new Date().getDay() === 0 ? 7 : new Date().getDay()

  if (!program) {
    return <EmptyState icon={Dumbbell} title="Sin programa activo" subtitle="Este alumno no tiene un programa asignado." />
  }
  const currentWeek = resolveProgramWeek(program)

  // A-F2: resolver variante AB/cíclica activa (no renderizar planes crudo).
  const structure = (program.program_structure_type as 'weekly' | 'cycle' | null) || 'weekly'
  const abMode = !!program.ab_mode
  const activeVariant = resolveActiveWeekVariantForDisplay(program, currentWeek)
  const plansView = useMemo(
    () => filterPlansForStructureView(program.workoutPlans, structure, { abMode, activeVariant }),
    [program.workoutPlans, structure, abMode, activeVariant]
  )

  function openBlock(block: ProgramBlock) {
    setSelected(block)
    sheetRef.current?.present()
  }
  function toggle(id: string) {
    setExpanded((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  return (
    <View style={{ gap: 14 }}>
      <StatCard>
        <CardHeader icon={LayoutGrid} title="Programa" right={
          <TouchableOpacity onPress={onEdit} hitSlop={8}><Pencil size={16} color={theme.primary} /></TouchableOpacity>
        } />
        <Text numberOfLines={1} style={[cd.big, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{program.name}</Text>
        <View style={cd.metaRow}>
          <Pill label={program.program_structure_type === 'cycle' ? 'Cíclico' : 'Semanal'} />
          {program.ab_mode ? <Pill label={`A/B · ${activeVariant} esta sem.`} tone="warning" /> : null}
          <Pill label={`${program.weeks_to_repeat} sem.`} />
          {program.cycle_length ? <Pill label={`Ciclo ${program.cycle_length}d`} /> : null}
          <Pill label={`${program.planCount} días`} />
        </View>
        {currentWeek ? (
          <View style={{ gap: 6 }}>
            <View style={styles.weekRow}>
              <Text style={[styles.weekLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Semana del ciclo</Text>
              <Text style={[styles.weekVal, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>{currentWeek}/{program.weeks_to_repeat}</Text>
            </View>
            <ProgressBar value={program.weeks_to_repeat > 0 ? currentWeek / program.weeks_to_repeat : 0} color={theme.primary} height={7} />
          </View>
        ) : null}
      </StatCard>

      {plansView.length ? plansView.map((plan) => (
        <DayCard key={plan.id} plan={plan} isToday={structure !== 'cycle' && plan.day_of_week === todayDow} open={expanded.has(plan.id)} onToggle={() => toggle(plan.id)} onBlock={openBlock} />
      )) : (
        <Text style={[cd.empty, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Programa sin días cargados.</Text>
      )}

      <Button label="Editar en el builder" variant="outline" leftIcon={Pencil} onPress={onEdit} full />

      <BottomSheetModal ref={sheetRef} index={0} snapPoints={['70%']} enableDynamicSizing={false} enablePanDownToClose
        backgroundStyle={{ backgroundColor: theme.card }} handleIndicatorStyle={{ backgroundColor: theme.mutedForeground }}>
        <BottomSheetScrollView contentContainerStyle={styles.sheet}>
          {selected ? <ExerciseDetail block={selected} /> : null}
        </BottomSheetScrollView>
      </BottomSheetModal>
    </View>
  )
}

function DayCard({ plan, isToday, open, onToggle, onBlock }: { plan: ProgramDay; isToday: boolean; open: boolean; onToggle: () => void; onBlock: (b: ProgramBlock) => void }) {
  const { theme } = useTheme()
  const isRest = plan.blocks.length === 0
  return (
    <View style={[styles.dayCard, { backgroundColor: theme.card, borderColor: isToday ? theme.primary + '66' : theme.border, borderRadius: theme.radius.xl }]}>
      <TouchableOpacity activeOpacity={0.8} onPress={onToggle} disabled={isRest} style={styles.dayHead}>
        <View style={[styles.dayBadge, { backgroundColor: isToday ? theme.primary + '18' : theme.secondary, borderColor: isToday ? theme.primary + '44' : theme.border }]}>
          {isRest ? <Moon size={15} color={theme.mutedForeground} /> : <Dumbbell size={15} color={isToday ? theme.primary : theme.mutedForeground} />}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={styles.dayTopRow}>
            <Text style={[styles.dayDow, { color: isToday ? theme.primary : theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>{plan.day_of_week ? dayName(plan.day_of_week) : 'Día'}</Text>
            {plan.week_variant ? <Pill label={plan.week_variant} /> : null}
            {isToday ? <Pill label="Hoy" /> : null}
          </View>
          <Text numberOfLines={1} style={[styles.dayTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{isRest ? 'Descanso' : plan.title}</Text>
          {!isRest ? <Text style={[cd.rowSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{plan.blocks.length} ejercicios</Text> : null}
        </View>
        {!isRest ? <ChevronDown size={18} color={theme.mutedForeground} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} /> : null}
      </TouchableOpacity>

      {open && !isRest ? (
        <View style={styles.blockList}>
          {plan.blocks.map((block) => (
            <TouchableOpacity key={block.id} activeOpacity={0.75} onPress={() => onBlock(block)} style={[styles.blockRow, { borderColor: theme.border }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[cd.rowTitle, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>{block.exerciseName}</Text>
                <Text style={[cd.rowSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{block.muscleGroup ?? 'Sin grupo'}</Text>
              </View>
              <Text style={[styles.prescription, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>{block.sets}×{block.reps}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  )
}

function ExerciseDetail({ block }: { block: ProgramBlock }) {
  const { theme } = useTheme()
  const rows: { label: string; value: string }[] = [
    { label: 'Series × reps', value: `${block.sets} × ${block.reps}` },
    block.target_weight_kg != null ? { label: 'Peso objetivo', value: `${block.target_weight_kg} kg` } : null,
    block.rest_time ? { label: 'Descanso', value: String(block.rest_time) } : null,
    block.tempo ? { label: 'Tempo', value: String(block.tempo) } : null,
    block.rir != null ? { label: 'RIR', value: String(block.rir) } : null,
  ].filter(Boolean) as { label: string; value: string }[]

  return (
    <View style={{ gap: 14 }}>
      <Text style={[styles.sheetTitle, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>{block.exerciseName}</Text>
      <Text style={[styles.sheetMuscle, { color: theme.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>{block.muscleGroup ?? 'Sin grupo'}</Text>
      {block.gifUrl ? (
        <Image source={{ uri: block.gifUrl }} style={[styles.gif, { backgroundColor: theme.secondary, borderColor: theme.border }]} contentFit="contain" transition={150} />
      ) : null}
      <View style={{ gap: 0 }}>
        {rows.map((r, i) => (
          <View key={r.label} style={[styles.detailRow, i < rows.length - 1 && { borderBottomColor: theme.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
            <Text style={[styles.detailLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{r.label}</Text>
            <Text style={[styles.detailValue, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{r.value}</Text>
          </View>
        ))}
      </View>
      {block.notes ? (
        <View style={[styles.notes, { backgroundColor: theme.secondary, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
          <Text style={[styles.notesTxt, { color: theme.foreground, fontFamily: theme.fontSans }]}>{block.notes}</Text>
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  weekRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  weekLabel: { fontSize: 12 },
  weekVal: { fontSize: 14 },
  dayCard: { borderWidth: 1, padding: 14, gap: 10 },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  dayBadge: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dayTopRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dayDow: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.8 },
  dayTitle: { fontSize: 14, marginTop: 2 },
  blockList: { gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'transparent', paddingTop: 2 },
  blockRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  prescription: { fontSize: 13 },
  sheet: { paddingHorizontal: 18, paddingBottom: 40 },
  sheetTitle: { fontSize: 20, letterSpacing: -0.4 },
  sheetMuscle: { fontSize: 13, marginTop: -8 },
  gif: { width: '100%', height: 220, borderRadius: 14, borderWidth: 1 },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 11 },
  detailLabel: { fontSize: 13 },
  detailValue: { fontSize: 14 },
  notes: { borderWidth: 1, padding: 12 },
  notesTxt: { fontSize: 13, lineHeight: 19 },
})
