import { useState } from 'react'
import {
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
import { ArrowRight, Camera, Check, Image as ImageIcon, Scale, Zap } from 'lucide-react-native'
import { MotiView } from 'moti'
import { supabase } from '../../../lib/supabase'
import { getClientProfile } from '../../../lib/client'
import { useTheme } from '../../../context/ThemeContext'
import { Button, ScreenHeader } from '../../../components'

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
        <ScreenHeader
          title="Check-in"
          subtitle="Registrá tu progreso semanal"
        />
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {done && (
            <MotiView
              from={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', damping: 14 }}
              style={[
                styles.successBanner,
                {
                  backgroundColor: theme.success + '1A',
                  borderColor: theme.success + '40',
                  borderRadius: theme.radius.lg,
                },
              ]}
            >
              <Check size={16} color={theme.success} strokeWidth={2.5} />
              <Text style={[styles.successText, { color: theme.success, fontFamily: 'Montserrat_700Bold' }]}>
                Check-in registrado
              </Text>
            </MotiView>
          )}

          <Field label="Foto frontal" icon={Camera} theme={theme}>
            <TouchableOpacity
              style={[
                styles.photoBtn,
                {
                  borderColor: photoUri ? theme.success : theme.border,
                  backgroundColor: photoUri ? theme.success + '0D' : theme.secondary,
                  borderRadius: theme.radius.lg,
                },
              ]}
              onPress={pickPhoto}
              activeOpacity={0.75}
            >
              {photoUri ? (
                <Check size={18} color={theme.success} strokeWidth={2.25} />
              ) : (
                <ImageIcon size={18} color={theme.mutedForeground} strokeWidth={2} />
              )}
              <Text
                style={[
                  styles.photoBtnText,
                  {
                    color: photoUri ? theme.success : theme.mutedForeground,
                    fontFamily: 'Montserrat_700Bold',
                  },
                ]}
              >
                {photoUri ? 'Foto seleccionada · cambiar' : 'Seleccionar foto'}
              </Text>
            </TouchableOpacity>
          </Field>

          <Field label="Peso (kg)" icon={Scale} theme={theme}>
            <TextInput
              style={[
                styles.input,
                {
                  borderColor: theme.border,
                  color: theme.foreground,
                  backgroundColor: theme.secondary,
                  borderRadius: theme.radius.lg,
                  fontFamily: theme.fontSans,
                },
              ]}
              placeholder="75.5"
              placeholderTextColor={theme.mutedForeground}
              value={weight}
              onChangeText={setWeight}
              keyboardType="decimal-pad"
            />
          </Field>

          <Field label="Nivel de energía (1–10)" icon={Zap} theme={theme}>
            <View style={styles.energyRow}>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
                const selected = energyLevel === n
                return (
                  <TouchableOpacity
                    key={n}
                    style={[
                      styles.energyBtn,
                      {
                        borderColor: selected ? theme.primary : theme.border,
                        backgroundColor: selected ? theme.primary : theme.secondary,
                        borderRadius: theme.radius.md,
                      },
                    ]}
                    onPress={() => setEnergyLevel(selected ? null : n)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.energyBtnText,
                        {
                          color: selected ? theme.primaryForeground : theme.foreground,
                          fontFamily: 'Montserrat_700Bold',
                        },
                      ]}
                    >
                      {n}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </Field>

          <Field label="Notas (opcional)" theme={theme}>
            <TextInput
              style={[
                styles.notesInput,
                {
                  borderColor: theme.border,
                  color: theme.foreground,
                  backgroundColor: theme.secondary,
                  borderRadius: theme.radius.lg,
                  fontFamily: theme.fontSans,
                },
              ]}
              placeholder="¿Cómo te sentiste esta semana?"
              placeholderTextColor={theme.mutedForeground}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </Field>

          <Button
            label="Enviar check-in"
            rightIcon={ArrowRight}
            onPress={submit}
            loading={submitting}
            full
            size="lg"
            style={{ marginTop: 8 }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function Field({
  label,
  icon: Icon,
  theme,
  children,
}: {
  label: string
  icon?: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>
  theme: any
  children: React.ReactNode
}) {
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        {Icon ? <Icon size={14} color={theme.mutedForeground} strokeWidth={2} /> : null}
        <Text style={[styles.label, { color: theme.foreground, fontFamily: theme.fontSans }]}>
          {label}
        </Text>
      </View>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingBottom: 40, gap: 20 },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  successText: { fontSize: 14, letterSpacing: 0.3 },
  field: { gap: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 14, fontWeight: '500' },
  photoBtn: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    paddingVertical: 22,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  photoBtnText: { fontSize: 13, letterSpacing: 0.3 },
  input: {
    borderWidth: 1,
    height: 48,
    paddingHorizontal: 16,
    fontSize: 15,
  },
  energyRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  energyBtn: {
    width: 42,
    height: 42,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  energyBtnText: { fontSize: 14 },
  notesInput: {
    borderWidth: 1,
    padding: 14,
    fontSize: 14,
    minHeight: 110,
  },
})
