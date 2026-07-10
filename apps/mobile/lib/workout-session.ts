/**
 * useWorkoutSession — estado de la sesión de entreno del alumno (ExecutorV2).
 *
 * Fuente de verdad ÚNICA del core-loop de ejecución en mobile, construida sobre @eva/workout-engine
 * (mismo motor puro que la web, sin drift): reconciliación/optimismo de logs, agrupación por área +
 * superseries contiguas. Espeja `WorkoutExecutionClient` de web (apps/web/.../[planId]) pero como hook
 * headless — la presentación vive en `components/alumno/workout/ExecutorV2.tsx`.
 *
 * Resiliencia (E2-03, espejo de web PR #113 session-drafts): snapshot por plan en AsyncStorage con el
 * arreglo de logs + `startedAt` + un draft del set en curso. Al reabrir hoy, `reconcileSessionLogs`
 * une el server (gana) con el snapshot local (lo aún-no-confirmado sobrevive, marcado `_pending`) y el
 * cronómetro continúa desde `startedAt` (cap 4h). Cerrar la app a mitad de set ya no pierde nada.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AppState } from 'react-native'
import { useFocusEffect } from 'expo-router'
import NetInfo from '@react-native-community/netinfo'
import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  reconcileSessionLogs,
  applyOptimisticSessionLog,
  executionAreaGroupsFor,
  groupContiguousSupersetRuns,
  type ReconciledSessionLog,
  type OptimisticLogPayload,
  type WorkoutOfflineLog,
  type WorkoutArea,
  type SupersetGroupRow,
  type ExecutionAreaGroup,
} from '@eva/workout-engine'
import { supabase } from './supabase'
import { getClientProfile } from './client'
import { cachePlan, enqueueLog, getCachedPlan, getPendingLogCount } from './offline-cache'
import { checkOnline } from './use-online'
import {
  getTodayInSantiago,
  getSantiagoUtcBoundsForDay,
  getSantiagoIsoYmdForUtcInstant,
} from './date-utils'
import { programWeekIndex1Based, resolveActiveWeekVariantForDisplay } from './program-week-variant'
import type { LastSessionForBlock } from './workout/progression'

/** Cap duro de duración de sesión (E2-03): 4 horas — el cronómetro se congela ahí. */
export const MAX_SESSION_SEC = 4 * 60 * 60

export interface SessionExercise {
  id: string
  name: string
  muscle_group: string | null
  video_url: string | null
  video_start_time: number | null
  video_end_time: number | null
  gif_url: string | null
  instructions: string[] | null
  exercise_type: string | null
}

/**
 * Bloque de ejecución. Pasa por `SELECT *` (como el builder) para arrastrar los ejes polimórficos
 * (cardio/movilidad/roller) que la Wave B necesita — acá se declaran OPCIONALES para no romper el
 * render strength de hoy. `exercises` llega como objeto o arreglo según el join → resolver con
 * `resolveExercise`.
 */
export interface SessionBlock {
  id: string
  order_index: number
  sets: number
  reps: string
  target_weight_kg: number | null
  tempo: string | null
  rir: string | null
  rest_time: string | null
  warmup_rest_time?: string | null
  section: 'warmup' | 'main' | 'cooldown' | null
  section_template_id: string | null
  superset_group: string | null
  progression_type: 'weight' | 'reps' | null
  progression_value: number | null
  progression_mode: 'weekly_linear' | 'double' | 'session_linear' | 'adaptive' | null
  is_override: boolean | null
  notes: string | null
  // Prescripción polimórfica (null en planes legacy) — seams Wave B (TypedTargetGrid/timers).
  exercise_type_override?: string | null
  side_mode?: string | null
  reps_value?: number | null
  reps_unit?: string | null
  load_value?: number | null
  load_unit?: string | null
  distance_value?: number | null
  distance_unit?: string | null
  duration_sec?: number | null
  target_pace_sec_per_km?: number | null
  hr_zone?: number | null
  instructions?: string | null
  interval_config?: unknown
  exercises: SessionExercise | SessionExercise[] | null
}

export type PrevSet = { weight_kg: number | null; reps_done: number | null; date: string }

/** Snapshot persistido por plan (resiliencia E2-03). */
interface SessionSnapshot {
  planId: string
  /** ISO ymd (Santiago) del día del snapshot — sólo se restaura si es hoy. */
  day: string
  startedAt: number
  logs: ReconciledSessionLog[]
  /** Draft del set en curso (valores tipeados sin confirmar) — restaura el keypad al reabrir. */
  draft?: SessionDraft | null
  updatedAt: number
}

/** Draft del set en curso: los valores tipeados que aún no se confirmaron. */
export interface SessionDraft {
  blockId: string
  setNumber: number
  values: Record<string, string>
  fieldIndex: number
}

