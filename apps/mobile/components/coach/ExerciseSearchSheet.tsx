import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import BottomSheet, { BottomSheetFlatList } from '@gorhom/bottom-sheet'
import { Image } from 'expo-image'
import { Activity, Clock, Dumbbell, Eye, Play, Plus, Search, X } from 'lucide-react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTheme } from '../../context/ThemeContext'
import { exerciseThumb, filterExercises, youtubeId, MUSCLE_GROUPS, type ExerciseRow } from '../../lib/exercises'
import { getMuscleColor } from '../../lib/muscle-colors'
import type { BuilderBlock } from '../../lib/plan-builder/types'

const RECENTS_KEY = 'builder_recent_exercises'

type Ex = Pick<ExerciseRow, 'id' | 'name' | 'muscle_group' | 'gif_url' | 'image_url' | 'video_url' | 'secondary_muscles' | 'body_part' | 'equipment'>

function hexToRgba(hex: string, a: number): string {
  const c = hex.replace('#', '')
  if (c.length !== 6) return `rgba(107,114,128,${a})`
  return `rgba(${parseInt(c.slice(0, 2), 16)},${parseInt(c.slice(2, 4), 16)},${parseInt(c.slice(4, 6), 16)},${a})`
}

interface Props {
  /** Catálogo completo precargado (1:1 web). */
  exercises: ExerciseRow[]
  /** Nº de ejercicios del día activo (para el label colapsado). */
  dayBlockCount: number
  dayName: string
  /** En modo Simple el sheet vive cerrado y se abre con el FAB verde. */
  simpleMode: boolean
  onSelect: (block: BuilderBlock) => void
}

/** Catálogo persistente jalable 1:1 web (handle colapsado → buscador+chips → catálogo completo).
 *  Lista completa por defecto + filtro en memoria + miniaturas (gif/imagen/YouTube) + preview. */
