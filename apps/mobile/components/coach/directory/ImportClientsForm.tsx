import { useMemo, useState } from 'react'
import { ActivityIndicator, Linking, ScrollView, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native'
import { useRouter } from 'expo-router'
import { Check, Download, Upload } from 'lucide-react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { decode } from 'base64-arraybuffer'
import { Button } from '../../../components'
import { FONT } from '../../../lib/typography'
import { ApiError, apiFetch, getApiBaseUrl } from '../../../lib/api'
import {
  IMPORT_FIELD_LABELS,
  MAX_IMPORT_ROWS,
  REQUIRED_FIELDS,
  annotateRows,
  buildMappedRows,
  importableRows,
  matchHeaders,
  parseCsvToSheet,
  type AnnotatedRow,
  type ColumnMapping,
  type ImportField,
  type MappedRow,
  type ParsedSheet,
} from '../../../lib/import-wizard'
import { SUCCESS, WARNING } from './directory-shared'

/**
 * ImportClientsForm — wizard de importación de alumnos en 4 pasos, espejo del web
 * `/coach/clients/import` (Step1Upload → Step2MapColumns → Step3Preview → Step4Confirm):
 *  1. Subir XLSX/XLS/CSV o pegar CSV (SheetJS + DocumentPicker nativo).
 *  2. Mapear columnas del archivo a campos EVA (auto-detección + override manual).
 *  3. Revisar filas validadas (válidas / advertencias / errores; duplicados se omiten).
 *  4. Confirmar con tier-gate de cupos (`activeCount + filas > maxClients`) + consentimiento
 *     legal (Ley 19.628). Un solo POST batch crea la auditoría y procesa chunks de 10 en servidor
 *     (workspace/scoping/cap se vuelven a autorizar allí; el gate de UI es solo espejo).
 * Contenido de `NativeDialog` (scroll interno acotado).
 */
const STEP_LABELS = ['Subir archivo', 'Mapear columnas', 'Revisar datos', 'Confirmar']

const FIELD_CHIPS: { value: ImportField | 'ignore'; label: string }[] = [
  { value: 'ignore', label: '-- No importar --' },
  { value: 'full_name', label: 'Nombre completo' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Teléfono' },
  { value: 'subscription_start_date', label: 'Fecha de inicio' },
]

const MAX_BYTES = 5 * 1024 * 1024
const ACCEPTED_EXTS = ['.xlsx', '.xls', '.csv']
const ACCEPTED_MIME = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/csv',
]

type ImportRowError = {
  row: number
  fullName: string
  email: string
  error: string
}

type ImportResult = { ok: number; fail: number; skipped: number; errors: ImportRowError[] }

type ImportWorkspace = {
  kind: 'standalone' | 'team_owner' | 'team_member' | 'enterprise'
  teamId: string | null
  orgId: string | null
}

type BatchImportResponse = {
  ok: true
  summary: { total: number; succeeded: number; failed: number; skipped: number }
  rowErrors: Array<{ row: number; full_name: string; email: string; error: string }>
}

export function ImportClientsForm({
  theme,
  maxClients,
  activeCount,
  onDone,
  onCancel,
  workspace,
  access,
  onBlockingChange,
}: {
  theme: any
  maxClients: number
  activeCount: number
  onDone: () => void
  onCancel: () => void
  workspace: ImportWorkspace
  access: 'allowed' | 'upgrade' | 'loading' | 'load_error' | 'role_blocked'
  onBlockingChange?: (blocking: boolean) => void
}) {
  const router = useRouter()
  const { height: windowHeight } = useWindowDimensions()
  const [step, setStep] = useState(1)
  const [sheet, setSheet] = useState<ParsedSheet | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [mappedRows, setMappedRows] = useState<MappedRow[]>([])
  const [pasteText, setPasteText] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const scrollStyle = { maxHeight: Math.min(500, windowHeight * 0.52) } as const

  const accessGate = access === 'loading' ? (
    <View style={{ minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 10 }}>
      <ActivityIndicator size="small" color={theme.primary} />
      <Text style={{ color: theme.mutedForeground, fontSize: 13, fontFamily: FONT.ui }}>Cargando…</Text>
    </View>
  ) : access === 'load_error' ? (
    <View style={{ gap: 16 }}>
      <View className="border-danger-600/25 bg-danger-100 dark:bg-danger-100/[0.12]" style={{ borderWidth: 1, borderRadius: theme.radius.lg, padding: 16, gap: 6 }}>
        <Text className="text-strong" style={{ fontSize: 17, fontFamily: FONT.displayBold }}>No pudimos validar tu plan</Text>
        <Text className="text-muted" style={{ fontSize: 13, lineHeight: 18, fontFamily: FONT.ui }}>Cierra esta ventana y vuelve a intentarlo.</Text>
      </View>
      <Button label="Cerrar" variant="secondary" onPress={onCancel} full />
    </View>
  ) : access === 'role_blocked' ? (
    <View style={{ gap: 16 }}>
      <View className="border-subtle bg-surface-card" style={{ borderWidth: 1, borderRadius: theme.radius.lg, padding: 16, gap: 6 }}>
        <Text className="text-strong" style={{ fontSize: 17, fontFamily: FONT.displayBold }}>Importación no disponible</Text>
        <Text className="text-muted" style={{ fontSize: 13, lineHeight: 18, fontFamily: FONT.ui }}>Tu rol no permite importar alumnos.</Text>
      </View>
      <Button label="Cerrar" variant="secondary" onPress={onCancel} full />
    </View>
  ) : access === 'upgrade' ? (() => {
    const features = [
      'Importa hasta 1.000 alumnos desde .xlsx / .csv',
      'Detección automática de columnas (nombre, email, tel)',
      'Preview con errores marcados antes de confirmar',
      'Cumplimiento Ley 19.628 — checkbox de consentimiento',
    ]
    return (
      <ScrollView style={{ maxHeight: Math.min(560, windowHeight * 0.62) }} showsVerticalScrollIndicator={false}>
        <View style={{ gap: 16 }}>
          <View className="border-success-500/20 bg-success-100 dark:bg-success-100/[0.12]" style={{ borderWidth: 1, borderRadius: theme.radius.lg, padding: 18, gap: 10 }}>
            <View className="bg-success-500/15" style={{ width: 48, height: 48, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' }}>
              <Upload size={24} className="text-success-600" />
            </View>
            <Text className="text-strong" style={{ fontSize: 22, fontFamily: FONT.displayBold }}>Importar Alumnos desde Excel</Text>
            <Text className="text-muted" style={{ fontSize: 13.5, lineHeight: 19, fontFamily: FONT.ui }}>
              Migra toda tu cartera de alumnos desde Excel en minutos, sin cargar uno por uno. Disponible en{' '}
              <Text className="text-strong" style={{ fontFamily: FONT.uiSemibold }}>Starter</Text>.
            </Text>
          </View>
          <View className="border-subtle bg-surface-card" style={{ borderWidth: 1, borderRadius: theme.radius.lg, padding: 16, gap: 14 }}>
            <View>
              <Text className="text-muted" style={{ fontSize: 11, fontFamily: FONT.uiSemibold, textTransform: 'uppercase', letterSpacing: 0.6 }}>Disponible en Starter</Text>
              <Text className="text-strong" style={{ fontSize: 22, fontFamily: FONT.displayBold, marginTop: 4 }}>$19.990<Text className="text-muted" style={{ fontSize: 13, fontFamily: FONT.ui }}> /mes</Text></Text>
            </View>
            <View style={{ gap: 10 }}>
              {features.map((feature) => (
                <View key={feature} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}>
                  <Check size={16} className="text-success-600" style={{ marginTop: 1 }} />
                  <Text className="text-muted" style={{ flex: 1, fontSize: 13, lineHeight: 18, fontFamily: FONT.ui }}>{feature}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity
              testID="import-clients-upsell"
              accessibilityRole="button"
              activeOpacity={0.82}
              className="bg-success-500"
              style={{ minHeight: 44, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }}
              onPress={() => { onCancel(); router.push({ pathname: '/coach/subscription', params: { upgrade: 'starter' } }) }}
            >
              <Text className="text-on-sport" style={{ fontSize: 14, fontFamily: FONT.uiSemibold }}>Importar alumnos con Starter →</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    )
  })() : null

  // ─── Paso 1: cargar hoja ───────────────────────────────────────────────────
  function loadSheet(text: string, filename: string) {
    const parsed = parseCsvToSheet(text, filename)
    if (!parsed.headers.length || !parsed.rows.length) {
      setUploadError('El archivo está vacío o solo tiene encabezados.')
      return
    }
    // Espejo Step1Upload web (Step1Upload.tsx:61-64): rechazar > MAX_IMPORT_ROWS filas de
    // datos en vez de truncar en silencio (parseCsvToSheet.slice(1, 1+MAX_IMPORT_ROWS) corta
    // sin avisar). Se cuenta sobre el texto crudo con la misma lógica de split del parser.
    const dataRowCount = text.replace(/﻿/g, '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).length - 1
    if (dataRowCount > MAX_IMPORT_ROWS) {
      setUploadError(`El archivo tiene más de ${MAX_IMPORT_ROWS} filas. Dividilo en partes de hasta ${MAX_IMPORT_ROWS} alumnos.`)
      return
    }
    setUploadError(null)
    setSheet(parsed)
    // auto-mapeo por matcheo de headers
    const auto = matchHeaders(parsed.headers)
    const m: ColumnMapping = {}
    auto.forEach((match, idx) => { m[idx] = match.field })
    setMapping(m)
    setStep(2)
  }

  async function pickFile() {
    try {
      setUploadError(null)
      const res = await DocumentPicker.getDocumentAsync({
        type: ACCEPTED_MIME,
        copyToCacheDirectory: true,
      })
      if (res.canceled || !res.assets?.[0]) return
      const asset = res.assets[0]
      const ext = `.${(asset.name ?? '').split('.').pop()?.toLowerCase()}`
      if (!ACCEPTED_EXTS.includes(ext) && !ACCEPTED_MIME.includes(asset.mimeType ?? '')) {
        setUploadError('Formato no soportado. Usa .xlsx, .xls o .csv.')
        return
      }
      const fileInfo = asset.size == null ? await FileSystem.getInfoAsync(asset.uri) : null
      const fileSize = asset.size ?? (fileInfo?.exists && 'size' in fileInfo ? fileInfo.size : 0)
      if (fileSize > MAX_BYTES) {
        setUploadError('El archivo supera el límite de 5 MB.')
        return
      }
      setParsing(true)
      onBlockingChange?.(true)
      const base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 })
      const XLSX = await import('xlsx')
      const workbook = XLSX.read(decode(base64), { type: 'array', cellDates: true, raw: false })
      const worksheet = workbook.Sheets[workbook.SheetNames[0]]
      const aoa = XLSX.utils.sheet_to_json<(string | number | null)[]>(worksheet, {
        header: 1,
        blankrows: false,
        defval: null,
      })
      if (aoa.length < 2) {
        setUploadError('El archivo está vacío o solo tiene encabezados.')
        return
      }
      const [headerRow, ...dataRows] = aoa
      if (dataRows.length > MAX_IMPORT_ROWS) {
        setUploadError(`El archivo tiene más de ${MAX_IMPORT_ROWS} filas. Dividilo en partes de hasta ${MAX_IMPORT_ROWS} alumnos.`)
        return
      }
      const headers = headerRow.map((cell) => String(cell ?? ''))
      const rows = dataRows.map((row) => headers.map((_, index) => String(row[index] ?? '')))
      const parsed: ParsedSheet = { headers, rows, filename: asset.name ?? 'import.xlsx' }
      setSheet(parsed)
      const auto = matchHeaders(headers)
      const nextMapping: ColumnMapping = {}
      auto.forEach((match, index) => { nextMapping[index] = match.field })
      setMapping(nextMapping)
      setStep(2)
    } catch {
      setUploadError('No se pudo leer el archivo. Verifica que sea un Excel o CSV válido.')
    } finally {
      setParsing(false)
      onBlockingChange?.(false)
    }
  }

  // ─── Paso 2: continuar con mapeo ─────────────────────────────────────────────
  const autoMatches = useMemo(() => (sheet ? matchHeaders(sheet.headers) : []), [sheet])
  const mappedFields = Object.values(mapping).filter(Boolean) as ImportField[]
  const missingRequired = REQUIRED_FIELDS.filter((f) => !mappedFields.includes(f))

  function continueFromMap() {
    if (!sheet || missingRequired.length) return
    setMappedRows(buildMappedRows(sheet, mapping))
    setStep(3)
  }

  // ─── Paso 3: preview ─────────────────────────────────────────────────────────
  const annotated: AnnotatedRow[] = useMemo(() => annotateRows(mappedRows), [mappedRows])
  const validCount = annotated.filter((r) => r._status === 'valid').length
  const warnCount = annotated.filter((r) => r._status === 'warning').length
  const errorCount = annotated.filter((r) => r._status === 'error').length
  const toImport = useMemo(() => importableRows(annotated), [annotated])

  // ─── Paso 4: tier-gate + confirmación ────────────────────────────────────────
  const wouldExceedLimit = workspace.kind === 'standalone' && maxClients > 0 && activeCount + toImport.length > maxClients

  if (accessGate) return accessGate

  async function runImport() {
    if (!consent || wouldExceedLimit || !toImport.length) return
    setBusy(true)
    onBlockingChange?.(true)
    setUploadError(null)
    try {
      const response = await apiFetch<BatchImportResponse>('/api/mobile/coach/clients/import', {
        method: 'POST',
        authenticated: true,
        body: {
          rows: toImport.map((row) => ({
            source_row: row._rowIndex + 1,
            full_name: row.full_name,
            email: row.email,
            phone: row.phone || null,
            subscription_start_date: row.subscription_start_date || null,
          })),
          filename: sheet?.filename ?? 'import.xlsx',
          consentConfirmed: true,
          workspace,
        },
      })
      setResult({
        ok: response.summary.succeeded,
        fail: response.summary.failed,
        skipped: response.summary.skipped,
        errors: response.rowErrors.map((error) => ({
          row: error.row,
          fullName: error.full_name,
          email: error.email,
          error: error.error,
        })),
      })
    } catch (error) {
      const message = error instanceof ApiError && error.code === 'UPGRADE_REQUIRED'
        ? 'Tu plan actual no incluye la importación de alumnos. Actualiza tu plan para continuar.'
        : error instanceof Error ? error.message : 'No se pudo importar la cartera.'
      setUploadError(message)
    } finally {
      setBusy(false)
      onBlockingChange?.(false)
    }
  }

  // ─── Result screen ────────────────────────────────────────────────────────────
  if (result) {
    return (
      <View style={{ gap: 16 }}>
        <View style={{ alignItems: 'center', gap: 4, borderWidth: 1, borderColor: `${SUCCESS}4D`, borderRadius: theme.radius.lg, backgroundColor: `${SUCCESS}1A`, padding: 20 }}>
          <Text style={{ color: SUCCESS, fontFamily: FONT.displayBold, fontSize: 22, textAlign: 'center' }}>
            ✅ {result.ok} alumnos importados
          </Text>
          {result.fail > 0 ? (
            <Text style={{ color: theme.mutedForeground, fontFamily: FONT.ui, fontSize: 13 }}>
              {result.fail} fallaron · {result.skipped} omitidos
            </Text>
          ) : null}
        </View>
        {result.errors.length > 0 ? (
          <View style={{ borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius.md, overflow: 'hidden' }}>
            <View style={{ borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.secondary, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ color: theme.foreground, fontSize: 13, fontFamily: FONT.uiSemibold }}>
                Filas con error ({result.errors.length})
              </Text>
            </View>
            <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
              {result.errors.map((error, index) => (
                <View
                  key={`${error.row}-${error.email}`}
                  style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: index < result.errors.length - 1 ? 1 : 0, borderBottomColor: theme.border }}
                >
                  <Text style={{ color: theme.destructive, fontSize: 11, fontFamily: FONT.mono }}>#{error.row}</Text>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: theme.mutedForeground, fontSize: 12, fontFamily: FONT.ui }}>
                      {error.fullName} ({error.email})
                    </Text>
                    <Text style={{ color: theme.destructive, fontSize: 11, fontFamily: FONT.ui }}>{error.error}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}
        <Button testID="import-clients-done" label="Ir a mi cartera →" variant="sport" onPress={onDone} full />
      </View>
    )
  }

  return (
    <View style={{ gap: 14 }}>
      {/* Stepper */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
        {STEP_LABELS.map((label, idx) => {
          const num = idx + 1
          const done = step > num
          const current = step === num
          return (
            <View key={label} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={`${label}, paso ${num} de ${STEP_LABELS.length}`}
                accessibilityState={{ disabled: !done, selected: current }}
                activeOpacity={done ? 0.75 : 1}
                disabled={!done}
                onPress={() => setStep(num)}
              >
                <View style={{
                  width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: done || current ? theme.primary : theme.secondary,
                }}>
                  {done ? <Check size={14} color={theme.primaryForeground} /> : (
                    <Text style={{ color: current ? theme.primaryForeground : theme.mutedForeground, fontSize: 12, fontFamily: FONT.uiBold }}>{num}</Text>
                  )}
                </View>
              </TouchableOpacity>
              {idx < STEP_LABELS.length - 1 ? (
                <View style={{ width: 32, height: 1, marginHorizontal: 12, backgroundColor: step > num ? theme.primary : theme.border }} />
              ) : null}
            </View>
          )
        })}
      </View>

      {/* ─── Paso 1: Subir ─── */}
      {step === 1 ? (
        <ScrollView style={scrollStyle} showsVerticalScrollIndicator={false}>
          <View style={{ gap: 16 }}>
            <TouchableOpacity
              testID="import-clients-pick-file"
              accessibilityRole="button"
              accessibilityLabel="Seleccionar archivo Excel o CSV"
              activeOpacity={0.78}
              disabled={parsing}
              onPress={pickFile}
              style={{ alignItems: 'center', justifyContent: 'center', gap: 12, borderWidth: 2, borderStyle: 'dashed', borderColor: theme.border, borderRadius: theme.radius.lg, paddingHorizontal: 20, paddingVertical: 28 }}
            >
              <View style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center', borderRadius: theme.radius.md, backgroundColor: `${theme.primary}1A` }}>
                <Upload size={28} color={theme.primary} strokeWidth={1.5} />
              </View>
              <View style={{ alignItems: 'center', gap: 4 }}>
                <Text style={{ color: theme.foreground, fontFamily: FONT.uiSemibold, fontSize: 14, textAlign: 'center' }}>
                  {parsing ? 'Procesando archivo...' : 'Arrastra tu archivo o haz click para seleccionar'}
                </Text>
                <Text style={{ color: theme.mutedForeground, fontFamily: FONT.ui, fontSize: 12, textAlign: 'center' }}>
                  .xlsx, .xls o .csv · Máximo 5 MB · Hasta 1.000 alumnos
                </Text>
              </View>
            </TouchableOpacity>

            <Text style={{ color: theme.mutedForeground, fontFamily: FONT.ui, fontSize: 12, textAlign: 'center' }}>
              o pega el contenido CSV
            </Text>
            <TextInput
              testID="import-clients-paste"
              value={pasteText}
              onChangeText={setPasteText}
              multiline
              placeholder={'nombre,email,telefono,inicio\nJuan Pérez,juan@mail.com,+569...,01/03/2026'}
              placeholderTextColor={theme.mutedForeground}
              style={{ minHeight: 100, borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius.md, backgroundColor: theme.secondary, color: theme.foreground, padding: 12, textAlignVertical: 'top', fontFamily: FONT.ui, fontSize: 13 }}
            />
            {uploadError ? (
              <View style={{ borderWidth: 1, borderColor: `${theme.destructive}4D`, borderRadius: theme.radius.md, backgroundColor: `${theme.destructive}1A`, paddingHorizontal: 12, paddingVertical: 10 }}>
                <Text style={{ color: theme.destructive, fontSize: 12.5, fontFamily: FONT.ui }}>{uploadError}</Text>
              </View>
            ) : null}

            <View style={{ borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius.md, backgroundColor: theme.card, padding: 14, gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ color: theme.foreground, fontSize: 13, fontFamily: FONT.uiSemibold }}>¿Qué columnas necesito?</Text>
                <TouchableOpacity
                  testID="import-clients-template"
                  accessibilityRole="link"
                  onPress={() => Linking.openURL(`${getApiBaseUrl()}/templates/import-alumnos.xlsx`).catch(() => {})}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: theme.radius.sm, backgroundColor: `${theme.primary}1A`, paddingHorizontal: 9, paddingVertical: 6 }}
                >
                  <Download size={14} color={theme.primary} />
                  <Text style={{ color: theme.primary, fontSize: 11, fontFamily: FONT.uiSemibold }}>Descargar template</Text>
                </TouchableOpacity>
              </View>
              <View style={{ gap: 4 }}>
                <HelpRow theme={theme} label="Nombre completo" detail="requerido" />
                <HelpRow theme={theme} label="Email" detail="requerido" />
                <HelpRow theme={theme} label="Teléfono" detail="opcional" />
                <HelpRow theme={theme} label="Fecha de inicio" detail="opcional (DD/MM/AAAA)" />
              </View>
              <Text style={{ color: theme.mutedForeground, fontSize: 11.5, fontFamily: FONT.ui, lineHeight: 16 }}>
                Los nombres de columna pueden estar en español o inglés. Los detectamos automáticamente.
              </Text>
            </View>
          </View>
        </ScrollView>
      ) : null}

      {/* ─── Paso 2: Mapear columnas ─── */}
      {step === 2 && sheet ? (
        <ScrollView style={scrollStyle} showsVerticalScrollIndicator={false}>
          <View style={{ gap: 10 }}>
            <Text style={{ color: theme.mutedForeground, fontFamily: FONT.ui, fontSize: 12.5 }}>
              Detectamos las siguientes columnas. Verifica que el mapeo sea correcto.
            </Text>
            {sheet.headers.map((header, colIdx) => {
              const match = autoMatches[colIdx]
              const current = mapping[colIdx] ?? 'ignore'
              const examples = sheet.rows.slice(0, 2).map((r) => r[colIdx]).filter(Boolean).join(', ')
              return (
                <View key={colIdx} style={{ borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius.lg, padding: 10, gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <Text numberOfLines={1} style={{ flex: 1, color: theme.foreground, fontSize: 13, fontFamily: FONT.uiBold }}>{header || `Columna ${colIdx + 1}`}</Text>
                    {current !== 'ignore' && match?.confidence === 'exact' ? (
                      <View style={{ backgroundColor: SUCCESS + '22', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ color: SUCCESS, fontSize: 10, fontFamily: FONT.uiBold }}>Auto</Text>
                      </View>
                    ) : current !== 'ignore' && match?.confidence === 'fuzzy' ? (
                      <View style={{ backgroundColor: WARNING + '22', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ color: WARNING, fontSize: 10, fontFamily: FONT.uiBold }}>Sugerido</Text>
                      </View>
                    ) : null}
                  </View>
                  {examples ? (
                    <Text numberOfLines={1} style={{ color: theme.mutedForeground, fontSize: 11.5, fontFamily: FONT.ui }}>Ej: {examples}</Text>
                  ) : null}
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {FIELD_CHIPS.map(({ value, label }) => {
                      const selected = current === value
                      return (
                        <TouchableOpacity
                          key={value}
                          testID={`import-map-${colIdx}-${value}`}
                          activeOpacity={0.8}
                          onPress={() => setMapping((prev) => ({ ...prev, [colIdx]: value === 'ignore' ? null : (value as ImportField) }))}
                          style={{
                            paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1,
                            borderColor: selected ? theme.primary : theme.border,
                            backgroundColor: selected ? theme.primary : 'transparent',
                          }}
                        >
                          <Text style={{ color: selected ? theme.primaryForeground : theme.mutedForeground, fontSize: 11.5, fontFamily: FONT.uiSemibold }}>{label}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </View>
              )
            })}
            {missingRequired.length ? (
              <View style={{ borderWidth: 1, borderColor: `${theme.destructive}4D`, borderRadius: theme.radius.md, backgroundColor: `${theme.destructive}1A`, paddingHorizontal: 12, paddingVertical: 10 }}>
                <Text style={{ color: theme.destructive, fontSize: 12.5, fontFamily: FONT.ui }}>
                  Debes mapear: {missingRequired.map((f) => IMPORT_FIELD_LABELS[f]).join(', ')}
                </Text>
              </View>
            ) : null}
          </View>
        </ScrollView>
      ) : null}

      {/* ─── Paso 3: Revisar ─── */}
      {step === 3 ? (
        <ScrollView style={scrollStyle} showsVerticalScrollIndicator={false}>
          <View style={{ gap: 14 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <SummaryPill color={SUCCESS} label={`✅ ${validCount} válidas`} />
              {warnCount ? <SummaryPill color={WARNING} label={`⚠️ ${warnCount} con advertencia`} /> : null}
              {errorCount ? <SummaryPill color={theme.destructive} label={`❌ ${errorCount} con error`} /> : null}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator>
              <View style={{ width: 680, borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius.md, overflow: 'hidden' }}>
                <View style={{ flexDirection: 'row', backgroundColor: theme.secondary, paddingHorizontal: 10, paddingVertical: 8 }}>
                  <TableCell width={38} text="#" color={theme.mutedForeground} semibold />
                  <TableCell width={145} text="Nombre" color={theme.mutedForeground} semibold />
                  <TableCell width={190} text="Email" color={theme.mutedForeground} semibold />
                  <TableCell width={125} text="Teléfono" color={theme.mutedForeground} semibold />
                  <TableCell width={160} text="Estado" color={theme.mutedForeground} semibold />
                </View>
                {annotated.slice(0, 50).map((row, index) => {
                  const statusColor = row._status === 'error' ? theme.destructive : row._status === 'warning' ? WARNING : SUCCESS
                  const status = row._status === 'error'
                    ? `Error: ${row._errors[0]}`
                    : row._status === 'warning'
                      ? `⚠ ${row._warnings[0]}`
                      : '✓ OK'
                  return (
                    <View
                      key={row._rowIndex}
                      style={{ flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: row._status === 'error' ? `${theme.destructive}0D` : row._status === 'warning' ? `${WARNING}0D` : theme.card }}
                    >
                      <TableCell width={38} text={String(row._rowIndex + 1)} color={theme.mutedForeground} />
                      <TableCell width={145} text={row.full_name || '—'} color={row.full_name ? theme.foreground : theme.destructive} />
                      <TableCell width={190} text={row.email || '—'} color={row.email ? theme.foreground : theme.destructive} />
                      <TableCell width={125} text={row.phone || '—'} color={theme.mutedForeground} />
                      <TableCell width={160} text={status} color={statusColor} />
                    </View>
                  )
                })}
                {annotated.length > 50 ? (
                  <View style={{ borderTopWidth: 1, borderTopColor: theme.border, paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Text style={{ color: theme.mutedForeground, fontSize: 11.5, fontFamily: FONT.ui }}>Mostrando 50 de {annotated.length} filas.</Text>
                  </View>
                ) : null}
              </View>
            </ScrollView>
          </View>
        </ScrollView>
      ) : null}

      {/* ─── Paso 4: Confirmar ─── */}
      {step === 4 ? (
        <ScrollView style={scrollStyle} showsVerticalScrollIndicator={false}>
          <View style={{ gap: 12 }}>
            <View style={{ borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius.lg, padding: 14, gap: 6 }}>
              <Text style={{ color: theme.foreground, fontSize: 15, fontFamily: FONT.displayBold }}>📥 {toImport.length} alumnos serán creados</Text>
                <Text style={{ color: theme.mutedForeground, fontSize: 12.5, fontFamily: FONT.ui }}>
                {workspace.kind === 'standalone'
                  ? `${activeCount} actuales + ${toImport.length} nuevos = ${activeCount + toImport.length} / ${maxClients} del plan`
                  : `${activeCount} actuales + ${toImport.length} nuevos = ${activeCount + toImport.length}`}
              </Text>
              <Text style={{ color: theme.mutedForeground, fontSize: 12.5, fontFamily: FONT.ui }}>✉️ {toImport.length} emails de bienvenida se enviarán</Text>
              <Text style={{ color: theme.mutedForeground, fontSize: 12.5, fontFamily: FONT.ui }}>⏱️ Tiempo estimado: ~{Math.ceil(toImport.length / 10) * 2} segundos</Text>
            </View>

            {wouldExceedLimit ? (
              <View style={{ borderWidth: 1, borderColor: theme.destructive + '55', backgroundColor: theme.destructive + '0D', borderRadius: theme.radius.lg, padding: 12, gap: 6 }}>
                <Text style={{ color: theme.destructive, fontSize: 12.5, fontFamily: FONT.uiSemibold }}>
                  Tu plan permite {maxClients} alumnos y tienes {activeCount}. No puedes importar {toImport.length} alumnos más.
                </Text>
                <TouchableOpacity testID="import-clients-upgrade" onPress={() => { onCancel(); router.push({ pathname: '/coach/subscription', params: { upgrade: 'true' } }) }}>
                  <Text style={{ color: theme.destructive, fontSize: 12.5, fontFamily: FONT.uiBold, textDecorationLine: 'underline' }}>Actualiza tu plan →</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            <TouchableOpacity
              testID="import-clients-consent"
              activeOpacity={0.82}
              onPress={() => setConsent((v) => !v)}
              style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderColor: consent ? theme.primary : theme.border, borderRadius: theme.radius.lg, padding: 12, backgroundColor: theme.secondary }}
            >
              <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1, marginTop: 1, borderColor: consent ? theme.primary : theme.border, backgroundColor: consent ? theme.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {consent ? <Check size={14} color={theme.primaryForeground} /> : null}
              </View>
              <Text style={{ color: theme.mutedForeground, fontSize: 12, flex: 1, fontFamily: FONT.ui, lineHeight: 17 }}>
                Confirmo que tengo el consentimiento expreso de las personas listadas para procesar sus datos personales conforme a la{' '}
                <Text style={{ color: theme.foreground, fontFamily: FONT.uiBold }}>Ley 19.628</Text> sobre Protección de la Vida Privada (Chile), modificada por la{' '}
                <Text style={{ color: theme.foreground, fontFamily: FONT.uiBold }}>Ley 21.719</Text>.
              </Text>
            </TouchableOpacity>

            <TouchableOpacity testID="import-clients-privacy" onPress={() => Linking.openURL(`${getApiBaseUrl()}/privacy`).catch(() => {})} style={{ alignSelf: 'center' }}>
              <Text style={{ color: theme.mutedForeground, fontSize: 11.5, fontFamily: FONT.ui, textDecorationLine: 'underline' }}>Política de privacidad y DPA</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : null}

      {step !== 1 && uploadError ? (
        <View style={{ borderWidth: 1, borderColor: `${theme.destructive}4D`, borderRadius: theme.radius.md, backgroundColor: `${theme.destructive}1A`, paddingHorizontal: 12, paddingVertical: 10 }}>
          <Text style={{ color: theme.destructive, fontSize: 12.5, fontFamily: FONT.ui }}>{uploadError}</Text>
        </View>
      ) : null}

      {/* ─── Footer nav ─── */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button
          testID="import-clients-back"
          label={step === 1 ? 'Cancelar' : '← Volver'}
          variant="secondary"
          onPress={step === 1 ? onCancel : () => setStep((s) => s - 1)}
          disabled={busy || parsing}
          style={{ flex: 1 }}
        />
        {step === 1 ? (
          <Button testID="import-clients-parse" label={parsing ? 'Procesando archivo...' : 'Continuar →'} variant="sport" onPress={() => pasteText.trim() ? loadSheet(pasteText, 'pegado.csv') : pickFile()} disabled={parsing || (!pasteText.trim() && !sheet)} style={{ flex: 1 }} />
        ) : step === 2 ? (
          <Button testID="import-clients-map-continue" label="Continuar →" variant="sport" onPress={continueFromMap} disabled={missingRequired.length > 0} style={{ flex: 1 }} />
        ) : step === 3 ? (
          <Button testID="import-clients-preview-continue" label={`Continuar con ${validCount} alumnos →`} variant="sport" onPress={() => setStep(4)} disabled={validCount === 0} style={{ flex: 1 }} />
        ) : (
          <Button testID="import-clients-run" label={busy ? 'Importando...' : `Importar ${toImport.length} alumnos`} variant="sport" onPress={runImport} loading={busy} disabled={busy || !consent || wouldExceedLimit || toImport.length === 0} style={{ flex: 1 }} />
        )}
      </View>
    </View>
  )
}

function SummaryPill({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ backgroundColor: color + '22', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
      <Text style={{ color, fontSize: 12, fontFamily: FONT.uiSemibold }}>{label}</Text>
    </View>
  )
}

function HelpRow({ theme, label, detail }: { theme: any; label: string; detail: string }) {
  return (
    <Text style={{ color: theme.mutedForeground, fontSize: 12.5, fontFamily: FONT.ui }}>
      <Text style={{ color: theme.foreground, fontFamily: FONT.uiMedium }}>{label}</Text> — {detail}
    </Text>
  )
}

function TableCell({ width, text, color, semibold = false }: { width: number; text: string; color: string; semibold?: boolean }) {
  return (
    <Text numberOfLines={1} style={{ width, color, fontSize: 11.5, fontFamily: semibold ? FONT.uiMedium : FONT.ui }}>
      {text}
    </Text>
  )
}
