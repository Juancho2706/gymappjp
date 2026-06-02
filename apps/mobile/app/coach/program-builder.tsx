import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { BottomSheetModal } from '@gorhom/bottom-sheet'
import { Copy, GripVertical, Link2, Moon, Plus, Redo2, Undo2 } from 'lucide-react-native'
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist'
import { supabase } from '../../lib/supabase'
import { getCoachProfile } from '../../lib/coach'
import { useTheme } from '../../context/ThemeContext'
import { ExerciseSearchSheet } from '../../components/coach/ExerciseSearchSheet'
import { BlockEditorSheet } from '../../components/coach/BlockEditorSheet'
import { EvaLoaderScreen } from '../../components/EvaLoader'
import { usePlanBuilder } from '../../lib/plan-builder/reducer'
import { buildDaySkeleton } from '../../lib/plan-builder/skeleton'
import type { BuilderBlock, DayState, DurationType, ProgramStructureType } from '../../lib/plan-builder/types'

const DAY_SHORT = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function emptyDays(): DayState[] {
  return buildDaySkeleton('weekly', 7, [])
}
function dayLabel(structure: ProgramStructureType, d: DayState): string {
  return structure === 'weekly' ? DAY_SHORT[d.id] : `D${d.id}`
}

function mapDbBlock(b: any): BuilderBlock {
  return {
    uid: `block-${b.id ?? Math.random().toString(36).slice(2)}`,
    exercise_id: b.exercise_id,
    exercise_name: b.exercises?.name ?? b.exercise_name ?? 'Ejercicio',
    muscle_group: b.exercises?.muscle_group ?? 'General',
    gif_url: b.exercises?.gif_url ?? undefined,
    video_url: b.exercises?.video_url ?? undefined,
    sets: b.sets ?? 3,
    reps: b.reps ?? '8-10',
    target_weight_kg: b.target_weight_kg != null ? String(b.target_weight_kg) : undefined,
    tempo: b.tempo ?? undefined,
    rir: b.rir ?? undefined,
    rest_time: b.rest_time ?? undefined,
    notes: b.notes ?? undefined,
    superset_group: b.superset_group ?? null,
    progression_type: b.progression_type ?? null,
    progression_value: b.progression_value ?? null,
    section: (b.section as BuilderBlock['section']) ?? 'main',
    is_override: b.is_override ?? false,
  }
}

