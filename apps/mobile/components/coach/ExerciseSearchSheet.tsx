import { forwardRef, useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { Image } from 'expo-image'
import { Activity, Clock, Dumbbell, Eye, Play, Plus, Search, X } from 'lucide-react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'
import { exerciseThumb, youtubeId, MUSCLE_GROUPS } from '../../lib/exercises'
import { getMuscleColor } from '../../lib/muscle-colors'
import type { BuilderBlock } from '../../lib/plan-builder/types'

const RECENTS_KEY = 'builder_recent_exercises'

interface Exercise {
  id: string
  name: string
  muscle_group: string | null
  gif_url: string | null
  image_url: string | null
  video_url: string | null
}

function hexToRgba(hex: string, a: number): string {
  const c = hex.replace('#', '')
  if (c.length !== 6) return `rgba(107,114,128,${a})`
  return `rgba(${parseInt(c.slice(0, 2), 16)},${parseInt(c.slice(2, 4), 16)},${parseInt(c.slice(4, 6), 16)},${a})`
}

interface ExerciseSearchSheetProps {
  onSelect: (block: BuilderBlock) => void
}

/** Catálogo 1:1 con la web (DraggableExerciseCatalog): buscador + filtro por músculo +
 *  recientes + miniaturas (gif/imagen/YouTube) tintadas por músculo + preview. */
export const ExerciseSearchSheet = forwardRef<BottomSheetModal, ExerciseSearchSheetProps>(
  function ExerciseSearchSheet({ onSelect }, ref) {
    const { theme } = useTheme()
    const [query, setQuery] = useState('')
    const [muscle, setMuscle] = useState('Todos')
    const [results, setResults] = useState<Exercise[]>([])
    const [loading, setLoading] = useState(false)
    const [recents, setRecents] = useState<Exercise[]>([])
    const [preview, setPreview] = useState<Exercise | null>(null)
    const snapPoints = useMemo(() => ['75%', '95%'], [])

    useEffect(() => {
      AsyncStorage.getItem(RECENTS_KEY).then((raw) => {
        if (!raw) return
        try { setRecents(JSON.parse(raw) as Exercise[]) } catch {}
      }).catch(() => {})
    }, [])

    function pushRecent(ex: Exercise) {
      const next = [ex, ...recents.filter((r) => r.id !== ex.id)].slice(0, 8)
      setRecents(next)
      AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next)).catch(() => {})
    }

    const run = useCallback(async (text: string, m: string) => {
      if (text.trim().length < 2 && m === 'Todos') { setResults([]); return }
      setLoading(true)
      let q = supabase.from('exercises').select('id, name, muscle_group, gif_url, image_url, video_url').order('name').limit(60)
      if (text.trim().length >= 2) q = q.ilike('name', `%${text.trim()}%`)
      if (m !== 'Todos') q = q.eq('muscle_group', m)
      const { data } = await q
      setResults((data as Exercise[]) ?? [])
      setLoading(false)
    }, [])

    function onQuery(text: string) { setQuery(text); run(text, muscle) }
    function onMuscle(m: string) { setMuscle(m); run(query, m) }

    function handleSelect(exercise: Exercise) {
      pushRecent(exercise)
      onSelect({
        uid: `block-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        exercise_id: exercise.id,
        exercise_name: exercise.name,
        muscle_group: exercise.muscle_group ?? 'General',
        gif_url: exercise.gif_url ?? undefined,
        video_url: exercise.video_url ?? undefined,
        sets: 3,
        reps: '8-10',
        rest_time: '60s',
        section: 'main',
        superset_group: null,
        is_override: false,
      })
      setQuery('')
      setResults([])
      ;(ref as React.RefObject<BottomSheetModal>).current?.dismiss()
    }

    function renderItem(ex: Exercise, key: string) {
      const color = getMuscleColor(ex.muscle_group)
      const thumb = exerciseThumb(ex)
      return (
        <TouchableOpacity key={key} style={[styles.row, { borderColor: theme.border, backgroundColor: theme.card }]} onPress={() => handleSelect(ex)} activeOpacity={0.8}>
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

    const showRecents = query.trim().length < 2 && muscle === 'Todos' && recents.length > 0
    const pthumb = preview ? exerciseThumb(preview) : null
    const pyt = preview ? youtubeId(preview.video_url) : null
    const pIsYt = !!preview && !preview.gif_url && !preview.image_url && !!pyt

    return (
      <BottomSheetModal
        ref={ref}
        index={0}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: theme.card }}
        handleIndicatorStyle={{ backgroundColor: theme.mutedForeground }}
      >
        <View style={styles.headerRow}>
          <Activity size={16} color={theme.primary} />
          <Text style={[styles.headerTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Catálogo de Ejercicios</Text>
        </View>

        <View style={[styles.searchBar, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
          <Search size={16} color={theme.mutedForeground} />
          <TextInput value={query} onChangeText={onQuery} placeholder="Buscar por nombre..." placeholderTextColor={theme.mutedForeground}
            style={[styles.searchInput, { color: theme.foreground, fontFamily: theme.fontSans }]} autoFocus />
          {loading && <ActivityIndicator size="small" color={theme.primary} />}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} style={{ maxHeight: 44 }}>
          {['Todos', ...MUSCLE_GROUPS].map((m) => {
            const on = muscle === m
            return (
              <TouchableOpacity key={m} onPress={() => onMuscle(m)} activeOpacity={0.8}
                style={[styles.chip, { borderColor: on ? theme.primary : theme.border, backgroundColor: on ? theme.primary + '1A' : 'transparent' }]}>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: on ? theme.primary : theme.mutedForeground }}>{m}</Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        <BottomSheetScrollView contentContainerStyle={styles.list}>
          {showRecents ? (
            <>
              <View style={styles.recentHead}>
                <Clock size={13} color={theme.mutedForeground} />
                <Text style={[styles.recentLabel, { color: theme.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>Usados recientemente</Text>
              </View>
              {recents.map((ex) => renderItem(ex, `r-${ex.id}`))}
            </>
          ) : null}
          {results.length === 0 && (query.length >= 2 || muscle !== 'Todos') && !loading ? (
            <Text style={[styles.empty, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Sin resultados</Text>
          ) : null}
          {results.map((ex) => renderItem(ex, ex.id))}
        </BottomSheetScrollView>

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
      </BottomSheetModal>
    )
  }
)

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  headerTitle: { fontSize: 15 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, marginHorizontal: 16, marginBottom: 10, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, fontSize: 15 },
  filterRow: { paddingHorizontal: 16, gap: 7, paddingBottom: 6 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 7, height: 34, justifyContent: 'center' },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },
  recentHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 2, paddingHorizontal: 2 },
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
