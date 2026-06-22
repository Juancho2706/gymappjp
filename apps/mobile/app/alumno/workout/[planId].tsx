import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useKeepAwake } from 'expo-keep-awake'
import * as Haptics from 'expo-haptics'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { Confetti } from 'react-native-fast-confetti'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Check, Dumbbell, Info, Settings, Timer, Trophy } from 'lucide-react-native'
import { MotiView } from 'moti'
import { supabase } from '../../../lib/supabase'
import { getClientProfile } from '../../../lib/client'
import { getTodayInSantiago, getSantiagoUtcBoundsForDay, formatRelativeDate } from '../../../lib/date-utils'
import { cachePlan, enqueueLog, getCachedPlan } from '../../../lib/offline-cache'
import { haptics } from '../../../lib/haptics'
import { useEvaMotion } from '../../../lib/motion'
import { useTheme } from '../../../context/ThemeContext'
import { Button, NativeDialog, OfflineBanner, ProgressBar, TopBar } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { SafeAreaView } from 'react-native-safe-area-context'
import { RestTimer } from '../../../components/workout/RestTimer'
import { HoldTimer } from '../../../components/workout/HoldTimer'
import { IntervalTimer } from '../../../components/workout/IntervalTimer'
import { Stopwatch } from '../../../components/workout/Stopwatch'
import { WorkoutSummaryModal } from '../../../components/workout/WorkoutSummaryModal'
import { WorkoutTimerSettingsPanel } from '../../../components/workout/WorkoutTimerSettingsPanel'
import { formatPace, type HrZoneRange } from '../../../lib/cardio'
import {
  buildIntervalPhases,
  compactDistance,
  compactDuration,
  effectiveExerciseType,
  executionAreaGroupsFor,
  isTimeableInterval,
  LEGACY_SECTION_SUBTITLE,
  LEGACY_SECTION_TITLE,
  SYSTEM_AREA_SUBTITLE,
  type ExerciseType as WorkoutKind,
  type IntervalConfig,
  type IntervalPhase,
  type WorkoutArea,
} from '../../../lib/workout-exec'
import { getOwnCardioZones, getPlanAreas, type ClientCardioView } from '../../../lib/workout-exec-data'

/** Redondea y acota un input numérico a [min,max]; '' / NaN → null. Para RPE/RIR (columnas integer con CHECK). */
function clampIntInRange(v: string, min: number, max: number): number | null {
  if (!v) return null
  const n = Math.round(parseFloat(v))
  if (Number.isNaN(n)) return null
  return Math.max(min, Math.min(max, n))
}

