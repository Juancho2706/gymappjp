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
  buildRepeatSeedMap,
  executionAreaGroupsFor,
  groupContiguousSupersetRuns,
  PAST_SET_NOT_FOUND_ERROR,
  type ReconciledSessionLog,
  type OptimisticLogPayload,
  type RepeatSeedEntry,
  type WorkoutOfflineLog,
  type WorkoutArea,
  type SupersetGroupRow,
  type ExecutionAreaGroup,
} from '@eva/workout-engine'
import { supabase } from './supabase'
import { getClientProfile } from './client'
import { useEntitlements } from './entitlements'
import type { StudentAccessState } from './entitlements-core'
import { isCoachAccountPausedError, STUDENT_ACCESS_COPY } from './student-access-copy'
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
  /**
   * `exercises.thumbnail_url` — espejo WEBP chico del medio (existe para casi todo el catálogo). Sirve la
   * MINIATURA estática del ejecutor (card "SIGUIENTE" del descanso) sin bajar el gif crudo (~93KB) para un
   * recuadro de 58px. OPCIONAL a propósito: los planes ya cacheados offline con la forma vieja no lo traen
   * ⇒ `undefined` ⇒ la miniatura cae al gif/póster derivado de `video_url` (ver `execThumbUri`).
   */
  thumbnail_url?: string | null
  instructions: string[] | null
  exercise_type: string | null
  /**
   * `exercises.cardio_modality` (Fase C · specs/cardio-ejes-y-fixes): decide los EJES de captura de
   * cardio (elíptica sin distancia, cuerda por saltos, escaladora por pisos, HIIT por reps). NULL /
   * ausente ⇒ ejes genéricos (Min · Distancia · FC), byte-idéntico al comportamiento previo — los
   * planes viejos y los ejercicios de cardio creados por coaches no cambian.
   */
  cardio_modality?: string | null
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
  /**
   * ISO ymd (Santiago) del día al que ESCRIBE la sesión: hoy en una sesión normal, la fecha objetivo
   * en el editor de día pasado (`?fecha`). Sólo se restaura si coincide con el día de la sesión que
   * abre — así el snapshot de una edición jamás se rehidrata como si fuera el entreno de hoy.
   */
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
  /**
   * Semilla de "repetir un día" (`?repetir=YYYY-MM-DD`): lo que el alumno registró ESE día, indexado
   * por `sessionLogKey(block_id, set_number)`. Es SOLO precarga de la captura — NO entra a `sessionLogs`
   * (marcaría la serie como registrada) ni al snapshot (que está keyeado por el día de HOY). null cuando
   * no se abrió en modo repetir. Los registros del día original no se tocan: hoy es una instancia nueva.
   */
  repeatSeed: Map<string, RepeatSeedEntry> | null
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
   *
   * En modo edición de día pasado (`editDate`) hay un tercer resultado: `error` =
   * `PAST_SET_NOT_FOUND_ERROR` cuando esa serie no existe en la fecha editada — rechazo PERMANENTE, sin
   * insertar ni encolar (la UI lo muestra sin "Reintentar").
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

/**
 * @param repeatDate Día ya entrenado que se está REPITIENDO hoy (ymd Santiago, ya validado por la
 *   ruta: pasado, calendario real y distinto de hoy). Sólo alimenta `repeatSeed`; el guardado sigue
 *   escribiendo el log de HOY, exactamente igual que una sesión normal.
 * @param editDate Día PASADO cuyos registros se están EDITANDO (`?fecha`, ymd Santiago ya validado
 *   por la ruta con `validateTargetDate`: formato/calendario real, pasado ESTRICTO — una fecha igual
 *   a hoy llega como `null` y la sesión corre normal, fix web 80995cae). Conmuta el motor a modo
 *   SOLO-UPDATE, réplica client-side del `pastEditMode` de la action web
 *   (`workout-log.actions.ts:119-185`): toda la ventana del día (logs cargados, historial previo,
 *   máximos, última sesión) se corre a esa fecha y `logSet` JAMÁS inserta — si la serie no existe en
 *   ese día devuelve `PAST_SET_NOT_FOUND_ERROR` (sin encolar, sin reintento). Mutuamente excluyente
 *   con `repeatDate` (la ruta descarta `repetir` cuando hay `fecha`, espejo de page.tsx:41).
 */
