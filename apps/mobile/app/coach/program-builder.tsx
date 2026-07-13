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
import { ArrowLeft, Check, ChevronLeft, ChevronRight, CircleHelp, Copy, Eye, History, Layers, Link2, Moon, MoreVertical, Pencil, Plus, Printer, Redo2, Scale, SlidersHorizontal, Sparkles, Sun, Undo2, Users, X } from 'lucide-react-native'
import { NestableScrollContainer, NestableDraggableFlatList } from 'react-native-draggable-flatlist'
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated'
import { MotiView } from 'moti'
import * as Haptics from 'expo-haptics'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { toast } from '../../components/Toast'
import { supabase } from '../../lib/supabase'
import { isMissingColumnError, selectWithFallback } from '../../lib/db-compat'
import { getCoachProfile } from '../../lib/coach'
import { useTheme } from '../../context/ThemeContext'
import { FONT } from '../../lib/typography'
import { SHADOWS, GLOWS } from '../../lib/shadows'
import { ExerciseSearchSheet } from '../../components/coach/ExerciseSearchSheet'
import { BlockEditorSheet } from '../../components/coach/BlockEditorSheet'
import { TemplatePickerSheet } from '../../components/coach/TemplatePickerSheet'
import { AssignClientsSheet, type AssignClientsOptions } from '../../components/coach/AssignClientsSheet'
import { MuscleBalanceSheet } from '../../components/coach/MuscleBalanceSheet'
import { ProgramPreviewSheet } from '../../components/coach/ProgramPreviewSheet'
import { BuilderBlockCard } from '../../components/coach/BuilderBlockCard'
import { ProgramConfigSheet } from '../../components/coach/ProgramConfigSheet'
import { ProgramPhasesBar } from '../../components/coach/ProgramPhasesBar'
import { BuilderOnboardingTour, type TourStep } from '../../components/coach/BuilderOnboardingTour'
import { getMuscleColor } from '../../lib/muscle-colors'
import { listBuilderExercisesForWorkspace, type ExerciseRow } from '../../lib/exercises'
import { exportProgramPdf } from '../../lib/program-pdf'
import { EvaLoaderScreen } from '../../components/EvaLoader'
import { usePlanBuilder } from '../../lib/plan-builder/reducer'
import { buildDaySkeleton } from '../../lib/plan-builder/skeleton'
import { serializeBlockInsert } from '../../lib/plan-builder/serialize'
import type { BuilderBlock, BuilderSection, DayState, DurationType, ProgramStructureType } from '../../lib/plan-builder/types'
import { listBuilderAreas } from '../../lib/workout-areas'
import type { WorkoutArea } from '@eva/workout-engine'
import { classicSlugForAreaId, diffBlocksByPosition, effectiveAreaKey, effectiveExerciseType, hasProgramOptimisticConflict, LEGACY_SECTION_AREA_ID, legacyBucketFor, matchPlans, orderedAreaIds, sanitizeSupersets, type ExistingPlan } from '@eva/workout-engine'
import { buildMobileAreaVMs, type MobileAreaVM } from '../../lib/builder-area-vm'
import { useEntitlements } from '../../lib/entitlements'
import type { ClientActionWorkspace } from '../../lib/client-actions'
import {
  clientMatchesActionWorkspace,
  parseClientActionWorkspace,
  pendingClientAssignments,
  programBuilderDraftKey,
  templateMatchesActionWorkspace,
} from '../../lib/client-action-workspace'
import { getActiveCoachWorkspace } from '../../lib/workspace'
import { activeSwapRollbackPlan, assertClientProgramNameUnchanged, canAssignProgramToClients, duplicateTemplateNameError, filterTemplatePlansForAssignment, normalizeAssignmentWeeks, persistedPlanGroupName, programPlanTitle, resolveProgramScheduleMetadata, restorableProgramMetadata, shouldAutosaveProgramDraft, withoutProgramActive, type ProgramMetadataSnapshot } from '../../lib/program-persistence'
import { resolveOnDark } from '../../lib/theme'
import { getSantiagoIsoYmdForUtcInstant } from '../../lib/date-utils'
import { apiFetch } from '../../lib/api'

// DS token constants (imperativos: RN shadowColor / gradiente literal no expresables por className).
// Degradado del toggle Modo Simple (1:1 web): índigo→violeta→púrpura de la superficie "IA".
const { onDark: ON_DARK } = resolveOnDark()

const DAY_SHORT = ['', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const SLIDE = Math.round(Dimensions.get('window').width * 0.22) // desplazamiento del slide de día

// Completitud POR TIPO (E5-07, espejo de WeeklyPlanBuilder.blockIncomplete de web): strength
// exige sets+reps; cardio duración/distancia/intervalos; movilidad sets + (duración/reps);
// roller duración/reps. Evita persistir bloques tipados sin prescripción mínima.
function blockIncomplete(b: BuilderBlock): boolean {
  const type = effectiveExerciseType(b, { exercise_type: b.exercise_type })
  if (type === 'cardio') {
    const dist = parseFloat((b.distance_value || '').replace(',', '.'))
    return !((b.duration_sec ?? 0) > 0 || (Number.isFinite(dist) && dist > 0) || !!b.interval_config)
  }
  if (type === 'mobility') {
    return !b.sets || b.sets < 1 || !((b.duration_sec ?? 0) > 0 || (b.reps_value ?? 0) > 0 || !!b.reps?.trim())
  }
  if (type === 'roller') {
    return !((b.duration_sec ?? 0) > 0 || (b.reps_value ?? 0) > 0 || !!b.reps?.trim())
  }
  return !b.sets || b.sets < 1 || !b.reps?.trim()
}

function emptyDays(): DayState[] {
  return buildDaySkeleton('weekly', 7, [])
}
function dayLabel(structure: ProgramStructureType, d: DayState): string {
  return structure === 'weekly' ? DAY_SHORT[d.id] : `D${d.id}`
}

// PostgREST puede devolver la FK `exercises` como objeto o como array de un elemento.
function embeddedExerciseRow(raw: any): { name?: string; muscle_group?: string; gif_url?: string; video_url?: string; exercise_type?: string } | null {
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
    progression_mode: (b.progression_mode as BuilderBlock['progression_mode']) ?? null,
    section: (b.section as BuilderBlock['section']) ?? 'main',
    section_template_id: b.section_template_id ?? null,
    is_override: b.is_override ?? false,
    // Polimorfico (E5-05): hidratar los campos tipados para que el editor los vea y el
    // guardado los persista via serialize.ts. `exercise_type` viene del catalogo (embed);
    // el resto son columnas de workout_blocks. distance/load/warmup_rest = strings (input).
    exercise_type: (ex?.exercise_type as BuilderBlock['exercise_type']) ?? (b.exercise_type as BuilderBlock['exercise_type']) ?? null,
    exercise_type_override: (b.exercise_type_override as BuilderBlock['exercise_type_override']) ?? null,
    side_mode: (b.side_mode as BuilderBlock['side_mode']) ?? null,
    reps_value: b.reps_value ?? null,
    reps_unit: (b.reps_unit as BuilderBlock['reps_unit']) ?? null,
    load_type: (b.load_type as BuilderBlock['load_type']) ?? null,
    load_value: b.load_value != null ? String(b.load_value) : undefined,
    load_unit: (b.load_unit as BuilderBlock['load_unit']) ?? null,
    distance_value: b.distance_value != null ? String(b.distance_value) : undefined,
    distance_unit: (b.distance_unit as BuilderBlock['distance_unit']) ?? null,
    duration_sec: b.duration_sec ?? null,
    target_pace_sec_per_km: b.target_pace_sec_per_km ?? null,
    hr_zone: b.hr_zone ?? null,
    instructions: b.instructions ?? undefined,
    interval_config: b.interval_config ?? null,
    is_unilateral: b.is_unilateral ?? null,
    extra_targets: b.extra_targets ?? null,
    warmup_rest_time: b.warmup_rest_time != null ? String(b.warmup_rest_time) : undefined,
    thumbnail_url: b.thumbnail_url ?? undefined,
    // Passthrough: conservar la fila DB completa (incl. columnas futuras que el editor no
    // conoce) para no destruirlas al guardar. Ver lib/plan-builder/serialize.ts.
    _raw: b && typeof b === 'object' ? (b as Record<string, unknown>) : undefined,
  }
}

// Columnas base (las que la prod standalone seguro tiene).
// `workout_blocks ( * )` trae TODAS las columnas (incl. section_template_id + campos
// polimorficos), necesarias para el passthrough. `*` es resiliente: en una prod
// standalone sin esas columnas simplemente no las devuelve (no falla).
const PROGRAM_SELECT =
  'id, client_id, coach_id, org_id, updated_at, start_date, end_date, source_template_id, last_edited_by_coach_id, name, program_structure_type, duration_type, weeks_to_repeat, cycle_length, ab_mode, workout_plans ( id, title, group_name, day_of_week, week_variant, workout_blocks ( *, exercises ( name, muscle_group, gif_url, video_url, exercise_type ) ) )'
// Rico = base + meta extra (notas/fecha/phases). Si la columna falta, selectWithFallback usa el base.
const PROGRAM_SELECT_RICH = PROGRAM_SELECT.replace(
  'ab_mode,',
  'ab_mode, duration_days, program_notes, start_date_flexible, program_phases,'
)
const PROGRAM_META_SELECT = 'id, updated_at, start_date, end_date, source_template_id, last_edited_by_coach_id, name, program_structure_type, duration_type, weeks_to_repeat, cycle_length, ab_mode, is_active'
const PROGRAM_META_SELECT_RICH = `${PROGRAM_META_SELECT}, duration_days, program_notes, start_date_flexible, program_phases`

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
  end_date?: string | null
  start_date_flexible?: boolean
  program_phases?: unknown
  source_template_id?: string | null
  last_edited_by_coach_id?: string | null
}

type ProgramPersistDay = DayState & {
  group_name?: string | null
  /** La asignación replica incluso un plan legacy sin bloques, igual que web. */
  persist_empty?: boolean
}

class ProgramOptimisticConflictError extends Error {
  constructor(
    readonly editorCoachId: string | null,
    readonly currentUpdatedAt: string | null,
  ) {
    super('El programa cambió mientras editabas.')
    this.name = 'ProgramOptimisticConflictError'
  }
}

// Passthrough: mergea los campos editados en mobile SOBRE la fila original (`_raw`), de
// modo que section_template_id y los campos polimorficos sobreviven el guardado aunque el
// editor mobile no los conozca. Ver lib/plan-builder/serialize.ts.
function blockInsert(b: BuilderBlock, i: number, planId: string) {
  return serializeBlockInsert(b, i, planId)
}

// Quita las columnas de meta extra (para prod que aún no las tiene).
function baseMeta(m: ProgramMetaPayload): ProgramMetaPayload {
  const { program_notes, start_date_flexible, program_phases, duration_days, ...rest } = m
  void program_notes; void start_date_flexible; void program_phases; void duration_days
  return rest as ProgramMetaPayload
}

async function validateClientResource(
  clientId: string,
  workspace: ClientActionWorkspace,
  coachId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('clients')
    .select('coach_id, team_id, org_id')
    .eq('id', clientId)
    .maybeSingle()
  if (error) throw error
  return Boolean(data && clientMatchesActionWorkspace(data, workspace, coachId))
}

function workspaceOrgId(workspace: ClientActionWorkspace): string | null {
  return workspace.kind === 'enterprise' ? workspace.orgId : null
}

function scopedTemplateQuery(select: string, templateId: string, workspace: ClientActionWorkspace, coachId: string) {
  if (workspace.kind === 'enterprise' && !workspace.orgId) {
    throw new Error('Workspace enterprise inválido.')
  }
  let query = supabase
    .from('workout_programs')
    .select(select)
    .eq('id', templateId)
    .eq('coach_id', coachId)
    .is('client_id', null)
  const orgId = workspaceOrgId(workspace)
  query = orgId ? query.eq('org_id', orgId) : query.is('org_id', null)
  return query.maybeSingle()
}