const SNAPSHOT_PREFIX = 'eva_workout_session_'

/**
 * Nombre de la fase activa del programa (semanas de `program_phases` acumuladas vs semana actual).
 * Espejo exacto de `currentPhaseName` de web (WorkoutExecutionClient.tsx:238-249).
 */
function currentPhaseName(
  phases: { name: string; weeks: number }[] | null | undefined,
  week: number | null | undefined,
): string | null {
  if (!phases?.length || week == null) return null
  let acc = 0
  for (const ph of phases) {
    acc += ph.weeks
    if (week <= acc) return ph.name
  }
  return phases[phases.length - 1]?.name ?? null
}

export function resolveExercise(block: SessionBlock): SessionExercise | null {
  const ex = block.exercises
  if (!ex) return null
  return (Array.isArray(ex) ? ex[0] : ex) ?? null
}

/** Grupo de render de la lista: un área con sus superseries/bloques sueltos ya agrupados. */
export interface SessionSection {
  key: string
  title: string
  subtitle: string | null
  muted: boolean
  groups: SupersetGroupRow<SessionBlock>[]
}

const AREA_TITLE: Record<string, string> = {
  warmup: 'Calentamiento',
  main: 'Bloque principal',
  cooldown: 'Vuelta a la calma',
  other: 'Otros bloques',
}
const AREA_SUBTITLE: Record<string, string> = {
  warmup: 'Movilidad y activacion suave antes del trabajo intenso.',
  main: 'Bloque de mayor esfuerzo: respeta series, reps y descansos.',
  cooldown: 'Baja la intensidad y cierra la sesion con control.',
  other: 'Ejercicios sin seccion definida.',
}

function reconciledToOfflineLog(l: ReconciledSessionLog, planId: string): WorkoutOfflineLog {
  return {
    blockId: l.block_id,
    setNumber: l.set_number,
    weightKg: l.weight_kg,
    repsDone: l.reps_done,
    rpe: l.rpe ?? null,
    rir: l.rir ?? null,
    note: l.note ?? null,
    planId,
    coachSlug: '',
    timestamp: Date.now(),
    actualDurationSec: l.actual_duration_sec ?? null,
    actualDistanceM: l.actual_distance_m ?? null,
    actualHoldSec: l.actual_hold_sec ?? null,
    actualAvgHr: l.actual_avg_hr ?? null,
    substitutedExerciseId: l.substituted_exercise_id ?? null,
    substitutedExerciseName: l.substituted_exercise_name ?? null,
    substitutionReason: l.substitution_reason ?? null,
  }
}

/** Redondea+acota un input numérico a [min,max]; null si vacío/NaN. RPE/RIR = integer con CHECK. */
function clampIntInRange(v: number | null | undefined, min: number, max: number): number | null {
  if (v == null || !Number.isFinite(v)) return null
  return Math.max(min, Math.min(max, Math.round(v)))
}

export interface WorkoutSessionState {
  loading: boolean
  planTitle: string
  programName: string | null
  /** Nombre de la fase activa del programa (periodización), o null si no aplica. */
  phaseName: string | null
  activeWeekVariant: string | null
  currentWeek: number | null
  weeksToRepeat: number | null
  programStructure: 'weekly' | 'cycle' | null
  cycleLength: number | null
  dayOfWeek: number | null
  clientId: string | null
  blocks: SessionBlock[]
  sections: SessionSection[]
  /** Mapa blockId → miembros de su superserie (o null si es bloque suelto). */
  supersetMembersByBlock: Map<string, SessionBlock[]>
  sessionLogs: ReconciledSessionLog[]
  previousHistory: Record<string, PrevSet[]>
  lastSessionByBlock: Record<string, LastSessionForBlock>
  exerciseMaxes: Record<string, number>
  /** Segundos transcurridos (congelado al llegar al cap de 4h). */
  elapsedSec: number
  capped: boolean
  isOnline: boolean
  /** Draft restaurado del set en curso (para rehidratar el keypad al reabrir). */
  restoredDraft: SessionDraft | null
  refresh: () => Promise<void>
  /** Persiste el draft del set en curso (llamado por el keypad host en cada cambio). */
  saveDraft: (draft: SessionDraft | null) => void
  /**
   * Registra una serie: optimista + snapshot + server (enqueue si falla). Devuelve isPR y, cuando el
   * guardado falla CON conexión (error real de server, no offline), `error` con el mensaje a mostrar
   * en el chip de la serie + Reintentar — mirror del estado 'error' web (`LogSetForm.tsx:136-137,348-363`).
   * Offline ⇒ `error: null` (la fila queda `_pending` ámbar + banner global, auto-reintento al reconectar).
   */
  logSet: (payload: OptimisticLogPayload, opts?: LogSetOptions) => Promise<{ isPR: boolean; error: string | null }>
  /**
   * Cierra la sesión al finalizar: borra el snapshot local + el draft en curso (paridad web
   * `clearSessionSnapshot`/`clearAllDrafts`, WEC:1567-1569). Así una 2ª sesión del MISMO día no
   * rehidrata el cronómetro viejo ni un set a medio tipear. NO toca `sessionLogs` en memoria — el
   * resumen post-entreno los sigue leyendo.
   */
  finishSession: () => Promise<void>
}

