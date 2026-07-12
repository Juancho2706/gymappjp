import { useMemo, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Image } from 'expo-image'
import { ChevronDown, ClipboardX, Clock, Dumbbell, Gauge, LayoutGrid, Moon, Pencil, Plus, Target, Timer, Weight } from 'lucide-react-native'
import type { LucideIcon } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Button, EmptyState, ProgressBar, Sheet } from '../../../components'
import { StatCard, CardHeader, Pill, cd, dayName } from './shared'
import { filterPlansForStructureView, resolveActiveWeekVariantForDisplay } from '../../../lib/program-week-variant'
import type { CoachClientDetailData, ProgramBlock, ProgramDay } from '../../../lib/coach-client-detail'
import { getTodayInSantiago } from '../../../lib/date-utils'

function resolveProgramWeek(program: NonNullable<CoachClientDetailData['activeProgram']>): number | null {
  if (!program.start_date) return null
  const start = new Date(`${program.start_date}T12:00:00`).getTime()
  if (!Number.isFinite(start)) return null
  const today = new Date(`${getTodayInSantiago().iso}T12:00:00`).getTime()
  const diffDays = Math.max(0, Math.floor((today - start) / 86400000))
  return Math.min(Math.max(1, Math.ceil((diffDays + 1) / 7)), Math.max(1, program.weeks_to_repeat))
}