export default function ProgramBuilderScreen() {
  const { clientId, clientName } = useLocalSearchParams<{ clientId: string; clientName?: string }>()
  const { theme } = useTheme()
  const router = useRouter()
  const searchRef = useRef<BottomSheetModal>(null)
  const editorRef = useRef<BottomSheetModal>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [programId, setProgramId] = useState<string | null>(null)
  const [initial, setInitial] = useState<DayState[]>(emptyDays())

  // Program meta
  const [name, setName] = useState('Programa principal')
  const [structureType, setStructureType] = useState<ProgramStructureType>('weekly')
  const [durationType, setDurationType] = useState<DurationType>('weeks')
  const [weeks, setWeeks] = useState(4)
  const [cycleLength, setCycleLength] = useState(4)
  const [abMode, setAbMode] = useState(false)
  const [variant, setVariant] = useState<'A' | 'B'>('A')
  // The builder holds the ACTIVE variant; the inactive one is stashed here.
  const [otherDays, setOtherDays] = useState<DayState[]>(emptyDays())
  const reshapeReady = useRef(false)

  const [activeDayId, setActiveDayId] = useState(1)
  const [editingUid, setEditingUid] = useState<string | null>(null)
  const [copyOpen, setCopyOpen] = useState(false)

  const builder = usePlanBuilder(initial)
  const { days, addExercise, removeBlock, updateBlock, moveBlock, updateDayTitle, toggleRestDay, copyDay, toggleSuperset, setBlockSection, toggleBlockOverride, undo, redo, canUndo, canRedo, setDays } = builder

  const liveDays = useRef(days)
  useEffect(() => { liveDays.current = days }, [days])

  function variantDays(plans: any[], v: 'A' | 'B', structure: ProgramStructureType, len: number): DayState[] {
    const built = buildDaySkeleton(structure, len, [])
    for (const plan of plans) {
      if ((plan.week_variant ?? 'A') !== v) continue
      const day = built.find((d) => d.id === plan.day_of_week)
      if (!day) continue
      day.title = plan.title ?? ''
      day.blocks = ((plan.workout_blocks ?? []) as any[]).sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0)).map(mapDbBlock)
    }
    return built
  }

  useEffect(() => {
    (async () => {
      const { data: prog } = await supabase
        .from('workout_programs')
        .select('id, name, program_structure_type, duration_type, weeks_to_repeat, cycle_length, ab_mode, workout_plans ( id, title, day_of_week, week_variant, workout_blocks ( id, exercise_id, order_index, sets, reps, rir, rest_time, notes, target_weight_kg, tempo, superset_group, progression_type, progression_value, section, is_override, exercises ( name, muscle_group, gif_url, video_url ) ) )')
        .eq('client_id', clientId)
        .eq('is_active', true)
        .maybeSingle()

      if (prog) {
        const structure = (prog.program_structure_type as ProgramStructureType) ?? 'weekly'
        const plans = (prog.workout_plans ?? []) as any[]
        const len = structure === 'cycle' ? Math.max(1, Math.min(7, prog.cycle_length ?? 4)) : 7
        const hasB = plans.some((p) => (p.week_variant ?? 'A') === 'B')
        setProgramId(prog.id)
        setName(prog.name ?? 'Programa principal')
        setStructureType(structure)
        setDurationType((prog.duration_type as DurationType) ?? 'weeks')
        setWeeks(prog.weeks_to_repeat ?? 4)
        setCycleLength(len)
        setAbMode(Boolean(prog.ab_mode) || hasB)
        const a = variantDays(plans, 'A', structure, len)
        setInitial(a)
        setDays(a)
        setOtherDays(variantDays(plans, 'B', structure, len))
      }
      reshapeReady.current = true
      setLoading(false)
    })()
  }, [clientId])

  // Reshape both variants when structure / cycle length changes (preserve blocks).
  useEffect(() => {
    if (!reshapeReady.current) return
    setDays(buildDaySkeleton(structureType, cycleLength, liveDays.current))
    setOtherDays((prev) => buildDaySkeleton(structureType, cycleLength, prev))
    setActiveDayId(1)
  }, [structureType, cycleLength])

  function switchVariant(to: 'A' | 'B') {
    if (to === variant) return
    const cur = liveDays.current
    setDays(otherDays)
    setOtherDays(cur)
    setVariant(to)
    setActiveDayId(1)
  }
  function toggleAb(on: boolean) {
    if (!on && variant === 'B') switchVariant('A')
    setAbMode(on)
    if (on) setOtherDays(buildDaySkeleton(structureType, cycleLength, []))
  }

  const currentDay = days.find((d) => d.id === activeDayId) ?? days[0]
  const editingBlock = useMemo(() => days.flatMap((d) => d.blocks).find((b) => b.uid === editingUid) ?? null, [days, editingUid])

  function openEditor(uid: string) { setEditingUid(uid); editorRef.current?.present() }

  async function handleSave() {
    if (!name.trim()) { Alert.alert('Nombre requerido', 'Ingresa un nombre para el programa.'); return }
    const hasAny = days.some((d) => d.blocks.length > 0) || (abMode && otherDays.some((d) => d.blocks.length > 0))
    if (!hasAny) { Alert.alert('Sin ejercicios', 'Agrega al menos un ejercicio en algún día.'); return }
    setSaving(true)
    try {
      const coach = await getCoachProfile()
      if (!coach) throw new Error('Coach no encontrado')

      let pid = programId
      const meta = {
        name: name.trim(),
        program_structure_type: structureType,
        duration_type: durationType,
        weeks_to_repeat: weeks,
        cycle_length: structureType === 'cycle' ? cycleLength : null,
        ab_mode: abMode,
        is_active: true,
      }
      if (pid) {
        await supabase.from('workout_programs').update(meta).eq('id', pid)
      } else {
        const { data, error } = await supabase.from('workout_programs')
          .insert({ client_id: clientId, coach_id: coach.id, ...meta }).select('id').single()
        if (error) throw error
        pid = data.id
        setProgramId(pid)
      }

      // Rebuild plans+blocks for this program (variant A / weekly).
      const { data: oldPlans } = await supabase.from('workout_plans').select('id').eq('program_id', pid)
      const oldIds = (oldPlans ?? []).map((p) => p.id)
      if (oldIds.length) {
        await supabase.from('workout_blocks').delete().in('plan_id', oldIds)
        await supabase.from('workout_plans').delete().in('id', oldIds)
      }

      const sets: { variant: 'A' | 'B'; days: DayState[] }[] = abMode
        ? [{ variant, days }, { variant: variant === 'A' ? 'B' : 'A', days: otherDays }]
        : [{ variant: 'A', days }]

      for (const set of sets) {
        for (const day of set.days) {
          if (day.blocks.length === 0) continue
          const { data: plan, error: planErr } = await supabase.from('workout_plans')
            .insert({ program_id: pid, client_id: clientId, coach_id: coach.id, title: day.title || day.name, day_of_week: day.id, week_variant: set.variant })
            .select('id').single()
          if (planErr) throw planErr
          const inserts = day.blocks.map((b, i) => ({
            plan_id: plan.id,
            exercise_id: b.exercise_id,
            order_index: i,
            sets: b.sets ?? 3,
            reps: b.reps || '8-10',
            rir: b.rir || null,
            rest_time: b.rest_time || null,
            notes: b.notes || null,
            target_weight_kg: b.target_weight_kg && b.target_weight_kg.trim() ? Number(b.target_weight_kg) : null,
            tempo: b.tempo || null,
            superset_group: b.superset_group || null,
            progression_type: b.progression_type || null,
            progression_value: b.progression_value ?? null,
            section: b.section ?? 'main',
            is_override: b.is_override ?? false,
          }))
          const { error: blkErr } = await supabase.from('workout_blocks').insert(inserts)
          if (blkErr) throw blkErr
        }
      }
      router.back()
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo guardar.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}><EvaLoaderScreen subtitle="Cargando programa…" /></SafeAreaView>
  }

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.root, { backgroundColor: theme.background }]}>
      {/* Top bar */}
      <View style={[styles.topBar, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.topBtn}><Text style={[styles.topBtnText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Cancelar</Text></TouchableOpacity>
        <View style={styles.undoRow}>
          <TouchableOpacity onPress={undo} disabled={!canUndo} hitSlop={8}><Undo2 size={20} color={canUndo ? theme.foreground : theme.muted} /></TouchableOpacity>
          <TouchableOpacity onPress={redo} disabled={!canRedo} hitSlop={8}><Redo2 size={20} color={canRedo ? theme.foreground : theme.muted} /></TouchableOpacity>
        </View>
        <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.topBtn}>
          {saving ? <ActivityIndicator size="small" color={theme.primary} /> : <Text style={[styles.topBtnText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>Guardar</Text>}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <DraggableFlatList
          data={currentDay.blocks}
          keyExtractor={(b) => b.uid}
          onDragEnd={({ from, to }) => { if (from !== to) moveBlock(currentDay.id, from, to) }}
          activationDistance={14}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={{ gap: 14, paddingBottom: 14 }}>
              {clientName ? <Text style={[styles.subTitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Programa de {clientName}</Text> : null}
              <TextInput value={name} onChangeText={setName} placeholder="Nombre del programa" placeholderTextColor={theme.mutedForeground}
                style={[styles.nameInput, { borderColor: theme.border, backgroundColor: theme.card, color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]} />
              <View style={styles.metaRow}>
                <SmallSeg theme={theme} label="Estructura" options={[{ v: 'weekly', l: 'Semanal' }, { v: 'cycle', l: 'Ciclo' }]} value={structureType} onChange={(v) => setStructureType(v as ProgramStructureType)} />
                {structureType === 'cycle' ? (
                  <View style={{ width: 90 }}>
                    <Text style={[styles.metaLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Días ciclo</Text>
                    <TextInput value={String(cycleLength)} onChangeText={(v) => setCycleLength(Math.max(1, Math.min(7, Number(v) || 1)))} keyboardType="number-pad"
                      style={[styles.weeksInput, { borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: theme.fontSans }]} />
                  </View>
                ) : null}
              </View>
              <View style={styles.metaRow}>
                <SmallSeg theme={theme} label="Duración" options={[{ v: 'weeks', l: 'Semanas' }, { v: 'async', l: 'Async' }, { v: 'calendar_days', l: 'Días' }]} value={durationType} onChange={(v) => setDurationType(v as DurationType)} />
                <View style={{ width: 96 }}>
                  <Text style={[styles.metaLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Repetir (sem)</Text>
                  <TextInput value={String(weeks)} onChangeText={(v) => setWeeks(Math.max(1, Number(v) || 1))} keyboardType="number-pad"
                    style={[styles.weeksInput, { borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: theme.fontSans }]} />
                </View>
              </View>

              {structureType === 'weekly' ? (
                <View style={[styles.abRow, { borderColor: theme.border }]}>
                  <Text style={[styles.abLabel, { color: theme.foreground, fontFamily: theme.fontSans }]}>Semanas A/B (alterna 2 rutinas)</Text>
                  <TouchableOpacity onPress={() => toggleAb(!abMode)} activeOpacity={0.8} style={[styles.switch, { backgroundColor: abMode ? theme.primary : theme.muted }]}>
                    <View style={[styles.knob, { backgroundColor: '#fff', alignSelf: abMode ? 'flex-end' : 'flex-start' }]} />
                  </TouchableOpacity>
                </View>
              ) : null}
              {abMode && structureType === 'weekly' ? (
                <SmallSeg theme={theme} label="Variante activa" options={[{ v: 'A', l: 'Semana A' }, { v: 'B', l: 'Semana B' }]} value={variant} onChange={(v) => switchVariant(v as 'A' | 'B')} />
              ) : null}

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
                {days.map((d) => {
                  const active = d.id === activeDayId
                  const has = d.blocks.length > 0
                  return (
                    <TouchableOpacity key={d.id} onPress={() => setActiveDayId(d.id)} activeOpacity={0.8}
                      style={[styles.dayChip, { backgroundColor: active ? theme.primary : theme.secondary, borderColor: active ? theme.primary : theme.border }]}>
                      <Text style={[styles.dayChipText, { color: active ? theme.primaryForeground : theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{dayLabel(structureType, d)}</Text>
                      {d.is_rest ? <Moon size={11} color={active ? theme.primaryForeground : theme.mutedForeground} /> : has ? <View style={[styles.dot, { backgroundColor: active ? theme.primaryForeground : theme.primary }]} /> : null}
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>

              <View style={styles.dayHeader}>
                <TextInput value={currentDay.title} onChangeText={(v) => updateDayTitle(currentDay.id, v)} placeholder={`Título de ${currentDay.name}`} placeholderTextColor={theme.mutedForeground}
                  style={[styles.dayTitleInput, { borderColor: theme.border, backgroundColor: theme.card, color: theme.foreground, fontFamily: theme.fontSans }]} />
                <TouchableOpacity onPress={() => toggleRestDay(currentDay.id)} activeOpacity={0.8}
                  style={[styles.restBtn, { borderColor: currentDay.is_rest ? theme.primary : theme.border, backgroundColor: currentDay.is_rest ? theme.primary + '1A' : 'transparent' }]}>
                  <Moon size={15} color={currentDay.is_rest ? theme.primary : theme.mutedForeground} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setCopyOpen(true)} activeOpacity={0.8} style={[styles.restBtn, { borderColor: theme.border }]}>
                  <Copy size={15} color={theme.mutedForeground} />
                </TouchableOpacity>
              </View>
            </View>
          }
          renderItem={({ item: b, drag, isActive }) => (
            <ScaleDecorator>
              <View style={[styles.blockCard, { backgroundColor: theme.card, borderColor: b.superset_group ? theme.primary + '66' : theme.border, opacity: isActive ? 0.92 : 1, marginBottom: 8 }]}>
                <TouchableOpacity onLongPress={drag} delayLongPress={140} hitSlop={8} style={{ paddingRight: 2 }}>
                  <GripVertical size={18} color={theme.mutedForeground} />
                </TouchableOpacity>
                <TouchableOpacity style={{ flex: 1, gap: 2 }} activeOpacity={0.85} onPress={() => openEditor(b.uid)}>
                  <View style={styles.blockTitleRow}>
                    {b.superset_group ? <View style={[styles.ssBadge, { backgroundColor: theme.primary + '22' }]}><Link2 size={10} color={theme.primary} /><Text style={[styles.ssText, { color: theme.primary }]}>{b.superset_group}</Text></View> : null}
                    <Text style={[styles.blockName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={1}>{b.exercise_name}</Text>
                  </View>
                  <Text style={[styles.blockMeta, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>
                    {b.sets}×{b.reps}{b.target_weight_kg ? ` · ${b.target_weight_kg}kg` : ''}{b.rest_time ? ` · ${b.rest_time}` : ''}{b.section && b.section !== 'main' ? ` · ${b.section === 'warmup' ? 'calent.' : 'enfri.'}` : ''}
                  </Text>
                </TouchableOpacity>
              </View>
            </ScaleDecorator>
          )}
          ListFooterComponent={
            <TouchableOpacity onPress={() => searchRef.current?.present()} activeOpacity={0.8}
              style={[styles.addBtn, { borderColor: theme.border, backgroundColor: theme.card }]}>
              <Plus size={18} color={theme.primary} />
              <Text style={[styles.addText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>Agregar ejercicio a {currentDay.name}</Text>
            </TouchableOpacity>
          }
        />
      </KeyboardAvoidingView>

      <ExerciseSearchSheet ref={searchRef} onSelect={(block) => addExercise(activeDayId, { ...block, dayId: activeDayId })} />
      <BlockEditorSheet ref={editorRef} block={editingBlock} onChange={updateBlock} onRemove={(uid) => { removeBlock(activeDayId, uid); editorRef.current?.dismiss() }}
        onSetSection={setBlockSection.bind(null, activeDayId)} onToggleOverride={toggleBlockOverride} onToggleSuperset={(uid) => toggleSuperset(activeDayId, uid)} onClose={() => setEditingUid(null)} />

      {/* Copy day modal */}
      {copyOpen ? (
        <View style={styles.modalWrap}>
          <Pressable style={styles.modalBackdrop} onPress={() => setCopyOpen(false)} />
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Copiar {currentDay.name} a…</Text>
            {days.filter((d) => d.id !== currentDay.id).map((d) => (
              <TouchableOpacity key={d.id} onPress={() => { copyDay(currentDay.id, [d.id]); setCopyOpen(false) }} activeOpacity={0.8} style={styles.modalRow}>
                <Text style={[styles.modalRowText, { color: theme.foreground, fontFamily: theme.fontSans }]}>{d.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ) : null}
    </SafeAreaView>
  )
}

function SmallSeg({ theme, label, options, value, onChange }: { theme: any; label: string; options: { v: string; l: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[styles.metaLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
      <View style={[styles.seg, { backgroundColor: theme.secondary, borderColor: theme.border }]}>
        {options.map((o) => {
          const active = o.v === value
          return (
            <TouchableOpacity key={o.v} onPress={() => onChange(o.v)} activeOpacity={0.8} style={[styles.segItem, active && { backgroundColor: theme.primary }]}>
              <Text style={{ fontSize: 11, fontFamily: 'Inter_600SemiBold', color: active ? theme.primaryForeground : theme.mutedForeground }}>{o.l}</Text>
            </TouchableOpacity>
          )
        })}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  topBtn: { minWidth: 64 }, topBtnText: { fontSize: 15 },
  undoRow: { flexDirection: 'row', gap: 18 },
  scroll: { padding: 16, gap: 14, paddingBottom: 60 },
  subTitle: { fontSize: 13 },
  nameInput: { height: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
  metaRow: { flexDirection: 'row', gap: 10 },
  metaLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  weeksInput: { height: 38, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 14 },
  abRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  abLabel: { fontSize: 13, flexShrink: 1 },
  switch: { width: 46, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  knob: { width: 22, height: 22, borderRadius: 11 },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, padding: 3, gap: 3 },
  segItem: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  dayRow: { gap: 8, paddingVertical: 2 },
  dayChip: { minWidth: 52, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 12, borderWidth: 1, alignItems: 'center', gap: 3 },
  dayChipText: { fontSize: 13 },
  dot: { width: 5, height: 5, borderRadius: 3 },
  dayHeader: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dayTitleInput: { flex: 1, height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 14 },
  restBtn: { width: 44, height: 44, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  blockCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderRadius: 12 },
  blockTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ssBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6 },
  ssText: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  blockName: { fontSize: 14, flexShrink: 1 },
  blockMeta: { fontSize: 12 },
  reorder: { gap: 2 },
  addBtn: { height: 48, borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },
  addText: { fontSize: 14 },
  modalWrap: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 60 },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalCard: { width: '82%', borderWidth: 1, borderRadius: 16, padding: 14, gap: 4 },
  modalTitle: { fontSize: 16, marginBottom: 6 },
  modalRow: { paddingVertical: 12, paddingHorizontal: 8 },
  modalRowText: { fontSize: 15 },
})
