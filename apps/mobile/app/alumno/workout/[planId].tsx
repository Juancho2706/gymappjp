import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '../../../lib/supabase'
import { getClientProfile } from '../../../lib/client'
import { cachePlan, enqueueLog, getCachedPlan } from '../../../lib/offline-cache'
import { useTheme } from '../../../context/ThemeContext'

interface Exercise { id: string; name: string }
interface Block {
  id: string
  order_index: number
  sets: number
  reps: string
  target_weight_kg: number | null
  rest_time: string | null
  section: string | null
  notes: string | null
  exercises: Exercise | null
}
interface LogEntry { setNumber: number; weightKg: string; repsDone: string }

const SECTION_LABELS: Record<string, string> = {
  warmup: 'Calentamiento',
  main: 'Principal',
  cooldown: 'Vuelta a la calma',
}

export default function WorkoutExecutionScreen() {
  const { planId } = useLocalSearchParams<{ planId: string }>()
  const { theme } = useTheme()
  const router = useRouter()

  const [blocks, setBlocks] = useState<Block[]>([])
  const [planTitle, setPlanTitle] = useState('')
  const [loading, setLoading] = useState(true)
  const [clientId, setClientId] = useState<string | null>(null)
  const [logs, setLogs] = useState<Record<string, LogEntry[]>>({})
  const [restSeconds, setRestSeconds] = useState<number | null>(null)
  const restInterval = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    loadPlan()
    return () => { if (restInterval.current) clearInterval(restInterval.current) }
  }, [planId])

  async function loadPlan() {
    setLoading(true)
    const client = await getClientProfile()
    if (client) setClientId(client.id)

    const cached = await getCachedPlan<{ title: string; blocks: Block[] }>(planId)
    if (cached) {
      setPlanTitle(cached.title)
      setBlocks(cached.blocks)
      setLoading(false)
    }

    const { data } = await supabase
      .from('workout_plans')
      .select(`
        id, title,
        workout_blocks (
          id, order_index, sets, reps, target_weight_kg, rest_time, section, notes,
          exercises ( id, name )
        )
      `)
      .eq('id', planId)
      .maybeSingle()

    if (data) {
      const sorted = ((data as any).workout_blocks ?? []).sort(
        (a: Block, b: Block) => a.order_index - b.order_index
      )
      setPlanTitle(data.title)
      setBlocks(sorted)
      await cachePlan(planId, { title: data.title, blocks: sorted })
    }
    setLoading(false)
  }

  function startRest(seconds: number) {
    if (restInterval.current) clearInterval(restInterval.current)
    setRestSeconds(seconds)
    restInterval.current = setInterval(() => {
      setRestSeconds((s) => {
        if (s == null || s <= 1) {
          clearInterval(restInterval.current!)
          return null
        }
        return s - 1
      })
    }, 1000)
  }

  async function logSet(block: Block, setNumber: number, weight: string, reps: string) {
    if (!clientId) return
    const entry: LogEntry = { setNumber, weightKg: weight, repsDone: reps }

    setLogs((prev) => ({
      ...prev,
      [block.id]: [...(prev[block.id] ?? []), entry],
    }))

    const logData = {
      block_id: block.id,
      client_id: clientId,
      set_number: setNumber,
      weight_kg: weight ? parseFloat(weight) : null,
      reps_done: reps ? parseInt(reps) : null,
      exercise_name_at_log: block.exercises?.name ?? null,
    }

    const { error } = await supabase.from('workout_logs').insert({
      ...logData,
      logged_at: new Date().toISOString(),
    })

    if (error) {
      await enqueueLog(logData)
    }

    if (block.rest_time) {
      const secs = parseRestTime(block.rest_time)
      if (secs > 0) startRest(secs)
    }
  }

  function parseRestTime(restTime: string): number {
    const match = restTime.match(/(\d+)/)
    return match ? parseInt(match[1]) : 0
  }

  function renderSection(section: string | null, sectionBlocks: Block[]) {
    return (
      <View key={section ?? 'main'} style={styles.section}>
        {section && section !== 'main' && (
          <Text
            style={[styles.sectionLabel, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}
          >
            {SECTION_LABELS[section] ?? section}
          </Text>
        )}
        {sectionBlocks.map((block) => (
          <BlockCard
            key={block.id}
            block={block}
            theme={theme}
            logged={logs[block.id] ?? []}
            onLogSet={logSet}
          />
        ))}
      </View>
    )
  }

  const sections = groupBySection(blocks)
  const allBlockIds = blocks.map((b) => b.id)
  const allDone =
    allBlockIds.length > 0 &&
    allBlockIds.every((id) => (logs[id]?.length ?? 0) >= (blocks.find((b) => b.id === id)?.sets ?? 999))

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {restSeconds != null && (
        <TouchableOpacity
          style={[styles.restBanner, { backgroundColor: theme.primary }, theme.shadowGlowBlue]}
          onPress={() => { clearInterval(restInterval.current!); setRestSeconds(null) }}
          activeOpacity={0.85}
        >
          <Text
            style={[styles.restText, { color: theme.primaryForeground, fontFamily: 'Montserrat_700Bold' }]}
          >
            Descanso · {restSeconds}s  ·  toca para saltar
          </Text>
        </TouchableOpacity>
      )}

      <View style={[styles.navBar, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Text
            style={[styles.back, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}
          >
            ← Volver
          </Text>
        </TouchableOpacity>
        <Text
          style={[styles.navTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}
          numberOfLines={1}
        >
          {planTitle}
        </Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={theme.primary} />
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {Object.entries(sections).map(([sec, blks]) => renderSection(sec, blks))}
            <TouchableOpacity
              style={[
                styles.finishBtn,
                {
                  backgroundColor: allDone ? theme.success : theme.primary,
                  borderRadius: theme.radius.lg,
                  opacity: blocks.length === 0 ? 0.5 : 1,
                },
                theme.shadowGlowBlue,
              ]}
              onPress={() => {
                Alert.alert('¡Entrenamiento completado!', '', [
                  { text: 'OK', onPress: () => router.back() },
                ])
              }}
              disabled={blocks.length === 0}
              activeOpacity={0.85}
            >
              <Text
                style={[styles.finishText, { color: theme.primaryForeground, fontFamily: 'Montserrat_700Bold' }]}
              >
                {allDone ? '✓ Finalizar entrenamiento' : 'Finalizar entrenamiento →'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
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

function BlockCard({ block, theme, logged, onLogSet }: {
  block: Block
  theme: any
  logged: { setNumber: number; weightKg: string; repsDone: string }[]
  onLogSet: (block: Block, setNumber: number, weight: string, reps: string) => Promise<void>
}) {
  const nextSet = logged.length + 1
  const [weight, setWeight] = useState('')
  const [reps, setReps] = useState('')
  const [saving, setSaving] = useState(false)

  const done = nextSet > block.sets

  async function handleLog() {
    if (nextSet > block.sets) return
    setSaving(true)
    await onLogSet(block, nextSet, weight, reps)
    setWeight('')
    setReps('')
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
        <Text
          style={[styles.exerciseName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}
          numberOfLines={2}
        >
          {block.exercises?.name ?? 'Ejercicio'}
        </Text>
        {done && (
          <View
            style={[
              styles.doneBadge,
              { backgroundColor: theme.success + '22', borderRadius: theme.radius.sm },
            ]}
          >
            <Text style={[styles.doneBadgeText, { color: theme.success, fontFamily: 'Montserrat_700Bold' }]}>
              ✓
            </Text>
          </View>
        )}
      </View>

      <Text style={[styles.targetText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
        {block.sets} × {block.reps}
        {block.target_weight_kg ? ` · ${block.target_weight_kg}kg` : ''}
        {block.rest_time ? ` · ${block.rest_time} descanso` : ''}
      </Text>

      {block.notes ? (
        <Text style={[styles.notes, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          {block.notes}
        </Text>
      ) : null}

      {logged.length > 0 && (
        <View style={[styles.loggedWrap, { borderTopColor: theme.border }]}>
          {logged.map((l) => (
            <View key={l.setNumber} style={styles.loggedRow}>
              <Text
                style={[styles.loggedLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}
              >
                Serie {l.setNumber}
              </Text>
              <Text
                style={[styles.loggedValue, { color: theme.success, fontFamily: 'Montserrat_700Bold' }]}
              >
                {l.repsDone || '—'} reps{l.weightKg ? ` · ${l.weightKg}kg` : ''}
              </Text>
            </View>
          ))}
        </View>
      )}

      {!done && (
        <View style={[styles.logSection, { borderTopColor: theme.border }]}>
          <Text style={[styles.setLabel, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
            Serie {nextSet}
          </Text>
          <View style={styles.logRow}>
            <TextInput
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
              placeholder="kg"
              placeholderTextColor={theme.mutedForeground}
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
            />
            <TextInput
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
              placeholder="reps"
              placeholderTextColor={theme.mutedForeground}
              value={reps}
              onChangeText={setReps}
              keyboardType="number-pad"
            />
            <TouchableOpacity
              style={[
                styles.logBtn,
                { backgroundColor: theme.primary, borderRadius: theme.radius.md },
              ]}
              onPress={handleLog}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving ? (
                <ActivityIndicator size="small" color={theme.primaryForeground} />
              ) : (
                <Text style={[styles.logBtnText, { color: theme.primaryForeground, fontFamily: 'Montserrat_700Bold' }]}>
                  ✓
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  restBanner: { paddingVertical: 12, alignItems: 'center' },
  restText: { fontSize: 14, letterSpacing: 0.3 },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  back: { fontSize: 14, width: 60, letterSpacing: 0.3 },
  navTitle: { fontSize: 15, flex: 1, textAlign: 'center', letterSpacing: -0.2 },
  scroll: { paddingHorizontal: 16, paddingVertical: 16, paddingBottom: 40, gap: 12 },
  section: { gap: 8 },
  sectionLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  blockCard: { padding: 16, gap: 8 },
  blockHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  exerciseName: { fontSize: 16, letterSpacing: -0.2, flex: 1 },
  doneBadge: { paddingHorizontal: 8, paddingVertical: 3 },
  doneBadgeText: { fontSize: 12 },
  targetText: { fontSize: 13 },
  notes: { fontSize: 12, fontStyle: 'italic', lineHeight: 17 },
  loggedWrap: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 8, gap: 4 },
  loggedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  loggedLabel: { fontSize: 12 },
  loggedValue: { fontSize: 13, letterSpacing: 0.2 },
  logSection: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 8 },
  setLabel: { fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logInput: {
    flex: 1,
    height: 44,
    borderWidth: 1,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '500',
  },
  logBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logBtnText: { fontSize: 18 },
  finishBtn: {
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  finishText: { fontSize: 15, letterSpacing: 0.3 },
})
