import { useEffect, useRef, useState } from 'react'
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
import * as FileSystem from 'expo-file-system'
import * as ImageManipulator from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { Image } from 'expo-image'
import { ArrowLeft, ArrowRight, Camera, Check, Scale, Zap } from 'lucide-react-native'
import { MotiView } from 'moti'
import { supabase } from '../../../lib/supabase'
import { getClientProfile } from '../../../lib/client'
import { getTodayInSantiago, formatRelativeDate } from '../../../lib/date-utils'
import { useTheme } from '../../../context/ThemeContext'
import { Button, ScreenHeader } from '../../../components'

const MAX_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp']

interface LastCheckIn {
  weight: number | null
  energy_level: number | null
  date: string
}

export default function CheckInScreen() {
  const { theme } = useTheme()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [weight, setWeight] = useState('')
  const [energyLevel, setEnergyLevel] = useState<number | null>(null)
  const [frontPhotoUri, setFrontPhotoUri] = useState<string | null>(null)
  const [backPhotoUri, setBackPhotoUri] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [lastCheckIn, setLastCheckIn] = useState<LastCheckIn | null>(null)
  const scrollRef = useRef<ScrollView>(null)

  const { iso: todayIso } = getTodayInSantiago()

  useEffect(() => {
    loadLastCheckIn()
  }, [])

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true })
  }, [step])

  async function loadLastCheckIn() {
    const client = await getClientProfile()
    if (!client) return
    const { data } = await supabase
      .from('check_ins')
      .select('weight, energy_level, date')
      .eq('client_id', client.id)
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (data) setLastCheckIn(data as LastCheckIn)
  }

  async function pickAndCompressPhoto(type: 'front' | 'back') {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para seleccionar una foto.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: true,
      aspect: [3, 4],
    })
    if (result.canceled || !result.assets[0]) return

    const asset = result.assets[0]
    if (!ALLOWED_MIME.includes(asset.mimeType ?? '')) {
      Alert.alert('Formato no soportado', 'Solo JPG, PNG o WebP.')
      return
    }

    const compressed = await ImageManipulator.manipulateAsync(
      asset.uri,
      [{ resize: { width: 1920 } }],
      { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG }
    )

    const info = await FileSystem.getInfoAsync(compressed.uri)
    if (info.exists && 'size' in info && info.size > MAX_BYTES) {
      Alert.alert('Imagen muy grande', 'No se pudo comprimir suficiente. Intenta con otra imagen.')
      return
    }

    if (type === 'front') setFrontPhotoUri(compressed.uri)
    else setBackPhotoUri(compressed.uri)
  }

  async function uploadPhoto(uri: string, clientId: string, suffix: string): Promise<string | null> {
    const path = `${clientId}/${Date.now()}_${suffix}.jpg`
    const response = await fetch(uri)
    const blob = await response.blob()
    const arrayBuffer = await blob.arrayBuffer()

    const { error } = await supabase.storage
      .from('checkins')
      .upload(path, arrayBuffer, { contentType: 'image/jpeg', upsert: false })

    if (error) return null
    const { data } = supabase.storage.from('checkins').getPublicUrl(path)
    return data?.publicUrl ?? null
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

    const { data: { user } } = await supabase.auth.getUser()
    if (!user || user.id !== client.userId) {
      Alert.alert('Error de sesión', 'Inicia sesión de nuevo.')
      setSubmitting(false)
      return
    }

    let frontPhotoUrl: string | null = null
    let backPhotoUrl: string | null = null

    if (frontPhotoUri) frontPhotoUrl = await uploadPhoto(frontPhotoUri, client.id, 'front')
    if (backPhotoUri) backPhotoUrl = await uploadPhoto(backPhotoUri, client.id, 'back')

    const { error } = await supabase.from('check_ins').insert({
      client_id: client.id,
      date: new Date().toISOString(),
      weight: weight ? parseFloat(weight) : null,
      energy_level: energyLevel,
      front_photo_url: frontPhotoUrl,
      back_photo_url: backPhotoUrl,
      notes: notes.trim() || null,
    })

    setSubmitting(false)

    if (error) {
      Alert.alert('Error', 'No se pudo guardar el check-in. Intenta de nuevo.')
    } else {
      setDone(true)
      setStep(1)
      setWeight('')
      setEnergyLevel(null)
      setFrontPhotoUri(null)
      setBackPhotoUri(null)
      setNotes('')
      loadLastCheckIn()
    }
  }

  function canGoNext() {
    if (step === 1) return weight.length > 0
    return true
  }

  function goNext() {
    if (step === 1) setStep(2)
    else if (step === 2) setStep(3)
    else submit()
  }

  function goPrev() {
    if (step === 2) setStep(1)
    else if (step === 3) setStep(2)
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScreenHeader title="Check-in" subtitle="Registrá tu progreso semanal" />

        {/* Step dots */}
        <View style={styles.dotsRow}>
          {([1, 2, 3] as const).map((s) => (
            <MotiView
              key={s}
              animate={{ width: step === s ? 24 : 8, opacity: step >= s ? 1 : 0.35 }}
              transition={{ type: 'timing', duration: 250 }}
              style={[
                styles.dot,
                { backgroundColor: step >= s ? theme.primary : theme.border },
              ]}
            />
          ))}
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {done && (
            <MotiView
              from={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', damping: 14 }}
              style={[
                styles.successBanner,
                { backgroundColor: theme.success + '1A', borderColor: theme.success + '40', borderRadius: theme.radius.lg },
              ]}
            >
              <Check size={16} color={theme.success} strokeWidth={2.5} />
              <Text style={[styles.successText, { color: theme.success, fontFamily: 'Montserrat_700Bold' }]}>
                Check-in registrado
              </Text>
            </MotiView>
          )}

          {step === 1 && (
            <StepOne
              theme={theme}
              lastCheckIn={lastCheckIn}
              todayIso={todayIso}
              weight={weight}
              setWeight={setWeight}
              energyLevel={energyLevel}
              setEnergyLevel={setEnergyLevel}
            />
          )}

          {step === 2 && (
            <StepTwo
              theme={theme}
              frontPhotoUri={frontPhotoUri}
              backPhotoUri={backPhotoUri}
              onPickFront={() => pickAndCompressPhoto('front')}
              onPickBack={() => pickAndCompressPhoto('back')}
              onClearFront={() => setFrontPhotoUri(null)}
              onClearBack={() => setBackPhotoUri(null)}
            />
          )}

          {step === 3 && (
            <StepThree
              theme={theme}
              weight={weight}
              energyLevel={energyLevel}
              frontPhotoUri={frontPhotoUri}
              backPhotoUri={backPhotoUri}
              notes={notes}
              setNotes={setNotes}
            />
          )}
        </ScrollView>

        {/* Bottom nav */}
        <View style={[styles.navBar, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
          {step > 1 ? (
            <TouchableOpacity
              style={[styles.navBtnSecondary, { borderColor: theme.border, borderRadius: theme.radius.lg }]}
              onPress={goPrev}
              activeOpacity={0.75}
            >
              <ArrowLeft size={16} color={theme.foreground} strokeWidth={2} />
              <Text style={[styles.navBtnText, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Anterior</Text>
            </TouchableOpacity>
          ) : (
            <View style={{ flex: 1 }} />
          )}
          <Button
            label={step === 3 ? 'Enviar check-in' : 'Continuar'}
            rightIcon={step === 3 ? Check : ArrowRight}
            onPress={goNext}
            loading={submitting}
            disabled={!canGoNext()}
            size="lg"
            style={{ flex: 1 }}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function StepOne({
  theme, lastCheckIn, todayIso, weight, setWeight, energyLevel, setEnergyLevel,
}: {
  theme: any
  lastCheckIn: LastCheckIn | null
  todayIso: string
  weight: string
  setWeight: (v: string) => void
  energyLevel: number | null
  setEnergyLevel: (v: number | null) => void
}) {
  return (
    <View style={{ gap: 20 }}>
      {lastCheckIn && (
        <View style={[styles.lastCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
          <Text style={[styles.lastCardLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Último check-in — {formatRelativeDate(lastCheckIn.date.slice(0, 10), todayIso)}
          </Text>
          <View style={styles.lastCardRow}>
            {lastCheckIn.weight != null && (
              <View style={styles.lastCardItem}>
                <Scale size={13} color={theme.mutedForeground} strokeWidth={2} />
                <Text style={[styles.lastCardValue, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
                  {lastCheckIn.weight} kg
                </Text>
              </View>
            )}
            {lastCheckIn.energy_level != null && (
              <View style={styles.lastCardItem}>
                <Zap size={13} color={theme.mutedForeground} strokeWidth={2} />
                <Text style={[styles.lastCardValue, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
                  Energía {lastCheckIn.energy_level}/10
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      <Field label="Peso (kg) *" icon={Scale} theme={theme}>
        <TextInput
          style={[styles.input, { borderColor: theme.border, color: theme.foreground, backgroundColor: theme.secondary, borderRadius: theme.radius.lg, fontFamily: theme.fontSans }]}
          placeholder="75.5"
          placeholderTextColor={theme.mutedForeground}
          value={weight}
          onChangeText={setWeight}
          keyboardType="decimal-pad"
          autoFocus
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
                  { borderColor: selected ? theme.primary : theme.border, backgroundColor: selected ? theme.primary : theme.secondary, borderRadius: theme.radius.md },
                ]}
                onPress={() => setEnergyLevel(selected ? null : n)}
                activeOpacity={0.7}
              >
                <Text style={[styles.energyBtnText, { color: selected ? theme.primaryForeground : theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
                  {n}
                </Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </Field>
    </View>
  )
}

function StepTwo({
  theme, frontPhotoUri, backPhotoUri, onPickFront, onPickBack, onClearFront, onClearBack,
}: {
  theme: any
  frontPhotoUri: string | null
  backPhotoUri: string | null
  onPickFront: () => void
  onPickBack: () => void
  onClearFront: () => void
  onClearBack: () => void
}) {
  return (
    <View style={{ gap: 20 }}>
      <Text style={[styles.stepHeading, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
        Fotos de progreso
      </Text>
      <Text style={[styles.stepSubtext, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
        Las fotos son opcionales pero ayudan a visualizar tu progreso.
      </Text>

      <PhotoPickerSlot
        theme={theme}
        label="Foto frontal"
        uri={frontPhotoUri}
        onPick={onPickFront}
        onClear={onClearFront}
      />
      <PhotoPickerSlot
        theme={theme}
        label="Foto espalda"
        uri={backPhotoUri}
        onPick={onPickBack}
        onClear={onClearBack}
      />
    </View>
  )
}

function PhotoPickerSlot({
  theme, label, uri, onPick, onClear,
}: {
  theme: any
  label: string
  uri: string | null
  onPick: () => void
  onClear: () => void
}) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={[styles.label, { color: theme.foreground, fontFamily: theme.fontSans }]}>{label}</Text>
      {uri ? (
        <View style={[styles.photoPreviewWrap, { borderRadius: theme.radius.lg, borderColor: theme.border }]}>
          <Image source={{ uri }} style={styles.photoPreview} contentFit="cover" />
          <TouchableOpacity
            style={[styles.clearBtn, { backgroundColor: theme.destructive }]}
            onPress={onClear}
            activeOpacity={0.8}
          >
            <Text style={[styles.clearBtnText, { fontFamily: 'Montserrat_700Bold' }]}>✕ Quitar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.photoBtn, { borderColor: theme.border, backgroundColor: theme.secondary, borderRadius: theme.radius.lg }]}
          onPress={onPick}
          activeOpacity={0.75}
        >
          <Camera size={18} color={theme.mutedForeground} strokeWidth={2} />
          <Text style={[styles.photoBtnText, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>
            Seleccionar foto
          </Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

function StepThree({
  theme, weight, energyLevel, frontPhotoUri, backPhotoUri, notes, setNotes,
}: {
  theme: any
  weight: string
  energyLevel: number | null
  frontPhotoUri: string | null
  backPhotoUri: string | null
  notes: string
  setNotes: (v: string) => void
}) {
  return (
    <View style={{ gap: 20 }}>
      <Text style={[styles.stepHeading, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
        Resumen y notas
      </Text>

      {/* Summary card */}
      <View style={[styles.summaryCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
        <SummaryRow theme={theme} label="Peso" value={weight ? `${weight} kg` : '—'} />
        <SummaryRow theme={theme} label="Energía" value={energyLevel != null ? `${energyLevel}/10` : '—'} />
        <SummaryRow theme={theme} label="Foto frontal" value={frontPhotoUri ? '✓ Cargada' : 'Sin foto'} />
        <SummaryRow theme={theme} label="Foto espalda" value={backPhotoUri ? '✓ Cargada' : 'Sin foto'} />
      </View>

      <Field label="Notas (opcional)" theme={theme}>
        <TextInput
          style={[styles.notesInput, { borderColor: theme.border, color: theme.foreground, backgroundColor: theme.secondary, borderRadius: theme.radius.lg, fontFamily: theme.fontSans }]}
          placeholder="¿Cómo te sentiste esta semana?"
          placeholderTextColor={theme.mutedForeground}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </Field>
    </View>
  )
}

function SummaryRow({ theme, label, value }: { theme: any; label: string; value: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text style={[styles.summaryLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
      <Text style={[styles.summaryValue, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{value}</Text>
    </View>
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
        <Text style={[styles.label, { color: theme.foreground, fontFamily: theme.fontSans }]}>{label}</Text>
      </View>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 12 },
  dot: { height: 8, borderRadius: 4 },
  scroll: { paddingHorizontal: 20, paddingBottom: 24, gap: 0 },
  successBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1,
    paddingVertical: 14, paddingHorizontal: 16, justifyContent: 'center', marginBottom: 20,
  },
  successText: { fontSize: 14, letterSpacing: 0.3 },
  stepHeading: { fontSize: 18, letterSpacing: -0.3 },
  stepSubtext: { fontSize: 13, lineHeight: 20, marginTop: -12 },
  lastCard: { borderWidth: 1, padding: 14, gap: 8 },
  lastCardLabel: { fontSize: 12 },
  lastCardRow: { flexDirection: 'row', gap: 16 },
  lastCardItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  lastCardValue: { fontSize: 13 },
  field: { gap: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  label: { fontSize: 14, fontWeight: '500' },
  input: { borderWidth: 1, height: 48, paddingHorizontal: 16, fontSize: 15 },
  energyRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  energyBtn: { width: 42, height: 42, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  energyBtnText: { fontSize: 14 },
  photoBtn: {
    borderWidth: 1.5, borderStyle: 'dashed', paddingVertical: 22,
    alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
  },
  photoBtnText: { fontSize: 13, letterSpacing: 0.3 },
  photoPreviewWrap: { borderWidth: 1, overflow: 'hidden', gap: 0 },
  photoPreview: { width: '100%', height: 220 },
  clearBtn: { padding: 10, alignItems: 'center' },
  clearBtnText: { color: '#fff', fontSize: 13 },
  summaryCard: { borderWidth: 1, padding: 14, gap: 10 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryLabel: { fontSize: 13 },
  summaryValue: { fontSize: 13 },
  notesInput: { borderWidth: 1, padding: 14, fontSize: 14, minHeight: 110 },
  navBar: {
    flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  navBtnSecondary: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderWidth: 1, paddingVertical: 14,
  },
  navBtnText: { fontSize: 15 },
})