export const ExerciseSearchSheet = forwardRef<BottomSheet, Props>(
  function ExerciseSearchSheet({ exercises, dayBlockCount, dayName, simpleMode, onSelect }, ref) {
    const { theme } = useTheme()
    const localRef = useRef<BottomSheet | null>(null)
    const [query, setQuery] = useState('')
    const [muscle, setMuscle] = useState('Todos')
    const [index, setIndex] = useState(simpleMode ? -1 : 0)
    const [recents, setRecents] = useState<Ex[]>([])
    const [preview, setPreview] = useState<Ex | null>(null)
    const snapPoints = useMemo(() => ['12%', '42%', '85%'], [])

    const setRefs = useCallback((r: BottomSheet | null) => {
      localRef.current = r
      if (typeof ref === 'function') ref(r)
      else if (ref) (ref as React.MutableRefObject<BottomSheet | null>).current = r
    }, [ref])

    useEffect(() => {
      AsyncStorage.getItem(RECENTS_KEY).then((raw) => {
        if (!raw) return
        try { setRecents(JSON.parse(raw) as Ex[]) } catch {}
      }).catch(() => {})
    }, [])

    function pushRecent(ex: Ex) {
      const next = [ex, ...recents.filter((r) => r.id !== ex.id)].slice(0, 8)
      setRecents(next)
      AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next)).catch(() => {})
    }

    const filtered = useMemo(() => filterExercises(exercises, query, muscle), [exercises, query, muscle])
    const showRecents = query.trim() === '' && muscle === 'Todos' && recents.length > 0

    function handleSelect(ex: Ex) {
      pushRecent(ex)
      onSelect({
        uid: `block-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        exercise_id: ex.id,
        exercise_name: ex.name,
        muscle_group: ex.muscle_group ?? 'General',
        gif_url: ex.gif_url ?? undefined,
        video_url: ex.video_url ?? undefined,
        sets: 3,
        reps: '8-10',
        rest_time: '60s',
        section: 'main',
        superset_group: null,
        is_override: false,
      })
      localRef.current?.snapToIndex(0)
    }

    function renderItem({ item: ex }: { item: Ex }) {
      const color = getMuscleColor(ex.muscle_group)
      const thumb = exerciseThumb(ex)
      return (
        <TouchableOpacity style={[styles.row, { borderColor: theme.border, backgroundColor: theme.card }]} onPress={() => handleSelect(ex)} activeOpacity={0.8}>
          <View style={[styles.thumb, { backgroundColor: hexToRgba(color, 0.15) }]}>
            {thumb ? <Image source={{ uri: thumb }} style={styles.thumbImg} contentFit="cover" transition={120} /> : <Activity size={18} color={color} />}
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Text numberOfLines={1} style={[styles.exName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{ex.name}</Text>
            <View style={styles.exMuscleRow}>
              <View style={[styles.mDot, { backgroundColor: color }]} />
              <Text numberOfLines={1} style={[styles.exMuscle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{ex.muscle_group ?? ''}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => setPreview(ex)} hitSlop={8} style={styles.eyeBtn}><Eye size={16} color={theme.mutedForeground} /></TouchableOpacity>
          <View style={[styles.addBtn, { backgroundColor: theme.primary }]}><Plus size={16} color={theme.primaryForeground} /></View>
        </TouchableOpacity>
      )
    }

    const pthumb = preview ? exerciseThumb(preview) : null
    const pyt = preview ? youtubeId(preview.video_url) : null
    const pIsYt = !!preview && !preview.gif_url && !preview.image_url && !!pyt

    // Handle custom: grabber + (colapsado) label "Añadir ejercicio · N en {día}".
    const renderHandle = () => (
      <Pressable onPress={() => localRef.current?.snapToIndex(2)} style={styles.handle}>
        <View style={[styles.grabber, { backgroundColor: theme.mutedForeground }]} />
        {index <= 0 ? (
          <View style={styles.collapsedRow}>
            <Plus size={15} color={theme.primary} />
            <Text style={[styles.collapsedText, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Añadir ejercicio</Text>
            <Text style={[styles.collapsedHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>· {dayBlockCount} en {dayName}</Text>
          </View>
        ) : null}
      </Pressable>
    )

    return (
      <BottomSheet
        ref={setRefs}
        index={simpleMode ? -1 : 0}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose={simpleMode}
        onChange={setIndex}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        handleComponent={renderHandle}
        backgroundStyle={{ backgroundColor: theme.card, borderTopWidth: 1, borderColor: theme.border }}
        style={styles.sheetShadow}
      >
        <BottomSheetFlatList
          data={filtered}
          keyExtractor={(ex) => ex.id}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View style={{ gap: 10 }}>
              <View style={styles.headerRow}>
                <Activity size={16} color={theme.primary} />
                <Text style={[styles.headerTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Catálogo de Ejercicios</Text>
              </View>
              <View style={[styles.searchBar, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
                <Search size={16} color={theme.mutedForeground} />
                <TextInput value={query} onChangeText={setQuery} placeholder="Buscar por nombre..." placeholderTextColor={theme.mutedForeground}
                  style={[styles.searchInput, { color: theme.foreground, fontFamily: theme.fontSans }]} />
                {query.length ? <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}><X size={15} color={theme.mutedForeground} /></TouchableOpacity> : null}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} style={{ maxHeight: 42 }}>
                {['Todos', ...MUSCLE_GROUPS].map((m) => {
                  const on = muscle === m
                  return (
                    <TouchableOpacity key={m} onPress={() => setMuscle(m)} activeOpacity={0.8}
                      style={[styles.chip, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary + '1A' : 'transparent' }]}>
                      <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: on ? theme.primary : theme.mutedForeground }}>{m}</Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
              {showRecents ? (
                <>
                  <View style={styles.recentHead}>
                    <Clock size={13} color={theme.mutedForeground} />
                    <Text style={[styles.recentLabel, { color: theme.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>Usados recientemente</Text>
                  </View>
                  {recents.map((ex) => <View key={`r-${ex.id}`}>{renderItem({ item: ex })}</View>)}
                  <Text style={[styles.recentLabel, { color: theme.mutedForeground, fontFamily: 'Inter_600SemiBold', marginTop: 4 }]}>Todos los ejercicios</Text>
                </>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <Text style={[styles.empty, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Sin resultados</Text>
          }
        />

        {/* Preview */}
        <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
          <Pressable style={styles.pvBackdrop} onPress={() => setPreview(null)}>
            <Pressable style={[styles.pvCard, { backgroundColor: theme.card, borderColor: theme.border }]} onPress={() => {}}>
              <View style={styles.pvHead}>
                <Text style={[styles.pvTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={2}>{preview?.name}</Text>
                <TouchableOpacity onPress={() => setPreview(null)} hitSlop={8}><X size={20} color={theme.mutedForeground} /></TouchableOpacity>
              </View>
              <Text style={[styles.pvMuscle, { color: theme.primary, fontFamily: 'Inter_700Bold' }]}>{preview?.muscle_group}</Text>
              <View style={[styles.pvMedia, { backgroundColor: theme.secondary }]}>
                {pthumb ? <Image source={{ uri: pthumb }} style={styles.pvImg} contentFit={pIsYt ? 'cover' : 'contain'} transition={150} /> : <Dumbbell size={40} color={theme.mutedForeground} />}
                {pIsYt ? <View style={styles.pvPlay} pointerEvents="none"><Play size={20} color="#fff" fill="#fff" /></View> : null}
              </View>
              {pIsYt ? (
                <TouchableOpacity onPress={() => preview?.video_url && Linking.openURL(preview.video_url)} style={[styles.pvYt, { borderColor: theme.border }]}>
                  <Play size={14} color={theme.primary} fill={theme.primary} />
                  <Text style={[styles.pvYtTxt, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Ver en YouTube</Text>
                </TouchableOpacity>
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>
      </BottomSheet>
    )
  }
)

const styles = StyleSheet.create({
  sheetShadow: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 16 },
  handle: { paddingTop: 8, paddingBottom: 6, alignItems: 'center', gap: 6 },
  grabber: { width: 38, height: 4, borderRadius: 2, opacity: 0.4 },
  collapsedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 2 },
  collapsedText: { fontSize: 13 },
  collapsedHint: { fontSize: 12 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 15 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, fontSize: 15 },
  filterRow: { gap: 7, paddingBottom: 2, paddingRight: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 13, height: 34, justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingBottom: 40, gap: 8 },
  recentHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2 },
  recentLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
  empty: { textAlign: 'center', fontSize: 14, marginTop: 24 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 9, borderWidth: 1, borderRadius: 12 },
  thumb: { width: 40, height: 40, borderRadius: 9, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  thumbImg: { width: 40, height: 40 },
  exName: { fontSize: 14 },
  exMuscleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mDot: { width: 8, height: 8, borderRadius: 4 },
  exMuscle: { fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.3, flex: 1 },
  eyeBtn: { padding: 6 },
  addBtn: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  pvBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  pvCard: { width: '100%', maxWidth: 420, borderWidth: 1, borderRadius: 18, padding: 16, gap: 8 },
  pvHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  pvTitle: { fontSize: 17, flex: 1 },
  pvMuscle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginTop: -4 },
  pvMedia: { width: '100%', height: 200, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  pvImg: { width: '100%', height: '100%' },
  pvPlay: { position: 'absolute', width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  pvYt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingVertical: 11, marginTop: 4 },
  pvYtTxt: { fontSize: 14 },
})
