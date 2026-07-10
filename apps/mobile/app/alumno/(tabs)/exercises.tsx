import { memo, useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { Image } from 'expo-image'
import { useLocalSearchParams } from 'expo-router'
import { BookOpen, ChevronDown, Dumbbell, Play, Search, X } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../../context/ThemeContext'
import { useAlumnoScrollHandler } from '../../../lib/alumno-chrome-scroll'
import { Button, EmptyState, Input, Sheet, VideoPlayer } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AppBackground } from '../../../components/AppBackground'
import { FONT, TYPE, textStyle } from '../../../lib/typography'
import { GLOWS, SHADOWS } from '../../../lib/shadows'
import {
  type CatalogExercise,
  type CatalogScope,
  exerciseGridThumb,
  fetchExercisePage,
  fetchScopeMuscleGroups,
  getCatalogExerciseById,
  getExerciseInstructions,
  resolveCatalogScope,
} from '../../../lib/exercise-catalog'

/** Debounce de la búsqueda para no disparar un fetch server por tecla (1:1 web). */
const SEARCH_DEBOUNCE_MS = 250

export default function ExercisesScreen() {
  const { theme, resolvedScheme } = useTheme()
  const onScrollChrome = useAlumnoScrollHandler()
  // Deep-link: `?q=<term>` precarga la búsqueda (lo usa el "Ver técnica" del Home, home.tsx),
  // `?ex=<id>` abre directo el sheet de detalle (ruta `/alumno/exercise/[id]`).
  const params = useLocalSearchParams<{ q?: string; ex?: string }>()
  const qParam = typeof params.q === 'string' ? params.q : ''
  const exParam = typeof params.ex === 'string' ? params.ex : ''

  const [exercises, setExercises] = useState<CatalogExercise[]>([])
  const [muscleGroups, setMuscleGroups] = useState<string[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [refetching, setRefetching] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const [search, setSearch] = useState(qParam)
  const [selectedMuscle, setSelectedMuscle] = useState<string>('Todos')

  const [selected, setSelected] = useState<CatalogExercise | null>(null)
  const [instructions, setInstructions] = useState<string[] | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  // Scope resuelto una vez (reutilizado por refetch/load-more sin re-resolver auth).
  const scopeRef = useRef<CatalogScope | null>(null)
  // Secuencia de requests: descarta respuestas viejas al cambiar filtro. `exercisesRef` da el
  // offset actual sin recrear el callback de load-more en cada append.
  const reqSeq = useRef(0)
  const exercisesRef = useRef<CatalogExercise[]>([])
  useEffect(() => {
    exercisesRef.current = exercises
  }, [exercises])

  // ── Carga inicial: primera página (paginada server-side) + grupos musculares del scope. ──
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const scope = await resolveCatalogScope()
      if (!mounted) return
      scopeRef.current = scope
      if (!scope) {
        setLoading(false)
        return
      }
      const [page, groups] = await Promise.all([
        fetchExercisePage({ scope, search: qParam, muscle: 'Todos', offset: 0 }),
        fetchScopeMuscleGroups(scope),
      ])
      if (!mounted) return
      setExercises(page.exercises)
      setHasMore(page.hasMore)
      setTotal(page.total)
      setMuscleGroups(groups)
      setLoading(false)
    })().catch(() => {
      if (mounted) setLoading(false)
    })
    return () => {
      mounted = false
    }
    // Solo al montar; `qParam` se sincroniza aparte (efecto de deep-link).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Deep-link `?q=` en caliente: cada arribo con un nuevo término lo siembra en la búsqueda. ──
  const lastQRef = useRef(qParam)
  useEffect(() => {
    if (qParam && qParam !== lastQRef.current) {
      lastQRef.current = qParam
      setSearch(qParam)
    }
  }, [qParam])

  // ── Refetch server-side al cambiar búsqueda (debounced) o músculo (offset 0, reemplaza lista). ──
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false
      return
    }
    const scope = scopeRef.current
    if (!scope) return
    const seq = ++reqSeq.current
    const timer = setTimeout(() => {
      setRefetching(true)
      fetchExercisePage({ scope, search, muscle: selectedMuscle, offset: 0 })
        .then((res) => {
          if (seq !== reqSeq.current) return // respuesta vieja
          setExercises(res.exercises)
          setHasMore(res.hasMore)
          setTotal(res.total)
        })
        .finally(() => {
          if (seq === reqSeq.current) setRefetching(false)
        })
    }, SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [search, selectedMuscle])

  const loadMore = useCallback(() => {
    const scope = scopeRef.current
    if (loadingMore || refetching || !hasMore || !scope) return
    const seq = reqSeq.current
    setLoadingMore(true)
    fetchExercisePage({
      scope,
      search,
      muscle: selectedMuscle,
      offset: exercisesRef.current.length,
    })
      .then((res) => {
        if (seq !== reqSeq.current) return // cambió el filtro mientras cargaba
        setExercises((prev) => [...prev, ...res.exercises])
        setHasMore(res.hasMore)
        setTotal(res.total)
      })
      .finally(() => setLoadingMore(false))
  }, [loadingMore, refetching, hasMore, search, selectedMuscle])

  const openExercise = useCallback((ex: CatalogExercise) => {
    setSelected(ex)
    setInstructions(null)
    setLoadingDetail(true)
    getExerciseInstructions(ex.id)
      .then((steps) => setInstructions(steps))
      .catch(() => setInstructions([]))
      .finally(() => setLoadingDetail(false))
  }, [])

  // ── Deep-link `?ex=<id>`: abre el sheet del ejercicio (de la lista o traído por id). ──
  const lastExRef = useRef('')
  useEffect(() => {
    if (!exParam || exParam === lastExRef.current) return
    lastExRef.current = exParam
    const inList = exercisesRef.current.find((e) => e.id === exParam)
    if (inList) {
      openExercise(inList)
      return
    }
    getCatalogExerciseById(exParam)
      .then((ex) => {
        if (ex) openExercise(ex)
      })
      .catch(() => {})
  }, [exParam, openExercise])

  const muscleChips = ['Todos', ...muscleGroups]

  // Ejercicio destacado: primero con media utilizable de la página cargada, solo en la vista por
  // defecto (sin búsqueda ni filtro) — espeja FeaturedExerciseCard de la web.
  const isDefaultView = !search.trim() && selectedMuscle === 'Todos'
  const featured = isDefaultView ? (exercises.find((e) => exerciseGridThumb(e)) ?? null) : null
  const remaining = Math.max(total - exercises.length, 0)

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]} testID="exercises-screen">
      <AppBackground />

      {/* Header branded — icono Dumbbell sport + "Aprender · Técnica de cada ejercicio" */}
      <View style={styles.header}>
        <View style={[styles.headerIcon, { backgroundColor: theme.primary + '1A', borderRadius: theme.radius.lg }]}>
          <Dumbbell size={22} color={theme.primary} strokeWidth={2.2} />
        </View>
        <View style={styles.headerText}>
          <Text style={[TYPE.h3, { color: theme.foreground, fontSize: 22, fontFamily: FONT.displayBlack }]} numberOfLines={1}>
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
          rightIconLabel="Limpiar búsqueda"
          placeholder="Buscar ejercicio…"
          value={search}
          onChangeText={setSearch}
          autoCapitalize="none"
        />
      </View>

      {muscleChips.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.muscleScroll}
        >
          {muscleChips.map((group) => {
            const isSelected = selectedMuscle === group
            return (
              <TouchableOpacity
                key={group}
                testID={`muscle-chip-${group}`}
                onPress={() => setSelectedMuscle(group)}
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
      ) : exercises.length === 0 ? (
        refetching ? (
          <View style={styles.centerPad}>
            <ActivityIndicator color={theme.primary} />
          </View>
        ) : (
          <EmptyState icon={BookOpen} title="Sin resultados" subtitle="Intenta con otra búsqueda o músculo." />
        )
      ) : (
        <FlatList
          data={exercises}
          keyExtractor={(e) => e.id}
          numColumns={2}
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onScroll={onScrollChrome}
          scrollEventThrottle={16}
          style={refetching ? styles.dimmed : undefined}
          ListHeaderComponent={
            featured ? (
              <View style={styles.featuredHeader}>
                <FeaturedCard exercise={featured} theme={theme} scheme={resolvedScheme} onPress={() => openExercise(featured)} />
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
              <ExerciseCard item={item} theme={theme} scheme={resolvedScheme} onOpen={openExercise} />
            </MotiView>
          )}
          ListFooterComponent={
            hasMore ? (
              // Paginación manual "Ver más" — sin autocarga por scroll (espeja la web: evita traer
              // GIFs de más). El contador de "restantes" viene del `count: 'exact'` de la página.
              <TouchableOpacity
                testID="exercises-load-more"
                onPress={loadMore}
                disabled={loadingMore || refetching}
                activeOpacity={0.85}
                style={[
                  styles.loadMore,
                  { backgroundColor: theme.card, borderColor: theme.border, opacity: loadingMore || refetching ? 0.6 : 1 },
                ]}
              >
                {loadingMore ? (
                  <ActivityIndicator size="small" color={theme.mutedForeground} />
                ) : (
                  <ChevronDown size={16} color={theme.foreground} />
                )}
                <Text style={[textStyle('sm', FONT.uiBold), { color: theme.foreground }]}>
                  {`Ver más${remaining > 0 ? ` (${remaining} restantes)` : ''}`}
                </Text>
              </TouchableOpacity>
            ) : null
          }
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
        {selected && (
          <ExerciseDetail exercise={selected} instructions={instructions} loading={loadingDetail} theme={theme} />
        )}
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
  exercise: CatalogExercise
  theme: any
  scheme: 'light' | 'dark'
  onPress: () => void
}) {
  const thumb = exerciseGridThumb(exercise, 640)
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
        <Text style={[TYPE.caption, { color: theme.mutedForeground, marginTop: 2 }]} numberOfLines={1}>
          {[exercise.muscle_group, exercise.equipment].filter(Boolean).join(' · ')}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

/** Card de grilla: banner + badge músculo + nombre + equipo.
 *  Memoizada: `onOpen` es estable (useCallback) → la grilla no re-renderiza ni recomputa el thumb
 *  cuando el screen re-renderiza por refetch/dim. La closure de press se arma adentro. */
const ExerciseCard = memo(function ExerciseCard({
  item,
  theme,
  scheme,
  onOpen,
}: {
  item: CatalogExercise
  theme: any
  scheme: 'light' | 'dark'
  onOpen: (ex: CatalogExercise) => void
}) {
  const thumb = exerciseGridThumb(item)
  return (
    <TouchableOpacity
      testID={`exercise-card-${item.id}`}
      style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }, SHADOWS[scheme].sm]}
      onPress={() => onOpen(item)}
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
        {item.equipment ? (
          <Text style={[textStyle('3xs', FONT.ui), { color: theme.mutedForeground, marginTop: 3 }]} numberOfLines={1}>
            {item.equipment}
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  )
})

/** Contenido del sheet: banner media (gif/video inline con recorte) + nombre + eyebrow + instrucciones on-demand. */
function ExerciseDetail({
  exercise,
  instructions,
  loading,
  theme,
}: {
  exercise: CatalogExercise
  instructions: string[] | null
  loading: boolean
  theme: any
}) {
  const steps = (instructions ?? [])
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
          <VideoPlayer
            url={exercise.video_url}
            start={exercise.video_start_time}
            end={exercise.video_end_time}
            autoPlay
            muted
            loop
            title={exercise.name}
          />
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
        {exercise.muscle_group || exercise.equipment ? (
          <Text style={[TYPE.eyebrow, { color: theme.primary, marginTop: 5 }]}>
            {[exercise.muscle_group, exercise.equipment].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.detailLoading}>
          <ActivityIndicator size="small" color={theme.primary} />
          <Text style={[textStyle('sm', FONT.ui), { color: theme.mutedForeground }]}>Cargando instrucciones…</Text>
        </View>
      ) : steps.length > 0 ? (
        <View style={styles.instructionsList}>
          {steps.map((line, i) => (
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
  headerIcon: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, minWidth: 0 },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 10 },
  muscleScroll: { paddingHorizontal: 16, gap: 8, paddingBottom: 12 },
  muscleChip: { borderWidth: 1.5, paddingHorizontal: 15, height: 34, justifyContent: 'center', borderRadius: 999 },
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  column: { gap: 12 },
  dimmed: { opacity: 0.6 },
  centerPad: { paddingVertical: 48, alignItems: 'center', justifyContent: 'center' },
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
  loadMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    borderWidth: 1.5,
    borderRadius: 14,
    marginTop: 4,
  },
  detail: { gap: 16, paddingTop: 4 },
  detailBanner: { marginHorizontal: -20 },
  detailGifWrap: { height: 200, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  detailGif: { width: '100%', height: 200 },
  detailFallback: { height: 200, alignItems: 'center', justifyContent: 'center' },
  detailFallbackPlay: { width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center' },
  detailLoading: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  instructionsList: { gap: 12 },
  instructionRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  instructionNum: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
})
