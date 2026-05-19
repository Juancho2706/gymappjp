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
      <View style={styles.inner}>
        <Text style={[styles.title, { color: theme.text }]}>
          {role === 'alumno' ? 'Accede como alumno' : 'Accede como coach'}
        </Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <TextInput
          style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.card }]}
          placeholder="Correo electrónico"
          placeholderTextColor={theme.muted}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />

        <TextInput
          style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.card }]}
          placeholder="Contraseña"
          placeholderTextColor={theme.muted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoComplete="password"
        />

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: theme.primary }]}
          onPress={handleLogin}
          disabled={loading}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.btnText}>Iniciar sesión</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push('/(auth)/forgot-password')} style={styles.link}>
          <Text style={[styles.linkText, { color: theme.primary }]}>Olvidé mi contraseña</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.back()} style={styles.link}>
          <Text style={[styles.linkText, { color: theme.muted }]}>← Volver</Text>
        </TouchableOpacity>
      </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1 },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 8 },
  error: { color: '#FF453A', fontSize: 13 },
  input: { height: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, fontSize: 16 },
  btn: { height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  link: { alignItems: 'center', paddingVertical: 4 },
  linkText: { fontSize: 14 },
})
