import { forwardRef, useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { ImagePlus, Trash2, X } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { Button, Input, SegmentedTabs, Textarea } from '../index'
import {
  DIFFICULTY_OPTIONS,
  EQUIPMENT_OPTIONS,
  MUSCLE_GROUPS,
  createExercise,
  deleteExercise,
  updateExercise,
  uploadExerciseImage,
  type ExerciseRow,
} from '../../lib/exercises'

interface Props {
  /** Exercise being edited; null = create mode. */
  exercise: ExerciseRow | null
  onSaved: () => void
  onClose: () => void
}

export const ExerciseFormSheet = forwardRef<BottomSheetModal, Props>(function ExerciseFormSheet(
  { exercise, onSaved, onClose },
  ref
) {
  const { theme } = useTheme()
  const editing = !!exercise

  const [name, setName] = useState('')
  const [muscle, setMuscle] = useState('')
  const [equipment, setEquipment] = useState<string | null>(null)
  const [difficulty, setDifficulty] = useState<string | null>(null)
  const [secondary, setSecondary] = useState('')
  const [instructions, setInstructions] = useState('')
  const [videoUrl, setVideoUrl] = useState('')
  const [gifUrl, setGifUrl] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    setSaving(false)
    setName(exercise?.name ?? '')
    setMuscle(exercise?.muscle_group ?? '')
    setEquipment(exercise?.equipment ?? null)
    setDifficulty(exercise?.difficulty ?? null)
    setSecondary(exercise?.secondary_muscles?.join(', ') ?? '')
    setInstructions(exercise?.instructions?.join('\n') ?? '')
    setVideoUrl(exercise?.video_url ?? '')
    setGifUrl(exercise?.gif_url ?? '')
    setImageUrl(exercise?.image_url ?? '')
  }, [exercise])

  async function save() {
    setError(null)
    if (name.trim().length < 2) { setError('El nombre debe tener al menos 2 caracteres.'); return }
    if (!muscle) { setError('Seleccioná un grupo muscular.'); return }
    setSaving(true)
    const input = {
      name: name.trim(),
      muscle_group: muscle,
      equipment,
      difficulty,
      secondary_muscles: secondary.split(',').map((s) => s.trim()).filter(Boolean),
      instructions: instructions.split('\n').map((s) => s.trim()).filter(Boolean),
      video_url: videoUrl.trim() || null,
      gif_url: gifUrl.trim() || null,
      image_url: imageUrl.trim() || null,
    }
    const res = editing ? await updateExercise(exercise!.id, input) : await createExercise(input)
    setSaving(false)
    if (!res.ok) { setError(res.error ?? 'No se pudo guardar.'); return }
    onSaved()
    ;(ref as React.RefObject<BottomSheetModal>).current?.dismiss()
  }

  async function remove() {
    if (!exercise) return
    setSaving(true)
    const res = await deleteExercise(exercise.id)
    setSaving(false)
    if (!res.ok) { setError(res.error ?? 'No se pudo eliminar.'); return }
    onSaved()
    ;(ref as React.RefObject<BottomSheetModal>).current?.dismiss()
  }

  return (
    <BottomSheetModal
      ref={ref}
      index={0}
      snapPoints={['90%']}
      enableDynamicSizing={false}
      enablePanDownToClose
      onDismiss={onClose}
      keyboardBehavior="interactive"
      android_keyboardInputMode="adjustResize"
      backgroundStyle={{ backgroundColor: theme.card }}
      handleIndicatorStyle={{ backgroundColor: theme.mutedForeground }}
    >
      <BottomSheetScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text className="text-strong font-display" style={styles.title}>
          {editing ? 'Editar ejercicio' : 'Nuevo ejercicio'}
        </Text>

        {error ? (
          <View className="border border-danger-500/30 bg-danger-100 dark:bg-danger-100/[0.18] rounded-control" style={styles.errorBox}>
            <Text className="text-danger-600 font-sans" style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <Input label="Nombre *" value={name} onChangeText={setName} placeholder="Ej: Press banca inclinado" />

        <Label>Grupo muscular *</Label>
        <Chips options={MUSCLE_GROUPS as readonly string[]} value={muscle} onSelect={setMuscle} />

        <Label>Equipo</Label>
        <Chips options={EQUIPMENT_OPTIONS as readonly string[]} value={equipment} onSelect={(v) => setEquipment(v === equipment ? null : v)} />

        <Label>Dificultad</Label>
        <SegmentedTabs
          items={DIFFICULTY_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          value={difficulty ?? ''}
          onChange={(v) => setDifficulty(v === difficulty ? null : v)}
        />

        <Input label="Músculos secundarios" value={secondary} onChangeText={setSecondary} placeholder="Tríceps, Deltoides (separados por coma)" />

        <Input label="Video (YouTube)" value={videoUrl} onChangeText={setVideoUrl} placeholder="https://youtu.be/..." autoCapitalize="none" keyboardType="url" />
        <Input label="GIF (URL)" value={gifUrl} onChangeText={setGifUrl} placeholder="https://..." autoCapitalize="none" keyboardType="url" />

        {/* E-F1: imagen desde el device */}
        <Label>Imagen del ejercicio</Label>
        <View style={styles.imgRow}>
          {imageUrl ? (
            <View>
              <Image source={{ uri: imageUrl }} style={[styles.imgThumb, { borderColor: theme.border }]} contentFit="cover" transition={150} />
              <TouchableOpacity onPress={() => setImageUrl('')} className="bg-cta-danger items-center justify-center" style={styles.imgClear} hitSlop={6}>
                <X size={12} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : null}
          <TouchableOpacity
            onPress={pickImage}
            disabled={uploading}
            activeOpacity={0.85}
            className="flex-1 flex-row items-center justify-center border border-sport-500/40 bg-sport-100 dark:bg-sport-100/20 rounded-control"
            style={styles.imgBtn}
          >
            {uploading ? <ActivityIndicator size="small" color={theme.primary} /> : <ImagePlus size={18} color={theme.primary} />}
            <Text className="text-sport-700 font-sans-semibold" style={styles.imgBtnText}>{uploading ? 'Subiendo…' : imageUrl ? 'Cambiar imagen' : 'Subir imagen'}</Text>
          </TouchableOpacity>
        </View>

        <Textarea
          label="Instrucciones"
          value={instructions}
          onChangeText={setInstructions}
          placeholder="Una instrucción por línea"
          minRows={4}
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
  title: { fontSize: 19, letterSpacing: -0.3 },
  errorBox: { paddingHorizontal: 12, paddingVertical: 10 },
  errorText: { fontSize: 13 },
  label: { fontSize: 13, marginTop: 4 },
  imgRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  imgThumb: { width: 64, height: 64, borderRadius: 14, borderWidth: 1 },
  imgClear: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10 },
  imgBtn: { gap: 8, paddingVertical: 12 },
  imgBtnText: { fontSize: 13 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 13, paddingVertical: 8 },
  chipText: { fontSize: 13 },
  saveWrap: { marginTop: 10 },
  removeWrap: { marginTop: 4 },
})
