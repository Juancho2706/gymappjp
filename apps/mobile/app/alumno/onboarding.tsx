import { useCallback, useEffect, useRef, useState } from 'react'
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import type { ScrollView as ScrollViewType } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { AnimatePresence, MotiView } from 'moti'
import { ArrowLeft, ArrowRight, Check, Ruler, Scale } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { supabase } from '../../lib/supabase'
import { Button, Input, Textarea } from '../../components'
import { AppBackground } from '../../components/AppBackground'
import { FONT, TYPE } from '../../lib/typography'
import { submitIntake } from '../../lib/alumno-onboarding'

// Wizard de intake — espejo del web `c/[coach_slug]/onboarding` (OnboardingForm.tsx):
// 3 pasos, barra de progreso segmentada animada, transiciones direccionales
// (AnimatePresence mode="wait" → moti exitBeforeEnter) y draft persistido para
// retomar donde se quedo (web = localStorage; RN = AsyncStorage).

const DRAFT_KEY_PREFIX = 'onboarding_draft'
const TERMS_URL = 'https://eva-app.cl/legal/terms'
const PRIVACY_URL = 'https://eva-app.cl/legal/privacy'

type Option = { value: string; label: string }

// Valores exactos del web (se persisten en client_intake); labels abreviados como en web.
const GOAL_OPTIONS: Option[] = [
  { value: 'Perder grasa', label: 'Perder grasa' },
  { value: 'Aumentar masa muscular', label: 'Masa muscular' },
  { value: 'Recomposición corporal', label: 'Recomposición' },
  { value: 'Mantenimiento general', label: 'Mantenimiento' },
  { value: 'Rendimiento deportivo', label: 'Rendimiento' },
]
const EXPERIENCE_OPTIONS: Option[] = [
  { value: 'Principiante', label: 'Principiante' },
  { value: 'Intermedio', label: 'Intermedio' },
  { value: 'Avanzado', label: 'Avanzado' },
]
const AVAILABILITY_OPTIONS: Option[] = [
  { value: '2 días', label: '2' },
  { value: '3 días', label: '3' },
  { value: '4 días', label: '4' },
  { value: '5 días', label: '5' },
  { value: '6+ días', label: '6+' },
]

interface FormData {
  weight: string
  height: string
  goals: string
  experience_level: string
  availability: string
  injuries: string
  medical_conditions: string
}

const EMPTY_FORM: FormData = {
  weight: '',
  height: '',
  goals: '',
  experience_level: '',
  availability: '',
  injuries: '',
  medical_conditions: '',
}

