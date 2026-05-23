import { useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Plus } from 'lucide-react-native'
import { BottomSheetModal } from '@gorhom/bottom-sheet'
import { supabase } from '../../lib/supabase'
import { getCoachProfile } from '../../lib/coach'
import { useTheme } from '../../context/ThemeContext'
import { ExerciseSearchSheet } from '../../components/coach/ExerciseSearchSheet'
import { ExerciseSetRow, type ExerciseBlock } from '../../components/coach/ExerciseSetRow'

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

export default function ProgramBuilderScreen() {
  const { clientId, clientName } = useLocalSearchParams<{ clientId: string; clientName: string }>()
  const { theme } = useTheme()
  const router = useRouter()
  const searchSheetRef = useRef<BottomSheetModal>(null)

  const [title, setTitle] = useState('')
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(null)
  const [blocks, setBlocks] = useState<ExerciseBlock[]>([])
  const [saving, setSaving] = useState(false)

  function addExercise(exercise: ExerciseBlock) {
    setBlocks((prev) => [...prev, exercise])
  }

  function updateBlock(index: number, field: keyof ExerciseBlock, value: string) {
    setBlocks((prev) => prev.map((b, i) => (i === index ? { ...b, [field]: value } : b)))
  }

  function removeBlock(index: number) {
    setBlocks((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSave() {
    if (!title.trim()) {
      Alert.alert('Título requerido', 'Ingresa un nombre para el plan.')
      return
    }
    if (blocks.length === 0) {
      Alert.alert('Sin ejercicios', 'Agrega al menos un ejercicio.')
      return
    }

    setSaving(true)
    try {
      const coach = await getCoachProfile()
      if (!coach) throw new Error('Coach no encontrado')

      // Find or create the active program for this client
      let programId: string | null = null
      const { data: existing } = await supabase
        .from('workout_programs')
        .select('id')
        .eq('client_id', clientId)
        .eq('coach_id', coach.id)
        .eq('is_active', true)
        .maybeSingle()

      if (existing?.id) {
        programId = existing.id
      } else {
        const { data: newProg, error: progError } = await supabase
          .from('workout_programs')
          .insert({ client_id: clientId, coach_id: coach.id, name: 'Programa principal', is_active: true })
          .select('id')
          .single()
        if (progError) throw progError
        programId = newProg.id
      }

      // Create the workout plan
      const { data: plan, error: planError } = await supabase
        .from('workout_plans')
        .insert({
          program_id: programId,
          client_id: clientId,
          coach_id: coach.id,
          title: title.trim(),
          day_of_week: dayOfWeek,
        })
        .select('id')
        .single()
      if (planError) throw planError

      // Create workout blocks
      const blockInserts = blocks.map((b, i) => ({
        plan_id: plan.id,
        exercise_id: b.exerciseId,
        order_index: i,
        sets: parseInt(b.sets) || 3,
        reps: b.reps || '8-10',
        rest_time: b.restTime || '60s',
      }))
      const { error: blocksError } = await supabase.from('workout_blocks').insert(blockInserts)
      if (blocksError) throw blocksError

      router.back()
    } catch (err: any) {
      Alert.alert('Error', err?.message ?? 'No se pudo guardar el plan.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      {/* Top bar */}
      <View style={[styles.topBar, { borderBottomColor: theme.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.topBtn} activeOpacity={0.7}>
          <Text style={[styles.topBtnText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Cancelar</Text>
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={1}>
          {clientName ? `Plan para ${clientName}` : 'Nuevo plan'}
        </Text>
        <TouchableOpacity onPress={handleSave} disabled={saving} style={styles.topBtn} activeOpacity={0.8}>
          {saving ? (
            <ActivityIndicator size="small" color={theme.primary} />
          ) : (
            <Text style={[styles.topBtnText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>Guardar</Text>
          )}
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Title */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Nombre del plan</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="ej. Día A · Empuje"
              placeholderTextColor={theme.mutedForeground}
              style={[styles.titleInput, { borderColor: theme.border, color: theme.foreground, backgroundColor: theme.card, fontFamily: theme.fontSans }]}
            />
          </View>

          {/* Day of week */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Día (opcional)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>
              {DAYS.map((day, i) => {
                const active = dayOfWeek === i
                return (
                  <TouchableOpacity
                    key={day}
                    onPress={() => setDayOfWeek(active ? null : i)}
                    style={[
                      styles.dayChip,
                      {
                        backgroundColor: active ? theme.primary : theme.secondary,
                        borderColor: active ? theme.primary : theme.border,
                      },
                    ]}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.dayText, { color: active ? theme.primaryForeground : theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
                      {day}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </View>

          {/* Exercises */}
          <View style={styles.field}>
            <Text style={[styles.label, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              Ejercicios ({blocks.length})
            </Text>
            <View style={styles.blockList}>
              {blocks.map((b, i) => (
                <ExerciseSetRow key={`${b.exerciseId}-${i}`} block={b} index={i} onChange={updateBlock} onRemove={removeBlock} />
              ))}
            </View>

            <TouchableOpacity
              style={[styles.addBtn, { borderColor: theme.border, backgroundColor: theme.card }]}
              onPress={() => searchSheetRef.current?.present()}
              activeOpacity={0.7}
            >
              <Plus size={18} color={theme.primary} />
              <Text style={[styles.addBtnText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>
                Agregar ejercicio
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ExerciseSearchSheet ref={searchSheetRef} onSelect={addExercise} />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  topBtn: { minWidth: 70 },
  topTitle: { fontSize: 15, flex: 1, textAlign: 'center', marginHorizontal: 8 },
  topBtnText: { fontSize: 15 },
  scroll: { padding: 16, gap: 20, paddingBottom: 40 },
  field: { gap: 8 },
  label: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
  titleInput: { height: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, fontSize: 16 },
  dayRow: { gap: 8, paddingVertical: 2 },
  dayChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  dayText: { fontSize: 13 },
  blockList: { gap: 8 },
  addBtn: {
    height: 48,
    borderWidth: 1,
    borderRadius: 12,
    borderStyle: 'dashed',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  addBtnText: { fontSize: 14 },
})
