import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import type { ViewStyle } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { FlashList } from '@shopify/flash-list'
import { Image } from 'expo-image'
import { BottomSheetModal } from '@gorhom/bottom-sheet'
import { ChevronRight, Dumbbell, Lock, Plus, Search, Video, X } from 'lucide-react-native'
import { MotiView } from 'moti'
import { useTheme } from '../../../context/ThemeContext'
import { ScreenHeader, Badge, EmptyState, Card, Input } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { toast } from '../../../components/Toast'
import { ExerciseFormSheet } from '../../../components/coach/ExerciseFormSheet'
import { ExercisePreviewSheet } from '../../../components/coach/ExercisePreviewSheet'
import { resolveCanCreateExercises, cloneExercise, exerciseThumb, filterExercises, listCoachExercises, MUSCLE_GROUPS, youtubeId, type ExerciseRow } from '../../../lib/exercises'

const DIFFICULTY_LABEL: Record<string, string> = {
  beginner: 'Principiante',
  intermediate: 'Intermedio',
  advanced: 'Avanzado',
}

// DS --shadow-sm (cool-tinted rgba 13 18 28) — lift for the active stat-tab pill.
const SHADOW_SM: ViewStyle = {
  shadowColor: '#0D121C',
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.05,
  shadowRadius: 2,
  elevation: 1,
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
  const [videoOnly, setVideoOnly] = useState(false)
  const [canCreate, setCanCreate] = useState(true)
  const [editTarget, setEditTarget] = useState<ExerciseRow | null>(null)
  const [previewTarget, setPreviewTarget] = useState<ExerciseRow | null>(null)

  const load = useCallback(async (mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'initial') setLoading(true)
    else setRefreshing(true)
    try {
      const [{ exercises: rows }, allowed] = await Promise.all([listCoachExercises(), resolveCanCreateExercises()])
      setExercises(rows)
      setCanCreate(allowed)
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
      // "Con video" = enlace de YouTube válido (no gif de ExerciseDB), 1:1 web.
      if (videoOnly && !youtubeId(e.video_url)) return false
      return true
    })
    return filterExercises(bySource, query.trim(), muscle || 'todos')
  }, [exercises, query, muscle, source, videoOnly])

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
      Alert.alert('Sin permiso', 'Tu rol en la organización no permite crear ejercicios. Pedí acceso a un administrador.')
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
      Alert.alert('Sin permiso', 'Tu rol en la organización no permite duplicar ejercicios.')
      return
    }
    previewRef.current?.dismiss()
    const r = await cloneExercise(row)
    if (!r.ok) { toast.error(r.error ?? 'No se pudo duplicar. Intenta nuevamente.'); return }
    toast.success('Ejercicio duplicado. Se copió a tus ejercicios.')
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
          <TouchableOpacity
            onPress={openCreate}
            activeOpacity={0.85}
            className={`items-center justify-center rounded-control ${canCreate ? 'bg-sport-500' : 'bg-surface-sunken'}`}
            style={styles.headerBtn}
          >
            {canCreate ? <Plus size={20} color={theme.primaryForeground} /> : <Lock size={16} color={theme.mutedForeground} />}
          </TouchableOpacity>
        }
      />

      {/* Pestañas de origen (segmented stat: número + etiqueta) */}
      <View style={styles.tabsWrap}>
        <View className="flex-row bg-surface-sunken rounded-control" style={styles.tabs}>
          <SourceTab label="Todos" count={exercises.length} active={source === 'all'} onPress={() => setSource('all')} />
          <SourceTab label="Sistema EVA" count={systemCount} active={source === 'system'} onPress={() => setSource('system')} />
          <SourceTab label="Míos" count={customCount} active={source === 'own'} onPress={() => setSource('own')} />
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <Input
          leftIcon={Search}
          rightIcon={query.length > 0 ? X : undefined}
          onRightIconPress={() => setQuery('')}
          value={query}
          onChangeText={setQuery}
          placeholder="Buscar ejercicio..."
          autoCapitalize="none"
          returnKeyType="search"
        />
      </View>

      {/* Muscle filter + toggle "Con video" (1:1 web ExerciseCatalogClient) */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        <TouchableOpacity
          testID="filter-con-video"
          onPress={() => setVideoOnly((v) => !v)}
          activeOpacity={0.8}
          className={`flex-row items-center rounded-pill ${videoOnly ? 'bg-sport-500' : 'bg-surface-card border border-default'}`}
          style={styles.videoChip}
        >
          <Video size={14} color={videoOnly ? theme.primaryForeground : theme.mutedForeground} strokeWidth={2.2} />
          <Text className={`${videoOnly ? 'text-on-sport' : 'text-body'} font-sans-bold`} style={styles.videoChipText}>Con video</Text>
        </TouchableOpacity>
        <View style={styles.filterDivider} />
        <FilterChip label="Todos" active={muscle === null} onPress={() => setMuscle(null)} />
        {muscleOptions.map((m) => (
          <FilterChip key={m} label={m} active={muscle === m} onPress={() => setMuscle(m)} />
        ))}
      </ScrollView>

      {/* List (agrupada por músculo) */}
      <MotiView
        key={`${source}|${muscle ?? 'all'}|${videoOnly ? 'vid' : 'any'}`}
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
              <GroupHeader muscle={item.muscle} count={item.count} />
            ) : (
              <ExerciseCard row={item.row} onPress={() => openPreview(item.row)} />
            )
          }
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: insets.bottom + 96 }}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load('refresh')} tintColor={theme.primary} />}
          ListEmptyComponent={
            <View style={{ paddingTop: 48 }}>
              <EmptyState icon={Dumbbell} title="Sin ejercicios" subtitle={query || muscle || source !== 'all' || videoOnly ? 'Probá otro filtro o búsqueda.' : 'Creá tu primer ejercicio personalizado.'} />
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

// Stat-tab (espeja las tabs-stats del diseño): número (mono) sobre etiqueta. El
// segmento activo se eleva en un pill surface-card con shadow-sm.
function SourceTab({ label, count, active, onPress }: { label: string; count: number; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      className={`flex-1 items-center justify-center ${active ? 'bg-surface-card' : ''}`}
      style={[styles.tab, active ? SHADOW_SM : null]}
    >
      <Text className={`font-mono ${active ? 'text-strong' : 'text-muted'}`} style={styles.tabCount}>{count}</Text>
      <Text numberOfLines={1} className={active ? 'text-strong font-sans-bold' : 'text-muted font-sans-semibold'} style={styles.tabLabel}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      className={`rounded-pill justify-center ${active ? 'bg-sport-500' : 'bg-surface-card border border-default'}`}
      style={styles.filterChip}
    >
      <Text className={`${active ? 'text-on-sport' : 'text-body'} font-sans-bold`} style={styles.filterChipText}>{label}</Text>
    </TouchableOpacity>
  )
}

function GroupHeader({ muscle, count }: { muscle: string; count: number }) {
  return (
    <View className="flex-row items-center" style={styles.groupHeader}>
      <View className="bg-sport-500" style={styles.dot} />
      <Text className="text-strong font-sans-extra" style={styles.groupTitle}>{muscle.toUpperCase()}</Text>
      <View className="bg-surface-sunken" style={styles.countBadge}>
        <Text className="text-muted font-mono" style={styles.countText}>{count}</Text>
      </View>
    </View>
  )
}

function ExerciseCard({ row, onPress }: { row: ExerciseRow; onPress: () => void }) {
  const { theme } = useTheme()
  const meta = [row.equipment, row.difficulty ? DIFFICULTY_LABEL[row.difficulty] ?? row.difficulty : null].filter(Boolean).join(' · ')
  const thumb = exerciseThumb(row)
  return (
    <Card interactive onPress={onPress} padding={12} radius="card" style={styles.card}>
      <View
        className={`${thumb ? 'bg-surface-sunken' : 'bg-ink-950'} rounded-control items-center justify-center`}
        style={styles.thumb}
      >
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.thumbImg} contentFit="cover" transition={150} />
        ) : (
          <Dumbbell size={22} color={theme.primary} strokeWidth={1.6} />
        )}
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text numberOfLines={1} className="text-strong font-sans-bold" style={styles.cardName}>{row.name}</Text>
        <Text numberOfLines={1} className="text-muted font-sans" style={styles.cardMuscle}>
          {row.muscle_group}{meta ? ` · ${meta}` : ''}
        </Text>
      </View>
      {row.isOwn ? <Badge label="Propio" tone="success" /> : null}
      <ChevronRight size={18} color={theme.mutedForeground} />
    </Card>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerBtn: { width: 40, height: 40 },
  tabsWrap: { paddingHorizontal: 16, paddingBottom: 10 },
  tabs: { padding: 3, gap: 3 },
  tab: { paddingVertical: 7, borderRadius: 11 },
  tabCount: { fontSize: 16, lineHeight: 19 },
  tabLabel: { fontSize: 11, marginTop: 1 },
  searchWrap: { paddingHorizontal: 16, paddingBottom: 10 },
  filterScroll: { flexGrow: 0, maxHeight: 40 },
  filterRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 12, alignItems: 'center' },
  filterChip: { paddingHorizontal: 13, height: 32 },
  filterChipText: { fontSize: 13 },
  videoChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, height: 32 },
  videoChipText: { fontSize: 13 },
  filterDivider: { width: StyleSheet.hairlineWidth, height: 20, backgroundColor: 'rgba(120,120,128,0.35)', alignSelf: 'center' },
  listWrap: { flex: 1 },
  groupHeader: { gap: 8, paddingTop: 14, paddingBottom: 8, paddingHorizontal: 2 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  groupTitle: { fontSize: 12, letterSpacing: 0.6 },
  countBadge: { marginLeft: 'auto', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2 },
  countText: { fontSize: 11 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  thumb: { width: 52, height: 52, overflow: 'hidden' },
  thumbImg: { width: 52, height: 52 },
  cardName: { fontSize: 15 },
  cardMuscle: { fontSize: 12 },
})