export function PlanTab({ data, onEdit }: { data: CoachClientDetailData; onEdit: () => void }) {
  const { theme } = useTheme()
  const program = data.activeProgram
  const [selected, setSelected] = useState<ProgramBlock | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const santiagoToday = new Date(`${getTodayInSantiago().iso}T12:00:00`)
  const todayDow = santiagoToday.getDay() === 0 ? 7 : santiagoToday.getDay()

  if (!program) {
    return (
      <EmptyState
        icon={ClipboardX}
        title="Sin programa asignado"
        subtitle="Este alumno no tiene un plan de entrenamiento activo."
        action={<Button label="Crear o asignar programa" variant="sport" leftIcon={Plus} onPress={onEdit} full />}
      />
    )
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
        <Text numberOfLines={1} style={[cd.big, { color: theme.foreground, fontFamily: 'Archivo_700Bold' }]}>{program.name}</Text>
        <View style={cd.metaRow}>
          <Pill label={program.program_structure_type === 'cycle' ? 'Cíclico' : 'Semanal'} />
          {program.ab_mode ? <Pill label={`A/B · ${activeVariant} esta sem.`} /> : null}
          <Pill label={`${program.weeks_to_repeat} sem.`} />
          {program.cycle_length ? <Pill label={`Ciclo ${program.cycle_length}d`} /> : null}
          <Pill label={`${program.planCount} días`} />
        </View>
        {currentWeek ? (
          <View style={{ gap: 6 }}>
            <View style={styles.weekRow}>
              <Text style={[styles.weekLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Semana del ciclo</Text>
              <Text style={[styles.weekVal, { color: theme.foreground, fontFamily: 'Archivo_800ExtraBold' }]}>{currentWeek}/{program.weeks_to_repeat}</Text>
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

      <Button label="Editar en builder" variant="sport" leftIcon={Pencil} onPress={onEdit} full />

      {/* QA-12 (gotcha 6a / ronda 7): el sheet de detalle del ejercicio es CRÍTICO para el flujo del
          coach y antes usaba `@gorhom/bottom-sheet` crudo con snap fijo 70% + enableDynamicSizing=false.
          Bajo reanimated 4 / Fabric el hosting-container siembra su alto en -999 y el primer present()
          montaba el sheet fuera de pantalla ("no abre al primer tap, sí tras visitar otra tab"). El wrapper
          `<Sheet nativeModal>` lo renderiza vía `<Modal>` RN (content-hug, patrón KeypadHost) y expone la
          misma API declarativa open/onClose; `snapPoints` = tope de max-height (paridad web max-h-[88vh]). */}
      <Sheet
        open={selected != null}
        onClose={() => setSelected(null)}
        nativeModal
        snapPoints={['85%']}
        footer={<Button label="Cerrar" variant="secondary" onPress={() => setSelected(null)} full />}
      >
        {selected ? <ExerciseDetail block={selected} /> : null}
      </Sheet>
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
            <Text style={[styles.dayDow, { color: isToday ? theme.primary : theme.mutedForeground, fontFamily: 'HankenGrotesk_700Bold' }]}>{plan.day_of_week ? dayName(plan.day_of_week) : 'Día'}</Text>
            {plan.week_variant ? <Pill label={plan.week_variant} /> : null}
            {isToday ? <Pill label="Hoy" /> : null}
          </View>
          <Text numberOfLines={1} style={[styles.dayTitle, { color: theme.foreground, fontFamily: 'Archivo_700Bold' }]}>{isRest ? 'Descanso' : plan.title}</Text>
          {!isRest ? <Text style={[cd.rowSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{plan.blocks.length} ejercicios</Text> : null}
        </View>
        {!isRest ? <ChevronDown size={18} color={theme.mutedForeground} style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }} /> : null}
      </TouchableOpacity>

      {open && !isRest ? (
        <View style={styles.blockList}>
          {plan.blocks.map((block) => (
            <TouchableOpacity key={block.id} activeOpacity={0.75} onPress={() => onBlock(block)} style={[styles.blockRow, { borderColor: theme.border }]}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text numberOfLines={1} style={[cd.rowTitle, { color: theme.foreground, fontFamily: 'HankenGrotesk_600SemiBold' }]}>{block.exerciseName}</Text>
                <Text style={[cd.rowSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{block.muscleGroup ?? 'Sin grupo'}</Text>
              </View>
              <Text style={[styles.prescription, { color: theme.primary, fontFamily: 'Archivo_700Bold' }]}>{block.sets}×{block.reps}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  )
}

function ExerciseDetail({ block }: { block: ProgramBlock }) {
  const { theme } = useTheme()
  // Orden y filtros VERBATIM del web (ProgramTabB7.tsx:478-500): Series × reps → Obj. peso →
  // Descanso → RIR → Tempo; RIR solo si `!= null && !== ''`. Icono sport por fila.
  const rows: { label: string; value: string; Icon: LucideIcon }[] = [
    { label: 'Series × reps', value: `${block.sets} × ${block.reps}`, Icon: Dumbbell },
    block.target_weight_kg != null ? { label: 'Obj. peso', value: `${block.target_weight_kg} kg`, Icon: Weight } : null,
    block.rest_time ? { label: 'Descanso', value: String(block.rest_time), Icon: Timer } : null,
    block.rir != null && block.rir !== '' ? { label: 'RIR', value: String(block.rir), Icon: Gauge } : null,
    block.tempo ? { label: 'Tempo', value: String(block.tempo), Icon: Clock } : null,
  ].filter(Boolean) as { label: string; value: string; Icon: LucideIcon }[]

  return (
    <View style={{ gap: 14 }}>
      <Text style={[styles.sheetTitle, { color: theme.foreground, fontFamily: 'Archivo_800ExtraBold' }]}>{block.exerciseName}</Text>
      <View style={styles.muscleRow}>
        {block.muscleGroup ? (
          <View style={[styles.muscleChip, { borderColor: theme.border }]}>
            <Target size={12} color={theme.mutedForeground} />
            <Text style={[styles.muscleChipTxt, { color: theme.mutedForeground, fontFamily: 'HankenGrotesk_700Bold' }]}>{block.muscleGroup}</Text>
          </View>
        ) : (
          <Text style={[styles.sheetMuscle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Ejercicio del programa</Text>
        )}
      </View>
      {block.gifUrl ? (
        <Image source={{ uri: block.gifUrl }} style={[styles.gif, { backgroundColor: theme.secondary, borderColor: theme.border }]} contentFit="contain" transition={150} />
      ) : null}
      {rows.length ? (
        <View style={[styles.prescriptionBox, { borderColor: theme.border, borderRadius: theme.radius.md }]}>
          {rows.map((r, i) => (
            <View key={r.label} style={[styles.detailRow, i > 0 && { borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
              <r.Icon size={17} color={theme.primary} />
              <Text style={[styles.detailLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{r.label}</Text>
              <Text style={[styles.detailValue, { color: theme.foreground, fontFamily: 'Archivo_700Bold' }]}>{r.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {block.notes ? (
        <View style={[styles.notes, { backgroundColor: theme.secondary, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
          <Text style={[styles.notesHeader, { color: theme.mutedForeground, fontFamily: 'Archivo_800ExtraBold' }]}>NOTAS DEL COACH</Text>
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
  sheetTitle: { fontSize: 20, letterSpacing: -0.4 },
  sheetMuscle: { fontSize: 13 },
  muscleRow: { flexDirection: 'row', flexWrap: 'wrap' },
  muscleChip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, height: 22 },
  muscleChipTxt: { fontSize: 11 },
  gif: { width: '100%', height: 220, borderRadius: 14, borderWidth: 1 },
  prescriptionBox: { borderWidth: 1, overflow: 'hidden' },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, paddingHorizontal: 14 },
  detailLabel: { fontSize: 13, flex: 1 },
  detailValue: { fontSize: 15 },
  notes: { borderWidth: 1, padding: 12 },
  notesHeader: { fontSize: 11, letterSpacing: 0.4, marginBottom: 4 },
  notesTxt: { fontSize: 13, lineHeight: 19 },
})
