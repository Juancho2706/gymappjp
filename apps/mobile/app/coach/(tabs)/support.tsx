import { useCallback, useMemo, useState } from 'react'
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import Constants from 'expo-constants'
import * as ImageManipulator from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import * as DocumentPicker from 'expo-document-picker'
import { CheckCircle2, FileText, Mail, Paperclip, Send, X } from 'lucide-react-native'
import { useTheme } from '../../../context/ThemeContext'
import { Button, ScreenHeader } from '../../../components'
import { Accordion } from '../../../components/Accordion'
import { AppBackground } from '../../../components/AppBackground'
import { SUPPORT_FAQ, type FaqEntry } from '../../../lib/support-faq'
import { apiFetch, ApiError } from '../../../lib/api'
import { supabase } from '../../../lib/supabase'

const SUPPORT_EMAIL = 'soporte@eva-app.cl'
const SUPPORT_BUCKET = 'support-attachments'
const MAX_ATTACHMENT_BYTES = 2 * 1024 * 1024

type SupportType = 'help' | 'bug' | 'idea'
type SupportPriority = 'low' | 'medium' | 'high'

const TYPE_OPTIONS: { value: SupportType; label: string }[] = [
  { value: 'help', label: 'Necesito ayuda' },
  { value: 'bug', label: 'Reportar bug' },
  { value: 'idea', label: 'Sugerir mejora' },
]

const PRIORITY_OPTIONS: { value: SupportPriority; label: string }[] = [
  { value: 'low', label: 'Baja' },
  { value: 'medium', label: 'Media' },
  { value: 'high', label: 'Alta' },
]

interface FieldErrors {
  subject?: string
  description?: string
}

// Espejo cliente de SupportMessageSchema (@eva/schemas): asunto min3/max200,
// descripcion min10/max5000, prioridad solo aplica a bug.
function validate(subject: string, description: string): FieldErrors {
  const errors: FieldErrors = {}
  const s = subject.trim()
  const d = description.trim()
  if (s.length < 3) errors.subject = 'El asunto es requerido (minimo 3 caracteres).'
  else if (s.length > 200) errors.subject = 'El asunto no puede superar los 200 caracteres.'
  if (d.length < 10) errors.description = 'Describe tu consulta con al menos 10 caracteres.'
  else if (d.length > 5000) errors.description = 'La descripcion no puede superar los 5000 caracteres.'
  return errors
}

