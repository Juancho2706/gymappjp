import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { BottomSheetModal } from '@gorhom/bottom-sheet'
import { ChevronLeft, ChevronRight, Copy, Eye, Layers, Moon, MoreVertical, Plus, Printer, Redo2, Scale, Settings, Sparkles, Undo2, Users, X } from 'lucide-react-native'
import DraggableFlatList from 'react-native-draggable-flatlist'
import { MotiView } from 'moti'
import * as Haptics from 'expo-haptics'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../../lib/supabase'
import { isMissingColumnError, selectWithFallback } from '../../lib/db-compat'
import { getCoachProfile } from '../../lib/coach'
import { useTheme } from '../../context/ThemeContext'
import { ExerciseSearchSheet } from '../../components/coach/ExerciseSearchSheet'
import { BlockEditorSheet } from '../../components/coach/BlockEditorSheet'
import { TemplatePickerSheet } from '../../components/coach/TemplatePickerSheet'
import { AssignClientsSheet } from '../../components/coach/AssignClientsSheet'
import { MuscleBalanceSheet } from '../../components/coach/MuscleBalanceSheet'
import { ProgramPreviewSheet } from '../../components/coach/ProgramPreviewSheet'
import { BuilderBlockCard } from '../../components/coach/BuilderBlockCard'
import { ProgramConfigSheet } from '../../components/coach/ProgramConfigSheet'
import { ProgramPhasesBar } from '../../components/coach/ProgramPhasesBar'
import { getMuscleColor } from '../../lib/muscle-colors'
import { exportProgramPdf } from '../../lib/program-pdf'
import { EvaLoaderScreen } from '../../components/EvaLoader'
import { usePlanBuilder } from '../../lib/plan-builder/reducer'
import { buildDaySkeleton } from '../../lib/plan-builder/skeleton'
import type { BuilderBlock, BuilderSection, DayState, DurationType, ProgramStructureType } from '../../lib/plan-builder/types'

const DAY_SHORT = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const SECTION_ORDER: BuilderSection[] = ['warmup', 'main', 'cooldown']
const SECTION_LABEL: Record<BuilderSection, string> = { warmup: 'Calentamiento', main: 'Principal', cooldown: 'Enfriamiento' }

// Item de la lista del día: encabezado de sección o bloque (ejercicio).
type BuilderRow =
  | { type: 'header'; section: BuilderSection; count: number }
  | { type: 'block'; block: BuilderBlock; section: BuilderSection }

// Una superserie no puede cruzar secciones → limpiar grupos que quedaron repartidos.
function clearCrossSectionSupersets(blocks: BuilderBlock[]): BuilderBlock[] {
  const groups = new Map<string, Set<BuilderSection>>()
  for (const b of blocks) {
    if (!b.superset_group) continue
    const secs = groups.get(b.superset_group) ?? new Set<BuilderSection>()
    secs.add(b.section ?? 'main')
    groups.set(b.superset_group, secs)
  }
  const bad = new Set([...groups].filter(([, secs]) => secs.size > 1).map(([g]) => g))
  if (!bad.size) return blocks
  return blocks.map((b) => (b.superset_group && bad.has(b.superset_group) ? { ...b, superset_group: null } : b))
}

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

// Columnas base (las que la prod standalone seguro tiene).
const PROGRAM_SELECT =
  'id, name, program_structure_type, duration_type, weeks_to_repeat, cycle_length, ab_mode, workout_plans ( id, title, day_of_week, week_variant, workout_blocks ( id, exercise_id, order_index, sets, reps, rir, rest_time, notes, target_weight_kg, tempo, superset_group, progression_type, progression_value, section, is_override, exercises ( name, muscle_group, gif_url, video_url ) ) )'
// Rico = base + meta extra (notas/fecha/phases). Si la columna falta, selectWithFallback usa el base.
const PROGRAM_SELECT_RICH = PROGRAM_SELECT.replace(
  'ab_mode,',
  'ab_mode, duration_days, program_notes, start_date, start_date_flexible, program_phases,'
)

type ProgramPhase = { name: string; weeks: number; color: string }

type ProgramMetaPayload = {
  name: string
  program_structure_type: ProgramStructureType
  duration_type: DurationType
  weeks_to_repeat: number
  cycle_length: number | null
  ab_mode: boolean
  is_active: boolean
  duration_days?: number | null
  program_notes?: string | null
  start_date?: string | null
  start_date_flexible?: boolean
  program_phases?: unknown
}

function blockInsert(b: BuilderBlock, i: number, planId: string) {
  return {
    plan_id: planId,
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
  }
}

