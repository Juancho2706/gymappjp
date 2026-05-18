import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'

export default function ForgotPasswordScreen() {
  const router = useRouter()
  const { theme } = useTheme()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleReset() {
    setLoading(true)
    await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: 'eva://reset-password',
    })
    setSent(true)
    setLoading(false)
  }

  if (sent) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.inner}>
          <Text style={[styles.title, { color: theme.text }]}>Revisa tu correo</Text>
          <Text style={[styles.body, { color: theme.textSecondary }]}>
            Si existe una cuenta con ese email, recibirás un enlace para restablecer tu contraseña.
          </Text>
          <TouchableOpacity onPress={() => router.back()} style={styles.link}>
            <Text style={[styles.linkText, { color: theme.primary }]}>← Volver al login</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <View style={styles.inner}>
        <Text style={[styles.title, { color: theme.text }]}>Restablecer contraseña</Text>

        <TextInput
          style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.card }]}
          placeholder="Correo electrónico"
          placeholderTextColor={theme.muted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: theme.primary }]}
          onPress={handleReset}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Enviar enlace</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} style={styles.link}>
          <Text style={[styles.linkText, { color: theme.muted }]}>← Volver</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 16 },
  title: { fontSize: 26, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22 },
  input: { height: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, fontSize: 16 },
  btn: { height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { alignItems: 'center' },
  linkText: { fontSize: 14 },
})
