import { forwardRef, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import type { ScrollView } from 'react-native'
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { useSheetKeyboardInset } from '../../lib/use-sheet-keyboard-inset'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { ImagePlus, Trash2, X } from 'lucide-react-native'
import { CARDIO_MODALITY_OPTIONS, EXERCISE_TYPE_OPTIONS, cardioAxisLabels } from '@eva/workout-engine'
import { useTheme } from '../../context/ThemeContext'
import { Button, Input, SegmentedTabs, Textarea, VideoPlayer } from '../index'
import { execMediaKind } from '../alumno/workout/v3/ExecMediaV3'
import {
  DIFFICULTY_OPTIONS,
  EQUIPMENT_OPTIONS,
  MUSCLE_GROUPS,
  createExercise,
  deleteExercise,
  updateExercise,
  uploadExerciseImage,
  youtubeId,
  type ExerciseInput,
  type ExerciseRow,
} from '../../lib/exercises'

/** Segundos → "m:ss" para los inputs de recorte (vacío si null). 1:1 con la web. */
function secondsToMmss(sec: number | null | undefined): string {
  if (sec == null) return ''
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** "m:ss" o segundos sueltos → segundos (null si vacío/inválido). 1:1 con la web. */
function mmssToSeconds(str: string): number | null {
  const t = str.trim()
  if (!t) return null
  if (t.includes(':')) {
    const [m, s] = t.split(':')
    const mi = parseInt(m, 10)
    const se = parseInt(s, 10)
    if (isNaN(mi) || isNaN(se)) return null
    return mi * 60 + se
  }
  const n = parseInt(t, 10)
  return isNaN(n) ? null : n
}

/** Campo señalado por la validación local (el mensaje se pinta EN el campo, no solo arriba). */
type FieldError = { field: 'name' | 'muscle' | 'video'; message: string }

/**
 * Ejercicio recién CREADO. El sheet lo entrega por `onSaved` para que quien lo abrió pueda usarlo
 * sin esperar una relectura del catálogo — el builder lo inserta directo en el día en curso.
 * En modo edición `onSaved` recibe `null` (nada que insertar).
 */
export type CreatedExercise = ExerciseInput & { id: string }

/** Fuente de la demostración visual. Las tres son EXCLUYENTES (1:1 web `ExerciseMediaPicker`). */
type MediaTab = 'youtube' | 'gif' | 'image'

const MEDIA_TABS: { value: MediaTab; label: string }[] = [
  { value: 'youtube', label: 'YouTube' },
  { value: 'gif', label: 'GIF' },
  { value: 'image', label: 'Imagen' },
]

/**
 * Pestaña inicial: la que GANA en la app del alumno (`execMediaKind`: gif > video > imagen), para
 * que el coach vea de entrada la fuente que realmente se muestra y no una que quedó tapada.
 */
function initialMediaTab(exercise: ExerciseRow | null): MediaTab {
  if (exercise?.gif_url) return 'gif'
  if (exercise?.video_url) return 'youtube'
  if (exercise?.image_url) return 'image'
  return 'youtube'
}

interface Props {
  /** Exercise being edited; null = create mode. */
  exercise: ExerciseRow | null
  /** Nombre precargado en modo creación (el catálogo del builder abre "Crear «término»"). */
  initialName?: string
  onSaved: (created: CreatedExercise | null) => void
  onClose: () => void
}

export const ExerciseFormSheet = forwardRef<BottomSheetModal, Props>(function ExerciseFormSheet(
  { exercise, initialName, onSaved, onClose },
  ref
) {
  const { theme } = useTheme()
  const editing = !!exercise
  const scrollRef = useRef<ScrollView>(null)
  const { keyboardInset, onScroll } = useSheetKeyboardInset(scrollRef)

  const [name, setName] = useState('')
  const [muscle, setMuscle] = useState('')
  const [exerciseType, setExerciseType] = useState('strength')
  // Modalidad de cardio (Fase C): '' = genérica ⇒ se guarda NULL. Solo se muestra en tipo cardio.
  const [cardioModality, setCardioModality] = useState('')
  const [equipment, setEquipment] = useState<string | null>(null)
  const [difficulty, setDifficulty] = useState<string | null>(null)
  const [secondary, setSecondary] = useState('')
  const [instructions, setInstructions] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [videoStart, setVideoStart] = useState('')
  const [videoEnd, setVideoEnd] = useState('')
  const [gifUrl, setGifUrl] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [mediaTab, setMediaTab] = useState<MediaTab>('youtube')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<FieldError | null>(null)

  // E-F1: subir imagen del ejercicio desde galería del device.
  async function pickImage() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (!perm.granted) { setError('Permiso de galería denegado.'); return }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 })
    if (res.canceled || !res.assets?.[0]?.uri) return
    setUploading(true)
    setError(null)
    const up = await uploadExerciseImage(res.assets[0].uri)
    setUploading(false)
    if (!up.ok || !up.url) { setError(up.error ?? 'No se pudo subir la imagen.'); return }
    setImageUrl(up.url)
  }

  // Reset form whenever the target exercise changes (open for create/edit).
  useEffect(() => {
    setError(null)
    setFieldError(null)
    setSaving(false)
    setName(exercise?.name ?? initialName ?? '')
    setMuscle(exercise?.muscle_group ?? '')
    setExerciseType(exercise?.exercise_type ?? 'strength')
    setCardioModality(exercise?.cardio_modality ?? '')
    setEquipment(exercise?.equipment ?? null)
    setDifficulty(exercise?.difficulty ?? null)
    setSecondary(exercise?.secondary_muscles?.join(', ') ?? '')
    setInstructions(exercise?.instructions?.join('\n') ?? '')
    setVideoUrl(exercise?.video_url ?? '')
    setVideoStart(secondsToMmss(exercise?.video_start_time))
    setVideoEnd(secondsToMmss(exercise?.video_end_time))
    setGifUrl(exercise?.gif_url ?? '')
    setImageUrl(exercise?.image_url ?? '')
    setMediaTab(initialMediaTab(exercise))
  }, [exercise, initialName])

  /** Salir de cardio limpia la modalidad (la lib también la anula: acá solo espejamos la UI). */
  function changeType(next: string) {
    setExerciseType(next)
    if (next !== 'cardio') setCardioModality('')
  }

  /**
   * Cambiar de pestaña LIMPIA las otras dos fuentes (1:1 web `ExerciseMediaPicker:46-55`). Antes las
   * tres coexistían y la precedencia del alumno (gif > video) decidía en silencio cuál se mostraba.
   * Como en la web, si la pestaña actual ya tenía algo cargado se pide confirmación antes de botarlo.
   */
  function changeMediaTab(next: MediaTab) {
    if (next === mediaTab) return
    const loaded = mediaTab === 'youtube' ? videoUrl.trim() : mediaTab === 'gif' ? gifUrl.trim() : imageUrl.trim()
    const apply = () => {
      setMediaTab(next)
      setVideoUrl('')
      setVideoStart('')
      setVideoEnd('')
      setGifUrl('')
      setImageUrl('')
    }
    if (!loaded) { setMediaTab(next); return }
    Alert.alert(
      'Cambiar el tipo de medio',
      'Se descartará lo que ya cargaste en esta pestaña. ¿Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Continuar', style: 'destructive', onPress: apply },
      ]
    )
  }

  async function save() {
    setError(null)
    setFieldError(null)
    if (name.trim().length < 2) {
      setFieldError({ field: 'name', message: 'El nombre debe tener al menos 2 caracteres.' }); return
    }
    if (!muscle) {
      setFieldError({ field: 'muscle', message: 'Selecciona un grupo muscular.' }); return
    }
    const startSec = mmssToSeconds(videoStart)
    const endSec = mmssToSeconds(videoEnd)
    if (startSec != null && endSec != null && endSec <= startSec) {
      setFieldError({ field: 'video', message: 'El tiempo de fin debe ser mayor que el de inicio.' }); return
    }
    setSaving(true)
    const input = {
      name: name.trim(),
      muscle_group: muscle,
      exercise_type: exerciseType,
      // Fuera de cardio la lib ya la anula; se manda igual para no depender del orden de los estados.
      cardio_modality: exerciseType === 'cardio' ? cardioModality || null : null,
      equipment,
      difficulty,
      secondary_muscles: secondary.split(',').map((s) => s.trim()).filter(Boolean),
      instructions: instructions.split('\n').map((s) => s.trim()).filter(Boolean),
      video_url: videoUrl.trim() || null,
      gif_url: gifUrl.trim() || null,
      image_url: imageUrl.trim() || null,
      video_start_time: startSec,
      video_end_time: endSec,
    }
    if (editing) {
      const res = await updateExercise(exercise!.id, input)
      setSaving(false)
      if (!res.ok) { setError(res.error ?? 'No se pudo guardar.'); return }
      onSaved(null)
    } else {
      const res = await createExercise(input)
      setSaving(false)
      if (!res.ok) { setError(res.error ?? 'No se pudo guardar.'); return }
      // El ejercicio recién creado viaja de vuelta: el catálogo del builder lo inserta en el día
      // sin esperar a que se recargue el catálogo completo.
      onSaved(res.id ? { id: res.id, ...input } : null)
    }
    ;(ref as React.RefObject<BottomSheetModal>).current?.dismiss()
  }

  async function remove() {
    if (!exercise) return
    setSaving(true)
    const res = await deleteExercise(exercise.id)
    setSaving(false)
    if (!res.ok) { setError(res.error ?? 'No se pudo eliminar.'); return }
    onSaved(null)
    ;(ref as React.RefObject<BottomSheetModal>).current?.dismiss()
  }

  const isCardio = exerciseType === 'cardio'
  const trimmedVideo = videoUrl.trim()
  const ytId = youtubeId(trimmedVideo)
  // Clasificación del video con la MISMA precedencia que la app del alumno: 'youtube' o 'video'
  // (mp4/mov/webm/Storage) son las dos ramas que `VideoPlayer` reproduce; cualquier otra cosa es
  // una URL que no se va a ver y hay que avisarlo ANTES de guardar (1:1 web `MediaPicker:146`).
  const videoKind = execMediaKind({ gif_url: null, video_url: trimmedVideo || null })
  const videoPlayable = videoKind === 'youtube' || videoKind === 'video'
  // Preview de las cajas que verá el alumno: derivado del MOTOR (cardioAxesFor), nunca de una lista
  // local — si el mapa de ejes cambia, estos chips cambian solos.
  const cardioAxisPreview = cardioAxisLabels(cardioModality || null)

  return (
    <BottomSheetModal
      ref={ref}
      index={0}
      snapPoints={['90%']}
      enableDynamicSizing={false}
      enablePanDownToClose
      onDismiss={onClose}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      backgroundStyle={{ backgroundColor: theme.card }}
      handleIndicatorStyle={{ backgroundColor: theme.mutedForeground }}
    >
      {/* Teclado: inset manual + scroll correctivo (useSheetKeyboardInset). adjustResize es
          NO-OP con edge-to-edge en Android y automaticallyAdjustKeyboardInsets es iOS-only y
          no siguió al caret en QA — un solo mecanismo para ambas plataformas. */}
      <BottomSheetScrollView
        ref={scrollRef}
        contentContainerStyle={[styles.body, keyboardInset ? { paddingBottom: 48 + keyboardInset } : null]}
        keyboardShouldPersistTaps="handled"
        onScroll={onScroll}
      >
        <View style={styles.header}>
          <Text className="text-strong font-display" style={styles.title}>
            {editing ? 'Editar ejercicio' : 'Nuevo ejercicio'}
          </Text>
          <Text className="text-muted font-sans" style={styles.subtitle}>
            Lo que definas acá manda en el builder y en la app del alumno.
          </Text>
        </View>

        {error ? (
          <View className="border border-danger-500/30 bg-danger-100 dark:bg-danger-100/[0.18] rounded-control" style={styles.errorBox}>
            <Text className="text-danger-600 font-sans" style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <SectionHeader
          first
          title="Identidad"
          description="Cómo se llama el ejercicio y dónde queda ordenado en tu catálogo."
        />

        <Input
          label="Nombre *"
          value={name}
          onChangeText={setName}
          placeholder="Ej: Press banca inclinado"
          error={fieldError?.field === 'name' ? fieldError.message : null}
        />

        <Label>Grupo muscular *</Label>
        <Chips options={MUSCLE_GROUPS as readonly string[]} value={muscle} onSelect={setMuscle} />
        {fieldError?.field === 'muscle' ? (
          <Text className="text-danger-600 font-sans" style={styles.hint}>{fieldError.message}</Text>
        ) : null}

        <Input
          label="Músculos secundarios"
          value={secondary}
          onChangeText={setSecondary}
          placeholder="Tríceps, Deltoides"
          hint="Opcional. Separa cada músculo con coma."
        />

        <Label>Equipo</Label>
        <Chips options={EQUIPMENT_OPTIONS as readonly string[]} value={equipment} onSelect={(v) => setEquipment(v === equipment ? null : v)} />

        <Label>Dificultad</Label>
        <SegmentedTabs
          items={DIFFICULTY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          value={difficulty ?? ''}
          onChange={(v) => setDifficulty(v === difficulty ? null : v)}
        />

        <SectionHeader
          title="Tipo de ejercicio"
          description="Define qué campos muestra el builder y qué registra el alumno en cada serie."
        />

        {/* E5-08: tipo de ejercicio polimórfico (define los ejes del builder/alumno). */}
        <View style={styles.chips}>
          {EXERCISE_TYPE_OPTIONS.map((o) => {
            const active = o.value === exerciseType
            return (
              <TouchableOpacity
                key={o.value}
                testID={`exercise-type-${o.value}`}
                onPress={() => changeType(o.value)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                className={`rounded-pill ${active ? 'bg-sport-500' : 'bg-surface-card border border-default'}`}
                style={styles.chip}
              >
                <Text className={`${active ? 'text-on-sport' : 'text-body'} font-sans-bold`} style={styles.chipText}>{o.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Modalidad de cardio (Fase C) — SOLO en tipo cardio. Decide los ejes que el alumno registra
            por ronda (elíptica sin distancia, cuerda por saltos, escaladora por pisos, HIIT por reps).
            Genérica (default) = comportamiento de siempre. Espejo del selector web. */}
        {isCardio ? (
          <View className="rounded-control border border-subtle bg-surface-sunken/50" style={styles.cardioBox}>
            <Label>Modalidad de cardio</Label>
            <View style={styles.chips}>
              {CARDIO_MODALITY_OPTIONS.map(({ value, label, hint }) => {
                const active = value === cardioModality
                return (
                  <TouchableOpacity
                    key={value || 'generic'}
                    testID={`cardio-modality-${value || 'generic'}`}
                    onPress={() => setCardioModality(value)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`${label}: ${hint}`}
                    className={`rounded-pill ${active ? 'bg-sport-500' : 'bg-surface-card border border-default'}`}
                    style={styles.chip}
                  >
                    <Text className={`${active ? 'text-on-sport' : 'text-body'} font-sans-bold`} style={styles.chipText}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <View className="rounded-control border border-subtle bg-surface-card" style={styles.previewBox}>
              <Text className="text-muted font-sans-bold" style={styles.previewTitle}>EL ALUMNO REGISTRA POR RONDA</Text>
              <View style={styles.previewChips}>
                {cardioAxisPreview.map((axis) => (
                  <View key={axis} className="rounded-pill border border-subtle bg-surface-sunken" style={styles.previewChip}>
                    <Text className="text-strong font-sans-bold" style={styles.previewChipText}>{axis}</Text>
                  </View>
                ))}
              </View>
            </View>

            <Text className="text-muted font-sans" style={styles.hint}>
              Si cambias el tipo de ejercicio, la modalidad vuelve a Genérica.
            </Text>
          </View>
        ) : null}

        <SectionHeader
          title="Demostración visual"
          description="Video, GIF o imagen. Es lo primero que ve el alumno antes de ejecutar."
        />

        {/* P1.4 — las tres fuentes son EXCLUYENTES (1:1 web `ExerciseMediaPicker`): solo se edita la
            pestaña activa y cambiar de pestaña limpia las otras. Antes coexistían y el alumno veía
            la que ganara por precedencia (gif > video), sin que el coach entendiera por qué. */}
        <SegmentedTabs items={MEDIA_TABS} value={mediaTab} onChange={changeMediaTab} />

        {mediaTab === 'youtube' ? (
          <>
            <Input label="Video" value={videoUrl} onChangeText={setVideoUrl} placeholder="https://youtu.be/..." autoCapitalize="none" keyboardType="url" />
            <Text className="text-muted font-sans" style={styles.hint}>
              Pega el link. El video debe ser Unlisted o Público en YouTube.
            </Text>

            {/* E5-09: recorte start/end del video (solo YouTube válido). El player loopea [start,end].
                Un archivo directo (mp4/Storage) se reproduce completo, igual que en la app del alumno. */}
            {ytId ? (
              <>
                <View style={styles.trimRow}>
                  <View style={styles.trimCol}>
                    <Input label="Empieza en (m:ss)" value={videoStart} onChangeText={setVideoStart} placeholder="0:20" keyboardType="numbers-and-punctuation" />
                  </View>
                  <View style={styles.trimCol}>
                    <Input
                      label="Termina en (opcional)"
                      value={videoEnd}
                      onChangeText={setVideoEnd}
                      placeholder="1:30"
                      keyboardType="numbers-and-punctuation"
                      error={fieldError?.field === 'video' ? fieldError.message : null}
                    />
                  </View>
                </View>
                <Text className="text-muted font-sans" style={styles.hint}>El video loopea ese tramo (salta intro/charla). Vacío = video completo.</Text>
              </>
            ) : null}

            {/* P1.1 — preview de CUALQUIER video reproducible, no solo YouTube: `VideoPlayer` resuelve
                las dos ramas (WebView nocookie / expo-video). Sin `autoPlay`: póster + play, no pide
                red hasta el tap. */}
            {videoPlayable ? (
              <VideoPlayer
                url={trimmedVideo}
                start={ytId ? mmssToSeconds(videoStart) : null}
                end={ytId ? mmssToSeconds(videoEnd) : null}
                title={name || 'Preview del video'}
                style={styles.trimPreview}
              />
            ) : trimmedVideo ? (
              <Text className="text-warning-600 font-sans" style={styles.hint}>
                URL inválida. Usa un link de youtube.com / youtu.be o un archivo de video (.mp4).
              </Text>
            ) : null}
          </>
        ) : null}

        {mediaTab === 'gif' ? (
          <>
            <Input label="GIF (URL)" value={gifUrl} onChangeText={setGifUrl} placeholder="https://..." autoCapitalize="none" keyboardType="url" />
            {/* P1.2 — preview del GIF: `expo-image` anima GIF/WebP en nativo, no hace falta player. */}
            {gifUrl.trim() ? (
              <View className="bg-surface-sunken border border-subtle rounded-control overflow-hidden" style={styles.mediaFrame}>
                <Image source={{ uri: gifUrl.trim() }} style={{ flex: 1 }} contentFit="contain" transition={150} />
              </View>
            ) : null}
          </>
        ) : null}

        {mediaTab === 'image' ? (
          <>
            {/* E-F1: imagen desde el device */}
            <Label>Imagen del ejercicio</Label>
            <View style={styles.imgRow}>
              {imageUrl ? (
                <View>
                  <Image source={{ uri: imageUrl }} style={[styles.imgThumb, { borderColor: theme.border }]} contentFit="cover" transition={150} />
                  <TouchableOpacity
                    onPress={() => setImageUrl('')}
                    className="bg-cta-danger items-center justify-center"
                    style={styles.imgClear}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel="Quitar imagen"
                  >
                    <X size={12} color="#fff" />
                  </TouchableOpacity>
                </View>
              ) : null}
              <TouchableOpacity
                onPress={pickImage}
                disabled={uploading}
                activeOpacity={0.85}
                accessibilityRole="button"
                className="flex-1 flex-row items-center justify-center border border-sport-500/40 bg-sport-100 dark:bg-sport-100/20 rounded-control"
                style={styles.imgBtn}
              >
                {uploading ? <ActivityIndicator size="small" color={theme.primary} /> : <ImagePlus size={18} color={theme.primary} />}
                <Text className="text-sport-700 font-sans-semibold" style={styles.imgBtnText}>{uploading ? 'Subiendo…' : imageUrl ? 'Cambiar imagen' : 'Subir imagen'}</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}

        <SectionHeader
          title="Instrucciones"
          description="Claves de técnica que el alumno lee en la ficha del ejercicio."
        />

        <Textarea
          accessibilityLabel="Instrucciones"
          value={instructions}
          onChangeText={setInstructions}
          placeholder={'Espalda apoyada en el banco\nBaja controlado en 2 segundos'}
          minRows={4}
          hint="Una instrucción por línea."
        />

        <View style={styles.saveWrap}>
          <Button
            label={editing ? 'Guardar cambios' : 'Crear ejercicio'}
            variant="sport"
            size="lg"
            full
            loading={saving}
            onPress={save}
          />
        </View>

        {editing ? (
          <View style={styles.removeWrap}>
            <Button
              label="Eliminar ejercicio"
              variant="destructive"
              size="lg"
              full
              leftIcon={Trash2}
              disabled={saving}
              onPress={remove}
            />
          </View>
        ) : null}
      </BottomSheetScrollView>
    </BottomSheetModal>
  )
})

function Label({ children }: { children: React.ReactNode }) {
  return <Text className="text-strong font-sans-semibold" style={styles.label}>{children}</Text>
}

/** Encabezado de grupo del formulario (identidad · tipo · media · instrucciones). */
function SectionHeader({ title, description, first }: { title: string; description?: string; first?: boolean }) {
  return (
    <View className="border-subtle" style={[styles.sectionHeader, first ? styles.sectionHeaderFirst : null]}>
      <Text className="text-muted font-sans-bold" style={styles.sectionTitle}>{title.toUpperCase()}</Text>
      {description ? (
        <Text className="text-subtle font-sans" style={styles.sectionDesc}>{description}</Text>
      ) : null}
    </View>
  )
}

function Chips({ options, value, onSelect }: { options: readonly string[]; value: string | null; onSelect: (v: string) => void }) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const active = o === value
        return (
          <TouchableOpacity
            key={o}
            onPress={() => onSelect(o)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className={`rounded-pill ${active ? 'bg-sport-500' : 'bg-surface-card border border-default'}`}
            style={styles.chip}
          >
            <Text className={`${active ? 'text-on-sport' : 'text-body'} font-sans-bold`} style={styles.chipText}>{o}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 18, paddingBottom: 48, gap: 12 },
  header: { gap: 2 },
  title: { fontSize: 19, letterSpacing: -0.3 },
  subtitle: { fontSize: 12, lineHeight: 16 },
  errorBox: { paddingHorizontal: 12, paddingVertical: 10 },
  errorText: { fontSize: 13 },
  label: { fontSize: 13, marginTop: 4 },
  hint: { fontSize: 12, marginTop: -4 },
  // Grupo del formulario: hairline superior + título corto (el primero va sin regla ni aire extra).
  sectionHeader: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 8, paddingTop: 14, gap: 2 },
  sectionHeaderFirst: { borderTopWidth: 0, marginTop: 0, paddingTop: 0 },
  sectionTitle: { fontSize: 11, letterSpacing: 1 },
  sectionDesc: { fontSize: 12, lineHeight: 16 },
  trimRow: { flexDirection: 'row', gap: 12 },
  trimCol: { flex: 1 },
  trimPreview: { marginTop: 4 },
  // Marco 16:9 del preview de GIF — mismo encuadre que el medio de `ExercisePreviewSheet`.
  mediaFrame: { width: '100%', aspectRatio: 16 / 9, marginTop: 4 },
  imgRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  imgThumb: { width: 64, height: 64, borderRadius: 14, borderWidth: 1 },
  imgClear: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10 },
  imgBtn: { gap: 8, paddingVertical: 12 },
  imgBtnText: { fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 13, paddingVertical: 8 },
  chipText: { fontSize: 13 },
  // Caja de la modalidad: agrupa selector + preview para que se lean como una sola decisión.
  cardioBox: { padding: 12, gap: 10 },
  previewBox: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
  previewTitle: { fontSize: 10, letterSpacing: 0.8 },
  previewChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  previewChip: { paddingHorizontal: 10, paddingVertical: 5 },
  previewChipText: { fontSize: 12 },
  saveWrap: { marginTop: 10 },
  removeWrap: { marginTop: 4 },
})
