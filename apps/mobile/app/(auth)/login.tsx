import { useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { ArrowRight, Lock, Mail, Sparkles } from 'lucide-react-native'
import { MotiView } from 'moti'
import { LoginSchema } from '@eva/schemas'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'
import { Button, Input, TopBar } from '../../components'

export default function LoginScreen() {
  const { role } = useLocalSearchParams<{ role: 'coach' | 'alumno' }>()
  const router = useRouter()
  const { theme } = useTheme()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isCoach = role !== 'alumno'

  async function handleLogin() {
    setLoading(true)
    setError(null)
    const parsed = LoginSchema.safeParse({ email: email.trim(), password })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos')
      setLoading(false)
      return
    }
    const { error } = await supabase.auth.signInWithPassword(parsed.data)
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    await AsyncStorage.setItem('eva_user_role', role ?? 'coach')
    router.replace(role === 'alumno' ? '/alumno/home' : '/coach/home')
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <TopBar showBrand back />

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <MotiView
            from={{ opacity: 0, translateY: 20 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 500 }}
            style={styles.heading}
          >
            <View
              style={[
                styles.brandPill,
                {
                  backgroundColor: theme.card,
                  borderColor: theme.border,
                  borderRadius: theme.radius['3xl'],
                },
              ]}
            >
              <Sparkles size={12} color={theme.primary} strokeWidth={2.25} />
              <Text style={[styles.brandPillText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
                {isCoach ? 'Panel del coach' : 'Tu entrenamiento'}
              </Text>
            </View>

            <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
              Bienvenido de vuelta
            </Text>
            <Text style={[styles.subtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              {isCoach
                ? 'Ingresá tus credenciales para acceder al panel'
                : 'Accedé a tu entrenamiento personalizado'}
            </Text>
          </MotiView>

          <MotiView
            from={{ opacity: 0, translateY: 20 }}
            animate={{ opacity: 1, translateY: 0 }}
            transition={{ type: 'timing', duration: 500, delay: 120 }}
            style={styles.form}
          >
            <Input
              label="Email"
              leftIcon={Mail}
              placeholder="coach@ejemplo.com"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              editable={!loading}
            />

            <Input
              label="Contraseña"
              leftIcon={Lock}
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              editable={!loading}
              error={error}
              trailingLabel={
                <Text
                  onPress={() => router.push('/(auth)/forgot-password')}
                  style={[styles.forgotLink, { color: theme.primary, fontFamily: theme.fontSans }]}
                >
                  ¿Olvidaste tu contraseña?
                </Text>
              }
            />

            <Button
              label={isCoach ? 'Ingresar al panel' : 'Iniciar sesión'}
              rightIcon={ArrowRight}
              onPress={handleLogin}
              loading={loading}
              disabled={!email || !password}
              full
              size="lg"
              style={{ marginTop: 8 }}
            />
          </MotiView>

          <MotiView
            from={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ type: 'timing', duration: 600, delay: 360 }}
            style={styles.footer}
          >
            {isCoach ? (
              <Text
                onPress={() => router.push('/(auth)/register')}
                style={[styles.createLink, { color: theme.primary, fontFamily: theme.fontSans }]}
              >
                Crear cuenta nueva
              </Text>
            ) : null}
            <Text style={[styles.footerText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              eva-app.cl
            </Text>
          </MotiView>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  kav: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 32,
  },
  heading: {
    marginBottom: 28,
    gap: 8,
  },
  brandPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  brandPillText: { fontSize: 11, letterSpacing: 0.3 },
  title: { fontSize: 28, letterSpacing: -0.5 },
  subtitle: { fontSize: 14, lineHeight: 20 },
  form: { gap: 16 },
  forgotLink: { fontSize: 12, fontWeight: '500' },
  footer: { marginTop: 36, alignItems: 'center', gap: 10 },
  createLink: { fontSize: 13, fontWeight: '600' },
  footerText: { fontSize: 12, letterSpacing: 0.3 },
})
