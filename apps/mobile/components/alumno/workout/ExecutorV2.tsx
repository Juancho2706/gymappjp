import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, findNodeHandle, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useKeepAwake } from 'expo-keep-awake'
import { useRouter } from 'expo-router'
import { MotiView } from 'moti'
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
import { RecoveryBanner } from './RecoveryBanner'
import { EvaLoaderScreen } from '../../EvaLoader'
import { SessionHeader, type WorkoutViewMode } from './SessionHeader'
import { SingleExerciseCard } from './SingleExerciseCard'
import { SupersetGroupCard } from './SupersetGroupCard'
import { StepperExecution, type StepperStepView } from './StepperExecution'
import { KeypadHost, type KeypadTarget } from './KeypadHost'
import { typedTargetFor } from '@eva/workout-engine'
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
// paddingTop del contentContainer del ScrollView (la lista). El wrapper de contenido que medimos con
// `measureLayout` arranca DEBAJO de este padding, así que se suma para pasar a coordenadas de scroll.
const CONTENT_PAD_TOP = 12
// Alto aproximado de la barra fija "Finalizar" (paridad `.exec-finish-bar`, WEC:1949): obstrucción
// inferior que el gate de auto-scroll del web descuenta del viewport (scroll-visibility.ts, WEC:552).
const FINISH_BAR_H = 88
// Alto aproximado de la barra de DESCANSO (`RestTimerBar`): se ancla en `insets.bottom + 88` (sobre la
// barra Finalizar) y mide ~124px (anillo 96 + padding 14·2 + borde). Cuando hay un descanso activo el
// gate de auto-scroll debe descontarla también para no dejar la fila destino oculta detrás de ella —
// paridad con la web, que mide el borde superior del `data-exec-bottom-sheet` (RestTimer, WEC:552).
const REST_BAR_H = 124

/** Completitud de un bloque contra un set de logs ARBITRARIO (la proyección optimista, no el estado):
 *  espeja `isBlockComplete(b, fromLogs)` del web (WEC:1410) para decidir el auto-scroll sin esperar
 *  al re-render. */
function isBlockDoneIn(sets: number, blockId: string, logs: readonly { block_id: string; set_number: number }[]) {
  let done = 0
  for (let i = 1; i <= sets; i += 1) {
    if (logs.some((l) => l.block_id === blockId && l.set_number === i)) done += 1
  }
  return done >= sets
}

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
export default function ExecutorV2({ planId, recoverDate, editDate }: { planId: string; recoverDate?: string; editDate?: string }) {
  return (
    <WorkoutTimerProvider>
      <ExecutorV2Inner planId={planId} recoverDate={recoverDate} editDate={editDate} />
    </WorkoutTimerProvider>
  )
}

