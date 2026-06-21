import { useEffect, useMemo, useState } from 'react'
import { Alert, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ChevronLeft, Lock, Plus, Ruler, Trash2, X } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { ScreenHeader, Button, SegmentedTabs } from '../../../components'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { AppBackground } from '../../../components/AppBackground'
import { TrendChart, type TrendPoint } from '../../../components/coach/TrendChart'
import { hasModule } from '../../../lib/entitlements'
import {
  computeIsak,
  deleteMeasurement,
  deltaVsPrev,
  deviceLabel,
  formatKg,
  formatPct,
  getBodyCompClient,
  listMeasurements,
  readBiaMetrics,
  readIsakMetrics,
  saveBiaMeasurement,
  saveIsakMeasurement,
  shortDate,
  type BodyCompClientRow,
  type BodyCompositionRow,
  type IsakMetricsView,
  type IsakRawInput,
} from '../../../lib/bodycomp'
import {
  BodyCompositionCreateSchema,
  IsakRawInputSchema,
  type BodyFatEquationDto,
} from '@eva/schemas'

type Method = 'bia' | 'isak'

export default function BodyCompositionScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const { clientId } = useLocalSearchParams<{ clientId: string }>()
  const [loading, setLoading] = useState(true)
  const [entitled, setEntitled] = useState(false)
  const [client, setClient] = useState<BodyCompClientRow | null>(null)
  const [method, setMethod] = useState<Method>('bia')
  const [capturing, setCapturing] = useState(false)
  const [bia, setBia] = useState<BodyCompositionRow[]>([])
  const [isak, setIsak] = useState<BodyCompositionRow[]>([])

  async function refresh() {
    if (!clientId) return
    const [b, i] = await Promise.all([listMeasurements(clientId, 'bia'), listMeasurements(clientId, 'isak')])
    setBia(b)
    setIsak(i)
  }

  useEffect(() => {
    ;(async () => {
      try {
        const ok = await hasModule('body_composition')
        setEntitled(ok)
        if (ok && clientId) {
          setClient(await getBodyCompClient(clientId))
          await refresh()
        }
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  function switchMethod(m: Method) {
    setMethod(m)
    setCapturing(false)
  }

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
        <AppBackground />
        <EvaLoaderScreen subtitle="Cargando composición…" />
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
      <ScreenHeader title="Composición corporal" subtitle={client?.full_name ?? undefined} />

      {!entitled ? (
        <View style={styles.offWrap}>
          <View style={[styles.offCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
            <Lock size={26} color={theme.mutedForeground} />
            <Text style={[styles.offTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Módulo no habilitado</Text>
            <Text style={[styles.offText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              Composición corporal es un módulo de pago. Activalo desde la web para capturar
              bioimpedancia y antropometría (ISAK) con fraccionamiento de 5 componentes y somatotipo.
            </Text>
            <Button label="Ver en la web" onPress={() => Linking.openURL('https://eva-app.cl/coach/subscription').catch(() => {})} full />
          </View>
        </View>
      ) : !client ? (
        <View style={styles.offWrap}>
          <Text style={[styles.offText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Alumno no encontrado.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <SegmentedTabs<Method>
            items={[
              { value: 'bia', label: 'Bioimpedancia' },
              { value: 'isak', label: 'Antropometría' },
            ]}
            value={method}
            onChange={switchMethod}
          />

          <View style={styles.captureRow}>
            <Button
              label={capturing ? 'Cancelar' : 'Nueva medición'}
              variant={capturing ? 'ghost' : 'primary'}
              size="sm"
              leftIcon={capturing ? X : Plus}
              onPress={() => setCapturing((v) => !v)}
            />
          </View>

          {capturing &&
            (method === 'bia' ? (
              <BiaCaptureForm
                theme={theme}
                clientId={clientId}
                onSaved={async () => {
                  setCapturing(false)
                  await refresh()
                }}
              />
            ) : (
              <IsakCaptureForm
                theme={theme}
                clientId={clientId}
                onSaved={async () => {
                  setCapturing(false)
                  await refresh()
                }}
              />
            ))}

          {method === 'bia' ? (
            <BiaTrendPanel theme={theme} rows={bia} onDeleted={refresh} />
          ) : (
            <IsakTrendPanel theme={theme} rows={isak} onDeleted={refresh} />
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// BIA capture
// ────────────────────────────────────────────────────────────────────────────

type ThemeT = ReturnType<typeof useTheme>['theme']

const BIA_METRIC_FIELDS: { key: keyof ReturnType<typeof readBiaMetrics>; label: string }[] = [
  { key: 'skeletalMuscleMassKg', label: 'Masa muscular esquelética (kg)' },
  { key: 'fatMassKg', label: 'Masa grasa (kg)' },
  { key: 'bodyFatPercent', label: '% Grasa corporal' },
  { key: 'totalBodyWaterL', label: 'Agua corporal total (L)' },
  { key: 'intracellularWaterL', label: 'Agua intracelular (L)' },
  { key: 'extracellularWaterL', label: 'Agua extracelular (L)' },
  { key: 'ecwTbwRatio', label: 'Razón ECW/TBW' },
  { key: 'visceralFatAreaCm2', label: 'Grasa visceral — área (cm²)' },
  { key: 'visceralFatLevel', label: 'Grasa visceral — nivel' },
  { key: 'basalMetabolicRateKcal', label: 'Metabolismo basal (kcal)' },
  { key: 'phaseAngleDeg', label: 'Ángulo de fase (°)' },
]

function toNum(v: string | undefined): number | null {
  if (v == null || v === '') return null
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function BiaCaptureForm({ theme, clientId, onSaved }: { theme: ThemeT; clientId: string; onSaved: () => void }) {
  const [vals, setVals] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: string) => (v: string) => setVals((p) => ({ ...p, [k]: v }))

  async function handleSave() {
    setError(null)
    const metrics: Record<string, number> = {}
    for (const f of BIA_METRIC_FIELDS) {
      const n = toNum(vals[f.key])
      if (n != null) metrics[f.key] = n
    }
    setSaving(true)
    try {
      const { error: err } = await saveBiaMeasurement(clientId, {
        deviceBrand: vals.deviceBrand || null,
        deviceModel: vals.deviceModel || null,
        weightKg: toNum(vals.weightKg),
        heightCm: toNum(vals.heightCm),
        metrics,
        notes: vals.notes || null,
      })
      if (err) {
        setError(err)
        return
      }
      Alert.alert('Listo', 'Medición de bioimpedancia guardada')
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
      <View style={styles.sectionHead}>
        <Ruler size={18} color={theme.primary} />
        <Text style={[styles.sectionTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Nueva medición BIA</Text>
      </View>

      <View style={styles.row2}>
        <Field theme={theme} label="MARCA DEL EQUIPO" value={vals.deviceBrand ?? ''} onChange={set('deviceBrand')} placeholder="InBody" />
        <Field theme={theme} label="MODELO" value={vals.deviceModel ?? ''} onChange={set('deviceModel')} placeholder="570" />
      </View>
      <View style={styles.row2}>
        <Field theme={theme} label="PESO (KG)" value={vals.weightKg ?? ''} onChange={set('weightKg')} keyboard="decimal-pad" />
        <Field theme={theme} label="ESTATURA (CM)" value={vals.heightCm ?? ''} onChange={set('heightCm')} keyboard="decimal-pad" />
      </View>

      {BIA_METRIC_FIELDS.map((f) => (
        <Field key={f.key} theme={theme} label={f.label.toUpperCase()} value={vals[f.key] ?? ''} onChange={set(f.key)} keyboard="decimal-pad" />
      ))}

      <Field theme={theme} label="NOTAS" value={vals.notes ?? ''} onChange={set('notes')} />

      {error ? <Text style={[styles.errorText, { color: theme.destructive }]}>{error}</Text> : null}

      <Button label="Guardar medición BIA" onPress={handleSave} loading={saving} full style={{ marginTop: 4 }} />
    </View>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// ISAK capture (wizard 4 pasos)
// ────────────────────────────────────────────────────────────────────────────

type FieldDef = { name: string; label: string }

const SKINFOLDS: FieldDef[] = [
  { name: 'tricepsMm', label: 'Tríceps' },
  { name: 'subscapularMm', label: 'Subescapular' },
  { name: 'supraspinaleMm', label: 'Supraespinal' },
  { name: 'abdominalMm', label: 'Abdominal' },
  { name: 'frontThighMm', label: 'Muslo anterior' },
  { name: 'medialCalfMm', label: 'Pantorrilla medial' },
  { name: 'bicepsMm', label: 'Bíceps' },
  { name: 'iliacCrestMm', label: 'Cresta ilíaca' },
]

const GIRTHS: FieldDef[] = [
  { name: 'headCm', label: 'Cabeza' },
  { name: 'armRelaxedCm', label: 'Brazo relajado' },
  { name: 'armFlexedCm', label: 'Brazo flexionado' },
  { name: 'forearmCm', label: 'Antebrazo' },
  { name: 'chestMesosternaleCm', label: 'Tórax (mesoesternal)' },
  { name: 'waistCm', label: 'Cintura' },
  { name: 'thighCm', label: 'Muslo' },
  { name: 'calfCm', label: 'Pantorrilla' },
]

const BREADTHS: FieldDef[] = [
  { name: 'biacromialCm', label: 'Biacromial' },
  { name: 'biiliocristalCm', label: 'Biiliocristal' },
  { name: 'humerusCm', label: 'Húmero (biepicondíleo)' },
  { name: 'femurCm', label: 'Fémur (biepicondíleo)' },
  { name: 'transverseChestCm', label: 'Tórax transverso' },
  { name: 'apChestDepthCm', label: 'Tórax A-P (profundidad)' },
]

const STEPS = ['Base + pliegues', 'Perímetros', 'Diámetros', 'Revisión']

function isakToNum(v: unknown): number | undefined {
  if (v === '' || v == null) return undefined
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}

function buildRawInput(values: Record<string, string>, sex: 'male' | 'female'): unknown {
  const grab = (fields: FieldDef[]) => Object.fromEntries(fields.map((f) => [f.name, isakToNum(values[f.name])]))
  return {
    sex,
    ageYears: isakToNum(values.ageYears),
    heightCm: isakToNum(values.heightCm),
    weightKg: isakToNum(values.weightKg),
    sittingHeightCm: isakToNum(values.sittingHeightCm),
    skinfolds: grab(SKINFOLDS),
    girths: grab(GIRTHS),
    breadths: grab(BREADTHS),
  }
}

function IsakCaptureForm({ theme, clientId, onSaved }: { theme: ThemeT; clientId: string; onSaved: () => void }) {
  const [step, setStep] = useState(0)
  const [vals, setVals] = useState<Record<string, string>>({})
  const [sex, setSex] = useState<'male' | 'female'>('male')
  const [equation, setEquation] = useState<BodyFatEquationDto>('durnin_womersley')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (k: string) => (v: string) => setVals((p) => ({ ...p, [k]: v }))

  const parsedRaw = useMemo(() => IsakRawInputSchema.safeParse(buildRawInput(vals, sex)), [vals, sex])

  const previewView: IsakMetricsView | null = useMemo(() => {
    if (!parsedRaw.success) return null
    try {
      const result = computeIsak(parsedRaw.data as IsakRawInput, { bodyFatEquation: equation })
      return readIsakMetrics({
        method: 'isak',
        is_validated: false,
        metrics: {
          fractionation: {
            adipose: result.fractionation.adipose,
            muscle: result.fractionation.muscle,
            bone: result.fractionation.bone,
            residual: result.fractionation.residual,
            skin: result.fractionation.skin,
            predictedMassKg: result.fractionation.predictedMassKg,
            measuredWeightKg: result.fractionation.measuredWeightKg,
            massDifferenceKg: result.fractionation.massDifferenceKg,
          },
          somatotype: result.somatotype,
          bodyFat: result.bodyFat,
          equationUsed: result.equationUsed,
        },
      } as BodyCompositionRow)
    } catch {
      return null
    }
  }, [parsedRaw, equation])

  function goStep(next: number) {
    setStep(Math.max(0, Math.min(STEPS.length - 1, next)))
  }

  async function handleSave() {
    setError(null)
    if (!parsedRaw.success) {
      setError('Faltan medidas o hay valores fuera de rango.')
      return
    }
    const payload = {
      method: 'isak' as const,
      clientId,
      rawInput: parsedRaw.data,
      bodyFatEquation: equation,
      weightKg: parsedRaw.data.weightKg,
      heightCm: parsedRaw.data.heightCm,
    }
    const validated = BodyCompositionCreateSchema.safeParse(payload)
    if (!validated.success) {
      setError('Revisá los datos: hay valores fuera de rango.')
      return
    }
    setSaving(true)
    try {
      const { error: err } = await saveIsakMeasurement(clientId, parsedRaw.data, equation)
      if (err) {
        setError(err)
        return
      }
      Alert.alert('Listo', 'Medición ISAK guardada')
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const fieldGrid = (fields: FieldDef[], unit: string) => (
    <View style={styles.gridWrap}>
      {fields.map((f) => (
        <View key={f.name} style={styles.gridCell}>
          <Field theme={theme} label={`${f.label} (${unit})`.toUpperCase()} value={vals[f.name] ?? ''} onChange={set(f.name)} keyboard="decimal-pad" compact />
        </View>
      ))}
    </View>
  )

  return (
    <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
      {/* Stepper */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {STEPS.map((label, i) => (
          <TouchableOpacity
            key={label}
            onPress={() => goStep(i)}
            activeOpacity={0.8}
            style={[
              styles.stepChip,
              { borderColor: i === step ? theme.primary : theme.border, backgroundColor: i === step ? theme.primary : 'transparent' },
            ]}
          >
            <Text style={{ fontSize: 11.5, fontFamily: 'Montserrat_700Bold', color: i === step ? theme.primaryForeground : theme.mutedForeground }}>
              {i + 1}. {label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {step === 0 && (
        <>
          <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>SEXO</Text>
          <View style={styles.row2}>
            <Toggle theme={theme} label="Masculino" active={sex === 'male'} onPress={() => setSex('male')} />
            <Toggle theme={theme} label="Femenino" active={sex === 'female'} onPress={() => setSex('female')} />
          </View>
          <View style={styles.gridWrap}>
            <View style={styles.gridCell}>
              <Field theme={theme} label="EDAD (AÑOS)" value={vals.ageYears ?? ''} onChange={set('ageYears')} keyboard="number-pad" compact />
            </View>
            <View style={styles.gridCell}>
              <Field theme={theme} label="ESTATURA (CM)" value={vals.heightCm ?? ''} onChange={set('heightCm')} keyboard="decimal-pad" compact />
            </View>
            <View style={styles.gridCell}>
              <Field theme={theme} label="PESO (KG)" value={vals.weightKg ?? ''} onChange={set('weightKg')} keyboard="decimal-pad" compact />
            </View>
            <View style={styles.gridCell}>
              <Field theme={theme} label="TALLA SENTADO (CM)" value={vals.sittingHeightCm ?? ''} onChange={set('sittingHeightCm')} keyboard="decimal-pad" compact />
            </View>
          </View>
          <Text style={[styles.groupLabel, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>PLIEGUES (MM)</Text>
          {fieldGrid(SKINFOLDS, 'mm')}
        </>
      )}

      {step === 1 && (
        <>
          <Text style={[styles.groupLabel, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>PERÍMETROS (CM)</Text>
          {fieldGrid(GIRTHS, 'cm')}
        </>
      )}

      {step === 2 && (
        <>
          <Text style={[styles.groupLabel, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>DIÁMETROS (CM)</Text>
          {fieldGrid(BREADTHS, 'cm')}
        </>
      )}

      {step === 3 && (
        <>
          <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>ECUACIÓN DE % GRASA</Text>
          <View style={styles.eqRow}>
            {([
              { v: 'durnin_womersley', l: 'Durnin-W.' },
              { v: 'yuhasz', l: 'Yuhasz' },
              { v: 'faulkner', l: 'Faulkner' },
            ] as const).map((e) => (
              <Toggle key={e.v} theme={theme} label={e.l} active={equation === e.v} onPress={() => setEquation(e.v)} />
            ))}
          </View>

          {previewView ? (
            <IsakResultCard theme={theme} view={previewView} isValidated={false} title="Vista previa" />
          ) : (
            <Text style={[styles.warnText, { color: theme.mutedForeground, borderColor: theme.border, fontFamily: theme.fontSans }]}>
              Completá todas las medidas para ver el cálculo. Faltan datos o hay valores fuera de rango.
            </Text>
          )}
        </>
      )}

      {error ? <Text style={[styles.errorText, { color: theme.destructive }]}>{error}</Text> : null}

      <View style={styles.navRow}>
        <Button label="Atrás" variant="ghost" size="sm" disabled={step === 0} onPress={() => goStep(step - 1)} />
        {step < STEPS.length - 1 ? (
          <Button label="Siguiente" size="sm" onPress={() => goStep(step + 1)} />
        ) : (
          <Button label="Guardar ISAK" size="sm" loading={saving} disabled={!previewView} onPress={handleSave} />
        )}
      </View>
    </View>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// ISAK result card (espejo de IsakResultCard.tsx)
// ────────────────────────────────────────────────────────────────────────────

const COMPONENT_LABELS: { key: keyof IsakMetricsView['fractionation']; label: string }[] = [
  { key: 'muscle', label: 'Muscular' },
  { key: 'adipose', label: 'Adiposo' },
  { key: 'bone', label: 'Óseo' },
  { key: 'residual', label: 'Residual' },
  { key: 'skin', label: 'Piel' },
]

function IsakResultCard({ theme, view, isValidated, title }: { theme: ThemeT; view: IsakMetricsView; isValidated: boolean; title: string }) {
  const { fractionation: f, somatotype: s, bodyFat } = view
  const deltaOk = Math.abs(f.massDifferenceKg) <= 3
  return (
    <View style={[styles.resultCard, { borderColor: theme.border, backgroundColor: theme.background, borderRadius: theme.radius.xl }]}>
      <View style={styles.resultHead}>
        <Text style={[styles.resultTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>{title}</Text>
        {!isValidated ? (
          <View style={[styles.prelimBadge, { backgroundColor: theme.primary + '22' }]}>
            <Text style={[styles.prelimText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>Preliminar</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.compGrid}>
        {COMPONENT_LABELS.map(({ key, label }) => {
          const comp = f[key] as { kg: number; pct: number }
          return (
            <View key={key} style={[styles.compCard, { borderColor: theme.border }]}>
              <Text style={[styles.compLabel, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>{label}</Text>
              <Text style={[styles.compKg, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>{formatKg(comp.kg)}</Text>
              <Text style={[styles.compPct, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{formatPct(comp.pct)}</Text>
            </View>
          )
        })}
      </View>

      <Text style={[styles.sumLine, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
        Σ masas {formatKg(f.predictedMassKg)} · peso {formatKg(f.measuredWeightKg)} · Δ{' '}
        <Text style={{ color: deltaOk ? theme.success : theme.primary, fontFamily: 'Montserrat_700Bold' }}>
          {f.massDifferenceKg > 0 ? '+' : ''}
          {formatKg(f.massDifferenceKg)}
        </Text>
      </Text>

      <View style={styles.row2}>
        <View style={[styles.somCard, { borderColor: theme.border }]}>
          <Text style={[styles.compLabel, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>Somatotipo</Text>
          <Text style={[styles.somVal, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>
            {s.endomorphy.toFixed(1)} – {s.mesomorphy.toFixed(1)} – {s.ectomorphy.toFixed(1)}
          </Text>
          <Text style={[styles.compPct, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Endo – Meso – Ecto</Text>
        </View>
        <View style={[styles.somCard, { borderColor: theme.border }]}>
          <Text style={[styles.compLabel, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>% Grasa {!isValidated ? '(prelim.)' : ''}</Text>
          <Text style={[styles.somVal, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>{formatPct(bodyFat.percent)}</Text>
          <Text style={[styles.compPct, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{bodyFat.equation}</Text>
        </View>
      </View>
    </View>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Trend panels (series NUNCA mezcladas)
// ────────────────────────────────────────────────────────────────────────────

type BiaSeriesKey = 'bodyFatPercent' | 'skeletalMuscleMassKg'
const BIA_SERIES: { key: BiaSeriesKey; label: string; pct: boolean }[] = [
  { key: 'bodyFatPercent', label: '% Grasa', pct: true },
  { key: 'skeletalMuscleMassKg', label: 'Masa muscular', pct: false },
]

function BiaTrendPanel({ theme, rows, onDeleted }: { theme: ThemeT; rows: BodyCompositionRow[]; onDeleted: () => void }) {
  const [active, setActive] = useState<BiaSeriesKey>('bodyFatPercent')
  const series = BIA_SERIES.find((s) => s.key === active)!
  const fmt = series.pct ? formatPct : formatKg

  const pick = (r: BodyCompositionRow) => {
    const v = readBiaMetrics(r)[active]
    return typeof v === 'number' ? v : null
  }
  const points: TrendPoint[] = [...rows]
    .reverse()
    .map((r) => ({ label: shortDate(r.measured_at), v: pick(r) }))
    .filter((d): d is TrendPoint => d.v != null)
  const latestDelta = rows.length ? deltaVsPrev(rows, 0, pick) : null

  if (rows.length === 0) {
    return <EmptyCard theme={theme} text="Aún no hay mediciones de bioimpedancia para este alumno." />
  }

  return (
    <View style={{ gap: 12 }}>
      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
        <View style={styles.seriesRow}>
          {BIA_SERIES.map((s) => (
            <Toggle key={s.key} theme={theme} label={s.label} active={active === s.key} onPress={() => setActive(s.key)} />
          ))}
          {latestDelta != null ? (
            <Text style={[styles.deltaTag, { color: latestDelta > 0 ? theme.destructive : latestDelta < 0 ? theme.success : theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>
              Δ {latestDelta > 0 ? '+' : ''}
              {fmt(latestDelta)}
            </Text>
          ) : null}
        </View>
        <TrendChart points={points} color={theme.primary} suffix={series.pct ? '%' : ' kg'} decimals={1} />
      </View>

      {rows.map((r) => {
        const m = readBiaMetrics(r)
        const sub = [
          m.bodyFatPercent != null ? `${formatPct(m.bodyFatPercent)} grasa` : null,
          m.skeletalMuscleMassKg != null ? `${formatKg(m.skeletalMuscleMassKg)} músculo` : null,
        ]
          .filter(Boolean)
          .join(' · ')
        return <RowItem key={r.id} theme={theme} title={deviceLabel(r)} subtitle={sub} onDelete={() => confirmDelete(r.id, onDeleted)} />
      })}
    </View>
  )
}

type IsakSeriesKey = 'bodyFat' | 'muscle' | 'adipose'
const ISAK_SERIES: { key: IsakSeriesKey; label: string; pct: boolean; read: (v: IsakMetricsView) => number }[] = [
  { key: 'bodyFat', label: '% Grasa', pct: true, read: (v) => v.bodyFat.percent },
  { key: 'muscle', label: 'M. muscular', pct: false, read: (v) => v.fractionation.muscle.kg },
  { key: 'adipose', label: 'M. adiposa', pct: false, read: (v) => v.fractionation.adipose.kg },
]

function IsakTrendPanel({ theme, rows, onDeleted }: { theme: ThemeT; rows: BodyCompositionRow[]; onDeleted: () => void }) {
  const [active, setActive] = useState<IsakSeriesKey>('bodyFat')
  const series = ISAK_SERIES.find((s) => s.key === active)!
  const fmt = series.pct ? formatPct : formatKg

  const pick = (r: BodyCompositionRow) => {
    const v = readIsakMetrics(r)
    return v ? series.read(v) : null
  }
  const points: TrendPoint[] = [...rows]
    .reverse()
    .map((r) => ({ label: shortDate(r.measured_at), v: pick(r) }))
    .filter((d): d is TrendPoint => d.v != null)
  const latest = rows[0]
  const latestView = latest ? readIsakMetrics(latest) : null
  const latestDelta = rows.length ? deltaVsPrev(rows, 0, pick) : null

  if (rows.length === 0) {
    return <EmptyCard theme={theme} text="Aún no hay mediciones de antropometría (ISAK) para este alumno." />
  }

  return (
    <View style={{ gap: 12 }}>
      {latestView ? <IsakResultCard theme={theme} view={latestView} isValidated={latest!.is_validated} title="Última medición" /> : null}

      <View style={[styles.section, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
        <View style={styles.seriesRow}>
          {ISAK_SERIES.map((s) => (
            <Toggle key={s.key} theme={theme} label={s.label} active={active === s.key} onPress={() => setActive(s.key)} />
          ))}
          {latestDelta != null ? (
            <Text style={[styles.deltaTag, { color: latestDelta > 0 ? theme.destructive : latestDelta < 0 ? theme.success : theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>
              Δ {latestDelta > 0 ? '+' : ''}
              {fmt(latestDelta)}
            </Text>
          ) : null}
        </View>
        <TrendChart points={points} color={theme.success} suffix={series.pct ? '%' : ' kg'} decimals={1} />
      </View>

      {rows.map((r) => {
        const v = readIsakMetrics(r)
        const sub = v ? `${formatPct(v.bodyFat.percent)} grasa · ${formatKg(v.fractionation.muscle.kg)} músculo` : ''
        return (
          <RowItem
            key={r.id}
            theme={theme}
            title={deviceLabel(r)}
            subtitle={sub}
            preliminar={!r.is_validated}
            onDelete={() => confirmDelete(r.id, onDeleted)}
          />
        )
      })}
    </View>
  )
}

function confirmDelete(id: string, onDeleted: () => void) {
  Alert.alert('Eliminar medición', '¿Seguro que querés eliminar esta medición?', [
    { text: 'Cancelar', style: 'cancel' },
    {
      text: 'Eliminar',
      style: 'destructive',
      onPress: async () => {
        const { error } = await deleteMeasurement(id)
        if (error) {
          Alert.alert('Error', error)
          return
        }
        onDeleted()
      },
    },
  ])
}

// ────────────────────────────────────────────────────────────────────────────
// Small UI helpers
// ────────────────────────────────────────────────────────────────────────────

function Field({
  theme,
  label,
  value,
  onChange,
  placeholder,
  keyboard,
  compact,
}: {
  theme: ThemeT
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  keyboard?: 'decimal-pad' | 'number-pad'
  compact?: boolean
}) {
  return (
    <View style={{ flex: 1, gap: 5 }}>
      <Text style={[styles.fieldLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.mutedForeground}
        keyboardType={keyboard ?? 'default'}
        autoCapitalize="none"
        style={[
          compact ? styles.inputCompact : styles.input,
          { borderColor: theme.border, backgroundColor: theme.background, color: theme.foreground, fontFamily: theme.fontSans },
        ]}
      />
    </View>
  )
}

function Toggle({ theme, label, active, onPress }: { theme: ThemeT; label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.toggle, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary + '14' : 'transparent' }]}
    >
      <Text numberOfLines={1} style={{ fontSize: 12.5, fontFamily: 'Inter_600SemiBold', color: active ? theme.primary : theme.mutedForeground }}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}

function EmptyCard({ theme, text }: { theme: ThemeT; text: string }) {
  return (
    <View style={[styles.emptyCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
      <Text style={[styles.emptyText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>{text}</Text>
    </View>
  )
}

function RowItem({
  theme,
  title,
  subtitle,
  preliminar,
  onDelete,
}: {
  theme: ThemeT
  title: string
  subtitle: string
  preliminar?: boolean
  onDelete: () => void
}) {
  return (
    <View style={[styles.rowItem, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.rowTitleLine}>
          <Text style={[styles.rowTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={1}>
            {title}
          </Text>
          {preliminar ? (
            <Text style={[styles.rowPrelim, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>PRELIMINAR</Text>
          ) : null}
        </View>
        {subtitle ? (
          <Text style={[styles.rowSub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <TouchableOpacity onPress={onDelete} hitSlop={8} style={styles.delBtn} activeOpacity={0.7}>
        <Trash2 size={18} color={theme.mutedForeground} />
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backRow: { paddingHorizontal: 16, paddingTop: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, alignSelf: 'flex-start' },
  scroll: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48, gap: 14 },
  captureRow: { flexDirection: 'row', justifyContent: 'flex-end' },
  section: { padding: 16, borderWidth: 1, gap: 12 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { fontSize: 13, letterSpacing: 0.4, textTransform: 'uppercase' },
  fieldLabel: { fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase' },
  groupLabel: { fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 },
  row2: { flexDirection: 'row', gap: 12 },
  input: { height: 46, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 15 },
  inputCompact: { height: 42, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, fontSize: 14, textAlign: 'center' },
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridCell: { flexGrow: 1, flexBasis: '46%' },
  chipRow: { gap: 8, paddingVertical: 2 },
  stepChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7 },
  toggle: { flexGrow: 1, borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 7, alignItems: 'center' },
  eqRow: { flexDirection: 'row', gap: 8 },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4 },
  errorText: { fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  warnText: { fontSize: 12, lineHeight: 17, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  // result card
  resultCard: { borderWidth: 1, padding: 14, gap: 10 },
  resultHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  resultTitle: { fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase' },
  prelimBadge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  prelimText: { fontSize: 9, letterSpacing: 0.5, textTransform: 'uppercase' },
  compGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  compCard: { flexGrow: 1, flexBasis: '30%', minWidth: 90, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, gap: 1 },
  compLabel: { fontSize: 9, letterSpacing: 0.6, textTransform: 'uppercase' },
  compKg: { fontSize: 16 },
  compPct: { fontSize: 10 },
  sumLine: { fontSize: 10.5, lineHeight: 15 },
  somCard: { flex: 1, borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, gap: 1 },
  somVal: { fontSize: 15 },
  // series + rows
  seriesRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  deltaTag: { marginLeft: 'auto', fontSize: 12 },
  emptyCard: { borderWidth: 1, padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  rowItem: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10 },
  rowTitleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowTitle: { fontSize: 13, flexShrink: 1 },
  rowPrelim: { fontSize: 8, letterSpacing: 0.5 },
  rowSub: { fontSize: 11, marginTop: 2 },
  delBtn: { padding: 6 },
  // off
  offWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, alignItems: 'center', gap: 8 },
  offCard: { borderWidth: 1, padding: 24, alignItems: 'center', gap: 12 },
  offTitle: { fontSize: 18 },
  offText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
})
