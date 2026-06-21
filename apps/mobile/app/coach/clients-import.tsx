// Wizard de importación de alumnos (port del wizard web de 4 pasos:
// apps/web/src/app/coach/clients/import/_components/ImportWizard.tsx).
// Pasos: 1) Subir/pegar CSV · 2) Mapear columnas arbitrarias → campos EVA · 3) Preview validado
// fila a fila · 4) Confirmar con tier-gate (canImportClients) + chequeo max_clients vs activos.
// CSV-only en mobile (xlsx/SheetJS = follow-up). Crea en lote vía /api/mobile/coach/clients
// (mismo endpoint que el modal Nuevo Alumno; el server reaplica el límite del plan, 402).
import { useEffect, useMemo, useState } from 'react'
import { Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Check, ChevronLeft, FileSpreadsheet, Lock, Upload } from 'lucide-react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { useTheme } from '../../context/ThemeContext'
import { Button, ScreenHeader } from '../../components'
import { EvaLoaderScreen } from '../../components/EvaLoader'
import { AppBackground } from '../../components/AppBackground'
import { getCoachProfile } from '../../lib/coach'
import { canImportClients } from '../../lib/coach-tiers'
import { supabase } from '../../lib/supabase'
import { apiFetch, ApiError } from '../../lib/api'
import {
  applyMapping,
  matchHeaders,
  parseRawSheet,
  IMPORT_FIELD_LABELS,
  type ColumnMapping,
  type ImportField,
  type MappedClientRow,
  type ParsedSheet,
} from '../../lib/import-clients'

const STEP_LABELS = ['Subir', 'Mapear', 'Revisar', 'Confirmar']

