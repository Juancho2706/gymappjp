import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ArrowRight, Hash } from 'lucide-react-native'
import { MotiView } from 'moti'
import { fetchBrandingByCoachIdentifier, normalizeCoachIdentifier } from '../../lib/branding'
import { useTheme } from '../../context/ThemeContext'
import { Button, TopBar } from '../../components'
import { AppBackground } from '../../components/AppBackground'

export default function CodigoScreen() {
  const router = useRouter()
  const { theme, setBranding } = useTheme()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    const identifier = normalizeCoachIdentifier(code)
    if (!identifier) {
      setError('Ingresa el código o link de tu coach')
      return
    }
    setLoading(true)
    setError(null)
    const branding = await fetchBrandingByCoachIdentifier(identifier)
    if (!branding) {
      setError('No encontramos ese coach. Revisa el código o link.')
      setLoading(false)
      return
    }
    setBranding(branding)
    router.push('/(auth)/login?role=alumno')
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <AppBackground />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <TopBar showBrand back />

        <MotiView
          from={{ opacity: 0, translateY: 20 }}
          animate={{ opacity: 1, translateY: 0 }}
          transition={{ type: 'timing', duration: 500 }}
          style={styles.inner}
        >
          <View className="bg-sport-100" style={[styles.heroIcon, { borderRadius: theme.radius['2xl'] }]}>
            <Hash size={26} color={theme.primary} strokeWidth={1.75} />
          </View>

          <Text className="text-strong font-display-black" style={styles.title}>
            Ingresa tu código
          </Text>
          <Text className="text-muted font-sans" style={styles.subtitle}>
            Usa el código corto de tu coach. También aceptamos links antiguos /c/slug.
          </Text>

          <TextInput
            className={`bg-surface-card text-strong font-display-black ${error ? 'border-danger-500' : 'border-sport-500'}`}
            style={[styles.input, { borderRadius: theme.radius.xl }]}
            placeholder="ABCDE o eva-app.cl/c/coach"
            placeholderTextColor={theme.mutedForeground}
            value={code}
            onChangeText={(t) => {
              setCode(t.trim())
              if (error) setError(null)
            }}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />

          {error ? (
            <View className="bg-danger-100 border-danger-500 rounded-lg" style={styles.errorBanner}>
              <Text className="text-danger-600 font-sans" style={styles.errorText}>
                {error}
              </Text>
            </View>
          ) : null}

          <Button
            label="Continuar"
            variant="sport"
            rightIcon={ArrowRight}
            onPress={handleSubmit}
            loading={loading}
            disabled={!normalizeCoachIdentifier(code)}
            full
            size="lg"
            style={{ marginTop: 8 }}
          />
        </MotiView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  kav: { flex: 1, paddingHorizontal: 24, paddingBottom: 24 },
  inner: { flex: 1, justifyContent: 'center', gap: 12 },
  heroIcon: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    alignSelf: 'center',
  },
  title: { fontSize: 28, letterSpacing: -0.5, textAlign: 'center' },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 4, textAlign: 'center' },
  input: {
    height: 72,
    borderWidth: 2,
    paddingHorizontal: 18,
    fontSize: 20,
    letterSpacing: 0,
    textAlign: 'center',
    marginTop: 8,
  },
  errorBanner: { borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  errorText: { fontSize: 13, lineHeight: 18 },
})
