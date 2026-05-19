import { useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'

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
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    await AsyncStorage.setItem('eva_user_role', role ?? 'coach')
    router.replace(role === 'alumno' ? '/alumno/workout' : '/coach/clientes')
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Brand mark + back */}
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

          {/* Heading */}
          <View style={styles.heading}>
            <Text style={[styles.title, { color: theme.foreground, fontFamily: 'Montserrat_700Bold' }]}>
              Bienvenido de vuelta
            </Text>
            <Text style={[styles.subtitle, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              {isCoach
                ? 'Ingresa tus credenciales para acceder al panel'
                : 'Accede a tu entrenamiento'}
            </Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {/* Email */}
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
                placeholder="coach@ejemplo.com"
                placeholderTextColor={theme.mutedForeground}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                editable={!loading}
              />
            </View>

            {/* Password */}
            <View style={styles.field}>
              <View style={styles.labelRow}>
                <Text style={[styles.label, { color: theme.foreground, fontFamily: theme.fontSans }]}>
                  Contraseña
                </Text>
                <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')} hitSlop={8}>
                  <Text style={[styles.forgotLink, { color: theme.primary, fontFamily: theme.fontSans }]}>
                    ¿Olvidaste tu contraseña?
                  </Text>
                </TouchableOpacity>
              </View>
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
                placeholder="••••••••"
                placeholderTextColor={theme.mutedForeground}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                autoComplete="password"
                editable={!loading}
              />
            </View>

            {/* Error banner */}
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

            {/* Submit */}
            <TouchableOpacity
              style={[
                styles.submitBtn,
                {
                  backgroundColor: theme.primary,
                  borderRadius: theme.radius.lg,
                },
                theme.shadowGlowBlue,
              ]}
              onPress={handleLogin}
              disabled={loading || !email || !password}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={theme.primaryForeground} />
              ) : (
                <Text style={[styles.submitText, { color: theme.primaryForeground, fontFamily: 'Montserrat_700Bold' }]}>
                  {isCoach ? 'Ingresar al Panel' : 'Iniciar sesión'} →
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: theme.mutedForeground, fontFamily: theme.fontSans }]}>
              eva-app.cl
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1 },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 32,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 48,
  },
  brandMark: {
    fontSize: 32,
    letterSpacing: -1,
  },
  backLink: {
    fontSize: 14,
  },
  heading: {
    marginBottom: 32,
  },
  title: {
    fontSize: 26,
    letterSpacing: -0.5,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  form: {
    gap: 20,
  },
  field: {
    gap: 8,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
  },
  forgotLink: {
    fontSize: 12,
    fontWeight: '500',
  },
  input: {
    height: 48,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 15,
  },
  errorBanner: {
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  errorText: {
    fontSize: 13,
    lineHeight: 18,
  },
  submitBtn: {
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitText: {
    fontSize: 15,
    letterSpacing: 0.3,
  },
  footer: {
    marginTop: 48,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
  },
})