// Quita las columnas de meta extra (para prod que aún no las tiene).
function baseMeta(m: ProgramMetaPayload): ProgramMetaPayload {
  const { program_notes, start_date, start_date_flexible, program_phases, duration_days, ...rest } = m
  void program_notes; void start_date; void start_date_flexible; void program_phases; void duration_days
  return rest as ProgramMetaPayload
}

// Crea/actualiza un programa + sus plans/blocks. Reusado por guardar y por asignar
// a alumnos (programId null → crea uno nuevo por alumno). Resiliente: si faltan
// columnas meta extra en la BD, reintenta con el set base.
async function persistProgram(opts: {
  coachId: string
  clientId: string | null
  programId: string | null
  meta: ProgramMetaPayload
  variantSets: { variant: 'A' | 'B'; days: DayState[] }[]
}): Promise<string> {
  let pid = opts.programId
  if (pid) {
    const upd = await supabase.from('workout_programs').update(opts.meta).eq('id', pid)
    if (upd.error && isMissingColumnError(upd.error)) {
      await supabase.from('workout_programs').update(baseMeta(opts.meta)).eq('id', pid)
    }
  } else {
    let ins = await supabase
      .from('workout_programs')
      .insert({ client_id: opts.clientId, coach_id: opts.coachId, ...opts.meta })
      .select('id')
      .single()
    if (ins.error && isMissingColumnError(ins.error)) {
      ins = await supabase
        .from('workout_programs')
        .insert({ client_id: opts.clientId, coach_id: opts.coachId, ...baseMeta(opts.meta) })
        .select('id')
        .single()
    }
    if (ins.error) throw ins.error
    pid = (ins.data as { id: string }).id
  }
  const { data: oldPlans } = await supabase.from('workout_plans').select('id').eq('program_id', pid)
  const oldIds = (oldPlans ?? []).map((p) => (p as { id: string }).id)
  if (oldIds.length) {
    await supabase.from('workout_blocks').delete().in('plan_id', oldIds)
    await supabase.from('workout_plans').delete().in('id', oldIds)
  }
  for (const set of opts.variantSets) {
    for (const day of set.days) {
      if (day.blocks.length === 0) continue
      const { data: plan, error: planErr } = await supabase
        .from('workout_plans')
        .insert({ program_id: pid, client_id: opts.clientId, coach_id: opts.coachId, title: day.title || day.name, day_of_week: day.id, week_variant: set.variant })
        .select('id')
        .single()
      if (planErr) throw planErr
      const inserts = day.blocks.map((b, i) => blockInsert(b, i, (plan as { id: string }).id))
      const { error: blkErr } = await supabase.from('workout_blocks').insert(inserts)
      if (blkErr) throw blkErr
    }
  }
  return pid as string
}

