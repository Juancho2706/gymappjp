import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useKeepAwake } from 'expo-keep-awake'
import { useRouter } from 'expo-router'
import { Confetti } from 'react-native-fast-confetti'
import { CheckCircle2, ChevronDown, Dumbbell, Timer } from 'lucide-react-native'
import {
  buildRoundOrder,
  buildStepModel,
  effectiveExerciseType,
  findNextIncompleteInRounds,
  firstIncompleteStepIndex,
  formatWeightEsCl,
  isRoundComplete,
  isStepComplete,
  type OptimisticLogPayload,
  type SummaryBlock,
} from '@eva/workout-engine'
import { useTheme } from '../../../context/ThemeContext'
import { useEvaMotion } from '../../../lib/motion'
import { useEntitlements } from '../../../lib/entitlements'
import { useClientCardioZones } from '../../../lib/cardio-zones'
import { haptics } from '../../../lib/haptics'
import { supabase } from '../../../lib/supabase'
import { getTodayInSantiago, formatRelativeDate } from '../../../lib/date-utils'
import { computeCheckInReminder } from '../../../lib/checkin-thresholds'
import { computeEffectiveTarget, type EffectiveTarget } from '../../../lib/workout/progression'
import {
  resolveExercise,
  useWorkoutSession,
  type PrevSet,
  type SessionBlock,
  type SessionExercise,
} from '../../../lib/workout-session'
import { toast } from '../../Toast'
import { flushLogQueue, getPendingLogCount } from '../../../lib/offline-cache'
import { OfflineBanner } from '../../OfflineBanner'
import { EvaLoaderScreen } from '../../EvaLoader'
import { SessionHeader, type WorkoutViewMode } from './SessionHeader'
import { SingleExerciseCard } from './SingleExerciseCard'
import { SupersetGroupCard } from './SupersetGroupCard'
import { StepperExecution, type StepperStepView } from './StepperExecution'
import { KeypadHost, type KeypadTarget } from './KeypadHost'
import { typedTargetFor } from './keypad-flow'
import { TechniqueSheet } from './TechniqueSheet'
import { WorkoutSettingsSheet } from './WorkoutSettingsSheet'
import { WorkoutSummaryOverlay } from './WorkoutSummaryOverlay'
import { bestPrevOf, fmtElapsed, fmtVolume } from './workout-ui'

/** Carril device-scoped del modo de vista (Lista/Pasos), igual que `STEPPER_MODE_KEY` de web. */
const VIEW_MODE_KEY = 'eva_workout_view_mode'
// Contrato de la ola (otros workers): provider de timers + sheet de sustitución. Importados con la
// firma exacta del contrato; el orquestador integra. NO stubear.
import { WorkoutTimerProvider, useWorkoutTimers } from './timers/TimerProvider'
// `parseRestTime` del PROPIO unit de timers (port exacto del web): maneja "MM:SS" /
// "90s" / "1 min" / "90". El `startRest` del provider exige SEGUNDOS (number), así que
// el caller parsea aquí — a diferencia del `parseRestTime` de `workout-ui`, que colapsa
// "01:30" a 1s. Esto satisface el contrato string→number del provider con paridad web.
import { isRestAutoTimerEnabled, parseRestTime } from './timers'
import { SubstituteExerciseSheet } from './SubstituteExerciseSheet'
import { SUBSTITUTION_REASON } from '../../../lib/workout/substitution'

const ON_DARK = '#F4F6F8'
const ON_DARK_MUTED = '#939DAB'
const EMBER_200 = '#FFD6C7'
const SPORT_400 = '#5C9DFF'
// Letras de miembro por posición (A, B, C…) para la señal "Sigue con {label}" de las superseries.
const SUPERSET_MEMBER_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

// Media/técnica del sustituto: el modal de técnica y la CTA "Técnica" del ejercicio sustituido
// dependen de que el gif/video/instrucciones viajen aquí (paridad web `SessionSubstitution`,
// WEC:157-168 → `substitutionToExercise` :1364-1374). Sin esto la CTA desaparece y el modal
// quedaría vacío para todo ejercicio sustituido.
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
 * ExecutorV2 — ejecutor de rutina del alumno (Etapa 2). Reemplaza el LegacyExecutor monolítico por
 * una arquitectura de componentes DS sobre @eva/workout-engine. Modo Lista (paridad web md); el modo
 * Paso a paso, los tipos cardio/mobility/roller y el resumen rico llegan en la Wave B (seams marcados).
 */