function ExecutorV2Inner({ planId, recoverDate, editDate }: { planId: string; recoverDate?: string; editDate?: string }) {
  useKeepAwake() // Wake-lock de TODA la sesión.
  const router = useRouter()
  const insets = useSafeAreaInsets()
  const { theme } = useTheme()
  const motion = useEvaMotion()
  const timers = useWorkoutTimers()
  const session = useWorkoutSession(planId)
  // Guard reentrante de finalización (paridad web `finishing.current`, WEC:1503).
  const finishingRef = useRef(false)

  // ── Auto-scroll de la lista (paridad web `scrollToNextIncomplete` + `blockRefs`/`setRowRefs`,
  // WEC:991-994, 1408-1430) ──────────────────────────────────────────────────────────────────────
  // El web tiene refs por bloque (scroll 'start' al siguiente incompleto) y por fila de serie de
  // superserie (scroll 'center' a la siguiente ronda). Aquí replicamos con: un ref al ScrollView, un
  // wrapper de contenido para medir posiciones absolutas (`measureLayout`), y mapas de nodos por bloque
  // y por fila de ronda (`${blockId}:${set}`). El alto del viewport y el offset de scroll se leen en vivo
  // para el gate "IfNeeded" (no scrollear si ya está a la vista) y para centrar respetando la barra fija.
  const scrollRef = useRef<ScrollView>(null)
  const scrollContentRef = useRef<View>(null)
  const viewportHRef = useRef(0)
  const scrollYRef = useRef(0)
  const blockRowRefs = useRef<Map<string, View>>(new Map())
  const setRowRefs = useRef<Map<string, View>>(new Map())

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
  // Señal one-shot de la serie recién confirmada (paridad web `settleRef`/`prRef`, LogSetForm.tsx:257-258):
  // el chip recap que se acaba de cerrar hace el check elástico y, si fue PR, un pulso dorado. Sólo la
  // serie del último commit (no las cargadas al abrir) → sin animación fantasma. Se limpia a los 800ms.
  const [recentSet, setRecentSet] = useState<{ blockId: string; setNumber: number; pr: boolean } | null>(null)
  const recentSetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Estado de error de sync por serie (mirror web `SetSyncStatus='error'`, `LogSetForm.tsx:136-137`):
  // un guardado que falla CON conexión pinta el chip en rojo + botón Reintentar. `failedPayloads`
  // guarda el payload exacto para que Reintentar re-dispare el mismo commit (mirror `requestSubmit`, :743).
  const [syncErrors, setSyncErrors] = useState<Record<string, string>>({})
  const failedPayloads = useRef<Record<string, OptimisticLogPayload>>({})
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
  // Sublínea del header (paridad web WEC:1813-1818): el `<p>` SIEMPRE se renderiza. `cycle` → "Día X de Y";
  // CUALQUIER otro caso (weekly, o programStructure null en un plan standalone / programa sin structure_type)
  // cae al else abierto ⇒ "Programa semanal". La fase activa prefija `${phaseName} · ` cuando existe, aunque
  // baseSub venga del else. 'Día' lleva tilde (WEC:1816).
  const baseSub =
    programStructure === 'cycle' ? `Día ${dayOfWeek || 1} de ${cycleLength || '?'}` : 'Programa semanal'
  const subline = phaseName ? `${phaseName} · ${baseSub}` : baseSub
  // Nudge "lo que viene" del resumen (paridad web WEC:1572-1578): reusa la sublínea, pero SOLO si hay fase
  // o programa. Un plan standalone sin programa NO muestra hint (null), a diferencia de la sublínea del
  // header, que siempre cae a 'Programa semanal'.
  const nextHint = phaseName || programName ? subline : null

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
        // Editar una serie TIPADA ya logueada (tap en el chip recap): siembra el teclado con TODOS los ejes
        // del log — igual que la rama strength (abajo) y que la web, que SIEMPRE re-renderiza el <form>
        // tipado con cada input pre-llenado por `defaultValue` desde `existingLog` (cardio_min ←
        // actual_duration_sec/60 `LogSetForm.tsx:1034`, actual_distance_m `:1043`, actual_avg_hr `:1052`,
        // actual_hold_sec `:1065`, actual_duration_sec/reps_done roller `:1078/1087`). Sin esto, la rama
        // typed abría el keypad en blanco (initialValues=draft, ya limpiado ⇒ {}) y confirmar disparaba
        // `buildTypedPayload` sobre valores vacíos ⇒ todos los actual_* a null ⇒ BORRABA el registro (P1).
        // Las keys de `values` = los `key` de `typedKeypadFields` (fuente única del mapeo). Decimales en
        // es-CL (coma) vía formatWeightEsCl como el resto de la captura RN; enteros como String crudo.
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
          // Conserva el RPE fijado post-registro con los dots (mirror web hidden input `rpe`,
          // `LogSetForm.tsx:1022`): `buildTypedPayload` lo re-lee de `values.rpe` en vez de forzar null.
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
    // Feedback de PR = pulso dorado inline del chip recap (recentSet.pr → SetRow), como el web
    // (settleRef/prRef en LogSetForm; SPEC §7). El haptic se conserva como adaptación táctil idiomática
    // de RN (no crea divergencia visual). NO hay overlay de PR a pantalla completa: el orquestador web
    // no muestra Confetti ni banner (divergencia retirada por paridad 1:1, auditoría spec-vs-RN #7).
    if (isPR) void haptics.pr()
  }, [])

  // Scroll a un nodo medido, con alineación 'start' (borde superior) o 'center' (centro del área útil),
  // replicando `smoothScrollIntoViewIfNeeded` del web (WEC:1425,1429): sólo mueve si el nodo NO está ya a
  // la vista, descuenta la barra fija inferior de la zona visible y respeta reduced-motion (animated).
  const scrollToNode = useCallback(
    (node: View | undefined | null, align: 'start' | 'center') => {
      const scroller = scrollRef.current
      const content = scrollContentRef.current
      if (!node || !scroller || !content) return
      const contentHandle = findNodeHandle(content)
      if (contentHandle == null) return
      node.measureLayout(
        contentHandle,
        (_x, yRel, _w, h) => {
          const vh = viewportHRef.current
          const scrollY = scrollYRef.current
          const top = CONTENT_PAD_TOP + yRel
          const bottom = top + h
          // Con un descanso activo, la RestTimerBar se ancla sobre la barra Finalizar: se suma su alto
          // a la obstrucción inferior para que la fila auto-scrolleada no quede tapada tras ella.
          const restBarObstruction = timers.state?.kind === 'rest' ? REST_BAR_H : 0
          const bottomObstruction = FINISH_BAR_H + insets.bottom + restBarObstruction
          // Gate "IfNeeded": si ya está completamente visible (bajo el header y sobre la barra), no mover.
          if (vh > 0 && top >= scrollY + 8 && bottom <= scrollY + vh - bottomObstruction) return
          let target: number
          if (align === 'center' && vh > 0) {
            const usable = vh - bottomObstruction
            target = top + h / 2 - usable / 2
          } else {
            target = top - 8
          }
          scroller.scrollTo({ y: Math.max(0, target), animated: !motion.reduced })
        },
        () => {},
      )
    },
    [insets.bottom, motion.reduced, timers.state?.kind],
  )

  // Auto-scroll al siguiente incompleto (paridad web `scrollToNextIncomplete`, WEC:1408-1430): si el
  // próximo bloque incompleto es de una superserie ⇒ trae su siguiente fila de ronda al 'center'; si es
  // suelto ⇒ trae el bloque al 'start'. Sólo corre en modo Lista (en Pasos el avance lo maneja el efecto
  // de auto-avance, que ya reposiciona el pager — WEC:1415-1418).
  const scrollToNextIncomplete = useCallback(
    (fromLogs: readonly { block_id: string; set_number: number }[]) => {
      const nextIncomplete = blocks.find((b) => !isBlockDoneIn(b.sets, b.id, fromLogs))
      if (!nextIncomplete) return
      const members = supersetMembersByBlock.get(nextIncomplete.id)
      if (members && members.length >= 2) {
        const order = buildRoundOrder(members.map((m) => ({ id: m.id, sets: m.sets })))
        const pos = order.find((p) => !fromLogs.some((l) => l.block_id === p.blockId && l.set_number === p.set))
        if (pos) {
          scrollToNode(setRowRefs.current.get(`${pos.blockId}:${pos.set}`), 'center')
          return
        }
      }
      scrollToNode(blockRowRefs.current.get(nextIncomplete.id), 'start')
    },
    [blocks, supersetMembersByBlock, scrollToNode],
  )

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
      // Guard "editar serie ya cerrada no toca el descanso" (paridad web buildRest `if (isLogged) return`,
      // LogSetForm.tsx:372, con isLogged capturado pre-commit en :247). Si la serie YA estaba loggeada
      // antes de este commit (edición vía keypad o reintento de una serie cerrada), la decisión del
      // descanso —startRest/cancelRest— se omite por completo, igual que la web: ni se dispara ni se corta
      // ningún descanso al re-guardar una serie ya cerrada. `sessionLogs` del closure es el estado previo.
      const wasLogged = sessionLogs.some((l) => l.block_id === payload.blockId && l.set_number === payload.setNumber)
      const { isPR, error } = await logSet(
        payload,
        sub ? { substitution: { exerciseId: sub.exerciseId, name: sub.name, reason: sub.reason } } : undefined,
      )
      // Estado 'error' por serie (mirror web `state.error` ⇒ error+Reintentar, `LogSetForm.tsx:348-363,738-749`):
      // un fallo REAL (con conexión) surface el chip en rojo con Reintentar; el éxito lo limpia.
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
        // Decisión del descanso — espeja buildRest (LogSetForm.tsx:370-380) SÓLO si no es edición de una
        // serie ya cerrada (guard wasLogged). Tres ramas de auto-skip vía cancelRest, como la web:
        //  (a) auto-timer OFF → cancelRest y nada más (:374): registrar corta cualquier descanso manual.
        //  (b) la ronda NO cierra → cancelRest (:380): sigues con el otro ejercicio, se corta el descanso.
        //  (c) la ronda cierra → startRest del descanso del grupo (:379).
        if (!wasLogged) {
          if (!isRestAutoTimerEnabled()) {
            timers.cancelRest()
          } else if (roundClosed) {
            const groupRest = members.reduce((mx, m) => Math.max(mx, parseRestTime(m.rest_time)), 0)
            // Etiqueta "qué sigue" de la barra = nombre del PRIMER miembro del grupo (paridad web
            // LogSetForm.tsx:379 `startRest(..., { label: nextUpLabel })` con nextUpLabel = memberVMs[0]
            // .exercise.name, WEC:884). Así la barra pinta "Sigue · {ejercicio}" en vez del fallback.
            const label = resolveExercise(members[0])?.name
            if (groupRest > 0) timers.startRest(groupRest, { autoStart: true, label })
          } else {
            timers.cancelRest()
          }
        }
        // Toast "Sin descanso — sigue con {label}" entre miembros de la ronda (display, paridad web
        // handleLogged WEC:1462-1466). Es independiente del auto-timer y del guard de descanso.
        if (nextPos && !roundClosed) {
          const idx = members.findIndex((m) => m.id === nextPos.blockId)
          const label = `${SUPERSET_MEMBER_LETTERS[idx] ?? ''}${nextPos.set}`
          toast.info(`Sin descanso — sigue con ${label}`)
        }
        // Auto-scroll (paridad web handleLogged, WEC:1462-1474): en modo Lista, tras cada serie de
        // superserie trae la SIGUIENTE fila de ronda al 'center' (350ms); al cerrar el grupo (nextPos
        // null) salta al siguiente incompleto. En Pasos no aplica (lo maneja el auto-avance).
        if (viewMode === 'list') {
          if (nextPos) {
            const key = `${nextPos.blockId}:${nextPos.set}`
            setTimeout(() => scrollToNode(setRowRefs.current.get(key), 'center'), 350)
          } else {
            setTimeout(() => scrollToNextIncomplete(projected), 350)
          }
        }
        return
      }

      // ── Bloque suelto ──
      // Toast de confirmación (paridad web WEC:1486-1492, solo strength). La acción "Deshacer" no es
      // portable (el Toast RN no lleva botón); el deshacer sigue disponible tocando el chip recap.
      const ex = block ? resolveExercise(block) : null
      if (!error && block && ex && effectiveExerciseType(block, ex) === 'strength') {
        toast.success('Serie registrada')
      }
      // Decisión del descanso del bloque suelto — espeja buildRest (LogSetForm.tsx:381-386) SÓLO si no es
      // edición de una serie ya cerrada (guard wasLogged). Descanso de aproximación (warmup): la 1ª serie
      // de un bloque de ≥3 series usa el `warmup_rest_time` (más corto) si existe, y la barra pinta el
      // eyebrow "Aproximación" (paridad web `useWarmup = !!warmupRestTimeStr && setNumber===1 &&
      // (totalSets ?? 0) >= 3`; datos de SingleExerciseCard.tsx:403-405 warmup_rest_time/sets).
      if (!wasLogged) {
        const useWarmup = !!block?.warmup_rest_time && payload.setNumber === 1 && (block?.sets ?? 0) >= 3
        const restStr = useWarmup ? block!.warmup_rest_time! : block?.rest_time
        const secs = parseRestTime(restStr)
        // Tres ramas espejo de buildRest, con auto-skip vía cancelRest como la web:
        //  (a) auto-timer OFF → cancelRest (:374): registrar la serie corta cualquier descanso manual.
        //  (b) sin rest_time (parseRestTime<=0) → cancelRest (:386).
        //  (c) rest válido → startRest con etiqueta = nombre del ejercicio (nextUpLabel, SingleExerciseCard
        //      .tsx:405) y flag warmup para el eyebrow de la barra.
        if (!isRestAutoTimerEnabled()) {
          timers.cancelRest()
        } else if (secs > 0) {
          timers.startRest(secs, { autoStart: true, label: ex?.name, warmup: useWarmup })
        } else {
          timers.cancelRest()
        }
      }
      // Auto-scroll al completar el bloque suelto (paridad web WEC:1494-1500): sólo al pasar de
      // incompleto→completo (mirror `!wasComplete && nowComplete`), salta al siguiente incompleto
      // ('start') a los 350ms. En Pasos no aplica (lo maneja el efecto de auto-avance).
      if (viewMode === 'list' && block) {
        const wasComplete = isBlockDoneIn(block.sets, block.id, sessionLogs)
        const nowComplete = isBlockDoneIn(block.sets, block.id, projected)
        if (!wasComplete && nowComplete) setTimeout(() => scrollToNextIncomplete(projected), 350)
      }
    },
    [blocks, getSubstitution, logSet, timers, sessionLogs, supersetMembersByBlock, signalCommitted, viewMode, scrollToNode, scrollToNextIncomplete],
  )

  // Reintentar el guardado de una serie fallida (mirror web `Reintentar` → `requestSubmit`, LogSetForm.tsx:743):
  // re-dispara el MISMO commit con el payload guardado. Éxito ⇒ handleCommit limpia el error del chip.
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
  // Adaptación RN: el Toast no soporta botón de acción. El web, con series sin sincronizar, muestra un
  // toast con acción "Finalizar igual" y RETORNA sin finalizar (WEC:1527-1555) — la sesión queda abierta
  // y el alumno decide esperar la sync o finalizar explícitamente. Preservamos ESA elección con un Alert
  // de confirmación ("Esperar" / "Finalizar igual") en vez de auto-finalizar de golpe.
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
        try { await flushLogQueue(supabase) } catch { /* excepción global → conservamos el aviso */ }
      }
      const stillPending = await getPendingLogCount()
      if (stillPending > 0) {
        // Paridad de elección con el web: no saltar al resumen; confirmar. "Esperar" mantiene la sesión
        // abierta (la cola reintenta al reconectar); "Finalizar igual" cierra igual que el web.
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
      // ¿Algún set de este bloque falló online (chip rojo "Reintentar")? Sus keys en `syncErrors` son
      // `${blockId}:${setNumber}`. Un fallo REAL debe MANTENER la card expandida aunque el bloque cuente
      // como "done" (la fila errada sigue en `sessionLogs` como `_pending`), porque el chip de reintento
      // sólo se pinta dentro de la card completa: si colapsara a recap, el error quedaría invisible.
      // Espeja el web, que revierte la fila optimista para que el bloque se re-expanda (WEC:1304-1308).
      const blockHasSyncError = (blockId: string) =>
        Object.keys(syncErrors).some((k) => k.startsWith(`${blockId}:`))
      if (group.type === 'superset') {
        const members = supersetMembersByBlock.get(group.blocks[0].id) ?? group.blocks
        const groupComplete = members.every(isBlockComplete)
        const groupActive = activeBlockId != null && members.some((m) => m.id === activeBlockId)
        // Superserie completa + lista → colapsa a recap delgado, reexpandible con tap (paridad web
        // WEC:1594-1607). En Pasos (allowCollapse false) siempre queda la card completa para editar.
        if (allowCollapse && groupComplete && !expandedDone[group.key] && !members.some((m) => blockHasSyncError(m.id))) {
          const names = members.map((m) => resolveExercise(m)?.name).filter(Boolean).join(' + ')
          return (
            <CollapsedExerciseBar
              key={group.key}
              name={names || 'Superserie'}
              sub={`Superserie · ${members.length} ejercicios`}
              reducedMotion={motion.reduced}
              // Celebración one-shot: la serie recién confirmada pertenece a un miembro (mirror web
              // `justCompleted` de un miembro, WEC:1603). Se apaga con reduced-motion.
              celebrate={!motion.reduced && recentSet != null && members.some((m) => m.id === recentSet.blockId)}
              onExpand={() => setExpandedDone((p) => ({ ...p, [group.key]: true }))}
            />
          )
        }
        // Marcador de foco a nivel de grupo (paridad web WEC:1608-1615: `motion.div layout` con
        // boxShadow sport cuando el grupo es el activo). Adaptación RN: sombra sport en la View wrapper.
        return (
          <View
            key={group.key}
            style={
              groupActive && !motion.reduced
                ? {
                    shadowColor: theme.primary,
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 0.35,
                    shadowRadius: 16,
                    elevation: 8,
                  }
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
              // Registro de nodos de filas de ronda = `setRowRefs` del web (WEC:992): destino del scroll
              // 'center' a la siguiente serie de la superserie tras cada commit.
              registerSetRowRef={(key, node) => {
                if (node) setRowRefs.current.set(key, node)
                else setRowRefs.current.delete(key)
              }}
            />
          </View>
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
      if (allowCollapse && focus === 'done' && !expandedDone[block.id] && !blockHasSyncError(block.id)) {
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
            reducedMotion={motion.reduced}
            // Celebración one-shot al cerrar el bloque (mirror web `justCompleted?.id === block.id`, WEC:1708).
            celebrate={!motion.reduced && recentSet?.blockId === block.id}
            onExpand={() => setExpandedDone((p) => ({ ...p, [block.id]: true }))}
          />
        )
      }
      return (
        // Wrapper con ref por bloque = `blockRefs` del web (WEC:991): destino del scroll 'start' al
        // siguiente bloque suelto incompleto. `collapsable={false}` para que `measureLayout` lo encuentre.
        <View
          key={block.id}
          collapsable={false}
          ref={(node) => {
            if (node) blockRowRefs.current.set(block.id, node)
            else blockRowRefs.current.delete(block.id)
          }}
        >
        <SingleExerciseCard
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
          syncErrors={syncErrors}
          onRetrySet={retryCommit}
        />
        </View>
      )
    },
    [supersetMembersByBlock, sessionLogs, effByBlock, currentWeek, activeBlockId, isBlockComplete, previousHistory, openDetails, expandedDone, getSubstitution, openSet, hrZones, restoredDraft, motion.reduced, theme.primary, handleCommit, handleRpeUpdate, saveActiveDraft, recentSet, syncErrors, retryCommit],
  )

  // ── Cuerpo de la lista MEMOIZADO (fix perf QA-14: lag/stuttering al scrollear) ───────────────────
  // Causa raíz: el cronómetro de sesión (`elapsedSec`, useWorkoutSession con setInterval de 1s,
  // workout-session.ts:572-580) hace setState CADA SEGUNDO → ExecutorV2Inner se re-renderiza 1×/s durante
  // TODA la sesión. Como los grupos se pintaban con una llamada INLINE a `renderGroup(...)` (no
  // componentes memoizados) directamente en el JSX del ScrollView, sin este memo el árbol COMPLETO de la
  // lista se reconciliaba cada segundo: un día de ~18 series sin registrar monta ~18 ActiveSetRow, cada
  // uno con 2 EffortScale de 10 dots `MotiView` (Reanimated, TypedKeypad.tsx:639) = ~360 nodos animados
  // reconstruidos por tick, aunque el alumno no toque nada. Ese trabajo periódico del hilo JS cae a mitad
  // del gesto de scroll → el hitch de ~1/seg que el CEO reporta. (El tick del DESCANSO no era el problema:
  // vive local en RestTimerBar `useState timeLeft`, no toca este árbol; y "Descanso (90)" del footer es
  // una constante estática.) `renderGroup` es un useCallback cuyas deps NO incluyen `elapsedSec` (solo
  // sessionLogs/expandedDone/openDetails/recentSet/syncErrors/…), así que en el tick su identidad es
  // estable → este memo devuelve el MISMO árbol de elementos y React descarta la reconciliación de la
  // lista. Se recomputa SOLO ante cambios reales (registrar serie, expandir detalles, sustituir, error de
  // sync). El SessionHeader (que sí muestra el cronómetro) se re-renderiza aparte, barato.
  // Re-renders eliminados: de 1 reconciliación completa de la lista por segundo → 0 por tick (durante
  // scroll: de ~1-2 hitches por gesto → ninguno atribuible al cronómetro).
  const listBody = useMemo(
    () =>
      sections.map((section) => (
        <View key={section.key} className="gap-3">
          {/* Header row + subtitle anidados en un View gap-1.5 (6px) — paridad web: la sección es
              space-y-3 pero title→subtitle vive en un `div.space-y-1.5` interno (WEC:1920-1938), así
              que title→subtitle = 6px y subtitle→grupos = 12px (el gap-3 externo). */}
          <View className="gap-1.5">
            <View className="flex-row items-center gap-3">
              <View className="w-1 self-stretch rounded-full bg-sport-500" style={{ opacity: section.muted ? 0.4 : 1, minHeight: 20 }} />
              <Text className="shrink-0 font-sans-bold text-sm uppercase text-on-dark-muted" style={{ letterSpacing: 1 }}>{section.title}</Text>
              <View className="h-px flex-1 bg-white/10" />
            </View>
            {section.subtitle && (
              <Text className="border-l-2 border-white/10 pl-4 text-[12px] text-on-dark-muted">{section.subtitle}</Text>
            )}
          </View>
          <View className="gap-3">
            {section.groups.map((group) => renderGroup(group, { allowCollapse: true }))}
          </View>
        </View>
      )),
    [sections, renderGroup],
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
    const target = firstIncompleteStepIndex(steps, sessionLogs)
    // El `add` al ref va DENTRO del timer (no síncrono): al cerrar el paso, `sessionLogs` cambia dos
    // veces (log optimista → log reconciliado del server). Marcar síncrono hacía que el segundo update
    // (con buena red, <350ms) disparara el cleanup —matando el timer— y el re-run saliera por el guard
    // `has(active.key)` sin reprogramar → el paso quedaba atascado. Marcando sólo al DISPARAR, un timer
    // cancelado se reprograma en el re-run; espeja el fire único de `scrollToNextIncomplete` del web
    // (WEC:1499), que no se recalcula en la reconciliación.
    const t = setTimeout(() => {
      autoAdvancedRef.current.add(active.key)
      setStepIndex((i) => (i === stepIndex ? target : i))
    }, 350)
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
        reducedMotion={motion.reduced}
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

      {/* Banner informativo de recuperar/editar (E1.7): abierto desde el dashboard con param
          `recuperar` (ambar) o `fecha` (neutro). NO cambia el guardado (escribe el log de hoy). */}
      <RecoveryBanner recoverDate={recoverDate} editDate={editDate} />

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
          ref={scrollRef}
          onLayout={(e) => { viewportHRef.current = e.nativeEvent.layout.height }}
          onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y }}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: CONTENT_PAD_TOP, paddingBottom: 140 + insets.bottom }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />}
        >
          {/* Wrapper de contenido: ancla de `measureLayout` para el auto-scroll (posiciones absolutas de
              bloques/filas). Lleva el gap:20 entre secciones (antes en contentContainerStyle, que con un
              único hijo ya no aplicaba). El estado "completado" se comunica SÓLO por el colapso de cada
              ejercicio a su recap — el web NO muestra banner de éxito en la lista (spec §7). */}
          {/* Columna de contenido acotada a 1024px y centrada = paridad web: el body de la lista es
              `max-w-5xl mx-auto` (WEC:1915), igual que el header (WEC:1797) y la barra Finalizar
              (`max-w-5xl mx-auto`, WEC:1950). En tablet evita que las cards se estiren de borde a borde
              mientras la barra Finalizar (maxWidth:1024) y el stepper (maxWidth:768) ya van centrados. */}
          <View ref={scrollContentRef} collapsable={false} className="w-full self-center" style={{ gap: 20, maxWidth: 1024 }}>
          {listBody}
          </View>
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
              {/* Label = render REAL del web: el caller pasa defaultTime={'90'} (WEC:1951), truthy, así que
                  el fallback '90s' nunca aplica y el web muestra literalmente 'Descanso (90)' (WEC:217). */}
              <Text className="font-sans-bold text-xs text-ember-200">Descanso (90)</Text>
            </Pressable>
            <Pressable
              testID="btn-finish-workout"
              onPress={handleFinish}
              className="h-12 flex-row items-center gap-2 rounded-control bg-sport-500 px-5 active:opacity-90"
              accessibilityRole="button"
              accessibilityLabel="Finalizar entrenamiento"
            >
              {/* Icono blanco puro = paridad web WEC:1952 (`text-white`): tanto el `CheckCircle2 w-4 h-4`
                  como el rótulo heredan currentColor=#FFFFFF. Usamos el token `theme.primaryForeground`
                  (text-on-sport, #FFFFFF) para igualar el `text-on-sport` del Text adyacente, no ON_DARK
                  (#F4F6F8, con tinte azulado) que dejaría el icono más apagado que su propia etiqueta. */}
              <CheckCircle2 size={16} color={theme.primaryForeground} />
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
        nextHint={nextHint}
        substitutedBlockIds={substitutedBlockIds}
        checkInReminder={checkInReminder}
        checkInLastRelative={checkInLastRelative}
        onCheckIn={() => router.replace('/alumno/check-in')}
        onDone={() => router.replace('/alumno/home')}
        // PARIDAD ESTRICTA CON WEB: el overlay web NO tiene control de descarte — su única salida es
        // "Volver al inicio" → onDone (WorkoutSummaryOverlay.tsx:517-524). Antes cableábamos `onClose`
        // (cerraba el resumen y volvía a la pantalla de entreno completado SIN navegar a home), una vía
        // de escape ausente en web que podía saltarse el flujo onDone. Al no pasar `onClose`, el botón
        // ✕ no se renderiza y el back de Android cae en onDone (ver onRequestClose del Modal). El reset
        // de finishedElapsed ya no es necesario porque onDone abandona la pantalla.
      />
    </SafeAreaView>
  )
}

