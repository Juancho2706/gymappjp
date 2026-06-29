import { useState } from 'react'
import { Alert, KeyboardAvoidingView, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ChevronLeft, Eye, EyeOff, Lock } from 'lucide-react-native'
import { useTheme } from '../context/ThemeContext'
import { Button, Input } from '../components'
import { AppBackground } from '../components/AppBackground'
import { supabase } from '../lib/supabase'
import { sessionFlags } from '../lib/session-flags'

export default function ChangePasswordScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const [pwd, setPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setError(null)
    if (pwd.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return }
    if (pwd !== confirm) { setError('Las contraseñas no coinciden.'); return }
    setSaving(true)
    const { error: err } = await supabase.auth.updateUser({ password: pwd })
    if (err) { setSaving(false); setError(err.message); return }
    // Ola 0: limpiar el flag de cambio forzado (best-effort; si RLS lo bloquea,
    // el flag de sesión evita el loop del gate). La limpieza definitiva es server-side.
    sessionFlags.pwChanged = true
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) await supabase.from('clients').update({ force_password_change: false }).eq('id', user.id)
    } catch {
      // no-op
    }
    setSaving(false)
    Alert.alert('Listo', 'Tu contraseña se actualizó.', [{ text: 'OK', onPress: () => router.back() }])
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: theme.background }]}>
      <AppBackground />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={styles.back} activeOpacity={0.7}>
          <ChevronLeft size={20} color={theme.primary} />
          <Text className="text-sport-600 font-sans-semibold" style={styles.backText}>Volver</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.body}>
        <View className="bg-sport-100" style={[styles.iconWrap, { borderRadius: theme.radius['2xl'] }]}>
          <Lock size={26} color={theme.primary} />
        </View>
        <Text className="text-strong font-display-black" style={styles.title}>Cambiar contraseña</Text>
        <Text className="text-muted font-sans" style={styles.sub}>Mínimo 8 caracteres.</Text>

        {error ? (
          <View className="bg-danger-100 border-danger-500" style={styles.errorBox}>
            <Text className="text-danger-600 font-sans" style={{ fontSize: 13 }}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.fields}>
          <Input
            leftIcon={Lock}
            rightIcon={show ? EyeOff : Eye}
            onRightIconPress={() => setShow((s) => !s)}
            value={pwd}
            onChangeText={setPwd}
            placeholder="Nueva contraseña"
            secureTextEntry={!show}
            autoCapitalize="none"
            autoComplete="new-password"
          />
          <Input
            leftIcon={Lock}
            value={confirm}
            onChangeText={setConfirm}
            placeholder="Repetir contraseña"
            secureTextEntry={!show}
            autoCapitalize="none"
            autoComplete="new-password"
          />
        </View>

        <Button label={saving ? 'Guardando...' : 'Actualizar contraseña'} variant="sport" onPress={save} disabled={saving} full size="lg" />
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { paddingHorizontal: 12, paddingVertical: 10 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  backText: { fontSize: 13 },
  body: { flex: 1, paddingHorizontal: 24, gap: 12, alignItems: 'stretch', justifyContent: 'center', paddingBottom: 60 },
  iconWrap: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  title: { fontSize: 24, letterSpacing: -0.5, textAlign: 'center', marginTop: 6 },
  sub: { fontSize: 13, textAlign: 'center', marginBottom: 6 },
  errorBox: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  fields: { gap: 10 },
})
