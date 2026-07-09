import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import * as FileSystem from 'expo-file-system'
import * as ImageManipulator from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { decode } from 'base64-arraybuffer'
import { ArrowRight, Camera, Check, ChevronLeft, History, Lock, Minus, Plus, ShieldAlert, X } from 'lucide-react-native'
import { MotiView } from 'moti'
import { Confetti } from 'react-native-fast-confetti'
import { supabase } from '../../../lib/supabase'
import { clearAppBadge } from '../../../lib/badge'
import { getClientProfile } from '../../../lib/client'
import { getTodayInSantiago, formatRelativeDate } from '../../../lib/date-utils'
import { useTheme } from '../../../context/ThemeContext'
import { useEvaMotion } from '../../../lib/motion'
import { TYPE, FONT, textStyle } from '../../../lib/typography'
import { SHADOWS } from '../../../lib/shadows'
import { Button, Card, Textarea } from '../../../components'
import { AppBackground } from '../../../components/AppBackground'

const MAX_BYTES = 5 * 1024 * 1024

// Fixed DS neutrals for lucide `color` props (the shim/className cannot express
// a literal icon color) — mirror of the constants used across alumno screens.
const ICON_WHITE = '#FFFFFF'

interface LastCheckIn {
  weight: number | null
  energy_level: number | null
  date: string
}

