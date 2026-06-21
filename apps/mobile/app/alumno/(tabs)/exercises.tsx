import { useEffect, useRef, useState } from 'react'
import {
  FlatList,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { BookOpen, Search, X } from 'lucide-react-native'
import { MotiView } from 'moti'
import type { BottomSheetModal } from '@gorhom/bottom-sheet'
import { supabase } from '../../../lib/supabase'
import { getClientProfile } from '../../../lib/client'
import { exerciseHasVideo } from '../../../lib/exercises'
import { useTheme } from '../../../context/ThemeContext'
import { BottomSheet, EmptyState, ScreenHeader } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AppBackground } from '../../../components/AppBackground'

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
  const [videoOnly, setVideoOnly] = useState(false)
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
    const matchVideo = !videoOnly || exerciseHasVideo(e)
    return matchSearch && matchMuscle && matchVideo
  })

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <AppBackground />
      <ScreenHeader title="Aprender Técnica" subtitle="Catálogo de ejercicios" />

      <View style={styles.searchWrap}>
        <View style={[styles.searchBox, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
          <Search size={16} color={theme.mutedForeground} strokeWidth={2} />
          <TextInput
            style={[styles.searchInput, { color: theme.foreground, fontFamily: theme.fontSans }]}
            placeholder="Buscar ejercicio..."
            placeholderTextColor={theme.mutedForeground}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <X size={14} color={theme.mutedForeground} strokeWidth={2} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.toggleRow}>
        <TouchableOpacity
          onPress={() => setVideoOnly((v) => !v)}
          activeOpacity={0.8}
          style={[styles.muscleChip, { backgroundColor: videoOnly ? theme.primary : theme.card, borderColor: videoOnly ? theme.primary : theme.border, borderRadius: theme.radius.lg }]}
        >
          <Text style={[styles.muscleChipText, { color: videoOnly ? theme.primaryForeground : theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
            Con video
          </Text>
        </TouchableOpacity>
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
                    borderRadius: theme.radius.lg,
                  },
                ]}
              >
                <Text style={[styles.muscleChipText, { color: isSelected ? theme.primaryForeground : theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
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
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => (
            <MotiView
              from={{ opacity: 0, translateY: 10 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 300, delay: Math.min(index * 40, 300) }}
            >
              <TouchableOpacity
                style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}
                onPress={() => openDetail(item)}
                activeOpacity={0.82}
              >
                {item.gif_url ? (
                  <Image source={{ uri: item.gif_url }} style={styles.gif} resizeMode="cover" />
                ) : (
                  <View style={[styles.gifPlaceholder, { backgroundColor: theme.muted }]}>
                    <BookOpen size={20} color={theme.mutedForeground} strokeWidth={1.5} />
                  </View>
                )}
                <View style={styles.cardContent}>
                  {item.muscle_group && (
                    <View style={[styles.muscleBadge, { backgroundColor: theme.primary + '20' }]}>
                      <Text style={[styles.muscleBadgeText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>
                        {item.muscle_group}
                      </Text>
                    </View>
                  )}
                  <Text style={[styles.exerciseName, { color: theme.foreground, fontFamily: 'Montserrat_600SemiBold' }]} numberOfLines={2}>
                    {item.name}
                  </Text>
                </View>
              </TouchableOpacity>
            </MotiView>
          )}
        />
      )}

      <BottomSheet ref={sheetRef} title={selected?.name} snapPoints={['55%', '90%']}>
        {selected && <ExerciseDetail exercise={selected} theme={theme} />}
      </BottomSheet>
    </SafeAreaView>
  )
}

function ExerciseDetail({ exercise, theme }: { exercise: Exercise; theme: any }) {
  const instructions = (exercise.instructions ?? '').split('\n').filter(Boolean)

  return (
    <View style={styles.detail}>
      {exercise.muscle_group && (
        <View style={[styles.muscleBadge, { backgroundColor: theme.primary + '20', alignSelf: 'flex-start' }]}>
          <Text style={[styles.muscleBadgeText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>
            {exercise.muscle_group}
          </Text>
        </View>
      )}
      {exercise.gif_url && (
        <Image source={{ uri: exercise.gif_url }} style={styles.detailGif} resizeMode="contain" />
      )}
      {instructions.length > 0 && (
        <View style={styles.instructionsList}>
          {instructions.map((line, i) => (
            <View key={i} style={styles.instructionRow}>
              <Text style={[styles.instructionBullet, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>
                {i + 1}.
              </Text>
              <Text style={[styles.instructionText, { color: theme.foreground, fontFamily: theme.fontSans }]}>
                {line}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 8 },
  searchBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, paddingHorizontal: 12, height: 44, gap: 8 },
  searchInput: { flex: 1, fontSize: 14 },
  toggleRow: { flexDirection: 'row', paddingHorizontal: 16, paddingBottom: 10 },
  muscleScroll: { paddingHorizontal: 16, gap: 6, paddingBottom: 10 },
  muscleChip: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7 },
  muscleChipText: { fontSize: 12 },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 10 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1 },
  gif: { width: 56, height: 56, borderRadius: 8 },
  gifPlaceholder: { width: 56, height: 56, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  cardContent: { flex: 1, gap: 4 },
  muscleBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, alignSelf: 'flex-start' },
  muscleBadgeText: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  exerciseName: { fontSize: 14 },
  detail: { gap: 14 },
  detailGif: { width: '100%', height: 200, borderRadius: 12 },
  instructionsList: { gap: 10 },
  instructionRow: { flexDirection: 'row', gap: 8 },
  instructionBullet: { fontSize: 14, width: 22, flexShrink: 0 },
  instructionText: { flex: 1, fontSize: 14, lineHeight: 20 },
})