export function useWorkoutSession(
  planId: string,
  repeatDate?: string | null,
  editDate?: string | null,
): WorkoutSessionState {
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
  const [repeatSeed, setRepeatSeed] = useState<Map<string, RepeatSeedEntry> | null>(null)
  const [isOnline, setIsOnline] = useState(true)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [restoredDraft, setRestoredDraft] = useState<SessionDraft | null>(null)

  // Estado de acceso del alumno por suscripcion del coach (politica CEO 2026-07-18), ya resuelto
  // por /api/mobile/config via useEntitlements. Se espeja en un ref para leerlo dentro de logSet
  // sin stale-closure ni re-crear el callback. 'blocked' => post-gracia solo-lectura.
  const { studentAccess } = useEntitlements()
  const studentAccessStateRef = useRef(studentAccess.state)
  studentAccessStateRef.current = studentAccess.state

  // Refs para el snapshot (evitan re-suscribir efectos por cada cambio de estado).
  const startedAtRef = useRef<number>(Date.now())
  const logsRef = useRef<ReconciledSessionLog[]>([])
  const draftRef = useRef<SessionDraft | null>(null)
  const clientIdRef = useRef<string | null>(null)
  // Espejo del estado online para leerlo sin stale-closure dentro de listeners (NetInfo/AppState/focus).
  const isOnlineRef = useRef(true)

  /**
   * Día al que ESCRIBE esta sesión (ymd Santiago): la fecha objetivo en modo edición, hoy si no. Es la
   * ventana de TODAS las queries del día y del upsert/solo-UPDATE. Se recalcula por render (barato) y
   * se espeja en un ref para leerlo dentro de `logSet` sin stale-closure.
   */
  const editIso = editDate ?? null
  const editIsoRef = useRef(editIso)
  editIsoRef.current = editIso

  // El snapshot local se ESCOPA a la fecha editada: comparte `planId` con la sesión de hoy, así que sin
  // sufijo una edición del martes dejaría sus logs en la clave de hoy y al abrir el entreno de hoy se
  // rehidratarían como series `_pending` de hoy (falso "ya registrado" + flush a la fecha equivocada).
  const snapshotKey = SNAPSHOT_PREFIX + planId + (editIso ? `@${editIso}` : '')

  const persistSnapshot = useCallback(() => {
    const snap: SessionSnapshot = {
      planId,
      day: editIso ?? getTodayInSantiago().iso,
      startedAt: startedAtRef.current,
      logs: logsRef.current,
      draft: draftRef.current,
      updatedAt: Date.now(),
    }
    void AsyncStorage.setItem(snapshotKey, JSON.stringify(snap)).catch(() => {})
  }, [planId, snapshotKey, editIso])

  /**
   * Series ya registradas de la ventana del día que se está trabajando. `dayIso` = hoy en una sesión
   * normal y la FECHA OBJETIVO en el editor de día pasado (espejo de la query web, que reusa
   * `windowStartUtc`/`windowEndUtc` para los logs del día — `workout-execution.queries.ts:157-203`).
   * Sin esto el editor abría en blanco: no había nada que corregir en pantalla.
   */
  const loadServerLogsForDay = useCallback(
    async (cid: string, blockIds: string[], dayIso: string): Promise<ReconciledSessionLog[]> => {
      if (!cid || blockIds.length === 0) return []
      const { startIso, endIso } = getSantiagoUtcBoundsForDay(dayIso)
      const { data } = await supabase
        .from('workout_logs')
        .select(
          // `metadata` = jsonb {left_sec, right_sec} del hold POR LADO. Sin esta columna la fila logueada
          // de una movilidad `per_side` llegaba con `metadata: undefined`, así que corregirle el RPE
          // re-submiteaba el log SIN los segundos por lado (la web sí la selecciona,
          // `workout-execution.queries.ts`). Mismo eje que ya siembra `loadRepeatSeed`.
          'block_id, set_number, weight_kg, reps_done, rpe, rir, note, actual_duration_sec, actual_distance_m, actual_hold_sec, actual_avg_hr, metadata, substituted_exercise_id, substituted_exercise_name, substitution_reason',
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
        metadata: (row.metadata as ReconciledSessionLog['metadata']) ?? null,
        substituted_exercise_id: (row.substituted_exercise_id as string) ?? null,
        substituted_exercise_name: (row.substituted_exercise_name as string) ?? null,
        substitution_reason: (row.substitution_reason as string) ?? null,
      }))
    },
    [],
  )

  /**
   * Series registradas del día que se está REPITIENDO (`?repetir=`). Misma query que
   * `loadTodayServerLogs` pero con la ventana [start,end) de ESE día — no existía ningún fetch de una
   * fecha arbitraria (el historial previo mira "todo lo anterior a hoy", no un día puntual). El mapa lo
   * arma `buildRepeatSeedMap` del motor (descarta las series hechas con máquina sustituida y no siembra
   * la nota, decisiones CEO). Sin `day` ⇒ semilla nula (apertura normal, sin regresión).
   */
  const loadRepeatSeed = useCallback(async (cid: string, blockIds: string[], day: string | null) => {
    if (!day || !cid || blockIds.length === 0) {
      setRepeatSeed(null)
      return
    }
    const { startIso, endIso } = getSantiagoUtcBoundsForDay(day)
    const { data } = await supabase
      .from('workout_logs')
      .select(
        // `metadata` = jsonb {left_sec, right_sec} del hold POR LADO: sin esta columna la semilla de una
        // movilidad `per_side` llegaba con `metadata: null` y los dos campos del teclado quedaban vacíos
        // (la web sí los siembra, LogSetForm.tsx:1817/1829).
        'block_id, set_number, weight_kg, reps_done, rpe, rir, actual_duration_sec, actual_distance_m, actual_hold_sec, actual_avg_hr, metadata, substituted_exercise_id',
      )
      .eq('client_id', cid)
      .in('block_id', blockIds)
      .gte('logged_at', startIso)
      .lt('logged_at', endIso)
    setRepeatSeed(buildRepeatSeedMap((data ?? []) as Parameters<typeof buildRepeatSeedMap>[0]))
  }, [])

  /**
   * `dayIso` acota lo "previo": el historial queda SIEMPRE en `< inicio(dayIso)`, así que editar un día
   * pasado no lo autocompara consigo mismo ni con días posteriores (mismo criterio que la query web,
   * que reusa `windowStartUtc` — `workout-execution.queries.ts:157-170`).
   */
  const loadPreviousHistory = useCallback(
    async (cid: string, planBlocks: SessionBlock[], dayIso: string) => {
      const exerciseIds = planBlocks
        .map((b) => resolveExercise(b)?.id)
        .filter((x): x is string => Boolean(x))
      if (!exerciseIds.length) return
      // P1-3 (espejo queries.ts:186-200): match por el SNAPSHOT `exercise_id` del log (no por JOIN al
      // bloque), filtra SÓLO por fecha (`< inicio de hoy`) SIN excluir los bloques del plan, límite 500.
      // Antes el JOIN `workout_blocks!inner` + `.not('block_id','in',...)` dejaba VACÍO el historial en
      // programas semanales reusados (mismos block_ids cada semana) ⇒ nunca aparecía "Última vez"/"Sesión
      // anterior" ni autollenaba "= última vez". Ahora sobrevive al borrado del bloque y a la reutilización.
      const { startIso } = getSantiagoUtcBoundsForDay(dayIso)
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
  // `exercise_id`, quedándose con el mejor peso de días PREVIOS al día trabajado (`dayIso`: hoy, o la
  // fecha objetivo en modo edición — así corregir el martes no compite contra el jueves siguiente).
  const loadExerciseMaxes = useCallback(async (cid: string, planBlocks: SessionBlock[], dayIso: string) => {
    const exerciseIds = planBlocks
      .map((b) => resolveExercise(b)?.id)
      .filter((x): x is string => Boolean(x))
    if (!exerciseIds.length) {
      setExerciseMaxes({})
      return
    }
    const { startIso } = getSantiagoUtcBoundsForDay(dayIso)
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

  const loadLastSession = useCallback(async (planBlocks: SessionBlock[], blockIds: string[], dayIso: string) => {
    const needsLastSession = planBlocks.some((b) => b.progression_mode === 'double')
    if (!needsLastSession || blockIds.length === 0) {
      setLastSessionByBlock({})
      return
    }
    const { startIso } = getSantiagoUtcBoundsForDay(dayIso)
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

    // El perfil y el plan viajan JUNTOS (Sentry EVA-MOBILE-9). `getClientProfile()` hace I/O real
    // (`client.ts:21`: `auth.getUser()` + un select a `clients`) y el select del plan de más abajo
    // solo necesita `planId`, que ya tenemos: no dependían entre sí y estaban en serie, pagando dos
    // viajes donde alcanza uno. Esta pantalla pelea contra el fallback de ~4,6 s del despegue
    // (`session-morph.tsx:72`), así que un viaje entero es una tajada grande del presupuesto.
    //
    // El `await` de cada una queda EXACTAMENTE donde estaba, así que el orden de los `setState`, del
    // snapshot local y del render desde caché no cambia en nada: lo único que cambia es cuándo
    // arrancan los requests.
    const clientPromise = getClientProfile()
    const planPromise = supabase
      .from('workout_plans')
      .select(
        `id, title, week_variant, program_id, day_of_week,
         workout_blocks ( *, exercises ( id, name, muscle_group, video_url, video_start_time, video_end_time, gif_url, thumbnail_url, instructions, exercise_type, cardio_modality ) )`,
      )
      .eq('id', planId)
      .maybeSingle()
    // Marca la promesa como manejada: si `getClientProfile()` lanza, el `await` de abajo no llega a
    // correr y quedaría un unhandled rejection. El `await` real sigue leyendo el resultado igual.
    void Promise.resolve(planPromise).catch(() => { /* lo maneja el await de abajo */ })

    const client = await clientPromise
    if (client) {
      setClientId(client.id)
      clientIdRef.current = client.id
    }

    // Día que esta sesión escribe: hoy, o la fecha objetivo en el editor de día pasado (`?fecha`).
    // Es la ventana ÚNICA de logs del día / historial / máximos / última sesión y del upsert de `logSet`.
    const windowDay = editIso ?? getTodayInSantiago().iso

    // Snapshot local del día (resiliencia): startedAt + logs guardados sin confirmar.
    let snapshot: SessionSnapshot | null = null
    try {
      const raw = await AsyncStorage.getItem(snapshotKey)
      if (raw) {
        const parsed = JSON.parse(raw) as SessionSnapshot
        if (parsed.day === windowDay) snapshot = parsed
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

    // Ya viajó en paralelo con el perfil (ver arriba): acá normalmente ya resolvió.
    const { data } = await planPromise

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
        loadServerLogsForDay(client.id, blockIds, windowDay),
        loadPreviousHistory(client.id, sorted, windowDay),
        loadExerciseMaxes(client.id, sorted, windowDay),
        loadLastSession(sorted, blockIds, windowDay),
        // Semilla de repetición: query aparte, NUNCA mezclada con los logs de hoy ni con el snapshot.
        // En modo edición la ruta ya descartó `repetir` (exclusión mutua), así que acá llega null.
        loadRepeatSeed(client.id, blockIds, repeatDate ?? null),
      ])
      // Reconciliación server ∪ snapshot (server gana por block:set; lo local sobrevive _pending).
      const queued = (snapshot?.logs ?? []).map((l) => reconciledToOfflineLog(l, planId))
      const merged = reconcileSessionLogs(serverLogs, queued)
      logsRef.current = merged
      setSessionLogs(merged)
    }

    setLoading(false)
  }, [planId, repeatDate, editIso, snapshotKey, loadAreas, loadServerLogsForDay, loadPreviousHistory, loadExerciseMaxes, loadLastSession, loadRepeatSeed])

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

      // Cortocircuito post-gracia (fix r2 'ux'): con studentAccess.state === 'blocked' NO se pega al
      // server ni se encola. La escritura directa PostgREST rebota en la RLS con el 42501 CRUDO
      // ("violates row-level security policy"), que NO contiene 'COACH_ACCOUNT_PAUSED' =>
      // isCoachAccountPausedError daba false, se mostraba "Reintenta" (enganoso) y el log quedaba
      // encolado con auto-reintento perpetuo. Aca: la fila queda `_pending` (sin check verde
      // mentiroso, sobrevive en el snapshot local) y el chip muestra el copy honesto de pausa.
      // La web no sufre esto porque sus actions resuelven el codigo ANTES de llegar a la RLS.
      if (studentAccessStateRef.current === 'blocked') {
        logsRef.current = logsRef.current.map((l) =>
          l.block_id === payload.blockId && l.set_number === payload.setNumber ? { ...l, _pending: true } : l,
        )
        setSessionLogs(logsRef.current)
        persistSnapshot()
        return { isPR: false, error: STUDENT_ACCESS_COPY.pausedWriteError }
      }

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
      // Pace real DERIVADO de tiempo+distancia (RF5, `derivedPaceSecPerKm` del motor): mismo criterio
      // que el resto de los ejes — solo se escribe cuando el payload lo trae (una edición sin ambos
      // ejes no pisa con null lo ya guardado).
      if (payload.actualPaceSecPerKm != null) logData.actual_pace_sec_per_km = payload.actualPaceSecPerKm
      if (payload.actualHoldSec != null) logData.actual_hold_sec = payload.actualHoldSec
      if (payload.actualAvgHr != null) logData.actual_avg_hr = payload.actualAvgHr
      // Hold POR LADO (E0.5): el flujo per_side trae `metadata {left_sec, right_sec}` en el payload,
      // pero acá se descartaba y los lados JAMÁS llegaban a la columna desde RN (la web sí los
      // escribe vía su action). Mismo criterio "solo si presente": una edición por keypad (sin
      // sideMode) no trae metadata y no pisa los lados ya guardados.
      if (payload.metadata != null) logData.metadata = payload.metadata
      if (sub) {
        logData.substituted_exercise_id = sub.exerciseId
        logData.substituted_exercise_name = sub.name
        logData.substitution_reason = sub.reason
      }

      // Ventana del día a escribir: la fecha objetivo en modo edición (`?fecha`, ya validada como
      // ESTRICTAMENTE pasada por la ruta), hoy en cualquier otro caso. Espejo de `windowDateStr` de la
      // action web (workout-log.actions.ts:119-135).
      const editIsoNow = editIsoRef.current
      const { iso } = getTodayInSantiago()
      const { startIso, endIso } = getSantiagoUtcBoundsForDay(editIsoNow ?? iso)
      let error: { message: string } | null = null
      // Rechazo PERMANENTE del modo solo-UPDATE: la serie no existe en esa fecha ⇒ no se inserta, no se
      // encola y no se reintenta (la UI lo pinta sin "Reintentar"). Espejo del `past_set_not_found` web.
      let terminalError: string | null = null
      try {
        const { data: existing, error: selError } = await supabase
          .from('workout_logs')
          .select('id')
          .eq('client_id', cid)
          .eq('block_id', payload.blockId)
          .eq('set_number', payload.setNumber)
          .gte('logged_at', startIso)
          .lt('logged_at', endIso)
          .order('logged_at', { ascending: false })
        if (existing && existing.length > 0) {
          // Fila existente → UPDATE + purga de duplicados, idéntico en los dos modos. `logged_at` NO se
          // toca (no está en `logData`): editar un día pasado JAMÁS mueve la serie a hoy — eso es lo que
          // mantiene la fila dentro de la ventana de su día y del índice único diario.
          const [keep, ...dups] = existing as { id: string }[]
          const upd = await supabase.from('workout_logs').update(logData).eq('id', keep.id)
          error = upd.error
          if (dups.length) await supabase.from('workout_logs').delete().in('id', dups.map((d) => d.id))
        } else if (editIsoNow) {
          // Modo solo-UPDATE (réplica client-side de workout-log.actions.ts:181-185): sin fila en la
          // ventana de esa fecha no hay nada que corregir y NUNCA se inserta (imposible farmear
          // adherencia retroactiva). Se distingue del error de red: si el SELECT falló, esto es un fallo
          // transitorio ⇒ cae al camino de error normal (encola con `target_date` y reintenta); sólo un
          // SELECT exitoso y vacío es el rechazo permanente.
          if (selError) error = selError
          else terminalError = PAST_SET_NOT_FOUND_ERROR
        } else {
          const ins = await supabase.from('workout_logs').insert({ ...logData, logged_at: new Date().toISOString() })
          // 23505 = choque contra el índice único de prod `workout_logs_one_set_per_day`
          // (client_id, block_id, set_number, día-Santiago(logged_at)): la fila de ESTA serie de HOY YA
          // existe pero el SELECT por ventana de día no la vio. Igual que la web (workout-log.actions.ts:
          // 143-169) el "upsert por día" manual no es atómico y el índice lo respalda; acá se degrada el
          // insert perdedor a UPDATE de la fila ganadora (last-wins), NO se propaga como error.
          // Dos gatillos convergen en este 23505:
          //  (a) carrera flush-offline vs submit online de la misma serie (idéntico a web), y
          //  (b) EDICIÓN de tarde/noche en la TZ del dispositivo: `getSantiagoUtcBoundsForDay` corre la
          //      ventana [start,end) del día cuando el runtime NO es UTC (device en Santiago), así que un
          //      log posterior a las ~20:00 cae FUERA de la ventana del SELECT aunque el índice lo trate
          //      como el MISMO día → el primer guardado (INSERT) entra pero la edición volvía a INSERT y
          //      chocaba con el índice; sin este manejo el chip rojo era permanente. La causa raíz de la
          //      ventana (date-utils.getSantiagoUtcBoundsForDay dependía de la TZ del device) YA está
          //      corregida en lib/date-utils.ts, así que ahora la ventana [start,end) es confiable en
          //      device: tras el fix este 23505 sólo lo dispara la carrera (a). El manejo queda igual
          //      como red de seguridad y paridad 1:1 con web.
          // La fila ganadora se relocaliza por (client, block, set) DENTRO de la ventana del día (misma
          // que el SELECT de arriba, ahora confiable — mirror de workout-log.actions.ts:150-151; el
          // índice garantiza 1 sola por día) y se escribe encima → la edición PERSISTE y el chip se
          // limpia al reintentar con éxito. Si aun así no aparece (RLS/borde de día raro), éxito
          // silencioso como en web (workout-log.actions.ts:162-165): la serie ya quedó guardada.
          if ((ins.error as { code?: string } | null)?.code === '23505') {
            const { data: winner } = await supabase
              .from('workout_logs')
              .select('id')
              .eq('client_id', cid)
              .eq('block_id', payload.blockId)
              .eq('set_number', payload.setNumber)
              .gte('logged_at', startIso)
              .lt('logged_at', endIso)
              .order('logged_at', { ascending: false })
              .limit(1)
            if (winner && winner.length > 0) {
              const upd = await supabase.from('workout_logs').update(logData).eq('id', (winner[0] as { id: string }).id)
              error = upd.error
            } else {
              error = null
            }
          } else {
            error = ins.error
          }
        }
      } catch (e) {
        error = { message: (e as { message?: string })?.message ?? 'error' }
      }

      // Rechazo permanente del modo edición: la serie queda `_pending` (sin check verde mentiroso) y el
      // mensaje viaja a la fila de la serie SIN "Reintentar" (SetRow lo reconoce por la copia compartida).
      // No se encola: encolarla la haría reintentar por siempre contra una fila que no existe — que es
      // exactamente el bug que la web resolvió metiendo `past_set_not_found` en PERMANENT_FAILURE_CODES.
      if (terminalError) {
        logsRef.current = logsRef.current.map((l) =>
          l.block_id === payload.blockId && l.set_number === payload.setNumber ? { ...l, _pending: true } : l,
        )
        setSessionLogs(logsRef.current)
        persistSnapshot()
        return { isPR: false, error: terminalError }
      }

      let syncError: string | null = null
      if (error) {
        // Encolar SIEMPRE por seguridad del dato. Pero el banner "Sin conexion" refleja la red REAL,
        // no la presencia de un error: un error no-de-red (RLS, 4xx) con conexión plena NO es offline.
        // Deuda GRAVE #1 (specs/cardio-ejes-y-fixes): la cola persistía SOLO ejes de fuerza — una
        // ronda de cardio/movilidad/roller encolada subía con actual_*/metadata en NULL y perdía la
        // sustitución. Ahora el item calca `logData` con el mismo criterio "solo si presente" del
        // guardado online de arriba; el drain (`flushLogQueue`) spreadea el item completo sin cambios.
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
          ...(payload.actualDurationSec != null ? { actual_duration_sec: payload.actualDurationSec } : {}),
          ...(payload.actualDistanceM != null ? { actual_distance_m: payload.actualDistanceM } : {}),
          ...(payload.actualPaceSecPerKm != null ? { actual_pace_sec_per_km: payload.actualPaceSecPerKm } : {}),
          ...(payload.actualHoldSec != null ? { actual_hold_sec: payload.actualHoldSec } : {}),
          ...(payload.actualAvgHr != null ? { actual_avg_hr: payload.actualAvgHr } : {}),
          ...(payload.metadata != null ? { metadata: payload.metadata } : {}),
          ...(sub
            ? {
                substituted_exercise_id: sub.exerciseId,
                substituted_exercise_name: sub.name,
                substitution_reason: sub.reason,
              }
            : {}),
          // Modo edición: la fecha objetivo VIAJA con el item para que el drenaje use la ventana de ESE
          // día (y no la del `queued_at`) y mantenga el solo-UPDATE — sin esto, un fallo de red editando
          // el martes encolaba una serie que al reconectar se insertaba como entreno de HOY.
          ...(editIsoNow ? { target_date: editIsoNow } : {}),
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
        // COACH_ACCOUNT_PAUSED (gate de suscripción del coach) ⇒ copy humano honesto, no "Reintenta".
        // El OR con el ref cubre la carrera estado-viejo: si la config revalidó a 'blocked' mientras
        // esta escritura viajaba (el ref muta entre awaits — el cast deshace el narrowing del
        // cortocircuito de arriba), el rebote RLS crudo (42501 sin código) también mapea al copy honesto.
        syncError = online
          ? isCoachAccountPausedError(error) ||
            (studentAccessStateRef.current as StudentAccessState) === 'blocked'
            ? STUDENT_ACCESS_COPY.pausedWriteError
            : 'No se pudo guardar la serie. Reintenta.'
          : null
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
    repeatSeed,
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
