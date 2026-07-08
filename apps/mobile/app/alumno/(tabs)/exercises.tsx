import { useEffect, useState } from 'react'
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Image } from 'expo-image'
import { BookOpen, Dumbbell, Play, Search, X } from 'lucide-react-native'
import { MotiView } from 'moti'
import { supabase } from '../../../lib/supabase'
import { getClientProfile } from '../../../lib/client'
import { useTheme } from '../../../context/ThemeContext'
import { Button, EmptyState, Input, Sheet, VideoPlayer } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AppBackground } from '../../../components/AppBackground'
import { FONT, TYPE, textStyle } from '../../../lib/typography'
import { GLOWS, SHADOWS } from '../../../lib/shadows'

interface Exercise {
  id: string
  name: string
  muscle_group: string | null
  instructions: string | null
  video_url: string | null
  gif_url: string | null
}

// Detección YouTube — mismo contrato que VideoPlayer / la web (lib/youtube).
const YT_RE = /(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/

/** Miniatura utilizable del ejercicio: gif propio o, si el video es de YouTube, su thumb. */
function mediaThumb(ex: Exercise): string | null {
  if (ex.gif_url) return ex.gif_url
  const m = ex.video_url?.match(YT_RE)
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : null
}

export default function ExercisesScreen() {
  const { theme, resolvedScheme } = useTheme()
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedMuscle, setSelectedMuscle] = useState<string | null>(null)
  const [selected, setSelected] = useState<Exercise | null>(null)

  useEffect(() => {
    load().catch(() => setLoading(false))
  }, [])

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

  const muscleGroups = [
    'Todos',
    ...Array.from(new Set(exercises.map((e) => e.muscle_group).filter(Boolean) as string[])).sort(),
  ]

  const filtered = exercises.filter((e) => {
    const matchSearch = !search || e.name.toLowerCase().includes(search.toLowerCase())
    const matchMuscle = !selectedMuscle || selectedMuscle === 'Todos' || e.muscle_group === selectedMuscle
    return matchSearch && matchMuscle
  })

  // Ejercicio destacado: primero con media utilizable, solo en la vista por defecto
  // (sin búsqueda ni filtro de músculo) — espeja FeaturedExerciseCard de la web.
  const isDefaultView = !search.trim() && (selectedMuscle === null || selectedMuscle === 'Todos')
  const featured = isDefaultView ? (filtered.find((e) => mediaThumb(e)) ?? null) : null

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} testID="exercises-screen">
      <AppBackground />

      {/* Header branded — icono Dumbbell sport + "Aprender · Técnica de cada ejercicio" */}
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: theme.primary + '1A', borderRadius: theme.radius.lg }]}>
          <Dumbbell size={22} color={theme.primary} strokeWidth={2.2} />
        </View>
        <View style={styles.headerText}>
          <Text style={[TYPE.h3, { color: theme.foreground }]} numberOfLines={1}>
            Aprender
          </Text>
          <Text style={[TYPE.caption, { color: theme.mutedForeground }]} numberOfLines={1}>
            Técnica de cada ejercicio
          </Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Input
          testID="exercises-search-input"
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
                testID={`muscle-chip-${group}`}
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
                <Text
                  style={[
                    textStyle('xs', FONT.uiBold),
                    { color: isSelected ? theme.primaryForeground : theme.foreground },
                  ]}
                >
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
          ListHeaderComponent={
            featured ? (
              <View style={styles.featuredHeader}>
                <FeaturedCard exercise={featured} theme={theme} scheme={resolvedScheme} onPress={() => setSelected(featured)} />
                <Text style={[TYPE.title, { color: theme.foreground }]}>Biblioteca</Text>
              </View>
            ) : null
          }
          renderItem={({ item, index }) => (
            <MotiView
              from={{ opacity: 0, translateY: 10 }}
              animate={{ opacity: 1, translateY: 0 }}
              transition={{ type: 'timing', duration: 300, delay: Math.min(index * 30, 300) }}
              style={styles.cardWrap}
            >
              <ExerciseCard item={item} theme={theme} scheme={resolvedScheme} onPress={() => setSelected(item)} />
            </MotiView>
          )}
        />
      )}

      <Sheet
        open={!!selected}
        onClose={() => setSelected(null)}
        snapPoints={['72%', '92%']}
        footer={
          <Button label="Cerrar" variant="sport" size="lg" onPress={() => setSelected(null)} full testID="exercise-detail-close" />
        }
      >
        {selected && <ExerciseDetail exercise={selected} theme={theme} />}
      </Sheet>
    </SafeAreaView>
  )
}

/* -------------------------------------------------------------------------- */

/** Hero "Destacado" — banner grande + play sport-glow + nombre display. */
function FeaturedCard({
  exercise,
  theme,
  scheme,
  onPress,
}: {
  exercise: Exercise
  theme: any
  scheme: 'light' | 'dark'
  onPress: () => void
}) {
  const thumb = mediaThumb(exercise)
  return (
    <TouchableOpacity
      testID="featured-exercise-card"
      activeOpacity={0.9}
      onPress={onPress}
      style={[styles.featCard, { backgroundColor: theme.card, borderColor: theme.border }, SHADOWS[scheme].sm]}
    >
      <View style={styles.featBanner}>
        {thumb ? (
          <>
            <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
            <View style={styles.featScrim} />
          </>
        ) : null}
        <View style={[styles.featPlay, { backgroundColor: theme.primary }, GLOWS.sport]}>
          <Play size={26} color={theme.primaryForeground} fill={theme.primaryForeground} />
        </View>
        <View style={[styles.featBadge, { backgroundColor: theme.primary }]}>
          <Text style={[TYPE.eyebrow, { color: theme.primaryForeground }]}>Destacado</Text>
        </View>
      </View>
      <View style={styles.featContent}>
        <Text style={[TYPE.h3, { color: theme.foreground }]} numberOfLines={2}>
          {exercise.name}
        </Text>
        {exercise.muscle_group ? (
          <Text style={[TYPE.caption, { color: theme.mutedForeground, marginTop: 2 }]}>{exercise.muscle_group}</Text>
        ) : null}
      </View>
    </TouchableOpacity>
  )
}