export default function AlumnoOnboardingScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const scrollRef = useRef<ScrollViewType>(null)

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [form, setForm] = useState<FormData>(EMPTY_FORM)
  const [ageOk, setAgeOk] = useState(false)
  const [touched, setTouched] = useState<Record<string, boolean>>({})
  const [ageError, setAgeError] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Draft — clave por usuario para no filtrar entre sesiones (web namespacea por slug).
  const [draftKey, setDraftKey] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      const key = `${DRAFT_KEY_PREFIX}_${user?.id ?? 'anon'}`
      try {
        const raw = await AsyncStorage.getItem(key)
        if (!cancelled && raw) {
          const parsed = JSON.parse(raw) as { form?: FormData; step?: number; ageOk?: boolean }
          if (parsed.form) setForm({ ...EMPTY_FORM, ...parsed.form })
          if (parsed.step === 1 || parsed.step === 2 || parsed.step === 3) setStep(parsed.step)
          if (typeof parsed.ageOk === 'boolean') setAgeOk(parsed.ageOk)
        }
      } catch {
        // draft corrupto → arrancamos limpio
      }
      if (!cancelled) {
        setDraftKey(key)
        setHydrated(true)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // Persistir draft en cada cambio (una vez hidratado).
  useEffect(() => {
    if (!hydrated || !draftKey) return
    AsyncStorage.setItem(draftKey, JSON.stringify({ form, step, ageOk })).catch(() => {})
  }, [form, step, ageOk, hydrated, draftKey])

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: true })
  }, [step])

  const clearDraft = useCallback(() => {
    if (draftKey) AsyncStorage.removeItem(draftKey).catch(() => {})
  }, [draftKey])

  function setField<K extends keyof FormData>(name: K, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }))
    setTouched((prev) => ({ ...prev, [name]: true }))
  }

  function fieldError(name: keyof FormData): string | null {
    if (!touched[name]) return null
    const v = form[name]
    if (v === '') return 'Este campo es requerido'
    if ((name === 'weight' || name === 'height') && Number(v.replace(',', '.')) <= 0) return 'Ingresa un valor válido'
    return null
  }

  function validateStep(): boolean {
    if (step === 1) return form.weight !== '' && Number(form.weight.replace(',', '.')) > 0 && form.height !== '' && Number(form.height.replace(',', '.')) > 0
    if (step === 2) return form.goals !== '' && form.experience_level !== '' && form.availability !== ''
    return true
  }

  function goNext() {
    if (validateStep()) {
      setStep((s) => (Math.min(s + 1, 3) as 1 | 2 | 3))
    } else {
      const fields = step === 1 ? ['weight', 'height'] : ['goals', 'experience_level', 'availability']
      setTouched((prev) => ({ ...prev, ...Object.fromEntries(fields.map((f) => [f, true])) }))
    }
  }

  function goPrev() {
    setStep((s) => (Math.max(s - 1, 1) as 1 | 2 | 3))
  }

  async function submit() {
    setError(null)
    if (!ageOk) { setAgeError(true); return }
    setSaving(true)
    const r = await submitIntake({
      weightKg: Number(form.weight.replace(',', '.')),
      heightCm: Number(form.height.replace(',', '.')),
      goals: form.goals,
      experienceLevel: form.experience_level,
      availability: form.availability,
      injuries: form.injuries || null,
      medicalConditions: form.medical_conditions || null,
    })
    setSaving(false)
    if (!r.ok) { setError(r.error ?? 'No se pudo guardar.'); return }
    clearDraft()
    router.replace('/alumno/home')
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <AppBackground />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header + disclaimer medico (espejo de page.tsx) */}
          <View style={styles.header}>
            <Text className="text-strong" style={TYPE.h2}>Completa tu perfil</Text>
            <Text className="text-muted" style={[TYPE.body, styles.subtitle]}>
              Tu coach necesita estos datos para personalizar tu entrenamiento y nutrición.
            </Text>
            <View className="bg-warning-100 border border-warning-500/30 rounded-control" style={styles.warnBox}>
              <Text className="text-warning-700" style={TYPE.caption}>
                EVA no es un dispositivo medico ni sustituye el consejo de profesionales de la salud.
              </Text>
            </View>
          </View>

          {/* Barra de progreso segmentada + eyebrow "Paso X de 3" */}
          <View style={styles.progressWrap}>
            <View style={styles.segRow}>
              {[1, 2, 3].map((s) => (
                <View key={s} className="bg-sport-100" style={styles.segTrack}>
                  <MotiView
                    className="bg-sport-500"
                    style={styles.segFill}
                    animate={{ width: step >= s ? '100%' : '0%' }}
                    transition={{ type: 'timing', duration: 400 }}
                  />
                </View>
              ))}
            </View>
            <Text className="text-subtle" style={[TYPE.eyebrow, styles.stepEyebrow]}>Paso {step} de 3</Text>
          </View>

          <View style={styles.stepArea}>
            <AnimatePresence exitBeforeEnter>
              {step === 1 && (
                <MotiView
                  key="step1"
                  from={{ opacity: 0, translateX: 20 }}
                  animate={{ opacity: 1, translateX: 0 }}
                  exit={{ opacity: 0, translateX: -20 }}
                  transition={{ type: 'timing', duration: 260 }}
                  style={styles.stepInner}
                >
                  <StepHeading title="Tus datos" subtitle="Empecemos con lo básico para personalizar tu plan." />
                  <Input
                    label="Peso actual (kg)*"
                    leftIcon={Scale}
                    keyboardType="decimal-pad"
                    placeholder="Ej. 75.5"
                    value={form.weight}
                    onChangeText={(v) => setField('weight', v)}
                    error={fieldError('weight')}
                    testID="onboarding-weight-input"
                  />
                  <Input
                    label="Estatura (cm)*"
                    leftIcon={Ruler}
                    keyboardType="decimal-pad"
                    placeholder="Ej. 178"
                    value={form.height}
                    onChangeText={(v) => setField('height', v)}
                    error={fieldError('height')}
                    testID="onboarding-height-input"
                  />
                </MotiView>
              )}

              {step === 2 && (
                <MotiView
                  key="step2"
                  from={{ opacity: 0, translateX: 20 }}
                  animate={{ opacity: 1, translateX: 0 }}
                  exit={{ opacity: 0, translateX: -20 }}
                  transition={{ type: 'timing', duration: 260 }}
                  style={styles.stepInner}
                >
                  <StepHeading title="Tus metas" subtitle="¿Qué quieres lograr y cuánto tiempo tienes?" />
                  <Pick
                    label="¿Cuál es tu objetivo principal?*"
                    options={GOAL_OPTIONS}
                    value={form.goals}
                    onPick={(v) => setField('goals', v)}
                    error={fieldError('goals')}
                    testIDPrefix="onboarding-goal"
                  />
                  <Pick
                    label="Experiencia*"
                    options={EXPERIENCE_OPTIONS}
                    value={form.experience_level}
                    onPick={(v) => setField('experience_level', v)}
                    error={fieldError('experience_level')}
                    testIDPrefix="onboarding-experience"
                  />
                  <Pick
                    label="Días por semana*"
                    options={AVAILABILITY_OPTIONS}
                    value={form.availability}
                    onPick={(v) => setField('availability', v)}
                    error={fieldError('availability')}
                    testIDPrefix="onboarding-availability"
                  />
                </MotiView>
              )}

              {step === 3 && (
                <MotiView
                  key="step3"
                  from={{ opacity: 0, translateX: 20 }}
                  animate={{ opacity: 1, translateX: 0 }}
                  exit={{ opacity: 0, translateX: -20 }}
                  transition={{ type: 'timing', duration: 260 }}
                  style={styles.stepInner}
                >
                  <StepHeading title="Salud y seguridad" subtitle="Esta información es vital para evitar lesiones." />
                  <View className="bg-warning-100 border border-warning-500/30 rounded-control" style={styles.warnBox}>
                    <Text className="text-warning-700" style={TYPE.caption}>
                      EVA no es un dispositivo medico ni sustituye el consejo de profesionales de la salud.
                    </Text>
                  </View>
                  <Textarea
                    label="Lesiones o limitaciones"
                    minRows={2}
                    placeholder="Ej. Dolor en rodilla derecha al correr..."
                    value={form.injuries}
                    onChangeText={(v) => setForm((prev) => ({ ...prev, injuries: v }))}
                    testID="onboarding-injuries-input"
                  />
                  <Textarea
                    label="Condiciones médicas"
                    minRows={2}
                    placeholder="Ej. Hipertensión, asma, diabetes..."
                    value={form.medical_conditions}
                    onChangeText={(v) => setForm((prev) => ({ ...prev, medical_conditions: v }))}
                    testID="onboarding-medical-input"
                  />

                  <TouchableOpacity
                    onPress={() => { setAgeOk((v) => !v); setAgeError(false) }}
                    activeOpacity={0.8}
                    style={styles.termsRow}
                    testID="onboarding-terms-checkbox"
                  >
                    <View
                      className="rounded-sm items-center justify-center"
                      style={[styles.checkbox, { borderColor: ageOk ? theme.primary : theme.border, backgroundColor: ageOk ? theme.primary : 'transparent' }]}
                    >
                      {ageOk ? <Check size={13} color={theme.primaryForeground} strokeWidth={3} /> : null}
                    </View>
                    <Text className="text-muted" style={[TYPE.caption, styles.termsText]}>
                      Confirmo que tengo 14 años o más y acepto los{' '}
                      <Text className="text-strong" style={styles.link} onPress={() => Linking.openURL(TERMS_URL)}>términos de uso</Text>
                      {' '}y la{' '}
                      <Text className="text-strong" style={styles.link} onPress={() => Linking.openURL(PRIVACY_URL)}>política de privacidad</Text>.*
                    </Text>
                  </TouchableOpacity>
                  {ageError ? (
                    <Text className="text-danger-600" style={[TYPE.caption, styles.ageErrorText]}>
                      Debes confirmar tu edad para continuar.
                    </Text>
                  ) : null}
                </MotiView>
              )}
            </AnimatePresence>

            {error ? (
              <View className="bg-danger-100 rounded-control" style={styles.errorBox}>
                <Text className="text-danger-600" style={TYPE.label}>{error}</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>

        {/* Nav inferior fija */}
        <View style={[styles.navBar, { borderTopColor: theme.border, backgroundColor: theme.background }]}>
          {step > 1 ? (
            <TouchableOpacity
              className="border border-default rounded-control"
              style={styles.backBtn}
              onPress={goPrev}
              activeOpacity={0.75}
              testID="onboarding-back"
            >
              <ArrowLeft size={16} color={theme.foreground} strokeWidth={2} />
              <Text className="text-strong" style={TYPE.label}>Atrás</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.flex} />
          )}
          {step < 3 ? (
            <Button
              label="Siguiente"
              variant="sport"
              rightIcon={ArrowRight}
              onPress={goNext}
              size="lg"
              style={styles.flex}
              testID="onboarding-next"
            />
          ) : (
            <Button
              label={saving ? 'Guardando...' : 'Finalizar registro'}
              variant="sport"
              rightIcon={Check}
              onPress={submit}
              loading={saving}
              size="lg"
              style={styles.flex}
              testID="onboarding-submit"
            />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function StepHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={styles.stepHeadingWrap}>
      <Text className="text-strong" style={[TYPE.h3, { fontFamily: FONT.displayBlack }]}>{title}</Text>
      <Text className="text-muted" style={TYPE.body}>{subtitle}</Text>
    </View>
  )
}

// Chip group tappable (espejo del web `Pick`). Seleccionado = solido inverse.
function Pick({
  label,
  options,
  value,
  onPick,
  error,
  testIDPrefix,
}: {
  label: string
  options: Option[]
  value: string
  onPick: (v: string) => void
  error?: string | null
  testIDPrefix: string
}) {
  const { theme } = useTheme()
  return (
    <View style={styles.pickWrap}>
      <Text className="text-strong" style={styles.pickLabel}>{label}</Text>
      <View style={styles.chips}>
        {options.map((o) => {
          const active = value === o.value
          return (
            <TouchableOpacity
              key={o.value}
              onPress={() => onPick(o.value)}
              activeOpacity={0.8}
              className={active ? 'bg-surface-inverse border border-surface-inverse' : 'bg-surface-card border border-default'}
              style={styles.chip}
              testID={`${testIDPrefix}-chip-${o.value}`}
            >
              <Text
                className={active ? undefined : 'text-body'}
                style={[styles.chipText, active ? { color: theme.primaryForeground } : null]}
              >
                {o.label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>
      {error ? <Text className="text-danger-600" style={[TYPE.caption, styles.pickError]}>{error}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32, gap: 24 },
  header: { gap: 8 },
  subtitle: { marginTop: 2 },
  warnBox: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, marginTop: 4 },
  progressWrap: { gap: 12 },
  segRow: { flexDirection: 'row', gap: 6 },
  segTrack: { height: 5, flex: 1, borderRadius: 999, overflow: 'hidden' },
  segFill: { height: '100%', borderRadius: 999 },
  stepEyebrow: {},
  stepArea: { gap: 16 },
  stepInner: { gap: 18 },
  stepHeadingWrap: { gap: 4 },
  pickWrap: { gap: 8 },
  pickLabel: { fontSize: 13, fontFamily: 'HankenGrotesk_600SemiBold' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 38, borderRadius: 14, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  chipText: { fontSize: 13.5, fontFamily: 'HankenGrotesk_600SemiBold' },
  pickError: { marginTop: 2 },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 4 },
  checkbox: { width: 22, height: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  termsText: { flex: 1 },
  link: { textDecorationLine: 'underline', fontFamily: 'HankenGrotesk_600SemiBold' },
  ageErrorText: { marginLeft: 32 },
  errorBox: { paddingHorizontal: 12, paddingVertical: 10 },
  navBar: {
    flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, borderWidth: 1.5, paddingVertical: 14,
  },
})