export default function CheckInScreen() {
  const { theme, resolvedScheme } = useTheme()
  const motion = useEvaMotion()
  const router = useRouter()
  const [step, setStep] = useState<1 | 2 | 3>(1)
  // Peso: stepper +/- 0.1kg con default 70.0 (espejo web); se prellenar con el
  // ultimo check-in cuando carga (una sola vez, sin pisar edicion del alumno).
  const [weight, setWeight] = useState('70.0')
  const [energyLevel, setEnergyLevel] = useState<number | null>(7)
  const [frontPhotoUri, setFrontPhotoUri] = useState<string | null>(null)
  const [backPhotoUri, setBackPhotoUri] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [lastCheckIn, setLastCheckIn] = useState<LastCheckIn | null>(null)
  const prefilledRef = useRef(false)
  const scrollRef = useRef<ScrollView>(null)

  const { iso: todayIso } = getTodayInSantiago()

  useEffect(() => {
    loadLastCheckIn()
    // El check-in mensual es la accion pendiente que dispara el badge nativo (E4-18/E4-22):
    // abrir esta pantalla = el alumno la esta atendiendo, asi que limpiamos el badge.
    clearAppBadge()
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
    if (data) {
      setLastCheckIn(data as LastCheckIn)
      // Prefill una vez desde el ultimo check-in (parity web: arranca en el ultimo peso/energia).
      if (!prefilledRef.current) {
        prefilledRef.current = true
        const d = data as LastCheckIn
        if (d.weight != null) setWeight(d.weight.toFixed(1))
        if (d.energy_level != null) setEnergyLevel(d.energy_level)
      }
    }
  }

  // Comprime + valida tamaño + setea (se re-encoda a JPEG, así que la fuente puede ser cámara o galería).
  async function processAsset(asset: ImagePicker.ImagePickerAsset, type: 'front' | 'back') {
    // NO pre-filtramos por mime: el re-encode a JPEG de abajo normaliza cualquier formato,
    // incluido HEIC de iPhone (bloquearlo antes rompía a los alumnos con cámara Apple). Solo
    // rechazamos algo declarado que NO sea imagen.
    if (asset.mimeType && !asset.mimeType.startsWith('image/')) {
      Alert.alert('Archivo no soportado', 'Seleccioná una imagen.')
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

  async function pickFromGallery(type: 'front' | 'back') {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galería para seleccionar una foto.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsEditing: true, aspect: [3, 4] })
    if (result.canceled || !result.assets[0]) return
    await processAsset(result.assets[0], type)
  }

  // Cámara nativa (expo-image-picker; permiso NSCameraUsageDescription ya declarado).
  async function takePhoto(type: 'front' | 'back') {
    const { status } = await ImagePicker.requestCameraPermissionsAsync()
    if (status !== 'granted') {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a la cámara para tomar la foto.')
      return
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 1, allowsEditing: true, aspect: [3, 4] })
    if (result.canceled || !result.assets[0]) return
    await processAsset(result.assets[0], type)
  }

  function choosePhotoSource(type: 'front' | 'back') {
    Alert.alert('Foto de progreso', '¿Cómo querés agregarla?', [
      { text: 'Tomar foto', onPress: () => takePhoto(type) },
      { text: 'Elegir de galería', onPress: () => pickFromGallery(type) },
      { text: 'Cancelar', style: 'cancel' },
    ])
  }

  // Sube la foto al bucket privado `checkins` y devuelve el PATH del objeto (no la URL
  // pública: el bucket es privado desde jun-2026 → getPublicUrl daría 403; las vistas del
  // coach resuelven signed URLs). Best-effort: si falla loguea y devuelve null, el check-in
  // se guarda igual sin la foto (perder el reporte one-shot es peor que perder una foto).
  async function uploadPhoto(uri: string, clientId: string, suffix: string): Promise<string | null> {
    const path = `${clientId}/${Date.now()}_${suffix}.jpg`
    try {
      // Blob.arrayBuffer() NO es confiable en RN (sube 0 bytes / lanza). Patrón canónico del
      // repo (coach-brand / exercises): ImageManipulator con base64 + decode() a ArrayBuffer.
      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [],
        { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      )
      if (!manipulated.base64) {
        console.warn('[checkin] no se pudo procesar la foto, guardando check-in sin ella:', suffix)
        return null
      }
      const { error } = await supabase.storage
        .from('checkins')
        .upload(path, decode(manipulated.base64), { contentType: 'image/jpeg', upsert: false })
      if (error) {
        console.warn('[checkin] fallo al subir la foto, guardando check-in sin ella:', error.message)
        return null
      }
      return path
    } catch (e: any) {
      console.warn('[checkin] error al subir la foto, guardando check-in sin ella:', e?.message ?? e)
      return null
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

    const { data: { user } } = await supabase.auth.getUser()
    if (!user || user.id !== client.userId) {
      Alert.alert('Error de sesión', 'Inicia sesión de nuevo.')
      setSubmitting(false)
      return
    }

    // Se guardan los PATH de storage (bucket privado); front_photo_url/back_photo_url son
    // la columna, no una URL. Best-effort: si una foto no sube, se cuenta y se avisa al final.
    let frontPhotoPath: string | null = null
    let backPhotoPath: string | null = null
    let droppedPhotos = 0

    if (frontPhotoUri) {
      frontPhotoPath = await uploadPhoto(frontPhotoUri, client.id, 'front')
      if (!frontPhotoPath) droppedPhotos++
    }
    if (backPhotoUri) {
      backPhotoPath = await uploadPhoto(backPhotoUri, client.id, 'back')
      if (!backPhotoPath) droppedPhotos++
    }

    const { error } = await supabase.from('check_ins').insert({
      client_id: client.id,
      date: getTodayInSantiago().iso,
      weight: weight ? parseFloat(weight) : null,
      energy_level: energyLevel,
      front_photo_url: frontPhotoPath,
      back_photo_url: backPhotoPath,
      notes: notes.trim() || null,
    })

    setSubmitting(false)

    if (error) {
      Alert.alert('Error', 'No se pudo guardar el check-in. Intenta de nuevo.')
    } else {
      setDone(true) // celebración: confetti + pantalla de éxito se montan con `done`
      setStep(1)
      setFrontPhotoUri(null)
      setBackPhotoUri(null)
      setNotes('')
      prefilledRef.current = false
      loadLastCheckIn()
      // El check-in NUNCA se aborta por una foto, pero sí avisamos si alguna no subió.
      if (droppedPhotos > 0) {
        Alert.alert(
          'Check-in guardado',
          droppedPhotos === 1
            ? 'Tu check-in se guardó, pero una foto no pudo subirse. Podés volver a intentarlo en el próximo check-in.'
            : 'Tu check-in se guardó, pero las fotos no pudieron subirse. Podés volver a intentarlo en el próximo check-in.'
        )
      }
    }
  }

  function adjustWeight(delta: number) {
    setWeight((w) => Math.max(0, (parseFloat(w) || 0) + delta).toFixed(1))
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

  // ---- Pantalla de éxito (espejo web: wave + confetti + volver al inicio) ----
  if (done) {
    return (
      <SafeAreaView style={styles.container} className="bg-surface-app">
        <AppBackground />
        {!motion.reduced ? (
          <Confetti autoplay fadeOutOnEnd colors={[theme.primary, '#F59E0B', '#10B981', theme.cyan]} />
        ) : null}
        <View style={styles.successWrap}>
          <MotiView
            from={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', damping: 13, stiffness: 180 }}
            className="bg-success-500"
            style={[styles.successCircle, SHADOWS[resolvedScheme].lg]}
          >
            <Check size={44} color={ICON_WHITE} strokeWidth={2.5} />
          </MotiView>
          <Text className="text-strong" style={[TYPE.h2, styles.successTitle]}>
            ¡Check-in enviado!
          </Text>
          <Text className="text-muted" style={[TYPE.body, styles.successMsg]}>
            Tu coach recibió tu actualización. Ajustará tu plan según tu progreso.
          </Text>
          <Button
            label="Volver al inicio"
            variant="sport"
            size="lg"
            onPress={() => {
              setDone(false)
              router.push('/alumno/home')
            }}
            style={styles.successBtn}
            testID="checkin-success-home"
          />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container} className="bg-surface-app">
      <AppBackground />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        {/* TopBar: eyebrow "Paso X de 3" + titulo (espejo web) */}
        <View style={styles.topBar}>
          <Text className="text-muted" style={TYPE.eyebrow}>
            Paso {step} de 3
          </Text>
          <Text className="text-strong" style={textStyle('2xl', FONT.displayBold, { lh: 'tight', ls: 'tighter' })}>
            Check-in mensual
          </Text>
        </View>

        {/* Stepper (3 barras, activa mas ancha) */}
        <View style={styles.stepperRow}>
          {([1, 2, 3] as const).map((s) => (
            <MotiView
              key={s}
              animate={{ flex: s === step ? 1.6 : 1 }}
              transition={{ type: 'spring', damping: 18, stiffness: 200 }}
              className={s <= step ? 'bg-sport-500' : 'bg-surface-sunken'}
              style={styles.stepSeg}
            />
          ))}
        </View>

        {/* Disclaimer medico */}
        <View className="border border-warning-500 bg-warning-100" style={styles.disclaimer}>
          <ShieldAlert size={15} color={resolvedScheme === 'dark' ? '#FFC861' : '#A8690A'} strokeWidth={2} />
          <Text className="text-warning-600" style={[textStyle('3xs', FONT.uiMedium, { lh: 'snug' }), { flex: 1 }]}>
            EVA no es un dispositivo médico ni sustituye consejo profesional.
          </Text>
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 1 && (
            <StepOne
              theme={theme}
              lastCheckIn={lastCheckIn}
              todayIso={todayIso}
              weight={weight}
              adjustWeight={adjustWeight}
              energyLevel={energyLevel}
              setEnergyLevel={setEnergyLevel}
              onNext={goNext}
            />
          )}

          {step === 2 && (
            <StepTwo
              theme={theme}
              resolvedScheme={resolvedScheme}
              frontPhotoUri={frontPhotoUri}
              backPhotoUri={backPhotoUri}
              onPickFront={() => choosePhotoSource('front')}
              onPickBack={() => choosePhotoSource('back')}
              onClearFront={() => setFrontPhotoUri(null)}
              onClearBack={() => setBackPhotoUri(null)}
              onNext={goNext}
              onPrev={goPrev}
            />
          )}

          {step === 3 && (
            <StepThree
              weight={weight}
              energyLevel={energyLevel}
              frontPhotoUri={frontPhotoUri}
              backPhotoUri={backPhotoUri}
              notes={notes}
              setNotes={setNotes}
              submitting={submitting}
              onSubmit={goNext}
              onPrev={goPrev}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function StepOne({
  theme, lastCheckIn, todayIso, weight, adjustWeight, energyLevel, setEnergyLevel, onNext,
}: {
  theme: any
  lastCheckIn: LastCheckIn | null
  todayIso: string
  weight: string
  adjustWeight: (delta: number) => void
  energyLevel: number | null
  setEnergyLevel: (v: number | null) => void
  onNext: () => void
}) {
  return (
    <View style={{ gap: 14 }}>
      {/* Ultimo check-in (o primer check-in) */}
      <Card variant="sunken" padding="md" style={styles.lastCard}>
        <View className="bg-surface-card" style={styles.lastChip}>
          <History size={18} color={theme.primary} strokeWidth={2} />
        </View>
        <View style={{ flex: 1 }}>
          {lastCheckIn ? (
            <>
              <Text className="text-muted" style={textStyle('3xs', FONT.uiBold)}>Tu último check-in</Text>
              <Text className="text-strong" style={textStyle('xs', FONT.uiSemibold)}>
                {lastCheckIn.weight != null ? `${lastCheckIn.weight} kg` : '—'} · Energía{' '}
                {lastCheckIn.energy_level ?? '—'}/10 · {formatRelativeDate(lastCheckIn.date.slice(0, 10), todayIso)}
              </Text>
            </>
          ) : (
            <>
              <Text className="text-muted" style={textStyle('3xs', FONT.uiBold)}>Tu primer check-in</Text>
              <Text className="text-strong" style={textStyle('xs', FONT.uiSemibold)}>
                Registra peso y energía para empezar.
              </Text>
            </>
          )}
        </View>
      </Card>

      {/* Peso actual */}
      <Card padding="lg" style={{ gap: 14 }}>
        <Text className="text-strong" style={textStyle('xs', FONT.uiSemibold)}>Peso actual</Text>
        <View style={styles.weightRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Menos"
            onPress={() => adjustWeight(-0.1)}
            className="bg-surface-card border-[1.5px] border-default"
            style={styles.stepBtn}
            testID="weight-minus"
          >
            <Minus size={20} color={theme.foreground} strokeWidth={2} />
          </Pressable>
          <View style={styles.weightValueRow}>
            <Text className="text-strong" style={[TYPE.display, { fontVariant: ['tabular-nums'] }]}>{weight}</Text>
            <Text className="text-muted" style={textStyle('lg', FONT.uiSemibold)}>kg</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Más"
            onPress={() => adjustWeight(0.1)}
            className="bg-surface-card border-[1.5px] border-default"
            style={styles.stepBtn}
            testID="weight-plus"
          >
            <Plus size={20} color={theme.foreground} strokeWidth={2} />
          </Pressable>
        </View>
      </Card>

      {/* Nivel de energia */}
      <Card padding="lg" style={{ gap: 14 }}>
        <View style={styles.energyHead}>
          <Text className="text-strong" style={textStyle('xs', FONT.uiSemibold)}>Nivel de energía</Text>
          <Text className="text-sport-600" style={textStyle('md', FONT.displayBold, { ls: 'tighter' })}>
            {energyLevel ?? '—'}
            <Text className="text-muted" style={textStyle('2xs', FONT.uiSemibold)}>/10</Text>
          </Text>
        </View>
        {/* RN no tiene primitiva Slider en el DS → selector segmentado 1-10 (mismo rango que el slider web). */}
        <View style={styles.energyRow}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
            const selected = energyLevel === n
            return (
              <Pressable
                key={n}
                onPress={() => setEnergyLevel(selected ? null : n)}
                className={selected ? 'bg-sport-500 border-[1.5px] border-sport-500' : 'bg-surface-card border-[1.5px] border-default'}
                style={styles.energyBtn}
                testID={`energy-${n}`}
              >
                <Text
                  className={selected ? 'text-on-sport' : 'text-strong'}
                  style={textStyle('sm', FONT.uiBold)}
                >
                  {n}
                </Text>
              </Pressable>
            )
          })}
        </View>
      </Card>

      <Button
        label="Continuar"
        rightIcon={ArrowRight}
        variant="sport"
        size="lg"
        full
        onPress={onNext}
        disabled={!weight}
        testID="checkin-continue"
      />
    </View>
  )
}

function StepTwo({
  theme, resolvedScheme, frontPhotoUri, backPhotoUri, onPickFront, onPickBack, onClearFront, onClearBack, onNext, onPrev,
}: {
  theme: any
  resolvedScheme: 'light' | 'dark'
  frontPhotoUri: string | null
  backPhotoUri: string | null
  onPickFront: () => void
  onPickBack: () => void
  onClearFront: () => void
  onClearBack: () => void
  onNext: () => void
  onPrev: () => void
}) {
  return (
    <View style={{ gap: 14 }}>
      <Text className="text-muted" style={[TYPE.body, { lineHeight: 21 }]}>
        Las fotos son opcionales pero ayudan a tu coach a ver tu evolución.
      </Text>

      <View style={styles.photoRow}>
        <PhotoPickerSlot
          theme={theme}
          label="Foto frontal"
          uri={frontPhotoUri}
          onPick={onPickFront}
          onClear={onClearFront}
          testID="photo-front"
        />
        <PhotoPickerSlot
          theme={theme}
          label="Espalda o perfil"
          uri={backPhotoUri}
          onPick={onPickBack}
          onClear={onClearBack}
          testID="photo-back"
        />
      </View>

      {/* Nota de privacidad */}
      <View style={styles.privacyRow}>
        <Lock size={13} color={theme.mutedForeground} strokeWidth={2} />
        <Text className="text-subtle" style={textStyle('3xs', FONT.ui)}>
          JPG, PNG o WEBP · máx 5 MB · privadas, solo tu coach las ve.
        </Text>
      </View>

      <View style={styles.navRow}>
        <Button label="Atrás" leftIcon={ChevronLeft} variant="secondary" size="lg" onPress={onPrev} testID="checkin-back" />
        <Button label="Continuar" rightIcon={ArrowRight} variant="sport" size="lg" onPress={onNext} style={{ flex: 1 }} testID="checkin-continue" />
      </View>
    </View>
  )
}

function PhotoPickerSlot({
  theme, label, uri, onPick, onClear, testID,
}: {
  theme: any
  label: string
  uri: string | null
  onPick: () => void
  onClear: () => void
  testID?: string
}) {
  return (
    <Pressable
      className={uri ? 'border-2 border-sport-500' : 'border-2 border-dashed border-default bg-surface-sunken'}
      style={styles.photoSlot}
      onPress={uri ? undefined : onPick}
      testID={testID}
    >
      {uri ? (
        <>
          <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          <Pressable
            className="bg-danger-500"
            style={styles.clearBtn}
            onPress={onClear}
            hitSlop={8}
            testID={`${testID}-clear`}
          >
            <X size={16} color={ICON_WHITE} strokeWidth={2.5} />
          </Pressable>
          <View style={styles.photoLabelStrip}>
            <Text style={[textStyle('3xs', FONT.uiBold), { color: ICON_WHITE }]}>{label}</Text>
          </View>
        </>
      ) : (
        <>
          <Camera size={28} color={theme.mutedForeground} strokeWidth={2} />
          <Text className="text-body" style={textStyle('2xs', FONT.uiBold)}>{label}</Text>
          <Text className="text-subtle" style={textStyle('3xs', FONT.ui)}>Opcional · toca para subir</Text>
        </>
      )}
    </Pressable>
  )
}

function StepThree({
  weight, energyLevel, frontPhotoUri, backPhotoUri, notes, setNotes, submitting, onSubmit, onPrev,
}: {
  weight: string
  energyLevel: number | null
  frontPhotoUri: string | null
  backPhotoUri: string | null
  notes: string
  setNotes: (v: string) => void
  submitting: boolean
  onSubmit: () => void
  onPrev: () => void
}) {
  const photoCount = [frontPhotoUri, backPhotoUri].filter(Boolean).length
  return (
    <View style={{ gap: 16 }}>
      <Textarea
        label="Notas para tu coach"
        placeholder="Cómo te sentiste, sueño, comentarios…"
        value={notes}
        onChangeText={setNotes}
        maxLength={1000}
        showCount
        minRows={4}
        testID="notes-input"
      />

      {/* Resumen */}
      <Card variant="sunken" padding="md" style={{ gap: 10 }}>
        <Text className="text-muted" style={TYPE.eyebrow}>Resumen</Text>
        <View style={styles.summaryRow}>
          <SummaryMetric label="Peso" value={weight ? `${weight} kg` : '—'} />
          <SummaryMetric label="Energía" value={energyLevel != null ? `${energyLevel}/10` : '—'} />
          <SummaryMetric label="Fotos" value={`${photoCount} adj.`} />
        </View>
      </Card>

      <View style={styles.navRow}>
        <Button label="Atrás" leftIcon={ChevronLeft} variant="secondary" size="lg" disabled={submitting} onPress={onPrev} testID="checkin-back" />
        <Button
          label="Enviar check-in"
          rightIcon={Check}
          variant="sport"
          size="lg"
          loading={submitting}
          onPress={onSubmit}
          style={{ flex: 1 }}
          testID="checkin-submit"
        />
      </View>
    </View>
  )
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryMetric}>
      <Text className="text-strong" style={[textStyle('lg', FONT.displayBold, { ls: 'tighter' }), { fontVariant: ['tabular-nums'] }]}>{value}</Text>
      <Text className="text-muted" style={textStyle('3xs', FONT.uiSemibold)}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6, gap: 2 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 20, paddingVertical: 10 },
  stepSeg: { height: 6, borderRadius: 999 },
  disclaimer: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginBottom: 12,
    paddingHorizontal: 12, paddingVertical: 10, borderRadius: 14,
  },
  scroll: { paddingHorizontal: 20, paddingBottom: 32 },
  lastCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lastChip: { width: 38, height: 38, borderRadius: 999, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  weightRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  weightValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  stepBtn: { width: 48, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  energyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  energyRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  energyBtn: { width: 42, height: 42, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  photoRow: { flexDirection: 'row', gap: 10 },
  photoSlot: {
    flex: 1, aspectRatio: 3 / 4, borderRadius: 14, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  clearBtn: { position: 'absolute', top: 8, right: 8, width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  photoLabelStrip: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center' },
  privacyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryMetric: { flex: 1, alignItems: 'center', gap: 2 },
  navRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  successWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 48 },
  successCircle: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  successTitle: { textAlign: 'center' },
  successMsg: { textAlign: 'center', marginTop: 8, maxWidth: 300 },
  successBtn: { marginTop: 28, width: '100%', maxWidth: 300 },
})