/**
 * Recap colapsado de un ejercicio/superserie COMPLETADO en la lista (paridad web `CollapsedExerciseBar`,
 * WorkoutExecutionClient.tsx:918-964): fila delgada a opacidad plena; tap re-expande la card para
 * ver/editar. Si `celebrate` (serie recién confirmada de este bloque/miembro y sin reduced-motion), el
 * check entra elástico (spring 500·25, mirror web `springs.elastic`) y un borde sport barre su opacidad
 * (mirror web `motion.span border-2` opacity [0,0.55,0] a 500ms, WEC:940-956).
 */
function CollapsedExerciseBar({
  name,
  sub,
  onExpand,
  reducedMotion = false,
  celebrate = false,
}: {
  name: string
  sub: string
  onExpand: () => void
  reducedMotion?: boolean
  celebrate?: boolean
}) {
  const animate = celebrate && !reducedMotion
  return (
    <Pressable
      testID="collapsed-exercise-bar"
      onPress={onExpand}
      className="relative w-full flex-row items-center gap-2.5 overflow-hidden rounded-card border border-sport-500/25 bg-sport-500/[0.05] px-3.5 py-2.5 active:opacity-80"
      accessibilityRole="button"
      accessibilityLabel={`${name} — completado, toca para ver o editar`}
    >
      {animate && (
        // Barrido del borde sport: entra a 0.55 y se desvanece a 0 en 500ms (mirror web opacity [0,0.55,0]).
        <MotiView
          pointerEvents="none"
          from={{ opacity: 0.55 }}
          animate={{ opacity: 0 }}
          transition={{ type: 'timing', duration: 500 }}
          className="absolute inset-0 rounded-card border-2 border-sport-500"
        />
      )}
      <MotiView
        from={animate ? { scale: 0 } : { scale: 1 }}
        animate={{ scale: 1 }}
        transition={animate ? { type: 'spring', stiffness: 500, damping: 25 } : { type: 'timing', duration: 0 }}
        className="h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sport-500/15"
      >
        <CheckCircle2 size={20} color={SPORT_400} />
      </MotiView>
      <View className="min-w-0 flex-1">
        <Text className="font-display text-[15px] text-on-dark" numberOfLines={1}>{name}</Text>
        <Text className="font-mono text-[11px] text-on-dark-muted" numberOfLines={1}>{sub}</Text>
      </View>
      <ChevronDown size={16} color={ON_DARK_MUTED} />
    </Pressable>
  )
}
