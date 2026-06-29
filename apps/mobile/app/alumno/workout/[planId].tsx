import { useEffect, useRef, useState } from 'react'
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
import { Confetti } from 'react-native-fast-confetti'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Check, ChevronLeft, Dumbbell, History, Play, Trophy } from 'lucide-react-native'
import { MotiView } from 'moti'
import { supabase } from '../../../lib/supabase'
import { getClientProfile } from '../../../lib/client'
import { getTodayInSantiago, getSantiagoUtcBoundsForDay } from '../../../lib/date-utils'
import { cachePlan, enqueueLog, getCachedPlan } from '../../../lib/offline-cache'
import { haptics } from '../../../lib/haptics'
import { useEvaMotion } from '../../../lib/motion'
import { useTheme } from '../../../context/ThemeContext'
import { Button, NativeDialog, OfflineBanner, ProgressBar } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { SafeAreaView } from 'react-native-safe-area-context'
import { RestTimer } from '../../../components/workout/RestTimer'
import { WorkoutSummaryModal } from '../../../components/workout/WorkoutSummaryModal'

// ── Immersive "gym mode" palette (fixed DS ink ramp — 1:1 with web alumno-rutina.jsx,
//    which renders the execution screen always-dark on ink-950). Brand accent stays
//    white-label aware via theme.primary; only the neutral dark tokens are literals. ──
const INK_950 = '#0B0E13' // surface-inverse / screen bg
const INK_900 = '#12161D' // ink-900 / card bg
const BORDER_INV = 'rgba(255,255,255,0.10)' // border-inverse
const ON_DARK = '#F4F6F8' // text-on-dark (ink-50)
const ON_DARK_MUTED = '#939DAB' // text-on-dark-muted
const W04 = 'rgba(255,255,255,0.04)'
const W05 = 'rgba(255,255,255,0.05)'
const W06 = 'rgba(255,255,255,0.06)'
const W08 = 'rgba(255,255,255,0.08)'
const W10 = 'rgba(255,255,255,0.10)'
const SUCCESS = '#1FB877' // success-500 (reads on dark)
const SUCCESS_TINT = 'rgba(31,184,119,0.16)'
const SUCCESS_BORDER = 'rgba(31,184,119,0.40)'

// DS font families (token-contract D3): Archivo display · Hanken UI · JetBrains mono.
const FONT_DISPLAY_SM = 'Archivo_800ExtraBold'
const FONT_BOLD = 'HankenGrotesk_700Bold'
const FONT_MONO = 'JetBrainsMono_700Bold'

/** Redondea y acota un input numérico a [min,max]; '' / NaN → null. Para RPE/RIR (columnas integer con CHECK). */
function clampIntInRange(v: string, min: number, max: number): number | null {
  if (!v) return null
  const n = Math.round(parseFloat(v))
  if (Number.isNaN(n)) return null
  return Math.max(min, Math.min(max, n))
}

interface Exercise {
  id: string
  name: string
  muscle_group: string | null
  video_url: string | null
  gif_url: string | null
  instructions: string[] | null
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
  superset_group: string | null
  progression_type: 'weight' | 'reps' | null
  progression_value: number | null
  is_override: boolean | null
  notes: string | null
  exercises: Exercise | null
}

interface LogEntry {
  blockId: string
  setNumber: number
  weightKg: string
  repsDone: string
  rpe?: string
  rir?: string
}

interface PreviousHistory {
  weight_kg: number | null
  reps_done: number | null
  date: string
}

const SECTION_LABELS: Record<string, string> = {
  warmup: 'Calentamiento',
  main: 'Bloque principal',
  cooldown: 'Vuelta a la calma',
}

const SECTION_SUBTITLES: Record<string, string> = {
  warmup: 'Movilidad y activacion antes del trabajo intenso.',
  main: 'Bloque de mayor esfuerzo: respeta series, reps y descansos.',
  cooldown: 'Baja la intensidad y cierra la sesion con control.',
}

