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
import { AppBackground } from '../../../components/AppBackground'
import { ExerciseFormSheet } from '../../../components/coach/ExerciseFormSheet'
import { ExercisePreviewSheet } from '../../../components/coach/ExercisePreviewSheet'
import { canCreateCustomExercises, cloneExercise, exerciseThumb, filterExercises, listCoachExercises, MUSCLE_GROUPS, type ExerciseRow } from '../../../lib/exercises'
import { getCoachProfile } from '../../../lib/coach'

const DIFFICULTY_LABEL: Record<string, string> = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzado',
}

type Source = 'all' | 'system' | 'own'
const MUSCLE_ORDER = [...(MUSCLE_GROUPS as readonly string[])]

type ListItem = { type: 'header'; muscle: string; count: number } | { type: 'row'; row: ExerciseRow }

export default function EjerciciosScreen() {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()
  const formRef = useRef<BottomSheetModal>(null)
  const previewRef = useRef<BottomSheetModal>(null)

  const [exercises, setExercises] = useState<ExerciseRow[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [query, setQuery] = useState('')
  const [muscle, setMuscle] = useState<string | null>(null)
  const [source, setSource] = useState<Source>('all')
  const [canCreate, setCanCreate] = useState(true)
  const [editTarget, setEditTarget] = useState<ExerciseRow | null>(null)
  const [previewTarget, setPreviewTarget] = useState<ExerciseRow | null>(null)

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') setLoading(true)
    else setRefreshing(true)
    try {
      const [{ exercises: rows }, profile] = await Promise.all([listCoachExercises(), getCoachProfile()])
      setExercises(rows)
      setCanCreate(canCreateCustomExercises(profile?.subscriptionTier))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const customCount = useMemo(() => exercises.filter((e) => e.isOwn).length, [exercises])
  const systemCount = exercises.length - customCount

  // Chips de músculo ordenados como en la web (orden anatómico + extras al final).
  const muscleOptions = useMemo(() => {
    const set = new Set(exercises.map((e) => e.muscle_group).filter(Boolean) as string[])
    return Array.from(set).sort((a, b) => orderRank(a) - orderRank(b) || a.localeCompare(b))
  }, [exercises])

  const filtered = useMemo(() => {
    // E-F3: búsqueda amplia normalizada (nombre+músculo+body_part+equipo+secundarios) vía filterExercises.
    const bySource = exercises.filter((e) => {
      if (source === 'system' && e.isOwn) return false
      if (source === 'own' && !e.isOwn) return false
      return true
    })
    return filterExercises(bySource, query.trim(), muscle || 'todos')
  }, [exercises, query, muscle, source])

  // Agrupado por músculo (header + filas) para el FlashList.
  const listData = useMemo<ListItem[]>(() => {
    const byMuscle = new Map<string, ExerciseRow[]>()
    for (const e of filtered) {
      const k = e.muscle_group || 'Otros'
      const arr = byMuscle.get(k)
      if (arr) arr.push(e)
      else byMuscle.set(k, [e])
    }
    const keys = Array.from(byMuscle.keys()).sort((a, b) => orderRank(a) - orderRank(b) || a.localeCompare(b))
    const out: ListItem[] = []
    for (const k of keys) {
      const rows = byMuscle.get(k)!
      out.push({ type: 'header', muscle: k, count: rows.length })
      for (const r of rows) out.push({ type: 'row', row: r })
    }
    return out
  }, [filtered])

  function openCreate() {
    if (!canCreate) {
      Alert.alert('Función Pro', 'Crear ejercicios personalizados requiere un plan de pago. Gestioná tu plan desde la web.')
      return
    }
    setEditTarget(null)
    formRef.current?.present()
  }

  function openPreview(row: ExerciseRow) {
    setPreviewTarget(row)
    previewRef.current?.present()
  }

  function openEditFromPreview(row: ExerciseRow) {
    previewRef.current?.dismiss()
    setEditTarget(row)
    // Pequeño delay para no encimar dos modales (dismiss → present).
    setTimeout(() => formRef.current?.present(), 280)
  }

  // E-F8: duplicar un ejercicio del sistema a uno propio editable.
  async function handleCloneFromPreview(row: ExerciseRow) {
    if (!canCreate) {
      Alert.alert('Función Pro', 'Duplicar ejercicios a tu biblioteca requiere un plan de pago.')
      return
    }
    previewRef.current?.dismiss()
    const r = await cloneExercise(row)
    if (!r.ok) { Alert.alert('No se pudo duplicar', r.error ?? 'Intenta nuevamente.'); return }
    Alert.alert('Ejercicio duplicado', 'Se copió a tus ejercicios. Ahora podés editarlo.')
    load('refresh')
  }

  if (loading) {
    return (
      <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: theme.background }]}>
        <EvaLoaderScreen subtitle="Cargando biblioteca…" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: theme.background }]}>
      <AppBackground />
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

      {/* Pestañas de origen */}
      <View style={styles.tabsWrap}>
        <View style={[styles.tabs, { backgroundColor: theme.secondary, borderColor: theme.border }]}>
          <SourceTab theme={theme} label="Todos" count={exercises.length} active={source === 'all'} onPress={() => setSource('all')} />
          <SourceTab theme={theme} label="Sistema EVA" count={systemCount} active={source === 'system'} onPress={() => setSource('system')} />
          <SourceTab theme={theme} label="Míos" count={customCount} active={source === 'own'} onPress={() => setSource('own')} />
        </View>
      </View>

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

      {/* List (agrupada por músculo) */}
      <MotiView
        key={`${source}|${muscle ?? 'all'}`}
        from={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ type: 'timing', duration: 220 }}
        style={styles.listWrap}
      >
        <FlashList
          data={listData}
          keyExtractor={(item) => (item.type === 'header' ? `h-${item.muscle}` : item.row.id)}
          getItemType={(item) => item.type}
          renderItem={({ item }) =>
            item.type === 'header' ? (
              <GroupHeader theme={theme} muscle={item.muscle} count={item.count} />
            ) : (
              <ExerciseCard row={item.row} theme={theme} onPress={() => openPreview(item.row)} />
            )
          }
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: insets.bottom + 96 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={theme.primary} />}
          ListEmptyComponent={
            <View style={{ paddingTop: 48 }}>
              <EmptyState icon={Dumbbell} title="Sin ejercicios" subtitle={query || muscle || source !== 'all' ? 'Probá otro filtro o búsqueda.' : 'Creá tu primer ejercicio personalizado.'} />
            </View>
          }
        />
      </MotiView>

      <ExercisePreviewSheet
        ref={previewRef}
        exercise={previewTarget}
        onEdit={openEditFromPreview}
        onClone={handleCloneFromPreview}
        onClose={() => setPreviewTarget(null)}
      />
      <ExerciseFormSheet ref={formRef} exercise={editTarget} onSaved={() => load('refresh')} onClose={() => setEditTarget(null)} />
    </SafeAreaView>
  )
}

