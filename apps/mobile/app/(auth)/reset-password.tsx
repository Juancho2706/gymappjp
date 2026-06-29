import { useState } from 'react'
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { ArrowRight, Check, Eye, EyeOff, KeyRound, Lock } from 'lucide-react-native'
import { MotiView } from 'moti'
import { supabase } from '../../lib/supabase'
import { useTheme } from '../../context/ThemeContext'
import { Button, Input, TopBar } from '../../components'

export default function ResetPasswordScreen() {
  const { theme } = useTheme()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [success, setSuccess] = useState(false)

  const passwordError = password.length > 0 && password.length < 8 ? 'Mínimo 8 caracteres' : null
  const confirmError = confirm.length > 0 && password !== confirm ? 'Las contrasenas no coinciden' : null

  async function handleSave() {
    if (password.length < 8 || password !== confirm) return

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      Alert.alert('Error', error.message)
      return
    }

    setSuccess(true)
  }

  async function handleContinue() {
    const role = await AsyncStorage.getItem('eva_user_role')
    router.replace(role === 'coach' ? '/coach/home' : '/alumno/home')
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <TopBar showBrand back />

        {success ? (
          <MotiView
            from={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', damping: 14 }}
            style={styles.inner}
          >
            <View className="bg-success-100" style={[styles.successIcon, { borderRadius: theme.radius['2xl'] }]}>
              <Check size={30} color={theme.success} strokeWidth={1.75} />
            </View>
            <Text className="text-strong font-display-black" style={styles.title}>
              Contrasena actualizada
            </Text>
            <Text className="text-muted font-sans" style={styles.subtitle}>
              Ya puedes volver a EVA con tu nueva contrasena.
            </Text>
            <Button
              label="Continuar"
              variant="sport"
              rightIcon={ArrowRight}
              onPress={handleContinue}
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
              Nueva contrasena
            </Text>
            <Text className="text-muted font-sans" style={styles.subtitle}>
              Elige una contrasena segura de al menos 8 caracteres.
            </Text>

            <View style={styles.form}>
              <PasswordInput
                label="Nueva contrasena"
                value={password}
                onChangeText={setPassword}
                visible={showPassword}
                onToggleVisible={() => setShowPassword((v) => !v)}
                error={passwordError}
                autoFocus
              />
              <PasswordInput
                label="Confirmar contrasena"
                value={confirm}
                onChangeText={setConfirm}
                visible={showConfirm}
                onToggleVisible={() => setShowConfirm((v) => !v)}
                error={confirmError}
              />
              <Button
                label="Guardar contrasena"
                variant="sport"
                rightIcon={ArrowRight}
                onPress={handleSave}
                loading={loading}
                disabled={password.length < 8 || password !== confirm}
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

function PasswordInput({
  label,
  value,
  onChangeText,
  visible,
  onToggleVisible,
  error,
  autoFocus,
}: {
  label: string
  value: string
  onChangeText: (value: string) => void
  visible: boolean
  onToggleVisible: () => void
  error: string | null
  autoFocus?: boolean
}) {
  const { theme } = useTheme()
  const Icon = visible ? EyeOff : Eye

  return (
    <Input
      label={label}
      leftIcon={Lock}
      placeholder="••••••••"
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={!visible}
      autoCapitalize="none"
      autoComplete="new-password"
      error={error}
      autoFocus={autoFocus}
      trailingLabel={
        <Pressable onPress={onToggleVisible} hitSlop={10}>
          <Icon size={18} color={theme.mutedForeground} />
        </Pressable>
      }
    />
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