// Sube el adjunto user-scoped al bucket privado support-attachments. La policy de
// INSERT exige que el primer segmento de la ruta sea 'support/' (NO scoping por uid),
// asi que replicamos el patron de la web (support/<ts>-<rand>.<ext>). Best-effort:
// devuelve null si falla y el mensaje se envia igual sin adjunto.
async function uploadSupportAttachment(uri: string, mime: string, ext: string): Promise<string | null> {
  try {
    const path = `support/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const response = await fetch(uri)
    const blob = await response.blob()
    const arrayBuffer = await blob.arrayBuffer()
    const { error } = await supabase.storage
      .from(SUPPORT_BUCKET)
      .upload(path, arrayBuffer, { contentType: mime, upsert: false })
    if (error) return null
    const { data } = supabase.storage.from(SUPPORT_BUCKET).getPublicUrl(path)
    return data?.publicUrl ?? null
  } catch {
    return null
  }
}

function buildMetadataUserAgent(): string {
  const version = Constants.expoConfig?.version ?? '—'
  return `EVA Coach v${version} · ${Platform.OS} ${String(Platform.Version)}`
}

export default function SupportScreen() {
  const { theme } = useTheme()
  const insets = useSafeAreaInsets()

  const [type, setType] = useState<SupportType>('help')
  const [subject, setSubject] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<SupportPriority | undefined>(undefined)
  const [attachmentUrl, setAttachmentUrl] = useState<string | null>(null)
  const [attachmentName, setAttachmentName] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})

  // Agrupar FAQ por categoria conservando el orden de aparicion.
  const groups = useMemo(() => {
    const map = new Map<string, FaqEntry[]>()
    for (const entry of SUPPORT_FAQ) {
      const arr = map.get(entry.category) ?? []
      arr.push(entry)
      map.set(entry.category, arr)
    }
    return [...map.entries()]
  }, [])

  const resetForm = useCallback(() => {
    setType('help')
    setSubject('')
    setDescription('')
    setPriority(undefined)
    setAttachmentUrl(null)
    setAttachmentName(null)
    setFieldErrors({})
    setFormError(null)
  }, [])

  const removeAttachment = useCallback(() => {
    setAttachmentUrl(null)
    setAttachmentName(null)
  }, [])

  const pickImage = useCallback(async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (perm.status !== 'granted') {
        Alert.alert('Permiso requerido', 'Necesitamos acceso a tu galeria para adjuntar una imagen.')
        return
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
        allowsEditing: false,
      })
      if (result.canceled || !result.assets[0]) return
      setUploading(true)
      setFormError(null)
      try {
        // Comprimir a JPEG (max ancho 1600) para no pasar el limite de 2MB del bucket.
        const compressed = await ImageManipulator.manipulateAsync(
          result.assets[0].uri,
          [{ resize: { width: 1600 } }],
          { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG }
        )
        const url = await uploadSupportAttachment(compressed.uri, 'image/jpeg', 'jpg')
        if (!url) {
          Alert.alert('Error', 'No se pudo subir la imagen. Podes enviar el mensaje sin adjunto.')
          return
        }
        setAttachmentUrl(url)
        setAttachmentName(result.assets[0].fileName ?? 'imagen.jpg')
      } finally {
        setUploading(false)
      }
    } catch {
      setUploading(false)
      Alert.alert('Error', 'No se pudo procesar la imagen.')
    }
  }, [])

  const pickPdf = useCallback(async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      })
      if (res.canceled || !res.assets?.[0]) return
      const asset = res.assets[0]
      if (typeof asset.size === 'number' && asset.size > MAX_ATTACHMENT_BYTES) {
        Alert.alert('Archivo muy grande', 'El adjunto no puede superar los 2MB.')
        return
      }
      setUploading(true)
      setFormError(null)
      try {
        const url = await uploadSupportAttachment(asset.uri, 'application/pdf', 'pdf')
        if (!url) {
          Alert.alert('Error', 'No se pudo subir el archivo. Podes enviar el mensaje sin adjunto.')
          return
        }
        setAttachmentUrl(url)
        setAttachmentName(asset.name ?? 'documento.pdf')
      } finally {
        setUploading(false)
      }
    } catch {
      setUploading(false)
      Alert.alert('Error', 'No se pudo procesar el archivo.')
    }
  }, [])

  const onSelectType = useCallback((next: SupportType) => {
    setType(next)
    // La prioridad solo aplica a bug: limpiarla al cambiar a otro tipo.
    if (next !== 'bug') setPriority(undefined)
  }, [])

  const handleSubmit = useCallback(async () => {
    setFormError(null)
    const errors = validate(subject, description)
    setFieldErrors(errors)
    if (errors.subject || errors.description) return

    setSubmitting(true)
    try {
      await apiFetch('/api/mobile/coach/support', {
        method: 'POST',
        authenticated: true,
        body: {
          type,
          subject: subject.trim(),
          description: description.trim(),
          priority: type === 'bug' ? priority : undefined,
          attachmentUrl: attachmentUrl ?? undefined,
          metadataUserAgent: buildMetadataUserAgent(),
        },
      })
      resetForm()
      setSent(true)
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'No se pudo enviar el mensaje. Intenta mas tarde.'
      setFormError(message)
    } finally {
      setSubmitting(false)
    }
  }, [type, subject, description, priority, attachmentUrl, resetForm])

  const remaining = 5000 - description.length

  return (
    <SafeAreaView edges={[]} style={[styles.root, { backgroundColor: theme.background }]}>
      <AppBackground />
      <ScreenHeader title="Soporte" subtitle="Ayuda y contacto" />

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Exito */}
        {sent ? (
          <View style={[styles.successCard, { backgroundColor: theme.success + '14', borderColor: theme.success + '55' }]}>
            <CheckCircle2 size={20} color={theme.success} />
            <View style={styles.successText}>
              <Text style={[styles.successTitle, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
                Mensaje enviado
              </Text>
              <Text style={[styles.successBody, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                Te responderemos a la brevedad.
              </Text>
            </View>
            <Pressable hitSlop={10} onPress={() => setSent(false)}>
              <X size={18} color={theme.mutedForeground} />
            </Pressable>
          </View>
        ) : null}

        {/* Formulario */}
        <View style={[styles.formCard, { backgroundColor: theme.card, borderColor: theme.border }]}>
          {/* Tipo de consulta (pills) */}
          <Text style={[styles.fieldLabel, { color: theme.foreground, fontFamily: theme.fontSans }]}>
            Tipo de consulta
          </Text>
          <View style={styles.pillsRow}>
            {TYPE_OPTIONS.map((opt) => {
              const active = type === opt.value
              return (
                <Pressable
                  key={opt.value}
                  onPress={() => onSelectType(opt.value)}
                  style={[
                    styles.pill,
                    {
                      borderRadius: theme.radius.lg,
                      backgroundColor: active ? theme.primary : theme.secondary,
                      borderColor: active ? theme.primary : theme.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.pillLabel,
                      {
                        color: active ? theme.primaryForeground : theme.mutedForeground,
                        fontFamily: active ? 'Montserrat_700Bold' : theme.fontSans,
                      },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          {/* Asunto */}
          <Text style={[styles.fieldLabel, { color: theme.foreground, fontFamily: theme.fontSans }]}>Asunto *</Text>
          <TextInput
            value={subject}
            onChangeText={(t) => {
              setSubject(t)
              if (fieldErrors.subject) setFieldErrors((p) => ({ ...p, subject: undefined }))
            }}
            placeholder="Ej: No puedo asignar programa a alumno"
            placeholderTextColor={theme.mutedForeground}
            maxLength={200}
            style={[
              styles.input,
              {
                borderRadius: theme.radius.lg,
                backgroundColor: theme.secondary,
                borderColor: fieldErrors.subject ? theme.destructive : theme.border,
                color: theme.foreground,
                fontFamily: theme.fontSans,
              },
            ]}
          />
          {fieldErrors.subject ? (
            <Text style={[styles.errorText, { color: theme.destructive, fontFamily: theme.fontSans }]}>
              {fieldErrors.subject}
            </Text>
          ) : null}

          {/* Prioridad (solo bug) */}
          {type === 'bug' ? (
            <>
              <Text style={[styles.fieldLabel, { color: theme.foreground, fontFamily: theme.fontSans }]}>Prioridad</Text>
              <View style={styles.pillsRow}>
                {PRIORITY_OPTIONS.map((opt) => {
                  const active = priority === opt.value
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => setPriority(opt.value)}
                      style={[
                        styles.pill,
                        {
                          borderRadius: theme.radius.lg,
                          backgroundColor: active ? theme.primary : theme.secondary,
                          borderColor: active ? theme.primary : theme.border,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.pillLabel,
                          {
                            color: active ? theme.primaryForeground : theme.mutedForeground,
                            fontFamily: active ? 'Montserrat_700Bold' : theme.fontSans,
                          },
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>
            </>
          ) : null}

          {/* Descripcion */}
          <View style={styles.descLabelRow}>
            <Text style={[styles.fieldLabel, { color: theme.foreground, fontFamily: theme.fontSans }]}>Descripcion *</Text>
            <Text style={[styles.counter, { color: remaining < 0 ? theme.destructive : theme.mutedForeground, fontFamily: theme.fontSans }]}>
              {description.length}/5000
            </Text>
          </View>
          <TextInput
            value={description}
            onChangeText={(t) => {
              setDescription(t)
              if (fieldErrors.description) setFieldErrors((p) => ({ ...p, description: undefined }))
            }}
            placeholder="Describe tu consulta con el mayor detalle posible..."
            placeholderTextColor={theme.mutedForeground}
            multiline
            textAlignVertical="top"
            maxLength={5000}
            style={[
              styles.textarea,
              {
                borderRadius: theme.radius.lg,
                backgroundColor: theme.secondary,
                borderColor: fieldErrors.description ? theme.destructive : theme.border,
                color: theme.foreground,
                fontFamily: theme.fontSans,
              },
            ]}
          />
          {fieldErrors.description ? (
            <Text style={[styles.errorText, { color: theme.destructive, fontFamily: theme.fontSans }]}>
              {fieldErrors.description}
            </Text>
          ) : null}

          {/* Adjunto opcional */}
          <Text style={[styles.fieldLabel, { color: theme.foreground, fontFamily: theme.fontSans }]}>Adjunto (opcional)</Text>
          {attachmentName ? (
            <View style={[styles.attachChip, { backgroundColor: theme.secondary, borderColor: theme.border, borderRadius: theme.radius.lg }]}>
              <FileText size={16} color={theme.primary} />
              <Text numberOfLines={1} style={[styles.attachName, { color: theme.foreground, fontFamily: theme.fontSans }]}>
                {attachmentName}
              </Text>
              <Pressable hitSlop={10} onPress={removeAttachment}>
                <X size={16} color={theme.mutedForeground} />
              </Pressable>
            </View>
          ) : (
            <View style={styles.attachRow}>
              <Button
                label="Imagen"
                variant="secondary"
                size="sm"
                leftIcon={Paperclip}
                loading={uploading}
                disabled={uploading || submitting}
                onPress={pickImage}
                style={styles.attachBtn}
              />
              <Button
                label="PDF"
                variant="secondary"
                size="sm"
                leftIcon={FileText}
                loading={uploading}
                disabled={uploading || submitting}
                onPress={pickPdf}
                style={styles.attachBtn}
              />
            </View>
          )}
          <Text style={[styles.hint, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Maximo 2MB. No adjuntes informacion sensible de terceros sin su consentimiento.
          </Text>

          {/* Error de envio */}
          {formError ? (
            <Text style={[styles.errorText, { color: theme.destructive, fontFamily: theme.fontSans }]}>{formError}</Text>
          ) : null}

          {/* Disclaimer */}
          <Text style={[styles.disclaimer, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Al enviar, aceptas nuestras condiciones de uso.
          </Text>

          {/* Enviar */}
          <Button
            label={submitting ? 'Enviando...' : 'Enviar mensaje'}
            leftIcon={submitting ? undefined : Send}
            loading={submitting}
            disabled={submitting || uploading}
            onPress={handleSubmit}
            full
          />
        </View>

        {/* FAQ (seccion secundaria) */}
        <Text style={[styles.sectionTitle, { color: theme.mutedForeground, fontFamily: 'Montserrat_700Bold' }]}>
          PREGUNTAS FRECUENTES
        </Text>

        {groups.map(([category, entries]) => (
          <View key={category} style={styles.group}>
            <Text style={[styles.groupTitle, { color: theme.primary, fontFamily: 'Inter_700Bold' }]}>
              {category.toUpperCase()}
            </Text>
            <View style={styles.groupItems}>
              {entries.map((item) => (
                <Accordion key={item.q} question={item.q} answer={item.a} />
              ))}
            </View>
          </View>
        ))}

        {/* Fallback email */}
        <View style={styles.footRow}>
          <Mail size={14} color={theme.mutedForeground} />
          <Text style={[styles.foot, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Tambien podes escribirnos a {SUPPORT_EMAIL}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { paddingHorizontal: 16, paddingTop: 4, gap: 12 },

  successCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  successText: { flex: 1, gap: 2 },
  successTitle: { fontSize: 14 },
  successBody: { fontSize: 12.5, lineHeight: 17 },

  formCard: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  fieldLabel: { fontSize: 13.5, fontWeight: '500', marginTop: 4 },
  pillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1 },
  pillLabel: { fontSize: 13 },

  input: { borderWidth: 1, height: 48, paddingHorizontal: 14, fontSize: 15 },
  descLabelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  counter: { fontSize: 11 },
  textarea: { borderWidth: 1, minHeight: 130, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12, fontSize: 15 },

  attachRow: { flexDirection: 'row', gap: 10 },
  attachBtn: { flex: 1 },
  attachChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  attachName: { flex: 1, fontSize: 13.5 },
  hint: { fontSize: 11, lineHeight: 16 },

  errorText: { fontSize: 12, lineHeight: 16 },
  disclaimer: { fontSize: 11, lineHeight: 16, marginTop: 2 },

  sectionTitle: { fontSize: 11, letterSpacing: 1, marginTop: 10 },
  group: { gap: 8 },
  groupTitle: { fontSize: 11, letterSpacing: 0.6, marginTop: 4 },
  groupItems: { gap: 8 },

  footRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 6, paddingHorizontal: 8 },
  foot: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
})
