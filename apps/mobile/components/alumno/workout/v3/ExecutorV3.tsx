import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Pressable, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { useKeepAwake } from 'expo-keep-awake'
import { useRouter } from 'expo-router'
import { CheckCircle2, Dumbbell, Timer } from 'lucide-react-native'
import {
  buildRoundOrder,
  buildStepModel,
  effectiveExerciseType,
  findNextIncompleteInRounds,
  firstIncompleteStepIndex,
  formatWeightEsCl,
  isRoundComplete,
  isStepComplete,
  typedTargetFor,
  type OptimisticLogPayload,
  type SummaryBlock,
} from '@eva/workout-engine'
import { useTheme } from '../../../../context/ThemeContext'
import { useEvaMotion } from '../../../../lib/motion'
import { useEntitlements } from '../../../../lib/entitlements'
import { useClientCardioZones } from '../../../../lib/cardio-zones'
import { haptics } from '../../../../lib/haptics'
import { supabase } from '../../../../lib/supabase'
import { getTodayInSantiago, formatRelativeDate } from '../../../../lib/date-utils'
import { computeCheckInReminder } from '../../../../lib/checkin-thresholds'
import { computeEffectiveTarget, type EffectiveTarget } from '../../../../lib/workout/progression'
import {
  resolveExercise,
  useWorkoutSession,
  type PrevSet,
  type SessionBlock,
  type SessionExercise,
} from '../../../../lib/workout-session'
import { toast } from '../../../Toast'
import { flushLogQueue, getPendingLogCount } from '../../../../lib/offline-cache'
import { OfflineBanner } from '../../../OfflineBanner'
import { EvaLoaderScreen } from '../../../EvaLoader'
import { Sheet } from '../../../Sheet'
import { FONT } from '../../../../lib/typography'
import { SingleExerciseCard } from '../SingleExerciseCard'
import { SupersetGroupCard } from '../SupersetGroupCard'
import { StepperExecution, type StepperStepView } from '../StepperExecution'
import { KeypadHost, type KeypadTarget } from '../KeypadHost'
import { TechniqueSheet } from '../TechniqueSheet'
import { WorkoutSummaryOverlay } from '../WorkoutSummaryOverlay'
import { RecoveryBanner } from '../RecoveryBanner'
import { WorkoutTimerProvider, useWorkoutTimers } from '../timers/TimerProvider'
import { isRestAutoTimerEnabled, parseRestTime } from '../timers'
import { SubstituteExerciseSheet } from '../SubstituteExerciseSheet'
import { SUBSTITUTION_REASON } from '../../../../lib/workout/substitution'
import { bestPrevOf, fmtElapsed, fmtVolume } from '../workout-ui'
import { EXERCISE_TYPE_META, exerciseTypeColor } from '../../../../lib/exercise-type-meta'
import { ExecHeaderV3, type ExecDotState } from './ExecHeaderV3'
import { resolveExecTheme } from './exec-theme'
import { SessionIntro } from './SessionIntro'
import { SessionStart, type StartChip, type StartExercisePreview } from './SessionStart'
import { ExerciseScreenV3 } from './ExerciseScreenV3'

const EMBER_200 = '#FFD6C7'
const ON_DARK_MUTED = '#939DAB'
// Letras de miembro por posicion (A, B, C…) para la senal "Sigue con {label}" de las superseries.
const SUPERSET_MEMBER_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
// Nombres de dia (es, con tilde) indexados por getTodayInSantiago().dayOfWeek (1=Lunes..7=Domingo) —
// para el eyebrow "Hoy · {dia} {n}" del Inicio V3 sin depender de Intl (Hermes limitado).
const WEEKDAY_ES = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
// Estimacion de duracion del Inicio V3: trabajo por serie strength ≈ 40s (tipado usa su duration_sec).
const WORK_SEC_PER_SET = 40
// Cuantos ejercicios lista el Inicio antes del "+ N mas".
const START_PREVIEW_COUNT = 4
// Fases de presentacion del ejecutor V3: splash (una vez por apertura) → Inicio → sesion (stepper).
type ExecPhase = 'intro' | 'start' | 'session'

// Media/tecnica del sustituto (paridad ExecutorV2): el modal de tecnica y la CTA dependen de que el
// gif/video/instrucciones viajen aqui.
type ActiveSub = {
  exerciseId: string | null
  name: string
  reason: string | null
  prescribedName: string
  gif_url: string | null
  video_url: string | null
  video_start_time: number | null
  video_end_time: number | null
  instructions: string[] | null
}

/**
 * ExecutorV3 (E2.1) — SHELL de presentacion V3 del ejecutor del alumno. Montado sobre EL MISMO motor
 * headless que ExecutorV2 (`useWorkoutSession` + `WorkoutTimerProvider`): cola offline, drafts,
 * reconciliacion, timers y acciones son INTOCABLES; el V3 solo cambia la PRESENTACION.
 *
 * Esta wave renderiza: (a) el header V3 nuevo (dots de progreso que laten + cronometro + tuerca);
 * (b) el cuerpo como un stepper-first BASICO —un grupo a la vez, next/prev/swipe— reusando las cards
 * existentes (SingleExerciseCard/SupersetGroupCard) sobre el modelo de pasos del engine
 * (`buildStepModel` + StepperExecution); (c) el RecoveryBanner si llegan params. La pantalla "Fuerza"
 * V3 completa (media, prescripcion rica, efecto juicy) llega en la wave 2.
 */
