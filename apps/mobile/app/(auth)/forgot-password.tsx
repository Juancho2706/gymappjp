import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import { ArrowRight, KeyRound, Mail } from 'lucide-react-native'
import { MotiView } from 'moti'
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
    setLoading(true)
    await supabase.auth.resetPasswordForEmail(email.trim(), {
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
            <View
              style={[
                styles.successIcon,
                {
                  backgroundColor: theme.success + '1A',
                  borderColor: theme.success + '33',
                  borderRadius: theme.radius['2xl'],
                },
              ]}
            >
              <Mail size={28} color={theme.success} strokeWidth={1.75} />
            </View>
            <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
              Revisa tu correo
            </Text>
            <Text style={[styles.subtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              Si existe una cuenta con ese email, recibirás un enlace para restablecer tu contraseña.
            </Text>
            <Button
              label="Volver al login"
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
              <KeyRound size={26} color={theme.primary} strokeWidth={1.75} />
            </View>
            <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
              Restablecer contraseña
            </Text>
            <Text style={[styles.subtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              Ingresá tu email y te enviaremos un enlace para crear una nueva contraseña.
            </Text>

            <View style={styles.form}>
              <Input
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
                label="Enviar enlace"
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
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  successIcon: {
    width: 64,
    height: 64,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    alignSelf: 'flex-start',
  },
  title: { fontSize: 26, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  form: { gap: 16, marginTop: 16 },
})
