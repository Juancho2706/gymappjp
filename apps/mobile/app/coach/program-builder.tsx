import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator, Alert, Dimensions, InteractionManager, KeyboardAvoidingView, Modal, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import { Image } from 'expo-image'
import { LinearGradient } from 'expo-linear-gradient'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Directions, Gesture, GestureDetector } from 'react-native-gesture-handler'
import { useLocalSearchParams, useRouter } from 'expo-router'
import BottomSheet, { BottomSheetModal } from '@gorhom/bottom-sheet'
import { ArrowLeft, ChevronLeft, ChevronRight, CircleHelp, Copy, Eye, Layers, Link2, Moon, MoreVertical, Plus, Printer, Redo2, Save, Scale, Settings, Sparkles, Sun, Undo2, Users, X } from 'lucide-react-native'
import DraggableFlatList from 'react-native-draggable-flatlist'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { MotiView } from 'moti'
import * as Haptics from 'expo-haptics'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../../lib/supabase'
import { isMissingColumnError, selectWithFallback } from '../../lib/db-compat'
import { getCoachProfile } from '../../lib/coach'
import { getCoachOrgContext } from '../../lib/org'
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
import { BuilderOnboardingTour, type TourStep } from '../../components/coach/BuilderOnboardingTour'
import { getMuscleColor } from '../../lib/muscle-colors'
import { listCoachExercises, type ExerciseRow } from '../../lib/exercises'
import { exportProgramPdf } from '../../lib/program-pdf'
import { EvaLoaderScreen } from '../../components/EvaLoader'
import { usePlanBuilder } from '../../lib/plan-builder/reducer'
import { buildDaySkeleton } from '../../lib/plan-builder/skeleton'
import type { BuilderBlock, BuilderSection, DayState, DurationType, ProgramStructureType } from '../../lib/plan-builder/types'

const DAY_SHORT = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const SLIDE = Math.round(Dimensions.get('window').width * 0.22) // desplazamiento del slide de día
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

// PostgREST puede devolver la FK `exercises` como objeto o como array de un elemento.
function embeddedExerciseRow(raw: any): { name?: string; muscle_group?: string; gif_url?: string; video_url?: string } | null {
  if (raw == null) return null
  if (Array.isArray(raw)) return raw[0] && typeof raw[0] === 'object' ? raw[0] : null
  return typeof raw === 'object' ? raw : null
}

