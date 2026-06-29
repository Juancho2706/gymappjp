import { useEffect, useRef, useState } from 'react'
import {
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { BookOpen, Play, Search, X } from 'lucide-react-native'
import { MotiView } from 'moti'
import type { BottomSheetModal } from '@gorhom/bottom-sheet'
import { supabase } from '../../../lib/supabase'
import { getClientProfile } from '../../../lib/client'
import { useTheme } from '../../../context/ThemeContext'
import { BottomSheet, Button, EmptyState, Input, ScreenHeader } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AppBackground } from '../../../components/AppBackground'

const FONT_BOLD = 'HankenGrotesk_700Bold'
const FONT_SEMI = 'HankenGrotesk_600SemiBold'
const FONT_DISPLAY = 'Archivo_800ExtraBold'

interface Exercise {
  id: string
  name: string
  muscle_group: string | null
  instructions: string | null
  video_url: string | null
  gif_url: string | null
}

export default function ExercisesScreen() {
  const { theme } = useTheme()
  const sheetRef = useRef<BottomSheetModal>(null)
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null)
  const [selected, setSelected] = useState<Exercise | null>(null)

  useEffect(() => { load().catch(() => setLoading(false)) }, [])

  async function load() {
    setLoading(true)
    const client = await getClientProfile()

    let query = supabase
      .from('exercises')
      .select('id, name, muscle_group, instructions, video_url, gif_url')
      .order('name')

    if (client?.coachId) {
      query = query.or(`coach_id.is.null,coach_id.eq.${client.coachId}`)
    } else {
      query = query.is('coach_id', null)
    }

    const { data } = await query
    setExercises(data ?? [])
    setLoading(false)
  }

  function openDetail(exercise: Exercise) {
    setSelected(exercise)
    sheetRef.current?.expand()
  }

  const muscleGroups = ['Todos', ...Array.from(
    new Set(exercises.map((e) => e.muscle_group).filter(Boolean) as string[])
  ).sort()]

  const filtered = exercises.filter((e) => {
    const matchSearch = !search || e.name.toLowerCase().includes(search.toLowerCase())
    const matchMuscle = !selectedMuscle || selectedMuscle === 'Todos' || e.muscle_group === selectedMuscle
    return matchSearch && matchMuscle
  })

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <AppBackground />
      <ScreenHeader title="Aprender Técnica" subtitle="Catálogo de ejercicios" />

      <View style={styles.searchWrap}>
        <Input
          leftIcon={Search}
          rightIcon={search.length > 0 ? X : undefined}
          onRightIconPress={() => setSearch('')}
          placeholder="Buscar ejercicio…"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
      </View>

      {muscleGroups.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.muscleScroll}
        >
          {muscleGroups.map((group) => {
            const isSelected = (selectedMuscle ?? 'Todos') === group
            return (
              <TouchableOpacity
                key={group}
                onPress={() => setSelectedMuscle(group === 'Todos' ? null : group)}
                activeOpacity={0.75}
                style={[
                  styles.muscleChip,
                  {
                    backgroundColor: isSelected ? theme.primary : theme.card,
                    borderColor: isSelected ? theme.primary : theme.border,
                  },
                ]}
              >
                <Text style={[styles.muscleChipText, { color: isSelected ? theme.primaryForeground : theme.foreground, fontFamily: FONT_BOLD }]}>
                  {group}
                </Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      )}

      {loading ? (
        <EvaLoaderScreen subtitle="Cargando ejercicios…" />
      ) : filtered.length === 0 ? (
        <EmptyState icon={BookOpen} title="Sin resultados" subtitle="Intenta con otra búsqueda o músculo." />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(e) => e.id}
          numColumns={2}
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <MotiView
              from={{ opacity: 0, translateY: 10 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 300, delay: Math.min(index * 30, 300) }}
              style={styles.cardWrap}
            >
              <TouchableOpacity
                style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}
                onPress={() => openDetail(item)}
                activeOpacity={0.85}
              >
                <View style={styles.banner}>
                  {item.gif_url ? (
                    <Image source={{ uri: item.gif_url }} style={styles.bannerImg} resizeMode="cover" />
                  ) : null}
                  <View style={styles.bannerPlay}>
                    <Play size={16} color="#FFFFFF" />
                  </View>
                  {item.muscle_group ? (
                    <View style={styles.bannerChip}>
                      <Text style={[styles.bannerChipText, { color: theme.primary }]}>
                        {item.muscle_group}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <View style={styles.cardContent}>
                  <Text style={[styles.exerciseName, { color: theme.foreground, fontFamily: FONT_SEMI }]} numberOfLines={2}>
                    {item.name}
                  </Text>
                </View>
              </TouchableOpacity>
            </MotiView>
          )}
        />
      )}

      <BottomSheet ref={sheetRef} title={selected?.name} snapPoints={['55%', '90%']}>
        {selected && <ExerciseDetail exercise={selected} theme={theme} onClose={() => sheetRef.current?.close()} />}
      </BottomSheet>
    </SafeAreaView>
  )
}

