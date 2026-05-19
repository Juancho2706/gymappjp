import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
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

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <View style={styles.topBar}>
          <Text style={[styles.brandMark, { color: theme.foreground, fontFamily: 'Montserrat_800ExtraBold' }]}>
            EVA
          </Text>
          <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
            <Text style={[styles.backLink, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              ← Volver
            </Text>
          </TouchableOpacity>
        </View>

        {sent ? (
          <View style={styles.inner}>
            <View style={styles.heading}>
              <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
                Revisa tu correo
              </Text>
              <Text style={[styles.subtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                Si existe una cuenta con ese email, recibirás un enlace para restablecer tu contraseña.
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.btn,
                { backgroundColor: theme.primary, borderRadius: theme.radius.lg },
                theme.shadowGlowBlue,
              ]}
              onPress={() => router.back()}
              activeOpacity={0.85}
            >
              <Text
                style={[styles.btnText, { color: theme.primaryForeground, fontFamily: 'Montserrat_700Bold' }]}
              >
                Volver al login
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.inner}>
            <View style={styles.heading}>
              <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
                Restablecer contraseña
              </Text>
              <Text style={[styles.subtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                Ingresá tu email y te enviaremos un enlace para crear una nueva contraseña.
              </Text>
            </View>

            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.foreground, fontFamily: theme.fontSans }]}>
                Email
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.secondary,
                    borderColor: theme.border,
                    color: theme.foreground,
                    borderRadius: theme.radius.lg,
                    fontFamily: theme.fontSans,
                  },
                ]}
                placeholder="tu@email.com"
                placeholderTextColor={theme.mutedForeground}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                editable={!loading}
              />
            </View>

            <TouchableOpacity
              style={[
                styles.btn,
                {
                  backgroundColor: theme.primary,
                  borderRadius: theme.radius.lg,
                  opacity: loading || !email ? 0.5 : 1,
                },
                !loading && email && theme.shadowGlowBlue,
              ]}
              onPress={handleReset}
              disabled={loading || !email}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={theme.primaryForeground} />
              ) : (
                <Text
                  style={[styles.btnText, { color: theme.primaryForeground, fontFamily: 'Montserrat_700Bold' }]}
                >
                  Enviar enlace →
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  kav: { flex: 1, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 24 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 48,
  },
  brandMark: { fontSize: 32, letterSpacing: -1 },
  backLink: { fontSize: 14 },
  inner: { flex: 1, justifyContent: 'center', gap: 24 },
  heading: { gap: 8 },
  title: { fontSize: 26, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  field: { gap: 8 },
  label: { fontSize: 14, fontWeight: '500' },
  input: {
    height: 48,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 15,
  },
  btn: { height: 48, alignItems: 'center', justifyContent: 'center' },
  btnText: { fontSize: 15, letterSpacing: 0.3 },
})
