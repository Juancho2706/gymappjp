import { useMemo, useState } from 'react'
import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { Check, Upload } from 'lucide-react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { Button } from '../../../components'
import { FONT } from '../../../lib/typography'
import { apiFetch } from '../../../lib/api'
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
 *  1. Subir/pegar CSV (mobile = CSV/texto; xlsx es web-only, DocumentPicker no lo parsea).
 *  2. Mapear columnas del archivo a campos EVA (auto-detección + override manual).
 *  3. Revisar filas validadas (válidas / advertencias / errores; duplicados se omiten).
 *  4. Confirmar con tier-gate de cupos (`activeCount + filas > maxClients`) + consentimiento
 *     legal (Ley 19.628). Escribe fila por fila vía `POST /api/mobile/coach/clients`
 *     (scoping + cap server-side; el gate de UI espeja el de web pero el servidor manda).
 * Contenido de `NativeDialog` (scroll interno acotado).
 */
const STEP_LABELS = ['Subir', 'Mapear', 'Revisar', 'Confirmar']

const FIELD_CHIPS: { value: ImportField | 'ignore'; label: string }[] = [
  { value: 'ignore', label: 'Ignorar' },
  { value: 'full_name', label: 'Nombre' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Teléfono' },
  { value: 'subscription_start_date', label: 'Fecha' },
]

type ImportResult = { ok: number; fail: number; skipped: number; errors: string[] }

export function ImportClientsForm({
  theme,
  maxClients,
  activeCount,
  onDone,
  onCancel,
}: {
  theme: any
  maxClients: number
  activeCount: number
  onDone: () => void
  onCancel: () => void
}) {
  const [step, setStep] = useState(1)
  const [sheet, setSheet] = useState<ParsedSheet | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [mappedRows, setMappedRows] = useState<MappedRow[]>([])
  const [pasteText, setPasteText] = useState('')
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [consent, setConsent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)

  const scrollStyle = { maxHeight: 380 } as const

  // ─── Paso 1: cargar hoja ───────────────────────────────────────────────────
  function loadSheet(text: string, filename: string) {
    const parsed = parseCsvToSheet(text, filename)
    if (!parsed.headers.length || !parsed.rows.length) {
      setUploadError('El archivo está vacío o solo tiene encabezados.')
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
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv', 'application/vnd.ms-excel', 'text/plain'],
        copyToCacheDirectory: true,
      })
      if (res.canceled || !res.assets?.[0]) return
      const asset = res.assets[0]
      const content = await FileSystem.readAsStringAsync(asset.uri)
      loadSheet(content, asset.name ?? 'archivo.csv')
    } catch {
      setUploadError('No se pudo leer el archivo. Debe ser un CSV de texto.')
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
  const wouldExceedLimit = maxClients > 0 && activeCount + toImport.length > maxClients

  async function runImport() {
    if (!consent || wouldExceedLimit || !toImport.length) return
    setBusy(true)
    let ok = 0, fail = 0, skipped = 0
    const errors: string[] = []
    for (const r of toImport) {
      try {
        await apiFetch('/api/mobile/coach/clients', {
          method: 'POST',
          authenticated: true,
          body: {
            fullName: r.full_name,
            email: (r.email ?? '').toLowerCase(),
            phone: r.phone ?? '',
            subscriptionStartDate: r.subscription_start_date ?? new Date().toISOString().slice(0, 10),
            tempPassword: `Eva${Math.floor(100000 + Math.random() * 900000)}!`,
            ageConfirmed: true,
          },
        })
        ok += 1
      } catch (e: any) {
        const msg = String(e?.message ?? '')
        if (e?.code === 'EMAIL_UNAVAILABLE' || /ya (esta|está) registrado/i.test(msg)) skipped += 1
        else fail += 1
        if (errors.length < 5) errors.push(`${r.full_name}: ${msg || 'error'}`)
      }
    }
    setBusy(false)
    setResult({ ok, fail, skipped, errors })
  }

  // ─── Result screen ────────────────────────────────────────────────────────────
  if (result) {
    return (
      <View style={{ gap: 12 }}>
        <Text style={{ color: theme.foreground, fontFamily: FONT.displayBold, fontSize: 17 }}>
          {result.ok} creados{result.skipped ? ` · ${result.skipped} omitidos` : ''}{result.fail ? ` · ${result.fail} con error` : ''}
        </Text>
        {result.errors.map((e, i) => (
          <Text key={i} style={{ color: theme.destructive, fontSize: 12, fontFamily: FONT.ui }}>{e}</Text>
        ))}
        <Button testID="import-clients-done" label="Ir a mi cartera" onPress={onDone} full />
      </View>
    )
  }

  return (
    <View style={{ gap: 14 }}>
      {/* Stepper */}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {STEP_LABELS.map((label, idx) => {
          const num = idx + 1
          const done = step > num
          const current = step === num
          return (
            <View key={label} style={{ flexDirection: 'row', alignItems: 'center', flex: idx < STEP_LABELS.length - 1 ? 1 : 0 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={{
                  width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
                  backgroundColor: done || current ? theme.primary : theme.secondary,
                }}>
                  {done ? <Check size={14} color="#fff" /> : (
                    <Text style={{ color: current ? '#fff' : theme.mutedForeground, fontSize: 11, fontFamily: FONT.uiBold }}>{num}</Text>
                  )}
                </View>
                <Text style={{ color: current ? theme.foreground : theme.mutedForeground, fontSize: 11.5, fontFamily: FONT.uiSemibold }}>{label}</Text>
              </View>
              {idx < STEP_LABELS.length - 1 ? (
                <View style={{ flex: 1, height: 1, marginHorizontal: 6, backgroundColor: step > num ? theme.primary : theme.border }} />
              ) : null}
            </View>
          )
        })}
      </View>

      {/* ─── Paso 1: Subir ─── */}
      {step === 1 ? (
        <ScrollView style={scrollStyle} showsVerticalScrollIndicator={false}>
          <View style={{ gap: 12 }}>
            <Text style={{ color: theme.mutedForeground, fontFamily: FONT.ui, fontSize: 12.5, lineHeight: 18 }}>
              Sube un CSV (columnas <Text style={{ fontFamily: FONT.uiBold }}>nombre, email, teléfono, fecha de inicio</Text>) o pega el texto. La primera fila son los encabezados y detectamos las columnas automáticamente. Cada alumno recibe una contraseña temporal. Máximo {MAX_IMPORT_ROWS} filas.
            </Text>
            <Button testID="import-clients-pick-file" label={sheet ? `Archivo: ${sheet.filename}` : 'Subir CSV'} variant="outline" leftIcon={Upload} onPress={pickFile} full />
            <TextInput
              testID="import-clients-paste"
              value={pasteText}
              onChangeText={setPasteText}
              multiline
              placeholder={'…o pega aquí:\nnombre,email,telefono,inicio\nJuan Pérez,juan@mail.com,+569...,01/03/2026'}
              placeholderTextColor={theme.mutedForeground}
              style={{ minHeight: 100, borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius.lg, backgroundColor: theme.secondary, color: theme.foreground, padding: 12, textAlignVertical: 'top', fontFamily: FONT.ui, fontSize: 13 }}
            />
            {uploadError ? (
              <Text style={{ color: theme.destructive, fontSize: 12.5, fontFamily: FONT.uiSemibold }}>{uploadError}</Text>
            ) : null}
          </View>
        </ScrollView>
      ) : null}

      {/* ─── Paso 2: Mapear columnas ─── */}
      {step === 2 && sheet ? (
        <ScrollView style={scrollStyle} showsVerticalScrollIndicator={false}>
          <View style={{ gap: 10 }}>
            <Text style={{ color: theme.mutedForeground, fontFamily: FONT.ui, fontSize: 12.5 }}>
              Verifica el mapeo de cada columna del archivo a su campo EVA.
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
                          <Text style={{ color: selected ? '#fff' : theme.mutedForeground, fontSize: 11.5, fontFamily: FONT.uiSemibold }}>{label}</Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </View>
              )
            })}
            {missingRequired.length ? (
              <Text style={{ color: theme.destructive, fontSize: 12.5, fontFamily: FONT.uiSemibold }}>
                Debes mapear: {missingRequired.map((f) => IMPORT_FIELD_LABELS[f]).join(', ')}
              </Text>
            ) : null}
          </View>
        </ScrollView>
      ) : null}

      {/* ─── Paso 3: Revisar ─── */}
      {step === 3 ? (
        <ScrollView style={scrollStyle} showsVerticalScrollIndicator={false}>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              <SummaryPill color={SUCCESS} label={`${validCount} válidas`} />
              {warnCount ? <SummaryPill color={WARNING} label={`${warnCount} advertencia`} /> : null}
              {errorCount ? <SummaryPill color={theme.destructive} label={`${errorCount} con error`} /> : null}
            </View>
            {annotated.slice(0, 50).map((r, i) => {
              const dot = r._status === 'error' ? theme.destructive : r._status === 'warning' ? WARNING : SUCCESS
              const note = r._status === 'error' ? r._errors[0] : r._status === 'warning' ? r._warnings[0] : null
              return (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius.md, paddingHorizontal: 10, paddingVertical: 7 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot }} />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: theme.foreground, fontSize: 12.5, fontFamily: FONT.ui }}>
                      {r.full_name || '(sin nombre)'} · {r.email || '(sin email)'}
                    </Text>
                    {note ? <Text numberOfLines={1} style={{ color: dot, fontSize: 11, fontFamily: FONT.uiSemibold }}>{note}</Text> : null}
                  </View>
                </View>
              )
            })}
            {annotated.length > 50 ? (
              <Text style={{ color: theme.mutedForeground, fontSize: 11.5, fontFamily: FONT.ui }}>Mostrando 50 de {annotated.length} filas.</Text>
            ) : null}
          </View>
        </ScrollView>
      ) : null}

      {/* ─── Paso 4: Confirmar ─── */}
      {step === 4 ? (
        <ScrollView style={scrollStyle} showsVerticalScrollIndicator={false}>
          <View style={{ gap: 12 }}>
            <View style={{ borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius.lg, padding: 14, gap: 6 }}>
              <Text style={{ color: theme.foreground, fontSize: 15, fontFamily: FONT.displayBold }}>{toImport.length} alumnos serán creados</Text>
              <Text style={{ color: theme.mutedForeground, fontSize: 12.5, fontFamily: FONT.ui }}>
                {activeCount} actuales + {toImport.length} nuevos = {activeCount + toImport.length}{maxClients > 0 ? ` / ${maxClients} del plan` : ''}
              </Text>
              <Text style={{ color: theme.mutedForeground, fontSize: 12.5, fontFamily: FONT.ui }}>Cada alumno recibe un email de bienvenida con su contraseña temporal.</Text>
            </View>

            {wouldExceedLimit ? (
              <View style={{ borderWidth: 1, borderColor: theme.destructive + '55', backgroundColor: theme.destructive + '0D', borderRadius: theme.radius.lg, padding: 12 }}>
                <Text style={{ color: theme.destructive, fontSize: 12.5, fontFamily: FONT.uiSemibold }}>
                  Tu plan permite {maxClients} alumnos y tienes {activeCount}. No puedes importar {toImport.length} más. Sube de plan o reduce las filas.
                </Text>
              </View>
            ) : null}

            <TouchableOpacity
              testID="import-clients-consent"
              activeOpacity={0.82}
              onPress={() => setConsent((v) => !v)}
              style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderWidth: 1, borderColor: consent ? theme.primary : theme.border, borderRadius: theme.radius.lg, padding: 12, backgroundColor: theme.secondary }}
            >
              <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1, marginTop: 1, borderColor: consent ? theme.primary : theme.border, backgroundColor: consent ? theme.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                {consent ? <Check size={14} color="#fff" /> : null}
              </View>
              <Text style={{ color: theme.mutedForeground, fontSize: 12, flex: 1, fontFamily: FONT.ui, lineHeight: 17 }}>
                Confirmo que tengo el consentimiento expreso de las personas listadas para procesar sus datos conforme a la Ley 19.628 (modificada por la Ley 21.719). Alumnos 14+ o con consentimiento de tutor.
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      ) : null}

      {/* ─── Footer nav ─── */}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button
          testID="import-clients-back"
          label={step === 1 ? 'Cancelar' : 'Volver'}
          variant="secondary"
          onPress={step === 1 ? onCancel : () => setStep((s) => s - 1)}
          disabled={busy}
          style={{ flex: 1 }}
        />
        {step === 1 ? (
          <Button testID="import-clients-parse" label="Continuar" onPress={() => pasteText.trim() ? loadSheet(pasteText, 'pegado.csv') : pickFile()} disabled={!pasteText.trim() && !sheet} style={{ flex: 1 }} />
        ) : step === 2 ? (
          <Button testID="import-clients-map-continue" label="Continuar" onPress={continueFromMap} disabled={missingRequired.length > 0} style={{ flex: 1 }} />
        ) : step === 3 ? (
          <Button testID="import-clients-preview-continue" label={`Continuar (${toImport.length})`} onPress={() => setStep(4)} disabled={toImport.length === 0} style={{ flex: 1 }} />
        ) : (
          <Button testID="import-clients-run" label={busy ? 'Importando…' : `Importar ${toImport.length}`} onPress={runImport} loading={busy} disabled={busy || !consent || wouldExceedLimit || toImport.length === 0} style={{ flex: 1 }} />
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
