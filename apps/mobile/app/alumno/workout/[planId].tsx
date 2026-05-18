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
  const [logs, setLogs] = useState<Record<string, LogEntry[]>>({}) // blockId → entries
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

    // Try cache first
    const cached = await getCachedPlan<{ title: string; blocks: Block[] }>(planId)
    if (cached) {
      setPlanTitle(cached.title)
      setBlocks(cached.blocks)
      setLoading(false)
    }

    // Fetch from Supabase
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

    // Update local state
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

    // Start rest timer
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
          <Text style={[styles.sectionLabel, { color: theme.muted }]}>
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      {restSeconds != null && (
        <TouchableOpacity
          style={[styles.restBanner, { backgroundColor: theme.primary }]}
          onPress={() => { clearInterval(restInterval.current!); setRestSeconds(null) }}
        >
          <Text style={styles.restText}>Descanso: {restSeconds}s — Toca para saltar</Text>
        </TouchableOpacity>
      )}

      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.back, { color: theme.primary }]}>← Volver</Text>
        </TouchableOpacity>
        <Text style={[styles.navTitle, { color: theme.text }]} numberOfLines={1}>{planTitle}</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ flex: 1 }} color={theme.primary} />
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            {Object.entries(sections).map(([sec, blks]) => renderSection(sec, blks))}
            <TouchableOpacity
              style={[styles.finishBtn, { backgroundColor: theme.success }]}
              onPress={() => { Alert.alert('¡Entrenamiento completado!', '', [{ text: 'OK', onPress: () => router.back() }]) }}
            >
              <Text style={styles.finishText}>Finalizar entrenamiento</Text>
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

  async function handleLog() {
    if (nextSet > block.sets) return
    setSaving(true)
    await onLogSet(block, nextSet, weight, reps)
    setWeight('')
    setReps('')
    setSaving(false)
  }

  return (
    <View style={[styles.blockCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.exerciseName, { color: theme.text }]}>
        {block.exercises?.name ?? 'Ejercicio'}
      </Text>
      <Text style={[styles.targetText, { color: theme.muted }]}>
        {block.sets} × {block.reps}
        {block.target_weight_kg ? ` · ${block.target_weight_kg}kg` : ''}
        {block.rest_time ? ` · ${block.rest_time} descanso` : ''}
      </Text>
      {block.notes ? <Text style={[styles.notes, { color: theme.muted }]}>{block.notes}</Text> : null}

      {/* Logged sets */}
      {logged.map((l) => (
        <View key={l.setNumber} style={[styles.loggedRow, { borderColor: theme.border }]}>
          <Text style={[styles.loggedText, { color: theme.success }]}>
            Serie {l.setNumber}: {l.repsDone || '—'} reps {l.weightKg ? `· ${l.weightKg}kg` : ''}
          </Text>
        </View>
      ))}

      {/* Log next set */}
      {nextSet <= block.sets && (
        <View style={styles.logRow}>
          <Text style={[styles.setLabel, { color: theme.textSecondary }]}>Serie {nextSet}</Text>
          <TextInput
            style={[styles.logInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]}
            placeholder="kg"
            placeholderTextColor={theme.muted}
            value={weight}
            onChangeText={setWeight}
            keyboardType="decimal-pad"
          />
          <TextInput
            style={[styles.logInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.background }]}
            placeholder="reps"
            placeholderTextColor={theme.muted}
            value={reps}
            onChangeText={setReps}
            keyboardType="number-pad"
          />
          <TouchableOpacity
            style={[styles.logBtn, { backgroundColor: theme.primary }]}
            onPress={handleLog}
            disabled={saving}
          >
            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.logBtnText}>✓</Text>}
          </TouchableOpacity>
        </View>
      )}
      {nextSet > block.sets && (
        <Text style={[styles.doneText, { color: theme.success }]}>✓ Completado</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  restBanner: { paddingVertical: 10, alignItems: 'center' },
  restText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12 },
  back: { fontSize: 15, fontWeight: '600', width: 60 },
  navTitle: { fontSize: 16, fontWeight: '700', flex: 1, textAlign: 'center' },
  scroll: { paddingHorizontal: 16, paddingBottom: 40, gap: 8 },
  section: { gap: 8 },
  sectionLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 },
  blockCard: { borderRadius: 14, padding: 16, borderWidth: 1, gap: 6 },
  exerciseName: { fontSize: 16, fontWeight: '700' },
  targetText: { fontSize: 13 },
  notes: { fontSize: 12, fontStyle: 'italic' },
  loggedRow: { borderTopWidth: 1, paddingTop: 6, marginTop: 4 },
  loggedText: { fontSize: 13, fontWeight: '500' },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  setLabel: { fontSize: 13, width: 50 },
  logInput: { flex: 1, height: 40, borderWidth: 1, borderRadius: 8, textAlign: 'center', fontSize: 15 },
  logBtn: { width: 40, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  logBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  doneText: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  finishBtn: { borderRadius: 16, paddingVertical: 16, alignItems: 'center', marginTop: 16 },
  finishText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
