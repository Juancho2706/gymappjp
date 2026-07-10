import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ArrowRight, KeyRound, Mail } from 'lucide-react-native'
import { MotiView } from 'moti'
import { ForgotPasswordSchema } from '@eva/schemas'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'
import { Button, Input, TopBar } from '../../components'

export default function ForgotPasswordScreen() {
  const router = useRouter()
  const { theme } = useTheme()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  async function handleReset() {
    const parsed = ForgotPasswordSchema.safeParse({ email: email.trim() })
    if (!parsed.success) return
    setLoading(true)
    await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: 'eva://reset-password',
    })
    setSent(true)
    setLoading(false)
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <TopBar showBrand back />

        {sent ? (
          <MotiView
            from={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', damping: 14 }}
            style={styles.inner}
          >
            <View className="bg-success-100" style={[styles.successIcon, { borderRadius: theme.radius['2xl'] }]}>
              <Mail size={28} color={theme.success} strokeWidth={1.75} />
            </View>
            <Text className="text-strong font-display-black" style={styles.title}>
              Revisa tu correo
            </Text>
            <Text className="text-muted font-sans" style={styles.subtitle}>
              Si existe una cuenta con ese email, recibirás un enlace para restablecer tu contraseña.
            </Text>
            <Button
              testID="forgot-password-back-to-login"
              label="Volver al login"
              variant="sport"
              rightIcon={ArrowRight}
              onPress={() => router.back()}
              full
              size="lg"
              style={{ marginTop: 20 }}
            />
          </MotiView>
        ) : (
          <MotiView
            from={{ opacity: 0, translateY: 20 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 500 }}
            style={styles.inner}
          >
            <View className="bg-sport-100" style={[styles.heroIcon, { borderRadius: theme.radius['2xl'] }]}>
              <KeyRound size={26} color={theme.primary} strokeWidth={1.75} />
            </View>
            <Text className="text-strong font-display-black" style={styles.title}>
              Restablecer contraseña
            </Text>
            <Text className="text-muted font-sans" style={styles.subtitle}>
              Ingresa tu email y te enviaremos un enlace para crear una nueva contraseña.
            </Text>

            <View style={styles.form}>
              <Input
                testID="forgot-password-email-input"
                label="Email"
                leftIcon={Mail}
                placeholder="tu@email.com"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                editable={!loading}
              />
              <Button
                testID="forgot-password-submit"
                label="Enviar enlace"
                variant="sport"
                rightIcon={ArrowRight}
                onPress={handleReset}
                loading={loading}
                disabled={!email}
                full
                size="lg"
              />
            </View>
          </MotiView>
        )}
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
    marginBottom: 8,
  },
  successIcon: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  title: { fontSize: 26, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  form: { gap: 16, marginTop: 16 },
})
