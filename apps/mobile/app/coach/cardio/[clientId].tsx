import { useEffect, useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Save } from 'lucide-react-native'
import { resolveClientZones, type ResolvedClientZones } from '@eva/cardio'
import { CardioProfileUpdateSchema } from '@eva/schemas'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import { useEntitlements } from '../../../lib/entitlements'
import { getCardioClient, saveCardioProfile, type CardioClientRow } from '../../../lib/cardio-coach'
import { AppBackground } from '../../../components/AppBackground'
import { Button } from '../../../components/Button'
import { Card } from '../../../components/Card'
import { Input } from '../../../components/Input'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { ModuleOffNotice } from '../../../components/ModuleOffNotice'
import { toast } from '../../../components/Toast'
import { CardioHeader, CardioZoneList } from '../../../components/coach/CardioShared'

/**
 * Perfil cardio del alumno (vista del coach — E6-03), espejo de
 * `apps/web/.../coach/cardio/[clientId]` (CardioProfileForm). Edita clients.{birth_date,
 * resting_hr,max_hr_override,ref_5k_time_sec} y muestra las zonas resultantes en vivo
 * (resolveClientZones de @eva/cardio, misma resolucion que la web). La MUTACION va SIEMPRE
 * por `POST /api/mobile/cardio/profile` (assertModule server-side — money-safety); nunca
 * por PostgREST directo. La lectura del prefill es del propio alumno del coach (RLS).
 */

type Errors = Partial<Record<'birth_date' | 'resting_hr' | 'max_hr_override' | 'ref_5k_time_sec', string>>