/** Sustitución activa del bloque al registrar la serie (persiste columnas dedicadas del log). */
export interface LogSetOptions {
  substitution?: { exerciseId: string | null; name: string; reason: string | null }
}

export function useWorkoutSession(planId: string): WorkoutSessionState {
  const [loading, setLoading] = useState(true)
  const [planTitle, setPlanTitle] = useState('')
  const [programName, setProgramName] = useState<string | null>(null)
  const [phaseName, setPhaseName] = useState<string | null>(null)
  const [activeWeekVariant, setActiveWeekVariant] = useState<string | null>(null)
  const [currentWeek, setCurrentWeek] = useState<number | null>(null)
  const [weeksToRepeat, setWeeksToRepeat] = useState<number | null>(null)
  const [programStructure, setProgramStructure] = useState<'weekly' | 'cycle' | null>(null)
  const [cycleLength, setCycleLength] = useState<number | null>(null)
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(null)
  const [clientId, setClientId] = useState<string | null>(null)
  const [blocks, setBlocks] = useState<SessionBlock[]>([])
  const [areas, setAreas] = useState<WorkoutArea[]>([])
  const [sessionLogs, setSessionLogs] = useState<ReconciledSessionLog[]>([])
  const [previousHistory, setPreviousHistory] = useState<Record<string, PrevSet[]>>({})
  const [lastSessionByBlock, setLastSessionByBlock] = useState<Record<string, LastSessionForBlock>>({})
  const [exerciseMaxes, setExerciseMaxes] = useState<Record<string, number>>({})
  const [isOnline, setIsOnline] = useState(true)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [restoredDraft, setRestoredDraft] = useState<SessionDraft | null>(null)

  // Refs para el snapshot (evitan re-suscribir efectos por cada cambio de estado).
  const startedAtRef = useRef<number>(Date.now())
  const logsRef = useRef<ReconciledSessionLog[]>([])
  const draftRef = useRef<SessionDraft | null>(null)
  const clientIdRef = useRef<string | null>(null)
  // Espejo del estado online para leerlo sin stale-closure dentro de listeners (NetInfo/AppState/focus).
  const isOnlineRef = useRef(true)

  const snapshotKey = SNAPSHOT_PREFIX + planId

  const persistSnapshot = useCallback(() => {
    const snap: SessionSnapshot = {
      planId,
      day: getTodayInSantiago().iso,
      startedAt: startedAtRef.current,
      logs: logsRef.current,
      draft: draftRef.current,
      updatedAt: Date.now(),
    }
    void AsyncStorage.setItem(snapshotKey, JSON.stringify(snap)).catch(() => {})
  }, [planId, snapshotKey])

  const loadTodayServerLogs = useCallback(
    async (cid: string, blockIds: string[]): Promise<ReconciledSessionLog[]> => {
      if (!cid || blockIds.length === 0) return []
      const { iso } = getTodayInSantiago()
      const { startIso, endIso } = getSantiagoUtcBoundsForDay(iso)
      const { data } = await supabase
        .from('workout_logs')
        .select(
          'block_id, set_number, weight_kg, reps_done, rpe, rir, note, actual_duration_sec, actual_distance_m, actual_hold_sec, actual_avg_hr, substituted_exercise_id, substituted_exercise_name, substitution_reason',
        )
        .eq('client_id', cid)
        .in('block_id', blockIds)
        .gte('logged_at', startIso)
        .lt('logged_at', endIso)
      return (data ?? []).map((row: Record<string, unknown>) => ({
        block_id: row.block_id as string,
        set_number: row.set_number as number,
        weight_kg: (row.weight_kg as number) ?? null,
        reps_done: (row.reps_done as number) ?? null,
        rpe: (row.rpe as number) ?? null,
        rir: (row.rir as number) ?? null,
        note: (row.note as string) ?? null,
        actual_duration_sec: (row.actual_duration_sec as number) ?? null,
        actual_distance_m: (row.actual_distance_m as number) ?? null,
        actual_hold_sec: (row.actual_hold_sec as number) ?? null,
        actual_avg_hr: (row.actual_avg_hr as number) ?? null,
        substituted_exercise_id: (row.substituted_exercise_id as string) ?? null,
        substituted_exercise_name: (row.substituted_exercise_name as string) ?? null,
        substitution_reason: (row.substitution_reason as string) ?? null,
      }))
    },
    [],
  )

  const loadPreviousHistory = useCallback(
    async (cid: string, planBlocks: SessionBlock[]) => {
      const exerciseIds = planBlocks
        .map((b) => resolveExercise(b)?.id)
        .filter((x): x is string => Boolean(x))
      if (!exerciseIds.length) return
      // P1-3 (espejo queries.ts:186-200): match por el SNAPSHOT `exercise_id` del log (no por JOIN al
      // bloque), filtra SÓLO por fecha (`< inicio de hoy`) SIN excluir los bloques del plan, límite 500.
      // Antes el JOIN `workout_blocks!inner` + `.not('block_id','in',...)` dejaba VACÍO el historial en
      // programas semanales reusados (mismos block_ids cada semana) ⇒ nunca aparecía "Última vez"/"Sesión
      // anterior" ni autollenaba "= última vez". Ahora sobrevive al borrado del bloque y a la reutilización.
      const { iso } = getTodayInSantiago()
      const { startIso } = getSantiagoUtcBoundsForDay(iso)
      const { data } = await supabase
        .from('workout_logs')
        .select('weight_kg, reps_done, logged_at, set_number, exercise_id')
        .eq('client_id', cid)
        .in('exercise_id', exerciseIds)
        .lt('logged_at', startIso)
        .order('logged_at', { ascending: false })
        .limit(500)
      const history: Record<string, PrevSet[]> = {}
      for (const log of (data ?? []) as Record<string, unknown>[]) {
        const exId = (log.exercise_id as string | null) ?? null
        if (!exId) continue
        if (!history[exId]) history[exId] = []
        // Día-calendario Santiago del instante (paridad web WorkoutSummaryOverlay.tsx:25-31, cuyo
        // fmtShortDate hace getSantiagoIsoYmdForUtcInstant(iso) antes de formatear). `split('T')[0]`
        // tomaba el trozo crudo del timestamp UTC: para un set cerca de medianoche la fecha "Superaste
        // tus X kg del {fecha}" (E2-15) podía quedar corrida un día respecto a web. Esta ymd también
        // alimenta el agrupado por sesión de abajo y los "Última vez"/"Sesión anterior" (formatRelativeDate).
        const date = getSantiagoIsoYmdForUtcInstant(String(log.logged_at))
        const existingDates = history[exId].map((h) => h.date)
        if (existingDates.length === 0 || existingDates.includes(date)) {
          history[exId].push({ weight_kg: (log.weight_kg as number) ?? null, reps_done: (log.reps_done as number) ?? null, date })
        }
      }
      setPreviousHistory(history)
    },
    [],
  )

  // Máximo histórico por ejercicio para detectar PR (espejo queries.ts:289-307): query INDEPENDIENTE
  // del historial recortado. `previousHistory` sólo retiene el día MÁS RECIENTE por ejercicio (recap
  // "sesión anterior") → derivar el máx de ahí daba `prevMax` = máx de la última sesión, no el histórico,
  // rompiendo la detección de PR. Acá se barre TODO el historial previo (límite 5000) por snapshot
  // `exercise_id`, quedándose con el mejor peso de días PREVIOS a hoy.
  const loadExerciseMaxes = useCallback(async (cid: string, planBlocks: SessionBlock[]) => {
    const exerciseIds = planBlocks
      .map((b) => resolveExercise(b)?.id)
      .filter((x): x is string => Boolean(x))
    if (!exerciseIds.length) {
      setExerciseMaxes({})
      return
    }
    const { iso } = getTodayInSantiago()
    const { startIso } = getSantiagoUtcBoundsForDay(iso)
    const { data } = await supabase
      .from('workout_logs')
      .select('weight_kg, exercise_id, logged_at')
      .eq('client_id', cid)
      .not('weight_kg', 'is', null)
      .in('exercise_id', exerciseIds)
      .lt('logged_at', startIso)
      .limit(5000)
    const maxes: Record<string, number> = {}
    for (const log of (data ?? []) as Record<string, unknown>[]) {
      const exId = (log.exercise_id as string | null) ?? null
      const w = log.weight_kg as number | null
      if (!exId || w == null) continue
      if (maxes[exId] == null || w > maxes[exId]) maxes[exId] = w
    }
    setExerciseMaxes(maxes)
  }, [])

  const loadLastSession = useCallback(async (planBlocks: SessionBlock[], blockIds: string[]) => {
    const needsLastSession = planBlocks.some((b) => b.progression_mode === 'double')
    if (!needsLastSession || blockIds.length === 0) {
      setLastSessionByBlock({})
      return
    }
    const { iso } = getTodayInSantiago()
    const { startIso } = getSantiagoUtcBoundsForDay(iso)
    const { data: priorLogs } = await supabase
      .from('workout_logs')
      .select('block_id, set_number, weight_kg, reps_done, logged_at')
      .in('block_id', blockIds)
      .lt('logged_at', startIso)
      .order('logged_at', { ascending: false })
      .limit(800)
    const grouped: Record<string, { day: string; rows: Array<{ set_number: number; weight_kg: number | null; reps_done: number | null }> }> = {}
    for (const log of (priorLogs ?? []) as Record<string, unknown>[]) {
      const bid = log.block_id as string
      const day = getSantiagoIsoYmdForUtcInstant(log.logged_at as string)
      if (!grouped[bid]) grouped[bid] = { day, rows: [] }
      if (grouped[bid].day === day) {
        grouped[bid].rows.push({ set_number: log.set_number as number, weight_kg: (log.weight_kg as number) ?? null, reps_done: (log.reps_done as number) ?? null })
      }
    }
    const next: Record<string, LastSessionForBlock> = {}
    for (const [bid, g] of Object.entries(grouped)) {
      const sets = [...g.rows].sort((a, b) => a.set_number - b.set_number)
      const weightKg = sets.reduce<number | null>((m, s) => (s.weight_kg != null && (m == null || s.weight_kg > m) ? s.weight_kg : m), null)
      next[bid] = { weightKg, repsDone: sets.map((s) => s.reps_done) }
    }
    setLastSessionByBlock(next)
  }, [])

  const loadAreas = useCallback(async (planBlocks: SessionBlock[]) => {
    const ids = Array.from(
      new Set(planBlocks.map((b) => b.section_template_id).filter((x): x is string => Boolean(x))),
    )
    if (ids.length === 0) {
      setAreas([])
      return
    }
    try {
      const { data } = await supabase
        .from('workout_section_templates')
        .select('id, name, slug, sort_order, is_system, coach_id, team_id')
        .in('id', ids)
      setAreas((data ?? []) as WorkoutArea[])
    } catch {
      setAreas([]) // RLS/red → degradar a secciones legacy (executionAreaGroupsFor lo cubre).
    }
  }, [])

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    // `silent`: refetch de frescura (foco/foreground) que NO debe parpadear al loader — la pantalla ya
    // está montada con datos. El load inicial y el pull-to-refresh sí muestran el loader (silent=false).
    if (!opts?.silent) setLoading(true)
    const client = await getClientProfile()
    if (client) {
      setClientId(client.id)
      clientIdRef.current = client.id
    }

    // Snapshot local del día (resiliencia): startedAt + logs guardados sin confirmar.
    let snapshot: SessionSnapshot | null = null
    try {
      const raw = await AsyncStorage.getItem(snapshotKey)
      if (raw) {
        const parsed = JSON.parse(raw) as SessionSnapshot
        if (parsed.day === getTodayInSantiago().iso) snapshot = parsed
      }
    } catch { /* corrupto → ignorar */ }
    if (snapshot) {
      startedAtRef.current = snapshot.startedAt
      if (snapshot.draft) {
        draftRef.current = snapshot.draft
        setRestoredDraft(snapshot.draft)
      }
    }

    // Cache offline del plan (render inmediato) → server (fuente de verdad).
    const cached = await getCachedPlan<{ title: string; blocks: SessionBlock[]; activeWeekVariant?: string | null }>(planId)
    if (cached) {
      setPlanTitle(cached.title)
      setBlocks(cached.blocks)
      setActiveWeekVariant(cached.activeWeekVariant ?? null)
      void loadAreas(cached.blocks)
      setLoading(false)
    }

    const { data } = await supabase
      .from('workout_plans')
      .select(
        `id, title, week_variant, program_id, day_of_week,
         workout_blocks ( *, exercises ( id, name, muscle_group, video_url, video_start_time, video_end_time, gif_url, instructions, exercise_type ) )`,
      )
      .eq('id', planId)
      .maybeSingle()

    if (!data) {
      setLoading(false)
      return
    }

    const raw = (data as Record<string, unknown>).workout_blocks as SessionBlock[] | undefined
    const sorted = [...(raw ?? [])].sort((a, b) => a.order_index - b.order_index)
    setPlanTitle((data as { title: string }).title)
    setBlocks(sorted)
    setDayOfWeek((data as { day_of_week?: number | null }).day_of_week ?? null)
    void loadAreas(sorted)

    // Badge "Semana A/B" (P1, espejo queries.ts:136-138): el badge EXISTE sólo si el programa está en
    // `ab_mode`, y la letra es la variante ACTIVA de la semana por ROTACIÓN (resolveActiveWeekVariantForDisplay),
    // NO el `week_variant` crudo del plan. Antes se seteaba `plan.week_variant` sin mirar `ab_mode` → en
    // programas NO-A/B aparecía "Semana A" (web no muestra nada) y en A/B pintaba la variante del plan en
    // vez de la activa. Se resuelve tras cargar el programa; sin programa/sin ab_mode ⇒ null (sin badge).
    let resolvedWeekVariant: string | null = null

    const programId = (data as { program_id?: string | null }).program_id
    if (programId) {
      const { data: prog } = await supabase
        .from('workout_programs')
        .select('name, start_date, weeks_to_repeat, program_structure_type, cycle_length, program_phases, ab_mode')
        .eq('id', programId)
        .maybeSingle()
      if (prog) {
        const week = programWeekIndex1Based(prog as { start_date?: string | null; weeks_to_repeat?: number | null })
        setProgramName((prog as { name?: string | null }).name ?? null)
        setWeeksToRepeat((prog as { weeks_to_repeat?: number | null }).weeks_to_repeat ?? null)
        setCurrentWeek(week)
        setProgramStructure((prog as { program_structure_type?: 'weekly' | 'cycle' | null }).program_structure_type ?? null)
        setCycleLength((prog as { cycle_length?: number | null }).cycle_length ?? null)
        setPhaseName(currentPhaseName((prog as { program_phases?: { name: string; weeks: number }[] | null }).program_phases, week))
        resolvedWeekVariant = (prog as { ab_mode?: boolean | null }).ab_mode
          ? resolveActiveWeekVariantForDisplay(
              prog as { ab_mode?: boolean | null; start_date?: string | null; weeks_to_repeat?: number | null },
            )
          : null
      }
    }
    setActiveWeekVariant(resolvedWeekVariant)
    // Cache offline con la variante YA resuelta (no el `week_variant` crudo): al reabrir sin red el badge
    // refleja la variante activa por rotación, igual que online.
    await cachePlan(planId, {
      title: (data as { title: string }).title,
      blocks: sorted,
      activeWeekVariant: resolvedWeekVariant,
    })

    const blockIds = sorted.map((b) => b.id)
    if (client && blockIds.length > 0) {
      const [serverLogs] = await Promise.all([
        loadTodayServerLogs(client.id, blockIds),
        loadPreviousHistory(client.id, sorted),
        loadExerciseMaxes(client.id, sorted),
        loadLastSession(sorted, blockIds),
      ])
      // Reconciliación server ∪ snapshot (server gana por block:set; lo local sobrevive _pending).
      const queued = (snapshot?.logs ?? []).map((l) => reconciledToOfflineLog(l, planId))
      const merged = reconcileSessionLogs(serverLogs, queued)
      logsRef.current = merged
      setSessionLogs(merged)
    }

    setLoading(false)
  }, [planId, snapshotKey, loadAreas, loadTodayServerLogs, loadPreviousHistory, loadExerciseMaxes, loadLastSession])

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId])

  // Cronómetro de sesión con cap 4h (E2-03). Congela `elapsedSec` al llegar a MAX_SESSION_SEC.
  useEffect(() => {
    const tick = () => {
      const secs = Math.floor((Date.now() - startedAtRef.current) / 1000)
      setElapsedSec(Math.min(secs, MAX_SESSION_SEC))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])

  // Estado online REACTIVO (P2, espejo WEC:1145-1154 listeners window online/offline): el banner
  // "Sin conexión" aparece/desaparece EN CUANTO cambia la conectividad, sin esperar a que falle un
  // guardado. Antes `isOnline` sólo se tocaba dentro de logSet (checkOnline en el error, true en éxito),
  // así que el banner no salía al perder red hasta intentar guardar una serie y fallar, ni se limpiaba
  // hasta un guardado exitoso posterior. NetInfo lo hace reactivo al cambio de red.
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      // Mismo criterio optimista que checkOnline/useOnline: offline SÓLO con negativa explícita.
      const isUp = state.isConnected !== false && state.isInternetReachable !== false
      isOnlineRef.current = isUp
      setIsOnline(isUp)
    })
    return () => unsub()
  }, [])

  // Frescura al reentrar (P2, paridad conceptual WEC:1125-1140): al recuperar el foco de la pantalla o al
  // volver la app a foreground, si hay conexión Y actividad previa (logs, cola offline o un draft en curso)
  // se re-fetchea la sesión para reflejar cambios del coach o logs de otro dispositivo. `router.refresh`
  // del web no es portable (SPEC §12) → equivalente idiomático con useFocusEffect + AppState 'active'. El
  // refetch es SILENCIOSO (no parpadea al loader) y NUNCA offline (no expulsar al alumno del entreno).
  const maybeRefreshForFreshness = useCallback(async () => {
    if (!isOnlineRef.current) return
    const hasPriorData =
      logsRef.current.length > 0 || draftRef.current != null || (await getPendingLogCount()) > 0
    if (!hasPriorData) return
    await load({ silent: true })
  }, [load])

  useFocusEffect(
    useCallback(() => {
      void maybeRefreshForFreshness()
    }, [maybeRefreshForFreshness]),
  )

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void maybeRefreshForFreshness()
    })
    return () => sub.remove()
  }, [maybeRefreshForFreshness])

  const { sections, supersetMembersByBlock } = useMemo(() => {
    const areaGroups: ExecutionAreaGroup<SessionBlock>[] = executionAreaGroupsFor(blocks, areas)
    const built: SessionSection[] = areaGroups
      .map((g) => ({
        key: g.key,
        title: g.name ?? AREA_TITLE[g.legacySection ?? 'main'],
        subtitle: g.legacySection ? AREA_SUBTITLE[g.legacySection] : null,
        muted: g.legacySection === 'warmup' || g.legacySection === 'cooldown',
        groups: groupContiguousSupersetRuns(g.blocks),
      }))
      .filter((s) => s.groups.length > 0)
    const members = new Map<string, SessionBlock[]>()
    for (const s of built) {
      for (const grp of s.groups) {
        if (grp.type !== 'superset') continue
        const ms = [...grp.blocks].sort((a, b) => a.order_index - b.order_index)
        for (const m of ms) members.set(m.id, ms)
      }
    }
    return { sections: built, supersetMembersByBlock: members }
  }, [blocks, areas])

  const saveDraft = useCallback(
    (draft: SessionDraft | null) => {
      draftRef.current = draft
      persistSnapshot()
    },
    [persistSnapshot],
  )

  const refresh = useCallback(async () => {
    await load()
  }, [load])

  const finishSession = useCallback(async () => {
    // La sesión terminó → el draft en curso y el snapshot local ya no aplican (paridad web BUG 2,
    // WEC:1546-1548/1567-1569). `sessionLogs` en memoria se conservan para el resumen.
    draftRef.current = null
    setRestoredDraft(null)
    try {
      await AsyncStorage.removeItem(snapshotKey)
    } catch {
      /* best-effort: si falla, el snapshot vencerá igual (sólo se restaura si day === hoy). */
    }
  }, [snapshotKey])

  const logSet = useCallback(
    async (payload: OptimisticLogPayload, opts?: LogSetOptions): Promise<{ isPR: boolean; error: string | null }> => {
      const cid = clientIdRef.current
      const block = blocks.find((b) => b.id === payload.blockId)
      const sub = opts?.substitution ?? null

      // 1) Optimista (dedup por block:set, PRESERVA ejes tipados) + snapshot inmediato.
      let next = applyOptimisticSessionLog(logsRef.current, payload)
      if (sub) {
        // El payload optimista no trae los ejes de sustitución → parchear la fila recién agregada
        // para que el snapshot (crash mid-set) y la card conserven el sustituto.
        next = next.map((l) =>
          l.block_id === payload.blockId && l.set_number === payload.setNumber
            ? { ...l, substituted_exercise_id: sub.exerciseId, substituted_exercise_name: sub.name, substitution_reason: sub.reason }
            : l,
        )
      }
      logsRef.current = next
      setSessionLogs(next)
      draftRef.current = null // set confirmado → el draft en curso ya no aplica
      setRestoredDraft(null)
      persistSnapshot()

      if (!cid) return { isPR: false, error: null }

      // 2) Persistencia server (select-then-update/insert acotado al día — no duplica).
      const logData: Record<string, unknown> = {
        block_id: payload.blockId,
        client_id: cid,
        set_number: payload.setNumber,
        weight_kg: payload.weightKg,
        reps_done: payload.repsDone,
        rpe: clampIntInRange(payload.rpe, 1, 10),
        rir: clampIntInRange(payload.rir, 0, 10),
        exercise_name_at_log: block ? resolveExercise(block)?.name ?? null : null,
      }
      // Nota rápida por serie (paridad web A.4.d `handleSubmit`, LogSetForm.tsx:609/443-458): viaja con
      // el log a la ficha del coach. SÓLO se escribe cuando el payload la trae (mismo patrón que los
      // ejes actual_*): un commit de EDICIÓN vía KeypadHost no captura nota → no debe pisar con null
      // una nota ya guardada. El optimismo/DB read ya la preservan.
      if (payload.note != null) logData.note = payload.note
      if (payload.actualDurationSec != null) logData.actual_duration_sec = payload.actualDurationSec
      if (payload.actualDistanceM != null) logData.actual_distance_m = payload.actualDistanceM
      if (payload.actualHoldSec != null) logData.actual_hold_sec = payload.actualHoldSec
      if (payload.actualAvgHr != null) logData.actual_avg_hr = payload.actualAvgHr
      if (sub) {
        logData.substituted_exercise_id = sub.exerciseId
        logData.substituted_exercise_name = sub.name
        logData.substitution_reason = sub.reason
      }

      const { iso } = getTodayInSantiago()
      const { startIso, endIso } = getSantiagoUtcBoundsForDay(iso)
      let error: { message: string } | null = null
      try {
        const { data: existing } = await supabase
          .from('workout_logs')
          .select('id')
          .eq('client_id', cid)
          .eq('block_id', payload.blockId)
          .eq('set_number', payload.setNumber)
          .gte('logged_at', startIso)
          .lt('logged_at', endIso)
          .order('logged_at', { ascending: false })
        if (existing && existing.length > 0) {
          const [keep, ...dups] = existing as { id: string }[]
          const upd = await supabase.from('workout_logs').update(logData).eq('id', keep.id)
          error = upd.error
          if (dups.length) await supabase.from('workout_logs').delete().in('id', dups.map((d) => d.id))
        } else {
          const ins = await supabase.from('workout_logs').insert({ ...logData, logged_at: new Date().toISOString() })
          error = ins.error
        }
      } catch (e) {
        error = { message: (e as { message?: string })?.message ?? 'error' }
      }

      let syncError: string | null = null
      if (error) {
        // Encolar SIEMPRE por seguridad del dato. Pero el banner "Sin conexion" refleja la red REAL,
        // no la presencia de un error: un error no-de-red (RLS, 4xx) con conexión plena NO es offline.
        await enqueueLog({
          block_id: payload.blockId,
          client_id: cid,
          set_number: payload.setNumber,
          weight_kg: payload.weightKg,
          reps_done: payload.repsDone,
          rpe: clampIntInRange(payload.rpe, 1, 10),
          rir: clampIntInRange(payload.rir, 0, 10),
          // Sólo si el payload trae nota (no pisar con null la nota guardada en un flush de edición).
          ...(payload.note != null ? { note: payload.note } : {}),
          exercise_name_at_log: (logData.exercise_name_at_log as string) ?? null,
        })
        const online = await checkOnline()
        isOnlineRef.current = online
        setIsOnline(online)
        // La serie NO está confirmada por el server → márcala `_pending` para no pintar un check verde
        // mentiroso (mirror web: `state.error` ⇒ setSyncStatus('error'); offline ⇒ 'pending',
        // `LogSetForm.tsx:197-199,348-363`). Antes el fallo quedaba invisible: chip verde "guardado".
        logsRef.current = logsRef.current.map((l) =>
          l.block_id === payload.blockId && l.set_number === payload.setNumber ? { ...l, _pending: true } : l,
        )
        setSessionLogs(logsRef.current)
        persistSnapshot()
        // Sólo un fallo REAL (con conexión: RLS/4xx) surface el error+Reintentar por serie; offline ⇒
        // pending ámbar + banner global + auto-reintento al reconectar (mirror web offline→pending vs error→red).
        syncError = online ? 'No se pudo guardar la serie. Reintenta.' : null
      } else {
        isOnlineRef.current = true
        setIsOnline(true)
      }

      // 3) ¿Récord personal? (peso supera el máximo histórico del ejercicio).
      let isPR = false
      const exId = block ? resolveExercise(block)?.id : null
      const prevMax = exId ? exerciseMaxes[exId] ?? 0 : 0
      const w = payload.weightKg ?? 0
      if (!error && prevMax > 0 && w > prevMax) isPR = true

      return { isPR, error: syncError }
    },
    [blocks, exerciseMaxes, persistSnapshot],
  )

  return {
    loading,
    planTitle,
    programName,
    phaseName,
    activeWeekVariant,
    currentWeek,
    weeksToRepeat,
    programStructure,
    cycleLength,
    dayOfWeek,
    clientId,
    blocks,
    sections,
    supersetMembersByBlock,
    sessionLogs,
    previousHistory,
    lastSessionByBlock,
    exerciseMaxes,
    elapsedSec,
    capped: elapsedSec >= MAX_SESSION_SEC,
    isOnline,
    restoredDraft,
    refresh,
    saveDraft,
    logSet,
    finishSession,
  }
}
