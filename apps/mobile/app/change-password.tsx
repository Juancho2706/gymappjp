import { useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ChevronLeft, Eye, EyeOff, Lock } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'
import { Button } from '../components'
import { AppBackground } from '../components/AppBackground'
import { supabase } from '../lib/supabase'

export default function ChangePasswordScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const [pwd, setPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setError(null)
    if (pwd.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return }
    if (pwd !== confirm) { setError('Las contraseñas no coinciden.'); return }
    setSaving(true)
    const { error: err } = await supabase.auth.updateUser({ password: pwd })
    setSaving(false)
    if (err) { setError(err.message); return }
    Alert.alert('Listo', 'Tu contraseña se actualizó.', [{ text: 'OK', onPress: () => router.back() }])
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
      <AppBackground />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.back} activeOpacity={0.7}>
          <ChevronLeft size={20} color={theme.primary} />
          <Text style={[styles.backText, { color: theme.primary, fontFamily: 'Montserrat_700Bold' }]}>Volver</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.body}>
        <View style={[styles.iconWrap, { backgroundColor: theme.primary + '1A', borderColor: theme.primary + '33', borderRadius: theme.radius['2xl'] }]}>
          <Lock size={26} color={theme.primary} />
        </View>
        <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>Cambiar contraseña</Text>
        <Text style={[styles.sub, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>Mínimo 8 caracteres.</Text>

        {error ? (
          <View style={[styles.errorBox, { borderColor: theme.destructive + '55', backgroundColor: theme.destructive + '14' }]}>
            <Text style={{ color: theme.destructive, fontSize: 13, fontFamily: theme.fontSans }}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.fields}>
          <View style={[styles.inputRow, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
            <Lock size={16} color={theme.mutedForeground} />
            <TextInput value={pwd} onChangeText={setPwd} placeholder="Nueva contraseña" placeholderTextColor={theme.mutedForeground}
              secureTextEntry={!show} autoCapitalize="none" style={[styles.input, { color: theme.foreground, fontFamily: theme.fontSans }]} />
            <TouchableOpacity onPress={() => setShow((s) => !s)} hitSlop={8}>
              {show ? <EyeOff size={16} color={theme.mutedForeground} /> : <Eye size={16} color={theme.mutedForeground} />}
            </TouchableOpacity>
          </View>
          <View style={[styles.inputRow, { borderColor: theme.border, backgroundColor: theme.secondary }]}>
            <Lock size={16} color={theme.mutedForeground} />
            <TextInput value={confirm} onChangeText={setConfirm} placeholder="Repetir contraseña" placeholderTextColor={theme.mutedForeground}
              secureTextEntry={!show} autoCapitalize="none" style={[styles.input, { color: theme.foreground, fontFamily: theme.fontSans }]} />
          </View>
        </View>

        <Button label={saving ? 'Guardando...' : 'Actualizar contraseña'} onPress={save} disabled={saving} full size="lg" />
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 12, paddingVertical: 10 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  backText: { fontSize: 13 },
  body: { flex: 1, paddingHorizontal: 24, gap: 12, alignItems: 'stretch', justifyContent: 'center', paddingBottom: 60 },
  iconWrap: { width: 60, height: 60, borderWidth: 1, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  title: { fontSize: 24, letterSpacing: -0.5, textAlign: 'center', marginTop: 6 },
  sub: { fontSize: 13, textAlign: 'center', marginBottom: 6 },
  errorBox: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  fields: { gap: 10 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, height: 50 },
  input: { flex: 1, fontSize: 15 },
})