function toNum(v: string): number | null {
  if (!v) return null
  const n = parseFloat(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

interface Exercise {
  id: string
  name: string
  muscle_group: string | null
  video_url: string | null
  gif_url: string | null
  instructions: string[] | null
  exercise_type: string | null
}

interface Block {
  id: string
  order_index: number
  sets: number
  reps: string
  target_weight_kg: number | null
  tempo: string | null
  rir: string | null
  rest_time: string | null
  section: 'warmup' | 'main' | 'cooldown' | null
  section_template_id: string | null
  superset_group: string | null
  progression_type: 'weight' | 'reps' | null
  progression_value: number | null
  is_override: boolean | null
  notes: string | null
  // Prescripción polimórfica (null en planes legacy)
  exercise_type_override: string | null
  side_mode: string | null
  reps_value: number | null
  reps_unit: string | null
  load_value: number | null
  load_unit: string | null
  distance_value: number | null
  distance_unit: string | null
  duration_sec: number | null
  target_pace_sec_per_km: number | null
  hr_zone: number | null
  instructions: string | null
  interval_config: IntervalConfig | null
  exercises: Exercise | null
}

/** Log unificado: strength (weight/reps/rpe/rir) + typed (actual_*). */
interface LogEntry {
  blockId: string
  setNumber: number
  weightKg: string
  repsDone: string
  rpe?: string
  rir?: string
  actualDurationSec?: string
  actualDistanceM?: string
  actualHoldSec?: string
  actualAvgHr?: string
}

interface PreviousHistory {
  weight_kg: number | null
  reps_done: number | null
  date: string
}

type ActiveTimer =
  | { kind: 'rest'; seconds: number }
  | { kind: 'hold'; seconds: number; label?: string }
  | { kind: 'interval'; phases: IntervalPhase[] }
  | { kind: 'stopwatch' }

const SIDE_LABEL: Record<string, string> = {
  per_side: 'Por lado',
  alternating: 'Alternado',
}

export default function WorkoutExecutionScreen() {
  useKeepAwake()

  const { planId } = useLocalSearchParams<{ planId: string }>()
  const { theme } = useTheme()
  const router = useRouter()

  const [blocks, setBlocks] = useState<Block[]>([])
  const [areas, setAreas] = useState<WorkoutArea[]>([])
  const [cardio, setCardio] = useState<ClientCardioView>({ enabled: false, zones: null })
  const [planTitle, setPlanTitle] = useState('')
  const [activeWeekVariant, setActiveWeekVariant] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [clientId, setClientId] = useState<string | null>(null)
  const [logs, setLogs] = useState<Record<string, LogEntry[]>>({})
  const [previousHistory, setPreviousHistory] = useState<Record<string, PreviousHistory[]>>({})
  const [activeTimer, setActiveTimer] = useState<ActiveTimer | null>(null)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [techniqueExercise, setTechniqueExercise] = useState<Exercise | null>(null)
  const [isOnline, setIsOnline] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [prCelebration, setPrCelebration] = useState(false)
  const [exerciseMaxes, setExerciseMaxes] = useState<Record<string, number>>({})
  const [autoTimerEnabled, setAutoTimerEnabled] = useState(true)
  const [showTimerSettings, setShowTimerSettings] = useState(false)
  const motion = useEvaMotion()
  const scrollRef = useRef<ScrollView>(null)
  const sectionY = useRef<Record<string, number>>({})
  const blockY = useRef<Record<string, number>>({})

  useEffect(() => {
    loadPlan()
  }, [planId])

  // Preferencia de cronómetro automático (espejo de localStorage 'omni_autotimer' en web).
  useEffect(() => {
    AsyncStorage.getItem('omni_autotimer').then((v) => {
      if (v != null) setAutoTimerEnabled(v === 'true')
    })
  }, [])

  function toggleAutoTimer() {
    setAutoTimerEnabled((prev) => {
      const next = !prev
      AsyncStorage.setItem('omni_autotimer', String(next))
      return next
    })
  }

  async function loadPlan() {
    setLoading(true)
    const client = await getClientProfile()
    if (client) setClientId(client.id)

    const cached = await getCachedPlan<{
      title: string
      blocks: Block[]
      activeWeekVariant?: string | null
      areas?: WorkoutArea[]
      cardio?: ClientCardioView
    }>(planId)
    if (cached) {
      setPlanTitle(cached.title)
      setBlocks(cached.blocks)
      setActiveWeekVariant(cached.activeWeekVariant ?? null)
      setAreas(cached.areas ?? [])
      setCardio(cached.cardio ?? { enabled: false, zones: null })
      setLoading(false)
    }

    const { data } = await supabase
      .from('workout_plans')
      .select(`
        id, title, week_variant,
        workout_blocks (
          id, order_index, sets, reps, target_weight_kg, tempo, rir, rest_time, section, section_template_id, superset_group, progression_type, progression_value, is_override, notes,
          exercise_type_override, side_mode, reps_value, reps_unit, load_value, load_unit, distance_value, distance_unit, duration_sec, target_pace_sec_per_km, hr_zone, instructions, interval_config,
          exercises ( id, name, muscle_group, video_url, gif_url, instructions, exercise_type )
        )
      `)
      .eq('id', planId)
      .maybeSingle()

    if (!data) {
      setLoading(false)
      return
    }

    const sorted = ((data as any).workout_blocks ?? []).sort((a: Block, b: Block) => a.order_index - b.order_index)
    setPlanTitle(data.title)
    setBlocks(sorted)
    setActiveWeekVariant((data as any).week_variant ?? null)

    // Áreas (no clásicas) + zonas FC del propio alumno, resueltas bajo RLS (mobile no tiene service-role).
    const [resolvedAreas, resolvedCardio] = await Promise.all([
      getPlanAreas(sorted.map((b: Block) => b.section_template_id)),
      planHasCardioFields(sorted) && client
        ? getOwnCardioZones(client.id)
        : Promise.resolve<ClientCardioView>({ enabled: false, zones: null }),
    ])
    setAreas(resolvedAreas)
    setCardio(resolvedCardio)

    await cachePlan(planId, {
      title: data.title,
      blocks: sorted,
      activeWeekVariant: (data as any).week_variant ?? null,
      areas: resolvedAreas,
      cardio: resolvedCardio,
    })

    const blockIds = sorted.map((b: Block) => b.id)
    if (client && blockIds.length > 0) {
      await Promise.all([
        loadTodayLogs(blockIds, client.id),
        loadPreviousHistory(client.id, sorted, blockIds),
      ])
    }

    setLoading(false)
    setRefreshing(false)
  }

  async function onRefresh() {
    setRefreshing(true)
    await loadPlan()
  }

  function scrollToNextBlock(doneBlockId: string) {
    const currentIndex = blocks.findIndex((b) => b.id === doneBlockId)
    for (let i = currentIndex + 1; i < blocks.length; i++) {
      const b = blocks[i]
      if ((logs[b.id]?.length ?? 0) < b.sets) {
        const grpKey = groupKeyForBlock(b)
        const sy = sectionY.current[grpKey] ?? 0
        const by = blockY.current[b.id] ?? 0
        scrollRef.current?.scrollTo({ y: sy + by - 20, animated: true })
        return
      }
    }
  }

  async function loadTodayLogs(blockIds: string[], cid: string) {
    const { iso } = getTodayInSantiago()
    const { startIso, endIso } = getSantiagoUtcBoundsForDay(iso)
    const { data } = await supabase
      .from('workout_logs')
      .select('block_id, set_number, weight_kg, reps_done, rpe, rir, actual_duration_sec, actual_distance_m, actual_hold_sec, actual_avg_hr')
      .eq('client_id', cid)
      .in('block_id', blockIds)
      .gte('logged_at', startIso)
      .lt('logged_at', endIso)

    const next: Record<string, LogEntry[]> = {}
    for (const row of data ?? []) {
      const blockId = (row as any).block_id
      if (!next[blockId]) next[blockId] = []
      const r = row as any
      next[blockId].push({
        blockId,
        setNumber: r.set_number,
        weightKg: r.weight_kg != null ? String(r.weight_kg) : '',
        repsDone: r.reps_done != null ? String(r.reps_done) : '',
        rpe: r.rpe != null ? String(r.rpe) : '',
        rir: r.rir != null ? String(r.rir) : '',
        actualDurationSec: r.actual_duration_sec != null ? String(r.actual_duration_sec) : '',
        actualDistanceM: r.actual_distance_m != null ? String(r.actual_distance_m) : '',
        actualHoldSec: r.actual_hold_sec != null ? String(r.actual_hold_sec) : '',
        actualAvgHr: r.actual_avg_hr != null ? String(r.actual_avg_hr) : '',
      })
    }
    for (const blockId of Object.keys(next)) next[blockId].sort((a, b) => a.setNumber - b.setNumber)
    setLogs(next)
  }

  async function loadPreviousHistory(clientIdValue: string, planBlocks: Block[], blockIds: string[]) {
    const exerciseIds = planBlocks.map((b) => b.exercises?.id).filter(Boolean) as string[]
    if (!exerciseIds.length) return

    const { data } = await supabase
      .from('workout_logs')
      .select('weight_kg, reps_done, logged_at, set_number, workout_blocks!inner(exercise_id)')
      .eq('client_id', clientIdValue)
      .in('workout_blocks.exercise_id', exerciseIds)
      .not('block_id', 'in', `(${blockIds.join(',')})`)
      .order('logged_at', { ascending: false })
      .limit(160)

    const history: Record<string, PreviousHistory[]> = {}
    const maxes: Record<string, number> = {}
    for (const log of data ?? []) {
      const exId = (log as any).workout_blocks?.exercise_id
      if (!exId) continue
      // Máximo histórico por ejercicio (todas las sesiones del rango) → detección de PR en el resumen.
      const w = log.weight_kg ?? 0
      if (w > (maxes[exId] ?? 0)) maxes[exId] = w
      if (!history[exId]) history[exId] = []
      const date = String((log as any).logged_at).split('T')[0]
      const existingDates = history[exId].map((h) => h.date)
      if (existingDates.length === 0 || existingDates.includes(date)) {
        history[exId].push({ weight_kg: log.weight_kg, reps_done: log.reps_done, date })
      }
    }
    setPreviousHistory(history)
    setExerciseMaxes(maxes)
  }

  // ── Timers (un solo activo; espejo de WorkoutTimerProvider.replaceWith) ──
  function startRest(restTime: string | null) {
    const secs = restTime ? parseRestTime(restTime) : 0
    if (secs > 0) setActiveTimer({ kind: 'rest', seconds: secs })
  }
  function startHold(seconds: number, label?: string) {
    if (Number.isFinite(seconds) && seconds > 0) setActiveTimer({ kind: 'hold', seconds: Math.round(seconds), label })
  }
  function startInterval(config: IntervalConfig, sets: number) {
    const phases = buildIntervalPhases(config, sets)
    if (phases.length === 0) {
      setActiveTimer({ kind: 'stopwatch' })
      return
    }
    setActiveTimer({ kind: 'interval', phases })
  }
  function startStopwatch() {
    setActiveTimer({ kind: 'stopwatch' })
  }

  async function logSet(
    block: Block,
    setNumber: number,
    values: {
      weight: string
      reps: string
      rpe: string
      rir: string
      actualDurationSec?: string
      actualDistanceM?: string
      actualHoldSec?: string
      actualAvgHr?: string
    },
  ) {
    if (!clientId) return
    const entry: LogEntry = {
      blockId: block.id,
      setNumber,
      weightKg: values.weight,
      repsDone: values.reps,
      rpe: values.rpe,
      rir: values.rir,
      actualDurationSec: values.actualDurationSec ?? '',
      actualDistanceM: values.actualDistanceM ?? '',
      actualHoldSec: values.actualHoldSec ?? '',
      actualAvgHr: values.actualAvgHr ?? '',
    }

    const existingFiltered = (logs[block.id] ?? []).filter((l) => l.setNumber !== setNumber)
    const newBlockLogs = [...existingFiltered, entry]
    const willBeDone = newBlockLogs.length >= block.sets

    setLogs((prev) => ({
      ...prev,
      [block.id]: newBlockLogs.sort((a, b) => a.setNumber - b.setNumber),
    }))

    if (willBeDone) {
      setTimeout(() => scrollToNextBlock(block.id), 400)
    }

    const logData = {
      block_id: block.id,
      client_id: clientId,
      set_number: setNumber,
      weight_kg: toNum(values.weight),
      reps_done: values.reps ? parseInt(values.reps) : null,
      rpe: clampIntInRange(values.rpe, 1, 10),
      rir: clampIntInRange(values.rir, 0, 10),
      actual_duration_sec: values.actualDurationSec ? Math.round(toNum(values.actualDurationSec) ?? 0) || null : null,
      actual_distance_m: values.actualDistanceM ? Math.round(toNum(values.actualDistanceM) ?? 0) || null : null,
      actual_hold_sec: values.actualHoldSec ? Math.round(toNum(values.actualHoldSec) ?? 0) || null : null,
      actual_avg_hr: values.actualAvgHr ? Math.round(toNum(values.actualAvgHr) ?? 0) || null : null,
      exercise_name_at_log: block.exercises?.name ?? null,
    }

    // Select-then-update/insert acotado al día (igual que la web), limpiando duplicados.
    const { iso } = getTodayInSantiago()
    const { startIso, endIso } = getSantiagoUtcBoundsForDay(iso)
    let error: { message: string } | null = null
    try {
      const { data: existing } = await supabase
        .from('workout_logs')
        .select('id')
        .eq('client_id', clientId)
        .eq('block_id', block.id)
        .eq('set_number', setNumber)
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
    } catch (e: any) {
      error = { message: e?.message ?? 'error' }
    }

    if (error) {
      setIsOnline(false)
      await enqueueLog(logData)
    } else {
      setIsOnline(true)
    }

    // Récord personal (solo strength con peso).
    const exId = block.exercises?.id
    const hist = exId ? previousHistory[exId] : undefined
    const prevMax = hist?.length ? Math.max(...hist.map((h) => h.weight_kg ?? 0)) : 0
    const w = toNum(values.weight) ?? 0
    if (!error && prevMax > 0 && w > prevMax) {
      setPrCelebration(true)
      haptics.pr()
      setTimeout(() => setPrCelebration(false), 2600)
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    // Cronómetro automático: el descanso empieza solo al guardar (si está activado, espejo web).
    if (autoTimerEnabled && block.rest_time) startRest(block.rest_time)
  }

  function parseRestTime(restTime: string): number {
    const minMatch = restTime.match(/(\d+)\s*m/i)
    if (minMatch) return parseInt(minMatch[1]) * 60
    const match = restTime.match(/(\d+)/)
    return match ? parseInt(match[1]) : 0
  }

  // ── Agrupación por área (con fallback legacy) ──
  const groups = executionAreaGroupsFor(blocks, areas)
    .map((g) => ({
      key: g.key,
      title: g.name ?? LEGACY_SECTION_TITLE[g.legacySection ?? 'main'],
      subtitle: g.legacySection
        ? LEGACY_SECTION_SUBTITLE[g.legacySection]
        : (g.slug && SYSTEM_AREA_SUBTITLE[g.slug]) || null,
      muted: g.legacySection === 'warmup' || g.legacySection === 'cooldown',
      blocks: g.blocks,
    }))
    .filter((g) => g.blocks.length > 0)

  function groupKeyForBlock(b: Block): string {
    for (const g of groups) if (g.blocks.some((x) => x.id === b.id)) return g.key
    return 'main'
  }

  function renderGroup(group: (typeof groups)[number]) {
    const supersetRuns = groupSupersets(group.blocks)
    return (
      <View key={group.key} style={styles.section} onLayout={(e) => { sectionY.current[group.key] = e.nativeEvent.layout.y }}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionRail, { backgroundColor: group.muted ? theme.primary + '55' : theme.primary }]} />
          <View style={styles.sectionCopy}>
            <View style={styles.sectionTitleRow}>
              <Text style={[styles.sectionLabel, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{group.title}</Text>
              <Text style={[styles.sectionCount, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                {supersetRuns.length} bloque(s)
              </Text>
            </View>
            {group.subtitle ? (
              <Text style={[styles.sectionSubtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{group.subtitle}</Text>
            ) : null}
          </View>
        </View>
        {supersetRuns.map((ss, groupIndex) => (
          <View
            key={ss.key}
            style={[
              styles.groupCard,
              {
                borderColor: ss.superset ? theme.primary + '40' : 'transparent',
                backgroundColor: ss.superset ? theme.primary + '08' : 'transparent',
                borderRadius: theme.radius.xl,
              },
            ]}
          >
            <View style={styles.groupTitleWrap}>
              <Text style={[styles.groupTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
                {ss.superset ? `Superserie (grupo ${ss.supersetLetter ?? ss.key})` : `Ejercicio ${groupIndex + 1}`}
              </Text>
              {ss.superset ? (
                <View style={[styles.supersetHowto, { borderColor: theme.primary + '40', backgroundColor: theme.primary + '0F', borderRadius: theme.radius.lg }]}>
                  <Text style={[styles.supersetHowtoTitle, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>Cómo hacerla</Text>
                  <HowtoStep n={1} theme={theme}>Completa una serie del primer ejercicio y regístrala abajo.</HowtoStep>
                  <HowtoStep n={2} theme={theme}>Completa una serie del siguiente ejercicio y regístrala.</HowtoStep>
                  <HowtoStep n={3} theme={theme}>Respeta los descansos que indique cada ejercicio; repite hasta terminar todas las series de cada ejercicio.</HowtoStep>
                  <Text style={[styles.supersetHowtoFoot, { color: theme.mutedForeground, borderTopColor: theme.border, fontFamily: theme.fontSans }]}>
                    Cada ejercicio tiene sus propias series: el contador superior suma todas las series de la rutina.
                  </Text>
                </View>
              ) : null}
            </View>
            {ss.blocks.map((block, index) => (
              <MotiView
                key={block.id}
                from={{ opacity: 0, translateY: 12 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: 'timing', duration: 350, delay: Math.min((groupIndex + index) * 50, 400) }}
                onLayout={(e) => { blockY.current[block.id] = e.nativeEvent.layout.y }}
              >
                {index > 0 && ss.superset ? (
                  <View style={styles.luegoRow}>
                    <View style={[styles.luegoLine, { backgroundColor: theme.border }]} />
                    <Text style={[styles.luegoText, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>Luego</Text>
                    <View style={[styles.luegoLine, { backgroundColor: theme.border }]} />
                  </View>
                ) : null}
                <BlockCard
                  block={block}
                  logged={logs[block.id] ?? []}
                  previous={block.exercises?.id ? previousHistory[block.exercises.id] ?? [] : []}
                  cardioZones={cardio.enabled ? cardio.zones : null}
                  supersetBadge={ss.superset ? `${ss.supersetLetter ?? 'SS'}-${index + 1}` : null}
                  onLogSet={logSet}
                  onOpenTechnique={() => setTechniqueExercise(block.exercises)}
                  onStartHold={startHold}
                  onStartInterval={startInterval}
                  onStartStopwatch={startStopwatch}
                  onStartRest={startRest}
                />
              </MotiView>
            ))}
          </View>
        ))}
      </View>
    )
  }

  const requiredSets = blocks.reduce((acc, b) => acc + b.sets, 0)
  const completedSetCount = blocks.reduce((acc, b) => acc + Math.min(logs[b.id]?.length ?? 0, b.sets), 0)
  const completion = requiredSets === 0 ? 0 : completedSetCount / requiredSets
  const allDone = requiredSets > 0 && completedSetCount >= requiredSets

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {prCelebration ? (
        <View pointerEvents="none" style={styles.prOverlay}>
          {!motion.reduced ? <Confetti autoplay fadeOutOnEnd colors={[theme.primary, '#F59E0B', '#10B981', theme.cyan]} /> : null}
          <View style={[styles.prBanner, { backgroundColor: theme.primary }]}>
            <Text style={[styles.prBannerText, { color: theme.primaryForeground }]}>🏆 ¡Nuevo récord!</Text>
          </View>
        </View>
      ) : null}

      {activeTimer?.kind === 'rest' && (
        <RestTimer duration={activeTimer.seconds} onComplete={() => setActiveTimer(null)} onSkip={() => setActiveTimer(null)} />
      )}
      {activeTimer?.kind === 'hold' && (
        <HoldTimer duration={activeTimer.seconds} label={activeTimer.label} onComplete={() => {}} onClose={() => setActiveTimer(null)} />
      )}
      {activeTimer?.kind === 'interval' && (
        <IntervalTimer phases={activeTimer.phases} onClose={() => setActiveTimer(null)} />
      )}
      {activeTimer?.kind === 'stopwatch' && <Stopwatch onClose={() => setActiveTimer(null)} />}

      <OfflineBanner visible={!isOnline} message="Sin conexión — los datos se guardarán al reconectar." />
      <TopBar back title={planTitle || 'Workout'} onBack={() => router.back()} />

      {loading ? (
        <EvaLoaderScreen subtitle="Cargando rutina…" />
      ) : blocks.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={[styles.emptyIcon, { backgroundColor: theme.secondary }]}>
            <Dumbbell size={32} color={theme.mutedForeground} />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
            Rutina sin ejercicios
          </Text>
          <Text style={[styles.emptyBody, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Esta rutina ya no tiene ejercicios asociados. Tu coach probablemente esté actualizando tu plan.
          </Text>
          <Button label="Volver al inicio" onPress={() => router.replace('/alumno/home')} style={{ marginTop: 20 }} />
        </View>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={[styles.progressHeader, { borderBottomColor: theme.border }]}>
            <View style={styles.progressTop}>
              <Text style={[styles.progressText, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
                {completedSetCount}/{requiredSets} series
              </Text>
              <View style={styles.progressRight}>
                {activeWeekVariant ? (
                  <View style={[styles.weekBadge, { borderColor: theme.primary + '66' }]}>
                    <Text style={[styles.weekBadgeText, { color: theme.primary, fontFamily: 'Montserrat_800ExtraBold' }]}>
                      Semana {activeWeekVariant}
                    </Text>
                  </View>
                ) : null}
                <Text style={[styles.progressPct, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>
                  {Math.round(completion * 100)}%
                </Text>
                <TouchableOpacity
                  onPress={() => setShowTimerSettings(true)}
                  hitSlop={10}
                  style={styles.settingsBtn}
                  activeOpacity={0.7}
                  accessibilityLabel="Descanso y alarma"
                >
                  <Settings size={20} color={theme.mutedForeground} />
                </TouchableOpacity>
              </View>
            </View>
            <ProgressBar value={completion} />
          </View>

          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.primary} colors={[theme.primary]} />}
          >
            {allDone && (
              <MotiView
                from={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: 'spring', damping: 14 }}
                style={[styles.doneBanner, { backgroundColor: theme.success + '18', borderColor: theme.success + '40', borderRadius: theme.radius.xl }]}
              >
                <Trophy size={18} color={theme.success} strokeWidth={2} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.doneBannerTitle, { color: theme.success, fontFamily: 'Montserrat_700Bold' }]}>¡Entrenamiento completado!</Text>
                  <Text style={[styles.doneBannerSub, { color: theme.success, fontFamily: theme.fontSans, opacity: 0.8 }]}>
                    Todas las series registradas. El detalle queda sincronizado con tu coach.
                  </Text>
                </View>
              </MotiView>
            )}
            {groups.map((g) => renderGroup(g))}
          </ScrollView>

          {/* Footer fijo: descanso manual + finalizar (espejo del footer web). */}
          <View style={[styles.footer, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
            <TouchableOpacity
              style={[styles.footerRestBtn, { borderColor: theme.border, backgroundColor: theme.secondary, borderRadius: theme.radius.lg }]}
              onPress={() => startRest('90')}
              activeOpacity={0.8}
            >
              <Timer size={15} color={theme.foreground} />
              <Text style={[styles.footerRestText, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Descanso (90s)</Text>
            </TouchableOpacity>
            <Button
              label="Finalizar entrenamiento"
              leftIcon={allDone ? Trophy : Check}
              variant={allDone ? 'primary' : 'secondary'}
              onPress={() => setSummaryOpen(true)}
              size="lg"
              style={{ flex: 1 }}
            />
          </View>
        </KeyboardAvoidingView>
      )}

      <WorkoutSummaryModal
        visible={summaryOpen}
        planTitle={planTitle}
        blocks={blocks}
        logs={logs}
        exerciseMaxes={exerciseMaxes}
        onDone={() => router.replace('/alumno/home')}
        onClose={() => setSummaryOpen(false)}
      />

      {/* Descanso, alarma y cronómetro automático (tuerca del header) */}
      <NativeDialog open={showTimerSettings} title="Descanso y alarma" onClose={() => setShowTimerSettings(false)}>
        <WorkoutTimerSettingsPanel autoTimerEnabled={autoTimerEnabled} onToggleAutoTimer={toggleAutoTimer} />
        <Button label="Cerrar" variant="secondary" onPress={() => setShowTimerSettings(false)} full style={{ marginTop: 6 }} />
      </NativeDialog>

      <TechniqueDialog exercise={techniqueExercise} onClose={() => setTechniqueExercise(null)} />
    </SafeAreaView>
  )
}

function planHasCardioFields(blocks: Block[]): boolean {
  return blocks.some((b) => b.hr_zone != null || (b.duration_sec ?? 0) > 0 || b.interval_config != null)
}

/**
 * Agrupa superseries en tramos CONTIGUOS (mismo superset_group y order_index +1) — espejo
 * de groupContiguousSupersetRuns (web). supersetLetter = el valor de superset_group (A, B…).
 */
function groupSupersets(blocks: Block[]): Array<{ key: string; superset: boolean; supersetLetter?: string; blocks: Block[] }> {
  const out: Array<{ key: string; superset: boolean; supersetLetter?: string; blocks: Block[] }> = []
  let i = 0
  while (i < blocks.length) {
    const b = blocks[i]
    const g = b.superset_group?.trim()
    if (!g) {
      out.push({ key: `single-${b.id}`, superset: false, blocks: [b] })
      i += 1
      continue
    }
    const run: Block[] = [b]
    let j = i + 1
    while (j < blocks.length) {
      const next = blocks[j]
      const ng = next.superset_group?.trim()
      const prev = run[run.length - 1]
      if (ng === g && next.order_index === prev.order_index + 1) {
        run.push(next)
        j += 1
      } else break
    }
    out.push({ key: `ss-${g}-${b.id}`, superset: true, supersetLetter: g, blocks: run })
    i = j
  }
  return out
}

// ─── Card de bloque (polimórfico por tipo) ────────────────────────────────────
function BlockCard({
  block,
  logged,
  previous,
  cardioZones,
  supersetBadge,
  onLogSet,
  onOpenTechnique,
  onStartHold,
  onStartInterval,
  onStartStopwatch,
  onStartRest,
}: {
  block: Block
  logged: LogEntry[]
  previous: PreviousHistory[]
  cardioZones: HrZoneRange[] | null
  supersetBadge: string | null
  onLogSet: (
    block: Block,
    setNumber: number,
    values: { weight: string; reps: string; rpe: string; rir: string; actualDurationSec?: string; actualDistanceM?: string; actualHoldSec?: string; actualAvgHr?: string },
  ) => Promise<void>
  onOpenTechnique: () => void
  onStartHold: (seconds: number, label?: string) => void
  onStartInterval: (config: IntervalConfig, sets: number) => void
  onStartStopwatch: () => void
  onStartRest: (restTime: string | null) => void
}) {
  const { theme } = useTheme()
  const kind = effectiveExerciseType(block, block.exercises)
  const nextSet = logged.length + 1
  const done = nextSet > block.sets
  const hasTechnique = Boolean(block.exercises?.gif_url || block.exercises?.video_url || block.exercises?.instructions?.length)

  return (
    <View
      style={[
        styles.blockCard,
        { backgroundColor: theme.card, borderColor: done ? theme.success : theme.border, borderWidth: done ? 2 : 1, borderRadius: theme.radius.xl },
      ]}
    >
      <View style={styles.blockHeader}>
        <View style={styles.exerciseCopy}>
          <Text style={[styles.exerciseMeta, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            {supersetBadge ?? block.exercises?.muscle_group ?? 'Ejercicio'}
          </Text>
          <Text style={[styles.exerciseName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={2}>
            {block.exercises?.name ?? 'Ejercicio'}
          </Text>
        </View>
        {hasTechnique ? (
          <TouchableOpacity style={[styles.iconBtn, { borderColor: theme.border, borderRadius: theme.radius.md }]} onPress={onOpenTechnique} activeOpacity={0.75}>
            <Info size={17} color={theme.primary} />
          </TouchableOpacity>
        ) : null}
        <View
          style={[
            styles.statusPill,
            {
              borderColor: done ? theme.success + '66' : theme.border,
              backgroundColor: done ? theme.success + '26' : theme.secondary,
              borderRadius: 999,
            },
          ]}
        >
          <Text style={[styles.statusPillText, { color: done ? theme.success : theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>
            {done ? 'Completado' : 'Pendiente'}
          </Text>
        </View>
      </View>

      {kind === 'strength' ? (
        <StrengthTargetGrid block={block} />
      ) : (
        <>
          <TypedTargetGrid block={block} kind={kind} cardioZones={cardioZones} />
          <TimerButton block={block} kind={kind} onStartHold={onStartHold} onStartInterval={onStartInterval} onStartStopwatch={onStartStopwatch} onStartRest={onStartRest} />
        </>
      )}

      {kind !== 'strength' && block.instructions ? (
        <View style={[styles.instructionBox, { borderColor: theme.primary + '40', backgroundColor: theme.primary + '0E', borderRadius: theme.radius.lg }]}>
          <Text style={[styles.instructionBoxTitle, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>Instrucciones</Text>
          <Text style={[styles.instructionBoxText, { color: theme.foreground, fontFamily: theme.fontSans }]}>{block.instructions}</Text>
        </View>
      ) : null}

      {block.notes ? (
        <View style={[styles.noteBox, { borderColor: '#F59E0B4D', backgroundColor: '#F59E0B1A', borderRadius: theme.radius.lg }]}>
          <Text style={[styles.noteBoxTitle, { color: '#B45309', fontFamily: 'Montserrat_700Bold' }]}>Nota del coach</Text>
          <Text style={[styles.noteBoxText, { color: theme.foreground, fontFamily: theme.fontSans }]}>{block.notes}</Text>
        </View>
      ) : null}

      {kind === 'strength' && previous.length > 0 ? (
        <View style={[styles.previousWrap, { borderColor: theme.primary + '30', backgroundColor: theme.primary + '08', borderRadius: theme.radius.lg }]}>
          <Text style={[styles.previousTitle, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>
            Sesión anterior · {previous[0]?.date ? formatRelativeDate(previous[0].date) : ''}
          </Text>
          <View style={styles.previousChips}>
            {previous.map((log, index) => (
              <View key={`${log.date}-${index}`} style={[styles.previousChip, { backgroundColor: theme.background, borderColor: theme.border, borderRadius: theme.radius.sm }]}>
                <Text style={[styles.previousText, { color: theme.foreground, fontFamily: theme.fontSans }]}>
                  S{index + 1}: {log.weight_kg ? `${log.weight_kg}kg` : '-'} x {log.reps_done || '-'}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {logged.length > 0 ? (
        <View style={[styles.loggedWrap, { borderTopColor: theme.border }]}>
          {logged.map((l) => (
            <View key={l.setNumber} style={styles.loggedRow}>
              <Text style={[styles.loggedLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Serie {l.setNumber}</Text>
              <Text style={[styles.loggedValue, { color: theme.success, fontFamily: 'Montserrat_700Bold' }]}>{loggedSummary(l, kind)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {!done ? (
        <LogSetRow
          key={`set-${nextSet}`}
          block={block}
          kind={kind}
          setNumber={nextSet}
          onLogSet={onLogSet}
        />
      ) : null}
    </View>
  )
}

/** Resumen es-neutro de un log registrado, por tipo. */
function loggedSummary(l: LogEntry, kind: WorkoutKind): string {
  if (kind === 'cardio') {
    const parts: string[] = []
    if (l.actualDurationSec) parts.push(`${Math.round((Number(l.actualDurationSec) / 60) * 10) / 10} min`)
    if (l.actualDistanceM) parts.push(`${l.actualDistanceM} m`)
    if (l.actualAvgHr) parts.push(`${l.actualAvgHr} bpm`)
    if (l.rpe) parts.push(`RPE ${l.rpe}`)
    return parts.join(' · ') || '✓'
  }
  if (kind === 'mobility') {
    const parts: string[] = []
    if (l.actualHoldSec) parts.push(`${l.actualHoldSec}s hold`)
    if (l.rpe) parts.push(`RPE ${l.rpe}`)
    return parts.join(' · ') || '✓'
  }
  if (kind === 'roller') {
    const parts: string[] = []
    if (l.actualDurationSec) parts.push(`${l.actualDurationSec}s`)
    if (l.repsDone) parts.push(`${l.repsDone} pas.`)
    if (l.rpe) parts.push(`RPE ${l.rpe}`)
    return parts.join(' · ') || '✓'
  }
  return `${l.repsDone || '-'} reps${l.weightKg ? ` · ${l.weightKg}kg` : ''}${l.rpe ? ` · RPE ${l.rpe}` : ''}${l.rir ? ` · RIR ${l.rir}` : ''}`
}

// ─── Target grids ─────────────────────────────────────────────────────────────
function StrengthTargetGrid({ block }: { block: Block }) {
  return (
    <View style={styles.metricGrid}>
      <Metric label="Series x reps" value={`${block.sets} x ${block.reps}`} />
      {block.target_weight_kg != null ? <Metric label="Peso" value={`${block.target_weight_kg}kg`} /> : null}
      {block.rest_time ? <Metric label="Descanso" value={block.rest_time} /> : null}
      {block.tempo ? <Metric label="Tempo" value={block.tempo} /> : null}
      {block.rir ? <Metric label="RIR" value={block.rir} /> : null}
    </View>
  )
}

/** Cards de objetivo por tipo cardio/movilidad/roller (espejo de TypedTargetGrid web). */
function TypedTargetGrid({ block, kind, cardioZones }: { block: Block; kind: WorkoutKind; cardioZones: HrZoneRange[] | null }) {
  const cards: { label: string; value: string; highlight?: boolean }[] = []

  if (kind === 'cardio') {
    if (block.interval_config) {
      const ic = block.interval_config
      const work = ic.work?.distance_m != null
        ? compactDistance(ic.work.distance_m, 'm')
        : ic.work?.duration_sec != null
          ? compactDuration(ic.work.duration_sec)
          : '—'
      const rec = ic.recovery?.duration_sec
      cards.push({ label: 'Intervalos', value: `${ic.repeats}× ${work}${rec ? ` / r${rec}s` : ''}` })
    }
    if ((block.duration_sec ?? 0) > 0) cards.push({ label: 'Duración', value: compactDuration(block.duration_sec as number) })
    if ((block.distance_value ?? 0) > 0) cards.push({ label: 'Distancia', value: compactDistance(block.distance_value as number, block.distance_unit) })
    if (block.target_pace_sec_per_km != null) cards.push({ label: 'Pace objetivo', value: `${formatPace(block.target_pace_sec_per_km)} /km` })
    if (block.hr_zone != null) {
      const range = cardioZones?.find((z) => z.zone === block.hr_zone) ?? null
      cards.push({ label: 'Zona FC', value: range ? `Z${block.hr_zone} · ${range.minBpm}–${range.maxBpm} bpm` : `Z${block.hr_zone}`, highlight: true })
    }
    if (block.sets > 1) cards.push({ label: 'Rondas', value: `${block.sets}` })
  }

  if (kind === 'mobility') {
    if ((block.duration_sec ?? 0) > 0) cards.push({ label: 'Hold', value: `${block.duration_sec}s` })
    cards.push({ label: 'Series', value: `${block.sets}` })
    if (block.reps_unit === 'breaths' && (block.reps_value ?? 0) > 0) cards.push({ label: 'Respiraciones', value: `${block.reps_value}` })
  }

  if (kind === 'roller') {
    if (block.reps_unit === 'passes' && (block.reps_value ?? 0) > 0) cards.push({ label: 'Pasadas', value: `${block.reps_value}` })
    else if ((block.duration_sec ?? 0) > 0) cards.push({ label: 'Duración', value: `${block.duration_sec}s` })
  }

  if (block.side_mode && SIDE_LABEL[block.side_mode]) cards.push({ label: 'Lado', value: SIDE_LABEL[block.side_mode] })
  if (block.load_value != null && block.load_value > 0) cards.push({ label: 'Carga', value: `${block.load_value} ${block.load_unit ?? 'kg'}` })
  if (block.rest_time) cards.push({ label: 'Descanso', value: block.rest_time })

  if (!cards.length) cards.push({ label: 'Objetivo', value: block.reps || '—' })

  return (
    <View style={styles.metricGrid}>
      {cards.map((c) => (
        <MetricCard key={c.label} label={c.label} value={c.value} highlight={c.highlight} />
      ))}
    </View>
  )
}

// ─── Timer button (por tipo) ──────────────────────────────────────────────────
function TimerButton({
  block,
  kind,
  onStartHold,
  onStartInterval,
  onStartStopwatch,
  onStartRest,
}: {
  block: Block
  kind: WorkoutKind
  onStartHold: (seconds: number, label?: string) => void
  onStartInterval: (config: IntervalConfig, sets: number) => void
  onStartStopwatch: () => void
  onStartRest: (restTime: string | null) => void
}) {
  const { theme } = useTheme()

  let label: string | null = null
  let onPress: (() => void) | null = null

  if (kind === 'cardio') {
    if (block.interval_config && isTimeableInterval(block.interval_config)) {
      label = 'Iniciar intervalos'
      onPress = () => onStartInterval(block.interval_config as IntervalConfig, block.sets || 1)
    } else {
      label = 'Cronómetro'
      onPress = () => onStartStopwatch()
    }
  } else if ((kind === 'mobility' || kind === 'roller') && (block.duration_sec ?? 0) > 0) {
    const seconds = block.duration_sec as number
    label = kind === 'mobility' ? `Timer de hold (${seconds}s)` : `Timer (${seconds}s)`
    onPress = () => onStartHold(seconds, kind === 'mobility' ? 'hold' : 'roller')
  }

  if (!label || !onPress) {
    // Sin timer cronometrable: ofrecer descanso manual si hay rest_time.
    if (!block.rest_time) return null
    return (
      <View style={styles.timerRow}>
        <TouchableOpacity
          style={[styles.timerBtn, { borderColor: theme.border, backgroundColor: theme.secondary, borderRadius: theme.radius.md }]}
          onPress={() => onStartRest(block.rest_time)}
          activeOpacity={0.8}
        >
          <Timer size={14} color={theme.mutedForeground} />
          <Text style={[styles.timerBtnText, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>Descanso ({block.rest_time})</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.timerRow}>
      <TouchableOpacity
        style={[styles.timerBtn, { borderColor: theme.primary + '4D', backgroundColor: theme.primary + '14', borderRadius: theme.radius.md }]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <Timer size={14} color={theme.primary} />
        <Text style={[styles.timerBtnText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>{label}</Text>
      </TouchableOpacity>
    </View>
  )
}

// ─── Log row (inputs por tipo) ────────────────────────────────────────────────
function LogSetRow({
  block,
  kind,
  setNumber,
  onLogSet,
}: {
  block: Block
  kind: WorkoutKind
  setNumber: number
  onLogSet: (
    block: Block,
    setNumber: number,
    values: { weight: string; reps: string; rpe: string; rir: string; actualDurationSec?: string; actualDistanceM?: string; actualHoldSec?: string; actualAvgHr?: string },
  ) => Promise<void>
}) {
  const { theme } = useTheme()
  // strength
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [rir, setRir] = useState('')
  // shared
  const [rpe, setRpe] = useState('')
  // cardio
  const [cardioMin, setCardioMin] = useState('')
  const [distanceM, setDistanceM] = useState('')
  const [avgHr, setAvgHr] = useState('')
  // mobility
  const [holdSec, setHoldSec] = useState('')
  // roller
  const [rollerSec, setRollerSec] = useState('')
  const [passes, setPasses] = useState('')

  const [saving, setSaving] = useState(false)

  async function handleLog() {
    if (saving) return
    setSaving(true)
    const cardioDurationSec = cardioMin ? String(Math.round((toNum(cardioMin) ?? 0) * 60)) : ''
    await onLogSet(block, setNumber, {
      weight,
      reps: kind === 'roller' ? passes : reps,
      rpe,
      rir,
      actualDurationSec: kind === 'cardio' ? cardioDurationSec : kind === 'roller' ? rollerSec : '',
      actualDistanceM: kind === 'cardio' ? distanceM : '',
      actualHoldSec: kind === 'mobility' ? holdSec : '',
      actualAvgHr: kind === 'cardio' ? avgHr : '',
    })
    setWeight(''); setReps(''); setRir(''); setRpe('')
    setCardioMin(''); setDistanceM(''); setAvgHr(''); setHoldSec(''); setRollerSec(''); setPasses('')
    setSaving(false)
  }

  return (
    <View style={[styles.logSection, { borderTopColor: theme.border }]}>
      <Text style={[styles.setLabel, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Serie {setNumber}</Text>
      <View style={styles.logRow}>
        {kind === 'strength' && (
          <>
            <LogInput placeholder="kg" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" />
            <LogInput placeholder="reps" value={reps} onChangeText={setReps} keyboardType="number-pad" />
            <LogInput placeholder="RPE" value={rpe} onChangeText={setRpe} keyboardType="decimal-pad" />
            <LogInput placeholder="RIR" value={rir} onChangeText={setRir} keyboardType="number-pad" />
          </>
        )}
        {kind === 'cardio' && (
          <>
            <LogInput placeholder="min" value={cardioMin} onChangeText={setCardioMin} keyboardType="decimal-pad" />
            <LogInput placeholder="metros" value={distanceM} onChangeText={setDistanceM} keyboardType="number-pad" />
            <LogInput placeholder="FC" value={avgHr} onChangeText={setAvgHr} keyboardType="number-pad" />
            <LogInput placeholder="RPE" value={rpe} onChangeText={setRpe} keyboardType="decimal-pad" />
          </>
        )}
        {kind === 'mobility' && (
          <>
            <LogInput placeholder="seg de hold" value={holdSec} onChangeText={setHoldSec} keyboardType="number-pad" />
            <LogInput placeholder="RPE" value={rpe} onChangeText={setRpe} keyboardType="decimal-pad" />
          </>
        )}
        {kind === 'roller' && (
          <>
            <LogInput placeholder="seg" value={rollerSec} onChangeText={setRollerSec} keyboardType="number-pad" />
            <LogInput placeholder="pasadas" value={passes} onChangeText={setPasses} keyboardType="number-pad" />
            <LogInput placeholder="RPE" value={rpe} onChangeText={setRpe} keyboardType="decimal-pad" />
          </>
        )}
      </View>
      <Button label={saving ? 'Guardando' : 'Registrar serie'} leftIcon={Check} onPress={handleLog} loading={saving} full />
    </View>
  )
}

function LogInput(props: React.ComponentProps<typeof TextInput>) {
  const { theme } = useTheme()
  return (
    <TextInput
      {...props}
      style={[styles.logInput, { borderColor: theme.border, color: theme.foreground, backgroundColor: theme.secondary, borderRadius: theme.radius.md, fontFamily: theme.fontSans }]}
      placeholderTextColor={theme.mutedForeground}
    />
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return <MetricCard label={label} value={value} />
}

/** Paso numerado de la guía "Cómo hacerla" de superserie (espejo de la lista ordenada web). */
function HowtoStep({ n, theme, children }: { n: number; theme: any; children: ReactNode }) {
  return (
    <View style={styles.howtoStep}>
      <Text style={[styles.howtoStepNum, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>{n}.</Text>
      <Text style={[styles.howtoStepText, { color: theme.foreground, fontFamily: theme.fontSans }]}>{children}</Text>
    </View>
  )
}

function MetricCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  const { theme } = useTheme()
  return (
    <View style={[styles.metric, { borderColor: highlight ? theme.primary + '66' : theme.border, backgroundColor: highlight ? theme.primary + '0E' : 'transparent', borderRadius: theme.radius.md }]}>
      <Text style={[styles.metricLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: highlight ? theme.primary : theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{value}</Text>
    </View>
  )
}

function TechniqueDialog({ exercise, onClose }: { exercise: Exercise | null; onClose: () => void }) {
  const { theme } = useTheme()
  const mediaUrl = exercise?.gif_url ?? exercise?.video_url

  return (
    <NativeDialog open={Boolean(exercise)} title={exercise?.name ?? 'Técnica'} onClose={onClose}>
      <View style={styles.techBody}>
        {exercise?.gif_url ? (
          <Image source={{ uri: exercise.gif_url }} resizeMode="contain" style={[styles.techImage, { backgroundColor: theme.secondary, borderRadius: theme.radius.xl }]} />
        ) : null}
        {mediaUrl ? (
          <Button label="Abrir video técnica" leftIcon={Dumbbell} variant="secondary" onPress={() => Linking.openURL(mediaUrl)} full />
        ) : null}
        {exercise?.instructions?.length ? (
          <View style={styles.instructions}>
            {exercise.instructions.map((step, index) => (
              <View key={`${index}-${step}`} style={styles.instructionRow}>
                <View style={[styles.instructionNum, { backgroundColor: theme.primary + '18', borderRadius: theme.radius.sm }]}>
                  <Text style={[styles.instructionNumText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>{index + 1}</Text>
                </View>
                <Text style={[styles.instructionText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{step.replace(/^Step:\d+\s*/i, '')}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.techHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>No hay instrucciones detalladas disponibles para este ejercicio.</Text>
        )}
        <Button label="Entendido" variant="secondary" onPress={onClose} full style={{ marginTop: 6 }} />
      </View>
    </NativeDialog>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  prOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 90, zIndex: 50 },
  prBanner: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999 },
  prBannerText: { fontSize: 15, fontFamily: 'Montserrat_800ExtraBold', letterSpacing: -0.2 },
  progressHeader: { paddingHorizontal: 16, paddingBottom: 12, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressText: { fontSize: 13 },
  progressPct: { fontSize: 13 },
  progressRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  weekBadge: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  weekBadgeText: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2 },
  settingsBtn: { padding: 2 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 18, marginBottom: 8, textAlign: 'center' },
  emptyBody: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerRestBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, paddingHorizontal: 14, height: 52 },
  footerRestText: { fontSize: 12 },
  scroll: { paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 24, gap: 14 },
  doneBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1, padding: 16 },
  doneBannerTitle: { fontSize: 15 },
  doneBannerSub: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  section: { gap: 10 },
  sectionHeader: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  sectionRail: { width: 4, minHeight: 34, borderRadius: 2 },
  sectionCopy: { flex: 1, gap: 2 },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sectionLabel: { fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, flexShrink: 1 },
  sectionCount: { fontSize: 12 },
  sectionSubtitle: { fontSize: 12, lineHeight: 17 },
  groupCard: { borderWidth: 1, padding: 8, gap: 8 },
  groupTitleWrap: { paddingHorizontal: 4, paddingTop: 4, gap: 8 },
  groupTitle: { fontSize: 14 },
  supersetHowto: { borderWidth: 1, padding: 12, gap: 9 },
  supersetHowtoTitle: { fontSize: 13 },
  howtoStep: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  howtoStepNum: { fontSize: 13, width: 16 },
  howtoStepText: { flex: 1, fontSize: 13, lineHeight: 19 },
  supersetHowtoFoot: { fontSize: 12, lineHeight: 17, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 9 },
  luegoRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 6 },
  luegoLine: { height: StyleSheet.hairlineWidth, width: 72 },
  luegoText: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.5 },
  blockCard: { padding: 16, gap: 10 },
  blockHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  exerciseCopy: { flex: 1, minWidth: 0, gap: 2 },
  exerciseMeta: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 },
  exerciseName: { fontSize: 17, letterSpacing: -0.2 },
  iconBtn: { width: 36, height: 36, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  statusPill: { borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4, alignSelf: 'flex-start' },
  statusPillText: { fontSize: 11 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, minWidth: '30%', flexGrow: 1 },
  metricLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
  metricValue: { fontSize: 13, marginTop: 2 },
  timerRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  timerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9, minHeight: 40 },
  timerBtnText: { fontSize: 12 },
  instructionBox: { borderWidth: 1, padding: 10, gap: 3 },
  instructionBoxTitle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 },
  instructionBoxText: { fontSize: 13, lineHeight: 18 },
  noteBox: { borderWidth: 1, padding: 10, gap: 3 },
  noteBoxTitle: { fontSize: 12 },
  noteBoxText: { fontSize: 13, lineHeight: 18 },
  previousWrap: { borderWidth: 1, padding: 10, gap: 8 },
  previousTitle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
  previousChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  previousChip: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5 },
  previousText: { fontSize: 11 },
  loggedWrap: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, gap: 5 },
  loggedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  loggedLabel: { fontSize: 12 },
  loggedValue: { fontSize: 12, letterSpacing: 0.2, flex: 1, textAlign: 'right' },
  logSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 10 },
  setLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logInput: { flex: 1, height: 44, borderWidth: 1, textAlign: 'center', fontSize: 14, fontWeight: '500' },
  techBody: { gap: 14 },
  techImage: { width: '100%', height: 220 },
  instructions: { gap: 12 },
  instructionRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  instructionNum: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  instructionNumText: { fontSize: 12 },
  instructionText: { flex: 1, fontSize: 13, lineHeight: 19 },
  techHint: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
})