// Crea/actualiza un programa + sus plans/blocks. Reusado por guardar y por asignar
// a alumnos (programId null → crea uno nuevo por alumno). Resiliente: si faltan
// columnas meta extra en la BD, reintenta con el set base.
async function persistProgram(opts: {
  coachId: string
  clientId: string | null
  programId: string | null
  meta: ProgramMetaPayload
  variantSets: { variant: 'A' | 'B'; days: ProgramPersistDay[] }[]
  orgId?: string | null
  expectedUpdatedAt?: string | null
  force?: boolean
}): Promise<string> {
  let pid = opts.programId
  const createdNew = !opts.programId
  const desiredActive = Boolean(opts.clientId && opts.meta.is_active)
  const insertedPlanIds: string[] = []
  const insertedBlockIds: string[] = []
  let metadataSnapshot: ProgramMetadataSnapshot | null = null
  let metadataUpdated = false
  let targetWasActive = false
  let previousActiveIds: string[] = []
  let deactivatedIds: string[] = []
  let activeSwapStarted = false
  let persistedMeta: ProgramMetaPayload

  async function setProgramsActive(ids: string[], active: boolean) {
    if (ids.length === 0) return
    let query = supabase
      .from('workout_programs')
      .update({ is_active: active })
      .in('id', ids)
    if (opts.clientId) query = query.eq('client_id', opts.clientId)
    query = opts.orgId ? query.eq('org_id', opts.orgId) : query.is('org_id', null)
    const result = await query.select('id')
    if (result.error) throw result.error
    const changed = new Set((result.data ?? []).map((row) => (row as { id: string }).id))
    if (ids.some((id) => !changed.has(id))) throw new Error('No se pudo confirmar el cambio de programa activo.')
  }

  async function setTargetActive(programId: string, active: boolean) {
    if (!opts.clientId) return
    let query = supabase
      .from('workout_programs')
      .update({ is_active: active })
      .eq('id', programId)
      .eq('client_id', opts.clientId)
    query = opts.orgId ? query.eq('org_id', opts.orgId) : query.is('org_id', null)
    const result = await query.select('id').maybeSingle()
    if (result.error) throw result.error
    if (!result.data) throw new Error('No se pudo confirmar el estado activo del programa objetivo.')
  }

  async function deactivateOtherActive(programId: string): Promise<string[]> {
    if (!opts.clientId) return []
    let query = supabase
      .from('workout_programs')
      .update({ is_active: false })
      .eq('client_id', opts.clientId)
      .eq('is_active', true)
      .neq('id', programId)
    query = opts.orgId ? query.eq('org_id', opts.orgId) : query.is('org_id', null)
    const result = await query.select('id')
    if (result.error) throw result.error
    return (result.data ?? []).map((row) => (row as { id: string }).id)
  }

  function scopedProgramQuery(select: string, programId: string) {
    let query = supabase.from('workout_programs').select(select).eq('id', programId)
    query = opts.clientId
      ? query.eq('client_id', opts.clientId)
      : query.eq('coach_id', opts.coachId).is('client_id', null)
    query = opts.orgId ? query.eq('org_id', opts.orgId) : query.is('org_id', null)
    return query.maybeSingle()
  }

  function metadataForPersist(existingStartDate: string | null | undefined): ProgramMetaPayload {
    const schedule = resolveProgramScheduleMetadata({
      isClientProgram: Boolean(opts.clientId),
      requestedStartDate: opts.meta.start_date,
      existingStartDate,
      todaySantiagoIso: getSantiagoIsoYmdForUtcInstant(new Date().toISOString()),
      weeksToRepeat: opts.meta.weeks_to_repeat,
    })
    return {
      ...opts.meta,
      start_date: schedule.startDate,
      end_date: schedule.endDate,
      source_template_id: opts.clientId ? (opts.meta.source_template_id ?? null) : null,
      last_edited_by_coach_id: opts.coachId,
    }
  }

  if (!opts.clientId) {
    let sameNameQuery = supabase
      .from('workout_programs')
      .select('id')
      .eq('coach_id', opts.coachId)
      .eq('name', opts.meta.name)
      .is('client_id', null)
    sameNameQuery = opts.orgId ? sameNameQuery.eq('org_id', opts.orgId) : sameNameQuery.is('org_id', null)
    if (pid) sameNameQuery = sameNameQuery.neq('id', pid)
    const sameName = await sameNameQuery.limit(1).maybeSingle()
    if (sameName.error) throw sameName.error
    if (sameName.data) throw new Error(duplicateTemplateNameError(opts.meta.name))
  }

  if (desiredActive && opts.clientId) {
    let activeQuery = supabase
      .from('workout_programs')
      .select('id')
      .eq('client_id', opts.clientId)
      .eq('is_active', true)
    activeQuery = opts.orgId ? activeQuery.eq('org_id', opts.orgId) : activeQuery.is('org_id', null)
    const activeSnapshot = await activeQuery
    if (activeSnapshot.error) throw activeSnapshot.error
    const activeIds = (activeSnapshot.data ?? []).map((row) => (row as { id: string }).id)
    targetWasActive = Boolean(pid && activeIds.includes(pid))
    previousActiveIds = activeIds.filter((id) => id !== pid)
  }

  if (pid) {
    const snapshot = await selectWithFallback<any>(
      () => scopedProgramQuery(PROGRAM_META_SELECT_RICH, pid!),
      () => scopedProgramQuery(PROGRAM_META_SELECT, pid!),
    )
    if (snapshot.error) throw snapshot.error
    if (!snapshot.data) throw new Error('El programa ya no está disponible en este espacio de trabajo.')
    metadataSnapshot = snapshot.data as ProgramMetadataSnapshot
    assertClientProgramNameUnchanged({
      clientId: opts.clientId,
      existingName: metadataSnapshot.name,
      requestedName: opts.meta.name,
    })
    if (!opts.force && hasProgramOptimisticConflict({
      expectedUpdatedAt: opts.expectedUpdatedAt,
      currentUpdatedAt: metadataSnapshot.updated_at,
    })) {
      throw new ProgramOptimisticConflictError(
        metadataSnapshot.last_edited_by_coach_id ?? null,
        metadataSnapshot.updated_at ?? null,
      )
    }
    persistedMeta = metadataForPersist(metadataSnapshot.start_date)
    const updateMeta = withoutProgramActive(persistedMeta)
    let updateQuery = supabase
      .from('workout_programs')
      .update(updateMeta)
      .eq('id', pid)
    updateQuery = opts.clientId
      ? updateQuery.eq('client_id', opts.clientId)
      : updateQuery.eq('coach_id', opts.coachId).is('client_id', null)
    updateQuery = opts.orgId ? updateQuery.eq('org_id', opts.orgId) : updateQuery.is('org_id', null)
    const upd = await updateQuery.select('id').maybeSingle()
    if (upd.error && isMissingColumnError(upd.error)) {
      const fallbackMeta = withoutProgramActive(baseMeta(persistedMeta))
      let fallbackQuery = supabase
        .from('workout_programs')
        .update(fallbackMeta)
        .eq('id', pid)
      fallbackQuery = opts.clientId
        ? fallbackQuery.eq('client_id', opts.clientId)
        : fallbackQuery.eq('coach_id', opts.coachId).is('client_id', null)
      fallbackQuery = opts.orgId ? fallbackQuery.eq('org_id', opts.orgId) : fallbackQuery.is('org_id', null)
      const fallback = await fallbackQuery.select('id').maybeSingle()
      if (fallback.error) throw fallback.error
      if (!fallback.data) throw new Error('El programa ya no está disponible en este espacio de trabajo.')
    } else if (upd.error) {
      throw upd.error
    } else if (!upd.data) {
      throw new Error('El programa ya no está disponible en este espacio de trabajo.')
    }
    metadataUpdated = true
  } else {
    persistedMeta = metadataForPersist(null)
    const identity = { client_id: opts.clientId, coach_id: opts.coachId, org_id: opts.orgId ?? null }
    const templateInsertMeta = withoutProgramActive(persistedMeta)
    const templateFallbackInsertMeta = withoutProgramActive(baseMeta(persistedMeta))
    const initialMeta = opts.clientId
      ? (desiredActive ? { ...persistedMeta, is_active: false } : persistedMeta)
      : templateInsertMeta
    const fallbackInitialMeta = opts.clientId
      ? (desiredActive ? { ...baseMeta(persistedMeta), is_active: false } : baseMeta(persistedMeta))
      : templateFallbackInsertMeta
    // El fallback quita SOLO meta opcional: la identidad de workspace nunca se degrada.
    let ins = await supabase
      .from('workout_programs')
      .insert({ ...identity, ...initialMeta })
      .select('id')
      .single()
    if (ins.error && isMissingColumnError(ins.error)) {
      ins = await supabase
        .from('workout_programs')
        .insert({ ...identity, ...fallbackInitialMeta })
        .select('id')
        .single()
    }
    if (ins.error) throw ins.error
    pid = (ins.data as { id: string }).id
  }

  async function cleanupCreatedInactiveProgram() {
    if (!createdNew || !pid) return
    const plansResult = await supabase.from('workout_plans').select('id').eq('program_id', pid)
    if (plansResult.error) throw plansResult.error
    const planIds = (plansResult.data ?? []).map((row) => (row as { id: string }).id)
    if (planIds.length) {
      const deletePlans = await supabase.from('workout_plans').delete().in('id', planIds).select('id')
      if (deletePlans.error) throw deletePlans.error
      const deletedIds = new Set((deletePlans.data ?? []).map((row) => (row as { id: string }).id))
      if (planIds.some((id) => !deletedIds.has(id))) throw new Error('No se pudo limpiar todos los días del programa inactivo.')
    }
    let deleteProgram = supabase.from('workout_programs').delete().eq('id', pid)
    deleteProgram = opts.clientId
      ? deleteProgram.eq('client_id', opts.clientId)
      : deleteProgram.eq('coach_id', opts.coachId).is('client_id', null)
    deleteProgram = opts.orgId ? deleteProgram.eq('org_id', opts.orgId) : deleteProgram.is('org_id', null)
    const deleted = await deleteProgram.select('id').maybeSingle()
    if (deleted.error) throw deleted.error
    if (!deleted.data) throw new Error('No se pudo limpiar el programa nuevo inactivo.')
  }

  async function cleanupInsertedPlans() {
    if (insertedPlanIds.length === 0) return
    // FK workout_blocks.plan_id usa ON DELETE CASCADE; una sola sentencia atómica.
    const expectedIds = [...insertedPlanIds]
    const result = await supabase.from('workout_plans').delete().in('id', expectedIds).select('id')
    if (result.error) throw result.error
    const deletedIds = new Set((result.data ?? []).map((row) => (row as { id: string }).id))
    if (expectedIds.some((id) => !deletedIds.has(id))) throw new Error('No se pudo revertir todos los días nuevos.')
    insertedPlanIds.length = 0
  }

  async function cleanupInsertedBlocks() {
    if (insertedBlockIds.length === 0) return
    const expectedIds = [...insertedBlockIds]
    const result = await supabase.from('workout_blocks').delete().in('id', expectedIds).select('id')
    if (result.error) throw result.error
    const deletedIds = new Set((result.data ?? []).map((row) => (row as { id: string }).id))
    if (expectedIds.some((id) => !deletedIds.has(id))) throw new Error('No se pudo revertir todos los ejercicios nuevos.')
    insertedBlockIds.length = 0
  }

  async function restoreMetadata() {
    if (!pid || !metadataSnapshot || !metadataUpdated) return
    let query = supabase
      .from('workout_programs')
      .update(restorableProgramMetadata(metadataSnapshot))
      .eq('id', pid)
    query = opts.clientId
      ? query.eq('client_id', opts.clientId)
      : query.eq('coach_id', opts.coachId).is('client_id', null)
    query = opts.orgId ? query.eq('org_id', opts.orgId) : query.is('org_id', null)
    const restored = await query.select('id').maybeSingle()
    if (restored.error) throw restored.error
    if (!restored.data) throw new Error('No se pudo restaurar la metadata anterior.')
    metadataUpdated = false
  }

  async function reconcileExistingClientProgram(programId: string, clientId: string) {
    const existingResult = await supabase
      .from('workout_plans')
      .select('id, day_of_week, week_variant, workout_blocks ( id, order_index )')
      .eq('program_id', programId)
      .eq('client_id', clientId)
    if (existingResult.error) throw existingResult.error

    const existingPlans: ExistingPlan[] = ((existingResult.data ?? []) as any[]).map((plan) => ({
      id: plan.id,
      day_of_week: plan.day_of_week,
      week_variant: plan.week_variant,
      blocks: ((plan.workout_blocks ?? []) as any[]).map((block) => ({
        id: block.id,
        order_index: block.order_index,
      })),
    }))
    const desired = opts.variantSets.flatMap((set) => set.days
      .filter((day) => day.blocks.length > 0 || day.persist_empty)
      .map((day) => ({ day, variant: set.variant })))
    const { reuse, insertDesiredIndexes, deletePlanIds } = matchPlans(
      existingPlans,
      desired.map(({ day, variant }) => ({ day_of_week: day.id, week_variant: variant })),
    )
    const surplusBlockIds: string[] = []

    for (const { desiredIndex, planId } of reuse) {
      const { day, variant } = desired[desiredIndex]
      const planUpdate = await supabase
        .from('workout_plans')
        .update({
          title: programPlanTitle(persistedMeta.name, day.id, day.title),
          day_of_week: day.id,
          week_variant: variant,
          assigned_date: persistedMeta.start_date ?? null,
        })
        .eq('id', planId)
        .eq('program_id', programId)
        .eq('client_id', clientId)
        .select('id')
        .maybeSingle()
      if (planUpdate.error) throw planUpdate.error
      if (!planUpdate.data) throw new Error('No se pudo actualizar un día existente del programa.')

      const existingPlan = existingPlans.find((plan) => plan.id === planId)
      const { ops, deleteIds } = diffBlocksByPosition(existingPlan?.blocks ?? [], day.blocks.length)
      surplusBlockIds.push(...deleteIds)
      for (const op of ops) {
        const block = day.blocks[op.desiredIndex]
        if (op.kind === 'update') {
          const { plan_id: _planId, ...updatePayload } = blockInsert(block, op.desiredIndex, planId)
          void _planId
          const blockUpdate = await supabase
            .from('workout_blocks')
            .update(updatePayload)
            .eq('id', op.id)
            .eq('plan_id', planId)
            .select('id')
            .maybeSingle()
          if (blockUpdate.error) throw blockUpdate.error
          if (!blockUpdate.data) throw new Error('No se pudo actualizar un ejercicio existente.')
        } else {
          const blockInsertResult = await supabase
            .from('workout_blocks')
            .insert(blockInsert(block, op.desiredIndex, planId))
            .select('id')
            .single()
          if (blockInsertResult.error) throw blockInsertResult.error
          insertedBlockIds.push((blockInsertResult.data as { id: string }).id)
        }
      }
    }

    for (const desiredIndex of insertDesiredIndexes) {
      const { day, variant } = desired[desiredIndex]
      const planInsert = await supabase
        .from('workout_plans')
        .insert({
          program_id: programId,
          client_id: clientId,
          coach_id: opts.coachId,
          title: programPlanTitle(persistedMeta.name, day.id, day.title),
          day_of_week: day.id,
          week_variant: variant,
          assigned_date: persistedMeta.start_date ?? null,
          group_name: persistedPlanGroupName(day),
        })
        .select('id')
        .single()
      if (planInsert.error || !planInsert.data) throw planInsert.error ?? new Error('No se pudo crear un día del programa.')
      const planId = (planInsert.data as { id: string }).id
      insertedPlanIds.push(planId)
      if (day.blocks.length > 0) {
        const blocksInsert = await supabase
          .from('workout_blocks')
          .insert(day.blocks.map((block, index) => blockInsert(block, index, planId)))
          .select('id')
        if (blocksInsert.error) throw blocksInsert.error
        insertedBlockIds.push(...(blocksInsert.data ?? []).map((row) => (row as { id: string }).id))
        if ((blocksInsert.data ?? []).length !== day.blocks.length) throw new Error('No se pudo confirmar la creación de todos los ejercicios.')
      }
    }

    if (surplusBlockIds.length > 0) {
      const deletedBlocks = await supabase
        .from('workout_blocks')
        .delete()
        .in('id', surplusBlockIds)
        .in('plan_id', reuse.map(({ planId }) => planId))
        .select('id')
      if (deletedBlocks.error) throw deletedBlocks.error
      const deletedIds = new Set((deletedBlocks.data ?? []).map((row) => (row as { id: string }).id))
      if (surplusBlockIds.some((id) => !deletedIds.has(id))) throw new Error('No se pudo limpiar todos los ejercicios sobrantes.')
    }
    if (deletePlanIds.length > 0) {
      const deletedPlans = await supabase
        .from('workout_plans')
        .delete()
        .in('id', deletePlanIds)
        .eq('program_id', programId)
        .eq('client_id', clientId)
        .select('id')
      if (deletedPlans.error) throw deletedPlans.error
      const deletedIds = new Set((deletedPlans.data ?? []).map((row) => (row as { id: string }).id))
      if (deletePlanIds.some((id) => !deletedIds.has(id))) throw new Error('No se pudo limpiar todos los días sobrantes.')
    }
  }

  async function compensateFailure(persistError: unknown): Promise<never> {
    const compensationErrors: string[] = []
    async function compensate(label: string, action: () => Promise<void>) {
      try { await action() } catch (error) {
        compensationErrors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    if (activeSwapStarted && pid) {
      const rollback = activeSwapRollbackPlan({ targetProgramId: pid, targetWasActive, previousActiveIds, deactivatedIds })
      await compensate('estado del programa objetivo', () => setTargetActive(pid!, rollback.targetActive))
      await compensate('programas activos anteriores', () => setProgramsActive(rollback.reactivateIds, true))
    }
    if (createdNew) {
      await compensate('limpieza del programa nuevo', cleanupCreatedInactiveProgram)
    } else {
      await compensate('limpieza de ejercicios nuevos', cleanupInsertedBlocks)
      await compensate('limpieza de días nuevos', cleanupInsertedPlans)
      await compensate('restauración de metadata', restoreMetadata)
    }
    const persistMessage = persistError instanceof Error ? persistError.message : String(persistError)
    if (compensationErrors.length) {
      throw new Error(`${persistMessage} Compensación fallida: ${compensationErrors.join(' | ')}`)
    }
    throw persistError
  }

  try {
  if (opts.programId && opts.clientId) {
    await reconcileExistingClientProgram(opts.programId, opts.clientId)
    if (desiredActive && pid && !activeSwapStarted) {
      activeSwapStarted = true
      deactivatedIds = await deactivateOtherActive(pid)
      await setTargetActive(pid, true)
    }
  } else {
  // Metadata ya tiene snapshot. Orden compensable:
  // 1) capturar planes viejos, 2) insertar nuevos, 3) swap activo, 4) borrar viejos al final.
  // Cualquier fallo previo al delete limpia inserts y restaura metadata + estado activo exacto.
  const { data: oldPlans, error: oldPlansError } = await supabase.from('workout_plans').select('id').eq('program_id', pid)
  if (oldPlansError) throw oldPlansError
  const oldIds = (oldPlans ?? []).map((p) => (p as { id: string }).id)

  for (const set of opts.variantSets) {
    for (const day of set.days) {
      if (day.blocks.length === 0 && !day.persist_empty) continue
      const { data: plan, error: planErr } = await supabase
        .from('workout_plans')
        .insert({
          program_id: pid,
          client_id: opts.clientId,
          coach_id: opts.coachId,
          title: programPlanTitle(persistedMeta.name, day.id, day.title),
          day_of_week: day.id,
          week_variant: set.variant,
          assigned_date: persistedMeta.start_date ?? null,
          group_name: persistedPlanGroupName(day),
        })
        .select('id')
        .single()
      if (planErr || !plan) throw planErr ?? new Error('No se pudo crear un día del programa.')
      insertedPlanIds.push((plan as { id: string }).id)
      if (day.blocks.length > 0) {
        const inserts = day.blocks.map((b, i) => blockInsert(b, i, (plan as { id: string }).id))
        const { error: blkErr } = await supabase.from('workout_blocks').insert(inserts)
        if (blkErr) throw blkErr
      }
    }
  }

  // Swap con hijos viejos intactos: targetWasActive + previousActiveIds permiten revertirlo.
  if (desiredActive && opts.clientId && pid && !activeSwapStarted) {
    activeSwapStarted = true
    deactivatedIds = await deactivateOtherActive(pid)
    await setTargetActive(pid, true)
  }

  // Último paso falible: DELETE ... IN es una sola sentencia SQL atómica.
  if (oldIds.length) {
    const { data: deletedPlans, error: deletePlansError } = await supabase.from('workout_plans').delete().in('id', oldIds).select('id')
    if (deletePlansError) throw deletePlansError
    const deletedIds = new Set((deletedPlans ?? []).map((row) => (row as { id: string }).id))
    if (oldIds.some((id) => !deletedIds.has(id))) throw new Error('No se pudo reemplazar todos los días anteriores.')
  }
  }
  } catch (persistError) {
    return await compensateFailure(persistError)
  }
  return pid as string
}

export default function ProgramBuilderScreen() {
  const {
    clientId, clientName, templateId, programId: programIdParam, mode,
    workspaceKind, teamId, orgId,
  } = useLocalSearchParams<{
    clientId?: string; clientName?: string; templateId?: string; programId?: string; mode?: string
    workspaceKind?: string; teamId?: string; orgId?: string
  }>()
  // Template mode = build/edit a reusable program with client_id null (no client).
  const isTemplate = mode === 'template' || !!templateId
  const { theme, resolvedScheme } = useTheme()
  const router = useRouter()
  const searchRef = useRef<BottomSheet>(null)
  const editorRef = useRef<BottomSheetModal>(null)
  const balanceRef = useRef<BottomSheetModal>(null)
  const previewRef = useRef<BottomSheetModal>(null)
  const configRef = useRef<BottomSheetModal>(null)
  const routeWorkspace = useMemo(
    () => parseClientActionWorkspace({ workspaceKind, teamId, orgId }),
    [workspaceKind, teamId, orgId],
  )
  const clientWorkspaceRef = useRef<ClientActionWorkspace | null>(routeWorkspace)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)
  const [actionWorkspace, setActionWorkspace] = useState<ClientActionWorkspace | null>(routeWorkspace)
  const [actionCoachId, setActionCoachId] = useState<string | null>(null)
  const assignedInOpenSheetRef = useRef<Set<string>>(new Set())
  const [programId, setProgramId] = useState<string | null>(null)
  const expectedUpdatedAtRef = useRef<string | null>(null)
  const [hydrationReloadKey, setHydrationReloadKey] = useState(0)
  const [initial, setInitial] = useState<DayState[]>(emptyDays())
  // Catálogo completo precargado (1:1 web): alimenta el sheet de añadir + enriquece media de bloques.
  const [catalog, setCatalog] = useState<ExerciseRow[]>([])
  const catalogRequestRef = useRef(0)
  const catById = useMemo(() => new Map(catalog.map((e) => [e.id, e])), [catalog])
  // E5-03: areas del builder (workout_section_templates) — mismo scope que web. Solo el
  // DATO + tipos disponibles para el reducer (superserie/orden por area); la UI de areas
  // la agrega otro worker. Vacio ⇒ el reducer cae al orden clasico W→M→C.
  const [areas, setAreas] = useState<WorkoutArea[]>([])

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
  const [endDate, setEndDate] = useState<string | null>(null)
  const [startDateFlexible, setStartDateFlexible] = useState(true)
  const [phases, setPhases] = useState<ProgramPhase[]>([])
  const [sourceTemplateId, setSourceTemplateId] = useState<string | null>(null)
  // Offline-first: autosave local del borrador + restaurar (ventaja nativa vs web).
  const [pendingDraft, setPendingDraft] = useState<any | null>(null)
  const hydratedRef = useRef(false)
  const hydrationGenerationRef = useRef(0)
  const activeDraftKeyRef = useRef<string | null>(null)
  const [draftKey, setDraftKey] = useState<string | null>(null)
  const dirtyTrackingReadyRef = useRef(false)
  const observedDraftSignatureRef = useRef<string | null>(null)
  const editGenerationRef = useRef(0)
  const autosavedEditGenerationRef = useRef(0)
  // Modo Simple/Normal (1:1 web). Default Normal. Persistido.
  const [isSimpleMode, setIsSimpleMode] = useState(false)
  const [modeLabel, setModeLabel] = useState<string | null>(null)
  const [showHint, setShowHint] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [titleEditing, setTitleEditing] = useState(false) // tap-to-edit del nombre en top bar (1:1 web, Pencil)
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
  const [pendingAreaId, setPendingAreaId] = useState<string>(LEGACY_SECTION_AREA_ID.main) // área destino al agregar ejercicio

  const builder = usePlanBuilder(initial, areas)
  const { days, addExercise, removeBlock, updateBlock, setDayBlocks, transferBlock, updateDayTitle, toggleRestDay, copyDay, toggleSuperset, setBlockArea, toggleBlockOverride, undo, redo, canUndo, canRedo, setDays } = builder
  const draftPayload = useMemo(() => ({
    name,
    structureType,
    durationType,
    weeks,
    cycleLength,
    durationDays,
    abMode,
    variant,
    days,
    otherDays,
    programNotes,
    startDate,
    endDate,
    startDateFlexible,
    phases,
    sourceTemplateId,
  }), [name, structureType, durationType, weeks, cycleLength, durationDays, abMode, variant, days, otherDays, programNotes, startDate, endDate, startDateFlexible, phases, sourceTemplateId])
  const draftSignature = useMemo(() => JSON.stringify(draftPayload), [draftPayload])

  // Entitlements: el editor de bloque gatea el tipo `cardio` por hasModule('cardio') (paridad
  // web: sin el modulo, cardio no es seleccionable). Visibilidad only; el gate de dinero vive
  // en el server. Fail-open (0 modulos) hasta la primera resolucion.
  const { hasModule } = useEntitlements()
  const cardioEnabled = hasModule('cardio')

  // Areas dinamicas (E5-04): VM con color/label por area + set de ids conocidos para resolver
  // la clave efectiva de cada bloque (section_template_id o area system del section legacy).
  const areaVMs = useMemo<MobileAreaVM[]>(() => buildMobileAreaVMs(areas), [areas])
  const knownAreaIds = useMemo(() => new Set(orderedAreaIds(areas)), [areas])
  const areaKeyOf = useCallback((b: BuilderBlock) => effectiveAreaKey(b, knownAreaIds), [knownAreaIds])
  // Bucket legacy (warmup/main/cooldown) que le corresponde a un area (para setear `section`
  // al agregar un ejercicio a esa area).
  const sectionForArea = useCallback((areaId: string): BuilderSection => {
    const a = areas.find((x) => x.id === areaId)
    if (a) return legacyBucketFor(a)
    return classicSlugForAreaId(areaId) ?? 'main'
  }, [areas])

  const liveDays = useRef(days)
  useEffect(() => { liveDays.current = days }, [days])

  // Slide de día sin remontar la lista (Reanimated, UI thread).
  const listRef = useRef<any>(null)
  const dayTx = useSharedValue(0)
  const daySlideStyle = useAnimatedStyle(() => ({ transform: [{ translateX: dayTx.value }] }))
  useEffect(() => {
    dayTx.value = slideDir.current * SLIDE
    dayTx.value = withTiming(0, { duration: 170, easing: Easing.out(Easing.cubic) })
    listRef.current?.scrollTo?.({ y: 0, animated: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDayId])

  // Refs para que el gesto de swipe sea estable (no se recree por cada edición).
  const activeDayIdRef = useRef(1)
  const simpleModeRef = useRef(false)
  useEffect(() => { activeDayIdRef.current = activeDayId })
  useEffect(() => { simpleModeRef.current = isSimpleMode })

  // Catálogo exacto del workspace. requestId+cleanup impiden que una respuesta stale gane.
  useEffect(() => {
    const requestId = ++catalogRequestRef.current
    let active = true
    void (async () => {
      const [coach, workspace] = await Promise.all([
        getCoachProfile(),
        routeWorkspace ? Promise.resolve(routeWorkspace) : getActiveCoachWorkspace(),
      ])
      if (!coach || !workspace) throw new Error('No se pudo resolver el workspace del catálogo.')
      const result = await listBuilderExercisesForWorkspace(coach.id, workspace)
      if (!active || requestId !== catalogRequestRef.current || result.coachId !== coach.id) return
      setCatalog(result.exercises)
    })().catch(() => {
      if (active && requestId === catalogRequestRef.current) setCatalog([])
    })
    return () => { active = false }
  }, [routeWorkspace])

  // E5-03: precarga de areas del builder segun el workspace del coach (standalone ⇒ system
  // + propias; enterprise ⇒ solo system). Mismo query que web. Resiliente: [] ante error.
  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const [coach, workspace] = await Promise.all([
          getCoachProfile(),
          routeWorkspace ? Promise.resolve(routeWorkspace) : getActiveCoachWorkspace(),
        ])
        if (!coach || !workspace) { if (active) setAreas([]); return }
        const scope = workspace.kind === 'enterprise'
          ? { coachId: null, teamId: null }
          : workspace.kind === 'standalone'
            ? { coachId: coach.id, teamId: null }
            : { coachId: null, teamId: workspace.teamId }
        const nextAreas = await listBuilderAreas(scope)
        if (active) setAreas(nextAreas)
      } catch { if (active) setAreas([]) }
    })()
    return () => { active = false }
  }, [routeWorkspace])

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

  function assignmentVariantSets(template: any, selectedDays: readonly number[]): {
    variant: 'A' | 'B'
    days: ProgramPersistDay[]
  }[] {
    const plans = filterTemplatePlansForAssignment(
      (template.workout_plans ?? []) as any[],
      selectedDays,
    )
    const structure = (template.program_structure_type as ProgramStructureType) ?? 'weekly'
    const len = structure === 'cycle' ? Math.max(1, Math.min(14, template.cycle_length ?? 4)) : 7
    const skeleton = buildDaySkeleton(structure, len, [])
    const variants: ('A' | 'B')[] = plans.some((plan) => (plan.week_variant ?? 'A') === 'B')
      ? ['A', 'B']
      : ['A']
    return variants.map((weekVariant) => ({
      variant: weekVariant,
      days: plans
        .filter((plan) => (plan.week_variant ?? 'A') === weekVariant)
        .sort((left, right) => left.day_of_week - right.day_of_week)
        .map((plan) => ({
          id: plan.day_of_week,
          name: skeleton.find((day) => day.id === plan.day_of_week)?.name ?? `Día ${plan.day_of_week}`,
          title: plan.title ?? '',
          blocks: ((plan.workout_blocks ?? []) as any[])
            .sort((left, right) => (left.order_index ?? 0) - (right.order_index ?? 0))
            .map(mapDbBlock),
          week_variant: weekVariant,
          group_name: plan.group_name ?? null,
          persist_empty: true,
        })),
    }))
  }

  useEffect(() => {
    const generation = ++hydrationGenerationRef.current
    let active = true
    const isCurrent = () => active && hydrationGenerationRef.current === generation
    hydratedRef.current = false
    activeDraftKeyRef.current = null
    dirtyTrackingReadyRef.current = false
    observedDraftSignatureRef.current = null
    editGenerationRef.current = 0
    autosavedEditGenerationRef.current = 0
    reshapeReady.current = false
    setDraftKey(null)
    setPendingDraft(null)
    setDirty(false)
    setProgramId(null)
    expectedUpdatedAtRef.current = null
    setName('Programa principal')
    setStructureType('weekly')
    setDurationType('weeks')
    setWeeks(4)
    setCycleLength(4)
    setDurationDays(null)
    setAbMode(false)
    setVariant('A')
    setProgramNotes('')
    setStartDate('')
    setEndDate(null)
    setStartDateFlexible(true)
    setPhases([])
    setSourceTemplateId(null)
    const blankDays = emptyDays()
    setInitial(blankDays)
    setDays(blankDays)
    setOtherDays(emptyDays())
    setActiveDayId(1)
    setLoading(true)
    void (async () => {
      // New template (no templateId) → start blank.
      let resourceOrgId: string | null
      let resourceCoachId: string
      let resourceWorkspace: ClientActionWorkspace
      if (isTemplate) {
        const [coach, workspace] = await Promise.all([
          getCoachProfile(),
          routeWorkspace ? Promise.resolve(routeWorkspace) : getActiveCoachWorkspace(),
        ])
        if (!isCurrent()) return
        if (!coach || !workspace) {
          setLoading(false)
          Alert.alert('Plantilla no disponible', 'No se pudo resolver el espacio de trabajo activo.', [
            { text: 'Volver', onPress: () => router.back() },
          ])
          return
        }
        resourceCoachId = coach.id
        resourceWorkspace = workspace
        clientWorkspaceRef.current = workspace
        resourceOrgId = workspaceOrgId(workspace)

      } else {
        const [coach, workspace] = await Promise.all([
          getCoachProfile(),
          routeWorkspace ? Promise.resolve(routeWorkspace) : getActiveCoachWorkspace(),
        ])
        if (!isCurrent()) return
        const validClient = clientId && coach && workspace
          ? await validateClientResource(clientId, workspace, coach.id)
          : false
        if (!isCurrent()) return
        if (!clientId || !coach || !workspace || !validClient) {
          setLoading(false)
          Alert.alert('Alumno no disponible', 'Este alumno no pertenece al espacio de trabajo activo.', [
            { text: 'Volver', onPress: () => router.back() },
          ])
          return
        }
        resourceCoachId = coach.id
        resourceWorkspace = workspace
        clientWorkspaceRef.current = workspace
        resourceOrgId = workspaceOrgId(workspace)
      }
      const resolveDraftKey = (concreteProgramId: string | null) => programBuilderDraftKey({
        coachId: resourceCoachId,
        workspace: resourceWorkspace,
        clientId,
        templateId,
        programId: concreteProgramId,
        isTemplate,
      })

      // New template starts blank, but only reads its account + workspace namespaced draft.
      if (isTemplate && !templateId) {
        const resolvedDraftKey = resolveDraftKey(null)
        activeDraftKeyRef.current = resolvedDraftKey
        setDraftKey(resolvedDraftKey)
        setName('Nueva plantilla')
        const dRaw = await AsyncStorage.getItem(resolvedDraftKey).catch(() => null)
        if (!isCurrent()) return
        if (dRaw) { try { setPendingDraft(JSON.parse(dRaw)) } catch {} }
        reshapeReady.current = true; hydratedRef.current = true; setLoading(false); return
      }
      // Carga rica (con meta extra) → si faltan columnas, fallback al set base.
      const { data: prog, error: programError } = await selectWithFallback<any>(
        () => {
          const q = supabase.from('workout_programs').select(PROGRAM_SELECT_RICH)
          if (templateId) return scopedTemplateQuery(PROGRAM_SELECT_RICH, templateId, resourceWorkspace, resourceCoachId)
          // P1 buscador: abrir el programa CONCRETO por id (espejo web builder/[clientId]?programId,
          // builder.queries.ts:84-97 filtra por `id`, NO por is_active). Sin programId → el programa
          // activo del alumno (default RN al entrar desde la ficha).
          const cq = programIdParam
            ? q.eq('id', programIdParam).eq('client_id', clientId!)
            : q.eq('client_id', clientId!).eq('is_active', true)
          return (resourceOrgId ? cq.eq('org_id', resourceOrgId) : cq.is('org_id', null)).maybeSingle()
        },
        () => {
          const q = supabase.from('workout_programs').select(PROGRAM_SELECT)
          if (templateId) return scopedTemplateQuery(PROGRAM_SELECT, templateId, resourceWorkspace, resourceCoachId)
          const cq = programIdParam
            ? q.eq('id', programIdParam).eq('client_id', clientId!)
            : q.eq('client_id', clientId!).eq('is_active', true)
          return (resourceOrgId ? cq.eq('org_id', resourceOrgId) : cq.is('org_id', null)).maybeSingle()
        }
      )
      if (!isCurrent()) return

      if (programError) {
        setLoading(false)
        Alert.alert('Recurso no disponible', programError.message ?? 'No se pudo cargar el programa.', [
          { text: 'Volver', onPress: () => router.back() },
        ])
        return
      }

      if (programIdParam && !prog) {
        setLoading(false)
        Alert.alert('Programa no disponible', 'El programa no pertenece al espacio de trabajo activo o ya no existe.', [
          { text: 'Volver', onPress: () => router.back() },
        ])
        return
      }

      if (templateId && (!prog || !templateMatchesActionWorkspace(prog, resourceWorkspace, resourceCoachId))) {
        setLoading(false)
        Alert.alert('Plantilla no disponible', 'La plantilla no pertenece al espacio de trabajo activo.', [
          { text: 'Volver', onPress: () => router.back() },
        ])
        return
      }

      const resolvedDraftKey = resolveDraftKey(prog?.id ?? programIdParam ?? null)
      activeDraftKeyRef.current = resolvedDraftKey
      setDraftKey(resolvedDraftKey)

      if (prog) {
        const structure = (prog.program_structure_type as ProgramStructureType) ?? 'weekly'
        const plans = (prog.workout_plans ?? []) as any[]
        // P-F8: ciclos de hasta 14 días, mismo contrato que web/schema.
        const len = structure === 'cycle' ? Math.max(1, Math.min(14, prog.cycle_length ?? 4)) : 7
        const hasB = plans.some((p: any) => (p.week_variant ?? 'A') === 'B')
        setProgramId(prog.id)
        expectedUpdatedAtRef.current = prog.updated_at ?? null
        setName(prog.name ?? 'Programa principal')
        setStructureType(structure)
        setDurationType((prog.duration_type as DurationType) ?? 'weeks')
        setWeeks(prog.weeks_to_repeat ?? 4)
        setCycleLength(len)
        setAbMode(Boolean(prog.ab_mode) || hasB)
        setProgramNotes(prog.program_notes ?? '')
        setStartDate(prog.start_date ?? '')
        setEndDate(prog.end_date ?? null)
        setDurationDays(prog.duration_days ?? null)
        setStartDateFlexible(prog.start_date_flexible ?? true)
        setPhases(Array.isArray(prog.program_phases) ? (prog.program_phases as ProgramPhase[]) : [])
        setSourceTemplateId(prog.source_template_id ?? null)
        const a = variantDays(plans, 'A', structure, len)
        setInitial(a)
        setDays(a)
        setOtherDays(variantDays(plans, 'B', structure, len))
      }
      const draftRaw = await AsyncStorage.getItem(resolvedDraftKey).catch(() => null)
      if (!isCurrent()) return
      if (draftRaw) { try { setPendingDraft(JSON.parse(draftRaw)) } catch {} }
      hydratedRef.current = true
      reshapeReady.current = true
      setLoading(false)
    })().catch((error: any) => {
      if (!isCurrent()) return
      setLoading(false)
      Alert.alert('Recurso no disponible', error?.message ?? 'No se pudo cargar el programa.', [
        { text: 'Volver', onPress: () => router.back() },
      ])
    })
    return () => { active = false }
  }, [clientId, templateId, programIdParam, isTemplate, routeWorkspace, hydrationReloadKey])

  useEffect(() => {
    if (loading || !hydratedRef.current || dirtyTrackingReadyRef.current) return
    observedDraftSignatureRef.current = draftSignature
    dirtyTrackingReadyRef.current = true
    editGenerationRef.current = 0
    autosavedEditGenerationRef.current = 0
    setDirty(false)
  }, [loading, draftKey, draftSignature])

  useEffect(() => {
    if (!hydratedRef.current || !dirtyTrackingReadyRef.current) return
    if (observedDraftSignatureRef.current === draftSignature) return
    observedDraftSignatureRef.current = draftSignature
    editGenerationRef.current += 1
    setDirty(true)
  }, [draftSignature])

  // Autosave del borrador (debounce). Pausado mientras se ofrece restaurar uno previo.
  useEffect(() => {
    const editGeneration = editGenerationRef.current
    if (!shouldAutosaveProgramDraft({
      hydrated: hydratedRef.current,
      trackingReady: dirtyTrackingReadyRef.current,
      dirty,
      editGeneration,
      autosavedEditGeneration: autosavedEditGenerationRef.current,
      hasPendingDraft: Boolean(pendingDraft),
      hasDraftKey: Boolean(draftKey),
    })) return
    if (!draftKey) return
    const generation = hydrationGenerationRef.current
    const key = draftKey
    let interactionTask: ReturnType<typeof InteractionManager.runAfterInteractions> | null = null
    const t = setTimeout(() => {
      // Serializar/persistir fuera del hilo de interacción para no competir con gestos.
      interactionTask = InteractionManager.runAfterInteractions(() => {
        if (
          hydrationGenerationRef.current !== generation
          || activeDraftKeyRef.current !== key
          || !hydratedRef.current
          || editGenerationRef.current !== editGeneration
        ) return
        const draft = { ...draftPayload, savedAt: Date.now() }
        AsyncStorage.setItem(key, JSON.stringify(draft))
          .then(() => {
            if (editGenerationRef.current === editGeneration && activeDraftKeyRef.current === key) {
              autosavedEditGenerationRef.current = editGeneration
            }
          })
          .catch(() => {})
      })
    }, 2500)
    return () => {
      clearTimeout(t)
      interactionTask?.cancel()
    }
  }, [dirty, draftKey, draftPayload, pendingDraft])

  // Marca "sin guardar" tras la primera edición real (post-hidratación).
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

  // Chip de día 1:1 web: card suelta (activo=foreground, inactivo=card+shadow), etiqueta (3
  // letras) + Moon (descanso) / dot (con ejercicios → marca; vacío → muted tenue).
  function renderDayTab(d: DayState) {
    const active = d.id === activeDayId
    const has = d.blocks.length > 0
    return (
      <TouchableOpacity key={d.id} onPress={() => { slideDir.current = d.id > activeDayId ? 1 : -1; setActiveDayId(d.id) }} activeOpacity={0.85}
        style={[styles.dayTab, active ? { backgroundColor: theme.foreground } : { backgroundColor: theme.card, ...SHADOWS[resolvedScheme].sm }]}>
        <Text style={[styles.dayTabLabel, { color: active ? theme.background : theme.foreground, fontFamily: FONT.displayBold }]}>{dayLabel(structureType, d).slice(0, 3)}</Text>
        {d.is_rest ? (
          <Moon size={12} color={active ? theme.background : theme.mutedForeground} />
        ) : (
          <View style={[styles.dayDot, { backgroundColor: has ? (active ? theme.background : theme.primary) : theme.mutedForeground, opacity: has ? 1 : 0.4 }]} />
        )}
      </TouchableOpacity>
    )
  }

  // E5-04: color efectivo de un area VM (main = marca / theme.primary; resto = color fijo).
  const areaColor = useCallback((vm: MobileAreaVM) => vm.color ?? theme.primary, [theme.primary])

  // Bloques del dia agrupados por AREA en orden de render (sort_order). Cada grupo es la
  // fuente de la lista draggable de esa area; el drag SOLO reordena dentro del area (mover
  // de area es via el selector del bloque → setBlockArea, persiste section_template_id).
  const areaGroups = useMemo(() => {
    const blocks = currentDay?.blocks ?? []
    return areaVMs
      .map((vm) => ({ vm, blocks: blocks.filter((b) => areaKeyOf(b) === vm.id) }))
      .filter((g) => g.blocks.length > 0)
  }, [currentDay, areaVMs, areaKeyOf])

  // Al soltar dentro de un area: recomponer el dia preservando el orden del resto de areas y
  // renormalizar superseries (sanitizeSupersets, misma resolucion de area que el reducer).
  function reorderArea(areaId: string, reordered: BuilderBlock[]) {
    if (!currentDay) return
    const groups = new Map<string, BuilderBlock[]>()
    for (const b of currentDay.blocks) {
      const key = areaKeyOf(b)
      const g = groups.get(key)
      if (g) g.push(b); else groups.set(key, [b])
    }
    groups.set(areaId, reordered)
    const order = orderedAreaIds(areas)
    const rebuilt: BuilderBlock[] = []
    const used = new Set<string>()
    for (const id of order) { const g = groups.get(id); if (g) { rebuilt.push(...g); used.add(id) } }
    for (const [id, g] of groups) if (!used.has(id)) rebuilt.push(...g)
    setDayBlocks(currentDay.id, sanitizeSupersets(rebuilt, areaKeyOf))
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
  }

  function addToArea(areaId: string) {
    setPendingAreaId(areaId)
    searchRef.current?.snapToIndex(2)
  }

  // Render de un bloque dentro de su area (incluye el conector de superserie con el siguiente
  // de la MISMA area). Mover de area: BuilderBlockCard → onSetArea → setBlockArea (reducer).
  function renderAreaBlock(areaBlocks: BuilderBlock[], areaId: string) {
    return ({ item, drag, isActive }: { item: BuilderBlock; drag: () => void; isActive: boolean }) => {
      const block = item
      const cat = catById.get(block.exercise_id)
      const pos = areaBlocks.findIndex((b) => b.uid === block.uid)
      const next = areaBlocks[pos + 1]
      const isLastInArea = pos === areaBlocks.length - 1
      const linkedToNext = !!block.superset_group && block.superset_group === next?.superset_group
      // E4: reordenar dentro del área intercambiando con el vecino (rail de chevrons ▲▼).
      const move = (dir: 1 | -1) => {
        const j = pos + dir
        if (j < 0 || j >= areaBlocks.length) return
        const arr = [...areaBlocks]
        ;[arr[pos], arr[j]] = [arr[j], arr[pos]]
        reorderArea(areaId, arr)
      }
      return (
        <View>
          <BuilderBlockCard
            block={block}
            drag={drag}
            isActive={isActive}
            areaVMs={areaVMs}
            currentAreaId={areaKeyOf(block)}
            onEdit={openEditor}
            onRemove={(uid) => removeBlock(activeDayId, uid)}
            onUpdate={updateBlock}
            onSetArea={(uid, aId) => setBlockArea(activeDayId, uid, aId)}
            onToggleSuperset={(uid) => toggleSuperset(activeDayId, uid)}
            onMoveUp={() => move(-1)}
            onMoveDown={() => move(1)}
            canMoveUp={pos > 0}
            canMoveDown={pos < areaBlocks.length - 1}
            catGif={cat?.gif_url}
            catImage={cat?.image_url}
            catVideo={cat?.video_url}
          />
          {!isLastInArea ? (
            linkedToNext ? (
              <View style={styles.ssConnector}>
                <View style={[styles.ssLine, { backgroundColor: theme.primary + '33' }]} />
                <TouchableOpacity onPress={() => toggleSuperset(activeDayId, block.uid)} activeOpacity={0.8} style={[styles.ssPill, { borderColor: theme.primary + '33', backgroundColor: theme.primary + '1A' }]}>
                  <Text style={[styles.ssPillTxt, { color: theme.primary, fontFamily: FONT.uiBold }]}>SS · {block.superset_group}</Text>
                </TouchableOpacity>
                <View style={[styles.ssLine, { backgroundColor: theme.primary + '33' }]} />
              </View>
            ) : (
              <View style={styles.ssConnector}>
                <TouchableOpacity onPress={() => toggleSuperset(activeDayId, block.uid)} activeOpacity={0.8} style={[styles.ssLinkBtn, { borderColor: theme.border }]}>
                  <Link2 size={13} color={theme.mutedForeground} />
                  <Text style={[styles.ssLinkTxt, { color: theme.mutedForeground, fontFamily: FONT.uiBold }]}>Superserie</Text>
                </TouchableOpacity>
              </View>
            )
          ) : null}
        </View>
      )
    }
  }

  // E5-04: encabezado de area (dot + nombre + conteo + añadir) + lista draggable acotada al area.
  function renderArea(group: { vm: MobileAreaVM; blocks: BuilderBlock[] }) {
    const { vm, blocks } = group
    const c = areaColor(vm)
    return (
      <View key={vm.id} style={{ gap: 8 }}>
        <View style={[styles.sectionHeader, { borderColor: c + '55', backgroundColor: c + '12' }]}>
          <View style={[styles.sectionDot, { backgroundColor: c }]} />
          <Text style={[styles.sectionTitle, { color: c, fontFamily: FONT.display }]}>{vm.name.toUpperCase()}</Text>
          <View style={[styles.sectionCount, { borderColor: c + '55' }]}>
            <Text style={[styles.sectionCountText, { color: c, fontFamily: theme.fontSans }]}>{blocks.length}</Text>
          </View>
          <TouchableOpacity onPress={() => addToArea(vm.id)} hitSlop={8} activeOpacity={0.8} style={[styles.sectionAdd, { borderColor: c + '55' }]}>
            <Plus size={14} color={c} />
          </TouchableOpacity>
        </View>
        <NestableDraggableFlatList
          data={blocks}
          keyExtractor={(b) => b.uid}
          onDragBegin={() => Haptics.selectionAsync().catch(() => {})}
          onDragEnd={({ data }) => reorderArea(vm.id, data)}
          activationDistance={14}
          renderItem={renderAreaBlock(blocks, vm.id)}
        />
      </View>
    )
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
      { id: 'top-config-button', title: 'Empieza en Configurar', description: 'Define estructura, duración y fases del programa en la tuerca ámbar.', placement: 'bottom' },
      { id: 'ab-toggle', title: 'Semanas A/B', description: 'Activa rutinas alternas A/B para microciclos semanales.', placement: 'bottom' },
      { id: 'days-board', title: 'Arma cada día', description: 'Toca un día para editarlo; desliza a los lados para cambiar de día.', placement: 'bottom' },
      { id: 'more-menu', title: 'Más opciones', description: 'Plantillas, balance muscular, vista previa, asignar, imprimir y deshacer/rehacer.', placement: 'bottom' },
      { id: 'save-button', title: 'Guarda al terminar', description: 'El botón Guardar deja el programa listo para seguir editándolo o asignarlo.', placement: 'top' },
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
      end_date: isActive ? endDate : null,
      start_date_flexible: startDateFlexible,
      duration_days: durationType === 'weeks' ? null : durationDays,
      program_phases: phases.length ? phases : null,
      source_template_id: isActive
        ? (sourceTemplateId ?? (isTemplate ? (programId ?? templateId ?? null) : null))
        : null,
      last_edited_by_coach_id: null,
    }
  }
  function currentVariantSets(): { variant: 'A' | 'B'; days: DayState[] }[] {
    return abMode
      ? [{ variant, days }, { variant: variant === 'A' ? 'B' : 'A', days: otherDays }]
      : [{ variant: 'A', days }]
  }

  async function resolveBuilderActionContext() {
    const coach = await getCoachProfile()
    if (!coach) throw new Error('Coach no encontrado')
    const workspace = clientWorkspaceRef.current ?? routeWorkspace ?? await getActiveCoachWorkspace()
    if (!workspace) throw new Error('No se pudo resolver el espacio de trabajo activo.')
    if (!isTemplate && clientId && !(await validateClientResource(clientId, workspace, coach.id))) {
      throw new Error('Este alumno ya no pertenece al espacio de trabajo activo.')
    }
    clientWorkspaceRef.current = workspace
    setActionCoachId(coach.id)
    setActionWorkspace(workspace)
    return { coachId: coach.id, workspace }
  }

  async function openTemplatePicker() {
    setMenuOpen(false)
    try {
      await resolveBuilderActionContext()
      setTemplateOpen(true)
    } catch (error: any) {
      toast.error(error?.message ?? 'No se pudo abrir la lista de plantillas.')
    }
  }

  async function openAssignClients() {
    setMenuOpen(false)
    if (!canAssignProgramToClients({ isTemplate, programId })) {
      toast.error('Guarda la plantilla antes de asignarla a alumnos.')
      return
    }
    try {
      await resolveBuilderActionContext()
      assignedInOpenSheetRef.current = new Set()
      setAssignOpen(true)
    } catch (error: any) {
      toast.error(error?.message ?? 'No se pudo abrir la lista de alumnos.')
    }
  }

  async function assignToClients(
    clientIds: string[],
    workspace: ClientActionWorkspace,
    options: AssignClientsOptions,
  ) {
    if (!canAssignProgramToClients({ isTemplate, programId })) {
      toast.error('Guarda la plantilla antes de asignarla a alumnos.')
      return
    }
    const pendingClientIds = pendingClientAssignments(clientIds, assignedInOpenSheetRef.current)
    if (pendingClientIds.length === 0) {
      toast.success('Los alumnos seleccionados ya fueron asignados en este envío.')
      return
    }
    setSaving(true)
    try {
      const coach = await getCoachProfile()
      if (!coach) throw new Error('Coach no encontrado')
      const orgId = workspaceOrgId(workspace)
      const templateResult = await selectWithFallback<any>(
        () => scopedTemplateQuery(PROGRAM_SELECT_RICH, programId!, workspace, coach.id),
        () => scopedTemplateQuery(PROGRAM_SELECT, programId!, workspace, coach.id),
      )
      if (templateResult.error) throw templateResult.error
      const template = templateResult.data
      if (!template || !templateMatchesActionWorkspace(template, workspace, coach.id)) {
        throw new Error('Plantilla no encontrada.')
      }
      const variantSets = assignmentVariantSets(template, options.selectedDays)
      const assignmentWeeks = normalizeAssignmentWeeks(options.durationWeeks, template.weeks_to_repeat ?? 4)
      const assignmentMeta: ProgramMetaPayload = {
        name: template.name,
        program_structure_type: (template.program_structure_type as ProgramStructureType) ?? 'weekly',
        duration_type: (template.duration_type as DurationType) ?? 'weeks',
        weeks_to_repeat: assignmentWeeks,
        cycle_length: template.program_structure_type === 'cycle' ? (template.cycle_length ?? null) : null,
        ab_mode: Boolean(template.ab_mode),
        is_active: true,
        duration_days: template.duration_days ?? null,
        program_notes: template.program_notes ?? null,
        start_date: options.startDateFlexible ? null : options.startDate,
        end_date: null,
        start_date_flexible: options.startDateFlexible,
        program_phases: Array.isArray(template.program_phases) ? template.program_phases : null,
        source_template_id: programId,
        last_edited_by_coach_id: null,
      }
      const assigned: string[] = []
      const assignedProgramIds: string[] = []
      const failed: { clientId: string; message: string }[] = []
      for (const cid of pendingClientIds) {
        try {
          // Revalidación inmediatamente anterior a persistir; un fallo no aborta el resto.
          if (!(await validateClientResource(cid, workspace, coach.id))) {
            throw new Error('El alumno ya no pertenece al espacio de trabajo activo.')
          }
          const assignedProgramId = await persistProgram({
            coachId: coach.id,
            clientId: cid,
            programId: null,
            meta: assignmentMeta,
            variantSets,
            orgId,
          })
          assigned.push(cid)
          assignedProgramIds.push(assignedProgramId)
          assignedInOpenSheetRef.current.add(cid)
        } catch (error: any) {
          failed.push({ clientId: cid, message: error?.message ?? 'No se pudo asignar.' })
        }
      }
      if (assignedProgramIds.length > 0) {
        // El envío vive en servidor (Resend + branding + idempotencia). Es best-effort,
        // igual que en web: un fallo de correo nunca revierte una asignación ya persistida.
        await apiFetch('/api/mobile/coach/program-assignment-notifications', {
          method: 'POST',
          authenticated: true,
          body: { workspace, programIds: assignedProgramIds },
        }).catch((error) => {
          console.error('[program-builder] assignment notification failed', error)
        })
      }
      if (assigned.length > 0) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      const totalAssigned = assignedInOpenSheetRef.current.size
      if (failed.length === 0) {
        setAssignOpen(false)
        toast.success(`Programa asignado a ${totalAssigned} alumno${totalAssigned === 1 ? '' : 's'}.`)
      } else if (assigned.length > 0) {
        toast.error(`Asignados ahora: ${assigned.length}. Total asignados: ${totalAssigned}. Fallidos: ${failed.length}. Reintenta para procesar solo los fallidos.`)
      } else {
        toast.error(`No se pudo asignar a ${failed.length} alumno${failed.length === 1 ? '' : 's'}.`)
      }
    } catch (e: any) {
      toast.error(e?.message ?? 'No se pudo asignar.')
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
    try {
      const { coachId, workspace } = await resolveBuilderActionContext()
      const result = await selectWithFallback<any>(
        () => scopedTemplateQuery(PROGRAM_SELECT_RICH, id, workspace, coachId),
        () => scopedTemplateQuery(PROGRAM_SELECT, id, workspace, coachId),
      )
      if (result.error) throw result.error
      const prog = result.data as any
      if (!prog || !templateMatchesActionWorkspace(prog, workspace, coachId)) {
        throw new Error('La plantilla no está disponible en este espacio de trabajo.')
      }
      const structure = (prog.program_structure_type as ProgramStructureType) ?? 'weekly'
      const plans = (prog.workout_plans ?? []) as any[]
      const len = structure === 'cycle' ? Math.max(1, Math.min(14, prog.cycle_length ?? 4)) : 7
      const hasB = plans.some((p: any) => (p.week_variant ?? 'A') === 'B')
      setName((current) => programId ? current : (prog.name ?? current))
      setStructureType(structure)
      setDurationType((prog.duration_type as DurationType) ?? 'weeks')
      setWeeks(prog.weeks_to_repeat ?? 4)
      setCycleLength(len)
      setAbMode(Boolean(prog.ab_mode) || hasB)
      setVariant('A')
      setProgramNotes(prog.program_notes ?? '')
      setDurationDays(prog.duration_days ?? null)
      if (prog.start_date_flexible != null) setStartDateFlexible(prog.start_date_flexible)
      if (Array.isArray(prog.program_phases) && prog.program_phases.length > 0) {
        setPhases(prog.program_phases as ProgramPhase[])
      }
      setSourceTemplateId(isTemplate ? null : id)
      reshapeReady.current = true
      setDays(variantDays(plans, 'A', structure, len))
      setOtherDays(variantDays(plans, 'B', structure, len))
      setActiveDayId(1)
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    } catch (error: any) {
      toast.error(error?.message ?? 'No se pudo cargar la plantilla.')
      throw error
    }
  }

  function recoverDraft() {
    const d = pendingDraft
    if (!d) return
    reshapeReady.current = true
    setName(d.name ?? name)
    setStructureType(d.structureType ?? 'weekly')
    setDurationType(d.durationType ?? 'weeks')
    setWeeks(d.weeks ?? 4)
    setCycleLength(Math.max(1, Math.min(14, Number(d.cycleLength) || 4)))
    setDurationDays(d.durationDays ?? null)
    setAbMode(!!d.abMode)
    setVariant(d.variant ?? 'A')
    setProgramNotes(d.programNotes ?? '')
    setStartDate(d.startDate ?? '')
    setEndDate(d.endDate ?? null)
    setStartDateFlexible(d.startDateFlexible ?? true)
    setPhases(Array.isArray(d.phases) ? d.phases : [])
    setSourceTemplateId(d.sourceTemplateId ?? null)
    setOtherDays(Array.isArray(d.otherDays) ? d.otherDays : emptyDays())
    setDays(Array.isArray(d.days) ? d.days : emptyDays())
    setActiveDayId(1)
    setPendingDraft(null)
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
  }
  function discardDraft() {
    if (draftKey) AsyncStorage.removeItem(draftKey).catch(() => {})
    setPendingDraft(null)
  }

  async function reloadProgramFromServer() {
    if (draftKey) await AsyncStorage.removeItem(draftKey).catch(() => {})
    setPendingDraft(null)
    setHydrationReloadKey((current) => current + 1)
  }

  async function handleSave(force = false) {
    if (!name.trim()) { Alert.alert('Nombre requerido', 'Ingresa un nombre para el programa.'); return }
    const hasAny = days.some((d) => d.blocks.length > 0) || (abMode && otherDays.some((d) => d.blocks.length > 0))
    if (!hasAny) { Alert.alert('Sin ejercicios', 'Agrega al menos un ejercicio en algún día.'); return }
    // P-F5 (E5-07): guard de bloques POR TIPO — evita persistir incompletos (strength: series+reps;
    // cardio/movilidad/roller: su prescripción mínima). Espeja el blockIncomplete de la web.
    const allBlocks = [...days, ...(abMode ? otherDays : [])].flatMap((d) => d.blocks)
    const invalid = allBlocks.find(blockIncomplete)
    if (invalid) { Alert.alert('Ejercicio incompleto', `Revisa "${invalid.exercise_name}": faltan datos (series/reps, duración o distancia según el tipo).`); return }
    setSaving(true)
    let currentCoachId: string | null = null
    try {
      const coach = await getCoachProfile()
      if (!coach) throw new Error('Coach no encontrado')
      currentCoachId = coach.id
      let resourceOrgId: string | null
      if (isTemplate) {
        const workspace = clientWorkspaceRef.current ?? routeWorkspace ?? await getActiveCoachWorkspace()
        if (!workspace) throw new Error('No se pudo resolver el espacio de trabajo activo.')
        clientWorkspaceRef.current = workspace
        resourceOrgId = workspaceOrgId(workspace)
      } else {
        const workspace = clientWorkspaceRef.current ?? routeWorkspace ?? await getActiveCoachWorkspace()
        if (!clientId || !workspace || !(await validateClientResource(clientId, workspace, coach.id))) {
          throw new Error('Este alumno ya no pertenece al espacio de trabajo activo.')
        }
        clientWorkspaceRef.current = workspace
        resourceOrgId = workspaceOrgId(workspace)
      }
      const pid = await persistProgram({
        coachId: coach.id,
        clientId: isTemplate ? null : (clientId ?? null),
        programId,
        meta: buildMeta(isTemplate ? false : true),
        variantSets: currentVariantSets(),
        orgId: resourceOrgId,
        expectedUpdatedAt: expectedUpdatedAtRef.current,
        force,
      })
      setProgramId(pid)
      setDirty(false)
      hydratedRef.current = false
      activeDraftKeyRef.current = null
      if (draftKey) AsyncStorage.removeItem(draftKey).catch(() => {})
      router.back()
    } catch (e: any) {
      if (e instanceof ProgramOptimisticConflictError) {
        let who = 'Otro coach'
        if (e.editorCoachId && e.editorCoachId !== currentCoachId) {
          const editor = await supabase
            .from('coaches')
            .select('full_name, brand_name')
            .eq('id', e.editorCoachId)
            .maybeSingle()
          who = editor.data?.full_name || editor.data?.brand_name || who
        }
        Alert.alert(
          `${who} guardó cambios en este programa mientras editabas.`,
          undefined,
          [
            { text: 'Ver lo nuevo', onPress: () => { void reloadProgramFromServer() } },
            { text: 'Guardar igual', onPress: () => { void handleSave(true) } },
          ],
          { cancelable: false },
        )
      } else {
        toast.error(e?.message ?? 'No se pudo guardar.')
      }
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
          {titleEditing ? (
            <TextInput value={name} onChangeText={setName} autoFocus onBlur={() => setTitleEditing(false)} onSubmitEditing={() => setTitleEditing(false)}
              placeholder="Nombre del programa" placeholderTextColor={theme.mutedForeground}
              style={[styles.progTitle, { color: theme.foreground, fontFamily: FONT.displayBold, padding: 0 }]} />
          ) : (
            <TouchableOpacity onPress={() => setTitleEditing(true)} activeOpacity={0.7} style={styles.titleTapRow}>
              <Text numberOfLines={1} style={[styles.progTitle, { color: theme.foreground, fontFamily: FONT.displayBold, flexShrink: 1 }]}>{name || 'Nombre del programa'}</Text>
              <Pencil size={12} color={theme.mutedForeground} />
            </TouchableOpacity>
          )}
          {dirty ? (
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: theme.warning }]} />
              <Text style={[styles.statusText, { color: theme.warning, fontFamily: FONT.uiMedium }]}>Sin guardar</Text>
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
                transition={{ loop: true, type: 'timing', duration: 1500 }} style={[styles.pingAmber, { backgroundColor: theme.warning }]} />
            ) : null}
            <TouchableOpacity ref={regTour('top-config-button')} onPress={() => { setConfigOpen(true); configRef.current?.present() }} hitSlop={6} style={[styles.gearBtn, { borderColor: theme.warning + '66' }]}>
              <SlidersHorizontal size={17} color={theme.warning} />
            </TouchableOpacity>
          </View>
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
            <View style={[styles.abSeg, { backgroundColor: theme.secondary, marginLeft: 0 }]}>
              {(['A', 'B'] as const).map((v) => (
                <TouchableOpacity key={v} onPress={() => switchVariant(v)} activeOpacity={0.85} style={[styles.abSegItem, variant === v && { backgroundColor: theme.background }]}>
                  <Text style={{ fontSize: 11, fontFamily: FONT.display, color: variant === v ? theme.foreground : theme.mutedForeground }}>Semana {v}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
          {/* Resumen de estructura (1:1 web: ml-auto 11px bold) */}
          <Text numberOfLines={1} style={[styles.abSummary, { color: theme.mutedForeground, fontFamily: FONT.uiBold }]}>
            {structureType === 'weekly' ? 'Semanal' : `Ciclo ${cycleLength}d`} · {weeks} sem
          </Text>
        </View>
      ) : null}

      {/* Chips de día — sueltos sobre la superficie (sin barra de fondo), centrados o scrollables (1:1 web) */}
      <View style={styles.dayTabsBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayTabsContent}>
          <View ref={regTour('days-board')} collapsable={false} style={styles.dayTabsRow}>
            {days.map((d) => renderDayTab(d))}
          </View>
        </ScrollView>
      </View>

      {pendingDraft ? (
        <View style={[styles.draftBanner, { borderColor: theme.primary + '33', backgroundColor: theme.primary + '14' }]}>
          <History size={18} color={theme.primary} />
          <Text style={[styles.draftText, { color: theme.foreground, fontFamily: theme.fontSans }]} numberOfLines={2}>Hay un borrador sin guardar de este programa.</Text>
          <View style={styles.draftActions}>
            <TouchableOpacity onPress={discardDraft} hitSlop={6}>
              <Text style={[styles.draftDiscard, { color: theme.mutedForeground, fontFamily: FONT.uiSemibold }]}>Descartar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={recoverDraft} activeOpacity={0.85} style={[styles.draftBtn, { backgroundColor: theme.primary }]}>
              <Text style={[styles.draftBtnText, { color: theme.primaryForeground, fontFamily: FONT.display }]}>Recuperar</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <GestureDetector gesture={dayGesture}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Animated.View style={[{ flex: 1 }, daySlideStyle]}>
        <NestableScrollContainer
          ref={listRef}
          contentContainerStyle={scrollContentStyle}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Encabezado del día (AB + fases + card de título/volumen) */}
          <View style={{ gap: 10, paddingBottom: 6 }}>
            {isSimpleMode && abMode ? (
              <View style={[styles.abSeg, { backgroundColor: theme.secondary, alignSelf: 'center' }]}>
                {(['A', 'B'] as const).map((v) => (
                  <TouchableOpacity key={v} onPress={() => switchVariant(v)} activeOpacity={0.85} style={[styles.abSegItem, variant === v && { backgroundColor: theme.background }]}>
                    <Text style={{ fontSize: 11, fontFamily: FONT.display, color: variant === v ? theme.foreground : theme.mutedForeground }}>{v}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            {!isSimpleMode && phases.length ? <ProgramPhasesBar phases={phases} weeks={weeks} /> : null}

            <View style={[styles.dayCard, { borderColor: theme.border, backgroundColor: theme.card }]}>
              <View style={styles.dayHeader}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.dayMiniLabel, { color: theme.mutedForeground, fontFamily: FONT.uiBold }]}>{currentDay.name}</Text>
                  {currentDay.is_rest ? (
                    <Text style={[styles.dayBigTitle, { color: theme.foreground, fontFamily: FONT.displayBold }]}>Descanso</Text>
                  ) : (
                    <TextInput value={currentDay.title} onChangeText={(v) => updateDayTitle(currentDay.id, v)} placeholder={currentDay.name} placeholderTextColor={theme.mutedForeground}
                      style={[styles.dayBigTitle, { color: theme.foreground, fontFamily: FONT.displayBold }]} />
                  )}
                </View>
                <TouchableOpacity onPress={() => toggleRestDay(currentDay.id)} activeOpacity={0.8}
                  style={[styles.restBtn, { borderColor: currentDay.is_rest ? theme.primary : theme.border, backgroundColor: currentDay.is_rest ? theme.primary : 'transparent' }]}>
                  {currentDay.is_rest ? <Sun size={15} color={theme.primaryForeground} /> : <Moon size={15} color={theme.mutedForeground} />}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setCopyOpen(true)} activeOpacity={0.8} style={[styles.restBtn, { borderColor: theme.border }]}>
                  <Copy size={15} color={theme.mutedForeground} />
                </TouchableOpacity>
              </View>

              {!isSimpleMode && !currentDay.is_rest ? (
                <View style={styles.volRow}>
                  <View style={[styles.volChip, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
                    <Text style={[styles.volLbl, { color: theme.mutedForeground }]}>Ej.</Text>
                    <Text style={[styles.volVal, { color: theme.foreground }]}>{currentDay.blocks.length}</Text>
                  </View>
                  <View style={[styles.volChip, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
                    <Text style={[styles.volLbl, { color: theme.mutedForeground }]}>Series</Text>
                    <Text style={[styles.volVal, { color: theme.foreground }]}>{dayTotalSets}</Text>
                  </View>
                  <View style={styles.volDots}>
                    {dayMuscles.map((m) => <View key={m} style={[styles.muscleDot, { backgroundColor: getMuscleColor(m) }]} />)}
                  </View>
                </View>
              ) : null}
            </View>
          </View>

          {/* P8: una lista draggable por sección (headers fijos) o panel de descanso */}
          {currentDay.is_rest ? (
            <View style={styles.restPanel}>
              <View style={[styles.restIconBox, { backgroundColor: theme.secondary }]}>
                <Moon size={24} color={theme.mutedForeground} />
              </View>
              <Text style={[styles.restPanelTitle, { color: theme.foreground, fontFamily: FONT.displayBold }]}>Día de descanso</Text>
              <Text style={[styles.restPanelSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>No se programa entrenamiento.</Text>
              <TouchableOpacity onPress={() => toggleRestDay(currentDay.id)} activeOpacity={0.85} style={[styles.restPanelBtn, { borderColor: theme.border }]}>
                <Text style={[styles.restPanelBtnText, { color: theme.foreground, fontFamily: FONT.uiBold }]}>Añadir ejercicios</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={{ gap: 14 }}>
              {areaGroups.length ? (
                areaGroups.map(renderArea)
              ) : (
                <View style={styles.emptyDayHint}>
                  <Text style={[styles.emptyDayTitle, { color: theme.foreground, fontFamily: FONT.display }]}>Día vacío</Text>
                  <Text style={[styles.emptyDaySub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Agrega ejercicios y organízalos por área (Calentamiento, Principal, Enfriamiento…).</Text>
                </View>
              )}
              <TouchableOpacity onPress={() => addToArea(LEGACY_SECTION_AREA_ID.main)} activeOpacity={0.8}
                style={[styles.addBtn, { borderColor: theme.border, backgroundColor: theme.card }]}>
                <Plus size={18} color={theme.primary} />
                <Text style={[styles.addText, { color: theme.primary, fontFamily: FONT.display }]}>Agregar ejercicio a {currentDay.name}</Text>
              </TouchableOpacity>
            </View>
          )}
        </NestableScrollContainer>
        </Animated.View>
      </KeyboardAvoidingView>
      </GestureDetector>

      <ExerciseSearchSheet
        ref={searchRef}
        exercises={catalog}
        dayBlockCount={currentDay?.blocks.length ?? 0}
        dayName={currentDay?.name ?? ''}
        simpleMode={isSimpleMode}
        onSelect={(block) => { addExercise(activeDayId, { ...block, dayId: activeDayId, section: sectionForArea(pendingAreaId), section_template_id: pendingAreaId }); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}) }}
      />
      <BlockEditorSheet ref={editorRef} block={editingBlock} onChange={updateBlock} onRemove={(uid) => { removeBlock(activeDayId, uid); editorRef.current?.dismiss() }}
        areaVMs={areaVMs} onSetArea={(uid, areaId) => setBlockArea(activeDayId, uid, areaId)} cardioEnabled={cardioEnabled}
        onToggleOverride={toggleBlockOverride} onToggleSuperset={(uid) => toggleSuperset(activeDayId, uid)} onClose={() => setEditingUid(null)}
        days={days.map((d) => ({ id: d.id, name: d.name }))} currentDayId={activeDayId} clientId={isTemplate ? undefined : clientId}
        onMoveToDay={(uid, target) => { transferBlock(uid, activeDayId, target); setActiveDayId(target); editorRef.current?.dismiss(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}) }} />

      <TemplatePickerSheet
        open={templateOpen}
        onClose={() => setTemplateOpen(false)}
        hasExistingData={currentVariantSets().some((set) => set.days.some((day) => day.blocks.length > 0))}
        workspace={actionWorkspace}
        coachId={actionCoachId}
        onSelect={loadTemplate}
      />
      <AssignClientsSheet
        open={assignOpen}
        onClose={() => { if (!saving) setAssignOpen(false) }}
        programName={name}
        workspace={actionWorkspace}
        coachId={actionCoachId}
        onAssign={(ids, workspace, options) => void assignToClients(ids, workspace, options)}
        saving={saving}
      />
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
          <Pressable
            style={[styles.modalBackdrop, { backgroundColor: theme.scheme === 'dark' ? theme.background : theme.foreground }]}
            onPress={() => setCopyOpen(false)}
          />
          <View style={[styles.modalCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.foreground, fontFamily: FONT.display }]}>Copiar {currentDay.name} a…</Text>
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
          <View style={[styles.menuCard, SHADOWS[resolvedScheme].lg, { backgroundColor: theme.card, borderColor: theme.border }]}>
            {[
              { icon: Layers, label: 'Plantillas', on: () => { void openTemplatePicker() }, dim: false },
              { icon: Eye, label: 'Vista previa', on: () => { setMenuOpen(false); previewRef.current?.present() }, dim: false },
              ...(canAssignProgramToClients({ isTemplate, programId })
                ? [{ icon: Users, label: 'Asignar a alumnos', on: () => { void openAssignClients() }, dim: false }]
                : []),
              { icon: Scale, label: 'Balance muscular', on: () => { setMenuOpen(false); balanceRef.current?.present() }, dim: false },
              { icon: Printer, label: 'Imprimir / PDF', on: handlePrint, dim: false },
              { icon: Undo2, label: 'Deshacer', on: () => { if (canUndo) { setMenuOpen(false); undo() } }, dim: !canUndo },
              { icon: Redo2, label: 'Rehacer', on: () => { if (canRedo) { setMenuOpen(false); redo() } }, dim: !canRedo },
            ].map((it) => {
              const Icon = it.icon
              const color = it.dim ? theme.muted : theme.foreground
              return (
                <TouchableOpacity key={it.label} onPress={it.on} activeOpacity={0.8} style={styles.menuItem}>
                  <Icon size={17} color={color} />
                  <Text style={[styles.menuItemText, { color, fontFamily: FONT.uiSemibold }]}>{it.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </Pressable>
      </Modal>

      {/* FAB "+" verde (solo en Simple) */}
      {isSimpleMode ? (
        <TouchableOpacity onPress={() => addToArea(LEGACY_SECTION_AREA_ID.main)} activeOpacity={0.85} style={[styles.fabAdd, { backgroundColor: theme.primary, shadowColor: theme.primary }]}>
          <Plus size={26} color={theme.primaryForeground} strokeWidth={3} />
        </TouchableOpacity>
      ) : null}

      {/* Guardar — pill de estado abajo (1:1 web: h-14 rounded-full, Check + label). Reemplaza el disquete del top-bar. */}
      <TouchableOpacity ref={regTour('save-button')} onPress={() => { void handleSave() }} disabled={saving} activeOpacity={0.85}
        style={[styles.saveBar, { backgroundColor: theme.primary, shadowColor: theme.primary, bottom: isSimpleMode ? 28 : 116, opacity: saving ? 0.6 : 1 }]}>
        {saving ? <ActivityIndicator size="small" color={theme.primaryForeground} /> : <Check size={20} color={theme.primaryForeground} strokeWidth={2.5} />}
        <Text style={[styles.saveBarTxt, { color: theme.primaryForeground, fontFamily: FONT.uiBold }]}>{saving ? 'Guardando...' : 'Guardar'}</Text>
      </TouchableOpacity>

      {/* Toggle Modo Simple/Normal (Sparkles) — degradado púrpura como la web en Normal */}
      <TouchableOpacity onPress={toggleSimpleMode} activeOpacity={0.85}
        style={[styles.fabMode, isSimpleMode ? SHADOWS[resolvedScheme].md : { shadowColor: theme.primary, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.55, shadowRadius: 16, elevation: 8 }, { bottom: isSimpleMode ? 28 : 116, backgroundColor: isSimpleMode ? theme.card : 'transparent', borderColor: theme.border, borderWidth: isSimpleMode ? 1 : 0 }]}>
        {!isSimpleMode ? (
          <LinearGradient colors={[theme.primary, theme.cyan]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fabGradient} />
        ) : null}
        <Sparkles size={20} color={isSimpleMode ? theme.mutedForeground : ON_DARK} />
      </TouchableOpacity>

      {/* Label de transición */}
      {modeLabel ? (
        <MotiView pointerEvents="none" style={[styles.modeOverlay, { backgroundColor: theme.scheme === 'dark' ? theme.background : theme.foreground }]}
          from={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ type: 'timing', duration: 240 }}>
          <MotiView from={{ opacity: 0, scale: 0.9, translateY: 8 }} animate={{ opacity: 1, scale: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 340, delay: 140 }} style={{ alignItems: 'center', gap: 22 }}>
            <Image source={require('../../assets/eva-icon.png')} style={{ width: 76, height: 76 }} contentFit="contain" tintColor={ON_DARK} />
            <Text style={[styles.modeOverlayText, { color: ON_DARK }]}>{modeLabel}</Text>
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
  titleTapRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  progTitle: { fontSize: 17, letterSpacing: -0.3 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11.5 },
  statusMuted: { fontSize: 11.5, marginTop: 1 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  iconOutline: { width: 34, height: 34, borderWidth: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  gearBtn: { width: 34, height: 34, borderWidth: 1, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  pingAmber: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 9 },
  // Guardar — pill de estado abajo-izquierda (1:1 web: h-14 rounded-full px-5, glow de marca).
  saveBar: { position: 'absolute', left: 16, height: 56, borderRadius: 28, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, ...GLOWS.sport },
  saveBarTxt: { fontSize: 14 },
  abBar: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1 },
  abToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, flexShrink: 1 },
  abTag: { fontSize: 10, fontFamily: FONT.uiBold, letterSpacing: 0.5 },
  abLabelTxt: { fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', flexShrink: 1 },
  abSeg: { flexDirection: 'row', gap: 3, padding: 3, borderRadius: 10, marginLeft: 'auto' },
  abSummary: { marginLeft: 'auto', fontSize: 11, letterSpacing: 0.2 },
  abSegItem: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 7 },
  dayCard: { borderWidth: 1, borderRadius: 16, padding: 10, gap: 8 },
  ssConnector: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 2, marginBottom: 4 },
  ssLine: { flex: 1, height: 1 },
  ssPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  ssPillTxt: { fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase' },
  ssLinkBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  ssLinkTxt: { fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase' },
  dayTabsContent: { paddingHorizontal: 16, flexGrow: 1, justifyContent: 'center' },
  dayTabsRow: { flexDirection: 'row', gap: 8 },
  dayTab: { minWidth: 52, height: 60, paddingHorizontal: 10, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 4 },
  dayTabLabel: { fontSize: 13, letterSpacing: -0.2 },
  dayTabCount: { fontSize: 9, fontFamily: FONT.uiBold },
  dayDot: { width: 6, height: 6, borderRadius: 3 },
  restTitleBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  restTitleText: { fontSize: 11, letterSpacing: 1 },
  restPanel: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 8 },
  restIconBox: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  restPanelTitle: { fontSize: 15 },
  restPanelSub: { fontSize: 13, opacity: 0.7 },
  restPanelBtn: { marginTop: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9 },
  restPanelBtnText: { fontSize: 12 },
  menuBackdrop: { flex: 1, alignItems: 'flex-end', paddingTop: 64, paddingRight: 12 },
  menuCard: { width: 224, borderWidth: 1, borderRadius: 14, paddingVertical: 6 },
  menuItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  menuItemText: { fontSize: 14 },
  draftBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginTop: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  draftText: { flex: 1, fontSize: 12.5, lineHeight: 17 },
  draftActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  draftDiscard: { fontSize: 13 },
  draftBtn: { borderRadius: 9, paddingHorizontal: 14, paddingVertical: 8 },
  draftBtnText: { fontSize: 13 },
  scroll: { padding: 16, gap: 8, paddingBottom: 60 },
  dayTabsBar: { paddingTop: 10, paddingBottom: 4 },
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
  dayMiniLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  dayBigTitle: { fontSize: 22, letterSpacing: -0.4, padding: 0, minHeight: 30 },
  dayTitleInput: { flex: 1, height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 14 },
  restBtn: { width: 44, height: 44, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  blockCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderWidth: 1, borderRadius: 12 },
  blockTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ssBadge: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 6 },
  ssText: { fontSize: 10, fontFamily: FONT.uiSemibold },
  blockName: { fontSize: 14, flexShrink: 1 },
  blockMeta: { fontSize: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginTop: 6, marginBottom: 4 },
  volRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  volChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  volLbl: { fontSize: 9, fontFamily: FONT.uiBold, letterSpacing: 0.4 },
  volVal: { fontSize: 10, fontFamily: FONT.display },
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
  emptyDayHint: { alignItems: 'center', paddingVertical: 28, gap: 6 },
  emptyDayTitle: { fontSize: 15, letterSpacing: 0.4 },
  emptyDaySub: { fontSize: 12.5, textAlign: 'center', lineHeight: 18, opacity: 0.85, paddingHorizontal: 24 },
  blockCardCompact: { padding: 9 },
  // Elevación aplicada inline (glow violeta en Normal / lift neutro DS en Simple).
  fabMode: { position: 'absolute', right: 16, bottom: 28, width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  fabGradient: { ...StyleSheet.absoluteFillObject, borderRadius: 24 },
  // Glow de marca DS (GLOWS.sport); backgroundColor + shadowColor se pisan inline con theme.primary.
  fabAdd: { position: 'absolute', right: 16, bottom: 86, width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center', ...GLOWS.sport },
  modeOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modeOverlayText: { fontSize: 26, fontFamily: FONT.display, letterSpacing: 6, textTransform: 'uppercase' },
  modeLabelWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  modeLabel: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 11 },
  modeLabelText: { fontSize: 14 },
  hint: { position: 'absolute', top: '46%' },
  hintLeft: { left: 8 },
  hintRight: { right: 8 },
  modalWrap: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center', zIndex: 60 },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, opacity: 0.5 },
  modalCard: { width: '82%', borderWidth: 1, borderRadius: 16, padding: 14, gap: 4 },
  modalTitle: { fontSize: 16, marginBottom: 6 },
  modalRow: { paddingVertical: 12, paddingHorizontal: 8 },
  modalRowText: { fontSize: 15 },
})