const FIELD_OPTIONS: { value: ImportField | 'ignore'; label: string }[] = [
  { value: 'ignore', label: 'No importar' },
  { value: 'full_name', label: 'Nombre completo' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Teléfono' },
  { value: 'subscription_start_date', label: 'Fecha de inicio' },
]

const REQUIRED: ImportField[] = ['full_name', 'email']

function genTempPassword(): string {
  return `Eva${Math.floor(100000 + Math.random() * 900000)}!`
}

export default function ClientsImportScreen() {
  const { theme } = useTheme()
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [entitled, setEntitled] = useState(false)
  const [maxClients, setMaxClients] = useState(10)
  const [activeCount, setActiveCount] = useState(0)

  const [step, setStep] = useState(1)
  const [sheet, setSheet] = useState<ParsedSheet | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [mappedRows, setMappedRows] = useState<MappedClientRow[]>([])

  useEffect(() => {
    ;(async () => {
      try {
        const profile = await getCoachProfile()
        if (!profile) return
        setEntitled(canImportClients(profile.subscriptionTier))
        setMaxClients(profile.maxClients ?? 10)
        const { count } = await supabase
          .from('clients')
          .select('id', { count: 'exact', head: true })
          .eq('coach_id', profile.id)
          .eq('is_archived', false)
        setActiveCount(count ?? 0)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  if (loading) {
    return (
      <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
        <AppBackground />
        <EvaLoaderScreen subtitle="Cargando importador…" />
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
      <ScreenHeader title="Importar alumnos" subtitle="Subí tu cartera desde un CSV" />

      {!entitled ? (
        <View style={styles.offWrap}>
          <View style={[styles.offCard, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl }]}>
            <Lock size={26} color={theme.mutedForeground} />
            <Text style={[styles.offTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>Disponible desde Starter</Text>
            <Text style={[styles.offText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              La importación masiva de alumnos es una función de los planes de pago. Actualizá tu plan para importar tu cartera completa de una vez.
            </Text>
            <Button label="Ver planes en la web" onPress={() => Linking.openURL('https://eva-app.cl/coach/subscription').catch(() => {})} full />
          </View>
        </View>
      ) : (
        <>
          {/* Stepper */}
          <View style={styles.stepper}>
            {STEP_LABELS.map((label, idx) => {
              const num = idx + 1
              const isDone = step > num
              const isCurrent = step === num
              const bg = isDone || isCurrent ? theme.primary : theme.secondary
              const fg = isDone || isCurrent ? theme.primaryForeground : theme.mutedForeground
              return (
                <View key={label} style={styles.stepItem}>
                  <TouchableOpacity
                    disabled={!isDone}
                    onPress={() => isDone && setStep(num)}
                    style={styles.stepBtn}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.stepCircle, { backgroundColor: bg }]}>
                      {isDone ? <Check size={13} color={fg} /> : <Text style={[styles.stepNum, { color: fg }]}>{num}</Text>}
                    </View>
                    <Text style={[styles.stepLabel, { color: isCurrent ? theme.foreground : theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                  {idx < STEP_LABELS.length - 1 && (
                    <View style={[styles.stepLine, { backgroundColor: step > num ? theme.primary : theme.border }]} />
                  )}
                </View>
              )
            })}
          </View>

          {step === 1 && (
            <StepUpload
              theme={theme}
              onComplete={(s) => {
                setSheet(s)
                // auto-mapeo inicial
                const auto = matchHeaders(s.headers)
                const m: ColumnMapping = {}
                auto.forEach((match, idx) => { m[idx] = match.field })
                setMapping(m)
                setStep(2)
              }}
            />
          )}
          {step === 2 && sheet && (
            <StepMap
              theme={theme}
              sheet={sheet}
              mapping={mapping}
              setMapping={setMapping}
              onBack={() => setStep(1)}
              onComplete={() => { setMappedRows(applyMapping(sheet, mapping)); setStep(3) }}
            />
          )}
          {step === 3 && (
            <StepPreview
              theme={theme}
              rows={mappedRows}
              onBack={() => setStep(2)}
              onComplete={() => setStep(4)}
            />
          )}
          {step === 4 && (
            <StepConfirm
              theme={theme}
              rows={mappedRows.filter((r) => r.valid)}
              maxClients={maxClients}
              activeCount={activeCount}
              onBack={() => setStep(3)}
              onDone={() => router.replace('/coach/(tabs)/clientes')}
            />
          )}
        </>
      )}
    </SafeAreaView>
  )
}

// ── Paso 1: subir / pegar ──────────────────────────────────────────────────────
function StepUpload({ theme, onComplete }: { theme: any; onComplete: (s: ParsedSheet) => void }) {
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const preview = useMemo(() => (text.trim() ? parseRawSheet(text, fileName ?? 'pegado.csv') : null), [text, fileName])

  async function pickFile() {
    setError(null)
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv', 'application/vnd.ms-excel', 'text/plain'],
        copyToCacheDirectory: true,
      })
      if (res.canceled || !res.assets?.[0]) return
      const asset = res.assets[0]
      const content = await FileSystem.readAsStringAsync(asset.uri)
      setFileName(asset.name ?? 'archivo.csv')
      setText(content)
    } catch {
      setError('No se pudo leer el archivo. Revisá que sea un CSV de texto.')
    }
  }

  function next() {
    const s = parseRawSheet(text, fileName ?? 'pegado.csv')
    if (!s.headers.length || !s.rows.length) {
      setError('El CSV necesita una fila de encabezados y al menos una fila de datos.')
      return
    }
    onComplete(s)
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
        <Text style={[styles.cardHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Subí un CSV (la primera fila debe ser el encabezado) o pegá el texto. En el siguiente paso vas a mapear cada columna a un campo de EVA.
        </Text>
        <Button label={fileName ? `Archivo: ${fileName}` : 'Subir CSV'} variant="outline" leftIcon={Upload} onPress={pickFile} full />
        <Text style={[styles.orLabel, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>o pegá el contenido</Text>
        <TextInput
          value={text}
          onChangeText={(v) => { setText(v); setFileName(null); setError(null) }}
          multiline
          placeholder={'nombre,email,telefono\nJuan Pérez,juan@mail.com,+569...'}
          placeholderTextColor={theme.mutedForeground}
          style={[styles.textarea, { borderColor: theme.border, backgroundColor: theme.secondary, color: theme.foreground, borderRadius: theme.radius.lg, fontFamily: theme.fontSans }]}
        />
        {preview && preview.headers.length > 0 && (
          <Text style={[styles.cardHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Detectadas {preview.headers.length} columna(s) y {preview.rows.length} fila(s).
          </Text>
        )}
        {error && <Text style={[styles.errText, { color: theme.destructive, fontFamily: 'Inter_600SemiBold' }]}>{error}</Text>}
      </View>
      <Button label="Continuar" onPress={next} disabled={!text.trim()} full />
    </ScrollView>
  )
}

// ── Paso 2: mapear columnas ──────────────────────────────────────────────────────
function StepMap({
  theme, sheet, mapping, setMapping, onBack, onComplete,
}: {
  theme: any
  sheet: ParsedSheet
  mapping: ColumnMapping
  setMapping: (m: ColumnMapping) => void
  onBack: () => void
  onComplete: () => void
}) {
  const auto = useMemo(() => matchHeaders(sheet.headers), [sheet.headers])
  const mappedFields = Object.values(mapping).filter(Boolean) as ImportField[]
  const missing = REQUIRED.filter((f) => !mappedFields.includes(f))
  const canContinue = missing.length === 0

  function setCol(colIdx: number, value: ImportField | 'ignore') {
    const next: ColumnMapping = { ...mapping }
    const field = value === 'ignore' ? null : value
    // un campo destino sólo puede mapearse a una columna: limpiar el dueño anterior
    if (field) {
      for (const [k, v] of Object.entries(next)) if (v === field) next[Number(k)] = null
    }
    next[colIdx] = field
    setMapping(next)
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <Text style={[styles.bodyHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
        Asigná cada columna de tu archivo a un campo de EVA. Nombre y email son obligatorios.
      </Text>
      {sheet.headers.map((header, colIdx) => {
        const examples = sheet.rows.slice(0, 2).map((r) => r[colIdx]).filter(Boolean).join(', ')
        const current = mapping[colIdx] ?? 'ignore'
        const conf = auto[colIdx]?.confidence
        return (
          <View key={colIdx} style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius.xl, gap: 10 }]}>
            <View style={styles.mapHead}>
              <Text style={[styles.mapHeader, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]} numberOfLines={1}>{header || `Columna ${colIdx + 1}`}</Text>
              {current !== 'ignore' && conf === 'exact' && <Tag theme={theme} label="Auto" color="#10B981" />}
              {current !== 'ignore' && conf === 'fuzzy' && <Tag theme={theme} label="Sugerido" color="#F59E0B" />}
            </View>
            {examples ? <Text style={[styles.mapExamples, { color: theme.mutedForeground, fontFamily: theme.fontSans }]} numberOfLines={1}>Ej: {examples}</Text> : null}
            <View style={styles.optionsRow}>
              {FIELD_OPTIONS.map((opt) => {
                const active = current === opt.value
                return (
                  <TouchableOpacity
                    key={opt.value}
                    onPress={() => setCol(colIdx, opt.value)}
                    activeOpacity={0.8}
                    style={[styles.optChip, { borderColor: active ? theme.primary : theme.border, backgroundColor: active ? theme.primary + '14' : 'transparent' }]}
                  >
                    <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: active ? theme.primary : theme.mutedForeground }}>{opt.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        )
      })}
      {missing.length > 0 && (
        <Text style={[styles.warnBox, { color: theme.destructive, borderColor: theme.destructive + '4D', backgroundColor: theme.destructive + '14', fontFamily: theme.fontSans }]}>
          Falta mapear: {missing.map((f) => IMPORT_FIELD_LABELS[f]).join(', ')}
        </Text>
      )}
      <View style={styles.navRow}>
        <Button label="Volver" variant="secondary" onPress={onBack} style={{ flex: 1 }} />
        <Button label="Continuar" onPress={onComplete} disabled={!canContinue} style={{ flex: 1 }} />
      </View>
    </ScrollView>
  )
}

// ── Paso 3: preview validado ──────────────────────────────────────────────────────
function StepPreview({
  theme, rows, onBack, onComplete,
}: {
  theme: any
  rows: MappedClientRow[]
  onBack: () => void
  onComplete: () => void
}) {
  const valid = rows.filter((r) => r.valid)
  const invalid = rows.length - valid.length

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <Text style={[styles.bodyHint, { color: theme.foreground, fontFamily: 'Inter_700Bold' }]}>
        {valid.length} válido(s){invalid ? ` · ${invalid} con error` : ''}
      </Text>
      {rows.map((r) => (
        <View
          key={r.rowIndex}
          style={[styles.previewRow, { borderColor: r.valid ? theme.border : theme.destructive + '55', backgroundColor: r.valid ? theme.card : theme.destructive + '0D', borderRadius: theme.radius.lg }]}
        >
          <View style={[styles.dot, { backgroundColor: r.valid ? '#10B981' : theme.destructive }]} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ color: theme.foreground, fontSize: 13, fontFamily: theme.fontSans }}>
              {r.name || '(sin nombre)'}
            </Text>
            <Text numberOfLines={1} style={{ color: theme.mutedForeground, fontSize: 11.5, fontFamily: theme.fontSans }}>
              {r.email || '(sin email)'}{r.phone ? ` · ${r.phone}` : ''}{r.startDate ? ` · ${r.startDate}` : ''}
            </Text>
          </View>
          {!r.valid ? <Text style={{ color: theme.destructive, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>{r.error}</Text> : null}
        </View>
      ))}
      {invalid > 0 && (
        <Text style={[styles.bodyHint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
          Las filas con error se omiten automáticamente. Podés volver atrás a corregir el mapeo.
        </Text>
      )}
      <View style={styles.navRow}>
        <Button label="Volver" variant="secondary" onPress={onBack} style={{ flex: 1 }} />
        <Button label="Continuar" onPress={onComplete} disabled={valid.length === 0} style={{ flex: 1 }} />
      </View>
    </ScrollView>
  )
}

// ── Paso 4: confirmar (tier-gate + max_clients + crear en lote) ──────────────────
function StepConfirm({
  theme, rows, maxClients, activeCount, onBack, onDone,
}: {
  theme: any
  rows: MappedClientRow[]
  maxClients: number
  activeCount: number
  onBack: () => void
  onDone: () => void
}) {
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ ok: number; fail: number; errors: string[] } | null>(null)

  const wouldExceed = activeCount + rows.length > maxClients
  const canImport = consent && !wouldExceed && !busy

  async function run() {
    if (!canImport) return
    setBusy(true)
    let ok = 0, fail = 0
    const errors: string[] = []
    try {
      for (const r of rows) {
        try {
          await apiFetch('/api/mobile/coach/clients', {
            method: 'POST',
            authenticated: true,
            body: {
              fullName: r.name,
              email: r.email.toLowerCase(),
              phone: r.phone || undefined,
              subscriptionStartDate: r.startDate ?? new Date().toISOString().slice(0, 10),
              tempPassword: genTempPassword(),
              ageConfirmed: true,
            },
          })
          ok += 1
        } catch (e: any) {
          fail += 1
          // 402 = límite del plan alcanzado server-side: cortamos el lote (no tiene sentido seguir)
          if (e instanceof ApiError && e.status === 402) {
            errors.push('Alcanzaste el límite de alumnos de tu plan. Importación detenida.')
            break
          }
          if (errors.length < 6) errors.push(`${r.name}: ${e?.message ?? 'error'}`)
        }
      }
    } finally {
      setBusy(false)
      setResult({ ok, fail, errors })
    }
  }

  if (result) {
    return (
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.card, { backgroundColor: '#10B98114', borderColor: '#10B98140', borderRadius: theme.radius['2xl'], alignItems: 'center' }]}>
          <Text style={{ color: '#10B981', fontSize: 22, fontFamily: 'Montserrat_800ExtraBold' }}>{result.ok} importados</Text>
          {result.fail > 0 && <Text style={{ color: theme.mutedForeground, fontSize: 13, fontFamily: theme.fontSans }}>{result.fail} con error</Text>}
        </View>
        {result.errors.map((e, i) => (
          <Text key={i} style={{ color: theme.destructive, fontSize: 12, fontFamily: theme.fontSans, paddingHorizontal: 4 }}>{e}</Text>
        ))}
        <Button label="Ir a mi cartera" onPress={onDone} full />
      </ScrollView>
    )
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius['2xl'] }]}>
        <View style={styles.summaryHead}>
          <FileSpreadsheet size={22} color={theme.primary} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.foreground, fontSize: 16, fontFamily: 'Montserrat_700Bold' }}>{rows.length} alumnos serán creados</Text>
            <Text style={{ color: theme.mutedForeground, fontSize: 12.5, fontFamily: theme.fontSans }}>
              {activeCount} actuales + {rows.length} nuevos = {activeCount + rows.length} / {maxClients} del plan
            </Text>
          </View>
        </View>
        <Text style={{ color: theme.mutedForeground, fontSize: 12.5, fontFamily: theme.fontSans }}>
          Cada alumno recibe un correo de bienvenida con una contraseña temporal.
        </Text>
      </View>

      {wouldExceed && (
        <Text style={[styles.warnBox, { color: theme.destructive, borderColor: theme.destructive + '4D', backgroundColor: theme.destructive + '14', fontFamily: theme.fontSans }]}>
          Tu plan permite {maxClients} alumnos y tenés {activeCount}. No podés importar {rows.length} más. Actualizá tu plan o reducí las filas.
        </Text>
      )}

      <TouchableOpacity
        activeOpacity={0.82}
        onPress={() => setConsent((v) => !v)}
        style={[styles.consent, { borderColor: consent ? theme.primary : theme.border, backgroundColor: consent ? theme.primary + '0D' : theme.secondary, borderRadius: theme.radius.lg }]}
      >
        <View style={[styles.checkbox, { borderColor: consent ? theme.primary : theme.border, backgroundColor: consent ? theme.primary : 'transparent' }]}>
          {consent ? <Check size={14} color={theme.primaryForeground} /> : null}
        </View>
        <Text style={{ color: theme.mutedForeground, fontSize: 12.5, flex: 1, lineHeight: 18, fontFamily: theme.fontSans }}>
          Confirmo que tengo el consentimiento expreso de las personas listadas para procesar sus datos conforme a la Ley 19.628 (modificada por la Ley 21.719) sobre protección de datos en Chile.
        </Text>
      </TouchableOpacity>

      <View style={styles.navRow}>
        <Button label="Volver" variant="secondary" onPress={onBack} disabled={busy} style={{ flex: 1 }} />
        <Button label={busy ? 'Importando…' : `Importar ${rows.length}`} onPress={run} disabled={!canImport} loading={busy} style={{ flex: 1 }} />
      </View>
    </ScrollView>
  )
}

function Tag({ theme, label, color }: { theme: any; label: string; color: string }) {
  return (
    <View style={[styles.tag, { backgroundColor: color + '22', borderColor: color + '44' }]}>
      <Text style={{ color, fontSize: 9.5, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backRow: { paddingHorizontal: 16, paddingTop: 8 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6, alignSelf: 'flex-start' },
  scroll: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 48, gap: 14 },
  // stepper
  stepper: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 },
  stepItem: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  stepBtn: { alignItems: 'center', gap: 4 },
  stepCircle: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  stepNum: { fontSize: 12, fontFamily: 'Montserrat_700Bold' },
  stepLabel: { fontSize: 10.5 },
  stepLine: { flex: 1, height: 1.5, marginHorizontal: 4, marginBottom: 16 },
  // cards / generic
  card: { padding: 16, borderWidth: 1, gap: 12 },
  cardHint: { fontSize: 12.5, lineHeight: 18 },
  bodyHint: { fontSize: 13, lineHeight: 18, paddingHorizontal: 2 },
  orLabel: { fontSize: 11, textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.6 },
  textarea: { minHeight: 110, borderWidth: 1, padding: 12, fontSize: 13, textAlignVertical: 'top' },
  errText: { fontSize: 12.5, lineHeight: 17 },
  navRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  warnBox: { fontSize: 12.5, lineHeight: 18, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  // map step
  mapHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mapHeader: { fontSize: 14, flexShrink: 1 },
  mapExamples: { fontSize: 11.5 },
  optionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  optChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 7 },
  tag: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  // preview step
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  dot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  // confirm step
  summaryHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  consent: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, padding: 12 },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  offWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  offCard: { borderWidth: 1, padding: 24, alignItems: 'center', gap: 12 },
  offTitle: { fontSize: 18 },
  offText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
})
