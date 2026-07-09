import { useMemo, useState } from 'react'
import { Alert, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { Check, Upload } from 'lucide-react-native'
import * as DocumentPicker from 'expo-document-picker'
import * as FileSystem from 'expo-file-system/legacy'
import { Button } from '../../../components'
import { FONT } from '../../../lib/typography'
import { apiFetch } from '../../../lib/api'
import { parseClientsCsv, type ParsedClientRow } from '../../../lib/import-clients'
import { SUCCESS } from './directory-shared'

/**
 * ImportClientsForm — import por CSV (subir archivo o pegar texto) con preview
 * validado. Reusa el endpoint de crear alumno (P3). Contenido de `NativeDialog`.
 */
export function ImportClientsForm({ theme, onDone, onCancel }: { theme: any; onDone: () => void; onCancel: () => void }) {
  const [text, setText] = useState('')
  const [rows, setRows] = useState<ParsedClientRow[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  const [ageOk, setAgeOk] = useState(false)
  const [busy, setBusy] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const [result, setResult] = useState<{ ok: number; fail: number; errors: string[] } | null>(null)

  const validRows = useMemo(() => rows.filter((r) => r.valid), [rows])
  const invalidCount = rows.length - validRows.length

  async function pickFile() {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/comma-separated-values', 'application/csv', 'application/vnd.ms-excel', 'text/plain'],
        copyToCacheDirectory: true,
      })
      if (res.canceled || !res.assets?.[0]) return
      const asset = res.assets[0]
      const content = await FileSystem.readAsStringAsync(asset.uri)
      setFileName(asset.name ?? 'archivo.csv')
      setText('')
      setRows(parseClientsCsv(content))
    } catch {
      Alert.alert('No se pudo leer el archivo', 'Revisá que sea un CSV de texto (nombre,email,telefono).')
    }
  }

  function onPaste(value: string) {
    setText(value)
    setFileName(null)
    setRows(parseClientsCsv(value))
  }

  async function run() {
    if (!ageOk) { Alert.alert('Confirmá edad', 'Confirmá que los alumnos son 14+ o con consentimiento de tutor.'); return }
    if (!validRows.length) { Alert.alert('Sin filas válidas', 'Cada fila debe tener nombre y email válido.'); return }
    setBusy(true)
    let ok = 0, fail = 0; const errors: string[] = []
    for (const r of validRows) {
      try {
        await apiFetch('/api/mobile/coach/clients', {
          method: 'POST', authenticated: true,
          body: { fullName: r.name, email: r.email.toLowerCase(), phone: r.phone, subscriptionStartDate: new Date().toISOString().slice(0, 10), tempPassword: `Eva${Math.floor(100000 + Math.random() * 900000)}!`, ageConfirmed: true },
        })
        ok += 1
      } catch (e: any) {
        fail += 1
        if (errors.length < 5) errors.push(`${r.name}: ${e?.message ?? 'error'}`)
      }
    }
    setBusy(false)
    setResult({ ok, fail, errors })
  }

  if (result) {
    return (
      <View style={{ gap: 12 }}>
        <Text style={{ color: theme.foreground, fontFamily: FONT.displayBold, fontSize: 16 }}>{result.ok} creados · {result.fail} con error</Text>
        {result.errors.map((e, i) => <Text key={i} style={{ color: theme.destructive, fontSize: 12 }}>{e}</Text>)}
        <Button testID="import-clients-done" label="Listo" onPress={onDone} full />
      </View>
    )
  }

  const previewRows = showAll ? rows : rows.slice(0, 6)

  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: theme.mutedForeground, fontFamily: FONT.ui, fontSize: 12.5 }}>
        Subí un CSV con columnas <Text style={{ fontFamily: FONT.uiBold }}>nombre,email,telefono</Text> (una fila por alumno) o pegá el texto. Cada alumno recibe una contraseña temporal.
      </Text>

      <Button testID="import-clients-pick-file" label={fileName ? `Archivo: ${fileName}` : 'Subir CSV'} variant="outline" leftIcon={Upload} onPress={pickFile} full />

      <TextInput
        testID="import-clients-paste"
        value={text}
        onChangeText={onPaste}
        multiline
        placeholder={'…o pegá aquí:\nnombre,email,telefono\nJuan Pérez,juan@mail.com,+569...'}
        placeholderTextColor={theme.mutedForeground}
        style={{ minHeight: 90, borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius.lg, backgroundColor: theme.secondary, color: theme.foreground, padding: 12, textAlignVertical: 'top', fontFamily: FONT.ui }}
      />

      {rows.length ? (
        <View style={{ gap: 6 }}>
          <Text style={{ color: theme.foreground, fontSize: 12.5, fontFamily: FONT.uiBold }}>
            {validRows.length} válido(s){invalidCount ? ` · ${invalidCount} con error` : ''}
          </Text>
          {previewRows.map((r, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: r.valid ? theme.border : theme.destructive + '55', borderRadius: theme.radius.md, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: r.valid ? 'transparent' : theme.destructive + '0D' }}>
              <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: r.valid ? SUCCESS : theme.destructive }} />
              <Text numberOfLines={1} style={{ flex: 1, color: theme.foreground, fontSize: 12.5, fontFamily: FONT.ui }}>
                {r.name || '(sin nombre)'} · {r.email || '(sin email)'}
              </Text>
              {!r.valid ? <Text style={{ color: theme.destructive, fontSize: 11, fontFamily: FONT.uiSemibold }}>{r.error}</Text> : null}
            </View>
          ))}
          {rows.length > 6 ? (
            <TouchableOpacity testID="import-clients-toggle-all" onPress={() => setShowAll((v) => !v)} activeOpacity={0.7}>
              <Text style={{ color: theme.primary, fontSize: 12.5, fontFamily: FONT.uiSemibold }}>{showAll ? 'Ver menos' : `Ver tabla completa (${rows.length})`}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <TouchableOpacity testID="import-clients-age-ok" activeOpacity={0.82} onPress={() => setAgeOk((v) => !v)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius.lg, padding: 12, backgroundColor: theme.secondary }}>
        <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: ageOk ? theme.primary : theme.border, backgroundColor: ageOk ? theme.primary : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {ageOk ? <Check size={14} color="#fff" /> : null}
        </View>
        <Text style={{ color: theme.mutedForeground, fontSize: 12.5, flex: 1, fontFamily: FONT.ui }}>Alumnos 14+ o con consentimiento de tutor legal.</Text>
      </TouchableOpacity>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button testID="import-clients-cancel" label="Cancelar" variant="secondary" onPress={onCancel} disabled={busy} style={{ flex: 1 }} />
        <Button testID="import-clients-run" label={busy ? 'Importando…' : `Importar ${validRows.length}`} onPress={run} disabled={busy || validRows.length === 0} style={{ flex: 1 }} />
      </View>
    </View>
  )
}
