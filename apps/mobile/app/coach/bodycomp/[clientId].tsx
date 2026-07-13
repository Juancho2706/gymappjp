import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ArrowLeft, ArrowRight, Save } from 'lucide-react-native'
import { computeIsak } from '@eva/bodycomp'
import type { BiaMetrics, BodyFatEquation, IsakRawInput } from '@eva/bodycomp'
import { useTheme } from '../../../context/ThemeContext'
import { FONT } from '../../../lib/typography'
import { getWorkspaceEntitlements } from '../../../lib/entitlements'
import { useWorkspace } from '../../../lib/workspace'
import type { ClientActionWorkspace } from '../../../lib/client-actions'
import {
  deleteScopedMeasurement,
  getBodycompClientName,
  isakResultToView,
  listScopedMeasurements,
  saveBiaMeasurement,
  saveIsakMeasurement,
  type BodyCompRow,
  type IsakView,
} from '../../../lib/bodycomp-coach'
import { AppBackground } from '../../../components/AppBackground'
import { Badge } from '../../../components/Badge'
import { Button } from '../../../components/Button'
import { Card } from '../../../components/Card'
import { EvaLoaderScreen } from '../../../components/EvaLoader'
import { Input } from '../../../components/Input'
import { ModuleOffNotice } from '../../../components/ModuleOffNotice'
import { SegmentedTabs } from '../../../components/SegmentedTabs'
import { Select } from '../../../components/Select'
import { toast } from '../../../components/Toast'
import {
  BiaTrendPanel,
  BodyCompHeader,
  IsakResultCard,
  IsakTrendPanel,
} from '../../../components/coach/BodyCompShared'

/**
 * Composicion corporal del alumno (vista del coach — E6-05). Espejo mobile de
 * `apps/web/.../coach/clients/[clientId]/bodycomp` (BodyCompositionTabB6b + Bia/IsakCaptureForm +
 * Bia/IsakTrendPanel). Tres pestanas: BIA (captura del reporte del dispositivo, Entrenador), ISAK
 * (wizard antropometrico de 4 pasos con AUTOSAVE + preview en vivo IsakResultCard, Nutri) y
 * Tendencias (portada + charts + historial con eliminar, por metodo — NUNCA se mezclan).
 *
 * MONEY-SAFETY: gate `hasModule('body_composition')` + ModuleOffNotice. Toda MUTACION va por los
 * endpoints `/api/mobile/bodycomp/*` (assertModule server-side); las LECTURAS de tendencias por
 * PostgREST (RLS bcm_select del coach). En ISAK el server RECALCULA los metrics (computeIsak) — el
 * preview del cliente usa la MISMA funcion pura de @eva/bodycomp (paridad garantizada).
 */

type Tab = 'bia' | 'isak' | 'trends'
type Method = 'bia' | 'isak'

