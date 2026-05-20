import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { ArrowRight, Hash } from 'lucide-react-native'
import { MotiView } from 'moti'
import { fetchBrandingByInviteCode } from '../../lib/branding'
import { useTheme } from '../../context/ThemeContext'
import { Button, TopBar } from '../../components'

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
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
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
          <View
            style={[
              styles.heroIcon,
              {
                backgroundColor: theme.primary + '1A',
                borderColor: theme.primary + '33',
                borderRadius: theme.radius['2xl'],
              },
            ]}
          >
            <Hash size={26} color={theme.primary} strokeWidth={1.75} />
          </View>

          <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
            Ingresá tu código
          </Text>
          <Text style={[styles.subtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
            Tu coach te dio un código de 5 caracteres para unirte
          </Text>

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

          <Button
            label="Continuar"
            rightIcon={ArrowRight}
            onPress={handleSubmit}
            loading={loading}
            disabled={code.length !== 5}
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
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    alignSelf: 'flex-start',
  },
  title: { fontSize: 28, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, lineHeight: 20, marginBottom: 4 },
  input: {
    height: 72,
    borderWidth: 2,
    paddingHorizontal: 24,
    fontSize: 36,
    letterSpacing: 10,
    textAlign: 'center',
    marginTop: 8,
  },
  errorBanner: { borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12 },
  errorText: { fontSize: 13, lineHeight: 18 },
})
