import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { FlashList } from '@shopify/flash-list'
import { Image } from 'expo-image'
import { BottomSheetModal } from '@gorhom/bottom-sheet'
import { ChevronRight, Dumbbell, Lock, Plus, Search, X } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../../context/ThemeContext'
import { ScreenHeader, Badge, EmptyState } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { ExerciseFormSheet } from '../../../components/coach/ExerciseFormSheet'
import { canCreateCustomExercises, listCoachExercises, type ExerciseRow } from '../../../lib/exercises'
import { getCoachProfile } from '../../../lib/coach'

const DIFFICULTY_LABEL: Record<string, string> = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzado',
}

export default function EjerciciosScreen() {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  const sheetRef = useRef<BottomSheetModal>(null)

  const [exercises, setExercises] = useState<ExerciseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [query, setQuery] = useState('')
  const [muscle, setMuscle] = useState<string | null>(null)
  const [canCreate, setCanCreate] = useState(true)
  const [editTarget, setEditTarget] = useState<ExerciseRow | null>(null)

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') setLoading(true)
    else setRefreshing(true)
    const [{ exercises: rows }, profile] = await Promise.all([listCoachExercises(), getCoachProfile()])
    setExercises(rows)
    setCanCreate(canCreateCustomExercises(profile?.subscriptionTier))
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => { load() }, [load])

  const muscleOptions = useMemo(() => {
    const set = new Set(exercises.map((e) => e.muscle_group).filter(Boolean))
    return Array.from(set).sort()
  }, [exercises])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return exercises.filter((e) => {
      if (muscle && e.muscle_group !== muscle) return false
      if (q && !e.name.toLowerCase().includes(q)) return false
      return true
    })
  }, [exercises, query, muscle])

  const customCount = useMemo(() => exercises.filter((e) => e.isOwn).length, [exercises])

  function openCreate() {
    if (!canCreate) {
      Alert.alert('Función Pro', 'Crear ejercicios personalizados requiere un plan de pago. Gestioná tu plan desde la web.')
      return
    }
    setEditTarget(null)
    sheetRef.current?.present()
  }

  function openEdit(row: ExerciseRow) {
    if (!row.isOwn) return // system exercises are read-only
    setEditTarget(row)
    sheetRef.current?.present()
  }

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
        <ScreenHeader title="Ejercicios" subtitle="Cargando..." />
        <EvaLoaderScreen subtitle="Cargando biblioteca…" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
      <ScreenHeader
        title="Ejercicios"
        subtitle={`${exercises.length} en biblioteca · ${customCount} propios`}
        trailing={
          <TouchableOpacity onPress={openCreate} activeOpacity={0.85}
            style={[styles.headerBtn, { backgroundColor: canCreate ? theme.primary : theme.muted }]}>
            {canCreate ? <Plus size={20} color={theme.primaryForeground} /> : <Lock size={16} color={theme.mutedForeground} />}
          </TouchableOpacity>
        }
      />

      {/* Search */}
      <View style={styles.searchWrap}>
        <View style={[styles.searchBar, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
          <Search size={16} color={theme.mutedForeground} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar ejercicio..."
            placeholderTextColor={theme.mutedForeground}
            style={[styles.searchInput, { color: theme.foreground, fontFamily: theme.fontSans }]}
            autoCapitalize="none"
          />
          {query.length > 0 ? (
            <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}>
              <X size={16} color={theme.mutedForeground} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Muscle filter */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        <FilterChip theme={theme} label="Todos" active={muscle === null} onPress={() => setMuscle(null)} />
        {muscleOptions.map((m) => (
          <FilterChip key={m} theme={theme} label={m} active={muscle === m} onPress={() => setMuscle(m)} />
        ))}
      </ScrollView>

      {/* List */}
      <View style={styles.listWrap}>
        <FlashList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ExerciseCard row={item} theme={theme} onPress={() => openEdit(item)} />}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: insets.bottom + 96 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={theme.primary} />}
          ListEmptyComponent={
            <View style={{ paddingTop: 48 }}>
              <EmptyState icon={Dumbbell} title="Sin ejercicios" subtitle={query || muscle ? 'Probá otro filtro o búsqueda.' : 'Creá tu primer ejercicio personalizado.'} />
            </View>
          }
        />
      </View>

      <ExerciseFormSheet ref={sheetRef} exercise={editTarget} onSaved={() => load('refresh')} onClose={() => setEditTarget(null)} />
    </SafeAreaView>
  )
}

function FilterChip({ theme, label, active, onPress }: { theme: any; label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}
      style={[styles.filterChip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary + '1A' : 'transparent' }]}>
      <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: active ? theme.primary : theme.mutedForeground }}>{label}</Text>
    </TouchableOpacity>
  )
}

function ExerciseCard({ row, theme, onPress }: { row: ExerciseRow; theme: any; onPress: () => void }) {
  const meta = [row.equipment, row.difficulty ? DIFFICULTY_LABEL[row.difficulty] ?? row.difficulty : null].filter(Boolean).join(' · ')
  return (
    <MotiView from={{ opacity: 0, translateY: 6 }} animate={{ opacity: 1, translateY: 0 }} transition={{ type: 'timing', duration: 240 }}>
      <TouchableOpacity activeOpacity={row.isOwn ? 0.8 : 1} onPress={onPress}
        style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
        <View style={[styles.thumb, { backgroundColor: theme.secondary, borderRadius: theme.radius.md }]}>
          {row.gif_url || row.image_url ? (
            <Image source={{ uri: row.gif_url ?? row.image_url ?? '' }} style={styles.thumbImg} contentFit="cover" transition={150} />
          ) : (
            <Dumbbell size={22} color={theme.mutedForeground} strokeWidth={1.6} />
          )}
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text numberOfLines={1} style={[styles.cardName, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{row.name}</Text>
          <Text numberOfLines={1} style={[styles.cardMuscle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            {row.muscle_group}{meta ? ` · ${meta}` : ''}
          </Text>
        </View>
        {row.isOwn ? <Badge label="Propio" tone="success" /> : null}
        {row.isOwn ? <ChevronRight size={18} color={theme.mutedForeground} /> : null}
      </TouchableOpacity>
    </MotiView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 10 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 46 },
  searchInput: { flex: 1, fontSize: 15 },
  filterRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 12 },
  filterChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  listWrap: { flex: 1 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1 },
  thumb: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbImg: { width: 52, height: 52 },
  cardName: { fontSize: 15 },
  cardMuscle: { fontSize: 12 },
})
