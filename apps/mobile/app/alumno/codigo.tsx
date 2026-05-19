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
import { fetchBrandingByInviteCode } from '../../lib/branding'
import { useTheme } from '../../context/ThemeContext'

export default function CodigoScreen() {
  const router = useRouter()
  const { theme, setBranding } = useTheme()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (code.length !== 5) {
      setError('El código tiene 5 caracteres')
      return
    }
    setLoading(true)
    setError(null)
    const branding = await fetchBrandingByInviteCode(code)
    if (!branding) {
      setError('Código inválido. Pídelo a tu coach.')
      setLoading(false)
      return
    }
    setBranding(branding)
    router.push('/(auth)/login?role=alumno')
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

        <View style={styles.inner}>
          <View style={styles.heading}>
            <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
              Ingresa tu código
            </Text>
            <Text style={[styles.subtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              Tu coach te dio un código de 5 caracteres para unirte
            </Text>
          </View>

          <TextInput
            style={[
              styles.input,
              {
                borderColor: error ? theme.destructive : theme.primary,
                color: theme.foreground,
                backgroundColor: theme.secondary,
                borderRadius: theme.radius.xl,
                fontFamily: 'Montserrat_800ExtraBold',
              },
            ]}
            placeholder="XXXXX"
            placeholderTextColor={theme.mutedForeground}
            value={code}
            onChangeText={(t) => {
              setCode(t.toUpperCase())
              if (error) setError(null)
            }}
            autoCapitalize="characters"
            maxLength={5}
            autoFocus
          />

          {error ? (
            <View
              style={[
                styles.errorBanner,
                {
                  backgroundColor: theme.destructive + '1A',
                  borderColor: theme.destructive + '33',
                  borderRadius: theme.radius.lg,
                },
              ]}
            >
              <Text style={[styles.errorText, { color: theme.destructive, fontFamily: theme.fontSans }]}>
                {error}
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[
              styles.btn,
              {
                backgroundColor: theme.primary,
                opacity: code.length !== 5 ? 0.5 : 1,
                borderRadius: theme.radius.lg,
              },
              code.length === 5 && theme.shadowGlowBlue,
            ]}
            onPress={handleSubmit}
            disabled={loading || code.length !== 5}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={theme.primaryForeground} />
            ) : (
              <Text style={[styles.btnText, { color: theme.primaryForeground, fontFamily: 'Montserrat_700Bold' }]}>
                Continuar →
              </Text>
            )}
          </TouchableOpacity>
        </View>
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
    marginBottom: 32,
  },
  brandMark: { fontSize: 32, letterSpacing: -1 },
  backLink: { fontSize: 14 },
  inner: { flex: 1, justifyContent: 'center', gap: 16 },
  heading: { gap: 8, marginBottom: 8 },
  title: { fontSize: 28, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  input: {
    height: 72,
    borderWidth: 2,
    paddingHorizontal: 24,
    fontSize: 36,
    letterSpacing: 10,
    textAlign: 'center',
  },
  errorBanner: {
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  errorText: { fontSize: 13, lineHeight: 18 },
  btn: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  btnText: { fontSize: 15, letterSpacing: 0.3 },
})
