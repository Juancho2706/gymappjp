import { forwardRef, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import BottomSheet, { BottomSheetFlatList, type BottomSheetModal } from '@gorhom/bottom-sheet'
import { Image } from 'expo-image'
import { MotiView } from 'moti'
import { Activity, Check, ChevronUp, Clock, Dumbbell, Eye, Pencil, Plus, Search, X } from 'lucide-react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useTheme } from '../../context/ThemeContext'
import { exerciseThumb, filterExercises, MUSCLE_GROUPS, type ExerciseRow } from '../../lib/exercises'
import { getMuscleColor } from '../../lib/muscle-colors'
import { Button } from '../Button'
import { VideoPlayer } from '../VideoPlayer'
import { execMediaKind } from '../alumno/workout/v3/ExecMediaV3'
import { ExerciseFormSheet, type CreatedExercise } from './ExerciseFormSheet'
import type { BuilderBlock } from '../../lib/plan-builder/types'

const RECENTS_KEY = 'builder_recent_exercises'
const EMPTY: Ex[] = [] // ref estable para no virtualizar nada con el sheet colapsado

// Fuera del componente a propósito: `Date.now`/`Math.random` son impuras y react-hooks/purity las
// prohíbe en el cuerpo de un componente aunque solo corran dentro de un handler.
function newBlockUid() {
  return `block-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

type Ex = Pick<
  ExerciseRow,
  | 'id'
  | 'name'
  | 'muscle_group'
  | 'gif_url'
  | 'image_url'
  | 'video_url'
  | 'secondary_muscles'
  | 'body_part'
  | 'equipment'
  | 'cardio_modality'
  | 'exercise_type'
> & {
  // Recorte del coach: el preview reproduce el MISMO tramo que verá el alumno. Opcionales porque
  // los "usados recientemente" persistidos en AsyncStorage pueden venir de una versión anterior.
  video_start_time?: number | null
  video_end_time?: number | null
}

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
  /** Snap activo del sheet (0 = handle colapsado). El builder lo usa para esconder los
   *  flotantes (Guardar) mientras el catálogo está expandido — 1:1 web `!isCatalogOpen`. */
  onIndexChange?: (index: number) => void
  onSelect: (block: BuilderBlock) => void
  /**
   * El coach editó (o eliminó) un ejercicio propio desde el preview del catálogo. `exercises` es
   * un prop: la lista vive en el llamador, así que la única forma de que la fila deje de mostrar
   * el dato viejo es que el llamador relea el catálogo del workspace. Opcional: sin él la edición
   * igual persiste, solo que el catálogo se ve viejo hasta salir y volver al builder.
   */
  onCatalogChanged?: () => void
}

/** Catálogo persistente jalable 1:1 web (handle colapsado → buscador+chips → catálogo completo).
 *  Lista completa por defecto + filtro en memoria + miniaturas (gif/imagen/YouTube) + preview. */
export const ExerciseSearchSheet = forwardRef<BottomSheet, Props>(
  function ExerciseSearchSheet({ exercises, dayBlockCount, dayName, onIndexChange, onSelect, onCatalogChanged }, ref) {
    const { theme } = useTheme()
    const localRef = useRef<BottomSheet | null>(null)
    const [query, setQuery] = useState('')
    const [muscle, setMuscle] = useState('Todos')
    const [index, setIndex] = useState(0)
    const [recents, setRecents] = useState<Ex[]>([])
    const [preview, setPreview] = useState<Ex | null>(null)
    const [addedFlash, setAddedFlash] = useState<Record<string, boolean>>({})
    const snapPoints = useMemo(() => ['12%', '42%', '85%'], [])
    // Alta guiada desde el vacío: "Crear «término»" abre el formulario con el nombre precargado.
    // `createName` se congela al abrir para que seguir escribiendo en el buscador no lo pise.
    const formRef = useRef<BottomSheetModal | null>(null)
    const [createName, setCreateName] = useState('')
    // El MISMO `ExerciseFormSheet` sirve alta y edición: `editTarget = null` ⇒ modo creación.
    // Al editar necesita la fila COMPLETA (instructions, difficulty, body_part…), no el recorte
    // `Ex` que guarda el preview — si no, guardar pisaría con vacíos lo que no viajó.
    const [editTarget, setEditTarget] = useState<ExerciseRow | null>(null)

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

    const handleIndexChange = useCallback((i: number) => {
      setIndex(i)
      onIndexChange?.(i)
    }, [onIndexChange])

    const deferredQuery = useDeferredValue(query)
    const filtered = useMemo(() => filterExercises(exercises, deferredQuery, muscle), [exercises, deferredQuery, muscle])
    // "Usados recientemente" es una COPIA en AsyncStorage: manda siempre la fila del catálogo del
    // workspace, no la copia. Así el ejercicio recién editado se ve con el nombre nuevo y el
    // eliminado (o el que ya no pertenece a este workspace) deja de ofrecerse. Con el catálogo aún
    // sin cargar no se esconde nada.
    const recentsView = useMemo(() => {
      if (exercises.length === 0) return recents
      const byId = new Map(exercises.map((e) => [e.id, e]))
      return recents.flatMap<Ex>((r) => { const fresh = byId.get(r.id); return fresh ? [fresh] : [] })
    }, [recents, exercises])
    const showRecents = deferredQuery.trim() === '' && muscle === 'Todos' && recentsView.length > 0
    // Lazy: con el sheet colapsado (index ≤ 0) no virtualizamos filas.
    const data = index >= 1 ? filtered : EMPTY

    function handleSelect(ex: Ex) {
      pushRecent(ex)
      onSelect({
        uid: newBlockUid(),
        exercise_id: ex.id,
        exercise_name: ex.name,
        muscle_group: ex.muscle_group ?? 'General',
        gif_url: ex.gif_url ?? undefined,
        video_url: ex.video_url ?? undefined,
        // Solo-memoria (Fase C): viaja con el bloque para que el editor ofrezca el objetivo en la
        // unidad propia de la modalidad (saltos/pisos/reps). No es columna: el save la ignora.
        cardio_modality: ex.cardio_modality ?? null,
        // Deuda #5 (cardio-ejes): el tipo del ejercicio viaja con el bloque nuevo — igual que web —
        // para que el editor derive el tipo efectivo (cardio/movilidad/roller) sin que el coach
        // tenga que marcarlo a mano. `effectiveExerciseType` lo lee como fallback del override.
        // Cast seguro: la columna tiene CHECK de valores y el editor re-normaliza igual.
        exercise_type: (ex.exercise_type ?? null) as BuilderBlock['exercise_type'],
        sets: 3,
        reps: '8-10',
        rest_time: '60s',
        section: 'main',
        superset_group: null,
        is_override: false,
      })
      // No cerrar el menú: el coach agrega varios. Feedback ✓ verde breve por fila.
      setAddedFlash((f) => ({ ...f, [ex.id]: true }))
      setTimeout(() => setAddedFlash((f) => { const n = { ...f }; delete n[ex.id]; return n }), 900)
    }

    function renderItem({ item: ex }: { item: Ex }) {
      const color = getMuscleColor(ex.muscle_group)
      const thumb = exerciseThumb(ex)
      return (
        <TouchableOpacity className="flex-row items-center bg-surface-card border border-subtle rounded-control" style={styles.row} onPress={() => handleSelect(ex)} activeOpacity={0.8}>
          <View style={[styles.thumb, { backgroundColor: hexToRgba(color, 0.15) }]}>
            {thumb ? <Image source={{ uri: thumb }} style={styles.thumbImg} contentFit="cover" cachePolicy="memory-disk" recyclingKey={ex.id} /> : <Activity size={18} color={color} />}
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Text numberOfLines={1} className="text-strong font-sans-bold" style={styles.exName}>{ex.name}</Text>
            <View style={styles.exMuscleRow}>
              <View style={[styles.mDot, { backgroundColor: color }]} />
              <Text numberOfLines={1} className="text-muted font-sans" style={styles.exMuscle}>{ex.muscle_group ?? ''}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => setPreview(ex)} hitSlop={8} style={styles.eyeBtn}><Eye size={16} color={theme.mutedForeground} /></TouchableOpacity>
          {addedFlash[ex.id] ? (
            <MotiView from={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'timing', duration: 160 }} className="items-center justify-center" style={[styles.addBtn, { backgroundColor: '#10B981' }]}>
              <Check size={16} color="#fff" />
            </MotiView>
          ) : (
            <View className="bg-sport-500 items-center justify-center" style={styles.addBtn}><Plus size={16} color={theme.primaryForeground} /></View>
          )}
        </TouchableOpacity>
      )
    }

    /** Abre el formulario de alta con el término buscado ya escrito en el nombre. */
    function openCreate() {
      setEditTarget(null)
      setCreateName(query.trim())
      formRef.current?.present()
    }

    /**
     * Editar el ejercicio propio que se está previsualizando. El preview es un `Modal` nativo y el
     * formulario un `BottomSheetModal`: presentar el segundo mientras el primero todavía se cierra
     * lo deja invisible en iOS. Mismo patrón (y mismo delay) que `openEditFromPreview` del tab
     * Ejercicios — ver `app/coach/(tabs)/ejercicios.tsx`.
     */
    function openEditFromPreview(row: ExerciseRow) {
      setPreview(null)
      setCreateName('')
      setEditTarget(row)
      setTimeout(() => formRef.current?.present(), 280)
    }

    /**
     * Guardado del formulario, en sus dos modos.
     *
     * EDICIÓN (y eliminación): el sheet devuelve `null` en ambos casos, así que no hay campos que
     * copiar; la lista del catálogo es un prop, se le pide al llamador que la relea. Las recientes
     * se resuelven contra ese catálogo (`recentsView`), así que se arreglan solas.
     * Deuda conocida: si el ejercicio YA estaba agregado como bloque del día, el bloque conserva
     * el nombre viejo — `exercise_name` se copió al agregarlo — hasta recargar el builder.
     * Arreglarlo exige reconciliar todos los días contra el catálogo, fuera del alcance del sheet.
     *
     * ALTA: el ejercicio recién creado entra DIRECTO al día en curso (misma ruta que elegirlo del
     * catálogo) y el buscador se limpia: el ejercicio nuevo todavía no está en `exercises` (el
     * builder recarga el catálogo aparte), así que dejar el término puesto mostraría "sin
     * resultados" sobre un ejercicio que sí existe. En "Usados recientemente" queda a mano.
     */
    function handleSaved(created: CreatedExercise | null) {
      if (editTarget) {
        onCatalogChanged?.()
        return
      }
      if (!created) return
      handleSelect({
        id: created.id,
        name: created.name,
        muscle_group: created.muscle_group,
        gif_url: created.gif_url ?? null,
        image_url: created.image_url ?? null,
        video_url: created.video_url ?? null,
        video_start_time: created.video_start_time ?? null,
        video_end_time: created.video_end_time ?? null,
        secondary_muscles: created.secondary_muscles ?? null,
        body_part: created.body_part ?? null,
        equipment: created.equipment ?? null,
        cardio_modality: created.cardio_modality ?? null,
        exercise_type: created.exercise_type ?? null,
      })
      setQuery('')
      setCreateName('')
    }

    // Fila COMPLETA del ejercicio previsualizado. El preview puede venir de "usados recientemente"
    // (copia parcial de AsyncStorage), así que el `isOwn` y los campos que el formulario necesita
    // salen siempre del catálogo del workspace: si el ejercicio no está ahí, no se ofrece editar.
    const previewRow = useMemo(
      () => (preview ? exercises.find((e) => e.id === preview.id) ?? null : null),
      [preview, exercises]
    )
    const pthumb = preview ? exerciseThumb(preview) : null
    // Precedencia idéntica a la app del alumno: gif → video directo → YouTube → imagen.
    const pKind = preview ? execMediaKind(preview) : 'none'
    const pPlayable = !!preview?.video_url && (pKind === 'video' || pKind === 'youtube')

    // Handle custom: grabber + (colapsado) label "Añadir ejercicio · N en {día}".
    const renderHandle = () => (
      <Pressable onPress={() => localRef.current?.snapToIndex(2)} style={styles.handle}>
        <View className="bg-track" style={styles.grabber} />
        {index <= 0 ? (
          <View style={styles.collapsedRow}>
            <MotiView from={{ translateY: 1 }} animate={{ translateY: -4 }} transition={{ loop: true, type: 'timing', duration: 850 }}>
              <ChevronUp size={16} color={theme.primary} />
            </MotiView>
            <Text className="text-strong font-sans-bold" style={styles.collapsedText}>DESLIZA PARA AÑADIR EJERCICIOS</Text>
            <Text className="text-muted font-sans" style={styles.collapsedHint}>· {dayBlockCount} en {dayName}</Text>
          </View>
        ) : null}
      </Pressable>
    )

    return (
      <BottomSheet
        ref={setRefs}
        index={0}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose={false}
        // CRASH iOS 1.1.0 (54), Sentry EVA-MOBILE-8: con el paneo por contenido activo, gorhom marca el
        // scrollable como LOCKED en todo snap que no sea el máximo (acá: 12% y 42%) y su worklet de
        // onScroll llama `scrollTo` — un `dispatchCommand` SÍNCRONO contra el UIManager desde el hilo de
        // UI (useScrollEventsHandlersDefault.ts:54-63). Cuando el onScroll no lo produce el dedo sino el
        // ajuste de contentOffset dentro de un commit de montaje, ese comando resuelve un shadow node del
        // árbol que se está montando y lanza un JSError. En el hilo de UI nadie lo atrapa: es abort().
        // Con la bandera en false, useScrollable.ts:41-48 devuelve UNLOCKED incondicional y esa rama muere.
        // Costo: la lista deja de arrastrar el sheet; el handle sí lo sigue arrastrando y su Pressable
        // hace snapToIndex(2), que es el gesto que el copy ya enseña.
        enableContentPanningGesture={false}
        onChange={handleIndexChange}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        handleComponent={renderHandle}
        backgroundStyle={{ backgroundColor: theme.card, borderTopWidth: 1, borderColor: theme.border }}
        style={styles.sheetShadow}
      >
        <BottomSheetFlatList
          data={data}
          extraData={addedFlash}
          keyExtractor={(ex) => ex.id}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={7}
          // `removeClippedSubviews` retirado con el fix del crash: en Fabric/iOS multiplica el
          // montaje y desmontaje de filas, que es justo lo que dispara el commit en el que el
          // contentSize salta y UIKit emite el onScroll sintético. La virtualización de FlatList
          // (initialNumToRender/maxToRenderPerBatch/windowSize) ya acota lo que se renderiza.
          ListHeaderComponent={
            <View style={{ gap: 10 }}>
              <View style={styles.headerRow}>
                <Activity size={16} color={theme.primary} />
                <Text className="text-strong font-display" style={styles.headerTitle}>Catálogo de Ejercicios</Text>
              </View>
              <View className="flex-row items-center bg-surface-sunken border border-subtle rounded-control" style={styles.searchBar}>
                <Search size={16} color={theme.mutedForeground} />
                <TextInput value={query} onChangeText={setQuery} placeholder="Buscar por nombre..." placeholderTextColor={theme.mutedForeground}
                  className="flex-1 text-strong font-sans" style={styles.searchInput} />
                {query.length ? <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}><X size={15} color={theme.mutedForeground} /></TouchableOpacity> : null}
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow} style={{ maxHeight: 42 }}>
                {['Todos', ...MUSCLE_GROUPS].map((m) => {
                  const on = muscle === m
                  return (
                    <TouchableOpacity key={m} onPress={() => setMuscle(m)} activeOpacity={0.8}
                      className={`justify-center rounded-pill ${on ? 'bg-sport-500' : 'bg-surface-card border border-default'}`} style={styles.chip}>
                      <Text className={`${on ? 'text-on-sport' : 'text-body'} font-sans-bold`} style={styles.chipText}>{m}</Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
              {showRecents ? (
                <>
                  <View style={styles.recentHead}>
                    <Clock size={13} color={theme.mutedForeground} />
                    <Text className="text-muted font-sans-semibold" style={styles.recentLabel}>Usados recientemente</Text>
                  </View>
                  {recentsView.map((ex) => <View key={`r-${ex.id}`}>{renderItem({ item: ex })}</View>)}
                  <Text className="text-muted font-sans-semibold" style={[styles.recentLabel, { marginTop: 4 }]}>Todos los ejercicios</Text>
                </>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text className="text-muted font-sans" style={styles.empty}>
                {query.trim().length >= 2 ? 'Sin resultados en tu catálogo.' : 'Sin resultados'}
              </Text>
              {/* Salida del vacío: crear el ejercicio buscado sin abandonar el builder. Al guardar
                  entra solo al día en curso. */}
              {query.trim().length >= 2 ? (
                <TouchableOpacity
                  onPress={openCreate}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel={`Crear el ejercicio ${query.trim()}`}
                  className="flex-row items-center justify-center bg-sport-500 rounded-control"
                  style={styles.emptyBtn}
                >
                  <Plus size={16} color={theme.primaryForeground} />
                  <Text className="text-on-sport font-sans-bold" style={styles.emptyBtnTxt} numberOfLines={1}>
                    Crear &quot;{query.trim()}&quot;
                  </Text>
                </TouchableOpacity>
              ) : null}
            </View>
          }
        />

        {/* Preview */}
        <Modal visible={!!preview} transparent animationType="fade" onRequestClose={() => setPreview(null)}>
          <Pressable style={styles.pvBackdrop} onPress={() => setPreview(null)}>
            <Pressable className="bg-surface-card border border-subtle" style={styles.pvCard} onPress={() => {}}>
              <View style={styles.pvHead}>
                <Text className="text-strong font-display" style={styles.pvTitle} numberOfLines={2}>{preview?.name}</Text>
                <TouchableOpacity onPress={() => setPreview(null)} hitSlop={8}><X size={20} color={theme.mutedForeground} /></TouchableOpacity>
              </View>
              <Text className="text-sport-600 font-sans-bold" style={styles.pvMuscle}>{preview?.muscle_group}</Text>
              {/* El video se reproduce ACÁ dentro (`VideoPlayer` resuelve YouTube y mp4/Storage). Antes
                  el botón "Ver en YouTube" hacía `Linking.openURL` y sacaba al coach de la app en medio
                  del armado del día. Sin `autoPlay`: póster + play, no pide red hasta el tap. */}
              {preview && pPlayable ? (
                <VideoPlayer
                  url={preview.video_url!}
                  start={pKind === 'youtube' ? preview.video_start_time ?? null : null}
                  end={pKind === 'youtube' ? preview.video_end_time ?? null : null}
                  title={preview.name}
                  style={styles.pvVideo}
                />
              ) : (
                <View className="bg-surface-sunken" style={styles.pvMedia}>
                  {pthumb ? <Image source={{ uri: pthumb }} style={styles.pvImg} contentFit="contain" transition={150} /> : <Dumbbell size={40} color={theme.mutedForeground} />}
                </View>
              )}
              {/* Editar sin salir del builder: solo para ejercicios PROPIOS (los del sistema no se
                  tocan) y reusando el formulario que ya vive acá abajo. No se ofrece "Duplicar" ni
                  "Eliminar": administrar la biblioteca es del tab Ejercicios; acá el coach está
                  armando el día. Sin gate de permiso extra — este sheet tampoco gatea "Crear", y
                  `updateExercise` filtra por `coach_id` además de RLS. */}
              {previewRow?.isOwn ? (
                <View style={styles.pvActions}>
                  <Button label="Editar ejercicio" variant="sport" size="lg" full leftIcon={Pencil} onPress={() => openEditFromPreview(previewRow)} />
                </View>
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>

        {/* Un solo formulario para los dos caminos: alta guiada desde el vacío del buscador
            (`editTarget = null` + nombre precargado ⇒ el ejercicio entra al día al guardar) y
            edición del ejercicio propio abierto en el preview. `onRestored` (deshacer la
            eliminación desde el toast) también pide relectura: para entonces `editTarget` ya se
            limpió en `onClose`, así que no pasa por `handleSaved`. */}
        <ExerciseFormSheet
          ref={formRef}
          exercise={editTarget}
          initialName={createName}
          onSaved={handleSaved}
          onRestored={() => onCatalogChanged?.()}
          onClose={() => { setCreateName(''); setEditTarget(null) }}
        />
      </BottomSheet>
    )
  }
)

const styles = StyleSheet.create({
  sheetShadow: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 16 },
  handle: { paddingTop: 8, paddingBottom: 6, alignItems: 'center', gap: 6 },
  grabber: { width: 38, height: 4, borderRadius: 2 },
  collapsedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingBottom: 2, paddingHorizontal: 16 },
  collapsedText: { fontSize: 11.5, letterSpacing: 0.5, textTransform: 'uppercase', flexShrink: 1 },
  collapsedHint: { fontSize: 10.5 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 15 },
  searchBar: { gap: 10, paddingHorizontal: 12, height: 44 },
  searchInput: { fontSize: 15, paddingVertical: 0 },
  filterRow: { gap: 7, paddingBottom: 2, paddingRight: 8 },
  chip: { paddingHorizontal: 13, height: 34 },
  chipText: { fontSize: 12 },
  list: { paddingHorizontal: 16, paddingBottom: 40, gap: 8 },
  recentHead: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 2 },
  recentLabel: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
  emptyWrap: { alignItems: 'center', gap: 12, paddingHorizontal: 8 },
  empty: { textAlign: 'center', fontSize: 14, marginTop: 24 },
  emptyBtn: { gap: 8, height: 46, paddingHorizontal: 18, maxWidth: '100%' },
  emptyBtnTxt: { fontSize: 14, flexShrink: 1 },
  row: { gap: 10, paddingHorizontal: 10, paddingVertical: 9 },
  thumb: { width: 40, height: 40, borderRadius: 9, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  thumbImg: { width: 40, height: 40 },
  exName: { fontSize: 14 },
  exMuscleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mDot: { width: 8, height: 8, borderRadius: 4 },
  exMuscle: { fontSize: 11.5, textTransform: 'uppercase', letterSpacing: 0.3, flex: 1 },
  eyeBtn: { padding: 6 },
  addBtn: { width: 30, height: 30, borderRadius: 15 },
  pvBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  pvCard: { width: '100%', maxWidth: 420, borderWidth: 1, borderRadius: 18, padding: 16, gap: 8 },
  pvHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  pvTitle: { fontSize: 17, flex: 1 },
  pvMuscle: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, marginTop: -4 },
  pvMedia: { width: '100%', height: 200, borderRadius: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  pvImg: { width: '100%', height: '100%' },
  pvActions: { marginTop: 4 },
  // Marco del VideoPlayer: SIN `alignItems:'center'` — ese estilo colapsa el WebView a ancho 0
  // (gotcha documentado en VideoPlayer.tsx: "el video se escuchaba pero no se veía").
  pvVideo: { width: '100%', height: 200, marginTop: 4 },
})