export default function ExecutorV2({ planId }: { planId: string }) {
  return (
    <WorkoutTimerProvider>
      <ExecutorV2Inner planId={planId} />
    </WorkoutTimerProvider>
  )
}

function ExecutorV2Inner({ planId }: { planId: string }) {
  useKeepAwake() // Wake-lock de TODA la sesión.
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { theme } = useTheme()
  const motion = useEvaMotion()
  const timers = useWorkoutTimers()
  const session = useWorkoutSession(planId)
  // Guard reentrante de finalización (paridad web `finishing.current`, WEC:1503).
  const finishingRef = useRef(false)

  const [keypadTarget, setKeypadTarget] = useState<KeypadTarget | null>(null)
  const [techniqueExercise, setTechniqueExercise] = useState<SessionExercise | null>(null)
  const [openDetails, setOpenDetails] = useState<Record<string, boolean>>({})
  // Ejercicios COMPLETADOS colapsados a recap en la lista (paridad web `expandedDone`,
  // WorkoutExecutionClient.tsx:1038-1039). El CheckCircle2 de la card re-colapsa; tap en el recap
  // re-expande. En modo Pasos NO se colapsa (siempre editable), como web (`allowCollapse` false).
  const [expandedDone, setExpandedDone] = useState<Record<string, boolean>>({})
  const [substituteBlockId, setSubstituteBlockId] = useState<string | null>(null)
  const [substitutionByBlock, setSubstitutionByBlock] = useState<Record<string, ActiveSub>>({})
  const [summaryOpen, setSummaryOpen] = useState(false)
  // Duración CONGELADA al finalizar (snapshot del cronómetro en ese instante). El overlay no debe
  // seguir sumando mientras está abierto — paridad web (`finishedElapsed`, ya viene capado a 4h).
  const [finishedElapsed, setFinishedElapsed] = useState<number | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [prCelebration, setPrCelebration] = useState(false)
  // Señal one-shot de la serie recién confirmada (paridad web `settleRef`/`prRef`, LogSetForm.tsx:257-258):
  // el chip recap que se acaba de cerrar hace el check elástico y, si fue PR, un pulso dorado. Sólo la
  // serie del último commit (no las cargadas al abrir) → sin animación fantasma. Se limpia a los 800ms.
  const [recentSet, setRecentSet] = useState<{ blockId: string; setNumber: number; pr: boolean } | null>(null)
  const recentSetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [viewMode, setViewMode] = useState<WorkoutViewMode>('list')
  const [stepIndex, setStepIndex] = useState(0)
  const autoAdvancedRef = useRef<Set<string>>(new Set())
  // Guard de posicionamiento inicial del pager: al HIDRATAR el modo Pasos desde storage (no un toggle
  // explícito) hay que aterrizar en el primer paso incompleto, pero sólo una vez y recién cuando los
  // pasos ya cargaron (la sesión es async en RN; al montar `steps` está vacío).
  const didHydrateStepPosRef = useRef(false)

  // Modo de vista device-scoped (persiste Lista/Pasos entre sesiones, como web STEPPER_MODE_KEY).
  useEffect(() => {
    void AsyncStorage.getItem(VIEW_MODE_KEY).then((v) => {
      if (v === 'steps' || v === 'list') setViewMode(v)
    })
  }, [])

  // Limpia el timer de la señal one-shot al desmontar (evita setState tras unmount).
  useEffect(() => () => { if (recentSetTimer.current) clearTimeout(recentSetTimer.current) }, [])

  const {
    loading, planTitle, programName, phaseName, activeWeekVariant, currentWeek, weeksToRepeat, programStructure, cycleLength,
    dayOfWeek, clientId, blocks, sections, supersetMembersByBlock, sessionLogs, previousHistory, lastSessionByBlock,
    exerciseMaxes, elapsedSec, isOnline, restoredDraft, refresh, saveDraft, logSet, finishSession,
  } = session

  // Zona FC personalizada (E2-11): SOLO si el módulo `cardio` está habilitado (visibilidad de pago)
  // Y el plan tiene bloques cardio con hr_zone → se leen los bpm del alumno (client-side, RLS own-row).
  // Sin módulo o sin bloques cardio → hrZones null y `useClientCardioZones` NO pega a la DB (AC3).
  const { hasModule } = useEntitlements()
  const planHasHrZone = useMemo(() => blocks.some((b) => b.hr_zone != null), [blocks])
  const hrZones = useClientCardioZones(hasModule('cardio') && planHasHrZone)

  // Peso objetivo efectivo por bloque (sobrecarga progresiva) — mismo motor que web.
  const effByBlock = useMemo(() => {
    const map = new Map<string, EffectiveTarget | null>()
    for (const b of blocks) {
      const ls = lastSessionByBlock[b.id]
      const lastSession = ls ?? null
      map.set(b.id, computeEffectiveTarget(b, { currentWeek, weeksToRepeat, lastSession }))
    }
    return map
  }, [blocks, currentWeek, weeksToRepeat, lastSessionByBlock])

  // Sustitución efectiva: estado en sesión, o rehidratada desde un log de HOY con substituted_*.
  const getSubstitution = useCallback(
    (block: SessionBlock): ActiveSub | null => {
      const state = substitutionByBlock[block.id]
      if (state) return state
      const log = sessionLogs.find((l) => l.block_id === block.id && l.substituted_exercise_id)
      if (log) {
        // Rehidratado desde un log: el gif/técnica del sustituto NO viaja en `workout_logs`
        // → se degrada a null (paridad web WEC:1052-1069; la card muestra nombre + badge).
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

  const requiredSets = blocks.reduce((acc, b) => acc + b.sets, 0)
  const completedSetCount = useMemo(() => {
    const byId = new Map(blocks.map((b) => [b.id, b]))
    const seen = new Set<string>()
    for (const l of sessionLogs) {
      const b = byId.get(l.block_id)
      if (!b || l.set_number < 1 || l.set_number > b.sets) continue
      seen.add(`${l.block_id}:${l.set_number}`)
    }
    return seen.size
  }, [blocks, sessionLogs])
  const completionPct = requiredSets === 0 ? 0 : Math.min(100, Math.round((completedSetCount / requiredSets) * 100))
  const volumeLabel = fmtVolume(sessionLogs.reduce((acc, l) => acc + (l.weight_kg ?? 0) * (l.reps_done ?? 0), 0))

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
  const activeBlockId = currentExerciseIdx === -1 ? null : blocks[currentExerciseIdx].id

  const weekBadge = activeWeekVariant ? `Semana ${activeWeekVariant}` : null
  // Sublínea: `{fase · }Día X de Y | Programa semanal` — la fase activa prefija cuando el programa
  // está periodizado (paridad web WEC:1813-1818: `{phaseName · }` + cycle/weekly).
  const baseSub =
    programStructure === 'cycle' ? `Dia ${dayOfWeek || 1} de ${cycleLength || '?'}` : programStructure === 'weekly' ? 'Programa semanal' : null
  const subline = baseSub && phaseName ? `${phaseName} · ${baseSub}` : baseSub

  // ── Abrir teclado para una serie (strength o tipado según effType) ──────────
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

      // Bloques tipados (cardio/movilidad/roller): keypad por campos tipados (E2-10). El routing
      // tipo->campos es el MISMO puro que consume `KeypadHost` (fix QA R4·#5, cero drift).
      const typed = typedTargetFor(block, exercise)
      if (typed) {
        setKeypadTarget({
          blockId,
          setNumber,
          exerciseName,
          targetReps: '',
          suggestedWeight: null,
          effortKind: null,
          initialValues: restored?.values,
          initialFieldIndex: restored?.fieldIndex,
          typed,
        })
        haptics.tap()
        return
      }

      const eff = effByBlock.get(blockId) ?? null
      const suggested = eff?.weightKg ?? block.target_weight_kg
      // Editar una serie de fuerza ya logueada (tap en el chip recap): siembra el teclado con TODOS los
      // valores del log (peso/reps/RPE/RIR/nota) para no perderlos al reconfirmar — paridad web, que
      // reabre la misma fila con `existingLog` precargado (LogSetForm.tsx:263-270,583-587). Sin esto el
      // seed era sólo `{ weight: sugerido }` y el commit sobrescribía reps/RPE/RIR/nota con nulos (P1).
      const existingLog = sessionLogs.find((l) => l.block_id === blockId && l.set_number === setNumber)
      const editValues = existingLog
        ? {
            weight: existingLog.weight_kg != null ? formatWeightEsCl(existingLog.weight_kg) : '',
            reps: existingLog.reps_done != null ? String(existingLog.reps_done) : '',
            rpe: existingLog.rpe != null ? String(existingLog.rpe) : '',
            // Clamp legacy rir fuera de 1-10 a "sin valor" (mirror web LogSetForm.tsx:266-268).
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

  // Señal one-shot para el chip recap recién cerrado: check elástico (settle) + pulso dorado si PR
  // (paridad web `settleRef`/`prRef`). Se limpia a los 800ms para no re-disparar en re-renders.
  const signalCommitted = useCallback((blockId: string, setNumber: number, isPR: boolean) => {
    if (recentSetTimer.current) clearTimeout(recentSetTimer.current)
    setRecentSet({ blockId, setNumber, pr: isPR })
    recentSetTimer.current = setTimeout(() => setRecentSet(null), 800)
    if (isPR) {
      setPrCelebration(true)
      void haptics.pr()
      setTimeout(() => setPrCelebration(false), 2600)
    }
  }, [])

  // ── Commit de una serie ─────────────────────────────────────────────────────
  const handleCommit = useCallback(
    async (payload: OptimisticLogPayload) => {
      const block = blocks.find((b) => b.id === payload.blockId)
      const sub = block ? getSubstitution(block) : null
      setKeypadTarget(null)
      haptics.setDone()
      // Proyección optimista de la serie recién confirmada (los `sessionLogs` del closure aún no la
      // incluyen) para decidir el cierre de ronda y la siguiente posición sin esperar al re-render.
      const projected = [
        ...sessionLogs.filter((l) => !(l.block_id === payload.blockId && l.set_number === payload.setNumber)),
        { block_id: payload.blockId, set_number: payload.setNumber },
      ]
      const { isPR } = await logSet(
        payload,
        sub ? { substitution: { exerciseId: sub.exerciseId, name: sub.name, reason: sub.reason } } : undefined,
      )
      signalCommitted(payload.blockId, payload.setNumber, isPR)

      // ── Superserie: descanso SÓLO al cerrar la ronda (paridad web supersetRest, WEC:894-897). ──
      // Entre miembros no corre descanso: se muestra "Sin descanso — sigue con {label}" (WEC:1462-1466).
      // Al cerrar la ronda arranca el descanso COMPLETO del grupo = max de rest_time de los miembros
      // (groupRestSeconds, WEC:1264-1266). Cubre tanto la fila activa como la edición vía teclado.
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
        if (nextPos && !roundClosed) {
          const idx = members.findIndex((m) => m.id === nextPos.blockId)
          const label = `${SUPERSET_MEMBER_LETTERS[idx] ?? ''}${nextPos.set}`
          toast.info(`Sin descanso — sigue con ${label}`)
        } else if (roundClosed) {
          const groupRest = members.reduce((mx, m) => Math.max(mx, parseRestTime(m.rest_time)), 0)
          if (groupRest > 0 && isRestAutoTimerEnabled()) timers.startRest(groupRest, { autoStart: true })
        }
        return
      }

      // ── Bloque suelto ──
      // Toast de confirmación (paridad web WEC:1486-1492, solo strength). La acción "Deshacer" no es
      // portable (el Toast RN no lleva botón); el deshacer sigue disponible tocando el chip recap.
      const ex = block ? resolveExercise(block) : null
      if (block && ex && effectiveExerciseType(block, ex) === 'strength') {
        toast.success('Serie registrada')
      }
      // Cronómetro automático (pref device-scoped, default ON): si está apagado no arranca solo.
      const secs = parseRestTime(block?.rest_time)
      if (secs > 0 && isRestAutoTimerEnabled()) timers.startRest(secs, { autoStart: true })
    },
    [blocks, getSubstitution, logSet, timers, sessionLogs, supersetMembersByBlock, signalCommitted],
  )

  const handleDraftChange = useCallback(
    (values: Record<string, string>, fieldIndex: number) => {
      if (!keypadTarget) return
      saveDraft({ blockId: keypadTarget.blockId, setNumber: keypadTarget.setNumber, values, fieldIndex })
    },
    [keypadTarget, saveDraft],
  )

  // RPE post-log de una serie tipada (paridad web `submitRpeUpdate`, `LogSetForm.tsx:952-974`):
  // re-submitea el log completo (el payload ya preserva los ejes `actual_*`) SIN re-disparar el
  // descanso ni la celebración de PR — a diferencia de `handleCommit`, esto sólo persiste el RPE.
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

  // Draft de la fila de registro expandida (ActiveSetRow): reporta directo con block/set (no depende
  // del keypadTarget, que solo existe cuando se edita una serie via KeypadHost).
  const saveActiveDraft = useCallback(
    (blockId: string, setNumber: number, values: Record<string, string>, fieldIndex: number) => {
      saveDraft({ blockId, setNumber, values, fieldIndex })
    },
    [saveDraft],
  )

  const onRefresh = useCallback(async () => {
    setRefreshing(true)
    await refresh()
    setRefreshing(false)
  }, [refresh])

  // Finalizar la sesión (paridad web `handleFinish`, WEC:1502-1571). Guard reentrante; drena la cola
  // offline (idempotente, last-wins) para no finalizar en falso con series huérfanas; congela la
  // duración; limpia snapshot/draft local (una 2ª sesión del día arranca de cero) y abre el resumen.
  // Adaptación RN: el Toast no soporta botón de acción → si algo queda sin sincronizar se AVISA y se
  // finaliza igual (la cola sigue reintentando al reconectar); no se bloquea al alumno.
  const handleFinish = useCallback(async () => {
    if (finishingRef.current) return
    finishingRef.current = true
    try {
      const pendingBefore = await getPendingLogCount()
      if (pendingBefore > 0) {
        try { await flushLogQueue(supabase) } catch { /* excepción global → conservamos el aviso */ }
      }
      const stillPending = await getPendingLogCount()
      if (stillPending > 0) {
        toast.warning(`${stillPending} serie${stillPending !== 1 ? 's' : ''} sin sincronizar`, {
          description: 'Se guardarán cuando vuelva la conexión.',
          duration: 6000,
        })
      }
      setFinishedElapsed(elapsedSec)
      await finishSession()
      setSummaryOpen(true)
    } finally {
      finishingRef.current = false
    }
  }, [elapsedSec, finishSession])

  // Adaptador para el WorkoutSummaryOverlay (E2-15): bloques → SummaryBlock (arrastra los ejes
  // tipados cardio/movilidad para el conteo polimórfico). Los logs (sessionLogs) ya cumplen
  // SummaryLogLike (snake_case + actual_*), se pasan directo.
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

  // Fecha del máximo histórico por ejercicio → "superaste tus 80 kg del 12 jun" (E2-15).
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

  // Guard anti-PR-falso: bloques con sustitución activa (estado en sesión o log con substituted_*).
  const substitutedBlockIds = useMemo(() => {
    const ids = new Set<string>(Object.keys(substitutionByBlock))
    for (const l of sessionLogs) if (l.substituted_exercise_id) ids.add(l.block_id)
    return [...ids]
  }, [substitutionByBlock, sessionLogs])

  // Check-in post-entreno (E2-18): último check-in del alumno → recordatorio por umbrales compartidos.
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

  // Render de un grupo (bloque suelto o superserie) — reutilizado por la lista Y el modo Pasos.
  // `allowCollapse`: true en la lista (los completados colapsan a recap); false en Pasos (siempre
  // card completa para poder editar) — paridad web renderGroup (WorkoutExecutionClient.tsx:1580-1586).
  const renderGroup = useCallback(
    (group: { key: string; type: 'single' | 'superset'; blocks: SessionBlock[] }, { allowCollapse }: { allowCollapse: boolean }) => {
      if (group.type === 'superset') {
        const members = supersetMembersByBlock.get(group.blocks[0].id) ?? group.blocks
        return (
          <SupersetGroupCard
            key={group.key}
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
          />
        )
      }
      const block = group.blocks[0]
      const prescribed = resolveExercise(block)
      if (!prescribed) return null
      const effType = effectiveExerciseType(block, prescribed)
      const isStrengthBlock = effType === 'strength'
      // La sustitución es strength-only (máquina ocupada) — los tipados no la ofrecen.
      const sub = isStrengthBlock ? getSubstitution(block) : null
      // Espeja `substitutionToExercise` de web (WEC:1364-1374): el override del sustituto lleva su
      // propio gif/video/recorte/instrucciones → la CTA "Técnica" (SingleExerciseCard hasTechnique =
      // gif_url||video_url) sigue apareciendo y el modal muestra la técnica DEL SUSTITUTO.
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
      // Completado + lista → recap delgado; tap re-expande la card para editar una serie (web 1701-1713).
      if (allowCollapse && focus === 'done' && !expandedDone[block.id]) {
        const eff = effByBlock.get(block.id) ?? null
        const recapWeight = eff?.weightKg ?? block.target_weight_kg
        const recapSub = isStrengthBlock
          ? `${block.sets} × ${block.reps}${recapWeight != null ? ` · ${recapWeight} kg` : ''}`
          : `${block.sets} ${block.sets === 1 ? 'serie' : 'series'} · ${exercise.muscle_group}`
        return (
          <CollapsedExerciseBar
            key={block.id}
            name={exercise.name}
            sub={recapSub}
            onExpand={() => setExpandedDone((p) => ({ ...p, [block.id]: true }))}
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
          onToggleCollapse={allowCollapse ? () => setExpandedDone((p) => ({ ...p, [block.id]: false })) : undefined}
          recentSet={recentSet}
        />
      )
    },
    [supersetMembersByBlock, sessionLogs, effByBlock, currentWeek, activeBlockId, previousHistory, openDetails, expandedDone, getSubstitution, openSet, hrZones, restoredDraft, motion.reduced, handleCommit, handleRpeUpdate, saveActiveDraft, recentSet],
  )

  // ── Modo Paso a paso (E2-04): modelo de pasos + vistas del rail + auto-avance ──
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
        // Título del paso para el rail + anuncio a11y (paridad web `stepTitle`, WEC:1763-1768):
        // superserie ⇒ "Superserie · A + B" (o "Superserie"); single ⇒ nombre del bloque (o "Ejercicio").
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
      return renderGroup({ key: st.key, type: st.kind, blocks: st.blocks }, { allowCollapse: false })
    },
    [steps, renderGroup],
  )
  const handleToggleMode = useCallback(
    (mode: WorkoutViewMode) => {
      haptics.tap()
      setViewMode(mode)
      void AsyncStorage.setItem(VIEW_MODE_KEY, mode).catch(() => {})
      if (mode === 'steps') {
        // Toggle explícito del usuario: posiciona aquí y desactiva el posicionamiento de hidratación
        // para que su effect no vuelva a mover el índice después.
        didHydrateStepPosRef.current = true
        autoAdvancedRef.current = new Set()
        setStepIndex(firstIncompleteStepIndex(steps, sessionLogs))
      }
    },
    [steps, sessionLogs],
  )
  // Hidratación del modo Pasos (paridad web WEC:1285-1291): si el modo fue restaurado desde storage
  // (no un toggle del usuario), aterriza en el primer paso incompleto una vez que los pasos cargaron —
  // no en 0. Se ejecuta exactamente una vez (ref-guard) y sin pisar la navegación posterior del usuario.
  useEffect(() => {
    if (loading || viewMode !== 'steps' || steps.length === 0 || didHydrateStepPosRef.current) return
    didHydrateStepPosRef.current = true
    setStepIndex(firstIncompleteStepIndex(steps, sessionLogs))
  }, [loading, viewMode, steps, sessionLogs])

  // Auto-avance de paso (paridad web `scrollToNextIncomplete`, WEC:1408-1419): al CERRAR el paso activo
  // (bloque suelto o grupo de superserie completo) el web reposiciona al PRIMER paso incompleto GLOBAL
  // en orden de render — `stepIndexOfBlock(steps, blocks.find(b => !isBlockComplete(b, logs)).id)` — que
  // puede ir HACIA ATRÁS si el usuario saltó pasos con el rail. Aquí calculamos ese mismo destino con
  // `firstIncompleteStepIndex(steps, sessionLogs)` (en vez del antiguo +1). Si ya no queda ningún paso
  // incompleto, web no mueve (`blocks.find` → undefined ⇒ return, WEC:1411) → aquí tampoco. El web lo
  // dispara con un `setTimeout(…, 350)` tras cerrar el bloque/grupo (WEC:1473,1499): mismo retardo de
  // 350ms (antes 650). Guard `autoAdvancedRef` = una sola vez por paso: reeditar un paso ya completo no
  // vuelve a saltar (espeja el `!wasComplete && nowComplete` del web, WEC:1496).
  useEffect(() => {
    if (viewMode !== 'steps' || steps.length === 0) return
    const active = steps[Math.min(stepIndex, steps.length - 1)]
    if (!active || autoAdvancedRef.current.has(active.key)) return
    if (!isStepComplete(active, sessionLogs)) return
    // Todo completo ⇒ el web no reposiciona; nosotros tampoco.
    if (steps.every((st) => isStepComplete(st, sessionLogs))) return
    autoAdvancedRef.current.add(active.key)
    const target = firstIncompleteStepIndex(steps, sessionLogs)
    const t = setTimeout(() => setStepIndex((i) => (i === stepIndex ? target : i)), 350)
    return () => clearTimeout(t)
  }, [sessionLogs, stepIndex, viewMode, steps])

  const stepperActive = viewMode === 'steps' && steps.length > 0

  // Estado vacío (paridad web WEC:1310-1323): plan resuelto pero sin ejercicios → pantalla dedicada
  // con icono, título y CTA al home. Se muestra sólo tras cargar (nunca durante el loader).
  if (!loading && blocks.length === 0) {
    return (
      <SafeAreaView edges={['top']} className="flex-1 items-center justify-center bg-ink-950 p-6">
        <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-white/[0.06]">
          <Dumbbell size={32} color={ON_DARK_MUTED} strokeWidth={2} />
        </View>
        <Text className="mb-2 font-display-bold text-xl text-on-dark">Rutina sin ejercicios</Text>
        <Text className="mb-6 text-center text-sm text-on-dark-muted">
          Esta rutina ya no tiene ejercicios asociados. Tu coach probablemente esté actualizando tu plan.
        </Text>
        <Pressable
          testID="btn-empty-back"
          onPress={() => router.replace('/alumno/home')}
          className="rounded-control bg-sport-500 px-6 py-2.5"
          accessibilityRole="button"
          accessibilityLabel="Volver al inicio"
        >
          <Text className="font-sans-bold text-on-sport">Volver al Dashboard</Text>
        </Pressable>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-ink-950">
      {prCelebration && (
        <View pointerEvents="none" className="absolute inset-0 z-50 items-center" style={{ paddingTop: 90 }}>
          {!motion.reduced && <Confetti autoplay fadeOutOnEnd colors={[theme.primary, '#F59E0B', '#10B981', theme.cyan]} />}
          <View className="rounded-pill px-5 py-3" style={{ backgroundColor: theme.primary }}>
            <Text className="font-display-black text-[15px]" style={{ color: theme.primaryForeground }}>🏆 Nuevo record!</Text>
          </View>
        </View>
      )}

      <SessionHeader
        planTitle={planTitle}
        weekBadge={weekBadge}
        subline={subline}
        currentExerciseNum={currentExerciseNum}
        totalExercises={blocks.length}
        completedSetCount={completedSetCount}
        requiredSets={requiredSets}
        completionPct={completionPct}
        volumeLabel={volumeLabel}
        elapsedLabel={fmtElapsed(elapsedSec)}
        viewMode={viewMode}
        onToggleMode={handleToggleMode}
        // "Salir" → al Dashboard, determinista (paridad web `<Link href={base/dashboard}>`, WEC:1799);
        // `replace` para no dejar la sesión finalizada en el back-stack.
        onBack={() => router.replace('/alumno/home')}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Banner offline BAJO el header (paridad web WEC:1898-1903, sticky top-[header-h]): franja ámbar
          SÓLIDA y prominente con el copy exacto y sus tildes. */}
      <OfflineBanner
        visible={!isOnline}
        prominent
        message="Sin conexión — los datos se guardarán al reconectar."
      />

      {loading ? (
        <EvaLoaderScreen subtitle="Cargando rutina…" />
      ) : stepperActive ? (
        <StepperExecution
          steps={stepViews}
          currentIndex={stepIndex}
          onIndexChange={setStepIndex}
          renderStep={renderStep}
        />
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 140 + insets.bottom, gap: 20 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />}
        >
          {/* El estado "completado" se comunica SÓLO por el colapso de cada ejercicio a su recap
              (CollapsedExerciseBar) — el web NO muestra banner de éxito en la lista (spec §7). */}
          {sections.map((section) => (
            <View key={section.key} className="gap-3">
              <View className="flex-row items-center gap-3">
                <View className="w-1 self-stretch rounded-full" style={{ backgroundColor: '#2680FF', opacity: section.muted ? 0.4 : 1, minHeight: 20 }} />
                <Text className="shrink-0 font-sans-bold text-sm uppercase text-on-dark-muted" style={{ letterSpacing: 1 }}>{section.title}</Text>
                <View className="h-px flex-1 bg-white/10" />
              </View>
              {section.subtitle && (
                <Text className="border-l-2 border-white/10 pl-4 text-[12px] text-on-dark-muted">{section.subtitle}</Text>
              )}
              <View className="gap-3">
                {section.groups.map((group) => renderGroup(group, { allowCollapse: true }))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Barra inferior fija (paridad web `.exec-finish-bar`, WEC:1949-1960): descanso manual (90s) +
          Finalizar. `pt-4` + pad inferior por safe-area (calc(1rem+safe) del web); fila centrada a
          max-w-5xl para no estirarse en tablet. */}
      {!loading && (
        <View
          className="absolute bottom-0 left-0 right-0 border-t border-white/10 bg-ink-950/90 px-4 pt-4"
          style={{ paddingBottom: 16 + insets.bottom }}
        >
          <View className="w-full flex-row items-center justify-between gap-3 self-center" style={{ maxWidth: 1024 }}>
            <Pressable
              testID="btn-manual-rest"
              onPress={() => timers.startRest(90, { autoStart: true })}
              className="h-11 flex-row items-center gap-1.5 rounded-control border border-ember-500/25 bg-ember-500/15 px-3 active:opacity-90"
              accessibilityRole="button"
              accessibilityLabel="Iniciar descanso de 90 segundos"
            >
              <Timer size={14} color={EMBER_200} />
              <Text className="font-sans-bold text-xs text-ember-200">Descanso (90s)</Text>
            </Pressable>
            <Pressable
              testID="btn-finish-workout"
              onPress={handleFinish}
              className="h-12 flex-row items-center gap-2 rounded-control bg-sport-500 px-5 active:opacity-90"
              accessibilityRole="button"
              accessibilityLabel="Finalizar entrenamiento"
            >
              <CheckCircle2 size={16} color={ON_DARK} />
              <Text className="font-sans-bold text-on-sport">Finalizar entrenamiento</Text>
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

      <WorkoutSettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <SubstituteExerciseSheet
        open={substituteBlockId != null}
        onOpenChange={(o) => { if (!o) setSubstituteBlockId(null) }}
        blockId={substituteBlockId}
        prescribedName={substituteBlock ? resolveExercise(substituteBlock)?.name ?? 'Ejercicio' : 'Ejercicio'}
        muscleGroup={substituteBlock ? resolveExercise(substituteBlock)?.muscle_group ?? '' : ''}
        onConfirm={(opt) => {
          // Swap SOLO de esta sesión (el plan no se toca). Motivo constante machine_busy (NG-4);
          // el sheet ya no expone picker de motivo → paridad con el web. El caller cierra el sheet.
          if (!substituteBlockId || !substituteBlock) return
          setSubstitutionByBlock((p) => ({
            ...p,
            [substituteBlockId]: {
              exerciseId: opt.id,
              name: opt.name,
              reason: SUBSTITUTION_REASON,
              prescribedName: resolveExercise(substituteBlock)?.name ?? 'Ejercicio',
              // Media/técnica del candidato → la CTA "Técnica" sigue apareciendo y el modal
              // muestra el video/gif/instrucciones DEL SUSTITUTO (paridad web WEC:1386-1390).
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

      {/* Cierre de sesión rico (E2-15/16/18): resumen a paridad web + share-cards + prompt check-in. */}
      <WorkoutSummaryOverlay
        visible={summaryOpen}
        planTitle={planTitle}
        blocks={summaryBlocks}
        logs={sessionLogs}
        exerciseMaxes={exerciseMaxes}
        exerciseMaxDates={exerciseMaxDates}
        durationSec={finishedElapsed ?? elapsedSec}
        programName={programName}
        nextHint={subline}
        substitutedBlockIds={substitutedBlockIds}
        checkInReminder={checkInReminder}
        checkInLastRelative={checkInLastRelative}
        onCheckIn={() => router.replace('/alumno/check-in')}
        onDone={() => router.replace('/alumno/home')}
        onClose={() => { setSummaryOpen(false); setFinishedElapsed(null) }}
      />
    </SafeAreaView>
  )
}

/**
 * Recap colapsado de un ejercicio COMPLETADO en la lista (paridad web `CollapsedExerciseBar`,
 * WorkoutExecutionClient.tsx:918-961): fila delgada a opacidad plena; tap re-expande la card para
 * ver/editar. El barrido de celebración del borde y el recap de superserie quedan como pulido Wave B.
 */
function CollapsedExerciseBar({ name, sub, onExpand }: { name: string; sub: string; onExpand: () => void }) {
  return (
    <Pressable
      testID="collapsed-exercise-bar"
      onPress={onExpand}
      className="w-full flex-row items-center gap-2.5 rounded-card border border-sport-500/25 bg-sport-500/[0.05] px-3.5 py-2.5 active:opacity-80"
      accessibilityRole="button"
      accessibilityLabel={`${name} — completado, toca para ver o editar`}
    >
      <View className="h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sport-500/15">
        <CheckCircle2 size={20} color={SPORT_400} />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="font-display text-[15px] text-on-dark" numberOfLines={1}>{name}</Text>
        <Text className="font-mono text-[11px] text-on-dark-muted" numberOfLines={1}>{sub}</Text>
      </View>
      <ChevronDown size={16} color={ON_DARK_MUTED} />
    </Pressable>
  )
}