function mapDbBlock(b: any): BuilderBlock {
  const ex = embeddedExerciseRow(b.exercises)
  return {
    uid: `block-${b.id ?? Math.random().toString(36).slice(2)}`,
    exercise_id: b.exercise_id,
    exercise_name: ex?.name ?? b.exercise_name ?? 'Ejercicio',
    muscle_group: ex?.muscle_group ?? 'General',
    gif_url: ex?.gif_url ?? undefined,
    video_url: ex?.video_url ?? undefined,
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
  orgId?: string | null
}): Promise<string> {
  let pid = opts.programId
  // P-F2: un alumno solo puede tener UN programa activo. Antes de activar este,
  // desactivar cualquier otro activo del mismo alumno (evita doble programa activo).
  async function deactivateOtherActive(exceptId: string | null) {
    if (!opts.clientId || !opts.meta.is_active) return
    let q = supabase.from('workout_programs').update({ is_active: false }).eq('client_id', opts.clientId).eq('is_active', true)
    if (exceptId) q = q.neq('id', exceptId)
    await q
  }
  if (pid) {
    await deactivateOtherActive(pid)
    const upd = await supabase.from('workout_programs').update(opts.meta).eq('id', pid)
    if (upd.error && isMissingColumnError(upd.error)) {
      await supabase.from('workout_programs').update(baseMeta(opts.meta)).eq('id', pid)
    }
  } else {
    await deactivateOtherActive(null)
    // P-F3: setear org_id en enterprise (antes el editor lo dejaba null). Fallback sin la columna.
    let ins = await supabase
      .from('workout_programs')
      .insert({ client_id: opts.clientId, coach_id: opts.coachId, ...(opts.orgId ? { org_id: opts.orgId } : {}), ...opts.meta })
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
  const searchRef = useRef<BottomSheet>(null)
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
  // Catálogo completo precargado (1:1 web): alimenta el sheet de añadir + enriquece media de bloques.
  const [catalog, setCatalog] = useState<ExerciseRow[]>([])
  const catById = useMemo(() => new Map(catalog.map((e) => [e.id, e])), [catalog])

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
  const [dirty, setDirty] = useState(false) // cambios sin guardar (badge top bar 1:1 web)
  const [configOpen, setConfigOpen] = useState(false) // para el ping ámbar de la tuerca
  // Tour de onboarding (F9)
  const [tourOpen, setTourOpen] = useState(false)
  const [tourMode, setTourMode] = useState<'short' | 'full'>('short')
  const [seenTour, setSeenTour] = useState(true)
  const tourTargets = useRef<Map<string, any>>(new Map())
  const rootRef = useRef<View>(null) // ancla de coordenadas para el tour (measureLayout)
  const autoTourTried = useRef(false)
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

  // Slide de día sin remontar la lista (Reanimated, UI thread).
  const listRef = useRef<any>(null)
  const dayTx = useSharedValue(0)
  const daySlideStyle = useAnimatedStyle(() => ({ transform: [{ translateX: dayTx.value }] }))
  useEffect(() => {
    dayTx.value = slideDir.current * SLIDE
    dayTx.value = withTiming(0, { duration: 170, easing: Easing.out(Easing.cubic) })
    listRef.current?.scrollToOffset?.({ offset: 0, animated: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDayId])

  // Refs para que el gesto de swipe sea estable (no se recree por cada edición).
  const activeDayIdRef = useRef(1)
  const simpleModeRef = useRef(false)
  useEffect(() => { activeDayIdRef.current = activeDayId })
  useEffect(() => { simpleModeRef.current = isSimpleMode })

  // Precarga del catálogo de ejercicios (una vez). Resiliente: si falla, queda vacío.
  useEffect(() => {
    listCoachExercises().then(({ exercises }) => setCatalog(exercises)).catch(() => {})
  }, [])

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

      // P-F4: scoping de org en la lectura (rich); si falta la columna, fallback sin filtro.
      const { orgId } = await getCoachOrgContext().catch(() => ({ orgId: null as string | null }))
      // Carga rica (con meta extra) → si faltan columnas, fallback al set base.
      const { data: prog } = await selectWithFallback<any>(
        () => {
          const q = supabase.from('workout_programs').select(PROGRAM_SELECT_RICH)
          if (templateId) return q.eq('id', templateId).maybeSingle()
          const cq = q.eq('client_id', clientId!).eq('is_active', true)
          return (orgId ? cq.eq('org_id', orgId) : cq.is('org_id', null)).maybeSingle()
        },
        () => {
          const q = supabase.from('workout_programs').select(PROGRAM_SELECT)
          return templateId ? q.eq('id', templateId).maybeSingle() : q.eq('client_id', clientId!).eq('is_active', true).maybeSingle()
        }
      )

      if (prog) {
        const structure = (prog.program_structure_type as ProgramStructureType) ?? 'weekly'
        const plans = (prog.workout_plans ?? []) as any[]
        // P-F8: ciclos de hasta 31 días (antes truncaba a 7 al abrir).
        const len = structure === 'cycle' ? Math.max(1, Math.min(31, prog.cycle_length ?? 4)) : 7
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
      // Serializar/persistir fuera del hilo de interacción para no competir con gestos.
      InteractionManager.runAfterInteractions(() => {
        const draft = { name, structureType, durationType, weeks, cycleLength, abMode, variant, days, otherDays, programNotes, startDate, startDateFlexible, phases, savedAt: Date.now() }
        AsyncStorage.setItem(draftKey, JSON.stringify(draft)).catch(() => {})
      })
    }, 2500)
    return () => clearTimeout(t)
  }, [name, structureType, durationType, weeks, cycleLength, abMode, variant, days, otherDays, programNotes, startDate, startDateFlexible, phases, pendingDraft, draftKey])

  // Marca "sin guardar" tras la primera edición real (post-hidratación).
  const dirtySkip = useRef(true)
  useEffect(() => {
    if (!hydratedRef.current) return
    if (dirtySkip.current) { dirtySkip.current = false; return }
    setDirty(true)
  }, [name, days, otherDays, structureType, durationType, weeks, cycleLength, abMode, programNotes, startDate, startDateFlexible, phases, durationDays])

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

  // Sheet de catálogo persistente: cerrado en Simple (lo abre el FAB verde), anclado a 12% en Normal.
  useEffect(() => {
    if (isSimpleMode) searchRef.current?.close()
    else searchRef.current?.snapToIndex(0)
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
  const editingBlock = useMemo(() => (currentDay?.blocks ?? []).find((b) => b.uid === editingUid) ?? null, [currentDay, editingUid])

  function openEditor(uid: string) { setEditingUid(uid); editorRef.current?.present() }

  const scrollContentStyle = useMemo(() => [styles.scroll, { paddingBottom: isSimpleMode ? 96 : 150 }], [isSimpleMode])

  // Tab de día 1:1 web: etiqueta (3 letras) + nº de ejercicios (rest→ZZZ, vacío→·).
  function renderDayTab(d: DayState, fixed: boolean) {
    const active = d.id === activeDayId
    const count = d.blocks.length
    return (
      <TouchableOpacity key={d.id} onPress={() => { slideDir.current = d.id > activeDayId ? 1 : -1; setActiveDayId(d.id) }} activeOpacity={0.85}
        style={[styles.dayTab, fixed ? { width: 58 } : { flex: 1 }, active && { backgroundColor: theme.background, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 2 }]}>
        <Text style={[styles.dayTabLabel, { color: active ? theme.foreground : theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>{dayLabel(structureType, d).slice(0, 3)}</Text>
        {d.is_rest ? (
          <Text style={[styles.dayTabCount, { color: '#818CF8' }]}>ZZZ</Text>
        ) : count > 0 ? (
          <Text style={[styles.dayTabCount, { color: active ? theme.primary : theme.mutedForeground }]}>{count}</Text>
        ) : (
          <Text style={[styles.dayTabCount, { color: theme.mutedForeground, opacity: 0.4 }]}>·</Text>
        )}
      </TouchableOpacity>
    )
  }

  // Lista del día agrupada por sección (encabezado + bloques) para el DraggableFlatList.
  const listItems = useMemo<BuilderRow[]>(() => {
    if (currentDay?.is_rest) return []
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
    searchRef.current?.snapToIndex(2)
  }

  function pokeHint() {
    setShowHint(true)
    setTimeout(() => setShowHint(false), 2500)
  }
  // ── Tour de onboarding (F9) ──────────────────────────────────────────────
  const regTour = (id: string) => (node: any) => {
    if (node) tourTargets.current.set(id, node)
    else tourTargets.current.delete(id)
  }
  const getTourRect = useCallback((id: string) => new Promise<{ x: number; y: number; width: number; height: number } | null>((resolve) => {
    const node = tourTargets.current.get(id)
    const root = rootRef.current
    if (!node?.measureLayout || !root) { resolve(null); return }
    // Relativo al root in-tree → mismo espacio que el overlay del tour (sin offset de status bar).
    node.measureLayout(root, (x: number, y: number, width: number, height: number) => resolve({ x, y, width, height }), () => resolve(null))
  }), [])
  const tourSteps = useMemo<TourStep[]>(() => {
    const base: TourStep[] = [
      { id: 'top-config-button', title: 'Empezá en Configurar', description: 'Definí estructura, duración y fases del programa en la tuerca ámbar.', placement: 'bottom' },
      { id: 'ab-toggle', title: 'Semanas A/B', description: 'Activá rutinas alternas A/B para microciclos semanales.', placement: 'bottom' },
      { id: 'days-board', title: 'Armá cada día', description: 'Tocá un día para editarlo; deslizá a los lados para cambiar de día.', placement: 'bottom' },
      { id: 'more-menu', title: 'Más opciones', description: 'Plantillas, balance muscular, vista previa, asignar, imprimir y deshacer/rehacer.', placement: 'bottom' },
      { id: 'save-button', title: 'Guardá al terminar', description: 'El disquete guarda el programa para seguir editándolo o asignarlo.', placement: 'bottom' },
    ]
    return tourMode === 'short' ? [base[0], base[2], base[4]] : base
  }, [tourMode])
  function openTour() {
    if (isSimpleMode) setIsSimpleMode(false)
    setTourMode('full')
    setTourOpen(true)
  }
  function handleCloseTour() {
    setTourOpen(false)
    if (tourMode === 'short') {
      setSeenTour(true)
      AsyncStorage.setItem('builder_onboarding_seen_short_v1', '1').catch(() => {})
    }
  }
  // Auto-tour corto la primera vez (tras cargar).
  useEffect(() => {
    if (loading || autoTourTried.current) return
    autoTourTried.current = true
    AsyncStorage.getItem('builder_onboarding_seen_short_v1').then((v) => {
      if (!v) { setSeenTour(false); setTourMode('short'); setTourOpen(true) }
    }).catch(() => {})
  }, [loading])
  function toggleSimpleMode() {
    const next = !isSimpleMode
    setModeLabel(next ? 'Modo Simple' : 'Modo Normal')
    Haptics.selectionAsync().catch(() => {})
    // Swap de UI cuando el overlay negro cubre todo (~480ms, 1:1 web), limpia a ~2.2s.
    setTimeout(() => { setIsSimpleMode(next); if (next) pokeHint() }, 480)
    setTimeout(() => setModeLabel(null), 2200)
  }

  // Swipe horizontal para cambiar de día (ventaja nativa sobre los chips de la web).
  function changeDay(dir: 1 | -1) {
    const list = liveDays.current
    const idx = list.findIndex((d) => d.id === activeDayIdRef.current)
    const next = list[idx + dir]
    if (!next) return
    slideDir.current = dir
    setActiveDayId(next.id)
    Haptics.selectionAsync().catch(() => {})
    if (simpleModeRef.current) pokeHint()
  }
  // Gesto estable (lee de refs) → no se reconfigura el GestureDetector en cada edición.
  const dayGesture = useMemo(
    () =>
      Gesture.Race(
        Gesture.Fling().direction(Directions.LEFT).runOnJS(true).onEnd(() => changeDay(1)),
        Gesture.Fling().direction(Directions.RIGHT).runOnJS(true).onEnd(() => changeDay(-1))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
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
      const { orgId } = await getCoachOrgContext().catch(() => ({ orgId: null as string | null }))
      for (const cid of clientIds) {
        await persistProgram({ coachId: coach.id, clientId: cid, programId: null, meta: buildMeta(true), variantSets: currentVariantSets(), orgId })
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
    // P-F5: guard de bloques (web bloquea save si sets<1 o reps vacío) — evita persistir incompletos.
    const allBlocks = [...days, ...(abMode ? otherDays : [])].flatMap((d) => d.blocks)
    const invalid = allBlocks.find((b) => !b.sets || b.sets < 1 || !String(b.reps ?? '').trim())
    if (invalid) { Alert.alert('Ejercicio incompleto', `Revisá "${invalid.exercise_name}": necesita series (≥1) y reps.`); return }
    setSaving(true)
    try {
      const coach = await getCoachProfile()
      if (!coach) throw new Error('Coach no encontrado')
      const { orgId } = await getCoachOrgContext().catch(() => ({ orgId: null as string | null }))
      const pid = await persistProgram({
        coachId: coach.id,
        clientId: isTemplate ? null : (clientId ?? null),
        programId,
        meta: buildMeta(isTemplate ? false : true),
        variantSets: currentVariantSets(),
        orgId,
      })
      setProgramId(pid)
      setDirty(false)
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
    <View ref={rootRef} collapsable={false} style={{ flex: 1 }}>
    <SafeAreaView edges={['top', 'bottom']} style={[styles.root, { backgroundColor: theme.background }]}>
      {/* Top bar 1:1 web: ← / nombre+estado / ⋮ ? ⚙(ping) 💾 */}
      <View style={[styles.topBar, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn}>
          <ArrowLeft size={22} color={theme.foreground} />
        </TouchableOpacity>

        <View style={styles.titleWrap}>
          <Text numberOfLines={1} style={[styles.progTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
            {(name || 'Nuevo programa').toUpperCase()}
          </Text>
          {dirty ? (
            <View style={styles.statusRow}>
              <View style={styles.statusDot} />
              <Text style={[styles.statusText, { fontFamily: 'Inter_700Bold' }]}>SIN GUARDAR</Text>
            </View>
          ) : clientName ? (
            <Text numberOfLines={1} style={[styles.statusMuted, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{clientName}</Text>
          ) : null}
        </View>

        <View style={styles.topActions}>
          <TouchableOpacity ref={regTour('more-menu')} onPress={() => setMenuOpen(true)} hitSlop={6} style={styles.iconBtn}><MoreVertical size={20} color={theme.foreground} /></TouchableOpacity>
          <View>
            {!seenTour ? (
              <MotiView pointerEvents="none" from={{ opacity: 0.4, scale: 1 }} animate={{ opacity: 0, scale: 1.7 }}
                transition={{ loop: true, type: 'timing', duration: 1500 }} style={[styles.pingAmber, { backgroundColor: theme.primary }]} />
            ) : null}
            <TouchableOpacity ref={regTour('help-button')} onPress={openTour} hitSlop={6} style={[styles.iconOutline, { borderColor: theme.primary + '66' }]}><CircleHelp size={17} color={theme.primary} /></TouchableOpacity>
          </View>
          <View>
            {!configOpen ? (
              <MotiView pointerEvents="none" from={{ opacity: 0.45, scale: 1 }} animate={{ opacity: 0, scale: 1.7 }}
                transition={{ loop: true, type: 'timing', duration: 1500 }} style={styles.pingAmber} />
            ) : null}
            <TouchableOpacity ref={regTour('top-config-button')} onPress={() => { setConfigOpen(true); configRef.current?.present() }} hitSlop={6} style={[styles.gearBtn, { borderColor: '#F59E0B66' }]}>
              <Settings size={17} color="#F59E0B" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity ref={regTour('save-button')} onPress={handleSave} disabled={saving} activeOpacity={0.85} style={[styles.saveBtn, { backgroundColor: theme.primary, shadowColor: theme.primary, opacity: saving ? 0.6 : 1 }]}>
            {saving ? <ActivityIndicator size="small" color={theme.primaryForeground} /> : <Save size={19} color={theme.primaryForeground} />}
          </TouchableOpacity>
        </View>
      </View>

      {/* Barra A/B visible 1:1 web (solo Normal) */}
      {!isSimpleMode ? (
        <View style={[styles.abBar, { borderBottomColor: theme.border }]}>
          <TouchableOpacity ref={regTour('ab-toggle')} onPress={() => toggleAb(!abMode)} activeOpacity={0.8}
            style={[styles.abToggle, { borderColor: abMode ? theme.primary : theme.border, backgroundColor: abMode ? theme.primary + '1A' : 'transparent' }]}>
            <Text style={[styles.abTag, { color: abMode ? theme.primary : theme.mutedForeground }]}>A/B</Text>
            <Text numberOfLines={1} style={[styles.abLabelTxt, { color: abMode ? theme.primary : theme.mutedForeground }]}>{abMode ? 'Semanas alternas activas' : 'Activar semanas A/B'}</Text>
          </TouchableOpacity>
          {abMode ? (
            <View style={[styles.abSeg, { backgroundColor: theme.secondary }]}>
              {(['A', 'B'] as const).map((v) => (
                <TouchableOpacity key={v} onPress={() => switchVariant(v)} activeOpacity={0.85} style={[styles.abSegItem, variant === v && { backgroundColor: theme.background }]}>
                  <Text style={{ fontSize: 11, fontFamily: 'Montserrat_700Bold', color: variant === v ? theme.foreground : theme.mutedForeground }}>Sem {v}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Barra de días — fija (no desliza con el contenido) */}
      <View style={styles.dayTabsBar}>
        {days.length <= 7 ? (
          <View ref={regTour('days-board')} collapsable={false} style={[styles.dayTabBar, { backgroundColor: theme.secondary }]}>
            {days.map((d) => renderDayTab(d, false))}
          </View>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View ref={regTour('days-board')} collapsable={false} style={[styles.dayTabBar, { backgroundColor: theme.secondary }]}>
              {days.map((d) => renderDayTab(d, true))}
            </View>
          </ScrollView>
        )}
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
        <Animated.View style={[{ flex: 1 }, daySlideStyle]}>
        <DraggableFlatList
          ref={listRef}
          data={listItems}
          keyExtractor={(item) => (item.type === 'header' ? `h-${item.section}` : item.block.uid)}
          onDragBegin={() => Haptics.selectionAsync().catch(() => {})}
          onDragEnd={({ data }) => handleDragEnd(data)}
          activationDistance={14}
          contentContainerStyle={scrollContentStyle}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={5}
          ListHeaderComponent={
            <View style={{ gap: 10, paddingBottom: 6 }}>
              {isSimpleMode && abMode ? (
                <View style={[styles.abSeg, { backgroundColor: theme.secondary, alignSelf: 'center' }]}>
                  {(['A', 'B'] as const).map((v) => (
                    <TouchableOpacity key={v} onPress={() => switchVariant(v)} activeOpacity={0.85} style={[styles.abSegItem, variant === v && { backgroundColor: theme.background }]}>
                      <Text style={{ fontSize: 11, fontFamily: 'Montserrat_700Bold', color: variant === v ? theme.foreground : theme.mutedForeground }}>{v}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
              {!isSimpleMode && phases.length ? <ProgramPhasesBar phases={phases} weeks={weeks} /> : null}

              <View style={[styles.dayCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
              <View style={styles.dayHeader}>
                {currentDay.is_rest ? (
                  <View style={[styles.dayTitleInput, styles.restTitleBox, { borderColor: theme.border, backgroundColor: theme.card }]}>
                    <Moon size={14} color="#818CF8" />
                    <Text style={[styles.restTitleText, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>DÍA DE DESCANSO</Text>
                  </View>
                ) : (
                  <TextInput value={currentDay.title} onChangeText={(v) => updateDayTitle(currentDay.id, v)} placeholder={`Título de ${currentDay.name}`} placeholderTextColor={theme.mutedForeground}
                    style={[styles.dayTitleInput, { borderColor: theme.border, backgroundColor: theme.card, color: theme.foreground, fontFamily: theme.fontSans }]} />
                )}
                <TouchableOpacity onPress={() => toggleRestDay(currentDay.id)} activeOpacity={0.8}
                  style={[styles.restBtn, { borderColor: currentDay.is_rest ? theme.primary : theme.border, backgroundColor: currentDay.is_rest ? theme.primary + '1A' : 'transparent' }]}>
                  {currentDay.is_rest ? <Sun size={15} color={theme.primary} /> : <Moon size={15} color={theme.mutedForeground} />}
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
              </View>
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
            const cat = catById.get(item.block.exercise_id)
            const secBlocks = (currentDay?.blocks ?? []).filter((b) => (b.section ?? 'main') === item.section)
            const pos = secBlocks.findIndex((b) => b.uid === item.block.uid)
            const next = secBlocks[pos + 1]
            const isLastInSec = pos === secBlocks.length - 1
            const linkedToNext = !!item.block.superset_group && item.block.superset_group === next?.superset_group
            return (
              <View>
                <BuilderBlockCard
                  block={item.block}
                  drag={drag}
                  isActive={isActive}
                  onEdit={openEditor}
                  onRemove={(uid) => removeBlock(activeDayId, uid)}
                  onUpdate={updateBlock}
                  onSetSection={(uid, s) => setBlockSection(activeDayId, uid, s)}
                  onToggleSuperset={(uid) => toggleSuperset(activeDayId, uid)}
                  catGif={cat?.gif_url}
                  catImage={cat?.image_url}
                  catVideo={cat?.video_url}
                />
                {!isLastInSec ? (
                  linkedToNext ? (
                    <View style={styles.ssConnector}>
                      <View style={[styles.ssLine, { backgroundColor: theme.primary + '33' }]} />
                      <TouchableOpacity onPress={() => toggleSuperset(activeDayId, item.block.uid)} activeOpacity={0.8} style={[styles.ssPill, { borderColor: theme.primary + '33', backgroundColor: theme.primary + '1A' }]}>
                        <Text style={[styles.ssPillTxt, { color: theme.primary, fontFamily: 'Inter_700Bold' }]}>SS · {item.block.superset_group}</Text>
                      </TouchableOpacity>
                      <View style={[styles.ssLine, { backgroundColor: theme.primary + '33' }]} />
                    </View>
                  ) : (
                    <View style={styles.ssConnector}>
                      <TouchableOpacity onPress={() => toggleSuperset(activeDayId, item.block.uid)} activeOpacity={0.8} style={[styles.ssLinkBtn, { borderColor: theme.border }]}>
                        <Link2 size={13} color={theme.mutedForeground} />
                        <Text style={[styles.ssLinkTxt, { color: theme.mutedForeground, fontFamily: 'Inter_700Bold' }]}>Superserie</Text>
                      </TouchableOpacity>
                    </View>
                  )
                ) : null}
              </View>
            )
          }}
          ListFooterComponent={
            currentDay.is_rest ? (
              <View style={styles.restPanel}>
                <Moon size={40} color="#818CF866" />
                <Text style={[styles.restPanelTitle, { color: '#818CF8', fontFamily: 'Montserrat_700Bold' }]}>DÍA DE DESCANSO</Text>
                <Text style={[styles.restPanelSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Recuperación activa y descanso</Text>
                <TouchableOpacity onPress={() => toggleRestDay(currentDay.id)} activeOpacity={0.85} style={[styles.restPanelBtn, { borderColor: '#818CF855' }]}>
                  <Text style={[styles.restPanelBtnText, { color: '#818CF8', fontFamily: 'Inter_700Bold' }]}>Añadir ejercicios</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity onPress={() => addToSection('main')} activeOpacity={0.8}
                style={[styles.addBtn, { borderColor: theme.border, backgroundColor: theme.card }]}>
                <Plus size={18} color={theme.primary} />
                <Text style={[styles.addText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>Agregar ejercicio a {currentDay.name}</Text>
              </TouchableOpacity>
            )
          }
        />
        </Animated.View>
      </KeyboardAvoidingView>
      </GestureDetector>

      <ExerciseSearchSheet
        ref={searchRef}
        exercises={catalog}
        dayBlockCount={currentDay?.blocks.length ?? 0}
        dayName={currentDay?.name ?? ''}
        simpleMode={isSimpleMode}
        onSelect={(block) => { addExercise(activeDayId, { ...block, dayId: activeDayId, section: pendingSection }); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}) }}
      />
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
        onClose={() => setConfigOpen(false)}
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
              { icon: Eye, label: 'Vista previa', on: () => { setMenuOpen(false); previewRef.current?.present() }, dim: false },
              { icon: Scale, label: 'Balance muscular', on: () => { setMenuOpen(false); balanceRef.current?.present() }, dim: false },
              { icon: Layers, label: 'Cargar plantilla', on: () => { setMenuOpen(false); templateRef.current?.present() }, dim: false },
              { icon: Users, label: 'Asignar a alumnos', on: () => { setMenuOpen(false); assignRef.current?.present() }, dim: false },
              { icon: Printer, label: 'Imprimir / PDF', on: handlePrint, dim: false },
              { icon: Undo2, label: 'Deshacer', on: () => { if (canUndo) { setMenuOpen(false); undo() } }, dim: !canUndo },
              { icon: Redo2, label: 'Rehacer', on: () => { if (canRedo) { setMenuOpen(false); redo() } }, dim: !canRedo },
            ].map((it) => {
              const Icon = it.icon
              const color = it.dim ? theme.muted : theme.foreground
              return (
                <TouchableOpacity key={it.label} onPress={it.on} activeOpacity={0.8} style={styles.menuItem}>
                  <Icon size={17} color={color} />
                  <Text style={[styles.menuItemText, { color, fontFamily: 'Inter_600SemiBold' }]}>{it.label}</Text>
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

      {/* Toggle Modo Simple/Normal (Sparkles) — degradado púrpura como la web en Normal */}
      <TouchableOpacity onPress={toggleSimpleMode} activeOpacity={0.85}
        style={[styles.fabMode, { bottom: isSimpleMode ? 28 : 116, backgroundColor: isSimpleMode ? theme.card : 'transparent', borderColor: theme.border, borderWidth: isSimpleMode ? 1 : 0, shadowColor: isSimpleMode ? '#000' : '#8b5cf6', shadowOpacity: isSimpleMode ? 0.25 : 0.55 }]}>
        {!isSimpleMode ? (
          <LinearGradient colors={['#6366f1', '#8b5cf6', '#a855f7']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fabGradient} />
        ) : null}
        <Sparkles size={20} color={isSimpleMode ? theme.mutedForeground : '#fff'} />
      </TouchableOpacity>

      {/* Label de transición */}
      {modeLabel ? (
        <MotiView pointerEvents="none" style={styles.modeOverlay}
          from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ type: 'timing', duration: 240 }}>
          <MotiView from={{ opacity: 0, scale: 0.9, translateY: 8 }} animate={{ opacity: 1, scale: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 340, delay: 140 }} style={{ alignItems: 'center', gap: 22 }}>
            <Image source={require('../../assets/eva-icon.png')} style={{ width: 76, height: 76 }} contentFit="contain" tintColor="#fff" />
            <Text style={styles.modeOverlayText}>{modeLabel}</Text>
          </MotiView>
        </MotiView>
      ) : null}

      {/* Flechas hint de swipe (solo Simple) */}
      {isSimpleMode && showHint ? (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <View style={[styles.hint, styles.hintLeft]}><ChevronLeft size={30} color={theme.primary} /></View>
          <View style={[styles.hint, styles.hintRight]}><ChevronRight size={30} color={theme.primary} /></View>
        </View>
      ) : null}

    </SafeAreaView>
      <BuilderOnboardingTour
        open={tourOpen}
        steps={tourSteps}
        getRect={getTourRect}
        onClose={handleCloseTour}
        remeasureSignal={`${activeDayId}-${abMode}-${tourMode}`}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  topBtn: { minWidth: 64 }, topBtnText: { fontSize: 15 },
  undoRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  titleWrap: { flex: 1, minWidth: 0 },
  progTitle: { fontSize: 14, letterSpacing: 1 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F97316' },
  statusText: { fontSize: 9, letterSpacing: 0.8, color: '#F97316' },
  statusMuted: { fontSize: 10, letterSpacing: 0.6, marginTop: 1, textTransform: 'uppercase' },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  iconOutline: { width: 34, height: 34, borderWidth: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  gearBtn: { width: 34, height: 34, borderWidth: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  pingAmber: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 9, backgroundColor: '#F59E0B' },
  saveBtn: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  abBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1 },
  abToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, flexShrink: 1 },
  abTag: { fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
  abLabelTxt: { fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', flexShrink: 1 },
  abSeg: { flexDirection: 'row', gap: 3, padding: 3, borderRadius: 10, marginLeft: 'auto' },
  abSegItem: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 7 },
  dayCard: { borderWidth: 1, borderRadius: 16, padding: 10, gap: 8 },
  ssConnector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 2, marginBottom: 4 },
  ssLine: { flex: 1, height: 1 },
  ssPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  ssPillTxt: { fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase' },
  ssLinkBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  ssLinkTxt: { fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase' },
  dayTabBar: { flexDirection: 'row', alignItems: 'stretch', gap: 3, padding: 4, borderRadius: 14 },
  dayTab: { paddingVertical: 7, paddingHorizontal: 4, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dayTabLabel: { fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase' },
  dayTabCount: { fontSize: 9, fontFamily: 'Inter_700Bold' },
  restTitleBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  restTitleText: { fontSize: 11, letterSpacing: 1 },
  restPanel: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 8 },
  restPanelTitle: { fontSize: 12, letterSpacing: 2 },
  restPanelSub: { fontSize: 12, opacity: 0.7 },
  restPanelBtn: { marginTop: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9 },
  restPanelBtnText: { fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase' },
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
  scroll: { padding: 16, gap: 8, paddingBottom: 60 },
  dayTabsBar: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
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
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginTop: 6, marginBottom: 4 },
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
  fabGradient: { ...StyleSheet.absoluteFillObject, borderRadius: 24 },
  fabAdd: { position: 'absolute', right: 16, bottom: 86, width: 56, height: 56, borderRadius: 28, backgroundColor: '#10B981', alignItems: 'center', justifyContent: 'center', shadowColor: '#10B981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.45, shadowRadius: 12, elevation: 8 },
  modeOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modeOverlayText: { color: '#fff', fontSize: 26, fontFamily: 'Montserrat_700Bold', letterSpacing: 6, textTransform: 'uppercase' },
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