function orderRank(m: string): number {
  const i = MUSCLE_ORDER.indexOf(m)
  return i === -1 ? 999 : i
}

function SourceTab({ theme, label, count, active, onPress }: { theme: any; label: string; count: number; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={[styles.tab, active && { backgroundColor: theme.primary }]}>
      <Text numberOfLines={1} style={{ fontSize: 12.5, fontFamily: 'Inter_600SemiBold', color: active ? theme.primaryForeground : theme.mutedForeground }}>
        {label} {count}
      </Text>
    </TouchableOpacity>
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

function GroupHeader({ theme, muscle, count }: { theme: any; muscle: string; count: number }) {
  return (
    <View style={styles.groupHeader}>
      <View style={[styles.dot, { backgroundColor: theme.primary }]} />
      <Text style={[styles.groupTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{muscle.toUpperCase()}</Text>
      <View style={[styles.countBadge, { borderColor: theme.border }]}>
        <Text style={[styles.countText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{count}</Text>
      </View>
    </View>
  )
}

function ExerciseCard({ row, theme, onPress }: { row: ExerciseRow; theme: any; onPress: () => void }) {
  const meta = [row.equipment, row.difficulty ? DIFFICULTY_LABEL[row.difficulty] ?? row.difficulty : null].filter(Boolean).join(' · ')
  const thumb = exerciseThumb(row)
  return (
    <TouchableOpacity activeOpacity={0.82} onPress={onPress}
      style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
      <View style={[styles.thumb, { backgroundColor: theme.secondary, borderRadius: theme.radius.md }]}>
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.thumbImg} contentFit="cover" transition={150} />
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
      <ChevronRight size={18} color={theme.mutedForeground} />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerBtn: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tabsWrap: { paddingHorizontal: 16, paddingBottom: 10 },
  tabs: { flexDirection: 'row', borderWidth: 1, borderRadius: 12, padding: 3, gap: 3 },
  tab: { flex: 1, paddingVertical: 9, alignItems: 'center', justifyContent: 'center', borderRadius: 9 },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 10 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 46 },
  searchInput: { flex: 1, fontSize: 15 },
  filterRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 12 },
  filterChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  listWrap: { flex: 1 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 14, paddingBottom: 8, paddingHorizontal: 2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  groupTitle: { fontSize: 12, letterSpacing: 0.6 },
  countBadge: { marginLeft: 'auto', borderWidth: 1, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 },
  countText: { fontSize: 11 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1 },
  thumb: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  thumbImg: { width: 52, height: 52 },
  cardName: { fontSize: 15 },
  cardMuscle: { fontSize: 12 },
})
