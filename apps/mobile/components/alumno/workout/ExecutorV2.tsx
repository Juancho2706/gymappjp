import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useKeepAwake } from 'expo-keep-awake'
import { useRouter } from 'expo-router'
import { Confetti } from 'react-native-fast-confetti'
import { CheckCircle2, Timer, Trophy } from 'lucide-react-native'
import {
  buildStepModel,
  effectiveExerciseType,
  firstIncompleteStepIndex,
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
import { bestPrevOf, fmtElapsed, fmtVolume, parseRestTime } from './workout-ui'

/** Carril device-scoped del modo de vista (Lista/Pasos), igual que `STEPPER_MODE_KEY` de web. */
const VIEW_MODE_KEY = 'eva_workout_view_mode'
// Contrato de la ola (otros workers): provider de timers + sheet de sustitución. Importados con la
// firma exacta del contrato; el orquestador integra. NO stubear.
import { WorkoutTimerProvider, useWorkoutTimers } from './timers/TimerProvider'
import { isRestAutoTimerEnabled } from './timers'
import { SubstituteExerciseSheet } from './SubstituteExerciseSheet'

const ON_DARK = '#F4F6F8'
const EMBER_300 = '#FFB199'

type ActiveSub = { exerciseId: string | null; name: string; reason: string | null; prescribedName: string }

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
  const { theme } = useTheme()
  const motion = useEvaMotion()
  const timers = useWorkoutTimers()
  const session = useWorkoutSession(planId)

  const [keypadTarget, setKeypadTarget] = useState<KeypadTarget | null>(null)
  const [techniqueExercise, setTechniqueExercise] = useState<SessionExercise | null>(null)
  const [openDetails, setOpenDetails] = useState<Record<string, boolean>>({})
  const [substituteBlockId, setSubstituteBlockId] = useState<string | null>(null)
  const [substitutionByBlock, setSubstitutionByBlock] = useState<Record<string, ActiveSub>>({})
  const [summaryOpen, setSummaryOpen] = useState(false)
  // Duración CONGELADA al finalizar (snapshot del cronómetro en ese instante). El overlay no debe
  // seguir sumando mientras está abierto — paridad web (`finishedElapsed`, ya viene capado a 4h).
  const [finishedElapsed, setFinishedElapsed] = useState<number | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [prCelebration, setPrCelebration] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [viewMode, setViewMode] = useState<WorkoutViewMode>('list')
  const [stepIndex, setStepIndex] = useState(0)
  const autoAdvancedRef = useRef<Set<string>>(new Set())

  // Modo de vista device-scoped (persiste Lista/Pasos entre sesiones, como web STEPPER_MODE_KEY).
  useEffect(() => {
    void AsyncStorage.getItem(VIEW_MODE_KEY).then((v) => {
      if (v === 'steps' || v === 'list') setViewMode(v)
    })
  }, [])

  const {
    loading, planTitle, programName, activeWeekVariant, currentWeek, weeksToRepeat, programStructure, cycleLength,
    dayOfWeek, clientId, blocks, sections, supersetMembersByBlock, sessionLogs, previousHistory, lastSessionByBlock,
    exerciseMaxes, elapsedSec, capped, isOnline, restoredDraft, refresh, saveDraft, logSet,
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
        return {
          exerciseId: log.substituted_exercise_id ?? null,
          name: log.substituted_exercise_name ?? 'Sustituto',
          reason: log.substitution_reason ?? null,
          prescribedName: resolveExercise(block)?.name ?? 'Ejercicio',
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
  const allDone = requiredSets > 0 && completedSetCount >= requiredSets
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
  const subline =
    programStructure === 'cycle' ? `Dia ${dayOfWeek || 1} de ${cycleLength || '?'}` : programStructure === 'weekly' ? 'Programa semanal' : null

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
      const initialValues = prefill
        ? { weight: prefill.weight != null ? String(prefill.weight) : '', reps: prefill.reps != null ? String(prefill.reps) : '' }
        : restored?.values
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
      })
      haptics.tap()
    },
    [blocks, effByBlock, restoredDraft, previousHistory],
  )

  // ── Commit de una serie ─────────────────────────────────────────────────────
  const handleCommit = useCallback(
    async (payload: OptimisticLogPayload) => {
      const block = blocks.find((b) => b.id === payload.blockId)
      const sub = block ? getSubstitution(block) : null
      setKeypadTarget(null)
      haptics.setDone()
      const { isPR } = await logSet(
        payload,
        sub ? { substitution: { exerciseId: sub.exerciseId, name: sub.name, reason: sub.reason } } : undefined,
      )
      if (isPR) {
        setPrCelebration(true)
        void haptics.pr()
        setTimeout(() => setPrCelebration(false), 2600)
      }
      // Cronómetro automático (pref device-scoped, default ON): si está apagado no arranca solo.
      const secs = parseRestTime(block?.rest_time)
      if (secs > 0 && isRestAutoTimerEnabled()) timers.startRest(secs, { autoStart: true })
    },
    [blocks, getSubstitution, logSet, timers],
  )

  const handleDraftChange = useCallback(
    (values: Record<string, string>, fieldIndex: number) => {
      if (!keypadTarget) return
      saveDraft({ blockId: keypadTarget.blockId, setNumber: keypadTarget.setNumber, values, fieldIndex })
    },
    [keypadTarget, saveDraft],
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
  const renderGroup = useCallback(
    (group: { key: string; type: 'single' | 'superset'; blocks: SessionBlock[] }) => {
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
            onOpenTechnique={(b) => setTechniqueExercise(resolveExercise(b))}
            onOpenSet={openSet}
            onCommitSet={handleCommit}
            onDraftChange={saveActiveDraft}
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
      const exercise: SessionExercise = sub
        ? { ...prescribed, id: sub.exerciseId ?? prescribed.id, name: sub.name, gif_url: null, video_url: null, instructions: null }
        : prescribed
      const blockLogs = sessionLogs.filter((l) => l.block_id === block.id)
      const doneCount = new Set(blockLogs.filter((l) => l.set_number >= 1 && l.set_number <= block.sets).map((l) => l.set_number)).size
      const complete = doneCount >= block.sets
      const focus: 'active' | 'upcoming' | 'done' = complete ? 'done' : block.id === activeBlockId ? 'active' : 'upcoming'
      const prevList: PrevSet[] = sub ? [] : previousHistory[exercise.id] ?? []
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
          onToggleDetails={() => setOpenDetails((p) => ({ ...p, [block.id]: !p[block.id] }))}
          onOpenTechnique={() => setTechniqueExercise(exercise)}
          onOpenSet={(setNumber) => openSet(block.id, setNumber)}
          onCommitSet={handleCommit}
          onDraftChange={saveActiveDraft}
          onOpenSubstitute={() => setSubstituteBlockId(block.id)}
          onUndoSubstitution={() => setSubstitutionByBlock((p) => { const n = { ...p }; delete n[block.id]; return n })}
        />
      )
    },
    [supersetMembersByBlock, sessionLogs, effByBlock, currentWeek, activeBlockId, previousHistory, openDetails, getSubstitution, openSet, hrZones, restoredDraft, handleCommit, saveActiveDraft],
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
      steps.map((st) => ({
        key: st.key,
        title: st.blocks.map((b) => resolveExercise(b)?.name ?? 'Ejercicio').join(' + '),
        sectionTitle: st.sectionTitle,
        muted: st.muted,
        complete: isStepComplete(st, sessionLogs),
      })),
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
  const handleToggleMode = useCallback(
    (mode: WorkoutViewMode) => {
      haptics.tap()
      setViewMode(mode)
      void AsyncStorage.setItem(VIEW_MODE_KEY, mode).catch(() => {})
      if (mode === 'steps') {
        autoAdvancedRef.current = new Set()
        setStepIndex(firstIncompleteStepIndex(steps, sessionLogs))
      }
    },
    [steps, sessionLogs],
  )
  // Auto-avance: al completar el paso activo, avanza al siguiente (una sola vez por paso).
  useEffect(() => {
    if (viewMode !== 'steps' || steps.length === 0) return
    const active = steps[Math.min(stepIndex, steps.length - 1)]
    if (!active || autoAdvancedRef.current.has(active.key)) return
    if (isStepComplete(active, sessionLogs) && stepIndex < steps.length - 1) {
      autoAdvancedRef.current.add(active.key)
      const t = setTimeout(() => setStepIndex((i) => (i === stepIndex ? Math.min(i + 1, steps.length - 1) : i)), 650)
      return () => clearTimeout(t)
    }
  }, [sessionLogs, stepIndex, viewMode, steps])

  const stepperActive = viewMode === 'steps' && steps.length > 0

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

      <OfflineBanner visible={!isOnline} />

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
        capped={capped}
        viewMode={viewMode}
        onToggleMode={handleToggleMode}
        onBack={() => router.back()}
        onOpenSettings={() => setSettingsOpen(true)}
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
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 120, gap: 20 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />}
        >
          {allDone && (
            <View className="flex-row items-start gap-3 rounded-card border border-success-500/40 bg-success-500/[0.16] p-4">
              <Trophy size={18} color="#1FB877" strokeWidth={2} />
              <View className="flex-1">
                <Text className="font-sans-bold text-[15px] text-success-500">Entrenamiento completado!</Text>
                <Text className="mt-0.5 text-[12px] text-success-600">Todas las series registradas. Queda sincronizado con tu coach.</Text>
              </View>
            </View>
          )}

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
                {section.groups.map((group) => renderGroup(group))}
              </View>
            </View>
          ))}
        </ScrollView>
      )}

      {/* Barra inferior fija: descanso manual (WAVE-B-SEAM: modo protagonista + ajustes de alarma). */}
      {!loading && (
        <View className="absolute bottom-0 left-0 right-0 flex-row items-center justify-between gap-3 border-t border-white/10 bg-ink-950/95 px-4 pb-8 pt-3">
          <Pressable
            testID="btn-manual-rest"
            onPress={() => timers.startRest(90, { autoStart: true })}
            className="h-11 flex-row items-center gap-1.5 rounded-control border border-ember-500/25 bg-ember-500/15 px-3"
            accessibilityRole="button"
            accessibilityLabel="Iniciar descanso de 90 segundos"
          >
            <Timer size={16} color={EMBER_300} />
            <Text className="font-sans-bold text-xs text-ember-200">Descanso (90s)</Text>
          </Pressable>
          <Pressable
            testID="btn-finish-workout"
            onPress={() => { setFinishedElapsed(elapsedSec); setSummaryOpen(true) }}
            className="h-12 flex-row items-center gap-2 rounded-control bg-sport-500 px-5"
            accessibilityRole="button"
            accessibilityLabel="Finalizar entrenamiento"
          >
            <CheckCircle2 size={16} color={ON_DARK} />
            <Text className="font-sans-bold text-on-sport">Finalizar entrenamiento</Text>
          </Pressable>
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
        visible={substituteBlockId != null}
        onClose={() => setSubstituteBlockId(null)}
        blockId={substituteBlockId ?? ''}
        exerciseName={substituteBlock ? resolveExercise(substituteBlock)?.name ?? '' : ''}
        onSubstituted={(s) => {
          if (!substituteBlockId || !substituteBlock) return
          setSubstitutionByBlock((p) => ({
            ...p,
            [substituteBlockId]: {
              exerciseId: s.exerciseId,
              name: s.name,
              reason: s.reason,
              prescribedName: resolveExercise(substituteBlock)?.name ?? 'Ejercicio',
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
