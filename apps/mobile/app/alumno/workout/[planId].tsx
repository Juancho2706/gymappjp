import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useKeepAwake } from 'expo-keep-awake'
import * as Haptics from 'expo-haptics'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Check, Dumbbell, Info, Timer, Trophy } from 'lucide-react-native'
import { MotiView } from 'moti'
import { supabase } from '../../../lib/supabase'
import { getClientProfile } from '../../../lib/client'
import { cachePlan, enqueueLog, getCachedPlan } from '../../../lib/offline-cache'
import { useTheme } from '../../../context/ThemeContext'
import { Button, NativeDialog, OfflineBanner, ProgressBar, TopBar } from '../../../components'

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
  const restInterval = useRef<ReturnType<typeof setInterval> | null>(null)

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
  }

  async function loadTodayLogs(blockIds: string[]) {
    const today = new Date().toISOString().slice(0, 10)
    const { data } = await supabase
      .from('workout_logs')
      .select('block_id, set_number, weight_kg, reps_done, rpe, rir')
      .in('block_id', blockIds)
      .gte('logged_at', `${today}T00:00:00.000Z`)

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
    setRestSeconds(seconds)
    restInterval.current = setInterval(() => {
      setRestSeconds((s) => {
        if (s == null || s <= 1) {
          clearInterval(restInterval.current!)
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
          return null
        }
        return s - 1
      })
    }, 1000)
  }

  async function logSet(block: Block, setNumber: number, weight: string, reps: string, rpe: string, rir: string) {
    if (!clientId) return
    const entry: LogEntry = { blockId: block.id, setNumber, weightKg: weight, repsDone: reps, rpe, rir }

    setLogs((prev) => ({
      ...prev,
      [block.id]: [...(prev[block.id] ?? []).filter((l) => l.setNumber !== setNumber), entry].sort((a, b) => a.setNumber - b.setNumber),
    }))

    const logData = {
      block_id: block.id,
      client_id: clientId,
      set_number: setNumber,
      weight_kg: weight ? parseFloat(weight) : null,
      reps_done: reps ? parseInt(reps) : null,
      rpe: rpe ? parseFloat(rpe) : null,
      rir: rir ? parseInt(rir) : null,
      exercise_name_at_log: block.exercises?.name ?? null,
    }

    const { error } = await supabase.from('workout_logs').upsert({
      ...logData,
      logged_at: new Date().toISOString(),
    })

    if (error) {
      setIsOnline(false)
      await enqueueLog(logData)
    } else {
      setIsOnline(true)
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
      <View key={section} style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionRail, { backgroundColor: section === 'main' ? theme.primary : theme.primary + '55' }]} />
          <View style={styles.sectionCopy}>
            <Text style={[styles.sectionLabel, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
              {SECTION_LABELS[section] ?? section}
            </Text>
            <Text style={[styles.sectionSubtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
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
                backgroundColor: group.superset ? theme.primary + '08' : 'transparent',
                borderRadius: theme.radius.xl,
              },
            ]}
          >
            {group.superset ? (
              <View style={styles.supersetHeader}>
                <Text style={[styles.supersetTitle, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>
                  Superserie {group.key}
                </Text>
                <Text style={[styles.supersetHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {restSeconds != null && (
        <MotiView from={{ opacity: 0, translateY: -16 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'spring', damping: 14 }}>
          <TouchableOpacity
            style={[styles.restBanner, { backgroundColor: theme.primary }, theme.shadowGlowBlue]}
            onPress={() => { if (restInterval.current) clearInterval(restInterval.current); setRestSeconds(null) }}
            activeOpacity={0.85}
          >
            <Timer size={16} color={theme.primaryForeground} />
            <Text style={[styles.restText, { color: theme.primaryForeground, fontFamily: 'Montserrat_700Bold' }]}>
              Descanso · {restSeconds}s · toca para saltar
            </Text>
          </TouchableOpacity>
        </MotiView>
      )}

      <OfflineBanner visible={!isOnline} />
      <TopBar back title={planTitle || 'Workout'} onBack={() => router.back()} />

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={theme.primary} />
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <View style={[styles.progressHeader, { borderBottomColor: theme.border }]}>
            <View style={styles.progressTop}>
              <Text style={[styles.progressText, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
                {completedSetCount}/{requiredSets} series
              </Text>
              <Text style={[styles.progressPct, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>
                {Math.round(completion * 100)}%
              </Text>
            </View>
            <ProgressBar value={completion} />
            {activeWeekVariant ? (
              <Text style={[styles.variantText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                Semana {activeWeekVariant}
              </Text>
            ) : null}
          </View>

          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {Object.entries(sections).map(([sec, blks]) => renderSection(sec, blks))}
            <Button
              label="Finalizar entrenamiento"
              leftIcon={allDone ? Trophy : Check}
              variant={allDone ? 'primary' : 'secondary'}
              onPress={() => setSummaryOpen(true)}
              disabled={blocks.length === 0}
              full
              size="lg"
              style={{ marginTop: 8 }}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <NativeDialog open={summaryOpen} title="Entrenamiento completado" onClose={() => setSummaryOpen(false)}>
        <View style={styles.summaryBody}>
          <View style={[styles.summaryIcon, { backgroundColor: theme.success + '18', borderRadius: theme.radius['2xl'] }]}>
            <Trophy size={34} color={theme.success} />
          </View>
          <Text style={[styles.summaryTitle, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>
            {planTitle}
          </Text>
          <Text style={[styles.summaryText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Registraste {completedSetCount} de {requiredSets} series. El detalle queda sincronizado con tu coach.
          </Text>
          <Button label="Volver al dashboard" onPress={() => router.replace('/alumno/home')} full />
        </View>
      </NativeDialog>

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
          backgroundColor: theme.card,
          borderColor: done ? theme.success : theme.border,
          borderWidth: done ? 2 : 1,
          borderRadius: theme.radius.xl,
        },
      ]}
    >
      <View style={styles.blockHeader}>
        <View style={styles.exerciseCopy}>
          <Text style={[styles.exerciseMeta, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            {block.exercises?.muscle_group ?? 'Ejercicio'}
          </Text>
          <Text style={[styles.exerciseName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={2}>
            {block.exercises?.name ?? 'Ejercicio'}
          </Text>
        </View>
        {hasTechnique ? (
          <TouchableOpacity
            style={[styles.iconBtn, { borderColor: theme.border, borderRadius: theme.radius.md }]}
            onPress={onOpenTechnique}
            activeOpacity={0.75}
          >
            <Info size={17} color={theme.primary} />
          </TouchableOpacity>
        ) : null}
        {done ? (
          <View style={[styles.doneBadge, { backgroundColor: theme.success + '22', borderRadius: theme.radius.sm }]}>
            <Trophy size={13} color={theme.success} />
          </View>
        ) : null}
      </View>

      <View style={styles.metricGrid}>
        <Metric label="Series x reps" value={`${block.sets} x ${block.reps}`} />
        {block.target_weight_kg != null ? <Metric label="Peso" value={`${block.target_weight_kg}kg`} /> : null}
        {block.rest_time ? <Metric label="Descanso" value={block.rest_time} /> : null}
        {block.tempo ? <Metric label="Tempo" value={block.tempo} /> : null}
        {block.rir ? <Metric label="RIR" value={block.rir} /> : null}
      </View>

      {block.progression_type && block.progression_value != null ? (
        <Text style={[styles.progression, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>
          Progresion: +{block.progression_value} {block.progression_type === 'weight' ? 'kg' : 'reps'}
        </Text>
      ) : null}

      {block.notes ? (
        <Text style={[styles.notes, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          {block.notes}
        </Text>
      ) : null}

      {previous.length > 0 ? (
        <View style={[styles.previousWrap, { borderColor: theme.primary + '30', backgroundColor: theme.primary + '08', borderRadius: theme.radius.lg }]}>
          <Text style={[styles.previousTitle, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>
            Sesion anterior · {previous[0]?.date}
          </Text>
          <View style={styles.previousChips}>
            {previous.slice(0, block.sets).map((log, index) => (
              <View key={`${log.date}-${index}`} style={[styles.previousChip, { backgroundColor: theme.background, borderColor: theme.border, borderRadius: theme.radius.sm }]}>
                <Text style={[styles.previousText, { color: theme.foreground, fontFamily: theme.fontSans }]}>
                  S{index + 1}: {log.weight_kg ?? '-'}kg x {log.reps_done ?? '-'}
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
              <Text style={[styles.loggedLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                Serie {l.setNumber}
              </Text>
              <Text style={[styles.loggedValue, { color: theme.success, fontFamily: 'Montserrat_700Bold' }]}>
                {l.repsDone || '-'} reps{l.weightKg ? ` · ${l.weightKg}kg` : ''}{l.rpe ? ` · RPE ${l.rpe}` : ''}{l.rir ? ` · RIR ${l.rir}` : ''}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {!done ? (
        <View style={[styles.logSection, { borderTopColor: theme.border }]}>
          <Text style={[styles.setLabel, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
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
  const { theme } = useTheme()
  return (
    <TextInput
      {...props}
      style={[
        styles.logInput,
        {
          borderColor: theme.border,
          color: theme.foreground,
          backgroundColor: theme.secondary,
          borderRadius: theme.radius.md,
          fontFamily: theme.fontSans,
        },
      ]}
      placeholderTextColor={theme.mutedForeground}
    />
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  const { theme } = useTheme()
  return (
    <View style={[styles.metric, { borderColor: theme.border, borderRadius: theme.radius.md }]}>
      <Text style={[styles.metricLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{value}</Text>
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
                  <Text style={[styles.instructionNumText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>
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
          <Text style={[styles.summaryText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            No hay instrucciones detalladas disponibles.
          </Text>
        )}
      </View>
    </NativeDialog>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  restBanner: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  restText: { fontSize: 14, letterSpacing: 0.3 },
  progressHeader: { paddingHorizontal: 16, paddingBottom: 12, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  progressTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressText: { fontSize: 13 },
  progressPct: { fontSize: 13 },
  variantText: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
  scroll: { paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 40, gap: 14 },
  section: { gap: 10 },
  sectionHeader: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  sectionRail: { width: 4, minHeight: 34, borderRadius: 2 },
  sectionCopy: { flex: 1, gap: 2 },
  sectionLabel: { fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 },
  sectionSubtitle: { fontSize: 12, lineHeight: 17 },
  groupCard: { borderWidth: 1, padding: 8, gap: 8 },
  supersetHeader: { paddingHorizontal: 4, paddingTop: 4, gap: 2 },
  supersetTitle: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 },
  supersetHint: { fontSize: 12, lineHeight: 17 },
  blockCard: { padding: 16, gap: 10 },
  blockHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  exerciseCopy: { flex: 1, minWidth: 0, gap: 2 },
  exerciseMeta: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 1 },
  exerciseName: { fontSize: 17, letterSpacing: -0.2 },
  iconBtn: { width: 36, height: 36, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  doneBadge: { paddingHorizontal: 8, paddingVertical: 7 },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metric: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, minWidth: '30%', flexGrow: 1 },
  metricLabel: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
  metricValue: { fontSize: 13, marginTop: 2 },
  progression: { fontSize: 12 },
  notes: { fontSize: 12, fontStyle: 'italic', lineHeight: 17 },
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
  summaryBody: { alignItems: 'center', gap: 12 },
  summaryIcon: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  summaryTitle: { fontSize: 20, textAlign: 'center' },
  summaryText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  techBody: { gap: 14 },
  techImage: { width: '100%', height: 220 },
  instructions: { gap: 12 },
  instructionRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  instructionNum: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  instructionNumText: { fontSize: 12 },
  instructionText: { flex: 1, fontSize: 13, lineHeight: 19 },
})
