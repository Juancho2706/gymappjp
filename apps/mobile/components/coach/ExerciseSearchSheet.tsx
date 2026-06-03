import { forwardRef, useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { Clock, Search } from 'lucide-react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../../lib/supabase'

const RECENTS_KEY = 'builder_recent_exercises'
import { useTheme } from '../../context/ThemeContext'
import type { BuilderBlock } from '../../lib/plan-builder/types'

interface Exercise {
  id: string
  name: string
  muscle_group: string | null
  gif_url: string | null
  video_url: string | null
}

interface ExerciseSearchSheetProps {
  onSelect: (block: BuilderBlock) => void
}

export const ExerciseSearchSheet = forwardRef<BottomSheetModal, ExerciseSearchSheetProps>(
  function ExerciseSearchSheet({ onSelect }, ref) {
    const { theme } = useTheme()
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<Exercise[]>([])
    const [loading, setLoading] = useState(false)
    const [recents, setRecents] = useState<Exercise[]>([])
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

    const search = useCallback(async (text: string) => {
      setQuery(text)
      if (text.trim().length < 2) { setResults([]); return }
      setLoading(true)
      const { data } = await supabase
        .from('exercises')
        .select('id, name, muscle_group, gif_url, video_url')
        .ilike('name', `%${text.trim()}%`)
        .order('name')
        .limit(40)
      setResults((data as Exercise[]) ?? [])
      setLoading(false)
    }, [])

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

    return (
      <BottomSheetModal
        ref={ref}
        index={0}
        snapPoints={snapPoints}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: theme.card }}
        handleIndicatorStyle={{ backgroundColor: theme.mutedForeground }}
      >
        <View style={[styles.searchBar, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
          <Search size={16} color={theme.mutedForeground} />
          <TextInput
            value={query}
            onChangeText={search}
            placeholder="Buscar ejercicio..."
            placeholderTextColor={theme.mutedForeground}
            style={[styles.searchInput, { color: theme.foreground, fontFamily: theme.fontSans }]}
            autoFocus
          />
          {loading && <ActivityIndicator size="small" color={theme.primary} />}
        </View>

        <BottomSheetScrollView contentContainerStyle={styles.list}>
          {query.trim().length < 2 && recents.length > 0 ? (
            <>
              <View style={styles.recentHead}>
                <Clock size={13} color={theme.mutedForeground} />
                <Text style={[styles.recentLabel, { color: theme.mutedForeground, fontFamily: 'Inter_600SemiBold' }]}>Recientes</Text>
              </View>
              {recents.map((ex) => (
                <TouchableOpacity key={`r-${ex.id}`} style={[styles.row, { borderColor: theme.border }]} onPress={() => handleSelect(ex)} activeOpacity={0.7}>
                  <View>
                    <Text style={[styles.exName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{ex.name}</Text>
                    {ex.muscle_group ? <Text style={[styles.exMuscle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{ex.muscle_group}</Text> : null}
                  </View>
                </TouchableOpacity>
              ))}
            </>
          ) : null}
          {results.length === 0 && query.length >= 2 && !loading ? (
            <Text style={[styles.empty, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              Sin resultados para "{query}"
            </Text>
          ) : null}
          {results.map((ex) => (
            <TouchableOpacity
              key={ex.id}
              style={[styles.row, { borderColor: theme.border }]}
              onPress={() => handleSelect(ex)}
              activeOpacity={0.7}
            >
              <View>
                <Text style={[styles.exName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
                  {ex.name}
                </Text>
                {ex.muscle_group ? (
                  <Text style={[styles.exMuscle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                    {ex.muscle_group}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          ))}
        </BottomSheetScrollView>
      </BottomSheetModal>
    )
  }
)

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 15 },
  list: { paddingHorizontal: 16, paddingBottom: 24, gap: 6 },
  recentHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 2 },
  recentLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
  empty: { textAlign: 'center', fontSize: 14, marginTop: 24 },
  row: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 10,
    gap: 3,
  },
  exName: { fontSize: 14 },
  exMuscle: { fontSize: 12 },
})