export default function ProgramBuilderScreen() {
  const { clientId, clientName, templateId, mode } = useLocalSearchParams<{ clientId?: string; clientName?: string; templateId?: string; mode?: string }>()
  // Template mode = build/edit a reusable program with client_id null (no client).
  const isTemplate = mode === 'template' || !!templateId
  const { theme } = useTheme()
  const router = useRouter()
  const searchRef = useRef<BottomSheetModal>(null)
  const editorRef = useRef<BottomSheetModal>(null)
  const templateRef = useRef<BottomSheetModal>(null)
  const assignRef = useRef<BottomSheetModal>(null)
  const balanceRef = useRef<BottomSheetModal>(null)
  const previewRef = useRef<BottomSheetModal>(null)
  const configRef = useRef<BottomSheetModal>(null)

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
  // Meta extra (paridad web): notas, fecha de inicio flexible y fases.
  const [programNotes, setProgramNotes] = useState('')
  const [startDate, setStartDate] = useState('')
  const [startDateFlexible, setStartDateFlexible] = useState(true)
  const [phases, setPhases] = useState<ProgramPhase[]>([])
  // Offline-first: autosave local del borrador + restaurar (ventaja nativa vs web).
  const [pendingDraft, setPendingDraft] = useState<any | null>(null)
  const hydratedRef = useRef(false)
  const draftKey = `builder_draft_${templateId ?? clientId ?? 'new'}`
  // Modo Simple/Normal (1:1 web). Default Normal. Persistido.
  const [isSimpleMode, setIsSimpleMode] = useState(false)
  const [modeLabel, setModeLabel] = useState<string | null>(null)
  const [showHint, setShowHint] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const simpleHydrated = useRef(false)
  const slideDir = useRef(0)

  const [activeDayId, setActiveDayId] = useState(1)
  const [editingUid, setEditingUid] = useState<string | null>(null)
  const [copyOpen, setCopyOpen] = useState(false)
  const [durationDays, setDurationDays] = useState<number | null>(null) // para duración async / días corridos
  const [pendingSection, setPendingSection] = useState<BuilderSection>('main') // sección destino al agregar ejercicio

  const builder = usePlanBuilder(initial)
  const { days, addExercise, removeBlock, updateBlock, setDayBlocks, transferBlock, updateDayTitle, toggleRestDay, copyDay, toggleSuperset, setBlockSection, toggleBlockOverride, undo, redo, canUndo, canRedo, setDays } = builder

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
      // New template (no templateId) → start blank.
      if (isTemplate && !templateId) {
        setName('Nueva plantilla')
        const dRaw = await AsyncStorage.getItem(draftKey).catch(() => null)
        if (dRaw) { try { setPendingDraft(JSON.parse(dRaw)) } catch {} }
        reshapeReady.current = true; hydratedRef.current = true; setLoading(false); return
      }

      // Carga rica (con meta extra) → si faltan columnas, fallback al set base.
      const { data: prog } = await selectWithFallback<any>(
        () => {
          const q = supabase.from('workout_programs').select(PROGRAM_SELECT_RICH)
          return templateId ? q.eq('id', templateId).maybeSingle() : q.eq('client_id', clientId!).eq('is_active', true).maybeSingle()
        },
        () => {
          const q = supabase.from('workout_programs').select(PROGRAM_SELECT)
          return templateId ? q.eq('id', templateId).maybeSingle() : q.eq('client_id', clientId!).eq('is_active', true).maybeSingle()
        }
      )

      if (prog) {
        const structure = (prog.program_structure_type as ProgramStructureType) ?? 'weekly'
        const plans = (prog.workout_plans ?? []) as any[]
        const len = structure === 'cycle' ? Math.max(1, Math.min(7, prog.cycle_length ?? 4)) : 7
        const hasB = plans.some((p: any) => (p.week_variant ?? 'A') === 'B')
        setProgramId(prog.id)
        setName(prog.name ?? 'Programa principal')
        setStructureType(structure)
        setDurationType((prog.duration_type as DurationType) ?? 'weeks')
        setWeeks(prog.weeks_to_repeat ?? 4)
        setCycleLength(len)
        setAbMode(Boolean(prog.ab_mode) || hasB)
        setProgramNotes(prog.program_notes ?? '')
        setStartDate(prog.start_date ?? '')
    setDurationDays(prog.duration_days ?? null)
        setStartDateFlexible(prog.start_date_flexible ?? true)
        setPhases(Array.isArray(prog.program_phases) ? (prog.program_phases as ProgramPhase[]) : [])
        const a = variantDays(plans, 'A', structure, len)
        setInitial(a)
        setDays(a)
        setOtherDays(variantDays(plans, 'B', structure, len))
      }
      const draftRaw = await AsyncStorage.getItem(draftKey).catch(() => null)
      if (draftRaw) { try { setPendingDraft(JSON.parse(draftRaw)) } catch {} }
      hydratedRef.current = true
      reshapeReady.current = true
      setLoading(false)
    })()
  }, [clientId, templateId])

  // Autosave del borrador (debounce). Pausado mientras se ofrece restaurar uno previo.
  useEffect(() => {
    if (!hydratedRef.current || pendingDraft) return
    const t = setTimeout(() => {
      const draft = { name, structureType, durationType, weeks, cycleLength, abMode, variant, days, otherDays, programNotes, startDate, startDateFlexible, phases, savedAt: Date.now() }
      AsyncStorage.setItem(draftKey, JSON.stringify(draft)).catch(() => {})
    }, 1500)
    return () => clearTimeout(t)
  }, [name, structureType, durationType, weeks, cycleLength, abMode, variant, days, otherDays, programNotes, startDate, startDateFlexible, phases, pendingDraft, draftKey])

  // Modo Simple: cargar persistido + guardar al cambiar.
  useEffect(() => {
    AsyncStorage.getItem('builder:simpleMode')
      .then((v) => { if (v === '1') setIsSimpleMode(true) })
      .catch(() => {})
      .finally(() => { simpleHydrated.current = true })
  }, [])
  useEffect(() => {
    if (!simpleHydrated.current) return
    AsyncStorage.setItem('builder:simpleMode', isSimpleMode ? '1' : '0').catch(() => {})
  }, [isSimpleMode])

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
  const dayTotalSets = (currentDay?.blocks ?? []).reduce((s, b) => s + (b.sets ?? 0), 0)
  const dayMuscles = Array.from(new Set((currentDay?.blocks ?? []).map((b) => b.muscle_group).filter(Boolean))) as string[]
  const editingBlock = useMemo(() => days.flatMap((d) => d.blocks).find((b) => b.uid === editingUid) ?? null, [days, editingUid])

  function openEditor(uid: string) { setEditingUid(uid); editorRef.current?.present() }

  // Lista del día agrupada por sección (encabezado + bloques) para el DraggableFlatList.
  const listItems = useMemo<BuilderRow[]>(() => {
    const blocks = currentDay?.blocks ?? []
    const rows: BuilderRow[] = []
    for (const section of SECTION_ORDER) {
      const inSec = blocks.filter((b) => (b.section ?? 'main') === section)
      rows.push({ type: 'header', section, count: inSec.length })
      for (const b of inSec) rows.push({ type: 'block', block: b, section })
    }
    return rows
  }, [currentDay])

  // Al soltar: reconstruir bloques desde el orden plano + reasignar sección según el header anterior.
  function handleDragEnd(data: BuilderRow[]) {
    let cur: BuilderSection = 'warmup'
    let changed = false
    const rebuilt: BuilderBlock[] = []
    for (const row of data) {
      if (row.type === 'header') { cur = row.section; continue }
      const orig = row.block.section ?? 'main'
      if (orig !== cur) changed = true
      rebuilt.push(orig === cur ? row.block : { ...row.block, section: cur })
    }
    setDayBlocks(currentDay.id, clearCrossSectionSupersets(rebuilt))
    Haptics.impactAsync(changed ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {})
  }

  function addToSection(section: BuilderSection) {
    setPendingSection(section)
    searchRef.current?.present()
  }

  function pokeHint() {
    setShowHint(true)
    setTimeout(() => setShowHint(false), 2500)
  }
  function toggleSimpleMode() {
    const next = !isSimpleMode
    setModeLabel(next ? 'Modo Simple' : 'Modo Normal')
    Haptics.selectionAsync().catch(() => {})
    setTimeout(() => { setIsSimpleMode(next); if (next) pokeHint() }, 200)
    setTimeout(() => setModeLabel(null), 1600)
  }

  // Swipe horizontal para cambiar de día (ventaja nativa sobre los chips de la web).
  function changeDay(dir: 1 | -1) {
    const idx = days.findIndex((d) => d.id === activeDayId)
    const next = days[idx + dir]
    if (!next) return
    slideDir.current = dir
    setActiveDayId(next.id)
    Haptics.selectionAsync().catch(() => {})
    if (isSimpleMode) pokeHint()
  }
  const dayGesture = useMemo(
    () =>
      Gesture.Race(
        Gesture.Fling().direction(Directions.LEFT).runOnJS(true).onEnd(() => changeDay(1)),
        Gesture.Fling().direction(Directions.RIGHT).runOnJS(true).onEnd(() => changeDay(-1))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [days, activeDayId, isSimpleMode]
  )

  function buildMeta(isActive: boolean): ProgramMetaPayload {
    return {
      name: name.trim(),
      program_structure_type: structureType,
      duration_type: durationType,
      weeks_to_repeat: weeks,
      cycle_length: structureType === 'cycle' ? cycleLength : null,
      ab_mode: abMode,
      is_active: isActive,
      program_notes: programNotes.trim() || null,
      start_date: startDateFlexible ? null : (startDate.trim() || null),
      start_date_flexible: startDateFlexible,
      duration_days: durationType === 'weeks' ? null : durationDays,
      program_phases: phases.length ? phases : null,
    }
  }
  function currentVariantSets(): { variant: 'A' | 'B'; days: DayState[] }[] {
    return abMode
      ? [{ variant, days }, { variant: variant === 'A' ? 'B' : 'A', days: otherDays }]
      : [{ variant: 'A', days }]
  }

  async function assignToClients(clientIds: string[]) {
    if (!name.trim()) { Alert.alert('Nombre requerido', 'Ingresa un nombre antes de asignar.'); return }
    setSaving(true)
    try {
      const coach = await getCoachProfile()
      if (!coach) throw new Error('Coach no encontrado')
      for (const cid of clientIds) {
        await persistProgram({ coachId: coach.id, clientId: cid, programId: null, meta: buildMeta(true), variantSets: currentVariantSets() })
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      Alert.alert('Listo', `Programa asignado a ${clientIds.length} alumno${clientIds.length === 1 ? '' : 's'}.`)
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo asignar.')
    } finally {
      setSaving(false)
    }
  }

  async function handlePrint() {
    setMenuOpen(false)
    try {
      const coach = await getCoachProfile()
      const sets = currentVariantSets()
      const aDays = sets.find((s) => s.variant === 'A')?.days ?? days
      const bDays = sets.find((s) => s.variant === 'B')?.days
      await exportProgramPdf({ programName: name || 'Programa', clientName, coachName: coach?.fullName ?? coach?.brandName ?? null, weeksToRepeat: weeks, days: aDays, daysB: abMode ? bDays : undefined, isABMode: abMode })
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'No se pudo generar el PDF.')
    }
  }

  async function loadTemplate(id: string) {
    const { data: raw } = await selectWithFallback<any>(
      () => supabase.from('workout_programs').select(PROGRAM_SELECT_RICH).eq('id', id).maybeSingle(),
      () => supabase.from('workout_programs').select(PROGRAM_SELECT).eq('id', id).maybeSingle()
    )
    const prog = raw as any
    if (!prog) return
    const structure = (prog.program_structure_type as ProgramStructureType) ?? 'weekly'
    const plans = (prog.workout_plans ?? []) as any[]
    const len = structure === 'cycle' ? Math.max(1, Math.min(7, prog.cycle_length ?? 4)) : 7
    const hasB = plans.some((p: any) => (p.week_variant ?? 'A') === 'B')
    setName(prog.name ?? name)
    setStructureType(structure)
    setDurationType((prog.duration_type as DurationType) ?? 'weeks')
    setWeeks(prog.weeks_to_repeat ?? 4)
    setCycleLength(len)
    setAbMode(Boolean(prog.ab_mode) || hasB)
    setProgramNotes(prog.program_notes ?? '')
    setStartDate(prog.start_date ?? '')
    setDurationDays(prog.duration_days ?? null)
    setStartDateFlexible(prog.start_date_flexible ?? true)
    setPhases(Array.isArray(prog.program_phases) ? (prog.program_phases as ProgramPhase[]) : [])
    reshapeReady.current = true
    setDays(variantDays(plans, 'A', structure, len))
    setOtherDays(variantDays(plans, 'B', structure, len))
    setActiveDayId(1)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
  }

  function recoverDraft() {
    const d = pendingDraft
    if (!d) return
    reshapeReady.current = true
    setName(d.name ?? name)
    setStructureType(d.structureType ?? 'weekly')
    setDurationType(d.durationType ?? 'weeks')
    setWeeks(d.weeks ?? 4)
    setCycleLength(d.cycleLength ?? 4)
    setAbMode(!!d.abMode)
    setVariant(d.variant ?? 'A')
    setProgramNotes(d.programNotes ?? '')
    setStartDate(d.startDate ?? '')
    setStartDateFlexible(d.startDateFlexible ?? true)
    setPhases(Array.isArray(d.phases) ? d.phases : [])
    setOtherDays(Array.isArray(d.otherDays) ? d.otherDays : emptyDays())
    setDays(Array.isArray(d.days) ? d.days : emptyDays())
    setActiveDayId(1)
    setPendingDraft(null)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
  }
  function discardDraft() {
    AsyncStorage.removeItem(draftKey).catch(() => {})
    setPendingDraft(null)
  }

  async function handleSave() {
    if (!name.trim()) { Alert.alert('Nombre requerido', 'Ingresa un nombre para el programa.'); return }
    const hasAny = days.some((d) => d.blocks.length > 0) || (abMode && otherDays.some((d) => d.blocks.length > 0))
    if (!hasAny) { Alert.alert('Sin ejercicios', 'Agrega al menos un ejercicio en algún día.'); return }
    setSaving(true)
    try {
      const coach = await getCoachProfile()
      if (!coach) throw new Error('Coach no encontrado')
      const pid = await persistProgram({
        coachId: coach.id,
        clientId: isTemplate ? null : (clientId ?? null),
        programId,
        meta: buildMeta(isTemplate ? false : true),
        variantSets: currentVariantSets(),
      })
      setProgramId(pid)
      AsyncStorage.removeItem(draftKey).catch(() => {})
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
          <TouchableOpacity onPress={() => setMenuOpen(true)} hitSlop={8}><MoreVertical size={20} color={theme.foreground} /></TouchableOpacity>
          <TouchableOpacity onPress={() => configRef.current?.present()} hitSlop={8} style={[styles.gearBtn, { borderColor: '#F59E0B66' }]}><Settings size={18} color="#F59E0B" /></TouchableOpacity>
        </View>
        <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.topBtn}>
          {saving ? <ActivityIndicator size="small" color={theme.primary} /> : <Text style={[styles.topBtnText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>Guardar</Text>}
        </TouchableOpacity>
      </View>

      {pendingDraft ? (
        <View style={[styles.draftBanner, { borderColor: theme.border, backgroundColor: theme.card }]}>
          <Text style={[styles.draftText, { color: theme.foreground, fontFamily: theme.fontSans }]} numberOfLines={2}>Hay un borrador sin guardar de este programa.</Text>
          <View style={styles.draftActions}>
            <TouchableOpacity onPress={discardDraft} hitSlop={6}>
              <Text style={[styles.draftDiscard, { color: theme.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>Descartar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={recoverDraft} activeOpacity={0.85} style={[styles.draftBtn, { backgroundColor: theme.primary }]}>
              <Text style={[styles.draftBtnText, { color: theme.primaryForeground, fontFamily: 'Montserrat_700Bold' }]}>Recuperar</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <GestureDetector gesture={dayGesture}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <MotiView
          key={isSimpleMode ? `d-${activeDayId}` : 'list'}
          from={isSimpleMode ? { opacity: 0, translateX: slideDir.current * 36 } : { opacity: 1, translateX: 0 }}
          animate={{ opacity: 1, translateX: 0 }}
          transition={{ type: 'timing', duration: 220 }}
          style={{ flex: 1 }}
        >
        <DraggableFlatList
          data={listItems}
          keyExtractor={(item) => (item.type === 'header' ? `h-${item.section}` : item.block.uid)}
          onDragBegin={() => Haptics.selectionAsync().catch(() => {})}
          onDragEnd={({ data }) => handleDragEnd(data)}
          activationDistance={14}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={{ gap: 14, paddingBottom: 14 }}>
              {!isSimpleMode ? (<>
              {clientName ? <Text style={[styles.subTitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Programa de {clientName}</Text> : null}
              <TextInput value={name} onChangeText={setName} placeholder="Nombre del programa" placeholderTextColor={theme.mutedForeground}
                style={[styles.nameInput, { borderColor: theme.border, backgroundColor: theme.card, color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]} />

              {!isSimpleMode && phases.length ? <ProgramPhasesBar phases={phases} weeks={weeks} /> : null}

              </>) : null}

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

              {!isSimpleMode && !currentDay.is_rest ? (
                <View style={styles.volRow}>
                  <View style={[styles.volChip, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
                    <Text style={[styles.volLbl, { color: theme.mutedForeground }]}>EJ.</Text>
                    <Text style={[styles.volVal, { color: theme.foreground }]}>{currentDay.blocks.length}</Text>
                  </View>
                  <View style={[styles.volChip, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
                    <Text style={[styles.volLbl, { color: theme.mutedForeground }]}>SERIES</Text>
                    <Text style={[styles.volVal, { color: theme.foreground }]}>{dayTotalSets}</Text>
                  </View>
                  <View style={styles.volDots}>
                    {dayMuscles.map((m) => <View key={m} style={[styles.muscleDot, { backgroundColor: getMuscleColor(m) }]} />)}
                  </View>
                </View>
              ) : null}

              {currentDay.is_rest ? (
                <View style={[styles.restBanner, { borderColor: '#6366F133', backgroundColor: '#6366F114' }]}>
                  <Moon size={16} color="#818CF8" />
                  <Text style={[styles.restBannerText, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>DÍA DE DESCANSO</Text>
                </View>
              ) : null}
            </View>
          }
          renderItem={({ item, drag, isActive }) => {
            if (item.type === 'header') {
              const secColor = item.section === 'warmup' ? '#F59E0B' : item.section === 'cooldown' ? '#38BDF8' : theme.primary
              return (
                <View style={[styles.sectionHeader, { borderColor: secColor + '55', backgroundColor: secColor + '12' }]}>
                  <View style={[styles.sectionDot, { backgroundColor: secColor }]} />
                  <Text style={[styles.sectionTitle, { color: secColor, fontFamily: 'Montserrat_700Bold' }]}>{SECTION_LABEL[item.section].toUpperCase()}</Text>
                  <View style={[styles.sectionCount, { borderColor: secColor + '55' }]}>
                    <Text style={[styles.sectionCountText, { color: secColor, fontFamily: theme.fontSans }]}>{item.count}</Text>
                  </View>
                  <TouchableOpacity onPress={() => addToSection(item.section)} hitSlop={8} activeOpacity={0.8} style={[styles.sectionAdd, { borderColor: secColor + '55' }]}>
                    <Plus size={14} color={secColor} />
                  </TouchableOpacity>
                </View>
              )
            }
            return (
              <BuilderBlockCard
                block={item.block}
                drag={drag}
                isActive={isActive}
                onEdit={openEditor}
                onRemove={(uid) => removeBlock(activeDayId, uid)}
                onUpdate={updateBlock}
                onSetSection={(uid, s) => setBlockSection(activeDayId, uid, s)}
                onToggleSuperset={(uid) => toggleSuperset(activeDayId, uid)}
              />
            )
          }}
          ListFooterComponent={
            <TouchableOpacity onPress={() => addToSection('main')} activeOpacity={0.8}
              style={[styles.addBtn, { borderColor: theme.border, backgroundColor: theme.card }]}>
              <Plus size={18} color={theme.primary} />
              <Text style={[styles.addText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>Agregar ejercicio a {currentDay.name}</Text>
            </TouchableOpacity>
          }
        />
        </MotiView>
      </KeyboardAvoidingView>
      </GestureDetector>

      <ExerciseSearchSheet ref={searchRef} onSelect={(block) => { addExercise(activeDayId, { ...block, dayId: activeDayId, section: pendingSection }); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}) }} />
      <BlockEditorSheet ref={editorRef} block={editingBlock} onChange={updateBlock} onRemove={(uid) => { removeBlock(activeDayId, uid); editorRef.current?.dismiss() }}
        onSetSection={setBlockSection.bind(null, activeDayId)} onToggleOverride={toggleBlockOverride} onToggleSuperset={(uid) => toggleSuperset(activeDayId, uid)} onClose={() => setEditingUid(null)}
        days={days.map((d) => ({ id: d.id, name: d.name }))} currentDayId={activeDayId} clientId={isTemplate ? undefined : clientId}
        onMoveToDay={(uid, target) => { transferBlock(uid, activeDayId, target); setActiveDayId(target); editorRef.current?.dismiss(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}) }} />

      <TemplatePickerSheet ref={templateRef} onSelect={loadTemplate} />
      <AssignClientsSheet ref={assignRef} onAssign={(ids) => { assignRef.current?.dismiss(); assignToClients(ids) }} saving={saving} />
      <MuscleBalanceSheet ref={balanceRef} days={days} />
      <ProgramPreviewSheet ref={previewRef} days={days} name={name} />
      <ProgramConfigSheet ref={configRef}
        name={name} setName={setName}
        structureType={structureType} setStructureType={setStructureType}
        cycleLength={cycleLength} setCycleLength={setCycleLength}
        durationType={durationType} setDurationType={setDurationType}
        weeks={weeks} setWeeks={setWeeks}
        durationDays={durationDays} setDurationDays={setDurationDays}
        abMode={abMode} onToggleAb={toggleAb}
        variant={variant} onSwitchVariant={switchVariant}
        startDateFlexible={startDateFlexible} setStartDateFlexible={setStartDateFlexible}
        startDate={startDate} setStartDate={setStartDate}
        programNotes={programNotes} setProgramNotes={setProgramNotes}
        phases={phases} setPhases={setPhases}
        onClose={() => {}}
      />

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

      {/* Menú ⋮ de acciones secundarias (1:1 web móvil) */}
      <Modal visible={menuOpen} transparent animationType="fade" onRequestClose={() => setMenuOpen(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)}>
          <View style={[styles.menuCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {[
              { icon: Eye, label: 'Vista previa', on: () => { setMenuOpen(false); previewRef.current?.present() } },
              { icon: Scale, label: 'Balance muscular', on: () => { setMenuOpen(false); balanceRef.current?.present() } },
              { icon: Layers, label: 'Cargar plantilla', on: () => { setMenuOpen(false); templateRef.current?.present() } },
              { icon: Users, label: 'Asignar a alumnos', on: () => { setMenuOpen(false); assignRef.current?.present() } },
              { icon: Printer, label: 'Imprimir / PDF', on: handlePrint },
            ].map((it) => {
              const Icon = it.icon
              return (
                <TouchableOpacity key={it.label} onPress={it.on} activeOpacity={0.8} style={styles.menuItem}>
                  <Icon size={17} color={theme.foreground} />
                  <Text style={[styles.menuItemText, { color: theme.foreground, fontFamily: 'Inter_600SemiBold' }]}>{it.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </Pressable>
      </Modal>

      {/* FAB "+" verde (solo en Simple) */}
      {isSimpleMode ? (
        <TouchableOpacity onPress={() => addToSection('main')} activeOpacity={0.85} style={styles.fabAdd}>
          <Plus size={26} color="#fff" strokeWidth={3} />
        </TouchableOpacity>
      ) : null}

      {/* Toggle Modo Simple/Normal (Sparkles) */}
      <TouchableOpacity onPress={toggleSimpleMode} activeOpacity={0.85}
        style={[styles.fabMode, { backgroundColor: isSimpleMode ? theme.card : theme.primary, borderColor: theme.border, borderWidth: isSimpleMode ? 1 : 0 }]}>
        <Sparkles size={20} color={isSimpleMode ? theme.mutedForeground : theme.primaryForeground} />
      </TouchableOpacity>

      {/* Label de transición */}
      {modeLabel ? (
        <View pointerEvents="none" style={styles.modeLabelWrap}>
          <View style={[styles.modeLabel, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Sparkles size={14} color={theme.primary} />
            <Text style={[styles.modeLabelText, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{modeLabel}</Text>
          </View>
        </View>
      ) : null}

      {/* Flechas hint de swipe (solo Simple) */}
      {isSimpleMode && showHint ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={[styles.hint, styles.hintLeft]}><ChevronLeft size={30} color={theme.primary} /></View>
          <View style={[styles.hint, styles.hintRight]}><ChevronRight size={30} color={theme.primary} /></View>
        </View>
      ) : null}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  topBtn: { minWidth: 64 }, topBtnText: { fontSize: 15 },
  undoRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  gearBtn: { borderWidth: 1, borderRadius: 9, padding: 5 },
  menuBackdrop: { flex: 1, alignItems: 'flex-end', paddingTop: 64, paddingRight: 12 },
  menuCard: { width: 224, borderWidth: 1, borderRadius: 14, paddingVertical: 6, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  menuItemText: { fontSize: 14 },
  draftBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  draftText: { flex: 1, fontSize: 12.5, lineHeight: 17 },
  draftActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  draftDiscard: { fontSize: 13 },
  draftBtn: { borderRadius: 9, paddingHorizontal: 14, paddingVertical: 8 },
  draftBtnText: { fontSize: 13 },
  scroll: { padding: 16, gap: 14, paddingBottom: 60 },
  subTitle: { fontSize: 13 },
  nameInput: { height: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
  metaToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11 },
  metaToggleText: { fontSize: 14 },
  metaToggleHint: { fontSize: 12, marginLeft: 'auto' },
  metaRow: { flexDirection: 'row', gap: 10 },
  metaLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6 },
  weeksInput: { height: 38, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 14 },
  notesInput: { minHeight: 64, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingTop: 10, fontSize: 14, textAlignVertical: 'top' },
  phaseRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  phaseColor: { width: 22, height: 22, borderRadius: 11 },
  phaseName: { flex: 1, height: 38, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 14 },
  phaseWeeks: { width: 52, height: 38, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, fontSize: 14, textAlign: 'center' },
  phaseDel: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  phaseAdd: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, paddingVertical: 10, marginTop: 2 },
  phaseAddText: { fontSize: 13 },
  abRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  abLabel: { fontSize: 13, flexShrink: 1 },
  switch: { width: 46, height: 28, borderRadius: 14, padding: 3, justifyContent: 'center' },
  knob: { width: 22, height: 22, borderRadius: 11 },
  seg: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, padding: 3, gap: 3 },
  segItem: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionChip: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderWidth: 1, borderRadius: 11, paddingVertical: 11, paddingHorizontal: 8 },
  actionChipText: { fontSize: 12.5 },
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
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginTop: 14, marginBottom: 6 },
  volRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  volChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  volLbl: { fontSize: 9, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.6 },
  volVal: { fontSize: 12, fontFamily: 'Montserrat_700Bold' },
  volDots: { flexDirection: 'row', gap: 4, marginLeft: 2 },
  muscleDot: { width: 9, height: 9, borderRadius: 5 },
  restBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingVertical: 16 },
  restBannerText: { fontSize: 12, letterSpacing: 1 },
  sectionDot: { width: 7, height: 7, borderRadius: 4 },
  sectionTitle: { fontSize: 12, letterSpacing: 0.6 },
  sectionCount: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 },
  sectionCountText: { fontSize: 11 },
  sectionAdd: { marginLeft: 'auto', width: 30, height: 30, borderWidth: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  reorder: { gap: 2 },
  addBtn: { height: 48, borderWidth: 1, borderStyle: 'dashed', borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 4 },
  addText: { fontSize: 14 },
  blockCardCompact: { padding: 9 },
  fabMode: { position: 'absolute', right: 16, bottom: 28, width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 10, elevation: 6 },
  fabAdd: { position: 'absolute', right: 16, bottom: 86, width: 56, height: 56, borderRadius: 28, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center', shadowColor: '#10B981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 12, elevation: 8 },
  modeLabelWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  modeLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 11 },
  modeLabelText: { fontSize: 14 },
  hint: { position: 'absolute', top: '46%' },
  hintLeft: { left: 8 },
  hintRight: { right: 8 },
  modalWrap: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 60 },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  modalCard: { width: '82%', borderWidth: 1, borderRadius: 16, padding: 14, gap: 4 },
  modalTitle: { fontSize: 16, marginBottom: 6 },
  modalRow: { paddingVertical: 12, paddingHorizontal: 8 },
  modalRowText: { fontSize: 15 },
})
