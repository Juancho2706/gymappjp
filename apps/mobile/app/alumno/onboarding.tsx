import { useState } from 'react'
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Check } from 'lucide-react-native'
import { useTheme } from '../../context/ThemeContext'
import { Button } from '../../components'
import { AppBackground } from '../../components/AppBackground'
import {
  AVAILABILITY_OPTIONS,
  EXPERIENCE_OPTIONS,
  GOAL_OPTIONS,
  submitIntake,
} from '../../lib/alumno-onboarding'

export default function AlumnoOnboardingScreen() {
  const { theme } = useTheme()
  const router = useRouter()

  const [weight, setWeight] = useState('')
  const [height, setHeight] = useState('')
  const [goals, setGoals] = useState('')
  const [experience, setExperience] = useState('')
  const [availability, setAvailability] = useState('')
  const [injuries, setInjuries] = useState('')
  const [medical, setMedical] = useState('')
  const [ageOk, setAgeOk] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    if (!ageOk) { setError('Confirmá que tenés 14 años o más.'); return }
    setSaving(true)
    const r = await submitIntake({
      weightKg: Number(weight.replace(',', '.')),
      heightCm: Number(height.replace(',', '.')),
      goals,
      experienceLevel: experience,
      availability,
      injuries: injuries || null,
      medicalConditions: medical || null,
    })
    setSaving(false)
    if (!r.ok) { setError(r.error ?? 'No se pudo guardar.'); return }
    router.replace('/alumno/home')
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.background }]}>
      <AppBackground />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text className="text-strong font-display-black" style={styles.title}>¡Bienvenido/a!</Text>
        <Text className="text-muted font-sans" style={styles.sub}>
          Completá tu perfil para que tu coach arme tu plan.
        </Text>

        {error ? (
          <View className="bg-danger-100 border-danger-500" style={styles.errorBox}>
            <Text className="text-danger-600 font-sans" style={{ fontSize: 13 }}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.row}>
          <Field theme={theme} label="Peso (kg) *" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="75.5" />
          <Field theme={theme} label="Altura (cm) *" value={height} onChangeText={setHeight} keyboardType="decimal-pad" placeholder="178" />
        </View>

        <Label>Objetivo principal *</Label>
        <Chips options={GOAL_OPTIONS as readonly string[]} value={goals} onSelect={setGoals} />

        <Label>Experiencia *</Label>
        <Chips options={EXPERIENCE_OPTIONS as readonly string[]} value={experience} onSelect={setExperience} />

        <Label>Días por semana *</Label>
        <Chips options={AVAILABILITY_OPTIONS as readonly string[]} value={availability} onSelect={setAvailability} />

        <Field theme={theme} label="Lesiones (opcional)" value={injuries} onChangeText={setInjuries} placeholder="Ej: hombro derecho" multiline />
        <Field theme={theme} label="Condiciones médicas (opcional)" value={medical} onChangeText={setMedical} placeholder="Ej: hipertensión" multiline />

        <TouchableOpacity onPress={() => setAgeOk((v) => !v)} activeOpacity={0.8} style={styles.ageRow}>
          <View className="rounded-sm items-center justify-center" style={[styles.checkbox, { borderColor: ageOk ? theme.primary : theme.border, backgroundColor: ageOk ? theme.primary : 'transparent' }]}>
            {ageOk ? <Check size={13} color={theme.primaryForeground} strokeWidth={3} /> : null}
          </View>
          <Text className="text-body font-sans" style={styles.ageText}>Confirmo que tengo 14 años o más.</Text>
        </TouchableOpacity>

        <Button label={saving ? 'Guardando...' : 'Empezar'} variant="sport" onPress={submit} disabled={saving} full size="lg" />
      </ScrollView>
    </SafeAreaView>
  )
}

function Label({ children }: { children: React.ReactNode }) {
  return <Text className="text-muted font-sans" style={styles.label}>{children}</Text>
}

function Field({ theme, label, multiline, ...rest }: any) {
  return (
    <View style={{ gap: 6, flex: 1 }}>
      <Text className="text-muted font-sans" style={styles.fieldLabel}>{label}</Text>
      <TextInput
        placeholderTextColor={theme.mutedForeground}
        multiline={multiline}
        className="bg-surface-card border border-default rounded-control text-strong font-sans"
        style={[styles.input, multiline && { height: 70, textAlignVertical: 'top', paddingTop: 10 }]}
        {...rest}
      />
    </View>
  )
}

function Chips({ options, value, onSelect }: { options: readonly string[]; value: string; onSelect: (v: string) => void }) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const active = o === value
        return (
          <TouchableOpacity
            key={o}
            onPress={() => onSelect(o)}
            activeOpacity={0.8}
            className={active ? 'border border-sport-500 bg-sport-100' : 'border border-default'}
            style={styles.chip}
          >
            <Text className={active ? 'text-sport-600 font-sans-semibold' : 'text-muted font-sans-semibold'} style={{ fontSize: 13 }}>{o}</Text>
          </TouchableOpacity>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 48, gap: 12 },
  title: { fontSize: 28, letterSpacing: -0.6 },
  sub: { fontSize: 14, lineHeight: 20, marginBottom: 6 },
  errorBox: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  row: { flexDirection: 'row', gap: 12 },
  label: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 6 },
  fieldLabel: { fontSize: 12 },
  input: { minHeight: 46, borderWidth: 1, paddingHorizontal: 12, fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9 },
  ageRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  checkbox: { width: 22, height: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  ageText: { fontSize: 14, flex: 1 },
})
