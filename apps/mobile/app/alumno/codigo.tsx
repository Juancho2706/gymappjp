import { useState } from 'react'
import {
  ActivityIndicator,
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
      <View style={styles.inner}>
        <Text style={[styles.title, { color: theme.text }]}>Ingresa tu código</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Tu coach te dio un código de 5 letras para unirte
        </Text>

        <TextInput
          style={[styles.input, { borderColor: theme.primary, color: theme.text, backgroundColor: theme.card }]}
          placeholder="Ej: 4XK7M"
          placeholderTextColor={theme.muted}
          value={code}
          onChangeText={(t) => setCode(t.toUpperCase())}
          autoCapitalize="characters"
          maxLength={5}
          autoFocus
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: theme.primary, opacity: code.length !== 5 ? 0.5 : 1 }]}
          onPress={handleSubmit}
          disabled={loading || code.length !== 5}
          activeOpacity={0.85}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Continuar</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} style={styles.back}>
          <Text style={[styles.backText, { color: theme.muted }]}>← Volver</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 16 },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 15, lineHeight: 22 },
  input: {
    height: 64,
    borderWidth: 2,
    borderRadius: 16,
    paddingHorizontal: 24,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: 8,
    textAlign: 'center',
  },
  error: { color: '#FF453A', fontSize: 13 },
  btn: { height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  back: { alignItems: 'center' },
  backText: { fontSize: 14 },
})