/** Card de grilla: banner + badge músculo + nombre. */
function ExerciseCard({
  item,
  theme,
  scheme,
  onPress,
}: {
  item: Exercise
  theme: any
  scheme: 'light' | 'dark'
  onPress: () => void
}) {
  const thumb = mediaThumb(item)
  return (
    <TouchableOpacity
      testID={`exercise-card-${item.id}`}
      style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }, SHADOWS[scheme].sm]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.banner}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
        ) : (
          <View style={[styles.bannerPlay, { backgroundColor: 'rgba(255,255,255,0.12)' }]}>
            <Play size={17} color="#FFFFFF" />
          </View>
        )}
        {item.muscle_group ? (
          <View style={styles.bannerChip}>
            <Text style={[textStyle('3xs', FONT.uiExtra, { ls: 'wide' }), styles.bannerChipText, { color: theme.primary }]}>
              {item.muscle_group}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={styles.cardContent}>
        <Text style={[textStyle('xs', FONT.uiBold, { lh: 'snug' }), { color: theme.foreground }]} numberOfLines={2}>
          {item.name}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

/** Contenido del sheet de detalle: banner media + nombre + eyebrow músculo + instrucciones. */
function ExerciseDetail({ exercise, theme }: { exercise: Exercise; theme: any }) {
  const instructions = (exercise.instructions ?? '')
    .split('\n')
    .map((l) => l.replace(/^Step:\d+\s*/i, '').trim())
    .filter(Boolean)

  return (
    <View style={styles.detail}>
      {/* Banner media (full-bleed dentro del padding del Sheet) */}
      <View style={styles.detailBanner}>
        {exercise.gif_url ? (
          <View style={styles.detailGifWrap}>
            <Image source={{ uri: exercise.gif_url }} style={styles.detailGif} contentFit="contain" transition={200} />
          </View>
        ) : exercise.video_url ? (
          <VideoPlayer url={exercise.video_url} autoPlay muted loop title={exercise.name} />
        ) : (
          <View style={[styles.detailFallback, { backgroundColor: theme.card }]}>
            <View style={[styles.detailFallbackPlay, { backgroundColor: theme.primary }, GLOWS.sport]}>
              <Play size={24} color={theme.primaryForeground} fill={theme.primaryForeground} />
            </View>
          </View>
        )}
      </View>

      <View>
        <Text style={[TYPE.h2, { color: theme.foreground }]}>{exercise.name}</Text>
        {exercise.muscle_group ? (
          <Text style={[TYPE.eyebrow, { color: theme.primary, marginTop: 5 }]}>{exercise.muscle_group}</Text>
        ) : null}
      </View>

      {instructions.length > 0 ? (
        <View style={styles.instructionsList}>
          {instructions.map((line, i) => (
            <View key={i} style={styles.instructionRow}>
              <View style={[styles.instructionNum, { backgroundColor: theme.primary + '1A', borderRadius: theme.radius.sm }]}>
                <Text style={[textStyle('xs', FONT.displayBold), { color: theme.primary }]}>{i + 1}</Text>
              </View>
              <Text style={[textStyle('sm', FONT.ui, { lh: 'relaxed' }), { color: theme.foreground, flex: 1 }]}>{line}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={[TYPE.body, { color: theme.mutedForeground }]}>
          El entrenador aún no ha añadido instrucciones específicas para este ejercicio.
        </Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 14,
  },
  headerIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, minWidth: 0 },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 10 },
  muscleScroll: { paddingHorizontal: 16, gap: 8, paddingBottom: 12 },
  muscleChip: { borderWidth: 1.5, paddingHorizontal: 15, height: 34, justifyContent: 'center', borderRadius: 999 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  column: { gap: 12 },
  featuredHeader: { gap: 14, marginBottom: 14 },
  featCard: { borderWidth: 1, borderRadius: 20, overflow: 'hidden' },
  featBanner: { height: 150, backgroundColor: '#12161D', alignItems: 'center', justifyContent: 'center' },
  featScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.28)' },
  featPlay: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  featBadge: { position: 'absolute', top: 12, left: 12, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  featContent: { padding: 16 },
  cardWrap: { flex: 1, marginBottom: 12 },
  card: { flex: 1, borderWidth: 1, borderRadius: 20, overflow: 'hidden' },
  banner: { height: 96, backgroundColor: '#12161D', alignItems: 'center', justifyContent: 'center' },
  bannerPlay: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  bannerChip: { position: 'absolute', bottom: 7, left: 7, backgroundColor: 'rgba(0,0,0,0.45)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 },
  bannerChipText: { textTransform: 'uppercase' },
  cardContent: { padding: 11 },
  detail: { gap: 16, paddingTop: 4 },
  detailBanner: { marginHorizontal: -20 },
  detailGifWrap: { height: 200, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  detailGif: { width: '100%', height: 200 },
  detailFallback: { height: 200, alignItems: 'center', justifyContent: 'center' },
  detailFallbackPlay: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  instructionsList: { gap: 12 },
  instructionRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  instructionNum: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
})