export default function ExecutorV3({ planId, recoverDate, editDate }: { planId: string; recoverDate?: string; editDate?: string }) {
  return (
    <WorkoutTimerProvider>
      <ExecutorV3Inner planId={planId} recoverDate={recoverDate} editDate={editDate} />
    </WorkoutTimerProvider>
  )
}

function ExecutorV3Inner({ planId, recoverDate, editDate }: { planId: string; recoverDate?: string; editDate?: string }) {
  useKeepAwake() // Wake-lock de TODA la sesion.
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { theme, branding } = useTheme()
  const motion = useEvaMotion()
  const timers = useWorkoutTimers()
  const session = useWorkoutSession(planId)
  const finishingRef = useRef(false)

  // Tema del ejecutor (dark-only): acento por executor_theme del coach; superficies fijas.
  const exec = useMemo(
    () => resolveExecTheme(branding?.executorTheme, theme.primary, theme.primaryForeground),
    [branding?.executorTheme, theme.primary, theme.primaryForeground],
  )

  const [keypadTarget, setKeypadTarget] = useState<KeypadTarget | null>(null)
  const [techniqueExercise, setTechniqueExercise] = useState<SessionExercise | null>(null)
  const [openDetails, setOpenDetails] = useState<Record<string, boolean>>({})
  const [substituteBlockId, setSubstituteBlockId] = useState<string | null>(null)
  const [substitutionByBlock, setSubstitutionByBlock] = useState<Record<string, ActiveSub>>({})
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [finishedElapsed, setFinishedElapsed] = useState<number | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [recentSet, setRecentSet] = useState<{ blockId: string; setNumber: number; pr: boolean } | null>(null)
  const recentSetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [syncErrors, setSyncErrors] = useState<Record<string, string>>({})
  const failedPayloads = useRef<Record<string, OptimisticLogPayload>>({})
  const [stepIndex, setStepIndex] = useState(0)
  const autoAdvancedRef = useRef<Set<string>>(new Set())
  const didHydrateStepPosRef = useRef(false)
  // Fase de presentacion V3: arranca en el splash (una vez por apertura) → Inicio → sesion.
  const [phase, setPhase] = useState<ExecPhase>('intro')

  useEffect(() => () => { if (recentSetTimer.current) clearTimeout(recentSetTimer.current) }, [])

  const {
    loading, planTitle, programName, phaseName, activeWeekVariant, currentWeek, weeksToRepeat, programStructure, cycleLength,
    dayOfWeek, clientId, blocks, sections, supersetMembersByBlock, sessionLogs, previousHistory, lastSessionByBlock,
    exerciseMaxes, elapsedSec, isOnline, restoredDraft, saveDraft, logSet, finishSession,
  } = session

  const { hasModule } = useEntitlements()
  const planHasHrZone = useMemo(() => blocks.some((b) => b.hr_zone != null), [blocks])
  const hrZones = useClientCardioZones(hasModule('cardio') && planHasHrZone)

  const effByBlock = useMemo(() => {
    const map = new Map<string, EffectiveTarget | null>()
    for (const b of blocks) {
      const ls = lastSessionByBlock[b.id]
      const lastSession = ls ?? null
      map.set(b.id, computeEffectiveTarget(b, { currentWeek, weeksToRepeat, lastSession }))
    }
    return map
  }, [blocks, currentWeek, weeksToRepeat, lastSessionByBlock])

  const getSubstitution = useCallback(
    (block: SessionBlock): ActiveSub | null => {
      const state = substitutionByBlock[block.id]
      if (state) return state
      const log = sessionLogs.find((l) => l.block_id === block.id && l.substituted_exercise_id)
      if (log) {
        return {
          exerciseId: log.substituted_exercise_id ?? null,
          name: log.substituted_exercise_name ?? 'Sustituto',
          reason: log.substitution_reason ?? null,
          prescribedName: resolveExercise(block)?.name ?? 'Ejercicio',
          gif_url: null,
          video_url: null,
          video_start_time: null,
          video_end_time: null,
          instructions: null,
        }
      }
      return null
    },
    [substitutionByBlock, sessionLogs],
  )

  const isBlockComplete = useCallback(
    (b: SessionBlock) => {
      let done = 0
      for (let i = 1; i <= b.sets; i += 1) {
        if (sessionLogs.some((l) => l.block_id === b.id && l.set_number === i)) done += 1
      }
      return done >= b.sets
    },
    [sessionLogs],
  )
  const currentExerciseIdx = blocks.findIndex((b) => !isBlockComplete(b))
  const currentExerciseNum = currentExerciseIdx === -1 ? blocks.length : currentExerciseIdx + 1
  const activeBlockId = currentExerciseIdx === -1 ? null : blocks[currentExerciseIdx]?.id ?? null

  // Dots de progreso por ejercicio (block): hecho / actual / futuro.
  const dots = useMemo<ExecDotState[]>(
    () => blocks.map((b, i) => (isBlockComplete(b) ? 'done' : i === currentExerciseIdx ? 'now' : 'todo')),
    [blocks, isBlockComplete, currentExerciseIdx],
  )

  const baseSub =
    programStructure === 'cycle' ? `Día ${dayOfWeek || 1} de ${cycleLength || '?'}` : 'Programa semanal'
  const subline = phaseName ? `${phaseName} · ${baseSub}` : baseSub
  const nextHint = phaseName || programName ? subline : null

  // ── Abrir teclado para una serie (copia de ExecutorV2: sin cambios al motor). ──
  const openSet = useCallback(
    (blockId: string, setNumber: number, prefill?: { weight: number | null; reps: number | null }) => {
      const block = blocks.find((b) => b.id === blockId)
      if (!block) return
      const exercise = resolveExercise(block)
      const exerciseName = exercise?.name ?? 'Ejercicio'
      const restored =
        !prefill && restoredDraft && restoredDraft.blockId === blockId && restoredDraft.setNumber === setNumber
          ? restoredDraft
          : null

      const typed = typedTargetFor(block, exercise)
      if (typed) {
        const typedLog = sessionLogs.find((l) => l.block_id === blockId && l.set_number === setNumber)
        let typedEditValues: Record<string, string> | null = null
        if (typedLog) {
          const vals: Record<string, string> = {}
          if (typed.mode === 'cardio') {
            if (typedLog.actual_duration_sec != null)
              vals.cardio_min = formatWeightEsCl(Math.round((typedLog.actual_duration_sec / 60) * 10) / 10)
            if (typedLog.actual_distance_m != null) vals.actual_distance_m = formatWeightEsCl(typedLog.actual_distance_m)
            if (typedLog.actual_avg_hr != null) vals.actual_avg_hr = String(typedLog.actual_avg_hr)
          } else if (typed.mode === 'mobility') {
            if (typedLog.actual_hold_sec != null) vals.actual_hold_sec = String(typedLog.actual_hold_sec)
          } else {
            if (typedLog.actual_duration_sec != null) vals.actual_duration_sec = String(typedLog.actual_duration_sec)
            if (typedLog.reps_done != null) vals.reps_done = String(typedLog.reps_done)
          }
          if (typedLog.rpe != null) vals.rpe = String(typedLog.rpe)
          typedEditValues = vals
        }
        setKeypadTarget({
          blockId,
          setNumber,
          exerciseName,
          targetReps: '',
          suggestedWeight: null,
          effortKind: null,
          initialValues: typedEditValues ?? restored?.values,
          initialFieldIndex: restored?.fieldIndex,
          isEdit: typedEditValues != null,
          typed,
        })
        haptics.tap()
        return
      }

      const eff = effByBlock.get(blockId) ?? null
      const suggested = eff?.weightKg ?? block.target_weight_kg
      const existingLog = sessionLogs.find((l) => l.block_id === blockId && l.set_number === setNumber)
      const editValues = existingLog
        ? {
            weight: existingLog.weight_kg != null ? formatWeightEsCl(existingLog.weight_kg) : '',
            reps: existingLog.reps_done != null ? String(existingLog.reps_done) : '',
            rpe: existingLog.rpe != null ? String(existingLog.rpe) : '',
            rir: existingLog.rir != null && existingLog.rir >= 1 && existingLog.rir <= 10 ? String(existingLog.rir) : '',
            note: existingLog.note ?? '',
          }
        : null
      const initialValues = prefill
        ? { weight: prefill.weight != null ? String(prefill.weight) : '', reps: prefill.reps != null ? String(prefill.reps) : '' }
        : editValues ?? restored?.values
      const bestPrev = bestPrevOf(previousHistory[exercise?.id ?? ''] ?? [])
      setKeypadTarget({
        blockId,
        setNumber,
        exerciseName,
        targetReps: block.reps,
        targetSets: block.sets,
        suggestedWeight: suggested ?? null,
        lastPrev: bestPrev ? { weightKg: bestPrev.weight_kg, reps: bestPrev.reps_done } : null,
        effortKind: block.rir ? 'rir' : 'rpe',
        initialValues,
        initialFieldIndex: restored?.fieldIndex,
        isEdit: editValues != null,
      })
      haptics.tap()
    },
    [blocks, effByBlock, restoredDraft, previousHistory, sessionLogs],
  )

  const signalCommitted = useCallback((blockId: string, setNumber: number, isPR: boolean) => {
    if (recentSetTimer.current) clearTimeout(recentSetTimer.current)
    setRecentSet({ blockId, setNumber, pr: isPR })
    recentSetTimer.current = setTimeout(() => setRecentSet(null), 800)
    if (isPR) void haptics.pr()
  }, [])

  // ── Commit de una serie (copia de ExecutorV2 sin el auto-scroll de la lista: en stepper el avance lo
  // maneja el efecto de auto-avance). Motor INTOCABLE: solo se INVOCA logSet/timers. ──
  const handleCommit = useCallback(
    async (payload: OptimisticLogPayload) => {
      const block = blocks.find((b) => b.id === payload.blockId)
      const sub = block ? getSubstitution(block) : null
      setKeypadTarget(null)
      haptics.setDone()
      const projected = [
        ...sessionLogs.filter((l) => !(l.block_id === payload.blockId && l.set_number === payload.setNumber)),
        { block_id: payload.blockId, set_number: payload.setNumber },
      ]
      const wasLogged = sessionLogs.some((l) => l.block_id === payload.blockId && l.set_number === payload.setNumber)
      const { isPR, error } = await logSet(
        payload,
        sub ? { substitution: { exerciseId: sub.exerciseId, name: sub.name, reason: sub.reason } } : undefined,
      )
      const setKey = `${payload.blockId}:${payload.setNumber}`
      if (error) {
        failedPayloads.current[setKey] = payload
        setSyncErrors((m) => ({ ...m, [setKey]: error }))
      } else {
        delete failedPayloads.current[setKey]
        setSyncErrors((m) => {
          if (!(setKey in m)) return m
          const next = { ...m }
          delete next[setKey]
          return next
        })
      }
      signalCommitted(payload.blockId, payload.setNumber, isPR)

      // Superserie: descanso SOLO al cerrar la ronda (paridad ExecutorV2/web).
      const members = supersetMembersByBlock.get(payload.blockId)
      if (members && members.length >= 2) {
        const roundBlocks = members.map((m) => ({ id: m.id, sets: m.sets }))
        const round = payload.setNumber
        const order = buildRoundOrder(roundBlocks)
        const nextPos = findNextIncompleteInRounds(order, projected, {
          blockId: payload.blockId,
          setNumber: payload.setNumber,
        })
        const roundClosed = isRoundComplete(roundBlocks, round, projected)
        if (!wasLogged) {
          if (!isRestAutoTimerEnabled()) {
            timers.cancelRest()
          } else if (roundClosed) {
            const groupRest = members.reduce((mx, m) => Math.max(mx, parseRestTime(m.rest_time)), 0)
            const label = resolveExercise(members[0])?.name
            if (groupRest > 0) timers.startRest(groupRest, { autoStart: true, label })
          } else {
            timers.cancelRest()
          }
        }
        if (nextPos && !roundClosed) {
          const idx = members.findIndex((m) => m.id === nextPos.blockId)
          const label = `${SUPERSET_MEMBER_LETTERS[idx] ?? ''}${nextPos.set}`
          toast.info(`Sin descanso — sigue con ${label}`)
        }
        return
      }

      // Bloque suelto.
      const ex = block ? resolveExercise(block) : null
      if (!error && block && ex && effectiveExerciseType(block, ex) === 'strength') {
        toast.success('Serie registrada')
      }
      if (!wasLogged) {
        const useWarmup = !!block?.warmup_rest_time && payload.setNumber === 1 && (block?.sets ?? 0) >= 3
        const restStr = useWarmup ? block!.warmup_rest_time! : block?.rest_time
        const secs = parseRestTime(restStr)
        if (!isRestAutoTimerEnabled()) {
          timers.cancelRest()
        } else if (secs > 0) {
          timers.startRest(secs, { autoStart: true, label: ex?.name, warmup: useWarmup })
        } else {
          timers.cancelRest()
        }
      }
    },
    [blocks, getSubstitution, logSet, timers, sessionLogs, supersetMembersByBlock, signalCommitted],
  )

  const retryCommit = useCallback(
    (blockId: string, setNumber: number) => {
      const payload = failedPayloads.current[`${blockId}:${setNumber}`]
      if (payload) void handleCommit(payload)
    },
    [handleCommit],
  )

  const handleDraftChange = useCallback(
    (values: Record<string, string>, fieldIndex: number) => {
      if (!keypadTarget) return
      saveDraft({ blockId: keypadTarget.blockId, setNumber: keypadTarget.setNumber, values, fieldIndex })
    },
    [keypadTarget, saveDraft],
  )

  const handleRpeUpdate = useCallback(
    (payload: OptimisticLogPayload) => {
      const block = blocks.find((b) => b.id === payload.blockId)
      const sub = block ? getSubstitution(block) : null
      void logSet(
        payload,
        sub ? { substitution: { exerciseId: sub.exerciseId, name: sub.name, reason: sub.reason } } : undefined,
      )
    },
    [blocks, getSubstitution, logSet],
  )

  const saveActiveDraft = useCallback(
    (blockId: string, setNumber: number, values: Record<string, string>, fieldIndex: number) => {
      saveDraft({ blockId, setNumber, values, fieldIndex })
    },
    [saveDraft],
  )

  const finalizeSession = useCallback(async () => {
    setFinishedElapsed(elapsedSec)
    await finishSession()
    setSummaryOpen(true)
  }, [elapsedSec, finishSession])

  const handleFinish = useCallback(async () => {
    if (finishingRef.current) return
    finishingRef.current = true
    try {
      const pendingBefore = await getPendingLogCount()
      if (pendingBefore > 0) {
        try { await flushLogQueue(supabase) } catch { /* excepcion global → conservamos el aviso */ }
      }
      const stillPending = await getPendingLogCount()
      if (stillPending > 0) {
        const n = stillPending
        Alert.alert(
          `${n} serie${n !== 1 ? 's' : ''} sin sincronizar`,
          'Se guardarán cuando vuelva la conexión. Puedes finalizar igual o esperar.',
          [
            { text: 'Esperar', style: 'cancel' },
            { text: 'Finalizar igual', style: 'destructive', onPress: () => { void finalizeSession() } },
          ],
        )
        return
      }
      await finalizeSession()
    } finally {
      finishingRef.current = false
    }
  }, [finalizeSession])

  const summaryBlocks = useMemo<SummaryBlock[]>(
    () =>
      blocks.map((b) => {
        const ex = resolveExercise(b)
        return {
          id: b.id,
          exercises: ex ? { id: ex.id, name: ex.name, muscle_group: ex.muscle_group ?? '', exercise_type: ex.exercise_type } : null,
          exercise_type_override: b.exercise_type_override ?? null,
          sets: b.sets,
          duration_sec: b.duration_sec ?? null,
          distance_value: b.distance_value ?? null,
          distance_unit: b.distance_unit ?? null,
          hr_zone: b.hr_zone ?? null,
          target_pace_sec_per_km: b.target_pace_sec_per_km ?? null,
        }
      }),
    [blocks],
  )

  const exerciseMaxDates = useMemo(() => {
    const out: Record<string, string> = {}
    for (const [exId, list] of Object.entries(previousHistory)) {
      let best = -Infinity
      let bestDate: string | null = null
      for (const s of list) {
        const w = s.weight_kg ?? 0
        if (w > best) { best = w; bestDate = s.date }
      }
      if (bestDate) out[exId] = bestDate
    }
    return out
  }, [previousHistory])

  const substitutedBlockIds = useMemo(() => {
    const ids = new Set<string>(Object.keys(substitutionByBlock))
    for (const l of sessionLogs) if (l.substituted_exercise_id) ids.add(l.block_id)
    return [...ids]
  }, [substitutionByBlock, sessionLogs])

  const [lastCheckInDate, setLastCheckInDate] = useState<string | null | undefined>(undefined)
  useEffect(() => {
    if (!clientId) return
    let active = true
    void (async () => {
      try {
        const { data } = await supabase
          .from('check_ins')
          .select('date')
          .eq('client_id', clientId)
          .order('date', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (active) setLastCheckInDate((data as { date?: string } | null)?.date ?? null)
      } catch {
        if (active) setLastCheckInDate(null)
      }
    })()
    return () => { active = false }
  }, [clientId])
  const todayIso = getTodayInSantiago().iso
  const checkInReminder = useMemo(
    () => (lastCheckInDate === undefined ? null : computeCheckInReminder(lastCheckInDate, todayIso)),
    [lastCheckInDate, todayIso],
  )
  const checkInLastRelative = checkInReminder?.lastDay ? formatRelativeDate(checkInReminder.lastDay, todayIso) : null

  const substituteBlock = substituteBlockId ? blocks.find((b) => b.id === substituteBlockId) : null

  // ── Datos del Inicio V3 (E2.2) — derivados ya formateados para SessionStart/SessionIntro. ──
  const coachName = branding?.displayName?.trim() || 'Tu coach'
  const coachInitial = (coachName[0] ?? 'E').toUpperCase()
  const coachLogoUrl = branding?.logoUrl ?? null
  const startData = useMemo(() => {
    const today = getTodayInSantiago()
    const dayNum = parseInt(today.iso.split('-')[2] ?? '', 10)
    const weekday = WEEKDAY_ES[today.dayOfWeek] ?? ''
    const eyebrow = `Hoy · ${weekday}${Number.isFinite(dayNum) ? ` ${dayNum}` : ''}`

    const baseTitle = planTitle || programName || 'Tu sesión'
    const dayTitle = programStructure === 'cycle' && dayOfWeek ? `Día ${dayOfWeek} · ${baseTitle}` : baseTitle

    const chips: StartChip[] = []
    if (currentWeek != null) chips.push({ label: `Semana ${currentWeek}` })
    if (phaseName) chips.push({ label: phaseName })
    if (activeWeekVariant) chips.push({ label: `Variante ${activeWeekVariant}`, plain: true })

    const totalSets = blocks.reduce((n, b) => n + (b.sets || 0), 0)
    // Estimacion de duracion: por bloque, series × (trabajo + descanso). Trabajo strength ≈ 40s
    // (WORK_SEC_PER_SET); un bloque tipado usa su `duration_sec` si existe. Descanso = parseRestTime.
    // Total = round(Σ / 60), piso 1 min.
    const totalSec = blocks.reduce((acc, b) => {
      const work = b.duration_sec && b.duration_sec > 0 ? b.duration_sec : WORK_SEC_PER_SET
      return acc + (b.sets || 0) * (work + parseRestTime(b.rest_time))
    }, 0)
    const minutes = Math.max(1, Math.round(totalSec / 60))
    const summaryLine = `${blocks.length} ejercicio${blocks.length === 1 ? '' : 's'} · ${totalSets} serie${totalSets === 1 ? '' : 's'} · ~${minutes} min`

    const preview: StartExercisePreview[] = blocks.slice(0, START_PREVIEW_COUNT).map((b) => {
      const ex = resolveExercise(b)
      const t = ex ? effectiveExerciseType(b, ex) : 'strength'
      return { name: ex?.name ?? 'Ejercicio', typeLabel: EXERCISE_TYPE_META[t].label, typeColor: exerciseTypeColor(t, exec.accent) }
    })
    const moreCount = Math.max(0, blocks.length - START_PREVIEW_COUNT)

    // "La ultima vez": volumen = Σ(peso × reps) del historial previo (previousHistory ya viene acotado
    // a los ejercicios del plan y al dia mas reciente por ejercicio). fmtVolume ⇒ null si 0.
    let lastVolKg = 0
    for (const list of Object.values(previousHistory)) {
      for (const ps of list) lastVolKg += (ps.weight_kg ?? 0) * (ps.reps_done ?? 0)
    }

    return { eyebrow, dayTitle, chips, summaryLine, preview, moreCount, lastVolumeLabel: fmtVolume(lastVolKg) }
  }, [planTitle, programName, programStructure, dayOfWeek, currentWeek, phaseName, activeWeekVariant, blocks, previousHistory, exec.accent])

  // Render de un grupo (bloque suelto o superserie). En el stepper NO se colapsa a recap (siempre card
  // completa para editar) — allowCollapse implicito = false, igual que ExecutorV2 en modo Pasos.
  const renderGroup = useCallback(
    (group: { key: string; type: 'single' | 'superset'; blocks: SessionBlock[] }) => {
      if (group.type === 'superset') {
        const members = supersetMembersByBlock.get(group.blocks[0].id) ?? group.blocks
        const groupActive = activeBlockId != null && members.some((m) => m.id === activeBlockId)
        return (
          <View
            key={group.key}
            style={
              groupActive && !motion.reduced
                ? { shadowColor: exec.accent, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.35, shadowRadius: 16, elevation: 8 }
                : undefined
            }
          >
            <SupersetGroupCard
              members={members}
              sessionLogs={sessionLogs}
              effByBlock={effByBlock}
              previousHistory={previousHistory}
              currentWeek={currentWeek}
              restoredDraft={restoredDraft}
              hrZones={hrZones}
              reducedMotion={motion.reduced}
              onOpenTechnique={(b) => setTechniqueExercise(resolveExercise(b))}
              onOpenSet={openSet}
              onCommitSet={handleCommit}
              onRpeUpdate={handleRpeUpdate}
              onDraftChange={saveActiveDraft}
              recentSet={recentSet}
              syncErrors={syncErrors}
              onRetrySet={retryCommit}
              registerSetRowRef={() => {}}
            />
          </View>
        )
      }
      const block = group.blocks[0]
      const prescribed = resolveExercise(block)
      if (!prescribed) return null
      const effType = effectiveExerciseType(block, prescribed)
      const isStrengthBlock = effType === 'strength'
      const sub = isStrengthBlock ? getSubstitution(block) : null
      const exercise: SessionExercise = sub
        ? {
            ...prescribed,
            id: sub.exerciseId ?? prescribed.id,
            name: sub.name,
            video_url: sub.video_url,
            video_start_time: sub.video_start_time,
            video_end_time: sub.video_end_time,
            gif_url: sub.gif_url,
            instructions: sub.instructions,
          }
        : prescribed
      const blockLogs = sessionLogs.filter((l) => l.block_id === block.id)
      const doneCount = new Set(blockLogs.filter((l) => l.set_number >= 1 && l.set_number <= block.sets).map((l) => l.set_number)).size
      const complete = doneCount >= block.sets
      const focus: 'active' | 'upcoming' | 'done' = complete ? 'done' : block.id === activeBlockId ? 'active' : 'upcoming'
      const prevList: PrevSet[] = sub ? [] : previousHistory[exercise.id] ?? []
      // E2.3: la pantalla "Fuerza" V3 reemplaza el cuerpo del paso para bloques strength (media siempre
      // visible + chips glass + prescripcion compacta + "Anterior" 1-tap). Los demas tipos siguen con
      // SingleExerciseCard hasta la Ola 3. Las SetRow se REUSAN dentro (motor intocable).
      if (isStrengthBlock) {
        return (
          <ExerciseScreenV3
            key={block.id}
            block={block}
            exercise={exercise}
            eff={effByBlock.get(block.id) ?? null}
            currentWeek={currentWeek}
            blockLogs={blockLogs}
            prevList={prevList}
            restoredDraft={restoredDraft}
            reducedMotion={motion.reduced}
            exec={exec}
            substitution={sub ? { name: sub.name, prescribedName: sub.prescribedName } : null}
            canSubstitute={doneCount === 0}
            onOpenTechnique={() => setTechniqueExercise(exercise)}
            onOpenSet={(setNumber) => openSet(block.id, setNumber)}
            onCommitSet={handleCommit}
            onRpeUpdate={handleRpeUpdate}
            onDraftChange={saveActiveDraft}
            onOpenSubstitute={() => setSubstituteBlockId(block.id)}
            onUndoSubstitution={() => setSubstitutionByBlock((p) => { const n = { ...p }; delete n[block.id]; return n })}
            recentSet={recentSet}
            syncErrors={syncErrors}
            onRetrySet={retryCommit}
          />
        )
      }
      return (
        <SingleExerciseCard
          key={block.id}
          block={block}
          exercise={exercise}
          effType={effType}
          eff={effByBlock.get(block.id) ?? null}
          currentWeek={currentWeek}
          blockLogs={blockLogs}
          prevList={prevList}
          focus={focus}
          detailsOpen={!!openDetails[block.id]}
          substitution={sub ? { name: sub.name, prescribedName: sub.prescribedName } : null}
          canSubstitute={doneCount === 0 && isStrengthBlock}
          restoredDraft={restoredDraft}
          hrZones={hrZones}
          reducedMotion={motion.reduced}
          onToggleDetails={() => setOpenDetails((p) => ({ ...p, [block.id]: !p[block.id] }))}
          onOpenTechnique={() => setTechniqueExercise(exercise)}
          onOpenSet={(setNumber) => openSet(block.id, setNumber)}
          onCommitSet={handleCommit}
          onRpeUpdate={handleRpeUpdate}
          onDraftChange={saveActiveDraft}
          onOpenSubstitute={() => setSubstituteBlockId(block.id)}
          onUndoSubstitution={() => setSubstitutionByBlock((p) => { const n = { ...p }; delete n[block.id]; return n })}
          recentSet={recentSet}
          syncErrors={syncErrors}
          onRetrySet={retryCommit}
        />
      )
    },
    [supersetMembersByBlock, sessionLogs, effByBlock, currentWeek, activeBlockId, previousHistory, openDetails, getSubstitution, openSet, hrZones, restoredDraft, motion.reduced, exec, handleCommit, handleRpeUpdate, saveActiveDraft, recentSet, syncErrors, retryCommit],
  )

  // ── Modelo de pasos (engine) + vistas del rail + auto-avance ──
  const steps = useMemo(
    () =>
      buildStepModel(
        sections.map((s) => ({
          sectionKey: s.key,
          title: s.title,
          subtitle: s.subtitle,
          muted: s.muted,
          groups: s.groups.map((g) => ({ key: g.key, type: g.type, blocks: g.blocks })),
        })),
      ),
    [sections],
  )
  const stepViews = useMemo<StepperStepView[]>(
    () =>
      steps.map((st) => {
        let title: string
        if (st.kind === 'superset') {
          const names = st.blocks.map((b) => resolveExercise(b)?.name).filter(Boolean)
          title = names.length ? `Superserie · ${names.join(' + ')}` : 'Superserie'
        } else {
          title = resolveExercise(st.blocks[0])?.name ?? 'Ejercicio'
        }
        return {
          key: st.key,
          kind: st.kind,
          title,
          sectionTitle: st.sectionTitle,
          muted: st.muted,
          complete: isStepComplete(st, sessionLogs),
        }
      }),
    [steps, sessionLogs],
  )
  const renderStep = useCallback(
    (index: number) => {
      const st = steps[index]
      if (!st) return null
      return renderGroup({ key: st.key, type: st.kind, blocks: st.blocks })
    },
    [steps, renderGroup],
  )

  // Hidratacion: aterriza en el primer paso incompleto una sola vez cuando cargan los pasos.
  useEffect(() => {
    if (loading || steps.length === 0 || didHydrateStepPosRef.current) return
    didHydrateStepPosRef.current = true
    setStepIndex(firstIncompleteStepIndex(steps, sessionLogs))
  }, [loading, steps, sessionLogs])

  // Auto-avance de paso (paridad ExecutorV2): al CERRAR el paso activo, reposiciona al primer
  // incompleto global; una sola vez por paso (guard).
  useEffect(() => {
    if (steps.length === 0) return
    const active = steps[Math.min(stepIndex, steps.length - 1)]
    if (!active || autoAdvancedRef.current.has(active.key)) return
    if (!isStepComplete(active, sessionLogs)) return
    if (steps.every((st) => isStepComplete(st, sessionLogs))) return
    const target = firstIncompleteStepIndex(steps, sessionLogs)
    const t = setTimeout(() => {
      autoAdvancedRef.current.add(active.key)
      setStepIndex((i) => (i === stepIndex ? target : i))
    }, 350)
    return () => clearTimeout(t)
  }, [sessionLogs, stepIndex, steps])

  // Estado vacio (paridad ExecutorV2): plan resuelto pero sin ejercicios.
  if (!loading && blocks.length === 0) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 items-center justify-center p-6" style={{ backgroundColor: exec.surface.appBg }}>
        <View className="mb-4 h-16 w-16 items-center justify-center rounded-full" style={{ backgroundColor: exec.surface.surface }}>
          <Dumbbell size={32} color={ON_DARK_MUTED} strokeWidth={2} />
        </View>
        <Text className="mb-2 font-display-bold text-xl" style={{ color: exec.surface.text }}>Rutina sin ejercicios</Text>
        <Text className="mb-6 text-center text-sm" style={{ color: exec.surface.textMuted }}>
          Esta rutina ya no tiene ejercicios asociados. Tu coach probablemente esté actualizando tu plan.
        </Text>
        <Pressable
          testID="btn-empty-back-v3"
          onPress={() => router.replace('/alumno/home')}
          className="rounded-control px-6 py-2.5"
          style={{ backgroundColor: exec.accent }}
          accessibilityRole="button"
          accessibilityLabel="Volver al inicio"
        >
          <Text className="font-sans-bold" style={{ color: exec.accentText }}>Volver al Dashboard</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  // ── Fase Entrada (E2.2): splash <1,5s, una vez por apertura. Full-bleed (sin safe area, es un splash). ──
  if (phase === 'intro') {
    return (
      <View className="flex-1" style={{ backgroundColor: exec.surface.appBg }}>
        <SessionIntro
          exec={exec}
          coachInitial={coachInitial}
          coachLogoUrl={coachLogoUrl}
          dayTitle={startData.dayTitle}
          reducedMotion={motion.reduced}
          onDone={() => setPhase('start')}
        />
      </View>
    )
  }

  // ── Fase Inicio (E2.2): contexto + CTA EMPEZAR. "Saltar al ejercicio" si ya hay series hoy. ──
  if (phase === 'start') {
    return (
      <SessionStart
        exec={exec}
        eyebrow={startData.eyebrow}
        dayTitle={startData.dayTitle}
        chips={startData.chips}
        summaryLine={startData.summaryLine}
        exercises={startData.preview}
        moreCount={startData.moreCount}
        lastVolumeLabel={startData.lastVolumeLabel}
        coachNote={null}
        coachName={coachName}
        hasPartialSession={sessionLogs.length > 0}
        reducedMotion={motion.reduced}
        onStart={() => setPhase('session')}
        onSkipToExercise={() => setPhase('session')}
      />
    )
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1" style={{ backgroundColor: exec.surface.appBg }}>
      <ExecHeaderV3
        dots={dots}
        currentExerciseNum={currentExerciseNum}
        totalExercises={blocks.length}
        elapsedLabel={fmtElapsed(elapsedSec)}
        exec={exec}
        reducedMotion={motion.reduced}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <OfflineBanner
        visible={!isOnline}
        prominent
        message="Sin conexión — los datos se guardarán al reconectar."
      />

      <RecoveryBanner recoverDate={recoverDate} editDate={editDate} />

      {loading ? (
        <EvaLoaderScreen subtitle="Cargando rutina…" />
      ) : steps.length > 0 ? (
        <StepperExecution
          steps={stepViews}
          currentIndex={stepIndex}
          onIndexChange={setStepIndex}
          renderStep={renderStep}
        />
      ) : null}

      {/* Barra inferior fija: descanso manual (90s) + Finalizar (acento del ejecutor). */}
      {!loading && (
        <View
          className="absolute bottom-0 left-0 right-0 px-4 pt-4"
          style={{ borderTopWidth: 1, borderTopColor: exec.surface.borderSubtle, backgroundColor: exec.surface.appBg, paddingBottom: 16 + insets.bottom }}
        >
          <View className="w-full flex-row items-center justify-between gap-3 self-center" style={{ maxWidth: 1024 }}>
            <Pressable
              testID="btn-manual-rest-v3"
              onPress={() => timers.startRest(90, { autoStart: true })}
              className="h-11 flex-row items-center gap-1.5 rounded-control border border-ember-500/25 bg-ember-500/15 px-3 active:opacity-90"
              accessibilityRole="button"
              accessibilityLabel="Iniciar descanso de 90 segundos"
            >
              <Timer size={14} color={EMBER_200} />
              <Text className="font-sans-bold text-xs text-ember-200">Descanso (90)</Text>
            </Pressable>
            <Pressable
              testID="btn-finish-workout-v3"
              onPress={handleFinish}
              className="h-12 flex-row items-center gap-2 rounded-control px-5 active:opacity-90"
              style={{ backgroundColor: exec.accent }}
              accessibilityRole="button"
              accessibilityLabel="Finalizar entrenamiento"
            >
              <CheckCircle2 size={16} color={exec.accentText} />
              <Text className="font-sans-bold" style={{ color: exec.accentText }}>Finalizar entrenamiento</Text>
            </Pressable>
          </View>
        </View>
      )}

      <KeypadHost
        target={keypadTarget}
        onClose={() => setKeypadTarget(null)}
        onCommit={handleCommit}
        onDraftChange={handleDraftChange}
      />

      <TechniqueSheet exercise={techniqueExercise} onClose={() => setTechniqueExercise(null)} />

      {/* Ajustes del ejecutor V3 — placeholder de esta wave (el panel real llega despues). */}
      <Sheet open={settingsOpen} onClose={() => setSettingsOpen(false)} title="Ajustes" nativeModal snapPoints={['35%']}>
        <View className="items-center px-4 py-8">
          <Text style={{ fontFamily: FONT.uiBold, fontSize: 16 }} className="text-strong">Ajustes — próximamente</Text>
          <Text style={{ fontFamily: FONT.ui, fontSize: 13, marginTop: 8, textAlign: 'center' }} className="text-muted">
            Los ajustes del ejecutor llegan en una próxima versión.
          </Text>
        </View>
      </Sheet>

      <SubstituteExerciseSheet
        open={substituteBlockId != null}
        onOpenChange={(o) => { if (!o) setSubstituteBlockId(null) }}
        blockId={substituteBlockId}
        prescribedName={substituteBlock ? resolveExercise(substituteBlock)?.name ?? 'Ejercicio' : 'Ejercicio'}
        muscleGroup={substituteBlock ? resolveExercise(substituteBlock)?.muscle_group ?? '' : ''}
        onConfirm={(opt) => {
          if (!substituteBlockId || !substituteBlock) return
          setSubstitutionByBlock((p) => ({
            ...p,
            [substituteBlockId]: {
              exerciseId: opt.id,
              name: opt.name,
              reason: SUBSTITUTION_REASON,
              prescribedName: resolveExercise(substituteBlock)?.name ?? 'Ejercicio',
              gif_url: opt.gif_url,
              video_url: opt.video_url,
              video_start_time: opt.video_start_time,
              video_end_time: opt.video_end_time,
              instructions: opt.instructions,
            },
          }))
          setSubstituteBlockId(null)
        }}
      />

      <WorkoutSummaryOverlay
        visible={summaryOpen}
        planTitle={planTitle}
        blocks={summaryBlocks}
        logs={sessionLogs}
        exerciseMaxes={exerciseMaxes}
        exerciseMaxDates={exerciseMaxDates}
        durationSec={finishedElapsed ?? elapsedSec}
        programName={programName}
        nextHint={nextHint}
        substitutedBlockIds={substitutedBlockIds}
        checkInReminder={checkInReminder}
        checkInLastRelative={checkInLastRelative}
        onCheckIn={() => router.replace('/alumno/check-in')}
        onDone={() => router.replace('/alumno/home')}
      />
    </SafeAreaView>
  )
}