export default function WorkoutExecutionScreen() {
  useKeepAwake()

  const { planId } = useLocalSearchParams<{ planId: string }>()
  const { theme } = useTheme()
  const router = useRouter()

  const [blocks, setBlocks] = useState<Block[]>([])
  const [planTitle, setPlanTitle] = useState('')
  const [activeWeekVariant, setActiveWeekVariant] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [clientId, setClientId] = useState<string | null>(null)
  const [logs, setLogs] = useState<Record<string, LogEntry[]>>({})
  const [previousHistory, setPreviousHistory] = useState<Record<string, PreviousHistory[]>>({})
  const [restSeconds, setRestSeconds] = useState<number | null>(null)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [techniqueExercise, setTechniqueExercise] = useState<Exercise | null>(null)
  const [isOnline, setIsOnline] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [prCelebration, setPrCelebration] = useState(false)
  const motion = useEvaMotion()
  const restInterval = useRef<ReturnType<typeof setInterval> | null>(null)
  const scrollRef = useRef<ScrollView>(null)
  const sectionY = useRef<Record<string, number>>({})
  const blockY = useRef<Record<string, number>>({})

  useEffect(() => {
    loadPlan()
    return () => { if (restInterval.current) clearInterval(restInterval.current) }
  }, [planId])


  async function loadPlan() {
    setLoading(true)
    const client = await getClientProfile()
    if (client) setClientId(client.id)

    const cached = await getCachedPlan<{ title: string; blocks: Block[]; activeWeekVariant?: string | null }>(planId)
    if (cached) {
      setPlanTitle(cached.title)
      setBlocks(cached.blocks)
      setActiveWeekVariant(cached.activeWeekVariant ?? null)
      setLoading(false)
    }

    const { data } = await supabase
      .from('workout_plans')
      .select(`
        id, title, week_variant,
        workout_blocks (
          id, order_index, sets, reps, target_weight_kg, tempo, rir, rest_time, section, superset_group, progression_type, progression_value, is_override, notes,
          exercises ( id, name, muscle_group, video_url, gif_url, instructions )
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
    await cachePlan(planId, { title: data.title, blocks: sorted, activeWeekVariant: (data as any).week_variant ?? null })

    const blockIds = sorted.map((b: Block) => b.id)
    if (client && blockIds.length > 0) {
      await Promise.all([
        loadTodayLogs(blockIds),
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
        const sec = b.section ?? 'main'
        const sy = sectionY.current[sec] ?? 0
        const by = blockY.current[b.id] ?? 0
        scrollRef.current?.scrollTo({ y: sy + by - 20, animated: true })
        return
      }
    }
  }

  async function loadTodayLogs(blockIds: string[]) {
    if (!clientId) return
    // Fix S1: "hoy" en horario Santiago (no UTC) + acotar por límite superior + filtrar por client_id.
    const { iso } = getTodayInSantiago()
    const { startIso, endIso } = getSantiagoUtcBoundsForDay(iso)
    const { data } = await supabase
      .from('workout_logs')
      .select('block_id, set_number, weight_kg, reps_done, rpe, rir')
      .eq('client_id', clientId)
      .in('block_id', blockIds)
      .gte('logged_at', startIso)
      .lt('logged_at', endIso)

    const next: Record<string, LogEntry[]> = {}
    for (const row of data ?? []) {
      const blockId = row.block_id
      if (!next[blockId]) next[blockId] = []
      next[blockId].push({
        blockId,
        setNumber: row.set_number,
        weightKg: row.weight_kg != null ? String(row.weight_kg) : '',
        repsDone: row.reps_done != null ? String(row.reps_done) : '',
        rpe: row.rpe != null ? String(row.rpe) : '',
        rir: row.rir != null ? String(row.rir) : '',
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
    for (const log of data ?? []) {
      const exId = (log as any).workout_blocks?.exercise_id
      if (!exId) continue
      if (!history[exId]) history[exId] = []
      const date = String((log as any).logged_at).split('T')[0]
      const existingDates = history[exId].map((h) => h.date)
      if (existingDates.length === 0 || existingDates.includes(date)) {
        history[exId].push({ weight_kg: log.weight_kg, reps_done: log.reps_done, date })
      }
    }
    setPreviousHistory(history)
  }

  function startRest(seconds: number) {
    if (restInterval.current) clearInterval(restInterval.current)
    restInterval.current = null
    setRestSeconds(seconds)
  }

  async function logSet(block: Block, setNumber: number, weight: string, reps: string, rpe: string, rir: string) {
    if (!clientId) return
    const entry: LogEntry = { blockId: block.id, setNumber, weightKg: weight, repsDone: reps, rpe, rir }

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
      weight_kg: weight ? parseFloat(weight) : null,
      reps_done: reps ? parseInt(reps) : null,
      // Fix S2: RPE/RIR son columnas integer con CHECK (1-10 / 0-10). Redondear+clamp
      // evita que un 7.5 reviente el upsert y se trate (mal) como "offline".
      rpe: clampIntInRange(rpe, 1, 10),
      rir: clampIntInRange(rir, 0, 10),
      exercise_name_at_log: block.exercises?.name ?? null,
    }

    // Fix S1: NO upsert (sin onConflict/id es un INSERT → duplica filas). Select-then-
    // update/insert acotado al día (igual que la web), y limpiar duplicados previos.
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

    // Deleite: ¿récord personal? El peso supera el máximo histórico (previousHistory ya cargado).
    const exId = block.exercises?.id
    const hist = exId ? previousHistory[exId] : undefined
    const prevMax = hist?.length ? Math.max(...hist.map((h) => h.weight_kg ?? 0)) : 0
    const w = weight ? parseFloat(weight) : 0
    if (!error && prevMax > 0 && w > prevMax) {
      setPrCelebration(true)
      haptics.pr()
      setTimeout(() => setPrCelebration(false), 2600)
    }

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    if (block.rest_time) {
      const secs = parseRestTime(block.rest_time)
      if (secs > 0) startRest(secs)
    }
  }

  function parseRestTime(restTime: string): number {
    const minMatch = restTime.match(/(\d+)\s*m/i)
    if (minMatch) return parseInt(minMatch[1]) * 60
    const match = restTime.match(/(\d+)/)
    return match ? parseInt(match[1]) : 0
  }

  function renderSection(section: string, sectionBlocks: Block[]) {
    return (
      <View key={section} style={styles.section} onLayout={(e) => { sectionY.current[section] = e.nativeEvent.layout.y }}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionRail, { backgroundColor: section === 'main' ? theme.primary : theme.primary + '55' }]} />
          <View style={styles.sectionCopy}>
            <Text style={[styles.sectionLabel, { color: ON_DARK, fontFamily: FONT_BOLD }]}>
              {SECTION_LABELS[section] ?? section}
            </Text>
            <Text style={[styles.sectionSubtitle, { color: ON_DARK_MUTED, fontFamily: theme.fontSans }]}>
              {SECTION_SUBTITLES[section] ?? 'Bloques de entrenamiento.'}
            </Text>
          </View>
        </View>
        {groupSupersets(sectionBlocks).map((group, groupIndex) => (
          <View
            key={group.key}
            style={[
              styles.groupCard,
              {
                borderColor: group.superset ? theme.primary + '40' : 'transparent',
                backgroundColor: group.superset ? theme.primary + '14' : 'transparent',
              },
            ]}
          >
            {group.superset ? (
              <View style={styles.supersetHeader}>
                <Text style={[styles.supersetTitle, { color: theme.primary, fontFamily: FONT_BOLD }]}>
                  Superserie {group.key}
                </Text>
                <Text style={[styles.supersetHint, { color: ON_DARK_MUTED, fontFamily: theme.fontSans }]}>
                  Completa una serie de cada ejercicio y repite.
                </Text>
              </View>
            ) : null}
            {group.blocks.map((block, index) => (
              <MotiView
                key={block.id}
                from={{ opacity: 0, translateY: 12 }}
                animate={{ opacity: 1, translateY: 0 }}
                transition={{ type: 'timing', duration: 350, delay: Math.min((groupIndex + index) * 50, 400) }}
                onLayout={(e) => { blockY.current[block.id] = e.nativeEvent.layout.y }}
              >
                <BlockCard
                  block={block}
                  logged={logs[block.id] ?? []}
                  previous={block.exercises?.id ? previousHistory[block.exercises.id] ?? [] : []}
                  onLogSet={logSet}
                  onOpenTechnique={() => setTechniqueExercise(block.exercises)}
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
  const sections = groupBySection(blocks)
  const eyebrow = activeWeekVariant ? `Semana ${activeWeekVariant}` : 'Entrenamiento'

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: INK_950 }]}>
      {prCelebration ? (
        <View pointerEvents="none" style={styles.prOverlay}>
          {!motion.reduced ? <Confetti autoplay fadeOutOnEnd colors={[theme.primary, '#F59E0B', '#10B981', theme.cyan]} /> : null}
          <View style={[styles.prBanner, { backgroundColor: theme.primary }]}>
            <Text style={[styles.prBannerText, { color: theme.primaryForeground }]}>🏆 ¡Nuevo récord!</Text>
          </View>
        </View>
      ) : null}
      {restSeconds != null && (
        <RestTimer
          duration={restSeconds}
          onComplete={() => setRestSeconds(null)}
          onSkip={() => setRestSeconds(null)}
        />
      )}

      <OfflineBanner visible={!isOnline} />

      {/* Header inmersivo (full-bleed gym mode) */}
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.headerBtn}
          activeOpacity={0.8}
          accessibilityLabel="Salir"
          hitSlop={8}
        >
          <ChevronLeft size={20} color={ON_DARK} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.headerEyebrow, { color: ON_DARK_MUTED }]} numberOfLines={1}>
            {eyebrow}
          </Text>
          <Text style={[styles.headerTitle, { color: ON_DARK }]} numberOfLines={1}>
            {planTitle || 'Workout'}
          </Text>
        </View>
      </View>

      {loading ? (
        <EvaLoaderScreen subtitle="Cargando rutina…" />
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={styles.progressHeader}>
            <View style={styles.progressTop}>
              <Text style={[styles.progressText, { color: ON_DARK_MUTED, fontFamily: FONT_MONO }]}>
                {completedSetCount}/{requiredSets} series
              </Text>
              <Text style={[styles.progressPct, { color: theme.primary, fontFamily: FONT_MONO }]}>
                {Math.round(completion * 100)}%
              </Text>
            </View>
            <ProgressBar value={completion} color={theme.primary} track={W10} height={6} />
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
                style={[styles.doneBanner, { backgroundColor: SUCCESS_TINT, borderColor: SUCCESS_BORDER }]}
              >
                <Trophy size={18} color={SUCCESS} strokeWidth={2} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.doneBannerTitle, { color: SUCCESS, fontFamily: FONT_BOLD }]}>
                    ¡Entrenamiento completado!
                  </Text>
                  <Text style={[styles.doneBannerSub, { color: SUCCESS, fontFamily: theme.fontSans, opacity: 0.85 }]}>
                    Todas las series registradas. El detalle queda sincronizado con tu coach.
                  </Text>
                </View>
              </MotiView>
            )}
            {Object.entries(sections).map(([sec, blks]) => renderSection(sec, blks))}
            <Button
              label="Finalizar entrenamiento"
              leftIcon={allDone ? Trophy : Check}
              variant="sport"
              onPress={() => setSummaryOpen(true)}
              disabled={blocks.length === 0}
              full
              size="lg"
              style={{ marginTop: 8 }}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <WorkoutSummaryModal
        visible={summaryOpen}
        planTitle={planTitle}
        blocks={blocks}
        logs={logs}
        onDone={() => router.replace('/alumno/home')}
        onClose={() => setSummaryOpen(false)}
      />

      <TechniqueDialog exercise={techniqueExercise} onClose={() => setTechniqueExercise(null)} />
    </SafeAreaView>
  )
}

function groupBySection(blocks: Block[]): Record<string, Block[]> {
  const order = ['warmup', 'main', 'cooldown']
  const groups: Record<string, Block[]> = {}
  for (const b of blocks) {
    const sec = b.section ?? 'main'
    if (!groups[sec]) groups[sec] = []
    groups[sec].push(b)
  }
  const sorted: Record<string, Block[]> = {}
  for (const sec of order) if (groups[sec]) sorted[sec] = groups[sec]
  for (const sec of Object.keys(groups)) if (!sorted[sec]) sorted[sec] = groups[sec]
  return sorted
}

function groupSupersets(blocks: Block[]): Array<{ key: string; superset: boolean; blocks: Block[] }> {
  const groups: Array<{ key: string; superset: boolean; blocks: Block[] }> = []
  for (const block of blocks) {
    const last = groups[groups.length - 1]
    if (block.superset_group && last?.key === block.superset_group) {
      last.blocks.push(block)
    } else {
      groups.push({ key: block.superset_group ?? block.id, superset: Boolean(block.superset_group), blocks: [block] })
    }
  }
  return groups
}

function BlockCard({
  block,
  logged,
  previous,
  onLogSet,
  onOpenTechnique,
}: {
  block: Block
  logged: LogEntry[]
  previous: PreviousHistory[]
  onLogSet: (block: Block, setNumber: number, weight: string, reps: string, rpe: string, rir: string) => Promise<void>
  onOpenTechnique: () => void
}) {
  const { theme } = useTheme()
  const nextSet = logged.length + 1
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [rpe, setRpe] = useState('')
  const [rir, setRir] = useState('')
  const [saving, setSaving] = useState(false)
  const done = nextSet > block.sets
  const hasTechnique = Boolean(block.exercises?.gif_url || block.exercises?.video_url || block.exercises?.instructions?.length)

  async function handleLog() {
    if (nextSet > block.sets) return
    setSaving(true)
    await onLogSet(block, nextSet, weight, reps, rpe, rir)
    setWeight('')
    setReps('')
    setRpe('')
    setRir('')
    setSaving(false)
  }

  return (
    <View
      style={[
        styles.blockCard,
        {
          backgroundColor: INK_900,
          borderColor: done ? SUCCESS_BORDER : BORDER_INV,
          borderWidth: done ? 1.5 : 1,
        },
      ]}
    >
      <View style={styles.blockHeader}>
        <View style={styles.exerciseCopy}>
          <Text style={[styles.exerciseMeta, { color: ON_DARK_MUTED, fontFamily: FONT_BOLD }]}>
            {block.exercises?.muscle_group ?? 'Ejercicio'}
          </Text>
          <Text style={[styles.exerciseName, { color: ON_DARK, fontFamily: FONT_DISPLAY_SM }]} numberOfLines={2}>
            {block.exercises?.name ?? 'Ejercicio'}
          </Text>
        </View>
        {hasTechnique ? (
          <TouchableOpacity
            style={[styles.techBtn, { backgroundColor: theme.primary }]}
            onPress={onOpenTechnique}
            activeOpacity={0.85}
            accessibilityLabel="Ver técnica"
          >
            <Play size={18} color={theme.primaryForeground} />
          </TouchableOpacity>
        ) : null}
        {done ? (
          <View style={[styles.doneBadge, { backgroundColor: SUCCESS_TINT }]}>
            <Check size={14} color={SUCCESS} strokeWidth={2.5} />
          </View>
        ) : null}
      </View>

      <View style={styles.metricGrid}>
        <Metric label="Series × reps" value={`${block.sets} × ${block.reps}`} />
        {block.target_weight_kg != null ? <Metric label="Peso" value={`${block.target_weight_kg} kg`} /> : null}
        {block.rest_time ? <Metric label="Descanso" value={block.rest_time} /> : null}
        {block.tempo ? <Metric label="Tempo" value={block.tempo} /> : null}
        {block.rir ? <Metric label="RIR" value={block.rir} accent={theme.primary} /> : null}
      </View>

      {block.progression_type && block.progression_value != null ? (
        <Text style={[styles.progression, { color: theme.primary, fontFamily: FONT_BOLD }]}>
          Progresion: +{block.progression_value} {block.progression_type === 'weight' ? 'kg' : 'reps'}
        </Text>
      ) : null}

      {block.notes ? (
        <View style={[styles.noteBox, { backgroundColor: theme.primary + '14', borderColor: theme.primary + '33' }]}>
          <Text style={[styles.notes, { color: ON_DARK, fontFamily: theme.fontSans }]}>
            {block.notes}
          </Text>
        </View>
      ) : null}

      {previous.length > 0 ? (
        <View style={[styles.previousWrap, { backgroundColor: W04 }]}>
          <View style={styles.previousTitleRow}>
            <History size={13} color={ON_DARK_MUTED} />
            <Text style={[styles.previousTitle, { color: ON_DARK_MUTED, fontFamily: FONT_BOLD }]}>
              Sesion anterior · {previous[0]?.date}
            </Text>
          </View>
          <View style={styles.previousChips}>
            {previous.slice(0, block.sets).map((log, index) => (
              <View key={`${log.date}-${index}`} style={[styles.previousChip, { backgroundColor: W06, borderColor: BORDER_INV }]}>
                <Text style={[styles.previousText, { color: ON_DARK, fontFamily: FONT_MONO }]}>
                  S{index + 1}: {log.weight_kg ?? '-'}kg × {log.reps_done ?? '-'}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {logged.length > 0 ? (
        <View style={[styles.loggedWrap, { borderTopColor: BORDER_INV }]}>
          {logged.map((l) => (
            <View key={l.setNumber} style={styles.loggedRow}>
              <Text style={[styles.loggedLabel, { color: ON_DARK_MUTED, fontFamily: theme.fontSans }]}>
                Serie {l.setNumber}
              </Text>
              <Text style={[styles.loggedValue, { color: SUCCESS, fontFamily: FONT_MONO }]}>
                {l.repsDone || '-'} reps{l.weightKg ? ` · ${l.weightKg}kg` : ''}{l.rpe ? ` · RPE ${l.rpe}` : ''}{l.rir ? ` · RIR ${l.rir}` : ''}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {!done ? (
        <View style={[styles.logSection, { borderTopColor: BORDER_INV }]}>
          <Text style={[styles.setLabel, { color: ON_DARK, fontFamily: FONT_BOLD }]}>
            Serie {nextSet}
          </Text>
          <View style={styles.logRow}>
            <LogInput placeholder="kg" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" />
            <LogInput placeholder="reps" value={reps} onChangeText={setReps} keyboardType="number-pad" />
            <LogInput placeholder="RPE" value={rpe} onChangeText={setRpe} keyboardType="decimal-pad" />
            <LogInput placeholder="RIR" value={rir} onChangeText={setRir} keyboardType="number-pad" />
          </View>
          <Button
            label={saving ? 'Guardando' : 'Registrar serie'}
            leftIcon={Check}
            variant="sport"
            onPress={handleLog}
            loading={saving}
            full
          />
        </View>
      ) : null}
    </View>
  )
}

function LogInput(props: React.ComponentProps<typeof TextInput>) {
  return (
    <TextInput
      {...props}
      style={styles.logInput}
      placeholderTextColor={ON_DARK_MUTED}
    />
  )
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <View style={[styles.metric, { backgroundColor: W05, borderColor: BORDER_INV }]}>
      <Text style={[styles.metricLabel, { color: ON_DARK_MUTED, fontFamily: FONT_BOLD }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: accent ?? ON_DARK, fontFamily: FONT_MONO }]}>{value}</Text>
    </View>
  )
}

function TechniqueDialog({ exercise, onClose }: { exercise: Exercise | null; onClose: () => void }) {
  const { theme } = useTheme()
  const mediaUrl = exercise?.gif_url ?? exercise?.video_url

  return (
    <NativeDialog open={Boolean(exercise)} title={exercise?.name ?? 'Tecnica'} onClose={onClose}>
      <View style={styles.techBody}>
        {exercise?.gif_url ? (
          <Image source={{ uri: exercise.gif_url }} resizeMode="contain" style={[styles.techImage, { backgroundColor: theme.secondary, borderRadius: theme.radius.xl }]} />
        ) : null}
        {mediaUrl ? (
          <Button label="Abrir video tecnica" leftIcon={Dumbbell} variant="secondary" onPress={() => Linking.openURL(mediaUrl)} full />
        ) : null}
        {exercise?.instructions?.length ? (
          <View style={styles.instructions}>
            {exercise.instructions.map((step, index) => (
              <View key={`${index}-${step}`} style={styles.instructionRow}>
                <View style={[styles.instructionNum, { backgroundColor: theme.primary + '18', borderRadius: theme.radius.sm }]}>
                  <Text style={[styles.instructionNumText, { color: theme.primary, fontFamily: FONT_DISPLAY_SM }]}>
                    {index + 1}
                  </Text>
                </View>
                <Text style={[styles.instructionText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                  {step.replace(/^Step:\d+\s*/i, '')}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text style={[styles.techHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            No hay instrucciones detalladas disponibles.
          </Text>
        )}
      </View>
    </NativeDialog>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  prOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'flex-start', paddingTop: 90, zIndex: 50 },
  prBanner: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 999 },
  prBannerText: { fontSize: 15, fontFamily: 'Archivo_900Black', letterSpacing: -0.2 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 4, paddingBottom: 12 },
  headerBtn: { width: 40, height: 40, marginLeft: -4, borderRadius: 12, backgroundColor: W08, alignItems: 'center', justifyContent: 'center' },
  headerEyebrow: { fontSize: 11.5, letterSpacing: 1, textTransform: 'uppercase', fontFamily: 'HankenGrotesk_700Bold' },
  headerTitle: { fontSize: 18, letterSpacing: -0.3, fontFamily: 'Archivo_800ExtraBold' },
  progressHeader: { paddingHorizontal: 16, paddingBottom: 14, gap: 8 },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressText: { fontSize: 12 },
  progressPct: { fontSize: 12 },
  scroll: { paddingHorizontal: 16, paddingVertical: 4, paddingBottom: 40, gap: 16 },
  doneBanner: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1, padding: 16, borderRadius: 20 },
  doneBannerTitle: { fontSize: 15 },
  doneBannerSub: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  section: { gap: 12 },
  sectionHeader: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  sectionRail: { width: 4, minHeight: 34, borderRadius: 2 },
  sectionCopy: { flex: 1, gap: 2 },
  sectionLabel: { fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 },
  sectionSubtitle: { fontSize: 12, lineHeight: 17 },
  groupCard: { borderWidth: 1, padding: 8, gap: 10, borderRadius: 20 },
  supersetHeader: { paddingHorizontal: 4, paddingTop: 4, gap: 2 },
  supersetTitle: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  supersetHint: { fontSize: 12, lineHeight: 17 },
  blockCard: { padding: 18, gap: 12, borderRadius: 20 },
  blockHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  exerciseCopy: { flex: 1, minWidth: 0, gap: 3 },
  exerciseMeta: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 },
  exerciseName: { fontSize: 21, letterSpacing: -0.3, lineHeight: 24 },
  techBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  doneBadge: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8, minWidth: '30%', flexGrow: 1, borderRadius: 7 },
  metricLabel: { fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.6 },
  metricValue: { fontSize: 15, marginTop: 2 },
  progression: { fontSize: 12 },
  noteBox: { borderWidth: 1, borderRadius: 7, paddingHorizontal: 12, paddingVertical: 10 },
  notes: { fontSize: 12.5, lineHeight: 18 },
  previousWrap: { padding: 10, gap: 8, borderRadius: 7 },
  previousTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  previousTitle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 },
  previousChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  previousChip: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7 },
  previousText: { fontSize: 11 },
  loggedWrap: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 5 },
  loggedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  loggedLabel: { fontSize: 12 },
  loggedValue: { fontSize: 12, letterSpacing: 0.2, flex: 1, textAlign: 'right' },
  logSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 10 },
  setLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logInput: {
    flex: 1, height: 44, borderWidth: 1, borderColor: BORDER_INV, backgroundColor: W06,
    color: ON_DARK, textAlign: 'center', fontSize: 14, borderRadius: 10,
    fontFamily: 'JetBrainsMono_500Medium',
  },
  techBody: { gap: 14 },
  techImage: { width: '100%', height: 220 },
  instructions: { gap: 12 },
  instructionRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  instructionNum: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  instructionNumText: { fontSize: 12 },
  instructionText: { flex: 1, fontSize: 13, lineHeight: 19 },
  techHint: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
})
