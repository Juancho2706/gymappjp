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
        <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>¡Bienvenido/a!</Text>
        <Text style={[styles.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Completá tu perfil para que tu coach arme tu plan.
        </Text>

        {error ? (
          <View style={[styles.errorBox, { borderColor: theme.destructive + '55', backgroundColor: theme.destructive + '14' }]}>
            <Text style={{ color: theme.destructive, fontSize: 13, fontFamily: theme.fontSans }}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.row}>
          <Field theme={theme} label="Peso (kg) *" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" placeholder="75.5" />
          <Field theme={theme} label="Altura (cm) *" value={height} onChangeText={setHeight} keyboardType="decimal-pad" placeholder="178" />
        </View>

        <Label theme={theme}>Objetivo principal *</Label>
        <Chips theme={theme} options={GOAL_OPTIONS as readonly string[]} value={goals} onSelect={setGoals} />

        <Label theme={theme}>Experiencia *</Label>
        <Chips theme={theme} options={EXPERIENCE_OPTIONS as readonly string[]} value={experience} onSelect={setExperience} />

        <Label theme={theme}>Días por semana *</Label>
        <Chips theme={theme} options={AVAILABILITY_OPTIONS as readonly string[]} value={availability} onSelect={setAvailability} />

        <Field theme={theme} label="Lesiones (opcional)" value={injuries} onChangeText={setInjuries} placeholder="Ej: hombro derecho" multiline />
        <Field theme={theme} label="Condiciones médicas (opcional)" value={medical} onChangeText={setMedical} placeholder="Ej: hipertensión" multiline />

        <TouchableOpacity onPress={() => setAgeOk((v) => !v)} activeOpacity={0.8} style={styles.ageRow}>
          <View style={[styles.checkbox, { borderColor: ageOk ? theme.primary : theme.border, backgroundColor: ageOk ? theme.primary : 'transparent' }]}>
            {ageOk ? <Check size={13} color={theme.primaryForeground} strokeWidth={3} /> : null}
          </View>
          <Text style={[styles.ageText, { color: theme.foreground, fontFamily: theme.fontSans }]}>Confirmo que tengo 14 años o más.</Text>
        </TouchableOpacity>

        <Button label={saving ? 'Guardando...' : 'Empezar'} onPress={submit} disabled={saving} full size="lg" />
      </ScrollView>
    </SafeAreaView>
  )
}

function Label({ children, theme }: { children: React.ReactNode; theme: any }) {
  return <Text style={[styles.label, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{children}</Text>
}

function Field({ theme, label, multiline, ...rest }: any) {
  return (
    <View style={{ gap: 6, flex: 1 }}>
      <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
      <TextInput placeholderTextColor={theme.mutedForeground} multiline={multiline}
        style={[styles.input, multiline && { height: 70, textAlignVertical: 'top', paddingTop: 10 }, { borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, fontFamily: theme.fontSans }]} {...rest} />
    </View>
  )
}

function Chips({ theme, options, value, onSelect }: { theme: any; options: readonly string[]; value: string; onSelect: (v: string) => void }) {
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

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 48, gap: 12 },
  title: { fontSize: 28, letterSpacing: -0.6 },
  sub: { fontSize: 14, lineHeight: 20, marginBottom: 6 },
  errorBox: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  row: { flexDirection: 'row', gap: 12 },
  label: { fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 6 },
  fieldLabel: { fontSize: 12 },
  input: { minHeight: 46, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 15 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 13, paddingVertical: 9 },
  ageRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  ageText: { fontSize: 14, flex: 1 },
})
