import { useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'

export default function ResetPasswordScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    if (password.length < 6) {
      Alert.alert('Contraseña muy corta', 'Mínimo 6 caracteres.')
      return
    }
    if (password !== confirm) {
      Alert.alert('Las contraseñas no coinciden')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      Alert.alert('Error', error.message)
      return
    }

    // Determine role to redirect properly
    const role = await AsyncStorage.getItem('eva_user_role')
    Alert.alert('Contraseña actualizada', '', [
      {
        text: 'OK',
        onPress: () => router.replace(role === 'coach' ? '/coach/clientes' : '/alumno/workout'),
      },
    ])
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={[styles.container, { backgroundColor: theme.background }]}
    >
      <View style={styles.inner}>
        <Text style={[styles.title, { color: theme.text }]}>Nueva contraseña</Text>
        <Text style={[styles.body, { color: theme.muted }]}>
          Elige una contraseña segura de al menos 6 caracteres.
        </Text>

        <TextInput
          style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.card }]}
          placeholder="Nueva contraseña"
          placeholderTextColor={theme.muted}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoFocus
        />
        <TextInput
          style={[styles.input, { borderColor: theme.border, color: theme.text, backgroundColor: theme.card }]}
          placeholder="Confirmar contraseña"
          placeholderTextColor={theme.muted}
          value={confirm}
          onChangeText={setConfirm}
          secureTextEntry
        />

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: theme.primary, opacity: loading ? 0.7 : 1 }]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Guardar contraseña</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 16 },
  title: { fontSize: 26, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22 },
  input: { height: 52, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, fontSize: 16 },
  btn: { height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
})
