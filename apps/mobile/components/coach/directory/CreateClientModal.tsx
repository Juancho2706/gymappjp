import { useState } from 'react'
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { X } from 'lucide-react-native'
import { Button, Input } from '../../../components'
import { FONT } from '../../../lib/typography'
import { apiFetch } from '../../../lib/api'
import { DANGER } from './directory-shared'

interface CreateForm {
  fullName: string
  email: string
  phone: string
  tempPassword: string
}

/** CreateClientModal — bottom-sheet "Nuevo alumno" (POST /api/mobile/coach/clients). */
export function CreateClientModal({
  visible,
  onClose,
  onCreated,
  theme,
}: {
  visible: boolean
  onClose: () => void
  onCreated: () => void
  theme: any
}) {
  const [form, setForm] = useState<CreateForm>({ fullName: '', email: '', phone: '', tempPassword: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (!form.fullName.trim() || !form.email.trim() || !form.tempPassword.trim()) {
      setError('Nombre, email y contraseña temporal son obligatorios.')
      return
    }
    setLoading(true)
    setError(null)
    try {
      await apiFetch('/api/mobile/coach/clients', {
        method: 'POST',
        authenticated: true,
        body: {
          fullName: form.fullName.trim(),
          email: form.email.trim().toLowerCase(),
          phone: form.phone.trim() || undefined,
          tempPassword: form.tempPassword,
          ageConfirmed: true,
        },
      })
      setForm({ fullName: '', email: '', phone: '', tempPassword: '' })
      onCreated()
      onClose()
    } catch (e: any) {
      setError(e?.message ?? 'No se pudo crear el alumno.')
    } finally {
      setLoading(false)
    }
  }

  const fields: { key: keyof CreateForm; label: string; placeholder?: string }[] = [
    { key: 'fullName', label: 'Nombre completo *' },
    { key: 'email', label: 'Email *' },
    { key: 'phone', label: 'Teléfono (opcional)' },
    { key: 'tempPassword', label: 'Contraseña temporal *', placeholder: 'Min. 6 caracteres' },
  ]

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={styles.overlay} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: theme.card }]}>
          <View style={[styles.handle, { backgroundColor: theme.border }]} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: theme.foreground }]}>Nuevo Alumno</Text>
            <TouchableOpacity testID="create-client-close" onPress={onClose} hitSlop={8}>
              <X size={20} color={theme.mutedForeground} />
            </TouchableOpacity>
          </View>

          {error && (
            <View style={[styles.errorBox, { backgroundColor: DANGER + '18', borderColor: DANGER + '40' }]}>
              <Text style={[styles.errorText, { color: DANGER }]}>{error}</Text>
            </View>
          )}

          {fields.map(({ key, label, placeholder }) => (
            <Input
              key={key}
              testID={`create-client-${key}`}
              label={label}
              value={form[key]}
              onChangeText={(v) => setForm((f) => ({ ...f, [key]: v }))}
              placeholder={placeholder}
              autoCapitalize={key === 'fullName' ? 'words' : 'none'}
              keyboardType={key === 'email' ? 'email-address' : key === 'phone' ? 'phone-pad' : 'default'}
              secureTextEntry={key === 'tempPassword'}
              autoCorrect={false}
            />
          ))}

          <Button testID="create-client-submit" label={loading ? 'Creando…' : 'Crear Alumno'} variant="sport" size="lg" full loading={loading} disabled={loading} onPress={handleSubmit} />
          <View style={{ height: 12 }} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    gap: 12,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 4 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  title: { fontSize: 20, fontFamily: FONT.displayBold },
  errorBox: { borderRadius: 12, borderWidth: 1, padding: 12 },
  errorText: { fontSize: 13, fontFamily: FONT.uiSemibold },
})