export default function BodyCompScreen() {
  const { clientId } = useLocalSearchParams<{ clientId: string }>()
  const { theme } = useTheme()
  const router = useRouter()
  const workspace = useWorkspace()
  const actionWorkspace: ClientActionWorkspace = {
    kind: workspace.kind,
    teamId: workspace.teamId,
    orgId: workspace.orgId,
  }

  const [loading, setLoading] = useState(true)
  const [entitlementsReady, setEntitlementsReady] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retryKey, setRetryKey] = useState(0)
  const [clientName, setClientName] = useState<string | null>(null)
  const [biaRows, setBiaRows] = useState<BodyCompRow[]>([])
  const [isakRows, setIsakRows] = useState<BodyCompRow[]>([])
  const [tab, setTab] = useState<Tab>('bia')
  const [trendMethod, setTrendMethod] = useState<Method>('bia')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchMeasurements = useCallback(async () => {
    if (!clientId) return { bia: [], isak: [] }
    return listScopedMeasurements(clientId, actionWorkspace)
  }, [clientId, actionWorkspace.kind, actionWorkspace.teamId, actionWorkspace.orgId])

  const reload = useCallback(async () => {
    const measurements = await fetchMeasurements()
    setBiaRows(measurements.bia)
    setIsakRows(measurements.isak)
  }, [fetchMeasurements])

  useFocusEffect(
    useCallback(() => {
      if (!clientId || !workspace.ready) return
      let active = true
      setEntitlementsReady(false)
      setEnabled(false)
      setLoading(true)
      setLoadError(null)
      setClientName(null)
      void (async () => {
        try {
          const config = await getWorkspaceEntitlements(actionWorkspace)
          if (!active) return
          const moduleEnabled = config.enabledModules.includes('body_composition')
          setEnabled(moduleEnabled)
          setEntitlementsReady(true)
          if (!moduleEnabled) {
            setClientName(null)
            setBiaRows([])
            setIsakRows([])
            setLoading(false)
            return
          }
          const [name, measurements] = await Promise.all([getBodycompClientName(clientId), fetchMeasurements()])
          if (!active) return
          setClientName(name)
          setBiaRows(measurements.bia)
          setIsakRows(measurements.isak)
          setLoading(false)
        } catch (error) {
          if (!active) return
          console.warn('[bodycomp] scoped load failed', error)
          setEntitlementsReady(true)
          setLoadError(error instanceof Error ? error.message : 'No se pudo cargar la composición corporal.')
          setClientName(null)
          setBiaRows([])
          setIsakRows([])
          setLoading(false)
        }
      })()
      return () => { active = false }
    }, [clientId, workspace.ready, actionWorkspace.kind, actionWorkspace.teamId, actionWorkspace.orgId, fetchMeasurements, retryKey]),
  )

  const onSaved = useCallback(
    async (method: Method) => {
      await reload()
      setTrendMethod(method)
      setTab('trends')
      toast.success(method === 'bia' ? 'Medición BIA guardada' : 'Medición ISAK guardada')
    },
    [reload],
  )

  const onDelete = useCallback(
    (id: string) => {
      Alert.alert('Eliminar medición', 'Esta medición se archivará. ¿Eliminar?', [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(id)
            try {
              await deleteScopedMeasurement(clientId as string, id, actionWorkspace)
            } catch (e) {
              toast.error(e instanceof Error ? e.message : 'No se pudo eliminar.')
              setDeletingId(null)
              return
            }
            try {
              await reload()
              toast.success('Medición eliminada')
            } catch {
              toast.error('Medición eliminada, pero no pudimos actualizar el historial. Reintenta.')
            } finally {
              setDeletingId(null)
            }
          },
        },
      ])
    },
    [clientId, actionWorkspace.kind, actionWorkspace.teamId, actionWorkspace.orgId, reload],
  )

  return (
    <SafeAreaView edges={['top']} style={[styles.container, { backgroundColor: theme.background }]}>
      <AppBackground />
      <BodyCompHeader
        title="Composición corporal"
        subtitle={clientName ?? 'Alumno'}
        onBack={() => router.back()}
        showBadge
      />
      {!workspace.ready || !entitlementsReady || (enabled && loading) ? (
        <EvaLoaderScreen subtitle="Cargando composición…" />
      ) : loadError ? (
        <View style={styles.body}>
          <Card>
            <Text style={{ color: theme.destructive, fontFamily: FONT.ui }}>{loadError}</Text>
            <Button label="Reintentar" variant="secondary" onPress={() => setRetryKey((value) => value + 1)} />
          </Card>
        </View>
      ) : !enabled ? (
        <ModuleOffNotice moduleKey="body_composition" />
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <SegmentedTabs
            items={[
              { value: 'bia', label: 'BIA' },
              { value: 'isak', label: 'ISAK' },
              { value: 'trends', label: 'Tendencias' },
            ]}
            value={tab}
            onChange={setTab}
          />

          {tab === 'bia' ? (
            <BiaCaptureForm clientId={clientId as string} workspace={actionWorkspace} onSaved={() => onSaved('bia')} />
          ) : tab === 'isak' ? (
            <IsakWizard clientId={clientId as string} workspace={actionWorkspace} onSaved={() => onSaved('isak')} />
          ) : (
            <View style={{ gap: 14 }}>
              <SegmentedTabs
                size="sm"
                items={[
                  { value: 'bia', label: 'Bioimpedancia' },
                  { value: 'isak', label: 'Antropometría' },
                ]}
                value={trendMethod}
                onChange={setTrendMethod}
              />
              {trendMethod === 'bia' ? (
                <BiaTrendPanel rows={biaRows} deletingId={deletingId} onDelete={onDelete} />
              ) : (
                <IsakTrendPanel rows={isakRows} deletingId={deletingId} onDelete={onDelete} />
              )}
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  )
}

/* ── Helpers de parseo numerico ─────────────────────────────────────────────────── */
function toNum(v: string | undefined): number | undefined {
  if (v == null || v.trim() === '') return undefined
  const n = Number(v.replace(',', '.'))
  return Number.isFinite(n) ? n : undefined
}
/** Sanea a decimal (digitos + un separador). */
function sanitizeDecimal(t: string): string {
  const cleaned = t.replace(/[^\d.,]/g, '').replace(',', '.')
  const parts = cleaned.split('.')
  return parts.length <= 2 ? cleaned : `${parts[0]}.${parts.slice(1).join('')}`
}
const sanitizeInt = (t: string) => t.replace(/[^\d]/g, '')

/* ── Campo numerico (celda de grilla) ───────────────────────────────────────────── */
function NumField({
  label,
  value,
  onChange,
  testID,
  integer,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  testID: string
  integer?: boolean
}) {
  return (
    <View style={styles.gridCell}>
      <Input
        testID={testID}
        label={label}
        value={value}
        onChangeText={(t) => onChange(integer ? sanitizeInt(t) : sanitizeDecimal(t))}
        keyboardType={integer ? 'number-pad' : 'decimal-pad'}
        maxLength={integer ? 3 : 7}
        placeholder="—"
      />
    </View>
  )
}

/* ── BIA capture form ───────────────────────────────────────────────────────────── */
const BIA_METRIC_FIELDS: { key: string; label: string }[] = [
  { key: 'skeletalMuscleMassKg', label: 'Masa muscular esq. (kg)' },
  { key: 'fatMassKg', label: 'Masa grasa (kg)' },
  { key: 'bodyFatPercent', label: '% Grasa corporal' },
  { key: 'totalBodyWaterL', label: 'Agua total (L)' },
  { key: 'intracellularWaterL', label: 'Agua intracelular (L)' },
  { key: 'extracellularWaterL', label: 'Agua extracelular (L)' },
  { key: 'ecwTbwRatio', label: 'Razón ECW/TBW' },
  { key: 'visceralFatAreaCm2', label: 'Grasa visceral área (cm²)' },
  { key: 'visceralFatLevel', label: 'Grasa visceral nivel' },
  { key: 'basalMetabolicRateKcal', label: 'Metabolismo basal (kcal)' },
  { key: 'phaseAngleDeg', label: 'Ángulo de fase (°)' },
]
const BIA_METRIC_KEYS = BIA_METRIC_FIELDS.map((f) => f.key)

function BiaCaptureForm({ clientId, workspace, onSaved }: { clientId: string; workspace: ClientActionWorkspace; onSaved: () => Promise<void> }) {
  const { theme } = useTheme()
  const [values, setValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const set = (key: string) => (v: string) => setValues((prev) => ({ ...prev, [key]: v }))

  const hasAnyMetric = useMemo(
    () => BIA_METRIC_KEYS.some((k) => toNum(values[k]) != null),
    [values],
  )

  async function handleSubmit() {
    const metrics: Record<string, number> = {}
    for (const k of BIA_METRIC_KEYS) {
      const n = toNum(values[k])
      if (n != null) metrics[k] = n
    }
    setSaving(true)
    try {
      await saveBiaMeasurement({
        clientId,
        // Solo claves numericas conocidas (BIA_METRIC_KEYS ⊂ BiaMetrics); el server re-valida (.strict()).
        metrics: metrics as BiaMetrics,
        deviceBrand: values.deviceBrand?.trim() || null,
        deviceModel: values.deviceModel?.trim() || null,
        weightKg: toNum(values.weightKg) ?? null,
        heightCm: toNum(values.heightCm) ?? null,
        notes: values.notes?.trim() || null,
      }, workspace)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar la medición.')
      setSaving(false)
      return
    }
    setValues({})
    try {
      await onSaved()
    } catch {
      toast.error('Medición guardada, pero no pudimos actualizar el historial. Reintenta.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card padding="md" style={{ gap: 14 }}>
      <View style={styles.formHead}>
        <Text style={[styles.formTitle, { color: theme.foreground, fontFamily: FONT.displayBold }]}>
          Nueva medición · BIA
        </Text>
        <Badge tone="neutral" variant="soft" size="sm">
          Entrenador
        </Badge>
      </View>
      <Text style={[styles.formHint, { color: theme.mutedForeground, fontFamily: FONT.ui }]}>
        Transcribe el reporte del equipo (InBody, Tanita, Omron). No se calcula: se guarda tal cual.
      </Text>

      <View style={styles.grid}>
        <View style={styles.gridCell}>
          <Input testID="bia-brand" label="Marca del equipo" value={values.deviceBrand ?? ''} onChangeText={set('deviceBrand')} placeholder="InBody" maxLength={60} />
        </View>
        <View style={styles.gridCell}>
          <Input testID="bia-model" label="Modelo" value={values.deviceModel ?? ''} onChangeText={set('deviceModel')} placeholder="570" maxLength={60} />
        </View>
        <NumField label="Peso (kg)" value={values.weightKg ?? ''} onChange={set('weightKg')} testID="bia-weight" />
        <NumField label="Estatura (cm)" value={values.heightCm ?? ''} onChange={set('heightCm')} testID="bia-height" />
      </View>

      <View style={styles.grid}>
        {BIA_METRIC_FIELDS.map((f) => (
          <NumField key={f.key} label={f.label} value={values[f.key] ?? ''} onChange={set(f.key)} testID={`bia-${f.key}`} />
        ))}
      </View>

      <Input testID="bia-notes" label="Notas" value={values.notes ?? ''} onChangeText={set('notes')} maxLength={1000} />

      <Button
        testID="bia-save"
        label={saving ? 'Guardando…' : 'Guardar medición BIA'}
        variant="sport"
        leftIcon={Save}
        loading={saving}
        disabled={!hasAnyMetric || saving}
        onPress={handleSubmit}
        full
      />
    </Card>
  )
}

/* ── ISAK wizard (4 pasos, autosave) ────────────────────────────────────────────── */
type Field = { name: string; label: string }
const SKINFOLDS: Field[] = [
  { name: 'tricepsMm', label: 'Tríceps' },
  { name: 'subscapularMm', label: 'Subescapular' },
  { name: 'supraspinaleMm', label: 'Supraespinal' },
  { name: 'abdominalMm', label: 'Abdominal' },
  { name: 'frontThighMm', label: 'Muslo anterior' },
  { name: 'medialCalfMm', label: 'Pantorrilla medial' },
  { name: 'bicepsMm', label: 'Bíceps' },
  { name: 'iliacCrestMm', label: 'Cresta ilíaca' },
]
const GIRTHS: Field[] = [
  { name: 'headCm', label: 'Cabeza' },
  { name: 'armRelaxedCm', label: 'Brazo relajado' },
  { name: 'armFlexedCm', label: 'Brazo flexionado' },
  { name: 'forearmCm', label: 'Antebrazo' },
  { name: 'chestMesosternaleCm', label: 'Tórax (mesoesternal)' },
  { name: 'waistCm', label: 'Cintura' },
  { name: 'thighCm', label: 'Muslo' },
  { name: 'calfCm', label: 'Pantorrilla' },
]
const BREADTHS: Field[] = [
  { name: 'biacromialCm', label: 'Biacromial' },
  { name: 'biiliocristalCm', label: 'Biiliocristal' },
  { name: 'humerusCm', label: 'Húmero (biepic.)' },
  { name: 'femurCm', label: 'Fémur (biepic.)' },
  { name: 'transverseChestCm', label: 'Tórax transverso' },
  { name: 'apChestDepthCm', label: 'Tórax A-P (prof.)' },
]
const STEPS = ['Datos + pliegues', 'Perímetros', 'Diámetros', 'Revisión']
const EQUATIONS: { value: BodyFatEquation; label: string }[] = [
  { value: 'durnin_womersley', label: 'Durnin-Womersley (general)' },
  { value: 'yuhasz', label: 'Yuhasz (atletas)' },
  { value: 'faulkner', label: 'Faulkner (atletas)' },
]

const inRange = (n: number | undefined, max: number): n is number => n != null && n > 0 && n <= max

/**
 * Construye el input crudo de dominio si TODAS las medidas estan presentes y en rango (espejo de
 * IsakRawInputSchema). null => faltan datos o hay valores fuera de rango (preview oculto / no se
 * puede guardar). `ageYears` es opcional (lo exige Durnin-Womersley; el server valida).
 */
function buildDomain(values: Record<string, string>, sex: 'male' | 'female'): IsakRawInput | null {
  const heightCm = toNum(values.heightCm)
  const weightKg = toNum(values.weightKg)
  const sittingHeightCm = toNum(values.sittingHeightCm)
  if (!inRange(heightCm, 260) || !inRange(weightKg, 400) || !inRange(sittingHeightCm, 170)) return null

  const age = toNum(values.ageYears)
  if (age != null && (age < 3 || age > 120)) return null

  const grab = (fields: Field[], max: number): Record<string, number> | null => {
    const out: Record<string, number> = {}
    for (const f of fields) {
      const n = toNum(values[f.name])
      if (!inRange(n, max)) return null
      out[f.name] = n
    }
    return out
  }
  const skinfolds = grab(SKINFOLDS, 100)
  const girths = grab(GIRTHS, 250)
  const breadths = grab(BREADTHS, 60)
  if (!skinfolds || !girths || !breadths) return null

  return {
    sex,
    ageYears: age,
    heightCm,
    weightKg,
    sittingHeightCm,
    skinfolds: skinfolds as unknown as IsakRawInput['skinfolds'],
    girths: girths as unknown as IsakRawInput['girths'],
    breadths: breadths as unknown as IsakRawInput['breadths'],
  }
}

const isakCacheKey = (clientId: string) => `eva_bodycomp_isak_${clientId}`

function IsakWizard({ clientId, workspace, onSaved }: { clientId: string; workspace: ClientActionWorkspace; onSaved: () => Promise<void> }) {
  const { theme } = useTheme()
  const [step, setStep] = useState(0)
  const [values, setValues] = useState<Record<string, string>>({})
  const [sex, setSex] = useState<'male' | 'female'>('male')
  const [equation, setEquation] = useState<BodyFatEquation>('durnin_womersley')
  const [saving, setSaving] = useState(false)
  const [hydrated, setHydrated] = useState(false)

  // Rehidratar desde AsyncStorage (resume instantaneo del wizard, cross-tab e incluso sin red).
  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const raw = await AsyncStorage.getItem(isakCacheKey(clientId))
        if (raw && alive) {
          const parsed = JSON.parse(raw) as {
            values?: Record<string, string>
            sex?: 'male' | 'female'
            equation?: BodyFatEquation
            step?: number
          }
          if (parsed.values) setValues(parsed.values)
          if (parsed.sex === 'male' || parsed.sex === 'female') setSex(parsed.sex)
          if (parsed.equation) setEquation(parsed.equation)
          if (typeof parsed.step === 'number') setStep(Math.min(Math.max(0, parsed.step), STEPS.length - 1))
        }
      } catch {
        /* cache ilegible: se ignora */
      } finally {
        if (alive) setHydrated(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [clientId])

  const persist = useCallback(
    (next: { values: Record<string, string>; sex: 'male' | 'female'; equation: BodyFatEquation; step: number }) => {
      if (!hydrated) return
      void AsyncStorage.setItem(isakCacheKey(clientId), JSON.stringify(next)).catch(() => {})
    },
    [clientId, hydrated],
  )

  const setField = (key: string) => (v: string) =>
    setValues((prev) => {
      const nextValues = { ...prev, [key]: v }
      persist({ values: nextValues, sex, equation, step })
      return nextValues
    })

  function goStep(next: number) {
    const clamped = Math.max(0, Math.min(STEPS.length - 1, next))
    setStep(clamped)
    persist({ values, sex, equation, step: clamped })
  }

  const domain = useMemo(() => buildDomain(values, sex), [values, sex])
  const previewView: IsakView | null = useMemo(() => {
    if (!domain) return null
    try {
      const result = computeIsak(domain, { bodyFatEquation: equation })
      if (!Number.isFinite(result.bodyFat.percent)) return null
      return isakResultToView(result)
    } catch {
      return null
    }
  }, [domain, equation])

  async function handleSubmit() {
    if (!domain) return
    setSaving(true)
    try {
      await saveIsakMeasurement({
        clientId,
        rawInput: domain,
        bodyFatEquation: equation,
        weightKg: domain.weightKg,
        heightCm: domain.heightCm,
      }, workspace)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo guardar la medición.')
      setSaving(false)
      return
    }
    await AsyncStorage.removeItem(isakCacheKey(clientId)).catch(() => {})
    setValues({})
    setStep(0)
    try {
      await onSaved()
    } catch {
      toast.error('Medición guardada, pero no pudimos actualizar el historial. Reintenta.')
    } finally {
      setSaving(false)
    }
  }

  const fieldGrid = (fields: Field[], unit: string, integer?: boolean) => (
    <View style={styles.grid}>
      {fields.map((f) => (
        <NumField
          key={f.name}
          label={`${f.label} (${unit})`}
          value={values[f.name] ?? ''}
          onChange={setField(f.name)}
          testID={`isak-${f.name}`}
          integer={integer}
        />
      ))}
    </View>
  )

  return (
    <Card padding="md" style={{ gap: 14 }}>
      <View style={styles.formHead}>
        <Text style={[styles.formTitle, { color: theme.foreground, fontFamily: FONT.displayBold }]} numberOfLines={1}>
          Nueva ISAK · {STEPS[step]}
        </Text>
        <Badge tone="success" variant="soft" size="sm">
          Nutri
        </Badge>
      </View>

      {/* Stepper */}
      <View style={styles.stepper}>
        {STEPS.map((label, i) => {
          const on = i === step
          return (
            <TouchableOpacity
              key={label}
              testID={`isak-step-${i}`}
              activeOpacity={0.85}
              onPress={() => goStep(i)}
              style={[styles.stepPill, { backgroundColor: on ? theme.foreground : theme.secondary }]}
            >
              <Text style={[styles.stepPillTxt, { color: on ? theme.background : theme.mutedForeground, fontFamily: FONT.uiBold }]} numberOfLines={1}>
                {i + 1}. {label}
              </Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {step === 0 ? (
        <View style={{ gap: 12 }}>
          <View style={styles.grid}>
            <View style={styles.gridCell}>
              <Select
                label="Sexo"
                title="Sexo"
                value={sex}
                onValueChange={(v) => {
                  const s = v as 'male' | 'female'
                  setSex(s)
                  persist({ values, sex: s, equation, step })
                }}
                options={[
                  { value: 'male', label: 'Masculino' },
                  { value: 'female', label: 'Femenino' },
                ]}
              />
            </View>
            <NumField label="Edad (años)" value={values.ageYears ?? ''} onChange={setField('ageYears')} testID="isak-ageYears" integer />
            <NumField label="Estatura (cm)" value={values.heightCm ?? ''} onChange={setField('heightCm')} testID="isak-heightCm" />
            <NumField label="Peso (kg)" value={values.weightKg ?? ''} onChange={setField('weightKg')} testID="isak-weightKg" />
            <NumField label="Talla sentado (cm)" value={values.sittingHeightCm ?? ''} onChange={setField('sittingHeightCm')} testID="isak-sittingHeightCm" />
          </View>
          <Text style={[styles.groupLabel, { color: theme.mutedForeground, fontFamily: FONT.uiBold }]}>PLIEGUES (MM)</Text>
          {fieldGrid(SKINFOLDS, 'mm')}
        </View>
      ) : null}

      {step === 1 ? fieldGrid(GIRTHS, 'cm') : null}
      {step === 2 ? fieldGrid(BREADTHS, 'cm') : null}

      {step === 3 ? (
        <View style={{ gap: 12 }}>
          <Select
            label="Ecuación de % grasa"
            title="Ecuación de % grasa"
            value={equation}
            onValueChange={(v) => {
              const eq = v as BodyFatEquation
              setEquation(eq)
              persist({ values, sex, equation: eq, step })
            }}
            options={EQUATIONS}
          />
          {previewView ? (
            <IsakResultCard view={previewView} isValidated={false} title="Vista previa" />
          ) : (
            <View className="bg-warning-100 dark:bg-warning-100/[0.14]" style={styles.warnBox}>
              <Text className="text-warning-700" style={[styles.warnTxt, { fontFamily: FONT.uiSemibold }]}>
                Completa todas las medidas para ver el cálculo. Faltan datos o hay valores fuera de rango
                {equation === 'durnin_womersley' ? ' (Durnin-Womersley requiere la edad)' : ''}.
              </Text>
            </View>
          )}
        </View>
      ) : null}

      {/* Navegacion */}
      <View style={styles.navRow}>
        <Button
          testID="isak-back"
          label="Atrás"
          variant="secondary"
          leftIcon={ArrowLeft}
          disabled={step === 0}
          onPress={() => goStep(step - 1)}
          style={{ flex: 1 }}
        />
        {step < STEPS.length - 1 ? (
          <Button
            testID="isak-next"
            label="Siguiente"
            variant="primary"
            rightIcon={ArrowRight}
            onPress={() => goStep(step + 1)}
            style={{ flex: 1 }}
          />
        ) : (
          <Button
            testID="isak-save"
            label={saving ? 'Guardando…' : 'Guardar ISAK'}
            variant="sport"
            leftIcon={Save}
            loading={saving}
            disabled={saving || !previewView}
            onPress={handleSubmit}
            style={{ flex: 1 }}
          />
        )}
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48, gap: 14 },
  // Forms
  formHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  formTitle: { flex: 1, fontSize: 16, letterSpacing: -0.3 },
  formHint: { fontSize: 12, lineHeight: 17 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridCell: { flexBasis: '46%', flexGrow: 1, minWidth: 130 },
  groupLabel: { fontSize: 11, letterSpacing: 0.6, marginTop: 2 },
  // Stepper
  stepper: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stepPill: { borderRadius: 999, paddingHorizontal: 12, height: 32, alignItems: 'center', justifyContent: 'center' },
  stepPillTxt: { fontSize: 11 },
  // Nav
  navRow: { flexDirection: 'row', gap: 10 },
  warnBox: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  warnTxt: { fontSize: 12.5, lineHeight: 18 },
})