export default function CardioClientScreen() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>()
  const { theme } = useTheme()
  const router = useRouter()
  const { hasModule, ready } = useEntitlements()
  const enabled = hasModule('cardio')

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [client, setClient] = useState<CardioClientRow | null>(null)
  const [birthDate, setBirthDate] = useState('')
  const [restingHr, setRestingHr] = useState('')
  const [maxHr, setMaxHr] = useState('')
  const [ref5k, setRef5k] = useState('')
  const [errors, setErrors] = useState<Errors>({})

  useEffect(() => {
    if (!enabled || !clientId) {
      setLoading(false)
      return
    }
    let cancelled = false
    void (async () => {
      const c = await getCardioClient(clientId)
      if (cancelled) return
      setClient(c)
      setBirthDate(c?.birth_date ?? '')
      setRestingHr(c?.resting_hr != null ? String(c.resting_hr) : '')
      setMaxHr(c?.max_hr_override != null ? String(c.max_hr_override) : '')
      setRef5k(c?.ref_5k_time_sec != null ? String(c.ref_5k_time_sec) : '')
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [clientId, enabled])

  // Zonas en vivo desde los valores del form (misma resolucion que el alumno vera).
  const zones = useMemo<ResolvedClientZones | null>(
    () =>
      resolveClientZones({
        birthDate: birthDate.trim() === '' ? null : birthDate.trim(),
        restingHr: restingHr.trim() === '' ? null : Number(restingHr),
        maxHrOverride: maxHr.trim() === '' ? null : Number(maxHr),
      }),
    [birthDate, restingHr, maxHr],
  )

  async function handleSave() {
    if (!clientId) return
    const payload = {
      clientId,
      birth_date: birthDate.trim() === '' ? null : birthDate.trim(),
      resting_hr: restingHr.trim() === '' ? null : Number(restingHr),
      max_hr_override: maxHr.trim() === '' ? null : Number(maxHr),
      ref_5k_time_sec: ref5k.trim() === '' ? null : Number(ref5k),
    }
    const parsed = CardioProfileUpdateSchema.safeParse(payload)
    if (!parsed.success) {
      const next: Errors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0]
        if ((key === 'birth_date' || key === 'resting_hr' || key === 'max_hr_override' || key === 'ref_5k_time_sec') && !next[key]) {
          next[key] = issue.message
        }
      }
      setErrors(next)
      return
    }
    setErrors({})
    setSaving(true)
    try {
      const d = parsed.data
      await saveCardioProfile({
        clientId,
        birth_date: d.birth_date ?? null,
        resting_hr: d.resting_hr ?? null,
        max_hr_override: d.max_hr_override ?? null,
        ref_5k_time_sec: d.ref_5k_time_sec ?? null,
      })
      toast.success('Perfil cardio guardado')
      router.back()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar el perfil.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.background }]}>
      <AppBackground />
      <CardioHeader title="Perfil cardio" subtitle={client?.full_name ?? 'Alumno'} onBack={() => router.back()} />
      {!ready || (enabled && loading) ? (
        <EvaLoaderScreen subtitle="Cargando perfil…" />
      ) : !enabled ? (
        <ModuleOffNotice moduleKey="cardio" />
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Card padding="md" style={{ gap: 16 }}>
            <Input
              testID="cardio-birth-date"
              label="Fecha de nacimiento"
              placeholder="AAAA-MM-DD"
              value={birthDate}
              onChangeText={(t) => /^[\d-]*$/.test(t) && setBirthDate(t)}
              maxLength={10}
              keyboardType="numbers-and-punctuation"
              autoCapitalize="none"
              hint="Habilita FCmax por Tanaka y las zonas Z1–Z5."
              error={errors.birth_date ?? null}
            />
            <Input
              testID="cardio-resting-hr"
              label="FC en reposo (bpm)"
              placeholder="Ej. 60"
              value={restingHr}
              onChangeText={(t) => /^\d*$/.test(t) && setRestingHr(t)}
              maxLength={3}
              keyboardType="number-pad"
              hint="Medida al despertar — habilita Karvonen."
              error={errors.resting_hr ?? null}
            />
            <Input
              testID="cardio-max-hr"
              label="FCmax medida (bpm, opcional)"
              placeholder="Ej. 192"
              value={maxHr}
              onChangeText={(t) => /^\d*$/.test(t) && setMaxHr(t)}
              maxLength={3}
              keyboardType="number-pad"
              hint="Solo si la mediste en test real — manda sobre las fórmulas."
              error={errors.max_hr_override ?? null}
            />
            <Input
              testID="cardio-ref5k"
              label="Referencia 5K (segundos, opcional)"
              placeholder="Ej. 1500 (= 25:00)"
              value={ref5k}
              onChangeText={(t) => /^\d*$/.test(t) && setRef5k(t)}
              maxLength={4}
              keyboardType="number-pad"
              hint="Tiempo de 5K para prescribir por pace."
              error={errors.ref_5k_time_sec ?? null}
            />
          </Card>

          <Button
            testID="cardio-save"
            label={saving ? 'Guardando…' : 'Guardar perfil cardio'}
            variant="sport"
            leftIcon={Save}
            loading={saving}
            onPress={handleSave}
            full
          />

          <Card padding="md" style={{ gap: 10 }}>
            <Text style={[styles.sectionTitle, { color: theme.foreground, fontFamily: FONT.uiExtra }]}>ZONAS RESULTANTES</Text>
            {zones ? (
              <>
                <Text style={[styles.methodLine, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>
                  FCmax {zones.maxHr} bpm ({zones.maxHrMethod === 'override' ? 'medida' : 'Tanaka'}) ·{' '}
                  {zones.zoneMethod === 'karvonen' ? `Karvonen (reposo ${zones.restingHr})` : '%FCmax'}
                </Text>
                <CardioZoneList zones={zones.zones} />
                <Text style={[styles.footNote, { color: theme.textSecondary, fontFamily: FONT.ui }]}>
                  El alumno ve estos rangos en los bloques cardio con zona prescrita («Z4 · {zones.zones[3].minBpm}–{zones.zones[3].maxBpm} bpm»).
                </Text>
              </>
            ) : (
              <Text style={[styles.methodLine, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>
                Sin fecha de nacimiento ni FCmax medida no se pueden derivar zonas — el alumno verá solo la zona prescrita («Z4») sin bpm.
              </Text>
            )}
          </Card>
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48, gap: 16 },
  sectionTitle: { fontSize: 12, letterSpacing: 0.6 },
  methodLine: { fontSize: 12, lineHeight: 17 },
  footNote: { fontSize: 11, lineHeight: 16 },
})