function ExerciseDetail({ exercise, theme, onClose }: { exercise: Exercise; theme: any; onClose: () => void }) {
  const instructions = (exercise.instructions ?? '').split('\n').filter(Boolean)

  return (
    <View style={styles.detail}>
      <View style={[styles.detailBanner, { borderRadius: theme.radius.lg }]}>
        {exercise.gif_url ? (
          <Image source={{ uri: exercise.gif_url }} style={styles.detailGif} resizeMode="contain" />
        ) : (
          <View style={styles.detailPlay}>
            <Play size={24} color="#FFFFFF" />
          </View>
        )}
      </View>

      {exercise.muscle_group && (
        <Text style={[styles.detailEyebrow, { color: theme.primary }]}>
          {exercise.muscle_group}
        </Text>
      )}

      {instructions.length > 0 ? (
        <View style={styles.instructionsList}>
          {instructions.map((line, i) => (
            <View key={i} style={styles.instructionRow}>
              <View style={[styles.instructionNum, { backgroundColor: theme.primary + '1A', borderRadius: theme.radius.sm }]}>
                <Text style={[styles.instructionNumText, { color: theme.primary, fontFamily: FONT_DISPLAY }]}>
                  {i + 1}
                </Text>
              </View>
              <Text style={[styles.instructionText, { color: theme.foreground, fontFamily: theme.fontSans }]}>
                {line}
              </Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={[styles.detailHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          El entrenador aún no ha añadido instrucciones específicas para este ejercicio.
        </Text>
      )}

      <Button label="Cerrar" variant="sport" size="lg" onPress={onClose} full style={{ marginTop: 6 }} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 10 },
  muscleScroll: { paddingHorizontal: 16, gap: 8, paddingBottom: 12 },
  muscleChip: { borderWidth: 1.5, paddingHorizontal: 15, height: 34, justifyContent: 'center', borderRadius: 999 },
  muscleChipText: { fontSize: 13 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  column: { gap: 12 },
  cardWrap: { flex: 1, marginBottom: 12 },
  card: { flex: 1, borderWidth: 1, borderRadius: 20, overflow: 'hidden' },
  banner: { height: 92, backgroundColor: '#12161D', alignItems: 'center', justifyContent: 'center' },
  bannerImg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  bannerPlay: { width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  bannerChip: { position: 'absolute', bottom: 7, left: 7, backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  bannerChipText: { fontSize: 9.5, fontFamily: 'HankenGrotesk_800ExtraBold', letterSpacing: 0.5, textTransform: 'uppercase' },
  cardContent: { padding: 11 },
  exerciseName: { fontSize: 13.5, lineHeight: 17 },
  detail: { gap: 14, paddingTop: 4 },
  detailBanner: { height: 180, backgroundColor: '#12161D', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  detailGif: { width: '100%', height: 180 },
  detailPlay: { width: 58, height: 58, borderRadius: 29, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  detailEyebrow: { fontSize: 11, fontFamily: 'HankenGrotesk_800ExtraBold', letterSpacing: 0.8, textTransform: 'uppercase' },
  instructionsList: { gap: 12 },
  instructionRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  instructionNum: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  instructionNumText: { fontSize: 12 },
  instructionText: { flex: 1, fontSize: 14.5, lineHeight: 21 },
  detailHint: { fontSize: 14, lineHeight: 20 },
})
