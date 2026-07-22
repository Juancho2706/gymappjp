import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Pressable, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'
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
  type WorkoutCelebrationEvent,
} from '@eva/workout-engine'
import { useTheme } from '../../../../context/ThemeContext'
import { useEvaMotion } from '../../../../lib/motion'
import { useEntitlements } from '../../../../lib/entitlements'
import { useClientCardioZones } from '../../../../lib/cardio-zones'
import { haptics } from '../../../../lib/haptics'
import { supabase } from '../../../../lib/supabase'
import { getTodayInSantiago, formatRelativeDate, getSantiagoIsoYmdForUtcInstant, getSantiagoUtcBoundsForDay } from '../../../../lib/date-utils'
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
import { SingleExerciseCard } from '../SingleExerciseCard'
import { StepperExecution, type StepperStepView } from '../StepperExecution'
import { KeypadHost, type KeypadTarget } from '../KeypadHost'
import { TechniqueSheet } from '../TechniqueSheet'
import { SessionCompleteV3 } from './SessionCompleteV3'
import { RecoveryBanner } from '../RecoveryBanner'
import { WorkoutTimerProvider, useWorkoutTimers } from '../timers/TimerProvider'
import { isRestAutoTimerEnabled, parseRestTime, type RestInterstitialRenderer } from '../timers'
import { SubstituteExerciseSheet } from '../SubstituteExerciseSheet'
import { SUBSTITUTION_REASON } from '../../../../lib/workout/substitution'
import { bestPrevOf, fmtElapsed, fmtVolume } from '../workout-ui'
import { EXERCISE_TYPE_META, exerciseTypeColor } from '../../../../lib/exercise-type-meta'
import { ExecHeaderV3, type ExecDotState } from './ExecHeaderV3'
import { resolveExecTheme } from './exec-theme'
import { SessionIntro } from './SessionIntro'
import { SessionStart, type StartChip, type StartExercisePreview } from './SessionStart'
import { ExerciseScreenV3 } from './ExerciseScreenV3'
import { SupersetScreenV3, type SupersetMemberSub } from './SupersetScreenV3'
import { supersetGroupLetter } from './superset-screen-model'
import { MobilityScreenV3 } from './MobilityScreenV3'
import { RollerScreenV3 } from './RollerScreenV3'
import { CardioScreenV3 } from './CardioScreenV3'
import { ExerciseListV3, type ExerciseListItem } from './ExerciseListV3'
import { RestInterstitialV3, type RestInterstitialData, type RestRoundContext } from './RestInterstitialV3'
import { ExecSettingsSheet } from './ExecSettingsSheet'
import { useExecSettings } from './exec-settings'
import { useCelebrations } from './use-celebrations'
import { CelebrationHost } from './celebration-host'
import { computeLivePr } from './pr-live'
import {
  deriveWeeklyStreak,
  plannedDatesForWeek,
  weekDatesMondayToSunday,
  type WeeklyStreak,
} from './weekly-streak'

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
  const execSettings = useExecSettings()
  // Wake-lock de la sesion — condicional a la preferencia "Mantener pantalla encendida" (E3.7). Por
  // default ON (comportamiento previo). Best-effort: nunca lanza en plataformas sin soporte.
  useEffect(() => {
    const TAG = 'executor-v3'
    if (execSettings.keepAwake) {
      void activateKeepAwakeAsync(TAG).catch(() => {})
      return () => { void deactivateKeepAwake(TAG).catch(() => {}) }
    }
    void deactivateKeepAwake(TAG).catch(() => {})
    return undefined
  }, [execSettings.keepAwake])
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { theme, branding } = useTheme()
  const motion = useEvaMotion()
  const timers = useWorkoutTimers()
  const session = useWorkoutSession(planId)
  const finishingRef = useRef(false)
  // Orquestador de celebraciones (E4.1): punto único que dosifica haptics por tier y gobierna el PR en vivo.
  const cel = useCelebrations()

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
  const [listOpen, setListOpen] = useState(false) // Vista "Ver todo" (E2.6) — capa sobre el stepper.
  const [recentSet, setRecentSet] = useState<{ blockId: string; setNumber: number; pr: boolean } | null>(null)
  const recentSetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [syncErrors, setSyncErrors] = useState<Record<string, string>>({})
  const failedPayloads = useRef<Record<string, OptimisticLogPayload>>({})
  const [stepIndex, setStepIndex] = useState(0)
  const autoAdvancedRef = useRef<Set<string>>(new Set())
  const didHydrateStepPosRef = useRef(false)
  // Micro-celebracion del interstitial V3 (E3.1): true cuando el descanso siguio a CERRAR una serie
  // (via handleCommit), false para un descanso manual. El renderer lo lee al montar el overlay.
  const restCelebrateRef = useRef(false)
  // Contexto de "ronda cerrada" (E3.5): se setea en handleCommit cuando el descanso que arranca proviene
  // de CERRAR una ronda de superserie (banner "Ronda N lista" + dots + siguiente ronda en el interstitial).
  // null para cualquier otro descanso (manual, bloque suelto, intra-ronda no dispara descanso).
  const restRoundContextRef = useRef<RestRoundContext | null>(null)
  // PR en vivo (E4.2): true cuando la serie recién cerrada fue récord → el interstitial muestra "+1 serie · ¡PR!".
  const restPrRef = useRef(false)
  // Fase de presentacion V3: arranca en el splash (una vez por apertura) → Inicio → sesion.
  const [phase, setPhase] = useState<ExecPhase>('intro')

  useEffect(() => () => { if (recentSetTimer.current) clearTimeout(recentSetTimer.current) }, [])

  const {
    loading, planTitle, programName, phaseName, activeWeekVariant, currentWeek, weeksToRepeat, programStructure,
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
    // Ventana del pulso dorado + fila "Anterior" tachada. En PR se alarga a ~1,5s (contrato mockup) para
    // acompañar al toast/confeti del host; sin PR, corto (settle del check). El haptic lo dispara el host.
    recentSetTimer.current = setTimeout(() => setRecentSet(null), isPR ? 1500 : 800)
  }, [])

  // ── Commit de una serie (copia de ExecutorV2 sin el auto-scroll de la lista: en stepper el avance lo
  // maneja el efecto de auto-avance). Motor INTOCABLE: solo se INVOCA logSet/timers. ──
  const handleCommit = useCallback(
    async (payload: OptimisticLogPayload) => {
      const block = blocks.find((b) => b.id === payload.blockId)
      const sub = block ? getSubstitution(block) : null
      setKeypadTarget(null)
      // El descanso que arranque tras este commit muestra la micro-celebracion "+1 serie" (E3.1).
      restCelebrateRef.current = true
      // Por defecto NO es un cierre de ronda; el branch de superserie lo setea si corresponde (E3.5).
      restRoundContextRef.current = null
      const projected = [
        ...sessionLogs.filter((l) => !(l.block_id === payload.blockId && l.set_number === payload.setNumber)),
        { block_id: payload.blockId, set_number: payload.setNumber },
      ]
      const wasLogged = sessionLogs.some((l) => l.block_id === payload.blockId && l.set_number === payload.setNumber)

      // ── Celebración (E4.1/E4.2) — decidida ANTES de persistir (todo es puro; no depende del server). El
      // motor de guardado sigue intacto: solo se DECIDE tier + PR con los datos que ya fluyen. ──
      const prescribedEx = block ? resolveExercise(block) : null
      const exId = prescribedEx?.id ?? null
      // PR en vivo: detectPR (vía el adaptador de borde) contra el histórico + máximo all-time ya cargados.
      const pr = exId
        ? computeLivePr({
            weightKg: payload.weightKg,
            repsDone: payload.repsDone,
            substituted: !!sub,
            history: previousHistory[exId] ?? [],
            allTimeMaxKg: exerciseMaxes[exId],
          })
        : null
      // PR real = récord del motor sobre una serie NUEVA (una edición no re-celebra).
      const isPrLive = !!pr?.isPR && !wasLogged
      restPrRef.current = isPrLive
      // Evento base (cuando NO es PR): cierre de ronda/ejercicio ⇒ media; serie suelta ⇒ micro.
      let baseEvent: WorkoutCelebrationEvent = 'serie_cerrada'
      const membersForTier = supersetMembersByBlock.get(payload.blockId)
      if (membersForTier && membersForTier.length >= 2) {
        const roundBlocks = membersForTier.map((m) => ({ id: m.id, sets: m.sets }))
        if (isRoundComplete(roundBlocks, payload.setNumber, projected)) baseEvent = 'ronda_cerrada'
      } else if (block) {
        const doneInBlock = new Set(
          projected
            .filter((l) => l.block_id === payload.blockId && l.set_number >= 1 && l.set_number <= block.sets)
            .map((l) => l.set_number),
        )
        if (doneInBlock.size >= block.sets) baseEvent = 'ejercicio_completado'
      }
      // Un solo haptic por commit (dosificación del host): PR épica > cierre media > serie micro.
      if (isPrLive && exId && pr?.prevBest && pr.kind) {
        cel.celebratePr({
          blockId: payload.blockId,
          setNumber: payload.setNumber,
          exerciseId: exId,
          kind: pr.kind,
          weightKg: payload.weightKg ?? 0,
          prevBest: pr.prevBest,
        })
      } else {
        cel.celebrate(baseEvent)
      }

      const { error } = await logSet(
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
      signalCommitted(payload.blockId, payload.setNumber, isPrLive && !error)

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
            if (groupRest > 0) {
              // Contexto de "ronda cerrada" (E3.5): el interstitial muestra banner + dots + siguiente
              // ronda. Se deriva del engine (round = la ronda recién cerrada; total = maxSets del grupo).
              const totalRounds = members.reduce((mx, m) => Math.max(mx, m.sets), 0)
              const nextRound = round + 1
              let next: RestRoundContext['next'] = null
              if (nextRound <= totalRounds) {
                const firstMember = members.find((m) => m.sets >= nextRound)
                if (firstMember) {
                  const prescribed = resolveExercise(firstMember)
                  const sub = getSubstitution(firstMember)
                  const nm = sub?.name ?? prescribed?.name ?? 'Ejercicio'
                  const eff = effByBlock.get(firstMember.id) ?? null
                  const w = eff?.weightKg ?? firstMember.target_weight_kg
                  const prescription = `${firstMember.sets} × ${firstMember.reps}${w != null ? ` · ${formatWeightEsCl(w)} kg` : ''}`
                  const idx = members.findIndex((m) => m.id === firstMember.id)
                  const exercise: SessionExercise | null = prescribed
                    ? (sub
                        ? { ...prescribed, id: sub.exerciseId ?? prescribed.id, name: sub.name, gif_url: sub.gif_url, video_url: sub.video_url, video_start_time: sub.video_start_time, video_end_time: sub.video_end_time, instructions: sub.instructions }
                        : prescribed)
                    : null
                  next = { name: nm, prescription, exercise, tag: `${SUPERSET_MEMBER_LETTERS[idx] ?? ''}${nextRound}` }
                }
              }
              restRoundContextRef.current = { roundNumber: round, totalRounds, next }
              timers.startRest(groupRest, { autoStart: true, label })
            }
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
    [blocks, getSubstitution, logSet, timers, sessionLogs, supersetMembersByBlock, signalCommitted, effByBlock, cel, previousHistory, exerciseMaxes],
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
    // Épica de FIN DE SESIÓN (E4.1): emite el evento por el host (hoy = haptic épico; el overlay final
    // de coreografía llega en Wave 2/E4.3). El hook ya deja el evento cableado para esa pantalla.
    cel.celebrate('sesion_completada')
    setSummaryOpen(true)
  }, [elapsedSec, finishSession, cel])

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

  // ── Racha semanal (E4.4) ── Lectura acotada a la semana (best-effort, gateada por clientId) que espeja
  // la atribucion del dashboard (home.tsx momentumDays). FUENTE: `workout_plans` del alumno (dias con plan
  // via day_of_week/assigned_date) + `workout_logs` de esta semana (fechas reales, huso Santiago). El motor
  // NO viaja con el calendario semanal — sin esta lectura la racha seria inventada. Si falla (offline) queda
  // null y la UI la oculta (jamas data falsa). No toca el motor de guardado.
  const [weeklyStreak, setWeeklyStreak] = useState<WeeklyStreak | null>(null)
  useEffect(() => {
    if (!clientId) return
    let active = true
    const today = getTodayInSantiago().iso
    const weekDates = weekDatesMondayToSunday(today)
    const { startIso } = getSantiagoUtcBoundsForDay(weekDates[0])
    const { endIso } = getSantiagoUtcBoundsForDay(weekDates[6])
    void (async () => {
      try {
        const [{ data: programRow }, { data: logRows }] = await Promise.all([
          // Espejo EXACTO de la lectura del dashboard (home.tsx): el programa ACTIVO del alumno con sus
          // planes (day_of_week / assigned_date). Los planes fuera del programa activo no cuentan — misma
          // regla que las day-cards, consistencia con la racha del dashboard.
          supabase
            .from('workout_programs')
            .select('workout_plans ( day_of_week, assigned_date )')
            .eq('client_id', clientId)
            .eq('is_active', true)
            .maybeSingle(),
          supabase
            .from('workout_logs')
            .select('logged_at')
            .eq('client_id', clientId)
            .gte('logged_at', startIso)
            .lt('logged_at', endIso),
        ])
        if (!active) return
        const rawPlans = ((programRow as { workout_plans?: Array<{ day_of_week: number | null; assigned_date: string | null }> } | null)?.workout_plans) ?? []
        const plans = rawPlans.map((p) => ({ day_of_week: p.day_of_week ?? null, assigned_date: p.assigned_date ?? null }))
        const plannedDates = plannedDatesForWeek(plans, weekDates)
        const doneDates = new Set<string>()
        for (const r of (logRows as Array<{ logged_at: string }> | null) ?? []) {
          doneDates.add(getSantiagoIsoYmdForUtcInstant(r.logged_at))
        }
        setWeeklyStreak(deriveWeeklyStreak({ weekDates, plannedDates, doneDates, todayIso: today }))
      } catch {
        if (active) setWeeklyStreak(null)
      }
    })()
    return () => { active = false }
    // Se relee al ABRIR la Final (`summaryOpen`) para reflejar la sesion recien cerrada de HOY; en el Inicio
    // basta la lectura de montaje. No se re-consulta por cada serie (seria una query por set).
  }, [clientId, summaryOpen])

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

  // ── Contexto de la pantalla Final V3 (E4.3) — titulo celebratorio corto + subtitulo de contexto. ──
  const finalContext = useMemo(() => {
    const baseTitle = planTitle || programName || 'Tu sesión'
    const useDayLabel = programStructure === 'cycle' && dayOfWeek != null
    const completionLabel = useDayLabel ? `Día ${dayOfWeek}` : baseTitle
    const parts: string[] = []
    if (useDayLabel) parts.push(baseTitle)
    if (currentWeek != null) parts.push(`Semana ${currentWeek}`)
    if (phaseName) parts.push(phaseName)
    if (activeWeekVariant) parts.push(`Variante ${activeWeekVariant}`)
    return { completionLabel, contextLine: parts.length ? parts.join(' · ') : null }
  }, [planTitle, programName, programStructure, dayOfWeek, currentWeek, phaseName, activeWeekVariant])

  // Render de un grupo (bloque suelto o superserie). En el stepper NO se colapsa a recap (siempre card
  // completa para editar) — allowCollapse implicito = false, igual que ExecutorV2 en modo Pasos.
  const renderGroup = useCallback(
    (group: { key: string; type: 'single' | 'superset'; blocks: SessionBlock[]; groupLetter?: string }) => {
      if (group.type === 'superset') {
        const members = supersetMembersByBlock.get(group.blocks[0].id) ?? group.blocks
        // E3.5: pantalla "Superserie" V3 (tarjetas apiladas foco-en-activo + captura reusada + contexto de
        // ronda en el descanso de grupo). Sustituye a la card de rondas intercaladas dentro del stepper.
        return (
          <SupersetScreenV3
            key={group.key}
            groupLetter={group.groupLetter ?? 'A'}
            members={members}
            sessionLogs={sessionLogs}
            effByBlock={effByBlock}
            previousHistory={previousHistory}
            restoredDraft={restoredDraft}
            reducedMotion={motion.reduced}
            exec={exec}
            showEffort={execSettings.showRpeRir}
            getMemberSub={(b): SupersetMemberSub | null => {
              const sub = getSubstitution(b)
              return sub ? { exerciseId: sub.exerciseId, name: sub.name, prescribedName: sub.prescribedName, gif_url: sub.gif_url, video_url: sub.video_url, video_start_time: sub.video_start_time, video_end_time: sub.video_end_time, instructions: sub.instructions } : null
            }}
            onOpenTechnique={(ex) => setTechniqueExercise(ex)}
            onOpenSet={openSet}
            onCommitSet={handleCommit}
            onRpeUpdate={handleRpeUpdate}
            onDraftChange={saveActiveDraft}
            onOpenSubstitute={(blockId) => setSubstituteBlockId(blockId)}
            onUndoSubstitution={(blockId) => setSubstitutionByBlock((p) => { const n = { ...p }; delete n[blockId]; return n })}
            recentSet={recentSet}
            syncErrors={syncErrors}
            onRetrySet={retryCommit}
          />
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
            showEffort={execSettings.showRpeRir}
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
      // E3.2/E3.3/E3.4: los tipos NO-strength enrutan a sus pantallas V3 dedicadas (hero por tipo +
      // captura tipada existente). El resto (p.ej. un tipo futuro no cubierto) cae a SingleExerciseCard.
      if (effType === 'mobility') {
        return (
          <MobilityScreenV3
            key={block.id}
            block={block}
            exercise={exercise}
            blockLogs={blockLogs}
            restoredDraft={restoredDraft}
            reducedMotion={motion.reduced}
            exec={exec}
            onOpenTechnique={() => setTechniqueExercise(exercise)}
            onOpenSet={(setNumber) => openSet(block.id, setNumber)}
            onCommitSet={handleCommit}
            onDraftChange={saveActiveDraft}
            recentSet={recentSet}
            syncErrors={syncErrors}
            onRetrySet={retryCommit}
          />
        )
      }
      if (effType === 'roller') {
        return (
          <RollerScreenV3
            key={block.id}
            block={block}
            exercise={exercise}
            blockLogs={blockLogs}
            reducedMotion={motion.reduced}
            exec={exec}
            onOpenTechnique={() => setTechniqueExercise(exercise)}
            onOpenSet={(setNumber) => openSet(block.id, setNumber)}
            onCommitSet={handleCommit}
            recentSet={recentSet}
            syncErrors={syncErrors}
            onRetrySet={retryCommit}
          />
        )
      }
      if (effType === 'cardio') {
        return (
          <CardioScreenV3
            key={block.id}
            block={block}
            exercise={exercise}
            blockLogs={blockLogs}
            restoredDraft={restoredDraft}
            reducedMotion={motion.reduced}
            exec={exec}
            hrZones={hrZones}
            onOpenTechnique={() => setTechniqueExercise(exercise)}
            onOpenSet={(setNumber) => openSet(block.id, setNumber)}
            onCommitSet={handleCommit}
            onRpeUpdate={handleRpeUpdate}
            onDraftChange={saveActiveDraft}
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
    [supersetMembersByBlock, sessionLogs, effByBlock, currentWeek, activeBlockId, previousHistory, openDetails, getSubstitution, openSet, hrZones, restoredDraft, motion.reduced, exec, execSettings.showRpeRir, handleCommit, handleRpeUpdate, saveActiveDraft, recentSet, syncErrors, retryCommit],
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
      // Letra del grupo superserie (A, B…) por su orden entre superseries del plan, para el título del paso.
      let groupLetter: string | undefined
      if (st.kind === 'superset') {
        let ord = 0
        for (let i = 0; i < index; i += 1) if (steps[i]?.kind === 'superset') ord += 1
        groupLetter = supersetGroupLetter(ord)
      }
      return renderGroup({ key: st.key, type: st.kind, blocks: st.blocks, groupLetter })
    },
    [steps, renderGroup],
  )

  // Modelo de la vista lista "Ver todo" (E2.6): una fila por paso, con series hechas/total, tipo y
  // seccion. El salto (onJumpTo) reposiciona el stepper — misma navegacion que el rail.
  const listItems = useMemo<ExerciseListItem[]>(
    () =>
      steps.map((st, i) => {
        let done = 0
        let total = 0
        for (const b of st.blocks) {
          total += b.sets
          const logged = new Set(
            sessionLogs
              .filter((l) => l.block_id === b.id && l.set_number >= 1 && l.set_number <= b.sets)
              .map((l) => l.set_number),
          )
          done += logged.size
        }
        let title: string
        let typeLabel: string
        let typeColor: string
        if (st.kind === 'superset') {
          const names = st.blocks.map((b) => resolveExercise(b)?.name).filter(Boolean) as string[]
          title = names.length ? names.join(' + ') : 'Superserie'
          typeLabel = 'Superserie'
          typeColor = exec.accent
        } else {
          const ex = resolveExercise(st.blocks[0])
          title = ex?.name ?? 'Ejercicio'
          const t = ex ? effectiveExerciseType(st.blocks[0], ex) : 'strength'
          typeLabel = EXERCISE_TYPE_META[t].label
          typeColor = exerciseTypeColor(t, exec.accent)
        }
        return {
          key: st.key,
          index: i,
          sectionTitle: st.sectionTitle,
          muted: st.muted,
          title,
          typeLabel,
          typeColor,
          doneSets: done,
          totalSets: total,
          complete: total > 0 && done >= total,
        }
      }),
    [steps, sessionLogs, exec.accent],
  )

  // ── Interstitial de descanso V3 (E3.1) ──
  // "Qué retoma" al terminar el descanso: el primer paso incompleto (mismo destino que el auto-avance).
  // Alimenta la tarjeta SIGUIENTE (nombre + prescripcion + mini-media) y la nota del coach del overlay.
  const restNextData = useMemo(() => {
    if (steps.length === 0) return null
    const idx = firstIncompleteStepIndex(steps, sessionLogs)
    const st = steps[Math.min(idx, steps.length - 1)]
    if (!st) return null
    const b = st.blocks[0]
    const ex = resolveExercise(b)
    const name =
      st.kind === 'superset'
        ? (st.blocks.map((bb) => resolveExercise(bb)?.name).filter(Boolean).join(' + ') || 'Superserie')
        : (ex?.name ?? 'Ejercicio')
    const eff = effByBlock.get(b.id) ?? null
    const w = eff?.weightKg ?? b.target_weight_kg
    const prescription = `${b.sets} × ${b.reps}${w != null ? ` · ${formatWeightEsCl(w)} kg` : ''}`
    const coachNote = b.notes?.trim() ? b.notes.trim() : null
    return { index: idx, next: { name, prescription, exercise: ex }, coachNote }
  }, [steps, sessionLogs, effByBlock])

  // Snapshot que lee el renderer (identidad estable) — se actualiza en cada render con datos frescos.
  const interstitialDataRef = useRef<RestInterstitialData | null>(null)
  interstitialDataRef.current = {
    next: restNextData?.next ?? null,
    coachNote: restNextData?.coachNote ?? null,
    planItems: listItems,
    currentIndex: restNextData?.index ?? stepIndex,
    celebrate: restCelebrateRef.current,
    celebratePr: restPrRef.current,
    roundContext: restRoundContextRef.current,
    exec,
    reducedMotion: motion.reduced,
  }

  const renderRestInterstitial = useCallback<RestInterstitialRenderer>((engine, host) => {
    const d = interstitialDataRef.current
    if (!d) return null
    return <RestInterstitialV3 engine={engine} host={host} data={d} />
  }, [])

  // Registra la presentacion V3 del descanso en el provider (solo mientras este ejecutor esta montado).
  // `setRestInterstitial` es estable (useCallback en el provider) → registra una sola vez.
  const setRestInterstitial = timers.setRestInterstitial
  useEffect(() => {
    setRestInterstitial(renderRestInterstitial)
    return () => setRestInterstitial(null)
  }, [setRestInterstitial, renderRestInterstitial])

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
        weeklyStreak={weeklyStreak}
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
        onOpenList={() => setListOpen(true)}
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
              onPress={() => { restCelebrateRef.current = false; restRoundContextRef.current = null; restPrRef.current = false; timers.startRest(90, { autoStart: true }) }}
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

      {/* Host de celebraciones (E4.1) — overlay no interactivo (box-none): PR en vivo (toast+confeti)
          sobre el stepper, sin cortar el flujo. topOffset libra el header (dots + cronómetro). */}
      <CelebrationHost prCelebration={cel.prCelebration} exec={exec} reducedMotion={motion.reduced} topOffset={64} />

      <KeypadHost
        target={keypadTarget}
        onClose={() => setKeypadTarget(null)}
        onCommit={handleCommit}
        onDraftChange={handleDraftChange}
      />

      <TechniqueSheet exercise={techniqueExercise} onClose={() => setTechniqueExercise(null)} />

      {/* Vista lista "Ver todo" (E2.6) — capa de navegacion sobre el stepper (que sigue montado debajo).
          Saltar a un paso reposiciona el stepper y cierra la capa (misma navegacion que el rail). */}
      <ExerciseListV3
        open={listOpen}
        onClose={() => setListOpen(false)}
        items={listItems}
        currentIndex={stepIndex}
        onJumpTo={(i) => { setStepIndex(i); setListOpen(false) }}
        exec={exec}
        reducedMotion={motion.reduced}
      />

      {/* Tuerca del ejecutor V3 (E3.7) — ajustes del entrenamiento device-scoped. */}
      <ExecSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} exec={exec} />

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

      <SessionCompleteV3
        visible={summaryOpen}
        exec={exec}
        reducedMotion={!!motion.reduced}
        completionLabel={finalContext.completionLabel}
        planTitle={planTitle}
        contextLine={finalContext.contextLine}
        blocks={summaryBlocks}
        logs={sessionLogs}
        exerciseMaxes={exerciseMaxes}
        exerciseMaxDates={exerciseMaxDates}
        durationSec={finishedElapsed ?? elapsedSec}
        substitutedBlockIds={substitutedBlockIds}
        weeklyStreak={weeklyStreak}
        checkInReminder={checkInReminder}
        checkInLastRelative={checkInLastRelative}
        onCheckIn={() => router.replace('/alumno/check-in')}
        onDone={() => router.replace('/alumno/home')}
      />
    </SafeAreaView>
  )
}
