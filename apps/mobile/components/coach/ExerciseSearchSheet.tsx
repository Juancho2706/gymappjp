import { forwardRef, useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { Search } from 'lucide-react-native'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'
import type { ExerciseBlock } from './ExerciseSetRow'

interface Exercise {
  id: string
  name: string
  muscle_group: string | null
}

interface ExerciseSearchSheetProps {
  onSelect: (exercise: ExerciseBlock) => void
}

export const ExerciseSearchSheet = forwardRef<BottomSheetModal, ExerciseSearchSheetProps>(
  function ExerciseSearchSheet({ onSelect }, ref) {
    const { theme } = useTheme()
    const [query, setQuery] = useState('')
    const [results, setResults] = useState<Exercise[]>([])
    const [loading, setLoading] = useState(false)
    const snapPoints = useMemo(() => ['75%', '95%'], [])

    const search = useCallback(async (text: string) => {
      setQuery(text)
      if (text.trim().length < 2) { setResults([]); return }
      setLoading(true)
      const { data } = await supabase
        .from('exercises')
        .select('id, name, muscle_group')
        .ilike('name', `%${text.trim()}%`)
        .order('name')
        .limit(40)
      setResults(data ?? [])
      setLoading(false)
    }, [])

    function handleSelect(exercise: Exercise) {
      onSelect({
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        muscleGroup: exercise.muscle_group ?? 'General',
        sets: '3',
        reps: '8-10',
        restTime: '60s',
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
