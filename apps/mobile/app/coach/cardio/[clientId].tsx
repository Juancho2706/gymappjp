import { useEffect, useMemo, useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, HeartPulse, Lock } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { ScreenHeader, Button } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { hasModule } from '../../../lib/entitlements'
import { getCardioClient, saveCardioProfile, type CardioClientRow } from '../../../lib/cardio-data'
import { resolveClientZones, ZONE_DESCRIPTIONS } from '../../../lib/cardio'

export default function CardioProfileEditorScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const { clientId } = useLocalSearchParams<{ clientId: string }>()
  const [loading, setLoading] = useState(true)
  const [entitled, setEntitled] = useState(false)
  const [client, setClient] = useState<CardioClientRow | null>(null)
  const [birthDate, setBirthDate] = useState('')
  const [restingHr, setRestingHr] = useState('')
  const [maxHr, setMaxHr] = useState('')
  const [ref5k, setRef5k] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const ok = await hasModule('cardio')
        setEntitled(ok)
        if (ok && clientId) {
          const c = await getCardioClient(clientId)
          setClient(c)
          if (c) {
            setBirthDate(c.birth_date ?? '')
            setRestingHr(c.resting_hr != null ? String(c.resting_hr) : '')
            setMaxHr(c.max_hr_override != null ? String(c.max_hr_override) : '')
            setRef5k(c.ref_5k_time_sec != null ? String(c.ref_5k_time_sec) : '')
          }
        }
      } finally {
        setLoading(false)
      }
    })()
  }, [clientId])

  const preview = useMemo(
    () =>
      resolveClientZones({
        birthDate: birthDate.trim() || null,
        restingHr: parseInt(restingHr, 10) || null,
        maxHrOverride: parseInt(maxHr, 10) || null,
      }),
    [birthDate, restingHr, maxHr]
  )

  async function handleSave() {
    setSaving(true)
    setError(null)
    const { error: err } = await saveCardioProfile(clientId, {
      birth_date: birthDate.trim() || null,
      resting_hr: restingHr,
      max_hr_override: maxHr,
      ref_5k_time_sec: ref5k,
    })
    setSaving(false)
    if (err) {
      setError(err)
      return
    }
    Alert.alert('Listo', 'Perfil cardio guardado', [{ text: 'OK', onPress: () => router.back() }])
  }

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
        <AppBackground />
        <EvaLoaderScreen subtitle="Cargando perfil…" />
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
      <AppBackground />
      <View style={styles.backRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8} style={styles.backBtn} activeOpacity={0.7}>
          <ChevronLeft size={20} color={theme.mutedForeground} />
          <Text style={{ color: theme.mutedForeground, fontFamily: theme.fontSans, fontSize: 14 }}>Volver</Text>
        </TouchableOpacity>
      </View>
      <ScreenHeader title="Perfil cardio" subtitle={client?.full_name ?? undefined} />

      {!entitled ? (
        <View style={styles.offWrap}>
          <View style={[styles.offCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
            <Lock size={26} color={theme.mutedForeground} />
            <Text style={[styles.offTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Módulo no habilitado</Text>
            <Text style={[styles.offText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Cardio es un módulo de pago.</Text>
          </View>
        </View>
      ) : !client ? (
        <View style={styles.offWrap}>
          <Text style={[styles.offText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Alumno no encontrado.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Field theme={theme} label="FECHA DE NACIMIENTO (AAAA-MM-DD)" value={birthDate} onChange={setBirthDate} placeholder="1996-04-12" hint="Habilita FCmax por Tanaka y las zonas Z1–Z5." />
          <Field theme={theme} label="FC EN REPOSO (BPM)" value={restingHr} onChange={(v) => /^\d*$/.test(v) && setRestingHr(v)} placeholder="60" keyboard="number-pad" hint="Medida al despertar — habilita Karvonen." />
          <Field theme={theme} label="FCMAX MEDIDA (BPM, OPCIONAL)" value={maxHr} onChange={(v) => /^\d*$/.test(v) && setMaxHr(v)} placeholder="192" keyboard="number-pad" hint="Solo si la mediste en test real — manda sobre las fórmulas." />
          <Field theme={theme} label="REFERENCIA 5K (SEGUNDOS, OPCIONAL)" value={ref5k} onChange={(v) => /^\d*$/.test(v) && setRef5k(v)} placeholder="1500 (= 25:00)" keyboard="number-pad" hint="Tiempo de 5K para prescribir por pace." />

          {/* Preview en vivo */}
          <View style={[styles.preview, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
            <View style={styles.previewHead}>
              <HeartPulse size={16} color={theme.primary} />
              <Text style={[styles.previewTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Zonas resultantes</Text>
            </View>
            {preview ? (
              <>
                <Text style={[styles.previewHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                  FCmax {preview.maxHr} bpm ({preview.maxHrMethod === 'override' ? 'medida' : 'Tanaka'}) · {preview.zoneMethod === 'karvonen' ? `Karvonen (reposo ${preview.restingHr})` : '%FCmax'}
                </Text>
                <View style={styles.zoneGrid}>
                  {preview.zones.map((z) => (
                    <View key={z.zone} style={[styles.zoneCard, { borderColor: theme.border }]}>
                      <Text style={[styles.zoneTag, { color: theme.primary, fontFamily: 'Montserrat_800ExtraBold' }]}>Z{z.zone}</Text>
                      <Text style={[styles.zoneRange, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>{z.minBpm}–{z.maxBpm}</Text>
                      <Text style={[styles.zoneDesc, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{ZONE_DESCRIPTIONS[z.zone]}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : (
              <Text style={[styles.previewHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Cargá fecha de nacimiento o FCmax medida para ver las zonas.</Text>
            )}
          </View>

          {error ? (
            <Text style={[styles.error, { color: theme.destructive, borderColor: theme.destructive + '55', backgroundColor: theme.destructive + '14' }]}>{error}</Text>
          ) : null}

          <Button label="Guardar perfil cardio" onPress={handleSave} loading={saving} full size="lg" style={{ marginTop: 4 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

function Field({
  theme, label, value, onChange, placeholder, hint, keyboard,
}: {
  theme: any; label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string; keyboard?: 'number-pad'
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.mutedForeground}
        keyboardType={keyboard === 'number-pad' ? 'number-pad' : 'default'}
        autoCapitalize="none"
        style={[styles.input, { borderColor: theme.border, backgroundColor: theme.background, color: theme.foreground, fontFamily: theme.fontSans }]}
      />
      {hint ? <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{hint}</Text> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backRow: { paddingHorizontal: 16, paddingTop: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, alignSelf: 'flex-start' },
  scroll: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48, gap: 16 },
  fieldLabel: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase' },
  input: { height: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 15 },
  hint: { fontSize: 10, lineHeight: 14 },
  preview: { borderWidth: 1, padding: 16, gap: 10 },
  previewHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  previewTitle: { fontSize: 13, letterSpacing: 0.3, textTransform: 'uppercase' },
  previewHint: { fontSize: 12, lineHeight: 16 },
  zoneGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  zoneCard: { flexGrow: 1, flexBasis: '18%', minWidth: 58, borderWidth: 1, borderRadius: 10, paddingVertical: 8, alignItems: 'center', gap: 2 },
  zoneTag: { fontSize: 10, letterSpacing: 1 },
  zoneRange: { fontSize: 13 },
  zoneDesc: { fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.3, textAlign: 'center' },
  error: { fontSize: 12, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, overflow: 'hidden' },
  offWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, alignItems: 'center', gap: 8 },
  offCard: { borderWidth: 1, padding: 24, alignItems: 'center', gap: 12 },
  offTitle: { fontSize: 18 },
  offText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
})
