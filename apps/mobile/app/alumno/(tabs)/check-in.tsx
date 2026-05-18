import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../../../lib/supabase'
import { getClientProfile } from '../../../lib/client'
import { useTheme } from '../../../context/ThemeContext'

export default function CheckInScreen() {
  const { theme } = useTheme()
  const [weight, setWeight] = useState('')
  const [energyLevel, setEnergyLevel] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [photoUri, setPhotoUri] = useState<string | null>(null)
  const [photoName, setPhotoName] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  async function pickPhoto() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para seleccionar una foto.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
      aspect: [3, 4],
    })
    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri)
      setPhotoName(`${Date.now()}.jpg`)
    }
  }

  async function submit() {
    if (submitting) return
    setSubmitting(true)

    const client = await getClientProfile()
    if (!client) {
      Alert.alert('Error', 'No se pudo obtener tu perfil.')
      setSubmitting(false)
      return
    }

    let frontPhotoUrl: string | null = null

    if (photoUri && photoName) {
      const path = `${client.id}/${photoName}`
      const response = await fetch(photoUri)
      const blob = await response.blob()
      const arrayBuffer = await blob.arrayBuffer()

      const { error: uploadError } = await supabase.storage
        .from('checkins')
        .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: false })

      if (!uploadError) {
        const { data: urlData } = supabase.storage.from('checkins').getPublicUrl(path)
        frontPhotoUrl = urlData?.publicUrl ?? null
      }
    }

    const { error } = await supabase.from('check_ins').insert({
      client_id: client.id,
      date: new Date().toISOString(),
      weight: weight ? parseFloat(weight) : null,
      energy_level: energyLevel,
      front_photo_url: frontPhotoUrl,
      notes: notes.trim() || null,
    })

    setSubmitting(false)

    if (error) {
      Alert.alert('Error', 'No se pudo guardar el check-in. Intenta de nuevo.')
    } else {
      setDone(true)
      setWeight('')
      setEnergyLevel(null)
      setNotes('')
      setPhotoUri(null)
      setPhotoName(null)
    }
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={[styles.title, { color: theme.text }]}>Check-in semanal</Text>

          {done && (
            <View style={[styles.successBanner, { backgroundColor: theme.success }]}>
              <Text style={styles.successText}>¡Check-in registrado!</Text>
            </View>
          )}

          {/* Photo */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: theme.muted }]}>Foto frontal</Text>
            <TouchableOpacity
              style={[
                styles.photoBtn,
                { borderColor: photoUri ? theme.success : theme.border, backgroundColor: theme.card },
              ]}
              onPress={pickPhoto}
              activeOpacity={0.7}
            >
              <Text style={[styles.photoBtnText, { color: photoUri ? theme.success : theme.muted }]}>
                {photoUri ? '✓ Foto seleccionada' : '+ Seleccionar foto'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Weight */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: theme.muted }]}>Peso (kg)</Text>
            <TextInput
              style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.card }]}
              placeholder="ej. 75.5"
              placeholderTextColor={theme.muted}
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
            />
          </View>

          {/* Energy level */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: theme.muted }]}>Nivel de energía (1–10)</Text>
            <View style={styles.energyRow}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <TouchableOpacity
                  key={n}
                  style={[
                    styles.energyBtn,
                    { borderColor: energyLevel === n ? theme.primary : theme.border, backgroundColor: energyLevel === n ? theme.primary : theme.card },
                  ]}
                  onPress={() => setEnergyLevel(energyLevel === n ? null : n)}
                >
                  <Text style={[styles.energyBtnText, { color: energyLevel === n ? '#fff' : theme.text }]}>
                    {n}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Notes */}
          <View style={styles.section}>
            <Text style={[styles.label, { color: theme.muted }]}>Notas (opcional)</Text>
            <TextInput
              style={[styles.notesInput, { borderColor: theme.border, color: theme.text, backgroundColor: theme.card }]}
              placeholder="¿Cómo te sentiste esta semana?"
              placeholderTextColor={theme.muted}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>

          <TouchableOpacity
            style={[styles.submitBtn, { backgroundColor: theme.primary, opacity: submitting ? 0.7 : 1 }]}
            onPress={submit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>Enviar check-in</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 40, gap: 20 },
  title: { fontSize: 24, fontWeight: '700' },
  successBanner: { borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  successText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  section: { gap: 8 },
  label: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  photoBtn: { borderWidth: 1.5, borderRadius: 12, borderStyle: 'dashed', paddingVertical: 20, alignItems: 'center' },
  photoBtnText: { fontSize: 15, fontWeight: '500' },
  input: { borderWidth: 1, borderRadius: 10, height: 48, paddingHorizontal: 14, fontSize: 16 },
  energyRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  energyBtn: { width: 40, height: 40, borderRadius: 8, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  energyBtnText: { fontSize: 14, fontWeight: '600' },
  notesInput: { borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15, minHeight: 96 },
  submitBtn: { borderRadius: 14, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
})
