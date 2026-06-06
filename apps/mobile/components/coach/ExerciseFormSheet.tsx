import { forwardRef, useEffect, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { BottomSheetModal, BottomSheetScrollView } from '@gorhom/bottom-sheet'
import { Image } from 'expo-image'
import * as ImagePicker from 'expo-image-picker'
import { ImagePlus, Trash2, X } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
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
        <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
          {editing ? 'Editar ejercicio' : 'Nuevo ejercicio'}
        </Text>

        {error ? (
          <View style={[styles.errorBox, { borderColor: theme.destructive + '55', backgroundColor: theme.destructive + '14' }]}>
            <Text style={{ color: theme.destructive, fontSize: 13, fontFamily: theme.fontSans }}>{error}</Text>
          </View>
        ) : null}

        <Field theme={theme} label="Nombre *" value={name} onChangeText={setName} placeholder="Ej: Press banca inclinado" />

        <Label theme={theme}>Grupo muscular *</Label>
        <Chips theme={theme} options={MUSCLE_GROUPS as readonly string[]} value={muscle} onSelect={setMuscle} />

        <Label theme={theme}>Equipo</Label>
        <Chips theme={theme} options={EQUIPMENT_OPTIONS as readonly string[]} value={equipment} onSelect={(v) => setEquipment(v === equipment ? null : v)} />

        <Label theme={theme}>Dificultad</Label>
        <Segmented theme={theme} options={DIFFICULTY_OPTIONS} value={difficulty} onChange={(v) => setDifficulty(v === difficulty ? null : v)} />

        <Field theme={theme} label="Músculos secundarios" value={secondary} onChangeText={setSecondary} placeholder="Tríceps, Deltoides (separados por coma)" />

        <Field theme={theme} label="Video (YouTube)" value={videoUrl} onChangeText={setVideoUrl} placeholder="https://youtu.be/..." autoCapitalize="none" keyboardType="url" />
        <Field theme={theme} label="GIF (URL)" value={gifUrl} onChangeText={setGifUrl} placeholder="https://..." autoCapitalize="none" keyboardType="url" />

        {/* E-F1: imagen desde el device */}
        <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Imagen del ejercicio</Text>
        <View style={styles.imgRow}>
          {imageUrl ? (
            <View>
              <Image source={{ uri: imageUrl }} style={[styles.imgThumb, { borderColor: theme.border }]} contentFit="cover" transition={150} />
              <TouchableOpacity onPress={() => setImageUrl('')} style={[styles.imgClear, { backgroundColor: theme.destructive }]} hitSlop={6}>
                <X size={12} color="#fff" />
              </TouchableOpacity>
            </View>
          ) : null}
          <TouchableOpacity onPress={pickImage} disabled={uploading} activeOpacity={0.85}
            style={[styles.imgBtn, { borderColor: theme.primary + '55', backgroundColor: theme.primary + '12' }]}>
            {uploading ? <ActivityIndicator size="small" color={theme.primary} /> : <ImagePlus size={18} color={theme.primary} />}
            <Text style={[styles.imgBtnText, { color: theme.primary, fontFamily: 'Inter_600SemiBold' }]}>{uploading ? 'Subiendo…' : imageUrl ? 'Cambiar imagen' : 'Subir imagen'}</Text>
          </TouchableOpacity>
        </View>

        <Field theme={theme} label="Instrucciones" value={instructions} onChangeText={setInstructions} placeholder="Una instrucción por línea" multiline />

        <TouchableOpacity onPress={save} disabled={saving} activeOpacity={0.85}
          style={[styles.saveBtn, { backgroundColor: theme.primary, opacity: saving ? 0.6 : 1 }]}>
          {saving ? <ActivityIndicator color={theme.primaryForeground} size="small" /> : (
            <Text style={[styles.saveText, { color: theme.primaryForeground, fontFamily: 'Montserrat_700Bold' }]}>
              {editing ? 'Guardar cambios' : 'Crear ejercicio'}
            </Text>
          )}
        </TouchableOpacity>

        {editing ? (
          <TouchableOpacity onPress={remove} disabled={saving} activeOpacity={0.8}
            style={[styles.removeBtn, { borderColor: theme.destructive + '55' }]}>
            <Trash2 size={16} color={theme.destructive} />
            <Text style={[styles.removeText, { color: theme.destructive, fontFamily: 'Montserrat_700Bold' }]}>Eliminar ejercicio</Text>
          </TouchableOpacity>
        ) : null}
      </BottomSheetScrollView>
    </BottomSheetModal>
  )
})

function Label({ children, theme }: { children: React.ReactNode; theme: any }) {
  return <Text style={[styles.label, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{children}</Text>
}

function Field({ theme, label, multiline, ...rest }: any) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
      <TextInput placeholderTextColor={theme.mutedForeground} multiline={multiline}
        style={[styles.input, multiline && { height: 92, textAlignVertical: 'top', paddingTop: 10 }, { borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: theme.fontSans }]} {...rest} />
    </View>
  )
}

function Chips({ theme, options, value, onSelect }: { theme: any; options: readonly string[]; value: string | null; onSelect: (v: string) => void }) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const active = o === value
        return (
          <TouchableOpacity key={o} onPress={() => onSelect(o)} activeOpacity={0.8}
            style={[styles.chip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary + '1A' : 'transparent' }]}>
            <Text style={{ fontSize: 13, fontFamily: 'Inter_600SemiBold', color: active ? theme.primary : theme.mutedForeground }}>{o}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

function Segmented({ theme, options, value, onChange }: { theme: any; options: readonly { value: string; label: string }[]; value: string | null; onChange: (v: string) => void }) {
  return (
    <View style={[styles.segmented, { backgroundColor: theme.secondary, borderColor: theme.border }]}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <TouchableOpacity key={o.value} onPress={() => onChange(o.value)} activeOpacity={0.8}
            style={[styles.segItem, active && { backgroundColor: theme.primary }]}>
            <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: active ? theme.primaryForeground : theme.mutedForeground }}>{o.label}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 18, paddingBottom: 48, gap: 12 },
  title: { fontSize: 18 },
  errorBox: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  label: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 4 },
  fieldLabel: { fontSize: 12 },
  imgRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  imgThumb: { width: 64, height: 64, borderRadius: 10, borderWidth: 1 },
  imgClear: { position: 'absolute', top: -6, right: -6, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  imgBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingVertical: 12 },
  imgBtnText: { fontSize: 13 },
  input: { height: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 8 },
  segmented: { flexDirection: 'row', borderWidth: 1, borderRadius: 10, padding: 3, gap: 3 },
  segItem: { flex: 1, paddingVertical: 9, alignItems: 'center', borderRadius: 8 },
  saveBtn: { height: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  saveText: { fontSize: 15 },
  removeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingVertical: 13, marginTop: 4 },
  removeText: { fontSize: 14 },
})
